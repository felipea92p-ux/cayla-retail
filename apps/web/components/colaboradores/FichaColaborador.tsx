"use client";

import { useCallback, useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { ArrowLeftRight, KeyRound, MapPin, PauseCircle, PlayCircle, X } from "lucide-react";
import type { Ubicacion } from "@/lib/ubicaciones";
import type { ClaveModulo } from "@/lib/modulos";
import { MODULOS } from "@/lib/modulos";
import { diferenciaDeModulos, fraseFicha, type PersonaEquipo } from "@/lib/equipo-reglas";
import {
  debeAvisarPerdidaAdmin,
  menuConCambios,
  pideUbicacion,
  rolesAsignables,
  type CuentaConRol,
  type FilaMenuConCambios,
  type RolVista,
} from "@/lib/roles-reglas";
import { useEscapeLibre } from "@/components/ui/useEscapeLibre";
import { ComboResponsable } from "@/components/ComboResponsable";
import type { ControlResponsable } from "@/lib/useResponsable";
import { CaraPersona, EstadoPersona, PildoraRol } from "@/components/colaboradores/EquipoLista";

// La ficha de una persona del equipo (propuesta del 2026-10-05): lo que hoy estaba en un menú «⋯» pasa a botones a la
// vista, y cada uno abre su panel aquí mismo, sin otra ventana encima. Abajo, su menú tal como lo ve. Lo reversible
// (suspender, reactivar, cambiar rol o sede) se hace al confirmar y el aviso trae «Deshacer»; solo «Quitar acceso» pregunta.
// Las decisiones de permisos son las de siempre: llegan ya resueltas en `persona.acciones` y en `rolesAsignables`.

/** Debe coincidir con `.anim-cajon-salida` en globals.css. */
const MS_SALIDA = 240;

type Panel = "rol" | "sede" | "suspender" | "quitar" | null;

export type AccionesFicha = {
  cambiarRol: (rolId: string, cuenta: CuentaConRol, ubicacionId?: string) => Promise<boolean>;
  cambiarSede: (ubicacionId: string) => Promise<boolean>;
  suspender: (motivo: string) => Promise<boolean>;
  reactivar: () => Promise<boolean>;
  quitar: () => Promise<boolean>;
};

const nombreModulo = (c: ClaveModulo) => MODULOS.find((m) => m.clave === c)?.nombre ?? c;

/** Su menú, tal como lo ve al entrar. Con un rol elegido para cambiar, marca lo que se suma y lo que se quita. */
function MenuQueVe({ filas }: { filas: FilaMenuConCambios[] }) {
  const estilo = (c: FilaMenuConCambios["cambio"]) =>
    c === "suma" ? "anim-revelar rounded bg-verde/15 text-verde-profundo" : c === "quita" ? "text-tinta/40 line-through" : "";
  return (
    <ul className="space-y-1.5 rounded-xl border border-sand bg-crema/60 px-3 py-3">
      {filas.map((f) => (
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
      {filas.every((f) => f.etiqueta === "Inicio") && <li className="px-1 text-[13px] italic text-tinta/60">Solo Inicio.</li>}
    </ul>
  );
}

function BotonAccion({ icono: Icono, texto, activo, onClick, disabled }: { icono: typeof KeyRound; texto: string; activo?: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-expanded={activo}
      className={`grid justify-items-center gap-1.5 rounded-xl border px-2 py-3 text-[13px] font-semibold text-tinta transition-colors duration-200 ease-cayla disabled:cursor-not-allowed disabled:opacity-50 ${
        activo ? "border-tinta bg-hueso" : "border-sand hover:border-taupe"
      }`}
    >
      <Icono aria-hidden className="h-5 w-5 text-taupe" strokeWidth={1.6} />
      {texto}
    </button>
  );
}

export function FichaColaborador({
  persona,
  roles,
  cuentas,
  ubicaciones,
  soyAdmin,
  misModulos,
  ahoraIso,
  responsable,
  ocupado,
  acciones,
  onVerRol,
  onCerrar,
}: {
  persona: PersonaEquipo;
  /** `null` = no se pudieron leer (o quien mira no tiene Roles y accesos): sin «Cambiar rol» ni su menú. */
  roles: RolVista[] | null;
  cuentas: CuentaConRol[] | null;
  ubicaciones: Pick<Ubicacion, "id" | "nombre" | "tipo">[];
  soyAdmin: boolean;
  misModulos: readonly ClaveModulo[] | null;
  ahoraIso: string;
  responsable: ControlResponsable;
  ocupado: boolean;
  acciones: AccionesFicha;
  /** Abre su rol en Roles y accesos. Sin ella (quien mira no tiene ese módulo), el menú no ofrece el enlace. */
  onVerRol?: () => void;
  onCerrar: () => void;
}) {
  const [cerrando, setCerrando] = useState(false);
  const pedirCierre = useCallback(() => setCerrando(true), []);
  useEffect(() => {
    if (!cerrando) return;
    const reducido = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const t = setTimeout(onCerrar, reducido ? 0 : MS_SALIDA);
    return () => clearTimeout(t);
  }, [cerrando, onCerrar]);
  const alEscape = useEscapeLibre(pedirCierre);

  const [panel, setPanel] = useState<Panel>(null);
  const [rolElegido, setRolElegido] = useState<string | null>(null);
  const [sedeDelLider, setSedeDelLider] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");
  // Al pasar a otra persona (o cuando la base trae su estado nuevo), los paneles vuelven a cerrarse. Se ajusta al pintar,
  // no en un efecto: así no hay un cuadro intermedio con el panel de la persona anterior abierto.
  const claveVista = `${persona.id}:${persona.estado}:${persona.rolId}:${persona.ubicacionId}`;
  const [vistaDe, setVistaDe] = useState(claveVista);
  if (vistaDe !== claveVista) {
    setVistaDe(claveVista);
    setPanel(null);
    setRolElegido(null);
    setSedeDelLider(null);
    setMotivo("");
  }

  const cuenta = cuentas?.find((c) => c.tipo === "persona" && c.id === persona.id) ?? null;
  const rolActual = roles?.find((r) => r.id === (cuenta?.rolId ?? persona.rolId)) ?? null;
  const destinos = roles && cuenta ? rolesAsignables(roles, cuenta, soyAdmin, misModulos).filter((r) => r.id !== cuenta.rolId) : [];
  const destino = destinos.find((r) => r.id === rolElegido);
  const conSede = !!cuenta && pideUbicacion(cuenta, destino);
  const tipoUbicacion = ubicaciones.find((u) => u.id === persona.ubicacionId)?.tipo === "taller" ? "taller" : "tienda";
  const menu = rolActual ? menuConCambios(rolActual, destino?.modulos ?? rolActual.modulos, tipoUbicacion) : null;

  const puede = (a: (typeof persona.acciones)[number]) => persona.acciones.includes(a);
  const veCambiarRol = puede("cambiar_rol") && destinos.length > 0;
  const tocable = persona.estado === "activa" ? persona.acciones.length > 0 : persona.puedeReactivar;
  const alternar = (p: Panel) => setPanel((actual) => (actual === p ? null : p));
  const listo = responsable.listo && !ocupado;

  const frase = fraseFicha(persona, ahoraIso);

  return (
    <Dialog.Root open modal={false} onOpenChange={(abierto) => !abierto && pedirCierre()}>
      <Dialog.Portal>
        <Dialog.Content
          onEscapeKeyDown={alEscape}
          // Sin velo y sin cerrar al tocar afuera: la lista sigue viva y tocar a otra persona le cambia la ficha.
          onInteractOutside={(e) => e.preventDefault()}
          onOpenAutoFocus={(e) => e.preventDefault()}
          className={`fixed inset-y-0 right-0 z-50 flex w-full max-w-[27rem] flex-col border-l border-sand bg-papel outline-none ${cerrando ? "anim-cajon-salida" : "anim-cajon"}`}
        >
          <div key={persona.id} className="anim-asentar flex min-h-0 flex-1 flex-col">
            <button
              type="button"
              onClick={pedirCierre}
              aria-label="Cerrar"
              className="absolute right-5 top-5 z-10 rounded-full p-1.5 text-tinta transition-colors hover:bg-tinta/[0.05] hover:text-rojo"
            >
              <X aria-hidden className="h-5 w-5" strokeWidth={1.5} />
            </button>

            <div className="scroll-cayla min-h-0 flex-1 space-y-5 overflow-y-auto px-6 pb-8 pt-7">
              <div className="flex items-center gap-4 pr-9">
                <CaraPersona p={persona} grande />
                <div className="min-w-0">
                  <Dialog.Title asChild>
                    <h2 className="font-display text-[26px] leading-tight text-tinta">{persona.nombre}</h2>
                  </Dialog.Title>
                  <Dialog.Description asChild>
                    <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13.5px] text-tinta/65">
                      <MapPin aria-hidden className="h-3.5 w-3.5" />
                      {persona.ubicacionNombre ?? (persona.nivel === "lider" ? "Todas las sedes" : "Sin sede")}
                      <PildoraRol nombre={persona.rolNombre} lider={persona.nivel === "lider"} />
                      {persona.esAdmin && <span className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-taupe">Admin</span>}
                      <EstadoPersona p={persona} />
                    </p>
                  </Dialog.Description>
                  <p className="mt-1 truncate text-xs text-tinta/55">{persona.correo}</p>
                </div>
              </div>

              <p className="rounded-xl bg-hueso px-4 py-3 text-[15px] leading-snug text-tinta">
                {frase.map((p, i) => (p.fuerte ? <strong key={i} className="font-semibold">{p.texto}</strong> : <span key={i}>{p.texto}</span>))}
              </p>

              {persona.esYo && <p className="text-[13.5px] text-tinta/65">Es tu cuenta: tu rol y tu sede los cambia otra persona.</p>}
              {!persona.esYo && !tocable && persona.estado !== "baja_dynamic" && (
                <p className="text-[13.5px] text-tinta/65">A esta persona la administra alguien con más acceso que tú.</p>
              )}

              {tocable && (
                <div className="space-y-3">
                  <ComboResponsable control={responsable} compacto deshabilitado={ocupado} />

                  {persona.estado === "activa" ? (
                    <div className="grid grid-cols-3 gap-2">
                      {veCambiarRol && <BotonAccion icono={KeyRound} texto="Cambiar rol" activo={panel === "rol"} onClick={() => alternar("rol")} />}
                      {puede("cambiar_ubicacion") && <BotonAccion icono={ArrowLeftRight} texto="Cambiar sede" activo={panel === "sede"} onClick={() => alternar("sede")} />}
                      {puede("suspender") && <BotonAccion icono={PauseCircle} texto="Suspender" activo={panel === "suspender"} onClick={() => alternar("suspender")} />}
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 gap-2">
                      <BotonAccion icono={PlayCircle} texto="Reactivar" disabled={!listo} onClick={() => void acciones.reactivar()} />
                    </div>
                  )}

                  {panel === "rol" && (
                    <div className="anim-revelar space-y-2.5 rounded-xl border border-sand p-3">
                      <ul className="space-y-2" aria-label="Elige el nuevo rol">
                        {destinos.map((r) => {
                          const d = rolActual ? diferenciaDeModulos(rolActual.modulos, r.modulos) : { suma: [], quita: [] };
                          const elegido = r.id === rolElegido;
                          return (
                            <li key={r.id}>
                              <button
                                type="button"
                                aria-pressed={elegido}
                                onClick={() => setRolElegido(r.id)}
                                className={`w-full rounded-lg border px-3 py-2.5 text-left transition-colors duration-200 ease-cayla ${elegido ? "border-tinta bg-hueso" : "border-sand hover:border-taupe"}`}
                              >
                                <span className="block text-[14.5px] font-semibold text-tinta">{r.nombre}</span>
                                {(d.suma.length > 0 || d.quita.length > 0) && (
                                  <span className="mt-1 flex flex-wrap gap-1">
                                    {d.suma.slice(0, 3).map((m) => (
                                      <span key={m} className="rounded-full bg-verde/15 px-2 py-px text-[11.5px] font-semibold text-verde-profundo">+ {nombreModulo(m)}</span>
                                    ))}
                                    {d.suma.length > 3 && <span className="rounded-full bg-verde/15 px-2 py-px text-[11.5px] font-semibold text-verde-profundo">+{d.suma.length - 3}</span>}
                                    {d.quita.slice(0, 3).map((m) => (
                                      <span key={m} className="rounded-full bg-rojo/10 px-2 py-px text-[11.5px] font-semibold text-rojo-profundo line-through">{nombreModulo(m)}</span>
                                    ))}
                                    {d.quita.length > 3 && <span className="rounded-full bg-rojo/10 px-2 py-px text-[11.5px] font-semibold text-rojo-profundo">−{d.quita.length - 3}</span>}
                                  </span>
                                )}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                      {destino && conSede && (
                        <div role="group" aria-label="Sede donde queda" className="space-y-1.5">
                          <p className="text-[13px] text-tinta/70">Deja de ser líder: elige la sede donde queda.</p>
                          <div className="flex flex-wrap gap-1.5">
                            {ubicaciones.map((u) => (
                              <button key={u.id} type="button" className="pildora-cayla" aria-pressed={sedeDelLider === u.id} onClick={() => setSedeDelLider(u.id)}>
                                {u.nombre}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      {destino && persona.nivel === "lider" && !destino.fijo && debeAvisarPerdidaAdmin(persona.esAdmin, destino) && (
                        <p className="rounded-lg bg-ambar/10 px-3 py-2 text-[13px] text-ambar-profundo">
                          <strong className="font-semibold">También deja de ser Admin:</strong> no podrá administrar líderes hasta que otro Admin se lo devuelva.
                        </p>
                      )}
                      {destino?.fijo && <p className="text-[13px] text-tinta/70">Como líder verá y hará todo en todas las sedes.</p>}
                      {destino && cuenta && (
                        <button
                          type="button"
                          className="btn-cayla btn-primario w-full"
                          disabled={!listo || (conSede && !sedeDelLider)}
                          title={responsable.motivo ?? undefined}
                          onClick={() => void acciones.cambiarRol(destino.id, cuenta, conSede ? (sedeDelLider ?? undefined) : undefined)}
                        >
                          Cambiar a {destino.nombre}
                        </button>
                      )}
                    </div>
                  )}

                  {panel === "sede" && (
                    <div className="anim-revelar space-y-2 rounded-xl border border-sand p-3">
                      <p className="text-[13px] text-tinta/70">{persona.nivel === "lider" ? "Tienda donde arranca su sesión (opera en todas):" : "Sede donde trabaja:"}</p>
                      <div className="grid grid-cols-2 gap-2">
                        {ubicaciones.map((u) => {
                          const actual = u.id === persona.ubicacionId;
                          return (
                            <button
                              key={u.id}
                              type="button"
                              disabled={actual || !listo}
                              onClick={() => void acciones.cambiarSede(u.id)}
                              className={`rounded-xl border px-3 py-3 text-left text-[14px] font-semibold transition-colors duration-200 ease-cayla disabled:cursor-default ${
                                actual ? "border-tinta bg-hueso text-tinta" : "border-sand text-tinta hover:border-taupe disabled:opacity-50"
                              }`}
                            >
                              {u.nombre}
                              {actual && <span className="block text-xs font-normal text-tinta/60">Aquí está</span>}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {panel === "suspender" && (
                    <form
                      className="anim-revelar space-y-2.5 rounded-xl border border-sand p-3"
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (listo) void acciones.suspender(motivo);
                      }}
                    >
                      <label className="block space-y-1 text-[13px] text-tinta/70" htmlFor={`motivo-${persona.id}`}>
                        <span>Motivo (opcional)</span>
                        <span className="caja-cayla block px-3">
                          <input
                            id={`motivo-${persona.id}`}
                            value={motivo}
                            onChange={(e) => setMotivo(e.target.value)}
                            maxLength={200}
                            autoComplete="off"
                            className="w-full bg-transparent py-2 text-sm text-tinta outline-none"
                          />
                        </span>
                      </label>
                      <button type="submit" className="btn-cayla btn-primario w-full" disabled={!listo} title={responsable.motivo ?? undefined}>
                        Suspender a {persona.nombre.split(" ")[0]}
                      </button>
                    </form>
                  )}
                </div>
              )}

              {menu && (
                <section aria-label="Así ve el sistema" className="space-y-2">
                  <h3 className="flex items-baseline justify-between text-[11.5px] font-bold uppercase tracking-[0.1em] text-taupe-profundo">
                    {destino ? `Así lo verá con ${destino.nombre}` : "Así ve el sistema"}
                    <span className="text-xs font-normal normal-case tracking-normal text-tinta/55">{(destino ?? rolActual)?.modulos.length ?? 0} módulos</span>
                  </h3>
                  <MenuQueVe filas={menu} />
                  {onVerRol && !destino && (
                    <button type="button" className="btn-cayla btn-enlace text-[13px]" onClick={onVerRol}>
                      Ver el rol {persona.rolNombre} en Roles y accesos →
                    </button>
                  )}
                </section>
              )}

              {tocable && (persona.estado === "activa" ? puede("quitar") : persona.puedeReactivar) && (
                <div className="border-t border-sand pt-4">
                  {panel === "quitar" ? (
                    <div className="anim-revelar space-y-2.5 rounded-xl bg-rojo/10 px-4 py-3 text-[14px] text-tinta">
                      <p>
                        <strong className="font-semibold">¿Quitar el acceso de {persona.nombre}?</strong> Ya no podrá entrar a retail. Su historial se conserva.
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <button type="button" className="btn-cayla btn-chico btn-peligro" disabled={!listo} onClick={() => void acciones.quitar()}>
                          Sí, quitar acceso
                        </button>
                        <button type="button" className="btn-cayla btn-chico btn-sutil" onClick={() => setPanel(null)}>
                          Volver
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button type="button" className="btn-cayla btn-enlace text-rojo" onClick={() => setPanel("quitar")}>
                      Quitar acceso
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
