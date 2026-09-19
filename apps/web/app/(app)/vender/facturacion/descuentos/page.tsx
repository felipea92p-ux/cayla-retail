import { exigirLider } from "@/lib/persona-actual";
import { getCodigosDescuento } from "@/lib/codigos-descuento";
import { getUbicaciones } from "@/lib/ubicaciones";
import { CodigosDescuentoPanel } from "@/components/CodigosDescuentoPanel";

// Tanda 3 del diagnóstico de Venta y Caja (2026-09-15); desde ADR-0124 vive como la cuarta
// vista de Facturación (antes era `/vender/descuentos`, que ahora redirige). Líder-only: un
// código de descuento cambia cuánto se cobra en toda la tienda — mismo criterio que el
// resto de Facturación (`exigirLider` como primera de las tres capas: pantalla, RLS de la
// tabla, y la propia registrar_venta que valida el código al cobrar).
export default async function DescuentosPage() {
  await exigirLider();

  const [codigos, ubicaciones] = await Promise.all([getCodigosDescuento(), getUbicaciones()]);
  // Distinto a las otras vistas a propósito: un código puede acotarse a cualquier sede que
  // venda, no solo a las tiendas que emiten comprobantes.
  const ubicacionesOperativas = ubicaciones.filter((u) => u.tipo !== "almacen");

  return (
    <div className="space-y-4">
      <p className="text-sm text-tinta/65">Crea, apaga y revisa la vigencia. Un código usado nunca se borra — es historia.</p>
      <CodigosDescuentoPanel codigos={codigos} ubicaciones={ubicacionesOperativas} />
    </div>
  );
}
