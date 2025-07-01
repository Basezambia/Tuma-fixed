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
const getUserStorage = require('./api/getUserStorage');
const getStoragePackages = require('./api/getStoragePackages');
const getP2PListings = require('./api/getP2PListings');
const createP2PListing = require('./api/createP2PListing');
const purchaseP2PListing = require('./api/purchaseP2PListing');
const confirmP2PPurchase = require('./api/confirmP2PPurchase');
const purchaseStorage = require('./api/purchaseStorage');
const confirmStoragePurchase = require('./api/confirmStoragePurchase');

// Set up API routes
app.get('/api/getArweavePrice', getArweavePrice);
app.post('/api/createCharge', createCharge);
app.get('/api/chargeStatus', chargeStatus);
app.post('/api/upload', upload);
app.get('/api/getUserStorage', getUserStorage);
app.get('/api/getStoragePackages', getStoragePackages);
app.get('/api/getP2PListings', getP2PListings);
app.post('/api/createP2PListing', createP2PListing);
app.post('/api/purchaseP2PListing', purchaseP2PListing);
app.post('/api/confirmP2PPurchase', confirmP2PPurchase);
app.post('/api/purchaseStorage', purchaseStorage);
app.post('/api/confirmStoragePurchase', confirmStoragePurchase);

// Start the server
app.listen(port, () => {
  console.log(`API server running at http://localhost:${port}`);
  console.log(`Environment variables loaded: ${process.env.COINBASE_COMMERCE_API_KEY ? 'API key found' : 'API key missing'}`);
});