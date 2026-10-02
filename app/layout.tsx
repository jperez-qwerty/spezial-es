import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const viewport: Viewport = {
  themeColor: "#000000",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export const metadata: Metadata = {
  title: "SPEZIAL · El reto diario de singularidad",
  description: "5 preguntas. 25 segundos. No busques la respuesta obvia. Sé el diferente.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Spezial",
  },
  icons: {
    icon: "/spezial_appicon.png",
    apple: "/spezial_appicon.png",
  },
  openGraph: {
    title: "SPEZIAL · The Special One",
    description: "El juego diario donde lo común no puntúa.",
    type: "website",
    locale: "es_ES",
    siteName: "Spezial",
    images: [
      {
        url: "/spezial_appicon.png",
        width: 512,
        height: 512,
        alt: "Spezial Logo",
      },
    ],
  },
  twitter: {
    card: "summary",
    title: "SPEZIAL · The Special One",
    description: "5 preguntas. 25 segundos. No busques la respuesta obvia. Sé el diferente.",
    images: ["/spezial_appicon.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className="dark bg-black">
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      </head>
      <body className={`${inter.className} bg-black min-h-screen text-zinc-100 antialiased`}>
        {children}
      </body>
    </html>
  );
}