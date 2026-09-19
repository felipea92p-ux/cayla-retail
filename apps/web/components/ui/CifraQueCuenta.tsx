"use client";

import { soles } from "@/lib/compras-reglas";
import { useContar } from "@/lib/useContar";

const FORMATO = {
  soles: (v: number) => soles(v),
  entero: (v: number) => Math.round(v).toLocaleString("es-PE"),
  porcentaje: (v: number) => `${Math.round(v)} %`,
} as const;

/** Un número que cuenta hasta su valor nuevo cuando cambia (ver `useContar`). En reposo es solo el número. */
export function CifraQueCuenta({ valor, formato = "entero" }: { valor: number; formato?: keyof typeof FORMATO }) {
  return <>{FORMATO[formato](useContar(valor))}</>;
}
