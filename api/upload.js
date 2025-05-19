import Arweave from 'arweave';

// Enable CORS for all routes
const allowCors = fn => async (req, res) => {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );
  
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  
  return await fn(req, res);
};

const handler = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Check for JWK in environment variables - try multiple possible env var names
  const jwkEnv = process.env.ARWEAVE_JWK_JSON || process.env.VITE_ARWEAVE_JWK_JSON;
  if (!jwkEnv) {
    return res.status(500).json({ error: "Missing JWK in environment variables" });
  }

  let jwk;
  try {
    jwk = JSON.parse(jwkEnv);
  } catch (error) {
    console.error('Error parsing JWK:', error);
    return res.status(500).json({ error: "Invalid JWK format in environment variables" });
  }

  const arweave = Arweave.init({
    host: "arweave.net",
    port: 443,
    protocol: "https",
    timeout: 20000,
  });

  try {
    const { ciphertext, metadata } = req.body;
    if (!ciphertext) {
      return res.status(400).json({ error: "Missing ciphertext in request body" });
    }
    
    const dataBuffer = Buffer.from(ciphertext, "base64");

    const tx = await arweave.createTransaction({ data: dataBuffer }, jwk);
    tx.addTag("App-Name", "TUMA-Document-Exchange");

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
      console.error(`Arweave error: ${response.status}`, response);
      return res.status(500).json({ error: `Arweave response: ${response.status}` });
    }
  } catch (error) {
    console.error('Upload error:', error);
    return res.status(500).json({ error: error.message || 'Unknown error occurred' });
  }
};

// Apply CORS to our handler
export default allowCors(handler);
