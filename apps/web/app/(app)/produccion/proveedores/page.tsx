import { redirect } from "next/navigation";
import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { getProveedoresProduccion } from "@/lib/proveedores-produccion";
import { ProveedoresProduccionPanel } from "@/components/ProveedoresProduccionPanel";

// Proveedores de Producción (ADR-0133, F4a; D-H): quienes le venden tela, avíos y maquila al Taller. Directorio APARTE del de
// Compras. Solo líder: lleva datos bancarios de terceros y montos comprados (D-G). Quien trabaja en el Taller conocerá el
// nombre del proveedor al recibir un pedido (F4d), no esta pantalla.
export default async function ProveedoresProduccionPage() {
  const persona = await requirePersonaActualV2();
  if (persona.rol !== "lider") redirect("/produccion/ordenes");

  const proveedores = await getProveedoresProduccion();
  return (
    <div className="space-y-6">
      <ProveedoresProduccionPanel proveedores={proveedores} />
    </div>
  );
}
