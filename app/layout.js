import { Fira_Code, Space_Grotesk } from "next/font/google";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-sans",
});

const firaCode = Fira_Code({
  subsets: ["latin"],
  variable: "--font-mono",
});

export const metadata = {
  title: "Agentic Portfolio",
  description: "Next.js portfolio chat app with integrated RAG backend",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={`${spaceGrotesk.variable} ${firaCode.variable}`}>
        {children}
      </body>
    </html>
  );
}
