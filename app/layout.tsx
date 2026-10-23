import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import { JetBrains_Mono, Lilita_One, Rubik, Rubik_Wet_Paint } from "next/font/google";
import "./globals.css";

const display = Lilita_One({ variable: "--display", weight: "400", subsets: ["latin"] });
const sans = Rubik({ variable: "--sans", subsets: ["latin"] });
const mono = JetBrains_Mono({ variable: "--mono", subsets: ["latin"] });
const brand = Rubik_Wet_Paint({ variable: "--brand", weight: "400", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Boltergeist",
  description: "Haunt the market on Strike's live prices. Pick a ghost, dig your graves long or short, and bank when lightning strikes.",
};

export const viewport: Viewport = { themeColor: "#06080b" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} ${mono.variable} ${brand.variable}`}>
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
