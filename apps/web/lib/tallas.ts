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
  // "Estándar"/"Único" son los valores reales del vocabulario cerrado
  // (20260917100000_tallas_vocabulario_cerrado.sql); antes solo se
  // reconocían las grafías de V1 y caían en "desconocida".
  if (["ÚNICA", "UNICA", "ÚNICO", "UNICO", "STD", "U", "ESTÁNDAR", "ESTANDAR"].includes(t)) return [3, 0];
  return [2, t];
}

export function compararTallas(a: string, b: string): number {
  const [ga, va] = rango(a);
  const [gb, vb] = rango(b);
  if (ga !== gb) return ga - gb;
  if (typeof va === "number" && typeof vb === "number") return va - vb;
  return String(va).localeCompare(String(vb), "es");
}
