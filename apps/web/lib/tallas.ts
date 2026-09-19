// Orden canónico de tallas para dibujar una curva (S · M · L, 36 · 38 · 40).
//
// Por qué existe: al recibir una línea agrupada ("Blusa Lino x 24") se
// reparte por talla y color, y las variantes llegan del catálogo en el orden
// en que se crearon — "M, S, L" confunde a quien cuenta contra la caja. Las
// tallas de CAYLA son letras (XS…XXL), números (36, 38…) o "Única"; cualquier
// otra cosa va al final en orden alfabético para no perderla.
const LETRAS = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "2XL", "XXXL", "3XL", "4XL"];

function rango(talla: string): [number, number | string] {
  const t = talla.trim().toUpperCase();
  const letra = LETRAS.indexOf(t);
  if (letra >= 0) return [0, letra];
  const n = Number(t);
  if (Number.isFinite(n)) return [1, n];
  // "Estándar"/"Única" son los valores reales del vocabulario cerrado
  // (20260917100000_tallas_vocabulario_cerrado.sql); antes solo se
  // reconocían las grafías de V1 y caían en "desconocida".
  if (["ÚNICA", "UNICA", "ÚNICO", "UNICO", "STD", "U", "ESTÁNDAR", "ESTANDAR"].includes(t)) return [3, 0];
  return [2, t];
}

// Qué tipo de talla es — lo usa Atributos → Tallas para agrupar la pantalla.
// Sale del mismo `rango` que ordena la curva, así que "qué grupo es" y "en qué
// orden va" no pueden contradecirse: 0 letras, 1 numeración, 3 única/estándar,
// 2 lo que no reconocemos (va al final, no se pierde).
export type TipoTalla = "letras" | "numeracion" | "unica" | "otras";

const TIPO_POR_GRUPO: Record<number, TipoTalla> = { 0: "letras", 1: "numeracion", 3: "unica", 2: "otras" };

export function tipoDeTalla(talla: string): TipoTalla {
  return TIPO_POR_GRUPO[rango(talla)[0]];
}

export function compararTallas(a: string, b: string): number {
  const [ga, va] = rango(a);
  const [gb, vb] = rango(b);
  if (ga !== gb) return ga - gb;
  if (typeof va === "number" && typeof vb === "number") return va - vb;
  return String(va).localeCompare(String(vb), "es");
}
