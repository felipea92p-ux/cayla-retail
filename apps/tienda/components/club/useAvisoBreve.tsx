"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icono } from "../Icono";

// El aviso corto de abajo («Guardado en tus favoritos.», maqueta `toastW`) para lo que pasa sin cambiar de página: el corazón y
// «Avísame». Es el mismo `.w-aviso` de la cuenta (cuenta.css, cargado en toda la tienda): entra, se queda 3,4 s y se va solo. Cada
// mensaje nuevo lo vuelve a empezar (su `key`). Con «✓» si salió bien; sin él, si dice por qué no. Va colgado del `body`: un botón
// vive dentro de una tarjeta o de un carril que se desliza, y el aviso tiene que quedar fijo abajo de la pantalla, no de la tarjeta.
// Hay uno por botón, pero se ve uno a la vez: el que aparece le avisa a los demás (un evento de la ventana) y esos se van.
const DURACION_MS = 5000;
const EVENTO = "tienda-aviso-breve";

export function useAvisoBreve() {
  const yo = useId();
  const [aviso, setAviso] = useState<{ id: number; texto: string; bien: boolean; destacado: boolean; bajo: { top: number; right: number } | null } | null>(
    null,
  );
  const reloj = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const otroAparecio = (e: Event) => {
      if ((e as CustomEvent<string>).detail === yo) return;
      if (reloj.current) clearTimeout(reloj.current);
      setAviso(null);
    };
    window.addEventListener(EVENTO, otroAparecio);
    return () => {
      window.removeEventListener(EVENTO, otroAparecio);
      if (reloj.current) clearTimeout(reloj.current);
    };
  }, [yo]);

  // `destacado`: el aviso va arriba y más grande (lo usa la campanita para «ya llegó la talla que esperabas»). Por defecto, abajo.
  // `junto`: el icono que lo origina (la campanita de la cabecera). Si se pasa, el aviso queda FIJO justo debajo de la cabecera, sin
  // importar el scroll, y con su borde derecho alineado al borde derecho del icono. La altura de la cabecera es la del elemento mismo
  // (`offsetHeight`), que no cambia al bajar la página; el ancho del icono se mide con `clientWidth` (sin la barra de desplazamiento).
  function mostrar(texto: string, bien: boolean, destacado = false, junto: HTMLElement | null = null) {
    if (reloj.current) clearTimeout(reloj.current);
    window.dispatchEvent(new CustomEvent(EVENTO, { detail: yo }));
    const cabecera = junto?.closest("header") ?? null;
    const bajo =
      junto && cabecera
        ? {
            top: cabecera.offsetHeight * 1.2,
            right: Math.max(0, document.documentElement.clientWidth - junto.getBoundingClientRect().right),
          }
        : null;
    setAviso((a) => ({ id: (a?.id ?? 0) + 1, texto, bien, destacado, bajo }));
    reloj.current = setTimeout(() => setAviso(null), DURACION_MS);
  }

  // Solo aparece después de un toque (en el navegador): ahí el `body` ya existe.
  const elemento =
    aviso && typeof document !== "undefined"
      ? createPortal(
          <div
            key={aviso.id}
            className={aviso.bajo ? "w-aviso w-aviso-destacado w-aviso-bajo" : aviso.destacado ? "w-aviso w-aviso-destacado" : "w-aviso"}
            style={aviso.bajo ? { top: aviso.bajo.top, right: aviso.bajo.right } : undefined}
            role="status"
          >
            {aviso.bien && <Icono nombre="check" />}
            <span>{aviso.texto}</span>
          </div>,
          document.body,
        )
      : null;

  return { aviso: elemento, mostrar };
}
