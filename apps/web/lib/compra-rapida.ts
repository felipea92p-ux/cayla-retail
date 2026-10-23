import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getDestinosOrden } from "@/lib/ordenes-compra";
import { getMiPlata } from "@/lib/mi-plata";
import { RPC_PROVEEDORES_PARA_COMPRAR, leerProveedoresParaComprar, type CategoriaParaComprar, type ProveedorParaComprar } from "@/lib/compra-rapida-reglas";

// Compras simple (ADR-0480, actividad 3): lo que necesita «Compré ropa» al abrir, en paralelo: los proveedores (con lo que venden), las
// categorías (para las píldoras y «¿Qué es?» de algo nuevo), las marcas (para la de algo nuevo), las tiendas a donde puede ir una prenda y cuánto tiene para comprar. Si una lista no carga, lo dice
// (principio 9): una pantalla sin proveedores que parezca «no hay proveedores» haría registrar uno repetido.

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
  const [p, c, m, tiendas, plata] = await Promise.all([
    supabase.rpc(RPC_PROVEEDORES_PARA_COMPRAR as never) as unknown as Respuesta,
    supabase.from("categorias").select("id, nombre, prefijo, familia").eq("activo", true).order("nombre"),
    supabase.from("marcas").select("id, nombre").eq("activo", true).order("nombre"),
    getDestinosOrden(),
    getMiPlata(),
  ]);
  const error = p.error?.message ?? c.error?.message ?? m.error?.message ?? (tiendas === null ? "sin tiendas" : null);
  if (error) {
    console.error(`compra rápida: ${error}`);
    return { proveedores: [], categorias: [], marcas: [], tiendas: [], tiene: null, falla: "No se pudieron leer los proveedores o las tiendas. Vuelve a intentarlo en un momento." };
  }
  return {
    proveedores: leerProveedoresParaComprar(p.data),
    categorias: (c.data ?? []).map((x) => ({ id: x.id, nombre: x.nombre, prefijo: x.prefijo ?? null, familia: x.familia ?? null })),
    marcas: (m.data ?? []).map((x) => ({ id: x.id, nombre: x.nombre })),
    tiendas: tiendas ?? [],
    tiene: plata?.persona ? plata.tiene : null,
    falla: null,
  };
}
