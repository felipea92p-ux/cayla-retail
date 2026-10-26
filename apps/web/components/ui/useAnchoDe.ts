"use client";

import { useLayoutEffect, useState, type RefObject } from "react";

/** El ancho (en px) de un elemento, al día mientras la ventana o el panel cambian de tamaño. `0` hasta medirlo (el primer dibujo del
 *  servidor y del navegador es el mismo: quien lo use parte de su versión angosta y pasa a la ancha al medirse). Lo usa la Lista de la
 *  Vitrina para elegir entre una columna por tienda y las filas de siempre; un `@container` de CSS no sirve ahí porque el ancho que
 *  hace falta depende de cuántas tiendas hay. */
export function useAnchoDe(ref: RefObject<HTMLElement | null>): number {
  const [ancho, setAncho] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const medir = () => setAncho(Math.round(el.getBoundingClientRect().width));
    medir();
    const obs = new ResizeObserver(medir);
    obs.observe(el);
    return () => obs.disconnect();
  }, [ref]);
  return ancho;
}
