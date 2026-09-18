import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { getVentasRecientes } from "@/lib/ventas-v2";
import { getDevolucionesPendientes, getEstadisticasDevoluciones } from "@/lib/devoluciones";
import { getCajaAbierta } from "@/lib/caja";
import { soles } from "@/lib/compras-reglas";
import { DevolucionesPanel } from "@/components/DevolucionesPanel";

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
        {/* Indicadores chicos, como en Cambios: acompañan al título, no compiten con él. De
            las devoluciones aprobadas de ESTA sede. */}
        <dl className="flex gap-8">
          <Indicador valor={String(estadisticas.devolucionesHoy)} etiqueta="Devoluciones hoy" />
          <Indicador valor={String(estadisticas.devolucionesMes)} etiqueta="Este mes" />
          <Indicador valor={soles(estadisticas.valorMes)} etiqueta="Valor devuelto" />
        </dl>
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

function Indicador({ valor, etiqueta }: { valor: string; etiqueta: string }) {
  return (
    <div className="flex flex-col-reverse">
      <dt className="mt-0.5 text-xs text-tinta/70">{etiqueta}</dt>
      <dd className="text-xl font-semibold tabular-nums text-tinta">{valor}</dd>
    </div>
  );
}
