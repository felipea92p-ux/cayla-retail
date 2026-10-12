/**
 * Lo que se dice en «Por revisar» (Catálogo ▸ Productos, ADR-0371): la cola de prendas que alguien propuso sin editar el catálogo
 * (el conteo, el «Modelo nuevo» del Taller) y que un líder aprueba o rechaza.
 *
 * La REGLA de qué se puede revisar no vive aquí: la decide `revisar_producto_censo` en la base (permiso, idempotencia, y que rechazar
 * se niegue con una orden en proceso o con stock). Este archivo solo (1) lee las filas de `fn_productos_por_revisar`, (2) redacta lo
 * que se le dice a quien revisa y (3) adelanta el bloqueo del rechazo, con las mismas dos condiciones de la base, para que el botón
 * no prometa lo que la base va a negar. Si la base cambia la regla, `bloqueoDeRechazo` y su prueba son lo primero que hay que tocar.
 */
import type { Database } from "@cayla-retail/database";
import { compararTallas } from "./tallas";
import { etiquetaDia } from "./cambios-reglas";
import { soles } from "./compras-reglas";
import { traducirError, type ErrorEscritura } from "./error-escritura";

export type FilaPorRevisar = Database["retail"]["Functions"]["fn_productos_por_revisar"]["Returns"][number];

export type ProductoPorRevisar = {
  productoId: string;
  referencia: string;
  codigo: string | null;
  categoria: string | null;
  /** Prefijo y familia de su categoría y un color suyo: con eso la miniatura sin foto dibuja el ícono de la categoría sobre el
   *  color de la prenda (ADR-0333). Se llaman como los de `categoriaDe()`, así que la fila se pasa tal cual. */
  categoriaPrefijo: string | null;
  categoriaFamilia: string | null;
  colorHex: string | null;
  marca: string | null;
  /** ISO de cuándo se creó. */
  creadoEn: string;
  /** Nombre de quien la propuso; `null` si no se anotó (cuentas sin responsable). */
  propuestoPor: string | null;
  /** La sede desde la que se operó al crearla (`producto_origen`); `null` si no se anotó. */
  sede: string | null;
  sedeTipo: string | null;
  terminal: string | null;
  variantes: number;
  /** En su orden de curva (S · M · L, 28 · 30 · 32). */
  tallas: string[];
  colores: string[];
  precioMin: number | null;
  precioMax: number | null;
  /** Prendas en stock, sumando todas las sedes. */
  stock: number;
  /** Órdenes de producción en proceso de este modelo. */
  ordenesAbiertas: number;
};

/** Lo que devuelve la base, con tallas en su orden de curva y los números como números (PostgREST manda `numeric` como texto o número). */
export function leerPorRevisar(filas: readonly FilaPorRevisar[]): { productos: ProductoPorRevisar[]; total: number } {
  const num = (v: unknown): number | null => {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  return {
    productos: filas.map((f) => ({
      productoId: f.producto_id,
      referencia: f.referencia,
      codigo: f.codigo ?? null,
      categoria: f.categoria ?? null,
      categoriaPrefijo: f.categoria_prefijo ?? null,
      categoriaFamilia: f.categoria_familia ?? null,
      colorHex: f.color_hex ?? null,
      marca: f.marca ?? null,
      creadoEn: f.creado_en,
      propuestoPor: f.propuesto_por_nombre ?? null,
      sede: f.sede ?? null,
      sedeTipo: f.sede_tipo ?? null,
      terminal: f.terminal ?? null,
      variantes: num(f.variantes) ?? 0,
      tallas: [...(f.tallas ?? [])].sort(compararTallas),
      colores: [...(f.colores ?? [])].sort((a, b) => a.localeCompare(b, "es")),
      precioMin: num(f.precio_min),
      precioMax: num(f.precio_max),
      stock: num(f.stock) ?? 0,
      ordenesAbiertas: num(f.ordenes_abiertas) ?? 0,
    })),
    total: num(filas[0]?.total) ?? 0,
  };
}

const plural = (n: number, uno: string, varios: string) => `${n.toLocaleString("es-PE")} ${n === 1 ? uno : varios}`;

/** «S/ 79.90», «S/ 59.90 a S/ 79.90», o «Sin precio» (una muestra puede ir sin precio y se completa al aprobarla, ADR-0361). */
export function textoPrecio(min: number | null, max: number | null): string {
  if (min === null || max === null || max <= 0) return "Sin precio";
  return min === max ? soles(min) : `${soles(min)} a ${soles(max)}`;
}

/** «6 variantes · tallas S, M, L · colores Beige, Negro» (sin lo que no tenga: una prenda sin color no dice «colores»). */
export function textoVariantes(p: Pick<ProductoPorRevisar, "variantes" | "tallas" | "colores">): string {
  const partes = [plural(p.variantes, "variante", "variantes")];
  if (p.tallas.length > 0) partes.push(`${p.tallas.length === 1 ? "talla" : "tallas"} ${p.tallas.join(", ")}`);
  if (p.colores.length > 0) partes.push(`${p.colores.length === 1 ? "color" : "colores"} ${p.colores.join(", ")}`);
  return partes.join(" · ");
}

/** Desde dónde nació: la sede (y la terminal si la hay), o que no se anotó. */
export function textoOrigen(p: Pick<ProductoPorRevisar, "sede" | "terminal">): string {
  if (!p.sede) return "No se anotó desde dónde";
  return p.terminal ? `${p.sede} · ${p.terminal}` : p.sede;
}

/** «Propuesta por Micaela Pérez · hoy». */
export function textoPropuesta(p: Pick<ProductoPorRevisar, "propuestoPor" | "creadoEn">, ahora: Date): string {
  const cuando = etiquetaDia(p.creadoEn, ahora).toLowerCase();
  const cuandoTexto = cuando === "hoy" || cuando === "ayer" ? cuando : `el ${cuando}`;
  return p.propuestoPor ? `Propuesta por ${p.propuestoPor} · ${cuandoTexto}` : `Propuesta ${cuandoTexto}, sin responsable anotado`;
}

export type BloqueoRechazo = {
  motivo: "ordenes" | "stock";
  /** Una frase corta para la fila y la hoja. */
  texto: string;
  /** Qué hacer, completo. */
  queHacer: string;
};

/**
 * ¿Se puede rechazar? Las mismas dos condiciones de la base (`revisar_producto_censo`, ADR-0371): una orden de producción en
 * proceso, o stock. Rechazar es permanente (la prenda queda descontinuada y no se reactiva) y cerrar una orden no mira el estado
 * del producto: una orden abierta de un modelo rechazado igual metería stock. Aprobar nunca se bloquea.
 */
export function bloqueoDeRechazo(p: Pick<ProductoPorRevisar, "ordenesAbiertas" | "stock">): BloqueoRechazo | null {
  if (p.ordenesAbiertas > 0) {
    const cuantas = p.ordenesAbiertas === 1 ? "una orden de producción" : `${p.ordenesAbiertas} órdenes de producción`;
    return {
      motivo: "ordenes",
      texto: `Tiene ${cuantas} en proceso`,
      queHacer: `Anula ${p.ordenesAbiertas === 1 ? "esa orden" : "esas órdenes"} en Producción y vuelve a revisar la prenda. Si la prenda está bien, apruébala.`,
    };
  }
  if (p.stock > 0) {
    return {
      motivo: "stock",
      texto: `Tiene ${p.stock === 1 ? "una prenda" : `${p.stock.toLocaleString("es-PE")} prendas`} en stock`,
      queHacer: "Ajusta su stock a 0 en Existencias y vuelve a revisarla. Si la prenda está bien, apruébala; o descontínuala en su ficha, que se puede deshacer.",
    };
  }
  return null;
}

export type ModoRevision = "aprobar" | "rechazar";

export type TextosRevision = {
  titulo: string;
  subtitulo: string;
  nota: string;
  boton: string;
  exito: string;
  /** Para `traducirError`: «aprobar la prenda». */
  accionError: string;
};

export function textosRevision(modo: ModoRevision, referencia: string): TextosRevision {
  if (modo === "aprobar") {
    return {
      titulo: `Aprobar «${referencia}»`,
      subtitulo: "Queda como cualquier otra prenda del catálogo.",
      nota: "Deja de aparecer en «Por revisar». Nada más cambia: ya se podía vender y contar.",
      boton: "Aprobar la prenda",
      exito: `«${referencia}» quedó aprobada.`,
      accionError: "aprobar la prenda",
    };
  }
  return {
    titulo: `Rechazar «${referencia}»`,
    subtitulo: "Se usa cuando la prenda se creó por error o está repetida.",
    nota: "Rechazar es permanente: la prenda queda descontinuada y ya no se puede reactivar. No se borra nada: sigue en el historial. Si solo quieres sacarla de venta por ahora, descontínuala en su ficha: eso sí se puede deshacer.",
    boton: "Rechazar la prenda",
    exito: `«${referencia}» se rechazó y quedó descontinuada.`,
    accionError: "rechazar la prenda",
  };
}

/** Los `hint` con los que `revisar_producto_censo` rechaza. Sus mensajes ya vienen en castellano de tienda: se muestran tal cual. */
export const HINTS_REVISION = new Set(["con_ordenes_abiertas", "con_stock", "ya_revisada", "no_existe", "sin_permiso", "datos_incompletos"]);

/** ¿Alguien más ya decidió esta prenda? Entonces lo que se ve está viejo y la pantalla se refresca. */
export function yaSeRevisoOtraVez(error: ErrorEscritura): boolean {
  return !!error && error.hint === "ya_revisada";
}

/** Lo que se le dice a quien revisa cuando la base dice que no: su mensaje si es de las reglas de arriba; si no, el de siempre. */
export function mensajeDeRevision(error: ErrorEscritura, contexto: string): string {
  if (error && error.hint && HINTS_REVISION.has(error.hint) && error.message) return error.message;
  return traducirError(error, contexto);
}
