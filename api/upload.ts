import type { VercelRequest, VercelResponse } from '@vercel/node';
import Arweave from 'arweave';

const arweave = Arweave.init({
  host: 'arweave.net',
  port: 443,
  protocol: 'https',
  timeout: 20000,
});

const jwk = JSON.parse(process.env.ARWEAVE_JWK_JSON!);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

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
      return res.status(200).json({ id: tx.id });
    } else {
      return res.status(500).json({ error: `Arweave response status ${response.status}` });
    }
  } catch (error: any) {
    console.error('Upload error:', error);
    return res.status(500).json({ error: error.message });
  }
}
