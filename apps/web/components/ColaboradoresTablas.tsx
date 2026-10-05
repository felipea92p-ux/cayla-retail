"use client";

import type { EventoAcceso, Terminal } from "@/lib/colaboradores";
import { fechaHoraLima, fechaLima, fraseEvento, plural } from "@/lib/colaboradores-reglas";
import { diaYHoraLima } from "@/lib/fechas-lima";
import { Chip } from "@/components/ui/Chip";
import { Boton } from "@/components/ui/campos";
import { IconoAparato } from "@/components/ui/IconoAparato";

// La tabla de aparatos y el registro de actividad de /colaboradores. Solo dibujan lo que reciben y avisan qué se eligió:
// las decisiones (modales, llamadas a la base) viven en `ColaboradoresPanel`. Las tablas de personas por estado se fueron
// el 2026-10-05: las reemplazan la lista de Equipo y su ficha (`components/colaboradores/`).

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
