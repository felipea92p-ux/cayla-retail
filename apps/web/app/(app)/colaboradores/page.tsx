import { redirect } from "next/navigation";
import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { getColaboradores, getDynamicDisponibles } from "@/lib/colaboradores";
import { getUbicaciones } from "@/lib/ubicaciones";
import { ColaboradoresPanel } from "@/components/ColaboradoresPanel";

// Gestión de acceso a retail (0013 + 0016_roles_colaborador.sql). Líder-only
// en la pantalla — la RPC lo vuelve a exigir (fn_es_lider), esta es solo la
// primera de las capas de siempre.
export default async function ColaboradoresPage() {
  const persona = await requirePersonaActualV2();
  if (persona.rol !== "lider") redirect("/");

  const [colaboradores, disponibles, ubicaciones] = await Promise.all([
    getColaboradores(),
    getDynamicDisponibles(),
    getUbicaciones(),
  ]);

  return <ColaboradoresPanel colaboradores={colaboradores} disponibles={disponibles} ubicaciones={ubicaciones} />;
}
