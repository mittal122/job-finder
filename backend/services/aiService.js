// Generates emails by filling placeholders in the candidate's bio template.
// No AI call needed — the bio IS the email template.

function fillTemplate(template, values) {
  let body = template
    .replace(/\[Recruiter Name\]/gi,  values.recruiterName)
    .replace(/\[Company Name\]/gi,    values.companyName)
    .replace(/\[GitHub Link\]/gi,     values.github    || 'N/A')
    .replace(/\[LinkedIn Link\]/gi,   values.linkedin  || 'N/A')
    .replace(/\[Portfolio Link\]/gi,  values.portfolio || '')
    .replace(/\[Resume Link\]/gi,     '')
    .replace(/\[Phone\]/gi,           values.phone     || '')
    .replace(/\[Email\]/gi,           values.email     || '');

  // Strip any leftover markdown link syntax: [text](url) → text
  body = body.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  return body;
}

async function generateEmail(profile, row) {
  const template = (profile.bio || '').trim();
  if (!template) throw new Error('Email template is empty. Please add your email template to the Bio field in Profile & Settings.');

  const body = fillTemplate(template, {
    recruiterName: row.hr_name || 'Hiring Manager',
    companyName:   row.company_name,
    github:        profile.github,
    linkedin:      profile.linkedin,
    portfolio:     profile.portfolio,
    phone:         profile.phone,
    email:         profile.email,
  });

  const role    = row.job_role || 'Software Engineer';
  const subject = profile.full_name ? `Application for ${role} | ${profile.full_name}` : `Application for ${role}`;

  console.log(`[ai] Generated email for ${row.company_name} (${row.hr_name || 'Hiring Manager'})`);
  return { subject, body };
}

module.exports = { generateEmail };
