// Precio propuesto con IA (ADR-0641, Felipe 2026-11-10): las reglas fijas que revisan lo que propone la IA.
//
// EL PROBLEMA: la IA propone el precio (Felipe lo eligió así), pero un modelo puede equivocarse o proponer bajo el costo. Lo que no
// puede pasar —perder plata o dejar menos de 30 % de margen— no depende de la IA: lo decide esta regla, siempre igual, y la base lo
// vuelve a exigir (`precio_propuestas`, migración 20261110203000).
//
// PROMETE: con el costo de la prenda (o el promedio de su categoría, marcado como estimado) calcula el piso —costo + 30 % de margen
//   sobre el precio, redondeado a .90, como se ponen los precios en CAYLA— y lleva la propuesta de la IA a .90 y al piso si quedó debajo.
// ASUME: montos en soles; la IA devuelve un número cualquiera (puede ser basura). NO HACE: no decide el precio: lo propone.
// DECIDÍ: todo en céntimos enteros. Con decimales, 70 × 0,7 da 48,99999… y el piso podría quedar un céntimo debajo de lo que la base exige.

import { MAX_PRECIO_PRENDA } from "./catalogo-topes";
import { aNoventaCts, cuentaDelPrecio, pisoDelPrecio } from "./cuenta-de-precio";
import { margenALaVista } from "./margen-a-la-vista";

/** @internal La prueba la cruza con `pisoDePrecio` (que trabaja en céntimos, 10/7) y con el CHECK de la migración.
 *  El margen mínimo sobre el precio que Felipe fijó: ninguna propuesta deja menos (el «bajo» de Nuevo producto empieza aquí). */
export const MARGEN_MINIMO = 0.3;

/** Lo que se puede gastar en propuestas por mes de Lima (US$), aparte del asistente. */
export const TOPE_PRECIOS_MES_USD = 20;

// El .90 de CAYLA vive en la cuenta única (`aNoventaCts`, ADR-0700): lo usan también la regla del margen y la línea.
const centimosA90 = aNoventaCts;

/** El primer precio terminado en .90 que no baja de `monto`. */
export function redondearA90(monto: number): number {
  return centimosA90(Math.ceil(Math.round(monto * 1000) / 10)) / 100;
}

/** El precio más bajo que se puede proponer con ese costo: precio × 0,70 ≥ costo, terminado en .90. */
export function pisoDePrecio(costo: number): number {
  const costoCent = Math.round(costo * 100);
  // precio ≥ costo / 0,70  ⇔  precio·7 ≥ costo·10 (en céntimos enteros, sin decimales que redondear mal).
  const minimo = Math.ceil((costoCent * 10) / 7);
  return centimosA90(minimo) / 100;
}

export type CostoUsado = { costo: number; estimado: boolean };

/**
 * El costo con que se calcula: el de la prenda si lo tiene; si no, el promedio de su categoría (Felipe 2026-11-10: «usa el costo
 * promedio de su categoría»), marcado como estimado. `null` si no hay ninguno: sin costo no se propone.
 */
export function elegirCosto(costoPrenda: number | null | undefined, costoCategoria: number | null | undefined): CostoUsado | null {
  if (typeof costoPrenda === "number" && Number.isFinite(costoPrenda) && costoPrenda > 0 && costoPrenda <= MAX_PRECIO_PRENDA) {
    return { costo: Math.round(costoPrenda * 100) / 100, estimado: false };
  }
  if (typeof costoCategoria === "number" && Number.isFinite(costoCategoria) && costoCategoria > 0 && costoCategoria <= MAX_PRECIO_PRENDA) {
    return { costo: Math.round(costoCategoria * 100) / 100, estimado: true };
  }
  return null;
}

export type PrecioRevisado = {
  precio: number;
  piso: number;
  /** La IA propuso debajo del piso y la regla lo subió. */
  subidoAlPiso: boolean;
  /** Margen sobre el precio, en %. */
  margen: number;
};

/**
 * Lo que la IA propuso, llevado a la regla: a .90 y nunca debajo del piso. `null` si lo propuesto no es un precio (no es un número,
 * es 0 o negativo, o pasa del tope de S/ 5 000): esa respuesta no se le puede creer y no se muestra.
 */
export function revisarPrecioDeLaIA(propuesto: unknown, costo: number): PrecioRevisado | null {
  if (typeof propuesto !== "number" || !Number.isFinite(propuesto) || propuesto <= 0 || propuesto > MAX_PRECIO_PRENDA) return null;
  if (!Number.isFinite(costo) || costo <= 0) return null;
  // El piso de la cuenta única (ADR-0668): lo que propone la IA aguanta una rebaja de 35 %, como lo pide la línea de al lado. Siempre queda
  // sobre el piso de 30 % que exige la base (precio × 0,70 ≥ costo): ×2.27 del costo es más que ×1.43.
  // Si ningún precio hasta el tope aguanta la rebaja, no hay propuesta (un costo así no es de una prenda).
  const pisoUnico = pisoDelPrecio(costo);
  if (pisoUnico === null) return null;
  const piso = Math.max(pisoDePrecio(costo), pisoUnico);
  const redondeado = redondearA90(propuesto);
  const subidoAlPiso = redondeado < piso;
  const precio = subidoAlPiso ? piso : redondeado;
  if (precio > MAX_PRECIO_PRENDA) return null;
  // El mismo % que la línea de al lado (`cuentaDelPrecio`): una prenda, una cifra (ADR-0668).
  return { precio, piso, subidoAlPiso, margen: (cuentaDelPrecio(costo, precio)?.margenPorMil ?? 0) / 10 };
}

/** ¿Ya se gastó el tope del mes? Si la base no dijo cuánto va (`null`), no se corta: un fallo al leer no deja a nadie sin propuesta. */
export function seLlegoAlTopePrecios(gastado: number | null): boolean {
  return gastado !== null && Number.isFinite(gastado) && gastado >= TOPE_PRECIOS_MES_USD;
}

/** Por qué no hay propuesta, como lo guarda la base. */
export type MotivoSinPropuesta = "sin_clave" | "sin_costo" | "tope" | "sin_respuesta" | "rechazo" | "respuesta_invalida";

/** Lo que se le dice a la persona cuando no hay propuesta: qué pasó y qué hacer, en una frase corta (Felipe 2026-11-13: «super breve y directo»). */
export function textoSinPropuesta(motivo: MotivoSinPropuesta): string {
  switch (motivo) {
    case "sin_costo":
      return "Escribe el costo y te propongo un precio.";
    case "tope":
      return "Se acabó lo de este mes. Ponlo tú.";
    case "sin_clave":
      return "La propuesta está apagada. Ponlo tú.";
    case "sin_respuesta":
      return "No respondió. Prueba de nuevo o ponlo tú.";
    case "rechazo":
    case "respuesta_invalida":
      return "No salió una propuesta útil. Prueba de nuevo.";
  }
}

export type RevisionAlRecibir = { margen: number; motivo: "margen_bajo" | "costo_cambio" };

/**
 * Al cerrar un envío con una prenda que ya existe (ADR-0641 act. 2026-11-11, Felipe: «solo propone si el costo cambió o el margen quedó bajo
 * 30 %»): ¿conviene mirar su precio? `null` si no (o si faltan datos: sin precio o sin costo no se dice nada). Cuenta gratis, sin IA.
 * Mide con la cuenta única de la línea viva: «margen_bajo» es lo mismo que el ámbar de `<LineaMargen>`, un precio que no llega al margen
 * objetivo de la prenda (la base del Admin más sus casillas, ADR-0700; antes, el piso de 48 % de ADR-0668). Todas las prendas igual.
 */
export function pideRevisarAlRecibir(p: {
  precio: number | null;
  costo: number | null;
  costoAntes: number | null;
  margenObjetivo: number;
}): RevisionAlRecibir | null {
  const { precio, costo, costoAntes } = p;
  if (precio === null || costo === null || !Number.isFinite(precio) || !Number.isFinite(costo) || precio <= 0 || costo <= 0) return null;
  const margen = (cuentaDelPrecio(costo, precio)?.margenPorMil ?? 0) / 10;
  // La misma pregunta que se hace la línea, con la misma función: nunca se contradicen en la misma hoja.
  if (margenALaVista(costo, precio, p.margenObjetivo)?.tono !== "normal") return { margen, motivo: "margen_bajo" };
  if (costoAntes !== null && Number.isFinite(costoAntes) && costoAntes > 0 && Math.abs(costo - costoAntes) >= 0.01) return { margen, motivo: "costo_cambio" };
  return null;
}

/**
 * Por qué conviene mirar el precio, antes de pedir nada a la IA. Sin la cifra: el margen lo dice una sola vez la línea viva de al lado
 * (`<LineaMargen>`, tarea 8 de Recibir), y repetirlo aquí lo decía dos veces en la misma hoja.
 */
export function textoRevisarAlRecibir(r: RevisionAlRecibir): string {
  // En «margen_bajo» la línea de al lado ya dice por qué en su color (ámbar o rojo): aquí no se repite.
  return r.motivo === "margen_bajo" ? "Revisa el precio." : "Cambió el costo: revisa el precio.";
}

/** El precio que va a quedar en todas las tallas de una prenda al cerrar (lo escrito o el de hoy en la sede), si es uno solo; `null` si no. */
export function precioUnicoAlCerrar(
  combinaciones: readonly { varianteId: string; precioSede: number | null }[],
  cambiosPrecio: Readonly<Record<string, { valor: number }>>,
): number | null {
  const precios = new Set(combinaciones.map((c) => cambiosPrecio[c.varianteId]?.valor ?? c.precioSede));
  if (precios.size !== 1) return null;
  const [p] = [...precios];
  return typeof p === "number" && p > 0 ? p : null;
}
