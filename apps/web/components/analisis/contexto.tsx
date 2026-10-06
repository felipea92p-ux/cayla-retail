"use client";

import { createContext, useContext } from "react";
import type { AccesoAnalisis, DatosAnalisis, PrendaAnalisis, SedeAnalisis, VistaAnalisis } from "@/lib/analisis-tipos";
import type { FiltroAcaba } from "@/lib/analisis-acaba";

// Análisis v4 (ADR-0357): lo que la pantalla le da a cada pestaña y a la ficha. Una pestaña no lee nada por su cuenta: todo
// llega leído del servidor (`DatosAnalisis`) y filtrado por el buscador de la cabecera.

/** «Se está acabando»: Todos · Comprar (lo que no viene en camino) · Por llegar. Se define con su regla (`analisis-acaba.ts`). */
export type { FiltroAcaba };

export type ContextoAnalisis = {
  datos: DatosAnalisis;
  acceso: AccesoAnalisis;
  /** Las prendas de mi tienda que pasan el buscador (todas si no se busca nada). */
  prendas: PrendaAnalisis[];
  /** Lo escrito en el buscador. */
  q: string;
  /** «Liquidar desde» EN VIVO: mientras se mueve el control, las prendas cambian de grupo sin guardar. */
  liquidarDesde: number;
  setLiquidarDesde: (dias: number) => void;
  filtroAcaba: FiltroAcaba;
  setFiltroAcaba: (f: FiltroAcaba) => void;
  /** El tipo de prenda elegido en la mariposa de «Qué pedir» (filtra tallas y ranking); null = todos. */
  categoria: string | null;
  setCategoria: (c: string | null) => void;
  /** Una tienda por id (para «AQP tiene 3» y «o pedir a Arequipa»). */
  sedeDe: (id: string) => SedeAnalisis | undefined;
  abrirFicha: (varianteId: string) => void;
  /** Cambia de pestaña; con `foco`, deja a la vista ese grupo del carril y lo destella una vez. */
  irA: (vista: VistaAnalisis, opciones?: { foco?: string }) => void;
  /** Abre «Pedir a otra tienda» con esas prendas marcadas, pidiéndoselas a esa tienda. */
  pedir: (prendas: readonly PrendaAnalisis[], origenId: string) => void;
  /** Si se está mirando «con los datos de hoy» aunque la tienda no cumpla las tres condiciones (ADR-0357, decisión 2). */
  conDatosDeHoy: boolean;
  verConDatosDeHoy: (si: boolean) => void;
};

export const Contexto = createContext<ContextoAnalisis | null>(null);

export function useAnalisis(): ContextoAnalisis {
  const c = useContext(Contexto);
  if (!c) throw new Error("useAnalisis: fuera de la pantalla de Análisis");
  return c;
}
