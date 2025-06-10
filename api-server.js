// Load environment variables from .env file
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const app = express();
const port = 3001;

// Enable CORS
app.use(cors());

// Parse JSON request bodies
app.use(express.json());

// Import API handlers
const getArweavePrice = require('./api/getArweavePrice');
const createCharge = require('./api/createCharge');
const chargeStatus = require('./api/chargeStatus');
const upload = require('./api/upload');

// Set up API routes
app.get('/api/getArweavePrice', getArweavePrice);
app.post('/api/createCharge', createCharge);
app.get('/api/chargeStatus', chargeStatus);
app.post('/api/upload', upload);

// Start the server
app.listen(port, () => {
  console.log(`API server running at http://localhost:${port}`);
  console.log(`Environment variables loaded: ${process.env.COINBASE_COMMERCE_API_KEY ? 'API key found' : 'API key missing'}`);
});