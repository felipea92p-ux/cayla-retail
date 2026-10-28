import { BotonEditar } from "@/components/ui/BotonEditar";

/** «Editar» de una orden de compra «generada» (actividad 4): la misma pieza que «Editar» en la ficha de un proveedor (lápiz y palabra).
 *  Lleva al formulario de la orden; una anulada no lo muestra. */
export function BotonEditarOrden({ id }: { id: string }) {
  return (
    <BotonEditar href={`/compras/ordenes/editar/${id}`} />
  );
}
