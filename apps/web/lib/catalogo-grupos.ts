// La grilla de Vender es el plan B: cuando la etiqueta no lee, la encargada de sede busca
// la prenda con los ojos. La pistola trae talla, color y precio sola, así que la grilla no
// necesita una tarjeta por variante — una por PRENDA + COLOR, con las tallas adentro,
// alcanza y deja sitio para la foto (decisión de Felipe, 2026-09-14).
//
// Sin DOM ni React: se prueba sola. El padre (`PuntoDeVenta`) la memoiza y el catálogo
// (`PuntoDeVentaCatalogo`) solo la pinta.

export type VarianteAgrupable = {
  varianteId: string;
  referencia: string;
  color: string | null;
  talla: string | null;
  precio: number;
  stockAqui: number;
  /** Lo del almacén de esta sede (D-40): no se cobra, pero una talla con el piso en 0 y almacén no está «agotada». */
  almacenAqui?: number | null;
  categoria: string | null;
  fotoUrl: string | null;
};

export type TallaDelGrupo<T> = {
  /** La variante entera: es lo que va al ticket al tocar la talla. */
  variante: T;
  /** Etiqueta que se lee en el chip («M», «32», «Única»). */
  talla: string;
  stockAqui: number;
  /** Lo del almacén de esta sede; 0 sin almacén o sin dato. */
  almacenAqui: number;
};

export type GrupoCatalogo<T> = {
  /** Estable entre renders (`key` de React): referencia + color, separados por el
   *  separador de unidad ASCII (``, escrito como escape — nunca el byte crudo,
   *  que hace que git trate el archivo como binario). */
  clave: string;
  referencia: string;
  color: string | null;
  categoria: string | null;
  /** De la primera variante del grupo — todas comparten prenda+color, así que
   *  comparten foto. */
  fotoUrl: string | null;
  /** Ordenadas como se leen en tienda (ver `ordenTalla`). */
  tallas: TallaDelGrupo<T>[];
  stockTotal: number;
  /** Lo que hay en el almacén de esta sede, sumando las tallas: con `stockTotal` en 0 y esto > 0, la tarjeta no está
   *  agotada — está en el almacén (D-40). */
  almacenTotal: number;
  precioMin: number;
  precioMax: number;
};

const SIN_TALLA = "Única";

export function agruparCatalogo<T extends VarianteAgrupable>(variantes: T[]): GrupoCatalogo<T>[] {
  // Map conserva el orden de inserción: el primer color de cada prenda que aparece en el
  // catálogo manda la posición de su tarjeta.
  const grupos = new Map<string, GrupoCatalogo<T>>();
  for (const v of variantes) {
    const clave = `${v.referencia}\u001f${v.color ?? ""}`;
    let grupo = grupos.get(clave);
    if (!grupo) {
      grupo = {
        clave,
        referencia: v.referencia,
        color: v.color,
        categoria: v.categoria,
        fotoUrl: v.fotoUrl,
        tallas: [],
        stockTotal: 0,
        almacenTotal: 0,
        precioMin: v.precio,
        precioMax: v.precio,
      };
      grupos.set(clave, grupo);
    }
    const almacenAqui = Math.max(0, v.almacenAqui ?? 0);
    grupo.tallas.push({ variante: v, talla: v.talla?.trim() || SIN_TALLA, stockAqui: v.stockAqui, almacenAqui });
    grupo.stockTotal += v.stockAqui;
    grupo.almacenTotal += almacenAqui;
    grupo.precioMin = Math.min(grupo.precioMin, v.precio);
    grupo.precioMax = Math.max(grupo.precioMax, v.precio);
  }
  for (const grupo of grupos.values()) grupo.tallas.sort((a, b) => ordenTalla(a.talla, b.talla));
  return Array.from(grupos.values());
}

/** Las letras van de la más chica a la más grande; no alfabéticas (XS antes que S). */
const RANGO_LETRAS = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "XXXL"];

/** Orden en que se leen las tallas en la tienda: letras por tamaño, números por valor,
 *  y lo que no es ni lo uno ni lo otro al final, alfabético. */
export function ordenTalla(a: string, b: string): number {
  return peso(a) - peso(b) || a.localeCompare(b, "es");
}

function peso(talla: string): number {
  const t = talla.trim().toUpperCase();
  const letra = RANGO_LETRAS.indexOf(t);
  if (letra !== -1) return letra;
  const numero = Number(t);
  // Las numéricas van después de todas las letras, ordenadas entre sí por valor.
  if (t !== "" && Number.isFinite(numero)) return RANGO_LETRAS.length + numero;
  // Lo desconocido, después de cualquier número razonable.
  return Number.MAX_SAFE_INTEGER;
}
