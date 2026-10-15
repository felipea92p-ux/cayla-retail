"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icono } from "../Icono";

// El aviso corto de abajo («Guardado en tus favoritos.», maqueta `toastW`) para lo que pasa sin cambiar de página: el corazón y
// «Avísame». Es el mismo `.w-aviso` de la cuenta (cuenta.css, cargado en toda la tienda): entra, se queda 3,4 s y se va solo. Cada
// mensaje nuevo lo vuelve a empezar (su `key`). Con «✓» si salió bien; sin él, si dice por qué no. Va colgado del `body`: un botón
// vive dentro de una tarjeta o de un carril que se desliza, y el aviso tiene que quedar fijo abajo de la pantalla, no de la tarjeta.
// Hay uno por botón, pero se ve uno a la vez: el que aparece le avisa a los demás (un evento de la ventana) y esos se van.
const DURACION_MS = 3600;
const EVENTO = "tienda-aviso-breve";

export function useAvisoBreve() {
  const yo = useId();
  const [aviso, setAviso] = useState<{ id: number; texto: string; bien: boolean } | null>(null);
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

  function mostrar(texto: string, bien: boolean) {
    if (reloj.current) clearTimeout(reloj.current);
    window.dispatchEvent(new CustomEvent(EVENTO, { detail: yo }));
    setAviso((a) => ({ id: (a?.id ?? 0) + 1, texto, bien }));
    reloj.current = setTimeout(() => setAviso(null), DURACION_MS);
  }

  // Solo aparece después de un toque (en el navegador): ahí el `body` ya existe.
  const elemento =
    aviso && typeof document !== "undefined"
      ? createPortal(
          <div key={aviso.id} className="w-aviso" role="status">
            {aviso.bien && <Icono nombre="check" />}
            <span>{aviso.texto}</span>
          </div>,
          document.body,
        )
      : null;

  return { aviso: elemento, mostrar };
}
