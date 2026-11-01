"use client";

import { useEffect, useLayoutEffect, useRef } from "react";

/* ====================================================================
   IndicadorDeslizante · el subrayado / la pastilla que VIAJA entre opciones
   (2026-09-19, ADR-0136)

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

   Sin JavaScript (o antes de hidratar) el servidor ya pinta la opción activa marcada con su propio borde
   (`.pestana-cayla[aria-current]`); en cuanto el indicador se coloca pone `data-indicador` en el contenedor y
   esa marca estática se apaga. Los estilos viven en app/estilos/comprobantes-lista.css (el viaje) y en
   app/estilos/pestanas-y-segmentos.css (la pestaña).

   `selector` + `linea-tinta` (2026-09-28, Temporadas): la misma línea bajo un grupo de tarjetas que eligen una vista
   (`TarjetaCifra` con `onClick`, que marca la elegida con `aria-pressed`, no con `aria-current`). En tinta y no en rojo:
   esas tarjetas ya llevan el rojo de «pide algo» en su filete y su cifra (máximo dos rojos por pantalla).

   Desde el 2026-10-06 (ADR-0358, «Pestañas y segmentos», elegido por Felipe mirando) `pildora-tinta` es la píldora oscura
   que viaja bajo TODA pestaña de vista (`Pestanas`, en sus dos maneras: con `aria-current` o, por estado, con
   `selector='[aria-selected="true"]'`): el vidrio de Comprobantes llevado a todo el ERP. `linea-tinta` queda para las
   tarjetas que eligen una vista (Temporadas).
   ==================================================================== */

type Posicion = { x: number; w: number };

const memoria = new Map<string, Posicion & { t: number }>();
const VIGENCIA_MS = 1500;

const SELECTOR_MARCADA = '[aria-current]:not([aria-current="false"])';
const VARIANTE = { "linea-tinta": "cmp-ind-linea cmp-ind-tinta", "pildora-tinta": "cmp-ind-pildora", gota: "cmp-ind-pildora cmp-ind-gota" } as const;
/** La gota fluye en dos tramos (ADR-0596, «A · La gota de Mi perfil», Felipe 2026-10-31): se estira hasta cubrir la de antes y la nueva,
 *  y se recoge en la nueva. Los tiempos van en `.cmp-ind-gota[data-fluye]` (vidrio/pantalla.css); aquí solo cuándo pasa al segundo. */
const GOTA_ESTIRA_MS = 200;

export function IndicadorDeslizante({
  activa,
  id,
  variante,
  selector = SELECTOR_MARCADA,
  className = "",
}: {
  activa: string;
  id: string;
  variante: keyof typeof VARIANTE;
  /** Cómo se reconoce la opción marcada dentro del contenedor. */
  selector?: string;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const ultima = useRef<Posicion | null>(null);
  const recoge = useRef<number | undefined>(undefined);

  useLayoutEffect(() => {
    const el = ref.current;
    const cont = el?.parentElement;
    if (!el || !cont) return;

    const marcada = () => cont.querySelector<HTMLElement>(selector);
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

    // Desde dónde viaja: lo último puesto o, si la fila se volvió a montar enseguida (otra ruta del mismo layout), lo que guardó.
    let antes = ultima.current;
    if (!antes) {
      const previa = memoria.get(id);
      if (previa && Date.now() - previa.t < VIGENCIA_MS) {
        sinViaje(previa);
        antes = previa;
      }
    }
    window.clearTimeout(recoge.current);
    const quieto = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!antes) {
      sinViaje(destino);
    } else if (variante === "gota" && !quieto && (antes.x !== destino.x || antes.w !== destino.w)) {
      // Fluye: primero cubre las dos (la de antes y la nueva), después se recoge en la nueva.
      const izq = Math.min(antes.x, destino.x);
      el.dataset.fluye = "estira";
      poner({ x: izq, w: Math.max(antes.x + antes.w, destino.x + destino.w) - izq });
      recoge.current = window.setTimeout(() => {
        el.dataset.fluye = "recoge";
        poner(destino);
      }, GOTA_ESTIRA_MS);
    } else {
      poner(destino); // ya estaba colocado: viaja
    }
    cont.dataset.indicador = "";

    // Si algo cambia de tamaño (ventana, una cuenta que llega, tipografía que termina de cargar) se recoloca sin viajar, pero
    // solo si la opción marcada quedó en otro lugar que el último puesto. El observador avisa una vez al empezar, con la
    // medida de ESE momento: si nada cambió coincide y no se toca (no corta el viaje en curso); si la tipografía cargó entre la
    // medida de arriba y ese primer aviso, no coincide y se corrige. Ignorarlo a ciegas dejaba la píldora corrida en la
    // primera carga sin la fuente en caché (2026-10-07, Análisis: 24 px a la izquierda, tapando la cuenta de la vecina).
    // Contra el DESTINO, no contra lo último puesto: mientras la gota fluye, lo puesto es el tramo estirado.
    let objetivo = destino;
    const ro = new ResizeObserver(() => {
      const a = marcada();
      if (!a) return;
      const p: Posicion = { x: a.offsetLeft, w: a.offsetWidth };
      if (p.x === objetivo.x && p.w === objetivo.w) return;
      objetivo = p;
      window.clearTimeout(recoge.current);
      delete el.dataset.fluye;
      sinViaje(p);
    });
    ro.observe(cont);
    // Todas las opciones, no solo la marcada: si una de antes se ensancha, la marcada se corre sin cambiar de tamaño (y la
    // fila no crece si ya llena el ancho y se desliza, como en el celular). Por su borde, que es lo que mide `offsetWidth`:
    // la caja de contenido (lo que mira el observador si no se le dice) no cambia cuando cambia el relleno.
    for (const opcion of cont.children) if (opcion !== el) ro.observe(opcion, { box: "border-box" });
    return () => {
      ro.disconnect();
      window.clearTimeout(recoge.current);
    };
  }, [activa, id, selector, variante]);

  // Al desmontarse guarda dónde estaba, por si la pantalla se vuelve a montar enseguida.
  useEffect(
    () => () => {
      if (ultima.current) memoria.set(id, { ...ultima.current, t: Date.now() });
    },
    [id],
  );

  return <span ref={ref} aria-hidden className={`cmp-ind ${VARIANTE[variante]} ${className}`} />;
}
