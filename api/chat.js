const TOURNAMENTS = [
  { id: '37036', name: 'Artemis Invitational 2025' }
  // Add more tournaments here as needed:
  // { id: '12345', name: 'Some Other Tournament' }
];

const CACHE_TTL_SECONDS = 3600; // 1 hour

async function kvGet(key) {
  const url = `${process.env.KV_REST_API_URL}/get/${key}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` }
  });
  const data = await res.json();
  return data.result ? JSON.parse(data.result) : null;
}

async function kvSet(key, value) {
  const url = `${process.env.KV_REST_API_URL}/set/${key}`;
  await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ value: JSON.stringify(value), ex: CACHE_TTL_SECONDS })
  });
}

async function fetchTabroomData(tournId) {
  const res = await fetch(`https://www.tabroom.com/api/tourn/index.mjs?tourn_id=${tournId}`);
  if (!res.ok) throw new Error(`Tabroom fetch failed: ${res.status}`);
  return await res.json();
}

function formatTournamentData(raw, name) {
  if (!raw) return `Tournament: ${name}\nNo data available.`;

  const lines = [`Tournament: ${name}`];

  if (raw.name) lines.push(`Official Name: ${raw.name}`);
  if (raw.start) lines.push(`Start Date: ${raw.start}`);
  if (raw.end) lines.push(`End Date: ${raw.end}`);
  if (raw.city && raw.state) lines.push(`Location: ${raw.city}, ${raw.state}`);
  if (raw.reg_close) lines.push(`Registration Closes: ${raw.reg_close}`);
  if (raw.drop_dead) lines.push(`Drop Deadline: ${raw.drop_dead}`);

  if (raw.events && Array.isArray(raw.events)) {
    lines.push('\nEvents & Fees:');
    for (const e of raw.events) {
      const fee = e.entry_fee ? ` — $${e.entry_fee}` : '';
      lines.push(`  • ${e.abbr || e.name}${fee}`);
    }
  }

  return lines.join('\n');
}

async function getTournamentContext() {
  const cacheKey = 'tabroom_data_v1';
  
  // Try cache first
  const cached = await kvGet(cacheKey);
  if (cached) return cached;

  // Fetch fresh data for all tournaments
  const sections = [];
  for (const t of TOURNAMENTS) {
    try {
      const raw = await fetchTabroomData(t.id);
      sections.push(formatTournamentData(raw, t.name));
    } catch (e) {
      sections.push(`Tournament: ${t.name}\nData temporarily unavailable.`);
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

=== LIVE TABROOM DATA ===
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
