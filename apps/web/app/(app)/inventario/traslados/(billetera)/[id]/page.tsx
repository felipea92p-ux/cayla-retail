import { notFound } from "next/navigation";
import { volverAMovimientos } from "@/lib/movimientos-reglas";
import { esUuid } from "@/lib/club-registro-reglas";
import { Escenario } from "@/components/traslados-pases/Escenario";

// Un pase abierto (ADR-0355). Es la dirección a la que llevan los enlaces de Movimientos («Traslado 290»), el aviso de
// WhatsApp a la otra sede y la billetera. Abierto desde Movimientos (ADR-0234): «← Volver a Movimientos», con sus filtros.
export default async function TrasladoPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ volver?: string }> }) {
  const [{ id }, { volver }] = await Promise.all([params, searchParams]);
  // Un id que no es uuid ni se le pregunta a la base (como la guía): antes caía en «Esta pantalla no está mostrando datos» (/chaos 2026-10-14).
  if (!esUuid(id)) notFound();
  const href = volverAMovimientos(volver);
  return <Escenario id={id} volverA={href ? { href, a: "Movimientos" } : null} />;
}
