// «¿Es alguna de estas?» (auditoría del ERP, bloque 1, A2; Felipe 2026-10-14): antes de anotar una prenda «sin registrar», la hoja
// ofrece las prendas del catálogo que YA están en el piso de esta tienda con la misma categoría, talla y color. Si es una de ellas,
// entra al ticket como venta normal (descuenta stock, lleva su costo) y la cola de regularizar no la recibe. Lógica pura: la usa
// `PrendaSinRegistrarModal` con el catálogo que Vender ya tiene cargado, sin otra consulta.
//
// CONTRATO
//   PROMETE: las variantes con EXACTAMENTE la categoría, la talla y el color elegidos (por id y por código, nunca por el nombre
//            visible: ADR-0290) que se pueden cobrar ahora en esta sede, de la que más unidades tiene a la que menos.
//   ASUME:   la misma definición de «posible» que `fn_candidatas_de_venta` (ADR-0334): misma categoría, talla y color, y al menos
//            una unidad cobrable. Qué es «cobrable» lo decide quien llama (`motivoNoCobrable === "cobrable"`, el mismo criterio
//            con que Vender deja entrar una prenda al ticket): así «posible» aquí es exactamente «vendible» allá.
//   NO HACE: no elige por la persona (dos o tres posibles se muestran todas) y no anota nada. Un catálogo guardado antes de que
//            las variantes trajeran `categoriaId`/`tallaId` no ofrece nada: nunca adivina por nombre.
import { ID_CARGO_ESPECIAL } from "./cargo-especial";

export type PrendaParaPosibles = {
  varianteId: string;
  referencia: string;
  talla: string | null;
  color: string | null;
  colorHex?: string | null;
  colorCodigo?: string | null;
  categoriaId?: string | null;
  tallaId?: string | null;
  fotoUrl: string | null;
  precio: number;
  categoria: string | null;
  categoriaPrefijo?: string | null;
  categoriaFamilia?: string | null;
  stockAqui: number;
};

export type ElegidoEnLaHoja = { categoriaId: string; tallaId: string; colorCodigo: string };

export type PrendaPosible = Pick<
  PrendaParaPosibles,
  "varianteId" | "referencia" | "talla" | "color" | "colorHex" | "fotoUrl" | "precio" | "categoria" | "categoriaPrefijo" | "categoriaFamilia" | "stockAqui"
>;

export function prendasPosibles<V extends PrendaParaPosibles>(
  variantes: readonly V[],
  elegido: Partial<ElegidoEnLaHoja>,
  cobrable: (v: V) => boolean,
): PrendaPosible[] {
  if (!elegido.categoriaId || !elegido.tallaId || !elegido.colorCodigo) return [];
  return variantes
    .filter(
      (v) =>
        v.varianteId !== ID_CARGO_ESPECIAL &&
        v.categoriaId === elegido.categoriaId &&
        v.tallaId === elegido.tallaId &&
        v.colorCodigo === elegido.colorCodigo &&
        cobrable(v),
    )
    .sort((a, b) => b.stockAqui - a.stockAqui || a.referencia.localeCompare(b.referencia, "es"))
    .map((v) => ({
      varianteId: v.varianteId,
      referencia: v.referencia,
      talla: v.talla,
      color: v.color,
      colorHex: v.colorHex ?? null,
      fotoUrl: v.fotoUrl,
      precio: v.precio,
      categoria: v.categoria,
      categoriaPrefijo: v.categoriaPrefijo ?? null,
      categoriaFamilia: v.categoriaFamilia ?? null,
      stockAqui: v.stockAqui,
    }));
}

/** Lo que la hoja dice sobre las posibles: cuántas hay en el piso de esta tienda. */
export function fraseDePosibles(n: number): string {
  return n === 1 ? "Hay 1 prenda así en el piso de tu tienda. ¿Es esta?" : `Hay ${n} prendas así en el piso de tu tienda. ¿Es alguna de estas?`;
}

/** La línea de abajo de cada posible: talla · color · cuántas quedan. */
export function detalleDePosible(p: Pick<PrendaPosible, "talla" | "color" | "stockAqui">): string {
  const quedan = p.stockAqui === 1 ? "1 en el piso" : `${p.stockAqui} en el piso`;
  return [p.talla, p.color, quedan].filter(Boolean).join(" · ");
}
