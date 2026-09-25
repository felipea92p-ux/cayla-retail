import { exigirModulo } from "@/lib/persona-actual";
import { hoyLima } from "@/lib/fechas-lima";
import { getCampanas } from "@/lib/resultados";
import { CampanasPanel } from "@/components/finanzas/CampanasPanel";

// Finanzas ▸ Reportes ▸ Campañas (ADR-0195 K2, PLAN-FINANZAS §7 ter; spike «¿Valen la pena las campañas?»): las que
// pasaron contra los días normales de sus tiendas, y las que vienen con cuánto más hay que vender para compensar su
// descuento. El líder ve CAYLA entera; con el módulo, su tienda (lo decide la base).
export default async function CampanasPage() {
  const persona = await exigirModulo("reportes_financieros");
  const campanas = await getCampanas();
  return (
    <CampanasPanel
      campanas={campanas.datos}
      esLider={persona.rol === "lider"}
      tiendaNombre={persona.ubicacionEtiqueta}
      hoy={hoyLima()}
      fallas={campanas.falla ? [campanas.falla] : []}
    />
  );
}
