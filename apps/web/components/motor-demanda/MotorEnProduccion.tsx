"use client";

import { useMemo } from "react";
import { Chip } from "@/components/ui/Chip";
import type { MotorDeLaRed } from "@/lib/motor-demanda";
import type { ModeloProducible } from "@/lib/produccion";
import { curvaDelMotor, fraseDeFalta, fraseDeQuienHabla, seVendioRapidoYFalta } from "@/lib/demanda-reglas";

// Motor de demanda en «Nueva orden» de Producción (ADR-0347). Va AL LADO de la curva de siempre, sin reemplazarla: Felipe decidió
// comparar las dos un tiempo antes de quedarse con una (2026-10-05). Solo hablan las tiendas que cumplen ADR-0346; si ninguna,
// dice por qué en una línea por tienda y no sugiere nada. La cuenta vive en lib/demanda-reglas.ts.

export function MotorEnProduccion({
  motor,
  modelo,
  disponible,
  diasObjetivo,
  onUsar,
}: {
  motor: MotorDeLaRed;
  modelo: ModeloProducible;
  /** Lo que la curva de siempre ya cuenta como disponible por prenda: las dos se comparan sobre el mismo stock. */
  disponible: (varianteId: string) => number;
  diasObjetivo: number;
  onUsar: (cantidades: Record<string, string>) => void;
}) {
  const curva = useMemo(() => curvaDelMotor(modelo.variantes, motor.sedes, disponible, diasObjetivo), [modelo, motor, disponible, diasObjetivo]);
  const faltan = useMemo(() => (modelo.categoriaId ? seVendioRapidoYFalta(motor.sedes, modelo.categoriaId) : []), [motor, modelo]);
  const habla = curva.hablan.length > 0;

  function usar() {
    const nuevas: Record<string, string> = {};
    for (const [id, n] of curva.porVariante) if (n && n > 0) nuevas[id] = String(n);
    onUsar(nuevas);
  }

  return (
    <div className="space-y-2 border-t border-sand pt-3" aria-label="Lo que dice el motor de demanda">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-medium text-tinta">
            Lo que dice el motor de demanda <Chip tono="pizarra">Para comparar</Chip>
          </p>
          <p className="mt-0.5 text-xs text-tinta/65">
            {habla
              ? `${fraseDeQuienHabla(curva.hablan)} Cuenta solo los días en que la prenda estuvo colgada y apoya a cada una en su grupo (categoría, talla y color).`
              : "Todavía no recomienda: sus datos aún no alcanzan en ninguna tienda."}
          </p>
        </div>
        {habla && (
          <button
            type="button"
            onClick={usar}
            disabled={curva.total === 0}
            className="h-8 rounded-md border border-tinta/25 px-3 text-[13px] text-tinta outline-none transition-colors hover:border-tinta focus-visible:outline focus-visible:outline-2 focus-visible:outline-rojo/60 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-tinta/25"
          >
            {curva.total > 0 ? `Usar la del motor · ${curva.total} prendas` : "El motor no pide fabricar"}
          </button>
        )}
      </div>

      {motor.falla && <p className="text-xs text-tinta/65">{motor.falla}.</p>}

      {!habla ? (
        <ul className="space-y-1 text-xs text-tinta/70">
          {motor.sedes.map((s) => (
            <li key={s.ubicacionId}>{s.frase}</li>
          ))}
        </ul>
      ) : (
        <>
          <ul className="divide-y divide-tinta/10 text-[13px]">
            {modelo.variantes
              .filter((v) => (curva.porVariante.get(v.varianteId) ?? 0) > 0)
              .map((v) => (
                <li key={v.varianteId} className="flex items-center justify-between gap-3 py-1">
                  <span className="text-tinta">
                    {v.color ?? "Sin color"} · {v.talla ?? "Única"}
                  </span>
                  <b className="font-semibold tabular-nums text-tinta">{curva.porVariante.get(v.varianteId)}</b>
                </li>
              ))}
          </ul>
          {faltan.length > 0 && (
            <div className="rounded-md bg-hueso px-3 py-2">
              <p className="text-xs font-medium text-tinta">Se vendió rápido y falta{modelo.categoria ? ` en ${modelo.categoria}` : ""}</p>
              <ul className="mt-1 space-y-0.5 text-xs text-tinta/75">
                {faltan.slice(0, 6).map((f) => (
                  <li key={f.clave}>
                    Talla {f.talla ?? "única"}
                    {f.familiaColor ? `, colores ${f.familiaColor}` : ""}: {fraseDeFalta(f)}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
