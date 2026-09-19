"use client";

import { useRef } from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { CampoSelectNativo } from "@/components/ui/campos";
import { ETIQUETA_FILTRO_TRASLADO, FILTROS_TRASLADO, type FiltroDireccion, type FiltroTraslado } from "@/lib/traslados-reglas";

// La «vista rápida»: chips con contador que filtran de verdad la lista, el
// buscador y «Más filtros». «Más filtros» existe porque con varias sedes y
// mucho movimiento hace falta separar lo que llega de lo que sale y mirar una
// sola sede — no por completar la fila. Todo se filtra en memoria sobre lo que
// la página ya trajo (los en curso completos, los últimos 30 cerrados): sin
// consulta por clic.
const DIRECCIONES: { valor: FiltroDireccion; texto: string }[] = [
  { valor: "todas", texto: "Todos" },
  { valor: "entrante", texto: "Entrantes" },
  { valor: "saliente", texto: "Salientes" },
];

export function TrasladosFiltros({
  filtro,
  onFiltro,
  conteos,
  busqueda,
  onBusqueda,
  masAbierto,
  onToggleMas,
  direccion,
  onDireccion,
  sede,
  onSede,
  sedes,
  masActivos,
  onLimpiarMas,
}: {
  filtro: FiltroTraslado;
  onFiltro: (f: FiltroTraslado) => void;
  conteos: Record<FiltroTraslado, number>;
  busqueda: string;
  onBusqueda: (v: string) => void;
  masAbierto: boolean;
  onToggleMas: () => void;
  direccion: FiltroDireccion;
  onDireccion: (d: FiltroDireccion) => void;
  sede: string;
  onSede: (id: string) => void;
  sedes: { id: string; nombre: string }[];
  /** Cuántos de «Más filtros» están puestos (para el número del botón). */
  masActivos: number;
  onLimpiarMas: () => void;
}) {
  const entrada = useRef<HTMLInputElement>(null);
  // Un filtro que no es de la fila (el atajo de una tarjeta, «Por recibir hoy») se muestra como un
  // chip más, ya activo, para que se vea qué está filtrando y se pueda quitar.
  const extra = FILTROS_TRASLADO.includes(filtro) ? null : filtro;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
        <div role="group" aria-label="Vista rápida" className="flex flex-wrap items-center gap-2">
          {FILTROS_TRASLADO.map((f) => {
            const n = conteos[f];
            const activo = filtro === f;
            return (
              <button
                key={f}
                type="button"
                onClick={() => onFiltro(f)}
                aria-pressed={activo}
                // Un filtro vacío no se puede elegir (no llevaría a nada), salvo «Todos» y el que ya está activo.
                disabled={n === 0 && f !== "todos" && !activo}
                className={`label-cayla inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-[10px] transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                  activo ? "border-tinta bg-tinta text-crema" : "border-tinta/20 text-tinta/75 hover:border-rojo hover:text-rojo"
                }`}
              >
                {ETIQUETA_FILTRO_TRASLADO[f]}
                <span className={`tabular-nums ${activo ? "text-crema/70" : "text-tinta/60"}`}>{n}</span>
              </button>
            );
          })}
          {extra && (
            <button
              type="button"
              onClick={() => onFiltro("todos")}
              aria-label={`Quitar el filtro ${ETIQUETA_FILTRO_TRASLADO[extra]}`}
              className="label-cayla inline-flex items-center gap-2 rounded-full border border-tinta bg-tinta px-3.5 py-1.5 text-[10px] text-crema transition-colors hover:border-rojo hover:bg-rojo focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rojo"
            >
              {ETIQUETA_FILTRO_TRASLADO[extra]}
              <span className="tabular-nums text-crema/70">{conteos[extra]}</span>
              <X aria-hidden strokeWidth={1.5} className="h-3 w-3" />
            </button>
          )}
        </div>

        <div className="flex min-w-0 flex-1 basis-72 items-center gap-2 sm:justify-end">
          {/* El botón de limpiar va AL LADO del campo, no dentro de un <label>: un <label> con un botón adentro
              mezcla dos controles en uno y, al desaparecer la X, el foco se perdía. Ahora vuelve al campo. */}
          <div className="relative flex h-10 min-w-[13rem] flex-1 items-center sm:max-w-sm">
            <Search aria-hidden strokeWidth={1.5} className="pointer-events-none absolute left-3 h-4 w-4 text-tinta/50" />
            <input
              ref={entrada}
              type="text"
              value={busqueda}
              onChange={(e) => onBusqueda(e.target.value)}
              placeholder="Buscar traslado, sede o prenda…"
              aria-label="Buscar traslado, sede o prenda"
              autoComplete="off"
              className="h-10 w-full rounded-lg border border-tinta/20 bg-transparent pl-9 pr-9 text-sm text-tinta outline-none placeholder:text-tinta/50 focus:border-rojo"
            />
            {busqueda && (
              <button
                type="button"
                onClick={() => {
                  onBusqueda("");
                  entrada.current?.focus();
                }}
                aria-label="Limpiar búsqueda"
                className="absolute right-1.5 flex h-7 w-7 items-center justify-center rounded-md text-tinta/60 hover:text-rojo focus-visible:outline focus-visible:outline-2 focus-visible:outline-rojo"
              >
                <X aria-hidden strokeWidth={1.5} className="h-4 w-4" />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={onToggleMas}
            aria-expanded={masAbierto}
            aria-controls="traslados-mas-filtros"
            className={`label-cayla inline-flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border px-3.5 text-[11px] transition-colors ${
              masAbierto || masActivos > 0 ? "border-tinta/30 bg-tinta/[0.04] text-tinta" : "border-tinta/20 text-tinta/70 hover:border-tinta/35 hover:text-tinta"
            }`}
          >
            <SlidersHorizontal aria-hidden strokeWidth={1.5} className="h-3.5 w-3.5" />
            Más filtros{masActivos > 0 ? ` · ${masActivos}` : ""}
          </button>
        </div>
      </div>

      {masAbierto && (
        <div id="traslados-mas-filtros" className="anim-revelar flex flex-wrap items-end gap-x-6 gap-y-3 rounded-xl bg-sand/50 px-4 py-3">
          <div>
            <p className="label-cayla mb-1.5 text-[11px] text-tinta/65">Dirección</p>
            <div role="group" aria-label="Dirección" className="flex gap-1.5">
              {DIRECCIONES.map((d) => (
                <button
                  key={d.valor}
                  type="button"
                  onClick={() => onDireccion(d.valor)}
                  aria-pressed={direccion === d.valor}
                  className={`label-cayla rounded-full border px-3 py-1.5 text-[10px] transition-colors ${
                    direccion === d.valor ? "border-tinta bg-tinta text-crema" : "border-tinta/20 text-tinta/75 hover:border-rojo hover:text-rojo"
                  }`}
                >
                  {d.texto}
                </button>
              ))}
            </div>
          </div>
          <div className="w-52">
            <CampoSelectNativo etiqueta="Otra sede" value={sede} onChange={(e) => onSede(e.target.value)}>
              <option value="">Todas</option>
              {sedes.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </CampoSelectNativo>
          </div>
          {masActivos > 0 && (
            <button type="button" onClick={onLimpiarMas} className="label-cayla pb-2 text-[11px] text-tinta/65 underline-offset-2 hover:text-rojo hover:underline">
              Quitar estos filtros
            </button>
          )}
        </div>
      )}
    </div>
  );
}
