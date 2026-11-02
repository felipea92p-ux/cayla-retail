"use client";

import { useEffect, type RefObject } from "react";

/**
 * El menú lateral usa el alto que tiene (Felipe 2026-10-31, ADR-0596: «hay mucho espacio debajo que se puede aprovechar para que estén
 * más holgados los módulos, y que se acomoden siempre cada vez que se desplieguen los submódulos»).
 *
 * Las filas de primer nivel no tienen un alto fijo: se reparten el alto del `<nav>`. Con el menú cerrado crecen hasta 56 px (plegado,
 * hasta 66) y lo que sobra se vuelve aire entre ellas (hasta 14 px; plegado, 8); al abrir un módulo, su bandeja toma lo que necesita y las demás filas
 * se comprimen hasta su mínimo (40 px; plegado, 54), y recién ahí el menú corre. Se recalcula CUADRO A CUADRO mientras una bandeja crece
 * o se cierra (un `ResizeObserver` sobre cada `.lateral-hijos`), así que las filas se acomodan con el mismo movimiento de la bandeja,
 * sin saltos. El resultado son dos variables en el `<nav>`, `--fila-alto` y `--fila-aire`, que lee marco.css.
 *
 * `alAcomodar` corre después de cada reparto: la gota de la fila activa se mide sobre las filas ya acomodadas.
 * `clave` cambia cuando cambia la forma del menú (plegado, celular, cuántos grupos): ahí se vuelve a observar.
 */
export function useMenuHolgado(navRef: RefObject<HTMLElement | null>, alAcomodar: () => void, clave: string) {
  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    let cuadro = 0;

    const acomodar = () => {
      cuadro = 0;
      const filas = Array.from(nav.querySelectorAll<HTMLElement>('.marco-fila[data-prof="0"]'));
      const grupos = Array.from(nav.children).filter((h): h is HTMLElement => h instanceof HTMLElement && h.tagName === "DIV");
      const n = filas.length;
      if (!n || !grupos.length) return;
      const compacto = nav.closest("[data-compacto]") !== null;
      const [minimo, maximo, aireMaximo] = compacto ? [54, 66, 8] : [40, 56, 14];
      const estilo = getComputedStyle(nav);
      const disponible = nav.clientHeight - parseFloat(estilo.paddingTop) - parseFloat(estilo.paddingBottom);
      // Lo que NO son filas de primer nivel (bandejas abiertas, títulos de grupo, el espacio entre grupos): se mide lo que hay y se le
      // resta lo que ocupan hoy las filas y el aire que ya se les dio.
      const primero = grupos[0];
      const ultimo = grupos[grupos.length - 1];
      const contenido = ultimo.offsetTop + ultimo.offsetHeight - primero.offsetTop;
      const aireHoy = parseFloat(nav.style.getPropertyValue("--fila-aire")) || 0;
      const huecos = Math.max(0, n - grupos.length);
      const otros = contenido - filas.reduce((s, f) => s + f.offsetHeight, 0) - huecos * aireHoy;
      const alto = Math.round(Math.min(maximo, Math.max(minimo, (disponible - otros) / n)));
      const sobra = disponible - otros - n * alto;
      const aire = huecos ? Math.round(Math.min(aireMaximo, Math.max(0, sobra / huecos))) : 0;
      if (nav.style.getPropertyValue("--fila-alto") !== `${alto}px`) nav.style.setProperty("--fila-alto", `${alto}px`);
      if (nav.style.getPropertyValue("--fila-aire") !== `${aire}px`) nav.style.setProperty("--fila-aire", `${aire}px`);
      // Con más alto, la letra sube medio punto: holgado de verdad, no una fila grande con letra chica.
      nav.toggleAttribute("data-holgado", !compacto && alto >= 48);
      alAcomodar();
    };
    const pedir = () => {
      if (!cuadro) cuadro = requestAnimationFrame(acomodar);
    };

    const observador = new ResizeObserver(pedir);
    observador.observe(nav);
    nav.querySelectorAll(".lateral-hijos").forEach((h) => observador.observe(h));
    acomodar();
    return () => {
      observador.disconnect();
      cancelAnimationFrame(cuadro);
    };
  }, [navRef, alAcomodar, clave]);
}
