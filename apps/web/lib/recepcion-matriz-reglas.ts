import type { LineaRecepcion } from "@/lib/compras-reglas";

/** Lo recibido de UN modelo, en matriz: una fila por color, una columna por talla (desplegable de «Lo recibido»). */
export type MatrizModelo = {
  modelo: string;
  tallas: string[];
  colores: { color: string; porTalla: Record<string, number>; total: number }[];
  total: number;
};

const ORDEN_LETRAS = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "XXXL"];
const SIN_TALLA = "Única";
const SIN_COLOR = "Sin color";

/** Letras (S, M, L…) en su orden de tienda, luego las numéricas de menor a mayor y al final lo demás. */
export function compararTallas(a: string, b: string): number {
  const rango = (t: string) => {
    const i = ORDEN_LETRAS.indexOf(t.toUpperCase());
    if (i >= 0) return [0, i] as const;
    const n = Number(t.replace(",", "."));
    if (t.trim() !== "" && Number.isFinite(n)) return [1, n] as const;
    return [2, 0] as const;
  };
  const [ga, na] = rango(a);
  const [gb, nb] = rango(b);
  return ga - gb || na - nb || a.localeCompare(b, "es");
}

/** Agrupa el detalle de una recepción por modelo (`referencia`), con colores en filas y tallas en columnas. Suma las líneas repetidas. */
export function matricesDeRecepcion(detalle: LineaRecepcion[]): MatrizModelo[] {
  const porModelo = new Map<string, Map<string, Record<string, number>>>();
  for (const l of detalle) {
    const colores = porModelo.get(l.referencia) ?? new Map<string, Record<string, number>>();
    const color = l.color?.trim() || SIN_COLOR;
    const talla = l.talla?.trim() || SIN_TALLA;
    const fila = colores.get(color) ?? {};
    fila[talla] = (fila[talla] ?? 0) + l.cantidad;
    colores.set(color, fila);
    porModelo.set(l.referencia, colores);
  }
  return [...porModelo].map(([modelo, colores]) => {
    const tallas = [...new Set([...colores.values()].flatMap((f) => Object.keys(f)))].sort(compararTallas);
    const filas = [...colores].map(([color, porTalla]) => ({ color, porTalla, total: Object.values(porTalla).reduce((s, n) => s + n, 0) }));
    return { modelo, tallas, colores: filas, total: filas.reduce((s, f) => s + f.total, 0) };
  });
}
