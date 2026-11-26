"use client";

import { useId, useState } from "react";
import { TrendingUp } from "lucide-react";
import { Boton, Desplegable } from "@/components/ui/campos";
import { Chip } from "@/components/ui/Chip";
import { ParDato } from "@/components/ui/ParDato";
import { BotonVerMas, FilasDeMas } from "@/components/ui/VerMas";
import { MotorEnProduccion } from "@/components/motor-demanda/MotorEnProduccion";
import type { MotorDeLaRed } from "@/lib/motor-demanda";
import type { ModeloProducible } from "@/lib/produccion";
import { ETIQUETA_BANDA } from "@/lib/resumen-reglas";
import { OPCIONES_DIAS_OBJETIVO, type CurvaSugerida, type DemandaVariante } from "@/lib/produccion-decision-reglas";
import { explicacionDelConsejo, fraseDelConsejo, paresDeLaVariante } from "@/lib/nueva-orden-consejo-reglas";

// Lo que piden las ventas en «Nueva orden», en UNA línea (hallazgo H5 del /formidable de Producción, Felipe 2026-10-16; «Producción más clara», 2026-11-26). Antes ocupaba ~290 px
// antes de «Fases» y «Tela» —incluso vacío— con tres palabras que nadie entendió. Ahora la línea dice lo único que importa («Las ventas piden unas 24 prendas» o «Las ventas no piden
// nada ahora»), deja usar la sugerencia con un toque («Usar lo sugerido») y guarda lo demás bajo «¿Por qué?»: la explicación, los días de venta que cubre, el detalle por talla y color
// y el motor de demanda para comparar. Vive en el paso 2, sobre la tabla que llena.
//
// El detalle por talla y color ya no es una frase con puntos («Red 4 · Taller 2 · en camino 3»): cada dato es un par con su nombre completo (`<ParDato>`, `paresDeLaVariante`).
//
// Es solo presentación: la sugerencia es la MISMA (`sugerirCurva`, que arma el formulario), «Usar lo sugerido» llama a la MISMA función que llenaba «Cuántas» (`onUsar`), el selector de
// días es el mismo estado del formulario y el motor se compara sobre el mismo disponible. No guarda nada ni decide nada. Arranca cerrado; cerrado, el panel ni se pinta.

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
  /** Lo que ya se está fabricando por variante (el par «Fabricándose»). */
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
  const [conDetalle, setConDetalle] = useState(false);
  const idPanel = useId();
  const idDetalle = useId();
  const frase = fraseDelConsejo(curva.total);
  const explicacion = explicacionDelConsejo({ total: curva.total, sugerencias: [...curva.porVariante.values()], diasObjetivo });

  return (
    <section data-guia="prod-orden-nueva.red" aria-label="Lo que piden las ventas" className={`rounded-2xl px-4 py-3 ${frase.sugiere ? "bg-verde/10" : "border border-sand"}`}>
      <div className="flex min-h-9 flex-wrap items-center gap-x-3 gap-y-2">
        {frase.sugiere && <TrendingUp aria-hidden className="h-4 w-4 shrink-0 text-verde" />}
        <p className={`min-w-0 text-sm ${frase.sugiere ? "font-semibold text-tinta" : "text-secundario"}`}>{frase.texto}</p>
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
        {frase.sugiere && (
          <span className="@max-[559px]:w-full @min-[560px]:ml-auto">
            <Boton type="button" peso="fantasma" onClick={onUsar} className="@max-[559px]:w-full" aria-label={`Usar lo sugerido: pone las ${curva.total} prendas en la tabla`}>
              Usar lo sugerido
            </Boton>
          </span>
        )}
      </div>

      {abierto && (
        <div id={idPanel} className="anim-revelar mt-3 space-y-3 border-t border-sand pt-3">
          <p className="text-sm text-secundario">{explicacion}</p>

          <div data-guia="prod-orden-nueva.cubrir" className="flex items-center gap-2">
            <label className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-secundario">
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
            <div data-guia="prod-orden-nueva.por-que">
              <BotonVerMas abierto={conDetalle} onCambiar={setConDetalle} texto="Ver el detalle por talla y color" forma="enlace" controla={idDetalle} data-guia="prod-orden-nueva.por-que-abrir" />
              <FilasDeMas abierto={conDetalle} id={idDetalle}>
                <ul className="mt-1 divide-y divide-sand">
                  {modelo.variantes
                    .filter((v) => curva.porVariante.has(v.varianteId))
                    .sort((a, b) => (curva.porVariante.get(b.varianteId)?.sugerido ?? 0) - (curva.porVariante.get(a.varianteId)?.sugerido ?? 0))
                    .map((v) => {
                      const d = demandaPorVariante.get(v.varianteId);
                      const sug = curva.porVariante.get(v.varianteId);
                      return (
                        <li key={v.varianteId} className="py-3">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="text-sm font-semibold text-tinta">{v.color ?? "Sin color"}</span>
                            <Chip tono="neutro" versalitas={false}>
                              {v.talla ? `Talla ${v.talla}` : "Talla única"}
                            </Chip>
                            {d && <Chip tono={d.banda === "agotado" || d.banda === "critica" || d.banda === "atencion" ? "ambar" : "neutro"}>{ETIQUETA_BANDA[d.banda]}</Chip>}
                          </div>
                          {/* Cada dato en su pieza, y todas en columnas del mismo ancho para leerlas de arriba abajo entre una talla y otra. */}
                          <div className="mt-2 grid grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] gap-x-4 gap-y-1.5">
                            <ParDato rotulo="Sugerido">{sug?.sugerido ?? 0}</ParDato>
                            {d &&
                              paresDeLaVariante(d, enProduccion.get(v.varianteId) ?? 0).map((par) => (
                                <ParDato key={par.clave} rotulo={par.rotulo}>
                                  {par.valor}
                                </ParDato>
                              ))}
                          </div>
                          {sug?.motivo && <p className="mt-1.5 text-detalle leading-snug text-secundario">{sug.motivo}</p>}
                        </li>
                      );
                    })}
                </ul>
              </FilasDeMas>
            </div>
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
