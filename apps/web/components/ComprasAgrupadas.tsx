"use client";

import type { CSSProperties, ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Clock, ReceiptText } from "lucide-react";
import { Chip } from "@/components/ui/Chip";
import { MiniaturaPrenda } from "@/components/ui/PrendaCelda";
import type { LineaVentaReciente } from "@/lib/ventas-v2";
import { agruparPorCompra, agruparPorDia, varianteLegible, type EstadoVisual } from "@/lib/cambios-reglas";
import { soles } from "@/lib/compras-reglas";
import { codigoPrenda } from "@/lib/prenda-reglas";

// La lista de compras que comparten Cambios y Devoluciones (2026-09-18). La unidad es la
// COMPRA —la clienta trae UNA boleta—, pero dentro de ella manda la prenda: su nombre es
// lo más grande de la fila; la boleta, la hora y la vendedora van una sola vez, arriba y
// chicas. Sin bordes entre filas: espacio y un fondo al pasar el mouse separan igual.
// Cada pantalla pone lo suyo en los huecos de la fila: el detalle (qué cambios o
// devoluciones ya tiene) y la acción ("Iniciar cambio", "Iniciar devolución").

export function formatearHora(iso: string) {
  return new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}

/** El estado de una prenda vendida, siempre con palabra e ícono cuando ayuda — nunca solo color. */
export function ChipEstado({ estado }: { estado: EstadoVisual }) {
  return (
    <Chip tono={estado.tono} versalitas={false}>
      {estado.icono === "check" && <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />}
      {estado.icono === "reloj" && <Clock className="h-3.5 w-3.5" aria-hidden />}
      {estado.icono === "alerta" && <AlertTriangle className="h-3.5 w-3.5" aria-hidden />}
      {estado.texto}
    </Chip>
  );
}

/** La línea de datos de una compra: qué comprobante y cuándo (lo que la colaboradora
 *  cruza con el papel), y después quién vendió y a quién. En celular el segundo grupo
 *  va apilado: con separadores en fila, un "·" quedaba colgando al final del renglón.
 *  `derecha` es para una acción de la compra entera (ej. "Anular venta"). */
export function MetaCompra({ compra, dia, derecha }: { compra: LineaVentaReciente; dia?: string; derecha?: ReactNode }) {
  const detalles = [compra.vendedorNombre && `Vendido por ${compra.vendedorNombre}`, compra.clienta, compra.sedeVenta].filter(
    (d): d is string => !!d
  );
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px] text-tinta/70">
      <span className="flex items-center gap-2">
        {compra.comprobante ? (
          <span className="font-semibold text-tinta">{compra.comprobante}</span>
        ) : (
          <Chip tono="neutro" versalitas={false}>
            <ReceiptText className="h-3.5 w-3.5" aria-hidden />
            Sin comprobante
          </Chip>
        )}
        <span aria-hidden>·</span>
        <span className="whitespace-nowrap">
          {dia ? `${dia} ` : ""}
          {formatearHora(compra.creadoEn)}
        </span>
      </span>
      {detalles.length > 0 && (
        <span className="flex flex-col gap-0.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-2">
          {detalles.map((d, i) => (
            <span key={d} className="flex items-center gap-2">
              {i > 0 && (
                <span aria-hidden className="hidden sm:inline">
                  ·
                </span>
              )}
              {d}
            </span>
          ))}
        </span>
      )}
      {compra.anulada && (
        <Chip tono="apagado" versalitas={false}>
          Venta anulada
        </Chip>
      )}
      {derecha && <span className="ml-auto">{derecha}</span>}
    </div>
  );
}

/** Las compras agrupadas por día y, dentro de cada día, por compra. `renderFila` pinta
 *  cada prenda (con `FilaPrendaVenta`); `accionCompra` pone algo a la derecha del
 *  encabezado de una compra. */
export function ComprasAgrupadas({
  lineas,
  ahora,
  renderFila,
  accionCompra,
}: {
  lineas: LineaVentaReciente[];
  ahora: Date;
  renderFila: (linea: LineaVentaReciente) => ReactNode;
  accionCompra?: (compra: LineaVentaReciente) => ReactNode;
}) {
  return (
    // El hilo (Atelier, 2026-09-19): una línea taupe que baja por la izquierda y se dibuja al
    // entrar; cada día es un nudo sobre ella y sus compras cuelgan a la derecha.
    <div className="relative pl-8 sm:pl-11">
      <span aria-hidden className="hilo-vertical absolute bottom-0 left-[11px] top-1.5 w-[1.5px] bg-gradient-to-b from-taupe to-taupe/15" />
      <div className="space-y-8">
        {agruparPorDia(lineas, ahora).map((dia, d) => (
          <section key={dia.etiqueta} aria-label={dia.etiqueta} className="space-y-3.5">
            <h3 className="relative text-[11.5px] font-semibold uppercase tracking-[0.16em] text-taupe-profundo">
              <span aria-hidden className="absolute -left-7 -top-px flex h-3.5 w-3.5 items-center justify-center rounded-full bg-crema ring-[1.5px] ring-taupe sm:-left-10">
                <span className="h-1.5 w-1.5 rounded-full bg-taupe" />
              </span>
              {dia.etiqueta}
            </h3>
            {/* Las compras en columnas de 34rem como mínimo: en una pantalla ancha se reparten a lo
                ancho (una fila de prenda a 1500px dejaba un vacío enorme entre el nombre y el botón);
                en una angosta o en el celular, una sola columna. `auto-fill` y no `auto-fit`: una
                compra sola no se estira a todo el ancho. */}
            <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,34rem),1fr))] items-start gap-3.5">
              {agruparPorCompra(dia.lineas).map((compra, c) => (
                <article
                  key={compra.ventaId}
                  style={{ "--i": Math.min(d * 2 + c + 2, 12) } as CSSProperties}
                  className="anim-sube rounded-[20px] bg-papel ring-1 ring-tinta/[0.07] transition-[transform,box-shadow] duration-[400ms] ease-[var(--ease-cayla)] hover:-translate-y-0.5 hover:shadow-[0_24px_44px_-30px_rgba(80,50,20,0.55)]"
                >
                  <header className="px-6 pb-1 pt-4">
                    <MetaCompra compra={compra.lineas[0]!} derecha={accionCompra?.(compra.lineas[0]!)} />
                  </header>
                  <ul className="px-1.5 pb-2">{compra.lineas.map((l) => renderFila(l))}</ul>
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

/** Una prenda de una compra: foto, nombre (lo más grande), variante, código y precio; a la
 *  derecha su estado y la acción. `detalle` son las líneas de historia de la prenda ("Cambiada
 *  por…", "Devolución pendiente…"). */
export function FilaPrendaVenta({
  linea,
  estado,
  detalle,
  accion,
}: {
  linea: LineaVentaReciente;
  estado: EstadoVisual;
  detalle?: ReactNode;
  accion?: ReactNode;
}) {
  return (
    <li
      className={`group flex flex-col gap-3 rounded-2xl px-4 py-3.5 transition-colors duration-200 sm:flex-row sm:items-center sm:gap-4 [&+&]:border-t [&+&]:border-dashed [&+&]:border-tinta/10 ${
        linea.coincideConBusqueda ? "bg-crema/80" : ""
      }`}
    >
      <div className="flex min-w-0 flex-1 items-start gap-4">
        {/* La foto se ladea un poco al pasar el mouse por la fila: se siente tocable. */}
        <span className="shrink-0 transition-transform duration-500 ease-[var(--ease-cayla)] group-hover:-rotate-6 group-hover:scale-105">
          <MiniaturaPrenda fotoUrl={linea.fotoUrl} colorHex={linea.colorHex} tamano="lg" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-[23px] leading-tight text-tinta">
            {linea.referencia}
            {linea.coincideConBusqueda && <span className="sr-only"> (la prenda buscada)</span>}
          </p>
          <p className="text-sm text-tinta/75">{varianteLegible(linea)}</p>
          <p className="mt-1 text-xs text-tinta/70">
            <span className="font-mono">{codigoPrenda(linea)}</span> · {soles(linea.precioUnitario)}
            {linea.cantidad > 1 && ` · compró ${linea.cantidad}`}
          </p>
          {detalle}
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 pl-16 sm:flex-col sm:flex-nowrap sm:items-end sm:justify-center sm:pl-0">
        <ChipEstado estado={estado} />
        {accion}
      </div>
    </li>
  );
}

/** El botón de la fila: "Iniciar cambio →", "Iniciar devolución →". */
export const CLASE_BOTON_FILA =
  "boton-brillo label-cayla inline-flex h-11 items-center gap-2 whitespace-nowrap rounded-md bg-tinta px-5 text-[11px] text-crema transition-[transform,box-shadow] duration-300 hover:-translate-y-px hover:shadow-[0_10px_22px_-12px_rgba(26,26,24,0.7)]";

/** Los filtros de la actividad: pastillas con cuántas compras hay en cada una. */
export function FiltrosActividad<T extends string>({
  valor,
  opciones,
  onCambio,
}: {
  valor: T;
  opciones: readonly { valor: T; texto: string; cuantas: number }[];
  onCambio: (v: T) => void;
}) {
  return (
    <div role="group" aria-label="Filtrar la actividad" className="flex flex-wrap gap-1 rounded-full bg-tinta/5 p-1">
      {opciones.map((f) => (
        <button
          key={f.valor}
          type="button"
          aria-pressed={valor === f.valor}
          onClick={() => onCambio(f.valor)}
          className={`h-9 rounded-full px-4 text-sm transition-colors duration-200 ${
            valor === f.valor ? "bg-papel font-semibold text-tinta shadow-[0_1px_2px_rgba(26,26,24,0.08)]" : "text-tinta/75 hover:text-tinta"
          }`}
        >
          {f.texto} <span className="tabular-nums text-tinta/65">{f.cuantas}</span>
        </button>
      ))}
    </div>
  );
}

/** Lleva la vista y el foco al título de la actividad (tras "Sin comprobante"). */
export function mostrarActividad(titulo: HTMLHeadingElement | null) {
  titulo?.scrollIntoView({ behavior: "smooth", block: "start" });
  titulo?.focus({ preventScroll: true });
}

export function EsqueletoBusqueda() {
  return (
    <div className="space-y-3 pt-2" aria-label="Buscando" role="status">
      {[0, 1].map((i) => (
        <div key={i} className="animate-pulse rounded-xl bg-papel p-5 ring-1 ring-tinta/[0.05]">
          <div className="h-3 w-48 rounded bg-sand/70" />
          <div className="mt-5 flex items-center gap-4">
            <div className="h-12 w-12 rounded-md bg-sand/60" />
            <div className="flex-1 space-y-2">
              <div className="h-3.5 w-40 rounded bg-sand/70" />
              <div className="h-3 w-24 rounded bg-sand/50" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function EstadoVacio({ titulo, detalle }: { titulo: string; detalle: string }) {
  return (
    <div className="rounded-xl bg-papel/60 px-6 py-10 text-center">
      <p className="text-sm font-semibold text-tinta">{titulo}</p>
      <p className="mt-1 text-sm text-tinta/70">{detalle}</p>
    </div>
  );
}

export function SinResultadosVentas({
  busqueda,
  todasLasSedes,
  puedeVerTodas,
  sede,
  onBuscarEnTodas,
}: {
  busqueda: string;
  todasLasSedes: boolean;
  puedeVerTodas: boolean;
  sede: string;
  onBuscarEnTodas: () => void;
}) {
  return (
    <div className="rounded-xl bg-papel/60 px-6 py-10 text-center">
      <p className="text-sm font-semibold text-tinta">
        No encontramos ventas con «{busqueda}»{todasLasSedes ? " en ninguna tienda" : ` en ${sede}`}.
      </p>
      <p className="mt-1 text-sm text-tinta/70">Prueba con el número de boleta, el DNI de la clienta, o escanea la etiqueta de la prenda.</p>
      {puedeVerTodas && !todasLasSedes && (
        <button
          type="button"
          onClick={onBuscarEnTodas}
          className="label-cayla mt-4 inline-flex h-11 items-center rounded-md px-5 text-[11px] text-tinta ring-1 ring-tinta/20 transition-colors duration-200 hover:bg-tinta hover:text-crema"
        >
          Buscar en todas las tiendas
        </button>
      )}
    </div>
  );
}
