import { z } from "zod";
import { CLAVE_MAXIMA, correoValido, enMinutos, normalizarCorreo, type EstadoCampo } from "./cuentas";
import { enlaceWhatsapp } from "./tiendas";

// «Mi cuenta» de la tienda online (Felipe 2026-10-15): cambiar el correo con que se entra, restablecer el acceso que pidió en una tienda
// y eliminar la cuenta. Lógica pura, sin red: lo que dice cada campo, las palabras y cómo se leen las respuestas de la base
// (`20261015132000`). La usan las páginas (navegador), las acciones (servidor) y sus pruebas.
//
// Quien decide de verdad es la base (los topes, qué correo se puede pedir, cuándo se aplica) y el proyecto de inicio de sesión de los
// clientes (el código): esto solo evita mandar lo que ellos rechazarían y dice por qué, con las mismas palabras en las dos puntas.

/* ------------------------------------------------------------------ Las palabras */

export const TEXTOS_CUENTA = {
  correoNuevoAyuda: "Te mandamos un código a ese correo. Desde que lo confirmes, entras con él.",
  mismoCorreo: "Ese ya es el correo con el que entras.",
  claveActualAyuda: "La que usas para entrar. Es para confirmar que eres tú.",
  claveMala: "Esa no es tu contraseña. Revísala e inténtalo otra vez.",
  noDisponible: "No pudimos hacerlo ahora. Intenta de nuevo en unos minutos.",
  codigoNoEnviado: "No pudimos mandarte el código ahora. Intenta de nuevo en un minuto.",
  codigoSinPedir: "Pide un código nuevo: el de antes ya no sirve.",
  codigoCorreo: (correo: string) => `Te mandamos un código de 6 números a ${correo}. Escríbelo aquí; vence en 30 minutos.`,
  correoCambiado: (anterior: string) => `A tu correo de antes, ${anterior}, le avisamos del cambio.`,
  correoTomado: "Otra persona registró ese correo mientras lo confirmabas. Usa otro correo.",
  // Restablecer el acceso (lo pidió en una tienda CAYLA)
  restablecerAyuda: "Escribe el correo que diste en la tienda, el código que te llegó y tu contraseña nueva.",
  restablecerReenvio: "Si en una tienda CAYLA pidieron restablecer tu acceso con ese correo, te llega un código nuevo en un momento.",
  restablecerNoHay:
    "Ese código no es o ya no sirve. Revisa el correo que diste en la tienda, o pide un código nuevo. Si pasó más de un día, pídelo otra vez en la tienda.",
  claveNuevaAyuda: "8 caracteres o más. Con ella entras desde ahora.",
  // Eliminar la cuenta
  eliminarFrenaTitulo: "Antes, termina lo que tienes con la tienda",
  eliminarFrenaTexto: "Tu cuenta se puede eliminar cuando no tengas pedidos ni apartados pendientes: si no, se quedarían sin dueño.",
} as const;

/** Lo que borra «Eliminar mi cuenta» (los textos de la página, en este orden). */
export const QUE_SE_BORRA: readonly string[] = [
  "Tu cuenta de la tienda online: ya no podrás entrar con tu correo y tu contraseña.",
  "Tus datos: tu nombre, tu DNI, tu celular, tus correos, tu cumpleaños y tus tallas.",
  "Tu lugar en el Club CAYLA: dejas de ser miembro y pierdes tu descuento de cumpleaños y tu vale de aniversario.",
  "Tus favoritos y tus avisos de «Avísame cuando llegue».",
];

/** Lo que queda (la ley tributaria pide guardar los comprobantes; sin sus datos, no dicen quién es). */
export const QUE_QUEDA =
  "Tus compras y sus comprobantes quedan en CAYLA, pero sin tus datos: la ley nos pide guardarlos. No se puede deshacer; si quieres volver, puedes crear una cuenta nueva.";

/* ------------------------------------------------------------------ Lo que dice cada campo */

/**
 * El correo nuevo: falta, mal escrito, el mismo de ahora o el que la base rechazó (`repetido`: de otra persona, sin decir de quién), o
 * listo. `rechazado`: el correo que la base dijo que no, mientras siga escrito ese.
 */
export function estadoCorreoNuevo(correo: string, actual: string, rechazado: string | null): EstadoCampo {
  const c = normalizarCorreo(correo);
  if (!c) return "falta";
  if (!correoValido(c)) return (c.split("@")[1] ?? "").includes(".") ? "mal" : "falta";
  if (c === normalizarCorreo(actual) || c === rechazado) return "repetido";
  return "ok";
}

/** La contraseña que ya tiene (para confirmar que es ella): basta con escribirla; la base y el proyecto de clientes la prueban. */
export const estadoClaveActual = (clave: string): EstadoCampo => (clave.length === 0 ? "falta" : clave.length > CLAVE_MAXIMA ? "mal" : "ok");

/* ------------------------------------------------------------------ La guía: qué está listo, qué sigue y qué falta */

/** Los pasos de «Cambiar mi correo» y de «Restablecer mi acceso», en el orden de la página. `obtener`: pedir el código del correo nuevo. */
export type PasoDelCorreo = "clave" | "correo" | "obtener" | "codigo" | "clave_nueva";

export type EstadoDelCorreo = {
  /** Lo que dice cada campo (listo, falta o mal), para su marca. */
  campos: Record<"clave" | "correo" | "codigo" | "clave_nueva", EstadoCampo>;
  /** Lo que falta, en el orden de la página, con su nombre para «Falta: …». */
  faltan: (readonly [PasoDelCorreo, string])[];
};

/**
 * «Cambiar mi correo» (Mi cuenta): su contraseña, el correo nuevo, obtener el código y escribirlo. `pedidoPara`: el correo al que se
 * pidió el último código (si después se cambió el correo de la caja, ese código ya no le sirve: hay que obtener otro).
 */
export function estadoCambioDeCorreo(e: {
  clave: string;
  correo: string;
  actual: string;
  rechazado: string | null;
  pedidoPara: string | null;
  codigo: string;
  confirmado: boolean;
}): EstadoDelCorreo {
  const correo = estadoCorreoNuevo(e.correo, e.actual, e.rechazado);
  const pedido = e.pedidoPara !== null && e.pedidoPara === normalizarCorreo(e.correo);
  const codigo: EstadoCampo = e.confirmado ? "ok" : pedido && /^\d{6}$/.test(e.codigo) ? "ok" : "falta";
  const clave = e.confirmado ? "ok" : estadoClaveActual(e.clave);
  const faltan: (readonly [PasoDelCorreo, string])[] = [];
  if (!e.confirmado) {
    if (clave !== "ok") faltan.push(["clave", "tu contraseña"]);
    if (correo !== "ok") faltan.push(["correo", "tu correo nuevo"]);
    else if (!pedido) faltan.push(["obtener", "obtener el código"]);
    // «Falta: obtener el código y escribirlo» (no «… y el código», que se lee dos veces).
    if (codigo !== "ok") faltan.push(["codigo", correo === "ok" && !pedido ? "escribirlo" : "el código"]);
  }
  return { campos: { clave, correo: e.confirmado ? "ok" : correo, codigo, clave_nueva: "ok" }, faltan };
}

/**
 * «Restablecer mi acceso» (sin sesión): el correo nuevo (el que dio en la tienda), su código y la contraseña nueva. El código ya puede
 * haberle llegado (lo mandó la tienda), así que no hace falta «Obtener código» para escribirlo.
 */
export function estadoRestablecer(e: { correo: string; codigo: string; clave: string }): EstadoDelCorreo {
  const c = normalizarCorreo(e.correo);
  const correo: EstadoCampo = !c ? "falta" : correoValido(c) ? "ok" : (c.split("@")[1] ?? "").includes(".") ? "mal" : "falta";
  const codigo: EstadoCampo = /^\d{6}$/.test(e.codigo) ? "ok" : "falta";
  const claveNueva: EstadoCampo = e.clave.length > CLAVE_MAXIMA ? "mal" : e.clave.length >= 8 ? "ok" : "falta";
  const faltan: (readonly [PasoDelCorreo, string])[] = [];
  if (correo !== "ok") faltan.push(["correo", "tu correo nuevo"]);
  if (codigo !== "ok") faltan.push(["codigo", "el código"]);
  if (claveNueva !== "ok") faltan.push(["clave_nueva", "tu contraseña nueva"]);
  return { campos: { clave: "ok", correo, codigo, clave_nueva: claveNueva }, faltan };
}

/** «tu contraseña, tu correo nuevo y el código» (para «Falta: …»). */
export function textoDeLoQueFalta(faltan: readonly (readonly [PasoDelCorreo, string])[]): string {
  const nombres = faltan.map(([, nombre]) => nombre);
  if (nombres.length <= 1) return nombres.join("");
  return `${nombres.slice(0, -1).join(", ")} y ${nombres[nombres.length - 1]}`;
}

/**
 * Qué paso se enciende («Sigue aquí»): mientras la persona está dentro de un campo, la luz no se va de ahí; sin foco, el primero que
 * falta (la regla de tacto de la guía de foco, ADR-0284, la misma del registro).
 */
export function pasoQueSigue(estado: EstadoDelCorreo, enFoco: PasoDelCorreo | null): PasoDelCorreo | null {
  if (enFoco && estado.faltan.some(([p]) => p === enFoco)) return enFoco;
  if (enFoco) return null;
  return estado.faltan[0]?.[0] ?? null;
}

/* ------------------------------------------------------------------ Lo que contesta la base */

const esquemaEstado = z.object({ estado: z.string() });
const entero = (v: unknown, defecto = 1) => (typeof v === "number" && Number.isInteger(v) && v > 0 ? v : defecto);
const correoDe = (v: unknown) => (typeof v === "string" && correoValido(v) ? normalizarCorreo(v) : null);
const uuidDe = (v: unknown) => (typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v) ? v : null);

/** Los topes de un envío, comunes a todo pedido de código (la regla de la 2b). */
export type TopeDeEnvio = { estado: "esperar"; segundos: number } | { estado: "limite" | "bloqueado"; minutos: number };

function leerTope(e: string, r: Record<string, unknown>): TopeDeEnvio | null {
  if (e === "esperar") return { estado: "esperar", segundos: entero(r.segundos) };
  if (e === "limite" || e === "bloqueado") return { estado: e, minutos: entero(r.minutos) };
  return null;
}

/** `tienda_pedir_cambio_correo`: ¿se manda el código al correo nuevo? `sin_pedido`: un «Reenviar» a un correo que no pidió. */
export type PedidoDeCambio =
  | { estado: "enviar"; correoActual: string; correoNuevo: string }
  | TopeDeEnvio
  | { estado: "sin_cuenta" | "invalido" | "sin_pedido" | "mismo_correo" | "correo_de_otra_persona" | "sin_respuesta" };

export function leerPedidoDeCambio(dato: unknown): PedidoDeCambio {
  const e = esquemaEstado.safeParse(dato);
  if (!e.success) return { estado: "sin_respuesta" };
  const r = dato as Record<string, unknown>;
  const tope = leerTope(e.data.estado, r);
  if (tope) return tope;
  switch (e.data.estado) {
    case "enviar": {
      const actual = correoDe(r.correo_actual);
      const nuevo = correoDe(r.correo_nuevo);
      return actual && nuevo ? { estado: "enviar", correoActual: actual, correoNuevo: nuevo } : { estado: "sin_respuesta" };
    }
    case "sin_cuenta":
    case "invalido":
    case "sin_pedido":
    case "mismo_correo":
    case "correo_de_otra_persona":
      return { estado: e.data.estado };
    default:
      return { estado: "sin_respuesta" };
  }
}

/** `tienda_intento_cambio_correo` y `tienda_restablecer_intento`: ¿se puede probar el código ahora? (Cuenta el intento.) */
export type IntentoDelCodigo =
  | { estado: "puede"; quedan: number; usuarioWebId: string | null }
  | { estado: "bloqueado"; minutos: number }
  | { estado: "vencido" | "sin_pedido" | "sin_cuenta" | "invalido" | "muchos_intentos" | "sin_respuesta" };

export function leerIntentoDelCodigo(dato: unknown): IntentoDelCodigo {
  const e = esquemaEstado.safeParse(dato);
  if (!e.success) return { estado: "sin_respuesta" };
  const r = dato as Record<string, unknown>;
  switch (e.data.estado) {
    case "puede":
      return typeof r.quedan === "number" && Number.isInteger(r.quedan) && r.quedan >= 0
        ? { estado: "puede", quedan: r.quedan, usuarioWebId: uuidDe(r.usuario_web_id) }
        : { estado: "sin_respuesta" };
    case "bloqueado":
      return { estado: "bloqueado", minutos: entero(r.minutos, 15) };
    case "vencido":
    case "sin_pedido":
    case "sin_cuenta":
    case "invalido":
    case "muchos_intentos":
      return { estado: e.data.estado };
    default:
      return { estado: "sin_respuesta" };
  }
}

/** `tienda_correo_confirmado`: el correo que el proyecto de clientes dice que quedó, ¿se aplicó? */
export type CorreoConfirmado =
  | { estado: "aplicado"; origen: "cuenta" | "tienda" }
  | { estado: "igual" }
  | { estado: "sin_pedido" | "de_otra_persona" | "invalido"; correoActual: string | null }
  | { estado: "sin_cuenta" | "sin_respuesta" };

export function leerCorreoConfirmado(dato: unknown): CorreoConfirmado {
  const e = esquemaEstado.safeParse(dato);
  if (!e.success) return { estado: "sin_respuesta" };
  const r = dato as Record<string, unknown>;
  switch (e.data.estado) {
    case "aplicado":
      return { estado: "aplicado", origen: r.origen === "tienda" ? "tienda" : "cuenta" };
    case "igual":
      return { estado: "igual" };
    case "sin_pedido":
    case "de_otra_persona":
    case "invalido":
      return { estado: e.data.estado, correoActual: correoDe(r.correo_actual) };
    case "sin_cuenta":
      return { estado: "sin_cuenta" };
    default:
      return { estado: "sin_respuesta" };
  }
}

/** `tienda_restablecer_enviar` (el primer envío, con la ficha del ERP) y `tienda_restablecer_reenviar` (desde la página pública). */
export type EnvioDelRestablecer =
  | { estado: "enviar"; usuarioWebId: string | null; correoActual: string | null; correoNuevo: string }
  | TopeDeEnvio
  | { estado: "invalido" | "sin_pedido" | "muchos_intentos" | "sin_respuesta" };

export function leerEnvioDelRestablecer(dato: unknown): EnvioDelRestablecer {
  const e = esquemaEstado.safeParse(dato);
  if (!e.success) return { estado: "sin_respuesta" };
  const r = dato as Record<string, unknown>;
  const tope = leerTope(e.data.estado, r);
  if (tope) return tope;
  switch (e.data.estado) {
    case "enviar": {
      const nuevo = correoDe(r.correo_nuevo);
      return nuevo
        ? { estado: "enviar", usuarioWebId: uuidDe(r.usuario_web_id), correoActual: correoDe(r.correo_actual), correoNuevo: nuevo }
        : { estado: "sin_respuesta" };
    }
    case "invalido":
    case "sin_pedido":
    case "muchos_intentos":
      return { estado: e.data.estado };
    default:
      return { estado: "sin_respuesta" };
  }
}

/** `tienda_intento_de_clave`: ¿se puede probar la contraseña ahora? (Cuenta el intento.) */
export type IntentoDeClave = { estado: "puede"; quedan: number } | { estado: "bloqueado"; minutos: number } | { estado: "sin_cuenta" | "sin_respuesta" };

export function leerIntentoDeClave(dato: unknown): IntentoDeClave {
  const e = esquemaEstado.safeParse(dato);
  if (!e.success) return { estado: "sin_respuesta" };
  const r = dato as Record<string, unknown>;
  if (e.data.estado === "puede" && typeof r.quedan === "number" && Number.isInteger(r.quedan) && r.quedan >= 0) return { estado: "puede", quedan: r.quedan };
  if (e.data.estado === "bloqueado") return { estado: "bloqueado", minutos: entero(r.minutos, 15) };
  if (e.data.estado === "sin_cuenta") return { estado: "sin_cuenta" };
  return { estado: "sin_respuesta" };
}

/** Un pedido web que frena «Eliminar cuenta». */
export type PedidoQueFrena = { codigo: string; estado: "por_confirmar" | "confirmado" | "pagado"; tienda: string; whatsapp: string | null };
/** Un apartado abierto en tienda que frena «Eliminar cuenta». */
export type ApartadoQueFrena = { codigo: string; tienda: string; whatsapp: string | null };
export type LoQueFrena = { pedidos: PedidoQueFrena[]; apartados: ApartadoQueFrena[] };

const esquemaFrena = z.object({
  pedidos: z.array(
    z.object({ codigo: z.string().min(1), estado: z.enum(["por_confirmar", "confirmado", "pagado"]), tienda: z.string(), whatsapp: z.string().nullable() }),
  ),
  apartados: z.array(z.object({ codigo: z.string().min(1), tienda: z.string(), whatsapp: z.string().nullable() })),
});

/** La respuesta de `tienda_antes_de_eliminar` (o la lista de un `en_curso`). null si no se entiende: entonces no se ofrece eliminar. */
export function leerLoQueFrena(dato: unknown): LoQueFrena | null {
  const r = esquemaFrena.safeParse(dato);
  if (!r.success) return null;
  const wsp = (n: string | null) => (n && /^9\d{8}$/.test(n) ? n : null);
  return {
    pedidos: r.data.pedidos.map((p) => ({ ...p, whatsapp: wsp(p.whatsapp) })),
    apartados: r.data.apartados.map((a) => ({ ...a, whatsapp: wsp(a.whatsapp) })),
  };
}

export const nadaQueFrene = (f: LoQueFrena) => f.pedidos.length === 0 && f.apartados.length === 0;

/** `tienda_eliminar_mi_cuenta`. */
export type Eliminacion = { estado: "eliminada" } | { estado: "en_curso"; frena: LoQueFrena } | { estado: "sin_cuenta" | "sin_respuesta" };

export function leerEliminacion(dato: unknown): Eliminacion {
  const e = esquemaEstado.safeParse(dato);
  if (!e.success) return { estado: "sin_respuesta" };
  if (e.data.estado === "eliminada") return { estado: "eliminada" };
  if (e.data.estado === "sin_cuenta") return { estado: "sin_cuenta" };
  if (e.data.estado === "en_curso") {
    const frena = leerLoQueFrena(dato);
    return frena ? { estado: "en_curso", frena } : { estado: "sin_respuesta" };
  }
  return { estado: "sin_respuesta" };
}

/* ------------------------------------------------------------------ Lo que frena «Eliminar», en palabras de la tienda */

/** «CAYLA Trujillo» (la web guarda «Trujillo»), como nombra la tienda el resto de la cuenta. Una tienda sin nombre web llega con el del
 *  ERP («Tienda Lima»): esa se deja tal cual. */
const enLaTienda = (tienda: string) => (/^(cayla|tienda)\b/i.test(tienda.trim()) ? tienda.trim() : `CAYLA ${tienda.trim()}`);

/** Qué hacer con cada pedido o apartado que frena: una línea y su camino (ver el pedido, o escribirle a la tienda). */
export type QueHacer = { titulo: string; texto: string; enlace: { texto: string; href: string; externo: boolean } | null };

export function queHacerConElPedido(p: PedidoQueFrena): QueHacer {
  const tienda = enLaTienda(p.tienda);
  if (p.estado === "pagado") {
    return {
      titulo: `Pedido ${p.codigo} · pagado`,
      texto: `Recógelo en ${tienda} con tu código. Cuando lo recojas, puedes eliminar tu cuenta.`,
      enlace: { texto: "Ver mi pedido", href: `/cuenta/pedidos/${p.codigo}`, externo: false },
    };
  }
  const queEs = p.estado === "por_confirmar" ? "por confirmar" : "confirmado";
  return {
    titulo: `Pedido ${p.codigo} · ${queEs}`,
    texto: `Recógelo en ${tienda} o, si ya no lo quieres, escríbele a la tienda para que lo anule.`,
    enlace: p.whatsapp
      ? {
          texto: "Escribir a la tienda",
          href: `${enlaceWhatsapp(p.whatsapp)}?text=${encodeURIComponent(`Hola ${tienda}, quiero anular mi pedido ${p.codigo}.`)}`,
          externo: true,
        }
      : { texto: "Ver mi pedido", href: `/cuenta/pedidos/${p.codigo}`, externo: false },
  };
}

export function queHacerConElApartado(a: ApartadoQueFrena): QueHacer {
  const tienda = enLaTienda(a.tienda);
  return {
    titulo: `Apartado ${a.codigo}`,
    texto: `Lo tienes separado en ${tienda}. Recógelo, o pide en la tienda que lo cierren.`,
    enlace: a.whatsapp
      ? {
          texto: "Escribir a la tienda",
          href: `${enlaceWhatsapp(a.whatsapp)}?text=${encodeURIComponent(`Hola ${tienda}, quiero hablar de mi apartado ${a.codigo}.`)}`,
          externo: true,
        }
      : null,
  };
}

/* ------------------------------------------------------------------ La ruta que llama el ERP (el primer código del restablecer) */

/** La ficha de un solo uso que manda el servidor del ERP: 64 cifras hexadecimales. null si no viene o no tiene esa forma. */
export function leerFichaDelErp(cuerpo: unknown): string | null {
  const f = typeof cuerpo === "object" && cuerpo !== null ? (cuerpo as { ficha?: unknown }).ficha : null;
  return typeof f === "string" && /^[0-9a-f]{64}$/.test(f) ? f : null;
}

export type EstadoParaElErp = "enviado" | "esperar" | "limite" | "bloqueado" | "correo_tomado" | "invalido" | "no_disponible";

/**
 * Lo que la ruta le contesta al ERP, sin datos de nadie: si el código salió, por qué no (con los segundos o minutos de la espera) y el
 * código HTTP (503 solo si algo no contestó: el ERP puede volver a intentar). `envioDelProyecto`: lo que dijo el proyecto de clientes
 * (null si no se llegó a mandar).
 */
export function respuestaDelEnvioAlErp(
  envio: EnvioDelRestablecer,
  envioDelProyecto: "enviado" | "correo_tomado" | "no_disponible" | null,
): { status: number; cuerpo: { estado: EstadoParaElErp; segundos?: number; minutos?: number } } {
  if (envio.estado === "enviar") {
    if (envioDelProyecto === "enviado") return { status: 200, cuerpo: { estado: "enviado" } };
    if (envioDelProyecto === "correo_tomado") return { status: 200, cuerpo: { estado: "correo_tomado" } };
    return { status: 503, cuerpo: { estado: "no_disponible" } };
  }
  if (envio.estado === "esperar") return { status: 200, cuerpo: { estado: "esperar", segundos: envio.segundos } };
  if (envio.estado === "limite" || envio.estado === "bloqueado") return { status: 200, cuerpo: { estado: envio.estado, minutos: envio.minutos } };
  if (envio.estado === "sin_respuesta") return { status: 503, cuerpo: { estado: "no_disponible" } };
  return { status: 200, cuerpo: { estado: "invalido" } };
}

/* ------------------------------------------------------------------ Los mensajes de un código */

/** Lo que dice el paso del código según la base (los mismos textos de crear la cuenta). */
export function mensajeDelTope(t: TopeDeEnvio): string {
  if (t.estado === "esperar") return `Te mandamos uno hace poco. Puedes pedir otro en ${t.segundos} segundos.`;
  if (t.estado === "limite") return `Ya te mandamos 5 códigos. Puedes pedir otro en ${enMinutos(t.minutos)}.`;
  return `Hiciste muchos intentos. Espera ${enMinutos(t.minutos)} y pide un código nuevo.`;
}

/** El aviso de la contraseña que se bloqueó (5 intentos en 15 minutos). */
export const mensajeClaveBloqueada = (minutos: number) => `Probaste muchas contraseñas seguidas. Espera ${enMinutos(minutos)} y vuelve a intentarlo.`;

/**
 * ¿Hay que poner al día el correo de la base? Sí, si el que dice el proyecto de clientes para esta sesión (el de verdad para entrar) no
 * es el que guarda la base: un código que se confirmó y la base no llegó a anotar (no contestó en ese momento, o se confirmó directo
 * contra el proyecto). «Mi cuenta» lo concilia con `tienda_correo_confirmado`, que solo lo aplica si se había pedido.
 */
export const correoPorConciliar = (deLaSesion: string | null, deLaBase: string): string | null =>
  deLaSesion && correoValido(deLaSesion) && normalizarCorreo(deLaSesion) !== normalizarCorreo(deLaBase) ? normalizarCorreo(deLaSesion) : null;
