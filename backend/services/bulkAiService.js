const OpenAI = require('openai');
const { getSetting } = require('../routes/settings');

async function getClient() {
  const apiKey = await getSetting('nvidia_api_key');
  if (!apiKey) throw new Error('NVIDIA API key not configured. Go to Settings.');
  return new OpenAI({ baseURL: 'https://integrate.api.nvidia.com/v1', apiKey });
}

function extractCompany(email) {
  const domain = (email.split('@')[1] || '').toLowerCase();
  const name = domain.split('.')[0];
  return name.length <= 3 ? name.toUpperCase() : name.charAt(0).toUpperCase() + name.slice(1);
}

// Simple substitution — used when no AI call is needed
function fillTemplate(template, companyName) {
  return template
    .replace(/\[Recruiter Name\]/gi, 'Hiring Manager')
    .replace(/\[Company Name\]/gi,   companyName)
    .replace(/\[GitHub Link\]/gi,    template.match(/https:\/\/github\.com\/\S+/)?.[0]    || 'N/A')
    .replace(/\[LinkedIn Link\]/gi,  template.match(/https:\/\/linkedin\.com\/\S+/)?.[0]  || 'N/A')
    .replace(/\[Portfolio Link\]/gi, '')
    .replace(/\[Resume Link\]/gi,    '')
    .replace(/\[Phone\]/gi,          '')
    .replace(/\[Email\]/gi,          '');
}

async function personalizeEmail(template, subject, recipientEmail) {
  const company = extractCompany(recipientEmail);

  // If template has no AI-needing content, do direct substitution
  const hasPlaceholders = /\[Company Name\]/i.test(template) || /\[Recruiter Name\]/i.test(template);
  if (hasPlaceholders) {
    const body = fillTemplate(template, company);
    const personalizedSubject = subject.replace(/\[Company Name\]/gi, company);
    return { company, subject: personalizedSubject, body };
  }

  // Template has hardcoded company references — use AI to swap them
  const client = await getClient();
  const prompt = `You are updating a job application email to target a new company.

ORIGINAL SUBJECT: ${subject}
ORIGINAL BODY:
${template}

NEW TARGET COMPANY: ${company}
RECIPIENT EMAIL: ${recipientEmail}

RULES (strictly follow):
1. Keep the EXACT same structure, paragraphs, and wording
2. ONLY replace the old company name with "${company}" wherever it appears
3. Replace any greeting name with "Hiring Manager"
4. Do NOT change any other sentence, skill, project, or link
5. Return ONLY valid JSON — no markdown:
{"subject":"...","body":"..."}`;

  const completion = await client.chat.completions.create({
    model: 'meta/llama-3.3-70b-instruct',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.3,
    top_p: 0.9,
    max_tokens: 1500,
    stream: false,
  });

  const raw = completion.choices[0].message.content.trim();
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('No JSON in AI response');
  const parsed = JSON.parse(jsonMatch[0]);
  if (!parsed.subject || !parsed.body) throw new Error('Missing subject or body');
  return { company, subject: parsed.subject, body: parsed.body };
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

module.exports = { personalizeEmail, extractCompany, sleep };
