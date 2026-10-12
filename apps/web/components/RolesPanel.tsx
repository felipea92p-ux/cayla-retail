"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Lock, Plus, SearchX, ShieldCheck } from "lucide-react";
import { avisar } from "@/components/ui/Avisos";
import { BarraFija } from "@/components/ui/BarraFija";
import { Boton, Desplegable } from "@/components/ui/campos";
import { MenuAcciones, type ItemMenu } from "@/components/ui/MenuAcciones";
import { Modal } from "@/components/ui/Modal";
import { SegmentoDeslizante } from "@/components/ui/SegmentoDeslizante";
import { ArchivarRolModal, AsignarRolModal, NuevoRolModal, RenombrarRolModal } from "@/components/RolesModales";
import { ComboResponsable } from "@/components/ComboResponsable";
import { IconoModulo } from "@/components/colaboradores/IconoModulo";
import type { ControlResponsable } from "@/lib/useResponsable";
import type { Firma } from "@/lib/responsable-reglas";
import { esVersionCambiada, traducirError } from "@/lib/error-escritura";
import type { Ubicacion } from "@/lib/ubicaciones";
import { MODULOS, SIEMPRE_SOLO_LIDER, esDelegable, type ClaveModulo } from "@/lib/modulos";
import { accionesRolesSupabase, type AccionesRoles, type ResultadoRol } from "@/lib/roles-acciones";
import {
  alternarGrupo,
  alternarModulo,
  avisoDelRol,
  cambiosDelBorrador,
  conGuardadosLocales,
  controlDe,
  esMiRolSinSerLider,
  MODULO_FIJO_DEL_LIDER,
  fueraDeLoMio,
  motivoPorLoMio,
  puedeAsignarRol,
  type QuienEdita,
  cuentasAsignables,
  cuentasDelRol,
  familiaDeRol,
  hayCambios,
  menuConCambios,
  modulosPorGrupo,
  motivoParaNoArchivar,
  motivoParaNoGuardar,
  nombreDeCopia,
  pantallaPrincipalValida,
  pantallasElegibles,
  rolesAsignables,
  veModulo,
  type CuentaConRol,
  type FamiliaRol,
  type FilaMenuConCambios,
  type GuardadoLocal,
  type RolVista,
} from "@/lib/roles-reglas";
import { Aviso } from "@/components/ui/Aviso";
import { Buscador } from "@/components/ui/Buscador";
import { Vacio } from "@/components/ui/Vacio";

// «Roles y accesos» (ADR-0161 B). Desde el 2026-10-05 (ADR-0342, propuesta de Felipe): los roles en tarjetas (quiénes lo tienen y
// los íconos de lo que ve) y, abajo, el rol elegido con sus módulos como baldosas (negra = la ve; tocarla dice qué incluye),
// borrador con barra de guardado y la vista previa del menú que marca lo que se suma y se quita. Sin la matriz «Comparar
// roles» ni el buscador de módulos (Felipe: no les veía uso). Cada rol decide SOLO qué módulos ve; quien ve un
// módulo hace todo lo que hay en él, salvo la lista fija «siempre solo del líder». El Líder también se edita (ADR-0253):
// sus módulos los mueve solo un Admin, se le puede quitar cualquiera menos Roles y accesos, y lo que nazca después le
// aparece solo. Todo lo que se escribe pasa por RPC (del líder o de quien ve Roles y accesos, 20260923131000), que anota
// `roles_historial`; subir a alguien a Líder o cambiarle el rol a un líder sigue siendo de un Admin.

type Modal =
  | { tipo: "nuevo" }
  | { tipo: "duplicar"; rol: RolVista }
  | { tipo: "renombrar"; rol: RolVista }
  | { tipo: "archivar"; rol: RolVista }
  | { tipo: "asignar"; rol: RolVista }
  | { tipo: "cuentas"; rol: RolVista };

const iniciales = (n: string) =>
  n
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

function sinBorrador<T>(b: Record<string, T>, id: string): Record<string, T> {
  const copia = { ...b };
  delete copia[id];
  return copia;
}

function descripcionDe(rol: RolVista): string {
  if (rol.fijo) return "Ve todo, también cada módulo nuevo.";
  if (rol.clave === "integrante") return "El que recibe quien recién entra, si no se elige otro.";
  if (rol.archivado) return "Archivado: no se ofrece al dar roles. Restáuralo para volver a usarlo.";
  return rol.descripcion ?? "";
}

const FAMILIAS: { clave: FamiliaRol; etiqueta: string; cabecera: string }[] = [
  { clave: "sistema", etiqueta: "Del sistema", cabecera: "Rol del sistema" },
  { clave: "terminal", etiqueta: "Terminales", cabecera: "Rol de terminal" },
  { clave: "a_medida", etiqueta: "A medida", cabecera: "Rol a medida" },
];
const DELEGABLES = MODULOS.filter(esDelegable).length;

export function RolesPanel({
  roles: rolesServidor,
  cuentas,
  ubicaciones,
  yoId,
  rolInicialId = null,
  soyAdmin = true,
  misModulos = null,
  fueraDeAlcance = [],
  admins = [],
  acciones = accionesRolesSupabase,
  responsable,
}: {
  roles: RolVista[];
  /** `null` = no se pudieron leer: la pantalla sigue, sin la lista de cuentas. */
  cuentas: CuentaConRol[] | null;
  /** Para la sede de un líder al que se le baja el rol. */
  ubicaciones: Pick<Ubicacion, "id" | "nombre">[];
  /** La persona de esta sesión: no se ofrece a sí misma (nadie se cambia su propio rol). */
  yoId: string | null;
  /** Con qué rol abre (desde el rol de una fila en Cuentas). Sin esto, Integrante. */
  rolInicialId?: string | null;
  /** ¿Quien mira es Admin (ADR-0178)? Sin serlo no da el rol Líder ni le cambia el rol a un líder. */
  soyAdmin?: boolean;
  /** ADR-0178 «solo das lo que tienes»: los módulos que ve quien mira, o `null` si es líder (da todo). */
  misModulos?: readonly ClaveModulo[] | null;
  /** ADR-0178 «solo alcanzas a quien está por debajo de ti»: a esas personas no se les ofrece cambiar el rol. */
  fueraDeAlcance?: readonly string[];
  /** ADR-0178: los `persona_id` que hoy son Admin. Para avisar en «Asignar rol» si la cuenta pierde el escalón al
   *  dejar de ser líder. */
  admins?: readonly string[];
  acciones?: AccionesRoles;
  /** El combo «Responsable» de Colaboradores (ADR-0161/0162, Felipe 2026-09-23: TODA acción que guarda lo pide).
   *  Uno solo para la pantalla: lo comparten la cabecera de esta sección, sus modales y la barra de guardar. */
  responsable: ControlResponsable;
}) {
  const router = useRouter();
  // ADR-0193: lo que esta pantalla guardó (con la versión que devolvió la base) manda hasta que `router.refresh()` traiga
  // los roles nuevos: así dos guardados seguidos no chocan consigo mismos ni se pisan entre sí.
  const [guardados, setGuardados] = useState<Record<string, GuardadoLocal>>({});
  const roles = conGuardadosLocales(rolesServidor, guardados);
  const vigentes = roles.filter((r) => !r.archivado);
  const archivados = roles.filter((r) => r.archivado);
  const [elegidoId, setElegidoId] = useState(
    () => (roles.find((r) => r.id === rolInicialId) ?? vigentes.find((r) => r.clave === "integrante") ?? vigentes[0])?.id ?? "",
  );
  const rol = roles.find((r) => r.id === elegidoId) ?? vigentes[0];
  const [borradores, setBorradores] = useState<Record<string, ClaveModulo[]>>({});
  const [pantallaPrincipalBorradores, setPantallaPrincipalBorradores] = useState<Record<string, ClaveModulo | null>>({});
  const [modal, setModal] = useState<Modal | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [verArchivados, setVerArchivados] = useState(false);
  // El módulo que se tocó: su «qué incluye» sale en la línea de ayuda de arriba de las baldosas.
  const [ayudaId, setAyudaId] = useState<ClaveModulo | null>(null);
  const [ubicacionPrevia, setUbicacionPrevia] = useState<"tienda" | "taller">("tienda");

  const borrador = rol ? (borradores[rol.id] ?? rol.modulos) : [];
  // Se autocorrige contra el borrador de módulos: si se apaga el módulo elegido, vuelve solo a «sin preferencia»
  // (misma regla que la base). Por eso no hace falta un efecto que lo reajuste al tocar el interruptor.
  const pantallaPrincipalBorrador = pantallaPrincipalValida(
    rol ? (pantallaPrincipalBorradores[rol.id] ?? rol.pantallaPrincipal) : null,
    borrador,
  );
  const cambioPantallaPrincipal = !!rol && pantallaPrincipalBorrador !== rol.pantallaPrincipal;
  const conCambios = !!rol && (hayCambios(rol.modulos, borrador) || cambioPantallaPrincipal);
  const cambios = rol ? cambiosDelBorrador(rol.modulos, borrador) : { suma: [], quita: [] };
  const nCambios = cambios.suma.length + cambios.quita.length + (cambioPantallaPrincipal ? 1 : 0);
  const menu = rol ? menuConCambios(rol, borrador, ubicacionPrevia) : [];
  const cuentasDe = (id: string) => (cuentas ? cuentasDelRol(cuentas, id) : []);
  const quien: QuienEdita = { misModulos, miRolId: cuentas?.find((c) => c.tipo === "persona" && c.id === yoId)?.rolId ?? null, soyAdmin };

  async function ejecutar(verbo: string, llamada: (firma: Firma | null) => Promise<ResultadoRol>, exito: string): Promise<ResultadoRol | null> {
    if (!responsable.listo) {
      if (responsable.motivo) avisar.error(responsable.motivo);
      return null;
    }
    const r = await llamada(responsable.firma());
    responsable.despues(r.error);
    if (r.error) {
      // ADR-0193: otra persona cambió el rol mientras se editaba. «Recargar» trae sus cambios sin perder el borrador:
      // la barra de guardado pasa a comparar contra lo que el rol tiene ahora.
      if (esVersionCambiada(r.error)) {
        avisar.error(traducirError(r.error, verbo), { accion: { texto: "Recargar", onClick: () => router.refresh() } });
        return null;
      }
      avisar.error(traducirError(r.error, verbo));
      return null;
    }
    avisar.exito(exito);
    router.refresh();
    return r;
  }

  async function guardar() {
    if (!rol || !conCambios) return;
    setGuardando(true);
    const r = await ejecutar(
      "guardar los módulos del rol",
      (f) => acciones.guardarModulos(rol.id, borrador, rol.version, pantallaPrincipalBorrador, f),
      `«${rol.nombre}» quedó guardado`,
    );
    setGuardando(false);
    if (r) {
      recordarGuardado(rol.id, r.version, borrador, pantallaPrincipalBorrador);
      setBorradores((b) => sinBorrador(b, rol.id));
      setPantallaPrincipalBorradores((b) => sinBorrador(b, rol.id));
    }
  }

  function recordarGuardado(rolId: string, version: number | undefined, modulos: ClaveModulo[], pantallaPrincipal: ClaveModulo | null) {
    // Sin versión (base sin ADR-0193) no hay nada que recordar: manda lo que traiga el servidor.
    if (version === undefined) return;
    setGuardados((g) => ({ ...g, [rolId]: { version, modulos, pantallaPrincipal } }));
  }

  function elegir(id: string) {
    setElegidoId(id);
    setAyudaId(null);
  }

  const ponerBorrador = (modulos: ClaveModulo[]) => {
    if (!rol) return;
    // ADR-0161 P6 (ver arriba): se frena al encender, no al guardar.
    const motivo = motivoPorLoMio(rol, borrador, modulos, quien) ?? motivoParaNoGuardar(borrador, modulos, cuentasDe(rol.id));
    if (motivo) {
      avisar.error(motivo);
      return;
    }
    setBorradores((b) => (hayCambios(rol.modulos, modulos) ? { ...b, [rol.id]: modulos } : sinBorrador(b, rol.id)));
  };

  if (!rol)
    return (
      <div className="card-cayla">
        <Vacio icono={<ShieldCheck />}>Todavía no hay roles.</Vacio>
      </div>
    );

  const cuentasDelElegido = cuentasDe(rol.id);
  const motivoArchivo = motivoParaNoArchivar(rol, cuentasDelElegido.length);
  const esMio = esMiRolSinSerLider(rol, quien);
  // ADR-0253: el Líder lo edita solo un Admin (tocarlo es tocar a todos los líderes).
  const editable = (!rol.fijo || soyAdmin) && !rol.archivado && !esMio;
  const ayuda = ayudaId ? (MODULOS.find((m) => m.clave === ayudaId) ?? null) : null;

  const itemsMenu: ItemMenu[] = [
    ...(!rol.fijo && !rol.archivado ? [{ clave: "renombrar", etiqueta: "Renombrar", onSelect: () => setModal({ tipo: "renombrar", rol }) }] : []),
    { clave: "duplicar", etiqueta: "Duplicar", onSelect: () => setModal({ tipo: "duplicar", rol }) },
    ...(!rol.esSistema && !rol.archivado && motivoArchivo === null
      ? [{ clave: "archivar", etiqueta: "Archivar", peligro: true, onSelect: () => setModal({ tipo: "archivar", rol }) }]
      : []),
    ...(rol.archivado
      ? [{ clave: "restaurar", etiqueta: "Restaurar", onSelect: () => ejecutar("restaurar el rol", (f) => acciones.restaurar(rol.id, f), `«${rol.nombre}» volvió a estar disponible`) }]
      : []),
  ];

  return (
    <div className={`@container space-y-5 ${conCambios ? "pb-24" : ""}`}>
      <div className="flex flex-wrap items-center justify-end gap-3">
        <div className="w-full max-w-xs space-y-1">
          {/* UN combo para toda la sección (regla 10 de CLAUDE.md). El mismo control se ve en cada modal y apaga
              «Guardar cambios» si falta. */}
          <ComboResponsable control={responsable} deshabilitado={guardando} />
        </div>
      </div>

      <TarjetasRoles
        roles={vigentes}
        archivados={archivados}
        elegidoId={rol.id}
        cuentasDe={cuentas ? cuentasDe : null}
        sinGuardar={(id) => !!borradores[id] && hayCambios(roles.find((r) => r.id === id)?.modulos ?? [], borradores[id])}
        verArchivados={verArchivados}
        onVerArchivados={() => setVerArchivados((v) => !v)}
        onElegir={elegir}
        onNuevo={() => setModal({ tipo: "nuevo" })}
      />

      <div className="grid gap-5 @[980px]:grid-cols-[minmax(0,1fr)_300px]">
        <section aria-label={`Rol ${rol.nombre}`} className="card-cayla min-w-0 overflow-hidden">
          <div className="border-b border-tinta/10 px-5 py-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 max-w-xl">
                <p className="label-cayla text-[11px] text-tinta/60">{rol.archivado ? "Rol archivado" : FAMILIAS.find((f) => f.clave === familiaDeRol(rol))?.cabecera}</p>
                <h2 className="font-display mt-0.5 text-[28px] leading-tight text-tinta">{rol.nombre}</h2>
                {descripcionDe(rol) && <p className="mt-1 text-sm text-tinta/70">{descripcionDe(rol)}</p>}
              </div>
              <div className="flex items-center gap-2">
                {!rol.archivado && puedeAsignarRol(rol, soyAdmin, misModulos) && (
                  <Boton type="button" peso="discreto" className="px-3 py-2" onClick={() => setModal({ tipo: "asignar", rol })} disabled={!cuentas}>
                    {rol.fijo ? "Asignar a una persona" : "Asignar a una cuenta"}
                  </Boton>
                )}
                <MenuAcciones etiqueta={`Más acciones de ${rol.nombre}`} items={itemsMenu} />
              </div>
            </div>
            {cuentas && (
              <div className="mt-3 flex flex-wrap items-center gap-2.5">
                {cuentasDelElegido.length === 0 ? (
                  <p className="text-[13px] text-tinta/60">Ninguna cuenta tiene este rol todavía.</p>
                ) : (
                  <>
                    <span className="flex" aria-hidden>
                      {cuentasDelElegido.slice(0, 5).map((c) => (
                        <span
                          key={`${c.tipo}:${c.id}`}
                          className={`-ml-2 grid h-7 w-7 place-items-center rounded-full border-2 border-papel text-[10px] font-semibold first:ml-0 ${c.tipo === "terminal" ? "bg-tinta/10 text-tinta/70" : "bg-sand text-tinta"}`}
                        >
                          {iniciales(c.nombre)}
                        </span>
                      ))}
                      {cuentasDelElegido.length > 5 && (
                        <span className="-ml-2 grid h-7 w-7 place-items-center rounded-full border-2 border-papel bg-tinta text-[10px] font-semibold text-crema">
                          +{cuentasDelElegido.length - 5}
                        </span>
                      )}
                    </span>
                    <button type="button" onClick={() => setModal({ tipo: "cuentas", rol })} className="text-[13px] text-tinta/75 underline decoration-tinta/20 underline-offset-2 hover:text-tinta">
                      {cuentasDelElegido.length === 1 ? "1 cuenta tiene este rol" : `${cuentasDelElegido.length} cuentas tienen este rol`} →
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          {rol.fijo && (
            <p className="mx-5 mt-4 flex items-start gap-2 rounded-lg bg-hueso px-3.5 py-2.5 text-[13px] text-tinta/75">
              <Lock aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                {soyAdmin ? "Lo cambia solo un Admin, y afecta a todos los líderes." : "Lo cambia solo un Admin: tú lo ves, pero no lo cambias."}{" "}
                <strong className="font-semibold text-tinta">Roles y accesos</strong> no se le quita.
              </span>
            </p>
          )}
          {esMio && !rol.archivado && (
            <p className="mx-5 mt-4 flex items-start gap-2 rounded-lg border border-tinta/10 bg-crema/60 px-3.5 py-2.5 text-[13px] text-tinta/70">
              <Lock aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                Es <strong className="font-semibold text-tinta">tu propio rol</strong>: sus módulos los cambia un líder.
              </span>
            </p>
          )}
          {editable && borrador.length === 0 && cuentasDelElegido.length > 0 && (
            <Aviso
              tono="atencion"
              className="mx-5 mt-4"
              titulo={cuentasDelElegido.length === 1 ? "1 cuenta no ve ningún módulo." : `${cuentasDelElegido.length} cuentas no ven ningún módulo.`}
            >
              Enciende los módulos que necesitan (Inicio incluido), o asígnales otro rol.
            </Aviso>
          )}
          {rol.limitadoComoHoy && (
            <Aviso tono="atencion" className="mx-5 mt-4" titulo="Pendiente de una decisión (ADR-0161 B2d).">
              Este rol ve sus módulos como hoy, pero todavía no cierra caja, no ajusta stock y no edita el catálogo aunque vea Caja, Existencias o
              Productos. Cuando se decida, se levanta este límite o se apagan esos módulos.
            </Aviso>
          )}
          {editable && (
            <div className="flex flex-wrap items-center gap-2 px-5 pt-4">
              <label id={`pantalla-principal-${rol.id}-etiqueta`} htmlFor={`pantalla-principal-${rol.id}`} className="label-cayla shrink-0 text-[11px] text-tinta/65">
                Pantalla al entrar
              </label>
              {/* Combo del sistema (ADR-0209), no el <select> del navegador: misma caja y misma lista que el resto del ERP. */}
              <Desplegable
                id={`pantalla-principal-${rol.id}`}
                idEtiqueta={`pantalla-principal-${rol.id}-etiqueta`}
                forma="caja"
                className="min-w-[200px]"
                valor={pantallaPrincipalBorrador ?? ""}
                onValor={(v) => setPantallaPrincipalBorradores((b) => ({ ...b, [rol.id]: v ? (v as ClaveModulo) : null }))}
                opciones={[
                  { valor: "", texto: "Automática (la primera que vea)" },
                  ...pantallasElegibles(borrador).map((m) => ({ valor: m.clave, texto: m.nombre })),
                ]}
              />
            </div>
          )}

          <div className="space-y-4 px-5 pb-5 pt-4">
            {/* La ayuda aparece al tocar: qué incluye el módulo tocado, en una línea (propuesta del 2026-10-05). */}
            <p role="status" className="min-h-[2.75rem] rounded-xl bg-hueso px-4 py-2.5 text-[13.5px] leading-snug text-tinta/75">
              {ayuda ? (
                <>
                  <strong className="font-semibold text-tinta">{ayuda.nombre}:</strong> {ayuda.incluye}.
                </>
              ) : editable ? (
                "Toca un módulo para encenderlo o apagarlo. Aquí verás qué incluye."
              ) : (
                "Toca un módulo para ver qué incluye."
              )}
            </p>
            <p className="text-[13px] text-tinta/65">
              Ve <strong className="font-semibold text-tinta">{borrador.length}</strong> de {rol.fijo ? `${MODULOS.length} módulos` : `${DELEGABLES} módulos que se pueden dar`}
            </p>
            {modulosPorGrupo().map(({ grupo, modulos }) => {
              // ADR-0178: «Todos» solo mueve lo que quien mira puede dar; el Líder (ADR-0253) todo menos Roles y accesos.
              const delegables = rol.fijo ? modulos : modulos.filter(esDelegable);
              const mios = delegables.filter((m) => (rol.fijo ? m.clave !== MODULO_FIJO_DEL_LIDER : fueraDeLoMio([m.clave], misModulos).length === 0));
              const todoEncendido = mios.length > 0 && mios.every((m) => borrador.includes(m.clave));
              return (
                <div key={grupo}>
                  <div className="mb-2 flex items-baseline justify-between gap-3">
                    <h3 className="text-[11.5px] font-bold uppercase tracking-[0.1em] text-taupe-profundo">{grupo}</h3>
                    {editable && mios.length > 0 && (
                      <button
                        type="button"
                        className="btn-cayla btn-enlace text-[12.5px]"
                        onClick={() =>
                          ponerBorrador(
                            alternarGrupo(borrador, grupo, !todoEncendido, rol.fijo).filter((c) => borrador.includes(c) || fueraDeLoMio([c], misModulos).length === 0),
                          )
                        }
                      >
                        {todoEncendido ? "Quitar todos" : "Todos"}
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2 @[520px]:grid-cols-3 @[760px]:grid-cols-4">
                    {modulos.map((m) => {
                      const on = veModulo({ modulos: borrador }, m.clave);
                      const control = controlDe(rol, m, quien, on);
                      const marca = cambios.suma.includes(m.clave) ? "suma" : cambios.quita.includes(m.clave) ? "quita" : null;
                      const tocable = control.tipo === "interruptor" && control.editable;
                      return (
                        <button
                          key={m.clave}
                          type="button"
                          aria-pressed={on}
                          aria-label={`${m.nombre}: ${on ? "lo ve" : "no lo ve"}${control.tipo === "candado" ? ` (${control.texto})` : ""}`}
                          onClick={() => {
                            setAyudaId(m.clave);
                            if (tocable) ponerBorrador(alternarModulo(borrador, m.clave, rol.fijo));
                          }}
                          className={`relative grid min-h-[86px] content-between gap-2 rounded-xl border p-3 text-left text-[13.5px] font-semibold leading-tight transition-colors duration-200 ease-cayla ${
                            on
                              ? "border-tinta bg-tinta text-crema"
                              : control.tipo === "candado"
                                ? "border-dashed border-taupe/60 text-tinta/55"
                                : "border-sand text-tinta hover:border-taupe"
                          } ${tocable ? "" : "cursor-default"}`}
                        >
                          <IconoModulo clave={m.clave} className="h-5 w-5" />
                          <span>{m.nombre}</span>
                          {control.tipo === "candado" && (
                            <span className="flex items-center gap-1 text-[11px] font-normal">
                              <Lock aria-hidden className="h-3 w-3" /> {control.texto}
                            </span>
                          )}
                          {marca && (
                            <span
                              title={marca === "suma" ? "Se suma al guardar" : "Se quita al guardar"}
                              className={`anim-revelar absolute right-2.5 top-2.5 h-2.5 w-2.5 rounded-full ${marca === "suma" ? "bg-verde" : "bg-rojo"}`}
                            />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <aside
          aria-label="Efecto del rol"
          className="grid gap-4 self-start @[640px]:grid-cols-2 @[980px]:sticky @[980px]:top-20 @[980px]:max-h-[calc(100vh-6rem)] @[980px]:grid-cols-1 @[980px]:overflow-y-auto"
        >
          <VistaPreviaMenu
            todo={borrador.length === MODULOS.length}
            menu={menu}
            conCambios={conCambios}
            ubicacion={ubicacionPrevia}
            onUbicacion={setUbicacionPrevia}
          />
          <details className="card-cayla group">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 [&::-webkit-details-marker]:hidden">
              <span>
                <span className="font-display block text-lg text-tinta">Siempre solo del líder</span>
                <span className="block text-xs text-tinta/60">{SIEMPRE_SOLO_LIDER.length} acciones que ningún rol hereda</span>
              </span>
              <ChevronDown aria-hidden className="h-4 w-4 text-tinta/50 transition-transform duration-200 ease-cayla group-open:rotate-180" />
            </summary>
            <ul className="space-y-2.5 px-5 pb-4">
              {SIEMPRE_SOLO_LIDER.map((x) => (
                <li key={x.que} className="flex items-start gap-2">
                  <Lock aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-taupe-profundo" />
                  <span className="min-w-0">
                    <span className="block text-[13px] leading-snug text-tinta/85">{x.que}</span>
                    <span className="block text-[11px] text-tinta/45">{x.origen}</span>
                  </span>
                </li>
              ))}
            </ul>
          </details>
        </aside>
      </div>

      <BarraFija
        visible={conCambios}
        resumen={
          <>
            <strong className="font-semibold text-tinta">{nCambios === 1 ? "1 cambio" : `${nCambios} cambios`}</strong> en «{rol.nombre}»
            {cuentasDelElegido.length > 0 && ` · afecta a ${cuentasDelElegido.length === 1 ? "1 cuenta" : `${cuentasDelElegido.length} cuentas`}`}
            {responsable.motivo && <span className="block text-[12px] text-rojo-profundo">{responsable.motivo}</span>}
          </>
        }
        acciones={
          <>
            <Boton type="button" peso="discreto" onClick={() => setBorradores((b) => sinBorrador(b, rol.id))} disabled={guardando}>
              Descartar
            </Boton>
            <Boton type="button" peso="primario" onClick={guardar} cargando={guardando} disabled={!responsable.listo} title={responsable.motivo ?? undefined}>
              {guardando ? "Guardando…" : "Guardar cambios"}
            </Boton>
          </>
        }
      />

      {modal?.tipo === "nuevo" && (
        <NuevoRolModal
          responsable={responsable}
          titulo="Nuevo rol"
          subtitulo="Nace sin módulos: después enciendes los que debe ver."
          nombreInicial=""
          onClose={() => setModal(null)}
          onConfirmar={async (nombre) => {
            const r = await ejecutar("crear el rol", (f) => acciones.crear(nombre, undefined, f), `Rol «${nombre}» creado`);
            if (r?.id) setElegidoId(r.id);
            return !!r;
          }}
        />
      )}
      {modal?.tipo === "duplicar" && (
        <NuevoRolModal
          responsable={responsable}
          titulo={`Duplicar «${modal.rol.nombre}»`}
          subtitulo={
            modal.rol.fijo
              ? "Nace con los módulos que hoy ve el Líder. Lo que es siempre solo del líder no se copia."
              : "Nace con los mismos módulos. Después lo ajustas sin tocar el original."
          }
          nombreInicial={nombreDeCopia(modal.rol.nombre, vigentes.map((r) => r.nombre))}
          onClose={() => setModal(null)}
          onConfirmar={async (nombre) => {
            const r = await ejecutar("duplicar el rol", (f) => acciones.crear(nombre, modal.rol.id, f), `Rol «${nombre}» creado`);
            if (r?.id) setElegidoId(r.id);
            return !!r;
          }}
        />
      )}
      {modal?.tipo === "renombrar" && (
        <RenombrarRolModal
          responsable={responsable}
          rol={modal.rol}
          onClose={() => setModal(null)}
          onConfirmar={async (nombre, descripcion) => !!(await ejecutar("renombrar el rol", (f) => acciones.renombrar(modal.rol.id, nombre, descripcion, f), "Rol actualizado"))}
        />
      )}
      {modal?.tipo === "archivar" && (
        <ArchivarRolModal
          responsable={responsable}
          rol={modal.rol}
          onClose={() => setModal(null)}
          onConfirmar={async () => {
            const ok = !!(await ejecutar("archivar el rol", (f) => acciones.archivar(modal.rol.id, f), `«${modal.rol.nombre}» archivado`));
            if (ok) setElegidoId(vigentes.find((r) => r.id !== modal.rol.id && r.clave === "integrante")?.id ?? "");
            return ok;
          }}
        />
      )}
      {modal?.tipo === "asignar" && cuentas && (
        <AsignarRolModal
          responsable={responsable}
          roles={rolesAsignables(roles, undefined, soyAdmin, misModulos)}
          cuentas={cuentasAsignables(cuentas, modal.rol, yoId, soyAdmin, misModulos, fueraDeAlcance)}
          ubicaciones={ubicaciones}
          rolFijo={modal.rol}
          admins={admins}
          onClose={() => setModal(null)}
          onConfirmar={async (rolId, cuenta, ubicacionId) =>
            !!(await ejecutar("asignar el rol", (f) => acciones.asignar(rolId, cuenta, ubicacionId, f), `${cuenta.nombre} ahora tiene «${modal.rol.nombre}»`))
          }
        />
      )}
      {modal?.tipo === "cuentas" && <CuentasDelRolModal rol={modal.rol} cuentas={cuentasDe(modal.rol.id)} onClose={() => setModal(null)} />}
    </div>
  );
}

/** La línea de cada tarjeta: para qué es el rol, en pocas palabras. */
function lineaDe(rol: RolVista): string {
  if (rol.fijo) return "Ve todo y administra el equipo.";
  if (rol.clave === "integrante") return "El que recibe quien recién entra.";
  if (familiaDeRol(rol) === "terminal") return "Para las terminales de tienda.";
  return rol.descripcion ?? "Rol a medida.";
}

/**
 * Los roles en tarjetas (propuesta del 2026-10-05, pantalla 4): cada uno se reconoce por quiénes lo tienen y qué ve (los íconos
 * de sus módulos y una barra). Reemplaza la lista lateral por familias. Tocar una abre su editor abajo.
 */
function TarjetasRoles({
  roles,
  archivados,
  elegidoId,
  cuentasDe,
  sinGuardar,
  verArchivados,
  onVerArchivados,
  onElegir,
  onNuevo,
}: {
  roles: RolVista[];
  archivados: RolVista[];
  elegidoId: string;
  /** `null` = no se pudieron leer las cuentas: las tarjetas salen sin caras. */
  cuentasDe: ((id: string) => CuentaConRol[]) | null;
  sinGuardar: (id: string) => boolean;
  verArchivados: boolean;
  onVerArchivados: () => void;
  onElegir: (id: string) => void;
  onNuevo: () => void;
}) {
  return (
    <section aria-label="Roles" className="space-y-2.5">
      <div className="grid gap-2.5 @[560px]:grid-cols-2 @[900px]:grid-cols-3 @[1240px]:grid-cols-4">
        {roles.map((r) => (
          <TarjetaRol key={r.id} rol={r} elegido={r.id === elegidoId} cuentas={cuentasDe ? cuentasDe(r.id) : null} sinGuardar={sinGuardar(r.id)} onElegir={() => onElegir(r.id)} />
        ))}
        <button
          type="button"
          onClick={onNuevo}
          className="grid min-h-[150px] place-content-center justify-items-center gap-1.5 rounded-2xl border border-dashed border-taupe/60 text-[14px] font-semibold text-taupe transition-colors duration-200 ease-cayla hover:border-taupe hover:text-tinta"
        >
          <Plus aria-hidden className="h-6 w-6" strokeWidth={1.6} />
          Nuevo rol
        </button>
      </div>
      {archivados.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <button type="button" className="btn-cayla btn-enlace text-[13px]" aria-expanded={verArchivados} onClick={onVerArchivados}>
            Archivados ({archivados.length}) {verArchivados ? "▴" : "▾"}
          </button>
          {verArchivados &&
            archivados.map((r) => (
              <button key={r.id} type="button" className="pildora-cayla" aria-pressed={r.id === elegidoId} onClick={() => onElegir(r.id)}>
                {r.nombre}
              </button>
            ))}
        </div>
      )}
    </section>
  );
}

function TarjetaRol({ rol, elegido, cuentas, sinGuardar, onElegir }: { rol: RolVista; elegido: boolean; cuentas: CuentaConRol[] | null; sinGuardar: boolean; onElegir: () => void }) {
  const n = rol.modulos.length;
  // El Líder se mide contra TODOS los módulos (también los que no se delegan); los demás, contra los que se pueden dar.
  const de = rol.fijo ? MODULOS.length : DELEGABLES;
  const aviso = cuentas === null ? null : avisoDelRol(rol, cuentas.length);
  const muestra = rol.modulos.filter((m) => m !== "inicio");
  return (
    <button
      type="button"
      aria-pressed={elegido}
      onClick={onElegir}
      className={`grid content-start gap-2.5 rounded-2xl border p-4 text-left transition-colors duration-200 ease-cayla ${
        elegido ? "border-tinta bg-papel shadow-[inset_0_-2px_0_var(--color-rojo)]" : "border-sand bg-papel hover:border-taupe"
      }`}
    >
      <span className="flex items-start justify-between gap-2">
        <span className="font-display text-[22px] leading-tight text-tinta">
          {rol.nombre}
          {sinGuardar && <span className="ml-1.5 align-top text-base text-rojo" title="Cambios sin guardar">•</span>}
        </span>
        {aviso === "sin_modulos" ? (
          <span className="shrink-0 rounded-full bg-ambar/15 px-2 py-px text-[10.5px] font-semibold text-ambar-profundo">Sin módulos</span>
        ) : aviso === "sin_uso" ? (
          <span className="shrink-0 rounded-full bg-tinta/[0.06] px-2 py-px text-[10.5px] font-semibold text-tinta/60">Sin uso</span>
        ) : null}
      </span>
      <span className="text-[13px] leading-snug text-tinta/65">{lineaDe(rol)}</span>
      <span aria-hidden className="flex flex-wrap gap-1">
        {muestra.slice(0, 8).map((m) => (
          <span key={m} className="grid h-7 w-7 place-items-center rounded-lg bg-hueso text-tinta/70">
            <IconoModulo clave={m} className="h-3.5 w-3.5" />
          </span>
        ))}
        {muestra.length > 8 && <span className="grid h-7 place-items-center px-1 text-[11.5px] font-semibold text-tinta/60">+{muestra.length - 8}</span>}
      </span>
      <span aria-hidden className="block h-1.5 overflow-hidden rounded-full bg-hueso">
        <span className={`block h-full rounded-full transition-[width] duration-500 ease-cayla ${rol.fijo ? "bg-taupe" : "bg-tinta"}`} style={{ width: `${Math.round((n / de) * 100)}%` }} />
      </span>
      <span className="flex items-center justify-between gap-2 text-[12.5px] text-tinta/60">
        <span className="flex" aria-hidden>
          {(cuentas ?? []).slice(0, 4).map((c) => (
            <span
              key={`${c.tipo}:${c.id}`}
              className={`-ml-1.5 grid h-6 w-6 place-items-center rounded-full border-2 border-papel text-[9.5px] font-semibold first:ml-0 ${c.tipo === "terminal" ? "bg-tinta/10 text-tinta/70" : "bg-sand text-tinta"}`}
            >
              {iniciales(c.nombre)}
            </span>
          ))}
        </span>
        <span>
          {rol.fijo && n === de ? "Ve todo" : `${n} de ${de} módulos`}
          {cuentas !== null && ` · ${cuentas.length === 0 ? "sin cuentas" : cuentas.length === 1 ? "1 cuenta" : `${cuentas.length} cuentas`}`}
        </span>
      </span>
    </button>
  );
}

/** «Así queda su menú»: el lateral con el borrador, marcando en verde lo que se suma y tachado lo que se quita. */
function VistaPreviaMenu({
  todo,
  menu,
  conCambios,
  ubicacion,
  onUbicacion,
}: {
  /** Ve todos los módulos (el Líder al que no se le quitó nada). */
  todo: boolean;
  menu: FilaMenuConCambios[];
  conCambios: boolean;
  ubicacion: "tienda" | "taller";
  onUbicacion: (u: "tienda" | "taller") => void;
}) {
  const estilo = (c: FilaMenuConCambios["cambio"]) =>
    c === "suma" ? "anim-revelar rounded bg-verde/15 text-verde-profundo" : c === "quita" ? "text-tinta/40 line-through" : "";
  return (
    <section className="card-cayla px-5 py-4">
      <h3 className="font-display text-lg text-tinta">Así queda su menú</h3>
      <p className="mt-0.5 text-xs text-tinta/60">
        {todo && !conCambios ? "Ve todo el menú." : conCambios ? "Así quedará al guardar. Lo marcado es lo que cambia." : "Lo que verá en el lateral al entrar."}
      </p>
      <ul className="mt-3 space-y-2 rounded-lg border border-tinta/10 bg-crema/60 px-3 py-3">
        {menu.map((f) => (
          <li key={f.etiqueta}>
            <span className={`inline-block px-1 text-sm font-semibold text-tinta ${estilo(f.cambio)}`}>{f.etiqueta}</span>
            {f.hijas.length > 0 && (
              <ul className="mt-0.5 space-y-0.5 border-l border-tinta/10 pl-3">
                {f.hijas.map((h) => (
                  <li key={h.etiqueta} className={`px-1 text-[13px] text-tinta/70 ${estilo(h.cambio)}`}>
                    {h.etiqueta}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
        {menu.every((f) => f.etiqueta === "Inicio") && <li className="text-[13px] italic text-tinta/60">Sin módulos: solo Inicio. Enciende uno y aparecerá aquí.</li>}
      </ul>
      {conCambios && (
        <p className="mt-2 flex gap-3 text-[11.5px] text-tinta/60">
          <span className="inline-flex items-center gap-1"><i className="block h-2.5 w-2.5 rounded-sm bg-verde/40" /> Se suma</span>
          <span className="inline-flex items-center gap-1"><i className="block h-2.5 w-2.5 rounded-sm bg-tinta/20" /> Se quita</span>
        </p>
      )}
      <div className="mt-3 space-y-1.5 text-xs text-tinta/60">
        <span className="block">Cómo lo ve parado en</span>
        {/* La misma vista previa desde otro lugar: el segmento de modo del sistema (ADR-0358). */}
        <SegmentoDeslizante
          forma="modo"
          etiqueta="Dónde está parado"
          valor={ubicacion}
          onCambio={(k) => onUbicacion(k as "tienda" | "taller")}
          opciones={[
            { clave: "tienda", etiqueta: "Una tienda" },
            { clave: "taller", etiqueta: "El Taller" },
          ]}
        />
      </div>
    </section>
  );
}

/** Quién tiene el rol, con buscador: con muchas cuentas el modal no crece, se busca. */
function CuentasDelRolModal({ rol, cuentas, onClose }: { rol: RolVista; cuentas: CuentaConRol[]; onClose: () => void }) {
  const [q, setQ] = useState("");
  const MAX = 8;
  const norm = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const filtradas = cuentas.filter((c) => norm(`${c.nombre} ${c.ubicacion ?? ""}`).includes(norm(q.trim())));
  return (
    <Modal
      titulo={rol.nombre}
      subtitulo={`${cuentas.length === 1 ? "1 cuenta tiene" : `${cuentas.length} cuentas tienen`} este rol. Para cambiar el de una, usa «Asignar» o su fila en Cuentas.`}
      ancho="max-w-md"
      onClose={onClose}
    >
      <div className="mt-4 space-y-2">
        <Buscador
          autoFocus
          valor={q}
          onCambio={setQ}
          placeholder={`Buscar entre estas ${cuentas.length} cuentas…`}
          etiqueta="Buscar cuenta"
        />
        <ul className="h-[320px] overflow-y-auto">
          {filtradas.slice(0, MAX).map((c) => (
            <li key={`${c.tipo}:${c.id}`} className="flex items-center gap-3 border-b border-tinta/5 px-1 py-2.5 text-sm">
              <span className={`grid h-7 w-7 place-items-center rounded-full text-[10px] font-semibold ${c.tipo === "terminal" ? "bg-tinta/10 text-tinta/70" : "bg-sand text-tinta"}`}>
                {iniciales(c.nombre)}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-tinta">{c.nombre}</span>
                <span className="block text-xs text-tinta/60">
                  {c.tipo === "terminal" ? "Terminal" : "Persona"}
                  {c.ubicacion ? ` · ${c.ubicacion}` : ""}
                  {c.estado !== "activo" ? ` · ${c.estado}` : ""}
                </span>
              </span>
            </li>
          ))}
          {filtradas.length === 0 && (
            <li className="py-6">
              <Vacio tamano="chico" icono={<SearchX />} accion={{ texto: "Borrar la búsqueda", onClick: () => setQ("") }}>
                Ninguna coincide con «{q}».
              </Vacio>
            </li>
          )}

          {filtradas.length > MAX && <li className="px-1 py-2 text-xs text-tinta/60">Y {filtradas.length - MAX} más. Escribe para encontrar a alguien.</li>}
        </ul>
      </div>
    </Modal>
  );
}
