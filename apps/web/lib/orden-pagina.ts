import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getInsumosDelTaller } from "@/lib/insumos";
import { RPC_ORDEN_PRODUCCION, RPC_TELA_PENDIENTE, leerOrdenPagina, numeroDeOrdenEnUrl, type OrdenPagina } from "@/lib/orden-pagina-reglas";
import { armarEdicionDeTela, type DatosEditarTela } from "@/lib/orden-tela-editar-reglas";
import type { OpcionesNuevaOrden } from "@/lib/produccion";

// La página de una orden de producción (ADR-0400, actividad 3): lectura del servidor. Dos pasos: el número de la URL (`OP-000067`) se resuelve al id de la orden y `fn_orden_produccion`
// trae TODO lo que la página dibuja (orden, fases, tela, costos, línea de tiempo y permisos) en una sola lectura. Si algo falla lo dice (principio 9): nunca una orden "vacía" que
// parezca "no hay nada".

type Respuesta = PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>;
type BuscaPorNumero = {
  select: (columnas: string) => { eq: (columna: string, valor: number) => { maybeSingle: () => PromiseLike<{ data: { id: string } | null; error: { message: string; code?: string } | null }> } };
};

const FALLA = "No se pudo leer la orden. Vuelve a intentarlo en un momento; si sigue, avísale a tu líder.";

/**
 * La orden que la URL nombra, lista para dibujar. `orden: null` y `falla: null` = esa orden no existe (o esta cuenta no la puede leer: la base responde igual en los dos casos, para
 * no confirmar qué órdenes hay); `falla` = la base no respondió.
 */
export async function getOrdenProduccionPagina(segmento: string): Promise<{ orden: OrdenPagina | null; falla: string | null }> {
  const numero = numeroDeOrdenEnUrl(segmento);
  if (numero === null) return { orden: null, falla: null };
  const supabase = await createClient();
  // `producciones.numero` es nueva (migración 20261014154000) y los tipos generados todavía no la traen: la consulta se tipa a mano, como `insumos` en lib/insumos.ts.
  const { data: fila, error: errorId } = await (supabase.from("producciones") as unknown as BuscaPorNumero).select("id").eq("numero", numero).maybeSingle();
  if (errorId) {
    console.error(`producciones.numero ${numero}: ${errorId.message}`);
    return { orden: null, falla: FALLA };
  }
  if (!fila) return { orden: null, falla: null };
  // La RPC es nueva y los tipos generados todavía no la conocen: se llama por su constante y se valida en `leerOrdenPagina`.
  const { data, error } = await (supabase.rpc(RPC_ORDEN_PRODUCCION as never, { p_produccion_id: fila.id } as never) as unknown as Respuesta);
  if (error) {
    console.error(`${RPC_ORDEN_PRODUCCION}: ${error.message}`);
    return { orden: null, falla: FALLA };
  }
  if (data === null) return { orden: null, falla: null };
  // Lo que otras órdenes reservan de cada tela y lo pedido (actividad 7): dato secundario; sin él, «alcanza» se mide contra todo el estante.
  const pendiente = await (supabase.rpc(RPC_TELA_PENDIENTE as never, { p_produccion_id: fila.id } as never) as unknown as Respuesta);
  const telaPendiente = pendiente.error ? null : pendiente.data;
  if (pendiente.error) console.error(`${RPC_TELA_PENDIENTE}: ${pendiente.error.message}`);
  const orden = leerOrdenPagina(typeof data === "object" && data !== null ? { ...(data as Record<string, unknown>), tela_pendiente: telaPendiente } : data);
  // Una respuesta que no se parece a una orden es una falla de lectura, no una orden inexistente: decir «no existe» escondería un problema.
  return orden ? { orden, falla: null } : { orden: null, falla: FALLA };
}

/** ¿Esta orden se puede editar de tela y avíos? Solo en proceso y para quien opera el Taller (la base lo vuelve a exigir en `guardar_insumos_orden`). */
export function sePuedeEditarLaTela(orden: Pick<OrdenPagina, "orden" | "permisos">): boolean {
  return orden.permisos.puedeOperar && orden.orden.estado === "en_proceso";
}

/**
 * Lo que la hoja «Editar tela y avíos» necesita (ADR-0510): el estante del Taller con sus saldos y costos, el tejido del modelo y lo que ya reservan las demás órdenes. Es dato SECUNDARIO de la
 * página: si no se puede leer, la página se ve igual y la sección dice que no se pudo preparar la edición (`falla`), no que no hay nada que editar.
 */
export async function getEdicionDeTela(orden: OrdenPagina, opciones: OpcionesNuevaOrden | null, hoy: string): Promise<{ datos: DatosEditarTela | null; falla: boolean }> {
  if (!sePuedeEditarLaTela(orden)) return { datos: null, falla: false };
  try {
    const supabase = await createClient();
    const [estante, modelo] = await Promise.all([
      getInsumosDelTaller(orden.orden.ubicacionId, { conCostos: orden.permisos.veCostos, hoy }),
      supabase.from("productos").select("tejido_id").eq("id", orden.orden.producto.id).maybeSingle(),
    ]);
    if (modelo.error) throw new Error(modelo.error.message);
    return {
      datos: armarEdicionDeTela({
        insumosDeLaOrden: orden.insumos,
        tejidoNombre: orden.orden.producto.tejidoNombre,
        estante: estante.insumos,
        tejidoId: modelo.data?.tejido_id ?? null,
        consumoDeclarado: opciones?.consumos[orden.orden.producto.id] ?? null,
        comprometidoDeTodas: opciones?.comprometido ?? null,
        enCaminoDeTodas: opciones?.enCamino ?? null,
        conCostos: orden.permisos.veCostos,
      }),
      falla: false,
    };
  } catch (e) {
    console.error(`editar tela de ${orden.orden.numeroTexto}: ${e instanceof Error ? e.message : String(e)}`);
    return { datos: null, falla: true };
  }
}
