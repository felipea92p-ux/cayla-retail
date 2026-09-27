import { CabeceraPantalla } from "@/components/ui/CabeceraPantalla";
import { PantallaActividad } from "@/components/actividad/PantallaActividad";
import { MODULOS_CON_ACTIVIDAD } from "@/lib/actividad-reglas";
import { esClaveModulo } from "@/lib/modulos";
import { exigirModulo } from "@/lib/persona-actual";
import { getUbicaciones } from "@/lib/ubicaciones";

// «Ver todo el historial» (ADR-0207): la actividad de todos los módulos, con filtros de módulo, sede, persona y periodo.
// No es una fila del lateral: se llega desde el botón «Actividad» de la cabecera.
export default async function ActividadPage({ searchParams }: { searchParams: Promise<{ modulo?: string }> }) {
  const persona = await exigirModulo("actividad");
  const { modulo } = await searchParams;
  const esLider = persona.rol === "lider";
  const ubicaciones = esLider ? await getUbicaciones() : [];
  const moduloInicial = modulo && esClaveModulo(modulo) && MODULOS_CON_ACTIVIDAD.includes(modulo) ? modulo : null;

  return (
    <div className="space-y-6">
      <CabeceraPantalla
        sobretitulo="Gestión"
        titulo="Actividad"
        bajada={
          esLider
            ? "Quién hizo qué en cada módulo, en todas las sedes."
            : `Quién hizo qué en cada módulo de ${persona.ubicacionEtiqueta}.`
        }
      />
      <PantallaActividad
        esLider={esLider}
        moduloInicial={moduloInicial}
        ubicacionEtiqueta={persona.ubicacionEtiqueta}
        ubicaciones={ubicaciones.map((u) => ({ id: u.id, nombre: u.nombre }))}
      />
    </div>
  );
}
