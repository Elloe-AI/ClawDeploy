import "./globals.css";
import type { ReactNode } from "react";

export const metadata = {
  title: "ClawDeploy",
  description: "ClawDeploy control plane"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="container">
          <header className="header">
            <div className="brand">ClawDeploy</div>
            <nav className="nav">
              <a href="/instances">Instances</a>
              <a href="/billing">Billing</a>
              <a href="/logout" data-action="logout">Logout</a>
            </nav>
          </header>
          <main>{children}</main>
        </div>
      </body>
    </html>
  );
}
