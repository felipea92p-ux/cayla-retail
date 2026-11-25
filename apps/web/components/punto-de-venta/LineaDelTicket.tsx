"use client";

import type { ReactNode } from "react";
import { Percent, Trash2 } from "lucide-react";
import type { CantidadEscrita } from "@/components/alta-producto/useCantidadEscrita";
import { money } from "@/lib/money";
import type { ItemCarrito } from "@/components/PuntoDeVenta";
import { filaDelTicket, type DetalleVariante, type TonoStock } from "@/lib/ticket-linea-reglas";
import { textoDePrendaEnOtroTicket } from "@/lib/tickets-abiertos-reglas";
import { Aviso } from "@/components/ui/Aviso";
import { PasoCantidad } from "@/components/ui/PasoCantidad";
import { BotonDeshacer } from "@/components/ui/BotonDeshacer";
import { ElegirDueno } from "@/components/existencias/ElegirDueno";
import { Chip } from "@/components/ui/Chip";
import { MiniaturaPrenda } from "@/components/ui/PrendaCelda";
import type { EmpresaElegible } from "@/lib/dueno-reglas";

const PUNTO: Record<TonoStock, string> = { verde: "bg-verde", ambar: "bg-ambar", excedido: "bg-rojo-profundo" };

type Props = {
  linea: ItemCarrito;
  /** Color y talla del catálogo de la caja; sin ellos la fila muestra el código de la etiqueta. */
  detalle?: DetalleVariante;
  bloqueado: boolean;
  onQuitar: (claveLinea: string) => void;
  onCantidad: (claveLinea: string, valor: number) => void;
  /** El borrador de lo que se teclea en la cantidad: vive en la pantalla (`useCantidadEscrita`), que dice por qué no valió y frena su botón. */
  escrita: CantidadEscrita;
  /** Abre el apartado «Descuento» con solo esta prenda elegida (lo que hacía el botón «Desc.»). */
  onDescuento: (claveLinea: string) => void;
  /** Los otros tickets abiertos que llevan esta misma prenda cuando no alcanza para todos (`ticketsQueDisputanLaPrenda`); vacío o
   *  ausente = no hay nada que decir. Solo avisa: no reserva ni bloquea, el primero que cobra se la lleva. */
  tambienEn?: readonly string[];
  /** ADR-0542: los dueños entre los que hay que elegir de cuál sale esta prenda (hay unidades de las dos empresas aquí), o ausente si no hay duda. */
  duenos?: readonly EmpresaElegible[] | null;
  duenoElegido?: string;
  onDueno?: (varianteId: string, empresaId: string) => void;
  /** El `data-guia` del «¿De quién sale?» de esta pantalla (Vender y Apartar tienen cada una su paso de guía). */
  guiaDueno?: string;
  /** Lo que una pantalla agrega bajo la fila y es solo suyo: en Apartar, cuántas quedan en la sede tras apartar. */
  pie?: ReactNode;
  /** Una prenda que ya está apartada (la hoja «Editar apartado»): su cantidad y su descuento no se tocan aquí, así que no lleva el
   *  «− 1 +» ni abre el descuento, y en lugar del stock dice cuántas unidades son. Se puede quitar (`quitada`). */
  soloLectura?: boolean;
  /** Marcada para salir del apartado: el nombre va tachado y, en lugar de la papelera, un «Deshacer» (`onQuitar` la vuelve a dejar). */
  quitada?: boolean;
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
 * - La cantidad se sigue pudiendo escribir, entre «−» y «+»: lo que no es un entero no llega al ticket (`escrita`).
 *
 * Sin estado ni hooks: todo llega por props desde `PuntoDeVentaTicket`. Es hija directa de la lista (`listaRef`),
 * que el padre anima con `Flip`.
 */
export function LineaDelTicket({ linea, detalle, bloqueado, onQuitar, onCantidad, escrita, onDescuento, tambienEn, duenos, duenoElegido, onDueno, guiaDueno = "vender.dueno", pie, soloLectura = false, quitada = false }: Props) {
  const f = filaDelTicket(linea, detalle);
  const nombre = linea.referencia;
  const conDescuento = f.pct > 0;
  const precio = (
    <span className="min-w-[4.25rem]">
      <span className={`block text-sm font-semibold tabular-nums ${quitada ? "text-tinta/45 line-through" : "text-tinta"}`}>{money(f.importe)}</span>
      {f.importeLista !== null && <s className="block text-detalle text-tenue tabular-nums">{money(f.importeLista)}</s>}
    </span>
  );
  return (
    <article className="px-5 py-2.5 max-sm:py-3">
      {/* En el celular, «controles a la vista» (Felipe 2026-11-25, eligió la maqueta 2 sobre «la fila que se toca»): una grilla de cuatro
          columnas. Arriba, la miniatura de la prenda (su foto o su categoría sobre su color), el nombre con su color, talla y stock (y el
          descuento, si lo tiene, en su insignia) y el precio a la derecha. Abajo, alineados bajo el nombre, la cantidad y, a la derecha, el
          «%» y la papelera, del mismo tamaño. En escritorio la fila sigue en una sola línea (las clases `max-sm:` no la tocan). */}
      <div className="flex items-center gap-2 max-sm:grid max-sm:grid-cols-[auto_minmax(0,1fr)_auto_auto] max-sm:gap-x-2 max-sm:gap-y-2.5">
        {detalle?.miniatura && (
          <span className="hidden max-sm:col-start-1 max-sm:row-start-1 max-sm:block max-sm:self-start">
            <MiniaturaPrenda fotoUrl={detalle.miniatura.fotoUrl} colorHex={detalle.miniatura.colorHex} tamano="lg" {...detalle.miniatura.categoria} />
          </span>
        )}
        <div className="min-w-0 flex-1 max-sm:col-start-2 max-sm:row-start-1 max-sm:self-start" title={f.titulo}>
          <h3 className={`line-clamp-2 text-sm leading-snug font-semibold ${quitada ? "text-tinta/45 line-through" : "text-tinta"}`}>{/* unificar-fijo: el nombre de la prenda en el ticket es un dato */}{nombre}</h3>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm leading-snug text-tinta/65 max-sm:gap-x-3 max-sm:text-detalle">
            <span className="max-sm:hidden">{f.detalle}</span>
            {f.detallePartes.map((parte) => (
              <span key={parte} className="sm:hidden">
                {parte}
              </span>
            ))}
            {soloLectura ? (
              <span>{linea.cantidad} u.</span>
            ) : (
              f.stock && (
                // En el celular el stock solo se dice cuando importa (quedan pocas o ya no alcanza): con 3 o más no cambia nada en la caja y
                // empujaba el detalle a otro renglón (Felipe 2026-11-25, maqueta «controles a la vista»).
                <span className={`inline-flex items-center gap-1 ${f.stock.tono === "excedido" ? "text-rojo-profundo" : ""} ${f.stock.tono === "verde" ? "max-sm:hidden" : ""}`}>
                  <i aria-hidden className={`h-1.5 w-1.5 rounded-full ${PUNTO[f.stock.tono]}`} />
                  Stock: {f.stock.cantidad}
                </span>
              )
            )}
          </p>
          {/* El descuento de la prenda, en el celular: su insignia bajo el detalle, con cuánto y por qué. En escritorio va en la línea de abajo. */}
          {conDescuento && f.motivo && (
            <Chip tono="rojo" versalitas={false} className="mt-1.5 max-w-full overflow-hidden text-ellipsis sm:hidden">
              <b className="font-semibold tabular-nums">−{f.pct} %</b> {f.motivo}
            </Chip>
          )}
          {duenos && onDueno && (
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-tinta/65">
              <span>¿De quién sale?</span>
              <ElegirDueno empresas={duenos} duenoId={duenoElegido ?? ""} onElegir={(id) => onDueno(linea.varianteId, id)} deshabilitado={bloqueado} chico guia={guiaDueno} />
            </div>
          )}
        </div>

        {/* El paso de cantidad del sistema (ADR-0358, ronda 17): la caja del campo con el − y el + adentro. */}
        {f.conPaso && !soloLectura && (
          <PasoCantidad
            className="shrink-0 max-sm:col-start-2 max-sm:row-start-2 max-sm:justify-self-start"
            tono={escrita.invalida(linea.claveLinea) ? "error" : undefined}
            menos={{ onClick: () => { escrita.olvidar(); onCantidad(linea.claveLinea, linea.cantidad - 1); }, deshabilitado: linea.cantidad <= 1, etiqueta: "Reducir cantidad" }}
            mas={{
              onClick: () => {
                escrita.olvidar();
                onCantidad(linea.claveLinea, linea.cantidad + 1);
              },
              deshabilitado: f.alTope,
              etiqueta: "Aumentar cantidad",
              title: f.alTope ? `Máximo disponible en sede: ${linea.stockAqui}` : undefined,
            }}
            campo={{
              "aria-label": `Cantidad de ${nombre}`,
              ...escrita.campo(linea.claveLinea, String(linea.cantidad), (v) => onCantidad(linea.claveLinea, Number(v)), Math.max(1, linea.stockAqui)),
            }}
          />
        )}

        {/* El importe abre el descuento de esta prenda (el ex «Desc.»). En escritorio el «%» va a su lado; en el celular el «%» tiene su propio
            botón en la fila de abajo y el precio queda solo, arriba a la derecha (sigue abriendo el descuento). */}
        {!soloLectura ? (
          <button
            type="button"
            onClick={() => onDescuento(linea.claveLinea)}
            disabled={bloqueado}
            aria-label={`Descuento para ${nombre} (importe ${money(f.importe)})`}
            title="Descuento de esta prenda"
            className="area-dedo -mr-1 flex shrink-0 items-center gap-2 rounded-md py-0.5 pr-1 pl-1.5 text-right transition-colors vd-pasa-gota disabled:hover:bg-transparent max-sm:col-span-2 max-sm:col-start-3 max-sm:row-start-1 max-sm:self-start max-sm:justify-self-end"
          >
            <span aria-hidden className={`vd-lente grid h-6 min-w-6 shrink-0 place-items-center rounded-full border max-sm:hidden ${conDescuento ? "border-rojo-profundo px-2 text-xs font-semibold text-rojo-profundo tabular-nums" : "border-borde-control text-secundario"}`}>
              {conDescuento ? `−${f.pct} %` : <Percent className="h-3.5 w-3.5" />}
            </span>
            {precio}
          </button>
        ) : (
          // Pieza de liquidación (ADR-0379) o prenda ya apartada: el importe no abre ningún descuento.
          <span className="shrink-0 pr-1 text-right max-sm:col-span-2 max-sm:col-start-3 max-sm:row-start-1 max-sm:self-start max-sm:justify-self-end">{precio}</span>
        )}

        {/* El «%» del celular: el mismo tamaño que la papelera, con borde (se toca); con descuento, teñido de rojo. */}
        {!soloLectura && (
          <button
            type="button"
            onClick={() => onDescuento(linea.claveLinea)}
            disabled={bloqueado}
            aria-label={`Descuento para ${nombre}`}
            title="Descuento de esta prenda"
            className={`area-dedo hidden h-11 w-11 place-items-center rounded-full border transition-colors disabled:opacity-50 max-sm:col-start-3 max-sm:row-start-2 max-sm:grid ${
              conDescuento ? "border-rojo-profundo/40 bg-rojo/10 text-rojo-profundo" : "border-borde-control text-secundario vd-pasa-gota hover:text-tinta"
            }`}
          >
            <Percent className="h-4 w-4" aria-hidden />
          </button>
        )}

        {quitada ? (
          <BotonDeshacer onClick={() => onQuitar(linea.claveLinea)} title={`Dejar ${nombre} en el apartado`} className="shrink-0 max-sm:col-start-4 max-sm:row-start-2 max-sm:justify-self-end" />
        ) : (
          <button
            type="button"
            aria-label={`Quitar ${nombre}`}
            title="Quitar"
            onClick={() => onQuitar(linea.claveLinea)}
            className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-rojo-profundo transition-colors hover:bg-rojo/10 hover:text-rojo max-sm:col-start-4 max-sm:row-start-2 max-sm:h-11 max-sm:w-11 max-sm:justify-self-end max-sm:rounded-full pointer-coarse:h-11 pointer-coarse:w-11"
          >
            <Trash2 className="h-4 w-4" aria-hidden />
          </button>
        )}
      </div>
      {/* En escritorio el porqué va bajo la fila; el porcentaje ya lo dice la insignia junto al precio. */}
      {f.motivo && <p className="mt-1 text-sm leading-snug text-rojo-profundo max-sm:hidden">{f.motivo}</p>}
      {pie && <div className="mt-1 text-sm leading-snug text-tinta/65">{pie}</div>}
      {tambienEn && tambienEn.length > 0 && (
        <Aviso tono="atencion" chico className="mt-1.5">
          {textoDePrendaEnOtroTicket(tambienEn, linea.stockAqui)}
        </Aviso>
      )}
    </article>
  );
}
