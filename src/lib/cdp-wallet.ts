import { Coinbase, Wallet } from '@coinbase/coinbase-sdk'
import { supabase } from './supabase-auth'

// Initialize CDP SDK
const coinbase = new Coinbase({
  apiKeyName: process.env.CDP_API_KEY_NAME!,
  privateKey: process.env.CDP_PRIVATE_KEY!,
  useServerSigner: true
})

export interface UserWallet {
  walletId: string
  address: string
  seedPhrase: string
  networkId: string
}

export const createSmartWallet = async (userId: string, email: string): Promise<UserWallet> => {
  try {
    // Create a new wallet using CDP v2 API
    const wallet = await Wallet.create({
      networkId: 'base-sepolia' // or 'base-mainnet' for production
    })
    
    // Get the default address
    const address = await wallet.getDefaultAddress()
    
    // Export wallet data and extract seed phrase
    const walletData = wallet.export()
    const seedPhrase = walletData.seed
    
    // Store wallet info in Supabase
    await supabase
      .from('user_wallets')
      .insert({
        user_id: userId,
        email: email,
        wallet_id: wallet.getId(),
        address: address.getId(),
        network_id: 'base-sepolia',
        created_at: new Date().toISOString()
      })
    
    return {
      walletId: wallet.getId(),
      address: address.getId(),
      seedPhrase: seedPhrase,
      networkId: 'base-sepolia'
    }
  } catch (error) {
    console.error('Error creating smart wallet:', error)
    throw new Error('Failed to create smart wallet')
  }
}

export const getWalletByUserId = async (userId: string) => {
  const { data, error } = await supabase
    .from('user_wallets')
    .select('*')
    .eq('user_id', userId)
    .single()
  
  if (error) throw error
  return data
}