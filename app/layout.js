import "./globals.css";

export const metadata = {
  title: "Agentic Portfolio",
  description: "Next.js portfolio chat app with integrated RAG backend",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
