# APEX Account Purchaser Frontend

A Next.js frontend application for the APEX Account Purchaser system.

## Features

- ✅ Login Details form (Username & Password)
- ✅ Payment Details form (Card Number, Expiry Date, CVV)
- ✅ Settings (Number of Accounts)
- ✅ Real-time Activity Log
- ✅ Status indicator (Ready/Processing/Stopped)
- ❌ Coupon Code field (removed as requested)

## Setup Instructions

1. Install dependencies:
```bash
npm install
```

2. Run the development server:
```bash
npm run dev
```

3. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

```
├── app/
│   ├── globals.css          # Global styles and Tailwind imports
│   ├── layout.tsx           # Root layout component
│   └── page.tsx             # Main page
├── components/
│   ├── ApexPurchaser.tsx    # Main purchaser component
│   └── ActivityLog.tsx      # Activity log component
├── package.json
├── tailwind.config.js
├── tsconfig.json
└── next.config.js
```

## Styling

The application uses:
- **Tailwind CSS** for utility-first styling
- **Custom CSS classes** for component-specific styles
- **Responsive design** that works on desktop and mobile

## Backend Integration

The Activity Log component is designed to receive real-time updates from your backend. You can modify the `addLog` function in `ApexPurchaser.tsx` to integrate with your backend WebSocket or API endpoints.

## Build for Production

```bash
npm run build
npm start
```
