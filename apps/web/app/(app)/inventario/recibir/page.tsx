import { requirePersonaActual } from "@/lib/persona";
import { getCatalogoConStock } from "@/lib/catalogo";
import { createClient } from "@/lib/supabase/server";
import { RecibirLoteForm } from "@/components/RecibirLoteForm";
import { InventarioNav } from "@/components/InventarioNav";

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
      <div className="space-y-6">
        <div>
          <p className="label-cayla text-[10px] text-tinta/45">Inventario</p>
          <h1 className="font-display mt-1 text-2xl text-tinta">Recibir mercadería</h1>
        </div>
        <InventarioNav />
        <p className="border border-tinta/10 bg-papel p-5 text-sm text-tinta/60">
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
        <p className="label-cayla text-[10px] text-tinta/45">Inventario · Almacén {almacen.codigo}</p>
        <h1 className="font-display mt-1 text-2xl text-tinta">Recibir mercadería</h1>
      </div>

      <InventarioNav />

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
