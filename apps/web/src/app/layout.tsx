import type { Metadata, Viewport } from "next"
import { Newsreader, Public_Sans, Source_Code_Pro } from "next/font/google"
import { Providers } from "@/components/providers"
import { cn } from "@/lib/utils"
import "./globals.css"

const serif = Newsreader({
  subsets: ["latin"],
  axes: ["opsz"],
  style: ["normal", "italic"],
  variable: "--font-newsreader",
  display: "swap",
})

const sans = Public_Sans({
  subsets: ["latin"],
  variable: "--font-public-sans",
  display: "swap",
})

const mono = Source_Code_Pro({
  subsets: ["latin"],
  variable: "--font-source-code",
  display: "swap",
})

export const metadata: Metadata = {
  metadataBase: new URL(process.env.SITE_URL ?? "http://localhost:3000"),
  title: {
    default: "GreenCircuits · Test an investing idea before you risk money on it",
    template: "%s · GreenCircuits",
  },
  description:
    "A research and strategy-testing project for Indian markets: a daily market brief, company pages that read like reports, and a lab that backtests your ideas with Indian costs.",
}

export const viewport: Viewport = {
  themeColor: "#faf8f4",
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-IN" suppressHydrationWarning className={cn("h-full antialiased", serif.variable, sans.variable, mono.variable)}>
      <body className="min-h-full">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
