import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getUbicaciones } from "@/lib/ubicaciones";
import { getProveedor } from "@/lib/proveedores";
import { getSaldosFavor } from "@/lib/saldo-favor";
import { getNosDebeResumen } from "@/lib/nos-debe";
import { datosPagoDe } from "@/lib/proveedores-reglas";
import type { DatosDelComprobante, ProveedorDelComprobante } from "@/lib/comprobante-orden-reglas";
import {
  argsLista,
  leerDetalleOrden,
  leerFilasOrdenes,
  leerPorEnviar,
  leerResumen,
  RPC_DETALLE_ORDEN,
  RPC_LISTA_ORDENES,
  RPC_ORDENES_POR_ENVIAR,
  RPC_RESUMEN_ORDENES,
  RPC_SIGUIENTE_ORDEN,
  TAMANO_PAGINA_ORDENES,
  type DatosNuevaOrden,
  type DetalleOrden,
  type FiltrosLista,
  type OrdenCompraFila,
  type ResumenDestino,
} from "@/lib/ordenes-compra-reglas";

// Órdenes de compra (ADR-0362, fase 1): lectura del servidor, por `fn_ordenes_compra` (20261010214500). Quien tiene el módulo ve las
// órdenes de todas las sedes (decisiones 34 y 37); el candado vive en la función. Si la lectura falla —la web publicada antes que la
// migración, o la base caída—, lo dice (principio 9): nunca una lista vacía que parezca «no hay órdenes».
export async function listarOrdenesCompra(
  filtros: FiltrosLista,
  porEnviar: ReadonlyMap<string, number> | null = null,
): Promise<{ filas: OrdenCompraFila[]; falla: string | null }> {
  const supabase = await createClient();
  const fallaDeLectura = "No se pudieron leer las órdenes de compra. Vuelve a intentarlo en un momento; si sigue, avísale a tu líder.";
  if (!filtros.porEnviar) {
    const { data, error } = await supabase.rpc(RPC_LISTA_ORDENES as never, argsLista(filtros) as never);
    if (error) {
      console.error(`${RPC_LISTA_ORDENES}: ${error.message}`);
      return { filas: [], falla: fallaDeLectura };
    }
    return { filas: leerFilasOrdenes(data), falla: null };
  }

  // «Por enviar» (fase 3): la base no filtra por lo que falta enviar, solo dice cuáles órdenes lo tienen (`fn_ordenes_compra_por_enviar`).
  // Sin esa lista no hay forma de filtrar, y mostrar «todas» o «ninguna» sería mentir: se dice (principio 9).
  if (!porEnviar) return { filas: [], falla: "No se pudo saber qué órdenes tienen algo por enviar. Vuelve a intentarlo en un momento; si sigue, avísale a tu líder." };
  // Se pide la lista de las generadas por tandas del tope de la base (100) y se queda con las que tienen algo por enviar hasta llenar la página
  // (+1 para saber si hay otra): la paginación sigue siendo por número de orden, así que «Siguiente página» no salta ni repite ninguna.
  const TANDA = 100;
  const MAX_TANDAS = 10;
  const filas: OrdenCompraFila[] = [];
  let antesDe = filtros.antesDe;
  for (let i = 0; i < MAX_TANDAS && filas.length <= TAMANO_PAGINA_ORDENES; i++) {
    const { data, error } = await supabase.rpc(RPC_LISTA_ORDENES as never, { ...argsLista(filtros), p_limite: TANDA, p_antes_de: antesDe } as never);
    if (error) {
      console.error(`${RPC_LISTA_ORDENES}: ${error.message}`);
      return { filas: [], falla: fallaDeLectura };
    }
    const tanda = leerFilasOrdenes(data);
    for (const f of tanda) if (porEnviar.has(f.id) && filas.length <= TAMANO_PAGINA_ORDENES) filas.push(f);
    const ultima = tanda[tanda.length - 1];
    if (tanda.length < TANDA || !ultima) break;
    antesDe = ultima.numero;
  }
  return { filas, falla: null };
}

/** Las órdenes generadas que todavía tienen algo por enviar, con cuántas unidades (`fn_ordenes_compra_por_enviar`, fase 3): la cifra de la
 *  píldora «Por enviar» y su filtro. Es un adorno de la lista: si la función no responde (la web publicada antes que la migración), la
 *  lista se muestra igual, sin esa píldora (`null`). */
export async function getOrdenesPorEnviar(): Promise<ReadonlyMap<string, number> | null> {
  const supabase = await createClient();
  const { data, error } = (await (supabase.rpc(RPC_ORDENES_POR_ENVIAR as never) as unknown as PromiseLike<{ data: unknown; error: { message: string } | null }>));
  if (error) {
    console.error(`${RPC_ORDENES_POR_ENVIAR}: ${error.message}`);
    return null;
  }
  return leerPorEnviar(data);
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
  const [resProveedores, resMarcas, resVinculos, resCategorias, destinos, resSiguiente, nosDebe] = await Promise.all([
    supabase.from("proveedores").select("id, nombre, ruc").eq("activo", true).order("nombre"),
    supabase.from("marcas").select("id, nombre").eq("activo", true).order("nombre"),
    supabase.from("marca_proveedores").select("marca_id, proveedor_id"),
    supabase.from("categorias").select("id, nombre, prefijo, familia").eq("activo", true).order("nombre"),
    getDestinosOrden(),
    // La RPC es nueva y los tipos generados todavía no la conocen: se lee como `unknown` y se valida abajo.
    supabase.rpc(RPC_SIGUIENTE_ORDEN as never) as unknown as PromiseLike<{ data: unknown; error: unknown }>,
    // Lo que cada proveedor debe por reponer (fase 5a): un adorno. Si no responde, la orden se llena igual, sin el aviso.
    getNosDebeResumen().catch(() => null),
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
    nosDebe,
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

export type DatosEnvioOrden = {
  detalle: DetalleOrden | null;
  /** Por qué no se pudo leer la orden (la base no respondió). `null` con `detalle` vacío = esa orden no existe. */
  falla: string | null;
  /** Las sedes a las que se puede enviar (tiendas y almacenes activos); `null` si no se pudieron leer. */
  sedes: { id: string; nombre: string }[] | null;
};

/** Lo que necesita «Enviar a una sede» (fase 3): la orden con lo que le queda por enviar y las sedes activas. Las sedes solo se eligen en
 *  una «Por repartir»: en una «directo» la sede es la de la orden y una lista que no cargó no impide enviar. */
export async function getDatosEnvioOrden(id: string): Promise<DatosEnvioOrden> {
  const [{ detalle, falla }, sedes] = await Promise.all([getDetalleOrden(id), getDestinosOrden()]);
  return { detalle, falla, sedes };
}

export type DatosComprobanteOrden = DatosDelComprobante & {
  detalle: DetalleOrden | null;
  /** Por qué no se pudo leer la orden (la base no respondió). `null` con `detalle` vacío = esa orden no existe. */
  falla: string | null;
};

/** Lo que necesita «Registrar comprobante» (fase 2): la orden con lo que ya llegó en papel, las categorías y marcas para lo que no estaba
 *  en la orden, y la ficha de pago de su proveedor. Lo del proveedor es un adorno: si no se puede leer, el formulario se abre igual. */
export async function getDatosComprobanteOrden(id: string): Promise<DatosComprobanteOrden> {
  const supabase = await createClient();
  const [{ detalle, falla }, resCategorias, resMarcas, resVinculos] = await Promise.all([
    getDetalleOrden(id),
    supabase.from("categorias").select("id, nombre, prefijo, familia").eq("activo", true).order("nombre"),
    supabase.from("marcas").select("id, nombre").eq("activo", true).order("nombre"),
    supabase.from("marca_proveedores").select("marca_id, proveedor_id"),
  ]);
  const fallaListas =
    resCategorias.error || resMarcas.error || resVinculos.error
      ? "No se pudieron leer las categorías o las marcas. Lo que viene en la orden se puede registrar igual; para agregar algo que no estaba, vuelve a intentarlo en un momento."
      : null;
  if (fallaListas) console.error("[ordenes-compra] registrar comprobante:", resCategorias.error?.message ?? resMarcas.error?.message ?? resVinculos.error?.message);
  const marcas = (resMarcas.data ?? []).map((m) => ({ id: m.id, nombre: m.nombre }));
  const activas = new Set(marcas.map((m) => m.id));
  return {
    detalle,
    falla,
    categorias: (resCategorias.data ?? []).map((c) => ({ id: c.id, nombre: c.nombre, prefijo: c.prefijo ?? null, familia: c.familia ?? null })),
    marcas,
    vinculos: (resVinculos.data ?? []).filter((v) => activas.has(v.marca_id)).map((v) => ({ marcaId: v.marca_id, proveedorId: v.proveedor_id })),
    proveedor: detalle ? await leerProveedorDelComprobante(detalle.proveedor.id) : null,
    fallaListas,
  };
}

async function leerProveedorDelComprobante(proveedorId: string): Promise<ProveedorDelComprobante | null> {
  try {
    const [ficha, saldos] = await Promise.all([getProveedor(proveedorId), getSaldosFavor([proveedorId]).catch(() => ({}) as Record<string, number>)]);
    if (!ficha) return null;
    const saldoFavor = saldos[proveedorId] ?? 0;
    return { plazoCreditoDias: ficha.plazo_credito_dias, datosPago: datosPagoDe(ficha, saldoFavor), saldoFavor };
  } catch (e) {
    console.error("[ordenes-compra] ficha del proveedor para el comprobante:", e instanceof Error ? e.message : e);
    return null;
  }
}
