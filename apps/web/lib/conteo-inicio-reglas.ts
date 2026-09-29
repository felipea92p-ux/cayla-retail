/**
 * Las frases y cuentas chicas del INICIO de Conteo (`/inventario/conteo`), sin red ni React, para probarlas aparte:
 * lo que dice «dónde» bajo cada lugar, cómo se lee una fila del historial y qué falta para poder empezar. Las reglas
 * del conteo en sí (estados, resultado, textos de progreso) viven en `conteo-reglas.ts`; esto solo arma la pantalla de
 * arranque encima de ellas.
 */

import { diaYHoraLima } from "./fechas-lima";
import { resultadoConteo, textoProgreso, type ConteoResumen } from "./conteo-reglas";

/** Cuántos conteos trae el historial del inicio (`fn_conteos_resumen`, del más reciente al más antiguo). */
export const LIMITE_HISTORIAL_CONTEO = 20;

/**
 * La línea bajo «Almacén de tienda» / «Piso de venta» al elegir dónde contar: el último conteo de ESE lugar que sí dijo algo
 * del inventario, «Último conteo: 12 · 28/09». Un conteo cancelado (o cerrado sin ninguna variante verificada) no cuenta: no
 * midió nada. Uno parcial sí: verificó una parte. El que sigue en curso tampoco: todavía no terminó.
 *
 * `conteos` viene del más reciente al más antiguo. Si el lugar no aparece pero el historial llegó a su tope, puede que su
 * último conteo sea más viejo que la ventana: se dice «Sin conteo reciente» en vez de afirmar que nunca se contó.
 */
export function textoUltimoConteo(conteos: readonly ConteoResumen[], sububicacionId: string, limite: number = LIMITE_HISTORIAL_CONTEO): string {
  const ultimo = conteos.find((c) => {
    if (c.sububicacionId !== sububicacionId) return false;
    const r = resultadoConteo(c);
    return r === "todo_correcto" || r === "con_diferencias" || r === "parcial";
  });
  if (ultimo) return `Último conteo: ${ultimo.numero} · ${diaYHoraLima(ultimo.cerradoEn ?? ultimo.creadoEn).dia}`;
  return conteos.length >= limite ? "Sin conteo reciente" : "Nunca se contó";
}

/**
 * Lo que va bajo «Qué se contó» en el historial, después del alcance: cuántas variantes se verificaron. Un conteo cancelado
 * no dice nada (lo contado se perdió); uno en curso o parcial dice «18 de 37 variantes verificadas»; uno terminado, «37
 * variantes verificadas». `null` si no hay nada que decir.
 */
export function textoAvanceHistorial(c: Pick<ConteoResumen, "estado" | "lineas" | "lineasConDiferencia" | "parcial" | "variantes">): string | null {
  const r = resultadoConteo(c);
  if (r === "cancelado") return null;
  if (r === "en_curso" || r === "parcial") return textoProgreso({ verificadas: c.lineas, variantes: c.variantes });
  return `${c.lineas} ${c.lineas === 1 ? "variante verificada" : "variantes verificadas"}`;
}

/** «Falta elegir dónde vas a contar y quién cuenta.» — lo que le falta a la tarjeta de abrir, sin culpar a nadie. `null` si no falta nada. */
export function textoFaltaElegir(faltan: readonly string[]): string | null {
  if (faltan.length === 0) return null;
  const lista = faltan.length === 1 ? faltan[0] : `${faltan.slice(0, -1).join(", ")} y ${faltan[faltan.length - 1]}`;
  return `Falta elegir ${lista}.`;
}

/**
 * El sufijo `?variantes=id,id` de «Contar esta prenda» (ADR-0241) para la ruta del conteo, o vacío si no hay ninguna. Los ids
 * ya vienen validados (`idsDeParam`): son uuids, y la coma se queda tal cual para que la URL se lea igual que la de Movimientos.
 */
export function sufijoVariantes(ids: readonly string[]): string {
  return ids.length === 0 ? "" : `?variantes=${ids.join(",")}`;
}
