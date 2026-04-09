const TOURNAMENTS = [
  { id: '37036', name: 'Artemis Invitational 2025' }
  // Keep in sync with chat.js
];

async function kvSet(key, value) {
  const url = `${process.env.KV_REST_API_URL}/set/${encodeURIComponent(key)}`;
  await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ value: JSON.stringify(value), ex: 3600 })
  });
}

function stripHtml(str) {
  return str.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

async function scrapeTabroom(tournId, name) {
  const lines = [`Tournament: ${name}`];

  const mainRes = await fetch(`https://www.tabroom.com/index/tourn/index.mhtml?tourn_id=${tournId}`);
  const mainHtml = await mainRes.text();

  const tournDate = mainHtml.match(/Tournament Dates[\s\S]{0,300}?((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[^\n<]{3,30})/i);
  const regClose = mainHtml.match(/Registration Closes[\s\S]{0,200}?((?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[^\n<]{5,40})/i);
  const dropDead = mainHtml.match(/Drop online until[\s\S]{0,200}?((?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[^\n<]{5,40})/i);
  const judgesDue = mainHtml.match(/Judge Information Due[\s\S]{0,200}?((?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[^\n<]{5,40})/i);

  if (tournDate) lines.push(`Tournament Date: ${stripHtml(tournDate[1])}`);
  if (regClose) lines.push(`Registration Closes: ${stripHtml(regClose[1])}`);
  if (dropDead) lines.push(`Drop Deadline: ${stripHtml(dropDead[1])}`);
  if (judgesDue) lines.push(`Judge Info Due: ${stripHtml(judgesDue[1])}`);

  const cityMatch = mainHtml.match(/<h5[^>]*>\s*\d{4}\s*[—-]+\s*([^<]+)<\/h5>/i) ||
                    mainHtml.match(/\d{4}\s*[—-]+\s*([A-Z][^<]{3,40})<\/h/i);
  if (cityMatch) lines.push(`City: ${cityMatch[1].trim()}`);

  const venueMatch = mainHtml.match(/site_id=\d+[^>]*>([^<]+)<\/a>/i);
  if (venueMatch) lines.push(`Venue: ${venueMatch[1].trim()}`);

  const contactMatch = mainHtml.match(/mailto:[^"]+">([^<]+)<\/a>/i);
  if (contactMatch) lines.push(`Contact: ${contactMatch[1].trim()}`);

  const eventsRes = await fetch(`https://www.tabroom.com/index/tourn/events.mhtml?tourn_id=${tournId}`);
  const eventsHtml = await eventsRes.text();

  const eventLinks = [...eventsHtml.matchAll(/event_id=\d+[^>]*>([^<]+)<\/a>/g)];
  if (eventLinks.length > 0) {
    lines.push('\nEvents:');
    for (const m of eventLinks) lines.push(`  • ${m[1].trim()}`);
  }

  const feeMatch = eventsHtml.match(/Entry Fee[\s\S]{0,100}?\$([\d.]+)/i);
  if (feeMatch) lines.push(`\nEntry Fee: $${feeMatch[1]}`);

  return lines.join('\n');
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const sections = [];
  const results = [];

  for (const t of TOURNAMENTS) {
    try {
      const data = await scrapeTabroom(t.id, t.name);
      sections.push(data);
      results.push({ id: t.id, name: t.name, status: 'ok', preview: data.slice(0, 200) });
    } catch (e) {
      sections.push(`Tournament: ${t.name}\nData temporarily unavailable.`);
      results.push({ id: t.id, name: t.name, status: 'error', error: e.message });
    }
  }

  const context = sections.join('\n\n---\n\n');
  await kvSet('tabroom_scraped_v2', context);

  res.status(200).json({
    message: 'Cache refreshed successfully',
    tournaments: results,
    refreshedAt: new Date().toISOString()
  });
}
