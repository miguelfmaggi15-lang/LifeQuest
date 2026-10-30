import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Life Quest — jogo multiplayer",
  description: "Jogue o Jogo da Vida e o Banco Imobiliário online com seus amigos.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className="antialiased">{children}</body>
    </html>
  );
}
