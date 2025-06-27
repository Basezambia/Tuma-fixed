import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { EmailSignup } from './onboarding/EmailSignup'
import { EmailLogin } from './onboarding/EmailLogin'
import { ConnectWallet } from '@coinbase/onchainkit/wallet'
import { Mail, Wallet, X } from 'lucide-react'

interface CustomWalletModalProps {
  isOpen: boolean
  onClose: () => void
  onConnect?: () => void
}

export const CustomWalletModal = ({ isOpen, onClose, onConnect }: CustomWalletModalProps) => {
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login')
  const [showEmailAuth, setShowEmailAuth] = useState(false)

  const handleEmailSuccess = () => {
    onConnect?.()
    onClose()
  }

  const handleWalletConnect = () => {
    onConnect?.()
    onClose()
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md bg-gray-500 md:bg-white">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <img src="/tuma logo.png" alt="TUMA" className="w-8 h-8" />
              <DialogTitle>TUMA</DialogTitle>
            </div>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>

        <div className="space-y-4">
          {!showEmailAuth ? (
            <>
              {/* Email Authentication Option */}
              <Button
                onClick={() => setShowEmailAuth(true)}
                className="w-full flex items-center justify-between p-4 h-auto bg-gray-50 hover:bg-gray-100 text-gray-900 border"
                variant="outline"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-black rounded-lg flex items-center justify-center">
                    <Mail className="w-4 h-4 text-white" />
                  </div>
                  <span className="font-medium">Sign up</span>
                </div>
                <div className="w-6 h-6 bg-black rounded-full flex items-center justify-center">
                  <span className="text-white text-xs">→</span>
                </div>
              </Button>

              <div className="text-center text-sm text-gray-500 my-4">
                or continue with an existing wallet
              </div>

              {/* Existing Wallet Options */}
              <div className="space-y-3">
                <ConnectWallet
                  onConnect={handleWalletConnect}
                  className="w-full flex items-center justify-between p-4 h-auto bg-gray-50 hover:bg-gray-100 text-gray-900 border rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                      <Wallet className="w-4 h-4 text-white" />
                    </div>
                    <span className="font-medium">Coinbase Wallet</span>
                  </div>
                  <div className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center">
                    <span className="text-white text-xs">→</span>
                  </div>
                </ConnectWallet>

                {/* Other wallet options can be added here */}
                <Button
                  variant="outline"
                  className="w-full flex items-center justify-between p-4 h-auto bg-gray-50 hover:bg-gray-100 text-gray-900 border"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center">
                      <span className="text-white text-xs font-bold">M</span>
                    </div>
                    <span className="font-medium">MetaMask</span>
                  </div>
                  <div className="w-6 h-6 bg-orange-500 rounded-full flex items-center justify-center">
                    <span className="text-white text-xs">→</span>
                  </div>
                </Button>

                <Button
                  variant="outline"
                  className="w-full flex items-center justify-between p-4 h-auto bg-gray-50 hover:bg-gray-100 text-gray-900 border"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-purple-600 rounded-lg flex items-center justify-center">
                      <span className="text-white text-xs font-bold">P</span>
                    </div>
                    <span className="font-medium">Phantom</span>
                  </div>
                  <div className="w-6 h-6 bg-purple-600 rounded-full flex items-center justify-center">
                    <span className="text-white text-xs">→</span>
                  </div>
                </Button>

                <Button
                  variant="outline"
                  className="w-full flex items-center justify-between p-4 h-auto bg-gray-50 hover:bg-gray-100 text-gray-900 border"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center">
                      <span className="text-white text-xs font-bold">R</span>
                    </div>
                    <span className="font-medium">Rabby</span>
                  </div>
                  <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center">
                    <span className="text-white text-xs">→</span>
                  </div>
                </Button>

                <Button
                  variant="outline"
                  className="w-full flex items-center justify-between p-4 h-auto bg-gray-50 hover:bg-gray-100 text-gray-900 border"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-blue-400 rounded-lg flex items-center justify-center">
                      <span className="text-white text-xs font-bold">T</span>
                    </div>
                    <span className="font-medium">Trust Wallet</span>
                  </div>
                  <div className="w-6 h-6 bg-blue-400 rounded-full flex items-center justify-center">
                    <span className="text-white text-xs">→</span>
                  </div>
                </Button>

                <Button
                  variant="outline"
                  className="w-full flex items-center justify-between p-4 h-auto bg-gray-50 hover:bg-gray-100 text-gray-900 border"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-green-600 rounded-lg flex items-center justify-center">
                      <span className="text-white text-xs font-bold">F</span>
                    </div>
                    <span className="font-medium">Frame</span>
                  </div>
                  <div className="w-6 h-6 bg-green-600 rounded-full flex items-center justify-center">
                    <span className="text-white text-xs">→</span>
                  </div>
                </Button>
              </div>

              <div className="text-xs text-gray-500 text-center mt-4">
                By connecting a wallet, you agree to our{' '}
                <a href="#" className="text-blue-600 hover:underline">Terms of Service</a>{' '}
                and{' '}
                <a href="#" className="text-blue-600 hover:underline">Privacy Policy</a>.
              </div>
            </>
          ) : (
            <>
              <Button
                onClick={() => setShowEmailAuth(false)}
                variant="ghost"
                className="mb-4 p-0 h-auto text-gray-600 hover:text-gray-900"
              >
                ← Back to wallet options
              </Button>

              <Tabs value={authMode} onValueChange={(value) => setAuthMode(value as 'login' | 'signup')}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="login">Sign In</TabsTrigger>
                  <TabsTrigger value="signup">Sign Up</TabsTrigger>
                </TabsList>
                
                <TabsContent value="login" className="mt-4">
                  <EmailLogin onSuccess={handleEmailSuccess} />
                </TabsContent>
                
                <TabsContent value="signup" className="mt-4">
                  <EmailSignup onSuccess={handleEmailSuccess} />
                </TabsContent>
              </Tabs>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}