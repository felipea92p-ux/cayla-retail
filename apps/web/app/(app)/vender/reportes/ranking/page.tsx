import { Shirt } from "lucide-react";
import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { CabeceraReportes } from "@/components/reportes-ventas/CabeceraReportes";
import { Vacio } from "@/components/ui/Vacio";

// Ventas ▸ Reportes ▸ Ranking de prendas. Actividad 1 (la puerta): solo la cabecera y su vista; el ranking llega en la actividad 5.
export default async function RankingPrendasPage() {
  const persona = await requirePersonaActualV2();
  const sede = persona.rol === "lider" ? "Todas las tiendas" : persona.ubicacionEtiqueta;
  return (
    <div className="space-y-6">
      <CabeceraReportes sede={sede} activa="ranking" />
      <Vacio icono={<Shirt />} titulo="El ranking de prendas llega pronto">
        Aquí vas a ver qué prendas se venden más, con las fechas y los filtros que quieras.
      </Vacio>
    </div>
  );
}
