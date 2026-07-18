import Link from "next/link";
import { requirePersonaActual } from "@/lib/persona";
import { getCatalogoConStock } from "@/lib/catalogo";
import { createClient } from "@/lib/supabase/server";
import { RecibirLoteForm } from "@/components/RecibirLoteForm";

export default async function RecibirLotePage() {
  const persona = await requirePersonaActual();
  const supabase = await createClient();

  const { data: almacen } = await supabase
    .from("sedes")
    .select("id, codigo")
    .eq("tienda_asociada_id", persona.sedeId)
    .eq("tipo", "almacen")
    .maybeSingle();

  if (!almacen) {
    return (
      <div className="space-y-4">
        <Link href="/" className="text-xs text-neutral-400 hover:underline">← Volver</Link>
        <p className="rounded-xl border border-neutral-200 bg-white p-4 text-sm text-neutral-500">
          Tu sede ({persona.sedeCodigo}) no tiene un almacén asociado — esta pantalla es solo para tiendas.
        </p>
      </div>
    );
  }

  const [{ data: contenedores }, { data: productos }, { data: categoriasRows }, variantes] = await Promise.all([
    supabase.from("contenedores").select("id, codigo, tipo").eq("sede_id", almacen.id).order("codigo"),
    supabase.from("productos").select("id, referencia, categoria_id").eq("estado", "activa"),
    supabase.from("categorias").select("id, familia, nombre, tallas_sugeridas").order("familia").order("nombre"),
    getCatalogoConStock(persona),
  ]);

  const variantesExistentes = variantes.map((v) => ({
    varianteId: v.varianteId,
    sku: v.sku,
    referencia: v.referencia,
    talla: v.talla,
    color: v.color,
  }));

  const productosExistentes = (productos ?? []).map((p) => ({
    id: p.id,
    referencia: p.referencia,
    categoriaId: p.categoria_id,
  }));

  const categorias = (categoriasRows ?? []).map((c) => ({
    id: c.id,
    familia: c.familia,
    nombre: c.nombre,
    tallasSugeridas: c.tallas_sugeridas,
  }));

  return (
    <div className="space-y-6">
      <div>
        <Link href="/" className="text-xs text-neutral-400 hover:underline">← Volver</Link>
        <h1 className="mt-1 text-lg font-semibold text-neutral-900">Recibir mercadería</h1>
        <p className="text-xs text-neutral-400">Almacén {almacen.codigo}</p>
      </div>

      <RecibirLoteForm
        sedeAlmacenId={almacen.id}
        sedeAlmacenCodigo={almacen.codigo}
        contenedores={contenedores ?? []}
        productosExistentes={productosExistentes}
        variantesExistentes={variantesExistentes}
        categorias={categorias}
      />
    </div>
  );
}
