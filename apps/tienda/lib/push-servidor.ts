import "server-only";
import { base } from "./base";
import type { AparatoPush } from "./push";

// Los avisos push en la base (Felipe, 2026-10-20): los aparatos que pidieron avisos y la cola de los que faltan por enviar. Todo pasa
// por las funciones `tienda_push_*` (la tienda no toca sus tablas). Si la base no responde, el trabajo de envío se va sin hacer esa
// vuelta y la siguiente lo intenta: nunca se cae. En los registros no va ni el texto de un aviso ni la dirección de un aparato: solo el
// evento y el error de la base.

/** Un aviso de la cola, con los aparatos de su cuenta, listo para mandarse. */
export type AvisoAEnviar = {
  id: string;
  titulo: string;
  texto: string;
  enlace: string;
  intentos: number;
  aparatos: AparatoPush[];
};

const registrarFallo = (evento: string, error: unknown) =>
  console.error(JSON.stringify({ evento, mensaje: error instanceof Error ? error.message : String(error) }));

const cadena = (x: unknown): string | null => (typeof x === "string" ? x : null);

const aparatoDe = (x: unknown): AparatoPush | null => {
  if (typeof x !== "object" || x === null) return null;
  const f = x as Record<string, unknown>;
  const endpoint = cadena(f.endpoint);
  const p256dh = cadena(f.p256dh);
  const auth = cadena(f.auth);
  return endpoint && p256dh && auth ? { endpoint, p256dh, auth } : null;
};

const avisoDe = (x: unknown): AvisoAEnviar | null => {
  if (typeof x !== "object" || x === null) return null;
  const f = x as Record<string, unknown>;
  const id = cadena(f.id);
  const titulo = cadena(f.titulo);
  const texto = cadena(f.texto);
  const enlace = cadena(f.enlace);
  if (!id || !titulo || !texto || !enlace || typeof f.intentos !== "number") return null;
  const aparatos = Array.isArray(f.aparatos) ? f.aparatos.flatMap((a) => aparatoDe(a) ?? []) : [];
  return { id, titulo, texto, enlace, intentos: f.intentos, aparatos };
};

/** Guarda (o reasigna) el aparato de esta cuenta. true si la base lo aceptó. */
export async function suscribirAparato(usuarioWebId: string, aparato: AparatoPush): Promise<boolean> {
  try {
    const [fila] = await base()`select retail.tienda_push_suscribir(${usuarioWebId}::uuid, ${aparato.endpoint}::text, ${aparato.p256dh}::text, ${aparato.auth}::text) as r`;
    return fila?.r?.estado === "ok";
  } catch (error) {
    registrarFallo("tienda_push_suscribir_fallo", error);
    return false;
  }
}

/** Apaga los avisos de ese aparato (la persona lo quitó). true si la base lo aceptó. */
export async function quitarAparato(usuarioWebId: string, endpoint: string): Promise<boolean> {
  try {
    const [fila] = await base()`select retail.tienda_push_quitar(${usuarioWebId}::uuid, ${endpoint}::text) as r`;
    return fila?.r?.estado === "ok";
  } catch (error) {
    registrarFallo("tienda_push_quitar_fallo", error);
    return false;
  }
}

/** Toma hasta `limite` avisos pendientes para mandarlos ahora. null si la base no respondió (la vuelta se salta). */
export async function reclamarAvisos(limite: number): Promise<AvisoAEnviar[] | null> {
  try {
    const [fila] = await base()`select retail.tienda_push_reclamar(${limite}::integer) as r`;
    const lista = fila?.r?.avisos;
    if (!Array.isArray(lista)) return null;
    return lista.flatMap((x) => avisoDe(x) ?? []);
  } catch (error) {
    registrarFallo("tienda_push_reclamar_fallo", error);
    return null;
  }
}

/** Da un aviso por enviado (llegó a sus aparatos, o su cuenta no tiene ninguno). */
export async function marcarEnviado(envio: string): Promise<boolean> {
  try {
    const [fila] = await base()`select retail.tienda_push_marcar_enviado(${envio}::uuid) as r`;
    return fila?.r?.estado === "ok";
  } catch (error) {
    registrarFallo("tienda_push_marcar_enviado_fallo", error);
    return false;
  }
}

/** Quita un aparato que el servicio de push dio por muerto (404 o 410). */
export async function quitarAparatoMuerto(endpoint: string): Promise<void> {
  try {
    await base()`select retail.tienda_push_quitar_suscripcion(${endpoint}::text) as r`;
  } catch (error) {
    registrarFallo("tienda_push_quitar_suscripcion_fallo", error);
  }
}
