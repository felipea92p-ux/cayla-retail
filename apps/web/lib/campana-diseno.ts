import {
  DISENO_DE_SIEMPRE,
  estiloDelDiseno,
  leerDiseno,
  mismoDiseno,
  paletaDelDiseno,
  paletasDeLasPrendas,
  type ColoresPropios,
  type ContextoRevision,
  type DisenoDeCampana,
} from "@cayla-retail/portada";
import type { EstadoCampo } from "@/lib/guia-campos";
import type { CategoriaDePrenda } from "@/lib/categoria-de-prenda";
import type { PrendaDeCampana } from "@/lib/campana-detalle";
import type { DiaPortada } from "@/lib/campanas-reglas";

// Tienda web ▸ Campañas ▸ una campaña ▸ «Diseño en la web» (ADR-0436, actividad 4): lo que la pantalla lee de la base y decide sin
// dibujar. El diseño en sí (sus opciones, sus colores y la revisión) vive en @cayla-retail/portada, el mismo paquete que pinta la tienda.

export type EstadoDiseno = {
  /** Lo que se está probando y todavía no ve el cliente; su `version` evita pisar el trabajo de otra persona. */
  borrador: { diseno: DisenoDeCampana; version: number } | null;
  /** Lo que ve el cliente hoy (si la campaña sale en la portada). */
  publicado: { diseno: DisenoDeCampana; publicadoEn: string; publicadoPor: string | null } | null;
  /** El que «Volver al anterior» regresa. */
  anterior: { diseno: DisenoDeCampana; publicadoEn: string } | null;
};

const SIN_NADA: EstadoDiseno = { borrador: null, publicado: null, anterior: null };

function objeto(x: unknown): Record<string, unknown> | null {
  return typeof x === "object" && x !== null && !Array.isArray(x) ? (x as Record<string, unknown>) : null;
}

/**
 * Lo que devuelve `retail.campana_diseno`. Un diseño que esta versión de la web no sabe leer cuenta como que no está (la pantalla abre la
 * portada de siempre y no se cae); si la respuesta entera no tiene forma, `null`: la pestaña lo dice.
 */
export function leerEstadoDiseno(x: unknown): EstadoDiseno | null {
  const o = objeto(x);
  if (!o) return null;
  const b = objeto(o.borrador);
  const p = objeto(o.publicado);
  const a = objeto(o.anterior);
  const db = b ? leerDiseno(b.diseno) : null;
  const dp = p ? leerDiseno(p.diseno) : null;
  const da = a ? leerDiseno(a.diseno) : null;
  return {
    ...SIN_NADA,
    borrador: b && db && Number.isInteger(b.version) ? { diseno: db, version: b.version as number } : null,
    publicado:
      p && dp && typeof p.publicado_en === "string"
        ? { diseno: dp, publicadoEn: p.publicado_en, publicadoPor: typeof p.publicado_por === "string" && p.publicado_por.trim() ? p.publicado_por : null }
        : null,
    anterior: a && da && typeof a.publicado_en === "string" ? { diseno: da, publicadoEn: a.publicado_en } : null,
  };
}

/** Una prenda de la campaña que puede salir en la portada: su foto (o, sin foto, su categoría y su color, ADR-0333). */
export type PiezaDePortada = { id: string; nombre: string; foto: string | null; colorHex?: string | null } & CategoriaDePrenda;

/** Lo que la portada dice de la campaña. */
export type CampanaDePortada = { nombre: string; pct: number | null; hasta: string | null };

/**
 * Las prendas de la campaña en el orden en que la tienda elige sus polaroids (`heroDelInicio`: primero las que tienen foto); cada una con
 * el color de su primera variante con color, para dibujarla sin foto.
 */
export function piezasDeLaCampana(prendas: readonly PrendaDeCampana[]): PiezaDePortada[] {
  return [...prendas]
    .sort((a, b) => Number(a.foto === null) - Number(b.foto === null) || a.nombre.localeCompare(b.nombre, "es"))
    .map((p) => ({
      id: p.productoId,
      nombre: p.nombre,
      foto: p.foto,
      colorHex: p.colores.find((c) => c.hex)?.hex ?? null,
      categoria: p.categoria,
      prefijo: p.prefijo,
      familia: p.familia,
    }));
}

/** Las paletas sacadas de los colores de las prendas de la campaña (paso «Colores»); un color sin `#hex` no cuenta. */
export function paletasDeLaCampana(prendas: readonly PrendaDeCampana[]): ColoresPropios[] {
  return paletasDeLasPrendas(
    prendas.map((p) => ({ nombre: p.nombre, colores: p.colores.flatMap((c) => (c.hex ? [{ nombre: c.nombre, hex: c.hex }] : [])) })),
  );
}

/** Cómo se nombran las campañas de un carrusel: «Día del Gato y Halloween», «A, B y C». */
export function nombresEnOrden(nombres: readonly string[]): string {
  return nombres.length <= 1 ? (nombres[0] ?? "") : `${nombres.slice(0, -1).join(", ")} y ${nombres[nombres.length - 1]}`;
}

/** El día siguiente a `fecha` (`AAAA-MM-DD`). */
export const diaSiguiente = (fecha: string) => new Date(Date.parse(`${fecha}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

/**
 * Qué anuncia la portada el día después de que la campaña termina, para la hoja «Publicar» («Después sale»). Lo dice la base
 * (`campanas_portada_dias`, la regla de la tienda), no esta pantalla: aquí solo se le pone nombre (con varias, el carrusel en su orden).
 * `null`: no se pudo saber.
 */
export function queSaleDespues(dias: readonly DiaPortada[] | null, nombres: ReadonlyMap<string, string>): string | null {
  const dia = dias?.[0];
  if (!dia) return null;
  if (dia.campanas.length === 0) return "Lo nuevo";
  const conNombre = dia.campanas.map((id) => nombres.get(id));
  if (conNombre.some((n) => n === undefined)) return null;
  return conNombre.length === 1 ? conNombre[0]! : `${nombresEnOrden(conNombre as string[])}, en carrusel`;
}

/**
 * Lo que identifica lo que hay guardado: cambia al guardar el borrador, al publicar y al volver al anterior. El editor se vuelve a armar
 * cuando cambia (con la versión nueva del borrador), así nunca guarda encima con una versión vieja.
 */
export function claveDelEstado(e: EstadoDiseno): string {
  return `${e.borrador?.version ?? 0}|${e.publicado?.publicadoEn ?? "-"}|${e.anterior?.publicadoEn ?? "-"}`;
}

/** Lo que se abre en el editor: el borrador si se estaba probando; si no, lo publicado; si no, la portada de siempre. */
export function disenoParaEditar(e: EstadoDiseno): { diseno: DisenoDeCampana; version: number } {
  if (e.borrador) return e.borrador;
  return { diseno: e.publicado?.diseno ?? DISENO_DE_SIEMPRE, version: 0 };
}

/**
 * Si lo que se ve ya es lo que ve el cliente, o un borrador que todavía no. Lo dicen la barra de abajo del editor y la insignia de cada
 * campaña en la lista (con su borrador, o sin él lo publicado): un borrador igual a lo publicado no es un borrador.
 */
export function estadoDelBorrador(e: { publicado: { diseno: DisenoDeCampana } | null }, diseno: DisenoDeCampana): "publicado" | "borrador" | "de-siempre" {
  if (e.publicado && mismoDiseno(e.publicado.diseno, diseno)) return "publicado";
  if (!e.publicado && mismoDiseno(DISENO_DE_SIEMPRE, diseno)) return "de-siempre";
  return "borrador";
}

/** Una línea para el resumen de cada paso del editor (lo que se eligió). */
export function resumenEstilo(d: DisenoDeCampana): string {
  return estiloDelDiseno(d)?.nombre ?? "Personalizado";
}
export function resumenColores(d: DisenoDeCampana): string {
  return paletaDelDiseno(d).nombre;
}

/** Lo que la revisión necesita saber de las prendas de la campaña. */
export function contextoDeRevision(prendas: readonly { foto: string | null }[]): ContextoRevision {
  return { prendas: prendas.length, prendasConFoto: prendas.filter((p) => p.foto).length };
}

/* ---------------- La guía de foco del editor (ADR-0284) ---------------- */

export type ClavePaso = "estilo" | "colores";
export type PasoDelDiseno = { clave: ClavePaso; titulo: string; opcional: boolean };

/** Los pasos del editor, en orden. Todos traen un valor de fábrica (nada «falta» para publicar): la guía dice por dónde ir. */
export const PASOS_DEL_DISENO: readonly PasoDelDiseno[] = [
  { clave: "estilo", titulo: "Empieza con un estilo", opcional: false },
  { clave: "colores", titulo: "Colores", opcional: false },
];

/**
 * Cómo se marca cada paso: el abierto, «ahora»; el que se visitó y ya se cerró, ✓; el que nadie abrió todavía, «falta» (o «opcional»).
 * `sigue`: el primero sin visitar que no es opcional (lleva «Sigue aquí» mientras está cerrado). Nunca cambia qué se puede publicar.
 */
export function estadoDePasos(
  pasos: readonly PasoDelDiseno[],
  visitados: ReadonlySet<ClavePaso>,
  abierto: ClavePaso | null,
): { estados: Record<ClavePaso, EstadoCampo>; sigue: ClavePaso | null } {
  const estados = Object.fromEntries(
    pasos.map((p) => [p.clave, p.clave === abierto ? "ahora" : visitados.has(p.clave) ? "hecho" : p.opcional ? "opcional" : "falta"]),
  ) as Record<ClavePaso, EstadoCampo>;
  const sigue = pasos.find((p) => !p.opcional && !visitados.has(p.clave) && p.clave !== abierto)?.clave ?? null;
  return { estados, sigue };
}
