import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";
import Providers from "./providers";
import ThemeScript from "@/components/shared/ThemeScript";

export const metadata: Metadata = {
  title: "Mahaly — Local brands. Real stories. All in one place.",
  description:
    "Mahaly is a premium marketplace where independent local brands sell their products, connecting customers directly with creators.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <ThemeScript />
      </head>
      <body>
        <Providers>{children}</Providers>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
