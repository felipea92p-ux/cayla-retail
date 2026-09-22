"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  Colaborador,
  ColaboradorInactivo,
  ColaboradorPendiente,
  ColaboradorSuspendido,
  DynamicDisponible,
  EventoAcceso,
} from "@/lib/colaboradores";
import { accionesSupabase, type AccionesColaboradores, type ResultadoAccion } from "@/lib/colaboradores-acciones";
import { filtrarColaboradores, plural, resumirAccesos, type AccionFila, type FiltroRol } from "@/lib/colaboradores-reglas";
import type { Ubicacion } from "@/lib/ubicaciones";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { Boton } from "@/components/ui/campos";
import { SegmentoDeslizante } from "@/components/ui/SegmentoDeslizante";
import { TabsSubrayado } from "@/components/ui/TabsSubrayado";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { AgregarColaboradoresModal, AgregarTerminalModal, CambiarUbicacionModal, QuitarAccesoModal, SuspenderModal } from "@/components/ColaboradoresModales";
import { ListaActividad, TablaActivos, TablaInactivas, TablaPendientes, TablaSuspendidos, TablaTerminales } from "@/components/ColaboradoresTablas";

// «Terminales» separada de «Activos» (pedido de Felipe, 2026-09-22): una cuenta terminal no es una persona real y
// mezclarla en la misma tabla que líderes/colaboradores generaba confusión. Vive en su propia pestaña, entre Activos
// (a quién le toca primero) y Pendientes (D-70) — mismos datos de `fn_colaboradores()`, solo separados en la pantalla.
type Pestana = "activos" | "terminales" | "pendientes" | "suspendidos" | "inactivas" | "actividad";

type Modal =
  | { tipo: "agregar" }
  | { tipo: "terminal" }
  | { tipo: "suspender"; persona: Colaborador }
  | { tipo: "ubicacion"; persona: Colaborador }
  | { tipo: "quitar"; persona: { persona_id: string; nombre: string }; suspendida: boolean; pendiente?: boolean };

const entrada =
  "card-cayla w-full px-3 py-2 text-sm text-tinta outline-none placeholder:text-tinta/55 focus:border-rojo sm:w-80";

function Vacio({ children }: { children: React.ReactNode }) {
  return <p className="font-display card-cayla py-8 text-center text-base italic text-tinta/65">{children}</p>;
}

// Colaboradores: quién puede entrar a retail hoy. Retail nunca crea gente nueva acá — Dynamic ya es dueño de esa
// identidad (0009_integracion_dynamic.sql) — solo decide a cuáles cuentas YA existentes en Dynamic les da acceso
// (0013_colaboradores_autorizados.sql). Suspender la saca de la puerta sin borrarla; Quitar es la baja definitiva
// (20260922110000_colaboradores_suspender_y_actividad.sql, ADR-0148).
// `acciones` y `alActualizar` existen para poder mostrar la pantalla con datos de ejemplo: por defecto escriben en
// la base y recargan los datos del servidor.
export function ColaboradoresPanel({
  colaboradores,
  pendientes,
  suspendidos,
  inactivos,
  actividad,
  disponibles,
  ubicaciones,
  acciones = accionesSupabase,
  alActualizar,
}: {
  colaboradores: Colaborador[];
  pendientes: ColaboradorPendiente[];
  suspendidos: ColaboradorSuspendido[];
  inactivos: ColaboradorInactivo[];
  actividad: EventoAcceso[];
  disponibles: DynamicDisponible[];
  ubicaciones: Ubicacion[];
  acciones?: AccionesColaboradores;
  alActualizar?: () => void;
}) {
  const router = useRouter();
  const [pestana, setPestana] = useState<Pestana>("activos");
  const [busqueda, setBusqueda] = useState("");
  const [rol, setRol] = useState<FiltroRol>("todos");
  const [modal, setModal] = useState<Modal | null>(null);
  const [ocupadoId, setOcupadoId] = useState<string | null>(null);

  // Separadas UNA vez acá: el resto del panel (KPIs, buscador, pestaña Activos) trabaja solo con personas reales;
  // «Terminales» es la única pestaña que lee `terminales`. Los datos son los mismos `fn_colaboradores()`, no una
  // lectura aparte — separar es cosa de la pantalla, no de la base (ver ADR-0160).
  const colaboradoresReales = useMemo(() => colaboradores.filter((c) => !c.terminal), [colaboradores]);
  const terminales = useMemo(() => colaboradores.filter((c) => c.terminal), [colaboradores]);
  const resumen = useMemo(() => resumirAccesos(colaboradores, suspendidos, disponibles), [colaboradores, suspendidos, disponibles]);
  const filas = useMemo(() => filtrarColaboradores(colaboradoresReales, busqueda, rol), [colaboradoresReales, busqueda, rol]);
  const totalActividad = actividad[0]?.total ?? 0;

  async function ejecutar(idOcupado: string | null, verbo: string, llamada: () => Promise<ResultadoAccion>, exito: string, detalle?: string) {
    setOcupadoId(idOcupado);
    const { error } = await llamada();
    setOcupadoId(null);
    if (error) {
      avisar.error(traducirError(error, verbo));
      return false;
    }
    avisar.exito(exito, detalle ? { detalle } : undefined);
    (alActualizar ?? (() => router.refresh()))();
    return true;
  }

  function alElegirAccion(c: Colaborador, accion: AccionFila) {
    if (accion === "cambiar_ubicacion") setModal({ tipo: "ubicacion", persona: c });
    else if (accion === "suspender") setModal({ tipo: "suspender", persona: c });
    else setModal({ tipo: "quitar", persona: c, suspendida: false });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="label-cayla text-[11px] text-tinta/65">Retail</p>
          <h1 className="font-display mt-1 text-3xl text-tinta">Colaboradores</h1>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-tinta/70">
            Quién puede entrar a retail hoy. Las personas se dan de alta en Dynamic — acá solo se decide a quién de Dynamic se le abre la puerta de retail, y a
            qué ubicación queda fijo si entra como Colaborador.
          </p>
        </div>
        <div className="text-right">
          <div className="flex flex-wrap justify-end gap-2">
            <Boton peso="fantasma" onClick={() => setModal({ tipo: "terminal" })} disabled={disponibles.length === 0}>
              + Agregar terminal
            </Boton>
            <Boton peso="primario" onClick={() => setModal({ tipo: "agregar" })} disabled={disponibles.length === 0}>
              + Agregar colaboradores
            </Boton>
          </div>
          {disponibles.length === 0 && <p className="mt-1 text-xs text-tinta/65">Todas las cuentas activas de Dynamic ya tienen acceso.</p>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <TarjetaCifra compacta punto="verde" etiqueta="Con acceso" valor={resumen.conAcceso} className="anim-entra" style={{ ["--i" as string]: 0 }}>
          de {plural(resumen.cuentasDynamic, "cuenta activa", "cuentas activas")} en Dynamic
        </TarjetaCifra>
        <TarjetaCifra compacta punto="neutro" etiqueta="Líderes" valor={resumen.lideres} className="anim-entra" style={{ ["--i" as string]: 1 }}>
          operan en cualquier ubicación
        </TarjetaCifra>
        <TarjetaCifra compacta punto="neutro" etiqueta="Colaboradores" valor={resumen.colaboradores} className="anim-entra" style={{ ["--i" as string]: 2 }}>
          fijos a una ubicación
        </TarjetaCifra>
        <TarjetaCifra
          compacta
          punto={resumen.suspendidos > 0 ? "ambar" : "verde"}
          etiqueta="Suspendidos"
          valor={resumen.suspendidos}
          className="anim-entra"
          style={{ ["--i" as string]: 3 }}
        >
          {resumen.suspendidos > 0 ? "sin acceso hasta reactivarlos" : "nadie suspendido"}
        </TarjetaCifra>
      </div>

      <TabsSubrayado
        etiqueta="Secciones de colaboradores"
        valor={pestana}
        onCambio={(k) => setPestana(k as Pestana)}
        className="border-b border-tinta/10"
        clasePestana="px-1 py-3 text-sm"
        items={[
          { clave: "activos", etiqueta: "Activos", conteo: colaboradoresReales.length },
          { clave: "terminales", etiqueta: "Terminales", conteo: terminales.length },
          { clave: "pendientes", etiqueta: "Pendientes", conteo: pendientes.length, tono: pendientes.length > 0 ? "ambar" : undefined },
          { clave: "suspendidos", etiqueta: "Suspendidos", conteo: suspendidos.length, tono: suspendidos.length > 0 ? "ambar" : undefined },
          { clave: "inactivas", etiqueta: "Inactivas en Dynamic", conteo: inactivos.length },
          { clave: "actividad", etiqueta: "Actividad", conteo: totalActividad },
        ]}
      />

      {pestana === "activos" && (
        <section aria-label="Colaboradores activos" className="space-y-4">
          {colaboradoresReales.length === 0 ? (
            <Vacio>Nadie tiene acceso a retail todavía.</Vacio>
          ) : (
            <>
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                <input
                  type="search"
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Buscar por nombre o correo…"
                  aria-label="Buscar colaborador por nombre o correo"
                  className={entrada}
                  autoComplete="off"
                />
                <SegmentoDeslizante
                  etiqueta="Filtrar por rol"
                  valor={rol}
                  onCambio={(k) => setRol(k as FiltroRol)}
                  opciones={[
                    { clave: "todos", etiqueta: "Todos", conteo: colaboradoresReales.length },
                    { clave: "lider", etiqueta: "Líderes", conteo: resumen.lideres },
                    { clave: "colaborador", etiqueta: "Colaboradores", conteo: resumen.colaboradores },
                  ]}
                />
              </div>
              {filas.length === 0 ? (
                <Vacio>Nadie coincide con lo que buscas.</Vacio>
              ) : (
                <TablaActivos filas={filas} ocupadoId={ocupadoId} onAccion={alElegirAccion} />
              )}
              <p className="text-xs text-tinta/65" role="status">
                {filas.length === colaboradoresReales.length
                  ? plural(filas.length, "persona con acceso", "personas con acceso")
                  : `${filas.length} de ${plural(colaboradoresReales.length, "persona", "personas")}`}
              </p>
            </>
          )}
        </section>
      )}

      {pestana === "terminales" && (
        <section aria-label="Cuentas terminal" className="space-y-3">
          {terminales.length === 0 ? (
            <Vacio>Ninguna tienda tiene una terminal todavía.</Vacio>
          ) : (
            <>
              <p className="text-sm text-tinta/70">
                Cuentas compartidas por el equipo de una tienda (ADR-0160), no personas — por eso viven aparte de Activos. La de ventas cobra, cierra caja y
                factura; la administrativa ajusta inventario, escribe en el catálogo y edita las cuentas de proveedores.
              </p>
              <TablaTerminales filas={terminales} ocupadoId={ocupadoId} onAccion={alElegirAccion} />
            </>
          )}
        </section>
      )}

      {pestana === "pendientes" && (
        <section aria-label="Altas pendientes de aprobación" className="space-y-3">
          {pendientes.length === 0 ? (
            <Vacio>No hay altas esperando aprobación.</Vacio>
          ) : (
            <>
              <p className="text-sm text-tinta/70">
                Un líder propuso el alta de estas personas (D-70): todavía no pueden vender, abrir caja ni mover stock hasta que alguien —el mismo líder u otro— la apruebe.
              </p>
              <TablaPendientes
                filas={pendientes}
                ocupadoId={ocupadoId}
                onAprobar={(c) =>
                  ejecutar(c.persona_id, "aprobar el alta", () => acciones.aprobar(c.persona_id), `${c.nombre} ya puede entrar a retail`)
                }
                onRechazar={(c) => setModal({ tipo: "quitar", persona: c, suspendida: false, pendiente: true })}
              />
            </>
          )}
        </section>
      )}

      {pestana === "suspendidos" && (
        <section aria-label="Colaboradores suspendidos" className="space-y-3">
          {suspendidos.length === 0 ? (
            <Vacio>Nadie está suspendido.</Vacio>
          ) : (
            <>
              <p className="text-sm text-tinta/70">No pueden entrar a retail ni operar ventas o caja hasta que las reactives. Conservan su ubicación y su historial.</p>
              <TablaSuspendidos
                filas={suspendidos}
                ocupadoId={ocupadoId}
                onReactivar={(c) =>
                  ejecutar(c.persona_id, "reactivar el acceso", () => acciones.reactivar(c.persona_id), `${c.nombre} ya tiene acceso otra vez`)
                }
                onQuitar={(c) => setModal({ tipo: "quitar", persona: c, suspendida: true })}
              />
            </>
          )}
        </section>
      )}

      {pestana === "inactivas" && (
        <section aria-label="Cuentas inactivas en Dynamic" className="space-y-3">
          {inactivos.length === 0 ? (
            <Vacio>Ninguna cuenta con acceso está inactiva en Dynamic.</Vacio>
          ) : (
            <>
              <p className="text-sm text-tinta/70">
                Personas que tenían acceso y Dynamic dio de baja: ya no pueden entrar. Solo lectura — si vuelven a estar activas en Dynamic, recuperan su acceso solas.
              </p>
              <TablaInactivas filas={inactivos} />
            </>
          )}
        </section>
      )}

      {pestana === "actividad" && (
        <section aria-label="Actividad de accesos">
          {actividad.length === 0 ? <Vacio>Todavía no hay movimientos de acceso.</Vacio> : <ListaActividad eventos={actividad} />}
        </section>
      )}

      {modal?.tipo === "agregar" && (
        <AgregarColaboradoresModal
          disponibles={disponibles}
          ubicaciones={ubicaciones}
          onClose={() => setModal(null)}
          onConfirmar={(personas, ubicacionId) =>
            ejecutar(null, "agregar a los colaboradores", () => acciones.agregar(personas, ubicacionId), `${plural(personas.length, "persona queda pendiente de aprobación", "personas quedan pendientes de aprobación")} — un líder debe aprobarlas antes de que puedan operar`)
          }
        />
      )}
      {modal?.tipo === "terminal" && (
        <AgregarTerminalModal
          disponibles={disponibles}
          tiendas={ubicaciones.filter((u) => u.tipo === "tienda" && u.activo)}
          ocupadas={new Set(terminales.filter((c) => c.ubicacion_id).map((c) => `${c.ubicacion_id}|${c.terminal}`))}
          onClose={() => setModal(null)}
          onConfirmar={(personaId, ubicacionId, tipo) =>
            ejecutar(null, "agregar la terminal", () => acciones.agregarTerminal(personaId, ubicacionId, tipo), "Terminal agregada", `Ya puede entrar a retail como ${tipo === "ventas" ? "terminal de ventas" : "terminal administrativa"}.`)
          }
        />
      )}
      {modal?.tipo === "suspender" && (
        <SuspenderModal
          nombre={modal.persona.nombre}
          onClose={() => setModal(null)}
          onConfirmar={(motivo) =>
            ejecutar(modal.persona.persona_id, "suspender el acceso", () => acciones.suspender(modal.persona.persona_id, motivo), "Acceso suspendido", `${modal.persona.nombre} pasó a Suspendidos.`)
          }
        />
      )}
      {modal?.tipo === "ubicacion" && (
        <CambiarUbicacionModal
          nombre={modal.persona.nombre}
          ubicacionActualId={modal.persona.ubicacion_id}
          ubicaciones={ubicaciones}
          onClose={() => setModal(null)}
          onConfirmar={(ubicacionId) =>
            ejecutar(modal.persona.persona_id, "cambiar la ubicación", () => acciones.cambiarUbicacion(modal.persona.persona_id, ubicacionId), "Ubicación actualizada", `${modal.persona.nombre} quedó en ${ubicaciones.find((u) => u.id === ubicacionId)?.nombre ?? "la nueva ubicación"}.`)
          }
        />
      )}
      {modal?.tipo === "quitar" && (
        <QuitarAccesoModal
          nombre={modal.persona.nombre}
          suspendida={modal.suspendida}
          pendiente={modal.pendiente}
          onClose={() => setModal(null)}
          onConfirmar={() =>
            ejecutar(
              modal.persona.persona_id,
              modal.pendiente ? "rechazar el alta" : "quitar el acceso",
              () => acciones.quitar(modal.persona.persona_id),
              modal.pendiente ? "Alta rechazada" : "Acceso quitado",
              modal.pendiente ? "La propuesta de alta se descartó." : "La persona ya no puede entrar al sistema de retail."
            )
          }
        />
      )}
    </div>
  );
}
