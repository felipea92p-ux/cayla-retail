// Cómo el POS reconoce una prenda a partir de lo que llega al buscador — reescrito
// contra el catálogo V2 al reconciliar Vender (2026-09-12). El módulo V1
// (`buscar-prenda.ts`, con prueba) se borró en el corte a V2; esta es la misma idea,
// más simple porque V2 ya no distingue "código corto" de "SKU" — solo `sku` y la
// lista `codigosBarras` (impresos o de fábrica) por variante.
//
// - Un escaneo: la pistola manda el código completo y Enter. Se compara contra el
//   `sku` o cualquiera de los `codigosBarras` de cada variante, sin mayúsculas.
// - Texto a medias: se busca en sku, referencia, talla y color, sin acentos ni
//   mayúsculas — misma regla que el conteo/buscador global.

export type PrendaBuscableV2 = {
  varianteId: string;
  sku: string;
  referencia: string;
  talla: string | null;
  color: string | null;
  codigosBarras: string[];
};

export function clave(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

export function resolverCodigoV2<T extends PrendaBuscableV2>(texto: string, variantes: T[]): T | null {
  const t = clave(texto);
  if (!t) return null;
  return (
    variantes.find((v) => clave(v.sku) === t) ??
    variantes.find((v) => v.codigosBarras.some((c) => clave(c) === t)) ??
    null
  );
}

export function filtrarPrendasV2<T extends PrendaBuscableV2>(texto: string, variantes: T[], max: number): T[] {
  const k = clave(texto);
  if (!k) return [];
  return variantes
    .filter((v) => clave(`${v.sku} ${v.referencia} ${v.talla ?? ""} ${v.color ?? ""} ${v.codigosBarras.join(" ")}`).includes(k))
    .slice(0, max);
}
