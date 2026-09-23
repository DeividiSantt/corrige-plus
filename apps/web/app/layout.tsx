import type { Metadata } from "next";
import { productConfig } from "@corrige-plus/config";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: productConfig.name,
    template: `%s · ${productConfig.name}`,
  },
  description: productConfig.description,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>
        {children}
        <Toaster richColors closeButton position="top-right" />
      </body>
    </html>
  );
}
