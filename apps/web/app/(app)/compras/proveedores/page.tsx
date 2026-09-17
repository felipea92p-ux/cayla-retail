import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { getProveedores } from "@/lib/proveedores";
import { ProveedoresPanel } from "@/components/ProveedoresPanel";

// Directorio de proveedores (20260914150000_proveedores_administrables.sql).
// Cualquiera con acceso lo ve — sirve para saber a quién se le compra y cuánto
// se le debe —; solo el Líder edita. La pantalla lo esconde y la RPC lo vuelve
// a exigir: dos capas, como siempre.
export default async function ProveedoresPage() {
  const persona = await requirePersonaActualV2();
  const proveedores = await getProveedores();
  return <ProveedoresPanel proveedores={proveedores} puedeEditar={persona.rol === "lider"} />;
}
