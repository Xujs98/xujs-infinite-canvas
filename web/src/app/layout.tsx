import type { Metadata } from "next";
import { AppProviders } from "@/components/app-providers";
import "antd/dist/reset.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "无限画布",
  description: "一个无限画布创作工具",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning className="font-sans">
      <body
        className="bg-background text-foreground antialiased"
        style={{
          fontFamily:
            '"SF Pro Display","SF Pro Text","PingFang SC","Microsoft YaHei","Helvetica Neue",sans-serif',
        }}
      >
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var s=JSON.parse(localStorage.getItem("infinite-canvas:theme_store")||"{}");var t=s.state&&s.state.theme==="light"?"light":"dark";document.documentElement.classList.toggle("dark",t==="dark");document.documentElement.style.colorScheme=t}catch(e){}`,
          }}
        />
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
