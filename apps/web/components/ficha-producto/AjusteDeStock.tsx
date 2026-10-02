"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { AjustarInventarioModal } from "@/components/AjustarInventarioModal";
import type { AjusteStockFicha } from "./piezas";

/**
 * «Ajustar stock» dentro de la ficha de una prenda (Felipe, 2026-09-29: «en la parte de editar un producto que también se
 * pueda modificar el stock»). Reabre la decisión 9 de ADR-0270 («ajustar se hace solo en Inventario») con una condición:
 * NO es un campo que se edita y se guarda con el producto, sino la MISMA ventana de Existencias (`AjustarInventarioModal`):
 * pide el motivo, el responsable y dónde (piso o almacén), y escribe un movimiento con `ajustar_inventario`. `stock` sigue
 * siendo un snapshot derivado de `movimientos` (principio 4); aquí no hay una segunda vía de escritura.
 *
 * Dos consecuencias, a propósito:
 *  · Es INMEDIATO y aparte de «Revisar y guardar»: el ajuste no viaja con los cambios del producto (precio, colores…), ni
 *    se deshace con ellos. Un stock que se movió es un hecho, no un borrador.
 *  · Es de la SEDE ACTIVA. La ficha muestra el stock de todas las sedes; el ajuste toca solo el de la sede de arriba, y el
 *    botón lo dice.
 *
 * Trae su propio botón, su estado y su ventana para que la sección de variantes solo tenga que ponerlo donde va.
 */
export function AjusteDeStock({
  ajuste,
  colorNombre,
  forma,
  descripcion,
  deshabilitado = false,
}: {
  /** `null`/ausente: la cuenta no puede ajustar stock (Existencias, Conteos o Traslados) y no se ofrece nada. */
  ajuste: AjusteStockFicha | null | undefined;
  /** El color de la prenda TAL COMO ESTÁ GUARDADO (no el corregido a medias en pantalla): la ventana lo busca en la base. */
  colorNombre: string | null;
  /** «lapiz» junto al número de una talla; «enlace» junto al total de un color. */
  forma: "lapiz" | "enlace";
  /** De qué es el ajuste, para el texto del botón («Azul marino», «Azul marino · 28»). */
  descripcion: string;
  deshabilitado?: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  if (!ajuste) return null;
  const titulo = `Ajustar el stock de ${descripcion} en ${ajuste.sede}`;

  return (
    <>
      {forma === "lapiz" ? (
        <button
          type="button"
          onClick={() => setAbierto(true)}
          disabled={deshabilitado}
          aria-label={titulo}
          title={titulo}
          className="ml-1 inline-flex h-5 w-5 items-center justify-center rounded align-middle text-tinta/45 transition-colors hover:text-rojo focus-visible:outline-2 focus-visible:outline-rojo/50 disabled:opacity-40"
        >
          <Pencil aria-hidden className="h-3.5 w-3.5" />
        </button>
      ) : (
        <button type="button" onClick={() => setAbierto(true)} disabled={deshabilitado} title={titulo} className="btn-cayla btn-enlace text-[12.5px]">
          Ajustar stock
        </button>
      )}
      {abierto && (
        // El editor de la prenda es un <form> (`revisar`) que además traga el Enter de cualquier campo. Esta ventana es un portal
        // pero React sigue subiendo sus eventos por el árbol de React (ADR-0128): sin este envoltorio, el «Ajustar» de la
        // ventana abriría «Revisa y guarda» del producto, y el Enter de una cantidad no llegaría a enviarla.
        <span
          className="contents"
          onSubmit={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <AjustarInventarioModal
            productoId={ajuste.productoId}
            prenda={{ color: colorNombre }}
            ubicacionId={ajuste.ubicacionId}
            sububicaciones={ajuste.sububicaciones}
            puedeBajarAlPiso={ajuste.puedeBajarAlPiso}
            onClose={() => setAbierto(false)}
          />
        </span>
      )}
    </>
  );
}
