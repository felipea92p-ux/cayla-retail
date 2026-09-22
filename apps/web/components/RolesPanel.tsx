"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import { avisar } from "@/components/ui/Avisos";
import { Boton, Interruptor } from "@/components/ui/campos";
import { Chip } from "@/components/ui/Chip";
import { ArchivarRolModal, AsignarRolModal, NuevoRolModal, RenombrarRolModal } from "@/components/RolesModales";
import { traducirError } from "@/lib/error-escritura";
import { SIEMPRE_SOLO_LIDER, type ClaveModulo } from "@/lib/modulos";
import { accionesRolesSupabase, type AccionesRoles, type ResultadoRol } from "@/lib/roles-acciones";
import {
  alternarModulo,
  controlDe,
  cuentasAsignables,
  cuentasDelRol,
  etiquetasDelMenu,
  hayCambios,
  menuDelRol,
  modulosPorGrupo,
  motivoParaNoArchivar,
  nombreDeCopia,
  rolesAsignables,
  veModulo,
  type CuentaConRol,
  type RolVista,
} from "@/lib/roles-reglas";

// «Roles y accesos» (ADR-0161 B; spike aprobado `docs/maquetas/responsable-y-roles-spike-2026-09/`, pantalla 1). Cada rol
// decide SOLO qué módulos ve; quien ve un módulo hace todo lo que hay en él, salvo la lista fija «siempre solo del líder».
// Solo el Líder no se edita. Todo lo que se escribe pasa por RPC (del líder o de quien ve Roles y accesos, 20260923111000),
// que además anota `roles_historial`.

type Modal =
  | { tipo: "nuevo" }
  | { tipo: "duplicar"; rol: RolVista }
  | { tipo: "renombrar"; rol: RolVista }
  | { tipo: "archivar"; rol: RolVista }
  | { tipo: "asignar"; rol: RolVista };

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
  if (rol.clave === "integrante") return "Rol que recibe una persona nueva al darle acceso. Se edita como cualquier rol; lo único que no se puede es archivarlo.";
  if (rol.archivado) return "Archivado: no se ofrece al asignar roles. Restáuralo para volver a usarlo o editarlo.";
  return rol.descripcion ?? "Rol a medida. Se edita, se duplica y se archiva (nunca se borra).";
}

export function RolesPanel({
  roles,
  cuentas,
  acciones = accionesRolesSupabase,
}: {
  roles: RolVista[];
  /** `null` = no se pudieron leer: la pantalla sigue, sin la lista de cuentas. */
  cuentas: CuentaConRol[] | null;
  acciones?: AccionesRoles;
}) {
  const router = useRouter();
  const vigentes = roles.filter((r) => !r.archivado);
  const archivados = roles.filter((r) => r.archivado);
  const [elegidoId, setElegidoId] = useState(() => (vigentes.find((r) => r.clave === "integrante") ?? vigentes[0])?.id ?? "");
  const rol = roles.find((r) => r.id === elegidoId) ?? vigentes[0];
  const [borradores, setBorradores] = useState<Record<string, ClaveModulo[]>>({});
  const [modal, setModal] = useState<Modal | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [verArchivados, setVerArchivados] = useState(false);

  const borrador = rol ? (borradores[rol.id] ?? rol.modulos) : [];
  const conCambios = !!rol && hayCambios(rol.modulos, borrador);
  const rolEnVista = rol ? { ...rol, modulos: borrador } : undefined;
  const menuTienda = rolEnVista ? etiquetasDelMenu(menuDelRol(rolEnVista, "tienda")) : [];
  // Lo que el borrador suma al menú guardado: son las filas que «aparecen» en la vista previa al encender un interruptor.
  const menuGuardado = rol ? etiquetasDelMenu(menuDelRol(rol, "tienda")) : [];
  const recienAparecidas = new Set(
    menuTienda.flatMap((f) => {
      const antes = menuGuardado.find((g) => g.etiqueta === f.etiqueta);
      if (!antes) return [f.etiqueta];
      return f.hijas.filter((h) => !antes.hijas.includes(h)).map((h) => `${f.etiqueta}/${h}`);
    }),
  );
  const menuTaller = rolEnVista ? etiquetasDelMenu(menuDelRol(rolEnVista, "taller")).find((f) => f.etiqueta === "Producción") : undefined;
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

  if (!rol) return <p className="font-display card-cayla py-8 text-center text-base italic text-tinta/65">Todavía no hay roles.</p>;

  const cuentasDelElegido = cuentasDe(rol.id);
  const motivoArchivo = motivoParaNoArchivar(rol, cuentasDelElegido.length);

  return (
    <div className="@container space-y-6">
      <p className="max-w-3xl text-sm leading-relaxed text-tinta/70">
        Qué módulos ve cada cuenta, persona o terminal. Quien ve un módulo hace todo lo que hay en él, salvo lo que es siempre solo del líder. Lo cambia un
        líder de equipo o quien tenga Roles y accesos en su rol; el rol de cada cuenta se cambia desde su fila en Activos o Terminales.
      </p>

      {/* Tres columnas por el ancho del CONTENEDOR, no de la ventana (con el lateral plegado o no, cuenta el espacio real):
          desde 600 px, roles + el rol elegido y el efecto debajo; desde 1000 px, el efecto pasa a la derecha y queda pegado
          al desplazar, para ver el menú cambiar al tocar un interruptor sin bajar. */}
      <div className="grid gap-5 @[600px]:grid-cols-[220px_minmax(0,1fr)] @[1000px]:grid-cols-[220px_minmax(0,1fr)_300px]">
        <nav aria-label="Roles" className="space-y-2">
          {vigentes.map((r) => {
            const n = cuentasDe(r.id).length;
            return (
              <button
                key={r.id}
                type="button"
                aria-pressed={r.id === rol.id}
                onClick={() => setElegidoId(r.id)}
                className={`card-cayla block w-full px-4 py-3 text-left transition-colors duration-200 ease-cayla ${r.id === rol.id ? "border-tinta bg-papel" : "hover:border-tinta/40"}`}
              >
                <span className="block text-sm font-semibold text-tinta">
                  {r.nombre}
                  {borradores[r.id] && hayCambios(r.modulos, borradores[r.id]) ? <span className="ml-1.5 text-rojo" title="Cambios sin guardar">•</span> : null}
                </span>
                <span className="mt-0.5 block text-xs text-tinta/65">
                  {r.fijo ? "Ve y hace todo" : `${r.modulos.length} módulos`}
                  {cuentas ? ` · ${n} cuenta${n === 1 ? "" : "s"}` : ""}
                </span>
                {r.fijo && (
                  <span className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-tinta/65">
                    <Lock aria-hidden className="h-3 w-3" /> No se edita
                  </span>
                )}
              </button>
            );
          })}
          <Boton type="button" peso="fantasma" className="w-full" onClick={() => setModal({ tipo: "nuevo" })}>
            + Nuevo rol
          </Boton>
          {archivados.length > 0 && (
            <div className="pt-2">
              <button type="button" className="label-cayla text-[11px] text-taupe-profundo hover:text-rojo" aria-expanded={verArchivados} onClick={() => setVerArchivados((v) => !v)}>
                Archivados ({archivados.length}) {verArchivados ? "▴" : "▾"}
              </button>
              {verArchivados && (
                <ul className="mt-2 space-y-1.5">
                  {archivados.map((r) => (
                    <li key={r.id} className="flex items-center justify-between gap-2 rounded-md border border-tinta/10 px-3 py-2 text-sm text-tinta/65">
                      <button type="button" className="truncate text-left hover:text-tinta" onClick={() => setElegidoId(r.id)}>
                        {r.nombre}
                      </button>
                      <Boton
                        type="button"
                        peso="discreto"
                        className="px-2.5 py-1 text-[10px]"
                        onClick={() => ejecutar("restaurar el rol", () => acciones.restaurar(r.id), `«${r.nombre}» volvió a estar disponible`)}
                      >
                        Restaurar
                      </Boton>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </nav>

        <section aria-label={`Rol ${rol.nombre}`} className="card-cayla overflow-hidden">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-tinta/10 px-5 py-4">
            <div className="min-w-0 max-w-xl">
              <h2 className="font-display text-2xl text-tinta">{rol.nombre}</h2>
              <p className="mt-1 text-sm text-tinta/70">{descripcionDe(rol)}</p>
              {cuentas && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {cuentasDelElegido.length === 0 ? (
                    <Chip tono="apagado" versalitas={false}>
                      Nadie tiene este rol
                    </Chip>
                  ) : (
                    cuentasDelElegido.map((c) => (
                      <span key={`${c.tipo}:${c.id}`} className="inline-flex items-center gap-1.5 rounded-full bg-sand/70 py-0.5 pl-0.5 pr-2.5 text-xs text-tinta">
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-crema text-[9px] font-semibold">{iniciales(c.nombre)}</span>
                        {c.nombre}
                        {c.estado !== "activo" && <span className="text-tinta/55">· {c.estado}</span>}
                      </span>
                    ))
                  )}
                </div>
              )}
            </div>
            {!rol.fijo && (
              <div className="flex flex-wrap gap-2">
                {!rol.archivado && (
                  <>
                    <Boton type="button" peso="discreto" className="px-3 py-2" onClick={() => setModal({ tipo: "asignar", rol })} disabled={!cuentas}>
                      Asignar a una cuenta
                    </Boton>
                    <Boton type="button" peso="discreto" className="px-3 py-2" onClick={() => setModal({ tipo: "renombrar", rol })}>
                      Renombrar
                    </Boton>
                  </>
                )}
                <Boton type="button" peso="discreto" className="px-3 py-2" onClick={() => setModal({ tipo: "duplicar", rol })}>
                  Duplicar
                </Boton>
                {!rol.esSistema && !rol.archivado && (
                  <Boton
                    type="button"
                    peso="discreto"
                    className="px-3 py-2"
                    disabled={motivoArchivo !== null}
                    title={motivoArchivo ?? undefined}
                    onClick={() => setModal({ tipo: "archivar", rol })}
                  >
                    Archivar
                  </Boton>
                )}
              </div>
            )}
            {rol.fijo && (
              <Boton type="button" peso="discreto" className="px-3 py-2" onClick={() => setModal({ tipo: "duplicar", rol })}>
                Duplicar
              </Boton>
            )}
          </div>

          {rol.limitadoComoHoy && (
            <p className="mx-5 mt-4 rounded-md border border-ambar/30 bg-ambar/10 px-3.5 py-2.5 text-[13px] leading-relaxed text-ambar-profundo">
              <strong className="font-semibold">Pendiente de una decisión (ADR-0161 B2d).</strong> Este rol ve sus módulos como hoy, pero todavía no cierra caja, no
              ajusta stock y no edita el catálogo aunque vea Caja, Existencias o Productos. Cuando se decida, se levanta este límite o se apagan esos módulos.
            </p>
          )}
          {!rol.fijo && !rol.archivado && motivoArchivo && !rol.esSistema && (
            <p className="mx-5 mt-4 text-xs text-tinta/65">Para archivarlo: {motivoArchivo.charAt(0).toLowerCase() + motivoArchivo.slice(1)}</p>
          )}

          <table className="mt-2 w-full text-sm">
            <thead>
              <tr className="text-left text-tinta/65">
                <th className="label-cayla px-5 py-2 text-[11px] font-normal">Módulo</th>
                <th className="label-cayla w-28 px-5 py-2 text-[11px] font-normal">Lo ve</th>
              </tr>
            </thead>
            <tbody>
              {modulosPorGrupo().map(({ grupo, modulos }) => (
                <GrupoFilas
                  key={grupo}
                  grupo={grupo}
                  filas={modulos.map((m) => ({
                    m,
                    on: veModulo({ fijo: rol.fijo, modulos: borrador }, m.clave),
                    control: controlDe(rol, m),
                  }))}
                  onAlternar={(clave) => setBorradores((b) => ({ ...b, [rol.id]: alternarModulo(borrador, clave) }))}
                />
              ))}
            </tbody>
          </table>

          {conCambios && (
            <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 border-t border-tinta/10 bg-papel px-5 py-3">
              <p className="text-sm text-tinta/75">Cambios sin guardar en «{rol.nombre}».</p>
              <div className="flex gap-2">
                <Boton type="button" peso="discreto" onClick={() => setBorradores((b) => sinBorrador(b, rol.id))} disabled={guardando}>
                  Descartar
                </Boton>
                <Boton type="button" peso="primario" onClick={guardar} cargando={guardando}>
                  {guardando ? "Guardando…" : "Guardar cambios"}
                </Boton>
              </div>
            </div>
          )}

        </section>

        <EfectoDelRol fijo={rol.fijo} menuTienda={menuTienda} menuTaller={menuTaller} recienAparecidas={recienAparecidas} />
      </div>

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
          roles={rolesAsignables(roles)}
          cuentas={cuentasAsignables(cuentas).filter((c) => c.rolId !== modal.rol.id)}
          rolFijo={modal.rol}
          onClose={() => setModal(null)}
          onConfirmar={async (rolId, cuenta) =>
            !!(await ejecutar("asignar el rol", () => acciones.asignar(rolId, cuenta), `${cuenta.nombre} ahora tiene «${modal.rol.nombre}»`))
          }
        />
      )}
    </div>
  );
}

function GrupoFilas({
  grupo,
  filas,
  onAlternar,
}: {
  grupo: string;
  filas: { m: { clave: ClaveModulo; nombre: string; incluye: string }; on: boolean; control: ReturnType<typeof controlDe> }[];
  onAlternar: (clave: ClaveModulo) => void;
}) {
  return (
    <>
      <tr>
        <td colSpan={2} className="label-cayla bg-tinta/[0.03] px-5 py-2 text-[11px] text-taupe-profundo">
          {grupo}
        </td>
      </tr>
      {filas.map(({ m, on, control }) => (
        <tr key={m.clave} className={`border-t border-tinta/5 transition-opacity duration-200 ease-cayla ${on ? "" : "opacity-70"}`}>
          <td className="px-5 py-2.5">
            <span className="block text-tinta">{m.nombre}</span>
            <span className="block text-xs text-tinta/60">{m.incluye}</span>
          </td>
          <td className="px-5 py-2.5">
            {control.tipo === "candado" ? (
              <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-tinta/10 px-2 py-0.5 text-[11px] text-tinta/65">
                <Lock aria-hidden className="h-3 w-3" /> {control.texto}
              </span>
            ) : (
              <Interruptor
                activo={on}
                disabled={!control.editable}
                onActivo={() => onAlternar(m.clave)}
                etiqueta={<span className="sr-only">Ve {m.nombre}</span>}
              />
            )}
          </td>
        </tr>
      ))}
    </>
  );
}

type FilaDeMenu = { etiqueta: string; hijas: string[] };

/** Tercera columna: lo que el rol NO puede aunque vea el módulo, y cómo queda su menú con el borrador de ahora. */
function EfectoDelRol({
  fijo,
  menuTienda,
  menuTaller,
  recienAparecidas,
}: {
  fijo: boolean;
  menuTienda: FilaDeMenu[];
  menuTaller?: FilaDeMenu;
  recienAparecidas: ReadonlySet<string>;
}) {
  // Lo que aparece en la vista previa al encender un interruptor entra con `anim-revelar` (240 ms, --ease-cayla, sin rebote;
  // se colapsa con prefers-reduced-motion). Lo que ya está guardado no entra: sería movimiento decorativo.
  const entra = (clave: string) => (recienAparecidas.has(clave) ? "anim-revelar" : "");

  return (
    <aside
      aria-label="Efecto del rol"
      className="grid gap-5 self-start @[600px]:col-span-2 @[600px]:grid-cols-2 @[1000px]:sticky @[1000px]:top-20 @[1000px]:col-span-1 @[1000px]:max-h-[calc(100vh-6rem)] @[1000px]:grid-cols-1 @[1000px]:overflow-y-auto"
    >
      <section className="card-cayla px-5 py-4">
        <h3 className="font-display text-lg text-tinta">Así queda su menú</h3>
        <p className="mt-0.5 text-xs text-tinta/60">{fijo ? "Ve todo el menú." : "Parado en una tienda. Cambia al encender o apagar un módulo."}</p>
        {menuTienda.length === 0 ? (
          <p className="mt-3 text-sm italic text-tinta/65">Sin módulos: solo Inicio.</p>
        ) : (
          <ul className="mt-3 space-y-2.5">
            {menuTienda.map((f) => (
              <li key={f.etiqueta} className={entra(f.etiqueta)}>
                <span className="block text-sm font-semibold text-tinta">{f.etiqueta}</span>
                {f.hijas.length > 0 && (
                  <ul className="mt-1 space-y-0.5 border-l border-tinta/10 pl-3">
                    {f.hijas.map((h) => (
                      <li key={h} className={`text-[13px] text-tinta/70 ${entra(`${f.etiqueta}/${h}`)}`}>
                        {h}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
        {menuTaller && (
          <div className="mt-4 border-t border-tinta/10 pt-3">
            <p className="text-xs text-tinta/60">Parado en el Taller, además:</p>
            <p className="mt-1 text-sm font-semibold text-tinta">Producción</p>
            <p className="text-[13px] text-tinta/70">{menuTaller.hijas.join(" · ") || "Órdenes"}</p>
          </div>
        )}
      </section>

      <section className="card-cayla px-5 py-4">
        <h3 className="font-display text-lg text-tinta">Siempre solo del líder</h3>
        <p className="mt-0.5 text-xs text-tinta/60">Aunque el rol vea el módulo, esto no lo hace.</p>
        <ul className="mt-3 space-y-2.5">
          {SIEMPRE_SOLO_LIDER.map((x) => (
            <li key={x.que} className="flex items-start gap-2">
              <Lock aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-tinta/45" />
              <span className="min-w-0">
                <span className="block text-[13px] leading-snug text-tinta/85">{x.que}</span>
                <span className="block text-[11px] text-tinta/45">{x.origen}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>
    </aside>
  );
}

