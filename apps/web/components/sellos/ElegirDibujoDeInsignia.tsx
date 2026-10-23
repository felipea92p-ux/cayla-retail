"use client";

import { useRef, type KeyboardEvent } from "react";
import { DIBUJOS_ELEGIBLES, NOMBRE_DEL_DIBUJO, dibujoDeInsignia, type DibujoDeInsignia } from "@cayla-retail/shared/insignias-visual";
import { DibujoInsignia } from "@/components/sellos/DibujoInsignia";

/* ====================================================================
   El dibujo de una insignia (ADR-0490, Felipe 2026-10-23): se elige al crearla o después, en Catálogo ▸ Insignias. Sin elegir, el dibujo
   sale del nombre —«Halloween» es la calabaza, «Aniversario CAYLA» el pastel— como siempre; elegir uno manda sobre el nombre.

   Es un grupo de opciones de radio (una a la vez, flechas para moverse, Espacio o Enter para elegir): primero «Según el nombre», que muestra
   qué dibujo saldría con lo escrito hasta ahora, y después los dibujos, solo con su figura y su nombre al pasar o al leer. Cada uno pinta
   con los colores del tema: el trazo del color del texto y lo recortado del color de la superficie.
   ==================================================================== */

type Opcion = DibujoDeInsignia | null;
const OPCIONES: readonly Opcion[] = [null, ...DIBUJOS_ELEGIBLES];

export function ElegirDibujoDeInsignia({
  valor,
  onValor,
  nombre,
  idEtiqueta,
  deshabilitado = false,
}: {
  /** El dibujo elegido; `null` = según el nombre. */
  valor: DibujoDeInsignia | null;
  onValor: (v: DibujoDeInsignia | null) => void;
  /** Lo que lleva escrito de nombre: «Según el nombre» muestra lo que saldría con él. */
  nombre: string;
  /** El id de la etiqueta visible del campo (`aria-labelledby`). */
  idEtiqueta?: string;
  deshabilitado?: boolean;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const segunElNombre = dibujoDeInsignia({ nombre });
  const indiceActual = OPCIONES.indexOf(valor);

  // Flechas, Inicio y Fin: mueven la elección (y el foco) como en cualquier grupo de opciones de radio.
  function alTeclear(e: KeyboardEvent<HTMLDivElement>) {
    const paso = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    const destino = e.key === "Home" ? 0 : e.key === "End" ? OPCIONES.length - 1 : paso ? (indiceActual + paso + OPCIONES.length) % OPCIONES.length : -1;
    if (destino < 0) return;
    e.preventDefault();
    onValor(OPCIONES[destino]);
    refs.current[destino]?.focus();
  }

  const clase = (marcado: boolean) =>
    `relative flex items-center justify-center rounded-lg border bg-papel text-tinta transition-colors duration-200 ease-cayla disabled:opacity-50 ${
      marcado ? "border-tinta ring-1 ring-tinta" : "border-sand hover:border-taupe"
    }`;

  return (
    <div role="radiogroup" aria-labelledby={idEtiqueta} onKeyDown={alTeclear} className="space-y-1.5" data-campo="dibujo">
      <button
        type="button"
        role="radio"
        aria-checked={valor === null}
        tabIndex={indiceActual === 0 ? 0 : -1}
        ref={(el) => {
          refs.current[0] = el;
        }}
        disabled={deshabilitado}
        onClick={() => onValor(null)}
        className={`${clase(valor === null)} h-11 w-full justify-start gap-2.5 px-3 text-left`}
      >
        <DibujoInsignia clave={segunElNombre} className="h-6 w-6 shrink-0" />
        <span className="shrink-0 whitespace-nowrap text-[13.5px] font-medium">Según el nombre</span>
        <span className="ml-auto truncate text-xs text-taupe">{nombre.trim() ? NOMBRE_DEL_DIBUJO[segunElNombre] : "escribe el nombre"}</span>
      </button>
      <div className="grid gap-1.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(44px, 1fr))" }}>
        {DIBUJOS_ELEGIBLES.map((clave, i) => (
          <button
            key={clave}
            type="button"
            role="radio"
            aria-checked={valor === clave}
            aria-label={NOMBRE_DEL_DIBUJO[clave]}
            title={NOMBRE_DEL_DIBUJO[clave]}
            tabIndex={indiceActual === i + 1 ? 0 : -1}
            ref={(el) => {
              refs.current[i + 1] = el;
            }}
            disabled={deshabilitado}
            onClick={() => onValor(clave)}
            className={`${clase(valor === clave)} aspect-square min-h-11`}
          >
            <DibujoInsignia clave={clave} className="h-6 w-6" />
          </button>
        ))}
      </div>
      <p className="text-xs text-taupe" aria-live="polite">
        {valor ? `Dibujo: ${NOMBRE_DEL_DIBUJO[valor]}.` : "Sin elegir: el dibujo sale del nombre."}
      </p>
    </div>
  );
}
