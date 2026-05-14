// netlify/functions/get-scores.js
// Retrieves all scores from FaunaDB
// Fallback to Firebase Firestore if FAUNA_SECRET is not set

const handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  // ── FAUNADB ──────────────────────────────────────────────
  if (process.env.FAUNA_SECRET) {
    try {
      const { Client, query: q } = require('faunadb');
      const client = new Client({ secret: process.env.FAUNA_SECRET });

      const result = await client.query(
        q.Map(
          q.Paginate(q.Documents(q.Collection('scores')), { size: 500 }),
          q.Lambda('ref', q.Get(q.Var('ref')))
        )
      );

      const scores = result.data.map(doc => ({
        id:           doc.ref.id,
        name:         doc.data.name,
        time_seconds: doc.data.time_seconds,
        category:     doc.data.category,
        conditions:   doc.data.conditions || '',
        created_at:   doc.data.created_at,
      }));

      // Sort by time descending (marathon) / ascending (speedrun) — client handles this
      scores.sort((a, b) => b.time_seconds - a.time_seconds);

      return { statusCode: 200, headers, body: JSON.stringify(scores) };
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

      const db      = getFirestore();
      const snap    = await db.collection('scores').orderBy('time_seconds', 'desc').limit(500).get();
      const scores  = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      return { statusCode: 200, headers, body: JSON.stringify(scores) };
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
