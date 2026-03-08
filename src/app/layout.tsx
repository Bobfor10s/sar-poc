import "./globals.css";
import "leaflet/dist/leaflet.css";
import type { Metadata } from "next";
import Nav from "@/components/Nav";
import PageViewLogger from "@/components/PageViewLogger";
import UserBar from "@/components/UserBar";

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
        <PageViewLogger />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: "100vh" }}>
          <UserBar />
          <div style={{ flex: 1, overflowY: "auto" }}>{children}</div>
        </div>
      </body>
    </html>
  );
}
