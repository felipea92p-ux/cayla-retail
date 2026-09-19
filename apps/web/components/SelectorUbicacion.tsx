"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Desplegable } from "@/components/ui/campos";

// Selector LOCAL a la pantalla (query param `?ubicacion=`), no una cookie
// global como `SedeSwitcher` (V1). Fase UI 1 no necesita que TODA la app
// "se pare" en otra ubicación — solo Inventario, hoy. Si Fase 2 necesita el
// mismo selector en más pantallas, este componente se reutiliza tal cual.
export function SelectorUbicacion({
  ubicaciones,
  ubicacionActualId,
  conservarParametros = false,
}: {
  ubicaciones: { id: string; nombre: string }[];
  ubicacionActualId: string;
  /** Al cambiar de sede, mantener el resto de la URL (período, filtros…). Por
   *  defecto NO: las pantallas que ya lo usaban parten de cero al cambiar de
   *  sede, y así siguen. Resumen lo pide: cambiar de tienda no debe borrar el
   *  período ni la búsqueda. La página vuelve a la primera. */
  conservarParametros?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  return (
    <Desplegable
      forma="pastilla"
      alineacion="derecha"
      etiquetaAccesible="Cambiar de ubicación"
      valor={ubicacionActualId}
      opciones={ubicaciones.map((u) => ({ valor: u.id, texto: u.nombre }))}
      onValor={(id) => {
        if (!conservarParametros) return router.push(`${pathname}?ubicacion=${id}`);
        const siguiente = new URLSearchParams(params.toString());
        siguiente.set("ubicacion", id);
        siguiente.delete("pag");
        router.push(`${pathname}?${siguiente}`);
      }}
    />
  );
}
