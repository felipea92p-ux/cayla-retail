"use client";

import { createContext, useContext } from "react";

// La caja de búsqueda de la cabecera de Facturación (ADR-0124, spec §7). El texto vive en
// `FacturacionShell`; cada lista lo lee con este hook para filtrar sus filas con `coincide`
// (`lib/facturacion-busqueda.ts`). Vive en su propio archivo para que el shell y las listas no
// formen un ciclo (mismo motivo que `useFacturacionAcciones`). Sin shell alrededor no hay
// búsqueda y no se filtra nada: por eso el contexto trae un valor por omisión en vez de `null`.
export type BusquedaFacturacion = { texto: string; setTexto: (texto: string) => void };

export const BusquedaFacturacionContext = createContext<BusquedaFacturacion>({ texto: "", setTexto: () => {} });

export function useFacturacionBusqueda(): BusquedaFacturacion {
  return useContext(BusquedaFacturacionContext);
}
