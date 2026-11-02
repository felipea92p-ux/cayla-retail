// La API del SIRE de SUNAT, en su parte pura (ADR-0601, actividad 5): las direcciones, las credenciales que hacen falta y cómo se leen
// las respuestas. La parte que habla por red vive en `lib/sire-api.ts`; aquí no hay `fetch`, así que todo se prueba sin SUNAT.
//
// Solo se LEE: pedir la propuesta del mes (devuelve un ticket), preguntar por el ticket hasta que esté «06 Terminado» y bajar el .zip.
// Aceptar, reemplazar o generar el registro NO se hace desde aquí (manuales API SIRE Ventas v31 y Compras v28; generar ni siquiera está
// en la API: es del portal). Las credenciales viven en variables de entorno del servidor, nunca en la base ni en el navegador.

import type { RegistroSire } from "./sire-propuesta-reglas";

export const API_SEGURIDAD = "https://api-seguridad.sunat.gob.pe";
export const API_SIRE = "https://api-sire.sunat.gob.pe";

/** El código de libro del SIRE: 140000 el Registro de Ventas, 080000 el de Compras. */
export const CODIGO_LIBRO: Record<RegistroSire, string> = { ventas: "140000", compras: "080000" };

/** «06 Terminado»: el estado de un ticket listo para descargar (Anexo III de los manuales). */
export const TICKET_TERMINADO = "06";

export type CredencialesSire = { clientId: string; clientSecret: string; usuario: string; clave: string };

const VARIABLES = {
  clientId: "SIRE_CLIENT_ID",
  clientSecret: "SIRE_CLIENT_SECRET",
  usuario: "SIRE_USUARIO_SOL",
  clave: "SIRE_CLAVE_SOL",
} as const;

/**
 * Las credenciales, de las variables de entorno. Si falta alguna, dice cuáles (por su nombre de variable, nunca su valor): el proceso
 * automático se salta en silencio y la subida a mano sigue igual.
 */
export function credencialesDe(env: Record<string, string | undefined>): { ok: true; credenciales: CredencialesSire } | { ok: false; faltan: string[] } {
  const faltan = Object.values(VARIABLES).filter((v) => !env[v]?.trim());
  if (faltan.length > 0) return { ok: false, faltan };
  return {
    ok: true,
    credenciales: {
      clientId: env[VARIABLES.clientId]!.trim(),
      clientSecret: env[VARIABLES.clientSecret]!.trim(),
      usuario: env[VARIABLES.usuario]!.trim(),
      clave: env[VARIABLES.clave]!,
    },
  };
}

/** «2026-10» → «202610», el período como lo pide la API. */
export function periodoSire(mes: string): string {
  return mes.replace("-", "");
}

/** El pedido del token (5.1 Servicio Api Seguridad): POST con el formulario. */
export function pedidoToken(c: CredencialesSire): { url: string; cuerpo: URLSearchParams } {
  return {
    url: `${API_SEGURIDAD}/v1/clientessol/${encodeURIComponent(c.clientId)}/oauth2/token/`,
    cuerpo: new URLSearchParams({
      grant_type: "password",
      scope: API_SIRE,
      client_id: c.clientId,
      client_secret: c.clientSecret,
      username: c.usuario,
      password: c.clave,
    }),
  };
}

/** El token de la respuesta de seguridad, o null si no vino. */
export function leerToken(data: unknown): string | null {
  const t = (data as { access_token?: unknown } | null)?.access_token;
  return typeof t === "string" && t !== "" ? t : null;
}

/** Pedir la propuesta en txt: Ventas 5.18 `exportapropuesta`, Compras 5.34 `exportacioncomprobantepropuesta`. Devuelve un ticket. */
export function urlPedirPropuesta(registro: RegistroSire, mes: string): string {
  const per = periodoSire(mes);
  return registro === "ventas"
    ? `${API_SIRE}/v1/contribuyente/migeigv/libros/rvie/propuesta/web/propuesta/${per}/exportapropuesta?codTipoArchivo=0`
    : `${API_SIRE}/v1/contribuyente/migeigv/libros/rce/propuesta/web/propuesta/${per}/exportacioncomprobantepropuesta?codTipoArchivo=0&codOrigenEnvio=2`;
}

/** El número de ticket de la respuesta (AAAA + tipo + correlativo), o null. */
export function leerTicket(data: unknown): string | null {
  const t = (data as { numTicket?: unknown } | null)?.numTicket;
  return typeof t === "string" && t.trim() !== "" ? t.trim() : typeof t === "number" ? String(t) : null;
}

/** Preguntar por un ticket (5.16 / 5.31). */
export function urlEstadoTicket(registro: RegistroSire, mes: string, ticket: string): string {
  const per = periodoSire(mes);
  const q = new URLSearchParams({ perIni: per, perFin: per, page: "1", perPage: "20", numTicket: ticket, codLibro: CODIGO_LIBRO[registro], codOrigenEnvio: "2" });
  return `${API_SIRE}/v1/contribuyente/migeigv/libros/rvierce/gestionprocesosmasivos/web/masivo/consultaestadotickets?${q}`;
}

export type ArchivoTicket = { nombre: string; tipo: string };
export type EstadoTicket = { terminado: boolean; estado: string; descripcion: string; codProceso: string | null; archivos: ArchivoTicket[] };

/**
 * El estado del ticket pedido. SUNAT devuelve una lista paginada: se busca el registro de ESE ticket. El tipo del archivo viene con el
 * nombre mal escrito en algunas respuestas (`codTipoAchivoReporte`): se aceptan las dos formas.
 */
export function leerEstadoTicket(data: unknown, ticket: string): EstadoTicket | null {
  const registros = (data as { registros?: unknown } | null)?.registros;
  if (!Array.isArray(registros)) return null;
  const r = (registros as Record<string, unknown>[]).find((x) => String(x.numTicket ?? "") === ticket) ?? (registros.length === 1 ? (registros[0] as Record<string, unknown>) : null);
  if (!r) return null;
  const estado = String(r.codEstadoProceso ?? "");
  const lista = Array.isArray(r.archivoReporte) ? (r.archivoReporte as Record<string, unknown>[]) : [];
  return {
    terminado: estado === TICKET_TERMINADO,
    estado,
    descripcion: String(r.desEstadoProceso ?? ""),
    codProceso: r.codProceso === undefined || r.codProceso === null ? null : String(r.codProceso),
    archivos: lista
      .map((a) => ({ nombre: String(a.nomArchivoReporte ?? ""), tipo: String(a.codTipoArchivoReporte ?? a.codTipoAchivoReporte ?? "") }))
      .filter((a) => a.nombre !== ""),
  };
}

/** Bajar un archivo de un ticket terminado (5.17 / 5.32). */
export function urlDescargarArchivo(registro: RegistroSire, mes: string, ticket: string, archivo: ArchivoTicket, codProceso: string | null): string {
  const q = new URLSearchParams({
    nomArchivoReporte: archivo.nombre,
    codTipoArchivoReporte: archivo.tipo,
    perTributario: periodoSire(mes),
    numTicket: ticket,
    codLibro: CODIGO_LIBRO[registro],
  });
  if (codProceso) q.set("codProceso", codProceso);
  return `${API_SIRE}/v1/contribuyente/migeigv/libros/rvierce/gestionprocesosmasivos/web/masivo/archivoreporte?${q}`;
}

/** El mes que el proceso automático trae: el anterior al de hoy (la propuesta de un mes en curso todavía cambia). */
export function mesAnterior(mesDeHoy: string): string {
  const [a, m] = mesDeHoy.split("-").map(Number) as [number, number];
  return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, "0")}`;
}
