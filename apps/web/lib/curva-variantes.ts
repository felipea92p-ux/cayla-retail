import { compararTallas } from "./tallas";

// Curva rota (2026-09-17, ADR-0097): una prenda nace con una curva de
// tallas por color (S · M · L · XL). Cuando una sede se queda en 0 en una
// talla del MEDIO de esa curva mientras conserva stock antes y después, la
// prenda es, para efectos prácticos, invendible en esa sede — nadie compra
// "una talla cualquiera". Es distinto de agotarse en la punta (dejar de
// tener XXL) o de una prenda que nunca tuvo esa talla: ninguna de las dos
// es un hueco.
//
// Regla adoptada (2026-09-17, propuesta sin objeción de Felipe): la curva
// "esperada" de un producto+color en una sede es, sencillamente, el
// conjunto de tallas para las que YA existe una variante dada de alta en el
// catálogo — nunca una talla que el producto jamás manejó. Es la lectura
// conservadora: prefiere no avisar antes que avisar de más.

export type VarianteParaCurva = {
  varianteId: string;
  talla: string | null;
  stock: number;
};

export type HuecoCurva = {
  tallaFaltante: string;
  tallasConStock: string[];
};

/** Detecta huecos en UNA curva ya agrupada por producto+color+sede (todas
 *  las variantes que se pasan acá deben ser del mismo producto, mismo
 *  color, misma sede). Variantes sin talla (`talla: null`) se ignoran: no
 *  forman parte de ninguna curva. */
export function detectarHuecosCurva(variantes: VarianteParaCurva[]): HuecoCurva[] {
  const conTalla = variantes.filter((v): v is VarianteParaCurva & { talla: string } => v.talla !== null);
  if (conTalla.length < 3) return []; // hace falta al menos "antes, hueco, después" para que un hueco exista.

  const ordenadas = [...conTalla].sort((a, b) => compararTallas(a.talla, b.talla));
  const tallasConStock = ordenadas.filter((v) => v.stock > 0).map((v) => v.talla);

  const huecos: HuecoCurva[] = [];
  for (let i = 0; i < ordenadas.length; i++) {
    if (ordenadas[i].stock > 0) continue;
    const hayAntes = ordenadas.slice(0, i).some((v) => v.stock > 0);
    const hayDespues = ordenadas.slice(i + 1).some((v) => v.stock > 0);
    if (hayAntes && hayDespues) {
      huecos.push({ tallaFaltante: ordenadas[i].talla, tallasConStock });
    }
  }
  return huecos;
}

export type ProductoColorSede = {
  productoId: string;
  referencia: string;
  color: string | null;
  colorHex: string | null;
  sedeId: string;
  sedeNombre: string;
  variantes: VarianteParaCurva[];
};

export type CurvaIncompleta = {
  productoId: string;
  referencia: string;
  color: string | null;
  colorHex: string | null;
  sedeId: string;
  sedeNombre: string;
  tallaFaltante: string;
  tallasConStock: string[];
};

/** Agrupa y aplica `detectarHuecosCurva` a cada grupo producto+color+sede. */
export function detectarCurvasIncompletas(grupos: ProductoColorSede[]): CurvaIncompleta[] {
  const salida: CurvaIncompleta[] = [];
  for (const g of grupos) {
    for (const hueco of detectarHuecosCurva(g.variantes)) {
      salida.push({
        productoId: g.productoId,
        referencia: g.referencia,
        color: g.color,
        colorHex: g.colorHex,
        sedeId: g.sedeId,
        sedeNombre: g.sedeNombre,
        tallaFaltante: hueco.tallaFaltante,
        tallasConStock: hueco.tallasConStock,
      });
    }
  }
  return salida;
}
