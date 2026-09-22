import { redirect } from "next/navigation";
import { requirePersonaActualV2, veModulo } from "@/lib/persona-actual";
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
import { PESTANAS_COLABORADORES, pestanaDe } from "@/lib/colaboradores-reglas";
import { getCuentasConRol, getRolesTolerado } from "@/lib/roles";

// Gestión de acceso a retail (0013 + 0016_roles_colaborador.sql + 20260922110000_colaboradores_suspender_y_actividad.sql).
// Desde 20260923111000 (Felipe, 2026-09-22) no es solo del líder: la abre quien ve el módulo Colaboradores (Activos,
// Terminales, Pendientes, Suspendidos, Inactivas, Actividad) o Roles y accesos (su pestaña); cada una sale solo con su
// módulo. Cada RPC lo vuelve a exigir en la base (fn_puede_gestionar_colaboradores / fn_puede_administrar_roles).
export default async function ColaboradoresPage({ searchParams }: { searchParams: Promise<{ pestana?: string }> }) {
  const { pestana } = await searchParams;
  const persona = await requirePersonaActualV2();
  const veColaboradores = veModulo(persona, "colaboradores");
  const veRoles = veModulo(persona, "roles");
  if (!veColaboradores && !veRoles) redirect("/sin-acceso?modulo=colaboradores");
  const pestanas = PESTANAS_COLABORADORES.filter((p) => (p === "roles" ? veRoles : veColaboradores));
  const pedida = pestanaDe(pestana);
  const nada = <T,>(valor: T) => Promise.resolve(valor);

  const [colaboradores, pendientes, suspendidos, inactivos, actividad, disponibles, ubicaciones, terminales, roles, cuentas] = await Promise.all([
    veColaboradores ? getColaboradores() : nada([]),
    veColaboradores ? getColaboradoresPendientes() : nada([]),
    veColaboradores ? getColaboradoresSuspendidos() : nada([]),
    veColaboradores ? getColaboradoresInactivos() : nada([]),
    veColaboradores ? getActividadAccesos() : nada([]),
    veColaboradores ? getDynamicDisponibles() : nada([]),
    getUbicaciones(),
    // ADR-0162: los aparatos de cada tienda. Tolerado: si falla, solo la pestaña Terminales lo dice.
    veColaboradores ? getTerminales() : nada({ datos: null }),
    // ADR-0161 B: el rol de cada cuenta. Tolerado: si la base aún no tiene los roles, la pantalla sale como antes. Sin el
    // módulo Roles y accesos no se leen: la pantalla sale sin la columna del rol ni «Cambiar rol» (es lo que dice `null`).
    veRoles ? getRolesTolerado() : nada(null),
    veRoles ? getCuentasConRol() : nada({ datos: null }),
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
      pestanaInicial={pestanas.includes(pedida) ? pedida : pestanas[0]}
      pestanas={pestanas}
    />
  );
}
