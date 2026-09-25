"use client";

import { useState } from "react";
import { comboLlegoAlFinal, TAMANO_PAGINA_COMBO } from "@/lib/combo-reglas";

/* ====================================================================
   useComboLista · el estado de "buscar + paginar" que comparten
   `Desplegable`, `ComboBuscable` y `ComboResponsable` (ADR-0194). La regla en sí (los números 8 y 50) vive en
   lib/combo-reglas.ts, puro y testeado; acá solo el estado de React que la usa: cuántas filas se muestran, y
   cuándo el scroll pide revelar 50 más.
   ==================================================================== */
export function useComboLista() {
  const [visibles, setVisibles] = useState(TAMANO_PAGINA_COMBO);

  /** Al abrir: al menos una página, o más si la opción elegida vive más abajo — para que no quede oculta. */
  function mostrarDesde(indiceElegida: number) {
    setVisibles(Math.max(TAMANO_PAGINA_COMBO, Math.ceil((indiceElegida + 1) / TAMANO_PAGINA_COMBO) * TAMANO_PAGINA_COMBO));
  }

  /** Al cambiar el texto de búsqueda: la lista filtrada es otra, se vuelve a la primera página. */
  function reiniciar() {
    setVisibles(TAMANO_PAGINA_COMBO);
  }

  // HTMLElement, no HTMLUListElement: ComboResponsable pagina un <div role="listbox">, no un <ul>.
  function alHacerScroll(e: React.UIEvent<HTMLElement>) {
    const { scrollTop, clientHeight, scrollHeight } = e.currentTarget;
    if (comboLlegoAlFinal({ scrollTop, clientHeight, scrollHeight })) setVisibles((v) => v + TAMANO_PAGINA_COMBO);
  }

  return { visibles, mostrarDesde, reiniciar, alHacerScroll };
}
