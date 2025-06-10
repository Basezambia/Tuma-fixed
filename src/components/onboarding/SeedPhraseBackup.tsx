import { useState } from 'react'
import { Eye, EyeOff, Copy, Download } from 'lucide-react'
import { toast } from 'sonner'

export const SeedPhraseBackup = ({ seedPhrase, onComplete }: { seedPhrase: string, onComplete: () => void }) => {
  const [showSeedPhrase, setShowSeedPhrase] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  
  const words = seedPhrase.split(' ')
  
  const copySeedPhrase = () => {
    navigator.clipboard.writeText(seedPhrase)
    toast.success('Seed phrase copied to clipboard')
  }
  
  const downloadSeedPhrase = () => {
    const element = document.createElement('a')
    const file = new Blob([seedPhrase], { type: 'text/plain' })
    element.href = URL.createObjectURL(file)
    element.download = 'wallet-seed-phrase.txt'
    document.body.appendChild(element)
    element.click()
    document.body.removeChild(element)
    toast.success('Seed phrase downloaded')
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold mb-2">Backup Your Seed Phrase</h2>
        <p className="text-gray-600">
          This is your wallet's recovery phrase. Store it safely - you'll need it to recover your wallet.
        </p>
      </div>
      
      <div className="bg-red-50 border border-red-200 p-4 rounded-lg">
        <h3 className="font-semibold text-red-800 mb-2">⚠️ Important Security Notice</h3>
        <ul className="text-sm text-red-700 space-y-1">
          <li>• Never share your seed phrase with anyone</li>
          <li>• Store it in a secure location offline</li>
          <li>• Anyone with this phrase can access your wallet</li>
        </ul>
      </div>
      
      <div className="border rounded-lg p-4">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-semibold">Your Seed Phrase</h3>
          <div className="flex space-x-2">
            <button
              onClick={() => setShowSeedPhrase(!showSeedPhrase)}
              className="p-2 text-gray-500 hover:text-gray-700"
            >
              {showSeedPhrase ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
            <button
              onClick={copySeedPhrase}
              className="p-2 text-gray-500 hover:text-gray-700"
            >
              <Copy size={20} />
            </button>
            <button
              onClick={downloadSeedPhrase}
              className="p-2 text-gray-500 hover:text-gray-700"
            >
              <Download size={20} />
            </button>
          </div>
        </div>
        
        <div className="grid grid-cols-3 gap-2">
          {words.map((word, index) => (
            <div key={index} className="bg-gray-100 p-2 rounded text-center">
              <span className="text-xs text-gray-500">{index + 1}</span>
              <div className="font-mono">
                {showSeedPhrase ? word : '•••••'}
              </div>
            </div>
          ))}
        </div>
      </div>
      
      <div className="space-y-4">
        <label className="flex items-center space-x-2">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            className="rounded"
          />
          <span className="text-sm">
            I have safely stored my seed phrase and understand that losing it means losing access to my wallet.
          </span>
        </label>
        
        <button
          onClick={onComplete}
          disabled={!confirmed}
          className="w-full bg-green-600 text-white p-3 rounded-lg hover:bg-green-700 disabled:opacity-50"
        >
          Complete Setup
        </button>
      </div>
    </div>
  )
}