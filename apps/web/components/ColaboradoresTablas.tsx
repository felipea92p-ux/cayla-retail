"use client";

import type { Colaborador, ColaboradorInactivo, ColaboradorPendiente, ColaboradorSuspendido, EventoAcceso, RolColaborador, Terminal } from "@/lib/colaboradores";
import {
  accionesDeFila,
  ETIQUETA_ROL,
  fechaHoraLima,
  fechaLima,
  fraseEvento,
  plural,
  ultimoAccesoTexto,
  type AccionFila,
} from "@/lib/colaboradores-reglas";
import { diaYHoraLima } from "@/lib/fechas-lima";
import { Chip } from "@/components/ui/Chip";
import { MenuAcciones, type ItemMenu } from "@/components/ui/MenuAcciones";
import { Boton } from "@/components/ui/campos";
import { IconoAparato } from "@/components/ui/IconoAparato";

// Las tres tablas y el registro de actividad de /colaboradores. Solo dibujan lo que reciben y avisan qué se
// eligió: las decisiones (modales, llamadas a la base) viven en `ColaboradoresPanel`.

const CABECERA = "label-cayla px-4 py-2.5 text-[11px] font-semibold";
const CELDA = "px-4 py-3 align-middle";

function Caja({ minimo, children }: { minimo: string; children: React.ReactNode }) {
  return (
    <div className="card-cayla scroll-cayla overflow-hidden">
      <div className="scroll-cayla overflow-x-auto">
        <table className={`w-full ${minimo} text-left text-sm`}>{children}</table>
      </div>
    </div>
  );
}

function ChipRol({ rol }: { rol: RolColaborador }) {
  return <Chip tono="neutro">{ETIQUETA_ROL[rol]}</Chip>;
}

function Persona({ nombre, correo, tu = false, apagada = false }: { nombre: string; correo: string; tu?: boolean; apagada?: boolean }) {
  return (
    <div className={apagada ? "opacity-80" : ""}>
      <div className="flex items-center gap-2">
        <span className="font-medium text-tinta">{nombre}</span>
        {tu && <Chip tono="verde">Tú</Chip>}
      </div>
      <div className="text-xs text-tinta/65">{correo}</div>
    </div>
  );
}

const cualquiera = <span className="italic text-tinta/65">cualquiera</span>;
/** Un líder opera todas las sedes; si tiene ubicación, es solo la tienda donde arranca su sesión (20260923120000). */
function UbicacionDe({ rol, ubicacion }: { rol: string; ubicacion: string | null }) {
  if (rol !== "lider") return <>{ubicacion ?? "—"}</>;
  if (!ubicacion) return cualquiera;
  return (
    <span title="Arranca aquí; opera en cualquier sede">
      {ubicacion} <span className="italic text-tinta/65">· arranca aquí</span>
    </span>
  );
}

const ETIQUETA_ACCION: Record<AccionFila, string> = {
  cambiar_rol: "Cambiar rol",
  cambiar_ubicacion: "Cambiar ubicación",
  suspender: "Suspender acceso",
  quitar: "Quitar acceso",
};

export function TablaActivos({
  filas,
  ocupadoId,
  onAccion,
  rolDe,
}: {
  filas: Colaborador[];
  ocupadoId: string | null;
  onAccion: (c: Colaborador, accion: AccionFila) => void;
  /** El nombre del rol de cada cuenta (ADR-0161 B); sin esto, solo el nivel (Líder / Colaborador). */
  rolDe?: (id: string) => string | null;
}) {
  return (
    <Caja minimo="min-w-[860px]">
      <thead className="border-b border-tinta/10 bg-tinta/[0.03] text-tinta/70">
        <tr>
          <th className={CABECERA}>Colaborador</th>
          <th className={CABECERA}>Rol</th>
          <th className={CABECERA}>Ubicación asignada</th>
          <th className={CABECERA}>Sede en Dynamic</th>
          <th className={CABECERA}>Desde</th>
          <th className={CABECERA}>Último ingreso</th>
          <th className={`${CABECERA} text-right`}>Acciones</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-tinta/5">
        {filas.map((c) => {
          const items: ItemMenu[] = accionesDeFila(c).map((a) => ({
            clave: a,
            etiqueta: ETIQUETA_ACCION[a],
            peligro: a === "quitar",
            onSelect: () => onAccion(c, a),
          }));
          return (
            <tr key={c.persona_id} className={`transition-colors duration-150 hover:bg-tinta/[0.025] ${ocupadoId === c.persona_id ? "opacity-50" : ""}`}>
              <td className={CELDA}>
                <Persona nombre={c.nombre} correo={c.correo} tu={c.es_yo} />
              </td>
              <td className={CELDA}>
                <ChipRol rol={c.rol} />
                {c.rol !== "lider" && rolDe?.(c.persona_id) && <div className="mt-1 text-xs text-tinta/65">{rolDe(c.persona_id)}</div>}
              </td>
              <td className={`${CELDA} whitespace-nowrap text-tinta/85`}><UbicacionDe rol={c.rol} ubicacion={c.ubicacion_asignada} /></td>
              <td className={`${CELDA} whitespace-nowrap text-tinta/75`}>{c.sede ?? "—"}</td>
              <td className={`${CELDA} whitespace-nowrap tabular-nums text-tinta/75`}>{fechaLima(c.agregado_en)}</td>
              <td className={`${CELDA} whitespace-nowrap tabular-nums text-tinta/75`}>{ultimoAccesoTexto(c.ultimo_acceso)}</td>
              <td className={`${CELDA} text-right`}>
                {c.es_yo ? (
                  <span className="text-xs italic text-tinta/65">Sesión activa</span>
                ) : (
                  <MenuAcciones etiqueta={`Acciones de ${c.nombre}`} items={items} deshabilitado={ocupadoId === c.persona_id} />
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </Caja>
  );
}

// Terminales (ADR-0162): aparatos con cuenta propia, SIN persona — por eso no usan `Persona` ni el menú «⋯» de las
// personas: su única acción es Desactivar / Reactivar, a la vista (pantalla 5 del spike aprobado). Una desactivada queda
// en la lista apagada, nunca desaparece: su historial sigue firmado con `terminal_id`.
// Sin tipo desde 20260923040000: cada fila es tienda + nombre + ROL (lo que ve). Las acciones son las tres de la pantalla:
// Cambiar clave (la muestra una vez), Cambiar rol y Desactivar/Reactivar.
export function TablaTerminales({
  filas,
  ocupadoId,
  onAlternar,
  onCambiarClave,
  onCambiarRol,
}: {
  filas: Terminal[];
  ocupadoId: string | null;
  onAlternar: (t: Terminal) => void;
  onCambiarClave?: (t: Terminal) => void;
  /** ADR-0161 B1: una terminal es una cuenta más con su rol. Sin esto (roles sin leer), no se ofrece cambiarlo. */
  onCambiarRol?: (t: Terminal) => void;
}) {
  return (
    <Caja minimo="min-w-[880px]">
      <thead className="border-b border-tinta/10 bg-tinta/[0.03] text-tinta/70">
        <tr>
          <th className={CABECERA}>Terminal</th>
          <th className={CABECERA}>Tienda</th>
          <th className={CABECERA}>Rol</th>
          <th className={CABECERA}>Estado</th>
          <th className={CABECERA}>Última actividad</th>
          <th className={`${CABECERA} text-right`}>
            <span className="sr-only">Acciones</span>
          </th>
        </tr>
      </thead>
      <tbody className="divide-y divide-tinta/5">
        {filas.map((t) => (
          <tr
            key={t.id}
            className={`transition-colors duration-150 hover:bg-tinta/[0.025] ${t.activo ? "" : "text-tinta/55"} ${ocupadoId === t.id ? "opacity-50" : ""}`}
          >
            <td className={`${CELDA} min-w-[15rem]`}>
              <div className="flex items-center gap-2.5">
                <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px] bg-sand/70 text-tinta">
                  <IconoAparato />
                </span>
                <div className="min-w-0">
                  <div className={`font-medium ${t.activo ? "text-tinta" : "text-tinta/60"}`}>{t.nombre}</div>
                  <div className="max-w-[16rem] truncate text-xs text-tinta/65" title={t.correo ?? undefined}>
                    {t.correo ?? "Sin persona · cuenta del aparato"}
                  </div>
                </div>
              </div>
            </td>
            <td className={`${CELDA} whitespace-nowrap`}>{t.ubicacion_nombre}</td>
            <td className={`${CELDA} whitespace-nowrap`}>{t.rol_nombre}</td>
            <td className={CELDA}>{t.activo ? <Chip tono="verde">Activa</Chip> : <Chip tono="apagado">Desactivada</Chip>}</td>
            <td className={`${CELDA} whitespace-nowrap tabular-nums`}>{t.ultimo_acceso ? fechaHoraLima(t.ultimo_acceso) : "Nunca"}</td>
            <td className={`${CELDA} whitespace-nowrap text-right`}>
              {onCambiarClave && (
                <Boton type="button" peso="discreto" className="mr-2 px-3 py-1.5 text-[11px]" disabled={ocupadoId !== null} onClick={() => onCambiarClave(t)}>
                  Cambiar clave
                </Boton>
              )}
              {onCambiarRol && (
                <Boton type="button" peso="discreto" className="mr-2 px-3 py-1.5 text-[11px]" disabled={ocupadoId !== null} onClick={() => onCambiarRol(t)}>
                  Cambiar rol
                </Boton>
              )}
              <Boton type="button" peso="discreto" className="px-3 py-1.5 text-[11px]" disabled={ocupadoId !== null} onClick={() => onAlternar(t)}>
                {t.activo ? "Desactivar" : "Reactivar"}
              </Boton>
            </td>
          </tr>
        ))}
      </tbody>
    </Caja>
  );
}

// D-70: altas propuestas por un líder que todavía no pueden operar — nadie entra a retail
// con un solo clic. Mismo patrón visual que TablaSuspendidos (botón primario + menú «⋯»).
export function TablaPendientes({
  filas,
  ocupadoId,
  onAprobar,
  onRechazar,
}: {
  filas: ColaboradorPendiente[];
  ocupadoId: string | null;
  onAprobar: (c: ColaboradorPendiente) => void;
  onRechazar: (c: ColaboradorPendiente) => void;
}) {
  return (
    <Caja minimo="min-w-[760px]">
      <thead className="border-b border-tinta/10 bg-tinta/[0.03] text-tinta/70">
        <tr>
          <th className={CABECERA}>Persona</th>
          <th className={CABECERA}>Ubicación propuesta</th>
          <th className={CABECERA}>Propuesta por</th>
          <th className={CABECERA}>Cuándo</th>
          <th className={`${CABECERA} text-right`}>Acciones</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-tinta/5">
        {filas.map((c) => (
          <tr key={c.persona_id} className={`transition-colors duration-150 hover:bg-tinta/[0.025] ${ocupadoId === c.persona_id ? "opacity-50" : ""}`}>
            <td className={CELDA}>
              <Persona nombre={c.nombre} correo={c.correo} />
            </td>
            <td className={`${CELDA} whitespace-nowrap text-tinta/85`}>{c.ubicacion_asignada ?? "—"}</td>
            <td className={`${CELDA} whitespace-nowrap text-tinta/75`}>{c.propuesto_por ?? "—"}</td>
            <td className={`${CELDA} whitespace-nowrap tabular-nums text-tinta/75`}>{fechaLima(c.propuesto_en)}</td>
            <td className={CELDA}>
              <div className="flex items-center justify-end gap-2">
                <Boton type="button" peso="primario" className="px-3 py-1.5 text-[11px]" disabled={ocupadoId === c.persona_id} onClick={() => onAprobar(c)}>
                  Aprobar
                </Boton>
                <MenuAcciones
                  etiqueta={`Más acciones de ${c.nombre}`}
                  deshabilitado={ocupadoId === c.persona_id}
                  items={[{ clave: "rechazar", etiqueta: "Rechazar alta", peligro: true, onSelect: () => onRechazar(c) }]}
                />
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </Caja>
  );
}

export function TablaSuspendidos({
  filas,
  ocupadoId,
  onReactivar,
  onQuitar,
}: {
  filas: ColaboradorSuspendido[];
  ocupadoId: string | null;
  onReactivar: (c: ColaboradorSuspendido) => void;
  onQuitar: (c: ColaboradorSuspendido) => void;
}) {
  return (
    <Caja minimo="min-w-[860px]">
      <thead className="border-b border-tinta/10 bg-tinta/[0.03] text-tinta/70">
        <tr>
          <th className={CABECERA}>Colaborador</th>
          <th className={CABECERA}>Rol</th>
          <th className={CABECERA}>Ubicación</th>
          <th className={CABECERA}>Suspendido</th>
          <th className={CABECERA}>Motivo</th>
          <th className={`${CABECERA} text-right`}>Acciones</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-tinta/5">
        {filas.map((c) => (
          <tr key={c.persona_id} className={`transition-colors duration-150 hover:bg-tinta/[0.025] ${ocupadoId === c.persona_id ? "opacity-50" : ""}`}>
            <td className={CELDA}>
              <Persona nombre={c.nombre} correo={c.correo} apagada />
            </td>
            <td className={CELDA}>
              <ChipRol rol={c.rol} />
            </td>
            <td className={`${CELDA} whitespace-nowrap text-tinta/85`}><UbicacionDe rol={c.rol} ubicacion={c.ubicacion_asignada} /></td>
            <td className={`${CELDA} whitespace-nowrap text-tinta/75`}>
              <div className="tabular-nums">{fechaLima(c.suspendido_en)}</div>
              {c.suspendido_por_nombre && <div className="text-xs text-tinta/65">por {c.suspendido_por_nombre}</div>}
            </td>
            <td className={`${CELDA} max-w-[260px] text-tinta/75`}>{c.motivo ?? <span className="text-tinta/65">Sin motivo</span>}</td>
            <td className={CELDA}>
              <div className="flex items-center justify-end gap-2">
                <Boton type="button" peso="discreto" className="px-3 py-1.5 text-[11px]" disabled={ocupadoId === c.persona_id} onClick={() => onReactivar(c)}>
                  Reactivar acceso
                </Boton>
                <MenuAcciones
                  etiqueta={`Más acciones de ${c.nombre}`}
                  deshabilitado={ocupadoId === c.persona_id}
                  items={[{ clave: "quitar", etiqueta: "Quitar acceso", peligro: true, onSelect: () => onQuitar(c) }]}
                />
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </Caja>
  );
}

export function TablaInactivas({ filas }: { filas: ColaboradorInactivo[] }) {
  return (
    <Caja minimo="min-w-[720px]">
      <thead className="border-b border-tinta/10 bg-tinta/[0.03] text-tinta/70">
        <tr>
          <th className={CABECERA}>Persona</th>
          <th className={CABECERA}>Tenía acceso como</th>
          <th className={CABECERA}>Sede en Dynamic</th>
          <th className={CABECERA}>Estado en Dynamic</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-tinta/5">
        {filas.map((c) => (
          <tr key={c.persona_id} className="transition-colors duration-150 hover:bg-tinta/[0.025]">
            <td className={CELDA}>
              <Persona nombre={c.nombre} correo={c.correo} apagada />
            </td>
            <td className={CELDA}>
              <div className="flex items-center gap-2">
                <ChipRol rol={c.rol} />
                {c.suspendida && <Chip tono="ambar">Suspendida</Chip>}
              </div>
            </td>
            <td className={`${CELDA} whitespace-nowrap text-tinta/75`}>{c.sede ?? "—"}</td>
            <td className={CELDA}>
              <Chip tono="neutro">{c.estado_dynamic}</Chip>
            </td>
          </tr>
        ))}
      </tbody>
    </Caja>
  );
}

export function ListaActividad({ eventos }: { eventos: EventoAcceso[] }) {
  const total = eventos[0]?.total ?? 0;
  return (
    <div className="card-cayla p-5">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2 border-b border-tinta/10 pb-3">
        <div>
          <h2 className="font-display text-lg text-tinta">Registro de accesos</h2>
          <p className="text-xs text-tinta/65">Cada alta, baja, suspensión, reactivación y cambio de ubicación queda escrito una vez. No se edita ni se borra.</p>
        </div>
        <span className="text-xs tabular-nums text-tinta/65">
          {total > eventos.length ? `Los ${eventos.length} más recientes de ${total}` : plural(total, "evento", "eventos")}
        </span>
      </div>
      <ol className="space-y-2.5">
        {eventos.map((e) => {
          const f = fraseEvento(e);
          return (
            <li key={e.id} className="flex items-start justify-between gap-4 rounded-md border border-tinta/10 bg-tinta/[0.02] px-3.5 py-3">
              <div className="flex min-w-0 items-start gap-3">
                <Chip tono={f.tono} className="mt-0.5 shrink-0">
                  {f.etiqueta}
                </Chip>
                <div className="min-w-0">
                  <p className="text-sm text-tinta">
                    {f.partes.map((p, i) => (p.fuerte ? <strong key={i} className="font-semibold">{p.texto}</strong> : <span key={i}>{p.texto}</span>))}
                  </p>
                  {f.detalle && <p className="mt-0.5 text-xs text-tinta/65">{f.detalle}</p>}
                </div>
              </div>
              <time dateTime={e.created_at} className="shrink-0 whitespace-nowrap text-xs tabular-nums text-tinta/65">
                {fechaLima(e.created_at)} · {diaYHoraLima(e.created_at).hora}
              </time>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
