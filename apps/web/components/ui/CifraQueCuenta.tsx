"use client";

import { soles } from "@/lib/compras-reglas";
import { useContar } from "@/lib/useContar";

const FORMATO = {
  soles: (v: number) => soles(v),
  entero: (v: number) => Math.round(v).toLocaleString("es-PE"),
  porcentaje: (v: number) => `${Math.round(v)} %`,
  dias: (v: number) => `${Math.round(v)} ${Math.round(v) === 1 ? "día" : "días"}`,
} as const;

/**
 * Un número que cuenta hasta su valor nuevo cuando cambia (ver `useContar`). En reposo es solo el número.
 * `alMontar`: además cuenta desde 0 una vez al aparecer la pantalla.
 */
export function CifraQueCuenta({ valor, formato = "entero", alMontar = false }: { valor: number; formato?: keyof typeof FORMATO; alMontar?: boolean }) {
  return <>{FORMATO[formato](useContar(valor, 800, alMontar))}</>;
}
