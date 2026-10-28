"use client";

import { useMemo, useState } from "react";
import { Check, LayoutGrid, List, MonitorSmartphone, SearchX, Users, X } from "lucide-react";
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
import { Boton } from "@/components/ui/campos";
import { Buscador } from "@/components/ui/Buscador";
import { SegmentoDeslizante } from "@/components/ui/SegmentoDeslizante";
import { Vacio } from "@/components/ui/Vacio";
import { TituloSeccion } from "@/components/ui/TituloSeccion";

// Colaboradores ▸ Equipo (propuesta de Felipe del 2026-10-05): UNA lista agrupada por sede, como se piensa el negocio
// («el equipo de Trujillo»). El estado (suspendido, baja en Dynamic) es una marca sobre la persona, no una pestaña. Arriba,
// «Esperan tu ok» solo si hay altas por aprobar. Tocar una persona abre su ficha; tocar una terminal, la suya (`FichaTerminal`). Con el atajo «Terminales» la lista es la misma, solo con ellas.

/** El rol: el único rótulo de acceso. El Líder, en tinta. Un nombre largo («Prueba del tema: ventas y stock») no se sale de su
 *  columna: se corta con «…» y el nombre completo queda en el `title`. Es `inline-block` y no `inline-flex` porque el texto
 *  solo se corta con puntos suspensivos dentro de un bloque. */
export function PildoraRol({ nombre, lider }: { nombre: string; lider: boolean }) {
  return (
    <span
      title={nombre}
      className={`inline-block max-w-full truncate rounded-full px-2.5 py-0.5 text-xs font-semibold ${lider ? "bg-tinta text-crema" : "bg-hueso text-tinta"}`}
    >
      {nombre}
    </span>
  );
}

/** Su foto de Dynamic (o sus iniciales) y, si está de turno hoy, el punto verde. */
export function CaraPersona({ p, grande = false }: { p: Pick<PersonaEquipo, "id" | "nombre" | "deTurno" | "estado">; grande?: boolean }) {
  return (
    <AvatarPersona personaId={p.id} nombre={p.nombre} tamano={grande ? 80 : 40} deTurno={p.deTurno && p.estado === "activa"} />
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
  "grid grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-x-3.5 sm:grid-cols-[36px_minmax(0,1fr)_10rem_7.5rem] lg:grid-cols-[36px_minmax(14rem,22rem)_11rem_8rem_minmax(0,1fr)]";

/** El estado en una palabra: lo que pide atención o lo que está pasando hoy. Nada si está activa y sin turno. */
function EstadoMiembro({ m }: { m: MiembroEquipo }) {
  if (m.tipo === "terminal") return m.activo ? null : <Chip tono="apagado" tachado={false}>Desactivada</Chip>;
  if (m.estado !== "activa") return <EstadoPersona p={m} />;
  if (m.deTurno) return <Chip tono="verde" versalitas={false} title="De turno hoy">Turno</Chip>;
  return null;
}

/** El nombre con sus marcas (tú, Admin): lo comparten la fila y la tarjeta. */
function NombreMiembro({ m }: { m: MiembroEquipo }) {
  return (
    <>
      <span className="truncate" data-guia="colaboradores.nombre">{m.nombre}</span>
      {m.tipo === "persona" && m.esYo && <span className="text-xs font-normal text-tinta/60">(tú)</span>}
      {m.tipo === "persona" && m.esAdmin && <span className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-taupe">Admin</span>}
    </>
  );
}

const estaApagado = (m: MiembroEquipo) => (m.tipo === "persona" ? m.estado !== "activa" : !m.activo);

/** La cara de la lista: la foto de la persona o el ícono de la terminal. */
function CaraMiembro({ m }: { m: MiembroEquipo }) {
  return m.tipo === "persona" ? (
    <CaraPersona p={m} />
  ) : (
    <span className="grid h-9 w-9 place-items-center rounded-[10px] bg-tinta text-crema">
      <IconoAparato className="h-5 w-5" />
    </span>
  );
}

// Una línea por persona (Felipe 2026-10-27, «compacto»): el correo vive en la ficha, no en la fila.
function FilaMiembro({
  m,
  elegido,
  ahoraIso,
  onTocar,
  guia,
}: {
  m: MiembroEquipo;
  elegido: boolean;
  ahoraIso: string;
  onTocar: () => void;
  /** Ancla de la guía interactiva (ADR-0389): solo la primera persona que no eres tú ni un líder, y la primera terminal. */
  guia?: string;
}) {
  const apagado = estaApagado(m);
  return (
    <li>
      <button
        type="button"
        onClick={onTocar}
        aria-current={elegido ? "true" : undefined}
        data-guia={guia}
        className={`${COLUMNAS} min-h-11 w-full rounded-xl px-2.5 py-1 text-left transition-colors duration-150 ease-cayla ${
          elegido ? "bg-hueso" : "hover:bg-hueso/60"
        }`}
      >
        <span className={apagado ? "opacity-60" : ""}>
          <CaraMiembro m={m} />
        </span>
        <span className={`flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[14.5px] font-semibold leading-tight ${apagado ? "text-tinta/60" : "text-tinta"}`}>
          <NombreMiembro m={m} />
          {/* Bajo 1024 px el estado va junto al nombre; desde ahí, en su columna. */}
          {apagado && (
            <span className="lg:hidden">
              <EstadoMiembro m={m} />
            </span>
          )}
        </span>
        <span className={`flex min-w-0 max-w-[9.5rem] sm:max-w-none ${apagado ? "opacity-70" : ""}`}>
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

/** La misma persona como tarjeta (vista «Mosaico»): cara, nombre, rol y estado. */
function TarjetaMiembro({ m, elegido, onTocar, guia }: { m: MiembroEquipo; elegido: boolean; onTocar: () => void; guia?: string }) {
  const apagado = estaApagado(m);
  return (
    <li>
      <button
        type="button"
        onClick={onTocar}
        aria-current={elegido ? "true" : undefined}
        data-guia={guia}
        className={`grid w-full grid-cols-[40px_minmax(0,1fr)] items-center gap-x-3 gap-y-1 rounded-xl border p-2.5 text-left transition-colors duration-150 ease-cayla ${
          elegido ? "border-tinta bg-hueso" : "border-sand hover:border-borde-control"
        } ${apagado ? "opacity-70" : ""}`}
      >
        <span className="row-span-2">
          <CaraMiembro m={m} />
        </span>
        <span className="flex min-w-0 items-center gap-x-2 text-[14.5px] font-semibold leading-tight text-tinta">
          <NombreMiembro m={m} />
        </span>
        <span className="flex min-w-0 flex-wrap items-center gap-1.5">
          <PildoraRol nombre={m.rolNombre} lider={m.tipo === "persona" && m.nivel === "lider"} />
          <EstadoMiembro m={m} />
        </span>
      </button>
    </li>
  );
}

/** Las altas que esperan el ok de un líder (D-70): una franja, una píldora por persona con ✓ y ✕. «✕» pregunta una vez. */
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
    <section aria-label="Altas que esperan aprobación" className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl bg-ambar/10 px-3.5 py-2" data-guia="colaboradores.esperan-ok">
      <h2 className="w-full text-[11.5px] font-bold uppercase tracking-[0.1em] text-ambar-profundo sm:w-auto">Esperan tu ok · {pendientes.length}</h2>
      <ul className="flex w-full min-w-0 flex-wrap items-center gap-2 sm:w-auto sm:flex-1">
        {pendientes.map((p) => (
          <li
            key={p.persona_id}
            title={`Lo pidió ${p.propuesto_por ?? "un líder"} · ${fechaLima(p.propuesto_en)}`}
            className={`flex max-w-full items-center justify-between gap-2 rounded-full bg-papel py-1 pl-3 pr-1 text-[13px] text-tinta ${ocupadoId === p.persona_id ? "opacity-50" : ""}`}
          >
            <strong className="truncate font-semibold">{p.nombre}</strong>
            <span className="shrink-0 text-tinta/60">→ {p.ubicacion_asignada ?? "retail"}</span>
            {preguntando === p.persona_id ? (
              <span className="flex items-center gap-1.5 pr-1.5 text-[12.5px]">
                ¿Rechazar?
                <button type="button" className="btn-cayla btn-chico btn-peligro" onClick={() => { setPreguntando(null); onRechazar(p); }}>
                  Sí
                </button>
                <button type="button" className="btn-cayla btn-chico btn-sutil" onClick={() => setPreguntando(null)}>
                  No
                </button>
              </span>
            ) : (
              <span className="flex items-center gap-1">
                <button
                  type="button"
                  className="btn-cayla btn-chico btn-primario"
                  aria-label={`Aprobar a ${p.nombre}`}
                  title="Aprobar"
                  disabled={ocupadoId !== null || !responsable.listo}
                  onClick={() => onAprobar(p)}
                >
                  <Check aria-hidden className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  className="btn-cayla btn-chico btn-sutil"
                  aria-label={`Rechazar el alta de ${p.nombre}`}
                  title="Rechazar"
                  disabled={ocupadoId !== null}
                  onClick={() => setPreguntando(p.persona_id)}
                >
                  <X aria-hidden className="h-4 w-4" />
                </button>
              </span>
            )}
          </li>
        ))}
      </ul>
      <ComboResponsable control={responsable} compacto deshabilitado={ocupadoId !== null} className="w-full max-w-[16rem]" />
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
  const [vista, setVista] = useState<"lista" | "mosaico">("lista");
  const atajos = useMemo(() => atajosEquipo(miembros, ubicaciones, conTerminales), [miembros, ubicaciones, conTerminales]);
  const grupos = useMemo(() => agruparPorSede(miembros, ubicaciones, filtro, texto), [miembros, ubicaciones, filtro, texto]);
  // La guía interactiva (ADR-0389) abre la ficha de alguien que no eres tú ni un líder (así se ven sus acciones) y la de una terminal.
  const enOrden = grupos.flatMap((g) => g.miembros);
  const guiaPersona = enOrden.find((m) => m.tipo === "persona" && !m.esYo && m.nivel !== "lider")?.id;
  const guiaTerminal = enOrden.find((m) => m.tipo === "terminal")?.id;
  const enTerminales = filtro === "terminales";

  return (
    <div className="space-y-4">
      {pendientes.length > 0 && (
        <EsperanTuOk pendientes={pendientes} ocupadoId={ocupadoId} responsable={responsable} onAprobar={onAprobar} onRechazar={onRechazar} />
      )}

      <div className="card-cayla space-y-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-3">
          <div role="group" aria-label="Ver" className="flex min-w-0 flex-1 flex-wrap gap-1.5" data-guia="colaboradores.atajos">
            {atajos.map((a) => (
              <button
                key={a.clave}
                type="button"
                className="pildora-cayla"
                aria-pressed={mismoFiltro(filtro, a.filtro)}
                onClick={() => onFiltro(a.filtro)}
                data-guia={a.clave === "terminales" ? "colaboradores.atajo-terminales" : a.clave === "todas" ? "colaboradores.atajo-todas" : undefined}
              >
                {a.clave === "turno" && <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-verde" />}
                {a.etiqueta} <span className="pildora-cayla__n">{a.n}</span>
              </button>
            ))}
          </div>
          {enTerminales && onNuevaTerminal && (
            <Boton type="button" peso="primario" onClick={onNuevaTerminal} data-guia="colaboradores.nueva-terminal">
              + Nueva terminal
            </Boton>
          )}
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <Buscador guia="colaboradores.buscador"
              valor={texto}
              onCambio={setTexto}
              placeholder="Buscar"
              etiqueta="Buscar persona o terminal por nombre, correo o rol"
              atajo
              className="min-w-0 flex-1 sm:w-60 sm:flex-none"
            />
            <SegmentoDeslizante
              forma="modo"
              etiqueta="Vista"
              valor={vista}
              onCambio={(v) => setVista(v === "mosaico" ? "mosaico" : "lista")}
              opciones={[
                { clave: "lista", etiqueta: "Lista", icono: <List aria-hidden className="h-4 w-4" />, soloIcono: true },
                { clave: "mosaico", etiqueta: "Mosaico", icono: <LayoutGrid aria-hidden className="h-4 w-4" />, soloIcono: true },
              ]}
            />
          </div>
        </div>

        {grupos.length === 0 ? (
          texto ? (
            <Vacio
              icono={<SearchX />}
              titulo={<>Nada coincide con «{texto}»</>}
              acciones={
                <Boton type="button" peso="fantasma" onClick={() => setTexto("")}>
                  Borrar la búsqueda
                </Boton>
              }
            >
              Nadie coincide con lo que buscas. Prueba con otro nombre, correo o rol.
            </Vacio>
          ) : enTerminales ? (
            <Vacio icono={<MonitorSmartphone />}>Ninguna tienda tiene una terminal todavía.</Vacio>
          ) : (
            <Vacio icono={<Users />}>Todavía no hay nadie en el equipo.</Vacio>
          )

        ) : (
          <div className="space-y-5" data-guia="colaboradores.lista">
            {/* Los títulos de las columnas, una vez arriba (Felipe 2026-10-05: «no hay título», y la fecha no decía qué era). */}
            {vista === "lista" && (
              <div aria-hidden className={`${COLUMNAS} max-sm:hidden border-b border-sand px-2.5 pb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-taupe-profundo`}>
                <span className="col-span-2">{enTerminales ? "Terminal" : "Persona"}</span>
                <span>Rol</span>
                <span className="hidden sm:block">Último ingreso</span>
                <span className="hidden lg:block">Estado</span>
              </div>
            )}
            {grupos.map((g) => (
              <section key={g.clave} aria-label={g.nombre}>
                <TituloSeccion
                  nivel={3}
                  className="px-2.5"
                  dato={
                    <>
                      {[g.personas > 0 || g.terminales === 0 ? plural(g.personas, "persona", "personas") : null, g.terminales > 0 ? plural(g.terminales, "terminal", "terminales") : null]
                        .filter(Boolean)
                        .join(" · ")}
                      {g.deTurno > 0 && ` · ${g.deTurno} de turno hoy`}
                    </>
                  }
                >
                  {g.nombre}
                </TituloSeccion>
                <ul className={vista === "lista" ? "mt-1.5" : "mt-2 grid grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-2"}>
                  {g.miembros.map((m) => {
                    const alTocar = () => (m.tipo === "persona" ? onAbrir(m.id) : onAbrirTerminal(m.id));
                    return vista === "lista" ? (
                      <FilaMiembro key={`${m.tipo}:${m.id}`} m={m} elegido={m.id === elegidoId} ahoraIso={ahoraIso} onTocar={alTocar} guia={m.id === guiaPersona ? "colaboradores.fila-otra" : m.id === guiaTerminal ? "colaboradores.fila-terminal" : undefined} />
                    ) : (
                      <TarjetaMiembro key={`${m.tipo}:${m.id}`} m={m} elegido={m.id === elegidoId} onTocar={alTocar} guia={m.id === guiaPersona ? "colaboradores.fila-otra" : m.id === guiaTerminal ? "colaboradores.fila-terminal" : undefined} />
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
