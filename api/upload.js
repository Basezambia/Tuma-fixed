// Use dynamic import for better compatibility with serverless environments
const Arweave = require('arweave');
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

// Enable CORS for all routes
const allowCors = fn => async (req, res) => {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
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

  try {
    const { ciphertext, metadata, userId, walletAddress, useCredits = true, deductOnly = false, fileId, fileSizeMB } = req.body;
    
    // For deductOnly mode, we need fileId and fileSizeMB instead of ciphertext
    if (deductOnly) {
      if (!fileId || !fileSizeMB) {
        return res.status(400).json({ error: "Missing fileId or fileSizeMB for credit deduction" });
      }
    } else if (!ciphertext) {
      return res.status(400).json({ error: "Missing ciphertext in request body" });
    }

    // If using credits, validate user and check balance
    if (useCredits) {
      if (!userId || !walletAddress) {
        return res.status(400).json({ 
          error: "Missing userId or walletAddress for credit-based upload" 
        });
      }

      // Calculate file size in MB
      let calculatedFileSizeMB;
      if (deductOnly) {
        calculatedFileSizeMB = fileSizeMB; // Use provided file size for deduction
      } else {
        const dataBuffer = Buffer.from(ciphertext, "base64");
        calculatedFileSizeMB = dataBuffer.length / (1024 * 1024);
      }

      // Check if user has sufficient credits
      const { data: userCredits, error: creditsError } = await supabase
        .from('user_storage_credits')
        .select('available_credits_mb')
        .eq('user_id', userId)
        .eq('wallet_address', walletAddress)
        .single();

      if (creditsError || !userCredits) {
        return res.status(400).json({ 
          error: "No storage credits found. Please purchase storage credits first.",
          action: "purchase_credits"
        });
      }

      if (userCredits.available_credits_mb < calculatedFileSizeMB) {
        return res.status(400).json({ 
          error: `Insufficient storage credits. Required: ${calculatedFileSizeMB.toFixed(2)}MB, Available: ${userCredits.available_credits_mb}MB`,
          action: "purchase_more_credits",
          required_mb: calculatedFileSizeMB,
          available_mb: userCredits.available_credits_mb
        });
      }
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

    // For deductOnly mode, skip Arweave upload and go directly to credit deduction
    if (deductOnly) {
      // Directly deduct credits using provided fileId and fileSizeMB
      if (useCredits && userId && walletAddress) {
        const { data: deductionResult, error: deductionError } = await supabase
          .rpc('deduct_storage_credits', {
            p_user_id: userId,
            p_wallet_address: walletAddress,
            p_file_id: fileId,
            p_file_size_mb: calculatedFileSizeMB
          });

        if (deductionError || !deductionResult) {
          console.error('Error deducting storage credits:', deductionError);
          return res.status(500).json({ 
            error: "Failed to deduct credits.",
            file_id: fileId,
            file_size_mb: calculatedFileSizeMB
          });
        }

        // Get updated user credits
        const { data: updatedCredits } = await supabase
          .from('user_storage_credits')
          .select('total_credits_mb, used_credits_mb, available_credits_mb')
          .eq('user_id', userId)
          .eq('wallet_address', walletAddress)
          .single();

        return res.status(200).json({ 
          success: true,
          file_id: fileId,
          file_size_mb: calculatedFileSizeMB,
          credits_deducted: calculatedFileSizeMB,
          remaining_credits: updatedCredits || null,
          payment_method: "storage-credits"
        });
      }
      
      return res.status(400).json({ error: "Credit deduction requires useCredits, userId, and walletAddress" });
    }

    // Regular upload mode
    const arweave = Arweave.init({
      host: "arweave.net",
      port: 443,
      protocol: "https",
      timeout: 20000,
    });

    const dataBuffer = Buffer.from(ciphertext, "base64");
    const actualFileSizeMB = dataBuffer.length / (1024 * 1024);

    const tx = await arweave.createTransaction({ data: dataBuffer }, jwk);
    tx.addTag("App-Name", "TUMA-Document-Exchange");
    tx.addTag("File-Size-MB", actualFileSizeMB.toString());
    
    if (useCredits && userId && walletAddress) {
      tx.addTag("User-ID", userId);
      tx.addTag("Wallet-Address", walletAddress);
      tx.addTag("Payment-Method", "storage-credits");
    }

    if (metadata) {
      Object.entries(metadata).forEach(([key, value]) => {
        tx.addTag(key, String(value));
      });
    }

    await arweave.transactions.sign(tx, jwk);
    const response = await arweave.transactions.post(tx);

    if (response.status === 200 || response.status === 202) {
      // If using credits, deduct the storage amount
      if (useCredits && userId && walletAddress) {
        const { data: deductionResult, error: deductionError } = await supabase
          .rpc('deduct_storage_credits', {
            p_user_id: userId,
            p_wallet_address: walletAddress,
            p_file_id: tx.id,
            p_file_size_mb: actualFileSizeMB
          });

        if (deductionError || !deductionResult) {
          console.error('Error deducting storage credits:', deductionError);
          // Note: File is already uploaded to Arweave, but credits weren't deducted
          // This is a critical error that should be logged and handled
          return res.status(500).json({ 
            error: "File uploaded but failed to deduct credits. Please contact support.",
            transaction_id: tx.id,
            file_size_mb: actualFileSizeMB
          });
        }

        // Get updated user credits
        const { data: updatedCredits } = await supabase
          .from('user_storage_credits')
          .select('total_credits_mb, used_credits_mb, available_credits_mb')
          .eq('user_id', userId)
          .eq('wallet_address', walletAddress)
          .single();

        return res.status(200).json({ 
          id: tx.id,
          file_size_mb: actualFileSizeMB,
          credits_deducted: actualFileSizeMB,
          remaining_credits: updatedCredits || null,
          arweave_url: `https://arweave.net/${tx.id}`,
          payment_method: "storage-credits"
        });
      } else {
        // Traditional upload without credits
        return res.status(200).json({ 
          id: tx.id,
          file_size_mb: fileSizeMB,
          arweave_url: `https://arweave.net/${tx.id}`,
          payment_method: "direct"
        });
      }
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
module.exports = allowCors(handler);
// For backwards compatibility with ES modules
module.exports.default = allowCors(handler);
