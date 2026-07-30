import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "智易飞 ABA 词库看板",
  description: "公开访问的 Effiseller ABA 关键词趋势查询工具。",
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
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
