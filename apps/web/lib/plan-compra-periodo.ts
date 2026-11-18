// El tiempo que miran las ventas del Plan de campaña, dicho con la verdad (tarea #3 de la auditoría, 2026-10-26).
//
// EL PROBLEMA. El Plan mira las ventas de los últimos 90 días, pero el ERP vende desde el 30-sep: con 26 días de datos la pantalla decía «Vendiste 366
// en 90 días» y la persona creía que la propuesta tenía tres meses detrás. La cuenta ya divide por los días REALES de cada tienda (`dias_90` de la base:
// desde su primera venta en el ERP, con tope de 90); lo que faltaba era decirlo.
//
// CONTRATO
//   PROMETE: «90 días» solo si el ERP ya los tiene; si no, «los N días que lleva el ERP» con el N real (el mayor de las tiendas); y no inventar un
//            dato cuando no se sabe (undefined = la base no manda la propuesta: se dice «90 días», la ventana de siempre).
//   NO HACE: no cambia ninguna cuenta (eso es `proponer`) ni decide cuánto creerle a los números (eso es el aviso de exactitud).

/** La ventana de ventas que mira `fn_plan_compra`, para la curva y para «lo que vendiste» (los 90 días de siempre). */
export const DIAS_DE_VENTAS = 90;

/**
 * Cuántos días de ventas tiene de verdad el ERP dentro de la ventana: el mayor `dias_90` de las tiendas (desde su primera venta, con tope de 90).
 * undefined = no se sabe (no hay lectura de la propuesta).
 */
export function diasDeVentasDelErp(tiendas: readonly { dias90: number }[] | null | undefined): number | undefined {
  if (!tiendas || tiendas.length === 0) return undefined;
  return Math.min(DIAS_DE_VENTAS, Math.max(0, ...tiendas.map((t) => t.dias90)));
}

/** «90 días» si el ERP ya los tiene; «los 26 días que lleva el ERP» si todavía no. Para «Vendiste 366 en …». */
export function periodoDeVentas(dias: number | undefined): string {
  if (dias === undefined || dias >= DIAS_DE_VENTAS) return `${DIAS_DE_VENTAS} días`;
  if (dias === 1) return "el único día que lleva el ERP";
  if (dias <= 0) return "los días que lleva el ERP";
  return `los ${dias} días que lleva el ERP`;
}

/** Lo mismo para «…no vendió en los últimos 90 días»: con menos de 90, el periodo ya trae su artículo. */
export function ultimosDeVentas(dias: number | undefined): string {
  return dias === undefined || dias >= DIAS_DE_VENTAS ? `los últimos ${DIAS_DE_VENTAS} días` : periodoDeVentas(dias);
}

export type ExactitudDeLosDatos = {
  /** 1 = todavía no son exactos · 2 = ya orientan. Con la campaña del año pasado en el ERP no hay nada que avisar (null). */
  nivel: 1 | 2;
  titulo: string;
  detalle: string;
};

/**
 * Cuánto creerle a los números del Plan, en una línea que no agrega ningún control. Sale de dos hechos que el sistema ya sabe: cuántos días de
 * ventas tiene el ERP (`dias`) y si la misma campaña del año pasado ya está en él (`conCampanaAnterior`, de las tiendas que la tienen).
 *   · menos de 90 días → «todavía no son exactos» (la propuesta se apoya en un tramo corto; el bueno, en el historial de Sinatra donde lo hay);
 *   · 90 días o más pero sin la campaña del año pasado en el ERP → «ya orientan, sin ser exactos»;
 *   · con la campaña del año pasado en el ERP → null: no se avisa lo que no hace falta.
 * undefined (la base no manda la propuesta) → null: no se inventa una exactitud que no se sabe.
 */
export function exactitudDeLosDatos(dias: number | undefined, conCampanaAnterior: boolean): ExactitudDeLosDatos | null {
  if (dias === undefined) return null;
  const guia = "Las cifras son una guía: tú decides.";
  if (dias < DIAS_DE_VENTAS) {
    return { nivel: 1, titulo: "Los datos todavía no son exactos", detalle: `El ERP lleva ${dias} de ${DIAS_DE_VENTAS} días de ventas. ${guia}` };
  }
  if (!conCampanaAnterior) {
    return { nivel: 2, titulo: "Los datos ya orientan, sin ser exactos", detalle: `Ya hay ${DIAS_DE_VENTAS} días de ventas, pero la misma campaña del año pasado todavía no está en el ERP. ${guia}` };
  }
  return null;
}

/** ¿Tiene sentido decir «y M en los últimos 30»? Con menos de 30 días de ERP, los últimos 30 son TODO lo que hay: sería repetir la misma cifra. */
export function hayUltimos30(dias: number | undefined): boolean {
  return dias === undefined || dias >= 30;
}
