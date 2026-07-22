"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Sede = { id: string; codigo: string };

const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

// Siembra de totales mensuales históricos (una sola vez, desde SINATRA): 12
// números por sede/año alimentan el comparativo sin migrar transacciones.
export function HistoricosEditor({
  sedes,
  existentes,
}: {
  sedes: Sede[];
  existentes: { sede_id: string; anio: number; mes: number; monto: number }[];
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [sedeId, setSedeId] = useState(sedes[0]?.id ?? "");
  const [anio, setAnio] = useState(2025);
  const [montos, setMontos] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function cargar(sede: string, a: number) {
    const valores: Record<number, string> = {};
    existentes
      .filter((e) => e.sede_id === sede && e.anio === a)
      .forEach((e) => (valores[e.mes] = String(e.monto)));
    setMontos(valores);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();

    const filas = Object.entries(montos)
      .filter(([, v]) => v.trim() !== "" && !Number.isNaN(Number(v)))
      .map(([mes, v]) => ({ sede_id: sedeId, anio, mes: Number(mes), monto: Number(v) }));

    const { error } = await supabase
      .from("ventas_historicas_mensuales")
      .upsert(filas, { onConflict: "sede_id,anio,mes" });

    setLoading(false);
    if (error) { setError(error.message); return; }
    setAbierto(false);
    router.refresh();
  }

  if (!abierto) {
    return (
      <button
        onClick={() => { cargar(sedeId, anio); setAbierto(true); }}
        className="label-cayla border border-tinta/25 px-4 py-2.5 text-[10px] text-tinta transition-colors hover:border-rojo hover:text-rojo"
      >
        Sembrar / editar históricos
      </button>
    );
  }

  return (
    <form onSubmit={onSubmit} className="card-cayla p-5">
      <p className="label-cayla text-[10px] text-tinta/50">Totales mensuales históricos (desde SINATRA, una sola vez)</p>
      <div className="mt-3 flex gap-2">
        <select
          value={sedeId}
          onChange={(e) => { setSedeId(e.target.value); cargar(e.target.value, anio); }}
          className="border border-tinta/20 bg-crema px-2.5 py-1.5 text-xs text-tinta outline-none focus:border-rojo"
        >
          {sedes.map((s) => <option key={s.id} value={s.id}>{s.codigo}</option>)}
        </select>
        <select
          value={anio}
          onChange={(e) => { setAnio(Number(e.target.value)); cargar(sedeId, Number(e.target.value)); }}
          className="border border-tinta/20 bg-crema px-2.5 py-1.5 text-xs text-tinta outline-none focus:border-rojo"
        >
          {[2023, 2024, 2025, 2026].map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4">
        {MESES.map((nombre, i) => (
          <label key={nombre} className="text-xs text-tinta/50">
            {nombre}
            <input
              type="number"
              step="0.01"
              value={montos[i + 1] ?? ""}
              onChange={(e) => setMontos((m) => ({ ...m, [i + 1]: e.target.value }))}
              placeholder="0"
              className="mt-1 w-full border-b border-tinta/20 bg-transparent px-1 py-1 text-sm text-tinta outline-none focus:border-rojo"
            />
          </label>
        ))}
      </div>

      {error && <p className="mt-3 text-sm text-rojo">{error}</p>}

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={() => setAbierto(false)}
          className="label-cayla flex-1 border border-tinta/25 px-3 py-2.5 text-[10px] text-tinta"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={loading}
          className="label-cayla flex-1 bg-tinta px-3 py-2.5 text-[10px] text-crema transition-colors hover:bg-rojo disabled:opacity-50"
        >
          {loading ? "Guardando…" : "Guardar"}
        </button>
      </div>
    </form>
  );
}
