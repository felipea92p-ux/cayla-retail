// Cuánto de lo vendido lleva un costo ESTIMADO (tarea 28 de «Las 36 de Finanzas»; contrato en 20261015233000_costo_estimado_venta_sin_prenda.sql).
//
// EL PROBLEMA: «Ganaste S/ X» se dibujaba igual con el costo real que con el promedio de la categoría de una prenda sin registrar. En octubre
// el 38 % de lo vendido llevaba costo estimado y la pantalla no lo decía, aunque el medidor de confianza sí lo sabía.
//
// PROMETE: de la fila de `fn_costo_estimado_resumen` arma una nota corta («El 38 % de lo vendido lleva costo estimado») y su tono, o nada si
//   todo lleva costo real. ASUME: toda cifra viene de la base; aquí no se calcula plata, solo un porcentaje de lo que ya sumó.
// DECIDÍ: el porcentaje es de la VENTA (no de las unidades), el mismo que usa el medidor, para que las dos pantallas digan lo mismo.

import { soles } from "./flujo-caja-reglas";
import { SEDE_EMPRESA, type ClaveSede } from "./finanzas-telar-reglas";

type Fila = Record<string, unknown>;

export type CostoEstimado = {
  unidadesEstimadas: number;
  ventaEstimada: number;
  unidadesSinCosto: number;
  ventaSinCosto: number;
  ventaTotal: number;
};

export type NotaCostoEstimado = {
  texto: string;
  detalle: string;
  tono: "ambar" | "rojo";
  href: string;
  /** Solo si queda algo por registrar (o no se pudo contar): las cerradas sin prenda no se registran desde ese botón. */
  conBoton: boolean;
};

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export function leerCostoEstimado(f: Fila): CostoEstimado {
  return {
    unidadesEstimadas: num(f.unidades_estimadas),
    ventaEstimada: num(f.venta_estimada),
    unidadesSinCosto: num(f.unidades_sin_costo),
    ventaSinCosto: num(f.venta_sin_costo),
    ventaTotal: num(f.venta_total),
  };
}

const plural = (n: number, uno: string, varios: string) => (n === 1 ? uno : varios);

/** «63.1»: cuánto de lo vendido lleva costo estimado, con un decimal. `null` sin lectura o sin ventas (nunca un 0 % que parezca un dato). */
/** «Empresa» nunca vende: pedirle su costo trae el de todas las tiendas, y la nota se lo atribuiría a la oficina (tarea 58). */
export const aplicaNotaDeCosto = (sede: ClaveSede | null): boolean => sede !== SEDE_EMPRESA;

export function pctCostoEstimado(c: CostoEstimado | null): number | null {
  if (!c || c.ventaTotal <= 0) return null;
  return Math.round((Math.min(c.ventaEstimada, c.ventaTotal) / c.ventaTotal) * 1000) / 10;
}

/**
 * Cuántas quedan por registrar, en la misma frase en Ganancias y en el medidor (tarea 75). De lo estimado, la mayoría ya se cerró sin prenda y no se corrige sola.
 * `pendientes`: `null` si no se pudo contar.
 */
export function quedanPorRegistrar(pendientes: number | null): string {
  if (pendientes === null) return "No se pudo contar cuántas quedan por registrar.";
  if (pendientes === 0) return "";
  return `${pendientes === 1 ? "Queda" : "Quedan"} ${pendientes} por registrar.`;
}

/**
 * ¿El conteo de «por registrar» alcanza a todo lo que se pide? `prendas_por_regularizar` pasa por la RLS (`fn_puede_operar_ubicacion`: el líder, o la sede propia), mientras la cifra de la
 * nota sale de `fn_diario_ubicaciones()`, que a quien tiene Reportes financieros le da todas. Fuera de ese alcance la cuenta daría un cero falso: mejor «no se pudo contar».
 */
export function conteoAlcanzaLoPedido(o: { esLider: boolean; sedePropia: string | null; pedida: string | null }): boolean {
  return o.esLider || (o.pedida !== null && o.pedida === o.sedePropia);
}

/** `null` cuando todo lleva costo real (o no hubo ventas): no hay nada que avisar. `contexto.periodo`: el mes en palabras, o `null` si son otras fechas. */
export function notaCostoEstimado(c: CostoEstimado | null, contexto: { periodo: string | null; pendientes: number | null } = { periodo: null, pendientes: null }): NotaCostoEstimado | null {
  if (!c || c.ventaTotal <= 0) return null;
  const pctEst = Math.round((Math.min(c.ventaEstimada, c.ventaTotal) / c.ventaTotal) * 100);
  const pctSin = Math.round((Math.min(c.ventaSinCosto, c.ventaTotal) / c.ventaTotal) * 100);
  // Un porcentaje que redondea a 0 con unidades sí cuenta como «menos de 1 %», para no esconder un estimado chico.
  const hayEst = c.unidadesEstimadas > 0;
  const haySin = c.unidadesSinCosto > 0;
  if (!hayEst && !haySin) return null;
  const partes: string[] = [];
  if (hayEst) partes.push(`${pctEst < 1 ? "menos del 1" : pctEst} % de lo vendido lleva costo estimado (${c.unidadesEstimadas} ${plural(c.unidadesEstimadas, "prenda sin registrar", "prendas sin registrar")})`);
  if (haySin) partes.push(`${pctSin < 1 ? "menos del 1" : pctSin} % no tiene costo (${c.unidadesSinCosto} ${plural(c.unidadesSinCosto, "prenda", "prendas")})`);
  const texto = partes.join(" y ");
  return {
    texto: texto.charAt(0).toUpperCase() + texto.slice(1),
    detalle: [hayEst ? `De ${contexto.periodo ?? "estas fechas"}, ${soles(c.ventaEstimada)} vendidos con IGV llevan un costo estimado que se queda así, salvo que reabras esas ventas.` : "", quedanPorRegistrar(contexto.pendientes)].filter(Boolean).join(" "),
    tono: haySin ? "rojo" : "ambar",
    href: "/inventario/por-regularizar",
    conBoton: contexto.pendientes === null || contexto.pendientes > 0,
  };
}
