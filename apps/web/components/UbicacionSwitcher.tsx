"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cambiarUbicacionActiva } from "@/app/actions/ubicacion";
import { Desplegable } from "@/components/ui/campos";

// Selector de ubicación del líder (Fase 2 — pendiente desde
// app/(app)/layout.tsx, "Fase 1 no lo pedía como prop"): "pararse" en
// Trujillo, Arequipa, Lima o el Almacén y que TODA la app (vender, caja,
// inventario, movimientos) trabaje sobre esa ubicación. Mismo mecanismo que
// `SedeSwitcher` de V1 — cookie httpOnly vía server action — adaptado a
// ubicaciones en vez de sedes. Un integrante no lo ve.
export function UbicacionSwitcher({
  ubicaciones,
  ubicacionActualId,
}: {
  ubicaciones: { id: string; nombre: string }[];
  ubicacionActualId: string;
}) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  const [valor, setValor] = useState(ubicacionActualId);

  return (
    <Desplegable
      forma="pastilla"
      alineacion="derecha"
      etiquetaAccesible="Cambiar de ubicación"
      valor={valor}
      opciones={ubicaciones.map((u) => ({ valor: u.id, texto: u.nombre }))}
      trabajando={pendiente}
      onValor={(ubicacionId) => {
        setValor(ubicacionId);
        startTransition(async () => {
          await cambiarUbicacionActiva(ubicacionId);
          router.refresh();
        });
      }}
    />
  );
}
