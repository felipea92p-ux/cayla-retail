import {
  DISENO_DE_SIEMPRE,
  estiloDelDiseno,
  leerDiseno,
  mismoDiseno,
  paletaDelDiseno,
  type ContextoRevision,
  type DisenoDeCampana,
} from "@cayla-retail/portada";
import type { EstadoCampo } from "@/lib/guia-campos";

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

/** Lo que se abre en el editor: el borrador si se estaba probando; si no, lo publicado; si no, la portada de siempre. */
export function disenoParaEditar(e: EstadoDiseno): { diseno: DisenoDeCampana; version: number } {
  if (e.borrador) return e.borrador;
  return { diseno: e.publicado?.diseno ?? DISENO_DE_SIEMPRE, version: 0 };
}

/** Lo que dice la barra de abajo del editor: si lo que se ve ya es lo que ve el cliente, o un borrador que todavía no. */
export function estadoDelBorrador(e: EstadoDiseno, diseno: DisenoDeCampana): "publicado" | "borrador" | "de-siempre" {
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
