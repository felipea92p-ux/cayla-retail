import { exigirPermiso } from "@/lib/persona-actual";
import { getSeriesArchivadas, getSeriesComprobantes } from "@/lib/comprobantes";
import { entornoLucode } from "@/lib/lucode";
import { getUbicaciones } from "@/lib/ubicaciones";
import { tiendasOperativas } from "@/lib/facturacion-reglas";
import { SeriesPanel } from "@/components/SeriesPanel";
import { MarcaDeCarga } from "@/components/MarcaDeCarga";

// Series = la base de Comprobantes (D-60, 2026-09-22): qué series tiene cada tienda y en qué número va
// cada una. Reemplaza al Resumen del día, que ya cuentan Caja e Historial de ventas. `getSeriesComprobantes`
// y `getUbicaciones` van con `cache`: en una carga completa el layout ya las pidió y no se leen otra vez.
export default async function SeriesPage() {
  const persona = await exigirPermiso("facturar");
  const ahora = new Date();
  const [series, archivadas, ubicaciones] = await Promise.all([getSeriesComprobantes(), getSeriesArchivadas(), getUbicaciones()]);

  return (
    <div className="space-y-6">
      <MarcaDeCarga en={ahora.getTime()} />
      <SeriesPanel
        series={series}
        archivadas={archivadas}
        enPruebas={entornoLucode() === "sandbox"}
        tiendas={tiendasOperativas(ubicaciones).map(({ id, nombre }) => ({ id, nombre }))}
        esLider={persona.rol === "lider"}
      />
    </div>
  );
}
