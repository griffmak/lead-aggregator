'use strict';

// Single unified handler for all /api/* routes.
// All routes run in the same module scope so they share the in-memory store —
// this is the key requirement for in-memory storage to work on Vercel.

const { randomUUID } = require('crypto');
const XLSX = require('xlsx');
const { normalizeName } = require('./_normalize');
const store = require('./_store');

// ── CORS headers applied to every response ──────────────────────────────────
function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

// ── Route: GET /api/properties ───────────────────────────────────────────────
function getProperties(req, res) {
  const sorted = [...store.properties].sort(
    (a, b) => new Date(a.createdAt) - new Date(b.createdAt)
  );
  return res.status(200).json(sorted);
}

// ── Route: POST /api/properties ──────────────────────────────────────────────
function createProperty(req, res) {
  const { name } = req.body || {};
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Property name is required' });
  }
  const property = {
    id: randomUUID(),
    name: name.trim(),
    createdAt: new Date().toISOString(),
  };
  store.properties.push(property);
  return res.status(201).json(property);
}

// ── Route: DELETE /api/properties/:id ────────────────────────────────────────
function deleteProperty(req, res, id) {
  if (!id) return res.status(400).json({ error: 'Property id is required' });

  const exists = store.properties.some(p => p.id === id);
  if (!exists) return res.status(404).json({ error: 'Property not found' });

  // Remove the property
  store.properties = store.properties.filter(p => p.id !== id);

  // Cascade: strip appearances from all brands that came from this property
  for (const brand of store.brands) {
    brand.appearances = brand.appearances.filter(a => a.propertyId !== id);
  }

  return res.status(200).json({ ok: true });
}

// ── Route: GET /api/brands ────────────────────────────────────────────────────
function getBrands(req, res) {
  const sorted = [...store.brands].sort((a, b) =>
    a.displayName.localeCompare(b.displayName)
  );
  return res.status(200).json(sorted);
}

// ── Route: POST /api/upload ───────────────────────────────────────────────────
function parseUpload(req, res) {
  const { fileBase64, filename, propertyId, propertyName, readAllSheets } = req.body || {};

  if (!fileBase64)   return res.status(400).json({ error: 'fileBase64 is required' });
  if (!propertyId)   return res.status(400).json({ error: 'propertyId is required' });
  if (!propertyName) return res.status(400).json({ error: 'propertyName is required' });

  const buffer = Buffer.from(fileBase64, 'base64');
  const isCsv = (filename || '').toLowerCase().endsWith('.csv');
  let parsedRows = [];

  try {
    const workbook = XLSX.read(buffer, { type: 'buffer' });

    for (const sheetName of workbook.SheetNames) {
      // For CSV treat as one sheet; for Excel only process "target list" sheets (unless overridden)
      if (!isCsv && !readAllSheets && !sheetName.toLowerCase().includes('target list')) continue;

      const sheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(sheet, { defval: '' });
      if (!data.length) continue;

      const headers = Object.keys(data[0]);
      // Auto-detect the company name column and optional notes column
      const nameCol  = headers.find(h => /company|brand|account|organization|name/i.test(h));
      const notesCol = headers.find(h => /note|context|reason|comment|description/i.test(h));
      if (!nameCol) continue;

      for (const row of data) {
        const raw = String(row[nameCol] || '').trim();
        if (!raw) continue;
        const normalized = normalizeName(raw);
        if (!normalized) continue;
        parsedRows.push({
          displayName: raw,
          normalizedName: normalized,
          notes: notesCol ? String(row[notesCol] || '').trim() : '',
        });
      }

      if (isCsv) break; // CSV: only one sheet
    }
  } catch (err) {
    return res.status(422).json({ error: 'Could not parse file: ' + err.message });
  }

  if (!parsedRows.length) {
    return res.status(422).json({
      error: 'No companies found. Make sure your file has a column named "Company Name" (or similar).'
        + (isCsv ? '' : ' For Excel files, the sheet must be named "target list".'),
    });
  }

  // Deduplicate within this upload — first occurrence wins; merge notes if later row has them
  const seen = new Map();
  for (const row of parsedRows) {
    if (!seen.has(row.normalizedName)) {
      seen.set(row.normalizedName, row);
    } else if (row.notes && !seen.get(row.normalizedName).notes) {
      seen.get(row.normalizedName).notes = row.notes;
    }
  }
  const uniqueRows = Array.from(seen.values());

  // Classify rows against what's already in the store
  const existingByNorm = new Map(store.brands.map(b => [b.normalizedName, b]));
  const newBrands = [];
  const matchedBrands = [];

  for (const row of uniqueRows) {
    const existing = existingByNorm.get(row.normalizedName);
    if (!existing) {
      newBrands.push(row);
    } else {
      const alreadyHas = existing.appearances.some(a => a.propertyId === propertyId);
      if (!alreadyHas) {
        matchedBrands.push({ ...row, existingId: existing.id, existingDisplayName: existing.displayName });
      }
    }
  }

  return res.status(200).json({
    preview: { newBrands, matchedBrands, propertyId, propertyName, total: uniqueRows.length },
  });
}

// ── Route: POST /api/upload/confirm ──────────────────────────────────────────
function confirmUpload(req, res) {
  const { preview } = req.body || {};
  if (!preview) return res.status(400).json({ error: 'preview payload is required' });

  const { newBrands, matchedBrands, propertyId, propertyName } = preview;
  const now = new Date().toISOString();

  // Insert new brands
  for (const brand of (newBrands || [])) {
    store.brands.push({
      id: randomUUID(),
      displayName: brand.displayName,
      normalizedName: brand.normalizedName,
      appearances: [{ propertyId, propertyName, notes: brand.notes || '', addedAt: now }],
      createdAt: now,
    });
  }

  // Add new appearance to existing brands
  for (const brand of (matchedBrands || [])) {
    const existing = store.brands.find(b => b.id === brand.existingId);
    if (!existing) continue;
    existing.appearances.push({ propertyId, propertyName, notes: brand.notes || '', addedAt: now });
  }

  return res.status(200).json({
    ok: true,
    inserted: (newBrands || []).length,
    updated: (matchedBrands || []).length,
  });
}

// ── Main router ───────────────────────────────────────────────────────────────
module.exports = function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Parse the path — strip the /api prefix and any query string
  const url = req.url || '';
  const path = url.split('?')[0].replace(/^\/api/, '');

  // Route: /properties
  if (path === '/properties' || path === '/properties/') {
    if (req.method === 'GET')  return getProperties(req, res);
    if (req.method === 'POST') return createProperty(req, res);
  }

  // Route: /properties/:id
  const propMatch = path.match(/^\/properties\/([^/]+)$/);
  if (propMatch) {
    if (req.method === 'DELETE') return deleteProperty(req, res, propMatch[1]);
  }

  // Route: /brands
  if (path === '/brands' || path === '/brands/') {
    if (req.method === 'GET') return getBrands(req, res);
  }

  // Route: /upload/confirm (must come before /upload)
  if (path === '/upload/confirm') {
    if (req.method === 'POST') return confirmUpload(req, res);
  }

  // Route: /upload
  if (path === '/upload' || path === '/upload/') {
    if (req.method === 'POST') return parseUpload(req, res);
  }

  return res.status(404).json({ error: 'Not found' });
};
