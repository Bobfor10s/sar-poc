import "./globals.css";
import type { Metadata } from "next";
import Nav from "@/components/Nav";

export const metadata: Metadata = {
  title: "SAR POC",
  description: "Search and Rescue Proof of Concept",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body style={{ display: "flex", minHeight: "100vh", margin: 0 }}>
        <Nav />
        <div style={{ flex: 1, overflowY: "auto" }}>{children}</div>
      </body>
    </html>
  );
}
