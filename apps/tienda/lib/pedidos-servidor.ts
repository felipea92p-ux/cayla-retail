import "server-only";
import { base } from "./base";
import { interpretarMisPedidos, interpretarUnPedido, type Pedido, type Plazos } from "./pedidos";

// Los pedidos web del cliente en la base (ADR-0408, actividad 7), solo por `retail.tienda_mis_pedidos` y `retail.tienda_pedido`
// (20261015022000). La cuenta llega validada con el proyecto de clientes (`leerSesion`): la base devuelve solo lo de esa cuenta.
// Si la base no responde, la página lo dice y se puede volver a intentar (principio 9); nunca un dato a medias.

export type LecturaMisPedidos =
  | { estado: "ok"; plazos: Plazos; pedidos: Pedido[] }
  /** La base contestó que esa cuenta no existe (quedó a medias al crearse). */
  | { estado: "sin_cuenta" }
  | { estado: "sin_respuesta" };

export async function leerMisPedidos(usuarioWebId: string): Promise<LecturaMisPedidos> {
  try {
    const [fila] = await base()`select retail.tienda_mis_pedidos(${usuarioWebId}::uuid) as r`;
    if (fila?.r === null || fila?.r === undefined) return { estado: "sin_cuenta" };
    const r = interpretarMisPedidos(fila.r);
    return r ? { estado: "ok", ...r } : { estado: "sin_respuesta" };
  } catch (error) {
    console.error(JSON.stringify({ evento: "tienda_mis_pedidos_fallo", mensaje: error instanceof Error ? error.message : String(error) }));
    return { estado: "sin_respuesta" };
  }
}

export type LecturaPedido =
  | { estado: "ok"; plazos: Plazos; pedido: Pedido }
  /** Ese número no es de esta cuenta, o no existe (la base responde igual en los dos casos). */
  | { estado: "no_esta" }
  | { estado: "sin_cuenta" }
  | { estado: "sin_respuesta" };

export async function leerPedido(usuarioWebId: string, codigo: string): Promise<LecturaPedido> {
  try {
    const [fila] = await base()`select retail.tienda_pedido(${usuarioWebId}::uuid, ${codigo}::text) as r`;
    if (fila?.r === null || fila?.r === undefined) return { estado: "sin_cuenta" };
    const r = interpretarUnPedido(fila.r);
    if (!r) return { estado: "sin_respuesta" };
    return r.pedido ? { estado: "ok", plazos: r.plazos, pedido: r.pedido } : { estado: "no_esta" };
  } catch (error) {
    console.error(JSON.stringify({ evento: "tienda_pedido_fallo", mensaje: error instanceof Error ? error.message : String(error) }));
    return { estado: "sin_respuesta" };
  }
}
