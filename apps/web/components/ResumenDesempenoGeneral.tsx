"use client";

import type { CSSProperties } from "react";
import { Bloque } from "@/components/ResumenBloques";
import { COLOR_ALZA, COLOR_BAJA, COLOR_NEUTRO, FilaCifras, flechaPct, irALaTabla, TarjetaCifraAnalisis } from "@/components/ResumenCifras";
import { BarrasHorizontales, Columnas, DonaDistribucion, type SegmentoDistribucion } from "@/components/ui/Graficos";
import type { CambiosUrl } from "@/components/useResumenUrl";
import { formatoRotacion, formatoSellThrough, formatoSolesCompacto, pluralizar, textoUniversoRotacion } from "@/lib/resumen-formato";
import type { DesempenoParaPantalla, DireccionTendencia } from "@/lib/resumen-desempeno";
import { AYUDA_ROTACION, TEXTO_FORMULA_ROTACION } from "@/lib/rotacion";

// Desempeño › cifras y gráficos (rediseño 2026-09-22, opción A de Felipe: «misma anatomía que Comparar»). Arriba
// cuatro cifras del período; debajo, cómo se repartió: la tendencia dentro del período, quién más rotó y cómo se
// distribuyó el sell-through. La tabla de abajo (`ResumenComportamiento`) dice en qué productos. Todo sale de
// `lib/resumen-desempeno.ts` sobre el alcance (categoría y búsqueda): la banda de sell-through de la tabla no mueve
// ninguna cifra de acá.

const DIRECCIONES: readonly { d: DireccionTendencia; texto: string; flecha: string; color: string }[] = [
  { d: "alza", texto: "Aceleraron", flecha: "↑", color: COLOR_ALZA },
  { d: "estable", texto: "Estables", flecha: "→", color: COLOR_NEUTRO },
  { d: "baja", texto: "Desaceleraron", flecha: "↓", color: COLOR_BAJA },
];

export const ID_TABLA_DESEMPENO = "comportamiento-titulo";

export function ResumenDesempenoGeneral({ datos, actualizar }: { datos: DesempenoParaPantalla; actualizar: (cambios: CambiosUrl) => void }) {
  const { kpis, tendencias, ranking, distribucion, periodo, tendenciaDisponible } = datos;
  const { ventas, rotacion, sellThrough, capital } = kpis;

  const cambioVentas = flechaPct(ventas.cambioMitadPct);
  const cantidad = { alza: tendencias.alza, estable: tendencias.estable, baja: tendencias.baja };
  const segmentos: SegmentoDistribucion[] = DIRECCIONES.map((x) => ({ clave: x.d, valor: cantidad[x.d], color: x.color }));
  const hayDistribucion = distribucion.rangos.some((r) => r.n > 0);

  return (
    <div className="space-y-3">
      <FilaCifras>
        <TarjetaCifraAnalisis
          i={0}
          titulo="Ventas del período"
          cifra={formatoSolesCompacto(ventas.importe)}
          delta={ventas.cambioMitadPct === null ? undefined : { texto: `2.ª mitad ${cambioVentas.texto}`, tono: cambioVentas.tono }}
          pie={`${pluralizar(ventas.unidades, "unidad", "unidades")} · ${formatoSolesCompacto(ventas.primeraMitad)} → ${formatoSolesCompacto(ventas.segundaMitad)} por mitad`}
          ayuda="Lo cobrado (precio − descuento) menos lo devuelto. La 2.ª mitad del período se compara con la 1.ª por día, para que mitades de distinto largo sean comparables."
        />
        <TarjetaCifraAnalisis
          i={1}
          titulo="Rotación"
          cifra={rotacion.veces === null ? "N/D" : formatoRotacion(rotacion.veces)}
          pie={textoUniversoRotacion(rotacion) ?? TEXTO_FORMULA_ROTACION}
          ayuda={`Veces que rotó el inventario en el período. ${AYUDA_ROTACION}`}
        />
        <TarjetaCifraAnalisis
          i={2}
          titulo="Sell-through"
          cifra={sellThrough.pct === null ? "N/D" : formatoSellThrough(sellThrough.pct)}
          pie={`${sellThrough.vendidas.toLocaleString("en-US")} de ${sellThrough.disponibles.toLocaleString("en-US")} u. disponibles se vendieron`}
          ayuda={`Ventas netas ÷ (stock al inicio + entradas), sobre la suma de las variantes con dato${sellThrough.excluidas > 0 ? `; ${pluralizar(sellThrough.excluidas, "variante con cifras estimadas queda", "variantes con cifras estimadas quedan")} fuera` : ""}.`}
        />
        {capital.verificado ? (
          <TarjetaCifraAnalisis
            i={3}
            titulo="Capital al cierre"
            cifra={formatoSolesCompacto(capital.cierre)}
            delta={{ texto: `al inicio ${formatoSolesCompacto(capital.inicio)}`, tono: "neutro" }}
            pie="Stock al costo al terminar el período"
            ayuda="Stock (piso + almacén) al cierre, valorado al costo de cada prenda. Más capital no es bueno ni malo por sí solo: depende de si rota."
          />
        ) : (
          <TarjetaCifraAnalisis
            i={3}
            titulo="Unidades al cierre"
            cifra={capital.unidadesCierre.toLocaleString("en-US")}
            delta={{ texto: `al inicio ${capital.unidadesInicio.toLocaleString("en-US")}`, tono: "neutro" }}
            pie={capital.alterado > 0 ? "Sin capital a costo: hay costos modificados por fuera del promedio ponderado" : "Sin capital a costo: hay prendas con stock sin costo cargado"}
          />
        )}
      </FilaCifras>

      <div className="grid gap-3 lg:grid-cols-3">
        <Bloque titulo="Tendencia dentro del período" subtitulo="La 2.ª mitad frente a la 1.ª, por variante">
          {!tendenciaDisponible ? (
            <p className="text-sm text-taupe">Un período de un solo día no tiene mitades que comparar.</p>
          ) : tendencias.total === 0 ? (
            <p className="text-sm text-taupe">Ninguna variante vendió lo suficiente para afirmar una tendencia.</p>
          ) : (
            <div className="anim-entra flex flex-wrap items-center gap-5" style={{ "--i": 4 } as CSSProperties}>
              <DonaDistribucion segmentos={segmentos} centro={{ valor: String(tendencias.total), etiqueta: "variantes" }} />
              <ul className="min-w-[10rem] flex-1 space-y-1.5">
                {DIRECCIONES.map((x) => {
                  const n = cantidad[x.d];
                  return (
                    <li key={x.d} className="flex items-center justify-between gap-3 text-sm">
                      <span className="flex items-center gap-2 whitespace-nowrap text-tinta">
                        <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: x.color }} />
                        <span aria-hidden>{x.flecha}</span> {x.texto}
                      </span>
                      <span className="whitespace-nowrap tabular-nums text-taupe">
                        {n} · {Math.round((n / tendencias.total) * 100)}%
                      </span>
                    </li>
                  );
                })}
                {tendencias.sinDato > 0 && <li className="pt-1 text-[11px] leading-4 text-taupe">{pluralizar(tendencias.sinDato, "variante vendió", "variantes vendieron")} muy poco para afirmar una tendencia.</li>}
              </ul>
            </div>
          )}
        </Bloque>

        <Bloque
          titulo="Top rotación"
          subtitulo={`Veces que rotó en ${pluralizar(periodo.dias, "día", "días")}`}
          enlace={
            ranking.length > 0
              ? {
                  texto: "Ver ranking",
                  onClick: () => {
                    actualizar({ orden: "rotacion_mayor" });
                    irALaTabla(ID_TABLA_DESEMPENO);
                  },
                }
              : undefined
          }
        >
          {ranking.length === 0 ? (
            <p className="text-sm text-taupe">Ninguna prenda rotó en este período: hace falta stock y ventas dentro del período.</p>
          ) : (
            <BarrasHorizontales
              barras={ranking.map((x) => ({
                clave: x.fila.varianteId,
                etiqueta: x.fila.referencia,
                detalle: [x.fila.color, x.fila.talla].filter(Boolean).join(" · ") || null,
                valor: x.periodo.rotacion!,
                texto: formatoRotacion(x.periodo.rotacion!),
              }))}
            />
          )}
        </Bloque>

        <Bloque titulo="Distribución de sell-through" subtitulo="Variantes según qué parte de lo disponible vendieron">
          {!hayDistribucion ? (
            <p className="text-sm text-taupe">Ninguna variante tiene sell-through calculable en este período.</p>
          ) : (
            <>
              <Columnas columnas={distribucion.rangos.map((r) => ({ clave: r.clave, etiqueta: r.texto, valor: r.n }))} />
              {distribucion.sinDato > 0 && <p className="mt-3 text-xs text-taupe">No entran al gráfico {pluralizar(distribucion.sinDato, "variante", "variantes")} sin sell-through calculable.</p>}
            </>
          )}
        </Bloque>
      </div>
    </div>
  );
}
