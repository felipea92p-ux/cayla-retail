import "server-only";
import type { TipoDocumentoClienta } from "@cayla-retail/shared";
import { unstable_cache } from "next/cache";
import { cache } from "react";
import { base, leerConRespaldo } from "./base";
import {
  leerBeneficios,
  leerCasillaWhatsapp,
  leerIntentoDeCodigo,
  leerMiCuenta,
  leerReserva,
  type AvisosAlCrear,
  type Beneficios,
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
  estado: "ok" | "limite" | "correo_repetido" | "correo_de_otra_persona" | "dni_repetido" | "archivada" | "invalido" | "sin_respuesta";
  campo?: string;
};

/** Lo que se pregunta ANTES de mandar el código. Cuenta un intento de registro. */
export const revisarRegistroEnBase = (
  correo: string,
  documento: { tipo: TipoDocumentoClienta; numero: string },
  celular: string,
  ipHash: string,
  documentoHash: string,
): Promise<RespuestaRevision> =>
  leerConRespaldo<RespuestaRevision>(
    "tienda_revisar_registro_fallo",
    async (db) => {
      const [fila] = await db`select retail.tienda_revisar_registro(${correo}::text, ${documento.numero}::text, ${celular}::text, ${ipHash}::text, ${documentoHash}::text, ${documento.tipo}::text) as r`;
      const estado = ESTADO(fila?.r);
      const conocidos = ["ok", "limite", "correo_repetido", "correo_de_otra_persona", "dni_repetido", "archivada", "invalido"] as const;
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

/* ------------------------------------------------------------------ Crear la cuenta */

export type DatosCuenta = {
  usuarioWebId: string;
  correo: string;
  /** DNI, carné de extranjería o pasaporte (20261015161000). */
  documentoTipo: TipoDocumentoClienta;
  documento: string;
  nombre: string;
  /** Con DNI, true: el nombre es el del padrón. Con carné o pasaporte, false: el escrito tal cual. */
  nombreDelPadron: boolean;
  celular: string;
  cumpleDia: number;
  cumpleMes: number;
  cumpleAnio: number | null;
  mayorDeEdad: boolean;
  avisosWhatsapp: boolean;
  /** La versión de la casilla de los avisos que leyó (null si no los marcó). */
  casillaVersion: number | null;
  textos: string;
};

export type ResultadoRegistro =
  | { ok: true; seUnioASuFicha: boolean; eraDelClub: boolean; avisos: AvisosAlCrear }
  /** La base dijo que no (`hint` y `detalle`, ver `errorDeRegistro`) o no contestó (`hint` null). Nada quedó escrito. */
  | { ok: false; hint: string | null; detalle: string | null };

const AVISOS: readonly AvisosAlCrear[] = ["no", "activados", "ya_estaban", "celular_distinto"];

/** Crea la cuenta y deja a la persona en el Club, todo o nada (`retail.tienda_registrar_cuenta`). */
export async function registrarCuentaEnBase(d: DatosCuenta): Promise<ResultadoRegistro> {
  try {
    const [fila] = await base()`
      select retail.tienda_registrar_cuenta(
        ${d.usuarioWebId}::uuid, ${d.correo}::text, ${d.documento}::text, ${d.nombre}::text, ${d.nombreDelPadron}::boolean,
        ${d.celular}::text, ${d.cumpleDia}::integer, ${d.cumpleMes}::integer, ${d.cumpleAnio}::integer, true,
        ${d.mayorDeEdad}::boolean, ${d.avisosWhatsapp}::boolean, ${d.casillaVersion}::integer, ${d.textos}::text, ${d.documentoTipo}::text
      ) as r`;
    const r = (fila?.r ?? {}) as { se_unio_a_su_ficha?: unknown; era_del_club?: unknown; avisos_whatsapp?: unknown };
    const avisos = AVISOS.find((a) => a === r.avisos_whatsapp) ?? "no";
    return { ok: true, seUnioASuFicha: r.se_unio_a_su_ficha === true, eraDelClub: r.era_del_club === true, avisos };
  } catch (error) {
    const e = error as { hint?: unknown; detail?: unknown; code?: unknown; message?: unknown };
    const hint = typeof e.hint === "string" ? e.hint : null;
    // Sin el mensaje de la base en el registro: puede traer datos de la persona. El código y el hint bastan. Un rechazo de negocio
    // (los `cuenta_*` y el correo de otra persona, `correo_repetido`) no es una falla.
    if (!hint?.startsWith("cuenta_") && hint !== "correo_repetido" && hint !== "nombre_con_numeros") {
      console.error(JSON.stringify({ evento: "tienda_registrar_cuenta_fallo", codigo: e.code ?? null, hint }));
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

/** El % del cumpleaños y la escala del vale, para los términos. null si la base no contesta: se dicen sin cifras. */
// Los beneficios del Club son los mismos para todos (los configura el ERP): desde que salen en la portada y en el Inicio (el sello del
// descuento de cumpleaños, 2026-10-16), se comparten entre visitas unos minutos, como el catálogo, en vez de preguntarle a la base en
// cada página. Se guarda el JSON crudo; un fallo NO se guarda (se lanza adentro y se responde `null` afuera, para reintentar).
const beneficiosCompartidos = unstable_cache(
  async (): Promise<unknown> => {
    const [fila] = await base()`select retail.tienda_club_beneficios() as r`;
    return fila?.r ?? null;
  },
  ["tienda-club-beneficios-v1"],
  { revalidate: 300 },
);

export const leerBeneficiosDelClub = async (): Promise<Beneficios | null> => {
  try {
    return leerBeneficios(await beneficiosCompartidos());
  } catch (error) {
    console.error(JSON.stringify({ evento: "tienda_club_beneficios_fallo", mensaje: error instanceof Error ? error.message : String(error) }));
    return null;
  }
};
