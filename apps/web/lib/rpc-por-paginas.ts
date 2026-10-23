// Lee TODAS las filas de una RPC que devuelve `TABLE(...)` y que la web llama con `as never` (porque aún no está en los tipos generados):
// los registros del contador (`fn_impuestos_registro_ventas`, `_compras`) y el libro diario detrás de una cifra de Finanzas (`fn_diario`).
//
// POR QUÉ. PostgREST corta cualquier respuesta en 1.000 filas SIN error (`FILAS_POR_PAGINA`). Octubre ya tiene 1.090 comprobantes: el
// «Registro de ventas» que se baja para el contador traía 1.000 y el aviso decía «1.000 comprobantes», con el IGV del panel (que sí es
// completo) sin cuadrar contra el archivo. `fn_diario` da unas 5.400 líneas solo de ventas en un mes: «De dónde sale» sumaba los primeros días.
//
// CONTRATO
//   PROMETE: todas las filas, en el orden que se pida. El orden DEBE desempatar por completo (ver `orden`): sin él, dos páginas pueden
//            repetir una fila o saltarse otra, y en un registro de dinero eso es peor que cortar.
//   SE DEGRADA: devuelve `{ data, error }` como supabase-js; una página con error corta la lectura (media lista nunca se entrega entera).
//
// El `as never` de la web esconde el tipo del constructor; aquí se declara a mano el único trozo que se usa (`order` y `range`).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@cayla-retail/database";
import { leerTodas } from "./resultado";

type Pagina = PromiseLike<{ data: Record<string, unknown>[] | null; error: { message: string; code?: string } | null }>;
type ConstructorRpc = { order(columna: string, opciones?: { ascending: boolean }): ConstructorRpc; range(desde: number, hasta: number): Pagina };

export async function leerRpcPorPaginas(
  supabase: Pick<SupabaseClient<Database, "retail">, "rpc">,
  nombre: string,
  argumentos: Record<string, unknown>,
  /** Las columnas del orden, todas las que hagan falta para que dos filas distintas nunca empaten. `"fecha desc"` ordena de más nuevo a más viejo. */
  orden: readonly string[],
  /** `enParalelo: 1` si casi siempre cabe en una página (cada página recalcula la función entera, ADR-0192). */
  opciones: { enParalelo?: number } = {},
) {
  return leerTodas<Record<string, unknown>, { message: string; code?: string }>((desde, hasta) => {
    let consulta = supabase.rpc(nombre as never, argumentos as never) as unknown as ConstructorRpc;
    for (const columna of orden) {
      const [nombreColumna, sentido] = columna.split(" ");
      consulta = sentido === "desc" ? consulta.order(nombreColumna, { ascending: false }) : consulta.order(nombreColumna);
    }
    return consulta.range(desde, hasta);
  }, opciones);
}

/** El orden de `fn_existencias(p_ubicacion_id)`: una fila por (prenda, sede), así que el par es único. TRU ya da 1.489 filas (2026-10-23). */
export const ORDEN_FN_EXISTENCIAS = ["variante_id", "ubicacion_id"] as const;
