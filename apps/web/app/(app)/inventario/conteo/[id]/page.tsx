import { notFound } from "next/navigation";
import { requirePersonaActualV2, veModulo } from "@/lib/persona-actual";
import { getConteoDetalle, getLibreEnAlmacen } from "@/lib/conteos";
import { urlBajarTrasConteo } from "@/lib/conteo-conectado";
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
  // «Lo que sigue» (Conteo conectado, 2026-09-26): después de contar el PISO, lo que quedó en 0 y tiene algo en el almacén
  // va a «Bajar al piso» ya cargado. Solo a quien está parado en esa sede y tiene el módulo: Bajar trabaja siempre sobre
  // la sede de quien entra.
  const enCero = conteo.lineasDetalle.filter((l) => l.contado === 0).map((l) => l.varianteId);
  const ofreceBajar =
    conteo.estado === "cerrado" && conteo.sububicacionTipo === "piso_venta" && conteo.ubicacionId === persona.ubicacionId && veModulo(persona, "bajada_piso");
  const bajar = ofreceBajar ? urlBajarTrasConteo(conteo.lineasDetalle, await getLibreEnAlmacen(persona.ubicacionId, enCero)) : null;
  // Abierto desde Movimientos (ADR-0234): «←» vuelve a esa lista, con sus filtros.
  return <ConteoDetalleVista conteo={conteo} ver={ver} ubicacionEtiqueta={persona.ubicacionEtiqueta} volverA={volverAMovimientos(volver)} bajar={bajar} />;
}
