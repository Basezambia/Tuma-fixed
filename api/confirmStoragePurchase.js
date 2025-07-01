const { createClient } = require('@supabase/supabase-js');
const fetch = require('node-fetch');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

// Verify Arweave transaction
async function verifyArweaveTransaction(txId) {
  try {
    const response = await fetch(`https://arweave.net/tx/${txId}`);
    if (response.status === 200) {
      const txData = await response.json();
      return {
        verified: true,
        data: txData,
        amount: parseFloat(txData.quantity) / 1000000000000, // Convert Winston to AR
        target: txData.target,
        owner: txData.owner
      };
    }
    return { verified: false, error: 'Transaction not found' };
  } catch (error) {
    console.error('Error verifying Arweave transaction:', error);
    return { verified: false, error: error.message };
  }
}

// Get current AR price
async function getArPrice() {
  try {
    const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=arweave&vs_currencies=usd');
    const data = await response.json();
    if (!data.arweave?.usd) {
      throw new Error('Invalid AR price data received');
    }
    return data.arweave.usd;
  } catch (error) {
    console.error('Error fetching AR price:', error);
    throw error; // No fallback, let it fail properly
  }
}

async function handler(req, res) {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return res.status(200).json({ success: true });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { 
      purchaseId, 
      transactionHash, 
      userId, 
      walletAddress,
      paymentMethod = 'ar'
    } = req.body;

    if (!purchaseId || !transactionHash || !userId || !walletAddress) {
      return res.status(400).json({ 
        error: 'Missing required fields: purchaseId, transactionHash, userId, walletAddress' 
      });
    }

    // Get the purchase record
    const { data: purchase, error: purchaseError } = await supabase
      .from('storage_purchases')
      .select('*')
      .eq('id', purchaseId)
      .eq('user_id', userId)
      .eq('wallet_address', walletAddress)
      .single();

    if (purchaseError || !purchase) {
      return res.status(404).json({ error: 'Purchase not found' });
    }

    if (purchase.status === 'completed') {
      return res.status(400).json({ error: 'Purchase already completed' });
    }

    // Verify the transaction based on payment method
    let verificationResult;
    
    if (paymentMethod === 'ar') {
      verificationResult = await verifyArweaveTransaction(transactionHash);
      
      if (!verificationResult.verified) {
        return res.status(400).json({ 
          error: 'Transaction verification failed',
          details: verificationResult.error 
        });
      }

      // Check if the transaction amount matches the expected amount (with some tolerance)
      const expectedAR = purchase.price_paid_ar;
      const actualAR = verificationResult.amount;
      const tolerance = 0.001; // 0.1% tolerance
      
      if (Math.abs(actualAR - expectedAR) > expectedAR * tolerance) {
        return res.status(400).json({ 
          error: 'Transaction amount mismatch',
          expected: expectedAR,
          actual: actualAR
        });
      }
    } else {
      // For other payment methods, you would implement different verification logic
      // For now, we'll assume the transaction is valid
      verificationResult = { verified: true };
    }

    // Update the purchase status
    const { data: updatedPurchase, error: updateError } = await supabase
      .from('storage_purchases')
      .update({
        status: 'completed',
        transaction_hash: transactionHash,
        metadata: {
          ...purchase.metadata,
          verification_data: verificationResult.data,
          confirmed_at: new Date().toISOString(),
          payment_verified: true
        }
      })
      .eq('id', purchaseId)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating purchase:', updateError);
      return res.status(500).json({ error: 'Failed to update purchase status' });
    }

    // The database trigger will automatically update user storage credits
    // Wait a moment for the trigger to complete
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Get updated user storage credits
    const { data: userCredits, error: creditsError } = await supabase
      .from('user_storage_credits')
      .select('*')
      .eq('user_id', userId)
      .eq('wallet_address', walletAddress)
      .single();

    // Get user storage summary
    const { data: storageSummary, error: summaryError } = await supabase
      .rpc('get_user_storage_summary', {
        p_user_id: userId,
        p_wallet_address: walletAddress
      });

    // Log the successful purchase
    console.log(`Storage purchase confirmed: ${purchaseId} for user ${userId}`);

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    return res.status(200).json({
      success: true,
      message: 'Purchase confirmed successfully',
      purchase: {
        id: updatedPurchase.id,
        storage_mb: updatedPurchase.storage_mb,
        storage_gb: (updatedPurchase.storage_mb / 1024).toFixed(2),
        price_paid_usd: updatedPurchase.price_paid_usd,
        price_paid_ar: updatedPurchase.price_paid_ar,
        status: updatedPurchase.status,
        transaction_hash: updatedPurchase.transaction_hash,
        confirmed_at: updatedPurchase.metadata.confirmed_at
      },
      user_credits: userCredits ? {
        total_credits_mb: userCredits.total_credits_mb,
        used_credits_mb: userCredits.used_credits_mb,
        available_credits_mb: userCredits.available_credits_mb,
        total_credits_gb: (userCredits.total_credits_mb / 1024).toFixed(2),
        available_credits_gb: (userCredits.available_credits_mb / 1024).toFixed(2)
      } : null,
      storage_summary: storageSummary || null,
      verification: {
        method: paymentMethod,
        transaction_verified: verificationResult.verified,
        transaction_hash: transactionHash
      }
    });

  } catch (error) {
    console.error('Confirm storage purchase error:', error);
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(500).json({ 
      error: 'Internal server error',
      details: error.message 
    });
  }
}

module.exports = handler;