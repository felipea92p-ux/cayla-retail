import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getDestinosOrden } from "@/lib/ordenes-compra";
import { getMiPlata } from "@/lib/mi-plata";
import { marcasPorProveedor, type MarcasDeProveedor } from "@/lib/proveedores-reglas";
import { RPC_PROVEEDORES_PARA_COMPRAR, conMarcas, leerProveedoresParaComprar, type CategoriaParaComprar, type ProveedorParaComprar } from "@/lib/compra-rapida-reglas";

// Compras simple (ADR-0480, actividad 3): lo que necesita «Compré ropa» al abrir, en paralelo: los proveedores (con lo que venden), las
// categorías (para las píldoras y «¿Qué es?» de algo nuevo), las marcas (para la de algo nuevo), las tiendas a donde puede ir una prenda y cuánto tiene para comprar. Si una lista no carga, lo dice
// (principio 9): una pantalla sin proveedores que parezca «no hay proveedores» haría registrar uno repetido.

// El tope por defecto de PostgREST (`max_rows`): una lectura que lo alcanza puede venir recortada en silencio.
const TOPE_FILAS = 1000;

type Respuesta = PromiseLike<{ data: unknown; error: { message: string } | null }>;

export type DatosCompraRapida = {
  proveedores: ProveedorParaComprar[];
  categorias: CategoriaParaComprar[];
  marcas: { id: string; nombre: string }[];
  tiendas: { id: string; nombre: string }[];
  /** Cuánto tiene para comprar (null si no se pudo leer: la pantalla no inventa la cifra). */
  tiene: number | null;
  falla: string | null;
};

export async function getDatosCompraRapida(): Promise<DatosCompraRapida> {
  const supabase = await createClient();
  const [p, c, m, tiendas, plata, f, vinculos] = await Promise.all([
    supabase.rpc(RPC_PROVEEDORES_PARA_COMPRAR as never) as unknown as Respuesta,
    supabase.from("categorias").select("id, nombre, prefijo, familia").eq("activo", true).order("nombre"),
    supabase.from("marcas").select("id, nombre").eq("activo", true).order("nombre"),
    getDestinosOrden(),
    getMiPlata(),
    // Qué familias admiten precio de venta 0 (bolsas, cajas, empaque: fuera de los motores, ADR-0377/0384). Una ayuda: si no carga, ninguna lo admite
    // (lo mismo que la base sin dato) y la pantalla sigue.
    supabase.from("familias").select("codigo, entra_a_motores"),
    // Las marcas de cada proveedor, para buscarlo por «Kero» y verlas en su tarjeta (mismas tablas que Compras ▸ Proveedores, sin RPC).
    supabase.from("marca_proveedores").select("marca_id, proveedor_id"),
  ]);
  if (f.error) console.error(`compra rápida: familias: ${f.error.message}`);
  // Un adorno: si no cargan (o la lectura llegó al tope y quedó a medias), la lista sale sin marcas y la búsqueda sigue por nombre.
  let marcasDe: MarcasDeProveedor | null = null;
  if (vinculos.error || m.error) console.error(`compra rápida: marcas de los proveedores: ${(vinculos.error ?? m.error)?.message}`);
  else if ((vinculos.data?.length ?? 0) >= TOPE_FILAS || (m.data?.length ?? 0) >= TOPE_FILAS) console.error(`compra rápida: las marcas llegaron al tope de ${TOPE_FILAS} filas; la lista sale sin ellas.`);
  else marcasDe = marcasPorProveedor((m.data ?? []).map((x) => ({ id: x.id, nombre: x.nombre, activo: true })), vinculos.data ?? []);
  const admitenPrecioCero = new Set((f.data ?? []).filter((x) => x.entra_a_motores === false).map((x) => x.codigo));
  const error = p.error?.message ?? c.error?.message ?? m.error?.message ?? (tiendas === null ? "sin tiendas" : null);
  if (error) {
    console.error(`compra rápida: ${error}`);
    return { proveedores: [], categorias: [], marcas: [], tiendas: [], tiene: null, falla: "No se pudieron leer los proveedores o las tiendas. Vuelve a intentarlo en un momento." };
  }
  return {
    proveedores: conMarcas(leerProveedoresParaComprar(p.data), marcasDe),
    categorias: (c.data ?? []).map((x) => ({ id: x.id, nombre: x.nombre, prefijo: x.prefijo ?? null, familia: x.familia ?? null, admitePrecioCero: x.familia != null && admitenPrecioCero.has(x.familia) })),
    marcas: (m.data ?? []).map((x) => ({ id: x.id, nombre: x.nombre })),
    tiendas: tiendas ?? [],
    tiene: plata?.persona ? plata.tiene : null,
    falla: null,
  };
}
