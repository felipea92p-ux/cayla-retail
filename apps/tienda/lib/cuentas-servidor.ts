import "server-only";
import { base, leerConRespaldo } from "./base";
import { leerBeneficios, leerMiCuenta, type Beneficios, type MiCuenta } from "./cuentas";

// Las cuentas de la tienda en la base del ERP (ADR-0408, actividad 2), solo por sus funciones `retail.tienda_*`
// (20261014224000). Cada una valida por dentro lo que recibe y cuenta sus intentos; aquí solo se leen sus respuestas. Si la base
// no contesta, cada lectura lo dice (`sin_respuesta`) y la pantalla se degrada: nunca se crea nada a medias.

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

export type RespuestaDocumento =
  | { estado: "libre"; delClub: boolean }
  | { estado: "repetido" | "archivada" | "limite" | "invalido" | "sin_respuesta" };

/** ¿Este DNI ya tiene cuenta, o es de una ficha archivada? Cuenta un intento de consulta. */
export const consultarDocumentoEnBase = (dni: string, ipHash: string, documentoHash: string): Promise<RespuestaDocumento> =>
  leerConRespaldo<RespuestaDocumento>(
    "tienda_consultar_documento_fallo",
    async (db) => {
      const [fila] = await db`select retail.tienda_consultar_documento(${dni}::text, ${ipHash}::text, ${documentoHash}::text) as r`;
      const estado = ESTADO(fila?.r);
      if (estado === "libre") return { estado, delClub: (fila?.r as { del_club?: unknown }).del_club === true };
      return estado === "repetido" || estado === "archivada" || estado === "limite" || estado === "invalido" ? { estado } : { estado: "sin_respuesta" };
    },
    { estado: "sin_respuesta" },
  );

export type RespuestaRevision = {
  estado: "ok" | "limite" | "correo_repetido" | "dni_repetido" | "archivada" | "invalido" | "sin_respuesta";
  campo?: string;
};

/** Lo que se pregunta ANTES de crear el usuario de inicio de sesión. Cuenta un intento de registro. */
export const revisarRegistroEnBase = (correo: string, dni: string, celular: string, ipHash: string, documentoHash: string): Promise<RespuestaRevision> =>
  leerConRespaldo<RespuestaRevision>(
    "tienda_revisar_registro_fallo",
    async (db) => {
      const [fila] = await db`select retail.tienda_revisar_registro(${correo}::text, ${dni}::text, ${celular}::text, ${ipHash}::text, ${documentoHash}::text) as r`;
      const estado = ESTADO(fila?.r);
      const conocidos = ["ok", "limite", "correo_repetido", "dni_repetido", "archivada", "invalido"] as const;
      const campo = (fila?.r as { campo?: unknown }).campo;
      return conocidos.includes(estado as (typeof conocidos)[number])
        ? { estado: estado as (typeof conocidos)[number], ...(typeof campo === "string" ? { campo } : {}) }
        : { estado: "sin_respuesta" };
    },
    { estado: "sin_respuesta" },
  );

export type DatosCuenta = {
  usuarioWebId: string;
  correo: string;
  dni: string;
  nombre: string;
  nombreDelPadron: boolean;
  celular: string;
  cumpleDia: number;
  cumpleMes: number;
  cumpleAnio: number | null;
  textos: string;
};

export type ResultadoRegistro =
  | { ok: true; seUnioASuFicha: boolean; eraDelClub: boolean }
  /** La base dijo que no (`hint` y `detalle`, ver `errorDeRegistro`) o no contestó (`hint` null). Nada quedó escrito. */
  | { ok: false; hint: string | null; detalle: string | null };

/** Crea la cuenta y deja a la persona en el Club, todo o nada (`retail.tienda_registrar_cuenta`). */
export async function registrarCuentaEnBase(d: DatosCuenta): Promise<ResultadoRegistro> {
  try {
    const [fila] = await base()`
      select retail.tienda_registrar_cuenta(
        ${d.usuarioWebId}::uuid, ${d.correo}::text, ${d.dni}::text, ${d.nombre}::text, ${d.nombreDelPadron}::boolean,
        ${d.celular}::text, ${d.cumpleDia}::integer, ${d.cumpleMes}::integer, ${d.cumpleAnio}::integer, true, ${d.textos}::text
      ) as r`;
    const r = (fila?.r ?? {}) as { se_unio_a_su_ficha?: unknown; era_del_club?: unknown };
    return { ok: true, seUnioASuFicha: r.se_unio_a_su_ficha === true, eraDelClub: r.era_del_club === true };
  } catch (error) {
    const e = error as { hint?: unknown; detail?: unknown; code?: unknown; message?: unknown };
    const hint = typeof e.hint === "string" ? e.hint : null;
    // Sin el mensaje de la base en el registro: puede traer datos de la persona. El código y el hint bastan.
    if (!hint?.startsWith("cuenta_")) console.error(JSON.stringify({ evento: "tienda_registrar_cuenta_fallo", codigo: e.code ?? null, hint }));
    return { ok: false, hint, detalle: typeof e.detail === "string" ? e.detail : null };
  }
}

export type LecturaCuenta = { estado: "cuenta"; cuenta: MiCuenta } | { estado: "sin_cuenta" } | { estado: "sin_respuesta" };

/** La cuenta de ese usuario del proyecto de clientes. `sin_cuenta` SOLO si la base contestó que no tiene. */
export async function leerMiCuentaEnBase(usuarioWebId: string): Promise<LecturaCuenta> {
  try {
    const [fila] = await base()`select retail.tienda_mi_cuenta(${usuarioWebId}::uuid) as r`;
    if (fila?.r === null || fila?.r === undefined) return { estado: "sin_cuenta" };
    const cuenta = leerMiCuenta(fila.r);
    return cuenta ? { estado: "cuenta", cuenta } : { estado: "sin_respuesta" };
  } catch (error) {
    console.error(JSON.stringify({ evento: "tienda_mi_cuenta_fallo", mensaje: error instanceof Error ? error.message : String(error) }));
    return { estado: "sin_respuesta" };
  }
}

/** El % del cumpleaños y la escala del vale, para los términos. null si la base no contesta: se dicen sin cifras. */
export const leerBeneficiosDelClub = (): Promise<Beneficios | null> =>
  leerConRespaldo(
    "tienda_club_beneficios_fallo",
    async (db) => {
      const [fila] = await db`select retail.tienda_club_beneficios() as r`;
      return leerBeneficios(fila?.r);
    },
    null,
  );
