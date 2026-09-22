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
  Terminal,
} from "@/lib/colaboradores";
import { accionesSupabase, type AccionesColaboradores, type ResultadoAccion } from "@/lib/colaboradores-acciones";
import {
  avisoTerminal,
  filtrarColaboradores,
  plural,
  porAtender,
  resumirAccesos,
  vistaDe,
  type AccionFila,
  type EstadoCuenta,
  type FiltroRol,
  type SeccionColaboradores,
  type TipoCuenta,
  type VistaColaboradores,
} from "@/lib/colaboradores-reglas";
import type { Ubicacion } from "@/lib/ubicaciones";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { Boton } from "@/components/ui/campos";
import { SegmentoDeslizante } from "@/components/ui/SegmentoDeslizante";
import { Modal } from "@/components/ui/Modal";
import { Check, History } from "lucide-react";
import { AgregarColaboradoresModal, AlternarTerminalModal, CambiarUbicacionModal, QuitarAccesoModal, SuspenderModal } from "@/components/ColaboradoresModales";
import { AsignarRolModal } from "@/components/RolesModales";
import { accionesRolesSupabase, type AccionesRoles } from "@/lib/roles-acciones";
import { avisoDelRol, cuentasDelRol, rolesAsignables, type CuentaConRol, type RolVista } from "@/lib/roles-reglas";
import { RolesPanel } from "@/components/RolesPanel";
import { ListaActividad, TablaActivos, TablaInactivas, TablaPendientes, TablaSuspendidos } from "@/components/ColaboradoresTablas";
import { TerminalesPanel, type AccionesTerminales } from "@/components/TerminalesPanel";

// «Terminales» (ADR-0162): aparatos de cada tienda con cuenta propia y SIN persona — ya no salen de `fn_colaboradores()`
// sino de `fn_terminales()`. La pestaña entera vive en `TerminalesPanel` (crear, cambiar clave; sin tipo desde el
// 2026-09-22); aquí quedan Desactivar/Reactivar y Cambiar rol, que comparten modales con el resto de la pantalla.
// Desde el spike `docs/maquetas/colaboradores-ux-spike-2026-09/` (Felipe, 2026-09-22) la pantalla tiene DOS secciones:
// «Cuentas» (personas o terminales; las personas filtradas por estado) y «Roles y accesos». Arriba de Cuentas, «Por
// atender» solo cuando algo pide acción. Actividad se abre en un modal. `?pestana=` de antes sigue funcionando (`vistaDe`).

const ESTADOS: { clave: EstadoCuenta; etiqueta: string; punto: string }[] = [
  { clave: "activas", etiqueta: "Activas", punto: "bg-verde" },
  { clave: "pendientes", etiqueta: "Por aprobar", punto: "bg-ambar" },
  { clave: "suspendidas", etiqueta: "Suspendidas", punto: "bg-rojo-profundo" },
  { clave: "inactivas", etiqueta: "Inactivas en Dynamic", punto: "bg-taupe" },
];

/** Una de las dos secciones: título y, debajo, su resumen (con lo que pide atención en ámbar). */
function BotonSeccion({ activa, onClick, titulo, children }: { activa: boolean; onClick: () => void; titulo: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={activa}
      onClick={onClick}
      className={`rounded-xl border px-4 py-3 text-left transition-[background-color,border-color,box-shadow] duration-200 ease-cayla ${
        activa ? "border-taupe bg-papel shadow-[inset_0_-2px_0_var(--color-rojo)]" : "border-tinta/10 hover:border-tinta/30 hover:bg-papel/60"
      }`}
    >
      <span className="block text-[15px] font-semibold text-tinta">{titulo}</span>
      <span className="mt-0.5 block text-[12.5px] text-tinta/65">{children}</span>
    </button>
  );
}

type Modal =
  | { tipo: "agregar" }
  | { tipo: "terminal"; terminal: Terminal }
  | { tipo: "suspender"; persona: Colaborador }
  | { tipo: "ubicacion"; persona: Colaborador }
  | { tipo: "quitar"; persona: { persona_id: string; nombre: string }; suspendida: boolean; pendiente?: boolean }
  | { tipo: "rol"; cuenta: CuentaConRol };

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
  terminales,
  roles = null,
  cuentas = null,
  vistaInicial = vistaDe(undefined),
  acciones = accionesSupabase,
  accionesRoles = accionesRolesSupabase,
  accionesTerminales,
  alActualizar,
}: {
  colaboradores: Colaborador[];
  pendientes: ColaboradorPendiente[];
  suspendidos: ColaboradorSuspendido[];
  inactivos: ColaboradorInactivo[];
  actividad: EventoAcceso[];
  disponibles: DynamicDisponible[];
  ubicaciones: Ubicacion[];
  /** `null` = no se pudieron leer (p. ej. la base aún no tiene la migración del ADR-0162); el resto de la pantalla sigue. */
  terminales: Terminal[] | null;
  /** ADR-0161 B: los roles y las cuentas con su rol. `null` = no se pudieron leer (o la base aún no tiene la migración):
   *  la pantalla sigue, sin la columna del rol ni «Cambiar rol». */
  roles?: RolVista[] | null;
  cuentas?: CuentaConRol[] | null;
  /** Sección y filtros con que abre (`?pestana=` de siempre, ver `vistaDe`). */
  vistaInicial?: VistaColaboradores;
  acciones?: AccionesColaboradores;
  accionesRoles?: AccionesRoles;
  /** Crear terminal y cambiar su clave. Por defecto, las Server Actions de `app/actions/terminales.ts`. */
  accionesTerminales?: AccionesTerminales;
  alActualizar?: () => void;
}) {
  const router = useRouter();
  const [seccion, setSeccion] = useState<SeccionColaboradores>(vistaInicial.seccion);
  const [tipo, setTipo] = useState<TipoCuenta>(vistaInicial.tipo);
  const [estado, setEstado] = useState<EstadoCuenta>(vistaInicial.estado);
  const [verActividad, setVerActividad] = useState(vistaInicial.actividad);
  const [rolElegidoId, setRolElegidoId] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [rol, setRol] = useState<FiltroRol>("todos");
  const [modal, setModal] = useState<Modal | null>(null);
  const [ocupadoId, setOcupadoId] = useState<string | null>(null);

  const resumen = useMemo(() => resumirAccesos(colaboradores, suspendidos, disponibles), [colaboradores, suspendidos, disponibles]);
  const filas = useMemo(() => filtrarColaboradores(colaboradores, busqueda, rol), [colaboradores, busqueda, rol]);

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

  const nombreDeRol = (id: string) => roles?.find((r) => r.id === id)?.nombre ?? null;
  const rolDe = roles && cuentas ? (id: string) => {
    const c = cuentas.find((x) => x.id === id);
    return c ? nombreDeRol(c.rolId) : null;
  } : undefined;
  function abrirCambioDeRol(tipo: "persona" | "terminal", id: string) {
    const cuenta = cuentas?.find((c) => c.tipo === tipo && c.id === id);
    if (!roles || !cuenta) {
      avisar.error("No se pudieron leer los roles. Actualiza la pantalla e inténtalo de nuevo.");
      return;
    }
    setModal({ tipo: "rol", cuenta });
  }

  function alElegirAccion(c: Colaborador, accion: AccionFila) {
    if (accion === "cambiar_rol") abrirCambioDeRol("persona", c.persona_id);
    else if (accion === "cambiar_ubicacion") setModal({ tipo: "ubicacion", persona: c });
    else if (accion === "suspender") setModal({ tipo: "suspender", persona: c });
    else setModal({ tipo: "quitar", persona: c, suspendida: false });
  }

  const avisos = porAtender(pendientes.length, inactivos.length);
  const terminalesActivas = terminales?.filter((t) => t.activo).length ?? 0;
  const rolesVigentes = roles?.filter((r) => !r.archivado) ?? [];
  const rolesSoloInicio = cuentas ? rolesVigentes.filter((r) => avisoDelRol(r, cuentasDelRol(cuentas, r.id).length) === "solo_inicio").length : 0;
  const conteoEstado: Record<EstadoCuenta, number> = {
    activas: colaboradores.length,
    pendientes: pendientes.length,
    suspendidas: suspendidos.length,
    inactivas: inactivos.length,
  };
  const irAEstado = (e: EstadoCuenta) => {
    setTipo("personas");
    setEstado(e);
  };
  const verRolDe = roles && cuentas ? (personaId: string) => {
    const c = cuentas.find((x) => x.tipo === "persona" && x.id === personaId);
    if (!c) return;
    setRolElegidoId(c.rolId);
    setSeccion("roles");
  } : undefined;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="label-cayla text-[11px] text-tinta/65">Retail</p>
          <h1 className="font-display mt-1 text-3xl text-tinta">Colaboradores</h1>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-tinta/70">
            Quién entra a retail, con qué rol y desde qué ubicación. Las personas se dan de alta en Dynamic.
          </p>
        </div>
        <div className="text-right">
          <div className="flex flex-wrap justify-end gap-2">
            <Boton peso="discreto" onClick={() => setVerActividad(true)}>
              <History aria-hidden className="mr-1.5 inline h-3.5 w-3.5" />
              Actividad
            </Boton>
            <Boton peso="primario" onClick={() => setModal({ tipo: "agregar" })} disabled={disponibles.length === 0}>
              + Agregar colaboradores
            </Boton>
          </div>
          {disponibles.length === 0 && <p className="mt-1 text-xs text-tinta/65">Todas las cuentas activas de Dynamic ya tienen acceso.</p>}
        </div>
      </div>

      {/* Dos secciones grandes en vez de 7 pestañas. Cada una resume lo suyo y avisa en ámbar lo que pide atención. */}
      <nav aria-label="Secciones de colaboradores" className="grid gap-2.5 sm:grid-cols-2 xl:max-w-3xl">
        <BotonSeccion activa={seccion === "cuentas"} onClick={() => setSeccion("cuentas")} titulo="Cuentas">
          {plural(colaboradores.length, "persona", "personas")} · {plural(terminalesActivas, "terminal", "terminales")}
          {pendientes.length > 0 && <strong className="font-semibold text-ambar-profundo"> · {pendientes.length} por aprobar</strong>}
        </BotonSeccion>
        <BotonSeccion activa={seccion === "roles"} onClick={() => setSeccion("roles")} titulo="Roles y accesos">
          {plural(rolesVigentes.length, "rol", "roles")}
          {rolesSoloInicio > 0 ? (
            <strong className="font-semibold text-ambar-profundo"> · {rolesSoloInicio === 1 ? "1 deja" : `${rolesSoloInicio} dejan`} cuentas solo en Inicio</strong>
          ) : (
            " · qué ve cada cuenta"
          )}
        </BotonSeccion>
      </nav>

      {seccion === "cuentas" && (
        <section aria-label="Cuentas" className="space-y-4">
          {avisos.length > 0 ? (
            <div className="space-y-2">
              {avisos.map((a) => (
                <div
                  key={a.estado}
                  className={`flex flex-wrap items-center gap-3 rounded-lg px-4 py-3 text-sm ${
                    a.tono === "ambar" ? "bg-ambar/10 text-ambar-profundo" : "card-cayla text-tinta/75"
                  }`}
                >
                  <p className="min-w-0 flex-1">
                    <strong className="font-semibold">{a.titulo}</strong> {a.detalle}
                  </p>
                  <Boton peso="discreto" className="px-3 py-1.5" onClick={() => irAEstado(a.estado)}>
                    {a.accion}
                  </Boton>
                </div>
              ))}
            </div>
          ) : (
            <p className="flex items-center gap-1.5 text-[13px] text-verde">
              <Check aria-hidden className="h-3.5 w-3.5" /> Nada por atender: sin altas pendientes ni cuentas inactivas en Dynamic.
            </p>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <SegmentoDeslizante
              etiqueta="Tipo de cuenta"
              valor={tipo}
              onCambio={(k) => setTipo(k as TipoCuenta)}
              opciones={[
                { clave: "personas", etiqueta: "Personas", conteo: colaboradores.length },
                { clave: "terminales", etiqueta: "Terminales", conteo: terminalesActivas },
              ]}
            />
            {tipo === "personas" && (
              <div role="radiogroup" aria-label="Estado" className="flex flex-wrap gap-1.5">
                {ESTADOS.map((e) => {
                  const n = conteoEstado[e.clave];
                  const activo = estado === e.clave;
                  return (
                    <button
                      key={e.clave}
                      type="button"
                      role="radio"
                      aria-checked={activo}
                      onClick={() => setEstado(e.clave)}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12.5px] transition-colors duration-200 ease-cayla ${
                        activo ? "border-tinta bg-tinta text-crema" : `border-tinta/15 bg-papel text-tinta/70 hover:border-tinta/40 ${n === 0 ? "opacity-55" : ""}`
                      }`}
                    >
                      <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${e.punto}`} />
                      {e.etiqueta}
                      <span className={`font-semibold tabular-nums ${activo ? "text-crema" : "text-tinta"}`}>{n}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {tipo === "terminales" && (
            <TerminalesPanel
              terminales={terminales}
              ubicaciones={ubicaciones}
              roles={roles}
              ocupadoId={ocupadoId}
              onAlternar={(t) => setModal({ tipo: "terminal", terminal: t })}
              onCambiarRol={roles && cuentas ? (t) => abrirCambioDeRol("terminal", t.id) : undefined}
              acciones={accionesTerminales}
              alActualizar={alActualizar}
            />
          )}

          {tipo === "personas" && estado === "activas" && (
            <section aria-label="Personas con acceso" className="space-y-4">
              {colaboradores.length === 0 ? (
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
                      etiqueta="Filtrar por nivel"
                      valor={rol}
                      onCambio={(k) => setRol(k as FiltroRol)}
                      opciones={[
                        { clave: "todos", etiqueta: "Todos", conteo: colaboradores.length },
                        { clave: "lider", etiqueta: "Líderes", conteo: resumen.lideres },
                        { clave: "colaborador", etiqueta: "Colaboradores", conteo: resumen.colaboradores },
                      ]}
                    />
                  </div>
                  {filas.length === 0 ? (
                    <Vacio>Nadie coincide con lo que buscas.</Vacio>
                  ) : (
                    <TablaActivos filas={filas} ocupadoId={ocupadoId} onAccion={alElegirAccion} rolDe={rolDe} onVerRol={verRolDe} />
                  )}
                  <p className="text-xs text-tinta/65" role="status">
                    {filas.length === colaboradores.length
                      ? plural(filas.length, "persona con acceso", "personas con acceso")
                      : `${filas.length} de ${plural(colaboradores.length, "persona", "personas")}`}
                  </p>
                </>
              )}
            </section>
          )}

          {tipo === "personas" && estado === "pendientes" && (
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

          {tipo === "personas" && estado === "suspendidas" && (
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

          {tipo === "personas" && estado === "inactivas" && (
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
        </section>
      )}

      {seccion === "roles" && (
        <section aria-label="Roles y accesos">
          {roles === null ? (
            <Vacio>No se pudieron leer los roles. Lo demás de esta pantalla sí está al día.</Vacio>
          ) : (
            <RolesPanel
              key={rolElegidoId ?? "inicio"}
              roles={roles}
              cuentas={cuentas}
              ubicaciones={ubicaciones}
              yoId={colaboradores.find((c) => c.es_yo)?.persona_id ?? null}
              rolInicialId={rolElegidoId}
              acciones={accionesRoles}
            />
          )}
        </section>
      )}

      {/* Actividad: un historial que se consulta, no una sección donde se trabaja. Mismo <Modal> de siempre (ADR-0136). */}
      {verActividad && (
        <Modal
          titulo="Actividad de accesos"
          ancho="max-w-2xl"
          onClose={() => setVerActividad(false)}
        >
          <div className="mt-4 max-h-[65vh] overflow-y-auto pr-1">
            {actividad.length === 0 ? <Vacio>Todavía no hay movimientos de acceso.</Vacio> : <ListaActividad eventos={actividad} />}
          </div>
        </Modal>
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
        <AlternarTerminalModal
          terminal={modal.terminal}
          onClose={() => setModal(null)}
          onConfirmar={() =>
            ejecutar(
              modal.terminal.id,
              modal.terminal.activo ? "desactivar la terminal" : "reactivar la terminal",
              () => (modal.terminal.activo ? acciones.desactivarTerminal(modal.terminal.id) : acciones.reactivarTerminal(modal.terminal.id)),
              avisoTerminal(modal.terminal.nombre, modal.terminal.activo)
            )
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
      {modal?.tipo === "rol" && roles && (
        <AsignarRolModal
          roles={rolesAsignables(roles)}
          cuentas={[]}
          ubicaciones={ubicaciones}
          cuentaFija={modal.cuenta}
          onClose={() => setModal(null)}
          onConfirmar={(rolId, cuenta, ubicacionId) =>
            ejecutar(cuenta.id, "cambiar el rol", () => accionesRoles.asignar(rolId, cuenta, ubicacionId), "Rol actualizado", `${cuenta.nombre} ahora tiene «${nombreDeRol(rolId) ?? "el nuevo rol"}».`)
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
