// Finanzas ▸ Resumen por bloques (ADR-0661, `20261113235000_resumen_finanzas_por_partes.sql`). Lógica pura: la usan la página y sus pruebas.
//
// EL PROBLEMA. `fn_resumen_finanzas` arma sus 13 partes una detrás de otra (4,3 s en producción) y la pantalla no dibujaba nada hasta tenerlas
// todas. Tres partes son ~78 % del tiempo (el estado de resultados del mes, el presupuesto y el del mes anterior); lo que se ve primero («Libre
// para usar», lo que viene en la caja) sale de las otras diez, que juntas tardan ~0,6 s. Desde 20261114005000 el presupuesto va con el mes:
// usa el mismo estado de resultados.
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
 * fijos, gastos raros, el cierre y lo que no dice de qué cuenta), ~0,6 s en producción. `mes`: el estado de resultados del mes a hoy y el
 * presupuesto, que desde 20261114005000 usa ESE mismo estado de resultados en vez de rearmarlo (por eso van juntos). `avisos`: el del mes
 * anterior; con los tres se completa «Hoy te toca».
 */
export const GRUPOS_DEL_RESUMEN = {
  rapido: ["cuentas", "por_pagar", "flujo", "igv", "campanas", "egresos", "fijos", "raros", "cierre", "sin_cuenta"],
  mes: ["resultados_mes", "presupuesto"],
  avisos: ["resultados_anterior"],
} as const satisfies Record<string, readonly ParteDelResumen[]>;

/**
 * La parte que NO es del Resumen entero (20261114005000): el balance de cada sede a hoy («Cada sede, junta»), armado con el MISMO estado de
 * resultados del mes. Se pide junto con el grupo `mes` cuando se mira CAYLA entera del 1 a hoy; si no, la página pide `fn_balance_por_tienda`.
 */
export const PARTE_BALANCE = "balance";
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
    presupuesto: mes.presupuesto,
    resultadosAnterior: avisos.resultadosAnterior,
    ms: { ...rapido.ms, ...mes.ms, ...avisos.ms },
  };
}
