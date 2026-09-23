"use client";

import { useState } from "react";
import type { Terminal } from "@/lib/colaboradores";
import type { Ubicacion } from "@/lib/ubicaciones";
import type { ResultadoClave } from "@/lib/terminales-alta";
import { codigoDeTienda, NOMBRE_MAX, nombreOcupado, nombrePropuesto, rolesParaTerminal, rolSugerido, type EntradaTerminal } from "@/lib/terminales-reglas";
import type { RolVista } from "@/lib/roles-reglas";
import { Modal } from "@/components/ui/Modal";
import { Boton, CampoSelect, CampoTexto } from "@/components/ui/campos";
import { ComboResponsable } from "@/components/ComboResponsable";
import { useResponsable } from "@/lib/useResponsable";
import { avisar } from "@/components/ui/Avisos";
import type { Firma } from "@/lib/responsable-reglas";

// Crear una terminal y cambiarle la clave desde Colaboradores ▸ Terminales (Felipe, 2026-09-22). Los dos terminan en el
// mismo segundo paso: el correo y la clave, UNA sola vez. Solo un líder llega aquí (la página exige el permiso y la
// Server Action lo vuelve a comprobar con la base antes de tocar la llave de servicio). Movimiento: el de <Modal> y nada
// más (ADR-0136); el cambio de paso vuelve a entrar en cascada porque el contenido se monta de nuevo.
// Los dos llevan el combo «Responsable» encima del botón (ADR-0161 act. d): quién creó la terminal o cambió su clave.

type Cerrar = () => void;

/** El segundo paso: lo que hay que escribir en el aparato. No se guarda en ningún lado; al cerrar, se pierde. */
function ClaveUnaVez({ resultado, onListo }: { resultado: Extract<ResultadoClave, { ok: true }>; onListo: () => void }) {
  const [copiado, setCopiado] = useState<"si" | "no" | null>(null);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(`Correo: ${resultado.correo}\nClave: ${resultado.clave}`);
      setCopiado("si");
    } catch {
      setCopiado("no");
    }
  }

  return (
    <div className="mt-5 space-y-4">
      <dl className="card-cayla divide-y divide-tinta/10 text-sm">
        <div className="flex items-baseline justify-between gap-4 px-4 py-3">
          <dt className="label-cayla text-[11px] text-tinta/65">Correo</dt>
          <dd className="break-all text-right font-medium text-tinta">{resultado.correo}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-4 px-4 py-3">
          <dt className="label-cayla text-[11px] text-tinta/65">Clave</dt>
          <dd className="font-mono text-[15px] tracking-wide text-tinta tabular-nums">{resultado.clave}</dd>
        </div>
      </dl>
      <p role="alert" className="rounded-md border border-ambar/40 bg-ambar/10 px-3 py-2.5 text-sm font-medium text-tinta">
        Anótala: no se vuelve a mostrar.
      </p>
      <p className="text-xs leading-relaxed text-tinta/70">
        En el aparato de {resultado.tienda}, abre retail e inicia sesión con este correo y esta clave. No la dejes escrita junto al aparato ni la mandes
        por chat. Si se pierde, aquí mismo: «Cambiar clave».
      </p>
      <div className="flex gap-2">
        <Boton type="button" peso="fantasma" className="flex-1" onClick={copiar}>
          {copiado === "si" ? "Copiado" : "Copiar"}
        </Boton>
        <Boton type="button" peso="primario" className="flex-1" onClick={onListo}>
          Listo
        </Boton>
      </div>
      {copiado === "no" && <p className="text-xs text-rojo">No se pudo copiar: selecciónala y cópiala a mano.</p>}
    </div>
  );
}

export function NuevaTerminalModal({
  ubicaciones,
  roles,
  terminales,
  crear,
  onCreada,
  onClose,
}: {
  ubicaciones: Ubicacion[];
  /** `null` = no se pudieron leer los roles: no se puede crear (el rol es obligatorio). */
  roles: RolVista[] | null;
  terminales: Terminal[];
  crear: (entrada: EntradaTerminal, firma: Firma | null) => Promise<ResultadoClave>;
  onCreada: (nombre: string) => void;
  onClose: () => void;
}) {
  const tiendas = ubicaciones.filter((u) => u.tipo === "tienda" && u.activo);
  const opcionesRol = roles ? rolesParaTerminal(roles) : [];
  const [ubicacionId, setUbicacionId] = useState("");
  const [nombre, setNombre] = useState("");
  const [nombreTocado, setNombreTocado] = useState(false);
  const [rolId, setRolId] = useState(() => (roles ? rolSugerido(roles) : ""));
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Extract<ResultadoClave, { ok: true }> | null>(null);
  const responsable = useResponsable();

  const activas = terminales.filter((t) => t.activo);
  const repetido = ubicacionId !== "" && nombre.trim() !== "" && nombreOcupado(activas, ubicacionId, nombre);

  function elegirTienda(id: string) {
    setUbicacionId(id);
    // Se propone un nombre mientras quien crea no haya escrito el suyo: «Terminal Caja TRU» (o «… 2 TRU» si ya hay una).
    if (!nombreTocado) {
      const tienda = tiendas.find((t) => t.id === id);
      if (tienda) setNombre(nombrePropuesto(codigoDeTienda(tienda.nombre), activas.filter((t) => t.ubicacion_id === id).map((t) => t.nombre)));
    }
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (enviando || !ubicacionId || !rolId || !nombre.trim() || repetido) return;
    if (!responsable.listo) {
      if (responsable.motivo) avisar.error(responsable.motivo);
      return;
    }
    setEnviando(true);
    setError(null);
    const r = await crear({ ubicacionId, nombre, rolId }, responsable.firma());
    setEnviando(false);
    responsable.despues(r.ok ? null : (r.causa ?? { message: r.error }));
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setResultado(r);
    onCreada(r.nombre);
  }

  // UN solo <Modal> con dos pasos: el velo no se va y vuelve entre el formulario y la clave; cambia el contenido.
  return (
    <Modal
      titulo={resultado ? `${resultado.nombre} lista` : "Nueva terminal"}
      subtitulo={
        resultado
          ? "La cuenta del aparato ya existe. Esta es su clave."
          : "Un aparato compartido de una tienda, con su propia cuenta y sin persona. Lo que ve lo decide su rol; lo que hace lo firma quien se elige como responsable."
      }
      ancho="max-w-md"
      onClose={onClose}
    >
      {(cerrar: Cerrar) =>
        resultado ? (
          <ClaveUnaVez resultado={resultado} onListo={cerrar} />
        ) : (
        <form onSubmit={enviar} className="mt-5 space-y-3">
          <CampoSelect
            etiqueta="Tienda"
            valor={ubicacionId}
            onValor={elegirTienda}
            opciones={tiendas.map((u) => ({ valor: u.id, texto: u.nombre }))}
            marcador={tiendas.length ? "Elige una tienda" : "No hay tiendas activas"}
          />
          <CampoTexto
            etiqueta="Nombre"
            value={nombre}
            maxLength={NOMBRE_MAX}
            placeholder="Terminal Caja TRU"
            autoComplete="off"
            onChange={(e) => {
              setNombre(e.target.value);
              setNombreTocado(true);
            }}
            tono={repetido ? "error" : undefined}
            pie={repetido ? "Esa tienda ya tiene una terminal activa con ese nombre." : "Es lo que se ve en el menú del aparato y en esta lista."}
          />
          <CampoSelect
            etiqueta="Rol"
            valor={rolId}
            onValor={setRolId}
            opciones={opcionesRol.map((r) => ({ valor: r.id, texto: r.nombre }))}
            marcador={roles ? "Elige un rol" : "No se pudieron leer los roles"}
            pie="Decide qué módulos ve. Se cambia cuando quieras con «Cambiar rol»."
          />
          <ComboResponsable control={responsable} deshabilitado={enviando} />
          {error && (
            <p role="alert" className="text-sm text-rojo">
              {error}
            </p>
          )}
          <div className="flex gap-2 pt-1">
            <Boton type="button" peso="fantasma" className="flex-1" onClick={cerrar}>
              Cancelar
            </Boton>
            <Boton
              type="submit"
              peso="primario"
              className="flex-1"
              cargando={enviando}
              disabled={!ubicacionId || !rolId || !nombre.trim() || repetido || !roles || !responsable.listo}
              title={responsable.motivo ?? undefined}
            >
              {enviando ? "Creando…" : "Crear terminal"}
            </Boton>
          </div>
        </form>
        )
      }
    </Modal>
  );
}

export function CambiarClaveModal({
  terminal,
  cambiar,
  onCambiada,
  onClose,
}: {
  terminal: Pick<Terminal, "id" | "nombre" | "activo">;
  cambiar: (terminalId: string, firma: Firma | null) => Promise<ResultadoClave>;
  /** `aviso`: la clave cambió pero no quedó anotado quién (ver `ResultadoClave`). */
  onCambiada: (nombre: string, aviso?: string) => void;
  onClose: () => void;
}) {
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Extract<ResultadoClave, { ok: true }> | null>(null);
  const responsable = useResponsable();

  async function confirmar() {
    if (enviando) return;
    if (!responsable.listo) {
      if (responsable.motivo) avisar.error(responsable.motivo);
      return;
    }
    setEnviando(true);
    setError(null);
    const r = await cambiar(terminal.id, responsable.firma());
    setEnviando(false);
    responsable.despues(r.ok ? null : (r.causa ?? { message: r.error }));
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setResultado(r);
    onCambiada(r.nombre, r.aviso);
  }

  return (
    <Modal
      titulo={resultado ? `Clave nueva de ${resultado.nombre}` : `Cambiar la clave de ${terminal.nombre}`}
      subtitulo={resultado ? "La clave anterior ya no sirve." : undefined}
      ancho="max-w-md"
      onClose={onClose}
    >
      {(cerrar: Cerrar) =>
        resultado ? (
          <ClaveUnaVez resultado={resultado} onListo={cerrar} />
        ) : (
        <div className="mt-5 space-y-4">
          <p className="text-sm leading-relaxed text-tinta/85">
            Se le pone una clave nueva y la de ahora deja de servir: el aparato tendrá que volver a iniciar sesión con la nueva.
            {terminal.activo ? "" : " Está desactivada: reactívala para poder usarla."}
          </p>
          <ComboResponsable control={responsable} deshabilitado={enviando} />
          {error && (
            <p role="alert" className="text-sm text-rojo">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <Boton type="button" peso="fantasma" className="flex-1" onClick={cerrar}>
              Cancelar
            </Boton>
            <Boton
              type="button"
              peso="primario"
              className="flex-1"
              cargando={enviando}
              disabled={!responsable.listo}
              title={responsable.motivo ?? undefined}
              onClick={confirmar}
            >
              {enviando ? "Cambiando…" : "Cambiar clave"}
            </Boton>
          </div>
        </div>
        )
      }
    </Modal>
  );
}
