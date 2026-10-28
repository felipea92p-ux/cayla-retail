"use client";

import { Percent, Trash2 } from "lucide-react";
import { money, type ItemCarrito } from "@/components/PuntoDeVenta";
import { filaDelTicket, type DetalleVariante, type TonoStock } from "@/lib/ticket-linea-reglas";
import { textoDePrendaEnOtroTicket } from "@/lib/tickets-abiertos-reglas";
import { Aviso } from "@/components/ui/Aviso";
import { PasoCantidad } from "@/components/ui/PasoCantidad";
import { ElegirDueno } from "@/components/existencias/ElegirDueno";
import type { EmpresaElegible } from "@/lib/dueno-reglas";

const PUNTO: Record<TonoStock, string> = { verde: "bg-verde", ambar: "bg-ambar", excedido: "bg-rojo-profundo" };

type Props = {
  linea: ItemCarrito;
  /** Color y talla del catálogo de la caja; sin ellos la fila muestra el código de la etiqueta. */
  detalle?: DetalleVariante;
  bloqueado: boolean;
  onQuitar: (claveLinea: string) => void;
  onCantidad: (claveLinea: string, valor: number) => void;
  /** Abre el apartado «Descuento» con solo esta prenda elegida (lo que hacía el botón «Desc.»). */
  onDescuento: (claveLinea: string) => void;
  /** Los otros tickets abiertos que llevan esta misma prenda cuando no alcanza para todos (`ticketsQueDisputanLaPrenda`); vacío o
   *  ausente = no hay nada que decir. Solo avisa: no reserva ni bloquea, el primero que cobra se la lleva. */
  tambienEn?: readonly string[];
  /** ADR-0542: los dueños entre los que hay que elegir de cuál sale esta prenda (hay unidades de las dos empresas aquí), o ausente si no hay duda. */
  duenos?: readonly EmpresaElegible[] | null;
  duenoElegido?: string;
  onDueno?: (varianteId: string, empresaId: string) => void;
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
export function LineaDelTicket({ linea, detalle, bloqueado, onQuitar, onCantidad, onDescuento, tambienEn, duenos, duenoElegido, onDueno }: Props) {
  const f = filaDelTicket(linea, detalle);
  const nombre = linea.referencia;
  return (
    <article className="px-5 py-2.5">
      {/* En el celular la fila ocupa dos: arriba el nombre (a todo el ancho, menos la papelera) y abajo la cantidad y el importe. En una sola
          fila el nombre se quedaba con ~90 px y se partía por palabra («Blusa / Emma»; hallazgo 10 de la auditoría del celular, 2026-10-23). */}
      <div className="flex items-center gap-2 max-sm:flex-wrap max-sm:gap-y-1.5">
        <div className="min-w-0 flex-1 max-sm:order-1 max-sm:flex-[1_1_calc(100%-2.25rem)]" title={f.titulo}>
          <h3 className="line-clamp-2 text-sm leading-snug font-semibold text-tinta">{/* unificar-fijo: el nombre de la prenda en el ticket es un dato */}{nombre}</h3>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px] leading-snug text-tinta/65">
            <span>{f.detalle}</span>
            {f.stock && (
              <span className={`inline-flex items-center gap-1 ${f.stock.tono === "excedido" ? "text-rojo-profundo" : ""}`}>
                <i aria-hidden className={`h-1.5 w-1.5 rounded-full ${PUNTO[f.stock.tono]}`} />
                Stock: {f.stock.cantidad}
              </span>
            )}
          </p>
          {duenos && onDueno && (
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-tinta/65">
              <span>¿De quién sale?</span>
              <ElegirDueno empresas={duenos} duenoId={duenoElegido ?? ""} onElegir={(id) => onDueno(linea.varianteId, id)} deshabilitado={bloqueado} chico guia="vender.dueno" />
            </div>
          )}
        </div>

        {/* El paso de cantidad del sistema (ADR-0358, ronda 17): la caja del campo con el − y el + adentro. */}
        {f.conPaso && (
          <PasoCantidad
            className="shrink-0 max-sm:order-3"
            menos={{ onClick: () => onCantidad(linea.claveLinea, linea.cantidad - 1), deshabilitado: linea.cantidad <= 1, etiqueta: "Reducir cantidad" }}
            mas={{
              onClick: () => onCantidad(linea.claveLinea, linea.cantidad + 1),
              deshabilitado: f.alTope,
              etiqueta: "Aumentar cantidad",
              title: f.alTope ? `Máximo disponible en sede: ${linea.stockAqui}` : undefined,
            }}
            campo={{
              "aria-label": `Cantidad de ${nombre}`,
              type: "number",
              min: 1,
              max: linea.stockAqui,
              value: linea.cantidad,
              onChange: (e) => onCantidad(linea.claveLinea, Number(e.target.value)),
            }}
          />
        )}

        {/* El importe abre el descuento de esta prenda (el ex «Desc.»): el «%» chico lo anuncia y, con descuento, se
            tiñe como la nota de abajo. Es el blanco más grande de la fila y queda lejos del basurero. */}
{f.conDescuento ? (
                  <button
            type="button"
            onClick={() => onDescuento(linea.claveLinea)}
            disabled={bloqueado}
            aria-label={`Descuento para ${nombre} (importe ${money(f.importe)})`}
            title="Descuento de esta prenda"
            className="-mr-1 flex shrink-0 items-center gap-1 rounded-md py-0.5 pr-1 pl-1.5 text-right transition-colors hover:bg-sand/40 disabled:hover:bg-transparent max-sm:order-4 max-sm:ml-auto"
          >
            <Percent aria-hidden className={`h-3 w-3 shrink-0 ${f.pct > 0 ? "text-rojo-profundo" : "text-tinta/35"}`} />
            <span className="min-w-[4.25rem]">
              <span className="block text-sm font-semibold text-tinta tabular-nums">{money(f.importe)}</span>
              {f.importeLista !== null && <s className="block text-[11px] text-tinta/45 tabular-nums">{money(f.importeLista)}</s>}
            </span>
          </button>
        ) : (
          // Pieza de liquidación (ADR-0379): precio final, el importe no abre ningún descuento.
          <span className="min-w-[4.25rem] shrink-0 pr-1 text-right text-sm font-semibold text-tinta tabular-nums max-sm:order-4 max-sm:ml-auto">{money(f.importe)}</span>
        )}

        <button
          type="button"
          aria-label={`Quitar ${nombre}`}
          title="Quitar"
          onClick={() => onQuitar(linea.claveLinea)}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-rojo-profundo transition-colors hover:bg-rojo/10 hover:text-rojo max-sm:order-2"
        >
          <Trash2 className="h-4 w-4" aria-hidden />
        </button>
      </div>
      {f.nota && <p className="mt-1 text-[11px] leading-snug text-rojo-profundo">{f.nota}</p>}
      {tambienEn && tambienEn.length > 0 && (
        <Aviso tono="atencion" chico className="mt-1.5">
          {textoDePrendaEnOtroTicket(tambienEn, linea.stockAqui)}
        </Aviso>
      )}
    </article>
  );
}
