"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { bordeDeMuestra, fondoDeMuestra } from "@/lib/colores-familias";
import { ETIQUETA_COMBINA, textoDelSenalado, type Companero, type FichaDelColor as Ficha } from "@/lib/ficha-del-color";

export { ETIQUETA_COMBINA };

// La ficha de un color a la vista (ADR-0316; Felipe 2026-10-10): «Combina bien con» y los compañeros como círculos; el nombre del
// compañero sale al pasar el mouse o al tocarlo (en la tablet no hay hover), siempre en el mismo lugar y con alto fijo, para
// que nada salte bajo el mouse (ADR-0185). Es UNA pieza para tres lugares: el pie de la carta de Nuevo producto (`forma="linea"`:
// un renglón con la primera frase al lado), la vista rápida de Catálogo (`forma="bloque"`: los círculos y, tras un toque en
// «¿Por qué?», la frase entera; nunca a la vista por defecto, ley 6 de Formidable) y la hoja de Vender (`forma="circulos"`: solo
// los círculos con la etiqueta que el bloque le dé —«En estos colores:»—, sin «¿Por qué?»: ahí el porqué es el de cada prenda).
// Solo tokens: el color del círculo es DATO (`data-color-dato`, ADR-0336) y no cambia en oscuro. Sin ficha no se dibuja nada.
//
// Con stock de la sede (`companero.aqui`), un compañero que no cuelga aquí se ve apagado y su nombre dice «no hay aquí»; uno que
// cuelga dice «hay en el piso» (no cuántas: ese número suma prendas de cualquier categoría y responde otra pregunta, Formidable
// 2026-10-10). Oficio (Formidable 2026-10-10): el dibujo sigue de 20 px pero el área que se toca es de 28 px con mouse y 36 con
// dedo (`after:` transparente + más separación con dedo); un solo círculo entra al tabulador y las flechas recorren los demás.

type Props = {
  ficha: Ficha | null;
  forma?: "linea" | "bloque" | "circulos";
  /** Lo que encabeza los círculos; por defecto, «Combina bien con». */
  etiqueta?: string;
  className?: string;
};

export function FichaDelColor({ ficha, forma = "bloque", etiqueta = ETIQUETA_COMBINA, className = "" }: Props) {
  const [senalado, setSenalado] = useState<Companero | null>(null);
  const [abierta, setAbierta] = useState(false);
  const circulosRef = useRef<HTMLSpanElement>(null);
  if (!ficha) return null;
  const { companeros, primeraFrase, descripcion } = ficha;
  if (companeros.length === 0 && !descripcion) return null;

  const nombreDe = (c: Companero) => (c.aqui === null ? c.nombre : c.aqui > 0 ? `${c.nombre} · hay en el piso` : `${c.nombre} · no hay aquí`);
  const enfocable = forma !== "linea";
  // Flechas entre los círculos (un solo tabulador: el primero entra, las flechas recorren; Home/End a los extremos).
  const conFlechas = (e: KeyboardEvent<HTMLSpanElement>) => {
    if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(e.key)) return;
    const nodos = [...(circulosRef.current?.querySelectorAll<HTMLElement>("[data-circulo]") ?? [])];
    const i = nodos.indexOf(e.target as HTMLElement);
    if (i < 0) return;
    e.preventDefault();
    const j = e.key === "Home" ? 0 : e.key === "End" ? nodos.length - 1 : (i + (e.key === "ArrowRight" ? 1 : -1) + nodos.length) % nodos.length;
    nodos[j]?.focus();
  };
  const circulos = companeros.length > 0 && (
    // `flex-wrap`: en la franja del celular (foto chica + datos) los seis círculos no caben en una línea y bajan, nunca se cortan.
    <span className={`${forma === "linea" ? "inline-flex" : "flex flex-wrap"} items-center gap-x-1.5 gap-y-1`} onMouseLeave={() => setSenalado(null)}>
      <span className="shrink-0 text-tinta">{etiqueta}</span>
      <span ref={circulosRef} className="inline-flex items-center gap-1 pointer-coarse:gap-4" role="group" aria-label={etiqueta} onKeyDown={conFlechas}>
        {companeros.map((c, i) => (
          // En el pie de la carta (`linea`, `aria-hidden` por diseño) los círculos no entran al tabulador: la carta ya anuncia cada color.
          <Circulo key={c.codigo} companero={c} nombre={nombreDe(c)} activo={senalado?.codigo === c.codigo} tabIndex={enfocable && i === 0 ? 0 : -1} onSenalar={setSenalado} />
        ))}
      </span>
      {/* El nombre del compañero señalado, siempre en el mismo sitio y SIEMPRE con un nodo de texto (un espacio duro si no hay
          ninguno): vaciarlo al perder el foco hacía que la trampa de foco del diálogo devolviera el Tab a la hoja (caos
          2026-10-10, TEC-01; `textoDelSenalado`). Vacío ocupa lo mismo (alto fijo, ADR-0185). */}
      <span aria-live="polite" className="min-w-0 truncate text-tinta/70 dark:text-tinta/75">
        {textoDelSenalado(senalado ? nombreDe(senalado) : null)}
      </span>
    </span>
  );

  if (forma === "linea") {
    return (
      <span className={`inline-flex min-w-0 items-center gap-2 ${className}`}>
        {circulos}
        {!senalado && primeraFrase && <span className="min-w-0 truncate text-tinta/55">{companeros.length > 0 ? `· ${primeraFrase}` : primeraFrase}</span>}
      </span>
    );
  }

  if (forma === "circulos") {
    return circulos ? <div className={`flex min-h-7 items-center text-[12.5px] leading-snug ${className}`}>{circulos}</div> : null;
  }

  return (
    <div className={`text-[12.5px] leading-snug ${className}`}>
      {circulos && <p className="flex min-h-6 items-center">{circulos}</p>}
      {descripcion && (
        <>
          <button
            type="button"
            onClick={() => setAbierta((v) => !v)}
            aria-expanded={abierta}
            className="btn-cayla btn-enlace mt-0.5 inline-flex min-h-7 items-center !px-0 text-[12px] pointer-coarse:min-h-11"
          >
            {abierta ? "Cerrar" : "¿Por qué?"}
          </button>
          {abierta && <p className="anim-revelar mt-1 text-tinta/75">{descripcion}</p>}
        </>
      )}
    </div>
  );
}

/** Un compañero: círculo de 20 px con su color y un área de toque mayor. Hover, foco, toque y Enter lo señalan (un toque no lo suelta:
 *  en la tablet el toque dispara primero el «mouse encima» y un toggle lo apagaría en el acto); se suelta al señalar otro o al salir. */
function Circulo({ companero, nombre, activo, tabIndex, onSenalar }: { companero: Companero; nombre: string; activo: boolean; tabIndex: 0 | -1; onSenalar: (c: Companero | null) => void }) {
  const apagado = companero.aqui === 0;
  const teclado = (e: KeyboardEvent<HTMLSpanElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSenalar(companero);
    }
  };
  return (
    <span
      role="button"
      tabIndex={tabIndex}
      data-circulo
      aria-label={nombre}
      aria-pressed={activo}
      data-color-dato
      onMouseEnter={() => onSenalar(companero)}
      onFocus={() => onSenalar(companero)}
      onBlur={() => onSenalar(null)}
      onClick={() => onSenalar(companero)}
      onKeyDown={teclado}
      className={`relative inline-block h-5 w-5 shrink-0 cursor-default rounded-full border border-tinta/20 transition-transform duration-150 after:absolute after:-inset-1 after:rounded-full after:content-[''] pointer-coarse:after:-inset-2 focus-visible:outline-2 focus-visible:outline-tinta focus-visible:outline-offset-2 ${activo ? "scale-125 ring-2 ring-tinta/30 ring-offset-1 ring-offset-crema" : ""} ${apagado ? "opacity-40" : ""}`}
      style={{ background: fondoDeMuestra(companero.hex, companero.familiaColor, companero.tipo) ?? "transparent", borderColor: bordeDeMuestra(companero.hex) }}
    />
  );
}
