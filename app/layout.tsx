import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Local — Local brands. Real stories. All in one place.",
  description:
    "Local is a premium marketplace where independent local brands sell their products, connecting customers directly with creators.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
