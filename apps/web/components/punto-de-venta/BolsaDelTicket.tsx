"use client";

import type { RefObject } from "react";
import { ShoppingBag } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Boton } from "@/components/ui/campos";
import { Chip } from "@/components/ui/Chip";
import { Globito } from "@/components/ui/Globito";
import type { ItemCarrito, VarianteBusqueda } from "@/components/PuntoDeVenta";
import { bolsasEnElTicket, nombreDeBolsa, precioDeBolsa, totalBolsasEnElTicket } from "@/lib/bolsas-reglas";
import { motivoNoCobrable } from "@/lib/vender-stock-local";

/**
 * «Agregar bolsa» (Bolsas de despacho, 2026-10-10): la bolsa de papel pequeña, la grande, la de TNT y la de obsequio se piden en un
 * toque desde el ticket, en la misma fila que el cliente. Se venden como cualquier producto (con el precio de ESTA tienda y su stock): lo
 * único propio es dónde se piden, porque son lo que más se agrega y lo que menos conviene buscar escribiendo.
 *
 * El botón solo existe si la tienda tiene alguna bolsa en su catálogo (una familia fuera de los motores): sin bolsas cargadas no hay botón.
 */

type Fila = {
  bolsas: VarianteBusqueda[];
  carrito: ItemCarrito[];
  bloqueado: boolean;
  /** Con un cliente elegido su caja necesita el ancho: queda la bolsa sola, con el globito en la esquina. */
  soloIcono: boolean;
  onAbrir: () => void;
};

/**
 * El botón del ticket, en la misma fila que «Agregar cliente» (Felipe 2026-10-22: las dos franjas apiladas le quitaban a la lista
 * de prendas casi 70 px). Cuántas bolsas lleva lo dice el globito, y tocarlo abre la hoja. Sin bolsas en el catálogo no dibuja nada.
 */
export function BotonDeBolsas({ bolsas, carrito, bloqueado, soloIcono, onAbrir }: Fila) {
  if (bolsas.length === 0) return null;
  const lleva = totalBolsasEnElTicket(carrito, bolsas);
  if (soloIcono) {
    return (
      // El globito va afuera del botón: `btn-cayla` recorta lo que se sale (su luz al pasar el mouse).
      <span className="relative shrink-0" data-guia="vender.bolsas">
        <Boton
          type="button"
          peso="fantasma"
          onClick={onAbrir}
          disabled={bloqueado}
          aria-label={lleva > 0 ? `Agregar bolsa, ya lleva ${lleva}` : "Agregar bolsa"}
          title="Agregar bolsa"
          className="h-11 w-11 px-0 sm:h-9 sm:w-9"
        >
          <ShoppingBag className="h-4 w-4" aria-hidden />
        </Boton>
        <Globito n={lleva} esquina late className="absolute -right-1.5 -top-1.5" />
      </span>
    );
  }
  return (
    <Boton
      type="button"
      peso="fantasma"
      onClick={onAbrir}
      disabled={bloqueado}
      data-guia="vender.bolsas"
      className="h-11 shrink-0 px-3 text-[13px] sm:h-9"
    >
      <span className="flex items-center gap-2">
        <ShoppingBag className="h-4 w-4 shrink-0" aria-hidden />
        Agregar bolsa
        {lleva > 0 && <Globito n={lleva} late etiqueta={lleva === 1 ? "bolsa en el ticket" : "bolsas en el ticket"} />}
      </span>
    </Boton>
  );
}

type Hoja = {
  bolsas: VarianteBusqueda[];
  carrito: ItemCarrito[];
  ubicacionEtiqueta: string;
  /** Lo mismo que tocar una prenda del catálogo: `agregar()` de la caja (con su stock, su tope y sus avisos). */
  onAgregar: (v: VarianteBusqueda) => void;
  onClose: () => void;
  alCerrarEnfocar: RefObject<HTMLElement | null>;
};

/** La hoja de las bolsas: una fila por bolsa, con su precio y lo que lleva el ticket. Tocar una la AGREGA y la hoja sigue abierta. */
export function AgregarBolsaModal({ bolsas, carrito, ubicacionEtiqueta, onAgregar, onClose, alCerrarEnfocar }: Hoja) {
  return (
    <Modal titulo="Bolsas" subtitulo={`Toca una para agregarla al ticket · ${ubicacionEtiqueta}`} conCerrar onClose={onClose} alCerrarEnfocar={alCerrarEnfocar}>
      {() => (
        <ul className="mt-4 divide-y divide-sand rounded-xl border border-sand bg-crema" aria-label="Bolsas de la tienda">
          {bolsas.map((b) => {
            const motivo = motivoNoCobrable(b);
            const lleva = bolsasEnElTicket(carrito, b.varianteId);
            const cobrable = motivo === "cobrable";
            const obsequio = b.precio === 0;
            return (
              <li key={b.varianteId}>
                <button
                  type="button"
                  onClick={() => onAgregar(b)}
                  aria-label={`Agregar ${nombreDeBolsa(b)}, ${precioDeBolsa(b.precio)}${lleva > 0 ? `, ya lleva ${lleva}` : ""}${cobrable ? "" : ", sin stock aquí"}`}
                  className={`flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-sand/40 ${cobrable ? "" : "opacity-60"}`}
                >
                  <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-sand text-tinta">
                    <ShoppingBag className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-semibold text-tinta">{nombreDeBolsa(b)}</span>
                    <span className="block truncate text-[11.5px] text-tinta/60 tabular-nums">
                      {cobrable ? `Quedan ${b.stockAqui - lleva > 0 ? b.stockAqui - lleva : 0} aquí` : "Sin stock aquí"}
                    </span>
                  </span>
                  {lleva > 0 && (
                    <span key={lleva} className="anim-revelar shrink-0 text-[11px] font-semibold text-rojo tabular-nums">
                      {lleva} en el ticket
                    </span>
                  )}
                  {obsequio ? (
                    <Chip tono="verde" tachado={false}>
                      Obsequio
                    </Chip>
                  ) : (
                    <span className="shrink-0 text-sm font-semibold text-tinta tabular-nums">{precioDeBolsa(b.precio)}</span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}
