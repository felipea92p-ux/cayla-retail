import Link from "next/link";
import { redirect } from "next/navigation";
import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { getCodigosDescuento } from "@/lib/codigos-descuento";
import { getUbicaciones } from "@/lib/ubicaciones";
import { CodigosDescuentoPanel } from "@/components/CodigosDescuentoPanel";

// Tanda 3 del diagnóstico de Venta y Caja (2026-09-15). Líder-only: un código de
// descuento cambia cuánto se cobra en toda la tienda — mismo criterio que
// Facturación (redirect como primera de las tres capas: pantalla, RLS de la
// tabla, y la propia registrar_venta que valida el código al cobrar).
export default async function DescuentosPage() {
  const persona = await requirePersonaActualV2();
  if (persona.rol !== "lider") redirect("/");

  const [codigos, ubicaciones] = await Promise.all([getCodigosDescuento(), getUbicaciones()]);
  const ubicacionesOperativas = ubicaciones.filter((u) => u.tipo !== "almacen");

  return (
    <div className="space-y-6">
      <div>
        <Link href="/vender/facturacion" className="label-cayla text-[11px] text-tinta/60 hover:text-rojo">
          ← Facturación
        </Link>
        <h1 className="font-display mt-1 text-2xl text-tinta">Códigos de descuento</h1>
        <p className="mt-1 text-sm text-tinta/65">Crea, apaga y revisa la vigencia. Un código usado nunca se borra — es historia.</p>
      </div>

      <CodigosDescuentoPanel codigos={codigos} ubicaciones={ubicacionesOperativas} />
    </div>
  );
}
