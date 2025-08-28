'use client'

import { useEffect, useRef } from 'react'

interface ActivityLogProps {
  logs: string[]
}

export default function ActivityLog({ logs }: ActivityLogProps) {
  const logEndRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when new logs are added
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  return (
    <div className="mb-6">
      <h2 className="section-title">Activity Log</h2>
      <div className="activity-log">
        {logs.map((log, index) => (
          <div key={index} className="mb-1">
            {log}
          </div>
        ))}
        <div ref={logEndRef} />
      </div>
    </div>
  )
}
