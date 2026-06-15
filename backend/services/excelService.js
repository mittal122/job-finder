const XLSX = require('xlsx');

const COLUMN_MAP = {
  'hr name': 'hr_name',
  hrname: 'hr_name',
  name: 'hr_name',
  'contact name': 'hr_name',
  'company name': 'company_name',
  company: 'company_name',
  organisation: 'company_name',
  organization: 'company_name',
  email: 'email',
  'email address': 'email',
  'e-mail': 'email',
  'job role': 'job_role',
  role: 'job_role',
  position: 'job_role',
  'job title': 'job_role',
};

const EMAIL_RE = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;

function normalizeKey(k) {
  return (COLUMN_MAP[k.trim().toLowerCase()] || k.trim().toLowerCase());
}

function parseAndValidate(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  if (!raw.length) throw new Error('Excel file is empty.');

  // Normalize column names
  const rows = raw.map(r => {
    const out = {};
    for (const [k, v] of Object.entries(r)) out[normalizeKey(k)] = String(v || '').trim();
    return out;
  });

  if (!rows[0].hasOwnProperty('company_name') || !rows[0].hasOwnProperty('email')) {
    throw new Error("Excel must contain 'Company Name' and 'Email' columns.");
  }

  const valid = [];
  const invalid = [];
  const seenEmails = new Set();
  const duplicateEmails = [];

  rows.forEach((row, i) => {
    const rowNum = i + 2;
    const email = row.email?.toLowerCase() || '';
    const company = row.company_name || '';
    const errors = [];

    if (!company) errors.push('Company Name is required');
    if (!email) errors.push('Email is required');
    else if (!EMAIL_RE.test(email)) errors.push(`Invalid email: ${email}`);

    if (errors.length) {
      invalid.push({ row: rowNum, data: row, errors });
      return;
    }

    if (seenEmails.has(email)) {
      duplicateEmails.push(email);
      invalid.push({ row: rowNum, data: row, errors: ['Duplicate email'] });
      return;
    }

    seenEmails.add(email);
    valid.push({
      hr_name: row.hr_name || null,
      company_name: company,
      email,
      job_role: row.job_role || null,
    });
  });

  return {
    valid_rows: valid,
    invalid_rows: invalid,
    duplicate_emails: [...new Set(duplicateEmails)],
    total_rows: rows.length,
  };
}

module.exports = { parseAndValidate };
