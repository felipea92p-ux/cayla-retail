import { BarChart3 } from "lucide-react";
import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { CabeceraReportes } from "@/components/reportes-ventas/CabeceraReportes";
import { Vacio } from "@/components/ui/Vacio";

// Ventas ▸ Reportes ▸ Ventas del mes. Actividad 1 (la puerta): solo la cabecera y su vista; las cifras, los gráficos y la tabla llegan en
// las actividades 2 a 4 (maqueta docs/maquetas/reportes-ventas-2026-11/).
export default async function ReportesVentasPage() {
  const persona = await requirePersonaActualV2();
  const sede = persona.rol === "lider" ? "Todas las tiendas" : persona.ubicacionEtiqueta;
  return (
    <div className="space-y-6">
      <CabeceraReportes sede={sede} activa="mes" />
      <Vacio icono={<BarChart3 />} titulo="Las ventas del mes llegan pronto">
        Aquí vas a ver cuánto se vendió cada mes, por tienda y por categoría.
      </Vacio>
    </div>
  );
}
