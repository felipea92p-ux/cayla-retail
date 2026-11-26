"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { margenObjetivo, REGLAS_DE_FABRICA, type ListasDeRasgos, type Rasgo, type ReglasDePrecio, type ReglasYListas } from "@/lib/margen-por-rasgos";

// Las reglas del precio sugerido (ADR-0700) llegan a toda hoja que fija un precio sin pasarlas por props: el layout de la app las lee una vez
// por carga (`getReglasParaLasHojas`) y las deja aquí, como la sede activa. Fuera del proveedor (una prueba, una hoja suelta) vale la regla de
// fábrica, la misma con la que arranca la base, y las listas vacías.

type Valor = { reglas: ReglasDePrecio; listas: ListasDeRasgos };
const Contexto = createContext<Valor>({ reglas: REGLAS_DE_FABRICA, listas: { marcasConocidas: new Set(), tejidosQueSeNotan: new Set() } });

export function ReglasDePrecioProveedor({ valor, children }: { valor: ReglasYListas; children: ReactNode }) {
  const v = useMemo<Valor>(
    () => ({ reglas: valor.reglas, listas: { marcasConocidas: new Set(valor.marcasConocidas), tejidosQueSeNotan: new Set(valor.tejidosQueSeNotan) } }),
    [valor],
  );
  return <Contexto.Provider value={v}>{children}</Contexto.Provider>;
}

/** La base y lo que suma cada casilla. */
export function useReglasDePrecio(): ReglasDePrecio {
  return useContext(Contexto).reglas;
}

/** Las marcas que el cliente conoce y los tejidos que se notan, como ids. */
export function useListasDeRasgos(): ListasDeRasgos {
  return useContext(Contexto).listas;
}

/** El margen objetivo de una prenda con lo que tiene: la base del Admin más lo que suman sus casillas. Sin casillas, la base. */
export function useMargenObjetivo(rasgos: readonly Rasgo[] = []): number {
  return margenObjetivo(useContext(Contexto).reglas, rasgos);
}
