"use client";

import { useEffect, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { soltarPaginaEstable } from "@/components/ui/PaginaEstable";
import { MS_TOPE_DESTINO, leerEnCamino, leerUltimo, llegoAlDestino as llego, soltarDestino, suscribirDestino } from "@/lib/navegacion-al-instante";

const ninguno = () => null;

/**
 * El destino al que se entró desde el menú y que todavía no llega (ADR-0628), o `null`. Lo usa el marco: mientras haya uno, la fila del menú
 * ya está activa y el contenido es el esqueleto con su nombre. Se suelta solo cuando la ruta cambia, con «atrás», o a los 15 s si nunca llegó
 * (la pantalla anterior, que quedó montada y escondida, vuelve tal cual).
 */
export function useDestinoEnCamino(): ReturnType<typeof leerEnCamino> {
  const pathname = usePathname();
  const destino = useSyncExternalStore(suscribirDestino, leerEnCamino, ninguno);
  const enCamino = destino && !llego(destino, pathname) ? destino : null;

  // Llegó: se suelta (el `loading.tsx` sigue con el mismo título, que lee `leerUltimo`).
  useEffect(() => {
    if (destino && llego(destino, pathname)) soltarDestino();
  }, [destino, pathname]);

  // Nunca llegó, o se volvió «atrás»: la pantalla anterior vuelve a la vista.
  useEffect(() => {
    if (!enCamino) return;
    const t = window.setTimeout(soltarDestino, Math.max(0, MS_TOPE_DESTINO - (Date.now() - enCamino.desde)));
    window.addEventListener("popstate", soltarDestino);
    // El esqueleto empieza arriba, como empezará la pantalla: sin esto, entrar desde lo bajo de una lista larga lo dejaba fuera de la vista,
    // y la página no debe guardar el alto de la que se deja (ADR-0185).
    soltarPaginaEstable();
    window.scrollTo({ top: 0 });
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("popstate", soltarDestino);
    };
  }, [enCamino]);

  return enCamino;
}

/** El nombre del módulo al que se acaba de entrar, si ESTA es su pantalla: el `loading.tsx` lo dibuja para no cambiar de título a medio camino. */
export function useTituloDelDestino(): string | null {
  const pathname = usePathname();
  const ultimo = useSyncExternalStore(suscribirDestino, leerUltimo, ninguno);
  return ultimo && ultimo.pathname === pathname ? ultimo.etiqueta : null;
}
