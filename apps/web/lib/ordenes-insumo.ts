import "server-only";
import { createClient } from "@/lib/supabase/server";
import { hoyLima } from "@/lib/fechas-lima";
import {
  RPC_DETALLE_ORDEN_INSUMO,
  RPC_LISTA_ORDENES_INSUMO,
  RPC_NOS_DEBE_ORDENES_INSUMO,
  RPC_OPCIONES_ORDEN_INSUMO,
  RPC_SIGUIENTE_ORDEN_INSUMO,
  argsListaInsumo,
  cifrasDeOrdenesInsumo,
  leerDetalleOrdenInsumo,
  leerFilasOrdenesInsumo,
  leerNosDebe,
  leerOpcionesOrdenInsumo,
  type CifrasOrdenesInsumo,
  type DatosOrdenInsumo,
  type DetalleOrdenInsumo,
  type FiltrosListaInsumo,
  type InsumoOpcion,
  type OrdenInsumoFila,
} from "@/lib/ordenes-insumo-reglas";

export { getEmpresaParaOrden } from "@/lib/ordenes-compra";
export type { DatosOrdenInsumo };

// Órdenes de insumos del Taller (ADR-0362, fase 7 · actividad 2): lectura del servidor, por las funciones de 20261013040000. Todas
// piden el módulo `ordenes_insumos`; quien lo tiene ve las órdenes con sus precios (decisión 47). Si una lectura falla —la web publicada
// antes que la migración, o la base caída—, lo dice (principio 9): nunca una lista vacía que parezca «no hay órdenes».

// Las RPC son nuevas y los tipos generados todavía no las conocen: se leen como `unknown` y se validan en `ordenes-insumo-reglas.ts`.
// Cada llamada nombra su constante (`.rpc(RPC_X as never, …)`): así la lee la prueba de cobertura de roles
// (`scripts/pruebas/roles_cobertura_modulos.mjs`), que cuenta la pantalla como la raíz que llega a cada función.
type Respuesta = PromiseLike<{ data: unknown; error: { message: string } | null }>;

const FALLA_LISTA = "No se pudieron leer las órdenes de insumos. Vuelve a intentarlo en un momento; si sigue, avísale a tu líder.";

export async function listarOrdenesInsumo(filtros: FiltrosListaInsumo): Promise<{ filas: OrdenInsumoFila[]; falla: string | null }> {
  const supabase = await createClient();
  const { data, error } = await (supabase.rpc(RPC_LISTA_ORDENES_INSUMO as never, argsListaInsumo(filtros) as never) as unknown as Respuesta);
  if (error) {
    console.error(`${RPC_LISTA_ORDENES_INSUMO}: ${error.message}`);
    return { filas: [], falla: FALLA_LISTA };
  }
  const filas = leerFilasOrdenesInsumo(data);
  // Lo que no llegó (fase 7 parte 2, actividad 4): una lectura aparte, para las órdenes de esta página. Es un adorno de la lista: si no
  // responde (o la base todavía no la tiene), las filas se muestran igual, sin la marca.
  if (filas.length > 0) {
    const ids = filas.map((f) => f.id);
    const res = await (supabase.rpc(RPC_NOS_DEBE_ORDENES_INSUMO as never, { p_ids: ids } as never) as unknown as Respuesta);
    if (res.error) console.error(`${RPC_NOS_DEBE_ORDENES_INSUMO}: ${res.error.message}`);
    else {
      const deuda = leerNosDebe(res.data);
      for (const f of filas) f.nosDebe = deuda.get(f.id) ?? null;
    }
  }
  return { filas, falla: null };
}

/**
 * Las cifras de arriba de la lista, que no cambian con los filtros: cuánto suman las órdenes generadas y cuántas esperan su entrega esta
 * semana. No hay una función de resumen: se leen las generadas de a 100 (el tope de `fn_ordenes_insumo`) hasta 10 tandas, que para un
 * Taller son años de órdenes (principio 5). Es un adorno de la lista: si no responde, la lista se muestra igual, sin cifras (`null`).
 */
export async function getCifrasOrdenesInsumo(): Promise<CifrasOrdenesInsumo | null> {
  const TANDA = 100;
  const MAX_TANDAS = 10;
  const supabase = await createClient();
  const generadas: OrdenInsumoFila[] = [];
  let antesDe: number | null = null;
  for (let i = 0; i < MAX_TANDAS; i++) {
    const args = { p_estado: "generada", p_limite: TANDA, p_antes_de: antesDe };
    const { data, error } = await (supabase.rpc(RPC_LISTA_ORDENES_INSUMO as never, args as never) as unknown as Respuesta);
    if (error) {
      console.error(`${RPC_LISTA_ORDENES_INSUMO} (cifras): ${error.message}`);
      return null;
    }
    const tanda = leerFilasOrdenesInsumo(data);
    generadas.push(...tanda);
    const ultima = tanda[tanda.length - 1];
    if (tanda.length < TANDA || !ultima) return cifrasDeOrdenesInsumo(generadas, hoyLima());
    antesDe = ultima.numero;
  }
  // Más de mil órdenes generadas: la suma quedaría corta y diría una cifra falsa. Mejor no decir nada (la lista sigue).
  return null;
}

/** Una orden con sus líneas y sus versiones (`fn_orden_insumo`). `null` si no existe; `falla` si la base no respondió. */
export async function getDetalleOrdenInsumo(id: string): Promise<{ detalle: DetalleOrdenInsumo | null; falla: string | null }> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { detalle: null, falla: null };
  const supabase = await createClient();
  const { data, error } = await (supabase.rpc(RPC_DETALLE_ORDEN_INSUMO as never, { p_orden_id: id } as never) as unknown as Respuesta);
  if (error) {
    console.error(`${RPC_DETALLE_ORDEN_INSUMO}: ${error.message}`);
    return { detalle: null, falla: "No se pudo leer la orden de insumos. Vuelve a intentarlo en un momento; si sigue, avísale a tu líder." };
  }
  return { detalle: leerDetalleOrdenInsumo(data), falla: null };
}

/**
 * Lo que necesita «Nueva orden de insumos»: proveedores del Taller, insumos y talleres (`fn_orden_insumo_opciones`, sin datos
 * bancarios: quien tiene solo este módulo no lee `proveedores_produccion`) y el número que le tocaría. Si las opciones no cargan, lo dice
 * (principio 9): un formulario sin proveedores que parezca «no hay proveedores» haría pedir mal.
 */
export async function getDatosNuevaOrdenInsumo(): Promise<DatosOrdenInsumo> {
  const supabase = await createClient();
  const [resOpciones, resSiguiente] = await Promise.all([
    supabase.rpc(RPC_OPCIONES_ORDEN_INSUMO as never) as unknown as Respuesta,
    supabase.rpc(RPC_SIGUIENTE_ORDEN_INSUMO as never) as unknown as Respuesta,
  ]);
  const opciones = resOpciones.error ? null : leerOpcionesOrdenInsumo(resOpciones.data);
  if (!opciones) console.error(`[ordenes-insumo] nueva orden: ${resOpciones.error?.message ?? "respuesta que no se entiende"}`);
  return {
    proveedores: opciones?.proveedores ?? [],
    insumos: opciones?.insumos ?? [],
    talleres: opciones?.talleres ?? [],
    // La vista previa es un adorno: si no responde, el formulario dice «Al guardar» (no se cae).
    siguiente: typeof resSiguiente.data === "number" ? resSiguiente.data : null,
    falla: opciones
      ? null
      : "No se pudieron leer los proveedores, los insumos o los talleres. Vuelve a intentarlo en un momento; si sigue, avísale a tu líder.",
  };
}

/**
 * Lo que necesita «Editar orden de insumos»: lo de «Nueva orden» y la orden como está. A las listas se suma lo que la orden ya tiene
 * aunque hoy esté inactivo o archivado (el proveedor, el taller, cada insumo), marcado así: sin eso el combo se vería vacío, y la base
 * acepta dejarlo como estaba (`fn_orden_insumo_validar`). Elegir otro inactivo, no: no se ofrece.
 */
export async function getDatosEditarOrdenInsumo(id: string): Promise<{ datos: DatosOrdenInsumo; detalle: DetalleOrdenInsumo | null; falla: string | null }> {
  const [datos, { detalle, falla }] = await Promise.all([getDatosNuevaOrdenInsumo(), getDetalleOrdenInsumo(id)]);
  if (!detalle) return { datos, detalle: null, falla };
  const proveedores = datos.proveedores.some((p) => p.id === detalle.proveedor.id)
    ? datos.proveedores
    : [...datos.proveedores, { id: detalle.proveedor.id, nombre: `${detalle.proveedor.nombre} (inactivo)`, ruc: detalle.proveedor.ruc, rubro: detalle.proveedor.rubro }];
  const talleres = datos.talleres.some((t) => t.id === detalle.destino.id)
    ? datos.talleres
    : [...datos.talleres, { id: detalle.destino.id, nombre: `${detalle.destino.nombre} (inactivo)` }];
  const insumos = [...datos.insumos];
  for (const l of detalle.lineas) {
    if (insumos.some((i) => i.id === l.insumoId)) continue;
    insumos.push({
      id: l.insumoId,
      codigo: l.codigo ?? "",
      nombre: `${l.insumo} (archivado)`,
      tipo: l.tipo,
      // La base copia la unidad que el insumo tenga HOY al guardar la línea.
      unidadMedida: l.unidadActual ?? l.unidadMedida,
      proveedorId: null,
    });
  }
  // `falla` es solo la de leer la orden: la de las listas ya viaja en `datos.falla` y el formulario la muestra.
  return { datos: { ...datos, proveedores, talleres, insumos }, detalle, falla };
}

/**
 * Lo que necesita «Registrar comprobante» de una orden de insumos (fase 7 parte 2): la orden —con lo facturado de cada línea y el plazo
 * del proveedor— y los insumos sin archivar, para poner uno que no estaba en la orden (decisión 43). Si los insumos no cargan, el
 * formulario sirve igual para lo pedido y lo dice (`fallaListas`): nunca un combo vacío que parezca «no hay insumos».
 */
export async function getDatosComprobanteOrdenInsumo(
  id: string,
): Promise<{ detalle: DetalleOrdenInsumo | null; falla: string | null; insumos: InsumoOpcion[]; fallaListas: string | null }> {
  const supabase = await createClient();
  const [{ detalle, falla }, resOpciones] = await Promise.all([
    getDetalleOrdenInsumo(id),
    supabase.rpc(RPC_OPCIONES_ORDEN_INSUMO as never) as unknown as Respuesta,
  ]);
  const opciones = resOpciones.error ? null : leerOpcionesOrdenInsumo(resOpciones.data);
  if (!opciones) console.error(`[ordenes-insumo] comprobante: ${resOpciones.error?.message ?? "respuesta que no se entiende"}`);
  return {
    detalle,
    falla,
    insumos: opciones?.insumos ?? [],
    fallaListas: opciones ? null : "No se pudieron leer los insumos: por ahora solo se puede poner lo que está en la orden. Vuelve a intentarlo en un momento.",
  };
}
