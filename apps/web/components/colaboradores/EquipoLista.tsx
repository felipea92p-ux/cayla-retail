"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { ColaboradorPendiente } from "@/lib/colaboradores";
import { fechaLima, plural } from "@/lib/colaboradores-reglas";
import {
  agruparPorSede,
  atajosEquipo,
  cuandoEntro,
  mismoFiltro,
  type FiltroEquipo,
  type MiembroEquipo,
  type PersonaEquipo,
} from "@/lib/equipo-reglas";
import { AvatarPersona } from "@/components/ui/AvatarPersona";
import { Chip } from "@/components/ui/Chip";
import { IconoAparato } from "@/components/ui/IconoAparato";
import { ComboResponsable } from "@/components/ComboResponsable";
import type { ControlResponsable } from "@/lib/useResponsable";

// Colaboradores ▸ Equipo (propuesta de Felipe del 2026-10-05): UNA lista agrupada por sede, como se piensa el negocio
// («el equipo de Trujillo»). El estado (suspendido, baja en Dynamic) es una marca sobre la persona, no una pestaña. Arriba,
// «Esperan tu ok» solo si hay altas por aprobar. Tocar una persona abre su ficha; tocar una terminal, la suya (`FichaTerminal`). Con el atajo «Terminales» la lista es la misma, solo con ellas.

/** El rol: el único rótulo de acceso. El Líder, en tinta. */
export function PildoraRol({ nombre, lider }: { nombre: string; lider: boolean }) {
  return (
    <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${lider ? "bg-tinta text-crema" : "bg-hueso text-tinta"}`}>
      {nombre}
    </span>
  );
}

/** Su foto de Dynamic (o sus iniciales) y, si está de turno hoy, el punto verde. */
export function CaraPersona({ p, grande = false }: { p: Pick<PersonaEquipo, "id" | "nombre" | "deTurno" | "estado">; grande?: boolean }) {
  return (
    <span className="relative shrink-0">
      <AvatarPersona personaId={p.id} nombre={p.nombre} className={grande ? "h-[72px] w-[72px] text-2xl" : "h-9 w-9 text-sm"} />
      {p.deTurno && p.estado === "activa" && (
        <span
          title="De turno hoy"
          className={`absolute bottom-0 right-0 rounded-full border-papel bg-verde ${grande ? "h-4 w-4 border-[3px]" : "h-3 w-3 border-2"}`}
        />
      )}
    </span>
  );
}

export function EstadoPersona({ p }: { p: Pick<PersonaEquipo, "estado"> }) {
  if (p.estado === "suspendida") return <Chip tono="ambar">Suspendido</Chip>;
  if (p.estado === "baja_dynamic")
    return (
      <span className="inline-flex items-center gap-1.5">
        <Chip tono="ambar">Suspendido</Chip>
        <span className="text-xs text-tinta/60">baja en Dynamic</span>
      </span>
    );
  return null;
}

/** Las columnas de la lista y de sus títulos: cara, persona, rol, último ingreso (desde 640 px) y estado (desde 1024 px). En una
 *  pantalla ancha van juntas a la izquierda con anchos fijos, y lo que sobra lo toma «Estado» (Felipe 2026-10-05: el rol y la fecha
 *  quedaban al otro extremo, lejos del nombre). */
const COLUMNAS =
  "grid grid-cols-[36px_minmax(0,1fr)_minmax(0,9.5rem)] items-center gap-x-3.5 sm:grid-cols-[36px_minmax(0,1fr)_10rem_7.5rem] lg:grid-cols-[36px_minmax(14rem,22rem)_11rem_8rem_minmax(0,1fr)]";

/** El estado en una palabra: lo que pide atención o lo que está pasando hoy. Nada si está activa y sin turno. */
function EstadoMiembro({ m }: { m: MiembroEquipo }) {
  if (m.tipo === "terminal") return m.activo ? null : <Chip tono="apagado" tachado={false}>Desactivada</Chip>;
  if (m.estado !== "activa") return <EstadoPersona p={m} />;
  if (m.deTurno) return <span className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-verde"><span aria-hidden className="h-2 w-2 rounded-full bg-verde" />De turno hoy</span>;
  return null;
}

function FilaMiembro({ m, elegido, ahoraIso, onTocar }: { m: MiembroEquipo; elegido: boolean; ahoraIso: string; onTocar: () => void }) {
  const apagado = m.tipo === "persona" ? m.estado !== "activa" : !m.activo;
  return (
    <li>
      <button
        type="button"
        onClick={onTocar}
        aria-current={elegido ? "true" : undefined}
        className={`${COLUMNAS} w-full rounded-xl px-2.5 py-2 text-left transition-colors duration-150 ease-cayla ${
          elegido ? "bg-hueso" : "hover:bg-hueso/60"
        }`}
      >
        {m.tipo === "persona" ? (
          <span className={apagado ? "opacity-60" : ""}>
            <CaraPersona p={m} />
          </span>
        ) : (
          <span className={`grid h-9 w-9 place-items-center rounded-[10px] bg-tinta text-crema ${apagado ? "opacity-60" : ""}`}>
            <IconoAparato className="h-[18px] w-[18px]" />
          </span>
        )}
        <span className="min-w-0">
          <span className={`flex flex-wrap items-center gap-x-2 gap-y-1 text-[14.5px] font-semibold leading-tight ${apagado ? "text-tinta/60" : "text-tinta"}`}>
            <span className="truncate">{m.nombre}</span>
            {m.tipo === "persona" && m.esYo && <span className="text-xs font-normal text-tinta/60">(tú)</span>}
            {m.tipo === "persona" && m.esAdmin && <span className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-taupe">Admin</span>}
            {/* Bajo 1024 px el estado va junto al nombre; desde ahí, en su columna. */}
            {(m.tipo === "persona" ? m.estado !== "activa" : !m.activo) && (
              <span className="lg:hidden">
                <EstadoMiembro m={m} />
              </span>
            )}
          </span>
          <span className="mt-0.5 block truncate text-[12px] text-tinta/55">{m.tipo === "persona" ? m.correo : "Terminal de tienda"}</span>
        </span>
        <span className={`justify-self-start ${apagado ? "opacity-70" : ""}`}>
          <PildoraRol nombre={m.rolNombre} lider={m.tipo === "persona" && m.nivel === "lider"} />
        </span>
        <span className="hidden text-[12.5px] tabular-nums text-tinta/60 sm:block lg:text-left">
          {m.tipo === "persona" && m.estado !== "activa" ? "—" : cuandoEntro(m.ultimoAcceso, ahoraIso)}
        </span>
        <span className="hidden lg:block">
          <EstadoMiembro m={m} />
        </span>
      </button>
    </li>
  );
}

/** Las altas que esperan el ok de un líder (D-70), con Aprobar y No en la misma fila. «No» pregunta una vez. */
function EsperanTuOk({
  pendientes,
  ocupadoId,
  responsable,
  onAprobar,
  onRechazar,
}: {
  pendientes: ColaboradorPendiente[];
  ocupadoId: string | null;
  responsable: ControlResponsable;
  onAprobar: (p: ColaboradorPendiente) => void;
  onRechazar: (p: ColaboradorPendiente) => void;
}) {
  const [preguntando, setPreguntando] = useState<string | null>(null);
  return (
    <section aria-label="Altas que esperan aprobación" className="rounded-xl bg-ambar/10 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[11.5px] font-bold uppercase tracking-[0.1em] text-ambar-profundo">Esperan tu ok · {pendientes.length}</h2>
        <ComboResponsable control={responsable} compacto deshabilitado={ocupadoId !== null} className="max-w-xs" />
      </div>
      <ul className="mt-2.5 space-y-2">
        {pendientes.map((p) => (
          <li key={p.persona_id} className={`flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg bg-papel px-3 py-2.5 ${ocupadoId === p.persona_id ? "opacity-50" : ""}`}>
            <AvatarPersona personaId={p.persona_id} nombre={p.nombre} className="h-9 w-9 text-sm" />
            <p className="min-w-0 flex-1 text-sm text-tinta">
              <strong className="font-semibold">{p.nombre}</strong> entra a {p.ubicacion_asignada ?? "retail"}
              <span className="block text-[12.5px] text-tinta/60">
                Lo pidió {p.propuesto_por ?? "un líder"} · {fechaLima(p.propuesto_en)}
              </span>
            </p>
            {preguntando === p.persona_id ? (
              <span className="flex flex-wrap items-center gap-2 text-[13px] text-tinta">
                ¿No le das acceso?
                <button type="button" className="btn-cayla btn-chico btn-peligro" onClick={() => { setPreguntando(null); onRechazar(p); }}>
                  Sí, rechazar
                </button>
                <button type="button" className="btn-cayla btn-chico btn-sutil" onClick={() => setPreguntando(null)}>
                  Volver
                </button>
              </span>
            ) : (
              <span className="flex gap-2">
                <button type="button" className="btn-cayla btn-chico btn-primario" disabled={ocupadoId !== null || !responsable.listo} title={responsable.motivo ?? undefined} onClick={() => onAprobar(p)}>
                  Aprobar
                </button>
                <button type="button" className="btn-cayla btn-chico btn-sutil" disabled={ocupadoId !== null} onClick={() => setPreguntando(p.persona_id)}>
                  No
                </button>
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function EquipoLista({
  miembros,
  ubicaciones,
  pendientes,
  ocupadoId,
  elegidoId,
  ahoraIso,
  responsable,
  filtro,
  onFiltro,
  onAbrir,
  onAprobar,
  onRechazar,
  conTerminales,
  onAbrirTerminal,
  onNuevaTerminal,
}: {
  miembros: MiembroEquipo[];
  ubicaciones: { id: string; nombre: string }[];
  pendientes: ColaboradorPendiente[];
  ocupadoId: string | null;
  elegidoId: string | null;
  ahoraIso: string;
  responsable: ControlResponsable;
  filtro: FiltroEquipo;
  onFiltro: (f: FiltroEquipo) => void;
  onAbrir: (personaId: string) => void;
  onAprobar: (p: ColaboradorPendiente) => void;
  onRechazar: (p: ColaboradorPendiente) => void;
  /** ¿Se pudieron leer las terminales? Sin ellas no sale el atajo «Terminales». */
  conTerminales: boolean;
  onAbrirTerminal: (terminalId: string) => void;
  /** Sin ella (terminales sin leer), no se ofrece crear una. */
  onNuevaTerminal?: () => void;
}) {
  const [texto, setTexto] = useState("");
  const atajos = useMemo(() => atajosEquipo(miembros, ubicaciones, conTerminales), [miembros, ubicaciones, conTerminales]);
  const grupos = useMemo(() => agruparPorSede(miembros, ubicaciones, filtro, texto), [miembros, ubicaciones, filtro, texto]);
  const enTerminales = filtro === "terminales";

  return (
    <div className="space-y-4">
      {pendientes.length > 0 && (
        <EsperanTuOk pendientes={pendientes} ocupadoId={ocupadoId} responsable={responsable} onAprobar={onAprobar} onRechazar={onRechazar} />
      )}

      <div className="card-cayla space-y-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-3">
          <div role="group" aria-label="Ver" className="flex min-w-0 flex-1 flex-wrap gap-1.5">
            {atajos.map((a) => (
              <button key={a.clave} type="button" className="pildora-cayla" aria-pressed={mismoFiltro(filtro, a.filtro)} onClick={() => onFiltro(a.filtro)}>
                {a.etiqueta} <span className="tabular-nums opacity-70 dark:opacity-85">{a.n}</span>
              </button>
            ))}
          </div>
          {enTerminales && onNuevaTerminal && (
            <button type="button" className="btn-cayla btn-primario" onClick={onNuevaTerminal}>
              + Nueva terminal
            </button>
          )}
          <label className="caja-cayla flex w-full items-center gap-2 px-3 py-2 sm:w-72">
            <Search aria-hidden className="h-4 w-4 shrink-0 text-tinta/50" />
            <input
              type="search"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Buscar persona o terminal"
              aria-label="Buscar persona o terminal por nombre, correo o rol"
              autoComplete="off"
              className="w-full bg-transparent text-sm text-tinta outline-none placeholder:text-tinta/50"
            />
          </label>
        </div>

        {grupos.length === 0 ? (
          <p className="font-display py-8 text-center text-base italic text-tinta/65">
            {texto ? "Nadie coincide con lo que buscas." : enTerminales ? "Ninguna tienda tiene una terminal todavía." : "Todavía no hay nadie en el equipo."}
          </p>
        ) : (
          <div className="space-y-5">
            {/* Los títulos de las columnas, una vez arriba (Felipe 2026-10-05: «no hay título», y la fecha no decía qué era). */}
            <div aria-hidden className={`${COLUMNAS} border-b border-sand px-2.5 pb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-taupe-profundo`}>
              <span className="col-span-2">{enTerminales ? "Terminal" : "Persona"}</span>
              <span>Rol</span>
              <span className="hidden sm:block">Último ingreso</span>
              <span className="hidden lg:block">Estado</span>
            </div>
            {grupos.map((g) => (
              <section key={g.clave} aria-label={g.nombre}>
                <h3 className="font-display flex flex-wrap items-baseline gap-x-2.5 px-2.5 text-[21px] leading-tight text-tinta">
                  {g.nombre}
                  <span className="font-sans text-[13px] text-tinta/60">
                    {[g.personas > 0 || g.terminales === 0 ? plural(g.personas, "persona", "personas") : null, g.terminales > 0 ? plural(g.terminales, "terminal", "terminales") : null]
                      .filter(Boolean)
                      .join(" · ")}
                    {g.deTurno > 0 && ` · ${g.deTurno} de turno hoy`}
                  </span>
                </h3>
                <ul className="mt-1.5">
                  {g.miembros.map((m) => (
                    <FilaMiembro
                      key={`${m.tipo}:${m.id}`}
                      m={m}
                      elegido={m.id === elegidoId}
                      ahoraIso={ahoraIso}
                      onTocar={() => (m.tipo === "persona" ? onAbrir(m.id) : onAbrirTerminal(m.id))}
                    />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
