"use client";

import { useEffect, useState } from "react";
import { Button, ErrorNote, Spinner } from "@/components/ui";
import { browserClient } from "@/lib/supabase/browser";
import { supabaseEnabled } from "@/lib/supabase/config";

function callbackUrl() {
  const next = new URLSearchParams(window.location.search).get("next");
  const url = new URL("/auth/callback", window.location.origin);
  if (next?.startsWith("/")) url.searchParams.set("next", next);
  return url.toString();
}

export default function EntrarPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<"email" | "google" | null>(null);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("erro") === "link") {
      setError("Esse link expirou ou já foi usado. Peça um novo.");
    }
  }, []);

  if (!supabaseEnabled()) {
    return (
      <div className="mx-auto mt-16 max-w-sm space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight">Modo local</h1>
        <p className="text-muted">Sem Supabase configurado, o app roda sem login.</p>
      </div>
    );
  }

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    setLoading("email");
    setError(null);
    const { error } = await browserClient().auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: callbackUrl() },
    });
    setLoading(null);
    if (error) setError("Não consegui enviar o link. Confira o e-mail e tente de novo.");
    else setSent(true);
  }

  async function google() {
    setLoading("google");
    setError(null);
    const { error } = await browserClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callbackUrl() },
    });
    if (error) {
      setError("Não consegui abrir o login do Google.");
      setLoading(null);
    }
  }

  if (sent) {
    return (
      <div className="mx-auto mt-16 max-w-sm space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight">Confira seu e-mail</h1>
        <p className="text-muted">
          Mandamos um link de acesso para <span className="text-fg">{email.trim()}</span>. Abra neste
          aparelho para entrar.
        </p>
        <Button variant="ghost" onClick={() => setSent(false)} className="w-full">
          Usar outro e-mail
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto mt-16 max-w-sm space-y-5">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Entrar</h1>
        <p className="mt-2 text-muted">Primeira vez? A conta é criada no primeiro acesso, sem senha.</p>
      </div>
      <Button variant="ghost" onClick={google} disabled={loading !== null} className="w-full">
        {loading === "google" && <Spinner />} Continuar com Google
      </Button>
      <div className="flex items-center gap-3 text-xs text-muted">
        <span className="h-px flex-1 bg-line" /> ou <span className="h-px flex-1 bg-line" />
      </div>
      <form onSubmit={sendLink} className="space-y-3">
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          type="email"
          required
          autoComplete="email"
          placeholder="seu@email.com"
          className="w-full rounded-lg border border-line bg-panel px-3 py-2.5 outline-none focus:border-rec"
        />
        <Button type="submit" disabled={!email.includes("@") || loading !== null} className="w-full">
          {loading === "email" && <Spinner />} Receber link de acesso
        </Button>
      </form>
      <ErrorNote message={error} />
    </div>
  );
}
