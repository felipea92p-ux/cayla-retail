import { requirePersonaActual } from "@/lib/persona";
import { createClient } from "@/lib/supabase/server";
import { InventarioNav } from "@/components/InventarioNav";
import { ComprasManager, type OrdenCompra } from "@/components/ComprasManager";

// Órdenes de compra (F2): lo que está pedido y en camino, con su plata comprometida.
export default async function ComprasPage() {
  const persona = await requirePersonaActual();
  const supabase = await createClient();

  const [{ data: ordenes }, { data: sedes }, { data: proveedores }] = await Promise.all([
    supabase
      .from("ordenes_compra")
      .select("id, proveedor, estado, fecha, fecha_estimada, monto_estimado, nota, sedes!ordenes_compra_sede_destino_id_fkey(codigo)")
      .order("created_at", { ascending: false })
      .limit(60),
    supabase.from("sedes").select("id, codigo").eq("tipo", "tienda").order("codigo"),
    supabase.from("proveedores").select("id, nombre").eq("activo", true).order("nombre"),
  ]);

  const filas: OrdenCompra[] = (ordenes ?? []).map((o) => {
    const sede = Array.isArray(o.sedes) ? o.sedes[0] : o.sedes;
    return {
      id: o.id,
      proveedor: o.proveedor,
      estado: o.estado,
      sedeCodigo: sede?.codigo ?? "—",
      fecha: o.fecha,
      fechaEstimada: o.fecha_estimada,
      montoEstimado: o.monto_estimado != null ? Number(o.monto_estimado) : null,
      nota: o.nota,
    };
  });

  return (
    <div className="space-y-6">
      <div>
        <p className="label-cayla text-[10px] text-tinta/45">Inventario</p>
        <h1 className="font-display mt-1 text-2xl text-tinta">Compras</h1>
        <p className="mt-1 text-sm text-tinta/50">
          Pide, sigue y recibe: al recibir el lote ligado a una orden, se marca recibida sola.
        </p>
      </div>

      <InventarioNav />

      <ComprasManager
        ordenes={filas}
        sedes={sedes ?? []}
        proveedores={proveedores ?? []}
        esLider={persona.rol === "lider"}
      />
    </div>
  );
}
