"use client";

import { useRef } from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { ETIQUETA_FILTRO_TRASLADO, FILTROS_TRASLADO, type FiltroDireccion, type FiltroTraslado } from "@/lib/traslados-reglas";

// La «vista rápida»: chips con contador que filtran de verdad la lista, el
// buscador y «Más filtros». «Más filtros» existe porque con varias sedes y
// mucho movimiento hace falta separar lo que llega de lo que sale y mirar una
// sola sede — no por completar la fila. Todo se filtra en memoria sobre lo que
// la página ya trajo (los en curso completos, los últimos 30 cerrados): sin
// consulta por clic.
// Rediseño 2026-09-22: la sede se elige con píldoras, no con un <select> nativo (que el sistema operativo
// pintaba con su propio azul, fuera de la marca). Son pocas sedes; una píldora por sede se lee de un vistazo.
const DIRECCIONES: { valor: FiltroDireccion; texto: string }[] = [
  { valor: "todas", texto: "Todas" },
  { valor: "entrante", texto: "Entran a tu sede" },
  { valor: "saliente", texto: "Salen de tu sede" },
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
        <div role="group" aria-label="Vista rápida" className="order-2 flex w-full flex-wrap items-center gap-2">
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
                className="pildora-cayla disabled:cursor-not-allowed disabled:opacity-40"
              >
                {ETIQUETA_FILTRO_TRASLADO[f]}
                <span className={`tabular-nums ${activo ? "text-crema/70" : "text-taupe"}`}>· {n}</span>
              </button>
            );
          })}
          {extra && (
            <button
              type="button"
              onClick={() => onFiltro("todos")}
              aria-label={`Quitar el filtro ${ETIQUETA_FILTRO_TRASLADO[extra]}`}
              aria-pressed className="pildora-cayla focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rojo"
            >
              {ETIQUETA_FILTRO_TRASLADO[extra]}
              <span className="tabular-nums text-crema/70">· {conteos[extra]}</span>
              <X aria-hidden strokeWidth={1.5} className="h-3 w-3" />
            </button>
          )}
        </div>

        <div className="order-1 flex min-w-0 flex-1 basis-full flex-wrap items-center gap-2 sm:basis-72">
          {/* El botón de limpiar va AL LADO del campo, no dentro de un <label>: un <label> con un botón adentro
              mezcla dos controles en uno y, al desaparecer la X, el foco se perdía. Ahora vuelve al campo. */}
          <div className="caja-cayla relative flex h-10 min-w-0 flex-[1_1_14rem] items-center">
            <Search aria-hidden strokeWidth={1.5} className="pointer-events-none absolute left-3 h-4 w-4 text-tinta/50" />
            <input
              ref={entrada}
              type="text"
              value={busqueda}
              onChange={(e) => onBusqueda(e.target.value)}
              placeholder="Buscar traslado, sede o prenda…"
              aria-label="Buscar traslado, sede o prenda"
              autoComplete="off"
              className="h-full w-full rounded-lg bg-transparent pl-9 pr-9 text-sm text-tinta outline-none placeholder:text-taupe"
            />
            {busqueda && (
              <button
                type="button"
                onClick={() => {
                  onBusqueda("");
                  entrada.current?.focus();
                }}
                aria-label="Limpiar búsqueda"
                className="absolute right-1.5 flex h-7 w-7 items-center justify-center rounded-md text-taupe hover:text-rojo focus-visible:outline focus-visible:outline-2 focus-visible:outline-rojo"
              >
                <X aria-hidden strokeWidth={1.5} className="h-4 w-4" />
              </button>
            )}
          </div>
          {/* Entrantes / Salientes a la vista (rediseño 2026-09-22, ADR-0175): es el filtro que más se usa
              después de la búsqueda, y abrir un panel para él era un toque de más. Mismo control segmentado
              que la sububicación de Movimientos. «Otra sede» sigue en «Más filtros». */}
          <div role="group" aria-label="Dirección" className="inline-flex h-10 shrink-0 items-center gap-0.5 rounded-lg bg-hueso p-[3px]">
            {DIRECCIONES.map((d) => {
              const activa = direccion === d.valor;
              return (
                <button
                  key={d.valor}
                  type="button"
                  onClick={() => onDireccion(d.valor)}
                  aria-pressed={activa}
                  className={`h-full whitespace-nowrap rounded-md px-2.5 text-[12.5px] font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-rojo sm:px-3 ${
                    activa ? "bg-papel text-tinta shadow-[inset_0_0_0_1px_var(--color-sand)]" : "text-taupe hover:text-tinta"
                  }`}
                >
                  {d.texto}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={onToggleMas}
            aria-expanded={masAbierto}
            aria-controls="traslados-mas-filtros"
            className={`btn-cayla btn-secundario h-10 shrink-0 ${masAbierto || masActivos > 0 ? "bg-sand/50" : ""}`}
          >
            <SlidersHorizontal aria-hidden strokeWidth={1.5} className="h-3.5 w-3.5" />
            Más filtros{masActivos > 0 ? ` · ${masActivos}` : ""}
          </button>
        </div>
      </div>

      {masAbierto && (
        <div id="traslados-mas-filtros" className="anim-revelar flex flex-wrap items-end gap-x-6 gap-y-3 rounded-xl bg-hueso/70 px-4 py-3">
          <div>
            <p className="mb-1.5 text-xs text-taupe">Otra sede</p>
            <div role="group" aria-label="Otra sede" className="flex flex-wrap gap-1.5">
              <button type="button" onClick={() => onSede("")} aria-pressed={sede === ""} className="pildora-cayla aria-[pressed=false]:bg-papel">
                Todas
              </button>
              {sedes.map((x) => (
                <button key={x.id} type="button" onClick={() => onSede(x.id)} aria-pressed={sede === x.id} className="pildora-cayla aria-[pressed=false]:bg-papel">
                  {x.nombre}
                </button>
              ))}
            </div>
          </div>
          {masActivos > 0 && (
            <button type="button" onClick={onLimpiarMas} className="btn-enlace pb-1.5 text-[13px]">
              Limpiar filtros
            </button>
          )}
        </div>
      )}
    </div>
  );
}
