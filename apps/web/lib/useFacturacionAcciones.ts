"use client";

import { createContext, useContext } from "react";

// Quién puede abrir el modal de «Nueva proforma» (ADR-0124): el botón de la vista Proformas.
// El modal lo dibuja `FacturacionShell` una sola vez, así que la vista no lo tiene: le pide al
// shell que lo abra. Vive en su propio archivo para que el shell
// (que importa la cabecera) y la cabecera (que necesita el hook) no formen un ciclo.
export type AccionesFacturacion = {
  abrirProforma: () => void;
};

export const AccionesFacturacionContext = createContext<AccionesFacturacion | null>(null);

export function useFacturacionAcciones(): AccionesFacturacion {
  const acciones = useContext(AccionesFacturacionContext);
  if (!acciones) throw new Error("useFacturacionAcciones solo se puede usar dentro de <FacturacionShell>.");
  return acciones;
}
