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
import { avisoTerminal, plural, vistaDe, type SeccionColaboradores, type VistaColaboradores } from "@/lib/colaboradores-reglas";
import { armarEquipo, type FiltroEquipo, type PersonaEquipo } from "@/lib/equipo-reglas";
import type { Ubicacion } from "@/lib/ubicaciones";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { History } from "lucide-react";
import { AlternarTerminalModal } from "@/components/ColaboradoresModales";
import { DarAccesoModal } from "@/components/colaboradores/DarAccesoModal";
import { avisoDarAcceso } from "@/lib/dar-acceso-reglas";
import { AsignarRolModal } from "@/components/RolesModales";
import { accionesRolesSupabase, type AccionesRoles } from "@/lib/roles-acciones";
import { avisoDelRol, cuentasDelRol, fueraDeLoMio, rolesAsignables, type CuentaConRol, type RolVista } from "@/lib/roles-reglas";
import type { ClaveModulo } from "@/lib/modulos";
import { RolesPanel } from "@/components/RolesPanel";
import { ActividadEquipo } from "@/components/colaboradores/ActividadEquipo";
import { accionesTerminalesServidor, type AccionesTerminales } from "@/components/colaboradores/terminales-acciones";
import { FichaTerminal } from "@/components/colaboradores/FichaTerminal";
import { CambiarClaveModal, NuevaTerminalModal } from "@/components/TerminalesModales";
import { EquipoLista } from "@/components/colaboradores/EquipoLista";
import { FichaColaborador } from "@/components/colaboradores/FichaColaborador";
import { useResponsable } from "@/lib/useResponsable";
import type { Firma } from "@/lib/responsable-reglas";
import { Boton } from "@/components/ui/campos";

// Colaboradores: quién entra a retail, en qué sede y con qué rol. Retail nunca crea gente nueva aquí —Dynamic ya es dueño
// de esa identidad (0009_integracion_dynamic.sql)— solo decide a cuáles cuentas YA existentes en Dynamic les da acceso.
// Dos secciones: «Equipo» (desde el 2026-10-05: una lista agrupada por sede con la ficha de cada persona al costado; antes
// «Cuentas», con pestañas por tipo y por estado) y «Roles y accesos». Actividad se abre en un modal: se consulta, no se
// trabaja ahí. `?pestana=` de antes sigue funcionando (`vistaDe`).
// `acciones` y `alActualizar` existen para poder mostrar la pantalla con datos de ejemplo: por defecto escriben en la base
// y recargan los datos del servidor.

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

type ModalPanel =
  | { tipo: "agregar" }
  | { tipo: "terminal"; terminal: Terminal }
  | { tipo: "rol_terminal"; cuenta: CuentaConRol }
  | { tipo: "nueva_terminal" }
  | { tipo: "clave"; terminal: Terminal };

/** Con qué atajo abre Equipo según el `?pestana=` de antes: los enlaces viejos siguen llevando a lo mismo. */
function filtroInicial(v: VistaColaboradores): FiltroEquipo {
  if (v.tipo === "terminales") return "terminales";
  if (v.estado === "suspendidas" || v.estado === "inactivas") return "suspendidas";
  return "todas";
}

export function ColaboradoresPanel({
  colaboradores,
  pendientes,
  suspendidos,
  inactivos,
  actividad,
  disponibles,
  ubicaciones,
  terminales,
  deTurno = [],
  ahoraIso,
  veActividadModulo = false,
  roles = null,
  cuentas = null,
  vistaInicial = vistaDe(undefined),
  secciones,
  soyLider = true,
  soyAdmin = soyLider,
  admins = [],
  fueraDeAlcance = [],
  misModulos = null,
  acciones = accionesSupabase,
  accionesRoles = accionesRolesSupabase,
  accionesTerminales = accionesTerminalesServidor,
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
  /** Quiénes están de turno hoy (asistencia de Dynamic): el punto verde. Vacío si no se pudo leer. */
  deTurno?: readonly string[];
  /** «Ahora» del servidor, para que «hoy 09:12» diga lo mismo al pintar en el servidor y en el navegador. */
  ahoraIso: string;
  /** ¿La cuenta ve el módulo Actividad? Con él, «Actividad» lee `fn_actividad` (accesos y roles); sin él, el registro de accesos. */
  veActividadModulo?: boolean;
  /** ADR-0161 B: los roles y las cuentas con su rol. `null` = no se pudieron leer (o quien mira no tiene Roles y accesos):
   *  la pantalla sigue, con el nivel (Líder / Integrante) en vez del rol y sin «Cambiar rol». */
  roles?: RolVista[] | null;
  cuentas?: CuentaConRol[] | null;
  /** Sección y filtros con que abre (`?pestana=` de siempre, ver `vistaDe`). */
  vistaInicial?: VistaColaboradores;
  /** Las secciones que ve esta cuenta (20260923131000): Equipo con el módulo Colaboradores, Roles y accesos con el suyo.
   *  Ausente = las dos (el líder, y las maquetas). */
  secciones?: readonly SeccionColaboradores[];
  soyLider?: boolean;
  /** ADR-0178: ¿quien mira es Admin (admin en Dynamic + Líder aquí)? Solo un Admin toca a un líder o da el rol Líder. */
  soyAdmin?: boolean;
  /** ADR-0178: las personas que son Admin, para marcarlas. */
  admins?: readonly string[];
  /** ADR-0178 «solo alcanzas a quien está por debajo de ti»: personas a las que quien mira no alcanza (sin acciones). */
  fueraDeAlcance?: readonly string[];
  /** ADR-0178 «solo das lo que tienes»: los módulos que ve quien mira, o `null` si es líder (da todo). */
  misModulos?: readonly ClaveModulo[] | null;
  acciones?: AccionesColaboradores;
  accionesRoles?: AccionesRoles;
  /** Crear terminal y cambiar su clave. Por defecto, las Server Actions de `app/actions/terminales.ts`. */
  accionesTerminales?: AccionesTerminales;
  alActualizar?: () => void;
}) {
  const router = useRouter();
  const [seccion, setSeccion] = useState<SeccionColaboradores>(vistaInicial.seccion);
  const [filtro, setFiltro] = useState<FiltroEquipo>(() => filtroInicial(vistaInicial));
  const [verActividad, setVerActividad] = useState(vistaInicial.actividad);
  const [rolElegidoId, setRolElegidoId] = useState<string | null>(null);
  const [fichaId, setFichaId] = useState<string | null>(null);
  const [terminalId, setTerminalId] = useState<string | null>(null);
  // Tras crear una terminal o cambiarle la clave, la lista se refresca al CERRAR el paso de la clave: así no salta detrás de la
  // clave que se está leyendo (se muestra una sola vez).
  const [refrescarAlCerrar, setRefrescarAlCerrar] = useState(false);
  const [modal, setModal] = useState<ModalPanel | null>(null);
  const [ocupadoId, setOcupadoId] = useState<string | null>(null);
  // Quién hace cada cambio (ADR-0161/0162; Felipe 2026-09-23: el combo va en TODA acción que guarda, también aquí).
  // UNO para toda la pantalla: lo pintan la franja de altas, la ficha, cada modal y Roles y accesos. La base firma el
  // historial con esa persona; quién PUEDE hacer el cambio lo sigue decidiendo la cuenta.
  const responsable = useResponsable();

  const nombreDeRol = (id: string) => roles?.find((r) => r.id === id)?.nombre ?? null;
  const miembros = useMemo(
    () =>
      armarEquipo({
        activos: colaboradores,
        suspendidos,
        inactivos,
        terminales,
        ubicaciones,
        rolDe:
          roles && cuentas
            ? (id) => {
                const c = cuentas.find((x) => x.tipo === "persona" && x.id === id);
                const r = c ? roles.find((x) => x.id === c.rolId) : undefined;
                return r ? { id: r.id, nombre: r.nombre } : null;
              }
            : undefined,
        admins,
        fueraDeAlcance,
        soyAdmin,
        deTurno: new Set(deTurno),
      }),
    [colaboradores, suspendidos, inactivos, terminales, ubicaciones, roles, cuentas, admins, fueraDeAlcance, soyAdmin, deTurno],
  );
  // La ficha se arma de los datos de hoy: tras guardar y recargar, muestra a la persona ya cambiada (o se cierra si se fue).
  const enFicha = miembros.find((m): m is PersonaEquipo => m.tipo === "persona" && m.id === fichaId) ?? null;
  const enFichaTerminal = terminales?.find((t) => t.id === terminalId) ?? null;
  const abrirPersona = (id: string) => {
    setTerminalId(null);
    setFichaId(id);
  };
  const abrirTerminal = (id: string) => {
    setFichaId(null);
    setTerminalId(id);
  };
  function cerrarModalDeClave() {
    setModal(null);
    if (refrescarAlCerrar) {
      setRefrescarAlCerrar(false);
      (alActualizar ?? (() => router.refresh()))();
    }
  }

  /** Guarda con el responsable de la pantalla. Con `deshacer`, el aviso trae el botón para volver atrás (7 s). */
  async function ejecutar(
    idOcupado: string | null,
    verbo: string,
    llamada: (firma: Firma | null) => Promise<ResultadoAccion>,
    exito: string,
    opciones?: { detalle?: string; deshacer?: () => void },
  ) {
    if (!responsable.listo) {
      if (responsable.motivo) avisar.error(responsable.motivo);
      return false;
    }
    setOcupadoId(idOcupado);
    const { error } = await llamada(responsable.firma());
    setOcupadoId(null);
    responsable.despues(error);
    if (error) {
      avisar.error(traducirError(error, verbo));
      return false;
    }
    avisar.exito(exito, {
      detalle: opciones?.detalle,
      ...(opciones?.deshacer ? { accion: { texto: "Deshacer", onClick: opciones.deshacer }, duracion: 7000 } : {}),
    });
    (alActualizar ?? (() => router.refresh()))();
    return true;
  }

  const ve = (x: SeccionColaboradores) => !secciones || secciones.includes(x);
  const terminalesActivas = terminales?.filter((t) => t.activo).length ?? 0;
  const rolesVigentes = roles?.filter((r) => !r.archivado) ?? [];
  const rolesSinModulos = cuentas ? rolesVigentes.filter((r) => avisoDelRol(r, cuentasDelRol(cuentas, r.id).length) === "sin_modulos").length : 0;
  const nombreSede = (id: string) => ubicaciones.find((u) => u.id === id)?.nombre ?? "la nueva sede";

  function abrirCambioDeRolTerminal(t: Terminal) {
    const cuenta = cuentas?.find((c) => c.tipo === "terminal" && c.id === t.id);
    if (!roles || !cuenta) {
      avisar.error("No se pudieron leer los roles. Actualiza la pantalla e inténtalo de nuevo.");
      return;
    }
    setModal({ tipo: "rol_terminal", cuenta });
  }

  const accionesFicha = (p: PersonaEquipo) => ({
    cambiarRol: (rolId: string, cuenta: CuentaConRol, ubicacionId?: string) => {
      const antes = cuenta.rolId;
      const destino = roles?.find((r) => r.id === rolId);
      // Para deshacer, la cuenta como queda DESPUÉS del cambio (si bajó de Líder, ya tiene sede y no la vuelve a pedir).
      const despues: CuentaConRol = { ...cuenta, rolId, esLider: !!destino?.fijo, ubicacion: ubicacionId ? nombreSede(ubicacionId) : cuenta.ubicacion };
      return ejecutar(p.id, "cambiar el rol", (f) => accionesRoles.asignar(rolId, cuenta, ubicacionId, f), `${p.nombre} ahora es ${nombreDeRol(rolId) ?? "del nuevo rol"}`, {
        deshacer: () => void ejecutar(p.id, "volver al rol de antes", (f) => accionesRoles.asignar(antes, despues, undefined, f), `${p.nombre} volvió a ${nombreDeRol(antes) ?? "su rol"}`),
      });
    },
    cambiarSede: (ubicacionId: string) => {
      const antes = p.ubicacionId;
      return ejecutar(p.id, "cambiar la sede", (f) => acciones.cambiarUbicacion(p.id, ubicacionId, f), `${p.nombre} ahora está en ${nombreSede(ubicacionId)}`, {
        deshacer: antes ? () => void ejecutar(p.id, "volver a la sede de antes", (f) => acciones.cambiarUbicacion(p.id, antes, f), `${p.nombre} volvió a ${nombreSede(antes)}`) : undefined,
      });
    },
    suspender: (motivo: string) =>
      ejecutar(p.id, "suspender el acceso", (f) => acciones.suspender(p.id, motivo, f), `Acceso de ${p.nombre} suspendido`, {
        deshacer: () => void ejecutar(p.id, "reactivar el acceso", (f) => acciones.reactivar(p.id, f), `${p.nombre} ya tiene acceso otra vez`),
      }),
    reactivar: () =>
      ejecutar(p.id, "reactivar el acceso", (f) => acciones.reactivar(p.id, f), `${p.nombre} ya tiene acceso otra vez`, {
        deshacer: () => void ejecutar(p.id, "suspender el acceso", (f) => acciones.suspender(p.id, p.motivo ?? "", f), `Acceso de ${p.nombre} suspendido`),
      }),
    quitar: async () => {
      const ok = await ejecutar(p.id, "quitar el acceso", (f) => acciones.quitar(p.id, f), "Acceso quitado", { detalle: `${p.nombre} ya no puede entrar a retail.` });
      if (ok) setFichaId(null);
      return ok;
    },
  });

  return (
    <div className="space-y-6">
      <EncabezadoPagina
        sede="Toda CAYLA"
        titulo="Colaboradores"
        subtitulo="Quién entra a retail, en qué sede y con qué rol."
        acciones={
          ve("cuentas") && (
            <>
              <Boton type="button" onClick={() => setVerActividad(true)}>
                <span className="inline-flex items-center gap-2">
                  <History aria-hidden className="h-4 w-4" />
                  Actividad
                </span>
              </Boton>
              <Boton
                type="button"
                peso="primario"
                onClick={() => setModal({ tipo: "agregar" })}
                disabled={disponibles.length === 0}
                title={disponibles.length === 0 ? "Todas las cuentas activas de Dynamic ya tienen acceso." : undefined}
              >
                + Dar acceso
              </Boton>
            </>
          )
        }
      />

      {ve("cuentas") && ve("roles") && (
        <nav aria-label="Secciones de colaboradores" className="grid gap-2.5 sm:grid-cols-2 xl:max-w-3xl">
          <BotonSeccion activa={seccion === "cuentas"} onClick={() => setSeccion("cuentas")} titulo="Equipo">
            {plural(colaboradores.length, "persona", "personas")} · {plural(terminalesActivas, "terminal", "terminales")}
            {pendientes.length > 0 && <strong className="font-semibold text-ambar-profundo"> · {pendientes.length} por aprobar</strong>}
          </BotonSeccion>
          <BotonSeccion activa={seccion === "roles"} onClick={() => setSeccion("roles")} titulo="Roles y accesos">
            {plural(rolesVigentes.length, "rol", "roles")}
            {rolesSinModulos > 0 ? (
              <strong className="font-semibold text-ambar-profundo"> · {rolesSinModulos === 1 ? "1 deja" : `${rolesSinModulos} dejan`} cuentas sin ningún módulo</strong>
            ) : (
              " · qué ve cada cuenta"
            )}
          </BotonSeccion>
        </nav>
      )}

      {seccion === "cuentas" && ve("cuentas") && (
        <EquipoLista
          miembros={miembros}
          ubicaciones={ubicaciones}
          pendientes={pendientes}
          ocupadoId={ocupadoId}
          elegidoId={fichaId ?? terminalId}
          ahoraIso={ahoraIso}
          responsable={responsable}
          filtro={filtro}
          onFiltro={setFiltro}
          onAbrir={abrirPersona}
          onAprobar={(c) =>
            ejecutar(c.persona_id, "aprobar el alta", (f) => acciones.aprobar(c.persona_id, f), `${c.nombre} ya puede entrar a retail`)
          }
          onRechazar={(c) =>
            ejecutar(c.persona_id, "rechazar el alta", (f) => acciones.quitar(c.persona_id, f), "Alta rechazada", { detalle: "La propuesta de alta se descartó." })
          }
          conTerminales={terminales !== null}
          onAbrirTerminal={abrirTerminal}
          onNuevaTerminal={terminales !== null ? () => setModal({ tipo: "nueva_terminal" }) : undefined}
        />
      )}

      {seccion === "cuentas" && enFicha && (
        <FichaColaborador
          persona={enFicha}
          roles={roles}
          cuentas={cuentas}
          ubicaciones={ubicaciones}
          soyAdmin={soyAdmin}
          misModulos={misModulos}
          ahoraIso={ahoraIso}
          responsable={responsable}
          ocupado={ocupadoId !== null}
          acciones={accionesFicha(enFicha)}
          onVerRol={
            ve("roles") && roles && enFicha.rolId
              ? () => {
                  setRolElegidoId(enFicha.rolId);
                  setFichaId(null);
                  setSeccion("roles");
                }
              : undefined
          }
          onCerrar={() => setFichaId(null)}
        />
      )}

      {seccion === "cuentas" && enFichaTerminal && (
        <FichaTerminal
          terminal={enFichaTerminal}
          ahoraIso={ahoraIso}
          onClave={() => setModal({ tipo: "clave", terminal: enFichaTerminal })}
          onCambiarRol={roles && cuentas ? () => abrirCambioDeRolTerminal(enFichaTerminal) : undefined}
          onAlternar={() => setModal({ tipo: "terminal", terminal: enFichaTerminal })}
          onCerrar={() => setTerminalId(null)}
        />
      )}

      {seccion === "roles" && ve("roles") && (
        <section aria-label="Roles y accesos">
          {roles === null ? (
            <p className="font-display card-cayla py-8 text-center text-base italic text-tinta/65">No se pudieron leer los roles. Lo demás de esta pantalla sí está al día.</p>
          ) : (
            <RolesPanel
              key={rolElegidoId ?? "inicio"}
              roles={roles}
              cuentas={cuentas}
              ubicaciones={ubicaciones}
              yoId={colaboradores.find((c) => c.es_yo)?.persona_id ?? null}
              rolInicialId={rolElegidoId}
              soyAdmin={soyAdmin}
              misModulos={misModulos}
              fueraDeAlcance={fueraDeAlcance}
              admins={admins}
              acciones={accionesRoles}
              responsable={responsable}
            />
          )}
        </section>
      )}

      {/* Actividad: un historial que se consulta, no una sección donde se trabaja (ADR-0343). */}
      {verActividad && <ActividadEquipo veActividad={veActividadModulo} esLider={soyLider} accesos={actividad} onClose={() => setVerActividad(false)} />}

      {modal?.tipo === "agregar" && (
        <DarAccesoModal
          responsable={responsable}
          disponibles={disponibles}
          ubicaciones={ubicaciones}
          roles={roles}
          soyLider={soyLider}
          soyAdmin={soyAdmin}
          misModulos={misModulos}
          onClose={() => setModal(null)}
          onConfirmar={(personas, ubicacionId, rolId) =>
            ejecutar(
              null,
              "dar el acceso",
              (f) => acciones.agregar(personas.map((p) => p.id), ubicacionId, rolId, f),
              // ADR-0341: lo que da un líder entra directo; lo de quien no es líder espera el ok de un líder.
              avisoDarAcceso(personas.map((p) => p.nombre), soyLider),
            )
          }
        />
      )}
      {modal?.tipo === "terminal" && (
        <AlternarTerminalModal
          responsable={responsable}
          terminal={modal.terminal}
          onClose={() => setModal(null)}
          onConfirmar={() =>
            ejecutar(
              modal.terminal.id,
              modal.terminal.activo ? "desactivar la terminal" : "reactivar la terminal",
              (f) => (modal.terminal.activo ? acciones.desactivarTerminal(modal.terminal.id, f) : acciones.reactivarTerminal(modal.terminal.id, f)),
              avisoTerminal(modal.terminal.nombre, modal.terminal.activo),
            )
          }
        />
      )}
      {modal?.tipo === "nueva_terminal" && (
        <NuevaTerminalModal
          ubicaciones={ubicaciones}
          roles={roles ? roles.filter((r) => fueraDeLoMio(r.modulos, misModulos).length === 0) : roles}
          terminales={terminales ?? []}
          crear={accionesTerminales.crear}
          onCreada={(nombre) => {
            setRefrescarAlCerrar(true);
            avisar.exito("Terminal creada", { detalle: `${nombre} ya puede iniciar sesión.` });
          }}
          onClose={cerrarModalDeClave}
        />
      )}
      {modal?.tipo === "clave" && (
        <CambiarClaveModal
          terminal={modal.terminal}
          cambiar={accionesTerminales.cambiarClave}
          onCambiada={(nombre, aviso) => {
            setRefrescarAlCerrar(true);
            avisar.exito("Clave cambiada", { detalle: `La clave anterior de ${nombre} ya no sirve.` });
            if (aviso) avisar.aviso("No quedó anotado quién", { detalle: aviso });
          }}
          onClose={cerrarModalDeClave}
        />
      )}
      {modal?.tipo === "rol_terminal" && roles && (
        <AsignarRolModal
          responsable={responsable}
          roles={rolesAsignables(roles, undefined, soyAdmin, misModulos)}
          cuentas={[]}
          ubicaciones={ubicaciones}
          cuentaFija={modal.cuenta}
          onClose={() => setModal(null)}
          onConfirmar={(rolId, cuenta, ubicacionId) =>
            ejecutar(cuenta.id, "cambiar el rol", (f) => accionesRoles.asignar(rolId, cuenta, ubicacionId, f), "Rol actualizado", { detalle: `${cuenta.nombre} ahora tiene «${nombreDeRol(rolId) ?? "el nuevo rol"}».` })
          }
        />
      )}
    </div>
  );
}
