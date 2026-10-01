// Clientas ▸ Avisos (ADR-0288, «Actualización 2026-10-01 (g)», G-8; contrato de la tanda 1g, funciones 7 y 8). Lógica pura: la
// usan la página (servidor) y el panel (navegador), y se prueba con `club-avisos-reglas.test.ts`.
//
// CONTRATO
//   PROMETE: leer las filas de `fn_club_avisos_pendientes` sin confiar en ellas (un tipo que esta web no conoce se ignora), agruparlas
//            y contarlas por tipo, armar el enlace de WhatsApp Web con el número y el texto listos, mostrar el celular a medias y decir
//            si un aviso se puede mandar tal como está.
//   ASUME:   QUIÉN recibe cada aviso lo decide la base (publicidad vigente de esa tienda, tope CL-21, grupo testigo CL-20, un aviso por
//            cupón): aquí no se filtra a nadie. El texto llega de las plantillas `aviso_*`; si todavía trae un marcador que la web
//            sabe completar (`{nombre}`, `{tienda}`) se completa, y si trae otro, el aviso no se manda así.
//   NO HACE: no envía nada ni escribe en la base: WhatsApp lo abre el panel y el envío lo anota `club-avisos-acciones.ts`.

import { numeroWhatsApp } from "./facturacion-comprobantes-reglas";
import { enmascararCelular } from "./proveedores-reglas";

/** Los cuatro avisos del club, en el orden en que se muestran (los cupones primero: son promesas del club). */
export const TIPOS_AVISO = ["cumpleanos", "aniversario", "novedades", "rebaja"] as const;
export type TipoAviso = (typeof TIPOS_AVISO)[number];

export type InfoTipoAviso = {
  /** El título del grupo y de su cifra: «Cumpleaños», «Rebajas». */
  titulo: string;
  /** El chip de cada fila: «Rebaja» (una), no «Rebajas». */
  chip: string;
  /** Cuenta para el tope de 2 promociones al mes (CL-21). Cumpleaños y aniversario no: son promesas del club. */
  promocional: boolean;
  /** Lo que dice la cabecera de su grupo. */
  nota: string;
};

export const INFO_TIPO_AVISO: Record<TipoAviso, InfoTipoAviso> = {
  cumpleanos: {
    titulo: "Cumpleaños",
    chip: "Cumpleaños",
    promocional: false,
    nota: "Su cupón del mes, todavía sin canjear. No cuenta para el tope de promociones.",
  },
  aniversario: {
    titulo: "Aniversario",
    chip: "Aniversario",
    promocional: false,
    nota: "Su vale de aniversario, listo para usar. No cuenta para el tope de promociones.",
  },
  novedades: {
    titulo: "Novedades",
    chip: "Novedades",
    promocional: true,
    nota: "Lo que llegó a esta tienda en los últimos días. Cuenta para el tope de 2 promociones al mes.",
  },
  rebaja: {
    titulo: "Rebajas",
    chip: "Rebaja",
    promocional: true,
    nota: "Una prenda en promoción con stock en su talla. Cuenta para el tope de 2 promociones al mes.",
  },
};

export function esTipoAviso(x: string): x is TipoAviso {
  return (TIPOS_AVISO as readonly string[]).includes(x);
}

/** Una fila tal como la devuelve `fn_club_avisos_pendientes(p_ubicacion_id)`. */
export type FilaAvisoPendiente = {
  clienta_id: string;
  nombre: string | null;
  telefono: string | null;
  tipo: string;
  referencia: string | null;
  texto: string | null;
  detalle: string | null;
};

export type AvisoPendiente = {
  /** Única por socia, tipo y referencia (el año del cumpleaños, el vale, la semana de novedades…): la llave de la fila. */
  clave: string;
  clientaId: string;
  nombre: string;
  /** Completo: solo viaja al enlace de WhatsApp y a la BAJA. En pantalla, `celularAMedias`. */
  telefono: string | null;
  tipo: TipoAviso;
  referencia: string;
  /** El texto de la plantilla, tal como llegó. Lo que se manda es `textoParaEnviar(...)`. */
  texto: string;
  /** Por qué le toca, en una línea, si la base lo dice. */
  detalle: string | null;
};

export function claveDelAviso(clientaId: string, tipo: string, referencia: string): string {
  return `${clientaId}:${tipo}:${referencia}`;
}

/** Las filas de la base, listas para pintar. Una fila de un tipo que esta web no conoce (una base más nueva) se ignora: mejor no
 *  mostrarla que mandarla con un texto que la pantalla no sabe explicar. Una repetida (misma socia, tipo y referencia) sale una vez. */
export function leerAvisos(filas: readonly FilaAvisoPendiente[]): AvisoPendiente[] {
  const vistas = new Set<string>();
  const out: AvisoPendiente[] = [];
  for (const f of filas) {
    if (!f || !f.clienta_id || !esTipoAviso(f.tipo)) continue;
    const referencia = f.referencia ?? "";
    const clave = claveDelAviso(f.clienta_id, f.tipo, referencia);
    if (vistas.has(clave)) continue;
    vistas.add(clave);
    out.push({
      clave,
      clientaId: f.clienta_id,
      nombre: f.nombre?.trim() || "Socia sin nombre",
      telefono: f.telefono?.trim() || null,
      tipo: f.tipo,
      referencia,
      texto: f.texto ?? "",
      detalle: f.detalle?.trim() || null,
    });
  }
  return out;
}

export type GrupoDeAvisos = { tipo: TipoAviso; avisos: AvisoPendiente[] };

/** Los avisos por tipo, en el orden de `TIPOS_AVISO`; dentro de cada grupo, el orden en que llegaron. Sin grupos vacíos. */
export function agruparPorTipo(avisos: readonly AvisoPendiente[]): GrupoDeAvisos[] {
  return TIPOS_AVISO.map((tipo) => ({ tipo, avisos: avisos.filter((a) => a.tipo === tipo) })).filter((g) => g.avisos.length > 0);
}

/** Cuántos hay de cada tipo (los cuatro, aunque sea 0) y en total. */
export function contarPorTipo(avisos: readonly AvisoPendiente[]): Record<TipoAviso | "total", number> {
  const cuenta = { cumpleanos: 0, aniversario: 0, novedades: 0, rebaja: 0, total: avisos.length };
  for (const a of avisos) cuenta[a.tipo] += 1;
  return cuenta;
}

/** «9•• ••• 321»: la clienta de al lado ve la pantalla de la tienda. Sin un celular que se entienda, «Sin celular». */
export function celularAMedias(telefono: string | null): string {
  const n = numeroWhatsApp(telefono);
  return n ? enmascararCelular(n) : "Sin celular";
}

/** El mismo celular escrito de otra forma («+51 987 654 321», «987654321») cuenta como uno: la BAJA vale por número, no por ficha. */
export function mismoCelular(a: string | null, b: string | null): boolean {
  const na = numeroWhatsApp(a);
  return na !== null && na === numeroWhatsApp(b);
}

/**
 * El enlace que abre WhatsApp WEB (no la app) en el chat de la socia con el texto escrito: la encargada solo presiona Enter (G-8).
 * `null` si el número no es un celular peruano: no se adivina a quién escribirle.
 */
export function enlaceWhatsAppWeb(telefono: string | null, texto: string): string | null {
  const n = numeroWhatsApp(telefono);
  return n ? `https://web.whatsapp.com/send?phone=${n}&text=${encodeURIComponent(texto)}` : null;
}

/** «LUCÍA PAREDES SOTO» → «Lucía»: el saludo va con su primer nombre, como se le habla en la tienda. */
export function primerNombre(nombre: string): string {
  const primero = nombre.trim().split(/\s+/)[0] ?? "";
  return primero ? primero.charAt(0).toLocaleUpperCase("es") + primero.slice(1).toLocaleLowerCase("es") : "";
}

/**
 * El texto que se manda: la plantilla con los marcadores que la web conoce completados (`{nombre}` → su primer nombre, `{tienda}`
 * → la tienda que envía). Si la base ya los completó, no cambia nada. Los demás (`{pct}`, `{codigo}`…) quedan: `problemaParaEnviar`
 * los detiene.
 */
export function textoParaEnviar(texto: string, datos: { nombre: string; tienda: string }): string {
  return texto.split("{nombre}").join(primerNombre(datos.nombre)).split("{tienda}").join(datos.tienda.trim());
}

/** Los marcadores que siguen sin completar: «{pct}», «{codigo}». */
export function marcadoresSinCompletar(texto: string): string[] {
  return [...new Set(texto.match(/\{[a-z_]+\}/g) ?? [])];
}

/** Por qué este aviso no se puede mandar tal como está, o null. Un mensaje con «{pct}» adentro no sale nunca a una socia. */
export function problemaParaEnviar(telefono: string | null, texto: string): string | null {
  if (!numeroWhatsApp(telefono)) return "Su celular no es un celular peruano: corrígelo en su ficha.";
  if (texto.trim() === "") return "Este aviso llegó sin texto: falta su plantilla en la base.";
  const sueltos = marcadoresSinCompletar(texto);
  if (sueltos.length > 0) return `Al texto le falta completar ${sueltos.join(", ")}: no se manda así. Avísale al líder.`;
  return null;
}

/** «Deshacer» un envío anotado vale 10 minutos (contrato, función 8): lo mismo que acepta `deshacer_aviso_enviado`. */
export const MINUTOS_PARA_DESHACER = 10;

export function sePuedeDeshacer(enviadoEnMs: number, ahoraMs: number): boolean {
  const pasaron = ahoraMs - enviadoEnMs;
  return pasaron >= 0 && pasaron < MINUTOS_PARA_DESHACER * 60_000;
}
