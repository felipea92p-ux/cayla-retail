"use client";

import { useId, useState } from "react";
import { Boton, Desplegable } from "@/components/ui/campos";
import { Chip } from "@/components/ui/Chip";
import { MotorEnProduccion } from "@/components/motor-demanda/MotorEnProduccion";
import type { MotorDeLaRed } from "@/lib/motor-demanda";
import type { ModeloProducible } from "@/lib/produccion";
import { ETIQUETA_BANDA } from "@/lib/resumen-reglas";
import { OPCIONES_DIAS_OBJETIVO, type CurvaSugerida, type DemandaVariante } from "@/lib/produccion-decision-reglas";
import { explicacionDelConsejo, fraseDelConsejo } from "@/lib/nueva-orden-consejo-reglas";

// El consejo de la red en «Nueva orden», plegado a UNA línea (hallazgo H5 del /formidable de Producción, Felipe 2026-10-16). Antes ocupaba ~290 px antes de «Fases» y «Tela» —incluso
// vacío— con tres palabras que nadie entendió. Ahora la línea dice lo único que importa («La red sugiere 40 prendas» o «La red no sugiere nada ahora»), deja usar la sugerencia con un
// toque y guarda lo demás bajo «¿Por qué?»: la explicación, los días de venta que cubre, el detalle por talla y color, y el motor de demanda para comparar.
//
// Es solo presentación: la sugerencia es la MISMA (`sugerirCurva`, que arma el formulario), «Usarla» llama a la MISMA función que llenaba «Cuántas» (`onUsar`), el selector de días es el mismo
// estado del formulario y el motor se compara sobre el mismo disponible. No guarda nada ni decide nada. Arranca cerrado; cerrado, el panel ni se pinta (nada de lo difícil se ve sin tocar).
// No se reordena la hoja: la sugerencia alimenta «Cuántas» y los metros de la tela dependen del total, así que el consejo sigue donde estaba, pero ocupa una línea.

export function ConsejoDeLaRed({
  curva,
  modelo,
  demandaPorVariante,
  enProduccion,
  diasObjetivo,
  onDias,
  onUsar,
  motor,
  disponible,
  onUsarMotor,
}: {
  curva: CurvaSugerida;
  modelo: ModeloProducible;
  demandaPorVariante: ReadonlyMap<string, DemandaVariante>;
  /** Lo que ya se está fabricando por variante (entra en «fabricando N»). */
  enProduccion: ReadonlyMap<string, number>;
  diasObjetivo: number;
  onDias: (dias: number) => void;
  /** Llena «Cuántas» con la sugerencia: la misma función de siempre. */
  onUsar: () => void;
  /** Lo que dice el motor de demanda (solo el líder lo recibe); `null` = no se muestra. */
  motor: MotorDeLaRed | null;
  disponible: (varianteId: string) => number;
  onUsarMotor: (cantidades: Record<string, string>) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const idPanel = useId();
  const frase = fraseDelConsejo(curva.total);
  const explicacion = explicacionDelConsejo({ total: curva.total, sugerencias: [...curva.porVariante.values()], diasObjetivo });

  return (
    <section data-guia="prod-orden-nueva.red" aria-label="Lo que dice la red" className="rounded-2xl border border-sand bg-crema px-3.5 py-2.5">
      <div className="flex min-h-9 flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <p className={`min-w-0 text-sm ${frase.sugiere ? "text-tinta" : "text-tinta/70"}`}>{frase.texto}</p>
        <div className="flex items-center gap-3">
          {frase.sugiere && (
            <Boton type="button" peso="fantasma" onClick={onUsar} aria-label={`Usarla: pone las ${curva.total} prendas de la sugerencia en la tabla`}>
              Usarla
            </Boton>
          )}
          <button
            type="button"
            aria-expanded={abierto}
            aria-controls={idPanel}
            data-guia="prod-orden-nueva.red-abrir"
            onClick={() => setAbierto((a) => !a)}
            className="btn-cayla btn-enlace min-h-7 !px-0.5 text-xs pointer-coarse:min-h-11"
          >
            ¿Por qué?
          </button>
        </div>
      </div>

      {abierto && (
        <div id={idPanel} className="anim-revelar mt-2 space-y-3 border-t border-sand pt-3">
          <p className="text-xs text-tinta/70">{explicacion}</p>

          <div data-guia="prod-orden-nueva.cubrir" className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs text-tinta/70">
              Días de venta que cubre
              <Desplegable
                valor={String(diasObjetivo)}
                onValor={(v) => onDias(Number(v))}
                opciones={OPCIONES_DIAS_OBJETIVO.map((d) => ({ valor: String(d), texto: `${d} días` }))}
                etiquetaAccesible="Días de venta que cubre"
                forma="pastilla"
              />
            </label>
          </div>

          {curva.porVariante.size > 0 && (
            <details data-guia="prod-orden-nueva.por-que">
              <summary data-guia="prod-orden-nueva.por-que-abrir" className="cursor-pointer py-1.5 text-xs text-tinta/75">
                Ver el detalle por talla y color
              </summary>
              <ul className="mt-2 divide-y divide-tinta/10">
                {modelo.variantes
                  .filter((v) => curva.porVariante.has(v.varianteId))
                  .sort((a, b) => (curva.porVariante.get(b.varianteId)?.sugerido ?? 0) - (curva.porVariante.get(a.varianteId)?.sugerido ?? 0))
                  .map((v) => {
                    const d = demandaPorVariante.get(v.varianteId);
                    const sug = curva.porVariante.get(v.varianteId);
                    return (
                      <li key={v.varianteId} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 py-1.5 text-[13px]">
                        <span className="min-w-0">
                          <span className="text-tinta">
                            {v.color ?? "Sin color"} · {v.talla ?? "Única"}
                          </span>
                          {d && (
                            <span className="ml-2 align-middle">
                              <Chip tono={d.banda === "agotado" || d.banda === "critica" || d.banda === "atencion" ? "ambar" : "neutro"}>{ETIQUETA_BANDA[d.banda]}</Chip>
                            </span>
                          )}
                          <small className="block text-xs text-tinta/65">
                            {d ? `Red ${d.stockRed} · Taller ${d.stockTaller}${d.enCamino > 0 ? ` · en camino ${d.enCamino}` : ""}${enProduccion.get(v.varianteId) ? ` · fabricando ${enProduccion.get(v.varianteId)}` : ""}` : ""}
                          </small>
                        </span>
                        <span className="text-right tabular-nums">
                          <b className="font-semibold text-tinta">{sug?.sugerido ?? 0}</b>
                          <small className="block max-w-[15rem] text-xs text-tinta/70">{sug?.motivo}</small>
                        </span>
                      </li>
                    );
                  })}
              </ul>
            </details>
          )}

          {motor && (
            <div data-guia="prod-orden-nueva.motor">
              <MotorEnProduccion motor={motor} modelo={modelo} disponible={disponible} diasObjetivo={diasObjetivo} onUsar={onUsarMotor} />
            </div>
          )}
        </div>
      )}
    </section>
  );
}
