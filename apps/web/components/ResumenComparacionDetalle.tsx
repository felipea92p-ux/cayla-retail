"use client";

import { BuscadorDebounced } from "@/components/ui/BuscadorDebounced";
import { SelectNativo } from "@/components/ui/campos";
import { ProductoVarianteCelda } from "@/components/ui/PrendaCelda";
import { Encabezado, fila, TABLA } from "@/components/ui/Tabla";
import type { CambiosUrl } from "@/components/useResumenUrl";
import { FILAS_POR_PAGINA } from "@/lib/resumen-filtros";
import { AYUDA_ROTACION, TEXTO_MOTIVO_ROTACION } from "@/lib/rotacion";
import { formatoDeltaPp, formatoRotacion, formatoSellThrough, formatoVariacion, formatoVelocidad } from "@/lib/resumen-formato";
import {
  cambioMostrado,
  detalleCambio,
  FILTROS_CAMBIO,
  OPCIONES_ORDEN_COMPARACION,
  SENTIDO_CAMBIO,
  textoCambio,
  type AnalisisComparacion,
  type ComparacionParaPantalla,
  type FiltroCambio,
  type MetricasPeriodo,
  type OrdenComparacion,
} from "@/lib/resumen-comparacion";

// Detalle por producto: «¿qué productos explican lo que cambió?». Una fila por variante con lo vendido
// (y su ritmo), el stock AL CIERRE de cada período, el sell-through, la rotación y el cambio más
// relevante de esa variante — no una lista de banderas: el más importante de todos los que aplican
// (`cambioMostrado`, ADR-0138). La tabla es ancha a propósito: se desplaza dentro de su tarjeta y nunca
// ensancha la página.

// Mínimo ≈ 58 rem (la prenda con el mismo piso que en Existencias, 13.5rem): cabe en una ventana de
// 1440 px sin desplazar la tabla; más angosto, se desplaza dentro de su tarjeta (nunca la página entera).
const PLANTILLA = "grid-cols-[minmax(13.5rem,1.4fr)_8rem_6.5rem_7rem_6.5rem_minmax(9rem,1fr)]";

const PRINCIPAL = "block whitespace-nowrap text-sm text-tinta tabular-nums";
const SECUNDARIO = "block truncate text-xs leading-4 text-tinta/65 tabular-nums";

function Vendido({ a, b, variacionRitmoPct }: { a: MetricasPeriodo; b: MetricasPeriodo; variacionRitmoPct: number | null }) {
  const ritmo = a.unidadesDia === null && b.unidadesDia === null ? null : `${a.unidadesDia === null ? "—" : formatoVelocidad(a.unidadesDia)} → ${b.unidadesDia === null ? "—" : formatoVelocidad(b.unidadesDia)} uds/día${variacionRitmoPct === null ? "" : ` · ${formatoVariacion(variacionRitmoPct)}`}`;
  return (
    <span role="cell" className="min-w-0 text-center">
      <span className={PRINCIPAL}>
        {a.ventasNetas} <span className="text-tinta/40">→</span> {b.ventasNetas}
      </span>
      {ritmo && <span className={SECUNDARIO} title={ritmo}>{ritmo}</span>}
    </span>
  );
}

/** Stock al cierre de cada período. Nunca insinúa que la diferencia sean ventas: entre A y B también
 *  llegan recepciones, devoluciones, traslados o ajustes. */
function StockCierre({ a, b }: { a: MetricasPeriodo; b: MetricasPeriodo }) {
  return (
    <span role="cell" className="min-w-0 text-center">
      <span className={PRINCIPAL}>
        {a.stockCierre} <span className="text-tinta/40">→</span> {b.stockCierre}
      </span>
      <span className={SECUNDARIO} title="al cierre de cada período">al cierre de cada período</span>
    </span>
  );
}

function SellThroughCelda({ x }: { x: AnalisisComparacion }) {
  const st = (v: number | null) => (v === null ? "N/D" : formatoSellThrough(v));
  return (
    <span role="cell" className="min-w-0 text-center">
      <span className={PRINCIPAL}>
        {st(x.a.sellThrough)} <span className="text-tinta/40">→</span> {st(x.b.sellThrough)}
      </span>
      {x.deltaSellThroughPp !== null && <span className={SECUNDARIO}>{formatoDeltaPp(x.deltaSellThroughPp)}</span>}
    </span>
  );
}

function RotacionCelda({ x }: { x: AnalisisComparacion }) {
  const rot = (v: number | null) => (v === null ? "N/D" : formatoRotacion(v));
  const motivo = [x.a.motivoSinRotacion && `A: ${TEXTO_MOTIVO_ROTACION[x.a.motivoSinRotacion]}`, x.b.motivoSinRotacion && `B: ${TEXTO_MOTIVO_ROTACION[x.b.motivoSinRotacion]}`].filter(Boolean).join(" · ") || undefined;
  return (
    <span role="cell" className="min-w-0 text-center" title={motivo}>
      <span className={PRINCIPAL}>
        {rot(x.a.rotacion)} <span className="text-tinta/40">→</span> {rot(x.b.rotacion)}
      </span>
      {x.deltaRotacionPct !== null && <span className={SECUNDARIO}>{formatoVariacion(x.deltaRotacionPct)}</span>}
    </span>
  );
}

/** El cambio más relevante de la fila. Uno solo —nunca una hilera de chips— y en texto, para no llenar
 *  la tabla de insignias: el color y la flecha ya dicen si es una buena o una mala noticia. */
function CambioCelda({ x, filtro }: { x: AnalisisComparacion; filtro: FiltroCambio }) {
  const c = cambioMostrado(x, filtro);
  if (c === null) return (
    <span role="cell" className="min-w-0 text-center text-sm text-tinta/35" title="No hay suficiente historial para medir un cambio">
      —
    </span>
  );
  if (c === "sin_cambio") return <span role="cell" className="min-w-0 truncate text-center text-sm text-tinta/50">Sin cambio relevante</span>;
  const sube = SENTIDO_CAMBIO[c] === "sube";
  return (
    <span role="cell" className={`min-w-0 truncate text-center text-sm font-medium ${sube ? "text-verde-profundo" : "text-ambar-profundo"}`} title={detalleCambio(x, c)}>
      {sube ? "↑" : "↓"} {textoCambio(x, c)}
    </span>
  );
}

function Fila({ x, filtro }: { x: AnalisisComparacion; filtro: FiltroCambio }) {
  const f = x.fila;
  return (
    <div role="row" className={fila(PLANTILLA)}>
      <span role="cell" className="min-w-0">
        {/* La fila de Análisis no trae foto: la miniatura es el marcador de perchero, como antes. */}
        <ProductoVarianteCelda
          referencia={f.referencia}
          sku={f.sku}
          talla={f.talla}
          color={f.color}
          colorHex={f.colorHex}
          fotoUrl={null}
          marca={
            !f.ledgerConsistente && (
              <span className="ml-1 text-ambar-profundo" title="El historial de movimientos no cuadra con el stock de hoy: cifras estimadas">
                ≈
              </span>
            )
          }
        />
      </span>
      <Vendido a={x.a} b={x.b} variacionRitmoPct={x.ritmo?.variacionPct ?? null} />
      <StockCierre a={x.a} b={x.b} />
      <SellThroughCelda x={x} />
      <RotacionCelda x={x} />
      <CambioCelda x={x} filtro={filtro} />
    </div>
  );
}

function FiltroChip({ activo, n, onClick, children }: { activo: boolean; n: number; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={activo}
      onClick={onClick}
      className={`label-cayla rounded-md border px-3 py-2 text-[11px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-tinta/40 ${
        activo ? "border-tinta bg-tinta text-crema" : "border-tinta/20 bg-papel text-tinta/80 hover:border-tinta/45"
      }`}
    >
      {children} <span className={`tabular-nums ${activo ? "text-crema/80" : "text-tinta/55"}`}>({n})</span>
    </button>
  );
}

export function ResumenComparacionDetalle({ datos, actualizar }: { datos: ComparacionParaPantalla; actualizar: (cambios: CambiosUrl, opciones?: { conservarPagina?: boolean }) => void }) {
  const { tabla, conteoCambios, cambio, orden, periodoA, periodoB, alcance } = datos;
  const hayFiltros = alcance.q !== "" || alcance.categoriaId !== null || cambio !== "todos";
  const irA = (pag: number) => actualizar({ pag: pag <= 1 ? null : String(pag) }, { conservarPagina: true });
  const limpiar = () => actualizar({ q: null, cat: null, cambio: null });

  return (
    <section className="card-cayla overflow-x-auto" aria-labelledby="detalle-titulo">
      <div className="px-5 pb-2 pt-5">
        <h2 id="detalle-titulo" className="font-display text-[1.35rem] leading-tight text-tinta">
          Detalle por producto
        </h2>
        <p className="mt-0.5 max-w-3xl text-xs text-tinta/65">
          Qué pasó con cada variante entre {periodoA.etiqueta} (A) y {periodoB.etiquetaCorta} (B); el stock es el de cierre de cada período y el cambio, el más relevante de cada una.
        </p>
      </div>

      {/* Búsqueda, filtro por cambio y orden: una sola zona funcional (se envuelve en celular). */}
      <div className="flex flex-wrap items-center gap-3 px-5 pb-4 pt-1">
        <BuscadorDebounced valorUrl={alcance.q} onBuscar={(v) => actualizar({ q: v || null })} className="w-full sm:w-60 sm:flex-none" />
        <div role="group" aria-label="Filtrar por cambio" className="flex flex-wrap gap-2">
          <FiltroChip activo={cambio === "todos"} n={tabla.totalAlcance} onClick={() => actualizar({ cambio: null })}>
            Todos
          </FiltroChip>
          {FILTROS_CAMBIO.filter((f) => f.valor !== "todos").map((f) => (
            <FiltroChip key={f.valor} activo={cambio === f.valor} n={conteoCambios[f.valor as Exclude<FiltroCambio, "todos">]} onClick={() => actualizar({ cambio: cambio === f.valor ? null : f.valor })}>
              {f.texto}
            </FiltroChip>
          ))}
        </div>
        <label className="ml-auto flex items-center gap-2">
          <span className="label-cayla text-[10px] text-tinta/60">Ordenar por</span>
          <span className="w-52">
            <SelectNativo value={orden} onChange={(e) => actualizar({ orden: e.target.value === "vendidos_b" ? null : (e.target.value as OrdenComparacion) })}>
              {OPCIONES_ORDEN_COMPARACION.map((o) => (
                <option key={o.valor} value={o.valor}>
                  {o.texto}
                </option>
              ))}
            </SelectNativo>
          </span>
        </label>
      </div>

      {tabla.total === 0 ? (
        <div className={`border-t border-tinta/10 ${TABLA.vacio}`}>
          <p>Ninguna variante coincide con estos filtros.</p>
          {hayFiltros && (
            <button type="button" onClick={limpiar} className="label-cayla mt-3 rounded-md border border-tinta/25 px-3 py-2 text-[11px] text-tinta transition-colors hover:border-tinta/50">
              Limpiar filtros
            </button>
          )}
        </div>
      ) : (
        <div role="table" aria-label="Detalle por producto" className="min-w-[58rem] divide-y divide-tinta/10 border-t border-tinta/10">
          <Encabezado
            siempre
            plantilla={PLANTILLA}
            columnas={[
              { titulo: "Producto / variante" },
              { titulo: "Ventas A → B", subtitulo: "uds · uds/día", alinear: "centro", ayuda: "Unidades netas vendidas y, debajo, el ritmo (unidades por día con stock) de A a B" },
              { titulo: "Stock A → B", subtitulo: "al cierre", alinear: "centro", ayuda: "Unidades utilizables al cierre de cada período. NO son las ventas: también pueden llegar recepciones, devoluciones, traslados o ajustes." },
              { titulo: "Sell-through", subtitulo: "A → B", alinear: "centro", ayuda: "Ventas netas ÷ (stock al inicio del período + entradas), en A y en B" },
              { titulo: "Rotación", subtitulo: "A → B", alinear: "centro", ayuda: `Veces que rotó el inventario. ${AYUDA_ROTACION}` },
              { titulo: "Cambio relevante", alinear: "centro", ayuda: "El más importante de los cambios de esta variante entre A y B" },
            ]}
          />
          <div role="rowgroup" className="divide-y divide-tinta/10">
            {tabla.filas.map((x) => (
              <Fila key={x.fila.varianteId} x={x} filtro={cambio} />
            ))}
          </div>
        </div>
      )}

      {tabla.total > 0 && (
        <div className={`flex flex-wrap items-center justify-between gap-3 border-t border-tinta/10 ${TABLA.pie}`}>
          <p>
            {tabla.paginas > 1
              ? `Mostrando ${(tabla.pagina - 1) * FILAS_POR_PAGINA + 1}–${(tabla.pagina - 1) * FILAS_POR_PAGINA + tabla.filas.length} de ${tabla.total} variantes`
              : `${tabla.total} ${tabla.total === 1 ? "variante" : "variantes"}`}
            {tabla.total !== tabla.totalSede && ` (de ${tabla.totalSede} en la sede)`}
          </p>
          {tabla.paginas > 1 && (
            <nav aria-label="Paginación del detalle" className="flex items-center gap-2">
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
