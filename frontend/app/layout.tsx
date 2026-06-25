import "./globals.css";

export const metadata = {
  title: "Jarpis",
  description: "Asisten AI penulisan novel",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
