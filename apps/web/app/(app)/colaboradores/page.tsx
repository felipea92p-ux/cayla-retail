import { redirect } from "next/navigation";
import { requirePersonaActualV2 } from "@/lib/persona-actual";
import {
  getActividadAccesos,
  getColaboradores,
  getColaboradoresInactivos,
  getColaboradoresPendientes,
  getColaboradoresSuspendidos,
  getDynamicDisponibles,
  getTerminales,
} from "@/lib/colaboradores";
import { getUbicaciones } from "@/lib/ubicaciones";
import { ColaboradoresPanel } from "@/components/ColaboradoresPanel";

// Gestión de acceso a retail (0013 + 0016_roles_colaborador.sql + 20260922110000_colaboradores_suspender_y_actividad.sql).
// Líder-only en la pantalla — cada RPC lo vuelve a exigir (fn_es_lider), esta es solo la primera de las capas de siempre.
export default async function ColaboradoresPage() {
  const persona = await requirePersonaActualV2();
  if (persona.rol !== "lider") redirect("/");

  const [colaboradores, pendientes, suspendidos, inactivos, actividad, disponibles, ubicaciones, terminales] = await Promise.all([
    getColaboradores(),
    getColaboradoresPendientes(),
    getColaboradoresSuspendidos(),
    getColaboradoresInactivos(),
    getActividadAccesos(),
    getDynamicDisponibles(),
    getUbicaciones(),
    // ADR-0162: los aparatos de cada tienda. Tolerado: si falla, solo la pestaña Terminales lo dice.
    getTerminales(),
  ]);

  return (
    <ColaboradoresPanel
      colaboradores={colaboradores}
      pendientes={pendientes}
      suspendidos={suspendidos}
      inactivos={inactivos}
      actividad={actividad}
      disponibles={disponibles}
      ubicaciones={ubicaciones}
      terminales={terminales.datos}
    />
  );
}
