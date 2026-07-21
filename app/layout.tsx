import type { Metadata } from "next";
import "./globals.css";
import Providers from "./providers";

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
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
