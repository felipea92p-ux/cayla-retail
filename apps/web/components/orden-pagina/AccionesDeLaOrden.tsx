import { BotonEnlace } from "@/components/ui/campos";
import { queSigue, type OrdenPagina } from "@/lib/orden-pagina-reglas";

// Las dos salidas de la orden, en la cabecera (ADR-0400): «Pasar al stock» cuando las fases terminaron y «Anular». Hoy las dos llevan al cajón de la lista (`/produccion/ordenes?orden=<id>`),
// que es donde viven el cierre y la anulación con sus candados; la actividad 6 los rehace aquí mismo (cierre al stock con los costos del Taller). Por eso no hay un botón nuevo que guarde algo.

export function AccionesDeLaOrden({ datos }: { datos: OrdenPagina }) {
  if (!datos.permisos.puedeOperar || datos.orden.estado !== "en_proceso") return null;
  const alStock = queSigue(datos.fases, datos.orden.estado).accion === "pasar_al_stock";
  const enLista = `/produccion/ordenes?orden=${datos.orden.id}`;
  return (
    <div data-guia="prod-orden.acciones" className="flex flex-wrap items-center gap-2">
      <BotonEnlace href={enLista} peso="peligro">
        Anular
      </BotonEnlace>
      {alStock && (
        <BotonEnlace href={enLista} peso="primario">
          Pasar al stock
        </BotonEnlace>
      )}
    </div>
  );
}
