import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Acorn Medical",
  description: "Acorn Medical’s shared inpatient shift scheduler.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
