// Clientes ▸ Avisos, «Editar mensajes» (Felipe 2026-10-20; maqueta `docs/maquetas/avisos-club-2026-10/`, migración
// 20261020144000). Lógica pura: la usan la página (servidor), la hoja y la pantalla, y se prueba con `club-avisos-mensajes.test.ts`.
//
// CONTRATO
//   PROMETE: separar el texto completo que guarda la base (cuerpo + cierre + BAJA) en lo que la persona edita, volver a armarlo igual
//            que la base (`fn_club_aviso_componer`), decir por qué un mensaje no se puede guardar con la MISMA regla que
//            `fn_club_aviso_problema`, y completar un mensaje con los datos de un miembro de ejemplo para la vista previa.
//   ASUME:   la base vuelve a validar al guardar y manda la suya; aquí solo se avisa antes.
//   NO HACE: no lee ni escribe en la base.

import { TIPOS_AVISO, primerNombre, type TipoAviso } from "./club-avisos-reglas";

/** La última línea de todo aviso: la pide la ley de datos personales (29733) y la base la exige al final (`club_textos_aviso_con_baja`). */
export const LINEA_BAJA = "Si no quieres recibir más mensajes, responde BAJA.";
/** @internal Los topes de `fn_club_aviso_problema` y `guardar_mensajes_avisos`: la prueba los cruza con la migración. */
export const MAX_MENSAJE = 700;
/** @internal */
export const MAX_CIERRE = 300;

/** Los datos que la base completa en cada aviso (`fn_club_avisos_pendientes`). Uno que no completa quedaría escrito tal cual. */
export const DATOS_POR_TIPO: Record<TipoAviso, readonly string[]> = {
  cumpleanos: ["nombre", "regalo", "tienda"],
  puntos: ["nombre", "puntos", "valor", "fecha", "tienda"],
  novedades: ["nombre", "tienda"],
  rebaja: ["nombre", "prenda", "pct", "tienda"],
};

/** Cómo se llama cada dato en el botón que lo pone: «+ Nombre», «+ Sus puntos». */
export const NOMBRE_DEL_DATO: Record<string, string> = {
  nombre: "Nombre",
  regalo: "Puntos de regalo",
  tienda: "Tienda",
  puntos: "Sus puntos",
  valor: "Lo que valen (S/)",
  fecha: "Fecha en que se eliminan",
  prenda: "Prenda",
  pct: "% de descuento",
};

/** Un miembro de ejemplo por aviso, para la vista previa de la hoja (inventado: no existe en el sistema). */
const EJEMPLO: Record<TipoAviso, Record<string, string>> = {
  cumpleanos: { nombre: "Lucía", regalo: "100" },
  puntos: { nombre: "Rosa", puntos: "340", valor: "15", fecha: "18 de noviembre" },
  novedades: { nombre: "Carla" },
  rebaja: { nombre: "Diana", prenda: "Blusa Emma", pct: "30" },
};

const recortar = (s: string) => s.replace(/^[\s]+|[\s]+$/g, "");

/** La base guarda «-» cuando el líder deja el cierre vacío (la tabla no acepta texto vacío): se lee como sin cierre. */
export function cierreDeLaBase(texto: string | null | undefined): string {
  const t = recortar(texto ?? "");
  return t === "-" ? "" : t;
}

/** El texto completo, como lo arma `fn_club_aviso_componer`: cuerpo, cierre (si hay) y la BAJA, separados por una línea en blanco. */
export function componerMensaje(cuerpo: string, cierre: string): string {
  const c = recortar(cierre);
  return `${recortar(cuerpo)}\n\n${c ? `${c}\n\n` : ""}${LINEA_BAJA}`;
}

/** Lo que la persona edita: el texto completo sin la BAJA y sin el cierre (si termina con el cierre vigente). Un texto viejo, sin
 *  cierre, queda solo sin la BAJA. */
export function cuerpoDelMensaje(texto: string, cierre: string): string {
  let t = recortar(texto);
  if (t.endsWith(LINEA_BAJA)) t = recortar(t.slice(0, -LINEA_BAJA.length));
  const c = recortar(cierre);
  if (c && t.endsWith(c)) t = recortar(t.slice(0, -c.length));
  return t;
}

/** Los «{dato}» de un texto, sin repetir y en el orden en que aparecen. */
export function datosDelTexto(texto: string): string[] {
  return [...new Set(texto.match(/\{[a-z_]+\}/g) ?? [])];
}

/** Por qué este mensaje no se puede guardar, o null: la misma regla, en el mismo orden, que `fn_club_aviso_problema`. */
export function problemaDelMensaje(tipo: TipoAviso, cuerpo: string): string | null {
  const t = recortar(cuerpo);
  if (t === "") return "El mensaje está vacío.";
  if ([...t].length > MAX_MENSAJE) return `El mensaje es muy largo: máximo ${MAX_MENSAJE} letras.`;
  if (!t.includes("{nombre}")) return "Falta {nombre}: el mensaje saluda a cada persona por su nombre.";
  const ajeno = datosDelTexto(t).find((d) => !DATOS_POR_TIPO[tipo].includes(d.slice(1, -1)));
  if (ajeno) return `Este aviso no sabe completar ${ajeno}.`;
  if (/responde\s+baja/i.test(t)) return "La línea de la BAJA va sola al final: no la escribas en el mensaje.";
  return null;
}

/** Por qué el cierre no se puede guardar, o null (`guardar_mensajes_avisos`). Puede quedar vacío. */
export function problemaDelCierre(cierre: string): string | null {
  const t = recortar(cierre);
  if ([...t].length > MAX_CIERRE) return `El cierre es muy largo: máximo ${MAX_CIERRE} letras.`;
  if (/\{[a-z_]+\}/.test(t)) return "El cierre va igual para todos: no lleva datos entre llaves.";
  if (/responde\s+baja/i.test(t)) return "La línea de la BAJA va sola al final: no la escribas en el cierre.";
  return null;
}

/** El mensaje completo con los datos del miembro de ejemplo de ese aviso (la vista previa de la hoja). Un dato que el aviso no
 *  completa queda tal cual, como quedaría de verdad. */
export function mensajeDeEjemplo(tipo: TipoAviso, cuerpo: string, cierre: string, tienda: string): string {
  const datos: Record<string, string> = { ...EJEMPLO[tipo], tienda };
  return componerMensaje(cuerpo, cierre).replace(/\{([a-z_]+)\}/g, (m, k: string) =>
    DATOS_POR_TIPO[tipo].includes(k) && datos[k] !== undefined ? datos[k] : m,
  );
}

/** El nombre del miembro de ejemplo de un aviso, para decir «Así le llega a Rosa». */
export function nombreDeEjemplo(tipo: TipoAviso): string {
  return primerNombre(EJEMPLO[tipo].nombre);
}

/** Un trozo de texto y si va en negrita: WhatsApp pone en negrita lo que va entre asteriscos (`*100 puntos*`). */
export type Trozo = { texto: string; negrita: boolean };

export function trozosConNegrita(texto: string): Trozo[] {
  const out: Trozo[] = [];
  const re = /\*([^*\n]+)\*/g;
  let desde = 0;
  for (let m = re.exec(texto); m; m = re.exec(texto)) {
    if (m.index > desde) out.push({ texto: texto.slice(desde, m.index), negrita: false });
    out.push({ texto: m[1], negrita: true });
    desde = m.index + m[0].length;
  }
  if (desde < texto.length) out.push({ texto: texto.slice(desde), negrita: false });
  return out;
}

export type TextosDeAvisos = {
  /** Si esta tienda ya cambió alguno de sus mensajes; si no, usa los de CAYLA (20261020151000). */
  personalizada: boolean;
  cierre: string;
  /** Lo que se edita de cada aviso (sin cierre ni BAJA). Un aviso sin texto en la base queda vacío. */
  cuerpos: Record<TipoAviso, string>;
};

/** Lo que devuelve `fn_club_avisos_textos(tienda)`, sin confiar en su forma. */
export function leerTextosDeAvisos(crudo: unknown): TextosDeAvisos {
  const o = (crudo && typeof crudo === "object" ? crudo : {}) as { personalizada?: unknown; cierre?: unknown; mensajes?: unknown };
  const cierre = cierreDeLaBase(typeof o.cierre === "string" ? o.cierre : null);
  const cuerpos = Object.fromEntries(TIPOS_AVISO.map((t) => [t, ""])) as Record<TipoAviso, string>;
  for (const m of Array.isArray(o.mensajes) ? o.mensajes : []) {
    const tipo = (m as { tipo?: unknown })?.tipo;
    const texto = (m as { texto?: unknown })?.texto;
    if (typeof tipo === "string" && (TIPOS_AVISO as readonly string[]).includes(tipo) && typeof texto === "string") {
      cuerpos[tipo as TipoAviso] = cuerpoDelMensaje(texto, cierre);
    }
  }
  return { personalizada: o.personalizada === true, cierre, cuerpos };
}
