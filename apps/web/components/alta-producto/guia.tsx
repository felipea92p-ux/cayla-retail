"use client";

import { useLayoutEffect, useRef } from "react";
import { rectangulosChocan, type CampoDeGuia, type EstadoCampo } from "@/lib/guia-campos";

// Las piezas visuales de «el hilo» (ADR-0284): la marca del título de un campo, la palabra «Sigue» y la lista «Falta:» del
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

const CONTROLES_DEL_BLOQUE = "input:not([type='hidden']), textarea, button, [role='switch'], [role='radio'], [role='combobox']";

/** ¿«Sigue» se monta sobre algo del bloque? Se mira cada texto y cada control, porque un título puede partirse en dos líneas y un interruptor vive a la derecha. */
function palabraChoca(palabra: HTMLElement, bloque: HTMLElement): boolean {
  const donde = palabra.getBoundingClientRect();
  const rango = document.createRange();
  const textos = document.createTreeWalker(bloque, NodeFilter.SHOW_TEXT);
  for (let nodo = textos.nextNode(); nodo; nodo = textos.nextNode()) {
    if (palabra.contains(nodo) || !nodo.textContent?.trim() || nodo.parentElement?.closest(".sr-only")) continue;
    rango.selectNodeContents(nodo);
    if ([...rango.getClientRects()].some((r) => rectangulosChocan(donde, r))) return true;
  }
  return [...bloque.querySelectorAll(CONTROLES_DEL_BLOQUE)].some((c) => rectangulosChocan(donde, c.getBoundingClientRect()));
}

/**
 * «Sigue»: solo el campo que sigue la lleva. Sin `flota` va en su lugar (el estado de una tarjeta o de una lista). Con `flota` (el título de un campo guiado)
 * va a la derecha del bloque y fuera de flujo: nada se mueve al aparecer, y si no le cabe se calla: ya lo dicen la marca y el hilo.
 */
export function EtiquetaAhora({ flota = false }: { flota?: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const palabra = ref.current;
    const bloque = flota ? palabra?.closest<HTMLElement>(".hilo-luz, .hilo-fila-in") : null;
    if (!palabra || !bloque) return;
    const medir = () => palabra.toggleAttribute("data-sin-lugar", palabraChoca(palabra, bloque));
    medir();
    const cambia = new ResizeObserver(medir);
    cambia.observe(bloque);
    return () => cambia.disconnect();
  }, [flota]);
  return (
    <span ref={ref} className={`hilo-etiqueta${flota ? " hilo-etiqueta-flota" : ""}`}>
      Sigue
    </span>
  );
}

/**
 * «Falta: Marca y proveedor · Tejido · Patrón» al pie de un paso. Cada cosa es un botón que lleva a su campo (lo hace el
 * formulario: `onIr`). Con solo sugerencias (los colores) no dice «Falta» —crear ya se puede— sino «Sin elegir» y avisa que se
 * puede seguir así. Con `rotulo` («Conviene») la cabeza es esa y no se agrega nada más: el rótulo ya dice que se puede seguir.
 */
export function FaltanDelPaso<T extends CampoDeGuia>({ faltan, ahora, onIr, rotulo, tope }: { faltan: readonly T[]; ahora: string | null; onIr: (c: T) => void; rotulo?: string; /** Con muchas cosas que faltan (Contar, por modelo), solo estas a la vista, la que sigue primero, y cuántas más. */ tope?: number }) {
  const soloSugeridas = !rotulo && faltan.every((c) => !c.requerido);
  const cabeza = rotulo ?? (soloSugeridas ? "Sin elegir" : faltan.length === 1 ? "Falta" : "Faltan");
  const aLaVista = tope && faltan.length > tope ? [...faltan.filter((c) => c.id === ahora), ...faltan.filter((c) => c.id !== ahora)].slice(0, tope) : faltan;
  return (
    <div className="mr-auto flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5 text-[12.5px] text-taupe">
      <span>{cabeza}:</span>
      {aLaVista.map((c) => (
        <button key={c.id} type="button" onClick={() => onIr(c)} title={c.pendiente} className="hilo-chip">
          <MarcaCampo estado={c.id === ahora ? "ahora" : c.requerido ? "falta" : "opcional"} />
          {c.nombre}
        </button>
      ))}
      {aLaVista.length < faltan.length && <span>y {faltan.length - aLaVista.length} más</span>}
      {soloSugeridas && <span>· puedes seguir así</span>}
    </div>
  );
}
