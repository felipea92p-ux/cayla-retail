import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getUbicaciones } from "@/lib/ubicaciones";
import {
  argsLista,
  leerDetalleOrden,
  leerFilasOrdenes,
  leerResumen,
  RPC_DETALLE_ORDEN,
  RPC_LISTA_ORDENES,
  RPC_RESUMEN_ORDENES,
  RPC_SIGUIENTE_ORDEN,
  type DatosNuevaOrden,
  type DetalleOrden,
  type FiltrosLista,
  type OrdenCompraFila,
  type ResumenDestino,
} from "@/lib/ordenes-compra-reglas";

// Órdenes de compra (ADR-0362, fase 1): lectura del servidor, por `fn_ordenes_compra` (20261010214500). Quien tiene el módulo ve las
// órdenes de todas las sedes (decisiones 34 y 37); el candado vive en la función. Si la lectura falla —la web publicada antes que la
// migración, o la base caída—, lo dice (principio 9): nunca una lista vacía que parezca «no hay órdenes».
export async function listarOrdenesCompra(filtros: FiltrosLista): Promise<{ filas: OrdenCompraFila[]; falla: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(RPC_LISTA_ORDENES as never, argsLista(filtros) as never);
  if (error) {
    console.error(`${RPC_LISTA_ORDENES}: ${error.message}`);
    return { filas: [], falla: "No se pudieron leer las órdenes de compra. Vuelve a intentarlo en un momento; si sigue, avísale a tu líder." };
  }
  return { filas: leerFilasOrdenes(data), falla: null };
}

/** Cuántas órdenes hay en cada destino (`fn_ordenes_compra_resumen`, 20261010231500): las cifras y el número de cada píldora. Es un
 *  adorno de la lista: si no responde, la lista se muestra igual, sin números (`null`). */
export async function getResumenOrdenes(): Promise<ResumenDestino[] | null> {
  const supabase = await createClient();
  const { data, error } = (await (supabase.rpc(RPC_RESUMEN_ORDENES as never) as unknown as PromiseLike<{ data: unknown; error: { message: string } | null }>));
  if (error) {
    console.error(`${RPC_RESUMEN_ORDENES}: ${error.message}`);
    return null;
  }
  return leerResumen(data);
}

/** Una orden con sus líneas (`fn_orden_compra_detalle`, 20261010231500). `null` si no existe; `falla` si la base no respondió. */
export async function getDetalleOrden(id: string): Promise<{ detalle: DetalleOrden | null; falla: string | null }> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { detalle: null, falla: null };
  const supabase = await createClient();
  const { data, error } = (await (supabase.rpc(RPC_DETALLE_ORDEN as never, { p_id: id } as never) as unknown as PromiseLike<{
    data: unknown;
    error: { message: string } | null;
  }>));
  if (error) {
    console.error(`${RPC_DETALLE_ORDEN}: ${error.message}`);
    return { detalle: null, falla: "No se pudo leer la orden de compra. Vuelve a intentarlo en un momento; si sigue, avísale a tu líder." };
  }
  return { detalle: leerDetalleOrden(data), falla: null };
}

/** A dónde puede llegar una orden: las tiendas y los almacenes activos; nunca el Taller (sus insumos van por otra orden, decisión
 *  25). `null` si no se pudieron leer. */
export async function getDestinosOrden(): Promise<{ id: string; nombre: string }[] | null> {
  const ubicaciones = await getUbicaciones().catch(() => null);
  return ubicaciones ? ubicaciones.filter((u) => u.tipo === "tienda" || u.tipo === "almacen").map((u) => ({ id: u.id, nombre: u.nombre })) : null;
}

// Lo que necesita «Nueva orden de compra» (ADR-0362, actividad 2): proveedores, marcas y qué marca trae cada proveedor (solo
// activos: ofrecer uno desactivado terminaría en un rechazo al guardar), las categorías activas (con prefijo y familia, para la
// sugerencia de descripción), las tiendas y almacenes a donde puede llegar, y el número que le tocaría. Si una lista no carga, lo
// dice (principio 9): un formulario sin proveedores que parezca «no hay proveedores» haría crear uno repetido.
export async function getDatosNuevaOrden(): Promise<DatosNuevaOrden> {
  const supabase = await createClient();
  const [resProveedores, resMarcas, resVinculos, resCategorias, destinos, resSiguiente] = await Promise.all([
    supabase.from("proveedores").select("id, nombre, ruc").eq("activo", true).order("nombre"),
    supabase.from("marcas").select("id, nombre").eq("activo", true).order("nombre"),
    supabase.from("marca_proveedores").select("marca_id, proveedor_id"),
    supabase.from("categorias").select("id, nombre, prefijo, familia").eq("activo", true).order("nombre"),
    getDestinosOrden(),
    // La RPC es nueva y los tipos generados todavía no la conocen: se lee como `unknown` y se valida abajo.
    supabase.rpc(RPC_SIGUIENTE_ORDEN as never) as unknown as PromiseLike<{ data: unknown; error: unknown }>,
  ]);
  const falla =
    resProveedores.error || resMarcas.error || resVinculos.error || resCategorias.error || !destinos
      ? "No se pudieron leer los proveedores, las marcas o las categorías. Vuelve a intentarlo en un momento; si sigue, avísale a tu líder."
      : null;
  if (falla) console.error("[ordenes-compra] nueva orden:", resProveedores.error?.message ?? resMarcas.error?.message ?? resVinculos.error?.message ?? resCategorias.error?.message);
  const proveedores = resProveedores.data ?? [];
  const marcas = resMarcas.data ?? [];
  const activosP = new Set(proveedores.map((p) => p.id));
  const activasM = new Set(marcas.map((m) => m.id));
  return {
    proveedores: proveedores.map((p) => ({ id: p.id, nombre: p.nombre, ruc: p.ruc ?? null })),
    marcas: marcas.map((m) => ({ id: m.id, nombre: m.nombre })),
    vinculos: (resVinculos.data ?? [])
      .filter((v) => activosP.has(v.proveedor_id) && activasM.has(v.marca_id))
      .map((v) => ({ marcaId: v.marca_id, proveedorId: v.proveedor_id })),
    categorias: (resCategorias.data ?? []).map((c) => ({ id: c.id, nombre: c.nombre, prefijo: c.prefijo ?? null, familia: c.familia ?? null })),
    destinos: destinos ?? [],
    // La vista previa es un adorno: si no responde, el formulario dice «se numera al guardar» (no se cae).
    siguiente: typeof resSiguiente.data === "number" ? resSiguiente.data : null,
    falla,
  };
}

/** Lo que necesita «Editar orden de compra» (actividad 4): lo de «Nueva orden» y la orden como está. A las listas se suma lo que la orden
 *  ya tiene aunque hoy esté inactivo (proveedor, sede, categorías, marcas), marcado «(inactivo)»: sin eso el combo se vería vacío, y la
 *  base acepta dejarlo como estaba (`fn_orden_compra_validar`). Cambiarlo por otro inactivo, no: no se ofrece. */
export async function getDatosEditarOrden(id: string): Promise<{ datos: DatosNuevaOrden; detalle: DetalleOrden | null; falla: string | null }> {
  const [datos, { detalle, falla }] = await Promise.all([getDatosNuevaOrden(), getDetalleOrden(id)]);
  if (!detalle) return { datos, detalle: null, falla };
  const proveedores = datos.proveedores.some((p) => p.id === detalle.proveedor.id)
    ? datos.proveedores
    : [...datos.proveedores, { id: detalle.proveedor.id, nombre: `${detalle.proveedor.nombre} (inactivo)`, ruc: detalle.proveedor.ruc }];
  const destinos =
    !detalle.destino || datos.destinos.some((d) => d.id === detalle.destino!.id)
      ? datos.destinos
      : [...datos.destinos, { id: detalle.destino.id, nombre: `${detalle.destino.nombre} (inactiva)` }];
  const categorias = [...datos.categorias];
  const marcas = [...datos.marcas];
  for (const l of detalle.lineas) {
    if (!categorias.some((c) => c.id === l.categoriaId)) categorias.push({ id: l.categoriaId, nombre: `${l.categoria} (inactiva)`, prefijo: null, familia: null });
    if (!marcas.some((m) => m.id === l.marcaId)) marcas.push({ id: l.marcaId, nombre: `${l.marca} (inactiva)` });
  }
  // `falla` es solo la de leer la orden: la de las listas ya viaja en `datos.falla` y el formulario la muestra.
  return { datos: { ...datos, proveedores, destinos, categorias, marcas }, detalle, falla };
}

/** Quién emite la orden, para la cabecera del papel que se imprime (actividad 6). `configuracion_empresa` la lee toda cuenta; si no
 *  responde, el papel dice solo «CAYLA» (un adorno: no impide imprimir). */
export async function getEmpresaParaOrden(): Promise<{ razonSocial: string | null; ruc: string | null; nombreComercial: string | null } | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("configuracion_empresa").select("ruc, razon_social, nombre_comercial").maybeSingle();
  if (error || !data) return null;
  return { razonSocial: data.razon_social ?? null, ruc: data.ruc ?? null, nombreComercial: data.nombre_comercial ?? null };
}
