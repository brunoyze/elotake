"use client";

import { useState } from "react";
import { Button, ErrorNote, Spinner } from "@/components/ui";

export default function EntrarPage() {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/entrar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ codigo: code }),
    });
    if (res.ok) {
      const next = new URLSearchParams(window.location.search).get("next");
      window.location.href = next?.startsWith("/") ? next : "/";
    } else {
      setError("Código incorreto.");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="mx-auto mt-16 max-w-sm space-y-5">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Entrar</h1>
        <p className="mt-2 text-muted">A Elotake está em teste fechado. Digite o código de acesso.</p>
      </div>
      <input
        value={code}
        onChange={(e) => setCode(e.target.value)}
        type="password"
        autoFocus
        placeholder="código de acesso"
        className="w-full rounded-lg border border-line bg-panel px-3 py-2.5 outline-none focus:border-rec"
      />
      <ErrorNote message={error} />
      <Button type="submit" disabled={!code || loading} className="w-full">
        {loading && <Spinner />} Entrar
      </Button>
    </form>
  );
}
