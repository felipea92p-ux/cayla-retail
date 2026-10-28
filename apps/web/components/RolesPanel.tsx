"use client";

import { useState } from "react";
import { Chip } from "@/components/ui/Chip";
import { BarraAvance } from "@/components/ui/BarraAvance";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, Lock, Minus, Plus, SearchX, ShieldCheck, Users } from "lucide-react";
import { avisar } from "@/components/ui/Avisos";
import { BarraFija } from "@/components/ui/BarraFija";
import { Boton, Desplegable } from "@/components/ui/campos";
import { MenuAcciones, type ItemMenu } from "@/components/ui/MenuAcciones";
import { Modal } from "@/components/ui/Modal";
import { SegmentoDeslizante } from "@/components/ui/SegmentoDeslizante";
import { ArchivarRolModal, AsignarRolModal, NuevoRolModal, RenombrarRolModal } from "@/components/RolesModales";
import { ComboResponsable } from "@/components/ComboResponsable";
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
  hayCambios,
  modulosPorGrupo,
  motivoParaNoArchivar,
  motivoParaNoGuardar,
  nombreDeCopia,
  pantallaPrincipalValida,
  pantallasElegibles,
  rolesAsignables,
  veModulo,
  type CuentaConRol,
  type GuardadoLocal,
  type RolVista,
} from "@/lib/roles-reglas";
import { Aviso } from "@/components/ui/Aviso";
import { AvatarPersona, PilaPersonas } from "@/components/ui/AvatarPersona";
import { Buscador } from "@/components/ui/Buscador";
import { Vacio } from "@/components/ui/Vacio";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { EnlaceVer } from "@/components/ui/EnlaceVer";

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


function sinBorrador<T>(b: Record<string, T>, id: string): Record<string, T> {
  const copia = { ...b };
  delete copia[id];
  return copia;
}

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
    <div className={`@container space-y-4 ${conCambios ? "pb-24" : ""}`}>
      <div className="flex flex-wrap items-center justify-end gap-3">
        <div className="w-full max-w-md" data-guia="roles.responsable">
          {/* UN combo para toda la sección (regla 10 de CLAUDE.md). El mismo control se ve en cada modal y apaga
              «Guardar cambios» si falta. */}
          <ComboResponsable control={responsable} enLinea deshabilitado={guardando} />
        </div>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 @[900px]:grid-cols-[17rem_minmax(0,1fr)] @[900px]:items-start">
        <ListaDeRoles
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

        <section aria-label={`Rol ${rol.nombre}`} className="card-cayla min-w-0 overflow-hidden">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-sand px-5 py-3.5" data-guia="roles.cabecera">
            <h2 className="font-display text-[28px] leading-tight text-tinta">{rol.nombre}</h2>
            {rol.archivado && <Chip tono="apagado" tachado={false}>Archivado</Chip>}
            {rol.fijo && !rol.archivado && (
              <Chip tono="neutro" versalitas={false} title="Ve todo, también cada módulo nuevo. Roles y accesos no se le quita.">
                <Lock aria-hidden className="h-3 w-3" /> {soyAdmin ? "Lo cambia un Admin" : "Solo Admin"}
              </Chip>
            )}
            {esMio && !rol.archivado && (
              <Chip tono="neutro" versalitas={false} title="Es tu propio rol: sus módulos los cambia un líder.">
                <Lock aria-hidden className="h-3 w-3" /> Tu rol
              </Chip>
            )}
            {cuentas &&
              (cuentasDelElegido.length === 0 ? (
                <Chip tono="neutro" versalitas={false}>Sin cuentas</Chip>
              ) : (
                <span className="flex items-center gap-2">
                  <PilaPersonas mas={Math.max(0, cuentasDelElegido.length - 5)}>
                    {cuentasDelElegido.slice(0, 5).map((c) => (
                      <AvatarPersona key={`${c.tipo}:${c.id}`} personaId={null} nombre={c.nombre} tamano={32} terminal={c.tipo === "terminal"} />
                    ))}
                  </PilaPersonas>
                  <EnlaceVer onClick={() => setModal({ tipo: "cuentas", rol })}>
                    {cuentasDelElegido.length === 1 ? "1 cuenta" : `${cuentasDelElegido.length} cuentas`}
                  </EnlaceVer>
                </span>
              ))}
            <span className="ml-auto flex items-center gap-2">
              {!rol.archivado && puedeAsignarRol(rol, soyAdmin, misModulos) && (
                <Boton type="button" peso="discreto" className="px-3 py-2" onClick={() => setModal({ tipo: "asignar", rol })} disabled={!cuentas}>
                  Asignar
                </Boton>
              )}
              <MenuAcciones etiqueta={`Más acciones de ${rol.nombre}`} items={itemsMenu} />
            </span>
          </div>

          {editable && borrador.length === 0 && cuentasDelElegido.length > 0 && (
            <Aviso
              tono="atencion"
              className="mx-5 mt-4"
              titulo={cuentasDelElegido.length === 1 ? "1 cuenta no ve ningún módulo" : `${cuentasDelElegido.length} cuentas no ven ningún módulo`}
            >
              Enciende algunos, o asígnales otro rol.
            </Aviso>
          )}
          {rol.limitadoComoHoy && (
            <Aviso tono="atencion" className="mx-5 mt-4" titulo="Pendiente de una decisión (ADR-0161 B2d)">
              Ve sus módulos, pero no cierra caja, no ajusta stock ni edita el catálogo.
            </Aviso>
          )}
          {editable && (
            <div className="campo flex flex-wrap items-center gap-2 px-5 pt-4" data-guia="roles.pantalla">
              <label id={`pantalla-principal-${rol.id}-etiqueta`} htmlFor={`pantalla-principal-${rol.id}`} className="campo-etiqueta shrink-0">
                Pantalla al entrar
              </label>
              {/* Combo del sistema (ADR-0209), no el <select> del navegador: misma caja y misma lista que el resto del ERP. */}
              <Desplegable
                id={`pantalla-principal-${rol.id}`}
                idEtiqueta={`pantalla-principal-${rol.id}-etiqueta`}
                forma="campo"
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

          <div data-guia="roles.modulos">
            <p className="px-5 pb-1 pt-4 text-[13px] text-tinta/65">
              Ve <strong className="font-semibold text-tinta">{borrador.length}</strong> de {rol.fijo ? `${MODULOS.length} módulos` : `${DELEGABLES} que se pueden dar`}
              {/* Qué incluye el módulo tocado, en una línea; si no hay ninguno tocado, no ocupa lugar (el nombre del módulo lo lleva en su `title`). */}
              {ayuda && (
                <span role="status" className="ml-2 text-tinta/75">
                  · <strong className="font-semibold text-tinta">{ayuda.nombre}:</strong> {ayuda.incluye}.
                </span>
              )}
            </p>
            {modulosPorGrupo().map(({ grupo, modulos }, i) => {
              // ADR-0178: «Todos» solo mueve lo que quien mira puede dar; el Líder (ADR-0253) todo menos Roles y accesos.
              const delegables = rol.fijo ? modulos : modulos.filter(esDelegable);
              const mios = delegables.filter((m) => (rol.fijo ? m.clave !== MODULO_FIJO_DEL_LIDER : fueraDeLoMio([m.clave], misModulos).length === 0));
              const todoEncendido = mios.length > 0 && mios.every((m) => borrador.includes(m.clave));
              const encendidos = modulos.filter((m) => borrador.includes(m.clave)).length;
              return (
                <div key={grupo} className={`grid gap-x-4 gap-y-1.5 px-5 py-3 @[640px]:grid-cols-[8.5rem_minmax(0,1fr)] ${i > 0 ? "border-t border-sand" : ""}`}>
                  <div className="flex items-baseline justify-between gap-3 @[640px]:block">
                    <h3 className="text-[11.5px] font-bold uppercase tracking-[0.1em] text-taupe-profundo">
                      {grupo} <span className="font-normal normal-case tracking-normal text-tinta/60">{encendidos}/{modulos.length}</span>
                    </h3>
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
                  <div className="flex flex-wrap gap-1.5">
                    {modulos.map((m) => {
                      const on = veModulo({ modulos: borrador }, m.clave);
                      const control = controlDe(rol, m, quien, on);
                      const marca = cambios.suma.includes(m.clave) ? "suma" : cambios.quita.includes(m.clave) ? "quita" : undefined;
                      const tocable = control.tipo === "interruptor" && control.editable;
                      return (
                        <button
                          key={m.clave}
                          type="button"
                          className="pildora-cayla"
                          aria-pressed={on}
                          data-cambio={marca}
                          data-bloq={control.tipo === "candado" ? "si" : undefined}
                          title={`${m.incluye}${control.tipo === "candado" ? ` · ${control.texto}` : ""}${marca ? (marca === "suma" ? " · se suma al guardar" : " · se quita al guardar") : ""}`}
                          aria-label={`${m.nombre}: ${on ? "lo ve" : "no lo ve"}${control.tipo === "candado" ? ` (${control.texto})` : ""}${marca ? (marca === "suma" ? ", se suma al guardar" : ", se quita al guardar") : ""}`}
                          onClick={() => {
                            setAyudaId(m.clave);
                            if (tocable) ponerBorrador(alternarModulo(borrador, m.clave, rol.fijo));
                          }}
                        >
                          {marca === "quita" ? <Minus aria-hidden className="h-3.5 w-3.5" /> : on ? <Check aria-hidden className="h-3.5 w-3.5" /> : null}
                          {m.nombre}
                          {control.tipo === "candado" && <Lock aria-hidden className="h-3 w-3" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          <details className="group border-t border-sand">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-3 text-[13px] text-tinta/70 [&::-webkit-details-marker]:hidden">
              <span>
                Siempre solo del líder <span className="text-tinta/60">· {SIEMPRE_SOLO_LIDER.length} acciones que ningún rol hereda</span>
              </span>
              <ChevronDown aria-hidden className="h-4 w-4 text-tinta/60 transition-transform duration-200 ease-cayla group-open:rotate-180" />
            </summary>
            <ul className="space-y-2 px-5 pb-4">
              {SIEMPRE_SOLO_LIDER.map((x) => (
                <li key={x.que} className="flex items-start gap-2">
                  <Lock aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-taupe-profundo" />
                  <span className="min-w-0">
                    <span className="block text-[13px] leading-snug text-tinta/85">{x.que}</span>
                    <span className="block text-[11px] text-tinta/60">{x.origen}</span>
                  </span>
                </li>
              ))}
            </ul>
          </details>
        </section>
      </div>

      <BarraFija
        visible={conCambios}
        resumen={
          <>
            <strong className="font-semibold text-tinta">{nCambios === 1 ? "1 cambio" : `${nCambios} cambios`}</strong> en «{rol.nombre}»
            {cambios.suma.length > 0 && <span className="font-semibold text-verde"> · +{cambios.suma.length} suma</span>}
            {cambios.quita.length > 0 && <span className="font-semibold text-rojo-profundo"> · −{cambios.quita.length} quita</span>}
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
              Guardar cambios
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

/**
 * La lista de roles (maqueta del 2026-10-27, ADR-0540): una fila por rol con su barra de módulos y cuántas cuentas lo tienen. Antes eran
 * tarjetas con íconos y una frase; ahora cabe todo en un costado y el editor lleva el ancho. Tocar una abre su editor al lado.
 */
function ListaDeRoles({
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
  /** `null` = no se pudieron leer las cuentas: las filas salen sin ellas. */
  cuentasDe: ((id: string) => CuentaConRol[]) | null;
  sinGuardar: (id: string) => boolean;
  verArchivados: boolean;
  onVerArchivados: () => void;
  onElegir: (id: string) => void;
  onNuevo: () => void;
}) {
  return (
    <section aria-label="Roles" className="card-cayla space-y-2 p-2 @[900px]:sticky @[900px]:top-20" data-guia="roles.tarjetas">
      <div className="grid auto-cols-[minmax(11rem,1fr)] grid-flow-col gap-0.5 overflow-x-auto @[900px]:grid-flow-row @[900px]:auto-cols-auto @[900px]:overflow-visible">
        {roles.map((r) => (
          <FilaRol key={r.id} rol={r} elegido={r.id === elegidoId} cuentas={cuentasDe ? cuentasDe(r.id) : null} sinGuardar={sinGuardar(r.id)} onElegir={() => onElegir(r.id)} />
        ))}
      </div>
      <Boton type="button" peso="fantasma" className="w-full" onClick={onNuevo} data-guia="roles.nuevo">
        <span className="inline-flex items-center gap-1.5">
          <Plus aria-hidden className="h-4 w-4" /> Nuevo rol
        </span>
      </Boton>
      {archivados.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 px-1">
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

function FilaRol({ rol, elegido, cuentas, sinGuardar, onElegir }: { rol: RolVista; elegido: boolean; cuentas: CuentaConRol[] | null; sinGuardar: boolean; onElegir: () => void }) {
  const n = rol.modulos.length;
  // El Líder se mide contra TODOS los módulos (también los que no se delegan); los demás, contra los que se pueden dar.
  const de = rol.fijo ? MODULOS.length : DELEGABLES;
  const aviso = cuentas === null ? null : avisoDelRol(rol, cuentas.length);
  return (
    <button
      type="button"
      aria-pressed={elegido}
      onClick={onElegir}
      title={rol.descripcion ?? undefined}
      className={`grid content-start gap-1.5 rounded-xl px-3 py-2.5 text-left transition-colors duration-150 ease-cayla ${
        elegido ? "bg-hueso shadow-[inset_3px_0_0_var(--color-rojo)]" : "hover:bg-hueso/60"
      }`}
    >
      <span className="flex items-center gap-1.5 text-[14.5px] font-semibold leading-tight text-tinta">
        {rol.fijo && <Lock aria-hidden className="h-3 w-3 shrink-0 text-taupe" />}
        <span className="truncate">{rol.nombre}</span>
        {sinGuardar && <span className="text-base leading-none text-rojo" title="Cambios sin guardar">•</span>}
        {aviso === "sin_modulos" ? (
          <Chip tono="ambar" versalitas={false} className="ml-auto shrink-0">Sin módulos</Chip>
        ) : aviso === "sin_uso" ? (
          <Chip tono="neutro" versalitas={false} className="ml-auto shrink-0">Sin uso</Chip>
        ) : null}
      </span>
      <span className="flex items-center gap-2 text-xs text-tinta/60">
        {/* Cuántos módulos ve el rol: una medida, no un avance (un rol con todos no está «listo»): siempre en tinta. */}
        <span className="flex-1">
          <BarraAvance pct={(n / de) * 100} alto="fina" tono="tinta" decorativa />
        </span>
        <span className="shrink-0 tabular-nums">
          {n} mód.{cuentas !== null && ` · ${cuentas.length === 1 ? "1 cuenta" : `${cuentas.length} cuentas`}`}
        </span>
      </span>
    </button>
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
      conCerrar
      titulo={rol.nombre}
      subtitulo={`${cuentas.length === 1 ? "1 cuenta tiene" : `${cuentas.length} cuentas tienen`} este rol. Para cambiar el de una, usa «Asignar» o su fila en Cuentas.`}
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
              <AvatarPersona personaId={null} nombre={c.nombre} tamano={32} terminal={c.tipo === "terminal"} />
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
