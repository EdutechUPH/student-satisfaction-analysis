// src/app/layout.tsx

import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Header } from "@/components/Header"; // <-- ADD THIS IMPORT

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Student Satisfaction Dashboard",
  description: "An analysis and reporting dashboard.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <Header /> {/* <-- ADD THE HEADER COMPONENT HERE */}
        <main>{children}</main>
      </body>
    </html>
  );
}