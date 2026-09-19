import { Banknote, CalendarDays, Undo2 } from "lucide-react";
import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { getVentasRecientes } from "@/lib/ventas-v2";
import { getDevolucionesPendientes, getEstadisticasDevoluciones } from "@/lib/devoluciones";
import { getCajaAbierta } from "@/lib/caja";
import { DevolucionesPanel } from "@/components/DevolucionesPanel";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { ResumenSede } from "@/components/ui/ResumenSede";

// Devoluciones (rediseño 2026-09-18, mismo modelo que Cambios, ADR-0125/0122). Una devolución
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
    <div className="space-y-7">
      <EncabezadoPagina sede={persona.ubicacionEtiqueta} titulo="Devoluciones" subtitulo="Registra las devoluciones de la clienta y aprueba las que esperan.">
        {/* Las tres cifras, como en Cambios: cada una centrada sobre su etiqueta. Son de las
            devoluciones APROBADAS de ESTA sede. */}
        <ResumenSede
          sede={persona.ubicacionEtiqueta}
          cifras={[
            { valor: estadisticas.devolucionesHoy, etiqueta: "Devoluciones hoy", icono: Undo2 },
            { valor: estadisticas.devolucionesMes, etiqueta: "Este mes", icono: CalendarDays },
            { valor: estadisticas.valorMes, formato: "soles", etiqueta: "Valor devuelto", icono: Banknote },
          ]}
        />
      </EncabezadoPagina>

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
