import { nombreAMedias } from "@cayla-retail/shared";
import { CAMPOS_REGISTRO, estadoParteNombre, type CampoRegistro, type ConsultaDocumento, type EstadoRegistro, type Registro } from "./cuentas";

// El panel de marca de «Entrar», «Crear cuenta» y las páginas para volver a entrar (revisión «a nivel mundial», 2026-10-16): desde
// 960 px va a la izquierda, con los colores de la campaña de la portada; en el celular, debajo del formulario (el formulario va
// primero). Aquí, lo que dice: la promesa, los tres beneficios (hechos que la tienda ya cumple, con las mismas palabras de «Así se
// separa» y del Club), los pasos para volver a entrar, el nombre de la tarjeta del Club mientras se crea la cuenta y cuánto del
// registro está listo. Solo textos y presentación: ninguna regla de negocio vive aquí (las del registro están en `lib/cuentas.ts`).

/** La promesa del panel del Club: la primera línea y la que va en cursiva. */
export const PROMESA_CLUB = { ceja: "Club CAYLA", linea: "Separa hoy,", cursiva: "recoge en tu tienda." } as const;

export type Beneficio = { icono: "tienda" | "bolsa" | "regalo"; titulo: string; texto: string };

/**
 * Los tres beneficios del panel: lo que la tienda ya hace (la ficha dice cuánto hay de cada talla en cada tienda; se separa sin pagar
 * en la web y se recoge en la tienda; el Club da el descuento de cumpleaños y el vale por aniversario que cobra la caja).
 */
export const BENEFICIOS_DE_ENTRADA: readonly Beneficio[] = [
  { icono: "tienda", titulo: "Mira cuánto hay en cada tienda", texto: "Cada talla y cada color, tienda por tienda." },
  { icono: "bolsa", titulo: "Separa sin pagar aquí", texto: "Coordinas el pago por WhatsApp y lo recoges en tu tienda." },
  { icono: "regalo", titulo: "Descuento en tu cumpleaños", texto: "Y un vale de compra por cada año en el Club." },
];

/** La línea de confianza al pie del panel del Club (la página de cambios lo dice igual). */
export const CONFIANZA_CLUB = "Cambias o devuelves en cualquier tienda CAYLA.";

/** El texto bajo la tarjeta de «Crear cuenta»: antes de saber el nombre, y con el nombre ya puesto. */
export const PIE_DE_TARJETA = {
  sin: "Con tu documento, tu tarjeta lleva tu nombre.",
  con: "Así queda tu tarjeta del Club.",
} as const;

/* ------------------------------------------------------------------ Volver a entrar */

export type PasoDeAcceso = { titulo: string; texto: string };
export type CaminoDeAcceso = "olvide" | "restablecer";

/** La promesa del panel de las páginas para volver a entrar. */
export const PROMESA_ACCESO = { ceja: "Tu cuenta CAYLA", linea: "Vuelve a tu cuenta", cursiva: "en tres pasos." } as const;

/**
 * Los pasos de cada camino. «Olvidé mi contraseña»: el correo, el enlace (vence en 30 minutos, como dice el correo) y la contraseña
 * nueva, que entra sola. «Restablecer mi acceso»: lo que se pidió en la tienda, el código del correo nuevo y la contraseña nueva.
 */
export const PASOS_DE_ACCESO: Readonly<Record<CaminoDeAcceso, readonly PasoDeAcceso[]>> = {
  olvide: [
    { titulo: "Escribe tu correo", texto: "El de tu cuenta CAYLA." },
    { titulo: "Abre el enlace que te llega", texto: "Vence en 30 minutos. Si no lo ves, revisa tu carpeta de spam." },
    { titulo: "Crea tu contraseña nueva", texto: "Y entras directo a tu cuenta." },
  ],
  restablecer: [
    { titulo: "Lo pediste en tu tienda", texto: "Anotaron tu correo nuevo en tu ficha." },
    { titulo: "Escribe el código", texto: "Te llegó a tu correo nuevo: son 6 números." },
    { titulo: "Crea tu contraseña nueva", texto: "Y entras directo a tu cuenta." },
  ],
};

/** Lo que tranquiliza al pie del panel para volver a entrar: cambiar la contraseña no borra nada. */
export const CONFIANZA_ACCESO = "Tus pedidos, tu Club y tus favoritos siguen en tu cuenta.";

export type EstadoDelPaso = "hecho" | "ahora" | "luego";

/** Cada paso, según el que toca ahora (desde 0). Un número fuera de la lista no enciende ninguno. */
export function estadoDelPaso(i: number, actual: number): EstadoDelPaso {
  if (i < actual) return "hecho";
  return i === actual ? "ahora" : "luego";
}

/* ------------------------------------------------------------------ La tarjeta y el avance de «Crear cuenta» */

/**
 * El nombre que lleva la tarjeta del Club del panel apenas el formulario lo sabe. Con DNI, el del padrón a medias («María P. S.»):
 * lo mismo que ya dice el DNI, nunca más (el nombre completo no llega al navegador). Con carné o pasaporte, el que ella escribe, con la
 * misma forma: el primer nombre y la inicial de cada apellido. null mientras no hay un nombre que poner («Tu nombre aquí»).
 */
export function nombreParaLaTarjeta(r: Pick<Registro, "documentoTipo" | "nombres" | "apellidos">, consulta: ConsultaDocumento): string | null {
  if (r.documentoTipo === "dni") return consulta.estado === "encontrado" ? consulta.aMedias : null;
  if (estadoParteNombre(r.documentoTipo, r.nombres) !== "ok") return null;
  const apellidos = estadoParteNombre(r.documentoTipo, r.apellidos) === "ok" ? r.apellidos : "";
  return nombreAMedias({ nombres: r.nombres, apellidos });
}

/**
 * Cuánto del registro está listo, para la línea que se llena en el pie: los campos que se le piden a ella (con DNI, el nombre no se
 * escribe: sale del padrón, y no cuenta). Los avisos por WhatsApp son opcionales y no cuentan nunca.
 */
export function avanceDelRegistro(estado: EstadoRegistro, tipo: Registro["documentoTipo"]): { listos: number; total: number } {
  const campos: CampoRegistro[] = CAMPOS_REGISTRO.map(([campo]) => campo).filter((c) => tipo !== "dni" || (c !== "nombres" && c !== "apellidos"));
  return { listos: campos.filter((c) => estado[c] === "ok").length, total: campos.length };
}

/* ------------------------------------------------------------------ Abrir el correo */

/** El buzón web de un correo conocido, para ir a buscar el enlace o el código sin perder la página (se abre aparte). */
export type Buzon = { nombre: string; href: string };

const BUZONES: readonly (readonly [readonly string[], Buzon])[] = [
  [["gmail.com", "googlemail.com"], { nombre: "Gmail", href: "https://mail.google.com/" }],
  [["hotmail.com", "hotmail.es", "outlook.com", "outlook.es", "live.com", "msn.com"], { nombre: "Outlook", href: "https://outlook.live.com/mail/" }],
  [["yahoo.com", "yahoo.es", "ymail.com"], { nombre: "Yahoo Mail", href: "https://mail.yahoo.com/" }],
  [["icloud.com", "me.com", "mac.com"], { nombre: "iCloud Mail", href: "https://www.icloud.com/mail" }],
];

/**
 * «Abrir Gmail»: con un correo de un buzón conocido, a dónde ir a leerlo. null con cualquier otro (el de un trabajo, uno mal escrito):
 * ahí no se ofrece nada, y la página dice igual dónde buscar.
 */
export function buzonDelCorreo(correo: string): Buzon | null {
  const partes = correo.trim().toLowerCase().split("@");
  if (partes.length !== 2 || !partes[0]) return null;
  return BUZONES.find(([dominios]) => dominios.includes(partes[1]))?.[1] ?? null;
}
