import { z } from "zod";

// Recomendaciones (ADR-0408, Felipe 2026-10-15): «un apartado de recomendaciones donde el cliente puede escribir libremente cualquier
// sugerencia adicional que pueda tener para la tienda o la empresa». Va SIEMPRE con su nombre (para que CAYLA pueda responderle) y la
// lee el ERP en Clientes ▸ Recomendaciones. Aquí, sin red: el texto como lo guarda la base (para contar las letras igual que ella), lo
// que le falta, las respuestas de `retail.tienda_recomendar` y `retail.tienda_mis_recomendaciones` puestas en tipos, y los mensajes.
// Quien decide de verdad es la base: el largo, la tienda, el tope por día y la marca que no deja mandarla dos veces.

/** De 10 a 1000 letras (las de `tienda_recomendar`), ya limpias. */
export const MINIMO = 10;
export const MAXIMO = 1000;

/** El texto como lo guarda la base (`fn_recomendacion_texto`): sin caracteres invisibles ni de control, espacios seguidos en uno, a lo
 *  más una línea en blanco, sin espacios en las puntas. Lo que se manda es lo que se escribió: la base vuelve a limpiar. */
export function textoLimpio(texto: string): string {
  return texto
    .replace(/\r\n?/g, "\n")
    // Lo que se quita: invisibles y caracteres de control (menos el salto de línea).
    .replace(/[\u0001-\u0008\u000B-\u001F\u007F-\u009F­​-‏‪-‮⁠-⁤⁦-⁩﻿]/g, "")
    .replace(/[\t   -   　]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^[ \n]+|[ \n]+$/g, "");
}

/** Cuántas letras cuenta la base: por carácter, no por unidad de JavaScript (un emoji es una). */
export const letras = (texto: string) => [...textoLimpio(texto)].length;

/** Lo que le falta al texto para mandarse, o null. Vacío no dice nada todavía (el botón se apaga solo). */
export function problemaDelTexto(texto: string): "corto" | "largo" | null {
  const n = letras(texto);
  if (n > MAXIMO) return "largo";
  return n > 0 && n < MINIMO ? "corto" : null;
}

export const sePuedeEnviar = (texto: string) => letras(texto) >= MINIMO && letras(texto) <= MAXIMO;

/** Lo que dice el contador a la vista («79 / 1000»; «Te pasaste por 3 letras» después del tope) y lo que oye un lector de pantalla
 *  («79 de 1000 letras»). Cerca del final (las últimas 100) cambia de tono. */
export function contador(texto: string): { texto: string; lector: string; tono: "normal" | "cerca" | "pasado" } {
  const n = letras(texto);
  if (n > MAXIMO) {
    const pasado = `Te pasaste por ${n - MAXIMO} ${n - MAXIMO === 1 ? "letra" : "letras"}`;
    return { texto: pasado, lector: pasado, tono: "pasado" };
  }
  return { texto: `${n} / ${MAXIMO}`, lector: `${n} de ${MAXIMO} letras`, tono: n >= MAXIMO - 100 ? "cerca" : "normal" };
}

/** La marca de un borrador: la misma mientras no cambien el texto ni la tienda (un reintento con lo mismo es la misma recomendación; la
 *  base no la repite). Cambiar algo la renueva. */
export const claveDelBorrador = (texto: string, sedeId: string | null) => `${sedeId ?? "general"}|${textoLimpio(texto)}`;

/* ------------------------------------------------------------------ Lo que responde tienda_recomendar */

export type ResultadoEnvio =
  | { estado: "enviada"; quedanHoy: number; tope: number }
  | { estado: "invalido"; campo: "texto" | "sobre" | "marca"; detalle: "corto" | "largo" | null }
  | { estado: "limite"; tope: number }
  | { estado: "sin_cuenta" }
  /** Sin sesión válida (el proyecto de clientes dijo que no): hay que volver a entrar. */
  | { estado: "sin_sesion" }
  /** La base o el proyecto de clientes no contestaron: no se sabe si llegó (con la misma marca, reintentar no la repite). */
  | { estado: "sin_respuesta" };

const esquemaEnvio = z.discriminatedUnion("estado", [
  z.object({ estado: z.literal("enviada"), quedan_hoy: z.number().int(), tope: z.number().int().positive() }),
  z.object({ estado: z.literal("invalido"), campo: z.enum(["texto", "sobre", "marca"]), detalle: z.enum(["corto", "largo"]).optional() }),
  z.object({ estado: z.literal("limite"), tope: z.number().int().positive() }),
  z.object({ estado: z.literal("sin_cuenta") }),
]);

/** La respuesta de `tienda_recomendar`. Una que no se entiende se trata como «no contestó»: nunca se dice «enviada» sin estarlo. */
export function leerEnvio(dato: unknown): ResultadoEnvio {
  const r = esquemaEnvio.safeParse(dato);
  if (!r.success) return { estado: "sin_respuesta" };
  const d = r.data;
  if (d.estado === "enviada") return { estado: "enviada", quedanHoy: Math.max(0, d.quedan_hoy), tope: d.tope };
  if (d.estado === "invalido") return { estado: "invalido", campo: d.campo, detalle: d.detalle ?? null };
  return d;
}

/** Lo que se le dice al cliente cuando no se pudo (en sus palabras: nunca un código ni un error de la base). */
export function mensajeDelEnvio(r: Exclude<ResultadoEnvio, { estado: "enviada" }>): string {
  switch (r.estado) {
    case "invalido":
      if (r.campo === "sobre") return "Esa tienda ya no está en la web. Elige otra o «CAYLA en general».";
      if (r.detalle === "largo") return `Es un poco larga: acórtala a ${MAXIMO} letras.`;
      if (r.campo === "texto") return `Escribe un poco más: al menos ${MINIMO} letras.`;
      return "Algo no salió bien. Vuelve a intentarlo.";
    case "limite":
      // «Hoy ya nos enviaste 3 recomendaciones»: con el número solo («nos enviaste 3») no se entendía qué.
      return `Hoy ya nos enviaste ${r.tope} ${r.tope === 1 ? "recomendación" : "recomendaciones"}. Mañana puedes enviarnos otra: las leemos todas.`;
    case "sin_cuenta":
      return "No encontramos tu cuenta. Sal y vuelve a entrar.";
    case "sin_sesion":
      return "Tu sesión se cerró. Vuelve a entrar para enviarla: lo que escribiste sigue aquí.";
    case "sin_respuesta":
      return "No pudimos enviarla ahora. Vuelve a intentarlo en unos minutos: no se envía dos veces.";
  }
}

/** Sin red (la acción del servidor ni llegó): lo que escribió se queda y reintentar no la repite. */
export const MENSAJE_SIN_RED = "Se cortó la conexión. Revisa tu internet y vuelve a intentarlo: no se envía dos veces.";

/* ------------------------------------------------------------------ Lo que responde tienda_mis_recomendaciones */

export type EstadoParaElCliente = "recibida" | "leida" | "respondida";

export type MiRecomendacion = {
  id: string;
  texto: string;
  creadaEn: string;
  /** El nombre web de la tienda («Trujillo»), o null: CAYLA en general. */
  sobre: string | null;
  estado: EstadoParaElCliente;
  respuesta: string | null;
  respondidaEn: string | null;
};

export type MisRecomendaciones = { tope: number; hoy: number; recomendaciones: MiRecomendacion[] };

const esquemaMia = z.object({
  id: z.string().uuid(),
  texto: z.string(),
  creada_en: z.string().min(1),
  sobre: z.object({ id: z.string().uuid(), nombre: z.string().min(1) }).nullable(),
  estado: z.enum(["recibida", "leida", "respondida"]),
  respuesta: z.string().nullable(),
  respondida_en: z.string().nullable(),
});
const esquemaMias = z.object({ tope: z.number().int().positive(), hoy: z.number().int().nonnegative(), recomendaciones: z.array(z.unknown()) });

/** La respuesta de `tienda_mis_recomendaciones` (sin la nula: esa es «sin cuenta» y la resuelve el servidor). Una forma rara entera:
 *  null (la página lo dice); una recomendación rara: se deja fuera. */
export function leerMias(dato: unknown): MisRecomendaciones | null {
  const r = esquemaMias.safeParse(dato);
  if (!r.success) return null;
  return {
    tope: r.data.tope,
    hoy: r.data.hoy,
    recomendaciones: r.data.recomendaciones.flatMap((x) => {
      const m = esquemaMia.safeParse(x);
      if (!m.success) return [];
      const d = m.data;
      return [{ id: d.id, texto: d.texto, creadaEn: d.creada_en, sobre: d.sobre?.nombre ?? null, estado: d.estado, respuesta: d.respuesta, respondidaEn: d.respondida_en }];
    }),
  };
}

/** La insignia de cada estado, para el cliente (archivar es cosa de la tienda: se ve «Leída»). */
export const INSIGNIA: Record<EstadoParaElCliente, { texto: string; tono: "neutro" | "verde" }> = {
  recibida: { texto: "Recibida", tono: "neutro" },
  leida: { texto: "Leída", tono: "verde" },
  respondida: { texto: "Respondida", tono: "verde" },
};

/** Cuántas le quedan hoy (nunca menos de cero). */
export const quedanHoy = (m: Pick<MisRecomendaciones, "tope" | "hoy">) => Math.max(0, m.tope - m.hoy);

/** La frase del cupo bajo el formulario: «Puedes enviarnos hasta 3 al día.», y si ya mandó alguna hoy, cuántas le quedan («te queda 1»,
 *  en singular) o que ya las envió. */
export function fraseDelCupo(tope: number, quedan: number): string {
  const base = `Puedes enviarnos hasta ${tope} al día`;
  if (quedan >= tope) return `${base}.`;
  if (quedan <= 0) return `${base}: hoy ya las enviaste.`;
  return `${base}: hoy te ${quedan === 1 ? "queda 1" : `quedan ${quedan}`}.`;
}

/**
 * Qué muestra la ficha para escribir. Recién enviada, el «¡Gracias!». Sin cupo hoy y sin nada escrito, «Por hoy ya está»: antes salía la
 * caja abierta (con «✓ Listo» al escribir) y un botón apagado, y la persona podía escribir una recomendación entera que no iba a poder
 * enviar. Si ya había escrito algo cuando se le acabó el cupo (lo agotó en otra pestaña), el formulario se queda con su texto a la vista,
 * para que no lo pierda.
 */
export function vistaDelFormulario(e: { gracias: boolean; quedan: number; texto: string }): "gracias" | "sin_cupo" | "formulario" {
  if (e.gracias) return "gracias";
  return e.quedan <= 0 && letras(e.texto) === 0 ? "sin_cupo" : "formulario";
}

/** La marca en el título del campo, la misma guía de «Crear cuenta» (✓ Listo · Sigue aquí · Revisa). */
export type MarcaDelTexto = "error" | "hecho" | "sigue";
export const TEXTO_DE_MARCA: Record<MarcaDelTexto, string> = { error: "Revisa", hecho: "✓ Listo", sigue: "Sigue aquí" };

/**
 * Qué marca lleva el texto: lo que le falta manda («Revisa»); sin cupo hoy, ninguna (un «✓ Listo» mentiría: hoy no se puede enviar);
 * con algo que se puede enviar, «✓ Listo»; vacío, es lo que sigue («Sigue aquí»: antes no decía nada y el botón apagado no explicaba por
 * qué).
 */
export function marcaDelTexto(texto: string, sinCupo: boolean): MarcaDelTexto | null {
  if (problemaDelTexto(texto)) return "error";
  if (sinCupo) return null;
  return letras(texto) > 0 ? "hecho" : "sigue";
}

/**
 * «¿Sobre qué es?» se maneja como un grupo de botones de radio (el patrón de teclado de WAI-ARIA): → y ↓ pasan a la opción siguiente,
 * ← y ↑ a la anterior, dando la vuelta en las puntas; Inicio y Fin, a la primera y a la última. Devuelve la posición nueva, o null si la
 * tecla no es de las que mueven (se deja pasar: Tab sale del grupo).
 */
export function indiceConTecla(cantidad: number, actual: number, tecla: string): number | null {
  if (cantidad <= 0) return null;
  const i = Math.min(Math.max(0, actual), cantidad - 1);
  switch (tecla) {
    case "ArrowRight":
    case "ArrowDown":
      return (i + 1) % cantidad;
    case "ArrowLeft":
    case "ArrowUp":
      return (i - 1 + cantidad) % cantidad;
    case "Home":
      return 0;
    case "End":
      return cantidad - 1;
    default:
      return null;
  }
}
