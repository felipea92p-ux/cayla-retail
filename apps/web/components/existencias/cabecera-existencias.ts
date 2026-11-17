"use client";

import { useSyncExternalStore } from "react";

/* ====================================================================
   El puente entre la cabecera de Existencias y su lista (Felipe 2026-11-17)

   La cabecera la dibuja el servidor (`inventario/page.tsx`); los filtros, el plan del piso y lo que se ve viven en el navegador
   (`InventarioPanel`). En el celular, «Filtros» y el aviso del piso sin cuadrar pasaron a la fila de íconos de la cabecera, junto a
   «Resumen», y esa fila necesita dos cosas de la lista:
   · PEDIR: un número que sube con cada toque de «Filtros», como el de «Ajustar stock» (`BotonAjustarStock`); la barra de filtros lo
     escucha y abre su hoja. Sin barra que escuche, no pasa nada.
   · SABER lo que solo el panel sabe: cuántos filtros hay puestos (ya resueltos contra lo que la sede ofrece) y si el piso sigue sin
     cuadrar (lo dice el plan del piso, que llega después que la página). El panel lo PUBLICA; mientras nadie publica (`null`: antes
     de hidratar, o sin panel), la cabecera se queda con lo que el servidor le dio.
   ==================================================================== */

export type LoQueSabeElPanel = { filtrosPuestos: number; pisoSinCuadrar: boolean };

let pedidosDeFiltros = 0;
let publicado: LoQueSabeElPanel | null = null;
const oyentes = new Set<() => void>();

function suscribir(avisar: () => void) {
  oyentes.add(avisar);
  return () => {
    oyentes.delete(avisar);
  };
}
function avisarATodos() {
  for (const o of oyentes) o();
}

/** «Filtros» de la cabecera (celular): pide que la barra de filtros abra su hoja. */
export function pedirFiltros() {
  pedidosDeFiltros += 1;
  avisarATodos();
}

/** Cuántas veces se tocó «Filtros» en la cabecera: la barra abre su hoja cada vez que cambia. */
export function usePedidoDeFiltros(): number {
  return useSyncExternalStore(
    suscribir,
    () => pedidosDeFiltros,
    () => 0
  );
}

/** El panel dice lo que sabe; `null` al desmontarse (otra sede, otra pantalla): un dato viejo no se queda en la cabecera. */
export function publicarEnCabecera(dato: LoQueSabeElPanel | null) {
  // El mismo objeto mientras no cambie nada: `useSyncExternalStore` compara por identidad.
  if (dato && publicado && dato.filtrosPuestos === publicado.filtrosPuestos && dato.pisoSinCuadrar === publicado.pisoSinCuadrar) return;
  if (dato === publicado) return;
  publicado = dato;
  avisarATodos();
}

/** Lo que el panel publicó, o `null` si todavía no hay panel en el navegador. */
export function useLoQueSabeElPanel(): LoQueSabeElPanel | null {
  return useSyncExternalStore(
    suscribir,
    () => publicado,
    () => null
  );
}
