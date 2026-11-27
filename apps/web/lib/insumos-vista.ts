// Cómo se LEE Producción ▸ Insumos (Felipe 2026-11-26, «Producción más clara»; maqueta docs/maquetas/produccion-resumen-2026-11/). Sin React ni red.
//
// EL PROBLEMA. La pantalla decía sus datos en una sola línea separada por puntos («LIN-01 · 3 lotes · alcanza ~6 sem.», «compra a Textiles · 12/11 · F001-22»): quien entra por primera vez no sabe
// dónde termina un dato y empieza el otro, ni qué es cada número. Aquí cada dato se arma como una pieza con palabras completas: el nombre de un color («Lino, color Crudo»), de dónde vino un lote
// («Compra del 12 de noviembre»), para cuánto alcanza («6 semanas»), cuánto costó («S/ 14.50 el metro»).
//
// CONTRATO
//   PROMETE: solo textos y orden. Ningún texto de aquí separa datos con un punto medio (lo comprueba su prueba), y ninguno inventa un dato que la pantalla no tiene: sin ritmo de consumo no hay
//            «alcanza para», sin mínimo se dice «Sin mínimo».
//   ASUME:   las reglas de negocio ya vienen resueltas en `insumos-reglas.ts` (el estado, el saldo, el lote que se usa primero) y en `lib/insumos.ts` (lo que se lee de la base).
//   NO HACE: no decide quién ve qué ni cambia lo que se guarda. El código de cada insumo y de cada lote se sigue calculando y guardando igual: aquí solo deja de ir a la vista.

import { nombreDeMaterial } from "./avio-clases-reglas";
import { textoDeLaFicha, type FichaDeLaTela } from "./insumos-ficha-reglas";
import { agruparPorTela, cantidadTexto, piezasDeCompra, type EstadoInsumo, type LoteInsumo, type MaterialVista, type TipoInsumo, type UnidadInsumo } from "./insumos-reglas";
import { claveTexto } from "./nombres-parecidos";

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "setiembre", "octubre", "noviembre", "diciembre"] as const;

/** «12 de noviembre» de una fecha `aaaa-mm-dd` (o un instante que empieza así). El año solo se dice si no es el de hoy: «3 de enero de 2025». */
export function diaEnPalabras(iso: string, hoy: string): string {
  const [a, m, d] = iso.slice(0, 10).split("-");
  const mes = MESES[Number(m) - 1];
  if (!mes || !d) return iso;
  return `${Number(d)} de ${mes}${a === hoy.slice(0, 4) ? "" : ` de ${a}`}`;
}

/**
 * El nombre de un insumo para leerlo: «Lino, color Crudo».
 *
 * La base nombra cada color como «<tela o avío> · <color>» (`fn_insumos_copias_de_la_tela`); ese punto es un separador de datos y no va a la vista. Un insumo suelto (sin ficha de tela) conserva su
 * nombre, y si trae un punto de los de antes se lee con coma.
 */
export function nombreDeInsumoParaLeer(i: { nombre: string; materialId?: string | null }): string {
  const corte = i.nombre.lastIndexOf(" · ");
  if (i.materialId && corte > 0) return `${i.nombre.slice(0, corte)}, color ${i.nombre.slice(corte + 3)}`;
  return i.nombre.split(" · ").join(", ");
}

/** Lo que dice la ficha de un insumo suelto, sin punto medio: «Lino, Verde botella», o lo que falta («Sin tejido ni color»). */
export function fichaParaLeer(f: FichaDeLaTela, tipo: TipoInsumo): string {
  return textoDeLaFicha(f, tipo).split(" · ").join(", ");
}

/** Las insignias de una tela (o de un avío con ficha): su tejido, de qué está hecha y cómo se compra. Lo que no se sabe no se dibuja. */
export function insigniasDeLaTela(m: Pick<MaterialVista, "tipo" | "composicion" | "compra" | "ancho" | "gramaje" | "metrosPorRollo">, tejido: string | null): string[] {
  const composicion = m.composicion?.trim() || null;
  // «Lino» y «Lino» no se dicen dos veces.
  const sinRepetir = composicion && tejido && claveTexto(composicion) === claveTexto(tejido) ? null : composicion;
  return [tejido, sinRepetir, ...piezasDeCompra(m)].filter((x): x is string => Boolean(x));
}

/** Una tarjeta de la lista: una tela (o un avío) con sus colores. La última junta lo que no tiene ficha, para que cada insumo suelto no sea una tarjeta de una sola fila. */
export type TarjetaDeInsumos<I> = { material: MaterialVista | null; insumos: I[] };

export function tarjetasDeInsumos<I extends { materialId?: string | null }>(lista: readonly I[], materiales: readonly MaterialVista[]): TarjetaDeInsumos<I>[] {
  const grupos = agruparPorTela(lista, materiales);
  const conFicha = grupos.filter((g) => g.material !== null);
  const sueltos = grupos.filter((g) => g.material === null).flatMap((g) => g.insumos);
  return sueltos.length > 0 ? [...conFicha, { material: null, insumos: sueltos }] : conFicha;
}

/** El título de una tarjeta: el nombre de la tela (con su medida, si es un avío) o, para lo suelto, «Otras telas» / «Otros avíos» («Telas» / «Avíos» si no hay otra tarjeta). */
export function tituloDeTarjeta(t: TarjetaDeInsumos<unknown>, tipo: TipoInsumo, hayOtras: boolean): string {
  if (t.material) return nombreDeMaterial(t.material);
  if (tipo === "tela") return hayOtras ? "Otras telas" : "Telas";
  return hayOtras ? "Otros avíos" : "Avíos";
}

/** Lo que se escribe en el buscador contra el nombre de la tela y el del color, sin tildes ni mayúsculas. Cada palabra tiene que estar. Vacío = todo. */
export function coincideConBusqueda(busqueda: string, ...textos: (string | null | undefined)[]): boolean {
  const palabras = claveTexto(busqueda).split(" ").filter(Boolean);
  if (palabras.length === 0) return true;
  const donde = claveTexto(textos.filter(Boolean).join(" "));
  return palabras.every((p) => donde.includes(p));
}

/** Los insumos que hoy piden comprar: se acabaron o están bajo su mínimo. Primero lo agotado. Es la misma cuenta que antes decía la cifra «Bajo el mínimo». */
export function insumosPorAcabarse<I extends { estado: EstadoInsumo }>(insumos: readonly I[]): I[] {
  const pide = insumos.filter((i) => i.estado.tono === "sin_saldo" || i.estado.tono === "bajo");
  return [...pide.filter((i) => i.estado.tono === "sin_saldo"), ...pide.filter((i) => i.estado.tono === "bajo")];
}

/** «6 semanas», «1 semana», «Menos de 1 semana», «Nada» si ya no queda. `null` si no hubo consumo con qué medirlo: no se inventa. */
export function alcanzaPara(semanas: number | null, saldo: number): string | null {
  if (semanas === null) return null;
  if (saldo <= 0 || semanas <= 0) return "Nada";
  if (semanas < 1) return "Menos de 1 semana";
  const n = Math.round(semanas);
  if (n > 52) return "Más de 1 año";
  return `${n} ${n === 1 ? "semana" : "semanas"}`;
}

/** «Mínimo 40.00 m» o «Sin mínimo»: lo que va bajo la barra de cuánto queda. */
export function minimoTexto(minimo: number | null, unidad: UnidadInsumo): string {
  return minimo === null ? "Sin mínimo" : `Mínimo ${cantidadTexto(minimo, unidad)}`;
}

const COSTO_POR: Record<UnidadInsumo | "rollo", string> = { metro: "el metro", kilo: "el kilo", rollo: "el rollo", unidad: "cada uno", cono: "el cono", par: "el par", docena: "la docena" };

/** Cómo se dice «por unidad» con palabras: «el metro», «el kilo», «cada uno». Va tras el monto («S/ 14.50 el metro») o tras el rótulo de un campo («Me costó el metro»). */
export function costoPor(unidad: UnidadInsumo | "rollo"): string {
  return COSTO_POR[unidad];
}

/** De qué es un precio, para decirlo de corrido: «Precio del metro», «Precio de la docena», «Precio de cada uno» (nunca «de el metro»). */
export function precioDe(unidad: UnidadInsumo | "rollo"): string {
  const por = COSTO_POR[unidad];
  return por.startsWith("el ") ? `del ${por.slice(3)}` : `de ${por}`;
}

/** De dónde viene un lote, como título: «Compra del 12 de noviembre» o «Lo que ya tenías» (el saldo inicial). */
export function tituloDeLote(l: Pick<LoteInsumo, "origen" | "ingreso">, hoy: string): string {
  return l.origen === "saldo_inicial" ? "Lo que ya tenías" : `Compra del ${diaEnPalabras(l.ingreso, hoy)}`;
}

/** Lo que va debajo del título de un lote: a quién se le compró y con qué papel («Textiles del Sur, F001-2231»); en un saldo inicial, el día en que se anotó. `null` si no hay nada que decir. */
export function detalleDeLote(l: Pick<LoteInsumo, "origen" | "ingreso" | "proveedor" | "documento">, hoy: string): string | null {
  const documento = l.documento?.trim() || null;
  if (l.origen === "saldo_inicial") return [`Anotado el ${diaEnPalabras(l.ingreso, hoy)}`, documento].filter(Boolean).join(", ");
  const partes = [l.proveedor?.trim() || null, documento].filter(Boolean);
  return partes.length > 0 ? partes.join(", ") : null;
}

/** Un ingreso eliminado, en una frase: «12.00 m del 12 de noviembre». */
export function tituloDeEliminado(e: { cantidad: number; ingreso: string }, unidad: UnidadInsumo, hoy: string): string {
  return `${cantidadTexto(e.cantidad, unidad)} del ${diaEnPalabras(e.ingreso, hoy)}`;
}

/** El botón que anota una compra desde la fila abierta: «Llegó más de este color» (o «de esta tela» / «de este avío», si el insumo no lleva color). */
export function textoDeLlegoMas(i: { tipo: TipoInsumo; colorCodigo: string | null }): string {
  if (i.colorCodigo) return "Llegó más de este color";
  return i.tipo === "tela" ? "Llegó más de esta tela" : "Llegó más de este avío";
}
