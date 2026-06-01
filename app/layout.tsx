import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DOSSIERES Intake",
  description: "MVP GUI para generar project_input_v2 y enviarlo a Make.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
