const TOURNAMENTS = [
  { id: '37036', name: 'Artemis Invitational 2025' }
];

const CACHE_TTL_SECONDS = 3600;

async function kvGet(key) {
  try {
    const url = `${process.env.KV_REST_API_URL}/get/${key}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` }
    });
    const data = await res.json();
    return data.result ? JSON.parse(data.result) : null;
  } catch { return null; }
}

async function kvSet(key, value) {
  try {
    const url = `${process.env.KV_REST_API_URL}/set/${key}`;
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
  const cached = await kvGet(cacheKey);
  if (cached) return cached;

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
Answer questions using the data below. Be concise, warm, and professional. Keep responses to 2-4 sentences.
For tournament questions, use the Tabroom and Team Doc sections. For debate technique questions, use the Training Guide section.

=== LIVE TABROOM DATA ===
${tournamentContext}

=== TEAM DOC ===
Transportation: No bus provided. Students must arrange their own transportation.
Judging: URGENT — 1 judge required per 2 entries. Obligation not yet met!
Dress code: Business professional.

=== DEBATE TRAINING GUIDE (NSDA) ===

ARGUMENT STRUCTURE:
Every argument needs 3 parts:
- Claim: a declarative statement establishing your argument
- Warrant: justification for why your claim is true (needs the most development — layer multiple warrants when possible)
- Impact: the significance of the argument; why people should care

REFUTING ARGUMENTS:
- To attack the warrant: show it is untrue, prove it false, or show the opponent's plan is more harmful
- To attack the impact: disprove the warrant so the impact never happens, or argue the impact is actually good

FLOWING (taking notes in round):
- All events require flowing (noting opponent arguments)
- Common abbreviations: up arrow = increase, down arrow = decrease, arrow = leads to, J = justice, M = morality, HRts = human rights, ob = obligation, stats = statistics, dollar sign = money
- Students should develop their own system that works for them

EVENT FORMATS:

Public Forum (PF): Teams of 2, debate current event topics. Coin toss determines side (PRO/CON) or position. Includes crossfire (cross-examination). More info: speechanddebate.org/publicforum

Lincoln-Douglas (LD): One-on-one format. Topics cover values. No internet in round. Round is roughly 45 minutes. More info: speechanddebate.org/lincolndouglas

Policy Debate: Two-on-two format, one policy question per year. Affirmative proposes a plan; negative argues against it. More info: speechanddebate.org/policy

Congressional Debate: Simulates U.S. legislative process. Students debate bills in a group. Judged on research, argumentation, delivery, and parliamentary procedure. More info: speechanddebate.org/congress

World Schools Debate: Combines prepared and impromptu topics. Highly interactive. Requires teamwork and in-depth argumentation. More info: speechanddebate.org/worldschoolsdebate

GENERAL ADVICE:
- You won't know everything before your first tournament — that's normal
- After each tournament, identify what you didn't know and work on it
- More resources at speechanddebate.org`;

  try {
    const response = await fetch('https://api.cerebras.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.CEREBRAS_API_KEY}`
      },
      body: JSON.stringify({
        model: 'llama3.1-8b',
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: question }
        ],
        max_tokens: 300,
        temperature: 0.3
      })
    });

    const raw = await response.text();
    let data;
    try {
      data = JSON.parse(raw);
    } catch (e) {
      return res.status(500).json({ error: 'Invalid JSON from Cerebras: ' + raw.slice(0, 200) });
    }

    if (data.error) return res.status(500).json({ error: data.error.message || JSON.stringify(data.error) });
    if (!data.choices || !data.choices[0]) return res.status(500).json({ error: 'Unexpected response: ' + JSON.stringify(data).slice(0, 200) });

    const reply = data.choices[0].message?.content || 'No response received.';
    res.status(200).json({ reply });
  } catch (e) {
    res.status(500).json({ error: 'Request failed: ' + e.message });
  }
}
