"use client";

import { Percent, Trash2 } from "lucide-react";
import { money, type ItemCarrito } from "@/components/PuntoDeVenta";
import { filaDelTicket, type DetalleVariante, type TonoStock } from "@/lib/ticket-linea-reglas";

/** El campo numérico sin las flechitas del navegador: «−» y «+» ya son eso. */
const SIN_FLECHAS = "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

const PUNTO: Record<TonoStock, string> = { verde: "bg-verde", ambar: "bg-ambar", excedido: "bg-rojo-profundo" };

/** Los dos botones del paso: los del spike (`h-7 w-6`), apagados en gris en vez de desaparecer. */
const BOTON_PASO = "h-7 w-6 rounded-md text-base transition-colors hover:bg-sand/40 disabled:text-tinta/30 disabled:hover:bg-transparent";

type Props = {
  linea: ItemCarrito;
  /** Color y talla del catálogo de la caja; sin ellos la fila muestra el código de la etiqueta. */
  detalle?: DetalleVariante;
  bloqueado: boolean;
  onQuitar: (claveLinea: string) => void;
  onCantidad: (claveLinea: string, valor: number) => void;
  /** Abre el apartado «Descuento» con solo esta prenda elegida (lo que hacía el botón «Desc.»). */
  onDescuento: (claveLinea: string) => void;
};

/**
 * Una prenda del ticket = una fila (spike del club, `docs/maquetas/club-clientas-spike-2026-09/fuente/src/40-vender.js`,
 * `armarHTML`, commit 7be3ebea): nombre · color y talla · stock | − 1 + | importe | quitar. ~50 px en vez de ~150:
 * con la caja de la clienta arriba, antes cabían muy pocas prendas a la vista (Felipe, 2026-09-30).
 *
 * Lo que la fila de antes hacía y sigue haciendo aquí, en otro lugar:
 * - «Desc.» por prenda: el IMPORTE es el botón (con un «%» chico a su lado). El spike lo quitó y dejó solo «Aplicar
 *   descuento» del pie; aquí se conserva sin ocupar una columna más, y lejos del basurero para no tocar uno por otro.
 * - «Máximo disponible en sede: N» pasa a «● Stock: N»; al llegar al tope el «+» se apaga y su `title` lo dice.
 * - El código de la etiqueta pasa al `title` del nombre (y a la fila, si no se conoce el color ni la talla).
 * - Una sola forma de quitar: el basurero. El «−» en 1 ya no se vuelve basurero, se apaga.
 * - La cantidad se sigue pudiendo escribir (campo numérico entre «−» y «+»).
 *
 * Sin estado ni hooks: todo llega por props desde `PuntoDeVentaTicket`. Es hija directa de la lista (`listaRef`),
 * que el padre anima con `Flip`.
 */
export function LineaDelTicket({ linea, detalle, bloqueado, onQuitar, onCantidad, onDescuento }: Props) {
  const f = filaDelTicket(linea, detalle);
  const nombre = linea.referencia;
  return (
    <article className="px-5 py-2.5">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1" title={f.titulo}>
          <h3 className="line-clamp-2 text-sm leading-snug font-semibold text-tinta">{nombre}</h3>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px] leading-snug text-tinta/65">
            <span>{f.detalle}</span>
            {f.stock && (
              <span className={`inline-flex items-center gap-1 ${f.stock.tono === "excedido" ? "text-rojo-profundo" : ""}`}>
                <i aria-hidden className={`h-1.5 w-1.5 rounded-full ${PUNTO[f.stock.tono]}`} />
                Stock: {f.stock.cantidad}
              </span>
            )}
          </p>
        </div>

        {f.conPaso && (
          <div className="flex h-8 shrink-0 items-center rounded-lg border border-sand bg-crema has-[input:focus]:border-rojo">
            <button
              type="button"
              aria-label="Reducir cantidad"
              onClick={() => onCantidad(linea.claveLinea, linea.cantidad - 1)}
              disabled={linea.cantidad <= 1}
              className={BOTON_PASO}
            >
              −
            </button>
            <input
              aria-label={`Cantidad de ${nombre}`}
              type="number"
              min={1}
              max={linea.stockAqui}
              value={linea.cantidad}
              onChange={(e) => onCantidad(linea.claveLinea, Number(e.target.value))}
              className={`w-6 bg-transparent text-center text-sm font-semibold text-tinta tabular-nums outline-none ${SIN_FLECHAS}`}
            />
            <button
              type="button"
              aria-label="Aumentar cantidad"
              title={f.alTope ? `Máximo disponible en sede: ${linea.stockAqui}` : undefined}
              onClick={() => onCantidad(linea.claveLinea, linea.cantidad + 1)}
              disabled={f.alTope}
              className={BOTON_PASO}
            >
              +
            </button>
          </div>
        )}

        {/* El importe abre el descuento de esta prenda (el ex «Desc.»): el «%» chico lo anuncia y, con descuento, se
            tiñe como la nota de abajo. Es el blanco más grande de la fila y queda lejos del basurero. */}
        <button
          type="button"
          onClick={() => onDescuento(linea.claveLinea)}
          disabled={bloqueado}
          aria-label={`Descuento para ${nombre} (importe ${money(f.importe)})`}
          title="Descuento de esta prenda"
          className="-mr-1 flex shrink-0 items-center gap-1 rounded-md py-0.5 pr-1 pl-1.5 text-right transition-colors hover:bg-sand/40 disabled:hover:bg-transparent"
        >
          <Percent aria-hidden className={`h-3 w-3 shrink-0 ${f.pct > 0 ? "text-rojo-profundo" : "text-tinta/35"}`} />
          <span className="min-w-[4.25rem]">
            <span className="block text-sm font-semibold text-tinta tabular-nums">{money(f.importe)}</span>
            {f.importeLista !== null && <s className="block text-[11px] text-tinta/45 tabular-nums">{money(f.importeLista)}</s>}
          </span>
        </button>

        <button
          type="button"
          aria-label={`Quitar ${nombre}`}
          title="Quitar"
          onClick={() => onQuitar(linea.claveLinea)}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-rojo-profundo transition-colors hover:bg-rojo/10 hover:text-rojo"
        >
          <Trash2 className="h-4 w-4" aria-hidden />
        </button>
      </div>
      {f.nota && <p className="mt-1 text-[11px] leading-snug text-rojo-profundo">{f.nota}</p>}
    </article>
  );
}
