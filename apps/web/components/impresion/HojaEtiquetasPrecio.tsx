"use client";

import { createPortal } from "react-dom";
import { EtiquetaPrecio } from "@/components/EtiquetaPrecio";
import type { EtiquetaPrecio as DatosEtiqueta } from "@/lib/etiqueta-precio-reglas";

/** El id que `globals.css` conoce (#etiquetas-precio-print): al imprimir desaparece todo lo demás y cada etiqueta va en su página. */
export const ID_HOJA_ETIQUETAS = "etiquetas-precio-print";

/** Cómo viaja la hoja al driver: `girada` (62 × 40,1, la etiqueta rotada adentro) o `derecha` (40,1 × 62). Cada computadora gira distinto. */
export type ModoDeEtiquetas = "girada" | "derecha";

const CLAVE_MODO = "cayla.etiquetas.modo";

/** La forma con que ESTA computadora manda las etiquetas a la Brother. Se elige en Etiquetas de precio y la usa todo lo que imprime en ese papel. */
export function modoDeEtiquetasGuardado(): ModoDeEtiquetas {
  try {
    return localStorage.getItem(CLAVE_MODO) === "derecha" ? "derecha" : "girada";
  } catch {
    return "girada";
  }
}

export function guardarModoDeEtiquetas(modo: ModoDeEtiquetas) {
  try {
    localStorage.setItem(CLAVE_MODO, modo);
  } catch {}
}

/**
 * La hoja que va a la impresora (ADR-0180): una etiqueta por unidad, cada una en su hoja del tamaño del corte. Va pegada a <body> con un portal —como
 * la boleta A4— y en pantalla no se ve. La comparten la pantalla de Etiquetas de precio y la hoja de Recibir que imprime la tanda recién llevada al
 * stock (tarea 6, 2026-11-14): una sola hoja, para que el papel salga igual se imprima desde donde se imprima.
 *
 * Necesita `document`: quien la dibuja espera a estar montado (`useImpresionBrother().montado`).
 */
export function HojaEtiquetasPrecio({ hoja, impreso, modo }: { hoja: readonly DatosEtiqueta[]; impreso: string; modo: ModoDeEtiquetas }) {
  return createPortal(
    <div id={ID_HOJA_ETIQUETAS} data-modo={modo} aria-hidden>
      {hoja.map((e, i) => (
        // Cada etiqueta en su hoja del tamaño del corte: `globals.css` (.etq-hoja) la gira o la deja derecha según el modo.
        <div key={i} className="etq-hoja">
          <EtiquetaPrecio etiqueta={e} impreso={impreso} />
        </div>
      ))}
    </div>,
    document.body,
  );
}
