const TOURNAMENTS = [
  { id: '37036', name: 'Artemis Invitational 2025' }
  // Add more tournaments here:
  // { id: '99999', name: 'Next Tournament Name' }
];

const CACHE_TTL_SECONDS = 3600; // 1 hour

async function kvGet(key) {
  try {
    const url = `${process.env.KV_REST_API_URL}/get/${encodeURIComponent(key)}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` }
    });
    const data = await res.json();
    return data.result ? JSON.parse(data.result) : null;
  } catch { return null; }
}

async function kvSet(key, value) {
  try {
    const url = `${process.env.KV_REST_API_URL}/set/${encodeURIComponent(key)}`;
    await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ value: JSON.stringify(value), ex: CACHE_TTL_SECONDS })
    });
  } catch {}
}

function stripHtml(str) {
  return str.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

async function scrapeTabroom(tournId, name) {
  const lines = [`Tournament: ${name}`];

  // Fetch main invite page
  const mainRes = await fetch(`https://www.tabroom.com/index/tourn/index.mhtml?tourn_id=${tournId}`);
  const mainHtml = await mainRes.text();

  // Extract key deadlines via regex
  const tournDate = mainHtml.match(/Tournament Dates[\s\S]{0,300}?((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[^\n<]{3,30})/i);
  const regClose = mainHtml.match(/Registration Closes[\s\S]{0,200}?((?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[^\n<]{5,40})/i);
  const dropDead = mainHtml.match(/Drop online until[\s\S]{0,200}?((?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[^\n<]{5,40})/i);
  const judgesDue = mainHtml.match(/Judge Information Due[\s\S]{0,200}?((?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[^\n<]{5,40})/i);

  if (tournDate) lines.push(`Tournament Date: ${stripHtml(tournDate[1])}`);
  if (regClose) lines.push(`Registration Closes: ${stripHtml(regClose[1])}`);
  if (dropDead) lines.push(`Drop Deadline: ${stripHtml(dropDead[1])}`);
  if (judgesDue) lines.push(`Judge Info Due: ${stripHtml(judgesDue[1])}`);

  // Extract city/state from subtitle (e.g. "2025 — Portland, OR/US")
  const cityMatch = mainHtml.match(/<h5[^>]*>\s*\d{4}\s*[—-]+\s*([^<]+)<\/h5>/i) ||
                    mainHtml.match(/\d{4}\s*[—-]+\s*([A-Z][^<]{3,40})<\/h/i);
  if (cityMatch) lines.push(`City: ${cityMatch[1].trim()}`);

  // Extract venue name from Locations section
  const venueMatch = mainHtml.match(/site_id=\d+[^>]*>([^<]+)<\/a>/i);
  if (venueMatch) lines.push(`Venue: ${venueMatch[1].trim()}`);

  // Extract contact
  const contactMatch = mainHtml.match(/mailto:[^"]+">([^<]+)<\/a>/i);
  if (contactMatch) lines.push(`Contact: ${contactMatch[1].trim()}`);

  // Fetch events page
  const eventsRes = await fetch(`https://www.tabroom.com/index/tourn/events.mhtml?tourn_id=${tournId}`);
  const eventsHtml = await eventsRes.text();

  // Extract all event names from sidebar links
  const eventLinks = [...eventsHtml.matchAll(/event_id=\d+[^>]*>([^<]+)<\/a>/g)];
  if (eventLinks.length > 0) {
    lines.push('\nEvents:');
    for (const m of eventLinks) {
      lines.push(`  • ${m[1].trim()}`);
    }
  }

  // Extract entry fee
  const feeMatch = eventsHtml.match(/Entry Fee[\s\S]{0,100}?\$([\d.]+)/i);
  if (feeMatch) lines.push(`\nEntry Fee: $${feeMatch[1]}`);

  return lines.join('\n');
}

async function getTournamentContext() {
  const cacheKey = 'tabroom_scraped_v2';

  const cached = await kvGet(cacheKey);
  if (cached) return cached;

  const sections = [];
  for (const t of TOURNAMENTS) {
    try {
      const data = await scrapeTabroom(t.id, t.name);
      sections.push(data);
    } catch (e) {
      sections.push(`Tournament: ${t.name}\nData temporarily unavailable (${e.message})`);
    }
  }

  const context = sections.join('\n\n---\n\n');
  await kvSet(cacheKey, context);
  return context;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { question } = req.body;
  if (!question) return res.status(400).json({ error: 'No question provided' });

  let tournamentContext;
  try {
    tournamentContext = await getTournamentContext();
  } catch (e) {
    tournamentContext = 'Tournament data temporarily unavailable.';
  }

  const SYSTEM = `You are a helpful assistant for the Sunset High School speech and debate team.
Answer questions using ONLY the data below. If info is missing, say so clearly.
Be concise, warm, and professional. Keep responses to 2-4 sentences.

=== LIVE TABROOM DATA (auto-updated every hour) ===
${tournamentContext}

=== TEAM DOC ===
Transportation: No bus provided. Students must arrange their own transportation.
Judging: URGENT — 1 judge required per 2 entries. Obligation not yet met!
Dress code: Business professional.`;

  try {
    const response = await fetch('https://api.cerebras.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.CEREBRAS_API_KEY}`
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b',
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: question }
        ],
        max_tokens: 150,
        temperature: 0.3
      })
    });

    const data = await response.json();
    if (data.error) return res.status(500).json({ error: data.error.message });

    const reply = data.choices?.[0]?.message?.content || 'No response received.';
    res.status(200).json({ reply });
  } catch (e) {
    res.status(500).json({ error: 'Failed to contact Cerebras API.' });
  }
}
