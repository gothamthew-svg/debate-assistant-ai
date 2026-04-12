export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');

  const results = {};

  // Check env vars exist
  results.envVars = {
    KV_REST_API_URL: !!process.env.KV_REST_API_URL,
    KV_REST_API_TOKEN: !!process.env.KV_REST_API_TOKEN,
    CEREBRAS_API_KEY: !!process.env.CEREBRAS_API_KEY
  };

  // Try reading from KV
  try {
    const url = `${process.env.KV_REST_API_URL}/get/${encodeURIComponent('all_context_v1')}`;
    const kvRes = await fetch(url, {
      headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` }
    });
    const kvData = await kvRes.json();
    results.kvStatus = kvRes.status;
    results.kvHasData = !!kvData.result;
    results.kvPreview = kvData.result ? JSON.parse(kvData.result).slice(0, 500) : null;
    results.kvRaw = kvData;
  } catch (e) {
    results.kvError = e.message;
  }

  // Try fetching sheet directly
  try {
    const sheetRes = await fetch('https://docs.google.com/spreadsheets/d/e/2PACX-1vRSpAiZyjHnoxJOx8FVU2S12k6LfcfKznn3p7VO2urAgOeRZMHCgfC59sKL7H9o9bcCjvvG4GVlr_jO/pub?gid=0&single=true&output=csv');
    results.sheetStatus = sheetRes.status;
    const text = await sheetRes.text();
    results.sheetPreview = text.slice(0, 300);
  } catch (e) {
    results.sheetError = e.message;
  }

  res.status(200).json(results);
}
