"use client";

import Image from "next/image";
import type { RefObject } from "react";
import { Modal } from "@/components/ui/Modal";
import { money, type ItemCarrito, type VarianteBusqueda } from "@/components/PuntoDeVenta";
import type { GrupoCatalogo } from "@/lib/catalogo-grupos";
import { textoOtrasSedes } from "@/lib/stock-por-sede";
import { textoSinStock } from "@/lib/vender-reglas";

type Props = {
  grupo: GrupoCatalogo<VarianteBusqueda>;
  ubicacionEtiqueta: string;
  carrito: ItemCarrito[];
  onAgregar: (v: VarianteBusqueda) => void;
  onClose: () => void;
  alCerrarEnfocar: RefObject<HTMLElement | null>;
};

/**
 * Se abre al tocar el cuerpo de una tarjeta de la grilla de Vender con 2+ tallas con
 * stock (con una sola, el padre la agrega directo: no hay nada que elegir). Antes solo eran
 * tocables los chips de talla, chiquitos: la clienta o la encargada tocaba la prenda
 * y no pasaba nada, sin pista de que faltaba elegir talla. Acá la talla se elige
 * grande, con el stock de cada una a la vista; los chips de la tarjeta siguen siendo
 * el atajo de un toque para quien ya sabe la talla.
 *
 * Elegir una talla AGREGA esa variante y cierra (con la misma animación que Escape);
 * una talla agotada se queda a la vista y dice dónde sí hay.
 */
export function ElegirTallaModal({ grupo, ubicacionEtiqueta, carrito, onAgregar, onClose, alCerrarEnfocar }: Props) {
  const nombre = [grupo.referencia, grupo.color].filter(Boolean).join(" ");
  return (
    <Modal titulo={grupo.referencia} subtitulo={`${grupo.color ?? "Sin color"} · ${ubicacionEtiqueta}`} onClose={onClose} alCerrarEnfocar={alCerrarEnfocar}>
      {(cerrar) => (
        <div>
          <div className="mb-4 flex items-center gap-3">
            {grupo.fotoUrl && (
              <div className="relative h-20 w-16 shrink-0 overflow-hidden rounded-lg bg-sand/40">
                <Image src={grupo.fotoUrl} alt={nombre} fill sizes="64px" className="object-cover" unoptimized />
              </div>
            )}
            <p className="text-sm font-bold text-tinta">
              {grupo.precioMin === grupo.precioMax ? money(grupo.precioMin) : `desde ${money(grupo.precioMin)}`}
            </p>
          </div>

          <p className="label-cayla mb-2 text-[11px] text-tinta/70">Elige la talla</p>
          <div className="grid grid-cols-2 gap-2" role="group" aria-label="Tallas">
            {grupo.tallas.map((t) => {
              const enTicket = carrito.find((it) => it.claveLinea === t.variante.varianteId)?.cantidad ?? 0;
              const agotada = t.stockAqui <= 0;
              // Ya se llevó todo lo que hay: agregar otra no haría nada, y un botón que no
              // hace nada es justo lo que esta pantalla vino a quitar.
              const tope = !agotada && enTicket >= t.stockAqui;
              const otras = textoOtrasSedes(t.variante.stockOtrasSedes ?? []);
              return (
                <button
                  key={t.variante.varianteId}
                  type="button"
                  disabled={agotada || tope}
                  onClick={() => {
                    onAgregar(t.variante);
                    cerrar();
                  }}
                  aria-label={`Agregar ${nombre} talla ${t.talla}`}
                  className={`rounded-xl border p-3 text-left transition-[background-color,border-color,transform] duration-200 ease-[var(--ease-cayla)] ${
                    agotada || tope
                      ? "cursor-not-allowed border-dashed border-sand bg-crema text-tinta/45"
                      : "border-sand bg-papel text-tinta hover:border-tinta/50 hover:bg-sand/40 active:translate-y-px"
                  }`}
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className={`font-display text-xl ${agotada ? "line-through" : ""}`}>{t.talla}</span>
                    {enTicket > 0 && <span className="text-[11px] font-semibold text-rojo">{enTicket} en el ticket</span>}
                  </span>
                  <span className="mt-0.5 block text-xs">
                    {agotada ? textoSinStock(t.variante, "Sin stock aquí") : tope ? "Ya tienes todas" : `${t.stockAqui} aquí`}
                  </span>
                  {agotada && otras &&<span className="mt-0.5 block text-[11px]">{otras}</span>}
                  {t.variante.precio !== grupo.precioMin && <span className="mt-0.5 block text-xs font-semibold">{money(t.variante.precio)}</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </Modal>
  );
}
