export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { question } = req.body;
  if (!question) return res.status(400).json({ error: 'No question provided' });

  const SYSTEM = `You are a helpful assistant for the Sunset High School speech and debate team.
Answer questions using ONLY the data below. If info is missing, say so clearly.
Be concise, warm, and professional. Keep responses to 2-4 sentences.

=== TABROOM DATA ===
Tournament: Artemis Invitational 2025
Location: Sunset High School, Portland, OR
Date: November 1, 2025
Registration closes: Oct 30 at 5:00 PM
Drop deadline (online): Nov 1 at 6:45 AM
Fees: Novice LD is $15

=== TEAM DOC ===
Transportation: No bus provided. Students must arrange their own transportation.
Judging: URGENT — 1 judge required per 2 entries. Obligation not yet met!
Dress code: Business professional.`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: SYSTEM + '\n\nQuestion: ' + question }] }],
          generationConfig: { maxOutputTokens: 300, temperature: 0.3 }
        })
      }
    );

    const data = await response.json();
    if (data.error) return res.status(500).json({ error: data.error.message });

    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response received.';
    res.status(200).json({ reply });
  } catch (e) {
    res.status(500).json({ error: 'Failed to contact Gemini API.' });
  }
}
