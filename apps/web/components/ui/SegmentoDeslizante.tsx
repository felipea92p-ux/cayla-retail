"use client";

import { useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

export type OpcionSegmento = {
  clave: string;
  etiqueta: ReactNode;
  conteo?: number;
  /** Solo en `forma="modo"`: el icono delante de la palabra (16 px). */
  icono?: ReactNode;
  /** Solo en `forma="modo"`: la opción se ve pero no se elige (al 50 %, como un botón); la pantalla decide cuándo. */
  deshabilitada?: boolean;
  /** Solo en `forma="modo"`: la línea que sale al pasar el mouse (`title`). */
  ayuda?: string;
};

/**
 * Segmentado con un «pulgar» que se DESLIZA hasta la opción elegida (ADR-0128), en vez de que el fondo
 * oscuro salte de una a otra: se ve de dónde viene el cambio. Es un `radiogroup` (misma semántica que el
 * filtro de rubro que ya había); en una pantalla angosta se desplaza en horizontal y el pulgar sigue a
 * la opción activa. La primera vez se coloca sin transición (si no, se vería viajar desde 0 al abrir la
 * pantalla, y esa entrada no responde a ninguna acción).
 *
 * Dos formas (ADR-0358, «Pestañas y segmentos», Felipe 2026-10-06):
 * · `forma="modo"`: el segmento de MODO DE VISTA y de ORDEN con estado (Por prenda / Por talla, Acumulado / Por día),
 *   gemelo de `SegmentoEnlaces`: 36 px con piel de caja, la elegida en papel con contorno de tinta, 13,5 px en 500 y las
 *   flechas ← → para pasar de una a otra. Sin pulgar: el contorno marca la elegida. CSS: `.segmento-cayla`.
 * · `forma="campo"` (por defecto): la cara de siempre, para cuando elegir GUARDA un valor de un formulario. Esa cara
 *   no cambia hasta que Felipe decida la familia «campo». Un filtro (deja menos filas) no es ninguna de las dos: es
 *   `pildora-cayla`; y una pestaña (cambia de sección) es `Pestanas`.
 */
export function SegmentoDeslizante({
  opciones,
  valor,
  onCambio,
  etiqueta,
  forma = "campo",
  className = "",
}: {
  opciones: OpcionSegmento[];
  valor: string;
  onCambio: (clave: string) => void;
  etiqueta: string;
  forma?: "campo" | "modo";
  className?: string;
}) {
  if (forma === "modo") return <SegmentoModo opciones={opciones} valor={valor} onCambio={onCambio} etiqueta={etiqueta} className={className} />;
  return <SegmentoCampo opciones={opciones} valor={valor} onCambio={onCambio} etiqueta={etiqueta} className={className} />;
}

type PropsSegmento = { opciones: OpcionSegmento[]; valor: string; onCambio: (clave: string) => void; etiqueta: string; className?: string };

/** El segmento de modo: `radiogroup` con solo la elegida en el orden del Tab y las flechas ← → (patrón APG). */
function SegmentoModo({ opciones, valor, onCambio, etiqueta, className = "" }: PropsSegmento) {
  const grupo = useRef<HTMLDivElement>(null);
  const alTeclear = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const paso = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!paso) return;
    // La siguiente que se puede elegir (salta las deshabilitadas, da la vuelta).
    let destino = -1;
    for (let k = 1; k < opciones.length; k++) {
      const j = (i + paso * k + opciones.length) % opciones.length;
      if (!opciones[j].deshabilitada) {
        destino = j;
        break;
      }
    }
    if (destino < 0) return;
    // La flecha es de este control: un cajón que pasa de registro con ↑ ↓ no debe tomarla también (ADR-0128).
    e.preventDefault();
    e.stopPropagation();
    onCambio(opciones[destino].clave);
    grupo.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[destino]?.focus();
  };
  const hayElegida = opciones.some((o) => o.clave === valor);
  return (
    <div ref={grupo} role="radiogroup" aria-label={etiqueta} className={`segmento-cayla ${className}`}>
      {opciones.map((o, i) => {
        const activa = o.clave === valor;
        return (
          <button
            key={o.clave || "todos"}
            type="button"
            role="radio"
            aria-checked={activa}
            tabIndex={activa || (!hayElegida && i === 0) ? 0 : -1}
            disabled={o.deshabilitada}
            title={o.ayuda}
            onClick={() => onCambio(o.clave)}
            onKeyDown={(e) => alTeclear(e, i)}
            className="segmento-cayla__opcion"
          >
            {o.icono}
            {o.etiqueta}
            {o.conteo != null && <span className="pildora-cayla__n">{o.conteo}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** La cara de campo de formulario (la de siempre, ADR-0128). */
function SegmentoCampo({ opciones, valor, onCambio, etiqueta, className = "" }: PropsSegmento) {
  const contenedor = useRef<HTMLDivElement>(null);
  const [pulgar, setPulgar] = useState<{ x: number; w: number } | null>(null);
  const [listo, setListo] = useState(false);

  useLayoutEffect(() => {
    const cont = contenedor.current;
    const activo = cont?.querySelector<HTMLElement>('[aria-checked="true"]');
    if (!cont || !activo) return;
    const medir = () => setPulgar({ x: activo.offsetLeft, w: activo.offsetWidth });
    medir();
    // Solo el desplazamiento HORIZONTAL de la propia tira (si la opción quedó fuera en celular). Antes era
    // `scrollIntoView`, que también movía la PÁGINA en vertical: si el cambio de opción acortaba lo de abajo y el
    // control quedaba fuera de vista, la página saltaba sola (2026-09-23, ADR-0185).
    const izq = activo.offsetLeft;
    const der = izq + activo.offsetWidth;
    if (izq < cont.scrollLeft) cont.scrollLeft = izq;
    else if (der > cont.scrollLeft + cont.clientWidth) cont.scrollLeft = der - cont.clientWidth;
    const ro = new ResizeObserver(medir);
    ro.observe(activo);
    return () => ro.disconnect();
  }, [valor, opciones]);

  // Activa la transición DESPUÉS del primer pintado con pulgar colocado.
  useLayoutEffect(() => {
    if (!pulgar || listo) return;
    const id = requestAnimationFrame(() => setListo(true));
    return () => cancelAnimationFrame(id);
  }, [pulgar, listo]);

  return (
    <div ref={contenedor} role="radiogroup" aria-label={etiqueta} className={`relative inline-flex max-w-full overflow-x-auto rounded-lg border border-tinta/15 [scrollbar-width:none] ${className}`}>
      {pulgar && (
        <span
          aria-hidden
          className={`absolute inset-y-0 left-0 rounded-[7px] bg-tinta ${listo ? "transition-[transform,width] duration-[340ms] ease-cayla" : ""}`}
          style={{ width: pulgar.w, transform: `translateX(${pulgar.x}px)` }}
        />
      )}
      {opciones.map((o) => {
        const activa = o.clave === valor;
        return (
          <button
            key={o.clave || "todos"}
            type="button"
            role="radio"
            aria-checked={activa}
            onClick={() => onCambio(o.clave)}
            className={`label-cayla relative shrink-0 whitespace-nowrap px-3.5 py-2.5 text-[11px] transition-colors duration-200 ${activa ? "text-crema" : "text-tinta/65 hover:text-rojo"}`}
          >
            {o.etiqueta}
            {o.conteo != null && <span className="ml-1 font-medium tracking-normal opacity-60 dark:opacity-85">{o.conteo}</span>}
          </button>
        );
      })}
    </div>
  );
}
