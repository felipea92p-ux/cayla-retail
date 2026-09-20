"use client";

import { SelectNativo } from "@/components/ui/campos";
import { MuestraColor } from "@/components/ui/MuestraColor";
import { SinFoto } from "@/components/ui/PrendaCelda";
import type { CambiosUrl } from "@/components/useResumenUrl";
import { FILAS_POR_PAGINA } from "@/lib/resumen-filtros";
import { formatoRotacion, formatoVariacion, formatoVelocidad } from "@/lib/resumen-formato";
import { AYUDA_ROTACION, TEXTO_MOTIVO_ROTACION } from "@/lib/rotacion";
import { ETIQUETA_TENDENCIA, OPCIONES_ORDEN_DESEMPENO, ORDEN_INICIAL_DESEMPENO, type AnalisisDesempeno, type DesempenoParaPantalla, type DireccionTendencia, type OrdenDesempeno } from "@/lib/resumen-desempeno";

// «Comportamiento del inventario»: cómo se comportó cada producto y variante DURANTE el período
// elegido. Solo métricas históricas —vendido, ritmo, sell-through, rotación y tendencia—; el stock
// de hoy, la cobertura y las acciones son de Existencias y no aparecen aquí.
//
// Composición: el producto es lo que manda (una columna elástica, nombre y SKU · color · talla) y las
// cinco métricas son compactas y van alineadas a la derecha con cifras tabulares, para leerlas hacia
// abajo. Cada métrica crece hasta un tope, no más: el ancho que sobra lo absorbe el producto en vez de
// abrir huecos entre números. La tabla se desplaza dentro de su tarjeta cuando la ventana es angosta y
// nunca ensancha la página.

const PLANTILLA = "grid-cols-[minmax(12rem,1fr)_minmax(4rem,5rem)_minmax(6rem,7rem)_minmax(5rem,6rem)_minmax(4.5rem,6rem)_minmax(6.25rem,7.5rem)]";

const FLECHA: Record<DireccionTendencia, string> = { alza: "↑", estable: "→", baja: "↓" };
// El rojo del Análisis es urgencia de inventario: desacelerar no lo es, se marca en ámbar.
const TONO_TENDENCIA: Record<DireccionTendencia, string> = { alza: "text-verde-profundo", estable: "text-tinta/70", baja: "text-ambar-profundo" };

function Cab({ arriba, abajo, alinear = "der", ayuda }: { arriba: string; abajo?: string; alinear?: "izq" | "der"; ayuda?: string }) {
  return (
    <span role="columnheader" title={ayuda} className={`label-cayla block min-w-0 text-[10px] leading-4 text-tinta/60 ${alinear === "der" ? "text-right" : ""}`}>
      {arriba}
      {abajo && <span className="block truncate normal-case tracking-normal text-tinta/50">{abajo}</span>}
    </span>
  );
}

const NO_DATO = <span className="text-tinta/45">N/D</span>;
/** Un cero no es información nueva: se apaga para que lo que sí se movió destaque al leer hacia abajo. */
const tonoCifra = (esCero: boolean) => (esCero ? "text-tinta/40" : "text-tinta");

function Fila({ x }: { x: AnalisisDesempeno }) {
  const f = x.fila;
  const t = x.tendencia;
  return (
    <div role="row" className={`grid ${PLANTILLA} items-center gap-x-4 px-4 py-3 transition-colors hover:bg-sand/25`}>
      <span role="cell" className="flex min-w-0 items-start gap-2.5">
        <SinFoto />
        <span className="min-w-0">
          <span className="block truncate text-sm text-tinta" title={f.referencia}>
            {f.referencia}
            {!f.ledgerConsistente && (
              <span className="ml-1 text-ambar-profundo" title="El historial de movimientos no cuadra con el stock de hoy: cifras estimadas">
                ≈
              </span>
            )}
          </span>
          <span className="flex items-center gap-1.5 overflow-visible text-xs text-tinta/65">
            <span className="font-mono">{f.sku}</span>
            {f.talla && <span>· {f.talla}</span>}
            <span>·</span>
            <MuestraColor nombre={f.color} hex={f.colorHex} />
          </span>
        </span>
      </span>

      <span role="cell" className={`min-w-0 text-right text-sm font-semibold tabular-nums ${tonoCifra(x.periodo.ventasNetas === 0)}`}>
        {x.periodo.ventasNetas}
      </span>

      <span role="cell" className="min-w-0 whitespace-nowrap text-right text-sm tabular-nums text-tinta">
        {x.ritmo === null ? (
          NO_DATO
        ) : (
          <>
            {formatoVelocidad(x.ritmo)} <span className="text-[11px] text-tinta/50">uds/día</span>
          </>
        )}
      </span>

      <span role="cell" className={`min-w-0 text-right text-sm tabular-nums ${tonoCifra(x.sellThrough !== null && Math.round(x.sellThrough) === 0)}`}>
        {x.sellThrough === null ? NO_DATO : `${Math.round(x.sellThrough)}%`}
      </span>

      <span role="cell" className={`min-w-0 text-right text-sm tabular-nums ${tonoCifra(x.periodo.rotacion === 0)}`} title={x.periodo.motivoSinRotacion ? `N/D: ${TEXTO_MOTIVO_ROTACION[x.periodo.motivoSinRotacion].toLowerCase()}` : undefined}>
        {x.periodo.rotacion === null ? NO_DATO : formatoRotacion(x.periodo.rotacion)}
      </span>

      <span role="cell" className="min-w-0 pl-2 text-sm" title={t ? `${formatoVariacion(t.variacionPct)} de ritmo: segunda mitad del período frente a la primera` : "No hay ventas ni días en venta suficientes para afirmar una tendencia"}>
        {t === null ? (
          NO_DATO
        ) : (
          <span className={`inline-flex items-center gap-1.5 whitespace-nowrap ${TONO_TENDENCIA[t.direccion]}`}>
            <span aria-hidden>{FLECHA[t.direccion]}</span>
            {ETIQUETA_TENDENCIA[t.direccion]}
          </span>
        )}
      </span>
    </div>
  );
}

export function ResumenComportamiento({ datos, actualizar }: { datos: DesempenoParaPantalla; actualizar: (cambios: CambiosUrl, opciones?: { conservarPagina?: boolean }) => void }) {
  const { tabla, periodo, orden, alcance, sellThrough, tendenciaDisponible } = datos;
  const hayFiltros = alcance.q !== "" || alcance.categoriaId !== null || sellThrough !== "todos";
  const irA = (pag: number) => actualizar({ pag: pag <= 1 ? null : String(pag) }, { conservarPagina: true });
  const limpiar = () => actualizar({ q: null, cat: null, st: null });

  return (
    <section className="card-cayla overflow-x-auto" aria-labelledby="comportamiento-titulo">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 px-4 pb-4 pt-5">
        <div className="min-w-0">
          <h2 id="comportamiento-titulo" className="font-display text-[1.35rem] leading-tight text-tinta">
            Comportamiento del inventario
          </h2>
          <p className="mt-0.5 max-w-3xl text-xs text-tinta/65">Productos y variantes según su desempeño durante el período seleccionado.</p>
        </div>
        <label className="flex items-center gap-2">
          <span className="label-cayla text-[10px] text-tinta/60">Ordenar por</span>
          <span className="w-52">
            <SelectNativo value={orden} onChange={(e) => actualizar({ orden: e.target.value === ORDEN_INICIAL_DESEMPENO ? null : (e.target.value as OrdenDesempeno) })}>
              {OPCIONES_ORDEN_DESEMPENO.map((o) => (
                <option key={o.valor} value={o.valor}>
                  {o.texto}
                </option>
              ))}
            </SelectNativo>
          </span>
        </label>
      </div>

      {tabla.total === 0 ? (
        <div className="border-t border-tinta/10 px-4 py-10 text-sm text-tinta/65">
          <p>Ninguna variante coincide con estos filtros.</p>
          {hayFiltros && (
            <button type="button" onClick={limpiar} className="label-cayla mt-3 rounded-md border border-tinta/25 px-3 py-2 text-[11px] text-tinta transition-colors hover:border-tinta/50">
              Limpiar filtros
            </button>
          )}
        </div>
      ) : (
        <div role="table" aria-label="Comportamiento del inventario" className="min-w-[45rem]">
          <div role="row" className={`grid ${PLANTILLA} items-end gap-x-4 border-t border-tinta/10 px-4 py-2`}>
            <Cab arriba="Producto / variante" alinear="izq" />
            <Cab arriba="Vendido" abajo={`en ${periodo.dias} d`} ayuda="Unidades netas vendidas en el período (ventas menos devoluciones)" />
            <Cab arriba="Ritmo de venta" abajo="uds por día con stock" ayuda="Unidades netas ÷ días con stock en el período: los días agotado no castigan el ritmo" />
            <Cab arriba="Sell-through" abajo="del período" ayuda="Ventas netas ÷ (stock al inicio del período + entradas): qué parte de lo disponible se vendió" />
            <Cab arriba="Rotación" abajo="veces" ayuda={AYUDA_ROTACION} />
            <span role="columnheader" title="El ritmo de la segunda mitad del período contra el de la primera" className="label-cayla block min-w-0 pl-2 text-[10px] leading-4 text-tinta/60">
              Tendencia
              <span className="block truncate normal-case tracking-normal text-tinta/50">2.ª vs 1.ª mitad</span>
            </span>
          </div>
          <div role="rowgroup" className="divide-y divide-tinta/10 border-t border-tinta/10">
            {tabla.filas.map((x) => (
              <Fila key={x.fila.varianteId} x={x} />
            ))}
          </div>
        </div>
      )}

      {tabla.total > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-tinta/10 px-4 py-3 text-xs text-tinta/65">
          <p>
            {tabla.paginas > 1
              ? `Mostrando ${(tabla.pagina - 1) * FILAS_POR_PAGINA + 1}–${(tabla.pagina - 1) * FILAS_POR_PAGINA + tabla.filas.length} de ${tabla.total} variantes`
              : `${tabla.total} ${tabla.total === 1 ? "variante" : "variantes"}`}
            {tabla.total !== tabla.totalSede && ` (de ${tabla.totalSede} en la sede)`}
            {!tendenciaDisponible && " · Un período de un solo día no tiene tendencia."}
          </p>
          {tabla.paginas > 1 && (
            <nav aria-label="Paginación del comportamiento" className="flex items-center gap-2">
              <button type="button" disabled={tabla.pagina <= 1} onClick={() => irA(tabla.pagina - 1)} className="label-cayla rounded-md border border-tinta/20 px-3 py-2 text-[11px] text-tinta transition-colors hover:border-tinta/45 disabled:cursor-not-allowed disabled:opacity-40">
                Anterior
              </button>
              <span className="tabular-nums">
                {tabla.pagina} / {tabla.paginas}
              </span>
              <button type="button" disabled={tabla.pagina >= tabla.paginas} onClick={() => irA(tabla.pagina + 1)} className="label-cayla rounded-md border border-tinta/20 px-3 py-2 text-[11px] text-tinta transition-colors hover:border-tinta/45 disabled:cursor-not-allowed disabled:opacity-40">
                Siguiente
              </button>
            </nav>
          )}
        </div>
      )}
    </section>
  );
}
