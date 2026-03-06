'use strict';

// In-memory store — replaces a database for this demo version.
// Data persists as long as the Vercel serverless function stays warm.
// A cold start (new instance) resets everything, which is fine for a demo.
// In production, swap this module for a real database (e.g., Firebase Firestore).

const store = {
  // List of sports properties (teams, leagues, events) that own target lists
  // Shape: [{ id, name, createdAt }]
  properties: [],

  // Deduplicated master brand list across all properties
  // Shape: [{ id, displayName, normalizedName, appearances: [{propertyId, propertyName, notes, addedAt}], createdAt }]
  brands: [],
};

module.exports = store;
