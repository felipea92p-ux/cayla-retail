import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { createClient } from "@/lib/supabase/server";
import { exigirOpcional } from "@/lib/resultado";
import { getSububicaciones } from "@/lib/sububicaciones";
import { ClienteDemo } from "./ClienteDemo";

// Ruta temporal (Sesión A2, feat/productos-ajustar-inventario): la ficha de
// producto real la arma la Sesión A1 en paralelo. Este demo monta
// AjustarInventarioModal contra un producto y ubicación reales de la base
// local (Tienda Lima, que separa piso/almacén — el caso completo) para
// poder probarlo en el navegador sin depender de esa otra sesión.
//
// TODO(B2): borrar este demo cuando se integre en el menú de acciones de la
// lista real de productos.
export default async function AjustarInventarioDevPage() {
  await requirePersonaActualV2();
  const supabase = await createClient();

  const ubicacion = exigirOpcional(
    (await supabase.from("ubicaciones").select("id, nombre").eq("nombre", "Tienda Lima").maybeSingle()) as {
      data: { id: string; nombre: string } | null;
      error: { message: string } | null;
    },
    "la ubicación de prueba (Tienda Lima)"
  );
  const producto = exigirOpcional(
    (await supabase.from("productos").select("id, referencia").eq("codigo", "BLU-0002").maybeSingle()) as {
      data: { id: string; referencia: string } | null;
      error: { message: string } | null;
    },
    "el producto de prueba (BLU-0002)"
  );
  if (!ubicacion || !producto) {
    throw new Error("Faltan los datos de prueba (ubicación 'Tienda Lima' o producto 'BLU-0002') en la base local.");
  }
  const sububicaciones = await getSububicaciones(ubicacion.id);

  return (
    <div className="mx-auto max-w-lg space-y-4 py-10">
      <div>
        <p className="label-cayla text-[11px] text-tinta/65">Demo — Ajustar inventario</p>
        <h1 className="font-display mt-1 text-2xl text-tinta">{producto.referencia}</h1>
        <p className="mt-1 text-xs text-tinta/65">{ubicacion.nombre} · ruta temporal de la Sesión A2</p>
      </div>
      <ClienteDemo productoId={producto.id} ubicacionId={ubicacion.id} sububicaciones={sububicaciones} />
    </div>
  );
}
