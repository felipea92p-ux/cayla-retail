import { leerPedidosDeInsumo, type PedidoDeInsumo } from "./orden-pagina-reglas";

// La tela del Taller para el Resumen (ADR-0400, actividad 8d): lo que las órdenes abiertas ya reservan de cada tela y avío, lo que está pedido, y las órdenes que no declaran tela. Sin React ni Supabase.
//
// LA BASE MANDA: `fn_tela_del_taller` (migración 20261015173000) repite la cuenta de `fn_nueva_orden_opciones` y de la página de la orden; aquí solo se LEE su respuesta.
//
// CONTRATO
//   PROMETE: una lectura que no se entiende es `null` (el Resumen cae al rendimiento medido de siempre y no dibuja una demanda inventada); lo que sí se entiende se normaliza (números como número,
//            sin negativos) y una tela cuyo identificador falta se descarta.
//   ASUME:   la unidad de los pedidos es la del insumo (una orden de insumos se hace en la unidad del insumo).
//   NO HACE: no decide qué cuenta como «en camino»: eso es de la base (`fn_tela_en_camino`: lo que FALTA RECIBIR de las órdenes de insumos generadas, sin los pedidos atrasados; regla de Felipe del 2026-10-16). Aquí solo se lee.

export const RPC_TELA_DEL_TALLER = "fn_tela_del_taller";

export type TelaDelTaller = {
  insumoId: string;
  /** Lo que las órdenes abiertas todavía tienen que usar de esta tela: su plan declarado menos lo ya descontado (la cuenta de «Nueva orden»). */
  comprometido: number;
  /** Los modelos de las órdenes que todavía la necesitan. */
  ordenes: string[];
  /** Lo que viene en camino y cuenta: lo que falta recibir de las órdenes de insumos de esta tela con destino el Taller, sin los pedidos atrasados. */
  enCamino: number;
  /** Lo que falta recibir de pedidos cuya fecha de entrega ya pasó: no cuenta. */
  atrasado: number;
  /** Los pedidos de esta tela con lo que falta recibir de cada uno (los que cuentan primero, los atrasados al fondo). */
  pedidos: PedidoDeInsumo[];
};

/** Una orden abierta que no declara ninguna tela: se sigue contando con el rendimiento medido de su modelo. */
export type OrdenSinTelaDeclarada = { id: string; productoId: string; referencia: string };

export type TelaDelTallerLeida = { telas: TelaDelTaller[]; sinDeclarar: OrdenSinTelaDeclarada[] };

const esObjeto = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const texto = (x: unknown): string | null => (typeof x === "string" && x.trim() !== "" ? x : null);
function numero(x: unknown): number | null {
  const n = typeof x === "string" && x.trim() !== "" ? Number(x) : x;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

/** La respuesta de `fn_tela_del_taller`. `null` si no es lo que se espera (la base responde NULL a quien no puede leer, o falló). */
export function leerTelaDelTaller(crudo: unknown): TelaDelTallerLeida | null {
  if (!esObjeto(crudo) || !Array.isArray(crudo.telas) || !Array.isArray(crudo.sin_declarar)) return null;
  const telas = crudo.telas.flatMap((t): TelaDelTaller[] => {
    if (!esObjeto(t)) return [];
    const insumoId = texto(t.insumo_id);
    if (!insumoId) return [];
    return [
      {
        insumoId,
        comprometido: Math.max(numero(t.comprometido) ?? 0, 0),
        ordenes: Array.isArray(t.ordenes) ? t.ordenes.flatMap((o) => (texto(o) ? [o as string] : [])) : [],
        enCamino: Math.max(numero(t.en_camino) ?? 0, 0),
        atrasado: Math.max(numero(t.atrasado) ?? 0, 0),
        pedidos: leerPedidosDeInsumo(t.pedidos),
      },
    ];
  });
  const sinDeclarar = crudo.sin_declarar.flatMap((o): OrdenSinTelaDeclarada[] => {
    if (!esObjeto(o)) return [];
    const id = texto(o.id);
    const productoId = texto(o.producto_id);
    return id && productoId ? [{ id, productoId, referencia: texto(o.referencia) ?? "Una orden" }] : [];
  });
  return { telas, sinDeclarar };
}

// ---------- Lo que viene en camino, solo ----------

export const RPC_TELA_EN_CAMINO = "fn_tela_en_camino";

/** Lo que viene a un insumo: `cuenta` (lo que falta recibir y no está atrasado), `atrasado` (de pedidos cuya fecha ya pasó: no cuenta) y los pedidos. */
export type CaminoLeido = { cuenta: number; atrasado: number; pedidos: PedidoDeInsumo[] };

/**
 * La respuesta de `fn_tela_en_camino` (20261015165000): por insumo, lo que viene a ese Taller. `null` si no es una lista (la base responde NULL a quien no puede leer, o falló); una lista
 * vacía es «no viene nada». Los números rotos o negativos valen cero: nunca suman a lo que «llega».
 */
export function leerTelaEnCamino(crudo: unknown): Map<string, CaminoLeido> | null {
  if (!Array.isArray(crudo)) return null;
  const salida = new Map<string, CaminoLeido>();
  for (const fila of crudo) {
    if (!esObjeto(fila)) continue;
    const insumoId = texto(fila.insumo_id);
    if (!insumoId) continue;
    salida.set(insumoId, { cuenta: Math.max(numero(fila.cuenta) ?? 0, 0), atrasado: Math.max(numero(fila.atrasado) ?? 0, 0), pedidos: leerPedidosDeInsumo(fila.pedidos) });
  }
  return salida;
}
