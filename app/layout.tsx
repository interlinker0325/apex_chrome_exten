import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'APEX Account Purchaser',
  description: 'APEX Account Purchaser Frontend',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
