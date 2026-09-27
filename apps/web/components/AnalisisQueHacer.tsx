"use client";

import Link from "next/link";
import { ArrowRight, ChevronDown, Clock3 } from "lucide-react";
import type { CSSProperties } from "react";
import { PUNTO_GRUPO } from "@/components/AnalisisAcciones";
import { Bloque } from "@/components/ResumenBloques";
import { COLOR_ALZA, COLOR_BAJA, COLOR_NEUTRO, flechaPct, irALaTabla, TarjetaCifraAnalisis } from "@/components/ResumenCifras";
import { BarrasHorizontales, Columnas, DonaDistribucion, type SegmentoDistribucion } from "@/components/ui/Graficos";
import type { CambiosUrl } from "@/components/useResumenUrl";
import { GRUPOS_TRABAJO, INFO_GRUPO, type GrupoQueHacer } from "@/lib/analisis-que-hacer";
import type { DesempenoParaPantalla, DireccionTendencia } from "@/lib/resumen-desempeno";
import { formatoRotacion, formatoSolesCompacto, pluralizar, textoUniversoRotacion } from "@/lib/resumen-formato";
import { ETIQUETA_ROTACION_VALORIZADA, TEXTO_FORMULA_ROTACION } from "@/lib/rotacion";

// Desempeño conectado (ADR-0245, lo que Felipe eligió sobre el spike): cuatro cifras en palabras de tienda, «Qué hacer»
// —los grupos de trabajo que filtran la tabla— y, plegados debajo, los gráficos del período. Las cifras técnicas que
// estaban arriba (rotación valorizada, capital al costo) bajan a los gráficos plegados: siguen, pero no son lo primero
// que ve quien vende.

export const ID_TABLA_ANALISIS = "tabla-analisis";

export function AnalisisCifras({ datos, esLider, actualizar }: { datos: DesempenoParaPantalla; esLider: boolean; actualizar: (c: CambiosUrl) => void }) {
  const { kpis, cifrasAccion: c } = datos;
  const cambio = flechaPct(kpis.ventas.cambioMitadPct);
  return (
    // 2 × 2 en el celular (no una columna de cuatro: empujaba «Qué hacer» casi dos pantallas abajo); la cifra grande es
    // solo el número y la palabra va en el pie, para que quepa en media pantalla de 375 px.
    <div className="grid grid-cols-2 gap-2 sm:gap-3 min-[1100px]:grid-cols-4">
      <TarjetaCifraAnalisis
        i={0}
        titulo="Vendido"
        cifra={formatoSolesCompacto(kpis.ventas.importe)}
        delta={kpis.ventas.cambioMitadPct === null ? undefined : { texto: `2.ª mitad ${cambio.texto}`, tono: cambio.tono }}
        pie={`${pluralizar(kpis.ventas.unidades, "unidad", "unidades")} en ${pluralizar(datos.periodo.dias, "día", "días")}`}
        ayuda="Lo cobrado menos lo devuelto. La 2.ª mitad del período se compara con la 1.ª por día."
      />
      <TarjetaCifraAnalisis
        i={1}
        titulo="Vendió de lo colgado"
        cifra={c.colgado.pct === null ? "—" : `${Math.round(c.colgado.pct)}%`}
        pie={
          c.colgado.pct === null
            ? "Aún no hay prendas con 7 días colgadas"
            : `${c.colgado.vendido.toLocaleString("en-US")} de ${c.colgado.disponible.toLocaleString("en-US")} u. que estuvieron en el piso`
        }
        ayuda="Sell-through de exposición: de lo que estuvo colgado al menos 7 días, cuánto se vendió. Lo recién colgado no cuenta todavía."
      />
      <button
        type="button"
        onClick={() => {
          actualizar({ grupo: "agotada" });
          irALaTabla(ID_TABLA_ANALISIS);
        }}
        // La tarjeta se estira al alto de las otras tres (el botón no lo hace solo).
        className="flex text-left [&>div]:flex-1"
      >
        <TarjetaCifraAnalisis
          i={2}
          titulo="Piden algo hoy"
          cifra={String(c.pidenAlgo)}
          pie={c.pidenAlgo === 0 ? "Nada agotado, guardado ni quieto" : `${c.pidenAlgo === 1 ? "prenda se agotó, duerme" : "prendas se agotaron, duermen"} en almacén o está${c.pidenAlgo === 1 ? "" : "n"} quieta${c.pidenAlgo === 1 ? "" : "s"}`}
          ayuda="Prendas en «Se agotaron», «Duermen en almacén» o «Estancadas». Toca para verlas."
        />
      </button>
      <TarjetaCifraAnalisis
        i={3}
        titulo="Quieto sin vender"
        cifra={esLider && c.quieto.costo !== null ? formatoSolesCompacto(c.quieto.costo) : String(c.quieto.unidades)}
        pie={esLider && c.quieto.costo !== null ? `${pluralizar(c.quieto.unidades, "unidad", "unidades")} a costo, estancadas` : `${c.quieto.unidades === 1 ? "unidad" : "unidades"} 14 días o más colgadas sin venta`}
        ayuda="Lo que quedó al cierre en las prendas estancadas. El líder lo ve al costo cuando todas tienen costo confiable."
      />
    </div>
  );
}

export function AnalisisGrupos({
  datos,
  pedidosNoAtendidos,
  actualizar,
}: {
  datos: DesempenoParaPantalla;
  /** Pendientes de «Pedidos no atendidos» (lo que la clienta pidió y no había); null = la lectura falló, la tarjeta no sale. */
  pedidosNoAtendidos: number | null;
  actualizar: (c: CambiosUrl) => void;
}) {
  const { grupos } = datos.cifrasAccion;
  const elegir = (g: GrupoQueHacer) => {
    actualizar({ grupo: datos.grupo === g ? null : g });
    irALaTabla(ID_TABLA_ANALISIS);
  };
  const tarjeta = "anim-entra card-cayla flex min-w-0 flex-col gap-1 p-3.5 text-left transition-colors hover:border-taupe sm:p-4";
  return (
    <section aria-labelledby="que-hacer-titulo" className="space-y-2.5">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
        <h2 id="que-hacer-titulo" className="font-display text-[1.35rem] leading-tight text-tinta">
          Qué hacer
        </h2>
        <p className="text-xs text-tinta/65">Toca un grupo: la tabla muestra solo esas prendas, cada una con su botón.</p>
      </div>
      <div className="grid grid-cols-1 gap-2 min-[560px]:grid-cols-2 min-[1100px]:grid-cols-5 sm:gap-3">
        {GRUPOS_TRABAJO.map((g, i) => {
          const info = INFO_GRUPO[g];
          const activo = datos.grupo === g;
          return (
            <button
              key={g}
              type="button"
              onClick={() => elegir(g)}
              aria-pressed={activo}
              style={{ "--i": i } as CSSProperties}
              className={`${tarjeta} ${activo ? "border-tinta bg-hueso ring-1 ring-inset ring-tinta" : ""}`}
            >
              <span className="flex items-center gap-2 text-[13px] font-semibold text-tinta">
                <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${PUNTO_GRUPO[g]}`} />
                {info.titulo}
                <span className="ml-auto font-display text-[1.5rem] leading-none tabular-nums min-[1100px]:hidden">{grupos[g]}</span>
              </span>
              <span className="hidden font-display text-[1.75rem] leading-tight tabular-nums text-tinta min-[1100px]:block">
                {grupos[g]} <span className="font-sans text-xs text-taupe">{grupos[g] === 1 ? "prenda" : "prendas"}</span>
              </span>
              <span className="text-xs leading-snug text-taupe">{info.que}</span>
              <span className="mt-auto hidden items-center gap-1 pt-1 text-[12.5px] font-semibold text-tinta sm:flex">
                {activo ? "Ver todas" : info.accion} <ArrowRight aria-hidden className="h-3.5 w-3.5" />
              </span>
            </button>
          );
        })}
        {pedidosNoAtendidos !== null && (
          <Link href="/pedidos-no-atendidos" style={{ "--i": 4 } as CSSProperties} className={tarjeta}>
            <span className="flex items-center gap-2 text-[13px] font-semibold text-tinta">
              <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-pizarra" />
              Pidieron y no había
              <span className="ml-auto font-display text-[1.5rem] leading-none tabular-nums min-[1100px]:hidden">{pedidosNoAtendidos}</span>
            </span>
            <span className="hidden font-display text-[1.75rem] leading-tight tabular-nums text-tinta min-[1100px]:block">
              {pedidosNoAtendidos} <span className="font-sans text-xs text-taupe">{pedidosNoAtendidos === 1 ? "pedido" : "pedidos"}</span>
            </span>
            <span className="text-xs leading-snug text-taupe">Lo que la clienta buscó y esta sede no tenía</span>
            <span className="mt-auto hidden items-center gap-1 pt-1 text-[12.5px] font-semibold text-tinta sm:flex">
              Ver pedidos <ArrowRight aria-hidden className="h-3.5 w-3.5" />
            </span>
          </Link>
        )}
      </div>
      {grupos.sinbase > 0 && (
        <button type="button" onClick={() => elegir("sinbase")} className="flex items-start gap-1.5 text-left text-xs text-taupe hover:text-tinta">
          <Clock3 aria-hidden className="mt-px h-3.5 w-3.5 shrink-0" />
          <span>
            <b className="font-semibold text-tinta/80">{pluralizar(grupos.sinbase, "prenda recién colgada", "prendas recién colgadas")}</b> no entra
            {grupos.sinbase === 1 ? "" : "n"} en ningún grupo todavía: se juzgan cuando lleven 7 días en el piso.
          </span>
        </button>
      )}
    </section>
  );
}

const DIRECCIONES: readonly { d: DireccionTendencia; texto: string; flecha: string; color: string }[] = [
  { d: "alza", texto: "Aceleraron", flecha: "↑", color: COLOR_ALZA },
  { d: "estable", texto: "Estables", flecha: "→", color: COLOR_NEUTRO },
  { d: "baja", texto: "Desaceleraron", flecha: "↓", color: COLOR_BAJA },
];

/** Los gráficos del período, plegados (Felipe: «Qué hacer» + gráficos plegados). Se abren a pedido; el estado no se guarda. */
export function AnalisisGraficos({ datos }: { datos: DesempenoParaPantalla }) {
  const { kpis, tendencias, tallasVendidas, topPrendas, tendenciaDisponible } = datos;
  const cantidad = { alza: tendencias.alza, estable: tendencias.estable, baja: tendencias.baja };
  const segmentos: SegmentoDistribucion[] = DIRECCIONES.map((x) => ({ clave: x.d, valor: cantidad[x.d], color: x.color, etiqueta: x.texto }));
  const { rotacion, capital } = kpis;
  return (
    <details className="group">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 text-sm font-semibold text-tinta/80 hover:text-tinta [&::-webkit-details-marker]:hidden">
        <ChevronDown aria-hidden className="h-4 w-4 transition-transform group-open:rotate-180" />
        Ver gráficos del período
      </summary>
      <div className="mt-3 space-y-3">
        <div className="grid gap-3 lg:grid-cols-3">
          <Bloque titulo="Qué tallas salen" subtitulo="Unidades vendidas por talla, todas las prendas">
            {tallasVendidas.length === 0 ? (
              <p className="text-sm text-taupe">No hubo ventas en este período.</p>
            ) : (
              <Columnas columnas={tallasVendidas.map((t) => ({ clave: t.talla, etiqueta: t.talla, valor: t.unidades }))} />
            )}
          </Bloque>
          <Bloque titulo="Las que más venden" subtitulo="Unidades vendidas en el período, por prenda">
            {topPrendas.length === 0 ? (
              <p className="text-sm text-taupe">Ninguna prenda vendió en este período.</p>
            ) : (
              <BarrasHorizontales barras={topPrendas.map((p) => ({ clave: p.clave, etiqueta: p.etiqueta, detalle: null, valor: p.unidades, texto: String(p.unidades) }))} />
            )}
          </Bloque>
          <Bloque titulo="Tendencia dentro del período" subtitulo="La 2.ª mitad frente a la 1.ª, por talla">
            {!tendenciaDisponible ? (
              <p className="text-sm text-taupe">Un período de un solo día no tiene mitades que comparar.</p>
            ) : tendencias.total === 0 ? (
              <p className="text-sm text-taupe">Ninguna talla vendió lo suficiente para afirmar una tendencia.</p>
            ) : (
              <div className="flex flex-wrap items-center gap-5">
                <DonaDistribucion segmentos={segmentos} centro={{ valor: String(tendencias.total), etiqueta: "tallas" }} />
                <ul className="min-w-[9rem] flex-1 space-y-1.5">
                  {DIRECCIONES.map((x) => (
                    <li key={x.d} className="flex items-center justify-between gap-3 text-sm">
                      <span className="flex items-center gap-2 whitespace-nowrap text-tinta">
                        <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: x.color }} />
                        <span aria-hidden>{x.flecha}</span> {x.texto}
                      </span>
                      <span className="tabular-nums text-taupe">{cantidad[x.d]}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Bloque>
        </div>
        <p className="text-xs text-taupe">
          <b className="font-semibold text-tinta/80">{ETIQUETA_ROTACION_VALORIZADA}:</b> {rotacion.veces === null ? "N/D" : formatoRotacion(rotacion.veces)} (
          {textoUniversoRotacion(rotacion) ?? TEXTO_FORMULA_ROTACION}) ·{" "}
          {capital.verificado ? (
            <>
              <b className="font-semibold text-tinta/80">Capital al cierre:</b> {formatoSolesCompacto(capital.cierre)} (al inicio {formatoSolesCompacto(capital.inicio)})
            </>
          ) : (
            <>
              <b className="font-semibold text-tinta/80">Unidades al cierre:</b> {capital.unidadesCierre.toLocaleString("en-US")} (sin capital a costo: hay prendas sin costo
              confiable)
            </>
          )}
        </p>
      </div>
    </details>
  );
}
