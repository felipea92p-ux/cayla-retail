import { exigirModulo, veEstadosFinancierosDeTodoDe } from "@/lib/persona-actual";
import { hoyLima } from "@/lib/fechas-lima";
import { getCampanas } from "@/lib/resultados";
import { CampanasPanel } from "@/components/finanzas/CampanasPanel";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { Volver } from "@/components/ui/Volver";

// Finanzas ▸ Estados financieros ▸ Campañas (ADR-0195 K2, PLAN-FINANZAS §7 ter; spike «¿Valen la pena las campañas?»): las que
// pasaron contra los días normales de sus tiendas, y las que vienen con cuánto más hay que vender para compensar su
// descuento. Quien ve todo (el líder o quien tiene el módulo, ADR-0585) ve CAYLA entera; una terminal, su tienda (lo decide la base).
export default async function CampanasPage() {
  const persona = await exigirModulo("reportes_financieros");
  const campanas = await getCampanas();
  return (
    <div className="space-y-6">
      <EncabezadoPagina
        sede="Estados financieros"
        titulo="Campañas"
        subtitulo="Si el descuento valió la pena, y cuánto más hay que vender en las que vienen."
        volver={<Volver href="/finanzas/reportes" a="Estados financieros" />}
      />
      <CampanasPanel
        campanas={campanas.datos}
        esLider={persona.rol === "lider"}
        veTodo={veEstadosFinancierosDeTodoDe(persona)}
        tiendaNombre={persona.ubicacionEtiqueta}
        hoy={hoyLima()}
        fallas={campanas.falla ? [campanas.falla] : []}
      />
    </div>
  );
}
