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
import { vistaDe } from "@/lib/colaboradores-reglas";
import { getCuentasConRol, getRolesTolerado } from "@/lib/roles";

// Gestión de acceso a retail (0013 + 0016_roles_colaborador.sql + 20260922110000_colaboradores_suspender_y_actividad.sql).
// Líder-only en la pantalla — cada RPC lo vuelve a exigir (fn_es_lider), esta es solo la primera de las capas de siempre.
export default async function ColaboradoresPage({ searchParams }: { searchParams: Promise<{ pestana?: string }> }) {
  const { pestana } = await searchParams;
  const persona = await requirePersonaActualV2();
  if (persona.rol !== "lider") redirect("/");

  const [colaboradores, pendientes, suspendidos, inactivos, actividad, disponibles, ubicaciones, terminales, roles, cuentas] = await Promise.all([
    getColaboradores(),
    getColaboradoresPendientes(),
    getColaboradoresSuspendidos(),
    getColaboradoresInactivos(),
    getActividadAccesos(),
    getDynamicDisponibles(),
    getUbicaciones(),
    // ADR-0162: los aparatos de cada tienda. Tolerado: si falla, solo Cuentas ▸ Terminales lo dice.
    getTerminales(),
    // ADR-0161 B: el rol de cada cuenta. Tolerado: si la base aún no tiene los roles, la pantalla sale como antes.
    getRolesTolerado(),
    getCuentasConRol(),
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
      roles={roles}
      cuentas={cuentas.datos}
      vistaInicial={vistaDe(pestana)}
    />
  );
}
