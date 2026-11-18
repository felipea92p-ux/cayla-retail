"use client";

import { useEffect } from "react";

/** Las notas crecen mientras se escribe (2026-11-18, maqueta `docs/maquetas/mejoras-componentes-2026-11/`, Felipe: «solo la
 *  funcionalidad, sin cambiar el diseño»).
 *
 *  Un `<textarea>` del ERP tiene el alto que le dan sus `rows` y su clase; al pasarse, aparecía una barra para desplazar DENTRO de la
 *  caja y lo escrito arriba quedaba fuera de la vista. Con `field-sizing: content` la caja se estira con el texto. Para no cambiar cómo
 *  se ve, se guarda el alto que la caja YA tiene la primera vez que recibe el cursor y ese queda como su mínimo (en línea: le gana a
 *  cualquier clase): vacía o con poco texto se ve exactamente igual; solo crece cuando lo escrito no cabe, hasta 18 líneas.
 *
 *  Va montado UNA vez en `app/layout.tsx` (como `OndaBotones`): ninguna pantalla hace nada. Se salta la caja de solo lectura, la que ya
 *  maneja su alto por su cuenta (`style.height`, como el mensaje de Traslados) y la que pide quedarse fija (`data-alto-fijo`). Sin
 *  `field-sizing` en el navegador no hace nada. */
export function NotasQueCrecen() {
  useEffect(() => {
    if (typeof CSS === "undefined" || !CSS.supports("field-sizing", "content")) return;
    const alEntrar = (e: FocusEvent) => {
      const caja = e.target;
      if (!(caja instanceof HTMLTextAreaElement)) return;
      if (caja.dataset.crece !== undefined || caja.readOnly || caja.style.height || caja.hasAttribute("data-alto-fijo")) return;
      const alto = caja.offsetHeight;
      if (!alto) return;
      caja.style.minHeight = `${alto}px`;
      caja.style.maxHeight = `max(${alto}px, 18lh)`;
      caja.style.setProperty("field-sizing", "content");
      caja.dataset.crece = "";
    };
    document.addEventListener("focusin", alEntrar);
    return () => document.removeEventListener("focusin", alEntrar);
  }, []);
  return null;
}
