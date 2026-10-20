import "server-only";
import { base } from "./base";

// El historial de notificaciones de cada cuenta (Felipe, 2026-10-19), guardado en la base con sus tres funciones de la tienda
// (`tienda_avisos_*`, migración 20261020002000). La cuenta llega validada con el proyecto de clientes (`leerSesion`): la base solo
// toca lo de esa cuenta. Si la base no responde, la lectura devuelve null y la campanita se dibuja sin el historial: nunca se cae.
// En los registros del servidor no va el texto de ningún aviso: solo el evento y el error de la base.

export type TipoAviso = "llego" | "respuesta";

/** Lo que la tienda manda a guardar: un aviso que hoy está a favor. `cuando`: cuándo llegó a la cuenta, si se sabe. */
export type EntradaAviso = { clave: string; tipo: TipoAviso; titulo: string; texto: string; href: string; cuando?: string };

/** Un aviso del historial, tal como lo guardó la base. */
export type AvisoGuardado = {
  clave: string;
  tipo: TipoAviso;
  titulo: string;
  texto: string;
  href: string;
  recibidoEn: string;
  vigente: boolean;
};

/** Una página del historial, más todas las claves no borradas (para el globo y el aviso en vivo, sin importar la página). */
export type ListaAvisos = { total: number; pagina: number; tamano: number; items: AvisoGuardado[]; claves: string[] };

const avisoGuardado = (x: unknown): AvisoGuardado | null => {
  if (typeof x !== "object" || x === null) return null;
  const f = x as Record<string, unknown>;
  if (typeof f.clave !== "string" || (f.tipo !== "llego" && f.tipo !== "respuesta")) return null;
  if (typeof f.titulo !== "string" || typeof f.texto !== "string" || typeof f.href !== "string") return null;
  if (typeof f.recibido_en !== "string" || typeof f.vigente !== "boolean") return null;
  return { clave: f.clave, tipo: f.tipo, titulo: f.titulo, texto: f.texto, href: f.href, recibidoEn: f.recibido_en, vigente: f.vigente };
};

const registrarFallo = (evento: string, error: unknown) =>
  console.error(JSON.stringify({ evento, mensaje: error instanceof Error ? error.message : String(error) }));

/** Guarda los avisos que hoy están a favor (los nuevos quedan con su hora de recepción). `completo`: la lista de tallas se leyó entera, así
 *  que las que ya no están a favor pasan a no vigentes. No devuelve nada: si falla, el historial simplemente no se actualiza esta vez. */
export async function sincronizarAvisos(usuarioWebId: string, avisos: readonly EntradaAviso[], completo: boolean): Promise<void> {
  try {
    await base()`select retail.tienda_avisos_sincronizar(${usuarioWebId}::uuid, ${JSON.stringify(avisos)}::text::jsonb, ${completo}::boolean)`;
  } catch (error) {
    registrarFallo("tienda_avisos_sincronizar_fallo", error);
  }
}

/** Una página de las notificaciones no borradas, de la más reciente a la más antigua. null si la base no respondió. */
export async function listarAvisos(
  usuarioWebId: string,
  opciones: { busqueda?: string; pagina?: number; tamano?: number; soloBandeja?: boolean } = {},
): Promise<ListaAvisos | null> {
  try {
    const [fila] = await base()`select retail.tienda_avisos_listar(${usuarioWebId}::uuid, ${opciones.busqueda ?? ""}::text, ${opciones.pagina ?? 1}::integer, ${opciones.tamano ?? 10}::integer, ${opciones.soloBandeja ?? false}::boolean) as r`;
    const r = fila?.r as Record<string, unknown> | null | undefined;
    if (!r || r.estado !== "ok" || !Array.isArray(r.items) || !Array.isArray(r.claves)) return null;
    return {
      total: Number(r.total),
      pagina: Number(r.pagina),
      tamano: Number(r.tamano),
      items: r.items.flatMap((x) => avisoGuardado(x) ?? []),
      claves: r.claves.filter((c): c is string => typeof c === "string"),
    };
  } catch (error) {
    registrarFallo("tienda_avisos_listar_fallo", error);
    return null;
  }
}

/** Vacía la bandeja del panel: quita las notificaciones del panel sin borrarlas (siguen en «Todas las notificaciones»). true si la base lo
 *  aceptó. Lo que llegue después vuelve a salir en el panel. */
export async function vaciarBandeja(usuarioWebId: string): Promise<boolean> {
  try {
    const [fila] = await base()`select retail.tienda_avisos_vaciar_bandeja(${usuarioWebId}::uuid) as r`;
    return fila?.r?.estado === "ok";
  } catch (error) {
    registrarFallo("tienda_avisos_vaciar_bandeja_fallo", error);
    return false;
  }
}

/** Quita de la bandeja del panel las notificaciones dadas (sin borrarlas: siguen en «Todas las notificaciones»). true si la base lo aceptó. */
export async function quitarDeBandeja(usuarioWebId: string, claves: readonly string[]): Promise<boolean> {
  try {
    const lista = [...claves];
    const [fila] = await base()`select retail.tienda_avisos_quitar_de_bandeja(${usuarioWebId}::uuid, ${lista}::text[]) as r`;
    return fila?.r?.estado === "ok";
  } catch (error) {
    registrarFallo("tienda_avisos_quitar_de_bandeja_fallo", error);
    return false;
  }
}

/** Borra (marca) las notificaciones dadas, o todas (`"todas"`). true si la base lo aceptó. */
export async function borrarAvisos(usuarioWebId: string, claves: readonly string[] | "todas"): Promise<boolean> {
  try {
    const todas = claves === "todas";
    const lista = todas ? [] : [...claves];
    const [fila] = await base()`select retail.tienda_avisos_borrar(${usuarioWebId}::uuid, ${lista}::text[], ${todas}::boolean) as r`;
    return fila?.r?.estado === "ok";
  } catch (error) {
    registrarFallo("tienda_avisos_borrar_fallo", error);
    return false;
  }
}
