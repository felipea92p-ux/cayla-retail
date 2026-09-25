"use client";

import { Desplegable } from "@/components/ui/campos";
import { ProductoVarianteCelda } from "@/components/ui/PrendaCelda";
import { Encabezado, fila, TABLA } from "@/components/ui/Tabla";
import type { CambiosUrl } from "@/components/useResumenUrl";
import { LecturaCelda } from "@/components/ResumenCifras";
import { FILAS_POR_PAGINA, OPCIONES_SELL_THROUGH } from "@/lib/resumen-filtros";
import { lecturaDesempeno } from "@/lib/resumen-lectura";
import { formatoRotacion, formatoSellThroughExposicion, formatoVariacion, formatoVelocidad, textoCalidad, textoExposicionDias, textoPendienteMadurez, textoSinVenta, textoStockPisoAlmacen, tooltipStockPisoAlmacen } from "@/lib/resumen-formato";
import { ETIQUETA_TENDENCIA, OPCIONES_ORDEN_DESEMPENO, ORDEN_INICIAL_DESEMPENO, type AnalisisDesempeno, type DesempenoParaPantalla, type DireccionTendencia } from "@/lib/resumen-desempeno";

// «Comportamiento del inventario» (rediseño 2026-09-24, comportamiento comercial piso/almacén): cómo se
// comportó cada producto y variante DURANTE el período elegido — separando A) comportamiento COMERCIAL
// (piso: la oportunidad real de venta) de B) gestión del inventario TOTAL (piso + almacén). Columnas:
// stock actual P/A (piso/almacén, HOY — la única columna que mira hoy, contexto para leer las demás),
// vendido, ritmo OBSERVADO (piso), sell-through DE EXPOSICIÓN (cohortes con madurez, no ventas ÷ todo el
// inventario), rotación de piso Y total, «Sin venta» (tiempo EXPUESTO en piso sin vender, no calendario) y
// tendencia (sobre el ritmo observado). Al final, la lectura de la variante (`lib/resumen-lectura.ts`): una
// frase por reglas que dice qué hacer con esas cifras. La cobertura y las acciones siguen siendo de
// Existencias, que no se reemplaza — «Stock actual P/A» es solo el contexto de HOY para interpretar la
// historia del período, decisión de Felipe 2026-09-24: reutiliza `actual.en_venta`/`actual.utilizable`, ya
// calculados por `fn_resumen_comparacion`, ninguna fuente de stock nueva.
//
// El filtro «Sell-through» de la cabecera (banda Alto/Medio/Bajo) y el KPI/dona de arriba siguen midiendo el
// sell-through CLÁSICO (ventas ÷ todo el inventario, `x.sellThrough`): son agregados de toda la pantalla que
// no se tocaron en este cambio. La tabla, en cambio, ya muestra el DE EXPOSICIÓN (`x.sellThroughExposicion`)
// por ser la lectura correcta por variante. Son dos números con el mismo nombre en la misma pantalla —
// deliberado y documentado en el informe de la migración 2026-09-24, no un descuido; unificarlos (llevar el
// filtro/KPI/dona también a exposición) es un paso aparte, del mismo tamaño que este.
//
// La banda de sell-through vive en la cabecera de esta tabla (2026-09-22) y no arriba: recorta la tabla y nada
// más, igual que el filtro de cambio en Comparar. Las cifras y los gráficos de arriba no se mueven con ella.
//
// Composición: el producto es lo que manda (una columna elástica, la celda de Existencias) y las métricas
// son compactas, centradas y con cifras tabulares, como en Existencias (`ui/Tabla.tsx`). Cada métrica crece
// hasta un tope, no más: el ancho que sobra lo absorbe el producto en vez de abrir huecos entre números. La
// tabla se desplaza dentro de su tarjeta cuando la ventana es angosta y nunca ensancha la página.

const PLANTILLA =
  "grid-cols-[minmax(12.5rem,1fr)_minmax(4.5rem,5.5rem)_minmax(3.75rem,4.5rem)_minmax(6rem,7rem)_minmax(6.5rem,7.5rem)_minmax(4.25rem,5.25rem)_minmax(4.25rem,5.25rem)_minmax(6.5rem,8rem)_minmax(6.25rem,7.5rem)_minmax(10.5rem,1fr)]";

const FLECHA: Record<DireccionTendencia, string> = { alza: "↑", estable: "→", baja: "↓" };
// El rojo del Análisis es urgencia de inventario: desacelerar no lo es, se marca en ámbar.
const TONO_TENDENCIA: Record<DireccionTendencia, string> = { alza: "text-verde-profundo", estable: "text-tinta/70", baja: "text-ambar-profundo" };

const NO_DATO = <span className="text-tinta/45">N/D</span>;
/** Un cero no es información nueva: se apaga para que lo que sí se movió destaque al leer hacia abajo. */
const tonoCifra = (esCero: boolean) => (esCero ? "text-tinta/40" : "text-tinta");

function Fila({ x, dias }: { x: AnalisisDesempeno; dias: number }) {
  const f = x.fila;
  const t = x.tendencia;
  const st = x.sellThroughExposicion;
  const rotPiso = x.periodo.rotacionPisoUnidades;
  const rotTotal = x.periodo.rotacionTotalUnidades;
  const pendiente = textoPendienteMadurez(st.pendienteMadurez);
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

      <span
        role="cell"
        className={`min-w-0 whitespace-nowrap text-center text-sm tabular-nums ${tonoCifra(f.stockActualPisoAlmacen !== null && f.stockActualPisoAlmacen.piso === 0 && f.stockActualPisoAlmacen.almacen === 0)}`}
        title={tooltipStockPisoAlmacen(f.stockActualPisoAlmacen)}
      >
        {textoStockPisoAlmacen(f.stockActualPisoAlmacen)}
      </span>

      <span role="cell" className={`min-w-0 text-center text-sm font-semibold tabular-nums ${tonoCifra(x.periodo.ventasNetas === 0)}`}>
        {x.periodo.ventasNetas}
      </span>

      <span
        role="cell"
        className="min-w-0 whitespace-nowrap text-center text-sm tabular-nums text-tinta"
        title={x.diasConStockPiso !== null ? `${textoExposicionDias(x.diasConStockPiso, dias)}${x.muestraLimitada ? " — muestra limitada: poca exposición frente al período" : ""}` : undefined}
      >
        {x.ritmo === null ? (
          NO_DATO
        ) : (
          <>
            {formatoVelocidad(x.ritmo)} <span className="text-[11px] text-tinta/50">uds/día</span>
            {x.muestraLimitada && (
              <span aria-hidden className="ml-0.5 text-ambar-profundo">
                •
              </span>
            )}
          </>
        )}
      </span>

      <span role="cell" className={`min-w-0 text-center text-sm tabular-nums ${tonoCifra(st.pct !== null && Math.round(st.pct) === 0)}`} title={textoCalidad(x.calidad.sellThrough)}>
        {st.pct === null ? (
          NO_DATO
        ) : (
          <>
            {formatoSellThroughExposicion(st.pct)}
            {st.estimado && (
              <span aria-hidden className="ml-0.5 text-ambar-profundo">
                •
              </span>
            )}
            {pendiente && <span className="block text-[10px] leading-tight text-tinta/50">{pendiente}</span>}
          </>
        )}
      </span>

      <span role="cell" className={`min-w-0 text-center text-sm tabular-nums ${tonoCifra(rotPiso.calculable && rotPiso.veces === 0)}`} title={textoCalidad(x.calidad.rotacionPiso)}>
        {rotPiso.calculable ? formatoRotacion(rotPiso.veces) : NO_DATO}
      </span>

      <span role="cell" className={`min-w-0 text-center text-sm tabular-nums ${tonoCifra(rotTotal.calculable && rotTotal.veces === 0)}`} title={textoCalidad(x.calidad.rotacionTotal)}>
        {rotTotal.calculable ? formatoRotacion(rotTotal.veces) : NO_DATO}
      </span>

      <span role="cell" className="min-w-0 whitespace-nowrap text-center text-sm text-tinta" title="Tiempo EXPUESTO en piso sin una venta (no días de calendario): el tiempo en almacén no cuenta">
        {textoSinVenta({ ultimaVentaEn: f.ultimaVentaEn, pisoExpuestoDesdeUltimaVentaDias: f.pisoExpuestoDesdeUltimaVentaDias })}
      </span>

      <span role="cell" className="min-w-0 text-center text-sm" title={t ? `${formatoVariacion(t.variacionPct)} de ritmo OBSERVADO: segunda mitad del período frente a la primera` : "No hay ventas ni exposición en piso suficiente para afirmar una tendencia"}>
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
  // última página —más corta— acortaba la pantalla justo bajo el mouse y la vista «se subía sola» (ADR-0185).
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
          <span className="label-cayla text-[10px] text-tinta/60" title="Filtra por el sell-through clásico (ventas ÷ todo el inventario del período) — la columna de la tabla, más abajo, es el de EXPOSICIÓN (cohortes con madurez)">
            Sell-through (total)
          </span>
          <span className="w-44">
            <Desplegable
              valor={sellThrough}
              onValor={(v) => actualizar({ st: v === "todos" ? null : v })}
              opciones={OPCIONES_SELL_THROUGH}
              etiquetaAccesible="Sell-through"
            />
          </span>
        </label>
        <label className="flex items-center gap-2">
          <span className="label-cayla text-[10px] text-tinta/60">Ordenar por</span>
          <span className="w-52">
            <Desplegable
              valor={orden}
              onValor={(v) => actualizar({ orden: v === ORDEN_INICIAL_DESEMPENO ? null : v })}
              opciones={OPCIONES_ORDEN_DESEMPENO}
              etiquetaAccesible="Ordenar por"
            />
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
        <div role="table" aria-label="Comportamiento del inventario" className="min-w-[81rem] divide-y divide-tinta/10 border-t border-tinta/10">
          <Encabezado
            siempre
            plantilla={PLANTILLA}
            columnas={[
              { titulo: "Producto / variante" },
              { titulo: "Stock actual", subtitulo: "Piso / Almacén", alinear: "centro", ayuda: "El stock de HOY (no del período): contexto para leer Rotación piso/total, sobrestock, reposición y agotamiento — no reemplaza a Existencias. «N/D» cuando la sede no separa piso de almacén" },
              { titulo: "Vendido", subtitulo: `en ${periodo.dias} d`, alinear: "centro", ayuda: "Unidades netas vendidas en el período (ventas menos devoluciones), sin ajuste por exposición" },
              { titulo: "Ritmo observado", subtitulo: "uds/día con stock en piso", alinear: "centro", ayuda: "Unidades netas ÷ días CON STOCK EN PISO (no calendario): el punto • avisa cuando esa exposición es corta frente al período — el número sigue siendo correcto, la evidencia es poca" },
              { titulo: "Sell-through", subtitulo: "de exposición", alinear: "centro", ayuda: "De las cohortes de piso YA MADURAS (7 días expuestas, o vendidas del todo antes): cuánto se vendió. Una reposición reciente no cuenta todavía — sale aparte, como pendiente" },
              { titulo: "Rotación piso", subtitulo: "veces", alinear: "centro", ayuda: "Unidades vendidas ÷ unidades promedio de PISO (ponderado por tiempo): cuánto rota, EN UNIDADES, lo que normalmente está expuesto a la clienta" },
              { titulo: "Rotación total", subtitulo: "veces", alinear: "centro", ayuda: "Unidades vendidas ÷ unidades promedio de piso + almacén (ponderado por tiempo): cuánto rota, EN UNIDADES, todo lo que la sede mantiene" },
              { titulo: "Sin venta", subtitulo: "expuesta en piso", alinear: "centro", ayuda: "Tiempo EXPUESTO en piso sin una venta, no días de calendario: el tiempo en almacén no cuenta como «sin venta»" },
              { titulo: "Tendencia", subtitulo: "2.ª vs 1.ª mitad", alinear: "centro", ayuda: "El ritmo OBSERVADO (piso) de la segunda mitad del período contra el de la primera" },
              {
                titulo: "Lectura del período",
                ayuda: "Qué hacer con estas cifras: una frase por reglas fijas, en orden (estimadas, reposición reciente, agotamiento, estancamiento, problema de reposición, cambió el ritmo, sobrestock, saludable, rota lento)",
              },
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
