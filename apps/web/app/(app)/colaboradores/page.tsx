import { redirect } from "next/navigation";
import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { getColaboradores, getDynamicDisponibles } from "@/lib/colaboradores";
import { ColaboradoresPanel } from "@/components/ColaboradoresPanel";

// Gestión de acceso a retail (0013_colaboradores_autorizados.sql). Líder-only
// en la pantalla — la RPC lo vuelve a exigir (fn_tiene_acceso_retail), esta
// es solo la primera de las capas de siempre.
export default async function ColaboradoresPage() {
  const persona = await requirePersonaActualV2();
  if (persona.rol !== "lider") redirect("/");

  const [colaboradores, disponibles] = await Promise.all([getColaboradores(), getDynamicDisponibles()]);

  return <ColaboradoresPanel colaboradores={colaboradores} disponibles={disponibles} />;
}
