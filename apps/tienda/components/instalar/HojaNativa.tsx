"use client";

import { useEffect, useRef, type PointerEvent, type ReactNode } from "react";

/**
 * La hoja que sube desde abajo (ADR-0431), hecha con el `<dialog>` del navegador: él pone el velo, deja el fondo quieto para el lector
 * de pantalla, atrapa el foco y entrega el Escape; aquí solo se sube y se cierra al tocar fuera. Se monta ya abierta y se desmonta al
 * cerrar: quien la usa decide cuándo.
 *
 * `arrastrable` (los filtros de color y talla, ADR-0512): el asa se puede arrastrar hacia abajo con el dedo; si baja más de un tercio de la
 * hoja, o de un tirón, la hoja se va; si no, vuelve a su lugar. `claseHoja`: una clase más para la hoja, cuando la pieza de adentro la viste
 * distinto (un cuerpo que se desplaza con su pie fijo).
 */
export function HojaNativa({
  etiqueta,
  alCerrar,
  arrastrable = false,
  claseHoja,
  children,
}: {
  etiqueta: string;
  alCerrar: () => void;
  arrastrable?: boolean;
  claseHoja?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const hoja = useRef<HTMLDivElement>(null);
  const toque = useRef({ activo: false, y0: 0, t0: 0, dy: 0, alto: 1 });
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);

  // ---- Arrastrar desde el asa (solo `arrastrable`)
  const bajar = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button > 0 || !hoja.current) return;
    toque.current = { activo: true, y0: e.clientY, t0: e.timeStamp, dy: 0, alto: hoja.current.offsetHeight || 1 };
    hoja.current.style.transition = "none";
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const mover = (e: PointerEvent<HTMLDivElement>) => {
    const t = toque.current;
    if (!t.activo || !hoja.current) return;
    t.dy = Math.max(0, e.clientY - t.y0);
    hoja.current.style.transform = `translateY(${t.dy}px)`;
    // El velo se aclara con la hoja (el `::backdrop` hereda esta variable de su <dialog>).
    ref.current?.style.setProperty("--t-arrastre-velo", String(Math.max(0, 1 - t.dy / t.alto)));
  };
  const soltar = (e: PointerEvent<HTMLDivElement>) => {
    const t = toque.current;
    if (!t.activo || !hoja.current) return;
    t.activo = false;
    hoja.current.style.transition = "";
    const velocidad = t.dy / Math.max(1, e.timeStamp - t.t0); // px por ms
    if (t.dy > t.alto / 3 || (velocidad > 0.5 && t.dy > 24)) {
      alCerrar();
      return;
    }
    hoja.current.style.transform = "";
    ref.current?.style.removeProperty("--t-arrastre-velo");
  };

  return (
    <dialog
      ref={ref}
      className="t-inst"
      aria-label={etiqueta}
      onCancel={(e) => {
        e.preventDefault();
        alCerrar();
      }}
      // Tocar fuera de la hoja (el velo) cierra: el destino del clic es el propio <dialog>, no su contenido.
      onClick={(e) => {
        if (e.target === e.currentTarget) alCerrar();
      }}
    >
      {/* `autoFocus` en la hoja misma: el diálogo enfoca lo primero que encuentra, y sobre el botón principal dibujaba un aro rojo. */}
      <div ref={hoja} className={`t-inst-hoja${claseHoja ? ` ${claseHoja}` : ""}`} tabIndex={-1} autoFocus>
        <div
          className="t-inst-asa"
          aria-hidden="true"
          data-arrastra={arrastrable ? "" : undefined}
          onPointerDown={arrastrable ? bajar : undefined}
          onPointerMove={arrastrable ? mover : undefined}
          onPointerUp={arrastrable ? soltar : undefined}
          onPointerCancel={arrastrable ? soltar : undefined}
        />
        {children}
      </div>
    </dialog>
  );
}
