export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { question } = req.body;
  if (!question) return res.status(400).json({ error: 'No question provided' });

  const SYSTEM = `You are a helpful assistant for the Sunset High School speech and debate team.
Answer questions using the data below. Be concise, warm, and professional. Keep responses to 2-4 sentences.
For tournament questions, use the Tabroom and Team Doc sections. For debate technique questions, use the Training Guide section.

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
- There are multiple refutation strategies — these are the most foundational ones

FLOWING (taking notes in round):
- All events require flowing (noting opponent arguments)
- Come up with personal abbreviations for common words
- Common examples: up arrow = increase, down arrow = decrease, arrow = leads to, J = justice, M = morality, HRts = human rights, ob = obligation, stats = statistics, circle-slash = eliminate, equals sign = equals, dollar sign = money
- Students should develop their own system that works for them

EVENT FORMATS:

Public Forum (PF):
- Teams of 2, debate current event topics
- Coin toss determines side (PRO/CON) or speaker position (1st/2nd)
- Includes cases, rebuttals, refutation, and crossfire (cross-examination)
- Often judged by community members
- More info: speechanddebate.org/publicforum

Lincoln-Douglas (LD):
- One-on-one format
- Topics cover values like individual freedom vs. collective good
- No internet use in round; evidence must be gathered beforehand
- Round is roughly 45 minutes: constructive speeches, rebuttals, cross-examination
- More info: speechanddebate.org/lincolndouglas

Policy Debate:
- Two-on-two format, one policy question per academic year
- Affirmative proposes a plan; negative argues against it
- Includes cross-examination; judge(s) decide winner
- More info: speechanddebate.org/policy

Congressional Debate:
- Simulates U.S. legislative process
- Students debate bills and resolutions in a group setting
- Speeches alternate for/against; elected presiding officer runs the session
- Judged on research, argumentation, delivery, and parliamentary procedure
- More info: speechanddebate.org/congress

World Schools Debate:
- Combines prepared and impromptu topics
- Highly interactive — debaters can engage each other during speeches
- Requires teamwork and in-depth argumentation
- More info: speechanddebate.org/worldschoolsdebate

GENERAL ADVICE FOR NEW DEBATERS:
- You won't know everything before your first tournament — that's normal
- After each tournament, identify what you didn't know and work on it
- Every tournament, every debater does something effectively — build on that
- More resources at speechanddebate.org`;

  try {
    const response = await fetch('https://api.cerebras.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.CEREBRAS_API_KEY}`
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b',
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: question }
        ],
        max_tokens: 300,
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
