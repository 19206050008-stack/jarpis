import Script from "next/script";
import "./globals.css";

export const metadata = {
  title: "Jarpis",
  description: "Asisten AI penulisan novel",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body>
        {children}
        <Script src="https://js.puter.com/v2/" strategy="afterInteractive" />
      </body>
    </html>
  );
}
