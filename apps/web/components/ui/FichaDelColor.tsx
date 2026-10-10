"use client";

import { useState, type KeyboardEvent } from "react";
import { bordeDeMuestra, fondoDeMuestra } from "@/lib/colores-familias";
import type { Companero, FichaDelColor as Ficha } from "@/lib/ficha-del-color";

// La ficha de un color a la vista (ADR-0316; Felipe 2026-10-10): «Combínalo con» y los compañeros como círculos; el nombre del
// compañero sale al pasar el mouse o al tocarlo (en la tablet no hay hover), siempre en el mismo lugar y con alto fijo, para
// que nada salte bajo el mouse (ADR-0185). Es UNA pieza para tres lugares: el pie de la carta de Nuevo producto (`forma="linea"`:
// un renglón con la primera frase al lado), «Todo de la prenda» de Vender y la vista rápida de Catálogo (`forma="bloque"`: los
// círculos y, tras un toque en «¿Por qué?», la frase entera; nunca a la vista por defecto, ley 6 de Formidable).
// Solo tokens: el color del círculo es DATO (`data-color-dato`, ADR-0336) y no cambia en oscuro. Sin ficha no se dibuja nada.
//
// Con stock de la sede (`companero.aqui`), un compañero que no cuelga aquí se ve apagado y su nombre dice «no hay aquí»: en el
// mostrador solo sirve sugerir un color que de verdad se puede ofrecer.

/** Cómo se presenta la lista de compañeros. Un solo lugar para cambiarla (Felipe, 2026-10-10: «si hay mejor expresión, búscala»). */
export const ETIQUETA_COMBINA = "Combínalo con";

type Props = {
  ficha: Ficha | null;
  forma?: "linea" | "bloque";
  className?: string;
};

export function FichaDelColor({ ficha, forma = "bloque", className = "" }: Props) {
  const [senalado, setSenalado] = useState<Companero | null>(null);
  const [abierta, setAbierta] = useState(false);
  if (!ficha) return null;
  const { companeros, primeraFrase, descripcion } = ficha;
  if (companeros.length === 0 && !descripcion) return null;

  const nombreDe = (c: Companero) => (c.aqui === null ? c.nombre : c.aqui > 0 ? `${c.nombre} · ${c.aqui} aquí` : `${c.nombre} · no hay aquí`);
  const circulos = companeros.length > 0 && (
    <span className="inline-flex items-center gap-1.5" onMouseLeave={() => setSenalado(null)}>
      <span className="shrink-0 text-tinta">{ETIQUETA_COMBINA}</span>
      <span className="inline-flex items-center gap-1" role="list" aria-label={companeros.map(nombreDe).join(", ")}>
        {companeros.map((c) => (
          // En el pie de la carta (`linea`, `aria-hidden` por diseño) los círculos no entran al tabulador: la carta ya anuncia cada color.
          <Circulo key={c.codigo} companero={c} activo={senalado?.codigo === c.codigo} enfocable={forma !== "linea"} onSenalar={setSenalado} />
        ))}
      </span>
      {/* El nombre del compañero señalado, siempre en el mismo sitio; vacío ocupa lo mismo (alto fijo). */}
      <span aria-live="polite" className="min-w-0 truncate text-tinta/70 dark:text-tinta/75">
        {senalado ? nombreDe(senalado) : null}
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

  return (
    <div className={`text-[12.5px] leading-snug ${className}`}>
      {circulos && <p className="flex min-h-6 items-center">{circulos}</p>}
      {descripcion && (
        <>
          <button type="button" onClick={() => setAbierta((v) => !v)} aria-expanded={abierta} className="btn-cayla btn-enlace mt-0.5 !px-0 text-[12px]">
            {abierta ? "Cerrar" : "¿Por qué?"}
          </button>
          {abierta && <p className="anim-revelar mt-1 text-tinta/75">{descripcion}</p>}
        </>
      )}
    </div>
  );
}

/** Un compañero: círculo de 20 px con su color. Hover, foco y toque lo señalan; un segundo toque lo suelta. */
function Circulo({ companero, activo, enfocable, onSenalar }: { companero: Companero; activo: boolean; enfocable: boolean; onSenalar: (c: Companero | null) => void }) {
  const apagado = companero.aqui === 0;
  const teclado = (e: KeyboardEvent<HTMLSpanElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSenalar(activo ? null : companero);
    }
  };
  return (
    <span
      role="listitem"
      tabIndex={enfocable ? 0 : -1}
      aria-label={companero.nombre}
      data-color-dato
      onMouseEnter={() => onSenalar(companero)}
      onFocus={() => onSenalar(companero)}
      onBlur={() => onSenalar(null)}
      onClick={() => onSenalar(activo ? null : companero)}
      onKeyDown={teclado}
      className={`inline-block h-5 w-5 shrink-0 cursor-default rounded-full border border-tinta/20 transition-transform duration-150 ${activo ? "scale-125 ring-2 ring-tinta/30 ring-offset-1 ring-offset-crema" : ""} ${apagado ? "opacity-40" : ""}`}
      style={{ background: fondoDeMuestra(companero.hex, companero.familiaColor, companero.tipo) ?? "transparent", borderColor: bordeDeMuestra(companero.hex) }}
    />
  );
}
