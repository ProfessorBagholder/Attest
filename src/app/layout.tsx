import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Attest — Verified trading performance", template: "%s · Attest" },
  description: "Broker-verified trading journal, analytics and trader verification. Trades import straight from Wealthsimple through SnapTrade; nothing can be edited or cherry-picked.",
};

const themeScript = `(function(){try{var t=localStorage.getItem("attest-theme");if(t==="dark"||t==="light"){document.documentElement.setAttribute("data-theme",t);}}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
