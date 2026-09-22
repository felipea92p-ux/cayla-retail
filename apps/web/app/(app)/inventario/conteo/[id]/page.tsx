import { notFound } from "next/navigation";
import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { getConteoDetalle } from "@/lib/conteos";
import { ConteoDetalleVista } from "@/components/ConteoDetalleVista";

// El detalle de un conteo (2026-09-16): lee el conteo y lo dibuja `ConteoDetalleVista` (ahí vive el porqué del diseño,
// ADR-0172). `?ver=todas` muestra todas las prendas contadas; por defecto, solo las que tienen diferencia.
export default async function ConteoDetallePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ver?: string }>;
}) {
  const [{ id }, { ver }] = await Promise.all([params, searchParams]);
  const persona = await requirePersonaActualV2();
  const conteo = await getConteoDetalle(id);
  if (!conteo) notFound();
  return <ConteoDetalleVista conteo={conteo} ver={ver} ubicacionEtiqueta={persona.ubicacionEtiqueta} />;
}
