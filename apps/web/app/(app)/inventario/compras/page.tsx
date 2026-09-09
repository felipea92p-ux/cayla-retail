import { requirePersonaActual } from "@/lib/persona";
import { getSedes } from "@/lib/sedes";
import { createClient } from "@/lib/supabase/server";
import { exigir } from "@/lib/resultado";
import { InventarioNav } from "@/components/InventarioNav";
import { ComprasManager, type OrdenCompra } from "@/components/ComprasManager";

// Órdenes de compra (F2): lo que está pedido y en camino, con su plata comprometida.
export default async function ComprasPage() {
  const persona = await requirePersonaActual();
  const supabase = await createClient();

  const [resOrdenes, todasSedes, resProveedores] = await Promise.all([
    supabase
      .from("ordenes_compra")
      .select("id, proveedor, estado, fecha, fecha_estimada, monto_estimado, nota, sedes!ordenes_compra_sede_destino_id_fkey(codigo)")
      .order("created_at", { ascending: false })
      .limit(60),
    getSedes(),
    supabase.from("proveedores").select("id, nombre").eq("activo", true).order("nombre"),
  ]);
  // Esta pantalla es «cuánta plata tengo comprometida en camino». Una lista recortada
  // en silencio la baja, y con ella la decisión de si alcanza para pedir más.
  const ordenes = exigir(resOrdenes, "las órdenes de compra");
  const proveedores = exigir(resProveedores, "el directorio de proveedores");

  const sedes = todasSedes.filter((s) => s.tipo === "tienda");

  const filas: OrdenCompra[] = ordenes.map((o) => {
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
        <p className="label-cayla text-[11px] text-tinta/65">Inventario</p>
        <h1 className="font-display mt-1 text-2xl text-tinta">Compras</h1>
        <p className="mt-1 text-sm text-tinta/70">
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
