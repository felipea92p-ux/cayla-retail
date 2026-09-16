"use client";

import Link from "next/link";
import { useState } from "react";
import { Tabla, Encabezado, fila, celda } from "@/components/ui/Tabla";
import { Chip, type TonoChip } from "@/components/ui/Chip";
import { ETIQUETA_ESTADO_TRASLADO, tonoEstadoTraslado } from "@/lib/movimientos-reglas";
import { ETIQUETA_VISTA_TRASLADO, estaAtrasado, llegaHoy, textoPrendas, vistaTraslado, type VistaTraslado } from "@/lib/traslados-reglas";
import type { TrasladoResumen } from "@/lib/traslados";

// La tabla de traslados con su «vista rápida» (diseño de Felipe, 2026-09-16):
// chips que filtran en memoria lo que la página ya trajo — los en curso son
// pocos y vienen completos; los cerrados, los últimos 30. Sin consulta extra
// por clic. Cada fila lleva a su detalle, y la última columna dice qué toca
// hacer ahí: confirmar (me está esperando), revisar (quedó con diferencia) o
// solo ver.
const TODOS = "__todos__";
type Filtro = VistaTraslado | typeof TODOS;
const VISTAS: VistaTraslado[] = ["por_confirmar", "en_camino", "con_diferencia", "cerrado"];

const PLANTILLA = "sm:grid-cols-[6rem_minmax(9rem,1fr)_minmax(10rem,1.2fr)_minmax(9rem,1fr)_10rem]";

function fechaHora(iso: string) {
  return new Date(iso).toLocaleString("es-PE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Lima" });
}
function fecha(iso: string) {
  return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit", timeZone: "America/Lima" });
}

export function TrasladosLista({
  enCurso,
  cerrados,
  miUbicacionId,
  hoyLima,
}: {
  enCurso: TrasladoResumen[];
  cerrados: TrasladoResumen[];
  miUbicacionId: string;
  hoyLima: string;
}) {
  const [filtro, setFiltro] = useState<Filtro>(TODOS);
  const todos = [...enCurso, ...cerrados];
  const conVista = todos.map((t) => ({ t, vista: vistaTraslado(t, miUbicacionId) }));
  const cuenta = (v: Filtro) => (v === TODOS ? todos.length : conVista.filter((x) => x.vista === v).length);
  const visibles = filtro === TODOS ? conVista : conVista.filter((x) => x.vista === filtro);

  if (todos.length === 0) {
    return <p className="card-cayla p-6 text-center text-sm text-tinta/65">No hay ningún traslado todavía — ni en camino ni anterior.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="label-cayla mr-1 text-[11px] text-tinta/55">Vista rápida</span>
        {([TODOS, ...VISTAS] as Filtro[]).map((v) => {
          const n = cuenta(v);
          const activo = filtro === v;
          return (
            <button
              key={v}
              type="button"
              onClick={() => setFiltro(v)}
              aria-pressed={activo}
              disabled={n === 0 && v !== TODOS}
              className={`label-cayla rounded-full border px-3 py-1 text-[10px] transition-colors disabled:opacity-40 ${
                activo ? "border-tinta bg-tinta text-crema" : "border-tinta/20 text-tinta/75 hover:border-rojo hover:text-rojo"
              }`}
            >
              {v === TODOS ? "Todos" : ETIQUETA_VISTA_TRASLADO[v]} <span className={activo ? "text-crema/70" : "text-tinta/45"}>{n}</span>
            </button>
          );
        })}
      </div>

      <Tabla>
        <Encabezado
          plantilla={PLANTILLA}
          columnas={[
            { titulo: "Traslado" },
            { titulo: "Ruta" },
            { titulo: "Prendas" },
            { titulo: "Estado · tiempo", alinear: "centro" },
            { titulo: "", alinear: "centro" },
          ]}
        />
        {visibles.map(({ t, vista }) => {
          const atrasado = t.fechaEstimadaLlegada ? estaAtrasado(t.fechaEstimadaLlegada, t.estado) : false;
          const hoy = t.fechaEstimadaLlegada ? llegaHoy(t.fechaEstimadaLlegada, hoyLima) : false;
          const accion = vista === "por_confirmar" ? "Confirmar recepción" : vista === "con_diferencia" ? "Revisar diferencia" : "Ver detalle";
          const tonoAccion: TonoChip = vista === "por_confirmar" ? "rojo" : vista === "con_diferencia" ? "ambar" : "neutro";
          const tiempo =
            vista === "cerrado"
              ? `${t.estado === "completada" ? "Completado" : "Cerrado"} ${fecha(t.cerradoEn ?? t.confirmadoEn ?? t.creadoEn)}`
              : t.fechaEstimadaLlegada
                ? atrasado
                  ? `Debía llegar ${fechaHora(t.fechaEstimadaLlegada)}`
                  : `Llega ${hoy ? "hoy " : ""}${fechaHora(t.fechaEstimadaLlegada)}`
                : `Enviado ${fechaHora(t.creadoEn)}`;
          return (
            <Link
              key={t.id}
              href={`/inventario/traslados/${t.id}`}
              className={fila(PLANTILLA, "transition-colors hover:bg-tinta/[0.03] focus-visible:bg-tinta/[0.03] focus-visible:outline-none")}
            >
              <span className="min-w-0">
                <span className="block text-sm text-tinta">Traslado {t.numero}</span>
                <span className="block text-xs text-tinta/55">{fecha(t.creadoEn)}</span>
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm text-tinta" title={`${t.ubicacionOrigenNombre} → ${t.ubicacionDestinoNombre}`}>
                  {t.ubicacionOrigenNombre} <span className="text-tinta/45">→</span> {t.ubicacionDestinoNombre}
                </span>
                {t.nota && (
                  <span className="block truncate text-xs text-tinta/55" title={t.nota}>
                    {t.nota}
                  </span>
                )}
              </span>
              <span className="min-w-0">
                <span className="block text-sm text-tinta">
                  {t.unidadesEnviadas} {t.unidadesEnviadas === 1 ? "unidad" : "unidades"}
                  <span className="text-tinta/55">
                    {" "}
                    · {t.lineas} {t.lineas === 1 ? "línea" : "líneas"}
                  </span>
                </span>
                <span className="block truncate text-xs text-tinta/55" title={t.referencias.join(", ")}>
                  {textoPrendas(t.referencias)}
                </span>
              </span>
              <span className="min-w-0 overflow-visible sm:text-center">
                <span className="inline-flex flex-wrap items-center justify-center gap-1.5">
                  <Chip tono={tonoEstadoTraslado(t.estado)}>{ETIQUETA_ESTADO_TRASLADO[t.estado] ?? t.estado}</Chip>
                  {atrasado && <Chip tono="rojo">Atrasado</Chip>}
                </span>
                <span className={`mt-0.5 block truncate text-xs ${atrasado ? "text-rojo-profundo" : "text-tinta/55"}`}>{tiempo}</span>
              </span>
              <span className={celda("centro", "overflow-visible")}>
                <Chip tono={tonoAccion} className={vista === "cerrado" ? "" : "font-semibold"}>
                  {accion}
                </Chip>
              </span>
            </Link>
          );
        })}
        <div className="px-5 py-2.5 text-xs text-tinta/55">
          Mostrando {visibles.length} de {todos.length} {todos.length === 1 ? "traslado" : "traslados"}
          {cerrados.length >= 30 && " · los cerrados se acotan a los últimos 30"}
        </div>
      </Tabla>
    </div>
  );
}
