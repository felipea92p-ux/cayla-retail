import { redirect } from "next/navigation";
import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { getTaller } from "@/lib/produccion";
import { getInsumosDelTaller } from "@/lib/insumos";
import { getColoresDeLaCarta, getVocabularioDeTelas } from "@/lib/telas-vocabulario";
import { hoyLima } from "@/lib/fechas-lima";
import { InsumosPanel } from "@/components/InsumosPanel";
import { ProduccionSoloEnTaller } from "@/components/ProduccionSoloEnTaller";
import { puedeVerProduccion } from "@/lib/produccion-menu";
import { Factory } from "lucide-react";
import { Vacio } from "@/components/ui/Vacio";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";

// Insumos del Taller (ADR-0133, F3): tela y avíos, con su saldo por lote. Mismo acceso que Órdenes (`puedeVerProduccion`):
// solo parado en el Taller, líder incluido. El costo de cada lote lo ve quien ve Producción en el Taller (Felipe 2026-10-15,
// ADR-0400 actividad 6: la base se lo da a esa persona y a nadie más); el CAPITAL total y crear o ingresar insumos siguen
// siendo del líder. Ver docs/PLAN-PRODUCCION.md.
export default async function InsumosPage() {
  const persona = await requirePersonaActualV2();
  if (!puedeVerProduccion(persona)) {
    if (!persona.puedeCambiarUbicacion) redirect("/");
    return <ProduccionSoloEnTaller ubicacionActual={persona.ubicacionEtiqueta} />;
  }

  const taller = await getTaller();
  if (!taller) {
    return (
      <div className="space-y-6">
        <EncabezadoPagina sede={persona.ubicacionEtiqueta} titulo="Insumos" />
        <div className="card-cayla">
          <Vacio icono={<Factory />} titulo="No hay un Taller activo">
            Insumos necesita una ubicación de tipo Taller para saber dónde están la tela y los avíos. Pídele al líder que active el Taller.
          </Vacio>
        </div>
      </div>
    );
  }

  const esLider = persona.rol === "lider";
  const [datosConCostos, vocabulario, carta] = await Promise.all([
    getInsumosDelTaller(taller.id, { conCostos: true, hoy: hoyLima() }),
    // Dato de apoyo (la ficha de la tela): si no se lee, la lista sigue en pie y la ficha lo dice.
    getVocabularioDeTelas(),
    // La carta de colores de «Nueva tela» (la misma de Catálogo): también de apoyo.
    getColoresDeLaCarta(),
  ]);
  // `veCostos` lo dice la base (si no entregó costo teniendo lotes, no se dibuja «S/ 0.00» como si fuera un dato). El capital total es solo del líder.
  const veCostos = datosConCostos.veCostos;
  const datos = { ...datosConCostos, capital: esLider ? datosConCostos.capital : null };

  return (
    <div className="space-y-6">
      <InsumosPanel
        sede={persona.ubicacionEtiqueta}
        datos={datos}
        tallerId={taller.id}
        esLider={esLider}
        veCostos={veCostos}
        vocabulario={vocabulario.vocabulario}
        leyoVocabulario={vocabulario.leyo}
        colores={carta.colores}
        leyoColores={carta.leyo}
      />
    </div>
  );
}
