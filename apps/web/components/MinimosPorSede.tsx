"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Mínimo de stock por sede para una variante (Fase B): TRU vende distinto que
// AQP, y cada tienda merece su propia alerta. Vacío = usa el mínimo general.
export function MinimosPorSede({
  varianteId,
  sedes,
  minimosActuales,
  minimoGeneral,
}: {
  varianteId: string;
  sedes: { id: string; codigo: string }[];
  minimosActuales: Record<string, number>; // codigo -> minimo propio
  minimoGeneral: number;
}) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [valores, setValores] = useState<Record<string, string>>(() => {
    const v: Record<string, string> = {};
    sedes.forEach((s) => (v[s.id] = minimosActuales[s.codigo] != null ? String(minimosActuales[s.codigo]) : ""));
    return v;
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function guardar() {
    setLoading(true);
    setError(null);
    const supabase = createClient();
    for (const s of sedes) {
      const crudo = valores[s.id]?.trim() ?? "";
      const { error } = await supabase.rpc("fijar_stock_minimo", {
        p_variante_id: varianteId,
        p_sede_id: s.id,
        p_minimo: crudo === "" ? undefined : Math.max(0, Math.round(Number(crudo))),
      });
      if (error) {
        setError(`${s.codigo}: ${error.message}`);
        setLoading(false);
        return;
      }
    }
    setLoading(false);
    setEditando(false);
    router.refresh();
  }

  if (!editando) {
    return (
      <button
        onClick={() => setEditando(true)}
        className="label-cayla border border-tinta/25 px-3 py-2 text-[9px] text-tinta transition-colors hover:border-rojo hover:text-rojo"
      >
        Mínimos por sede
      </button>
    );
  }

  return (
    <div className="border border-tinta/10 bg-papel p-4">
      <p className="label-cayla text-[10px] text-tinta/50">
        Mínimo por sede <span className="text-tinta/35">(vacío = general: {minimoGeneral})</span>
      </p>
      <div className="mt-3 flex flex-wrap gap-3">
        {sedes.map((s) => (
          <label key={s.id} className="text-xs text-tinta/55">
            {s.codigo}
            <input
              type="number"
              min={0}
              value={valores[s.id] ?? ""}
              onChange={(e) => setValores((v) => ({ ...v, [s.id]: e.target.value }))}
              placeholder={String(minimoGeneral)}
              className="mt-1 w-20 border-b border-tinta/20 bg-transparent px-1 py-1 text-sm text-tinta outline-none focus:border-rojo"
            />
          </label>
        ))}
      </div>
      {error && <p className="mt-2 text-xs text-rojo">{error}</p>}
      <div className="mt-3 flex gap-2">
        <button onClick={() => setEditando(false)} className="label-cayla border border-tinta/25 px-3 py-2 text-[9px] text-tinta">
          Cancelar
        </button>
        <button
          onClick={guardar}
          disabled={loading}
          className="label-cayla bg-tinta px-3 py-2 text-[9px] text-crema transition-colors hover:bg-rojo disabled:opacity-50"
        >
          {loading ? "Guardando…" : "Guardar"}
        </button>
      </div>
    </div>
  );
}
