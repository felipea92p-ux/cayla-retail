import { z } from "zod";
import { CLAVE_MINIMA, correoValido, hoyLima, normalizarCorreo } from "./cuentas";
import { MENSAJES } from "./cuentas-mensajes";
import { redireccionDelProxy } from "./sesion";

// La entrada a la tienda online cuenta como actividad del Club (Felipe 2026-10-14): con 3 años sin comprar NI entrar, la ficha se
// anonimiza y su cuenta web se cierra (`20261015055000`). La base la anota con `retail.tienda_anotar_entrada`; aquí, lo que no
// necesita red: cuándo hace falta anotarla (al iniciar sesión y, como mucho, una vez al día por sesión, nunca en cada petición) y
// cómo se lee lo que contesta la base. Y, desde el 2026-10-15, lo que pide «Entrar» antes de preguntarle al proyecto de clientes y a
// dónde lleva después. Lógica pura: la usan la acción del servidor, el marco de las páginas, los formularios y sus pruebas.

/**
 * La marca de «ya se anotó hoy» de este aparato. No es secreta ni identifica a nadie fuera de este aparato (el id del usuario ya
 * viaja en la cookie de la sesión); solo evita preguntarle a la base en cada página. Sin ella, se anota de nuevo: es inofensivo.
 */
export const COOKIE_ENTRADA = "tienda-entrada";
/** Dura dos días: al tercero ya no sirve igual (otro día de Lima). */
export const ENTRADA_DURA_S = 2 * 24 * 60 * 60;

const fechaLima = (ahora: Date) => {
  const { anio, mes, dia } = hoyLima(ahora);
  return `${anio}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
};

/** «2026-10-14.<usuario>»: el día de Lima y de quién es la sesión que ya se anotó. */
export const marcaDeEntrada = (usuarioId: string, ahora = new Date()) => `${fechaLima(ahora)}.${usuarioId}`;

/** ¿Hay que anotar la entrada de esta sesión? Sí, si la marca no es la de hoy y de este mismo usuario. */
export function debeAnotarEntrada(marca: string | null | undefined, usuarioId: string, ahora = new Date()): boolean {
  return marca !== marcaDeEntrada(usuarioId, ahora);
}

/**
 * Lo que contesta `tienda_anotar_entrada`. `cerrada`: su ficha se anonimizó (3 años sin comprar ni entrar, o lo pidió en tienda):
 * el servidor borra su usuario y cierra la sesión. `sin_cuenta`: el usuario existe pero la cuenta no terminó de crearse.
 */
export type Anotacion = "anotada" | "cerrada" | "sin_cuenta" | "sin_respuesta";

export function leerAnotacion(dato: unknown): Anotacion {
  const r = z.object({ estado: z.string() }).safeParse(dato);
  if (!r.success) return "sin_respuesta";
  return r.data.estado === "anotada" || r.data.estado === "cerrada" || r.data.estado === "sin_cuenta" ? r.data.estado : "sin_respuesta";
}

/** Lo que contesta `tienda_usuarios_por_borrar`: los usuarios de cuentas cerradas que todavía hay que borrar del proyecto de clientes. */
export function leerUsuariosPorBorrar(dato: unknown): string[] {
  const r = z.object({ usuarios: z.array(z.string().uuid()) }).safeParse(dato);
  return r.success ? r.data.usuarios : [];
}

/* ------------------------------------------------------------------ Lo que pide «Entrar» */

export type ProblemaAlEntrar = { campo: "correo" | "clave"; mensaje: string };

/**
 * Lo que falta para intentar entrar, o null. «Entrar» ya no espera con el botón apagado: un botón gris no dice por qué, y el
 * autocompletar de Chrome llena las cajas sin avisarle a la página hasta el primer toque (el botón seguía apagado con todo escrito).
 * Ahora el botón se toca siempre y esto dice qué falta bajo su caja. Una contraseña de menos de 8 nunca es la de una cuenta: no se
 * gasta un intento del tope en ella.
 */
export function problemaAlEntrar(correo: string, clave: string): ProblemaAlEntrar | null {
  if (!normalizarCorreo(correo)) return { campo: "correo", mensaje: MENSAJES.entrarSinCorreo };
  if (!correoValido(correo)) return { campo: "correo", mensaje: MENSAJES.correoMal };
  if (!clave) return { campo: "clave", mensaje: MENSAJES.entrarSinClave };
  if (clave.length < CLAVE_MINIMA) return { campo: "clave", mensaje: MENSAJES.entrarClaveCorta };
  return null;
}

/* ------------------------------------------------------------------ A dónde vuelve quien entra */

/** El dato de la dirección: `/entrar?volver=/catalogo/…`. */
export const PARAMETRO_VOLVER = "volver";
const LARGO_MAXIMO_VOLVER = 300;
/** Un origen de mentira para leer la dirección: si `volver` apunta a otro, es de otra web. */
const ORIGEN_PROPIO = "https://tienda.invalid";

/**
 * La página con cuenta que la persona quería ver antes de entrar, o null. Pasa con un enlace a una prenda que le mandaron por WhatsApp
 * o al de su pedido: sin sesión, el proxy la lleva a «Entrar» y, al entrar (o al crear su cuenta), vuelve ahí en vez de caer en el
 * Inicio. Solo vale una dirección de ESTA tienda que pide cuenta: nunca otra web (`https://…`, `//otra.web`, con barra invertida), ni
 * «Entrar» o «Crear cuenta» (daría vueltas), ni nada con espacios o caracteres de control. Qué páginas piden cuenta lo dice el proxy
 * (`redireccionDelProxy`, lib/sesion.ts): una sola lista.
 */
export function rutaParaVolver(volver: unknown): string | null {
  if (typeof volver !== "string" || volver.length === 0 || volver.length > LARGO_MAXIMO_VOLVER) return null;
  if (!volver.startsWith("/") || volver.startsWith("//") || volver.includes("\\") || /\s/.test(volver)) return null;
  if ([...volver].some((c) => c.charCodeAt(0) < 32)) return null;
  let url: URL;
  try {
    url = new URL(volver, ORIGEN_PROPIO);
  } catch {
    return null;
  }
  if (url.origin !== ORIGEN_PROPIO || redireccionDelProxy(url.pathname, "GET", "no") === null) return null;
  return `${url.pathname}${url.search}`;
}

/** «/entrar» o «/entrar?volver=…»: los enlaces entre «Entrar» y «Crear cuenta» no pierden a dónde iba la persona. */
export function hrefConVolver(base: "/entrar" | "/crear-cuenta", volver: string | null): string {
  return volver ? `${base}?${PARAMETRO_VOLVER}=${encodeURIComponent(volver)}` : base;
}

/** La misma página con su aviso «Listo: …» (`?aviso=bienvenida`), sin perder lo que ya traía su dirección (`?sede=lima`). */
export function conAviso(ruta: string, aviso: string): string {
  const url = new URL(ruta, ORIGEN_PROPIO);
  url.searchParams.set("aviso", aviso);
  return `${url.pathname}${url.search}`;
}
