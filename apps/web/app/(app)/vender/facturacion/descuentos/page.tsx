import { exigirLider } from "@/lib/persona-actual";
import { getCodigosDescuento } from "@/lib/codigos-descuento";
import { getUbicaciones } from "@/lib/ubicaciones";
import { hoyLima } from "@/lib/fechas-lima";
import { resumenDeCodigos } from "@/lib/facturacion-codigos-reglas";
import { CodigosDescuentoPanel } from "@/components/CodigosDescuentoPanel";
import { CodigosTarjetas } from "@/components/CodigosTarjetas";

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
  // «Hoy» en Lima, no en UTC: de 7 pm a medianoche la base y el servidor ya viven en «mañana», y un
  // código que vence hoy aparecería vencido con la tienda todavía abierta (ADR-0111).
  const hoy = hoyLima();

  return (
    <div className="space-y-6">
      <CodigosTarjetas resumen={resumenDeCodigos(codigos, hoy)} />
      <CodigosDescuentoPanel codigos={codigos} ubicaciones={ubicacionesOperativas} hoy={hoy} />
    </div>
  );
}
