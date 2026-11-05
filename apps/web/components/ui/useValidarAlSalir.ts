"use client";

import { useState } from "react";
import { avisoVisible, salioAlDejarlo, salioTrasCambiar } from "@/lib/validar-al-salir";

/**
 * Un error de escritura se dice al salir del campo y se va apenas se corrige (ADR-0611, mejora 2; la regla, en `lib/validar-al-salir.ts`).
 * Se le pasa el motivo que ya da la validación y se usa así: `pie={aviso.motivo}`, `tono={aviso.motivo ? "error" : undefined}`, `onBlur={aviso.alSalir}`.
 */
export function useValidarAlSalir(motivo: string | null) {
  const [salio, setSalio] = useState(false);
  // Se ajusta durante el render, no en un efecto: el aviso se va en el mismo cuadro en que el dato queda bien.
  const sigue = salioTrasCambiar(salio, motivo);
  if (sigue !== salio) setSalio(sigue);
  return { motivo: avisoVisible(sigue, motivo), alSalir: () => setSalio(salioAlDejarlo(motivo)) };
}
