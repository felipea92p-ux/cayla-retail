"use client";

import { useEffect, useRef, useState } from "react";
import { CirclePause, Plus, X } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { PieAcciones } from "@/components/ui/PieAcciones";
import { Boton } from "@/components/ui/campos";
import type { PestanaDeTicket } from "@/lib/tickets-abiertos-reglas";
import { haceCuanto, NOMBRE_ESPERA_MAX, sugerenciasLibresDeEspera } from "@/lib/vender-hoy-reglas";

/**
 * Los tickets abiertos, siempre a la vista, arriba del ticket (Felipe 2026-10-25, «varias ventas a la vez»). Una pestaña por
 * cliente: la que está en la caja va marcada y las demás esperan; tocar una pasa a ella sin perder la que se dejaba. Reemplaza a
 * la tira «En espera» de antes (spike 2026-09-26, hallazgo 6), que solo aparecía cuando ya había algo esperando y por eso nadie
 * la conocía; el nombre, el monto y «hace cuánto» siguen (este último, al pasar el mouse). Referentes: los «tickets abiertos» de
 * Square y los carritos guardados de Shopify POS.
 *
 * El orden y los nombres automáticos («Cliente 1», «Cliente 2»…) viven en `lib/tickets-abiertos-reglas.ts`.
 */
export function TiraDeTickets({
  pestanas,
  nombreEscrito,
  puedeNueva,
  motivoNueva,
  bloqueado,
  onIr,
  onNueva,
  onDescartar,
  onRenombrar,
}: {
  pestanas: readonly PestanaDeTicket[];
  /** Lo que la cajera escribió como nombre del ticket de la caja (vacío = lleva el automático): es lo que se edita. */
  nombreEscrito: string;
  /** El ticket de la caja ya tiene prendas y no se llegó al tope: se puede abrir otro. */
  puedeNueva: boolean;
  /** Por qué «Nueva cliente» está apagado, para decirlo en vez de dejarlo mudo; `null` si está prendido. */
  motivoNueva: string | null;
  bloqueado: boolean;
  /** Pasar a una pestaña que espera. */
  onIr: (id: string) => void;
  onNueva: () => void;
  /** `null` = el ticket de la caja. */
  onDescartar: (id: string | null) => void;
  onRenombrar: (nombre: string) => void;
}) {
  // La hora de referencia vive en estado y se refresca cada minuto: «hace 12 min» sigue al día sin recargar, y el render
  // no llama al reloj (debe dar lo mismo cada vez que React lo repite).
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  // El nombre del ticket de la caja se cambia ahí mismo, sin hoja: es un campo de un solo texto y opcional.
  const [editando, setEditando] = useState(false);
  const [borrador, setBorrador] = useState("");
  // Escape y Enter cierran la edición y el campo se desmonta con el foco adentro: sin esta marca, ese cierre disparaba un
  // `onBlur` más que guardaba lo que Escape acababa de descartar.
  const cerrada = useRef(false);
  const abrirEdicion = () => {
    cerrada.current = false;
    setBorrador(nombreEscrito);
    setEditando(true);
  };
  const cerrarEdicion = (guardar: boolean) => {
    if (cerrada.current) return;
    cerrada.current = true;
    if (guardar) onRenombrar(borrador.trim());
    setEditando(false);
  };

  // Con tres o más clientas las pestañas no caben en la columna del ticket y se deslizan. La marcada se acomoda sola a la vista:
  // si no, al abrir otra o pasar a una lejana, la cajera no vería cuál tiene en la caja.
  const tramo = useRef<HTMLDivElement>(null);
  const marcada = useRef<HTMLDivElement>(null);
  // También cuando cambia lo que dice la marcada (su nombre o su monto): al ganar un dígito se ensancha y se le cortaba el borde.
  const huella = pestanas.map((p) => (p.esActivo ? `*${p.nombre}|${p.total}` : p.id)).join("|");
  useEffect(() => {
    const t = tramo.current;
    const m = marcada.current;
    if (!t || !m) return;
    const izq = m.offsetLeft;
    const der = izq + m.offsetWidth;
    if (izq < t.scrollLeft) t.scrollLeft = Math.max(0, izq - 8);
    else if (der > t.scrollLeft + t.clientWidth) t.scrollLeft = der - t.clientWidth + 8;
  }, [huella]);

  return (
    // «Nueva cliente» va FUERA del tramo que se desliza: con tres pestañas se iba fuera de la vista y justo ese botón es lo que hay
    // que encontrar (nadie conocía la espera de antes).
    <div className="flex items-center gap-2 border-b border-sand bg-crema px-5 py-2" data-guia="vender.tickets">
      <div ref={tramo} className="scroll-cayla relative flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto" role="group" aria-label="Tickets abiertos">
        {pestanas.map((p) =>
          p.esActivo ? (
            <div
              key="caja"
              ref={marcada}
              aria-current="true"
              className="anim-revelar inline-flex h-8 shrink-0 items-center gap-1 rounded-full bg-tinta pl-3 pr-1.5 text-xs text-crema"
            >
              {editando ? (
                <input // unificar-fijo: el nombre se edita dentro de la píldora de 32 px del ticket; una caja de campo de 40 px no cabe
                  autoFocus
                  onFocus={(e) => e.currentTarget.select()}
                  value={borrador}
                  maxLength={NOMBRE_ESPERA_MAX}
                  onChange={(e) => setBorrador(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      cerrarEdicion(true);
                    } else if (e.key === "Escape") {
                      // Este Escape es del campo: no cierra nada más (ADR-0136, «Escape dentro de una hoja»).
                      e.stopPropagation();
                      cerrarEdicion(false);
                    }
                  }}
                  onBlur={() => cerrarEdicion(true)}
                  placeholder={p.nombre}
                  aria-label="Nombre de este ticket"
                  autoComplete="off"
                  className="h-6 w-28 rounded-md bg-crema px-1.5 text-xs text-tinta outline-none"
                />
              ) : (
                <button
                  type="button"
                  onClick={abrirEdicion}
                  disabled={bloqueado}
                  title="Cambiar el nombre de este ticket"
                  className="inline-flex h-full items-center gap-1.5 rounded-full pr-1"
                >
                  <b className="font-semibold">{p.nombre}</b>
                  <span className="tabular-nums text-crema/80">S/{p.total.toFixed(2)}</span>
                </button>
              )}
              {p.prendas > 0 && !editando && (
                <button
                  type="button"
                  onClick={() => onDescartar(null)}
                  disabled={bloqueado}
                  aria-label={`Descartar el ticket de ${p.nombre}`}
                  title="Descartar este ticket"
                  className="grid h-6 w-6 place-items-center rounded-full text-crema/70 transition-colors hover:text-crema"
                >
                  <X className="h-3.5 w-3.5" aria-hidden />
                </button>
              )}
            </div>
          ) : (
            <div
              key={p.id ?? p.nombre}
              className="anim-revelar inline-flex h-8 shrink-0 items-center rounded-full border border-sand bg-papel text-xs text-tinta"
            >
              <button
                type="button"
                onClick={() => p.id && onIr(p.id)}
                disabled={bloqueado}
                title={`Pasar a ${p.nombre}${p.creadoEn ? ` · lo dejaste ${haceCuanto(p.creadoEn, ahora)}` : ""}`}
                className="inline-flex h-full max-w-[11rem] items-center gap-1.5 rounded-l-full pl-3 pr-1.5 transition-colors hover:bg-sand/40"
              >
                <b className="min-w-0 truncate font-semibold">{p.nombre}</b>
                <span className="shrink-0 tabular-nums text-tinta/60">S/{p.total.toFixed(2)}</span>
              </button>
              <button
                type="button"
                onClick={() => onDescartar(p.id)}
                disabled={bloqueado}
                aria-label={`Descartar el ticket de ${p.nombre}`}
                title="Descartar este ticket"
                className="grid h-full w-7 place-items-center rounded-r-full text-tinta/60 transition-colors hover:bg-sand/40 hover:text-tinta"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            </div>
          ),
        )}
      </div>
      <button
        type="button"
        onClick={onNueva}
        disabled={!puedeNueva || bloqueado}
        title={motivoNueva ?? "Atender a otra cliente sin perder este ticket"}
        // Con una o dos pestañas dice la palabra (es lo que enseña a usarlo); con tres o más queda el «+», para que las pestañas tengan sitio.
        aria-label="Nueva cliente"
        className={`btn-cayla btn-secundario h-8 shrink-0 gap-1.5 text-[12.5px] ${pestanas.length >= 3 ? "w-8 justify-center px-0" : "px-3"}`}
      >
        <Plus className="h-4 w-4" aria-hidden />
        {pestanas.length < 3 && "Nueva cliente"}
      </button>
    </div>
  );
}

/** Antes de tirar un ticket con prendas: no se puede deshacer, así que se pregunta (y solo esto se pregunta). */
export function DescartarTicketModal({
  nombre,
  prendas,
  total,
  onDescartar,
  onClose,
}: {
  nombre: string;
  prendas: number;
  total: number;
  onDescartar: () => void;
  onClose: () => void;
}) {
  return (
    <Modal
      titulo="Descartar este ticket"
      subtitulo={`${nombre} · ${prendas} ${prendas === 1 ? "prenda" : "prendas"} · S/${total.toFixed(2)}`}
      variante="hoja"
      onClose={onClose}
    >
      {(cerrar) => (
        <>
          <p className="text-sm text-tinta/70">Se pierden las prendas y todo lo que ya se había anotado para esta cliente. No se puede deshacer.</p>
          <PieAcciones className="mt-5">
            <Boton type="button" peso="fantasma" onClick={cerrar}>
              Cancelar
            </Boton>
            <Boton
              type="button"
              peso="peligro"
              onClick={() => {
                onDescartar();
                cerrar();
              }}
            >
              Descartar ticket
            </Boton>
          </PieAcciones>
        </>
      )}
    </Modal>
  );
}

/** Antes de dejar un ticket en espera, un nombre corto para reconocerlo al volver. Opcional: Enter sin escribir lo
 *  deja como «Ticket N». Las sugerencias son de un toque porque la clienta está esperando.
 *
 *  `nombreInicial` es el nombre que el ticket YA tenía (se retomó «Probador 2» y vuelve a la espera): viene escrito
 *  para que Enter lo deje igual, y seleccionado para que escribir encima lo reemplace de una. */
export function DejarEnEsperaModal({
  onDejar,
  onClose,
  ocupados,
  nombreInicial = "",
}: {
  onDejar: (nombre: string) => void;
  onClose: () => void;
  ocupados: readonly string[];
  nombreInicial?: string;
}) {
  const [nombre, setNombre] = useState(nombreInicial);
  const libres = sugerenciasLibresDeEspera(ocupados);
  return (
    <Modal titulo="Dejar en espera" subtitulo="Un nombre corto para reconocerlo al volver. Opcional." variante="hoja" onClose={onClose}>
      {(cerrar) => (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onDejar(nombre.trim());
            cerrar();
          }}
        >
          <input
            autoFocus
            onFocus={(e) => e.currentTarget.select()}
            value={nombre}
            maxLength={NOMBRE_ESPERA_MAX}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Ej. Probador 2, señora del abrigo…"
            autoComplete="off"
            className="caja-campo-input h-11 w-full text-sm"
          />
          {libres.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {libres.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    onDejar(s);
                    cerrar();
                  }}
                  className="btn-cayla btn-secundario h-8 px-2.5 text-[12.5px]"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
          <button type="submit" className="btn-cayla btn-primario mt-4 flex h-11 w-full items-center justify-center gap-2">
            <CirclePause className="h-4 w-4" aria-hidden />
            Dejar en espera
          </button>
        </form>
      )}
    </Modal>
  );
}
