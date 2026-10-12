import { Pencil } from "lucide-react";
import { BotonEnlace } from "@/components/ui/campos";

/** «Editar» de una orden de compra «generada» (actividad 4): la misma pieza que «Editar» en la ficha de un proveedor (lápiz y palabra).
 *  Lleva al formulario de la orden; una anulada no lo muestra. */
export function BotonEditarOrden({ id }: { id: string }) {
  return (
    <BotonEnlace href={`/compras/ordenes/editar/${id}`}>
      <span className="inline-flex items-center gap-2">
        <Pencil aria-hidden className="h-3.5 w-3.5" /> Editar
      </span>
    </BotonEnlace>
  );
}
