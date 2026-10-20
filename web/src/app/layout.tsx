import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Link from "next/link";
import { currentUser, LOCAL_USER } from "@/lib/server/auth";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Elotake",
  description: "Você grava. A Elotake edita.",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await currentUser();
  const loggedIn = user !== null && user.id !== LOCAL_USER.id;
  return (
    <html lang="pt-BR">
      <body className={`${inter.variable} antialiased min-h-screen`}>
        <header className="sticky top-0 z-20 border-b border-line/60 bg-ink/80 backdrop-blur">
          <nav className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
            <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
              <span className="relative inline-flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rec opacity-60" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-rec" />
              </span>
              elotake
            </Link>
            {user && (
              <div className="flex items-center gap-1 text-sm text-muted">
                <Link href="/estilo" className="rounded-md px-3 py-1.5 hover:bg-panel hover:text-fg">
                  Meu estilo
                </Link>
                <Link href="/projetos" className="rounded-md px-3 py-1.5 hover:bg-panel hover:text-fg">
                  Projetos
                </Link>
                <Link
                  href="/novo"
                  className="ml-2 rounded-md bg-rec px-3 py-1.5 font-medium text-white hover:brightness-110"
                >
                  Novo vídeo
                </Link>
                {loggedIn && (
                  <form action="/api/sair" method="post" className="ml-2">
                    <button
                      type="submit"
                      title={user.email}
                      className="rounded-md px-3 py-1.5 hover:bg-panel hover:text-fg"
                    >
                      Sair
                    </button>
                  </form>
                )}
              </div>
            )}
          </nav>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-10">{children}</main>
      </body>
    </html>
  );
}
