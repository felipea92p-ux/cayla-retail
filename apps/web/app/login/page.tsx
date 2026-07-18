"use client";

import Image from "next/image";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const MENSAJES_ERROR: Record<string, string> = {
  sin_persona:
    "Tu cuenta existe pero todavía no está vinculada a ningún integrante. Pide a un Líder que te dé de alta en el sistema.",
};

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const errorInicial = searchParams.get("error");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(
    errorInicial ? MENSAJES_ERROR[errorInicial] ?? null : null
  );
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setError("Correo o contraseña incorrectos.");
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-crema px-6">
      <form onSubmit={onSubmit} className="w-full max-w-sm">
        <div className="mb-10 flex flex-col items-center text-center">
          <Image src="/cayla-isotipo.png" alt="CAYLA" width={56} height={56} priority className="h-14 w-auto" />
          <h1 className="font-display mt-5 text-3xl text-tinta" style={{ letterSpacing: "0.24em" }}>
            CAYLA
          </h1>
          <p className="font-display mt-1 text-base italic text-taupe">Donde el estilo transforma.</p>
        </div>

        <div className="space-y-5">
          <div className="space-y-2">
            <label className="label-cayla text-[10px] text-tinta/50">Correo</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border-b border-tinta/20 bg-transparent px-1 py-2 text-sm text-tinta outline-none transition-colors focus:border-rojo"
            />
          </div>

          <div className="space-y-2">
            <label className="label-cayla text-[10px] text-tinta/50">Contraseña</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border-b border-tinta/20 bg-transparent px-1 py-2 text-sm text-tinta outline-none transition-colors focus:border-rojo"
            />
          </div>

          {error && <p className="text-sm text-rojo">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="label-cayla mt-2 w-full bg-tinta px-3 py-3.5 text-[11px] text-crema transition-colors hover:bg-rojo disabled:opacity-40"
          >
            {loading ? "Entrando…" : "Entrar"}
          </button>
        </div>

        <p className="mt-10 text-center label-cayla text-[9px] text-tinta/30">
          Trujillo · Arequipa · Lima
        </p>
      </form>
    </div>
  );
}
