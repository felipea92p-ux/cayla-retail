"use client";

import { useCallback, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { navegacionSinEspera } from "@/components/ui/Espera";

/** Cambios sobre la URL del Resumen: `null` o vacío borra el parámetro. */
export type CambiosUrl = Record<string, string | null>;

/**
 * Todo el estado del Resumen vive en la URL (período, comparación, búsqueda,
 * filtros, orden, página): se puede compartir, recargar y volver atrás, y el
 * servidor recalcula con lo que dice la URL — al navegador nunca viaja más que
 * una página de filas. `pendiente` es true mientras el servidor recalcula, para
 * atenuar la pantalla en vez de dejarla congelada.
 *
 * `tipeado`: el cambio viene del buscador (se escribió). No abre el loader general —la pantalla ya se
 * atenúa y el campo dice «Buscando…»—, igual que los demás buscadores por URL (`useBusquedaEnUrl`,
 * ADR-0149 «Actualización 2026-09-28»). Un clic (período, categoría, orden, página) sigue con el loader.
 */
export function useResumenUrl() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pendiente, empezar] = useTransition();

  const actualizar = useCallback(
    (cambios: CambiosUrl, opciones?: { conservarPagina?: boolean; tipeado?: boolean }) => {
      const siguiente = new URLSearchParams(params.toString());
      for (const [clave, valor] of Object.entries(cambios)) {
        if (valor === null || valor === "") siguiente.delete(clave);
        else siguiente.set(clave, valor);
      }
      // Cualquier filtro nuevo vuelve a la primera página.
      if (!opciones?.conservarPagina) siguiente.delete("pag");
      const consulta = siguiente.toString();
      const href = consulta ? `${pathname}?${consulta}` : pathname;
      if (opciones?.tipeado) navegacionSinEspera(href);
      empezar(() => router.replace(href, { scroll: false }));
    },
    [params, pathname, router],
  );

  return { actualizar, pendiente };
}
