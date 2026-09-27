"use client";

import { Modal } from "@/components/ui/Modal";
import { MiniaturaPrenda } from "@/components/ui/PrendaCelda";
import { textoCoberturaPiso } from "@/lib/resumen-formato";
import type { FilaExistencias } from "@/lib/inventario-v2";

/* ====================================================================
   AnalisisCoberturaOverlay · «Ver análisis de cobertura» (2026-09-22, REHECHO 2026-09-25 ×2)

   Todo desde `stock: FilaExistencias[]` que Existencias ya cargó (cada fila trae
   `.coberturaPiso`/`.ritmoReciente`/`.accionHoy`) — sin pedir nada más a la base.

   REHECHO (tercera ronda, Felipe 2026-09-25): Cobertura piso YA NO decide reposición — solo
   informa cuánto dura aproximadamente el piso de hoy. Por eso las bandas de acá abajo son
   puramente descriptivas (sin ningún corte de días: ese número ya no existe en este dominio) y
   «Enfoca la reposición acá primero» YA NO se arma agrupando por banda de cobertura — se arma
   filtrando por `f.accionHoy?.tipo === "reponer_a_piso"` (la regla física de piso,
   `politica.umbralStockPisoReposicion`), la MISMA fuente que la tarjeta y la tabla. Dos listas
   con criterios distintos para "qué reponer primero" habría sido exactamente el «dos motores»
   que Felipe pidió no tener. */

type BandaCoberturaPiso = "agotado" | "con_cobertura" | "sin_salida" | "no_estimable";

const BANDAS: readonly BandaCoberturaPiso[] = ["agotado", "con_cobertura", "sin_salida", "no_estimable"];
const ETIQUETA_BANDA: Record<BandaCoberturaPiso, string> = {
  agotado: "Agotado",
  con_cobertura: "Con cobertura estimada",
  sin_salida: "Sin salida reciente",
  no_estimable: "No estimable",
};
const COLOR_BANDA: Record<BandaCoberturaPiso, string> = {
  agotado: "bg-tinta/30",
  con_cobertura: "bg-verde",
  sin_salida: "bg-tinta/20",
  no_estimable: "bg-tinta/15",
};

function bandaDe(f: FilaExistencias): BandaCoberturaPiso {
  const c = f.coberturaPiso;
  if (!c) return "no_estimable";
  if (c.tipo === "agotado") return "agotado";
  if (c.tipo === "no_estimable") return c.razon === "sin_salida" ? "sin_salida" : "no_estimable";
  return "con_cobertura";
}

export function AnalisisCoberturaOverlay({ stock, onClose }: { stock: FilaExistencias[]; onClose: () => void }) {
  const conCobertura = stock.filter((f) => f.disponible > 0);
  const porBanda = new Map<BandaCoberturaPiso, FilaExistencias[]>();
  for (const f of conCobertura) {
    const b = bandaDe(f);
    porBanda.set(b, [...(porBanda.get(b) ?? []), f]);
  }
  const total = conCobertura.length || 1;

  // «Enfoca la reposición acá primero»: MISMA fuente que la tarjeta «Reponer a piso hoy» y la
  // columna de la tabla — nunca una agrupación propia por cobertura. Menos piso primero (lo más
  // físicamente urgente); hasta 6.
  const urgentes = stock
    .filter((f) => f.accionHoy?.tipo === "reponer_a_piso")
    .sort((a, b) => (a.piso ?? 0) - (b.piso ?? 0))
    .slice(0, 6);

  return (
    <Modal titulo="Análisis de cobertura" subtitulo="Cuánto dura aproximadamente el piso de hoy al Ritmo reciente (7 días), por banda." onClose={onClose} ancho="max-w-xl" variante="papel">
      <div className="space-y-1.5">
        {BANDAS.map((b) => {
          const n = porBanda.get(b)?.length ?? 0;
          if (n === 0) return null;
          const pct = Math.round((n / total) * 100);
          return (
            <div key={b} className="flex items-center gap-3">
              <span className="w-32 shrink-0 text-xs text-tinta/70">{ETIQUETA_BANDA[b]}</span>
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
                  <span className="block font-medium text-rojo-profundo">Piso: {f.piso ?? 0}</span>
                  <span className="text-tinta/55">{f.accionHoy?.contexto ?? (f.coberturaPiso ? textoCoberturaPiso(f.coberturaPiso) : "N/D")}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
}
