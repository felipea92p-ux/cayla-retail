"use client";

import { createContext, useContext } from "react";

// Quién puede abrir los modales de Facturación (ADR-0124): la cabecera y los botones de
// cada vista. Los modales los dibuja `FacturacionShell` una sola vez, así que las vistas no
// los tienen: le piden al shell que los abra. Vive en su propio archivo para que el shell
// (que importa la cabecera) y la cabecera (que necesita el hook) no formen un ciclo.
export type AccionesFacturacion = {
  abrirEmitir: () => void;
  abrirProforma: () => void;
};

export const AccionesFacturacionContext = createContext<AccionesFacturacion | null>(null);

export function useFacturacionAcciones(): AccionesFacturacion {
  const acciones = useContext(AccionesFacturacionContext);
  if (!acciones) throw new Error("useFacturacionAcciones solo se puede usar dentro de <FacturacionShell>.");
  return acciones;
}
