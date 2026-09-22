"use client";

import { Modal } from "@/components/ui/Modal";
import { MiniaturaPrenda } from "@/components/ui/PrendaCelda";
import { necesitaReponerPiso } from "@/lib/inventario-reglas";
import { textoCobertura } from "@/lib/resumen-formato";
import { BANDAS_COBERTURA, bandaDeCobertura, ETIQUETA_BANDA, type BandaCobertura } from "@/lib/resumen-reglas";
import type { FilaExistencias } from "@/lib/inventario-v2";

/* ====================================================================
   AnalisisCoberturaOverlay · «Ver análisis de cobertura» (2026-09-22)

   Todo desde `stock: FilaExistencias[]` que Existencias ya cargó (cada fila
   trae `.cobertura` de `getCoberturaPorVariante`) — sin pedir nada más a la
   base. Agrupa por la MISMA banda que usa Análisis (`bandaDeCobertura`,
   `resumen-reglas.ts`), para que «crítica» signifique lo mismo en las dos
   pantallas. */

const COLOR_BANDA: Record<BandaCobertura, string> = {
  agotado: "bg-tinta/30",
  critica: "bg-rojo",
  atencion: "bg-ambar",
  saludable: "bg-verde",
  alta: "bg-verde/50",
  sin_historial: "bg-tinta/15",
};

export function AnalisisCoberturaOverlay({ stock, onClose }: { stock: FilaExistencias[]; onClose: () => void }) {
  const conCobertura = stock.filter((f) => f.disponible > 0);
  const porBanda = new Map<BandaCobertura, FilaExistencias[]>();
  for (const f of conCobertura) {
    const b = f.cobertura ? bandaDeCobertura(f.cobertura) : "sin_historial";
    porBanda.set(b, [...(porBanda.get(b) ?? []), f]);
  }
  const total = conCobertura.length || 1;

  // Lo más urgente primero: agotado y crítica, luego atención — hasta 6, ordenado por menos días primero.
  const urgentes = [...(porBanda.get("agotado") ?? []), ...(porBanda.get("critica") ?? []), ...(porBanda.get("atencion") ?? [])]
    .sort((a, b) => (a.cobertura?.dias ?? -1) - (b.cobertura?.dias ?? -1))
    .slice(0, 6);

  return (
    <Modal titulo="Análisis de cobertura" subtitulo="Cuánto dura el stock de hoy al ritmo de venta reciente, por banda." onClose={onClose} ancho="max-w-xl" variante="papel">
      <div className="space-y-1.5">
        {BANDAS_COBERTURA.map((b) => {
          const n = porBanda.get(b)?.length ?? 0;
          if (n === 0) return null;
          const pct = Math.round((n / total) * 100);
          return (
            <div key={b} className="flex items-center gap-3">
              <span className="w-24 shrink-0 text-xs text-tinta/70">{ETIQUETA_BANDA[b]}</span>
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-sand/60">
                <span className={`block h-full rounded-full transition-all ${COLOR_BANDA[b]}`} style={{ width: `${pct}%` }} />
              </span>
              <span className="w-14 shrink-0 text-right text-xs tabular-nums text-tinta/65">
                {n} · {pct}%
              </span>
            </div>
          );
        })}
      </div>

      {urgentes.length > 0 && (
        <div className="mt-5 border-t border-tinta/10 pt-4">
          <p className="label-cayla mb-2 text-[10px] text-tinta/55">Enfoca la reposición acá primero</p>
          <div className="-mx-2 divide-y divide-tinta/10">
            {urgentes.map((f) => (
              <div key={f.varianteId} className="flex items-center gap-3 px-2 py-2">
                <MiniaturaPrenda fotoUrl={f.fotoUrl} colorHex={f.colorHex} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-tinta">{f.referencia}</span>
                  <span className="block truncate text-xs text-tinta/55">
                    <span className="font-mono">{f.sku}</span>
                    {f.talla && ` · ${f.talla}`}
                  </span>
                </span>
                <span className="shrink-0 text-right text-xs">
                  <span className={`block font-medium ${f.cobertura?.tipo === "agotado" ? "text-tinta/45" : "text-rojo-profundo"}`}>
                    {f.cobertura ? textoCobertura(f.cobertura) : "N/D"}
                  </span>
                  {f.piso !== null && f.almacen !== null && necesitaReponerPiso(f.piso, f.almacen) && <span className="text-tinta/55">Hay en almacén</span>}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
}
