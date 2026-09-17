import type { Metadata, Viewport } from 'next'
import { Plus_Jakarta_Sans, Sora } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { Providers } from '@/components/providers'
import { BRAND_LEGAL, BRAND_PRODUCT } from '@/lib/brand'
import './globals.css'

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-sans',
})

const sora = Sora({
  subsets: ['latin'],
  variable: '--font-display',
})

export const metadata: Metadata = {
  title: BRAND_PRODUCT,
  description: `B2B tour booking portal for overseas travel agents — ${BRAND_LEGAL}.`,
}

export const viewport: Viewport = {
  themeColor: '#f2f7f6',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`light ${jakarta.variable} ${sora.variable}`}>
      <body className={`${jakarta.className} min-h-dvh text-teal-950 antialiased`}>
        <Providers>{children}</Providers>
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
