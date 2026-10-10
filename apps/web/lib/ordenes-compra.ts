import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getUbicaciones } from "@/lib/ubicaciones";
import { leerFilasOrdenes, RPC_LISTA_ORDENES, RPC_SIGUIENTE_ORDEN, type DatosNuevaOrden, type OrdenCompraFila } from "@/lib/ordenes-compra-reglas";

// Órdenes de compra (ADR-0362, fase 1): lectura del servidor, por `fn_ordenes_compra` (20261010214500). Quien tiene el módulo ve las
// órdenes de todas las sedes (decisiones 34 y 37); el candado vive en la función. Si la lectura falla —la web publicada antes que la
// migración, o la base caída—, lo dice (principio 9): nunca una lista vacía que parezca «no hay órdenes».
export async function listarOrdenesCompra(): Promise<{ filas: OrdenCompraFila[]; falla: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(RPC_LISTA_ORDENES as never);
  if (error) {
    console.error(`${RPC_LISTA_ORDENES}: ${error.message}`);
    return { filas: [], falla: "No se pudieron leer las órdenes de compra. Vuelve a intentarlo en un momento; si sigue, avísale a tu líder." };
  }
  return { filas: leerFilasOrdenes(data), falla: null };
}

// Lo que necesita «Nueva orden de compra» (ADR-0362, actividad 2): proveedores, marcas y qué marca trae cada proveedor (solo
// activos: ofrecer uno desactivado terminaría en un rechazo al guardar), las categorías activas (con prefijo y familia, para la
// sugerencia de descripción), las tiendas y almacenes a donde puede llegar, y el número que le tocaría. Si una lista no carga, lo
// dice (principio 9): un formulario sin proveedores que parezca «no hay proveedores» haría crear uno repetido.
export async function getDatosNuevaOrden(): Promise<DatosNuevaOrden> {
  const supabase = await createClient();
  const [resProveedores, resMarcas, resVinculos, resCategorias, ubicaciones, resSiguiente] = await Promise.all([
    supabase.from("proveedores").select("id, nombre, ruc").eq("activo", true).order("nombre"),
    supabase.from("marcas").select("id, nombre").eq("activo", true).order("nombre"),
    supabase.from("marca_proveedores").select("marca_id, proveedor_id"),
    supabase.from("categorias").select("id, nombre, prefijo, familia").eq("activo", true).order("nombre"),
    getUbicaciones().catch(() => null),
    // La RPC es nueva y los tipos generados todavía no la conocen: se lee como `unknown` y se valida abajo.
    supabase.rpc(RPC_SIGUIENTE_ORDEN as never) as unknown as PromiseLike<{ data: unknown; error: unknown }>,
  ]);
  const falla =
    resProveedores.error || resMarcas.error || resVinculos.error || resCategorias.error || !ubicaciones
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
    // Llega a una tienda o a un almacén; nunca al Taller (sus insumos van por otra orden, decisión 25).
    destinos: (ubicaciones ?? []).filter((u) => u.tipo === "tienda" || u.tipo === "almacen").map((u) => ({ id: u.id, nombre: u.nombre })),
    // La vista previa es un adorno: si no responde, el formulario dice «se numera al guardar» (no se cae).
    siguiente: typeof resSiguiente.data === "number" ? resSiguiente.data : null,
    falla,
  };
}
