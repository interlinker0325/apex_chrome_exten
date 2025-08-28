'use client'

import { useState, useEffect } from 'react'
import ActivityLog from './ActivityLog'

interface FormData {
  username: string
  password: string
  cardNumber: string
  expiryMonth: string
  expiryYear: string
  cvv: string
  numberOfAccounts: number
}

export default function ApexPurchaser() {
  const [formData, setFormData] = useState<FormData>({
    username: '',
    password: '',
    cardNumber: '',
    expiryMonth: '01',
    expiryYear: '2024',
    cvv: '',
    numberOfAccounts: 1
  })

  const [status, setStatus] = useState<'ready' | 'processing' | 'stopped'>('ready')
  const [logs, setLogs] = useState<string[]>([
    '[10:23:45] System ready. Fill in your details and click Start Purchase to begin.'
  ])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: name === 'numberOfAccounts' ? parseInt(value) || 1 : value
    }))
  }

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false })
    setLogs(prev => [...prev, `[${timestamp}] ${message}`])
  }

  const handleStartPurchase = async () => {
    if (!formData.username || !formData.password || !formData.cardNumber || !formData.cvv) {
      addLog('Error: Please fill in all required fields.')
      return
    }

    setStatus('processing')
    addLog('Connected to server')
    addLog('Starting automation with provided settings...')
    addLog('Starting APEX automation...')
    addLog('Cookie consent handled')
    addLog('Logging in...')
    
    // Simulate purchase process
    setTimeout(() => {
      addLog(`Starting purchase loop for ${formData.numberOfAccounts} accounts...`)
    }, 1000)

    setTimeout(() => {
      addLog('Processing account 1/3')
    }, 2000)

    setTimeout(() => {
      addLog('Account 1 purchased successfully!')
    }, 3500)

    setTimeout(() => {
      addLog('Processing account 2/3')
    }, 4000)

    setTimeout(() => {
      addLog('Account 2 purchased successfully!')
    }, 5500)

    setTimeout(() => {
      addLog('Processing account 3/3')
    }, 6000)

    setTimeout(() => {
      addLog('Account 3 purchased successfully!')
      addLog('All purchases completed successfully!')
      setStatus('ready')
    }, 7500)
  }

  const handleStop = () => {
    setStatus('stopped')
    addLog('Purchase process stopped by user.')
    setTimeout(() => setStatus('ready'), 1000)
  }

  const getStatusColor = () => {
    switch (status) {
      case 'ready': return 'bg-green-200 text-green-800'
      case 'processing': return 'bg-yellow-200 text-yellow-800'
      case 'stopped': return 'bg-red-200 text-red-800'
      default: return 'bg-gray-200 text-gray-800'
    }
  }

  const getStatusText = () => {
    switch (status) {
      case 'ready': return 'Ready to start'
      case 'processing': return 'Processing...'
      case 'stopped': return 'Stopped'
      default: return 'Ready to start'
    }
  }

  // Generate year options
  const currentYear = new Date().getFullYear()
  const years = Array.from({ length: 20 }, (_, i) => currentYear + i)

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg p-8">
          {/* Header */}
          <h1 className="text-3xl font-bold text-center text-gray-800 mb-6">
            APEX Account Purchaser
          </h1>

          {/* Status Bar */}
          <div className={`text-center py-3 px-4 rounded-md mb-6 ${getStatusColor()}`}>
            {getStatusText()}
          </div>

          {/* Login Details Section */}
          <div className="mb-8">
            <h2 className="section-title">Login Details</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="form-group">
                <label className="form-label">APEX Username:</label>
                <input
                  type="text"
                  name="username"
                  value={formData.username}
                  onChange={handleInputChange}
                  placeholder="your_username"
                  className="form-input"
                />
              </div>
              <div className="form-group">
                <label className="form-label">APEX Password:</label>
                <input
                  type="password"
                  name="password"
                  value={formData.password}
                  onChange={handleInputChange}
                  placeholder="••••••••"
                  className="form-input"
                />
              </div>
            </div>
          </div>

          {/* Payment Details Section */}
          <div className="mb-8">
            <h2 className="section-title">Payment Details</h2>
            <div className="mb-6">
              <label className="form-label">Card Number:</label>
              <input
                type="text"
                name="cardNumber"
                value={formData.cardNumber}
                onChange={handleInputChange}
                placeholder="1234567890123456"
                className="form-input"
                maxLength={16}
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="form-group">
                <label className="form-label">Expiry Month:</label>
                <select
                  name="expiryMonth"
                  value={formData.expiryMonth}
                  onChange={handleInputChange}
                  className="form-select"
                >
                  {Array.from({ length: 12 }, (_, i) => {
                    const month = (i + 1).toString().padStart(2, '0')
                    return (
                      <option key={month} value={month}>
                        {month}
                      </option>
                    )
                  })}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Expiry Year:</label>
                <select
                  name="expiryYear"
                  value={formData.expiryYear}
                  onChange={handleInputChange}
                  className="form-select"
                >
                  {years.map(year => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">CVV:</label>
                <input
                  type="text"
                  name="cvv"
                  value={formData.cvv}
                  onChange={handleInputChange}
                  placeholder="123"
                  className="form-input"
                  maxLength={4}
                />
              </div>
            </div>
          </div>

          {/* Settings Section */}
          <div className="mb-8">
            <h2 className="section-title">Settings</h2>
            <div className="form-group">
              <label className="form-label">Number of Accounts:</label>
              <input
                type="number"
                name="numberOfAccounts"
                value={formData.numberOfAccounts}
                onChange={handleInputChange}
                min="1"
                max="10"
                className="form-input w-32"
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-center gap-4 mb-8">
            <button
              onClick={handleStartPurchase}
              disabled={status === 'processing'}
              className={`btn btn-primary ${status === 'processing' ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              Start Purchase
            </button>
            <button
              onClick={handleStop}
              disabled={status !== 'processing'}
              className={`btn btn-secondary ${status !== 'processing' ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              Stop
            </button>
          </div>

          {/* Activity Log */}
          <ActivityLog logs={logs} />
        </div>
      </div>
    </div>
  )
}
