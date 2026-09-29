"use client";

import type { CampoDeGuia, EstadoCampo } from "@/lib/guia-campos";

// Las piezas visuales de «el hilo» (ADR-0284): la marca del título de un campo, la etiqueta «Sigue aquí» y la lista «Falta:» del
// pie de cada paso. Sus estilos viven en `app/estilos/alta-guia.css`; aquí solo se decide qué se dice y cómo se lee con lector
// de pantalla.

const DICE: Record<EstadoCampo, string | null> = {
  hecho: "Listo: ",
  ahora: "Sigue: ",
  falta: "Falta: ",
  opcional: null,
};

/** El círculo a la izquierda del título de un campo. Se vuelve a montar (y por eso vuelve a animar) solo cuando cambia su estado. */
export function MarcaCampo({ estado }: { estado: EstadoCampo }) {
  return (
    <span key={estado} className="hilo-marca" data-estado={estado} aria-hidden>
      {estado === "hecho" && (
        <svg viewBox="0 0 18 18" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <path className="hilo-tilde" pathLength={14} d="M5 9.4l2.7 2.7L13 6.4" />
        </svg>
      )}
    </span>
  );
}

/** Lo que un lector de pantalla oye antes del título («Sigue: Marca y proveedor»). Los videntes lo leen en la marca. */
export function VozDelEstado({ estado }: { estado: EstadoCampo }) {
  const texto = DICE[estado];
  return texto ? <span className="sr-only">{texto}</span> : null;
}

/** «Sigue aquí»: solo el campo que sigue la lleva. */
export function EtiquetaAhora() {
  return <span className="hilo-etiqueta">Sigue aquí</span>;
}

/**
 * «Falta: Marca y proveedor · Tejido · Patrón» al pie de un paso. Cada cosa es un botón que lleva a su campo (lo hace el
 * formulario: `onIr`). Con solo sugerencias (los colores) no dice «Falta» —crear ya se puede— sino «Sin elegir» y avisa que se
 * puede seguir así.
 */
export function FaltanDelPaso<T extends CampoDeGuia>({ faltan, ahora, onIr }: { faltan: readonly T[]; ahora: string | null; onIr: (c: T) => void }) {
  const soloSugeridas = faltan.every((c) => !c.requerido);
  const cabeza = soloSugeridas ? "Sin elegir" : faltan.length === 1 ? "Falta" : "Faltan";
  return (
    <div className="mr-auto flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5 text-[12.5px] text-taupe">
      <span>{cabeza}:</span>
      {faltan.map((c) => (
        <button key={c.id} type="button" onClick={() => onIr(c)} title={c.pendiente} className="hilo-chip">
          <MarcaCampo estado={c.id === ahora ? "ahora" : c.requerido ? "falta" : "opcional"} />
          {c.nombre}
        </button>
      ))}
      {soloSugeridas && <span>· puedes seguir así</span>}
    </div>
  );
}
