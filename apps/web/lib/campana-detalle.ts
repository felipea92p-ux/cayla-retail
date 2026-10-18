import type { CampoDeGuia } from "./guia-campos";
import { campanaValida, camposDeCampana } from "./etiqueta-campana-guia";

// Tienda web ▸ Campañas ▸ una campaña por dentro (ADR-0436, actividad 2): leer lo que devuelve `campana_detalle` y la regla del
// formulario de Datos. Lógica pura (servidor y navegador), probada en `campana-detalle.test.ts`.
//
// PROMETE: la forma de la campaña o null (la pantalla dice «no se pudo leer» en vez de dibujar a medias); qué apaga «Guardar» y, con la
// MISMA regla, la guía de foco campo por campo (una prueba exige que coincidan). NO agrega reglas: el nombre de 1 a 60 letras y sin
// repetir, y el descuento de 0 a 100, son las de la base (`fn_campana_nombre_valido`, `actualizar_campana_etiqueta`).

export type PrendaDeCampana = {
  productoId: string;
  nombre: string;
  codigo: string | null;
  categoria: string | null;
  prefijo: string | null;
  familia: string | null;
  foto: string | null;
  /** Cuántas variantes de este modelo lleva la campaña a mano. */
  variantes: number;
  colores: { nombre: string; hex: string | null }[];
};

export type CampanaDetalle = {
  id: string;
  nombre: string;
  activo: boolean;
  estado: "aprobado" | "pendiente";
  desde: string | null;
  hasta: string | null;
  pct: number | null;
  categoriaIds: string[];
  varianteIds: string[];
  prendas: PrendaDeCampana[];
};

type Crudo = Record<string, unknown>;
const esObjeto = (x: unknown): x is Crudo => !!x && typeof x === "object" && !Array.isArray(x);
const texto = (x: unknown): string | null => (typeof x === "string" ? x : null);
const fecha = (x: unknown): string | null | undefined => (x === null ? null : typeof x === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x) ? x : undefined);
const ids = (x: unknown): string[] | null => (Array.isArray(x) && x.every((y) => typeof y === "string") ? (x as string[]) : null);

function leerPrenda(x: unknown): PrendaDeCampana | null {
  if (!esObjeto(x) || typeof x.producto_id !== "string" || typeof x.nombre !== "string" || typeof x.variantes !== "number") return null;
  const colores = Array.isArray(x.colores)
    ? x.colores.flatMap((c) => (esObjeto(c) && typeof c.nombre === "string" ? [{ nombre: c.nombre, hex: texto(c.hex) }] : []))
    : [];
  return {
    productoId: x.producto_id,
    nombre: x.nombre,
    codigo: texto(x.codigo),
    categoria: texto(x.categoria),
    prefijo: texto(x.prefijo),
    familia: texto(x.familia),
    foto: texto(x.foto),
    variantes: x.variantes,
    colores,
  };
}

export function leerCampanaDetalle(dato: unknown): CampanaDetalle | null {
  if (!esObjeto(dato) || typeof dato.id !== "string" || typeof dato.nombre !== "string" || typeof dato.activo !== "boolean") return null;
  if (dato.estado !== "aprobado" && dato.estado !== "pendiente") return null;
  const desde = fecha(dato.desde);
  const hasta = fecha(dato.hasta);
  const pct = dato.pct === null ? null : Number(dato.pct);
  const categoriaIds = ids(dato.categoria_ids);
  const varianteIds = ids(dato.variante_ids);
  const prendas = Array.isArray(dato.prendas) ? dato.prendas.map(leerPrenda) : null;
  if (desde === undefined || hasta === undefined || (pct !== null && !(pct > 0)) || !categoriaIds || !varianteIds) return null;
  if (!prendas || !prendas.every((p): p is PrendaDeCampana => p !== null)) return null;
  return { id: dato.id, nombre: dato.nombre, activo: dato.activo, estado: dato.estado, desde, hasta, pct, categoriaIds, varianteIds, prendas };
}

/* ---------------- El formulario de Datos ---------------- */

/** El tope del nombre, el mismo de `fn_campana_nombre_valido` en la base. */
export const NOMBRE_MAX = 60;

/**
 * El nombre como lo guarda la base: sin espacios de más y sin caracteres invisibles (ancho cero, marca de orden de bytes) ni los que dan vuelta
 * la lectura: «Navi​dad» con uno de esos se veía igual que «Navidad» y se creaba como una campaña nueva. Lo visible no se toca.
 */
export const limpiarNombre = (s: string) =>
  s
    .replace(/[\u200b-\u200d\u2060\ufeff\u202a-\u202e\u2066-\u2069]/g, "")
    .replace(/\s+/g, " ")
    .trim();

export type EntradaDatos = { nombre: string; descuento: string; desde: string; hasta: string; categorias: number; puedeDarDescuento: boolean };

/** Lo que apaga «Guardar»: un nombre de 1 a 60 letras, y descuento y fechas bien escritos (`campanaValida`, la regla de Atributos). */
export function datosValidos(e: Pick<EntradaDatos, "nombre" | "descuento" | "desde" | "hasta">): boolean {
  const n = limpiarNombre(e.nombre);
  return n.length > 0 && n.length <= NOMBRE_MAX && campanaValida(e);
}

/** La guía de foco del formulario, campo por campo: el nombre (obligatorio) y los de la campaña (opcionales salvo que estén mal). */
export function camposDeDatos(e: EntradaDatos): CampoDeGuia[] {
  const n = limpiarNombre(e.nombre);
  return [
    {
      id: "nombre",
      nombre: "Nombre",
      requerido: true,
      hecho: n.length > 0 && n.length <= NOMBRE_MAX,
      pendiente: n.length > NOMBRE_MAX ? `El nombre es muy largo: hasta ${NOMBRE_MAX} letras.` : "Escribe el nombre de la campaña.",
    },
    ...camposDeCampana(e),
  ];
}
