const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const Arweave = require('arweave');

const app = express();
const port = process.env.PORT || 4000;

// Initialize Arweave client
const arweave = Arweave.init({
  host: 'arweave.net',
  port: 443,
  protocol: 'https',
  timeout: 20000,
});

// Load JWK keyfile for Arweave from env
const jwkEnv = process.env.ARWEAVE_JWK_JSON;
if (!jwkEnv) {
  console.error('Missing ARWEAVE_JWK_JSON in environment variables');
  return res.status(500).json({
    error: 'Missing ARWEAVE_JWK_JSON',
    details: 'Please set ARWEAVE_JWK_JSON in environment variables'
  });
}
const jwk = JSON.parse(jwkEnv);

app.use(cors());
app.use(bodyParser.json({ limit: '100mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '100mb' }));

app.post('/api/upload', async (req, res) => {
  try {
    const { ciphertext, iv, metadata } = req.body;
    const dataBuffer = Buffer.from(ciphertext, 'base64');

    const tx = await arweave.createTransaction({ data: dataBuffer }, jwk);
    tx.addTag('App-Name', 'TUMA-Document-Exchange');
    if (metadata) {
      Object.entries(metadata).forEach(([key, value]) => {
        tx.addTag(key, String(value));
      });
    }
    await arweave.transactions.sign(tx, jwk);
    const response = await arweave.transactions.post(tx);
    if (response.status === 200 || response.status === 202) {
      res.json({ id: tx.id });
    } else {
      res.status(500).json({ error: `Arweave response status ${response.status}` });
    }
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

// --- Coinbase Commerce Dynamic Charge Endpoint ---
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const COINBASE_COMMERCE_API_KEY = process.env.COINBASE_COMMERCE_API_KEY;
const COINBASE_COMMERCE_API_URL = 'https://api.commerce.coinbase.com/charges';

app.get('/api/chargeStatus', async (req, res) => {
  const { chargeId } = req.query;
  if (!chargeId || !COINBASE_COMMERCE_API_KEY) {
    res.status(400).json({ error: 'Missing chargeId or API key' });
    return;
  }
  try {
    const response = await fetch(`${COINBASE_COMMERCE_API_URL}/${chargeId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-CC-Api-Key': COINBASE_COMMERCE_API_KEY,
        'X-CC-Version': '2018-03-22',
      },
    });
    const data = await response.json();
    if (!response.ok) {
      res.status(response.status).json({ error: data.error || data });
      return;
    }
    // Extract status from Coinbase response
    const timeline = data.data.timeline || [];
    const latest = timeline.length ? timeline[timeline.length - 1] : {};
    const statusName = data.data.status || latest.status || 'pending';
    res.status(200).json({ statusName, timeline, data: data.data });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to fetch charge status' });
  }
});

app.post('/api/createCharge', async (req, res) => {
  const { amount, currency = 'USD', name = 'Document Payment', description = 'Payment for document upload', metadata = {} } = req.body;

  if (!amount || !COINBASE_COMMERCE_API_KEY) {
    res.status(400).json({ error: 'Missing parameters or API key' });
    return;
  }

  try {
    const response = await fetch(COINBASE_COMMERCE_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CC-Api-Key': COINBASE_COMMERCE_API_KEY,
        'X-CC-Version': '2018-03-22',
      },
      body: JSON.stringify({
        name,
        description,
        pricing_type: 'fixed_price',
        local_price: { amount: amount.toString(), currency },
        metadata,
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      res.status(response.status).json({ error: data.error || data });
      return;
    }
    res.status(200).json({ id: data.data.id });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to create charge' });
  }
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
