"use client";

import { createContext, useContext, type ReactNode } from "react";
import { margenObjetivo, REGLAS_DE_FABRICA, type Rasgo, type ReglasDePrecio } from "@/lib/margen-por-rasgos";

// Las reglas del precio sugerido (ADR-0700) llegan a toda hoja que fija un precio sin pasarlas por props: el layout de la app las lee una vez
// por carga (`getReglasParaLasHojas`) y las deja aquí, como la sede activa. Fuera del proveedor (una prueba, una hoja suelta) vale la regla de
// fábrica, la misma con la que arranca la base.

const Contexto = createContext<ReglasDePrecio>(REGLAS_DE_FABRICA);

export function ReglasDePrecioProveedor({ reglas, children }: { reglas: ReglasDePrecio; children: ReactNode }) {
  return <Contexto.Provider value={reglas}>{children}</Contexto.Provider>;
}

/** El margen objetivo de una prenda con lo que tiene: la base del Admin más los puntos de sus casillas. Sin casillas, la base. */
export function useMargenObjetivo(rasgos: readonly Rasgo[] = []): number {
  return margenObjetivo(useContext(Contexto), rasgos);
}
