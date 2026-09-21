"use client";

import { useMemo, useState } from "react";
import type { DynamicDisponible } from "@/lib/colaboradores";
import type { Ubicacion } from "@/lib/ubicaciones";
import { filtrarDisponibles, resumenAlta } from "@/lib/colaboradores-reglas";
import { Modal } from "@/components/ui/Modal";
import { Boton, Campo, CampoSelect } from "@/components/ui/campos";

// Los cuatro modales de /colaboradores. Ninguno trae nada elegido de antemano en lo que da o quita acceso
// (auditoría de /colaboradores, tarea #1): quien confirma elige a la persona y la ubicación a propósito.
// Cada uno recibe `onConfirmar`, que devuelve `true` si la base aceptó; solo entonces se cierra el modal.

const entrada = "card-cayla w-full px-3 py-2 text-sm text-tinta outline-none placeholder:text-tinta/55 focus:border-rojo";

type Cerrar = () => void;

export function AgregarColaboradoresModal({
  disponibles,
  ubicaciones,
  onConfirmar,
  onClose,
}: {
  disponibles: DynamicDisponible[];
  ubicaciones: Ubicacion[];
  onConfirmar: (personas: string[], ubicacionId: string) => Promise<boolean>;
  onClose: () => void;
}) {
  const [busqueda, setBusqueda] = useState("");
  const [elegidas, setElegidas] = useState<ReadonlySet<string>>(new Set());
  const [ubicacionId, setUbicacionId] = useState("");
  const [enviando, setEnviando] = useState(false);

  const visibles = useMemo(() => filtrarDisponibles(disponibles, busqueda), [disponibles, busqueda]);
  const todasVisiblesElegidas = visibles.length > 0 && visibles.every((d) => elegidas.has(d.persona_id));
  const ubicacion = ubicaciones.find((u) => u.id === ubicacionId)?.nombre ?? null;

  function alternar(id: string) {
    setElegidas((antes) => {
      const ahora = new Set(antes);
      if (ahora.has(id)) ahora.delete(id);
      else ahora.add(id);
      return ahora;
    });
  }

  function alternarVisibles() {
    setElegidas((antes) => {
      const ahora = new Set(antes);
      for (const d of visibles) {
        if (todasVisiblesElegidas) ahora.delete(d.persona_id);
        else ahora.add(d.persona_id);
      }
      return ahora;
    });
  }

  async function enviar(e: React.FormEvent, cerrar: Cerrar) {
    e.preventDefault();
    if (elegidas.size === 0 || !ubicacionId || enviando) return;
    setEnviando(true);
    const ok = await onConfirmar([...elegidas], ubicacionId);
    setEnviando(false);
    if (ok) cerrar();
  }

  return (
    <Modal
      titulo="Agregar colaboradores"
      subtitulo="Elige entre las cuentas de Dynamic que todavía no tienen acceso a retail. Si la persona que buscas no aparece, primero debe existir y estar activa en Dynamic."
      ancho="max-w-xl"
      onClose={onClose}
    >
      {(cerrar) => (
        <form onSubmit={(e) => enviar(e, cerrar)} className="mt-5 space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <label htmlFor="alta-busqueda" className="label-cayla text-[11px] text-tinta/70">
                Cuentas disponibles en Dynamic
              </label>
              {visibles.length > 0 && (
                <button type="button" onClick={alternarVisibles} className="text-xs text-tinta/70 underline underline-offset-2 hover:text-tinta">
                  {todasVisiblesElegidas ? "Quitar la selección" : "Seleccionar todas"}
                </button>
              )}
            </div>
            <input
              id="alta-busqueda"
              type="search"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Filtrar por nombre o correo…"
              className={entrada}
              autoComplete="off"
            />
            <div className="scroll-cayla max-h-52 space-y-1.5 overflow-y-auto pr-1" role="group" aria-label="Cuentas disponibles">
              {visibles.length === 0 ? (
                <p className="rounded-md border border-dashed border-tinta/20 px-3 py-5 text-center text-xs text-tinta/65">
                  {disponibles.length === 0 ? "Todas las cuentas activas de Dynamic ya tienen acceso." : "Ninguna cuenta coincide con lo que escribiste."}
                </p>
              ) : (
                visibles.map((d) => {
                  const marcada = elegidas.has(d.persona_id);
                  return (
                    <label
                      key={d.persona_id}
                      className={`flex cursor-pointer items-center justify-between gap-3 rounded-md border px-3 py-2.5 transition-colors ${marcada ? "border-tinta/40 bg-tinta/[0.05]" : "border-tinta/15 hover:bg-tinta/[0.03]"}`}
                    >
                      <span className="flex min-w-0 items-center gap-3">
                        <input type="checkbox" checked={marcada} onChange={() => alternar(d.persona_id)} className="h-4 w-4 shrink-0 accent-[var(--color-tinta)]" />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-tinta">{d.nombre}</span>
                          <span className="block truncate text-xs text-tinta/65">{d.correo}</span>
                        </span>
                      </span>
                      {d.sede && <span className="shrink-0 text-xs text-tinta/65">{d.sede}</span>}
                    </label>
                  );
                })
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <CampoSelect
              etiqueta="Ubicación asignada"
              valor={ubicacionId}
              onValor={setUbicacionId}
              opciones={ubicaciones.map((u) => ({ valor: u.id, texto: u.nombre }))}
              marcador="Elige una ubicación"
            />
            <p className="text-xs leading-relaxed text-tinta/65">
              Entran como Colaborador, fijos a esta ubicación — no podrán cambiarla por su cuenta.
            </p>
          </div>

          <p role="status" className="rounded-md border border-tinta/15 bg-tinta/[0.03] px-3 py-2.5 text-xs font-medium text-tinta">
            {resumenAlta(elegidas.size, ubicacion)}
          </p>

          <div className="flex gap-2 pt-1">
            <Boton type="button" peso="fantasma" className="flex-1" onClick={cerrar}>
              Cancelar
            </Boton>
            <Boton type="submit" peso="primario" className="flex-1" cargando={enviando} disabled={elegidas.size === 0 || !ubicacionId}>
              {enviando ? "Agregando…" : elegidas.size > 0 ? `Agregar ${elegidas.size}` : "Agregar"}
            </Boton>
          </div>
        </form>
      )}
    </Modal>
  );
}

export function SuspenderModal({ nombre, onConfirmar, onClose }: { nombre: string; onConfirmar: (motivo: string) => Promise<boolean>; onClose: () => void }) {
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: React.FormEvent, cerrar: Cerrar) {
    e.preventDefault();
    if (enviando) return;
    setEnviando(true);
    const ok = await onConfirmar(motivo);
    setEnviando(false);
    if (ok) cerrar();
  }

  return (
    <Modal titulo="Suspender acceso" ancho="max-w-md" onClose={onClose}>
      {(cerrar) => (
        <form onSubmit={(e) => enviar(e, cerrar)} className="mt-5 space-y-4">
          <p className="text-sm leading-relaxed text-tinta/85">
            <strong className="font-semibold text-tinta">{nombre}</strong> perderá el acceso de inmediato. Quedará en la pestaña <em>Suspendidos</em> con su
            ubicación y su historial, y podrás reactivarla cuando quieras.
          </p>
          <Campo etiqueta="Motivo (opcional)" htmlFor="suspender-motivo" pie={<span className="tabular-nums">{motivo.length}/300</span>}>
            <textarea
              id="suspender-motivo"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              maxLength={300}
              rows={3}
              placeholder="Ej.: cese de temporada, licencia…"
              className={`${entrada} resize-none`}
            />
          </Campo>
          <div className="flex gap-2">
            <Boton type="button" peso="fantasma" className="flex-1" onClick={cerrar}>
              Cancelar
            </Boton>
            <Boton type="submit" peso="primario" className="flex-1" cargando={enviando}>
              {enviando ? "Suspendiendo…" : "Suspender acceso"}
            </Boton>
          </div>
        </form>
      )}
    </Modal>
  );
}

export function CambiarUbicacionModal({
  nombre,
  ubicacionActualId,
  ubicaciones,
  onConfirmar,
  onClose,
}: {
  nombre: string;
  ubicacionActualId: string | null;
  ubicaciones: Ubicacion[];
  onConfirmar: (ubicacionId: string) => Promise<boolean>;
  onClose: () => void;
}) {
  // Parte de la ubicación actual (es lo que hay hoy, no una suposición); «Guardar» espera a que cambie.
  const [ubicacionId, setUbicacionId] = useState(ubicacionActualId ?? "");
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: React.FormEvent, cerrar: Cerrar) {
    e.preventDefault();
    if (!ubicacionId || ubicacionId === ubicacionActualId || enviando) return;
    setEnviando(true);
    const ok = await onConfirmar(ubicacionId);
    setEnviando(false);
    if (ok) cerrar();
  }

  return (
    <Modal titulo="Cambiar ubicación" ancho="max-w-sm" onClose={onClose}>
      {(cerrar) => (
        <form onSubmit={(e) => enviar(e, cerrar)} className="mt-5 space-y-4">
          <p className="text-sm leading-relaxed text-tinta/85">
            Reasignar la ubicación fija de <strong className="font-semibold text-tinta">{nombre}</strong>. El cambio queda en el historial.
          </p>
          <CampoSelect
            etiqueta="Ubicación asignada"
            valor={ubicacionId}
            onValor={setUbicacionId}
            opciones={ubicaciones.map((u) => ({ valor: u.id, texto: u.nombre }))}
            marcador="Elige una ubicación"
          />
          <div className="flex gap-2">
            <Boton type="button" peso="fantasma" className="flex-1" onClick={cerrar}>
              Cancelar
            </Boton>
            <Boton type="submit" peso="primario" className="flex-1" cargando={enviando} disabled={!ubicacionId || ubicacionId === ubicacionActualId}>
              {enviando ? "Guardando…" : "Guardar"}
            </Boton>
          </div>
        </form>
      )}
    </Modal>
  );
}

export function QuitarAccesoModal({
  nombre,
  suspendida,
  onConfirmar,
  onClose,
}: {
  nombre: string;
  suspendida: boolean;
  onConfirmar: () => Promise<boolean>;
  onClose: () => void;
}) {
  const [enviando, setEnviando] = useState(false);

  async function confirmar(cerrar: Cerrar) {
    if (enviando) return;
    setEnviando(true);
    const ok = await onConfirmar();
    setEnviando(false);
    if (ok) cerrar();
  }

  return (
    <Modal titulo="Quitar acceso" ancho="max-w-sm" onClose={onClose}>
      {(cerrar) => (
        <div className="mt-5 space-y-4">
          <p className="text-sm leading-relaxed text-tinta/85">
            <strong className="font-semibold text-tinta">{nombre}</strong> ya no va a poder entrar al sistema de retail
            {suspendida ? " y dejará de figurar como suspendida" : ""}. Es una baja definitiva: para que vuelva, hay que agregarla de nuevo desde «Agregar colaboradores».
            {!suspendida && " Si solo quieres pausar el acceso, usa «Suspender»."}
          </p>
          <div className="flex gap-2">
            <Boton type="button" peso="fantasma" className="flex-1" onClick={cerrar}>
              Cancelar
            </Boton>
            <Boton type="button" peso="primario" className="flex-1 bg-rojo hover:bg-rojo/90" cargando={enviando} onClick={() => confirmar(cerrar)}>
              {enviando ? "Quitando…" : "Sí, quitar acceso"}
            </Boton>
          </div>
        </div>
      )}
    </Modal>
  );
}
