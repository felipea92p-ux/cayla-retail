"use client";

import type { Dispatch, SetStateAction } from "react";
import { Aviso } from "@/components/ui/Aviso";
import { BotonDeshacer } from "@/components/ui/BotonDeshacer";
import { CampoFecha } from "@/components/ui/CampoFecha";
import { CampoTexto } from "@/components/ui/campos";
import { CampoGuiado } from "@/components/guia-de-foco/CampoGuiado";
import type { GuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import {
  alcanceCampana,
  DESCUENTOS_RAPIDOS,
  nombreBajoCosto,
  objecionVigencia,
  parsearDescuento,
  parsearFecha,
  prendasPorCategoria,
  type PrendaConCosto,
} from "@/lib/etiqueta-campana";
import { avisoDiaDeSemana, type repetirTemporada } from "@/lib/etiqueta-vigencia";

const textoPct = (n: number) => n.toLocaleString("es-PE", { maximumFractionDigits: 2 });

/** Una categoría que se puede elegir para que la campaña rija entera en ella. */
export type CategoriaDeCampana = { id: string; nombre: string; familia: string };

/** Lo que se lee de los tres campos: cada uno parseado, y la objeción a las fechas entre sí (null si están bien). */
export function leerCamposDeCampana(c: { descuento: string; desde: string; hasta: string }) {
  const pct = parsearDescuento(c.descuento);
  const fDesde = parsearFecha(c.desde);
  const fHasta = parsearFecha(c.hasta);
  const objecion = fDesde.ok && fHasta.ok ? objecionVigencia(fDesde.valor, fHasta.valor) : null;
  return { pct, fDesde, fHasta, objecion };
}

/**
 * Los campos de una campaña: descuento, fechas y categorías donde rige entera, con cuántas prendas alcanza. Los usan la ventana «Campaña»
 * de Catálogo ▸ Atributos (para las etiquetas que no son campaña pero llevan descuento: Para liquidar, Estreno) y la pestaña Datos de
 * Tienda web ▸ Campañas: una sola pieza, para que los dos lugares pidan lo mismo de la misma forma. El estado y el guardado son de quien
 * la usa; aquí solo se dibuja.
 */
export function CamposDeCampana({
  guia,
  descuento,
  setDescuento,
  desde,
  setDesde,
  hasta,
  setHasta,
  elegidas,
  setElegidas,
  categorias,
  puedeDarDescuento,
  bajoCosto,
  prendasConCosto,
  variantesManuales,
  repetir = null,
}: {
  guia: GuiaCampos;
  descuento: string;
  setDescuento: (v: string) => void;
  desde: string;
  setDesde: (v: string) => void;
  hasta: string;
  setHasta: (v: string) => void;
  elegidas: Set<string>;
  setElegidas: Dispatch<SetStateAction<Set<string>>>;
  categorias: readonly CategoriaDeCampana[];
  /** Sin esto, el descuento no se escribe: la campaña se configura con fechas y categorías. */
  puedeDarDescuento: boolean;
  /** Las prendas que quedarían bajo su costo con este descuento (no bloquea: se avisa). */
  bajoCosto: readonly PrendaConCosto[];
  /** Las prendas a la venta con su costo y su categoría: cada categoría dice cuántas trae y la hoja a cuántas llega la campaña. */
  prendasConCosto: readonly PrendaConCosto[];
  /** Las variantes que llevan la etiqueta marcada a mano (suman al alcance aunque su categoría no esté elegida). */
  variantesManuales: readonly string[];
  /** Si la temporada ya pasó, la hoja abre para repetirla un año después (`repetirTemporada`): el aviso del día de la semana vive aquí. */
  repetir?: ReturnType<typeof repetirTemporada>;
}) {
  const { pct, fDesde, fHasta, objecion } = leerCamposDeCampana({ descuento, desde, hasta });
  const avisoDia = repetir ? avisoDiaDeSemana(repetir, { desde, hasta }) : null;

  // Cada categoría dice cuántas prendas a la venta trae, y la hoja dice a cuántas llega la campaña antes de guardar. Las categorías
  // sin prendas van juntas al final: se pueden elegir (pueden recibir prendas después), pero no compiten con las que sí venden.
  const prendasDe = prendasPorCategoria(prendasConCosto);
  const alcance = alcanceCampana(prendasConCosto, elegidas, new Set(variantesManuales));
  const porFamilia = new Map<string, CategoriaDeCampana[]>();
  const sinPrendas: CategoriaDeCampana[] = [];
  for (const c of categorias) {
    if (!prendasDe.get(c.id)) sinPrendas.push(c);
    else porFamilia.set(c.familia, [...(porFamilia.get(c.familia) ?? []), c]);
  }
  // Plegadas por defecto: son muchas y hoy no mueven ninguna prenda. Se abren solas si ya hay una elegida ahí, para que no quede escondida.
  const sinPrendasElegida = sinPrendas.some((c) => elegidas.has(c.id));

  const alternar = (id: string) =>
    setElegidas((actual) => {
      const nuevo = new Set(actual);
      if (nuevo.has(id)) nuevo.delete(id);
      else nuevo.add(id);
      return nuevo;
    });

  return (
    <>
        {/* Dos columnas desde tablet: a la izquierda cuánto y cuándo, a la derecha las categorías completas. En una hoja angosta
            Desde y Hasta no cabían juntos y las categorías vivían en una caja con su propio scroll dentro de la hoja. */}
        <div className="grid gap-6 md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
          <div className="space-y-5">
            <CampoGuiado id="descuento" guia={guia}>
              <CampoTexto
                etiqueta={guia.etiqueta("descuento", "Descuento (%)")}
                mono
                inputMode="decimal"
                value={descuento}
                onChange={(e) => setDescuento(e.target.value)}
                disabled={!puedeDarDescuento}
                placeholder={puedeDarDescuento ? "Escribe otro %" : "Tu rol no pone descuento"}
                tono={!pct.ok || bajoCosto.length > 0 ? "error" : undefined}
                className={bajoCosto.length > 0 ? "!text-rojo-profundo" : ""}
                pie={
                  !pct.ok
                    ? pct.error
                    : bajoCosto.length > 0
                      ? `Por debajo del costo: ${bajoCosto.length} prenda${bajoCosto.length === 1 ? "" : "s"} (${bajoCosto
                          .slice(0, 2)
                          .map(nombreBajoCosto)
                          .join(", ")}${bajoCosto.length > 2 ? "…" : ""}). Se puede guardar igual.`
                      : pct.valor === null
                        ? "Vacío: la etiqueta solo marca prendas y no cambia precios."
                        : `Baja ${textoPct(pct.valor)} % el precio en Vender, sin pedir código.`
                }
                autoComplete="off"
              />
              {puedeDarDescuento && (
                <div role="group" aria-label="Descuentos de siempre" className="mt-1 flex flex-wrap gap-1.5">
                  <button type="button" className="pildora-cayla" aria-pressed={pct.ok && pct.valor === null} onClick={() => setDescuento("")}>
                    Sin descuento
                  </button>
                  {DESCUENTOS_RAPIDOS.map((v) => (
                    <button
                      key={v}
                      type="button"
                      className="pildora-cayla tabular-nums"
                      aria-pressed={pct.ok && pct.valor === v}
                      onClick={() => setDescuento(String(v))}
                    >
                      {v} %
                    </button>
                  ))}
                </div>
              )}
            </CampoGuiado>

            {/* El título del grupo va FUERA de la grilla: dentro, ocupaba la primera celda y partía Desde y Hasta en dos filas. */}
            <CampoGuiado id="vigencia" guia={guia} titulo="Cuándo rige" ayuda="Opcional: sin fechas, rige siempre.">
              <div className="grid gap-4 sm:grid-cols-2">
                <CampoFecha etiqueta="Desde" valor={desde} onValor={setDesde} tono={fDesde.ok ? undefined : "error"} />
                <CampoFecha
                  etiqueta="Hasta"
                  valor={hasta}
                  onValor={setHasta}
                  tono={fHasta.ok && !objecion ? undefined : "error"}
                  pie={objecion ?? undefined}
                />
              </div>
              {/* Al repetir: sumar un año cambia el día de la semana. Si la fiesta va por día (el 2.º domingo de mayo), un toque
                  corre la temporada entera; si va por fecha (el 25 de diciembre), se deja como está. */}
              {avisoDia && repetir?.mismoDia && (
                // El botón va debajo de la frase, no a su lado: en la columna angosta le quitaba el ancho y la frase se partía en 9 líneas.
                <Aviso tono="info" className="mt-3" titulo={avisoDia.titulo}>
                  <p>{avisoDia.detalle}</p>
                  {avisoDia.modo === "sumando-un-anio" ? (
                    <button
                      type="button"
                      className="btn-cayla btn-sutil btn-chico mt-2"
                      onClick={() => {
                        setDesde(repetir.mismoDia?.desde ?? "");
                        setHasta(repetir.mismoDia?.hasta ?? "");
                      }}
                    >
                      {avisoDia.boton}
                    </button>
                  ) : (
                    <BotonDeshacer
                      className="mt-1"
                      onClick={() => {
                        setDesde(repetir.desde ?? "");
                        setHasta(repetir.hasta ?? "");
                      }}
                    />
                  )}
                </Aviso>
              )}
            </CampoGuiado>
          </div>

          <CampoGuiado id="categorias" guia={guia} retiene="fila">
            <div className="flex items-baseline justify-between gap-3">
              <p className="label-cayla text-[11px] text-tinta/65">
                {guia.etiqueta("categorias", "Categorías")} <span className="font-normal normal-case text-tinta/45">· opcional</span>
              </p>
              {elegidas.size > 0 && (
                <button type="button" onClick={() => setElegidas(new Set())} className="btn-cayla btn-enlace text-xs">
                  Quitar todas
                </button>
              )}
            </div>
            <p className="mt-1 text-xs text-tinta/65" aria-live="polite">
              {elegidas.size === 0
                ? `Sin categorías, la campaña solo alcanza a las prendas marcadas a mano${alcance.aMano ? ` (${alcance.aMano})` : ": hoy ninguna"}.`
                : `Alcanza a ${alcance.total} prenda${alcance.total === 1 ? "" : "s"} a la venta: ${alcance.porCategoria} de ${elegidas.size} categoría${elegidas.size === 1 ? "" : "s"}${alcance.aMano ? ` y ${alcance.aMano} marcada${alcance.aMano === 1 ? "" : "s"} a mano` : ""}.`}
            </p>
            <div className="mt-3 space-y-3">
              {[...porFamilia.entries()].map(([familia, lista]) => (
                <div key={familia}>
                  <p className="text-[11px] text-tinta/60">{familia}</p>
                  <ChipsCategorias lista={lista} elegidas={elegidas} prendasDe={prendasDe} onAlternar={alternar} />
                </div>
              ))}
              {sinPrendas.length > 0 && (
                <details open={sinPrendasElegida || undefined} className="border-t border-sand pt-2">
                  <summary className="cursor-pointer text-[11px] text-tinta/60">
                    Sin prendas todavía · {sinPrendas.length} categoría{sinPrendas.length === 1 ? "" : "s"}
                  </summary>
                  <ChipsCategorias lista={sinPrendas} elegidas={elegidas} prendasDe={prendasDe} onAlternar={alternar} />
                </details>
              )}
            </div>
          </CampoGuiado>
        </div>
    </>
  );
}

function ChipsCategorias({
  lista,
  elegidas,
  prendasDe,
  onAlternar,
}: {
  lista: readonly CategoriaDeCampana[];
  elegidas: ReadonlySet<string>;
  prendasDe: ReadonlyMap<string, number>;
  onAlternar: (id: string) => void;
}) {
  return (
    <div className="mt-1.5 flex flex-wrap gap-1.5">
      {lista.map((c) => (
        <button key={c.id} type="button" aria-pressed={elegidas.has(c.id)} onClick={() => onAlternar(c.id)} className="pildora-cayla">
          {c.nombre}
          <span className="text-[11px] font-normal tabular-nums opacity-70">{prendasDe.get(c.id) ?? 0}</span>
        </button>
      ))}
    </div>
  );
}
