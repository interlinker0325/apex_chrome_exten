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
  numberOfAccounts: number | string
}

export default function ApexPurchaser() {
  const [formData, setFormData] = useState<FormData>({
    username: '',
    password: '',
    cardNumber: '',
    expiryMonth: '1',
    expiryYear: '2024',
    cvv: '',
    numberOfAccounts: 1
  })

  const [status, setStatus] = useState<'ready' | 'processing' | 'stopped' | 'completed' | 'error'>('ready')
  const [logs, setLogs] = useState<string[]>([
    '[10:23:45] System ready. Fill in your details and click Start Purchase to begin.'
  ])
  const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    
    if (name === 'numberOfAccounts') {
      // Handle number of accounts input more gracefully
      const numValue = parseInt(value)
      if (value === '' || isNaN(numValue)) {
        // Allow empty input while typing
        setFormData(prev => ({
          ...prev,
          [name]: value === '' ? '' : 1
        }))
      } else {
        // Valid number entered
        setFormData(prev => ({
          ...prev,
          [name]: Math.max(1, Math.min(10, numValue)) // Clamp between 1-10
        }))
      }
    } else {
      // Handle other fields normally
      setFormData(prev => ({
        ...prev,
        [name]: value
      }))
    }
  }

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false })
    setLogs(prev => [...prev, `[${timestamp}] ${message}`])
  }

  const startStatusPolling = (sessionIdToUse?: string) => {
    // Clear any existing polling
    if (pollingInterval) {
      clearInterval(pollingInterval)
    }

    const currentSessionId = sessionIdToUse || sessionId
    if (!currentSessionId) {
      console.error('No session ID available for polling')
      return
    }

    // Set a timeout to stop polling after 2 minutes (shorter for login issues)
    const timeoutId = setTimeout(async () => {
      if (pollingInterval) {
        clearInterval(pollingInterval)
        setPollingInterval(null)
        
        // Do one final status check before giving up
        try {
          console.log(`[DEBUG] Timeout reached, doing final status check for session ${currentSessionId}`)
          const finalResponse = await axios.get(`http://localhost:8000/api/status/${currentSessionId}`)
          const { status: finalStatus, logs: finalLogs } = finalResponse.data
          
          console.log(`[DEBUG] Final status check result: ${finalStatus}`)
          setStatus(finalStatus)
          
          if (finalLogs && Array.isArray(finalLogs)) {
            setLogs(finalLogs)
          }
          
          if (finalStatus === 'error') {
            addLog('❌ Process failed - check logs for details')
          } else if (finalStatus === 'completed') {
            addLog('✅ Process completed successfully')
          } else {
            addLog('⏰ Polling timeout - assuming process failed')
            setStatus('error')
          }
        } catch (error) {
          console.log(`[DEBUG] Final status check failed: ${error}`)
          addLog('⏰ Polling timeout - assuming process failed')
          setStatus('error')
        }
        
        setTimeout(() => {
          setStatus('ready')
          setSessionId(null)
          addLog('🔄 System ready for new purchase')
        }, 3000)
      }
    }, 1 * 60 * 1000) // 1 minute

    let pollCount = 0
    const interval = setInterval(async () => {
      try {
        pollCount++
        console.log(`[DEBUG] Polling attempt ${pollCount} for session ${currentSessionId}`)
        addLog(`🔍 Polling attempt ${pollCount}...`)
        
        const response = await axios.get(`http://localhost:8000/api/status/${currentSessionId}`)
        const { status: backendStatus, logs: backendLogs, current_iteration, total_iterations } = response.data
        
        console.log(`[DEBUG] Frontend received status: ${backendStatus} (poll ${pollCount})`)
        addLog(`📊 Status: ${backendStatus} (poll ${pollCount})`)
        
        // Update status
        setStatus(backendStatus)
        
        // Replace logs with backend logs to ensure sync
        if (backendLogs && Array.isArray(backendLogs)) {
          console.log(`[DEBUG] Updating logs with ${backendLogs.length} entries`)
          setLogs(backendLogs)
        }
        
        // Handle error status immediately - don't wait
        if (backendStatus === 'error') {
          console.log(`[DEBUG] Error status received immediately: ${backendStatus}`)
          clearInterval(interval)
          clearTimeout(timeoutId)
          setPollingInterval(null)
          
          // Set error status immediately
          setStatus('error')
          
          // Force update logs immediately
          if (backendLogs && Array.isArray(backendLogs)) {
            setLogs(backendLogs)
          }
          
          addLog('❌ Process failed - check logs for details')
          
          // Reset UI state quickly for errors
          setTimeout(() => {
            setStatus('ready')
            setSessionId(null)
            addLog('🔄 System ready for new purchase')
          }, 2000) // Shorter delay for errors
        }
        // Handle other final statuses
        else if (['completed', 'stopped'].includes(backendStatus)) {
          console.log(`[DEBUG] Final status received: ${backendStatus}`)
          clearInterval(interval)
          clearTimeout(timeoutId)
          setPollingInterval(null)
          
          // Set the final status immediately
          setStatus(backendStatus)
          
          // Force update logs one more time to ensure we have the latest
          if (backendLogs && Array.isArray(backendLogs)) {
            console.log(`[DEBUG] Final logs update with ${backendLogs.length} entries`)
            setLogs(backendLogs)
          }
          
          // Add specific final message based on status
          if (backendStatus === 'stopped') {
            addLog('🛑 Process stopped by user')
          } else if (backendStatus === 'completed') {
            addLog('✅ Process completed successfully')
          }
          
          // Reset UI state after showing final status
          setTimeout(() => {
            console.log(`[DEBUG] Resetting UI to ready state`)
            setStatus('ready')
            setSessionId(null)
            addLog('🔄 System ready for new purchase')
          }, 3000) // Show final status for 3 seconds before resetting
        }
        // If status is still processing, continue polling
        else if (backendStatus === 'processing') {
          console.log(`[DEBUG] Still processing... (poll ${pollCount})`)
        }
        
      } catch (error) {
        console.error('Polling error:', error)
        // Add error to logs for debugging
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        addLog(`Error checking status: ${errorMessage}`)
        
        // For other errors, try one more time after a delay
        console.log(`[DEBUG] Polling error on attempt ${pollCount}, will retry...`)
        if (pollCount < 3) {
          // Don't give up immediately, keep trying
          return
        }
        
        // If we can't reach the backend, assume it's failed (likely login issue)
        if (error instanceof Error && (error.message.includes('Network Error') || error.message.includes('ECONNREFUSED'))) {
          addLog('❌ Backend connection lost - likely login failure')
          clearInterval(interval)
          clearTimeout(timeoutId)
          setPollingInterval(null)
          setStatus('error')
          setTimeout(() => {
            setStatus('ready')
            setSessionId(null)
            addLog('🔄 System ready for new purchase')
          }, 3000)
        }
      }
    }, 500) // Poll every 500ms for faster error detection

    setPollingInterval(interval)
  }

  const handleStartPurchase = async () => {
    if (!formData.username || !formData.password || !formData.cardNumber || !formData.cvv) {
      addLog('Error: Please fill in all required fields.')
      return
    }
    
    // Validate number of accounts
    const accountsNum = typeof formData.numberOfAccounts === 'string' ? parseInt(formData.numberOfAccounts) : formData.numberOfAccounts
    if (isNaN(accountsNum) || accountsNum < 1 || accountsNum > 10) {
      addLog('Error: Number of accounts must be between 1 and 10.')
      return
    }

    setStatus('processing')
    setLogs(['[System] Starting new purchase process...'])
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
        numberOfAccounts: accountsNum
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
          
          // Start polling for status updates with the session ID
          startStatusPolling(response.data.session_id)
        }
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

  const handleManualStatusCheck = async () => {
    if (!sessionId) {
      addLog('Error: No active session to check')
      return
    }
    
    try {
      addLog('🔍 Manual status check...')
      const response = await axios.get(`http://localhost:8000/api/status/${sessionId}`)
      const { status: backendStatus, logs: backendLogs } = response.data
      
      console.log(`[DEBUG] Manual status check result: ${backendStatus}`)
      addLog(`📊 Manual check - Status: ${backendStatus}`)
      
      setStatus(backendStatus)
      if (backendLogs && Array.isArray(backendLogs)) {
        setLogs(backendLogs)
      }
      
      if (['completed', 'stopped', 'error'].includes(backendStatus)) {
        addLog('✅ Process finished - UI will reset shortly')
        setTimeout(() => {
          setStatus('ready')
          setSessionId(null)
          addLog('🔄 System ready for new purchase')
        }, 2000)
      }
    } catch (error) {
      addLog('❌ Manual status check failed')
      console.error('Manual status check error:', error)
    }
  }

  const handleStop = async () => {
    try {
      if (!sessionId) {
        addLog('Error: No active session to stop')
        return
      }
      
      addLog('🛑 Sending stop request to backend...')
      
      const response = await axios.post(`http://localhost:8000/api/stop/${sessionId}`)
      
      if (response.status === 200) {
        addLog('✅ Stop request sent successfully')
        
        // Stop polling immediately
        if (pollingInterval) {
          clearInterval(pollingInterval)
          setPollingInterval(null)
        }
        
        // Set status to stopped immediately
        setStatus('stopped')
        
        // Poll one more time to get final status from backend
        setTimeout(async () => {
          try {
            const statusResponse = await axios.get(`http://localhost:8000/api/status/${sessionId}`)
            const { status: finalStatus, logs: finalLogs } = statusResponse.data
            
            setStatus(finalStatus)
            if (finalLogs && Array.isArray(finalLogs)) {
              setLogs(finalLogs)
            }
            
            // Reset to ready after showing final status
            setTimeout(() => {
              setStatus('ready')
              setSessionId(null)
              addLog('🔄 System ready for new purchase')
            }, 2000)
          } catch (error) {
            console.error('Error getting final status:', error)
            setStatus('ready')
            setSessionId(null)
            addLog('🔄 System ready for new purchase')
          }
        }, 1000)
      }
    } catch (error) {
      addLog('❌ Error sending stop request to backend')
      console.error('Stop error:', error)
      // Reset UI state even if stop request fails
      setStatus('ready')
      setSessionId(null)
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
                    const month = (i + 1).toString()
                    const displayMonth = month.padStart(2, '0')
                    return (
                      <option key={month} value={month}>
                        {displayMonth}
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
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-center gap-4 mb-8">
            <button
              onClick={handleStartPurchase}
              disabled={status === 'processing'}
              className={`btn btn-primary ${status === 'processing' ? 'opacity-50 cursor-not-allowed' : 'hover:bg-blue-600'}`}
            >
              {status === 'processing' ? 'Processing...' : 'Start Purchase'}
            </button>
            <button
              onClick={handleStop}
              disabled={status !== 'processing'}
              className={`btn btn-secondary ${status !== 'processing' ? 'opacity-50 cursor-not-allowed' : 'hover:bg-red-600'}`}
            >
              Stop
            </button>
            {sessionId && (
              <button
                onClick={handleManualStatusCheck}
                className="btn btn-tertiary hover:bg-gray-600"
              >
                Check Status
              </button>
            )}
          </div>

          {/* Activity Log */}
          <ActivityLog logs={logs} />
        </div>
      </div>
    </div>
  )
}
