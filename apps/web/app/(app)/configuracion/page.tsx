import { exigirModulo } from "@/lib/persona-actual";
import { getConfiguracionTiendas } from "@/lib/configuracion";
import { CabeceraPantalla } from "@/components/ui/CabeceraPantalla";
import { ConfiguracionTiendas } from "@/components/ConfiguracionTiendas";

// Configuración (ADR-0195 F1, módulo «configuracion», solo líder): lo que se ajusta una vez y todas las pantallas leen.
// Hoy trae «Tiendas y caja»: la meta de cada día, el fondo de caja y lo que cambia cada campaña. Las siguientes fases de
// Finanzas suman sus secciones aquí (cuentas y cobros, gastos fijos, presupuesto, impuestos).
export default async function ConfiguracionPage() {
  await exigirModulo("configuracion");
  const datos = await getConfiguracionTiendas();
  return (
    <div className="space-y-6">
      <CabeceraPantalla
        sobretitulo="Gestión · Configuración"
        titulo="Tiendas y caja"
        bajada="La meta de venta de cada día, lo que debe quedar en el cajón al cerrar y cuánto cambia eso en cada campaña. La caja lo ve solo; cada cambio queda en la historia con quién lo hizo."
      />
      <ConfiguracionTiendas datos={datos} />
    </div>
  );
}
