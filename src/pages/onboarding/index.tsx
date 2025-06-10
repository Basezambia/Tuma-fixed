import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '@/lib/supabase-auth'
import { EmailSignup } from '@/components/onboarding/EmailSignup'
import { WalletCreation } from '@/components/onboarding/WalletCreation'
import { SeedPhraseBackup } from '@/components/onboarding/SeedPhraseBackup'

type OnboardingStep = 'signup' | 'verify' | 'wallet' | 'backup' | 'complete'

export default function OnboardingPage() {
  const [step, setStep] = useState<OnboardingStep>('signup')
  const [user, setUser] = useState(null)
  const [wallet, setWallet] = useState(null)
  const router = useRouter()
  
  useEffect(() => {
    // Check if user is already authenticated
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        setUser(user)
        // Check if wallet already exists
        const { data: existingWallet } = await supabase
          .from('user_wallets')
          .select('*')
          .eq('user_id', user.id)
          .single()
        
        if (existingWallet) {
          if (existingWallet.onboarding_completed) {
            router.push('/dashboard')
          } else {
            setStep('backup')
            setWallet(existingWallet)
          }
        } else {
          setStep('wallet')
        }
      }
    }
    
    checkUser()
  }, [])
  
  const handleSignupSuccess = () => {
    setStep('verify')
  }
  
  const handleWalletCreated = (newWallet: any) => {
    setWallet(newWallet)
    setStep('backup')
  }
  
  const handleBackupComplete = async () => {
    // Mark onboarding as completed
    await supabase
      .from('user_wallets')
      .update({ onboarding_completed: true })
      .eq('user_id', user.id)
    
    setStep('complete')
    setTimeout(() => {
      router.push('/dashboard')
    }, 2000)
  }
  
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-6">
        {step === 'signup' && (
          <EmailSignup onSuccess={handleSignupSuccess} />
        )}
        
        {step === 'verify' && (
          <div className="text-center">
            <h2 className="text-2xl font-bold mb-4">Check Your Email</h2>
            <p className="text-gray-600">
              We've sent you a verification link. Click it to continue setting up your wallet.
            </p>
          </div>
        )}
        
        {step === 'wallet' && user && (
          <WalletCreation user={user} onComplete={handleWalletCreated} />
        )}
        
        {step === 'backup' && wallet && (
          <SeedPhraseBackup 
            seedPhrase={wallet.seedPhrase} 
            onComplete={handleBackupComplete} 
          />
        )}
        
        {step === 'complete' && (
          <div className="text-center">
            <h2 className="text-2xl font-bold mb-4 text-green-600">Welcome to TUMA!</h2>
            <p className="text-gray-600">
              Your smart wallet has been created successfully. Redirecting to dashboard...
            </p>
          </div>
        )}
      </div>
    </div>
  )
}