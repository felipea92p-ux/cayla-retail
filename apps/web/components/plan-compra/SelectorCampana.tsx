"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { Desplegable, type Opcion } from "@/components/ui/campos";
import { campanasActivas, campanasArchivadas, rotuloDeCampana, type CampanasLeidas } from "@/lib/plan-compra-reglas";

// El selector de campaña del plan (ADR-0372, B3 y B5): pasa entre las campañas activas (`?plan=<id>`) y, solo a quien puede (un líder), ofrece
// «+ Nueva campaña…», «Editar o quitar esta campaña…» y «Campañas archivadas (N)…», que abren su hoja. Las archivadas no salen en la lista: se
// ven desde su hoja. Con una sola campaña y nada más que ofrecer, no se dibuja: un control sin nada que elegir es ruido.

const NUEVA = "__nueva";
const EDITAR = "__editar";
const ARCHIVADAS = "__archivadas";

export function SelectorCampana({
  campanas,
  actualId,
  puedeCrear,
  onNueva,
  onEditar,
  onArchivadas,
}: {
  campanas: CampanasLeidas;
  actualId: string;
  /** Un líder: crea, edita, quita y restaura campañas (la base lo exige también). */
  puedeCrear: boolean;
  onNueva: () => void;
  onEditar: () => void;
  onArchivadas: () => void;
}) {
  const router = useRouter();
  const activas = useMemo(() => campanasActivas(campanas), [campanas]);
  const archivadas = useMemo(() => campanasArchivadas(campanas), [campanas]);
  const opciones = useMemo((): Opcion<string>[] => {
    const planes = activas.map((c) => ({ valor: c.id, texto: rotuloDeCampana(c) }));
    if (!puedeCrear) return planes;
    const acciones: Opcion<string>[] = [{ valor: NUEVA, texto: "+ Nueva campaña…" }];
    // Editar y archivar existen desde B5: si la base todavía no lo sabe, no se ofrece.
    if (campanas.edicion && activas.some((c) => c.id === actualId)) acciones.push({ valor: EDITAR, texto: "Editar o quitar esta campaña…" });
    if (campanas.edicion && archivadas.length > 0) acciones.push({ valor: ARCHIVADAS, texto: `Campañas archivadas (${archivadas.length})…` });
    return [...planes, ...acciones];
  }, [activas, archivadas, campanas.edicion, puedeCrear, actualId]);
  if (opciones.length < 2) return null;
  return (
    <Desplegable
      valor={activas.some((c) => c.id === actualId) ? actualId : ""}
      onValor={(v) => {
        if (v === NUEVA) return onNueva();
        if (v === EDITAR) return onEditar();
        if (v === ARCHIVADAS) return onArchivadas();
        if (v !== actualId) router.push(`/compras/plan?plan=${v}`);
      }}
      opciones={opciones}
      forma="pastilla"
      alineacion="derecha"
      etiquetaAccesible="Campaña"
      marcador="Campaña"
      // En la cabecera mide lo mismo que «Exportar» (40 px): la pastilla de la sede mide 30 y quedaba más baja en la misma fila.
      className="[&>button]:h-10"
    />
  );
}
