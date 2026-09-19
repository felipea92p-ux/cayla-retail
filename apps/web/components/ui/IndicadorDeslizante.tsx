"use client";

import { useEffect, useLayoutEffect, useRef } from "react";

/* ====================================================================
   IndicadorDeslizante · el subrayado / la pastilla que VIAJA entre opciones
   (2026-09-19, ADR-0130)

   Problema: `Pestanas` y `SegmentoEnlaces` son enlaces (cada opción es una URL, la vista vive en la URL) y
   se dibujan en el servidor. Al cambiar de opción el navegador pide la página nueva y el marcador de
   «activa» SALTA de una opción a otra; no hay nada que animar porque son dos dibujos distintos.

   Solución: el marcador deja de ser un borde de la opción activa y pasa a ser UNA pieza que sobrevive a la
   navegación. Este componente cliente se coloca DENTRO del contenedor (que debe ser `relative`), mide la
   opción marcada con `aria-current` y se traslada hasta ella. Como el contenedor es el mismo en toda la
   ruta (Next no lo remonta al cambiar solo los `searchParams`), el indicador conserva su posición anterior
   y la transición CSS hace el resto: se ve de dónde viene el cambio.

   Si igual se remontara (otra ruta del mismo layout), la posición anterior queda guardada en `memoria`
   por `id` y solo se usa si es reciente (1,5 s): sirve para cambiar de pestaña, no para volver a la
   pantalla un rato después.

   Sin JavaScript (o antes de hidratar) el servidor ya pinta la opción activa marcada con su propia
   clase (`cmp-tab-activa` / `cmp-seg-activa`); en cuanto el indicador se coloca pone `data-indicador` en el
   contenedor y esa marca estática se apaga. Los estilos viven en app/estilos/comprobantes-lista.css.
   ==================================================================== */

type Posicion = { x: number; w: number };

const memoria = new Map<string, Posicion & { t: number }>();
const VIGENCIA_MS = 1500;

export function IndicadorDeslizante({ activa, id, variante }: { activa: string; id: string; variante: "linea" | "pastilla" }) {
  const ref = useRef<HTMLSpanElement>(null);
  const ultima = useRef<Posicion | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    const cont = el?.parentElement;
    if (!el || !cont) return;

    const marcada = () => cont.querySelector<HTMLElement>('[aria-current]:not([aria-current="false"])');
    const poner = (p: Posicion) => {
      el.style.width = `${p.w}px`;
      el.style.transform = `translateX(${p.x}px)`;
      ultima.current = p;
    };
    // Coloca sin viajar (primera vez, redimensionar): apaga la transición, aplica, fuerza el layout y la devuelve.
    const sinViaje = (p: Posicion) => {
      el.style.transition = "none";
      poner(p);
      void el.offsetWidth;
      el.style.transition = "";
    };

    const activo = marcada();
    if (!activo) {
      el.style.opacity = ""; // sin opción marcada no hay dónde apoyarlo: queda invisible (`.cmp-ind` arranca en 0)
      return;
    }
    const destino: Posicion = { x: activo.offsetLeft, w: activo.offsetWidth };
    el.style.opacity = "1";

    if (ultima.current) {
      poner(destino); // ya estaba colocado: viaja
    } else {
      const previa = memoria.get(id);
      if (previa && Date.now() - previa.t < VIGENCIA_MS) {
        sinViaje(previa);
        poner(destino);
      } else {
        sinViaje(destino);
      }
    }
    cont.dataset.indicador = "";

    // Si cambia el tamaño (ventana, tipografía que termina de cargar) se recoloca sin viajar. El primer aviso
    // del observador llega al observar y no significa cambio: se ignora para no cortar el viaje en curso.
    let primera = true;
    const ro = new ResizeObserver(() => {
      if (primera) {
        primera = false;
        return;
      }
      const a = marcada();
      if (a) sinViaje({ x: a.offsetLeft, w: a.offsetWidth });
    });
    ro.observe(cont);
    ro.observe(activo);
    return () => ro.disconnect();
  }, [activa, id]);

  // Al desmontarse guarda dónde estaba, por si la pantalla se vuelve a montar enseguida.
  useEffect(
    () => () => {
      if (ultima.current) memoria.set(id, { ...ultima.current, t: Date.now() });
    },
    [id],
  );

  return <span ref={ref} aria-hidden className={`cmp-ind ${variante === "linea" ? "cmp-ind-linea" : "cmp-ind-pastilla"}`} />;
}
