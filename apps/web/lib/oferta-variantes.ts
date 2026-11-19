// Las tallas y colores sueltos de una prenda en una oferta (ADR-0682; Felipe 2026-11-18: «poder aplicar a una variante en concreto de una
// prenda»). Una prenda está en la oferta ENTERA (su modelo, en `productosSolo`: todas sus tallas y colores, también las que nazcan después)
// o POR SUS VARIANTES (en `variantesSolo`: esas tallas y colores, nada más); nunca las dos cosas. Aquí vive cómo se pasa de una a otra al
// tocar una talla o un color, y cómo se dice en una línea. Lógica pura: la hoja solo la dibuja y la base vuelve a validar al guardar.

/** Una talla y color de un modelo, como la muestra la hoja. */
export type VarianteDeModelo = {
  id: string;
  /** La llave del color dentro del modelo (su código); las variantes sin color comparten la llave vacía. */
  colorClave: string;
  /** El nombre del color («Negro»); `null` si el modelo no tiene colores. */
  color: string | null;
  colorHex?: string | null;
  /** La talla («M»); `null` si es talla única. */
  talla: string | null;
};

/** Lo que la oferta eligió prenda por prenda. */
export type Seleccion = { productosSolo: readonly string[]; variantesSolo: readonly string[] };

const ORDEN_DE_TALLAS = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "XXXL"];
/** Las tallas en el orden de la percha: XS, S, M, L…; después las numéricas (36, 38…) y lo demás, por nombre. */
export function ordenarTallas<T extends { talla: string | null }>(variantes: readonly T[]): T[] {
  const peso = (t: string | null) => {
    if (t === null) return [0, 0, ""] as const;
    const i = ORDEN_DE_TALLAS.indexOf(t.trim().toUpperCase());
    if (i >= 0) return [1, i, ""] as const;
    const n = Number(t.replace(",", "."));
    return Number.isFinite(n) ? ([2, n, ""] as const) : ([3, 0, t] as const);
  };
  return [...variantes].sort((a, b) => {
    const [ga, na, ta] = peso(a.talla);
    const [gb, nb, tb] = peso(b.talla);
    return ga - gb || na - nb || ta.localeCompare(tb, "es");
  });
}

/** Las variantes de un modelo juntas por color, en el orden en que llegan los colores, con sus tallas ordenadas. */
export function porColor(variantes: readonly VarianteDeModelo[]): { clave: string; color: string | null; colorHex: string | null; variantes: VarianteDeModelo[] }[] {
  const grupos = new Map<string, { clave: string; color: string | null; colorHex: string | null; variantes: VarianteDeModelo[] }>();
  for (const v of variantes) {
    const g = grupos.get(v.colorClave) ?? { clave: v.colorClave, color: v.color, colorHex: v.colorHex ?? null, variantes: [] };
    g.variantes.push(v);
    grupos.set(v.colorClave, g);
  }
  return [...grupos.values()].map((g) => ({ ...g, variantes: ordenarTallas(g.variantes) }));
}

/** Las variantes del modelo que la oferta alcanza por esta prenda: todas si está entera, las sueltas si no. */
export function elegidasDelModelo(s: Seleccion, productoId: string, variantes: readonly VarianteDeModelo[]): Set<string> {
  if (s.productosSolo.includes(productoId)) return new Set(variantes.map((v) => v.id));
  const sueltas = new Set(s.variantesSolo);
  return new Set(variantes.filter((v) => sueltas.has(v.id)).map((v) => v.id));
}

/** La selección con este modelo en ESTAS variantes: todas = el modelo entero; ninguna = fuera de la oferta; algunas = sueltas. */
export function fijarVariantesDelModelo(s: Seleccion, productoId: string, variantes: readonly VarianteDeModelo[], elegidas: ReadonlySet<string>): { productosSolo: string[]; variantesSolo: string[] } {
  const delModelo = new Set(variantes.map((v) => v.id));
  const quedan = variantes.filter((v) => elegidas.has(v.id)).map((v) => v.id);
  const entero = quedan.length > 0 && quedan.length === variantes.length;
  return {
    productosSolo: entero ? [...s.productosSolo.filter((p) => p !== productoId), productoId] : s.productosSolo.filter((p) => p !== productoId),
    variantesSolo: [...s.variantesSolo.filter((v) => !delModelo.has(v)), ...(entero ? [] : quedan)],
  };
}

/** Tocar una talla: entra o sale. */
export function alternarVariante(s: Seleccion, productoId: string, variantes: readonly VarianteDeModelo[], varianteId: string) {
  const elegidas = elegidasDelModelo(s, productoId, variantes);
  if (!elegidas.delete(varianteId)) elegidas.add(varianteId);
  return fijarVariantesDelModelo(s, productoId, variantes, elegidas);
}

/** Tocar un color: si están todas sus tallas, salen; si falta alguna, entran todas. */
export function alternarColor(s: Seleccion, productoId: string, variantes: readonly VarianteDeModelo[], colorClave: string) {
  const elegidas = elegidasDelModelo(s, productoId, variantes);
  const delColor = variantes.filter((v) => v.colorClave === colorClave).map((v) => v.id);
  const completo = delColor.length > 0 && delColor.every((id) => elegidas.has(id));
  for (const id of delColor) {
    if (completo) elegidas.delete(id);
    else elegidas.add(id);
  }
  return fijarVariantesDelModelo(s, productoId, variantes, elegidas);
}

/** Los modelos que la oferta tiene por prenda, enteros o por sus variantes, en el orden en que entraron (`modeloDe` dice de qué modelo es una variante). */
export function modelosDeLaSeleccion(s: Seleccion, modeloDe: (varianteId: string) => string | undefined): string[] {
  const vistos = new Set<string>();
  const orden: string[] = [];
  for (const id of [...s.productosSolo, ...s.variantesSolo.map(modeloDe)]) {
    if (id && !vistos.has(id)) {
      vistos.add(id);
      orden.push(id);
    }
  }
  return orden;
}

/**
 * Lo que la oferta lleva de un modelo, en una línea: «Todo el modelo», «Negro» (un color con todas sus tallas), «Negro S y M» o
 * «Negro S y M · Blanco». Un modelo sin colores dice solo sus tallas. Vacío si no lleva ninguna.
 */
export function resumenDeVariantes(variantes: readonly VarianteDeModelo[], elegidas: ReadonlySet<string>): string {
  if (variantes.length > 0 && variantes.every((v) => elegidas.has(v.id))) return "Todo el modelo";
  const partes: string[] = [];
  for (const g of porColor(variantes)) {
    const suyas = g.variantes.filter((v) => elegidas.has(v.id));
    if (suyas.length === 0) continue;
    const tallas = suyas.map((v) => v.talla).filter((t): t is string => Boolean(t));
    const dichas = tallas.length <= 1 ? (tallas[0] ?? "") : `${tallas.slice(0, -1).join(", ")} y ${tallas[tallas.length - 1]}`;
    const completo = suyas.length === g.variantes.length;
    partes.push(g.color ? (completo || dichas === "" ? g.color : `${g.color} ${dichas}`) : dichas || "Talla única");
  }
  return partes.join(" · ");
}
