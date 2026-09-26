import { Banknote, CalendarDays, Clock, Undo2 } from "lucide-react";
import { requirePersonaActualV2, veModulo } from "@/lib/persona-actual";
import { getVentasRecientes } from "@/lib/ventas-v2";
import { contarPrendasEnCuarentena, getDevolucionesPendientes, getDevolucionesResueltas, getEstadisticasDevoluciones } from "@/lib/devoluciones";
import { getCajaAbierta } from "@/lib/caja";
import { DevolucionesPanel } from "@/components/DevolucionesPanel";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { ResumenSede } from "@/components/ui/ResumenSede";

// Devoluciones (rediseño 2026-09-18, mismo modelo que Cambios, ADR-0125/0122). Una devolución
// tiene dos tiempos: una colaboradora la registra (`crear_devolucion`) y un líder la aprueba
// (`aprobar_devolucion`); la pantalla, en DevolucionesPanel.
//
// 2026-09-26 (spike `docs/maquetas/devoluciones-2026-09`, ADR-0229): la cifra «Por aprobar» abre su
// pestaña, hay una pestaña «Resueltas» y avisos que llevan a las pantallas vecinas (Inventario por la
// cuarentena, Caja si está cerrada). Cada acceso solo aparece si la cuenta ve ese módulo (ADR-0161):
// un enlace nunca lleva a «Sin acceso».
export default async function DevolucionesPage({ searchParams }: { searchParams: Promise<{ q?: string; todas?: string; item?: string }> }) {
  const persona = await requirePersonaActualV2();
  // `item`: llegar desde Cambios con «Pasar a devolución» abre el flujo sobre esa prenda.
  const { q, todas, item } = await searchParams;
  const esLider = persona.rol === "lider";
  // Solo un líder ve otras sedes (RLS de ventas): a una integrante, "todas" no le traería
  // nada y la pantalla mentiría diciendo "no encontramos".
  const todasLasSedes = esLider && todas === "1";
  const veInventario = veModulo(persona, "existencias");
  const [lineas, pendientes, resueltas, estadisticas, caja, enCuarentena] = await Promise.all([
    getVentasRecientes(persona.ubicacionId, { busqueda: q, todasLasSedes, ventaItemId: item }),
    getDevolucionesPendientes(persona.ubicacionId),
    getDevolucionesResueltas(persona.ubicacionId),
    getEstadisticasDevoluciones(persona.ubicacionId),
    getCajaAbierta(persona.ubicacionId),
    veInventario ? contarPrendasEnCuarentena(persona.ubicacionId) : Promise.resolve(0),
  ]);

  return (
    <div className="space-y-7">
      <EncabezadoPagina sede={persona.ubicacionEtiqueta} titulo="Devoluciones" subtitulo="Registra las devoluciones de la clienta y aprueba las que esperan.">
        {/* «Por aprobar» primero y tocable: es lo único de la fila que pide algo a alguien. Las otras
            tres son de las devoluciones APROBADAS de ESTA sede. */}
        <ResumenSede
          sede={persona.ubicacionEtiqueta}
          cifras={[
            { valor: pendientes.length, etiqueta: "Por aprobar", icono: Clock, href: "#por-aprobar", alerta: pendientes.length > 0 },
            { valor: estadisticas.devolucionesHoy, etiqueta: "Hoy", icono: Undo2 },
            { valor: estadisticas.devolucionesMes, etiqueta: "Este mes", icono: CalendarDays },
            { valor: estadisticas.valorMes, formato: "soles", etiqueta: "Valor devuelto", icono: Banknote },
          ]}
        />
      </EncabezadoPagina>

      <DevolucionesPanel
        lineas={lineas}
        pendientes={pendientes}
        resueltas={resueltas}
        busqueda={q?.trim() ?? ""}
        todasLasSedes={todasLasSedes}
        puedeVerTodas={esLider}
        esLider={esLider}
        sede={persona.ubicacionEtiqueta}
        ubicacionId={persona.ubicacionId}
        colaboradora={persona.nombre}
        cajaAbierta={caja !== null}
        abrirItemId={item}
        accesos={{
          cambios: veModulo(persona, "cambios"),
          caja: veModulo(persona, "caja"),
          comprobantes: veModulo(persona, "facturacion"),
          cuarentena: veInventario ? enCuarentena : null,
        }}
      />
    </div>
  );
}
