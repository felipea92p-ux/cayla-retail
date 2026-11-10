"use client";

import { useEffect, useRef, useSyncExternalStore, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { soltarPaginaEstable } from "@/components/ui/PaginaEstable";
import { MS_TOPE_DESTINO, leerEnCamino, leerUltimo, registrarNavegador, soltarDestino, suscribirDestino } from "@/lib/navegacion-al-instante";

const ninguno = () => null;

/**
 * El destino al que se entró desde el menú y que todavía no llega (ADR-0628), o `null`. Lo usa el marco: mientras haya uno, la fila del menú
 * ya está activa y el contenido es el esqueleto con su nombre. Se suelta cuando Next termina la navegación, con «atrás», o a los 15 s si nunca
 * llegó (la pantalla anterior, que quedó montada y escondida, vuelve tal cual).
 *
 * Cuándo termina (actualización 2026-11-10): el marco navega con `router.push` DENTRO de su propia transición. React deja abierta esa
 * transición hasta que monta la pantalla nueva (o su `loading.tsx`), así que `navegando` pasa a `false` justo cuando hay algo que mostrar,
 * venga de donde venga: de una hija a su padre (Marcas → Productos), con un `redirect` que vuelve a la misma ruta o a «Sin acceso».
 * Antes se miraba la ruta, y entrar a un padre desde su hija se daba por llegado en el mismo clic.
 */
export function useDestinoEnCamino(): ReturnType<typeof leerEnCamino> {
  const router = useRouter();
  const [navegando, iniciar] = useTransition();
  const destino = useSyncExternalStore(suscribirDestino, leerEnCamino, ninguno);
  // Vio la navegación abierta: recién entonces su cierre quiere decir «llegó» (nunca se suelta antes de haber empezado).
  const empezo = useRef(false);

  // El marco es quien navega: así sabe cuándo terminó (el marco vive mientras dure la sesión; las filas del cajón, no).
  useEffect(() => registrarNavegador((href) => iniciar(() => router.push(href))), [router]);

  // Llegó: se suelta (el `loading.tsx` sigue con el mismo título, que lee `leerUltimo`).
  useEffect(() => {
    if (!destino) {
      empezo.current = false;
      return;
    }
    if (navegando) empezo.current = true;
    else if (empezo.current) {
      empezo.current = false;
      soltarDestino();
    }
  }, [destino, navegando]);

  // Nunca llegó, o se volvió «atrás»: la pantalla anterior vuelve a la vista.
  useEffect(() => {
    if (!destino) return;
    const t = window.setTimeout(soltarDestino, Math.max(0, MS_TOPE_DESTINO - (Date.now() - destino.desde)));
    window.addEventListener("popstate", soltarDestino);
    // El esqueleto empieza arriba, como empezará la pantalla: sin esto, entrar desde lo bajo de una lista larga lo dejaba fuera de la vista,
    // y la página no debe guardar el alto de la que se deja (ADR-0185).
    soltarPaginaEstable();
    window.scrollTo({ top: 0 });
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("popstate", soltarDestino);
    };
  }, [destino]);

  return destino;
}

/** El nombre del módulo al que se acaba de entrar, si ESTA es su pantalla: el `loading.tsx` lo dibuja para no cambiar de título a medio camino. */
export function useTituloDelDestino(): string | null {
  const pathname = usePathname();
  const ultimo = useSyncExternalStore(suscribirDestino, leerUltimo, ninguno);
  return ultimo && ultimo.pathname === pathname ? ultimo.etiqueta : null;
}
