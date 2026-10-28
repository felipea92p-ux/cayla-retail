"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { consultaConCambios, consultaSinFiltros, filtrosDeUrl, type ClaveUrl } from "@/lib/existencias-filtros";

/** La consulta que tiene el navegador AHORA (sin «?»). Se lee al momento de usarla y no de lo que había al pintar: dos clics
 *  seguidos (marcar una talla y luego un color) se suman en vez de pisarse, porque `history.pushState` cambia la URL al
 *  instante y React recién la ve en el cuadro siguiente. */
function consultaVigente(): string {
  return window.location.search.replace(/^\?/, "");
}

/**
 * Los filtros de Existencias, leídos de la URL (`lib/existencias-filtros.ts`, misma estructura que Productos, ADR-0308).
 *
 * Cambiar un filtro reescribe la URL con la historia del navegador y NO navega: la página no se vuelve a pedir (Existencias ya
 * tiene todo el stock de la sede), así que no hay loader ni espera. Next 16 sincroniza `useSearchParams` con
 * `history.pushState`/`replaceState`, así que recargar, «Atrás» y un enlace copiado traen los mismos filtros.
 *
 * El buscador es la única caja que se escribe: mientras alguien teclea, lo suyo vive en `tipeado` (filtra al instante) y pasa
 * a la URL a los 300 ms, reemplazando la entrada del historial (Atrás no recorre cada letra). Al salir de la caja, lo escrito
 * se manda y la caja vuelve a mostrar la URL.
 */
export function useFiltrosExistencias(separa: boolean) {
  const params = useSearchParams();
  const pathname = usePathname();
  const consulta = params.toString();
  const filtros = useMemo(() => filtrosDeUrl(consulta, { separa }), [consulta, separa]);
  const [tipeado, setTipeado] = useState<string | null>(null);

  function escribir(siguiente: string, reemplazar: boolean) {
    if (siguiente === consultaVigente()) return;
    const href = siguiente ? `${pathname}?${siguiente}` : pathname;
    if (reemplazar) window.history.replaceState(null, "", href);
    else window.history.pushState(null, "", href);
  }

  /** Cambia filtros (vacío o `null` lo quita). Por defecto suma una entrada al historial: «Atrás» deshace el clic. */
  function aplicar(cambios: Partial<Record<ClaveUrl, string | null>>, { reemplazar = false }: { reemplazar?: boolean } = {}) {
    escribir(consultaConCambios(consultaVigente(), cambios), reemplazar);
  }

  /** Quita los filtros; `conservar` son los que se quedan (el orden siempre, salvo que se diga otra cosa). */
  function limpiar(conservar?: readonly ClaveUrl[]) {
    setTipeado(null);
    escribir(consultaSinFiltros(consultaVigente(), conservar), false);
  }

  /** Lo escrito por la persona, letra a letra. */
  function teclear(texto: string) {
    setTipeado(texto);
  }

  /** Un texto que pone la pantalla (un código escaneado, «Ver detalle», quitar un término desde el estado vacío): va directo
   *  a la URL, como un clic. */
  function fijarBusqueda(texto: string) {
    setTipeado(null);
    aplicar({ q: texto.trim() });
  }

  /** Al salir de la caja: lo que quedaba por mandar se manda ya y la caja vuelve a leer la URL. */
  function soltarBusqueda() {
    if (tipeado === null) return;
    aplicar({ q: tipeado.trim() }, { reemplazar: true });
    setTipeado(null);
  }

  useEffect(() => {
    if (tipeado === null) return;
    const t = setTimeout(() => aplicar({ q: tipeado.trim() }, { reemplazar: true }), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipeado]);

  // Atrás / Adelante: manda la URL del historial; lo que se estaba escribiendo se descarta.
  useEffect(() => {
    const olvidar = () => setTipeado(null);
    window.addEventListener("popstate", olvidar);
    return () => window.removeEventListener("popstate", olvidar);
  }, []);

  return { filtros, busqueda: tipeado ?? filtros.q, aplicar, limpiar, teclear, fijarBusqueda, soltarBusqueda };
}
