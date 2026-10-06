import { notFound } from "next/navigation";
import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { getTrasladoDetalle } from "@/lib/traslados";
import { esUuid } from "@/lib/club-registro-reglas";
import { guiaDelTraslado, rutaDelPaseDeTraslado } from "@/lib/traslados-guia-reglas";
import { Volver } from "@/components/ui/Volver";
import { ImprimirGuiaTraslado } from "@/components/traslados-guia/ImprimirGuiaTraslado";

// La guía impresa de una caja (ADR-0242 D-3). Vive fuera de la billetera (no es un pase: es una hoja para imprimir) y dentro de
// Traslados: la puerta del módulo es el `layout.tsx` de arriba, y la base solo devuelve los traslados de las sedes que uno opera.
export default async function GuiaTrasladoPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, persona] = await Promise.all([params, requirePersonaActualV2()]);
  if (!esUuid(id)) notFound();
  const traslado = await getTrasladoDetalle(id);
  if (!traslado) notFound();
  // La vuelta es al pase de ESTA caja (de donde se llega, por «Guía» o por el QR del frente).
  return (
    <ImprimirGuiaTraslado
      guia={guiaDelTraslado(traslado)}
      sede={persona.ubicacionEtiqueta}
      volver={<Volver forma="flecha" href={rutaDelPaseDeTraslado(traslado.id)} a="la caja" />}
    />
  );
}
