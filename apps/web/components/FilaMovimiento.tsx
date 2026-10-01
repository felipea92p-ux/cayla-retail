"use client";

import Link from "next/link";
import { ChevronDown, ChevronRight } from "lucide-react";
import { textoQuedan } from "@/lib/movimientos-saldo";
import type { AccesosAtajos, ApartadoDeMovimiento } from "@/lib/movimientos-atajos";
import { MiniaturaPrenda } from "@/components/ui/PrendaCelda";
import { ColumnaHora, FILA_ACTIVIDAD, PUNTO_ACTIVIDAD } from "@/components/ui/lista-actividad";
import {
  etiquetaConDireccion,
  nombreCortoSububicacion,
  partesOrigenDestino,
  referenciaMovimiento,
  resumirBajadas,
  resumirOperacion,
  textoApartado,
  textoCantidadOperacion,
  textoDelta,
  tonoCategoria,
  type Movimiento,
  type OperacionMovimiento,
  type PrendaDeMovimiento,
  type ReferenciaMovimiento,
} from "@/lib/movimientos-reglas";

// Una fila de la lista de Movimientos: una prenda, cuánto, de dónde a dónde, el proceso que lo originó y su
// referencia. Varias filas guardadas de una sola vez son UNA operación (ADR-0234): `FilaOperacion` las muestra como una
// fila que se despliega y, adentro, cada prenda con esta misma `FilaMovimiento`.
//
// Forma (rediseño 2026-09-22, elegida por Felipe en la demo de
// docs/maquetas/movimientos-rediseno-2026-09/): la lista de la guía oficial, no una tabla.
// Cada fila: hora (primera columna, aparte de la prenda) · punto de color · prenda (foto, nombre y debajo
// talla · color · dónde) · proceso (y debajo, de dónde a dónde) · referencia · cantidad. La tabla de seis columnas no cabía en
// ~650 px; la lista se lee de corrido en escritorio y en celular pasa a dos líneas —prenda y
// cantidad arriba, proceso y referencia abajo— sin desplazarse de lado. Ya no hay
// «Responsable»: la autoría sigue guardada y se ve en el detalle.
//
// La rejilla de la fila, el punto y la columna de hora viven en `ui/lista-actividad.tsx`: Conteos recientes se lee igual y las usa de ahí.
//
// La fila NO es un <button>: la referencia es un enlace y un enlace dentro de un botón
// no es HTML válido. El botón que abre el detalle cubre la fila entera (`absolute
// inset-0`) y el enlace queda encima (`relative z-10`).
/** La fila de origen del cajón abierto (diseño aprobado 2026-09-28): un lavado suave, nunca un color fuerte — se
 *  agrega AL LADO de `FILA_ACTIVIDAD`, no lo reemplaza, así sigue reaccionando al hover igual que cualquier otra. */
const FILA_SELECCIONADA = "bg-hueso/70";

/** Lo que una fila necesita saber de la pantalla, igual para todas. */
export type ContextoFila = {
  enlaceCompras: boolean;
  /** ¿Quien mira ve el Historial de ventas? Entonces la boleta de una venta abre su detalle. */
  enlaceVentas: boolean;
  /** La lista con sus filtros, para que «←» en un traslado o un conteo vuelva aquí (`?volver=`). */
  volverA: string;
  /** Cuántas quedaron en la tienda después de cada movimiento, por id (ADR-0234, saldo). Null = sin el dato. */
  saldos: Record<string, number> | null;
  /** El apartado de cada movimiento de apartar o liberar, por id (ADR-0241): la fila dice su código y lleva a él. */
  apartados: Record<string, ApartadoDeMovimiento>;
  /** Qué módulos ve quien mira y si puede ajustar: decide qué atajos aparecen (ADR-0241). */
  accesos: AccesosAtajos;
  onAbrir: (m: Movimiento) => void;
  onAbrirVenta: (m: Movimiento) => void;
  /** El id de UNA fila del movimiento que está abierto en el cajón (diseño aprobado 2026-09-28): alcanza con ese id
   *  para saber si ESTA fila, o la operación que la contiene, es la que se ve — la fila lo marca suave, sin colores
   *  fuertes (sección 20 del pedido). Null = ningún cajón abierto. */
  abiertoId: string | null;
};

/** La referencia de un apartado (ADR-0241): su código, que lleva a ESE apartado si quien mira ve Apartados, y la clienta
 *  debajo. Sin apartado leído (uno anterior a Apartados v2, o la lectura falló), nada: la fila ya dice «Apartado». */
function referenciaApartado(m: Movimiento, ctx: ContextoFila): ReferenciaMovimiento | null {
  const a = ctx.apartados[m.id];
  if (!a) return null;
  return { texto: a.codigo, detalle: a.clienta || null, href: ctx.accesos.modulos.includes("apartados") ? `/vender/apartados?abrir=${a.separacionId}` : null };
}

/** El enlace de una referencia con el camino de vuelta a esta lista. */
function conVuelta(href: string, volverA: string): string {
  return `${href}${href.includes("?") ? "&" : "?"}volver=${encodeURIComponent(volverA)}`;
}

export function FilaMovimiento({ m, prenda, ctx, dentroDeOperacion = false }: { m: Movimiento; prenda?: PrendaDeMovimiento; ctx: ContextoFila; dentroDeOperacion?: boolean }) {
  const { origen, destino } = partesOrigenDestino(m);
  const etiqueta = etiquetaConDireccion(m);
  const esApartado = m.categoria === "apartado" || m.categoria === "liberacion_apartado";
  const referencia = esApartado ? referenciaApartado(m, ctx) : referenciaMovimiento(m, { enlaceCompras: ctx.enlaceCompras });
  const donde = m.sububicacion ? nombreCortoSububicacion(m.sububicacion) : null;
  const variante = [m.talla, m.color].filter(Boolean).join(" · ");
  const interno = m.categoria === "interno" || esApartado;
  const quedan = textoQuedan(ctx.saldos?.[m.id]);
  const seleccionada = ctx.abiertoId === m.id;
  return (
    <li className={`${FILA_ACTIVIDAD} ${dentroDeOperacion ? "sm:pl-6" : ""} ${seleccionada ? FILA_SELECCIONADA : ""}`}>
      <button
        type="button"
        onClick={() => ctx.onAbrir(m)}
        aria-label={`Ver el detalle: ${etiqueta}, ${m.referencia}${variante ? ` ${variante}` : ""}, ${textoDelta(m)}${quedan ? `, ${quedan}` : ""}`}
        className="absolute inset-0 rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-rojo"
      />

      <ColumnaHora desde={dentroDeOperacion ? null : m.hora} />

      <span aria-hidden className={`mt-1.5 h-[7px] w-[7px] rounded-full sm:mt-0 ${PUNTO_ACTIVIDAD[tonoCategoria(m.categoria, m.delta)]}`} />

      {/* Prenda: la foto (en una tienda de ropa, la prenda se reconoce por la foto antes que por el nombre), el nombre y
          debajo talla · color · dónde (y la hora, solo en celular). El SKU queda en el título (y la búsqueda lo encuentra). */}
      <span className="flex min-w-0 items-center gap-2.5" title={m.sku}>
        <MiniaturaPrenda fotoUrl={prenda?.fotoUrl ?? null} />
        <span className="min-w-0">
          <span className="block truncate text-[13.5px] font-semibold text-tinta">{m.referencia}</span>
          <span className="block truncate text-xs tabular-nums text-taupe sm:hidden">
            {[variante, dentroDeOperacion ? null : m.hora, donde].filter(Boolean).join(" · ")}
          </span>
          <span className="hidden truncate text-xs tabular-nums text-taupe sm:block">{[variante, donde].filter(Boolean).join(" · ")}</span>
        </span>
      </span>

      {/* Proceso y referencia. Dentro de una operación ya los dice su fila: acá sobran. En celular bajan a una segunda
          línea bajo la prenda (col-start-2 col-span-2); desde sm cada uno tiene su columna. */}
      {!dentroDeOperacion && (
        <span className="col-span-2 col-start-2 row-start-2 flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5 sm:contents">
          <span className="min-w-0 sm:col-start-4 sm:row-start-1">
            {/* El proceso y la dirección son lo que se viene a leer: si no caben se parten, no se
                cortan con «…» («Entrada · Traslado rec…» no dice si llegó o salió). */}
            <span className="block break-words text-[13px] leading-snug text-tinta">{etiqueta}</span>
            <span className="hidden break-words text-xs leading-snug text-taupe sm:block">{destino ? `${origen} → ${destino}` : origen}</span>
          </span>
          <span className="min-w-0 sm:col-start-5 sm:row-start-1">
            {m.venta && ctx.enlaceVentas ? (
              <BotonReferencia texto={referencia?.texto ?? "Ver la venta"} onClick={() => ctx.onAbrirVenta(m)} />
            ) : (
              referencia && <Referencia r={referencia} volverA={ctx.volverA} />
            )}
          </span>
        </span>
      )}

      <span
        className={`col-start-3 row-start-1 flex items-center justify-end gap-1 text-right text-[13.5px] font-bold tabular-nums sm:col-start-6 ${
          m.delta > 0 ? "text-verde" : interno ? "font-medium text-taupe" : "text-tinta"
        }`}
      >
        {/* La cantidad y, debajo, cuántas quedaron en la tienda al terminar (ADR-0234, saldo): la pregunta con la que se
            llega a esta pantalla («¿cuántas nos quedan?»). En chico y en taupe: acompaña a la cantidad, no compite. */}
        <span className="flex flex-col items-end leading-tight">
          <span>
            {/* Un apartado no entra ni sale: «1 apartada» / «1 libre», no «⇄ 1» (ADR-0241). */}
            {esApartado ? (
              textoApartado(m.cantidad, m.categoria as "apartado" | "liberacion_apartado")
            ) : (
              <>
                {interno && <span aria-hidden>⇄ </span>}
                {textoDelta(m)}
              </>
            )}
          </span>
          {quedan && <span className="mt-0.5 whitespace-nowrap text-[11px] font-normal text-taupe">{quedan}</span>}
        </span>
        {/* Que se puede tocar, sin tener que descubrirlo: la misma flecha que las tarjetas clicables. */}
        <ChevronRight aria-hidden strokeWidth={1.5} className="h-4 w-4 shrink-0 text-tinta/30" />
      </span>
    </li>
  );
}

/** Varias prendas guardadas de una sola vez: una fila que dice qué pasó, cuánto y de qué, y que al tocarla abre el
 *  cajón con TODAS sus prendas (diseño aprobado 2026-09-28, sección 4-6 del pedido: ya no se despliega hacia abajo —
 *  antes de esta fecha, `abierta`/`onAlternar` insertaban una `<ul>` con una `FilaMovimiento` por variante debajo de
 *  esta misma fila). Una operación de una sola prenda no pasa por acá: es una `FilaMovimiento` como cualquier otra. */
export function FilaOperacion({ op, prendas, ctx }: { op: OperacionMovimiento; prendas: Record<string, PrendaDeMovimiento>; ctx: ContextoFila }) {
  const r = resumirOperacion(op, { enlaceCompras: ctx.enlaceCompras });
  const primera = op.filas[0];
  const esApartado = primera.categoria === "apartado" || primera.categoria === "liberacion_apartado";
  const referencia = esApartado ? referenciaApartado(primera, ctx) : r.referencia;
  const donde = primera.sububicacion ? nombreCortoSububicacion(primera.sububicacion) : null;
  const productos = r.productos.length <= 2 ? r.productos.join(" y ") : `${r.productos.slice(0, 2).join(", ")} y ${r.productos.length - 2} más`;
  // Hasta tres fotos, una por producto: se reconoce el envío de un vistazo.
  const fotos = [...new Set(op.filas.map((m) => m.varianteId))]
    .map((id) => prendas[id]?.fotoUrl ?? null)
    .filter((url, i, todas) => todas.indexOf(url) === i)
    .slice(0, 3);
  const seleccionada = op.filas.some((m) => m.id === ctx.abiertoId);
  return (
    <li>
      <div className={`${FILA_ACTIVIDAD} ${seleccionada ? FILA_SELECCIONADA : ""}`}>
        <button
          type="button"
          onClick={() => ctx.onAbrir(primera)}
          aria-label={`Ver el detalle: las ${r.variantes} prendas de ${r.etiqueta}, ${textoCantidadOperacion(r)}`}
          className="absolute inset-0 rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-rojo"
        />
        <ColumnaHora desde={op.hora} />

        {/* Un cambio entra y sale a la vez: ni verde ni rojo. */}
        <span
          aria-hidden
          className={`mt-1.5 h-[7px] w-[7px] rounded-full sm:mt-0 ${PUNTO_ACTIVIDAD[r.entran > 0 && r.salen > 0 ? "neutro" : tonoCategoria(primera.categoria, r.entran - r.salen)]}`}
        />

        <span className="flex min-w-0 items-center gap-2.5">
          <span aria-hidden className="flex shrink-0 -space-x-3">
            {fotos.map((url, i) => (
              <span key={i} className="rounded-md ring-2 ring-papel">
                <MiniaturaPrenda fotoUrl={url} />
              </span>
            ))}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[13.5px] font-semibold text-tinta" title={r.productos.join(", ")}>
              {productos}
            </span>
            <span className="block truncate text-xs tabular-nums text-taupe sm:hidden">
              {[`${r.variantes} ${r.variantes === 1 ? "prenda distinta" : "prendas distintas"}`, op.hora, donde].filter(Boolean).join(" · ")}
            </span>
            <span className="hidden truncate text-xs tabular-nums text-taupe sm:block">
              {[`${r.variantes} ${r.variantes === 1 ? "prenda distinta" : "prendas distintas"}`, donde].filter(Boolean).join(" · ")}
            </span>
          </span>
        </span>

        <span className="col-span-2 col-start-2 row-start-2 flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5 sm:contents">
          <span className="min-w-0 sm:col-start-4 sm:row-start-1">
            <span className="block break-words text-[13px] leading-snug text-tinta">{r.etiqueta}</span>
            <span className="hidden break-words text-xs leading-snug text-taupe sm:block">{r.destino ? `${r.origen} → ${r.destino}` : r.origen}</span>
          </span>
          <span className="min-w-0 sm:col-start-5 sm:row-start-1">
            {primera.venta && ctx.enlaceVentas ? (
              <BotonReferencia texto={r.referencia?.texto ?? "Ver la venta"} onClick={() => ctx.onAbrirVenta(primera)} />
            ) : (
              referencia && <Referencia r={referencia} volverA={ctx.volverA} />
            )}
          </span>
        </span>

        <span className={`col-start-3 row-start-1 flex items-center justify-end gap-1 text-right text-[13.5px] font-bold tabular-nums sm:col-start-6 ${r.entran > 0 && r.salen === 0 ? "text-verde" : r.entran + r.salen === 0 && (r.movidas > 0 || r.apartadas > 0 || r.liberadas > 0) ? "font-medium text-taupe" : "text-tinta"}`}>
          <span className="whitespace-nowrap">{textoCantidadOperacion(r)}</span>
          <ChevronRight aria-hidden strokeWidth={1.5} className="h-4 w-4 shrink-0 text-tinta/30" />
        </span>
      </div>
    </li>
  );
}

/** Las bajadas al piso de un día, plegadas en una fila (ADR-0241): en «Todos» no cambian el total y ocupaban un tercio
 *  de la lista. Se despliega en sus operaciones, cada una como siempre. Solo existe en «Todos» sin búsqueda: con la
 *  píldora «Piso ↔ almacén» o buscando una prenda, cada bajada es su fila (quien viene a confirmar «¿la bajé?» la ve). */
export function FilaBajadas({
  clave,
  operaciones,
  prendas,
  ctx,
  abierta,
  onAlternar,
}: {
  clave: string;
  operaciones: OperacionMovimiento[];
  prendas: Record<string, PrendaDeMovimiento>;
  ctx: ContextoFila;
  abierta: boolean;
  onAlternar: () => void;
}) {
  const r = resumirBajadas(operaciones);
  const fotos = [...new Set(operaciones.flatMap((op) => op.filas.map((m) => prendas[m.varianteId]?.fotoUrl ?? null)))].slice(0, 3);
  const detalleId = clave.replace(/[^a-zA-Z0-9-]/g, "");
  const horas = r.desde === r.hasta ? r.hasta : `${r.desde}–${r.hasta}`;
  return (
    <li>
      <div className={FILA_ACTIVIDAD}>
        <button
          type="button"
          onClick={onAlternar}
          aria-expanded={abierta}
          aria-controls={detalleId}
          aria-label={`${abierta ? "Ocultar" : "Ver"} las ${r.veces} ${r.etiqueta.toLowerCase()}: ${r.tallas} tallas, ${r.unidades} unidades`}
          className="absolute inset-0 rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-rojo"
        />
        <ColumnaHora desde={r.desde} hasta={r.hasta} />
        <span aria-hidden className={`mt-1.5 h-[7px] w-[7px] rounded-full sm:mt-0 ${PUNTO_ACTIVIDAD.ambar}`} />
        <span className="flex min-w-0 items-center gap-2.5">
          <span aria-hidden className="flex shrink-0 -space-x-3">
            {fotos.map((url, i) => (
              <span key={i} className="rounded-md ring-2 ring-papel">
                <MiniaturaPrenda fotoUrl={url} />
              </span>
            ))}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[13.5px] font-semibold text-tinta">{r.etiqueta}</span>
            <span className="block truncate text-xs tabular-nums text-taupe">
              {r.veces} veces · {r.tallas} {r.tallas === 1 ? "talla" : "tallas"}
              <span className="sm:hidden"> · {horas}</span>
            </span>
          </span>
        </span>
        <span className="col-span-2 col-start-2 row-start-2 flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5 sm:contents">
          <span className="min-w-0 sm:col-start-4 sm:row-start-1">
            <span className="block text-[13px] leading-snug text-tinta">Dentro de la sede</span>
            <span className="block text-xs leading-snug text-taupe">No cambian el total</span>
          </span>
        </span>
        <span className="col-start-3 row-start-1 flex items-center justify-end gap-1 text-right text-[13.5px] font-medium tabular-nums text-taupe sm:col-start-6">
          ⇄ {r.unidades}
          <ChevronDown aria-hidden strokeWidth={1.5} className={`h-4 w-4 shrink-0 text-tinta/40 transition-transform duration-200 motion-reduce:transition-none ${abierta ? "rotate-180" : ""}`} />
        </span>
      </div>
      {abierta && (
        <ul id={detalleId} className="mb-2 ml-2 divide-y divide-sand/70 border-l-2 border-sand pl-2">
          {operaciones.map((op) =>
            op.filas.length === 1 ? (
              <FilaMovimiento key={op.clave} m={op.filas[0]} prenda={prendas[op.filas[0].varianteId]} ctx={ctx} />
            ) : (
              <FilaOperacion key={op.clave} op={op} prendas={prendas} ctx={ctx} />
            )
          )}
        </ul>
      )}
    </li>
  );
}

/** La referencia de una venta, que abre su detalle (el mismo de Historial) en vez de llevar a otra pantalla. Encima del
 *  botón que cubre la fila (`relative z-10`), como los enlaces. */
function BotonReferencia({ texto, onClick }: { texto: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative z-10 inline-block max-w-full truncate text-left align-bottom text-[13px] text-tinta underline decoration-tinta/30 underline-offset-2 transition-colors hover:text-rojo hover:decoration-rojo focus-visible:outline focus-visible:outline-2 focus-visible:outline-rojo"
    >
      {texto}
    </button>
  );
}

/** La referencia: texto, o enlace (tinta subrayado, como los demás enlaces de acción del
 *  sistema — ADR-0105) cuando lleva a algo. `relative z-10` para quedar por encima del botón
 *  que cubre la fila. El enlace lleva el camino de vuelta a esta lista. */
export function Referencia({ r, volverA }: { r: ReferenciaMovimiento; volverA: string }) {
  return (
    <span className="block min-w-0">
      {r.href ? (
        <Link
          href={conVuelta(r.href, volverA)}
          title={`Abrir ${r.texto}`}
          className="relative z-10 inline-block max-w-full truncate align-bottom text-[13px] text-tinta underline decoration-tinta/30 underline-offset-2 transition-colors hover:text-rojo hover:decoration-rojo focus-visible:outline focus-visible:outline-2 focus-visible:outline-rojo"
        >
          {r.texto}
        </Link>
      ) : (
        <span className="block truncate text-[13px] text-taupe" title={r.texto}>
          {r.texto}
        </span>
      )}
      {r.detalle && (
        <span className="block truncate text-xs text-taupe" title={r.detalle}>
          {r.detalle}
        </span>
      )}
    </span>
  );
}
