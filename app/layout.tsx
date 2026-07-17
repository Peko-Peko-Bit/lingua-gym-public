import type { Metadata } from 'next'
import './globals.css'
import ServiceWorkerRegistrar from '@/components/ServiceWorkerRegistrar'

export const metadata: Metadata = {
  title: 'LinguaGym',
  description: 'A translation practice and checking tool',
  manifest: '/manifest.json',
  icons: {
    icon: '/linguagym_icon.svg',
    apple: '/linguagym_icon.svg',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'LinguaGym',
  },
  formatDetection: {
    telephone: false,
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // suppressHydrationWarning: the head script below intentionally sets
  // data-theme/style on <html> before hydration to prevent theme flash
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Apply theme before first paint to prevent flash */}
        <script dangerouslySetInnerHTML={{ __html: `
(function(){
  var map={es:"espanol",en:"english",ja:"japonais",ko:"hanguk",ca:"catala"};
  var lang=localStorage.getItem("sourceLang")||"es";
  document.documentElement.setAttribute("data-theme",map[lang]||"default");
  var dark=window.matchMedia("(prefers-color-scheme: dark)").matches;
  document.documentElement.style.background=dark?"#09090b":"#ffffff";
})();
        `.trim() }} />
      </head>
      <body>
        <ServiceWorkerRegistrar />
        {children}
      </body>
    </html>
  )
}
