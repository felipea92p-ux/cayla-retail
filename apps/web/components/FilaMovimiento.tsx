"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { textoQuedan } from "@/lib/movimientos-saldo";
import type { AccesosAtajos, ApartadoDeMovimiento } from "@/lib/movimientos-atajos";
import { MiniaturaPrenda } from "@/components/ui/PrendaCelda";
import { SelloTipo, useRepetirAlPasar } from "@/components/movimientos/SelloTipo";
import { TrayectoMovimiento } from "@/components/movimientos/TrayectoMovimiento";
import {
  etiquetaConDireccion,
  nombreCortoSububicacion,
  partesOrigenDestino,
  referenciaMovimiento,
  referenciaSinDocumento,
  resumirBajadas,
  resumirOperacion,
  textoApartado,
  textoCantidadOperacion,
  textoDelta,
  type Movimiento,
  type OperacionMovimiento,
  type PrendaDeMovimiento,
  type ReferenciaMovimiento,
} from "@/lib/movimientos-reglas";
import { TIPOS_VISUALES, rotuloDeMovimiento, tipoDeOperacion, type TipoVisual } from "@/lib/movimientos-tipos";

// Una fila de la lista de Movimientos (rediseño 2026-10-05, ADR-0353; maqueta: docs/maquetas/movimientos-rediseno-2026-10/,
// opción A · Ruta, elegida por Felipe). Se lee de izquierda a derecha: el SELLO del tipo (su color y su ícono dicen de un
// vistazo si fue una venta, una colgada en piso, una guardada en almacén…) · qué fue y de qué prenda · el TRAYECTO «de dónde
// a dónde» con su referencia · la cantidad en grande, con el color del tipo.
//
// Varias filas guardadas de una sola vez son UNA operación (ADR-0234): `FilaOperacion` las muestra como una fila y, al
// tocarla, el cajón trae todas sus prendas (diseño aprobado 2026-09-28). Sin columna de persona (2026-09-19): la autoría sigue
// guardada y se ve en el detalle. Hasta el 2026-10-04 la fila tenía la hora en una columna aparte, un punto de color y seis
// celdas; la rejilla compartida con Conteos recientes (`ui/lista-actividad.tsx`) sigue ahí para Conteo, no para esta lista.
//
// La fila NO es un <button>: la referencia es un enlace y un enlace dentro de un botón no es HTML válido. El botón que abre
// el detalle cubre la fila entera (`absolute inset-0`) y el enlace queda encima (`relative z-10`).

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
   *  para saber si ESTA fila, o la operación que la contiene, es la que se ve — la fila lo marca con un lavado suave del
   *  color de su tipo (sección 20 del pedido). Null = ningún cajón abierto. */
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

/** «1 prenda» / «5 prendas» sin la cifra: la palabra que acompaña a la cantidad en grande. */
const palabraPrendas = (n: number) => (Math.abs(n) === 1 ? "prenda" : "prendas");

/** La cantidad de una operación en grande: «+80», «−3», «+1 / −1». Las de dentro de la tienda (una colgada, una guardada)
 *  dicen solo el número: el ícono y el trayecto ya dicen que pasaron entre el piso y el almacén, y «⇄ 91» era ruido. */
function textoCantidadOperacionVisual(r: ReturnType<typeof resumirOperacion>, tipo: TipoVisual): string {
  return r.movidas > 0 && r.entran + r.salen === 0 && (tipo === "colgada" || tipo === "guardada" || tipo === "movida" || tipo === "danada") ? String(r.movidas) : textoCantidadOperacion(r);
}

/** Lo que dice el lugar cuando no hay a dónde ir (un ajuste, un conteo). */
function textoSolo(tipo: TipoVisual): string | undefined {
  if (tipo === "conteo") return "se corrigió tras contar";
  return tipo === "ajuste" ? "se corrigió aquí" : undefined;
}

const BOTON_CUBRE_FILA = "absolute inset-0 rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-rojo";

export function FilaMovimiento({ m, prenda, ctx }: { m: Movimiento; prenda?: PrendaDeMovimiento; ctx: ContextoFila }) {
  const { origen, destino } = partesOrigenDestino(m);
  const etiqueta = etiquetaConDireccion(m);
  const rotulo = rotuloDeMovimiento(m);
  const esApartado = m.categoria === "apartado" || m.categoria === "liberacion_apartado";
  const referencia = esApartado ? referenciaApartado(m, ctx) : (referenciaMovimiento(m, { enlaceCompras: ctx.enlaceCompras }) ?? referenciaSinDocumento(m));
  const donde = m.sububicacion ? nombreCortoSububicacion(m.sububicacion) : null;
  const variante = [m.talla, m.color].filter(Boolean).join(" · ");
  const quedan = textoQuedan(ctx.saldos?.[m.id]);
  const { vuelta, props } = useRepetirAlPasar();
  return (
    <li className="mv-fila" data-op={m.id} data-mv-tono={TIPOS_VISUALES[rotulo.tipo].tono} data-sel={ctx.abiertoId === m.id ? "" : undefined} {...props}>
      <button
        type="button"
        onClick={() => ctx.onAbrir(m)}
        aria-label={`Ver el detalle: ${etiqueta}, ${m.referencia}${variante ? ` ${variante}` : ""}, ${textoDelta(m)}${quedan ? `, ${quedan}` : ""}`}
        className={BOTON_CUBRE_FILA}
      />
      <SelloTipo key={vuelta} tipo={rotulo.tipo} tamano={46} />

      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
          <span className="mv-rotulo">
            {rotulo.titulo}
            {rotulo.detalle ? ` · ${rotulo.detalle}` : ""}
          </span>
          <span className="text-xs tabular-nums text-taupe">{m.hora}</span>
        </div>
        {/* La foto (en una tienda de ropa, la prenda se reconoce por la foto antes que por el nombre), el nombre y debajo
            talla · color · dónde. El SKU queda en el título (y la búsqueda lo encuentra). */}
        <div className="mt-1.5 flex min-w-0 items-center gap-2.5" title={m.sku}>
          <MiniaturaPrenda fotoUrl={prenda?.fotoUrl ?? null} />
          <span className="min-w-0">
            <span className="block truncate text-[13.5px] font-semibold text-tinta">{m.referencia}</span>
            <span className="block truncate text-xs tabular-nums text-taupe">{[variante, donde].filter(Boolean).join(" · ")}</span>
          </span>
        </div>
        <div className="mt-2 flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1.5">
          <TrayectoMovimiento origen={origen} destino={destino} tipo={rotulo.tipo} motivo={m.motivo} solo={textoSolo(rotulo.tipo)} />
          {/* El enlace de una venta abre SU detalle en vez de llevar a otra pantalla. */}
          {m.venta && ctx.enlaceVentas ? (
            <BotonReferencia texto={referencia?.texto ?? "Ver la venta"} onClick={() => ctx.onAbrirVenta(m)} />
          ) : (
            referencia && <Referencia r={referencia} volverA={ctx.volverA} />
          )}
        </div>
      </div>

      {/* La cantidad en grande y, debajo, cuántas quedaron en la tienda al terminar (ADR-0234, saldo): la pregunta con la que
          se llega a esta pantalla («¿cuántas nos quedan?»). Sin ese dato, la palabra «prendas». */}
      <div className="flex items-center gap-1 text-right">
        <span className="flex flex-col items-end gap-0.5">
          <span className="mv-cant">{esApartado ? textoApartado(m.cantidad, m.categoria as "apartado" | "liberacion_apartado") : textoDelta(m)}</span>
          <span className="whitespace-nowrap text-[11px] text-taupe">{esApartado ? "" : (quedan ?? palabraPrendas(m.cantidad))}</span>
        </span>
        {/* Que se puede tocar, sin tener que descubrirlo: la misma flecha que las tarjetas clicables. */}
        <ChevronRight aria-hidden strokeWidth={1.5} className="h-4 w-4 shrink-0 text-tinta/30" />
      </div>
    </li>
  );
}

/** Varias prendas guardadas de una sola vez: una fila que dice qué pasó, cuánto y de qué, y que al tocarla abre el
 *  cajón con TODAS sus prendas (diseño aprobado 2026-09-28, sección 4-6 del pedido: ya no se despliega hacia abajo).
 *  Una operación de una sola prenda no pasa por acá: es una `FilaMovimiento` como cualquier otra. */
export function FilaOperacion({ op, prendas, ctx }: { op: OperacionMovimiento; prendas: Record<string, PrendaDeMovimiento>; ctx: ContextoFila }) {
  const r = resumirOperacion(op, { enlaceCompras: ctx.enlaceCompras });
  const primera = op.filas[0];
  const tipo = tipoDeOperacion(op.filas);
  const rotulo = rotuloDeMovimiento(primera);
  const esApartado = primera.categoria === "apartado" || primera.categoria === "liberacion_apartado";
  const referencia = esApartado ? referenciaApartado(primera, ctx) : (r.referencia ?? referenciaSinDocumento(primera));
  const donde = primera.sububicacion ? nombreCortoSububicacion(primera.sububicacion) : null;
  const productos = r.productos.length <= 2 ? r.productos.join(" y ") : `${r.productos.slice(0, 2).join(", ")} y ${r.productos.length - 2} más`;
  // Hasta tres fotos, una por producto: se reconoce el envío de un vistazo.
  const fotos = [...new Set(op.filas.map((m) => m.varianteId))]
    .map((id) => prendas[id]?.fotoUrl ?? null)
    .filter((url, i, todas) => todas.indexOf(url) === i)
    .slice(0, 3);
  const unidades = r.entran + r.salen + r.movidas + r.apartadas + r.liberadas;
  const { vuelta, props } = useRepetirAlPasar();
  return (
    <li className="mv-fila" data-op={primera.id} data-mv-tono={TIPOS_VISUALES[tipo].tono} data-sel={op.filas.some((m) => m.id === ctx.abiertoId) ? "" : undefined} {...props}>
      <button
        type="button"
        onClick={() => ctx.onAbrir(primera)}
        aria-label={`Ver el detalle: las ${r.variantes} prendas de ${r.etiqueta}, ${textoCantidadOperacion(r)}`}
        className={BOTON_CUBRE_FILA}
      />
      <SelloTipo key={vuelta} tipo={tipo} tamano={46} />

      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
          <span className="mv-rotulo">
            {rotulo.titulo}
            {rotulo.detalle ? ` · ${rotulo.detalle}` : ""}
          </span>
          <span className="text-xs tabular-nums text-taupe">{op.hora}</span>
        </div>
        <div className="mt-1.5 flex min-w-0 items-center gap-2.5">
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
              {[`${r.variantes} ${r.variantes === 1 ? "prenda distinta" : "prendas distintas"}`, donde].filter(Boolean).join(" · ")}
            </span>
          </span>
        </div>
        <div className="mt-2 flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1.5">
          <TrayectoMovimiento origen={r.origen} destino={r.destino} tipo={tipo} motivo={primera.motivo} solo={textoSolo(tipo)} />
          {primera.venta && ctx.enlaceVentas ? (
            <BotonReferencia texto={r.referencia?.texto ?? "Ver la venta"} onClick={() => ctx.onAbrirVenta(primera)} />
          ) : (
            referencia && <Referencia r={referencia} volverA={ctx.volverA} />
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 text-right">
        <span className="flex flex-col items-end gap-0.5">
          <span className="mv-cant">{textoCantidadOperacionVisual(r, tipo)}</span>
          <span className="whitespace-nowrap text-[11px] text-taupe">{esApartado ? "" : palabraPrendas(unidades)}</span>
        </span>
        <ChevronRight aria-hidden strokeWidth={1.5} className="h-4 w-4 shrink-0 text-tinta/30" />
      </div>
    </li>
  );
}

/** El MAZO: las colgadas (o las guardadas) de un día, plegadas en una fila con sus capas apiladas (ADR-0241, ADR-0353). Al
 *  tocarla se abre en abanico —cada operación es su fila, que a su vez abre el cajón— y al volver a tocarla se pliega. Solo existe
 *  en «Todos» sin búsqueda: con el filtro de tipo o buscando una prenda, cada una es su fila (quien viene a confirmar «¿la
 *  colgué?» la ve). El cajón de «todas juntas» (ADR-0241, 2026-09-28) lo reemplaza el abanico: cada operación ya tiene el suyo. */
export function FilaBajadas({ operaciones, prendas, ctx }: { operaciones: OperacionMovimiento[]; prendas: Record<string, PrendaDeMovimiento>; ctx: ContextoFila }) {
  const [abierto, setAbierto] = useState(false);
  const r = resumirBajadas(operaciones);
  // El tipo del mazo: el de todas si coinciden (todas colgadas), si no «movida» (y así dice su rótulo: «Movido dentro de la sede»).
  const tipos = new Set(operaciones.flatMap((op) => op.filas.map((m) => rotuloDeMovimiento(m).tipo)));
  const tipo: TipoVisual = tipos.size === 1 ? [...tipos][0] : "movida";
  const fotos = [...new Set(operaciones.flatMap((op) => op.filas.map((m) => prendas[m.varianteId]?.fotoUrl ?? null)))].slice(0, 3);
  const quienes = [...new Set(operaciones.map((op) => op.filas[0].usuario).filter((u): u is string => !!u))];
  const { vuelta, props } = useRepetirAlPasar();
  return (
    <li className="mv-mazo" data-mazo="" data-abierto={abierto ? "" : undefined} data-mv-tono={TIPOS_VISUALES[tipo].tono}>
      <div className="mv-fila" {...props}>
        <button type="button" data-mazo-tapa="" onClick={() => setAbierto((v) => !v)} aria-expanded={abierto} aria-label={`${abierto ? "Plegar" : "Abrir"} ${r.etiqueta.toLowerCase()}: ${r.veces} veces, ${r.unidades} prendas`} className={BOTON_CUBRE_FILA} />
        <SelloTipo key={vuelta} tipo={tipo} tamano={46} />
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
            <span className="mv-rotulo">{r.etiqueta}</span>
            <span className="mv-veces">{r.veces} veces</span>
          </div>
          <div className="mt-1.5 flex min-w-0 items-center gap-2.5">
            <span aria-hidden className="flex shrink-0 -space-x-3">
              {fotos.map((url, i) => (
                <span key={i} className="rounded-md ring-2 ring-papel">
                  <MiniaturaPrenda fotoUrl={url} />
                </span>
              ))}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[13.5px] font-semibold text-tinta">
                {r.tallas} {r.tallas === 1 ? "prenda distinta" : "prendas distintas"}
              </span>
              <span className="block truncate text-xs tabular-nums text-taupe">
                entre las {r.desde} y las {r.hasta}
                {quienes.length > 0 ? ` · ${quienes.join(", ")}` : ""}
              </span>
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1 text-right">
          <span className="flex flex-col items-end gap-0.5">
            <span className="mv-cant">{r.unidades}</span>
            <span className="whitespace-nowrap text-[11px] text-taupe">{palabraPrendas(r.unidades)}</span>
          </span>
          <ChevronRight aria-hidden strokeWidth={1.5} className={`h-4 w-4 shrink-0 text-tinta/30 transition-transform ${abierto ? "rotate-90" : ""}`} />
        </div>
      </div>
      <span aria-hidden className="mv-capas">
        <i />
        <i />
      </span>
      {/* Cerrado, lo de adentro no se toca ni se lee (`inert`): sigue en el árbol para que la franja del día lo encuentre. */}
      <div className="mv-mazo-hijos" inert={!abierto}>
        <ul>
          {operaciones.map((op) =>
            op.filas.length === 1 ? <FilaMovimiento key={op.clave} m={op.filas[0]} prenda={prendas[op.filas[0].varianteId]} ctx={ctx} /> : <FilaOperacion key={op.clave} op={op} prendas={prendas} ctx={ctx} />
          )}
        </ul>
      </div>
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
