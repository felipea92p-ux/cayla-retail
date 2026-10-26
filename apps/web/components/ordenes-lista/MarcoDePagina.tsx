"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { TituloSeccion } from "@/components/ui/TituloSeccion";

// El marco de «Nueva orden» sobre la lista de Órdenes (ADR-0509): la orden se arma en la propia página, con la lista a la vista debajo, y no en una hoja que la tapa.
//
// QUÉ HACE POR EL FORMULARIO LO QUE ANTES HACÍA LA HOJA. Se lleva a la vista y pone el cursor en el primer campo (Radix lo hacía al abrir la hoja). El ancho que decide si la ficha va a la
// derecha o en una barra de abajo es el de ESTA tarjeta (`@container`), no el de la pantalla: con el lateral abierto a 1280 px quedan ~900 px, no 1280.
//
// QUÉ NO HACE. No cierra con Escape ni con un clic fuera: una página no se descarta por un roce (lo escrito es varios minutos de trabajo). «Cancelar» y guardar cierran; las teclas que
// ya servían dentro (cerrar la lista de un combo con Escape) siguen siendo de cada control. Salir por el menú o por «atrás» con lo escrito pregunta «¿Salir sin guardar?» (el hook del
// formulario, `useSalidaSinGuardar`, ya vigila los enlaces y el historial).
export function MarcoDePagina({ children }: { children: ReactNode }) {
  const raiz = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = raiz.current;
    if (!el) return;
    const sinMovimiento = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ block: "start", behavior: sinMovimiento ? "auto" : "smooth" });
    // Si el formulario ya puso el cursor en un campo (un modelo que llega elegido desde el Resumen), no se lo quita.
    if (!el.contains(document.activeElement)) el.querySelector<HTMLElement>("input:not([disabled])")?.focus({ preventScroll: true });
  }, []);
  return (
    <section ref={raiz} aria-labelledby="nueva-orden-titulo" data-compositor-orden className="card-cayla anim-revelar @container scroll-mt-24 p-6">
      <TituloSeccion id="nueva-orden-titulo">Nueva orden de producción</TituloSeccion>
      {children}
    </section>
  );
}
