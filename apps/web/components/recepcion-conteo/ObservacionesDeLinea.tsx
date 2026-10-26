"use client";

import { useRef, useState } from "react";
import { MessageSquarePlus } from "lucide-react";
import { Aviso } from "@/components/ui/Aviso";
import { avisar } from "@/components/ui/Avisos";
import { Boton } from "@/components/ui/campos";
import { Chip } from "@/components/ui/Chip";
import { Modal } from "@/components/ui/Modal";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { diaYHoraLima } from "@/lib/fechas-lima";
import { esFalloDeRed, traducirError } from "@/lib/error-escritura";
import type { ControlResponsable } from "@/lib/useResponsable";
import { registrarObservacion } from "@/lib/recepcion-conteo-acciones";
import {
  ejemploDeTipo,
  MAX_MENSAJE_OBSERVACION,
  nombreDeTipo,
  problemaDeObservacion,
  TIPOS_OBSERVACION,
  type ObservacionDeEnvio,
  type TipoObservacion,
} from "@/lib/observaciones-envio-reglas";

// Observaciones de una categoría al contar (ADR-0507): lo que se vio al abrir la caja —una prenda rota, una que faltó— con su mensaje. El
// botón abre una hoja con los tipos más comunes y un mensaje; lo anotado queda en el envío, a nombre de quien cuenta, y se ve aquí mismo.
// Anotar no cambia lo contado ni mueve stock: es un texto para las personas (Compras lo lee para reclamar). No se borra ni se edita: si
// hubo un error, se anota otra.

export function ObservacionesDeLinea({
  despachoId,
  lineaId,
  nombre,
  observaciones,
  responsable,
  onAnotada,
}: {
  despachoId: string;
  /** La línea del envío; `null` en lo que no estaba en la guía: queda como observación del envío entero. */
  lineaId: string | null;
  /** Cómo se llama lo que se cuenta («vestidos»), para el título de la hoja. */
  nombre: string;
  /** Las de esta línea, de la más vieja a la más nueva. */
  observaciones: readonly ObservacionDeEnvio[];
  responsable: ControlResponsable;
  onAnotada: (o: ObservacionDeEnvio) => void;
}) {
  const [abierta, setAbierta] = useState(false);
  return (
    <section data-guia="recepcion.observaciones" className="space-y-2.5 border-t border-sand pt-4" aria-label="Observaciones">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <p className="label-cayla text-[11px] text-taupe">
          Observaciones{observaciones.length > 0 ? ` · ${observaciones.length}` : ""} <span className="normal-case tracking-normal">· lo que viste al abrir la caja</span>
        </p>
        <Boton type="button" peso="fantasma" onClick={() => setAbierta(true)}>
          <span className="inline-flex items-center gap-2">
            <MessageSquarePlus aria-hidden className="h-4 w-4" />
            Anotar observación
          </span>
        </Boton>
      </div>
      {observaciones.length > 0 && (
        <ul className="space-y-1.5" aria-label="Observaciones anotadas">
          {observaciones.map((o) => {
            const cuando = o.creadoEn ? diaYHoraLima(o.creadoEn) : null;
            return (
              <li key={o.id} className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 rounded-xl bg-crema px-3 py-2">
                <Chip tono="ambar" versalitas={false}>
                  {nombreDeTipo(o.tipo)}
                </Chip>
                <span className="min-w-0 flex-1 basis-56 text-[14px] text-tinta">{o.mensaje}</span>
                <span className="text-xs text-taupe">{[o.creadoPor, cuando ? `${cuando.dia} ${cuando.hora}` : null].filter(Boolean).join(" · ")}</span>
              </li>
            );
          })}
        </ul>
      )}
      {abierta && <HojaObservacion despachoId={despachoId} lineaId={lineaId} nombre={nombre} responsable={responsable} onAnotada={onAnotada} onCerrar={() => setAbierta(false)} />}
    </section>
  );
}

function HojaObservacion({
  despachoId,
  lineaId,
  nombre,
  responsable,
  onAnotada,
  onCerrar,
}: {
  despachoId: string;
  lineaId: string | null;
  nombre: string;
  responsable: ControlResponsable;
  onAnotada: (o: ObservacionDeEnvio) => void;
  onCerrar: () => void;
}) {
  const [tipo, setTipo] = useState<TipoObservacion | null>(null);
  const [mensaje, setMensaje] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // El mismo token en cada reintento: si la primera llegó y solo se perdió la respuesta, la base devuelve la misma sin anotar otra.
  const [token] = useState(() => crypto.randomUUID());
  const enVuelo = useRef(false);
  const guia = useGuiaCampos([
    { id: "obs-tipo", nombre: "Qué pasó", requerido: true, hecho: tipo !== null, pendiente: "Elige qué pasó." },
    { id: "obs-mensaje", nombre: "Mensaje", requerido: true, hecho: mensaje.trim() !== "", pendiente: "Escribe qué viste." },
  ]);
  const problema = problemaDeObservacion(tipo, mensaje) ?? (responsable.listo ? null : (responsable.motivo ?? "Elige quién cuenta, a la izquierda."));

  async function guardar() {
    if (guardando || enVuelo.current || !tipo) return;
    if (problema) {
      setError(problema);
      return;
    }
    enVuelo.current = true;
    try {
      setGuardando(true);
      setError(null);
      const { observacion, error: falla } = await registrarObservacion(
        { p_despacho_id: despachoId, p_despacho_item_id: lineaId, p_tipo: tipo, p_mensaje: mensaje.trim(), p_token: token },
        responsable.firma(),
      );
      if (falla) responsable.despues(falla);
      if (falla || !observacion) {
        setGuardando(false);
        setError(
          falla
            ? esFalloDeRed(falla)
              ? "Se cortó la conexión y no sabemos si se guardó. Vuelve a pulsar «Guardar»: si ya se guardó, no se repite."
              : traducirError(falla, "anotar la observación")
            : "La base respondió, pero no pudimos leer la observación. Cierra esta hoja: debería estar anotada.",
        );
        return;
      }
      onAnotada(observacion);
      avisar.exito("Observación anotada", { detalle: nombreDeTipo(observacion.tipo) });
      onCerrar();
    } finally {
      enVuelo.current = false;
    }
  }

  return (
    <Modal titulo="Anotar observación" subtitulo={`Lo que viste con los ${nombre}. Queda en el envío, a tu nombre.`} tamano="mediana" bloqueado={guardando} onClose={onCerrar}>
      {(cerrar) => (
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void guardar();
          }}
          className="space-y-4"
        >
          <CampoGuiado id="obs-tipo" guia={guia} titulo="¿Qué pasó?" retiene="fila">
            <div role="radiogroup" aria-label="Qué pasó" className="grid gap-2 sm:grid-cols-2">
              {TIPOS_OBSERVACION.map((t) => (
                <button
                  key={t.valor}
                  type="button"
                  role="radio"
                  aria-checked={tipo === t.valor}
                  onClick={() => setTipo(t.valor)}
                  className={`rounded-2xl border px-3 py-2 text-left transition-colors ${tipo === t.valor ? "border-tinta bg-papel" : "border-sand bg-papel/70 hover:border-tinta/40"}`}
                >
                  <b className="block text-[14px] text-tinta">{t.nombre}</b>
                  <small className="block text-[12.5px] text-taupe">{t.ayuda}</small>
                </button>
              ))}
            </div>
          </CampoGuiado>

          <CampoGuiado id="obs-mensaje" guia={guia} titulo="Cuéntalo en una línea" ayuda={`hasta ${MAX_MENSAJE_OBSERVACION} letras`}>
            <textarea
              value={mensaje}
              onChange={(e) => setMensaje(e.target.value)}
              rows={3}
              maxLength={MAX_MENSAJE_OBSERVACION}
              aria-label="Mensaje de la observación"
              placeholder={ejemploDeTipo(tipo)}
              className="caja-campo-input resize-none"
            />
          </CampoGuiado>

          <PieGuia guia={guia} listo="Todo listo: guárdala." />
          {error && (
            <Aviso tono="error" titulo="No se pudo anotar">
              {error}
            </Aviso>
          )}
          <div className="pie-acciones pt-1">
            <Boton type="button" onClick={cerrar} disabled={guardando}>
              Cancelar
            </Boton>
            <Boton type="submit" peso="primario" cargando={guardando} textoCargando="Guardando…" title={problema ?? undefined} className={guia.claseConfirmar}>
              Guardar observación
            </Boton>
          </div>
        </form>
      )}
    </Modal>
  );
}
