import { notFound } from "next/navigation";
import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { getConteoDetalle } from "@/lib/conteos";
import { ConteoDetalleVista } from "@/components/ConteoDetalleVista";
import { volverAMovimientos } from "@/lib/movimientos-reglas";

// El detalle de un conteo (2026-09-16): lee el conteo y lo dibuja `ConteoDetalleVista` (ahí vive el porqué del diseño,
// ADR-0174). `?ver=todas` muestra todas las prendas contadas; por defecto, solo las que tienen diferencia.
export default async function ConteoDetallePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ver?: string; volver?: string }>;
}) {
  const [{ id }, { ver, volver }] = await Promise.all([params, searchParams]);
  const persona = await requirePersonaActualV2();
  const conteo = await getConteoDetalle(id);
  if (!conteo) notFound();
  // Abierto desde Movimientos (ADR-0234): «←» vuelve a esa lista, con sus filtros.
  return <ConteoDetalleVista conteo={conteo} ver={ver} ubicacionEtiqueta={persona.ubicacionEtiqueta} volverA={volverAMovimientos(volver)} />;
}
