"use client";

import type { CSSProperties } from "react";
import { Bloque } from "@/components/ResumenBloques";
import { Ayuda } from "@/components/Ayuda";
import { COLOR_ALZA, COLOR_BAJA, COLOR_NEUTRO, FilaCifras, flechaPct, irALaTabla, TONO_DELTA } from "@/components/ResumenCifras";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { BarrasHorizontalesComparadas, ColumnasComparadas, DonaDistribucion, type SegmentoDistribucion } from "@/components/ui/Graficos";
import type { CambiosUrl } from "@/components/useResumenUrl";
import { ayudaRotacionComparada, formatoRotacion, formatoSellThrough, formatoSolesCompacto, pluralizar, textoUniversoRotacion, textoUniversoSellThrough } from "@/lib/resumen-formato";
import type { ComparacionParaPantalla, DireccionRitmo } from "@/lib/resumen-comparacion";
import { ETIQUETA_ROTACION_VALORIZADA, TEXTO_FORMULA_ROTACION } from "@/lib/rotacion";

// La parte de arriba de la comparación: primero A → B (en `ResumenControles`, arriba), después qué cambió
// globalmente (las cuatro cifras) y después cómo se distribuyó ese cambio (evolución del ritmo, top rotación y
// sell-through), los tres gráficos en una fila como en la guía oficial (2026-09-22). Qué productos lo explican
// está justo debajo, en `ResumenComparacionDetalle`. Nada de acá depende del filtro de la tabla: tocar un
// segmento de la dona filtra la tabla y lleva la vista a ella, nunca recalcula estos números.

const DIRECCIONES: readonly { d: DireccionRitmo; texto: string; flecha: string; color: string }[] = [
  { d: "acelero", texto: "Aceleraron", flecha: "↑", color: COLOR_ALZA },
  { d: "estable", texto: "Estables", flecha: "→", color: COLOR_NEUTRO },
  { d: "desacelero", texto: "Desaceleraron", flecha: "↓", color: COLOR_BAJA },
];

export const ID_TABLA_COMPARACION = "detalle-titulo";

export function ResumenComparacionGeneral({ datos, actualizar }: { datos: ComparacionParaPantalla; actualizar: (cambios: CambiosUrl) => void }) {
  const { kpis, evolucion, ranking, distribucion, periodoA, periodoB } = datos;
  const { capital } = kpis;

  /** La dona y «Ver ranking» cambian la tabla de abajo y llevan la vista hasta ella. */
  const aLaTabla = (cambios: CambiosUrl) => {
    actualizar(cambios);
    irALaTabla(ID_TABLA_COMPARACION);
  };

  const deltaCapital = capital.verificado ? capital.delta : capital.unidadesB - capital.unidadesA;
  const textoDeltaCapital = (() => {
    if (Math.round(deltaCapital) === 0) return "sin cambio";
    const flechaCapital = deltaCapital > 0 ? "↑" : "↓";
    return capital.verificado ? `${flechaCapital} ${formatoSolesCompacto(Math.abs(deltaCapital))}` : `${flechaCapital} ${pluralizar(Math.abs(deltaCapital), "unidad", "unidades")}`;
  })();

  const deltaVentas = flechaPct(kpis.ventas.deltaPct);
  const deltaRotacion = flechaPct(kpis.rotacion.deltaPct);
  const deltaSellThrough = flechaPct(kpis.sellThrough.deltaPp, " pp");

  const segmentos: SegmentoDistribucion[] = DIRECCIONES.map((x) => ({ clave: x.d, valor: evolucion[x.d], color: x.color, etiqueta: x.texto }));
  const hayDistribucionSellThrough = distribucion.rangos.some((r) => r.a + r.b > 0);
  const sinDatoSellThrough = distribucion.sinDato.a + distribucion.sinDato.b;

  return (
    <div className="space-y-3">
      <FilaCifras>
        <TarjetaCifra
          className="anim-entra"
          style={{ "--i": 0 } as CSSProperties}
          etiqueta="Ventas"
          ayuda={<Ayuda titulo="Ventas">Lo cobrado (precio − descuento) menos lo devuelto, en cada período.</Ayuda>}
          antes={formatoSolesCompacto(kpis.ventas.a)}
          valor={formatoSolesCompacto(kpis.ventas.b)}
          detalleTono={TONO_DELTA[deltaVentas.tono]}
          pie={`${kpis.ventas.unidadesA.toLocaleString("en-US")} → ${kpis.ventas.unidadesB.toLocaleString("en-US")} unidades`}
        >
          {deltaVentas.texto}
        </TarjetaCifra>
        <TarjetaCifra
          className="anim-entra"
          style={{ "--i": 1 } as CSSProperties}
          etiqueta={ETIQUETA_ROTACION_VALORIZADA}
          ayuda={<Ayuda titulo={ETIQUETA_ROTACION_VALORIZADA}>{ayudaRotacionComparada(kpis.rotacion)}</Ayuda>}
          antes={kpis.rotacion.a === null ? "N/D" : formatoRotacion(kpis.rotacion.a)}
          valor={kpis.rotacion.b === null ? "N/D" : formatoRotacion(kpis.rotacion.b)}
          detalleTono={TONO_DELTA[deltaRotacion.tono]}
          pie={textoUniversoRotacion(kpis.rotacion) ?? TEXTO_FORMULA_ROTACION}
        >
          {deltaRotacion.texto}
        </TarjetaCifra>
        <TarjetaCifra
          className="anim-entra"
          style={{ "--i": 2 } as CSSProperties}
          etiqueta="Sell-through"
          ayuda={
            <Ayuda titulo="Sell-through">
              Qué parte de lo disponible se vendió: ventas netas ÷ (stock al inicio del período + entradas), en A y en B. La diferencia va en puntos porcentuales (pp).
            </Ayuda>
          }
          antes={kpis.sellThrough.a === null ? "N/D" : formatoSellThrough(kpis.sellThrough.a)}
          valor={kpis.sellThrough.b === null ? "N/D" : formatoSellThrough(kpis.sellThrough.b)}
          detalleTono={TONO_DELTA[deltaSellThrough.tono]}
          pie={textoUniversoSellThrough(kpis.sellThrough) ?? "Ventas netas ÷ (stock inicial + entradas)"}
        >
          {deltaSellThrough.texto}
        </TarjetaCifra>
        {capital.verificado ? (
          <TarjetaCifra
            className="anim-entra"
            style={{ "--i": 3 } as CSSProperties}
            etiqueta="Capital en inventario"
            ayuda={<Ayuda titulo="Capital en inventario">Stock al cierre valorado al costo actual de cada prenda.</Ayuda>}
            antes={formatoSolesCompacto(capital.a)}
            valor={formatoSolesCompacto(capital.b)}
            // Más capital no es bueno ni malo por sí solo: el tono queda neutro.
            detalleTono={TONO_DELTA.neutro}
            pie="Al costo, al cierre de cada período"
          >
            {textoDeltaCapital}
          </TarjetaCifra>
        ) : (
          <TarjetaCifra
            className="anim-entra"
            style={{ "--i": 3 } as CSSProperties}
            etiqueta="Unidades en stock"
            ayuda={<Ayuda titulo="Unidades en stock">Al cierre de cada período.</Ayuda>}
            antes={capital.unidadesA.toLocaleString("en-US")}
            valor={capital.unidadesB.toLocaleString("en-US")}
            detalleTono={TONO_DELTA.neutro}
            pie={capital.alterado > 0 ? "Sin capital a costo: hay costos modificados por fuera del promedio ponderado" : "Sin capital a costo: hay prendas con stock sin costo cargado"}
          >
            {textoDeltaCapital}
          </TarjetaCifra>
        )}
      </FilaCifras>

      <div className="grid gap-3 lg:grid-cols-3">
        <Bloque titulo="Evolución del ritmo de venta" subtitulo="Cómo cambió el ritmo de cada variante, de A a B · toca para filtrar la tabla">
          {evolucion.total === 0 ? (
            <p className="text-sm text-taupe">Sin datos suficientes para comparar este período.</p>
          ) : (
            <div className="anim-entra flex flex-wrap items-center gap-5" style={{ "--i": 4 } as CSSProperties}>
              <DonaDistribucion segmentos={segmentos} centro={{ valor: String(evolucion.total), etiqueta: "variantes" }} onSegmento={(clave) => aLaTabla({ cambio: clave })} />
              <ul className="min-w-[10rem] flex-1 space-y-0.5">
                {DIRECCIONES.map((x) => {
                  const n = evolucion[x.d];
                  const pct = evolucion.total > 0 ? Math.round((n / evolucion.total) * 100) : 0;
                  return (
                    <li key={x.d}>
                      <button
                        type="button"
                        onClick={() => aLaTabla({ cambio: x.d })}
                        disabled={n === 0}
                        aria-pressed={datos.cambio === x.d}
                        className="flex w-full items-center justify-between gap-3 rounded-sm px-1.5 py-1.5 text-left text-sm transition-colors enabled:hover:bg-tinta/[0.04] disabled:cursor-default aria-pressed:bg-tinta/[0.05] focus-visible:outline focus-visible:outline-2 focus-visible:outline-tinta/40"
                      >
                        <span className="flex items-center gap-2 whitespace-nowrap text-tinta">
                          <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: x.color }} />
                          <span aria-hidden>{x.flecha}</span> {x.texto}
                        </span>
                        <span className="whitespace-nowrap tabular-nums text-taupe">
                          {n} · {pct}%
                        </span>
                      </button>
                    </li>
                  );
                })}
                {evolucion.sinDato > 0 && <li className="px-1.5 pt-1 text-[11px] leading-4 text-taupe">{pluralizar(evolucion.sinDato, "variante no entra", "variantes no entran")}: sin ventas suficientes en A y en B para medir su ritmo.</li>}
              </ul>
            </div>
          )}
        </Bloque>

        <Bloque
          titulo="Top rotación"
          subtitulo={`Rotación A → B · ${periodoB.etiquetaCorta}`}
          enlace={ranking.length > 0 ? { texto: "Ver ranking", onClick: () => aLaTabla({ orden: "rotacion_b", cambio: null }) } : undefined}
        >
          {ranking.length === 0 ? (
            <p className="text-sm text-taupe">Ninguna prenda rotó en B: hace falta stock y ventas dentro del período.</p>
          ) : (
            <BarrasHorizontalesComparadas
              etiquetaA={periodoA.etiqueta}
              etiquetaB={periodoB.etiquetaCorta}
              barras={ranking.map((x) => ({
                clave: x.fila.varianteId,
                etiqueta: x.fila.referencia,
                detalle: [x.fila.color, x.fila.talla].filter(Boolean).join(" · ") || null,
                a: x.a.rotacion,
                b: x.b.rotacion!,
                textoA: x.a.rotacion === null ? "N/D" : formatoRotacion(x.a.rotacion),
                textoB: formatoRotacion(x.b.rotacion!),
              }))}
            />
          )}
        </Bloque>

        <Bloque titulo="Distribución de sell-through" subtitulo="Variantes por tramo, misma escala en A y en B">
          {!hayDistribucionSellThrough ? (
            <p className="text-sm text-taupe">Sin datos suficientes para comparar este período.</p>
          ) : (
            <>
              <ColumnasComparadas grupos={distribucion.rangos.map((r) => ({ clave: r.clave, etiqueta: r.texto, a: r.a, b: r.b }))} etiquetaA={periodoA.etiqueta} etiquetaB={periodoB.etiquetaCorta} />
              {sinDatoSellThrough > 0 && (
                <p className="mt-3 text-xs text-taupe">
                  No entran al gráfico {pluralizar(distribucion.sinDato.a, "variante", "variantes")} en A y {pluralizar(distribucion.sinDato.b, "variante", "variantes")} en B: sin sell-through calculable.
                </p>
              )}
            </>
          )}
        </Bloque>
      </div>
    </div>
  );
}
