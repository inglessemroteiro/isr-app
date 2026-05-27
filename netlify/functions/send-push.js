const webpush = require('web-push');
const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL;
const VAPID_PUBLIC_KEY  = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;

webpush.setVapidDetails(
  'mailto:gabi@inglessemroteiro.com',
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
);

exports.handler = async (event) => {
  const headers = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: '{}' };

  try {
    const body = JSON.parse(event.body);
    // body: { emails: ['a@b.com'] | null (=all), title, message, tag, actions, data }
    const { emails, title, message, tag, actions, data: notifData } = body;

    // Fetch subscriptions from Apps Script
    const params = new URLSearchParams({ action: 'getSubscriptions' });
    if (emails && emails.length) params.set('emails', emails.join(','));
    const res = await fetch(`${APPS_SCRIPT_URL}?${params}`, { redirect: 'follow' });
    const { subscriptions } = await res.json();

    if (!subscriptions || !subscriptions.length) {
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, sent: 0, reason: 'no subscriptions' }) };
    }

    const payload = JSON.stringify({
      title:   title   || 'Inglês sem Roteiro',
      body:    message || '',
      tag:     tag     || 'isr',
      actions: actions || [],
      data:    notifData || {}
    });

    let sent = 0, failed = 0;
    await Promise.all(subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(JSON.parse(sub.subscription), payload);
        sent++;
      } catch (e) {
        failed++;
        // Subscription expired — could remove from sheet here
        console.error('push failed for', sub.email, e.statusCode);
      }
    }));

    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, sent, failed }) };
  } catch (err) {
    console.error('send-push error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
