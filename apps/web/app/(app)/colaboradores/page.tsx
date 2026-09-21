import { redirect } from "next/navigation";
import { requirePersonaActualV2 } from "@/lib/persona-actual";
import {
  getActividadAccesos,
  getColaboradores,
  getColaboradoresInactivos,
  getColaboradoresSuspendidos,
  getDynamicDisponibles,
} from "@/lib/colaboradores";
import { getUbicaciones } from "@/lib/ubicaciones";
import { ColaboradoresPanel } from "@/components/ColaboradoresPanel";

// Gestión de acceso a retail (0013 + 0016_roles_colaborador.sql + 20260922110000_colaboradores_suspender_y_actividad.sql).
// Líder-only en la pantalla — cada RPC lo vuelve a exigir (fn_es_lider), esta es solo la primera de las capas de siempre.
export default async function ColaboradoresPage() {
  const persona = await requirePersonaActualV2();
  if (persona.rol !== "lider") redirect("/");

  const [colaboradores, suspendidos, inactivos, actividad, disponibles, ubicaciones] = await Promise.all([
    getColaboradores(),
    getColaboradoresSuspendidos(),
    getColaboradoresInactivos(),
    getActividadAccesos(),
    getDynamicDisponibles(),
    getUbicaciones(),
  ]);

  return (
    <ColaboradoresPanel
      colaboradores={colaboradores}
      suspendidos={suspendidos}
      inactivos={inactivos}
      actividad={actividad}
      disponibles={disponibles}
      ubicaciones={ubicaciones}
    />
  );
}
