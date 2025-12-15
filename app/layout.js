import './globals.css'

export const metadata = {
  title: 'World Cup Pick’em 2026',
  description: 'Friends & family World Cup Pick’em'
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
