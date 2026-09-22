"use client";

import { useMemo, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Boton, Campo, CampoSelect } from "@/components/ui/campos";
import { pideUbicacion, rolesAsignables, type CuentaConRol, type RolVista } from "@/lib/roles-reglas";
import type { Ubicacion } from "@/lib/ubicaciones";

// Los modales de «Roles y accesos» (ADR-0161 B). Todos con `<Modal>` (ADR-0136): heredan el velo, la hoja que sube y la
// cascada; no agregan movimiento propio. Cada uno recibe `onConfirmar`, que devuelve `true` si la base aceptó; solo
// entonces se cierra.

const entrada = "card-cayla w-full px-3 py-2 text-sm text-tinta outline-none placeholder:text-tinta/55 focus:border-rojo";

/** Nuevo rol o Duplicar: un nombre (y, al duplicar, de dónde sale su lista de módulos). */
export function NuevoRolModal({
  titulo,
  subtitulo,
  nombreInicial,
  onConfirmar,
  onClose,
}: {
  titulo: string;
  subtitulo: string;
  nombreInicial: string;
  onConfirmar: (nombre: string) => Promise<boolean>;
  onClose: () => void;
}) {
  const [nombre, setNombre] = useState(nombreInicial);
  const [enviando, setEnviando] = useState(false);
  const valido = nombre.trim().length > 0 && nombre.trim().length <= 60;

  return (
    <Modal titulo={titulo} subtitulo={subtitulo} onClose={onClose}>
      {(cerrar) => (
        <form
          className="mt-5 space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!valido || enviando) return;
            setEnviando(true);
            const ok = await onConfirmar(nombre.trim());
            setEnviando(false);
            if (ok) cerrar();
          }}
        >
          <Campo etiqueta="Nombre del rol" htmlFor="rol-nombre" pie="Por ejemplo: Almacén, Finanzas, Vendedora de campaña.">
            <input id="rol-nombre" className={entrada} value={nombre} maxLength={60} onChange={(e) => setNombre(e.target.value)} autoFocus autoComplete="off" />
          </Campo>
          <div className="flex justify-end gap-2">
            <Boton type="button" peso="discreto" onClick={cerrar}>
              Cancelar
            </Boton>
            <Boton type="submit" peso="primario" disabled={!valido} cargando={enviando}>
              {enviando ? "Guardando…" : "Crear rol"}
            </Boton>
          </div>
        </form>
      )}
    </Modal>
  );
}

export function RenombrarRolModal({
  rol,
  onConfirmar,
  onClose,
}: {
  rol: RolVista;
  onConfirmar: (nombre: string, descripcion: string) => Promise<boolean>;
  onClose: () => void;
}) {
  const [nombre, setNombre] = useState(rol.nombre);
  const [descripcion, setDescripcion] = useState(rol.descripcion ?? "");
  const [enviando, setEnviando] = useState(false);
  const valido = nombre.trim().length > 0 && nombre.trim().length <= 60 && descripcion.length <= 200;

  return (
    <Modal titulo="Renombrar rol" subtitulo="El cambio se ve al instante en todas las cuentas que lo tienen." onClose={onClose}>
      {(cerrar) => (
        <form
          className="mt-5 space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!valido || enviando) return;
            setEnviando(true);
            const ok = await onConfirmar(nombre.trim(), descripcion.trim());
            setEnviando(false);
            if (ok) cerrar();
          }}
        >
          <Campo etiqueta="Nombre" htmlFor="rol-renombre">
            <input id="rol-renombre" className={entrada} value={nombre} maxLength={60} onChange={(e) => setNombre(e.target.value)} autoComplete="off" />
          </Campo>
          <Campo etiqueta="Descripción" htmlFor="rol-descripcion" pie="Opcional. Para qué es este rol, en una línea.">
            <input id="rol-descripcion" className={entrada} value={descripcion} maxLength={200} onChange={(e) => setDescripcion(e.target.value)} autoComplete="off" />
          </Campo>
          <div className="flex justify-end gap-2">
            <Boton type="button" peso="discreto" onClick={cerrar}>
              Cancelar
            </Boton>
            <Boton type="submit" peso="primario" disabled={!valido} cargando={enviando}>
              {enviando ? "Guardando…" : "Guardar"}
            </Boton>
          </div>
        </form>
      )}
    </Modal>
  );
}

/** Confirmar archivar: el rol deja de ofrecerse; nunca se borra y se puede restaurar. */
export function ArchivarRolModal({ rol, onConfirmar, onClose }: { rol: RolVista; onConfirmar: () => Promise<boolean>; onClose: () => void }) {
  const [enviando, setEnviando] = useState(false);
  return (
    <Modal titulo={`¿Archivar «${rol.nombre}»?`} subtitulo="Deja de ofrecerse al asignar roles. No se borra: su historial queda y se puede restaurar cuando quieras." onClose={onClose}>
      {(cerrar) => (
        <div className="mt-6 flex justify-end gap-2">
          <Boton type="button" peso="discreto" onClick={cerrar}>
            Cancelar
          </Boton>
          <Boton
            type="button"
            peso="primario"
            cargando={enviando}
            onClick={async () => {
              setEnviando(true);
              const ok = await onConfirmar();
              setEnviando(false);
              if (ok) cerrar();
            }}
          >
            {enviando ? "Archivando…" : "Archivar rol"}
          </Boton>
        </div>
      )}
    </Modal>
  );
}

/**
 * Asignar un rol a UNA cuenta. Desde Colaboradores llega con la cuenta ya elegida (`cuentaFija`) y se elige el rol;
 * desde Roles y accesos llega con el rol elegido (`rolFijo`) y se elige la cuenta. Nada viene preseleccionado en lo que
 * se cambia: quien confirma lo elige a propósito (misma regla que los modales de Colaboradores).
 */
export function AsignarRolModal({
  roles,
  cuentas,
  ubicaciones,
  cuentaFija,
  rolFijo,
  onConfirmar,
  onClose,
}: {
  /** Los roles vigentes; el modal quita el Líder si la cuenta es una terminal. */
  roles: RolVista[];
  cuentas: CuentaConRol[];
  /** Para elegir la sede de un líder al que se le baja el rol. */
  ubicaciones: Pick<Ubicacion, "id" | "nombre">[];
  cuentaFija?: CuentaConRol;
  rolFijo?: RolVista;
  onConfirmar: (rolId: string, cuenta: CuentaConRol, ubicacionId?: string) => Promise<boolean>;
  onClose: () => void;
}) {
  const [rolId, setRolId] = useState(rolFijo?.id ?? "");
  const [cuentaId, setCuentaId] = useState(cuentaFija ? `${cuentaFija.tipo}:${cuentaFija.id}` : "");
  const [ubicacionId, setUbicacionId] = useState("");
  const [enviando, setEnviando] = useState(false);
  const cuenta = cuentaFija ?? cuentas.find((c) => `${c.tipo}:${c.id}` === cuentaId);
  const rolActual = cuenta ? roles.find((r) => r.id === cuenta.rolId) : undefined;
  const destino = roles.find((r) => r.id === rolId);
  const conSede = !!cuenta && pideUbicacion(cuenta, destino);
  const opcionesRol = useMemo(() => rolesAsignables(roles, cuenta).map((r) => ({ valor: r.id, texto: r.nombre })), [roles, cuenta]);
  const opcionesCuenta = useMemo(
    () =>
      cuentas.map((c) => ({
        valor: `${c.tipo}:${c.id}`,
        texto: `${c.nombre}${c.ubicacion ? ` · ${c.ubicacion}` : ""}${c.tipo === "terminal" ? " (terminal)" : ""} — hoy: ${roles.find((r) => r.id === c.rolId)?.nombre ?? "otro rol"}`,
      })),
    [cuentas, roles],
  );
  const opcionesSede = useMemo(() => ubicaciones.map((u) => ({ valor: u.id, texto: u.nombre })), [ubicaciones]);
  const listo = !!cuenta && !!rolId && rolId !== cuenta.rolId && (!conSede || !!ubicacionId);

  return (
    <Modal
      titulo={cuentaFija ? `Rol de ${cuentaFija.nombre}` : `Asignar «${rolFijo?.nombre ?? ""}»`}
      subtitulo="Una cuenta tiene un solo rol. El cambio se aplica en su próxima pantalla: el menú y lo que puede hacer salen de su rol."
      ancho="max-w-lg"
      onClose={onClose}
    >
      {(cerrar) => (
        <form
          className="mt-5 space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!listo || !cuenta || enviando) return;
            setEnviando(true);
            const ok = await onConfirmar(rolId, cuenta, conSede ? ubicacionId : undefined);
            setEnviando(false);
            if (ok) cerrar();
          }}
        >
          {!cuentaFija && (
            <CampoSelect etiqueta="Cuenta" valor={cuentaId} onValor={setCuentaId} opciones={opcionesCuenta} marcador="Elige una persona o una terminal" />
          )}
          {cuentaFija && (
            <p className="text-sm text-tinta/75">
              Hoy tiene <strong className="font-semibold text-tinta">{rolActual?.nombre ?? "otro rol"}</strong>.
            </p>
          )}
          {!rolFijo && <CampoSelect etiqueta="Nuevo rol" valor={rolId} onValor={setRolId} opciones={opcionesRol} marcador="Elige un rol" />}
          {conSede && (
            <CampoSelect etiqueta="Sede donde queda" valor={ubicacionId} onValor={setUbicacionId} opciones={opcionesSede} marcador="Elige una sede" />
          )}
          {cuenta && rolId && rolId === cuenta.rolId && <p className="text-xs text-tinta/65">Ya tiene ese rol.</p>}
          {cuenta && destino && rolId !== cuenta.rolId && destino.fijo && (
            <p className="rounded-md border border-ambar/30 bg-ambar/10 px-3.5 py-2.5 text-[13px] leading-relaxed text-ambar-profundo">
              Como líder verá y hará todo en todas las sedes, incluidos Colaboradores y Roles y accesos.
            </p>
          )}
          {cuenta && destino && cuenta.esLider && !destino.fijo && (
            <p className="rounded-md border border-ambar/30 bg-ambar/10 px-3.5 py-2.5 text-[13px] leading-relaxed text-ambar-profundo">
              Deja de ser líder: solo verá los módulos de «{destino.nombre}»{conSede ? ", en la sede que elijas" : ""}.
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Boton type="button" peso="discreto" onClick={cerrar}>
              Cancelar
            </Boton>
            <Boton type="submit" peso="primario" disabled={!listo} cargando={enviando}>
              {enviando ? "Guardando…" : "Asignar rol"}
            </Boton>
          </div>
        </form>
      )}
    </Modal>
  );
}
