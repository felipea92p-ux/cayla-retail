"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import { esperaEnLaMismaPagina, type FormaEsqueleto } from "@/lib/esqueleto";
import { FormaDelEsqueleto } from "./FormaDelEsqueleto";

/**
 * El esqueleto propio, donde Next no muestra ninguno (2026-10-17): de una lista a otra desde la cabecera o su menú (`esperaEnLaMismaPagina`).
 * Es la misma página con otra dirección, y Next no vuelve a mostrar el `loading.tsx`: la lista de antes se quedaba quieta hasta que
 * llegaba la nueva, sin que nada dijera que el toque había llegado. Ahora, al tocar el enlace, la lista se cambia AL INSTANTE por la grilla
 * que brilla con el título de la que viene, con el mismo fundido que entre páginas, y la lista nueva la reemplaza al llegar.
 *
 * Funciona en tres piezas: `VigiaDelCamino` (una vez, en `app/layout.tsx`) escucha los toques y, si la dirección cambia, olvida el camino;
 * `EnCamino` (dentro del `<main>` de `MarcoCatalogo`) pone el esqueleto mientras se sigue en la página de donde se salió; y la cabecera
 * marca ya la sección a la que se va (`useCamino`). Vive en la memoria de esta pestaña.
 */
export type Camino = { ruta: string; buscar: string; forma: FormaEsqueleto; desde: string };

let camino: Camino | null = null;
let olvido: number | undefined;
const escuchas = new Set<() => void>();
const avisar = () => escuchas.forEach((f) => f());
const suscribir = (f: () => void) => {
  escuchas.add(f);
  return () => escuchas.delete(f);
};
const elCamino = () => camino;
const ninguno = () => null;

function fijar(nuevo: Camino | null) {
  camino = nuevo;
  window.clearTimeout(olvido);
  // Si la página nueva nunca llega (se canceló, se volvió atrás), el esqueleto no se queda para siempre.
  if (nuevo) olvido = window.setTimeout(() => fijar(null), 12000);
  avisar();
}

/** El camino en curso (adónde se va), o null. */
export function useCamino(): Camino | null {
  return useSyncExternalStore(suscribir, elCamino, ninguno);
}

/** La vista en que se está: la ruta y la dirección, escritas siempre igual (`URLSearchParams`), para compararlas. */
const dondeEsta = (ruta: string, buscar: string) => `${ruta}?${new URLSearchParams(buscar).toString()}`;

/** Escucha los toques que llevan a otra vista de la misma página y olvida el camino cuando la dirección cambia. Una vez, en el layout. */
export function VigiaDelCamino() {
  return (
    <Suspense fallback={null}>
      <Vigia />
    </Suspense>
  );
}

function Vigia() {
  const ruta = usePathname() ?? "";
  const buscar = useSearchParams().toString();
  // Llegó la página nueva (o cualquier otra): el camino ya no hace falta.
  useEffect(() => {
    if (camino) fijar(null);
  }, [ruta, buscar]);

  useEffect(() => {
    const alTocar = (e: MouseEvent) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || !(e.target instanceof Element)) return;
      const enlace = e.target.closest("a[href]");
      if (!(enlace instanceof HTMLAnchorElement) || enlace.target || enlace.hasAttribute("download")) return;
      const destino = new URL(enlace.href);
      if (destino.origin !== location.origin) return;
      const forma = esperaEnLaMismaPagina(
        { ruta: location.pathname, buscar: new URLSearchParams(location.search) },
        { ruta: destino.pathname, buscar: destino.searchParams },
      );
      if (!forma) return;
      const nuevo: Camino = { ruta: destino.pathname, buscar: destino.searchParams.toString(), forma, desde: dondeEsta(location.pathname, location.search) };
      const poner = () => flushSync(() => fijar(nuevo));
      // Con el mismo fundido que entre páginas.
      const quieto = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if ("startViewTransition" in document && !quieto && document.visibilityState === "visible") document.startViewTransition(poner);
      else poner();
    };
    const alVolver = () => fijar(null);
    // En la captura, antes que el enlace: `<Link>` llama a `preventDefault` para navegar él mismo, así que después ya no se sabría si el
    // toque iba a otra página o a ninguna parte.
    document.addEventListener("click", alTocar, true);
    window.addEventListener("popstate", alVolver);
    return () => {
      document.removeEventListener("click", alTocar, true);
      window.removeEventListener("popstate", alVolver);
    };
  }, []);
  return null;
}

/** Lo que va dentro del `<main>` de las páginas del catálogo: la página o, mientras se va a otra vista de ella, su esqueleto. */
export function EnCamino({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={children}>
      <SegunElCamino>{children}</SegunElCamino>
    </Suspense>
  );
}

function SegunElCamino({ children }: { children: React.ReactNode }) {
  const c = useCamino();
  const ruta = usePathname() ?? "";
  const buscar = useSearchParams().toString();
  // Solo mientras se sigue en la página de donde se salió: la página nueva, al llegar, ya es otra dirección y se ve tal cual.
  if (!c || c.desde !== dondeEsta(ruta, buscar)) return children;
  return <FormaDelEsqueleto forma={c.forma} destino={{ ruta: c.ruta, buscar: c.buscar }} sinFranja />;
}
