// Lightweight magic-byte sniffing — no dependency needed for the handful
// of formats this app accepts. Validates actual file content instead of
// trusting the client-supplied filename/extension, which is trivial to
// spoof. CSV is deliberately not covered here: it has no reliable binary
// signature (it's just text), so CSV uploads fall through to the
// existing parser-based validation (XLSX.read() throws cleanly on
// genuinely invalid content) instead of a magic-byte gate.

function matchesSignature(buffer, signature) {
  if (!buffer || buffer.length < signature.length) return false;
  return signature.every((byte, i) => buffer[i] === byte);
}

const PDF  = [0x25, 0x50, 0x44, 0x46];                         // %PDF
const OLE2 = [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1]; // legacy .doc / .xls
const ZIP  = [0x50, 0x4B, 0x03, 0x04];                         // .xlsx / .docx / .xlsm (OOXML)

// .xlsx/.xlsm are ZIP containers, legacy .xls is OLE2 — covers both
// extensions this app actually accepts for spreadsheet uploads.
function isExcelBinary(buffer) {
  return matchesSignature(buffer, ZIP) || matchesSignature(buffer, OLE2);
}

// .pdf, .doc (OLE2), .docx (ZIP) — the three resume formats this app accepts.
function isResumeFile(buffer) {
  return matchesSignature(buffer, PDF) || matchesSignature(buffer, OLE2) || matchesSignature(buffer, ZIP);
}

module.exports = { isExcelBinary, isResumeFile };
