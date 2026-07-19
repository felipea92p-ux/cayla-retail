"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Buscador protagonista del Inicio de una Encargada: la clienta pregunta, ella
// escribe (o escanea con la pistola Zebra, que "tipea" el SKU y da Enter sola)
// y en segundos sabe si hay stock y DÓNDE está — sin ir al almacén a ciegas.
export function BuscadorHero() {
  const router = useRouter();
  const [q, setQ] = useState("");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const term = q.trim();
        if (term) router.push(`/buscar?q=${encodeURIComponent(term)}`);
      }}
    >
      <label className="label-cayla text-[10px] text-tinta/45">¿Tenemos…? Busca o escanea</label>
      <div className="mt-2 flex items-center gap-3 border-b-2 border-tinta/25 pb-2 transition-colors focus-within:border-rojo">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" className="h-6 w-6 shrink-0 text-tinta/30">
          <path d="M11 19a8 8 0 100-16 8 8 0 000 16zm10 2l-4.35-4.35" />
        </svg>
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Referencia, talla, color o código…"
          className="font-display w-full bg-transparent text-2xl text-tinta outline-none placeholder:text-tinta/25"
        />
      </div>
    </form>
  );
}
