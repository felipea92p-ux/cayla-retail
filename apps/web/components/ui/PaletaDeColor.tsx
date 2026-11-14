"use client";

import { useState, type KeyboardEvent, type PointerEvent } from "react";
import {
  hexAHsv,
  hsvAHex,
  matizEnLaBarra,
  matizPuro,
  moverMatiz,
  moverPunto,
  nombreDelMatiz,
  recortar,
  textoDelPunto,
  tonoEnElCuadro,
  type Hsv,
} from "@/lib/paleta-color";

// La paleta con todos los colores (ADR-0663, maqueta `docs/maquetas/colores-desde-la-foto-2026-11/`): para un color que todavía
// no está en la carta. El cuadro mueve la intensidad (de izquierda a derecha) y la claridad (de arriba abajo) sobre el matiz que
// elige la barra de abajo, como en un programa de diseño. El punto y la perilla se arrastran con el mouse o el dedo, o se mueven
// con las flechas (Shift: pasos grandes). Lo que entrega es un #hex, igual que el campo de #hex o RGB que va a su lado: los dos
// mueven el mismo tono.
//
// Sin tono todavía (`hex` en null) el punto se dibuja vacío y nada se elige hasta que la persona toca el cuadro o una flecha: la
// paleta nunca pone un color de relleno por su cuenta (el beige que se guardaba sin que nadie lo notara, ver `SelectorColor`).
//
// Los degradados son el color mismo y no cambian con el tema (`data-color-dato`): sus estilos viven en `app/estilos/paleta-color.css`.

/** Donde arranca la paleta si todavía no hay tono: un matiz cálido a media intensidad (solo dibuja; no elige). */
const SIN_TONO: Hsv = { h: 30, s: 0.5, v: 0.8 };

export function PaletaDeColor({
  hex,
  onHex,
  deshabilitado = false,
  className = "",
}: {
  /** El tono elegido (`#rrggbb`), o null si todavía no hay. */
  hex: string | null;
  onHex: (hex: string) => void;
  deshabilitado?: boolean;
  className?: string;
}) {
  const [hsv, setHsv] = useState<Hsv>(() => (hex ? hexAHsv(hex) : null) ?? SIN_TONO);
  const [ultimoHex, setUltimoHex] = useState(hex);
  // El tono llegó de afuera (el campo de #hex, «Usar el tono de la foto»): la paleta lo sigue. Si es el mismo que ella acaba de
  // entregar no se recalcula, para no perder el matiz de un gris o la intensidad del negro (ver `hexAHsv`).
  if (hex !== ultimoHex) {
    setUltimoHex(hex);
    if (hex && hex.toLowerCase() !== hsvAHex(hsv)) {
      const desdeAfuera = hexAHsv(hex, hsv);
      if (desdeAfuera) setHsv(desdeAfuera);
    }
  }

  const conTono = hex !== null && hexAHsv(hex) !== null;
  const actual = hsvAHex(hsv);

  function poner(nuevo: Hsv) {
    if (deshabilitado) return;
    const h = hsvAHex(nuevo);
    setHsv(nuevo);
    setUltimoHex(h);
    onHex(h);
  }

  // Arrastrar: la zona captura el puntero, así el tono sigue al mouse aunque salga del cuadro (y se queda en su borde). El foco
  // pasa a su punto o su perilla, para seguir con las flechas.
  function arrastre(mover: (x: number, y: number) => Hsv) {
    const leer = (e: PointerEvent<HTMLDivElement>) => {
      const r = e.currentTarget.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      poner(mover(recortar((e.clientX - r.left) / r.width), recortar((e.clientY - r.top) / r.height)));
    };
    return {
      onPointerDown: (e: PointerEvent<HTMLDivElement>) => {
        if (deshabilitado || e.button !== 0) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        leer(e);
        e.currentTarget.querySelector<HTMLElement>('[role="slider"]')?.focus({ preventScroll: true });
      },
      onPointerMove: (e: PointerEvent<HTMLDivElement>) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) leer(e);
      },
      onPointerUp: (e: PointerEvent<HTMLDivElement>) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
      },
    };
  }

  // Una flecha es de la paleta: no sube (ni desplaza la hoja ni pasa de registro). Las demás teclas siguen su camino.
  function flechas(mover: (hsv: Hsv, tecla: string, grande: boolean) => Hsv | null) {
    return (e: KeyboardEvent<HTMLSpanElement>) => {
      if (deshabilitado) return;
      const nuevo = mover(hsv, e.key, e.shiftKey);
      if (!nuevo) return;
      e.preventDefault();
      e.stopPropagation();
      poner(nuevo);
    };
  }

  return (
    <div className={`paleta-color ${className}`} data-sin-arrastre data-deshabilitada={deshabilitado || undefined}>
      <div
        className="paleta-cuadro"
        data-color-dato
        style={{ "--paleta-matiz": matizPuro(hsv.h) } as React.CSSProperties}
        {...arrastre((x, y) => tonoEnElCuadro(hsv, x, y))}
      >
        <span
          role="slider"
          tabIndex={deshabilitado ? -1 : 0}
          aria-label="Intensidad y claridad del tono. Muévelo con las flechas"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(hsv.v * 100)}
          aria-valuetext={conTono ? textoDelPunto(hsv) : "Sin tono elegido"}
          aria-disabled={deshabilitado || undefined}
          className="paleta-punto"
          data-vacio={conTono ? undefined : true}
          style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: conTono ? actual : undefined }}
          onKeyDown={flechas(moverPunto)}
        />
      </div>
      <div className="paleta-matiz" data-color-dato {...arrastre((x) => matizEnLaBarra(hsv, x))}>
        <span
          role="slider"
          tabIndex={deshabilitado ? -1 : 0}
          aria-label="Matiz. Muévelo con las flechas"
          aria-valuemin={0}
          aria-valuemax={359}
          aria-valuenow={Math.round(hsv.h)}
          aria-valuetext={`Matiz: ${nombreDelMatiz(hsv.h)}`}
          aria-disabled={deshabilitado || undefined}
          className="paleta-perilla"
          style={{ left: `${(hsv.h / 360) * 100}%`, background: matizPuro(hsv.h) }}
          onKeyDown={flechas(moverMatiz)}
        />
      </div>
    </div>
  );
}
