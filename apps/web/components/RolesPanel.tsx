"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Lock, Search } from "lucide-react";
import { avisar } from "@/components/ui/Avisos";
import { BarraFija } from "@/components/ui/BarraFija";
import { Boton, Interruptor } from "@/components/ui/campos";
import { MenuAcciones, type ItemMenu } from "@/components/ui/MenuAcciones";
import { Modal } from "@/components/ui/Modal";
import { SegmentoDeslizante } from "@/components/ui/SegmentoDeslizante";
import { ArchivarRolModal, AsignarRolModal, NuevoRolModal, RenombrarRolModal } from "@/components/RolesModales";
import { traducirError } from "@/lib/error-escritura";
import type { Ubicacion } from "@/lib/ubicaciones";
import { MODULOS, SIEMPRE_SOLO_LIDER, esDelegable, type ClaveModulo, type Modulo } from "@/lib/modulos";
import { accionesRolesSupabase, type AccionesRoles, type ResultadoRol } from "@/lib/roles-acciones";
import {
  alternarGrupo,
  alternarModulo,
  avisoDelRol,
  cambiosDelBorrador,
  controlDe,
  cuentasAsignables,
  cuentasDelRol,
  familiaDeRol,
  hayCambios,
  menuConCambios,
  modulosFiltrados,
  motivoParaNoArchivar,
  motivoParaNoGuardar,
  nombreDeCopia,
  rolesAsignables,
  veModulo,
  type CuentaConRol,
  type FamiliaRol,
  type FilaMenuConCambios,
  type RolVista,
} from "@/lib/roles-reglas";

// «Roles y accesos» (ADR-0161 B). Rediseño del spike `docs/maquetas/colaboradores-ux-spike-2026-09/` (Felipe, 2026-09-22):
// lista de roles agrupada y con avisos, grupos de módulos plegables con buscador, borrador con barra de guardado, vista previa
// del menú que marca lo que se suma y se quita, y «Comparar roles» (matriz). Cada rol decide SOLO qué módulos ve; quien ve un
// módulo hace todo lo que hay en él, salvo la lista fija «siempre solo del líder». Solo el Líder no se edita (sus módulos),
// pero sí se asigna y se quita, entre líderes. Todo lo que se escribe pasa por RPC (del líder o de quien ve Roles y accesos,
// 20260923131000), que anota `roles_historial`; subir a alguien a Líder o cambiarle el rol a un líder sigue siendo de un líder.

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

function sinBorrador(b: Record<string, ClaveModulo[]>, id: string): Record<string, ClaveModulo[]> {
  const copia = { ...b };
  delete copia[id];
  return copia;
}

function descripcionDe(rol: RolVista): string {
  if (rol.fijo) return "Ve y hace todo, siempre. No se edita para que nunca falte alguien que pueda administrar los accesos.";
  if (rol.clave === "integrante") return "Rol que recibe una persona nueva al darle acceso. Lo que enciendas aquí lo verá desde su primer día.";
  if (rol.archivado) return "Archivado: no se ofrece al asignar roles. Restáuralo para volver a usarlo o editarlo.";
  return rol.descripcion ?? "Rol a medida. Se edita, se duplica y se archiva (nunca se borra).";
}

const FAMILIAS: { clave: FamiliaRol; etiqueta: string; cabecera: string }[] = [
  { clave: "sistema", etiqueta: "Del sistema", cabecera: "Rol del sistema" },
  { clave: "terminal", etiqueta: "Terminales", cabecera: "Rol de terminal" },
  { clave: "a_medida", etiqueta: "A medida", cabecera: "Rol a medida" },
];
const DELEGABLES = MODULOS.filter(esDelegable).length;

export function RolesPanel({
  roles,
  cuentas,
  ubicaciones,
  yoId,
  rolInicialId = null,
  soyLider = true,
  acciones = accionesRolesSupabase,
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
  /** ¿Quien mira es líder? Sin serlo (módulo Roles y accesos) no da el rol Líder ni le cambia el rol a un líder. */
  soyLider?: boolean;
  acciones?: AccionesRoles;
}) {
  const router = useRouter();
  const vigentes = roles.filter((r) => !r.archivado);
  const archivados = roles.filter((r) => r.archivado);
  const [elegidoId, setElegidoId] = useState(
    () => (roles.find((r) => r.id === rolInicialId) ?? vigentes.find((r) => r.clave === "integrante") ?? vigentes[0])?.id ?? "",
  );
  const rol = roles.find((r) => r.id === elegidoId) ?? vigentes[0];
  const [borradores, setBorradores] = useState<Record<string, ClaveModulo[]>>({});
  const [modal, setModal] = useState<Modal | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [verArchivados, setVerArchivados] = useState(false);
  const [vista, setVista] = useState<"rol" | "matriz">("rol");
  const [busqueda, setBusqueda] = useState("");
  const [plegados, setPlegados] = useState<ReadonlySet<string>>(new Set());
  const [ubicacionPrevia, setUbicacionPrevia] = useState<"tienda" | "taller">("tienda");
  const [matrizOcupada, setMatrizOcupada] = useState<string | null>(null);

  const borrador = rol ? (borradores[rol.id] ?? rol.modulos) : [];
  const conCambios = !!rol && hayCambios(rol.modulos, borrador);
  const cambios = rol ? cambiosDelBorrador(rol.modulos, borrador) : { suma: [], quita: [] };
  const nCambios = cambios.suma.length + cambios.quita.length;
  const menu = rol ? menuConCambios(rol, borrador, ubicacionPrevia) : [];
  const cuentasDe = (id: string) => (cuentas ? cuentasDelRol(cuentas, id) : []);

  async function ejecutar(verbo: string, llamada: () => Promise<ResultadoRol>, exito: string): Promise<ResultadoRol | null> {
    const r = await llamada();
    if (r.error) {
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
    const r = await ejecutar("guardar los módulos del rol", () => acciones.guardarModulos(rol.id, borrador), `«${rol.nombre}» quedó guardado`);
    setGuardando(false);
    if (r) setBorradores((b) => sinBorrador(b, rol.id));
  }

  /** Matriz: cada clic guarda al instante (es la vista para comparar y retocar, no para armar un rol desde cero). */
  async function alternarEnMatriz(r: RolVista, m: Modulo) {
    const clave = `${r.id}:${m.clave}`;
    setMatrizOcupada(clave);
    const nuevos = alternarModulo(r.modulos, m.clave);
    // ADR-0161 P6: Colaboradores y Roles y accesos no se encienden en un rol que tienen terminales (la base también lo
    // rechaza; aquí se avisa antes, con los nombres de las terminales).
    const motivo = motivoParaNoGuardar(r.modulos, nuevos, cuentasDe(r.id));
    if (motivo) {
      avisar.error(motivo);
      setMatrizOcupada(null);
      return;
    }
    const encendido = nuevos.includes(m.clave);
    await ejecutar("guardar los módulos del rol", () => acciones.guardarModulos(r.id, nuevos), `${r.nombre}: ${m.nombre} ${encendido ? "encendido" : "apagado"}`);
    setMatrizOcupada(null);
  }

  function elegir(id: string) {
    setElegidoId(id);
    setBusqueda("");
  }

  const ponerBorrador = (modulos: ClaveModulo[]) => {
    if (!rol) return;
    // ADR-0161 P6 (ver arriba): se frena al encender, no al guardar.
    const motivo = motivoParaNoGuardar(borrador, modulos, cuentasDe(rol.id));
    if (motivo) {
      avisar.error(motivo);
      return;
    }
    setBorradores((b) => (hayCambios(rol.modulos, modulos) ? { ...b, [rol.id]: modulos } : sinBorrador(b, rol.id)));
  };

  if (!rol) return <p className="font-display card-cayla py-8 text-center text-base italic text-tinta/65">Todavía no hay roles.</p>;

  const cuentasDelElegido = cuentasDe(rol.id);
  const motivoArchivo = motivoParaNoArchivar(rol, cuentasDelElegido.length);
  const editable = !rol.fijo && !rol.archivado;
  const grupos = modulosFiltrados(busqueda);
  const veCuantos = rol.fijo ? MODULOS.length : borrador.length;

  const itemsMenu: ItemMenu[] = [
    ...(!rol.fijo && !rol.archivado ? [{ clave: "renombrar", etiqueta: "Renombrar", onSelect: () => setModal({ tipo: "renombrar", rol }) }] : []),
    { clave: "duplicar", etiqueta: "Duplicar", onSelect: () => setModal({ tipo: "duplicar", rol }) },
    ...(!rol.esSistema && !rol.archivado && motivoArchivo === null
      ? [{ clave: "archivar", etiqueta: "Archivar", peligro: true, onSelect: () => setModal({ tipo: "archivar", rol }) }]
      : []),
    ...(rol.archivado
      ? [{ clave: "restaurar", etiqueta: "Restaurar", onSelect: () => ejecutar("restaurar el rol", () => acciones.restaurar(rol.id), `«${rol.nombre}» volvió a estar disponible`) }]
      : []),
  ];

  return (
    <div className={`@container space-y-5 ${conCambios ? "pb-24" : ""}`}>
      {/* Tres ideas en vez de un párrafo: lo mínimo para entender la pantalla sin leerla entera. */}
      <ol className="grid gap-2.5 @[760px]:grid-cols-3">
        {[
          ["Un rol es una lista de módulos.", "Quien ve un módulo hace todo lo que hay en él."],
          ["Cada cuenta tiene un solo rol.", "Persona o terminal. Se asigna aquí o desde su fila en Cuentas."],
          ["Algunas cosas son siempre del líder.", "Anular, autorizar sobre el tope… no dependen del rol."],
        ].map(([titulo, texto], i) => (
          <li key={titulo} className="flex items-start gap-3 rounded-xl border border-dashed border-tinta/15 bg-papel/50 px-3.5 py-3">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-tinta text-xs font-semibold text-crema">{i + 1}</span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-tinta">{titulo}</span>
              <span className="block text-[13px] text-tinta/65">{texto}</span>
            </span>
          </li>
        ))}
      </ol>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentoDeslizante
          etiqueta="Cómo ver los roles"
          valor={vista}
          onCambio={(k) => setVista(k as "rol" | "matriz")}
          opciones={[
            { clave: "rol", etiqueta: "Editar por rol" },
            { clave: "matriz", etiqueta: "Comparar roles" },
          ]}
        />
        <p className="text-[13px] text-tinta/60">Lo cambia un líder de equipo o quien tenga Roles y accesos en su rol.</p>
      </div>

      {vista === "matriz" ? (
        <Matriz roles={vigentes} cuentasDe={(id) => cuentasDe(id).length} ocupada={matrizOcupada} onAlternar={alternarEnMatriz} onElegir={(id) => { elegir(id); setVista("rol"); }} />
      ) : (
      <div className="grid gap-5 @[640px]:grid-cols-[240px_minmax(0,1fr)] @[1060px]:grid-cols-[250px_minmax(0,1fr)_300px]">
        <nav aria-label="Roles" className="card-cayla self-start p-2 @[640px]:sticky @[640px]:top-20">
          <div className="flex items-center justify-between px-2 pb-1 pt-1.5">
            <span className="label-cayla text-[11px] text-tinta/60">Roles</span>
            <Boton type="button" peso="fantasma" className="px-2 py-1 text-xs" onClick={() => setModal({ tipo: "nuevo" })}>
              + Nuevo
            </Boton>
          </div>
          {FAMILIAS.map((f) => {
            const deLaFamilia = vigentes.filter((r) => familiaDeRol(r) === f.clave);
            if (deLaFamilia.length === 0) return null;
            return (
              <div key={f.clave} className="border-t border-tinta/5 pt-1.5 first-of-type:border-0">
                <p className="px-3 pb-0.5 pt-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-taupe-profundo">{f.etiqueta}</p>
                {deLaFamilia.map((r) => (
                  <FilaRol
                    key={r.id}
                    rol={r}
                    elegido={r.id === rol.id}
                    cuentas={cuentas ? cuentasDe(r.id).length : null}
                    sinGuardar={!!borradores[r.id] && hayCambios(r.modulos, borradores[r.id])}
                    onElegir={() => elegir(r.id)}
                  />
                ))}
              </div>
            );
          })}
          {archivados.length > 0 && (
            <div className="border-t border-tinta/5 px-2 pb-1 pt-2">
              <button type="button" className="label-cayla text-[11px] text-taupe-profundo hover:text-rojo" aria-expanded={verArchivados} onClick={() => setVerArchivados((v) => !v)}>
                Archivados ({archivados.length}) {verArchivados ? "▴" : "▾"}
              </button>
              {verArchivados && (
                <ul className="mt-1.5 space-y-0.5">
                  {archivados.map((r) => (
                    <li key={r.id}>
                      <button
                        type="button"
                        onClick={() => elegir(r.id)}
                        className={`block w-full truncate rounded-md px-2 py-1.5 text-left text-sm ${r.id === rol.id ? "bg-crema text-tinta" : "text-tinta/60 hover:text-tinta"}`}
                      >
                        {r.nombre}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </nav>

        <section aria-label={`Rol ${rol.nombre}`} className="card-cayla min-w-0 overflow-hidden">
          <div className="border-b border-tinta/10 px-5 py-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 max-w-xl">
                <p className="label-cayla text-[11px] text-tinta/60">{rol.archivado ? "Rol archivado" : FAMILIAS.find((f) => f.clave === familiaDeRol(rol))?.cabecera}</p>
                <h2 className="font-display mt-0.5 text-[28px] leading-tight text-tinta">{rol.nombre}</h2>
                <p className="mt-1 text-sm text-tinta/70">{descripcionDe(rol)}</p>
              </div>
              <div className="flex items-center gap-2">
                {!rol.archivado && (soyLider || !rol.fijo) && (
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
            <p className="mx-5 mt-4 flex items-start gap-2 rounded-lg border border-tinta/10 bg-crema/60 px-3.5 py-2.5 text-[13px] text-tinta/70">
              <Lock aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                Este rol <strong className="font-semibold text-tinta">no se edita</strong>: siempre tiene que haber alguien que pueda dar accesos.
              </span>
            </p>
          )}
          {editable && borrador.length === 0 && cuentasDelElegido.length > 0 && (
            <p className="mx-5 mt-4 rounded-lg bg-ambar/10 px-3.5 py-2.5 text-[13px] text-ambar-profundo">
              <strong className="font-semibold">
                {cuentasDelElegido.length === 1 ? "1 cuenta solo ve Inicio." : `${cuentasDelElegido.length} cuentas solo ven Inicio.`}
              </strong>{" "}
              Enciende los módulos que necesitan, o asígnales otro rol.
            </p>
          )}
          {rol.limitadoComoHoy && (
            <p className="mx-5 mt-4 rounded-lg border border-ambar/30 bg-ambar/10 px-3.5 py-2.5 text-[13px] leading-relaxed text-ambar-profundo">
              <strong className="font-semibold">Pendiente de una decisión (ADR-0161 B2d).</strong> Este rol ve sus módulos como hoy, pero todavía no cierra caja, no
              ajusta stock y no edita el catálogo aunque vea Caja, Existencias o Productos. Cuando se decida, se levanta este límite o se apagan esos módulos.
            </p>
          )}
          {!rol.fijo && !rol.archivado && motivoArchivo && !rol.esSistema && (
            <p className="mx-5 mt-3 text-xs text-tinta/60">Para archivarlo: {motivoArchivo.charAt(0).toLowerCase() + motivoArchivo.slice(1)}</p>
          )}

          <div className="flex flex-wrap items-center gap-3 px-5 pb-2 pt-4">
            <label className="flex min-w-[220px] flex-1 items-center gap-2 rounded-lg border border-tinta/10 bg-crema/60 px-3 py-2 focus-within:border-tinta/40">
              <Search aria-hidden className="h-4 w-4 text-tinta/50" />
              <input
                type="search"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar módulo o acción (ej. «anular», «stock»)"
                aria-label="Buscar módulo o acción"
                autoComplete="off"
                className="w-full bg-transparent text-sm text-tinta outline-none placeholder:text-tinta/50"
              />
            </label>
            <p className="whitespace-nowrap text-[13px] text-tinta/65">
              Ve <strong className="font-semibold text-tinta">{veCuantos}</strong> de {rol.fijo ? MODULOS.length : `${DELEGABLES} módulos que se pueden dar`}
            </p>
          </div>

          <div className="space-y-3 px-5 pb-5 pt-2">
            {grupos.length === 0 && <p className="py-6 text-center text-sm text-tinta/60">Ningún módulo coincide con «{busqueda}».</p>}
            {grupos.map(({ grupo, modulos }) => {
              const abierto = !!busqueda || !plegados.has(grupo);
              const delegables = modulos.filter(esDelegable);
              const encendidos = delegables.filter((m) => veModulo({ fijo: rol.fijo, modulos: borrador }, m.clave)).length;
              const todoEncendido = delegables.length > 0 && encendidos === delegables.length;
              return (
                <div key={grupo} className="overflow-hidden rounded-xl border border-tinta/10">
                  <div className="flex items-center gap-3 bg-crema/70 px-4 py-2.5">
                    <button
                      type="button"
                      aria-expanded={abierto}
                      onClick={() => setPlegados((p) => { const n = new Set(p); if (n.has(grupo)) n.delete(grupo); else n.add(grupo); return n; })}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    >
                      <span className="text-sm font-semibold text-tinta">{grupo}</span>
                      <span aria-hidden className="flex gap-[3px]">
                        {modulos.map((m) => (
                          <i
                            key={m.clave}
                            className={`block h-2 w-2 rounded-[2px] ${
                              !rol.fijo && !esDelegable(m) ? "border border-dashed border-taupe" : veModulo({ fijo: rol.fijo, modulos: borrador }, m.clave) ? "bg-tinta" : "bg-tinta/15"
                            }`}
                          />
                        ))}
                      </span>
                      <span className="text-[12.5px] text-tinta/60">
                        {rol.fijo ? `${modulos.length} de ${modulos.length}` : delegables.length === 0 ? "Solo líder" : `${encendidos} de ${delegables.length}`}
                      </span>
                      <ChevronDown aria-hidden className={`ml-auto h-4 w-4 text-tinta/50 transition-transform duration-200 ease-cayla ${abierto ? "" : "-rotate-90"}`} />
                    </button>
                    {editable && delegables.length > 0 && (
                      <button
                        type="button"
                        onClick={() => ponerBorrador(alternarGrupo(borrador, grupo, !todoEncendido))}
                        className="shrink-0 rounded-full border border-tinta/15 bg-papel px-2.5 py-0.5 text-xs text-tinta/75 hover:border-tinta/40"
                      >
                        {todoEncendido ? "Quitar todo" : "Encender todo"}
                      </button>
                    )}
                  </div>
                  {abierto && (
                    <ul>
                      {modulos.map((m) => {
                        const control = controlDe(rol, m);
                        const on = veModulo({ fijo: rol.fijo, modulos: borrador }, m.clave);
                        const marca = cambios.suma.includes(m.clave) ? "suma" : cambios.quita.includes(m.clave) ? "quita" : null;
                        return (
                          <li
                            key={m.clave}
                            className={`flex items-center justify-between gap-4 border-t border-tinta/5 px-4 py-2.5 transition-colors duration-200 ease-cayla ${marca ? "bg-ambar/[0.07]" : ""}`}
                          >
                            <span className="min-w-0">
                              <span className={`flex flex-wrap items-center gap-2 text-sm ${control.tipo === "candado" ? "text-tinta/60" : "text-tinta"}`}>
                                {m.nombre}
                                {marca && (
                                  <span
                                    className={`anim-revelar rounded-full px-2 py-px text-[10.5px] font-semibold ${marca === "suma" ? "bg-verde/15 text-verde-profundo" : "bg-rojo/10 text-rojo-profundo"}`}
                                  >
                                    {marca === "suma" ? "Se suma" : "Se quita"}
                                  </span>
                                )}
                              </span>
                              <span className="block text-xs text-tinta/60">{m.incluye}</span>
                            </span>
                            {control.tipo === "candado" ? (
                              <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-dashed border-taupe px-2.5 py-0.5 text-[11.5px] text-taupe-profundo">
                                <Lock aria-hidden className="h-3 w-3" /> {control.texto}
                              </span>
                            ) : (
                              <Interruptor
                                activo={on}
                                disabled={!control.editable}
                                onActivo={() => ponerBorrador(alternarModulo(borrador, m.clave))}
                                etiqueta={<span className="sr-only">Ve {m.nombre}</span>}
                              />
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        <aside
          aria-label="Efecto del rol"
          className="grid gap-4 self-start @[640px]:col-span-2 @[640px]:grid-cols-2 @[1060px]:sticky @[1060px]:top-20 @[1060px]:col-span-1 @[1060px]:max-h-[calc(100vh-6rem)] @[1060px]:grid-cols-1 @[1060px]:overflow-y-auto"
        >
          <VistaPreviaMenu
            fijo={rol.fijo}
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
      )}

      <BarraFija
        visible={vista === "rol" && conCambios}
        resumen={
          <>
            <strong className="font-semibold text-tinta">{nCambios === 1 ? "1 cambio" : `${nCambios} cambios`}</strong> en «{rol.nombre}»
            {cuentasDelElegido.length > 0 && ` · afecta a ${cuentasDelElegido.length === 1 ? "1 cuenta" : `${cuentasDelElegido.length} cuentas`}`}
          </>
        }
        acciones={
          <>
            <Boton type="button" peso="discreto" onClick={() => setBorradores((b) => sinBorrador(b, rol.id))} disabled={guardando}>
              Descartar
            </Boton>
            <Boton type="button" peso="primario" onClick={guardar} cargando={guardando}>
              {guardando ? "Guardando…" : "Guardar cambios"}
            </Boton>
          </>
        }
      />

      {modal?.tipo === "nuevo" && (
        <NuevoRolModal
          titulo="Nuevo rol"
          subtitulo="Nace sin módulos: después enciendes los que debe ver."
          nombreInicial=""
          onClose={() => setModal(null)}
          onConfirmar={async (nombre) => {
            const r = await ejecutar("crear el rol", () => acciones.crear(nombre), `Rol «${nombre}» creado`);
            if (r?.id) setElegidoId(r.id);
            return !!r;
          }}
        />
      )}
      {modal?.tipo === "duplicar" && (
        <NuevoRolModal
          titulo={`Duplicar «${modal.rol.nombre}»`}
          subtitulo={
            modal.rol.fijo
              ? "Nace con todos los módulos que se pueden delegar. Lo que es siempre solo del líder no se copia."
              : "Nace con los mismos módulos. Después lo ajustas sin tocar el original."
          }
          nombreInicial={nombreDeCopia(modal.rol.nombre, vigentes.map((r) => r.nombre))}
          onClose={() => setModal(null)}
          onConfirmar={async (nombre) => {
            const r = await ejecutar("duplicar el rol", () => acciones.crear(nombre, modal.rol.id), `Rol «${nombre}» creado`);
            if (r?.id) setElegidoId(r.id);
            return !!r;
          }}
        />
      )}
      {modal?.tipo === "renombrar" && (
        <RenombrarRolModal
          rol={modal.rol}
          onClose={() => setModal(null)}
          onConfirmar={async (nombre, descripcion) => !!(await ejecutar("renombrar el rol", () => acciones.renombrar(modal.rol.id, nombre, descripcion), "Rol actualizado"))}
        />
      )}
      {modal?.tipo === "archivar" && (
        <ArchivarRolModal
          rol={modal.rol}
          onClose={() => setModal(null)}
          onConfirmar={async () => {
            const ok = !!(await ejecutar("archivar el rol", () => acciones.archivar(modal.rol.id), `«${modal.rol.nombre}» archivado`));
            if (ok) setElegidoId(vigentes.find((r) => r.id !== modal.rol.id && r.clave === "integrante")?.id ?? "");
            return ok;
          }}
        />
      )}
      {modal?.tipo === "asignar" && cuentas && (
        <AsignarRolModal
          roles={rolesAsignables(roles, undefined, soyLider)}
          cuentas={cuentasAsignables(cuentas, modal.rol, yoId, soyLider)}
          ubicaciones={ubicaciones}
          rolFijo={modal.rol}
          onClose={() => setModal(null)}
          onConfirmar={async (rolId, cuenta, ubicacionId) =>
            !!(await ejecutar("asignar el rol", () => acciones.asignar(rolId, cuenta, ubicacionId), `${cuenta.nombre} ahora tiene «${modal.rol.nombre}»`))
          }
        />
      )}
      {modal?.tipo === "cuentas" && <CuentasDelRolModal rol={modal.rol} cuentas={cuentasDe(modal.rol.id)} onClose={() => setModal(null)} />}
    </div>
  );
}

/** Un rol en la lista: nombre, cuántos módulos ve (con su barra), cuántas cuentas lo tienen y su aviso si lo hay. */
function FilaRol({ rol, elegido, cuentas, sinGuardar, onElegir }: { rol: RolVista; elegido: boolean; cuentas: number | null; sinGuardar: boolean; onElegir: () => void }) {
  const n = rol.fijo ? MODULOS.length : rol.modulos.length;
  const aviso = cuentas === null ? null : avisoDelRol(rol, cuentas);
  return (
    <button
      type="button"
      aria-pressed={elegido}
      onClick={onElegir}
      className={`block w-full rounded-lg border px-3 py-2.5 text-left transition-colors duration-200 ease-cayla ${
        elegido ? "border-tinta/10 bg-crema shadow-[inset_3px_0_0_var(--color-rojo)]" : "border-transparent hover:bg-crema/70"
      }`}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-semibold text-tinta">
          {rol.nombre}
          {sinGuardar && <span className="ml-1.5 text-rojo" title="Cambios sin guardar">•</span>}
        </span>
        {rol.fijo ? (
          <Lock aria-label="No se edita" className="h-3.5 w-3.5 shrink-0 text-tinta/50" />
        ) : aviso === "solo_inicio" ? (
          <span className="shrink-0 rounded-full bg-ambar/15 px-2 py-px text-[10.5px] font-semibold text-ambar-profundo" title="Sus cuentas solo ven Inicio">
            Solo Inicio
          </span>
        ) : aviso === "sin_uso" ? (
          <span className="shrink-0 rounded-full bg-tinta/[0.06] px-2 py-px text-[10.5px] font-semibold text-tinta/60">Sin uso</span>
        ) : null}
      </span>
      <span className="mt-0.5 block text-xs text-tinta/60">
        {rol.fijo ? "Todo" : `${n} de ${DELEGABLES} módulos`}
        {cuentas !== null && ` · ${cuentas} cuenta${cuentas === 1 ? "" : "s"}`}
      </span>
      <span aria-hidden className="mt-2 block h-1 overflow-hidden rounded-full bg-tinta/10">
        <span
          className={`block h-full rounded-full transition-[width] duration-500 ease-cayla ${rol.fijo ? "bg-taupe" : "bg-tinta"}`}
          style={{ width: `${rol.fijo ? 100 : Math.round((n / DELEGABLES) * 100)}%` }}
        />
      </span>
    </button>
  );
}

/** «Así queda su menú»: el lateral con el borrador, marcando en verde lo que se suma y tachado lo que se quita. */
function VistaPreviaMenu({
  fijo,
  menu,
  conCambios,
  ubicacion,
  onUbicacion,
}: {
  fijo: boolean;
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
        {fijo ? "Ve todo el menú." : conCambios ? "Así quedará al guardar. Lo marcado es lo que cambia." : "Lo que verá en el lateral al entrar."}
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
        <SegmentoDeslizante
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

/** «Comparar roles»: todos los roles contra todos los módulos. Un clic enciende o apaga y guarda al instante. */
function Matriz({
  roles,
  cuentasDe,
  ocupada,
  onAlternar,
  onElegir,
}: {
  roles: RolVista[];
  cuentasDe: (id: string) => number;
  ocupada: string | null;
  onAlternar: (r: RolVista, m: Modulo) => void;
  onElegir: (id: string) => void;
}) {
  const grupos = modulosFiltrados("");
  return (
    <div className="card-cayla overflow-x-auto">
      <table className="w-full min-w-[720px] border-separate border-spacing-0 text-sm">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 bg-crema px-4 py-3 text-left text-xs font-semibold text-tinta">Módulo</th>
            {roles.map((r) => (
              <th key={r.id} className="bg-crema px-3 py-3 text-center text-xs font-semibold text-tinta">
                <button type="button" onClick={() => onElegir(r.id)} className="underline decoration-tinta/20 underline-offset-2 hover:decoration-tinta/60">
                  {r.nombre}
                </button>
                <span className="block text-[11px] font-normal text-tinta/55">{cuentasDe(r.id)} cuentas</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {grupos.map(({ grupo, modulos }) => (
            <MatrizGrupo key={grupo} grupo={grupo} modulos={modulos} roles={roles} ocupada={ocupada} onAlternar={onAlternar} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MatrizGrupo({ grupo, modulos, roles, ocupada, onAlternar }: { grupo: string; modulos: Modulo[]; roles: RolVista[]; ocupada: string | null; onAlternar: (r: RolVista, m: Modulo) => void }) {
  return (
    <>
      <tr>
        <td colSpan={roles.length + 1} className="label-cayla sticky left-0 bg-tinta/[0.03] px-4 py-2 text-[11px] text-taupe-profundo">
          {grupo}
        </td>
      </tr>
      {modulos.map((m) => (
        <tr key={m.clave}>
          <td className="sticky left-0 z-10 border-t border-tinta/5 bg-papel px-4 py-2 text-tinta">
            <span className="inline-flex items-center gap-1.5">
              {m.nombre}
              {!esDelegable(m) && <Lock aria-label="Solo líder" className="h-3 w-3 text-tinta/45" />}
            </span>
          </td>
          {roles.map((r) => {
            const on = veModulo(r, m.clave);
            const control = controlDe(r, m);
            return (
              <td key={r.id} className="border-t border-tinta/5 px-3 py-2 text-center">
                {r.fijo ? (
                  <span aria-label="Lo ve" className="inline-grid h-[18px] w-[18px] place-items-center rounded-[5px] bg-taupe text-[11px] text-white">✓</span>
                ) : control.tipo === "candado" ? (
                  <span aria-label={control.texto} className="text-tinta/35">—</span>
                ) : (
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    aria-label={`${r.nombre} ve ${m.nombre}`}
                    disabled={ocupada !== null || r.archivado}
                    onClick={() => onAlternar(r, m)}
                    className={`inline-grid h-[18px] w-[18px] place-items-center rounded-[5px] border text-[11px] transition-colors duration-200 ease-cayla disabled:opacity-50 ${
                      on ? "border-tinta bg-tinta text-crema" : "border-tinta/25 hover:border-tinta"
                    } ${ocupada === `${r.id}:${m.clave}` ? "animate-pulse" : ""}`}
                  >
                    {on ? "✓" : ""}
                  </button>
                )}
              </td>
            );
          })}
        </tr>
      ))}
    </>
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
        <label className="flex items-center gap-2 rounded-lg border border-tinta/10 bg-crema/60 px-3 py-2 focus-within:border-tinta/40">
          <Search aria-hidden className="h-4 w-4 text-tinta/50" />
          <input
            type="search"
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={`Buscar entre estas ${cuentas.length} cuentas…`}
            aria-label="Buscar cuenta"
            autoComplete="off"
            className="w-full bg-transparent text-sm text-tinta outline-none placeholder:text-tinta/50"
          />
        </label>
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
          {filtradas.length === 0 && <li className="py-6 text-center text-sm text-tinta/60">Ninguna coincide con «{q}».</li>}
          {filtradas.length > MAX && <li className="px-1 py-2 text-xs text-tinta/60">Y {filtradas.length - MAX} más. Escribe para encontrar a alguien.</li>}
        </ul>
      </div>
    </Modal>
  );
}
