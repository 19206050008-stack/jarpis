import "./globals.css";

export const metadata = {
  title: "Anta",
  description: "Asisten AI penulisan novel",
  icons: {
    icon: "/favicon.png",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
