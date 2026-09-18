import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { getProveedores } from "@/lib/proveedores";
import { ProveedoresPanel } from "@/components/ProveedoresPanel";

// Directorio de proveedores (20260914150000_proveedores_administrables.sql).
// Cualquiera con acceso ve el directorio (a quién se le compra); lo
// financiero (cuánto se le debe, recepción) y el detalle son solo de líder
// — corrección de D-27, 2026-09-17
// (20260917240000_proveedores_lista_indicadores_y_candado_sede.sql). La
// pantalla lo esconde y `fn_proveedores()` lo vuelve a exigir (manda esos
// campos en NULL si no sos líder): dos capas, como siempre.
export default async function ProveedoresPage() {
  const persona = await requirePersonaActualV2();
  const proveedores = await getProveedores();
  return <ProveedoresPanel proveedores={proveedores} esLider={persona.rol === "lider"} />;
}
