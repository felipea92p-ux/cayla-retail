import "server-only";
import type { TipoDocumentoClienta } from "@cayla-retail/shared";
import { cache } from "react";
import { base, leerConRespaldo } from "./base";
import { correoOcultoValido } from "./google";
import {
  leerCasillaWhatsapp,
  leerIntentoDeCodigo,
  leerMiCuenta,
  leerReserva,
  type AvisosAlUnirse,
  type CasillaWhatsapp,
  type IntentoDeCodigo,
  type MiCuenta,
  type Reserva,
} from "./cuentas";

// Las cuentas de la tienda en la base del ERP (ADR-0408, actividades 2 y 2b), solo por sus funciones `retail.tienda_*`
// (20261014224000). Cada una valida por dentro lo que recibe y cuenta sus intentos; aquí solo se leen sus respuestas. Si la base
// no contesta, cada lectura lo dice (`sin_respuesta`) y la pantalla se degrada: nunca se crea nada a medias, ni se manda o se
// prueba un código sin que la base lleve la cuenta.

const ESTADO = (dato: unknown): string | null =>
  typeof dato === "object" && dato !== null && typeof (dato as { estado?: unknown }).estado === "string" ? (dato as { estado: string }).estado : null;

export type RespuestaCorreo = "libre" | "repetido" | "limite" | "invalido" | "sin_respuesta";

/** ¿Ya hay una cuenta con este correo? Cuenta un intento de consulta. */
export const consultarCorreoEnBase = (correo: string, ipHash: string): Promise<RespuestaCorreo> =>
  leerConRespaldo<RespuestaCorreo>(
    "tienda_consultar_correo_fallo",
    async (db) => {
      const [fila] = await db`select retail.tienda_consultar_correo(${correo}::text, ${ipHash}::text) as r`;
      const estado = ESTADO(fila?.r);
      return estado === "libre" || estado === "repetido" || estado === "limite" || estado === "invalido" ? estado : "sin_respuesta";
    },
    "sin_respuesta",
  );

export type RespuestaDocumento = { estado: "libre" | "repetido" | "archivada" | "limite" | "invalido" | "sin_respuesta" };

/**
 * ¿Este documento (DNI, carné o pasaporte, 20261015161000) ya tiene cuenta, o es de una ficha archivada? Cuenta un intento de
 * consulta. Lo que la base dice de más (`del_club`) no se lee: todos se registran igual (Felipe 2026-10-16).
 */
export const consultarDocumentoEnBase = (tipo: TipoDocumentoClienta, numero: string, ipHash: string, documentoHash: string): Promise<RespuestaDocumento> =>
  leerConRespaldo<RespuestaDocumento>(
    "tienda_consultar_documento_fallo",
    async (db) => {
      const [fila] = await db`select retail.tienda_consultar_documento(${numero}::text, ${ipHash}::text, ${documentoHash}::text, ${tipo}::text) as r`;
      const estado = ESTADO(fila?.r);
      return estado === "libre" || estado === "repetido" || estado === "archivada" || estado === "limite" || estado === "invalido"
        ? { estado }
        : { estado: "sin_respuesta" };
    },
    { estado: "sin_respuesta" },
  );

export type RespuestaRevision = {
  /** `correo_de_otra_persona`: es el correo de contacto de OTRA ficha del Club (un correo es de una sola persona, 20261015055000). */
  estado: "ok" | "limite" | "correo_repetido" | "correo_de_otra_persona" | "invalido" | "sin_respuesta";
};

/** Lo que se pregunta al crear la cuenta, después del código (`tienda_revisar_registro_simple`, 20261017175000). Cuenta un intento de registro. */
export const revisarRegistroSimpleEnBase = (correo: string, ipHash: string): Promise<RespuestaRevision> =>
  leerConRespaldo<RespuestaRevision>(
    "tienda_revisar_registro_simple_fallo",
    async (db) => {
      const [fila] = await db`select retail.tienda_revisar_registro_simple(${correo}::text, ${ipHash}::text) as r`;
      const estado = ESTADO(fila?.r);
      const conocidos = ["ok", "limite", "correo_repetido", "correo_de_otra_persona", "invalido"] as const;
      return conocidos.includes(estado as (typeof conocidos)[number]) ? { estado: estado as (typeof conocidos)[number] } : { estado: "sin_respuesta" };
    },
    { estado: "sin_respuesta" },
  );

export type RevisionClub = {
  /** `ya_es_del_club`: la persona ya completó sus datos (otra pestaña, otro aparato). `sin_cuenta`: el usuario no tiene cuenta. */
  estado: "ok" | "limite" | "dni_repetido" | "archivada" | "invalido" | "ya_es_del_club" | "sin_cuenta" | "sin_respuesta";
  campo?: string;
};

/** Lo que se pregunta ANTES de consultar el padrón y unirse al Club (`tienda_revisar_club`). Cuenta un intento de registro. */
export const revisarClubEnBase = (
  usuarioWebId: string,
  documento: { tipo: TipoDocumentoClienta; numero: string },
  celular: string,
  ipHash: string,
  documentoHash: string,
): Promise<RevisionClub> =>
  leerConRespaldo<RevisionClub>(
    "tienda_revisar_club_fallo",
    async (db) => {
      const [fila] = await db`select retail.tienda_revisar_club(${usuarioWebId}::uuid, ${documento.numero}::text, ${celular}::text, ${ipHash}::text, ${documentoHash}::text, ${documento.tipo}::text) as r`;
      const estado = ESTADO(fila?.r);
      const conocidos = ["ok", "limite", "dni_repetido", "archivada", "invalido", "ya_es_del_club", "sin_cuenta"] as const;
      const campo = (fila?.r as { campo?: unknown }).campo;
      return conocidos.includes(estado as (typeof conocidos)[number])
        ? { estado: estado as (typeof conocidos)[number], ...(typeof campo === "string" ? { campo } : {}) }
        : { estado: "sin_respuesta" };
    },
    { estado: "sin_respuesta" },
  );

/* ------------------------------------------------------------------ El código (actividad 2b) */

/**
 * ¿Se puede mandar un código a este correo ahora? Si sí, la base ya lo anotó (vence a los 30 minutos). `reenvio`: solo para un
 * correo que ya pidió el suyo. Sin respuesta, no se manda nada.
 */
export const reservarEnvioEnBase = (correo: string, reenvio: boolean): Promise<Reserva> =>
  leerConRespaldo<Reserva>(
    "tienda_reservar_envio_fallo",
    async (db) => {
      const [fila] = await db`select retail.tienda_reservar_envio(${correo}::text, ${reenvio}::boolean) as r`;
      return leerReserva(fila?.r);
    },
    { estado: "sin_respuesta", limpiar: [] },
  );

/** El usuario que el proyecto de clientes creó (o reusó) al invitar a ese correo. null si la base no contestó. */
export const anotarInvitadoEnBase = (correo: string, usuarioWebId: string): Promise<boolean | null> =>
  leerConRespaldo<boolean | null>(
    "tienda_anotar_invitado_fallo",
    async (db) => {
      const [fila] = await db`select retail.tienda_anotar_invitado(${correo}::text, ${usuarioWebId}::uuid) as r`;
      return fila?.r === true;
    },
    null,
  );

/** ¿Se puede probar un código de este correo ahora? Cuenta el intento ANTES de probarlo. */
export const intentoDeCodigoEnBase = (correo: string): Promise<IntentoDeCodigo> =>
  leerConRespaldo<IntentoDeCodigo>(
    "tienda_intento_de_codigo_fallo",
    async (db) => {
      const [fila] = await db`select retail.tienda_intento_de_codigo(${correo}::text) as r`;
      return leerIntentoDeCodigo(fila?.r);
    },
    { estado: "sin_respuesta" },
  );

/** El texto vigente de la casilla de los avisos por WhatsApp. null si no hay o la base no contesta: no se ofrecen. */
export const leerCasillaDeAvisos = (): Promise<CasillaWhatsapp | null> =>
  leerConRespaldo(
    "tienda_casilla_whatsapp_fallo",
    async (db) => {
      const [fila] = await db`select retail.tienda_casilla_whatsapp() as r`;
      return leerCasillaWhatsapp(fila?.r);
    },
    null,
  );

/* ------------------------------------------------------------------ Crear la cuenta y unirse al Club */

export type DatosCuentaSimple = {
  usuarioWebId: string;
  correo: string;
  nombre: string;
  textos: string;
  /** `correo`: con el código ya probado. `google`: el servidor ya comprobó con el proyecto de clientes que la sesión es de Google. */
  via: "correo" | "google";
};

export type ResultadoCuenta =
  | { ok: true }
  /** La base dijo que no (`hint` y `detalle`, ver `errorDeCuenta`) o no contestó (`hint` null). Nada quedó escrito. */
  | { ok: false; hint: string | null; detalle: string | null };

/** Crea la cuenta con lo mínimo y su ficha mínima, sin Club todavía, todo o nada (`retail.tienda_registrar_cuenta_simple`). */
export async function registrarCuentaSimpleEnBase(d: DatosCuentaSimple): Promise<ResultadoCuenta> {
  try {
    await base()`
      select retail.tienda_registrar_cuenta_simple(
        ${d.usuarioWebId}::uuid, ${d.correo}::text, ${d.nombre}::text, true, ${d.textos}::text, ${d.via}::text
      ) as r`;
    return { ok: true };
  } catch (error) {
    const e = error as { hint?: unknown; detail?: unknown; code?: unknown };
    const hint = typeof e.hint === "string" ? e.hint : null;
    // Sin el mensaje de la base en el registro: puede traer datos de la persona. El código y el hint bastan. Un rechazo de negocio
    // (los `cuenta_*` y el correo de otra persona, `correo_repetido`) no es una falla.
    if (!hint?.startsWith("cuenta_") && hint !== "correo_repetido") {
      console.error(JSON.stringify({ evento: "tienda_registrar_cuenta_simple_fallo", codigo: e.code ?? null, hint }));
    }
    return { ok: false, hint, detalle: typeof e.detail === "string" ? e.detail : null };
  }
}

export type DatosVinculoGoogle = { usuarioWebId: string; correo: string; nombre: string; textos: string };

/** Lo que dijo la base al unir una cuenta de Google a la ficha que ya tenía su correo (`tienda_vincular_cuenta_google`, 20261021170000).
 *  `sin_respuesta`: la base no contestó o todavía no tiene la función (la web se publicó antes de pegar la migración): quien llama sigue
 *  como si no hubiera ficha, y el registro de siempre dirá lo que ya decía. */
export type ResultadoVinculo =
  | { estado: "vinculada" | "ya_tiene_cuenta" | "no_aplica" | "no_coincide" | "sin_respuesta" }
  /** La ficha ya tiene cuenta abierta con OTRO correo y el nombre coincide: `correoCuenta` es ese correo, a medias (20261021182000). */
  | { estado: "otro_correo"; correoCuenta: string };

export async function vincularCuentaGoogleEnBase(d: DatosVinculoGoogle): Promise<ResultadoVinculo> {
  try {
    const [fila] = await base()`
      select retail.tienda_vincular_cuenta_google(${d.usuarioWebId}::uuid, ${d.correo}::text, ${d.nombre}::text, ${d.textos}::text) as r`;
    const estado = ESTADO(fila?.r);
    if (estado === "otro_correo") {
      const correoCuenta = correoOcultoValido((fila?.r as { correo_cuenta?: unknown }).correo_cuenta);
      // Sin un correo a medias que se pueda mostrar, se dice lo de siempre (la persona no se une igual).
      return correoCuenta ? { estado, correoCuenta } : { estado: "no_coincide" };
    }
    const conocidos = ["vinculada", "ya_tiene_cuenta", "no_aplica", "no_coincide"] as const;
    return conocidos.includes(estado as (typeof conocidos)[number]) ? { estado: estado as (typeof conocidos)[number] } : { estado: "sin_respuesta" };
  } catch (error) {
    const e = error as { hint?: unknown; code?: unknown };
    // Sin el mensaje de la base en el registro: puede traer datos de la persona. El código y el hint bastan.
    console.error(JSON.stringify({ evento: "tienda_vincular_cuenta_google_fallo", codigo: e.code ?? null, hint: typeof e.hint === "string" ? e.hint : null }));
    return { estado: "sin_respuesta" };
  }
}

export type DatosClub = {
  usuarioWebId: string;
  /** DNI, carné de extranjería o pasaporte (20261015161000). */
  documentoTipo: TipoDocumentoClienta;
  documento: string;
  nombre: string;
  /** Con DNI, true: el nombre es el del padrón. Con carné o pasaporte, false: el escrito tal cual. */
  nombreDelPadron: boolean;
  celular: string;
  cumpleDia: number | null;
  cumpleMes: number | null;
  cumpleAnio: number | null;
  mayorDeEdad: boolean;
  avisosWhatsapp: boolean;
  /** La versión de la casilla de los avisos que leyó (null si no los marcó). */
  casillaVersion: number | null;
  textos: string;
};

export type ResultadoClub =
  | { ok: true; yaEra: boolean; seUnioASuFicha: boolean; eraDelClub: boolean; avisos: AvisosAlUnirse }
  | { ok: false; hint: string | null; detalle: string | null };

const AVISOS: readonly AvisosAlUnirse[] = ["no", "activados", "ya_estaban", "celular_distinto"];

/** Da de alta en el Club a la persona de esa cuenta, todo o nada (`retail.tienda_unirse_al_club`). */
export async function unirseAlClubEnBase(d: DatosClub): Promise<ResultadoClub> {
  try {
    const [fila] = await base()`
      select retail.tienda_unirse_al_club(
        ${d.usuarioWebId}::uuid, ${d.documento}::text, ${d.nombre}::text, ${d.nombreDelPadron}::boolean, ${d.celular}::text,
        ${d.cumpleDia}::integer, ${d.cumpleMes}::integer, ${d.cumpleAnio}::integer, ${d.mayorDeEdad}::boolean, true,
        ${d.avisosWhatsapp}::boolean, ${d.casillaVersion}::integer, ${d.textos}::text, ${d.documentoTipo}::text
      ) as r`;
    const r = (fila?.r ?? {}) as { estado?: unknown; se_unio_a_su_ficha?: unknown; era_del_club?: unknown; avisos_whatsapp?: unknown };
    const avisos = AVISOS.find((a) => a === r.avisos_whatsapp) ?? "no";
    return { ok: true, yaEra: r.estado === "ya_era", seUnioASuFicha: r.se_unio_a_su_ficha === true, eraDelClub: r.era_del_club === true, avisos };
  } catch (error) {
    const e = error as { hint?: unknown; detail?: unknown; code?: unknown };
    const hint = typeof e.hint === "string" ? e.hint : null;
    if (!hint?.startsWith("cuenta_") && hint !== "correo_repetido" && hint !== "nombre_con_numeros" && hint !== "nombre_sin_padron") {
      console.error(JSON.stringify({ evento: "tienda_unirse_al_club_fallo", codigo: e.code ?? null, hint }));
    }
    return { ok: false, hint, detalle: typeof e.detail === "string" ? e.detail : null };
  }
}

export type LecturaCuenta = { estado: "cuenta"; cuenta: MiCuenta } | { estado: "sin_cuenta" } | { estado: "sin_respuesta" };

/** La cuenta de ese usuario del proyecto de clientes. `sin_cuenta` SOLO si la base contestó que no tiene. Una vez por petición: el
 *  saludo del menú de la persona y la página (el Inicio, «Mi perfil») la comparten (antes, dos consultas iguales por visita). */
export const leerMiCuentaEnBase = cache(async (usuarioWebId: string): Promise<LecturaCuenta> => {
  try {
    const [fila] = await base()`select retail.tienda_mi_cuenta(${usuarioWebId}::uuid) as r`;
    if (fila?.r === null || fila?.r === undefined) return { estado: "sin_cuenta" };
    const cuenta = leerMiCuenta(fila.r);
    return cuenta ? { estado: "cuenta", cuenta } : { estado: "sin_respuesta" };
  } catch (error) {
    console.error(JSON.stringify({ evento: "tienda_mi_cuenta_fallo", mensaje: error instanceof Error ? error.message : String(error) }));
    return { estado: "sin_respuesta" };
  }
});
