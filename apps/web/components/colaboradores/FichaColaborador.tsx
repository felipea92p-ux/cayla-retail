"use client";

import { useState } from "react";
import { Chip } from "@/components/ui/Chip";
import { ArrowLeftRight, ArrowRight, KeyRound, MapPin, PauseCircle, PlayCircle } from "lucide-react";
import type { Ubicacion } from "@/lib/ubicaciones";
import type { ClaveModulo } from "@/lib/modulos";
import { fraseFicha, type PersonaEquipo } from "@/lib/equipo-reglas";
import { plural } from "@/lib/colaboradores-reglas";
import {
  debeAvisarPerdidaAdmin,
  pideUbicacion,
  rolesAsignables,
  type CuentaConRol,
  type RolVista,
} from "@/lib/roles-reglas";
import { ComboResponsable } from "@/components/ComboResponsable";
import type { ControlResponsable } from "@/lib/useResponsable";
import { CaraPersona, EstadoPersona, PildoraRol } from "@/components/colaboradores/EquipoLista";
import { Cajon } from "@/components/ui/Cajon";
import { Aviso } from "@/components/ui/Aviso";
import { ModulosPorGrupo } from "@/components/colaboradores/ModulosPorGrupo";
import { EnlaceVer } from "@/components/ui/EnlaceVer";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { camposFicha, puedeCambiarRol } from "@/lib/ficha-colaborador-guia";

// La ficha de una persona del equipo (propuesta del 2026-10-05): lo que hoy estaba en un menú «⋯» pasa a botones a la
// vista, y cada uno abre su panel aquí mismo, sin otra ventana encima. Abajo, su menú tal como lo ve. Lo reversible
// (suspender, reactivar, cambiar rol o sede) se hace al confirmar y el aviso trae «Deshacer»; solo «Quitar acceso» pregunta.
// Las decisiones de permisos son las de siempre: llegan ya resueltas en `persona.acciones` y en `rolesAsignables`.
// La guía de foco (ADR-0284) enciende lo que sigue en el panel abierto y dice qué falta sobre su botón: quién lo hace, el rol nuevo y,
// al bajar a un líder sin sede, la sede donde queda; al suspender, el motivo, que es sugerido y nunca apaga el botón
// (`lib/ficha-colaborador-guia.ts`).

type Panel = "rol" | "sede" | "suspender" | "quitar" | null;

export type AccionesFicha = {
  cambiarRol: (rolId: string, cuenta: CuentaConRol, ubicacionId?: string) => Promise<boolean>;
  cambiarSede: (ubicacionId: string) => Promise<boolean>;
  suspender: (motivo: string) => Promise<boolean>;
  reactivar: () => Promise<boolean>;
  quitar: () => Promise<boolean>;
};

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
      <Icono aria-hidden className="h-5 w-5 text-taupe" />
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
  // El rol elegido solo cuenta con «Cambiar rol» abierto: al pasar a Suspender, el menú de abajo vuelve a ser el de hoy (si no, decía
  // «Así lo verá con …» mientras se suspendía). Lo elegido se conserva por si vuelve al panel.
  const destino = panel === "rol" ? destinos.find((r) => r.id === rolElegido) : undefined;
  const conSede = !!cuenta && pideUbicacion(cuenta, destino);

  const puede = (a: (typeof persona.acciones)[number]) => persona.acciones.includes(a);
  const veCambiarRol = puede("cambiar_rol") && destinos.length > 0;
  const tocable = persona.estado === "activa" ? persona.acciones.length > 0 : persona.puedeReactivar;
  const alternar = (p: Panel) => setPanel((actual) => (actual === p ? null : p));
  const listo = responsable.listo && !ocupado;
  const sedeElegida = sedeDelLider !== null && ubicaciones.some((u) => u.id === sedeDelLider);
  const estadoRol = { responsableListo: responsable.listo, rolElegido: !!destino, pideSede: conSede, sedeElegida };
  // Alguien suspendido no abre panel: su ficha es «Reactivar» (o «Quitar acceso», que sí lo abre).
  const panelGuia = !tocable ? null : (panel ?? (persona.estado === "activa" ? null : "reactivar"));
  const guia = useGuiaCampos(camposFicha({ ...estadoRol, panel: panelGuia, responsableMotivo: responsable.motivo, motivo }));
  // En los paneles de un toque (cambiar la sede, reactivar, quitar) el pie solo aparece si algo falta: con todo listo, el toque es el paso.
  const pieSiFalta = guia.faltan.length > 0 && <PieGuia guia={guia} />;

  const frase = fraseFicha(persona, ahoraIso);
  const quitable = tocable && (persona.estado === "activa" ? puede("quitar") : persona.puedeReactivar);

  return (
    <Cajon
      onCerrar={onCerrar}
      clave={persona.id}
      guiaCabecera="colaboradores.ficha-cabecera"
      marca={<CaraPersona p={persona} />}
      titulo={persona.nombre}
      frase={
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <MapPin aria-hidden className="h-3.5 w-3.5" />
          {persona.nivel === "lider" ? (persona.ubicacionNombre ? `Todas las sedes · abre en ${persona.ubicacionNombre}` : "Todas las sedes") : (persona.ubicacionNombre ?? "Sin sede")}
          <PildoraRol nombre={persona.rolNombre} lider={persona.nivel === "lider"} />
          {persona.esAdmin && <span className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-taupe">Admin</span>}
          <EstadoPersona p={persona} />
        </span>
      }
      debajo={
        // Una línea con lo importante y el correo (antes, una frase de dos líneas en una caja y el correo aparte).
        <p className="truncate text-xs text-tinta/60" data-guia="colaboradores.ficha-frase">
          {frase.map((p, i) => (p.fuerte ? <strong key={i} className="font-semibold text-tinta">{p.texto}</strong> : <span key={i}>{p.texto}</span>))}
          {" · "}
          {persona.correo}
        </p>
      }
      claseCuerpo="space-y-5"
      pie={
        // «Firma» (el responsable) en una línea y, debajo, quitar el acceso: lo destructivo solo y al final.
        <div className="space-y-2.5" data-guia="colaboradores.ficha-quitar">
          {tocable && (
            <CampoGuiado id="ficha-responsable" guia={guia}>
              <ComboResponsable control={responsable} compacto enLinea deshabilitado={ocupado} />
            </CampoGuiado>
          )}
          {quitable &&
            (panel === "quitar" ? (
              <span className="flex flex-wrap items-center gap-2 text-[13.5px] text-tinta">
                ¿Quitar el acceso?
                <button type="button" className="btn-cayla btn-chico btn-peligro" disabled={!listo} onClick={() => void acciones.quitar()}>
                  Sí, quitar
                </button>
                <button type="button" className="btn-cayla btn-chico btn-sutil" onClick={() => setPanel(null)}>
                  Volver
                </button>
              </span>
            ) : (
              <button type="button" className="btn-cayla btn-chico btn-peligro" onClick={() => setPanel("quitar")}>
                Quitar acceso
              </button>
            ))}
        </div>
      }
    >
      {persona.esYo && <p className="text-[13px] text-tinta/60">Es tu cuenta: otra persona te cambia el rol y la sede.</p>}
      {!persona.esYo && !tocable && persona.estado !== "baja_dynamic" && <p className="text-[13px] text-tinta/60">La administra alguien con más acceso que tú.</p>}

      {tocable && (
        <div className="space-y-3">
          {persona.estado === "activa" ? (
            <div className="grid grid-cols-3 gap-2" data-guia="colaboradores.ficha-acciones">
              {veCambiarRol && <BotonAccion icono={KeyRound} texto="Rol" activo={panel === "rol"} onClick={() => alternar("rol")} />}
              {puede("cambiar_ubicacion") && <BotonAccion icono={ArrowLeftRight} texto="Sede" activo={panel === "sede"} onClick={() => alternar("sede")} />}
              {puede("suspender") && <BotonAccion icono={PauseCircle} texto="Suspender" activo={panel === "suspender"} onClick={() => alternar("suspender")} />}
            </div>
          ) : (
            <div className="space-y-1">
              <div className="grid grid-cols-3 gap-2">
                <BotonAccion icono={PlayCircle} texto="Reactivar" disabled={!listo} onClick={() => void acciones.reactivar()} />
              </div>
              {panel === null && pieSiFalta}
            </div>
          )}

          {panel === "rol" && (
            <div className="anim-revelar space-y-2.5 rounded-xl border border-sand p-3">
              <CampoGuiado id="ficha-rol" guia={guia} titulo="Elige su nuevo rol">
                <div role="radiogroup" aria-label="Rol nuevo" className="grid gap-1.5">
                  {/* El de hoy, como referencia: se ve cuál es y no se elige. */}
                  <div className="grid grid-cols-[18px_minmax(0,1fr)_auto] items-center gap-x-2.5 rounded-lg border border-dashed border-sand px-3 py-2 opacity-75">
                    <span aria-hidden className="h-[18px] w-[18px] rounded-full border-2 border-dashed border-borde-control" />
                    <span className="min-w-0">
                      <span className="block text-[14px] font-semibold leading-tight text-tinta">{persona.rolNombre}</span>
                      {rolActual?.descripcion && <span className="block truncate text-xs text-tinta/60">{rolActual.descripcion}</span>}
                    </span>
                    <Chip>Ahora</Chip>
                  </div>
                  {destinos.map((r) => {
                    const elegido = r.id === rolElegido;
                    return (
                      <button
                        key={r.id}
                        type="button"
                        role="radio"
                        aria-checked={elegido}
                        onClick={() => setRolElegido(r.id)}
                        className={`grid grid-cols-[18px_minmax(0,1fr)_auto] items-center gap-x-2.5 rounded-lg border px-3 py-2 text-left transition-colors duration-200 ease-cayla ${elegido ? "border-tinta bg-hueso" : "border-sand hover:border-borde-control"}`}
                      >
                        <span aria-hidden className={`grid h-[18px] w-[18px] place-items-center rounded-full border-2 ${elegido ? "border-tinta" : "border-borde-control"}`}>
                          {elegido && <span className="h-2 w-2 rounded-full bg-tinta" />}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-[14px] font-semibold leading-tight text-tinta">{r.nombre}</span>
                          {r.descripcion && <span className="block truncate text-xs text-tinta/60">{r.descripcion}</span>}
                        </span>
                        <span className="text-xs text-tinta/60">{plural(r.modulos.filter((m) => m !== "inicio").length, "módulo", "módulos")}</span>
                      </button>
                    );
                  })}
                </div>
              </CampoGuiado>
              {destino && (
                // De qué rol a cuál, grande y sin repetir el nombre de la persona (ya está arriba): sin lista de lo que gana o pierde.
                <div className="flex flex-wrap items-center gap-2.5" aria-label={`De ${persona.rolNombre} a ${destino.nombre}`}>
                  <span className="rounded-full bg-hueso px-3.5 py-1 text-[14px] font-semibold text-tinta/65">{persona.rolNombre}</span>
                  <ArrowRight aria-hidden className="h-5 w-5 text-taupe" />
                  <span className="rounded-full bg-tinta px-4 py-1.5 text-base font-bold text-crema">{destino.nombre}</span>
                </div>
              )}
              {destino && conSede && (
                <CampoGuiado id="ficha-sede" guia={guia} titulo="Sede donde queda" ayuda="Deja de ser líder: va a trabajar en una sola.">
                  <div role="group" aria-label="Sede donde queda" className="flex flex-wrap gap-1.5">
                    {ubicaciones.map((u) => (
                      <button key={u.id} type="button" className="pildora-cayla" aria-pressed={sedeDelLider === u.id} onClick={() => setSedeDelLider(u.id)}>
                        {u.nombre}
                      </button>
                    ))}
                  </div>
                </CampoGuiado>
              )}
              {destino && persona.nivel === "lider" && !destino.fijo && debeAvisarPerdidaAdmin(persona.esAdmin, destino) && (
                <Aviso tono="atencion" chico titulo="También deja de ser Admin">
                  No podrá administrar líderes hasta que otro Admin se lo devuelva.
                </Aviso>
              )}
              {destino?.fijo && <p className="text-[13px] text-tinta/70">Como líder verá y hará todo en todas las sedes.</p>}
              <PieGuia guia={guia} listo="Todo listo para cambiar el rol." />
              {destino && cuenta && (
                <button
                  type="button"
                  className={`btn-cayla btn-primario w-full ${guia.claseConfirmar}`}
                  disabled={ocupado || !puedeCambiarRol(estadoRol)}
                  title={responsable.motivo ?? guia.frase ?? undefined}
                  onClick={() => void acciones.cambiarRol(destino.id, cuenta, conSede ? (sedeDelLider ?? undefined) : undefined)}
                >
                  Pasar a {destino.nombre}
                </button>
              )}
            </div>
          )}

          {panel === "sede" && (
            <div className="anim-revelar space-y-2 rounded-xl border border-sand p-3">
              <p className="text-[13px] text-tinta/70">{persona.nivel === "lider" ? "Sede donde abre su sesión:" : "Sede donde trabaja:"}</p>
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
              {persona.nivel === "lider" && <p className="text-xs text-tinta/60">Ve y opera todas las sedes; esta es solo la que se abre primero.</p>}
              {pieSiFalta}
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
              <CampoGuiado id="ficha-motivo" guia={guia}>
                <label className="campo block space-y-1" htmlFor={`motivo-${persona.id}`}>
                  <span className="campo-etiqueta">{guia.etiqueta("ficha-motivo", "Motivo (opcional)")}</span>
                  <span className="caja-cayla caja-campo">
                    <input
                      id={`motivo-${persona.id}`}
                      value={motivo}
                      onChange={(e) => setMotivo(e.target.value)}
                      maxLength={200}
                      autoComplete="off"
                      className="self-stretch py-0 text-sm"
                    />
                  </span>
                </label>
              </CampoGuiado>
              <PieGuia guia={guia} />
              <button type="submit" className={`btn-cayla btn-primario w-full ${guia.claseConfirmar}`} disabled={!listo} title={responsable.motivo ?? guia.frase ?? undefined}>
                Suspender a {persona.nombre.split(" ")[0]}
              </button>
            </form>
          )}
          {panel === "quitar" && pieSiFalta}
        </div>
      )}

      {rolActual && !destino && (
        <section aria-label="Lo que ve" className="space-y-2" data-guia="colaboradores.ficha-menu">
          <h3 className="flex items-baseline justify-between text-[11.5px] font-bold uppercase tracking-[0.1em] text-taupe-profundo">
            Ve
            <span className="text-xs font-normal normal-case tracking-normal text-tinta/60">{plural(rolActual.modulos.length, "módulo", "módulos")}</span>
          </h3>
          <ModulosPorGrupo modulos={rolActual.modulos} />
          {onVerRol && (
            <EnlaceVer onClick={onVerRol} guia="colaboradores.ficha-ver-rol">
              Ver el rol {persona.rolNombre}
            </EnlaceVer>
          )}
        </section>
      )}
    </Cajon>
  );
}
