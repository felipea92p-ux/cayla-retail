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
import { vistaDe, type SeccionColaboradores } from "@/lib/colaboradores-reglas";
import { getCuentasConRol, getEscalonAdmin, getRolesTolerado } from "@/lib/roles";

// Gestión de acceso a retail (0013 + 0016_roles_colaborador.sql + 20260922110000_colaboradores_suspender_y_actividad.sql).
// Desde 20260923131000 (Felipe, 2026-09-22) no es solo del líder: la abre quien ve el módulo Colaboradores (sección Cuentas
// y Actividad) o Roles y accesos (su sección); cada sección sale solo con su módulo. Cada RPC lo vuelve a exigir en la base
// (fn_puede_gestionar_colaboradores / fn_puede_administrar_roles).
export default async function ColaboradoresPage({ searchParams }: { searchParams: Promise<{ pestana?: string }> }) {
  const { pestana } = await searchParams;
  const persona = await requirePersonaActualV2();
  const veColaboradores = veModulo(persona, "colaboradores");
  const veRoles = veModulo(persona, "roles");
  if (!veColaboradores && !veRoles) redirect("/sin-acceso?modulo=colaboradores");
  const secciones: SeccionColaboradores[] = [...(veColaboradores ? ["cuentas" as const] : []), ...(veRoles ? ["roles" as const] : [])];
  const pedida = vistaDe(pestana);
  const vista = secciones.includes(pedida.seccion) ? pedida : { ...pedida, seccion: secciones[0], actividad: false };
  const nada = <T,>(valor: T) => Promise.resolve(valor);

  const soyLider = persona.rol === "lider";
  const [colaboradores, pendientes, suspendidos, inactivos, actividad, disponibles, ubicaciones, terminales, roles, cuentas, escalon] = await Promise.all([
    veColaboradores ? getColaboradores() : nada([]),
    veColaboradores ? getColaboradoresPendientes() : nada([]),
    veColaboradores ? getColaboradoresSuspendidos() : nada([]),
    veColaboradores ? getColaboradoresInactivos() : nada([]),
    veColaboradores ? getActividadAccesos() : nada([]),
    veColaboradores ? getDynamicDisponibles() : nada([]),
    getUbicaciones(),
    // ADR-0162: los aparatos de cada tienda. Tolerado: si falla, solo Cuentas ▸ Terminales lo dice.
    veColaboradores ? getTerminales() : nada({ datos: null }),
    // ADR-0161 B: el rol de cada cuenta. Tolerado: si la base aún no tiene los roles, la pantalla sale como antes. Sin el
    // módulo Roles y accesos no se leen: la pantalla sale sin la columna del rol ni «Cambiar rol» (es lo que dice `null`).
    veRoles ? getRolesTolerado() : nada(null),
    veRoles ? getCuentasConRol() : nada({ datos: null }),
    // ADR-0178: quién administra a los líderes (el Admin se lee de Dynamic).
    getEscalonAdmin(soyLider),
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
      vistaInicial={vista}
      secciones={secciones}
      soyLider={soyLider}
      soyAdmin={escalon.soyAdmin}
      admins={escalon.admins}
      // ADR-0178 «solo das lo que tienes»: quien no es líder da solo los módulos que ve.
      misModulos={soyLider ? null : persona.modulos.map((m) => m.clave)}
    />
  );
}
