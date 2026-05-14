// netlify/functions/add-score.js
// Adds a new score to FaunaDB (or Firebase Firestore fallback)

const handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  // ── PARSE & VALIDATE BODY ─────────────────────────────────
  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const { name, time_seconds, category, conditions } = body;

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'name is required' }) };
  }
  if (typeof time_seconds !== 'number' || time_seconds < 1 || time_seconds > 99999) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'time_seconds must be 1–99999' }) };
  }
  if (!['marathon', 'speedrun', 'challenge'].includes(category)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid category' }) };
  }

  const doc = {
    name:         name.trim().slice(0, 32),
    time_seconds: Math.round(time_seconds),
    category,
    conditions:   (conditions || '').trim().slice(0, 100),
    created_at:   new Date().toISOString(),
  };

  // ── FAUNADB ──────────────────────────────────────────────
  if (process.env.FAUNA_SECRET) {
    try {
      const { Client, query: q } = require('faunadb');
      const client = new Client({ secret: process.env.FAUNA_SECRET });

      const result = await client.query(
        q.Create(q.Collection('scores'), { data: doc })
      );

      return {
        statusCode: 201,
        headers,
        body: JSON.stringify({ id: result.ref.id, ...doc }),
      };
    } catch (err) {
      console.error('FaunaDB error:', err);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Database error', detail: err.message }),
      };
    }
  }

  // ── FIREBASE FIRESTORE fallback ───────────────────────────
  if (process.env.FIREBASE_PROJECT_ID) {
    try {
      const { initializeApp, getApps, cert } = require('firebase-admin/app');
      const { getFirestore }                  = require('firebase-admin/firestore');

      if (!getApps().length) {
        initializeApp({
          credential: cert({
            projectId:    process.env.FIREBASE_PROJECT_ID,
            clientEmail:  process.env.FIREBASE_CLIENT_EMAIL,
            privateKey:   (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
          }),
        });
      }

      const db  = getFirestore();
      const ref = await db.collection('scores').add(doc);

      return {
        statusCode: 201,
        headers,
        body: JSON.stringify({ id: ref.id, ...doc }),
      };
    } catch (err) {
      console.error('Firestore error:', err);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Database error', detail: err.message }),
      };
    }
  }

  // ── NO DATABASE CONFIGURED ────────────────────────────────
  return {
    statusCode: 503,
    headers,
    body: JSON.stringify({
      error: 'No database configured. Set FAUNA_SECRET or FIREBASE_* env vars in Netlify.',
    }),
  };
};

module.exports = { handler };
