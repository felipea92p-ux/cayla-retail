import { createClient } from "@/lib/supabase/server";
import { exigir } from "@/lib/resultado";

// D-82 (`docs/datos/DECISIONES-2026-09-21-menu-comercial.md`) — la cotización real de un
// taller externo para maquilar un tipo de prenda, la otra mitad de D-31: el Taller se mide
// contra esto, nunca contra un precio que alguien de CAYLA invente. Tabla y RPC en
// `supabase/migrations/20260922160000_cotizaciones_maquila.sql`.
//
// `categoria_id`, no un texto de "tipo de prenda" suelto: reusa la taxonomía que el catálogo
// ya tiene (`retail.categorias`) — ver el porqué en el encabezado de esa migración.
export type CotizacionMaquila = {
  id: string;
  categoriaId: string;
  categoriaNombre: string;
  precioMaquila: number;
  fechaCotizacion: string;
  vigenteHasta: string;
  proveedorReferencia: string | null;
  createdAt: string;
};

/** Todas las cotizaciones cargadas, más recientes primero. La pantalla arma "la vigente de
 *  cada categoría" a partir de esto (`masRecientePorCategoria` en cotizaciones-maquila-reglas.ts)
 *  — no llama al RPC en un loop por categoría, que sería una consulta por fila. */
export async function getCotizacionesMaquila(): Promise<CotizacionMaquila[]> {
  const supabase = await createClient();
  const filas = exigir(
    await supabase
      .from("cotizaciones_maquila")
      .select("id, categoria_id, precio_maquila, fecha_cotizacion, vigente_hasta, proveedor_referencia, created_at, categoria:categorias ( nombre )")
      .order("fecha_cotizacion", { ascending: false })
      .order("created_at", { ascending: false }),
    "las cotizaciones de maquila"
  );
  return filas.map((f) => ({
    id: f.id,
    categoriaId: f.categoria_id,
    categoriaNombre: f.categoria?.nombre ?? "—",
    precioMaquila: Number(f.precio_maquila),
    fechaCotizacion: f.fecha_cotizacion,
    vigenteHasta: f.vigente_hasta,
    proveedorReferencia: f.proveedor_referencia,
    createdAt: f.created_at,
  }));
}

export type CategoriaParaCotizar = { id: string; nombre: string };

/** El desplegable de "tipo de prenda" del formulario: categorías activas de indumentaria —
 *  el Taller maquila prendas, no carteras ni bisutería. Si algún día maquila otra familia,
 *  esta es la única línea que cambia (no hay nada más que sepa "indumentaria = prenda"). */
export async function getCategoriasParaCotizar(): Promise<CategoriaParaCotizar[]> {
  const supabase = await createClient();
  const filas = exigir(
    await supabase.from("categorias").select("id, nombre").eq("familia", "indumentaria").eq("activo", true).order("nombre"),
    "las categorías de prenda"
  );
  return filas;
}
