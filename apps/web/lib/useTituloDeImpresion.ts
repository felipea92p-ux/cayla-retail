"use client";

import { useEffect } from "react";
import { nombreDeImpresion } from "./impresion-reglas";

/**
 * Mientras el comprobante esté a la vista, el documento se llama como él (Felipe, 2026-09-29).
 *
 * El navegador nombra el PDF con `document.title` («Retail — CAYLA» en todo el ERP), así que la boleta
 * se guardaba como «Retail - CAYLA.pdf». Con este hook el título pasa a ser el número («B004-000004») y
 * el archivo sale como «B004-000004.pdf» — se imprima con el botón, con Ctrl+P o en modo `--kiosk-printing`,
 * porque el nombre ya está puesto ANTES de que cualquiera de las tres llame a `window.print()`.
 *
 * Se restaura al cerrarse, pero solo si el título sigue siendo el nuestro: si mientras tanto el ERP navegó
 * a otra pantalla y Next puso el suyo, no lo pisamos con el de la pantalla anterior.
 * Con `null` (una venta sin conexión no tiene número todavía) no toca nada.
 */
export function useTituloDeImpresion(nombre: string | null | undefined): void {
  const titulo = nombreDeImpresion(nombre);
  useEffect(() => {
    if (!titulo) return;
    const anterior = document.title;
    document.title = titulo;
    return () => {
      if (document.title === titulo) document.title = anterior;
    };
  }, [titulo]);
}
