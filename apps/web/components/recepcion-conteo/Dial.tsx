"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Minus, Plus } from "lucide-react";
import { leerContadas } from "@/lib/recepcion-conteo-reglas";
import { estadoDelDial } from "@/lib/recepcion-dial-reglas";
import { Odometro } from "./Odometro";

// El Dial de una categoría (rediseño «B» de Recibir, Felipe 2026-10-29): el aro se llena con lo contado contra lo que dijeron, con un corte
// por prenda esperada y una perilla que marca hasta dónde se llegó. El aro solo muestra (Felipe pidió quitar el arrastre): el número se toca
// y se escribe con el teclado —Enter o salir de la caja lo deja, Escape lo devuelve, vacío no cambia nada— y el − y el + suman de a una.
// Sumar hace saltar una chispa en la perilla; cuadrar recorre el aro con un brillo y dibuja el visto. Todo una vez, sin rebote (ADR-0136).

const CX = 145;
const R = 105;
const R_EXCESO = 128;

export function Dial({
  contadas,
  dijeron,
  hayConteo,
  minimo,
  nombre,
  onPoner,
}: {
  contadas: number;
  dijeron: number | null;
  hayConteo: boolean;
  /** Lo contado no baja de aquí (lo ya separado o lo que ya entró al stock). */
  minimo: number;
  /** «faltas», en minúsculas: para lo que lee el lector de pantalla. */
  nombre: string;
  /** El número que dejó la persona; `ContarEnvio` lo sube al mínimo y lo reparte entre las líneas. */
  onPoner: (n: number) => void;
}) {
  const e = estadoDelDial(contadas, dijeron, hayConteo);
  const [editando, setEditando] = useState<string | null>(null);
  const caja = useRef<HTMLInputElement>(null);
  const hecho = useRef(false);
  // Las animaciones de respuesta: cada vez que sube lo contado, una chispa; cada vez que pasa a «cuadra», el brillo. Se cuentan durante el
  // dibujo (no en un efecto) y el contador es la llave que reinicia la animación; al montar no hay ninguna.
  const [previo, setPrevio] = useState({ contadas, tono: e.tono, chispa: 0, brillo: 0 });
  if (previo.contadas !== contadas || previo.tono !== e.tono) {
    setPrevio({
      contadas,
      tono: e.tono,
      chispa: previo.chispa + (contadas > previo.contadas ? 1 : 0),
      brillo: previo.brillo + (e.tono === "cuadra" && previo.tono !== "cuadra" ? 1 : 0),
    });
  }

  useEffect(() => {
    if (editando === null || !caja.current || document.activeElement === caja.current) return;
    caja.current.focus();
    caja.current.select();
  }, [editando]);

  function abrir() {
    hecho.current = false;
    setEditando(hayConteo ? String(contadas) : "");
  }
  function dejar(guardar: boolean) {
    if (hecho.current || editando === null) return;
    hecho.current = true;
    const { contadas: n } = leerContadas(editando);
    setEditando(null);
    if (guardar && n !== null && n !== contadas) onPoner(n);
  }

  return (
    <div className={`rc-dial rc-dial--${e.tono}`}>
      <svg viewBox="0 0 290 290" aria-hidden className="rc-dial-aro">
        <circle className="rc-dial-pista" cx={CX} cy={CX} r={R} />
        <circle className="rc-dial-arco" cx={CX} cy={CX} r={R} pathLength={100} style={{ strokeDashoffset: 100 - e.lleno }} />
        {Array.from({ length: e.cortes }, (_, i) => {
          const t = (i / e.cortes) * Math.PI * 2;
          return (
            <line
              key={i}
              className="rc-dial-corte"
              style={{ "--i": i } as React.CSSProperties}
              x1={CX + Math.cos(t) * (R - 11)}
              y1={CX + Math.sin(t) * (R - 11)}
              x2={CX + Math.cos(t) * (R + 11)}
              y2={CX + Math.sin(t) * (R + 11)}
            />
          );
        })}
        {previo.brillo > 0 && <circle key={`b${previo.brillo}`} className="rc-dial-brillo" cx={CX} cy={CX} r={R} pathLength={100} />}
        <circle className="rc-dial-exceso" cx={CX} cy={CX} r={R_EXCESO} pathLength={100} style={{ strokeDashoffset: 100 - e.exceso }} />
        <g className="rc-dial-perilla" style={{ transform: `rotate(${e.angulo}deg)` }}>
          {previo.chispa > 0 && <circle key={`c${previo.chispa}`} className="rc-dial-chispa" cx={CX + R} cy={CX} r={15} />}
          <circle className="rc-dial-perilla-borde" cx={CX + R} cy={CX} r={15} />
          <circle className="rc-dial-perilla-punto" cx={CX + R} cy={CX} r={5} />
        </g>
      </svg>
      {previo.brillo > 0 && <span key={`g${previo.brillo}`} aria-hidden className="rc-dial-halo" />}

      <div className="rc-dial-centro">
        {editando !== null ? (
          <input // unificar-fijo: el número protagonista del Dial se escribe en su lugar, sin caja de campo (Felipe 2026-10-29)
            ref={caja}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={editando}
            placeholder="0"
            aria-label={`Cuántas ${nombre} llegaron`}
            className="rc-dial-caja"
            onChange={(ev) => setEditando(leerContadas(ev.target.value).texto)}
            onBlur={() => dejar(true)}
            onKeyDown={(ev) => {
              if (ev.key === "Enter") {
                ev.preventDefault();
                dejar(true);
              } else if (ev.key === "Escape") {
                ev.preventDefault();
                ev.stopPropagation();
                dejar(false);
              }
            }}
          />
        ) : (
          <button type="button" className="rc-dial-numero" onClick={abrir} aria-label={`Escribir cuántas ${nombre} llegaron (ahora ${contadas})`}>
            <Odometro valor={contadas} />
          </button>
        )}
        <small aria-live="polite">{e.texto}</small>
      </div>
      <span aria-hidden className="rc-dial-visto">
        <Check className="h-5 w-5" />
      </span>

      <button type="button" onClick={() => onPoner(contadas - 1)} disabled={contadas <= minimo} aria-label="Una menos" className="rc-dial-boton rc-dial-boton--menos">
        <Minus aria-hidden className="h-5 w-5" />
      </button>
      <button type="button" onClick={() => onPoner(contadas + 1)} aria-label="Una más" className="rc-dial-boton rc-dial-boton--mas">
        <Plus aria-hidden className="h-5 w-5" />
      </button>
    </div>
  );
}
