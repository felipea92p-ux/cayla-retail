"use client";

import Link from "next/link";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { TonoChip } from "@/components/ui/Chip";
import { MiniaturaPrenda } from "@/components/ui/PrendaCelda";
import {
  etiquetaConDireccion,
  nombreCortoSububicacion,
  partesOrigenDestino,
  referenciaMovimiento,
  resumirOperacion,
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
// Cada fila: punto de color · prenda (foto, nombre y debajo talla · color · hora · dónde) · proceso (y
// debajo, de dónde a dónde) · referencia · cantidad. La tabla de seis columnas no cabía en
// ~650 px; la lista se lee de corrido en escritorio y en celular pasa a dos líneas —prenda y
// cantidad arriba, proceso y referencia abajo— sin desplazarse de lado. Ya no hay
// «Responsable»: la autoría sigue guardada y se ve en el detalle.
//
// La fila NO es un <button>: la referencia es un enlace y un enlace dentro de un botón
// no es HTML válido. El botón que abre el detalle cubre la fila entera (`absolute
// inset-0`) y el enlace queda encima (`relative z-10`).
export const FILA_MOVIMIENTO =
  "relative grid grid-cols-[0.5rem_minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1 py-3 transition-colors hover:bg-crema/60 focus-within:bg-crema/60 sm:grid-cols-[0.5rem_minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)_5.5rem] sm:items-center sm:gap-x-4 sm:px-2";

// El tono que antes llevaba el chip de categoría, ahora como un punto: sobrio, y no
// obliga a que «Entrada · Traslado recibido» quepa en un chip de versalitas.
export const PUNTO_MOVIMIENTO: Record<TonoChip, string> = {
  neutro: "bg-tinta/30",
  ambar: "bg-ambar",
  verde: "bg-verde",
  rojo: "bg-rojo",
  pizarra: "bg-pizarra",
  apagado: "bg-tinta/15",
};

/** Lo que una fila necesita saber de la pantalla, igual para todas. */
export type ContextoFila = {
  enlaceCompras: boolean;
  /** ¿Quien mira ve el Historial de ventas? Entonces la boleta de una venta abre su detalle. */
  enlaceVentas: boolean;
  /** La lista con sus filtros, para que «←» en un traslado o un conteo vuelva aquí (`?volver=`). */
  volverA: string;
  onAbrir: (m: Movimiento) => void;
  onAbrirVenta: (m: Movimiento) => void;
};

/** El enlace de una referencia con el camino de vuelta a esta lista. */
function conVuelta(href: string, volverA: string): string {
  return `${href}${href.includes("?") ? "&" : "?"}volver=${encodeURIComponent(volverA)}`;
}

export function FilaMovimiento({ m, prenda, ctx, dentroDeOperacion = false }: { m: Movimiento; prenda?: PrendaDeMovimiento; ctx: ContextoFila; dentroDeOperacion?: boolean }) {
  const { origen, destino } = partesOrigenDestino(m);
  const etiqueta = etiquetaConDireccion(m);
  const referencia = referenciaMovimiento(m, { enlaceCompras: ctx.enlaceCompras });
  const donde = m.sububicacion ? nombreCortoSububicacion(m.sububicacion) : null;
  const variante = [m.talla, m.color].filter(Boolean).join(" · ");
  const interno = m.categoria === "interno" || m.categoria === "apartado" || m.categoria === "liberacion_apartado";
  return (
    <li className={`${FILA_MOVIMIENTO} ${dentroDeOperacion ? "sm:pl-6" : ""}`}>
      <button
        type="button"
        onClick={() => ctx.onAbrir(m)}
        aria-label={`Ver el detalle: ${etiqueta}, ${m.referencia}${variante ? ` ${variante}` : ""}, ${textoDelta(m)}`}
        className="absolute inset-0 rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-rojo"
      />

      <span aria-hidden className={`mt-1.5 h-[7px] w-[7px] rounded-full sm:mt-0 ${PUNTO_MOVIMIENTO[tonoCategoria(m.categoria, m.delta)]}`} />

      {/* Prenda: la foto (en una tienda de ropa, la prenda se reconoce por la foto antes que por el nombre), el nombre y
          debajo talla · color · hora · dónde. El SKU queda en el título (y la búsqueda lo encuentra). */}
      <span className="flex min-w-0 items-center gap-2.5" title={m.sku}>
        <MiniaturaPrenda fotoUrl={prenda?.fotoUrl ?? null} />
        <span className="min-w-0">
          <span className="block truncate text-[13.5px] font-semibold text-tinta">{m.referencia}</span>
          <span className="block truncate text-xs tabular-nums text-taupe">
            {[variante, dentroDeOperacion ? null : m.hora, donde].filter(Boolean).join(" · ")}
          </span>
        </span>
      </span>

      {/* Proceso y referencia. Dentro de una operación ya los dice su fila: acá sobran. En celular bajan a una segunda
          línea bajo la prenda (col-start-2 col-span-2); desde sm cada uno tiene su columna. */}
      {!dentroDeOperacion && (
        <span className="col-span-2 col-start-2 row-start-2 flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5 sm:contents">
          <span className="min-w-0 sm:col-start-3 sm:row-start-1">
            {/* El proceso y la dirección son lo que se viene a leer: si no caben se parten, no se
                cortan con «…» («Entrada · Traslado rec…» no dice si llegó o salió). */}
            <span className="block break-words text-[13px] leading-snug text-tinta">{etiqueta}</span>
            <span className="hidden break-words text-xs leading-snug text-taupe sm:block">{destino ? `${origen} → ${destino}` : origen}</span>
          </span>
          <span className="min-w-0 sm:col-start-4 sm:row-start-1">
            {m.venta && ctx.enlaceVentas ? (
              <BotonReferencia texto={referencia?.texto ?? "Ver la venta"} onClick={() => ctx.onAbrirVenta(m)} />
            ) : (
              referencia && <Referencia r={referencia} volverA={ctx.volverA} />
            )}
          </span>
        </span>
      )}

      <span
        className={`col-start-3 row-start-1 flex items-center justify-end gap-1 text-right text-[13.5px] font-bold tabular-nums sm:col-start-5 ${
          m.delta > 0 ? "text-verde" : interno ? "font-medium text-taupe" : "text-tinta"
        }`}
      >
        {interno && <span aria-hidden>⇄ </span>}
        {textoDelta(m)}
        {/* Que se puede tocar, sin tener que descubrirlo: la misma flecha que las tarjetas clicables. */}
        <ChevronRight aria-hidden strokeWidth={1.5} className="h-4 w-4 shrink-0 text-tinta/30" />
      </span>
    </li>
  );
}

/** Varias prendas guardadas de una sola vez: una fila que dice qué pasó, cuánto y de qué, y que al tocarla se despliega
 *  en sus prendas. Una operación de una sola prenda no pasa por acá: es una `FilaMovimiento` como cualquier otra. */
export function FilaOperacion({
  op,
  prendas,
  ctx,
  abierta,
  onAlternar,
}: {
  op: OperacionMovimiento;
  prendas: Record<string, PrendaDeMovimiento>;
  ctx: ContextoFila;
  abierta: boolean;
  onAlternar: () => void;
}) {
  const r = resumirOperacion(op, { enlaceCompras: ctx.enlaceCompras });
  const primera = op.filas[0];
  const donde = primera.sububicacion ? nombreCortoSububicacion(primera.sububicacion) : null;
  const productos = r.productos.length <= 2 ? r.productos.join(" y ") : `${r.productos.slice(0, 2).join(", ")} y ${r.productos.length - 2} más`;
  // Hasta tres fotos, una por producto: se reconoce el envío de un vistazo.
  const fotos = [...new Set(op.filas.map((m) => m.varianteId))]
    .map((id) => prendas[id]?.fotoUrl ?? null)
    .filter((url, i, todas) => todas.indexOf(url) === i)
    .slice(0, 3);
  const detalleId = `op-${op.clave.replace(/[^a-zA-Z0-9]/g, "")}`;
  return (
    <li>
      <div className={FILA_MOVIMIENTO}>
        <button
          type="button"
          onClick={onAlternar}
          aria-expanded={abierta}
          aria-controls={detalleId}
          aria-label={`${abierta ? "Ocultar" : "Ver"} las ${r.variantes} prendas: ${r.etiqueta}, ${textoCantidadOperacion(r)}`}
          className="absolute inset-0 rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-rojo"
        />
        {/* Un cambio entra y sale a la vez: ni verde ni rojo. */}
        <span
          aria-hidden
          className={`mt-1.5 h-[7px] w-[7px] rounded-full sm:mt-0 ${PUNTO_MOVIMIENTO[r.entran > 0 && r.salen > 0 ? "neutro" : tonoCategoria(primera.categoria, r.entran - r.salen)]}`}
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
            <span className="block truncate text-xs tabular-nums text-taupe">
              {[`${r.variantes} ${r.variantes === 1 ? "variante" : "variantes"}`, op.hora, donde].filter(Boolean).join(" · ")}
            </span>
          </span>
        </span>

        <span className="col-span-2 col-start-2 row-start-2 flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5 sm:contents">
          <span className="min-w-0 sm:col-start-3 sm:row-start-1">
            <span className="block break-words text-[13px] leading-snug text-tinta">{r.etiqueta}</span>
            <span className="hidden break-words text-xs leading-snug text-taupe sm:block">{r.destino ? `${r.origen} → ${r.destino}` : r.origen}</span>
          </span>
          <span className="min-w-0 sm:col-start-4 sm:row-start-1">
            {primera.venta && ctx.enlaceVentas ? (
              <BotonReferencia texto={r.referencia?.texto ?? "Ver la venta"} onClick={() => ctx.onAbrirVenta(primera)} />
            ) : (
              r.referencia && <Referencia r={r.referencia} volverA={ctx.volverA} />
            )}
          </span>
        </span>

        <span className={`col-start-3 row-start-1 flex items-center justify-end gap-1 text-right text-[13.5px] font-bold tabular-nums sm:col-start-5 ${r.entran > 0 && r.salen === 0 ? "text-verde" : r.movidas > 0 && r.entran + r.salen === 0 ? "font-medium text-taupe" : "text-tinta"}`}>
          {textoCantidadOperacion(r)}
          <ChevronDown aria-hidden strokeWidth={1.5} className={`h-4 w-4 shrink-0 text-tinta/40 transition-transform duration-200 motion-reduce:transition-none ${abierta ? "rotate-180" : ""}`} />
        </span>
      </div>

      {abierta && (
        <ul id={detalleId} className="mb-2 ml-2 divide-y divide-sand/70 border-l-2 border-sand pl-2">
          {op.filas.map((m) => (
            <FilaMovimiento key={m.id} m={m} prenda={prendas[m.varianteId]} ctx={ctx} dentroDeOperacion />
          ))}
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
