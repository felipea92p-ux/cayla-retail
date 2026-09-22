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
import { avisoTerminal, filtrarColaboradores, type PestanaColaboradores, plural, resumirAccesos, type AccionFila, type FiltroRol } from "@/lib/colaboradores-reglas";
import type { Ubicacion } from "@/lib/ubicaciones";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { Boton } from "@/components/ui/campos";
import { SegmentoDeslizante } from "@/components/ui/SegmentoDeslizante";
import { TabsSubrayado } from "@/components/ui/TabsSubrayado";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { AgregarColaboradoresModal, AlternarTerminalModal, CambiarUbicacionModal, QuitarAccesoModal, SuspenderModal } from "@/components/ColaboradoresModales";
import { AsignarRolModal } from "@/components/RolesModales";
import { accionesRolesSupabase, type AccionesRoles } from "@/lib/roles-acciones";
import { rolesAsignables, type CuentaConRol, type RolVista } from "@/lib/roles-reglas";
import { RolesPanel } from "@/components/RolesPanel";
import { ListaActividad, TablaActivos, TablaInactivas, TablaPendientes, TablaSuspendidos } from "@/components/ColaboradoresTablas";
import { TerminalesPanel, type AccionesTerminales } from "@/components/TerminalesPanel";

// «Terminales» (ADR-0162): aparatos de cada tienda con cuenta propia y SIN persona — ya no salen de `fn_colaboradores()`
// sino de `fn_terminales()`. La pestaña entera vive en `TerminalesPanel` (crear, cambiar clave; sin tipo desde el
// 2026-09-22); aquí quedan Desactivar/Reactivar y Cambiar rol, que comparten modales con el resto de la pantalla.
// «Roles y accesos» (ADR-0161 B; Felipe, 2026-09-22) es una pestaña más, no una ruta ni una fila del menú lateral:
// Colaboradores ya es la pantalla del líder para los accesos. `?pestana=roles` abre directo en ella.
type Pestana = PestanaColaboradores;

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
  pestanaInicial = "activos",
  pestanas,
  soyLider = true,
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
  pestanaInicial?: Pestana;
  /** Las pestañas que ve esta cuenta (20260923131000): Roles y accesos con su módulo, el resto con Colaboradores. Ausente =
   *  todas (el líder, y las maquetas). */
  pestanas?: readonly Pestana[];
  /** ¿Quien mira es líder? Sin serlo (tiene el módulo), no se le ofrece tocar a un líder ni dar el rol Líder. */
  soyLider?: boolean;
  acciones?: AccionesColaboradores;
  accionesRoles?: AccionesRoles;
  /** Crear terminal y cambiar su clave. Por defecto, las Server Actions de `app/actions/terminales.ts`. */
  accionesTerminales?: AccionesTerminales;
  alActualizar?: () => void;
}) {
  const router = useRouter();
  const [pestana, setPestana] = useState<Pestana>(pestanaInicial);
  const [busqueda, setBusqueda] = useState("");
  const [rol, setRol] = useState<FiltroRol>("todos");
  const [modal, setModal] = useState<Modal | null>(null);
  const [ocupadoId, setOcupadoId] = useState<string | null>(null);

  const resumen = useMemo(() => resumirAccesos(colaboradores, suspendidos, disponibles), [colaboradores, suspendidos, disponibles]);
  const filas = useMemo(() => filtrarColaboradores(colaboradores, busqueda, rol), [colaboradores, busqueda, rol]);
  const totalActividad = actividad[0]?.total ?? 0;
  const ve = (p: Pestana) => !pestanas || pestanas.includes(p);
  const veAccesos = ve("activos");

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
        {veAccesos && (
          <div className="text-right">
            <div className="flex flex-wrap justify-end gap-2">
              <Boton peso="primario" onClick={() => setModal({ tipo: "agregar" })} disabled={disponibles.length === 0}>
                + Agregar colaboradores
              </Boton>
            </div>
            {disponibles.length === 0 && <p className="mt-1 text-xs text-tinta/65">Todas las cuentas activas de Dynamic ya tienen acceso.</p>}
          </div>
        )}
      </div>

      {veAccesos && (
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
      )}

      <TabsSubrayado
        etiqueta="Secciones de colaboradores"
        valor={pestana}
        onCambio={(k) => setPestana(k as Pestana)}
        className="border-b border-tinta/10"
        clasePestana="px-1 py-3 text-sm"
        items={(
          [
            { clave: "activos", etiqueta: "Activos", conteo: colaboradores.length },
            { clave: "terminales", etiqueta: "Terminales", conteo: terminales?.filter((t) => t.activo).length ?? 0 },
            { clave: "roles", etiqueta: "Roles y accesos", conteo: roles?.filter((r) => !r.archivado).length ?? 0 },
            { clave: "pendientes", etiqueta: "Pendientes", conteo: pendientes.length, tono: pendientes.length > 0 ? "ambar" : undefined },
            { clave: "suspendidos", etiqueta: "Suspendidos", conteo: suspendidos.length, tono: suspendidos.length > 0 ? "ambar" : undefined },
            { clave: "inactivas", etiqueta: "Inactivas en Dynamic", conteo: inactivos.length },
            { clave: "actividad", etiqueta: "Actividad", conteo: totalActividad },
          ] as const
        ).filter((i) => ve(i.clave))}
      />

      {pestana === "activos" && (
        <section aria-label="Colaboradores activos" className="space-y-4">
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
                  etiqueta="Filtrar por rol"
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
                <TablaActivos filas={filas} ocupadoId={ocupadoId} onAccion={alElegirAccion} rolDe={rolDe} soyLider={soyLider} />
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

      {pestana === "terminales" && (
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

      {pestana === "roles" && (
        <section aria-label="Roles y accesos">
          {roles === null ? (
            <Vacio>No se pudieron leer los roles. Lo demás de esta pantalla sí está al día.</Vacio>
          ) : (
            <RolesPanel roles={roles} cuentas={cuentas} ubicaciones={ubicaciones} yoId={colaboradores.find((c) => c.es_yo)?.persona_id ?? null} soyLider={soyLider} acciones={accionesRoles} />
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
          roles={rolesAsignables(roles, undefined, soyLider)}
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
