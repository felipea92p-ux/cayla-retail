"use client";

import type { RefObject } from "react";
import { ShoppingBag } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Boton } from "@/components/ui/campos";
import { Chip } from "@/components/ui/Chip";
import type { ItemCarrito, VarianteBusqueda } from "@/components/PuntoDeVenta";
import { bolsasEnElTicket, nombreDeBolsa, precioDeBolsa, totalBolsasEnElTicket } from "@/lib/bolsas-reglas";
import { motivoNoCobrable } from "@/lib/vender-stock-local";

/**
 * «Agregar bolsa» (Bolsas de despacho, 2026-10-10): la bolsa de papel pequeña, la grande, la de TNT y la de obsequio se piden en un
 * toque desde el ticket, junto a la fila del cliente. Se venden como cualquier producto (con el precio de ESTA tienda y su stock): lo
 * único propio es dónde se piden, porque son lo que más se agrega y lo que menos conviene buscar escribiendo.
 *
 * La fila solo existe si la tienda tiene alguna bolsa en su catálogo (una familia fuera de los motores): sin bolsas cargadas no hay botón.
 */

type Fila = {
  bolsas: VarianteBusqueda[];
  carrito: ItemCarrito[];
  bloqueado: boolean;
  onAbrir: () => void;
};

/** La fila del ticket: dice cuántas bolsas lleva y abre la hoja. Sin bolsas en el catálogo no dibuja nada. */
export function FilaDeBolsas({ bolsas, carrito, bloqueado, onAbrir }: Fila) {
  if (bolsas.length === 0) return null;
  const lleva = totalBolsasEnElTicket(carrito, bolsas);
  return (
    <div className="px-5 pt-3">
      <div className="flex items-center gap-2.5 rounded-xl border border-sand bg-crema py-1.5 pr-1.5 pl-3">
        <ShoppingBag className="h-4 w-4 shrink-0 text-taupe" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-[13px] text-tinta">
          {lleva > 0 ? (
            <span key={lleva} className="anim-asentar font-semibold">
              {lleva} {lleva === 1 ? "bolsa" : "bolsas"} en el ticket
            </span>
          ) : (
            <span className="text-tinta/70">Bolsas</span>
          )}
        </span>
        <Boton type="button" peso="fantasma" onClick={onAbrir} disabled={bloqueado} className="h-11 shrink-0 px-3 text-[13px] sm:h-9">
          + Agregar bolsa
        </Boton>
      </div>
    </div>
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
                    <ShoppingBag className="h-[18px] w-[18px]" />
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
