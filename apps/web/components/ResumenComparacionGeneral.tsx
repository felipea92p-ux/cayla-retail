"use client";

import type { CSSProperties, ReactNode } from "react";
import { Bloque } from "@/components/ResumenBloques";
import { BarrasHorizontalesComparadas, ColumnasComparadas, DonaDistribucion, type SegmentoDistribucion } from "@/components/ui/Graficos";
import type { CambiosUrl } from "@/components/useResumenUrl";
import { ayudaRotacionComparada, formatoDeltaPp, formatoRotacion, formatoSellThrough, formatoSolesCompacto, pluralizar, textoUniversoRotacion, textoUniversoSellThrough } from "@/lib/resumen-formato";
import type { ComparacionParaPantalla, DireccionRitmo } from "@/lib/resumen-comparacion";
import { TEXTO_FORMULA_ROTACION } from "@/lib/rotacion";

// Vista general de la comparación: primero A → B (en `ResumenControles`, arriba), después qué cambió
// globalmente (los cuatro KPI), después cómo se distribuyó ese cambio (evolución del ritmo y
// sell-through) y por último qué productos lo explican (top rotación, y «Ver ranking completo» al
// detalle). Ese orden es la jerarquía de lectura de toda la pantalla: ninguna pieza pesa lo mismo que la
// anterior. Nada de acá depende del filtro que se toque en el detalle — tocar un segmento de la dona
// solo abre el detalle con ese filtro puesto, nunca recalcula estos números.

/** «↑ 18%», «↓ 5%», «sin cambio», «N/D» — variación relativa, con flecha. */
function flecha(pct: number | null): string {
  if (pct === null) return "N/D";
  const n = Math.round(pct);
  if (n === 0) return "sin cambio";
  return `${n > 0 ? "↑" : "↓"} ${Math.abs(n)}%`;
}

/** Igual que `flecha`, pero para una diferencia en puntos porcentuales (sell-through). */
function flechaPp(pp: number | null): string {
  if (pp === null) return "N/D";
  const n = Math.round(pp);
  if (n === 0) return "sin cambio";
  return `${n > 0 ? "↑" : "↓"} ${formatoDeltaPp(pp).replace(/^[+−]/, "")}`;
}

const tonoPct = (pct: number | null) => (pct !== null && Math.round(pct) > 0 ? "text-verde-profundo" : "text-tinta/70");

function TarjetaKpi({ i, titulo, a, b, delta, tonoDelta = "text-tinta/70", pie, ayuda }: { i: number; titulo: string; a: string; b: string; delta: string; tonoDelta?: string; pie?: ReactNode; ayuda?: string }) {
  return (
    <div className="anim-entra card-cayla flex min-w-0 flex-col p-4" title={ayuda} style={{ "--i": i } as CSSProperties}>
      <p className="label-cayla text-[11px] leading-4 text-tinta/75">{titulo}</p>
      {/* La cifra no se parte nunca («S/ 18.4k» en dos líneas se lee como dos cifras); si A → B no cabe junto, B baja. */}
      <p className="mt-1 flex flex-wrap items-baseline gap-x-2 font-display text-[1.45rem] leading-tight tabular-nums">
        <span className="whitespace-nowrap text-tinta/55">
          <span className="sr-only">Antes: </span>
          {a}
        </span>
        <span className="whitespace-nowrap text-tinta">
          <span aria-hidden className="text-tinta/40">
            →{" "}
          </span>
          <span className="sr-only">Ahora: </span>
          {b}
        </span>
      </p>
      <p className={`mt-1 text-sm ${tonoDelta}`}>{delta}</p>
      <p className="mt-auto min-h-4 pt-0.5 text-[11px] leading-4 text-tinta/60">{pie}</p>
    </div>
  );
}

const COLOR_RITMO: Record<DireccionRitmo, string> = { acelero: "var(--color-verde)", estable: "var(--color-taupe)", desacelero: "var(--color-ambar)" };
const ETIQUETA_RITMO: Record<DireccionRitmo, string> = { acelero: "Aceleraron", estable: "Estables", desacelero: "Desaceleraron" };
const DIRECCIONES: readonly DireccionRitmo[] = ["acelero", "estable", "desacelero"];

export function ResumenComparacionGeneral({ datos, actualizar }: { datos: ComparacionParaPantalla; actualizar: (cambios: CambiosUrl) => void }) {
  const { kpis, evolucion, ranking, distribucion, periodoA, periodoB } = datos;
  const { capital } = kpis;

  const aDetalle = (cambios: CambiosUrl) => actualizar({ vista: "detalle", ...cambios });

  const deltaCapital = capital.verificado ? capital.delta : capital.unidadesB - capital.unidadesA;
  const textoDeltaCapital = (() => {
    if (Math.round(deltaCapital) === 0) return "sin cambio";
    const flechaCapital = deltaCapital > 0 ? "↑" : "↓";
    return capital.verificado ? `${flechaCapital} ${formatoSolesCompacto(Math.abs(deltaCapital))}` : `${flechaCapital} ${pluralizar(Math.abs(deltaCapital), "unidad", "unidades")}`;
  })();

  const segmentos: SegmentoDistribucion[] = DIRECCIONES.map((d) => ({ clave: d, valor: evolucion[d], color: COLOR_RITMO[d] }));
  const hayDistribucionSellThrough = distribucion.rangos.some((r) => r.a + r.b > 0);
  const sinDatoSellThrough = distribucion.sinDato.a + distribucion.sinDato.b;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 min-[560px]:grid-cols-2 min-[1100px]:grid-cols-4">
        <TarjetaKpi
          i={0}
          titulo="Ventas"
          a={formatoSolesCompacto(kpis.ventas.a)}
          b={formatoSolesCompacto(kpis.ventas.b)}
          delta={flecha(kpis.ventas.deltaPct)}
          tonoDelta={tonoPct(kpis.ventas.deltaPct)}
          pie={`${kpis.ventas.unidadesA.toLocaleString("en-US")} → ${kpis.ventas.unidadesB.toLocaleString("en-US")} uds`}
          ayuda="Lo cobrado (precio − descuento) menos lo devuelto, en cada período."
        />
        <TarjetaKpi
          i={1}
          titulo="Rotación"
          a={kpis.rotacion.a === null ? "N/D" : formatoRotacion(kpis.rotacion.a)}
          b={kpis.rotacion.b === null ? "N/D" : formatoRotacion(kpis.rotacion.b)}
          delta={flecha(kpis.rotacion.deltaPct)}
          tonoDelta={tonoPct(kpis.rotacion.deltaPct)}
          pie={textoUniversoRotacion(kpis.rotacion) ?? TEXTO_FORMULA_ROTACION}
          ayuda={ayudaRotacionComparada(kpis.rotacion)}
        />
        <TarjetaKpi
          i={2}
          titulo="Sell-through"
          a={kpis.sellThrough.a === null ? "N/D" : formatoSellThrough(kpis.sellThrough.a)}
          b={kpis.sellThrough.b === null ? "N/D" : formatoSellThrough(kpis.sellThrough.b)}
          delta={flechaPp(kpis.sellThrough.deltaPp)}
          tonoDelta={tonoPct(kpis.sellThrough.deltaPp)}
          pie={textoUniversoSellThrough(kpis.sellThrough) ?? "Ventas netas ÷ (stock inicial + entradas)"}
          ayuda="Qué parte de lo disponible se vendió: ventas netas ÷ (stock al inicio del período + entradas), en A y en B."
        />
        {capital.verificado ? (
          <TarjetaKpi
            i={3}
            titulo="Capital en inventario"
            a={formatoSolesCompacto(capital.a)}
            b={formatoSolesCompacto(capital.b)}
            delta={textoDeltaCapital}
            pie="Al costo, al cierre de cada período"
            ayuda="Stock al cierre valorado al costo actual de cada prenda."
          />
        ) : (
          <TarjetaKpi
            i={3}
            titulo="Unidades en stock"
            a={capital.unidadesA.toLocaleString("en-US")}
            b={capital.unidadesB.toLocaleString("en-US")}
            delta={textoDeltaCapital}
            pie={capital.alterado > 0 ? "Capital a costo no disponible: hay costos modificados por fuera del promedio ponderado" : "Capital a costo no disponible: hay prendas con stock sin costo cargado"}
            ayuda="Al cierre de cada período."
          />
        )}
      </div>

      <div className="grid gap-3 lg:grid-cols-5">
        <Bloque titulo="Evolución del ritmo de venta" subtitulo="Cómo cambió el ritmo de cada variante, de A a B" className="lg:col-span-2">
          {evolucion.total === 0 ? (
            <p className="text-sm text-tinta/60">Sin datos suficientes para comparar este período.</p>
          ) : (
            <div className="anim-entra flex flex-col items-center gap-5 @container" style={{ "--i": 4 } as CSSProperties}>
              <DonaDistribucion segmentos={segmentos} centro={{ valor: String(evolucion.total), etiqueta: "variantes analizadas" }} onSegmento={(clave) => aDetalle({ cambio: clave })} />
              <ul className="w-full space-y-1">
                {DIRECCIONES.map((d, i) => {
                  const n = evolucion[d];
                  const pct = evolucion.total > 0 ? Math.round((n / evolucion.total) * 100) : 0;
                  return (
                    <li key={d} className="anim-entra" style={{ "--i": i + 5 } as CSSProperties}>
                      <button
                        type="button"
                        onClick={() => aDetalle({ cambio: d })}
                        disabled={n === 0}
                        className="flex w-full items-center justify-between gap-3 rounded-sm px-1.5 py-1.5 text-left transition-colors enabled:hover:bg-tinta/[0.03] disabled:cursor-default focus-visible:outline focus-visible:outline-2 focus-visible:outline-tinta/40"
                      >
                        <span className="flex min-w-0 items-center gap-2 text-sm text-tinta/85">
                          <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: COLOR_RITMO[d] }} />
                          {ETIQUETA_RITMO[d]}
                        </span>
                        <span className="shrink-0 text-sm tabular-nums text-tinta/65">
                          {n} · {pct}%
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              {evolucion.sinDato > 0 && (
                <p className="w-full text-[11px] leading-4 text-tinta/55">{pluralizar(evolucion.sinDato, "variante no entra", "variantes no entran")} al gráfico: sin ventas suficientes en A y en B para medir su ritmo.</p>
              )}
            </div>
          )}
        </Bloque>

        <Bloque
          titulo="Top rotación"
          subtitulo={`Rotación A → B · ${periodoB.etiquetaCorta}`}
          enlace={ranking.length > 0 ? { texto: "Ver ranking completo", onClick: () => aDetalle({ orden: "rotacion_b", cambio: null }) } : undefined}
          className="lg:col-span-3"
        >
          {ranking.length === 0 ? (
            <p className="text-sm text-tinta/60">Ninguna prenda rotó en B: hace falta stock y ventas dentro del período.</p>
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
      </div>

      <Bloque titulo="Distribución de sell-through" subtitulo="Variantes según qué parte de lo disponible vendieron, en cada período · misma escala en A y en B">
        {!hayDistribucionSellThrough ? (
          <p className="text-sm text-tinta/60">Sin datos suficientes para comparar este período.</p>
        ) : (
          <>
            <ColumnasComparadas grupos={distribucion.rangos.map((r) => ({ clave: r.clave, etiqueta: r.texto, a: r.a, b: r.b }))} etiquetaA={periodoA.etiqueta} etiquetaB={periodoB.etiquetaCorta} />
            {sinDatoSellThrough > 0 && (
              <p className="mt-3 text-xs text-tinta/60">
                No entran al gráfico {pluralizar(distribucion.sinDato.a, "variante", "variantes")} en A y {pluralizar(distribucion.sinDato.b, "variante", "variantes")} en B: no tienen sell-through calculable en ese período.
              </p>
            )}
          </>
        )}
      </Bloque>
    </div>
  );
}
