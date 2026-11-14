// Finanzas ▸ Resumen por bloques (ADR-0661, `20261113235000_resumen_finanzas_por_partes.sql`). Lógica pura: la usan la página y sus pruebas.
//
// EL PROBLEMA. `fn_resumen_finanzas` arma sus 13 partes una detrás de otra (4,3 s en producción) y la pantalla no dibujaba nada hasta tenerlas
// todas. Tres partes son ~78 % del tiempo (el estado de resultados del mes, el presupuesto y el del mes anterior); lo que se ve primero («Libre
// para usar», lo que viene en la caja) sale de las otras diez, que juntas tardan ~0,6 s.
//
// LO QUE HACE. La página pide `fn_resumen_finanzas_partes` tres veces A LA VEZ, una por grupo, y cada bloque se dibuja cuando llega lo suyo.
// Aquí viven los grupos y `juntarResumen`, que arma con las tres respuestas el MISMO `ResumenFinanzas` que daba la lectura entera: cada parte
// sale del grupo que la pidió (en los otros dos llega como «la base no mandó esta parte»). Lo prueban `resumen-finanzas-partes.test.ts` (contra
// el JSON de la entera) y, en la base, `pnpm pruebas:resumen-por-partes`.

import type { ResumenFinanzas } from "./resumen-finanzas-reglas";

/** Las 13 partes de `fn_resumen_finanzas`, con su nombre en la base (las mismas que valida la función por partes). */
export const PARTES_DEL_RESUMEN = [
  "resultados_mes",
  "resultados_anterior",
  "presupuesto",
  "cuentas",
  "por_pagar",
  "flujo",
  "igv",
  "campanas",
  "egresos",
  "fijos",
  "raros",
  "cierre",
  "sin_cuenta",
] as const;
export type ParteDelResumen = (typeof PARTES_DEL_RESUMEN)[number];

/**
 * Los tres grupos que pide la página, en paralelo. `rapido`: lo que se ve primero (saldos, deudas, la caja que viene, IGV, campañas, egresos,
 * fijos, gastos raros, el cierre y lo que no dice de qué cuenta), ~0,6 s en producción. `mes`: el estado de resultados del mes a hoy, ~2 s.
 * `avisos`: el del mes anterior y el presupuesto, ~1,3 s; con ellos se completa «Hoy te toca».
 */
export const GRUPOS_DEL_RESUMEN = {
  rapido: ["cuentas", "por_pagar", "flujo", "igv", "campanas", "egresos", "fijos", "raros", "cierre", "sin_cuenta"],
  mes: ["resultados_mes"],
  avisos: ["resultados_anterior", "presupuesto"],
} as const satisfies Record<string, readonly ParteDelResumen[]>;
export type GrupoDelResumen = keyof typeof GRUPOS_DEL_RESUMEN;

/**
 * Las tres respuestas, ya leídas con `leerResumen`, → el `ResumenFinanzas` de la lectura entera. Lo de arriba (hoy, el mes, quién mira, qué se
 * mira, las sedes, el corte de Finanzas) viene igual en las tres: se toma de la rápida. Cada parte, del grupo que la pidió; el `ms`, de las tres.
 */
export function juntarResumen(rapido: ResumenFinanzas, mes: ResumenFinanzas, avisos: ResumenFinanzas): ResumenFinanzas {
  return {
    ...rapido,
    resultadosMes: mes.resultadosMes,
    rangoMes: mes.rangoMes,
    resultadosAnterior: avisos.resultadosAnterior,
    presupuesto: avisos.presupuesto,
    ms: { ...rapido.ms, ...mes.ms, ...avisos.ms },
  };
}
