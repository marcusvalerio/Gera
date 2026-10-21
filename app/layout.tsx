import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Gera — Ordens do Dia",
  description: "Gestão de ordens de serviço, atividades e ocorrências.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}
