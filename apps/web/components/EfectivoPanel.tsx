"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { CuadreSede } from "@/lib/finanzas-nucleo";
import { Ayuda } from "@/components/Ayuda";

type Sede = { id: string; codigo: string };

function money(n: number) {
  return "S/" + n.toFixed(2);
}

// Panel interactivo del cuadre de efectivo: registrar depósitos al banco y
// ajustes (saldo inicial del corte, correcciones con motivo y autor).
export function EfectivoPanel({ cuadre, sedes }: { cuadre: CuadreSede[]; sedes: Sede[] }) {
  const router = useRouter();
  const [modal, setModal] = useState<"deposito" | "ajuste" | null>(null);
  const [sedeId, setSedeId] = useState(sedes[0]?.id ?? "");
  const [monto, setMonto] = useState(0);
  const [nota, setNota] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();

    if (modal === "deposito") {
      const { error } = await supabase.rpc("registrar_deposito", {
        p_sede_id: sedeId,
        p_monto: monto,
        p_nota: nota || undefined,
      });
      if (error) { setError(error.message); setLoading(false); return; }
    } else {
      // Ajuste: inserta directo — RLS solo permite Líder, y el motivo es obligatorio.
      const { error } = await supabase.from("ajustes_efectivo").insert({
        sede_id: sedeId,
        monto,
        motivo: nota || "Ajuste sin motivo",
      });
      if (error) { setError(error.message); setLoading(false); return; }
    }

    setLoading(false);
    setModal(null);
    setMonto(0);
    setNota("");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-px border border-tinta/10 bg-tinta/10 sm:grid-cols-3">
        {cuadre.map((c) => (
          <div key={c.sedeCodigo} className="bg-crema p-5">
            <p className="label-cayla text-[9px] text-tinta/45">
              {c.sedeCodigo} · efectivo teórico
              <Ayuda titulo="Efectivo teórico">
                Cuánto efectivo DEBERÍA haber en el cajón de esta tienda ahora mismo, según el sistema:
                el saldo inicial, más las ventas en efectivo, menos los gastos en efectivo y los
                depósitos al banco. Al cerrar caja, se compara con lo que cuentas de verdad.
              </Ayuda>
            </p>
            <p className={`font-display mt-1 text-3xl ${c.teorico < 0 ? "text-rojo" : "text-tinta"}`}>
              {money(c.teorico)}
            </p>
            <div className="mt-3 space-y-1 text-xs text-tinta/50">
              <p className="flex justify-between"><span>Saldo inicial + ajustes</span><span>{money(c.ajustes)}</span></p>
              <p className="flex justify-between"><span>+ Ventas en efectivo</span><span>{money(c.ventasEfectivo)}</span></p>
              <p className="flex justify-between"><span>− Gastos en efectivo</span><span>{money(c.gastosEfectivo)}</span></p>
              <p className="flex justify-between"><span>− Depósitos al banco</span><span>{money(c.depositos)}</span></p>
            </div>
            {c.ultimaDiferenciaCierre != null && (
              <p className="mt-3 border-t border-tinta/10 pt-2 text-xs text-tinta/50">
                Último cierre:{" "}
                <span className={c.ultimaDiferenciaCierre === 0 ? "text-tinta" : c.ultimaDiferenciaCierre > 0 ? "text-tinta" : "text-rojo"}>
                  {c.ultimaDiferenciaCierre > 0 ? "+" : ""}
                  {money(c.ultimaDiferenciaCierre)}
                </span>
              </p>
            )}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setModal("deposito")}
          className="label-cayla bg-tinta px-4 py-2.5 text-[10px] text-crema transition-colors hover:bg-rojo"
        >
          Registrar depósito al banco
        </button>
        <button
          onClick={() => setModal("ajuste")}
          className="label-cayla border border-tinta/25 px-4 py-2.5 text-[10px] text-tinta transition-colors hover:border-rojo hover:text-rojo"
        >
          Ajuste / saldo inicial
        </button>
      </div>

      {modal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-tinta/30 sm:items-center">
          <div className="w-full max-w-sm bg-crema p-6">
            <h2 className="font-display text-lg text-tinta">
              {modal === "deposito" ? "Depósito al banco" : "Ajuste de efectivo"}
            </h2>
            <p className="mb-4 mt-1 text-xs text-tinta/50">
              {modal === "deposito"
                ? "Efectivo que sale del cajón de la sede hacia el banco."
                : "Corrige el teórico con motivo obligatorio (ej. saldo inicial del corte). Puede ser negativo."}
            </p>

            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="label-cayla text-[10px] text-tinta/50">Sede</label>
                <select
                  value={sedeId}
                  onChange={(e) => setSedeId(e.target.value)}
                  className="w-full border border-tinta/20 bg-papel px-3 py-2 text-sm text-tinta outline-none focus:border-rojo"
                >
                  {sedes.map((s) => (
                    <option key={s.id} value={s.id}>{s.codigo}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="label-cayla text-[10px] text-tinta/50">Monto (S/)</label>
                <input
                  type="number"
                  step="0.10"
                  required
                  autoFocus
                  value={monto}
                  onChange={(e) => setMonto(Number(e.target.value))}
                  className="w-full border-b border-tinta/20 bg-transparent px-1 py-2 text-sm text-tinta outline-none focus:border-rojo"
                />
              </div>
              <div className="space-y-1.5">
                <label className="label-cayla text-[10px] text-tinta/50">
                  {modal === "deposito" ? "Nota (opcional)" : "Motivo (obligatorio)"}
                </label>
                <input
                  value={nota}
                  onChange={(e) => setNota(e.target.value)}
                  required={modal === "ajuste"}
                  placeholder={modal === "deposito" ? "Ej. depósito BCP" : "Ej. saldo inicial del corte 19/07"}
                  className="w-full border-b border-tinta/20 bg-transparent px-1 py-2 text-sm text-tinta outline-none focus:border-rojo"
                />
              </div>

              {error && <p className="text-sm text-rojo">{error}</p>}

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setModal(null)}
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
          </div>
        </div>
      )}
    </div>
  );
}
