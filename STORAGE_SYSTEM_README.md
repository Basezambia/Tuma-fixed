# TUMA Storage Credit System

A comprehensive storage marketplace that allows users to purchase decentralized storage credits and use them for file uploads without per-transaction payments.

## Overview

The storage credit system enables users to:
- Purchase storage credits with AR tokens or USD
- Upload files using pre-purchased credits instead of direct payments
- Benefit from AR price fluctuations (more storage when AR price increases)
- Track usage and manage storage efficiently
- Access permanent, decentralized storage on Arweave

## How AR Price Fluctuations Affect Storage

### The Advantage of Pre-purchasing Storage

When you purchase storage credits, you're essentially buying storage capacity at the current AR price. Here's how price fluctuations work in your favor:

**Example Scenario:**
- Today: 1 AR = $15 USD, buys 500 MB of storage
- You purchase: 10 AR = $150 USD = 5,000 MB (5 GB) of storage credits
- Tomorrow: 1 AR = $20 USD (AR price increased)
- Your 5 GB of storage credits remain the same
- But new purchases would get: 1 AR = $20 USD, buys 375 MB of storage

**Key Benefits:**
1. **Price Protection**: Your purchased storage amount is locked in
2. **No Loss**: AR price increases don't reduce your existing storage
3. **Efficiency**: You avoid paying higher prices for future uploads
4. **Predictability**: Know exactly how much storage you have

## System Architecture

### Database Schema

#### Storage Packages (`storage_packages`)
Predefined storage packages with bulk discounts:
- Starter Pack: 1 GB for $4.99
- Pro Pack: 5 GB for $19.99 (20% discount)
- Business Pack: 10 GB for $34.99 (30% discount)
- Enterprise Pack: 50 GB for $149.99 (40% discount)
- Ultimate Pack: 100 GB for $249.99 (50% discount)

#### User Storage Credits (`user_storage_credits`)
Tracks user's storage balance:
- `total_credits_mb`: Total purchased storage
- `used_credits_mb`: Storage already used
- `available_credits_mb`: Remaining storage (computed)

#### Storage Purchases (`storage_purchases`)
Records all storage purchases:
- Package or custom storage amount
- Payment details (USD/AR amounts)
- AR price at time of purchase
- Transaction hash and status

#### Storage Usage (`storage_usage`)
Tracks file uploads and storage deduction:
- File ID (Arweave transaction ID)
- File size and credits deducted
- Upload timestamp

#### Storage Credit Transactions (`storage_credit_transactions`)
Audit trail for all credit movements:
- Purchase, usage, refund, bonus transactions
- Balance before/after each transaction

### API Endpoints

#### 1. Get Storage Packages
```
GET /api/getStoragePackages?includeCustomPricing=true
```
Returns available storage packages with real-time AR pricing.

**Response:**
```json
{
  "success": true,
  "packages": [...],
  "market_data": {
    "current_ar_price_usd": 15.42,
    "last_updated": "2024-01-15T10:30:00Z"
  },
  "custom_pricing": {...},
  "market_comparison": {...}
}
```

#### 2. Purchase Storage
```
POST /api/purchaseStorage
```
Purchase storage credits with a package or custom amount.

**Request:**
```json
{
  "userId": "user-uuid",
  "walletAddress": "wallet-address",
  "packageId": "package-uuid", // OR customStorageMB
  "customStorageMB": 1024,
  "paymentMethod": "ar", // or "usd"
  "arAmount": 2.5, // if paying with specific AR amount
  "transactionHash": "tx-hash" // if payment already made
}
```

**Response:**
```json
{
  "success": true,
  "purchase": {
    "id": "purchase-uuid",
    "storage_mb": 1024,
    "price_usd": 30.84,
    "price_ar": 2.0,
    "status": "pending"
  },
  "message": "Purchase created. Complete payment to activate storage credits."
}
```

#### 3. Get User Storage
```
GET /api/getUserStorage?userId=xxx&walletAddress=xxx&includeHistory=true
```
Retrieve user's storage summary, usage statistics, and transaction history.

**Response:**
```json
{
  "success": true,
  "storage_summary": {
    "total_credits_mb": 5120,
    "used_credits_mb": 1024,
    "available_credits_mb": 4096,
    "usage_percentage": 20.0
  },
  "usage_statistics": {
    "total_uploads": 15,
    "average_file_size_mb": 68.27,
    "estimated_days_remaining": 45
  },
  "financial_summary": {
    "total_spent_usd": "19.99",
    "cost_per_gb_usd": "4.00"
  },
  "recent_purchases": [...],
  "recent_usage": [...]
}
```

#### 4. Confirm Purchase
```
POST /api/confirmStoragePurchase
```
Confirm payment and activate storage credits.

**Request:**
```json
{
  "purchaseId": "purchase-uuid",
  "transactionHash": "arweave-tx-hash",
  "userId": "user-uuid",
  "walletAddress": "wallet-address",
  "paymentMethod": "ar"
}
```

#### 5. Upload with Credits
```
POST /api/upload
```
Upload files using storage credits (modified existing endpoint).

**Request:**
```json
{
  "ciphertext": "base64-encoded-file",
  "metadata": {...},
  "userId": "user-uuid",
  "walletAddress": "wallet-address",
  "useCredits": true
}
```

**Response:**
```json
{
  "id": "arweave-tx-id",
  "file_size_mb": 2.5,
  "credits_deducted": 2.5,
  "remaining_credits": {
    "available_credits_mb": 4093.5
  },
  "payment_method": "storage-credits"
}
```

## React Components

### StorageMarketplace Component
Full-featured marketplace interface with:
- Package browsing and comparison
- Custom storage calculator
- User dashboard with usage analytics
- Purchase flow with real-time pricing

**Usage:**
```jsx
import StorageMarketplace from './components/StorageMarketplace';

<StorageMarketplace 
  userId={user.id} 
  walletAddress={user.walletAddress} 
/>
```

### StorageDashboard Component
Compact dashboard widget for main app:
- Storage usage overview
- Low storage warnings
- Quick purchase access
- Recent activity summary

**Usage:**
```jsx
import StorageDashboard from './components/StorageDashboard';

<StorageDashboard 
  userId={user.id} 
  walletAddress={user.walletAddress}
  onOpenMarketplace={() => setShowMarketplace(true)}
/>
```

## Database Functions

### `deduct_storage_credits()`
Automatically deducts storage credits when files are uploaded:
```sql
SELECT deduct_storage_credits(
  'user-uuid',
  'wallet-address', 
  'file-id',
  2.5 -- file size in MB
);
```

### `get_user_storage_summary()`
Retrieve comprehensive storage statistics:
```sql
SELECT * FROM get_user_storage_summary(
  'user-uuid',
  'wallet-address'
);
```

## Implementation Steps

### 1. Database Setup
```bash
# Run the migration
supabase migration up

# Or apply the SQL file
psql -f supabase/migrations/003_storage_credits_system.sql
```

### 2. Environment Variables
Add to your `.env` file:
```env
SUPABASE_URL=your-supabase-url
SUPABASE_ANON_KEY=your-supabase-anon-key
ARWEAVE_JWK_JSON=your-arweave-wallet-jwk
```

### 3. Install Dependencies
```bash
npm install @supabase/supabase-js node-fetch
```

### 4. Deploy API Endpoints
Ensure all API files are deployed to your serverless platform:
- `/api/getStoragePackages.js`
- `/api/purchaseStorage.js`
- `/api/getUserStorage.js`
- `/api/confirmStoragePurchase.js`
- `/api/upload.js` (modified)

### 5. Integrate Components
Add the storage components to your React app:
```jsx
// In your main app
import StorageMarketplace from './components/StorageMarketplace';
import StorageDashboard from './components/StorageDashboard';

// Use in your routing or modal system
```

## Usage Flow

### For Users:
1. **Browse Packages**: View available storage packages with real-time pricing
2. **Purchase Storage**: Buy credits with AR tokens or USD
3. **Upload Files**: Use credits instead of paying per upload
4. **Monitor Usage**: Track storage consumption and remaining credits
5. **Manage Credits**: Purchase more when needed

### For Developers:
1. **Check Credits**: Before upload, verify user has sufficient credits
2. **Deduct Usage**: Automatically deduct file size from user credits
3. **Handle Errors**: Gracefully handle insufficient credits
4. **Update UI**: Show real-time credit balance and usage

## Benefits

### For Users:
- **Cost Predictability**: Know exactly how much storage you have
- **No Per-Upload Fees**: Upload as many files as you want within your credits
- **Price Protection**: Benefit from bulk discounts and price stability
- **Permanent Storage**: Files stored forever on Arweave network

### For Platform:
- **Revenue Stability**: Predictable income from storage sales
- **User Retention**: Credits encourage continued platform usage
- **Simplified UX**: No payment friction for each upload
- **Scalability**: Handle high upload volumes efficiently

## Monitoring and Analytics

### Key Metrics to Track:
- Total storage sold vs. used
- Average purchase size
- User retention after purchase
- Storage efficiency (cost per GB)
- AR price impact on sales

### Database Queries:
```sql
-- Total storage sold this month
SELECT SUM(storage_mb) FROM storage_purchases 
WHERE status = 'completed' 
AND purchased_at >= date_trunc('month', now());

-- Average storage usage per user
SELECT AVG(used_credits_mb) FROM user_storage_credits;

-- Most popular packages
SELECT sp.name, COUNT(*) as purchases 
FROM storage_purchases spu
JOIN storage_packages sp ON spu.package_id = sp.id
WHERE spu.status = 'completed'
GROUP BY sp.name ORDER BY purchases DESC;
```

## Security Considerations

1. **Transaction Verification**: All AR payments are verified against Arweave network
2. **User Authentication**: Credits tied to authenticated user accounts
3. **Rate Limiting**: Prevent abuse of purchase and upload endpoints
4. **Audit Trail**: Complete transaction history for all credit movements
5. **Row Level Security**: Users can only access their own storage data

## Future Enhancements

1. **Subscription Plans**: Recurring storage credit purchases
2. **Referral System**: Bonus credits for user referrals
3. **Enterprise Features**: Team storage pools and management
4. **Storage Sharing**: Transfer credits between users
5. **Advanced Analytics**: Detailed usage patterns and optimization suggestions
6. **Multi-Currency Support**: Accept various cryptocurrencies
7. **Storage Marketplace**: Users can sell unused credits to others

## Troubleshooting

### Common Issues:

1. **Credits Not Updating**: Check database triggers are enabled
2. **Purchase Verification Fails**: Ensure Arweave transaction is confirmed
3. **Upload Fails**: Verify user has sufficient credits before upload
4. **Price Discrepancies**: AR price fluctuations between quote and purchase

### Debug Commands:
```sql
-- Check user credits
SELECT * FROM user_storage_credits WHERE user_id = 'user-uuid';

-- View recent transactions
SELECT * FROM storage_credit_transactions 
WHERE user_id = 'user-uuid' 
ORDER BY created_at DESC LIMIT 10;

-- Check purchase status
SELECT * FROM storage_purchases 
WHERE user_id = 'user-uuid' 
ORDER BY purchased_at DESC;
```

## Support

For technical support or questions about the storage credit system:
1. Check the database logs for error details
2. Verify API endpoint responses
3. Test with small storage amounts first
4. Monitor Arweave network status for transaction delays

---

**Note**: This system provides a complete storage marketplace solution that benefits from Arweave's permanent storage model while offering users predictable pricing and a seamless upload experience.