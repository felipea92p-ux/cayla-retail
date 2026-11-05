"use client";

import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { cuantasCaben } from "@/lib/insignias";

/** Una insignia de la fila: lo que dice y cómo se dibuja (su clase y, el descuento con diseño, su color). */
export type ChipDeFila = { id: string; texto: string; clase: string; estilo?: CSSProperties };

/**
 * La fila ÚNICA de insignias de la tarjeta (Felipe, 2026-10-23: «todas ajustadas a una sola fila»): las propias de la tarjeta (descuento, «Nuevo», puesto) y
 * las asignadas en Catálogo ▸ Insignias, en ese orden, y el «+N» al final. Muestra las que caben ENTERAS en el ancho de esa tarjeta y cuenta el resto en
 * el «+N»: sobre una foto de 165 px (el celular a 2 columnas) no caben tres nombres, y una insignia cortada a la mitad («P…») no dice nada.
 *
 * Mide en el navegador, no estima: dentro de la fila va una copia invisible con TODAS las chips y la letra y el hueco que les toque a ese ancho
 * (`@container tarjeta`, catalogo.css); un observador la vuelve a medir si la tarjeta cambia de tamaño. Antes de medir (el HTML del servidor, o sin
 * JavaScript) se ven todas las del tope de 3, y el CSS achica con «…» lo que no cabe.
 */
export function FilaDeInsignias({ chips, masBase, nombresMasBase }: { chips: ChipDeFila[]; masBase: number; nombresMasBase: string[] }) {
  const [caben, setCaben] = useState(chips.length);
  const medida = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const copia = medida.current;
    const caja = copia?.parentElement?.parentElement; // la fila vive dentro de `.t-insignias`, que ya tiene el ancho de esa tarjeta
    if (!copia || !caja) return;
    const medir = () => {
      const hijos = [...copia.children] as HTMLElement[]; // las chips y, al final, una muestra del «+N»
      const anchoMas = hijos.at(-1)?.offsetWidth ?? 0;
      const anchos = hijos.slice(0, -1).map((h) => h.offsetWidth);
      const hueco = parseFloat(getComputedStyle(copia).columnGap) || 0;
      setCaben(cuantasCaben(anchos, { hueco, anchoMas, disponible: caja.clientWidth, ocultasDeAntemano: masBase > 0 }));
    };
    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(caja);
    return () => observador.disconnect();
  }, [chips, masBase]);

  const visibles = chips.slice(0, caben);
  const ocultas = [...chips.slice(caben).map((c) => c.texto), ...nombresMasBase];
  const mas = chips.length - visibles.length + masBase;
  return (
    <span className="t-insignias-fila">
      {visibles.map((c) => (
        <span key={c.id} className={c.clase} style={c.estilo}>
          {c.texto}
        </span>
      ))}
      {mas > 0 && (
        // El «+2» lleva en su título las que no caben.
        <span className="t-insignia mas" title={ocultas.join(", ")}>
          +{mas}
        </span>
      )}
      {/* La copia invisible con todas las chips (y un «+N» de muestra), solo para medir. */}
      <span ref={medida} className="t-insignias-medida" aria-hidden="true">
        {chips.map((c) => (
          <span key={c.id} className={c.clase} style={c.estilo}>
            {c.texto}
          </span>
        ))}
        <span className="t-insignia mas">+9</span>
      </span>
    </span>
  );
}
