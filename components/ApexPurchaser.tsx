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
  couponCode: string
}

export default function ApexPurchaser() {
  const [formData, setFormData] = useState<FormData>({
    username: '',
    password: '',
    cardNumber: '',
    expiryMonth: '01',
    expiryYear: '2024',
    cvv: '',
    numberOfAccounts: 1,
    couponCode: ''
  })

  const [status, setStatus] = useState<'ready' | 'processing' | 'stopped' | 'completed' | 'error'>('ready')
  const [logs, setLogs] = useState<string[]>([
    '[10:23:45] System ready. Fill in your details and click Start Purchase to begin.'
  ])
  const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)

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

  const startStatusPolling = () => {
    // Clear any existing polling
    if (pollingInterval) {
      clearInterval(pollingInterval)
    }

    if (!sessionId) {
      console.error('No session ID available for polling')
      return
    }

    const interval = setInterval(async () => {
      try {
        const response = await axios.get(`http://localhost:8000/api/status/${sessionId}`)
        const { status: backendStatus, logs: backendLogs, current_iteration, total_iterations } = response.data
        
        // Update status
        setStatus(backendStatus)
        
        // Add new logs from backend
        if (backendLogs && Array.isArray(backendLogs)) {
          setLogs(prev => {
            // Only add logs that aren't already in our local logs
            const newLogs = backendLogs.filter((log: string) => !prev.includes(log))
            return [...prev, ...newLogs]
          })
        }
        
        // Stop polling if process is completed, stopped, or error
        if (['completed', 'stopped', 'error'].includes(backendStatus)) {
          clearInterval(interval)
          setPollingInterval(null)
          
          if (backendStatus === 'completed') {
            addLog('All purchases completed successfully!')
          } else if (backendStatus === 'stopped') {
            addLog('Purchase process stopped by user.')
          } else if (backendStatus === 'error') {
            addLog('An error occurred during the purchase process.')
          }
        }
        
      } catch (error) {
        console.error('Polling error:', error)
        // Don't add error to logs to avoid spam, just log to console
      }
    }, 1000) // Poll every second for real-time updates

    setPollingInterval(interval)
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
        numberOfAccounts: formData.numberOfAccounts,
        couponCode: formData.couponCode || undefined // Only send if not empty
      }

      addLog('Sending purchase request to backend...')
      
      // Send POST request to backend API
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
        
        // Store session ID for polling
        if (response.data.session_id) {
          setSessionId(response.data.session_id)
          addLog(`Session created: ${response.data.session_id.slice(0, 8)}...`)
        }
        
        // Start polling for status updates
        startStatusPolling()
      }
      
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.response) {
          // Server responded with error status
          addLog(`Error: Server responded with status ${error.response.status}`)
          if (error.response.data?.error) {
            addLog(`Server message: ${error.response.data.error}`)
          }
        } else if (error.request) {
          // Request was made but no response received
          addLog('Error: Unable to connect to server. Please check if the backend is running.')
          addLog('Make sure to start the API server with: python api_server.py')
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
  }

  const handleStop = async () => {
    try {
      if (!sessionId) {
        addLog('Error: No active session to stop')
        return
      }
      
      addLog('Sending stop request to backend...')
      
      const response = await axios.post(`http://localhost:8000/api/stop/${sessionId}`)
      
      if (response.status === 200) {
        addLog('Stop request sent successfully')
        setStatus('stopped')
        
        // Stop polling
        if (pollingInterval) {
          clearInterval(pollingInterval)
          setPollingInterval(null)
        }
        
        // Reset status after a delay
        setTimeout(() => setStatus('ready'), 2000)
      }
    } catch (error) {
      addLog('Error sending stop request to backend')
      console.error('Stop error:', error)
    }
  }

  // Cleanup polling on component unmount
  useEffect(() => {
    return () => {
      if (pollingInterval) {
        clearInterval(pollingInterval)
      }
    }
  }, [pollingInterval])

  const getStatusColor = () => {
    switch (status) {
      case 'ready': return 'bg-green-200 text-green-800'
      case 'processing': return 'bg-yellow-200 text-yellow-800'
      case 'stopped': return 'bg-red-200 text-red-800'
      case 'completed': return 'bg-blue-200 text-blue-800'
      case 'error': return 'bg-red-200 text-red-800'
      default: return 'bg-gray-200 text-gray-800'
    }
  }

  const getStatusText = () => {
    switch (status) {
      case 'ready': return 'Ready to start'
      case 'processing': return 'Processing...'
      case 'stopped': return 'Stopped'
      case 'completed': return 'Completed'
      case 'error': return 'Error'
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
              <div className="form-group">
                <label className="form-label">Coupon Code (Optional):</label>
                <input
                  type="text"
                  name="couponCode"
                  value={formData.couponCode}
                  onChange={handleInputChange}
                  placeholder="Leave empty to use default"
                  className="form-input"
                />
              </div>
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
