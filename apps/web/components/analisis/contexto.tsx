"use client";

import { createContext, useContext } from "react";
import type { AccesoAnalisis, DatosAnalisis, PrendaAnalisis, SedeAnalisis, VistaAnalisis } from "@/lib/analisis-tipos";
import type { ModeloAnalisis } from "@/lib/analisis-modelo";
import type { FiltrosAnalisis } from "@/lib/analisis-filtros";

// Análisis v4 (ADR-0357): lo que la pantalla le da a cada pestaña y a la ficha. Una pestaña no lee nada por su cuenta: todo
// llega leído del servidor (`DatosAnalisis`) y filtrado por el buscador de la cabecera.

export type ContextoAnalisis = {
  datos: DatosAnalisis;
  acceso: AccesoAnalisis;
  /** Los modelos de mi tienda (cada uno con todas sus tallas y colores, ADR-0357 decisión 12) que pasan el buscador (todos si no se
   *  busca nada). */
  prendas: ModeloAnalisis[];
  /** Cuántos días de ventas tiene la tienda en el ERP, hasta 30 (`diasDeVentas`): «vendiste 38 en 8 días». */
  diasDeVentas: number;
  /** Lo escrito en el buscador. */
  q: string;
  /** «Liquidar desde» EN VIVO: mientras se mueve el control, las prendas cambian de grupo sin guardar. */
  liquidarDesde: number;
  setLiquidarDesde: (dias: number) => void;
  /** El orden elegido en cada pestaña (`analisis-orden.ts`): la píldora «Ordenar por» de la barra. */
  orden: Record<VistaAnalisis, string>;
  /** «Mostrar» de «Qué pedir»: cuántas tarjetas de cada parte («10», «20», «50» o «todas»; `MOSTRAR_PEDIR`). */
  mostrarPedir: string;
  /** Los filtros de la barra (`analisis-filtros.ts`): «Qué pedir» cuenta talla por talla si hay talla o color puestos. */
  filtros: FiltrosAnalisis;
  /** Una tienda por id (para «AQP tiene 3» y «o pedir a Arequipa»). */
  sedeDe: (id: string) => SedeAnalisis | undefined;
  /** Abre el detalle de un modelo (su `varianteId`, que es el id del modelo). */
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
