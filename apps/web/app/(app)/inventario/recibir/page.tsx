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
        <p className="card-cayla p-5 text-sm text-tinta/60">
          Tu sede ({persona.sedeCodigo}) no tiene un almacén asociado — esta pantalla es solo para tiendas.
        </p>
      </div>
    );
  }

  const [{ data: contenedores }, { data: productos }, { data: categoriasRows }, { data: proveedoresRows }, variantes] =
    await Promise.all([
      supabase.from("contenedores").select("id, codigo, tipo").eq("sede_id", almacen.id).order("codigo"),
      supabase.from("productos").select("id, referencia, categoria_id").eq("estado", "activa"),
      supabase.from("categorias").select("id, familia, nombre, tallas_sugeridas").order("familia").order("nombre"),
      supabase.from("proveedores").select("id, nombre").eq("activo", true).order("nombre"),
      getCatalogoConStock(persona),
    ]);

  const { data: ordenesRows } = await supabase
    .from("ordenes_compra")
    .select("id, proveedor, monto_estimado")
    .eq("sede_destino_id", persona.sedeId)
    .in("estado", ["pendiente", "confirmada"])
    .order("created_at", { ascending: false });

  // Producciones del Taller en camino a esta tienda, aún sin recibir (sin lote ligado)
  const [{ data: produccionesRows }, { data: lotesLigados }] = await Promise.all([
    supabase
      .from("ordenes_produccion")
      .select("id, cantidad_planeada, cantidad_producida, estado, variantes(talla, color, productos(referencia))")
      .eq("destino_sede_id", persona.sedeId)
      .in("estado", ["en_proceso", "completada"])
      .order("created_at", { ascending: false }),
    supabase.from("lotes").select("orden_produccion_id").not("orden_produccion_id", "is", null),
  ]);
  const yaRecibidas = new Set((lotesLigados ?? []).map((l) => l.orden_produccion_id));
  const produccionesPendientes = (produccionesRows ?? [])
    .filter((p) => !yaRecibidas.has(p.id))
    .map((p) => {
      const variante = Array.isArray(p.variantes) ? p.variantes[0] : p.variantes;
      const producto = variante ? (Array.isArray(variante.productos) ? variante.productos[0] : variante.productos) : null;
      const detalle = [variante?.talla, variante?.color].filter(Boolean).join("/");
      return {
        id: p.id,
        descripcion: `${producto?.referencia ?? "?"}${detalle ? ` ${detalle}` : ""} · ${p.cantidad_producida}/${p.cantidad_planeada} hechas`,
      };
    });

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
        proveedoresDirectorio={proveedoresRows ?? []}
        ordenesPendientes={(ordenesRows ?? []).map((o) => ({
          id: o.id,
          proveedor: o.proveedor,
          montoEstimado: o.monto_estimado != null ? Number(o.monto_estimado) : null,
        }))}
        produccionesPendientes={produccionesPendientes}
      />
    </div>
  );
}
