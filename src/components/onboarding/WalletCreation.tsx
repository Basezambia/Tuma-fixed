import { useState, useEffect } from 'react'
import { createSmartWallet } from '@/lib/cdp-wallet'
import { supabase } from '@/lib/supabase-auth'
import { toast } from 'sonner'

export const WalletCreation = ({ user, onComplete }: { user: any, onComplete: (wallet: any) => void }) => {
  const [creating, setCreating] = useState(false)
  const [wallet, setWallet] = useState(null)
  
  const generateTemporaryName = (email: string) => {
    const username = email.split('@')[0]
    return username.charAt(0).toUpperCase() + username.slice(1)
  }

  const handleCreateWallet = async () => {
    setCreating(true)
    
    try {
      const temporaryName = generateTemporaryName(user.email)
      const newWallet = await createSmartWallet(user.id, user.email)
      
      // Update user profile with temporary name
      await supabase
        .from('user_wallets')
        .update({ 
          temporary_name: temporaryName,
          onboarding_completed: false 
        })
        .eq('user_id', user.id)
      
      setWallet(newWallet)
      toast.success('Smart wallet created successfully!')
      onComplete(newWallet)
    } catch (error: any) {
      toast.error('Failed to create wallet: ' + error.message)
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="text-center space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">Create Your Smart Wallet</h2>
        <p className="text-gray-600">
          We'll create a secure smart wallet for you on the Base network.
        </p>
      </div>
      
      <div className="bg-blue-50 p-4 rounded-lg">
        <h3 className="font-semibold mb-2">What you'll get:</h3>
        <ul className="text-sm text-left space-y-1">
          <li>✅ Secure smart wallet on Base network</li>
          <li>✅ Gas sponsorship capabilities</li>
          <li>✅ Batch transaction support</li>
          <li>✅ Recovery seed phrase</li>
        </ul>
      </div>
      
      <button
        onClick={handleCreateWallet}
        disabled={creating}
        className="w-full bg-blue-600 text-white p-3 rounded-lg hover:bg-blue-700 disabled:opacity-50"
      >
        {creating ? 'Creating Wallet...' : 'Create Smart Wallet'}
      </button>
    </div>
  )
}