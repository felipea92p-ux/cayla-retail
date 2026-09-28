"use client";

import { useState, useTransition } from "react";
import { useRouter, usePathname } from "next/navigation";
import { AvisoCambioDeSede } from "@/components/AvisoCambioDeSede";
import { Desplegable } from "@/components/ui/campos";

// Selector LOCAL a la pantalla (query param `?ubicacion=`), no una cookie
// global como `SedeSwitcher` (V1). Fase UI 1 no necesita que TODA la app
// "se pare" en otra ubicación — solo Inventario, hoy. Si Fase 2 necesita el
// mismo selector en más pantallas, este componente se reutiliza tal cual.
//
// Mientras la pantalla nueva viaja (`useTransition` dura lo que tarda la carga, ni más
// ni menos) la pastilla ya dice a dónde vas y sale el aviso central: sin eso el clic
// parecía no haber hecho nada y las cifras de la sede anterior seguían a la vista.
export function SelectorUbicacion({
  ubicaciones,
  ubicacionActualId,
  conservar,
}: {
  ubicaciones: { id: string; nombre: string }[];
  ubicacionActualId: string;
  /** Parámetros de la URL que sobreviven al cambio (ej. `desde`, la pantalla a la que vuelve «Volver»). */
  conservar?: Record<string, string | undefined>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pendiente, startTransition] = useTransition();
  const [destinoId, setDestinoId] = useState(ubicacionActualId);

  const nombre = (id: string) =>
    ubicaciones.find((u) => u.id === id)?.nombre ?? "";

  return (
    <>
      <Desplegable
        forma="pastilla"
        alineacion="derecha"
        etiquetaAccesible="Cambiar de ubicación"
        valor={pendiente ? destinoId : ubicacionActualId}
        opciones={ubicaciones.map((u) => ({ valor: u.id, texto: u.nombre }))}
        trabajando={pendiente}
        onValor={(id) => {
          if (id === ubicacionActualId) return;
          setDestinoId(id);
          const qs = new URLSearchParams({ ubicacion: id });
          for (const [k, v] of Object.entries(conservar ?? {})) if (v) qs.set(k, v);
          startTransition(() => router.push(`${pathname}?${qs}`));
        }}
      />
      <AvisoCambioDeSede
        activo={pendiente}
        de={nombre(ubicacionActualId)}
        a={nombre(destinoId)}
      />
    </>
  );
}
