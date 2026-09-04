import { requirePersonaActual } from "@/lib/persona";
import { getCatalogoConStock } from "@/lib/catalogo";
import { createClient } from "@/lib/supabase/server";
import { RecibirLoteForm } from "@/components/RecibirLoteForm";
import { InventarioNav } from "@/components/InventarioNav";

export default async function RecibirLotePage() {
  const persona = await requirePersonaActual();
  const supabase = await createClient();

  // Ninguna de estas depende del resultado de otra — antes iban en varias rondas
  // secuenciales esperando cada una a la anterior sin motivo. Una sola ronda.
  // (El almacén ya no es una sede aparte: es el contenedor tipo='almacen' de la
  // propia sede, por eso la consulta de `contenedores` va aquí directo con
  // persona.sedeId, sin necesitar resolver ninguna sede-almacén primero.)
  const [{ data: contenedores }, { data: productos }, { data: categoriasRows }, { data: proveedoresRows }, variantes, { data: ordenesRows }] =
    await Promise.all([
      supabase.from("contenedores").select("id, codigo, tipo").eq("sede_id", persona.sedeId).order("codigo"),
      supabase.from("productos").select("id, referencia, categoria_id").eq("estado", "activa"),
      supabase.from("categorias").select("id, familia, nombre, tallas_sugeridas").order("familia").order("nombre"),
      supabase.from("proveedores").select("id, nombre").eq("activo", true).order("nombre"),
      getCatalogoConStock(persona),
      supabase
        .from("ordenes_compra")
        .select("id, proveedor, monto_estimado")
        .eq("sede_destino_id", persona.sedeId)
        .in("estado", ["pendiente", "confirmada"])
        .order("created_at", { ascending: false }),
    ]);

  const contenedorAlmacen = (contenedores ?? []).find((c) => c.tipo === "almacen") ?? null;

  if (!contenedorAlmacen) {
    return (
      <div className="space-y-6">
        <div>
          <p className="label-cayla text-[10px] text-tinta/45">Inventario</p>
          <h1 className="font-display mt-1 text-2xl text-tinta">Recibir mercadería</h1>
        </div>
        <InventarioNav />
        <p className="card-cayla p-5 text-sm text-tinta/60">
          Tu sede ({persona.sedeCodigo}) no tiene un almacén configurado — esta pantalla es solo para sedes con inventario.
        </p>
      </div>
    );
  }

  // Producciones del Taller en camino a esta tienda: DESACTIVADO a propósito.
  // `ordenes_produccion` es el modelo viejo; `producciones` (desde 0025-0029) lo
  // reemplazó, pero nunca se propagó — `lotes` no tiene columna para ligar una
  // producción nueva, así que "ya recibida" no se puede calcular hoy. Reconciliar
  // los dos modelos es tarea aparte, decidida con Felipe 2026-09-03 (ver
  // docs/BACKLOG.md, ADR-0004). Mientras tanto, vacío en vez de mostrar datos que
  // no distinguen pendiente de ya recibida.
  const produccionesPendientes: { id: string; descripcion: string }[] = [];

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
        <p className="label-cayla text-[10px] text-tinta/45">Inventario · {persona.sedeCodigo}</p>
        <h1 className="font-display mt-1 text-2xl text-tinta">Recibir mercadería</h1>
      </div>

      <InventarioNav />

      <RecibirLoteForm
        sedeId={persona.sedeId}
        sedeCodigo={persona.sedeCodigo}
        contenedorAlmacenId={contenedorAlmacen.id}
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
