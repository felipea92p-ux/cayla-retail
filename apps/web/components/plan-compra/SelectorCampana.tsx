"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { Desplegable, type Opcion } from "@/components/ui/campos";
import { rotuloDeCampana, type CampanasLeidas } from "@/lib/plan-compra-reglas";

// El selector de campaña del plan (ADR-0372, B3): pasa entre las campañas que ya tienen plan (`?plan=<id>`, que la pantalla ya leía) y, solo a
// quien puede crearlas (un líder), ofrece «+ Nueva campaña…», que abre su hoja. Con una sola campaña y sin poder crear otra, no se dibuja:
// un control que no tiene nada que elegir es ruido.

const NUEVA = "__nueva";

export function SelectorCampana({ campanas, actualId, puedeCrear, onNueva }: { campanas: CampanasLeidas; actualId: string; puedeCrear: boolean; onNueva: () => void }) {
  const router = useRouter();
  const opciones = useMemo((): Opcion<string>[] => {
    const planes = campanas.planes.map((c) => ({ valor: c.id, texto: rotuloDeCampana(c) }));
    return puedeCrear ? [...planes, { valor: NUEVA, texto: "+ Nueva campaña…" }] : planes;
  }, [campanas, puedeCrear]);
  if (opciones.length < 2) return null;
  return (
    <Desplegable
      valor={campanas.planes.some((c) => c.id === actualId) ? actualId : ""}
      onValor={(v) => {
        if (v === NUEVA) return onNueva();
        if (v !== actualId) router.push(`/compras/plan?plan=${v}`);
      }}
      opciones={opciones}
      forma="pastilla"
      alineacion="derecha"
      etiquetaAccesible="Campaña"
      marcador="Campaña"
    />
  );
}
