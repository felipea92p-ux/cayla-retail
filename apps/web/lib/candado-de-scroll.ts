// El candado de lo de atrás (ADR-0715): mientras haya una hoja o un cajón con velo, la página de atrás no se desplaza.
//
// EL PROBLEMA. Lo hacía Radix con `Dialog.Overlay` (react-remove-scroll): al abrir AGREGA una hoja de estilos a la página y marca el
// `<body>` con una variable CSS; al cerrar la QUITA. En Safari, quitar una hoja de estilos obliga a rehacer las ~6.300 reglas del ERP y
// a recalcular cada elemento de la pantalla: «Llegó una compra» quedaba ~0,1 s congelada en cada cierre y algo más al abrir (Chrome lo
// hace en 1 ms). Medido en WebKit, el motor de Safari, el 2026-11-27; el costo crece con lo larga que es la pantalla.
//
// AQUÍ. Una sola propiedad que no se hereda, en `<html>`: `overflow: hidden`, que Safari resuelve en ~1 ms. Si la página tenía una barra
// de desplazamiento que ocupa lugar (Windows), además `scrollbar-gutter: stable`: el hueco de la barra se queda y nada salta de lado.
// Varias hojas a la vez (una sobre otra) comparten el candado: lo pone la primera y lo quita la última, y lo de antes vuelve tal cual.
// El velo (`components/ui/VeloDeHoja.tsx`) es quien lo pide; además no deja arrastrar la página con el dedo desde él.

/** Lo que el candado toca de la página: el estilo propio de `<html>` y su ancho sin la barra. */
export type RaizDeLaPagina = {
  style: Pick<CSSStyleDeclaration, "getPropertyValue" | "setProperty" | "removeProperty">;
  clientWidth: number;
};

const PROPIEDADES = ["overflow", "scrollbar-gutter"] as const;

/**
 * Arma un candado sobre una página. `bloquear()` lo pone y devuelve con qué soltarlo; soltar dos veces no hace nada (React, en
 * desarrollo, monta y desmonta cada efecto dos veces).
 */
export function crearCandado(raiz: () => RaizDeLaPagina | null, anchoDeLaVentana: () => number): () => () => void {
  let abiertas = 0;
  let pagina: RaizDeLaPagina | null = null;
  let antes: Record<(typeof PROPIEDADES)[number], string> | null = null;

  return function bloquear(): () => void {
    if (abiertas === 0) {
      pagina = raiz();
      if (!pagina) return () => {};
      antes = { overflow: pagina.style.getPropertyValue("overflow"), "scrollbar-gutter": pagina.style.getPropertyValue("scrollbar-gutter") };
      const barra = anchoDeLaVentana() - pagina.clientWidth;
      pagina.style.setProperty("overflow", "hidden");
      if (barra > 0) pagina.style.setProperty("scrollbar-gutter", "stable");
    }
    abiertas++;
    let suelto = false;
    return () => {
      if (suelto) return;
      suelto = true;
      abiertas--;
      if (abiertas > 0 || !pagina || !antes) return;
      for (const propiedad of PROPIEDADES) {
        if (antes[propiedad]) pagina.style.setProperty(propiedad, antes[propiedad]);
        else pagina.style.removeProperty(propiedad);
      }
      pagina = null;
      antes = null;
    };
  };
}

/** El candado de esta página (uno solo para todas las hojas). Fuera del navegador no hace nada. */
export const bloquearLoDeAtras = crearCandado(
  () => (typeof document === "undefined" ? null : document.documentElement),
  () => (typeof window === "undefined" ? 0 : window.innerWidth),
);
