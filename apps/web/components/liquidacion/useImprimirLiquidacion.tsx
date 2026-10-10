"use client";

import { createPortal } from "react-dom";
import { useImpresionBrother } from "@/components/impresion/useImpresionBrother";
import { EtiquetaLiquidacion } from "@/components/liquidacion/EtiquetaLiquidacion";

export type EtiquetaParaImprimir = { codigo: string; categoria: string; precio: number };

/** Cómo manda la hoja esta computadora: la MISMA preferencia que Etiquetas de precio (es la misma Brother y el mismo driver). */
const modoGuardado = (): "girada" | "derecha" => {
  try {
    return localStorage.getItem("cayla.etiquetas.modo") === "derecha" ? "derecha" : "girada";
  } catch {
    return "girada";
  }
};

/**
 * Imprimir etiquetas de liquidación (ADR-0371) por el mismo camino que las de precio: la hoja `#etiquetas-precio-print` pegada a
 * <body> (globals.css oculta todo lo demás al imprimir) y, en una Mac con el ayudante, por HTTP local (ADR-0304). Devuelve la hoja
 * para montarla en la pantalla y la acción de imprimir; la pantalla no necesita saber de la impresora.
 */
export function useImprimirLiquidacion(etiquetas: readonly EtiquetaParaImprimir[], impreso: string) {
  const brother = useImpresionBrother({
    idHoja: "etiquetas-precio-print",
    total: etiquetas.length,
    pieza: "etiqueta",
    detalleEspera: "Preparando la etiqueta de liquidación para la Brother…",
    prepararCopia: (copia) => copia.setAttribute("data-modo", "girada"),
  });
  const hoja =
    brother.montado && etiquetas.length > 0
      ? createPortal(
          <div id="etiquetas-precio-print" data-modo={modoGuardado()} aria-hidden>
            {etiquetas.map((e) => (
              <div key={e.codigo} className="etq-hoja">
                <EtiquetaLiquidacion codigo={e.codigo} categoria={e.categoria} precio={e.precio} impreso={impreso} />
              </div>
            ))}
          </div>,
          document.body,
        )
      : null;
  return { hoja, imprimir: brother.imprimir, enviando: brother.enviando, avisoMac: brother.avisoMac, instalar: brother.instalar };
}
