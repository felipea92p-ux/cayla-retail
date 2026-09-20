"use client";

import { useRouter, usePathname } from "next/navigation";
import { Desplegable } from "@/components/ui/campos";

// Selector LOCAL a la pantalla (query param `?ubicacion=`), no una cookie
// global como `SedeSwitcher` (V1). Fase UI 1 no necesita que TODA la app
// "se pare" en otra ubicación — solo Inventario, hoy. Si Fase 2 necesita el
// mismo selector en más pantallas, este componente se reutiliza tal cual.
export function SelectorUbicacion({
  ubicaciones,
  ubicacionActualId,
}: {
  ubicaciones: { id: string; nombre: string }[];
  ubicacionActualId: string;
}) {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <Desplegable
      forma="pastilla"
      alineacion="derecha"
      etiquetaAccesible="Cambiar de ubicación"
      valor={ubicacionActualId}
      opciones={ubicaciones.map((u) => ({ valor: u.id, texto: u.nombre }))}
      onValor={(id) => router.push(`${pathname}?ubicacion=${id}`)}
    />
  );
}
