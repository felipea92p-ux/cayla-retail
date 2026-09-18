import { Banknote, CalendarDays, Undo2 } from "lucide-react";
import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { getVentasRecientes } from "@/lib/ventas-v2";
import { getDevolucionesPendientes, getEstadisticasDevoluciones } from "@/lib/devoluciones";
import { getCajaAbierta } from "@/lib/caja";
import { soles } from "@/lib/compras-reglas";
import { DevolucionesPanel } from "@/components/DevolucionesPanel";
import { ResumenSede } from "@/components/ui/ResumenSede";

// Devoluciones (rediseño 2026-09-18, mismo modelo que Cambios, ADR-0104/0105). Una devolución
// tiene dos tiempos: una colaboradora la registra (`crear_devolucion`) y un líder la aprueba
// (`aprobar_devolucion`); la pantalla, en DevolucionesPanel.
export default async function DevolucionesPage({ searchParams }: { searchParams: Promise<{ q?: string; todas?: string; item?: string }> }) {
  const persona = await requirePersonaActualV2();
  // `item`: llegar desde Cambios con «Pasar a devolución» abre el flujo sobre esa prenda.
  const { q, todas, item } = await searchParams;
  const esLider = persona.rol === "lider";
  // Solo un líder ve otras sedes (RLS de ventas): a una integrante, "todas" no le traería
  // nada y la pantalla mentiría diciendo "no encontramos".
  const todasLasSedes = esLider && todas === "1";
  const [lineas, pendientes, estadisticas, caja] = await Promise.all([
    getVentasRecientes(persona.ubicacionId, { busqueda: q, todasLasSedes, ventaItemId: item }),
    getDevolucionesPendientes(persona.ubicacionId),
    getEstadisticasDevoluciones(persona.ubicacionId),
    getCajaAbierta(persona.ubicacionId),
  ]);

  return (
    <div className="space-y-10">
      <header className="flex flex-wrap items-end justify-between gap-x-10 gap-y-6">
        <div>
          <h1 className="font-display text-3xl text-tinta">Devoluciones</h1>
          <p className="mt-1.5 text-[15px] text-tinta/70">Registra las devoluciones de la clienta y aprueba las que esperan.</p>
        </div>
        {/* Las tres cifras, como en Cambios: un recuadro con el nombre de la sede y cada cifra
            centrada sobre su etiqueta. Son de las devoluciones APROBADAS de ESTA sede. */}
        <ResumenSede
          sede={persona.ubicacionEtiqueta}
          cifras={[
            { valor: String(estadisticas.devolucionesHoy), etiqueta: "Devoluciones hoy", icono: Undo2 },
            { valor: String(estadisticas.devolucionesMes), etiqueta: "Este mes", icono: CalendarDays },
            { valor: soles(estadisticas.valorMes), etiqueta: "Valor devuelto", icono: Banknote },
          ]}
        />
      </header>

      <DevolucionesPanel
        lineas={lineas}
        pendientes={pendientes}
        busqueda={q?.trim() ?? ""}
        todasLasSedes={todasLasSedes}
        puedeVerTodas={esLider}
        esLider={esLider}
        sede={persona.ubicacionEtiqueta}
        ubicacionId={persona.ubicacionId}
        colaboradora={persona.nombre}
        cajaAbierta={caja !== null}
        abrirItemId={item}
      />
    </div>
  );
}
