"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Partidas manuales del patrimonio (cuentas bancarias, deudas, activos fijos).
// Lo automático (efectivo teórico + inventario a costo) lo calcula el sistema.
export function PatrimonioEditor() {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [nombre, setNombre] = useState("");
  const [tipo, setTipo] = useState<"activo" | "pasivo">("activo");
  const [monto, setMonto] = useState(0);
  const [nota, setNota] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error } = await createClient().from("patrimonio_items").insert({
      nombre,
      tipo,
      monto,
      nota: nota || null,
    });
    setLoading(false);
    if (error) { setError(error.message); return; }
    setAbierto(false);
    setNombre(""); setMonto(0); setNota("");
    router.refresh();
  }

  if (!abierto) {
    return (
      <button
        onClick={() => setAbierto(true)}
        className="label-cayla border border-tinta/25 px-4 py-2.5 text-[10px] text-tinta transition-colors hover:border-rojo hover:text-rojo"
      >
        + Agregar partida
      </button>
    );
  }

  return (
    <form onSubmit={onSubmit} className="border border-tinta/10 bg-papel p-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label className="label-cayla text-[10px] text-tinta/50">Nombre</label>
          <input
            required
            autoFocus
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Ej. Cuenta BCP, deuda proveedor…"
            className="w-full border-b border-tinta/20 bg-transparent px-1 py-2 text-sm text-tinta outline-none focus:border-rojo"
          />
        </div>
        <div className="space-y-1.5">
          <label className="label-cayla text-[10px] text-tinta/50">Tipo</label>
          <select
            value={tipo}
            onChange={(e) => setTipo(e.target.value as "activo" | "pasivo")}
            className="w-full border border-tinta/20 bg-crema px-3 py-2 text-sm text-tinta outline-none focus:border-rojo"
          >
            <option value="activo">Activo (suma al patrimonio)</option>
            <option value="pasivo">Pasivo (deuda, resta)</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="label-cayla text-[10px] text-tinta/50">Monto (S/)</label>
          <input
            type="number"
            step="0.01"
            required
            value={monto}
            onChange={(e) => setMonto(Number(e.target.value))}
            className="w-full border-b border-tinta/20 bg-transparent px-1 py-2 text-sm text-tinta outline-none focus:border-rojo"
          />
        </div>
        <div className="space-y-1.5">
          <label className="label-cayla text-[10px] text-tinta/50">Nota (opcional)</label>
          <input
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            className="w-full border-b border-tinta/20 bg-transparent px-1 py-2 text-sm text-tinta outline-none focus:border-rojo"
          />
        </div>
      </div>

      {error && <p className="mt-3 text-sm text-rojo">{error}</p>}

      <div className="mt-4 flex gap-2">
        <button type="button" onClick={() => setAbierto(false)} className="label-cayla flex-1 border border-tinta/25 px-3 py-2.5 text-[10px] text-tinta">
          Cancelar
        </button>
        <button type="submit" disabled={loading} className="label-cayla flex-1 bg-tinta px-3 py-2.5 text-[10px] text-crema transition-colors hover:bg-rojo disabled:opacity-50">
          {loading ? "Guardando…" : "Guardar"}
        </button>
      </div>
    </form>
  );
}
