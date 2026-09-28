/**
 * Cómo se dice cada fila de `historial_producto_cambios` en el historial de una prenda (`HistorialProductoPanel`). Puro:
 * sin React ni supabase.
 *
 * EL PROBLEMA. El ledger lo llenan varios disparadores y funciones, y cada uno con su `campo`: `categoria_id`, `estado`,
 * `marca_id`, `proveedor_id` (del producto), `precio` y `costo` (de la variante) y, desde ADR-0246, `temporada` y
 * `temporada:<COLOR>` (la excepción de un color). El panel solo conocía tres y a cualquier otro lo pintaba como precio
 * («— → S/NaN» para una temporada). Aquí vive UNA tabla de campos; uno que no esté en ella se muestra con su valor tal
 * cual, nunca como dinero.
 *
 * Desde ADR-0263 (2026-09-28) la variante también anota `color` (el código; vacío = «Sin color»), `talla` (el VALOR,
 * «S», no el uuid), `codigo` (el que lee la pistola, cuando se recalcula al corregir) y `activo` ('true'/'false'): el
 * color y la talla de una variante se corrigen desde la ficha, y todo cambio tiene que quedar con quién lo hizo.
 *
 * Antes de ADR-0263, la corrección «solo sin historia» (ADR-0258, 20260928235500, pegada en producción el mismo día)
 * anotaba los mismos cambios con otro nombre: `color_codigo` (el código, como `color`) y `talla_id` (el uuid de la talla,
 * no su valor). Esas filas ya están en el historial y se quedan: se dicen igual que las nuevas, la talla buscando su valor.
 */

export type NombresHistorial = {
  /** clave → nombre de la lista de temporadas (`fn_temporadas`). */
  temporadas: ReadonlyMap<string, string>;
  /** código → nombre del color (para `temporada:<COLOR>` y el color de una variante corregida). */
  colores: ReadonlyMap<string, string>;
  /** id → valor de la talla («S»), para las filas `talla_id` de ADR-0258 (las de ADR-0263 ya traen el valor). */
  tallas: ReadonlyMap<string, string>;
  marcas: ReadonlyMap<string, string>;
  proveedores: ReadonlyMap<string, string>;
};

export const NOMBRES_VACIOS: NombresHistorial = { temporadas: new Map(), colores: new Map(), tallas: new Map(), marcas: new Map(), proveedores: new Map() };

/** El prefijo de la excepción por color: `temporada:NEG` (20260928100000, `asignar_temporadas`). */
export const PREFIJO_TEMPORADA_COLOR = "temporada:";

const ETIQUETA_CAMPO: Record<string, string> = {
  categoria_id: "Categoría",
  precio: "Precio",
  costo: "Costo",
  estado: "Estado",
  marca_id: "Marca",
  proveedor_id: "Proveedor",
  temporada: "Temporada",
  color: "Color",
  talla: "Talla",
  // Los mismos cambios anotados por ADR-0258 (ver arriba).
  color_codigo: "Color",
  talla_id: "Talla",
  codigo: "Código",
  activo: "Estado",
};

const ETIQUETA_ESTADO: Record<string, string> = { activo: "Activo", descontinuado: "Descontinuado" };

/** `activo` de una variante: la base lo anota como texto de un booleano. */
const ETIQUETA_ACTIVA: Record<string, string> = { true: "Activa", false: "Desactivada" };

/**
 * ¿Esta fila se muestra a esta cuenta? El `costo` solo a quien ve el dinero de compras (20260923193700: la base ya no deja
 * leer `variantes.costo` directo y la ficha no muestra el campo a los demás): el historial no puede ser la puerta trasera.
 */
export function cambioVisible(campo: string, verCosto: boolean): boolean {
  return campo !== "costo" || verCosto;
}

/** El color de una fila `temporada:<COLOR>`, o `null` si la fila es de otro campo. */
export function colorDeCampo(campo: string): string | null {
  return campo.startsWith(PREFIJO_TEMPORADA_COLOR) ? campo.slice(PREFIJO_TEMPORADA_COLOR.length) || null : null;
}

/** «Temporada», «Temporada · Marfil», «Precio»… Un campo que no está en la tabla sale con su nombre tal cual. */
export function etiquetaCampo(campo: string, nombres: NombresHistorial = NOMBRES_VACIOS): string {
  const color = colorDeCampo(campo);
  if (color) return `Temporada · ${nombres.colores.get(color) ?? color}`;
  return ETIQUETA_CAMPO[campo] ?? campo;
}

const soles = (valor: string | null) => (valor && Number.isFinite(Number(valor)) ? `S/${Number(valor).toFixed(2)}` : "—");

/**
 * El valor de un lado del cambio, en palabras de tienda. `categoriaNombre`: lo que ya resolvió la base para
 * `categoria_id` (el nombre, no el uuid).
 */
export function textoValorCambio(campo: string, valor: string | null, categoriaNombre: string | null, nombres: NombresHistorial = NOMBRES_VACIOS): string {
  if (campo === "categoria_id") return categoriaNombre ?? "Sin categoría";
  if (campo === "precio" || campo === "costo") return soles(valor);
  if (campo === "estado") return valor ? (ETIQUETA_ESTADO[valor] ?? valor) : "—";
  if (campo === "temporada") return valor ? (nombres.temporadas.get(valor) ?? valor) : "Sin temporada propia";
  if (colorDeCampo(campo)) return valor ? (nombres.temporadas.get(valor) ?? valor) : "Igual que su prenda";
  if (campo === "marca_id") return valor ? (nombres.marcas.get(valor) ?? "Una marca que ya no está") : "Sin marca";
  if (campo === "proveedor_id") return valor ? (nombres.proveedores.get(valor) ?? "Un proveedor que ya no está") : "Sin proveedor";
  if (campo === "color" || campo === "color_codigo") return valor ? (nombres.colores.get(valor) ?? valor) : "Sin color";
  if (campo === "talla") return valor || "Sin talla";
  // ADR-0258 anotaba el uuid: se dice su valor; si no se pudo leer, se dice eso (nunca el uuid).
  if (campo === "talla_id") return valor ? (nombres.tallas.get(valor) ?? "Una talla que no se pudo leer") : "Sin talla";
  if (campo === "activo") return valor ? (ETIQUETA_ACTIVA[valor] ?? valor) : "—";
  return valor ?? "—";
}

/** Qué nombres hay que buscar para pintar estas filas (solo se consulta lo que hace falta). */
export function nombresPorBuscar(filas: readonly { campo: string; valor_anterior: string | null; valor_nuevo: string | null }[]): {
  temporadas: boolean;
  colores: string[];
  tallas: string[];
  marcas: string[];
  proveedores: string[];
} {
  const colores = new Set<string>();
  const tallas = new Set<string>();
  const marcas = new Set<string>();
  const proveedores = new Set<string>();
  let temporadas = false;
  for (const f of filas) {
    const color = colorDeCampo(f.campo);
    if (f.campo === "temporada" || color) temporadas = true;
    if (color) colores.add(color);
    // El color de una variante corregida (ADR-0263; `color_codigo` en ADR-0258): se buscan los dos nombres, el de antes y el
    // de ahora. La talla de ADR-0258 viene como uuid: se busca su valor.
    if (f.campo === "color" || f.campo === "color_codigo") for (const v of [f.valor_anterior, f.valor_nuevo]) if (v) colores.add(v);
    if (f.campo === "talla_id") for (const v of [f.valor_anterior, f.valor_nuevo]) if (v) tallas.add(v);
    const destino = f.campo === "marca_id" ? marcas : f.campo === "proveedor_id" ? proveedores : null;
    if (destino) for (const v of [f.valor_anterior, f.valor_nuevo]) if (v) destino.add(v);
  }
  return { temporadas, colores: [...colores], tallas: [...tallas], marcas: [...marcas], proveedores: [...proveedores] };
}
