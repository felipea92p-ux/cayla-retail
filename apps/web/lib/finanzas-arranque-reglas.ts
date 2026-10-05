// Finanzas cuenta DESDE una fecha (ADR-0332; `20261004190000_finanzas_cuenta_desde.sql`). Lógica pura: la usan el Resumen,
// Configuración ▸ Caja y avisos, el Cierre de mes y sus pruebas.
//
// Qué NO hace este archivo: cortar nada. El corte lo hace la base (`fn_asientos` y `fn_estado_resultados` no devuelven lo
// anterior); aquí solo se LEE la fecha y se dice, con palabras, qué significa. Así una pantalla que muestra un mes anterior
// al corte puede explicar por qué está vacío en vez de mostrar ceros como si fueran datos.

import { sumarMeses } from "./impuestos-reglas";
import { mesesRecientes } from "./gastos-reglas";
import { mesNombre, mesTitulo } from "./resultados-reglas";

const DIA_1 = /^(\d{4})-(0[1-9]|1[0-2])-01$/;

/** `inicio_finanzas` del JSON de `fn_parametros_finanzas`: «2026-10-01», o null si no hay corte (o no es un día 1 válido). */
export function leerInicioFinanzas(data: unknown): string | null {
  const v = (data as { inicio_finanzas?: unknown } | null)?.inicio_finanzas;
  const dia = typeof v === "string" ? v.slice(0, 10) : "";
  return DIA_1.test(dia) ? dia : null;
}

/** ¿La base ya trae la columna del corte? (`fn_parametros_finanzas` manda la clave, aunque sea null, solo con la migración pegada.) */
export const baseTraeElCorte = (data: unknown): boolean => typeof data === "object" && data !== null && "inicio_finanzas" in data;

/** «2026-10-01» → «2026-10». */
export const mesDelCorte = (inicio: string): string => inicio.slice(0, 7);

/** ¿El mes («2026-09») termina antes de que Finanzas empiece a contar? Sin corte, nunca. */
export function mesAntesDelCorte(mes: string, inicio: string | null): boolean {
  return !!inicio && mes < mesDelCorte(inicio);
}

/** «2026-10-01» → «1 de octubre de 2026». */
export function fechaDelCorte(inicio: string): string {
  const mes = mesDelCorte(inicio);
  return `1 de ${mesNombre(mes)} de ${mes.slice(0, 4)}`;
}

/** El primer mes que Finanzas mide completo y el día desde el que se puede cerrar: «octubre», y el 1 de noviembre. */
export function primerMesCompleto(inicio: string): { mes: string; seCierraDesde: string } {
  const mes = mesDelCorte(inicio);
  return { mes, seCierraDesde: `${sumarMeses(mes, 1)}-01` };
}

/** Lo que vale «sin corte» en el combo (un texto vacío se confunde con «nada elegido»). */
export const SIN_CORTE = "sin-corte";

/** Lo que el combo elige → lo que se manda a la base: un día 1, o null para quitar el corte. */
export const corteParaBase = (elegido: string): string | null => (/^\d{4}-\d{2}-01$/.test(elegido) ? elegido : null);

/** Para el combo de Configuración: sin corte y los últimos 12 meses (más el del corte vigente si es más viejo). */
export function opcionesCorte(hoy: string, inicio: string | null): { valor: string; texto: string }[] {
  const meses = mesesRecientes(hoy, 12);
  if (inicio && !meses.includes(mesDelCorte(inicio))) meses.push(mesDelCorte(inicio));
  return [{ valor: SIN_CORTE, texto: "Sin corte: cuenta todo" }, ...meses.map((m) => ({ valor: `${m}-01`, texto: `Desde ${mesTitulo(m)}` }))];
}

/** Qué cambia con ese corte, dicho para quien no sabe de contabilidad. */
export function consecuenciaCorte(inicio: string | null): string {
  if (!inicio) return "Hoy Finanzas cuenta todo lo registrado, también lo de antes de que el sistema empezara a usarse.";
  return `Resultados, Resumen, Balance y Cierre de mes cuentan desde el ${fechaDelCorte(inicio)}. Lo anterior no se borra: solo deja de contarse. La caja de las próximas semanas, los impuestos y el costo del Taller siguen mirando todo.`;
}

/** Lo que dice una pantalla cuando el mes que mira es anterior al corte. */
export function avisoAntesDelCorte(inicio: string): string {
  const { mes, seCierraDesde } = primerMesCompleto(inicio);
  const [a, m] = seCierraDesde.split("-");
  return `Finanzas cuenta desde el ${fechaDelCorte(inicio)}: ${mesNombre(mes)} es el primer mes completo y se mide al terminar (desde el 1 de ${mesNombre(`${a}-${m}`)}).`;
}
