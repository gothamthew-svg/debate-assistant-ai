const TOURNAMENTS = [
  { id: '37036', name: 'Artemis Invitational 2025' }
  // Keep this in sync with chat.js
];

async function kvSet(key, value) {
  const url = `${process.env.KV_REST_API_URL}/set/${key}`;
  await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ value: JSON.stringify(value), ex: 3600 })
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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const sections = [];
  const results = [];

  for (const t of TOURNAMENTS) {
    try {
      const raw = await fetchTabroomData(t.id);
      sections.push(formatTournamentData(raw, t.name));
      results.push({ id: t.id, name: t.name, status: 'ok' });
    } catch (e) {
      sections.push(`Tournament: ${t.name}\nData temporarily unavailable.`);
      results.push({ id: t.id, name: t.name, status: 'error', error: e.message });
    }
  }

  const context = sections.join('\n\n---\n\n');
  await kvSet('tabroom_data_v1', context);

  res.status(200).json({
    message: 'Cache refreshed successfully',
    tournaments: results,
    refreshedAt: new Date().toISOString()
  });
}
