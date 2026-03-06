'use strict';

// Normalize a company name for fuzzy matching.
// "Nike, Inc." → "nike"   |   "NIKE GROUP LLC" → "nike group"
// This is the core deduplication logic — two brands with different display names
// but the same normalized name are treated as the same company.
function normalizeName(raw) {
  if (!raw || typeof raw !== 'string') return '';

  return raw
    .toLowerCase()
    // Remove legal suffixes (standalone words, with optional trailing punctuation)
    .replace(/\b(inc|llc|corp|co|ltd|l\.p\.|lp|plc|gmbh|s\.a\.|sa|ag|bv|nv|pty|ges\.m\.b\.h)\b\.?/g, '')
    // Replace hyphens with spaces so "Anheuser-Busch" matches "Anheuser Busch"
    .replace(/-/g, ' ')
    // Remove remaining punctuation except spaces
    .replace(/[^\w\s]/g, '')
    // Collapse whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

module.exports = { normalizeName };
