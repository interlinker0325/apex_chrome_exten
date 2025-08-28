'use client'

import { useState, useEffect } from 'react'
import axios from 'axios'
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
    addLog('Connecting to server...')

    try {
      // Prepare the data to send to backend
      const purchaseData = {
        username: formData.username,
        password: formData.password,
        cardNumber: formData.cardNumber,
        cvv: formData.cvv,
        expiryMonth: formData.expiryMonth,
        expiryYear: formData.expiryYear,
        numberOfAccounts: formData.numberOfAccounts
      }

      addLog('Sending purchase request to backend...')
      
      // Send POST request to your backend
      // Replace 'http://localhost:8000/api/purchase' with your actual backend URL
      const response = await axios.post('http://localhost:8000/api/purchase', purchaseData, {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 30000 // 30 second timeout
      })

      if (response.status === 200) {
        addLog('Connected to server successfully')
        addLog('Starting automation with provided settings...')
        addLog('Starting APEX automation...')
        
        // Handle successful response
        if (response.data.message) {
          addLog(response.data.message)
        }
        
        // If your backend returns logs, you can process them here
        if (response.data.logs && Array.isArray(response.data.logs)) {
          response.data.logs.forEach((log: string) => {
            addLog(log)
          })
        }
        
        addLog('Purchase request initiated successfully!')
      }
      
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.response) {
          // Server responded with error status
          addLog(`Error: Server responded with status ${error.response.status}`)
          if (error.response.data?.message) {
            addLog(`Server message: ${error.response.data.message}`)
          }
        } else if (error.request) {
          // Request was made but no response received
          addLog('Error: Unable to connect to server. Please check if the backend is running.')
        } else {
          // Something else happened
          addLog(`Error: ${error.message}`)
        }
      } else {
        addLog(`Unexpected error: ${error}`)
      }
      
      setStatus('ready')
      return
    }

    // Note: In a real implementation, the backend should handle the purchase process
    // and send real-time updates via WebSocket or Server-Sent Events
    // For now, we'll keep the status as 'processing' until the backend completes
    
    // Optional: Start polling for status updates
    startStatusPolling()
  }

  // Optional: Function to poll backend for status updates
  const startStatusPolling = () => {
    const pollInterval = setInterval(async () => {
      try {
        const statusResponse = await axios.get('http://localhost:8000/api/status')
        
        if (statusResponse.data.status === 'completed') {
          addLog('All purchases completed successfully!')
          setStatus('ready')
          clearInterval(pollInterval)
        } else if (statusResponse.data.status === 'error') {
          addLog(`Error: ${statusResponse.data.message}`)
          setStatus('ready')
          clearInterval(pollInterval)
        } else if (statusResponse.data.logs) {
          // Add new logs from backend
          statusResponse.data.logs.forEach((log: string) => {
            addLog(log)
          })
        }
      } catch (error) {
        // Silently handle polling errors to avoid spam
        console.error('Polling error:', error)
      }
    }, 2000) // Poll every 2 seconds

    // Stop polling after 5 minutes to prevent infinite polling
    setTimeout(() => {
      clearInterval(pollInterval)
      if (status === 'processing') {
        addLog('Status polling timeout. Please check backend manually.')
        setStatus('ready')
      }
    }, 300000) // 5 minutes
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
