// Familias de color (matiz): la agrupación que ven las dos pantallas que muestran colores
// (Atributos → Colores y Nuevo producto). Vive aparte para que agrupen igual.
export const FAMILIAS_COLOR = [
  { valor: "neutro", texto: "Neutro" },
  { valor: "azul", texto: "Azul" },
  { valor: "rojo", texto: "Rojo" },
  { valor: "amarillo", texto: "Amarillo" },
  { valor: "verde", texto: "Verde" },
  { valor: "morado", texto: "Morado" },
  { valor: "tierra", texto: "Tierra" },
  { valor: "metalico", texto: "Metálico" },
  { valor: "estampado", texto: "Estampado" },
] as const;

export function textoDeFamilia(valor: string | null | undefined): string {
  return FAMILIAS_COLOR.find((f) => f.valor === valor)?.texto ?? "Sin familia";
}

/**
 * Fondo CSS de una muestra de color. Un metálico lleva un reflejo (luz arriba, sombra abajo) sobre su hex: pintado
 * plano, «Plata vieja» es el mismo gris que «Gris» y «Champán» el mismo beige que «Beige» (ΔE2000 3 y 4, revisión
 * del 2026-09-25), y la muestra tiene que decir «esto es metal» antes de que alguien lea el nombre. El reflejo sale
 * de los tokens de la paleta (crema y tinta), no de un color suelto.
 */
export function fondoDeMuestra(hex: string | null, familiaColor?: string | null): string | undefined {
  if (!hex) return undefined;
  if (familiaColor !== "metalico") return hex;
  return `linear-gradient(135deg, color-mix(in srgb, var(--color-crema) 75%, transparent) 0%, transparent 48%, color-mix(in srgb, var(--color-tinta) 28%, transparent) 100%), ${hex}`;
}
