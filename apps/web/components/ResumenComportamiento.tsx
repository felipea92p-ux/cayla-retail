"use client";

import { SelectNativo } from "@/components/ui/campos";
import { ProductoVarianteCelda } from "@/components/ui/PrendaCelda";
import { Encabezado, fila, TABLA } from "@/components/ui/Tabla";
import type { CambiosUrl } from "@/components/useResumenUrl";
import { LecturaCelda } from "@/components/ResumenCifras";
import { FILAS_POR_PAGINA, OPCIONES_SELL_THROUGH } from "@/lib/resumen-filtros";
import { lecturaDesempeno } from "@/lib/resumen-lectura";
import { formatoRotacion, formatoVariacion, formatoVelocidad } from "@/lib/resumen-formato";
import { AYUDA_ROTACION, TEXTO_MOTIVO_ROTACION } from "@/lib/rotacion";
import { ETIQUETA_TENDENCIA, OPCIONES_ORDEN_DESEMPENO, ORDEN_INICIAL_DESEMPENO, type AnalisisDesempeno, type DesempenoParaPantalla, type DireccionTendencia, type OrdenDesempeno } from "@/lib/resumen-desempeno";

// «Comportamiento del inventario»: cómo se comportó cada producto y variante DURANTE el período
// elegido. Solo métricas históricas —vendido, ritmo, sell-through, rotación y tendencia— y, al final, la
// lectura de la variante (`lib/resumen-lectura.ts`, 2026-09-22): una frase por reglas que dice qué hacer con
// esas cifras. El stock de hoy, la cobertura y las acciones son de Existencias y no aparecen aquí.
//
// La banda de sell-through vive en la cabecera de esta tabla (2026-09-22) y no arriba: recorta la tabla y nada
// más, igual que el filtro de cambio en Comparar. Las cifras y los gráficos de arriba no se mueven con ella.
//
// Composición: el producto es lo que manda (una columna elástica, la celda de Existencias) y las cinco
// métricas son compactas, centradas y con cifras tabulares, como en Existencias (`ui/Tabla.tsx`). Cada
// métrica crece hasta un tope, no más: el ancho que sobra lo absorbe el producto en vez de abrir huecos
// entre números. La tabla se desplaza dentro de su tarjeta cuando la ventana es angosta y nunca ensancha
// la página.

const PLANTILLA = "grid-cols-[minmax(13.5rem,1fr)_minmax(4rem,5rem)_minmax(6rem,7rem)_minmax(6.5rem,7.5rem)_minmax(4.5rem,6rem)_minmax(6.25rem,7.5rem)_minmax(12rem,1fr)]";

const FLECHA: Record<DireccionTendencia, string> = { alza: "↑", estable: "→", baja: "↓" };
// El rojo del Análisis es urgencia de inventario: desacelerar no lo es, se marca en ámbar.
const TONO_TENDENCIA: Record<DireccionTendencia, string> = { alza: "text-verde-profundo", estable: "text-tinta/70", baja: "text-ambar-profundo" };

const NO_DATO = <span className="text-tinta/45">N/D</span>;
/** Un cero no es información nueva: se apaga para que lo que sí se movió destaque al leer hacia abajo. */
const tonoCifra = (esCero: boolean) => (esCero ? "text-tinta/40" : "text-tinta");

function Fila({ x, dias }: { x: AnalisisDesempeno; dias: number }) {
  const f = x.fila;
  const t = x.tendencia;
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

      <span role="cell" className={`min-w-0 text-center text-sm font-semibold tabular-nums ${tonoCifra(x.periodo.ventasNetas === 0)}`}>
        {x.periodo.ventasNetas}
      </span>

      <span role="cell" className="min-w-0 whitespace-nowrap text-center text-sm tabular-nums text-tinta">
        {x.ritmo === null ? (
          NO_DATO
        ) : (
          <>
            {formatoVelocidad(x.ritmo)} <span className="text-[11px] text-tinta/50">uds/día</span>
          </>
        )}
      </span>

      <span role="cell" className={`min-w-0 text-center text-sm tabular-nums ${tonoCifra(x.sellThrough !== null && Math.round(x.sellThrough) === 0)}`}>
        {x.sellThrough === null ? NO_DATO : `${Math.round(x.sellThrough)}%`}
      </span>

      <span role="cell" className={`min-w-0 text-center text-sm tabular-nums ${tonoCifra(x.periodo.rotacion === 0)}`} title={x.periodo.motivoSinRotacion ? `N/D: ${TEXTO_MOTIVO_ROTACION[x.periodo.motivoSinRotacion].toLowerCase()}` : undefined}>
        {x.periodo.rotacion === null ? NO_DATO : formatoRotacion(x.periodo.rotacion)}
      </span>

      <span role="cell" className="min-w-0 text-center text-sm" title={t ? `${formatoVariacion(t.variacionPct)} de ritmo: segunda mitad del período frente a la primera` : "No hay ventas ni días en venta suficientes para afirmar una tendencia"}>
        {t === null ? (
          NO_DATO
        ) : (
          <span className={`inline-flex items-center gap-1.5 whitespace-nowrap ${TONO_TENDENCIA[t.direccion]}`}>
            <span aria-hidden>{FLECHA[t.direccion]}</span>
            {ETIQUETA_TENDENCIA[t.direccion]}
          </span>
        )}
      </span>

      <LecturaCelda lectura={lecturaDesempeno(x, dias)} />
    </div>
  );
}

export function ResumenComportamiento({ datos, actualizar }: { datos: DesempenoParaPantalla; actualizar: (cambios: CambiosUrl, opciones?: { conservarPagina?: boolean }) => void }) {
  const { tabla, periodo, orden, alcance, sellThrough, tendenciaDisponible } = datos;
  const hayFiltros = alcance.q !== "" || alcance.categoriaId !== null || sellThrough !== "todos";
  // El paginador está al pie: la página nueva se lee desde arriba de la tabla (como Inventario). Sin esto, ir a la
  // última página —más corta— acortaba la pantalla justo bajo el mouse y la vista «se subía sola» (ADR-0182).
  const irA = (pag: number) => {
    actualizar({ pag: pag <= 1 ? null : String(pag) }, { conservarPagina: true });
    const tabla = document.getElementById("comportamiento-titulo")?.closest("section");
    if (tabla && tabla.getBoundingClientRect().top < 0) tabla.scrollIntoView({ block: "start" });
  };
  const limpiar = () => actualizar({ q: null, cat: null, st: null });

  return (
    <section className="card-cayla overflow-x-auto" aria-labelledby="comportamiento-titulo">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 px-5 pb-4 pt-5">
        <div className="min-w-0">
          <h2 id="comportamiento-titulo" className="scroll-mt-24 font-display text-[1.35rem] leading-tight text-tinta">
            Comportamiento del inventario
          </h2>
          <p className="mt-0.5 max-w-3xl text-xs text-tinta/65">Productos y variantes según su desempeño durante el período seleccionado.</p>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <label className="flex items-center gap-2">
          <span className="label-cayla text-[10px] text-tinta/60">Sell-through</span>
          <span className="w-44">
            <SelectNativo value={sellThrough} onChange={(e) => actualizar({ st: e.target.value === "todos" ? null : e.target.value })}>
              {OPCIONES_SELL_THROUGH.map((o) => (
                <option key={o.valor} value={o.valor}>
                  {o.texto}
                </option>
              ))}
            </SelectNativo>
          </span>
        </label>
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
        <div role="table" aria-label="Comportamiento del inventario" className="min-w-[62rem] divide-y divide-tinta/10 border-t border-tinta/10">
          <Encabezado
            siempre
            plantilla={PLANTILLA}
            columnas={[
              { titulo: "Producto / variante" },
              { titulo: "Vendido", subtitulo: `en ${periodo.dias} d`, alinear: "centro", ayuda: "Unidades netas vendidas en el período (ventas menos devoluciones)" },
              { titulo: "Ritmo de venta", subtitulo: "uds por día con stock", alinear: "centro", ayuda: "Unidades netas ÷ días con stock en el período: los días agotado no castigan el ritmo" },
              { titulo: "Sell-through", subtitulo: "del período", alinear: "centro", ayuda: "Ventas netas ÷ (stock al inicio del período + entradas): qué parte de lo disponible se vendió" },
              { titulo: "Rotación", subtitulo: "veces", alinear: "centro", ayuda: AYUDA_ROTACION },
              { titulo: "Tendencia", subtitulo: "2.ª vs 1.ª mitad", alinear: "centro", ayuda: "El ritmo de la segunda mitad del período contra el de la primera" },
              { titulo: "Lectura del período", ayuda: "Qué hacer con estas cifras: una frase por reglas fijas, en orden (estimadas, agotada, sin ventas, tendencia, vendió casi todo, rota lento)" },
            ]}
          />
          <div role="rowgroup" className="divide-y divide-tinta/10">
            {tabla.filas.map((x) => (
              <Fila key={x.fila.varianteId} x={x} dias={periodo.dias} />
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
