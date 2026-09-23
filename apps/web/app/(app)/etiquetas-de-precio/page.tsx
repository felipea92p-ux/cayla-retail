import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { getEtiquetasDeIngreso, type OrigenEtiquetas } from "@/lib/etiquetas-precio";
import { fechaEtiqueta, idsDeParam } from "@/lib/etiqueta-precio-reglas";
import { hoyLima } from "@/lib/fechas-lima";
import { ImprimirEtiquetasPrecio } from "@/components/ImprimirEtiquetasPrecio";

// Etiquetas de precio de un ingreso (ADR-0180). Se llega desde el resultado de Recibir (`?lotes=` con los lotes del
// envío), de Ingreso sin comprobante (`?lotes=` con su lote) o de una orden cerrada del Taller (`?produccion=`).
//
// No es un módulo del menú (ADR-0161): es la salida de esas tres pantallas, así que no lleva `exigirModulo`. Lo que
// cuida los datos es la base: `movimientos_select` solo deja ver las entradas de las sedes que uno opera, y un id
// escrito a mano que no es de tu sede devuelve una lista vacía, no la mercadería de otra tienda.
export default async function EtiquetasDePrecioPage({ searchParams }: { searchParams: Promise<{ lotes?: string | string[]; produccion?: string }> }) {
  await requirePersonaActualV2();
  const params = await searchParams;
  const lotes = idsDeParam(params.lotes);
  const [produccion] = idsDeParam(params.produccion);

  const origen: OrigenEtiquetas | null = produccion ? { tipo: "produccion", id: produccion } : lotes.length > 0 ? { tipo: "lotes", ids: lotes } : null;
  const { etiquetas, sinCodigo } = origen ? await getEtiquetasDeIngreso(origen) : { etiquetas: [], sinCodigo: [] };

  return (
    <ImprimirEtiquetasPrecio
      sobretitulo={origen?.tipo === "produccion" ? "Taller · Producción cerrada" : "Recibir · Mercadería que entró"}
      etiquetas={etiquetas}
      sinCodigo={sinCodigo}
      impreso={fechaEtiqueta(hoyLima())}
    />
  );
}
