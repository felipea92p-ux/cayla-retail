"use client";

import { useRef, useState, type RefObject } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { avisar } from "@/components/ui/Avisos";
import { Modal } from "@/components/ui/Modal";
import { Boton, CampoTexto } from "@/components/ui/campos";
import { ComboResponsable } from "@/components/ComboResponsable";
import { useResponsable } from "@/lib/useResponsable";
import { firmar } from "@/lib/responsable-reglas";
import { esFalloDeRed, esRespuestaIncierta } from "@/lib/error-escritura";
import { BOTON_CONFIRMAR_DE_NUEVO } from "@/lib/bajada-reglas";
import {
  avisoTrasRetiro,
  mensajeErrorMovimientoPiso,
  RETIRO_NO_ES_BAJA,
  SENTIDO_PISO,
  textosBloqueRetiro,
  topeMovimientoPiso,
  type SentidoPiso,
} from "@/lib/inventario-reglas";
import type { PoliticaOperativaInventario } from "@/lib/politica-operativa-inventario";
/** Lo que el modal necesita de una prenda: sirve tanto a la fila de Existencias
 *  como a la de Resumen, que no comparten el resto de sus campos. */

const TOPE_ESPERA_MS = 20_000;
export type FilaParaReponer = {
  varianteId: string;
  referencia: string;
  talla: string | null;
  color: string | null;
  sku: string;
  piso: number | null;
  almacen: number | null;
};

// Llama a `retail.mover_interno` (20260914230000_inventario_piso_almacen.sql; la marca, 20260926200100):
// mismo motor que un traslado entre sedes, pero dentro de la misma
// ubicación — el total de la tienda no cambia, solo dónde vive físicamente
// la prenda. Los UUID de piso/almacén ya vienen resueltos desde el server
// component (InventarioPage → getSububicaciones): este modal nunca los
// adivina ni los busca por nombre.
//
// Sirve a los dos sentidos (`SENTIDO_PISO` en `lib/inventario-reglas.ts`): bajar
// al piso y retirar del piso son la misma llamada con origen y destino invertidos.
export function ReponerPisoModal({
  sentido,
  fila,
  ubicacionId,
  sububicacionPisoId,
  sububicacionAlmacenId,
  cantidadInicial,
  alCerrarEnfocar,
  politica,
  onClose,
}: {
  /** «bajar» = del almacén al piso; «retirar» = del piso al almacén. */
  sentido: SentidoPiso;
  fila: FilaParaReponer;
  ubicacionId: string;
  sububicacionPisoId: string;
  sububicacionAlmacenId: string;
  /** Prellenado que sugiere Resumen. La persona lo confirma o lo cambia: el modal
   *  nunca mueve nada hasta que aprieta «Confirmar». */
  cantidadInicial?: number;
  /** El control que abrió el modal (el «⋯» o el «Reponer» de la fila): al cerrar, el teclado vuelve ahí. */
  alCerrarEnfocar?: RefObject<HTMLElement | null>;
  /** La política de la sede (`politicaDe`): el aviso del retiro pregunta lo mismo que «Acción hoy» de la fila. */
  politica: PoliticaOperativaInventario;
  onClose: () => void;
}) {
  const router = useRouter();
  const regla = SENTIDO_PISO[sentido];
  const disponible = topeMovimientoPiso(sentido, fila);
  const sububicacion = { piso: sububicacionPisoId, almacen: sububicacionAlmacenId };
  const [cantidad, setCantidad] = useState(cantidadInicial && cantidadInicial > 0 ? String(Math.min(cantidadInicial, disponible)) : "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Por qué se retira (fin de temporada, cambio de exhibición…): el único rastro del motivo. `mover_interno`
  // lo guarda en `movimientos.nota` y el detalle de Movimientos ya lo muestra. Solo al retirar: al bajar, el
  // modal queda igual que siempre.
  const [nota, setNota] = useState("");
  // La marca de este intento (ADR-0208): la base la anota junto al movimiento, y el mismo intento enviado otra vez
  // (un reintento tras un corte) devuelve lo ya guardado sin mover de nuevo. Una por modal abierto: un éxito lo
  // cierra, y un rechazo de la base deja la marca libre (la transacción se deshizo), así que otra cifra con la misma
  // marca solo podría chocar tras una respuesta incierta — y ahí la cantidad y la nota quedan fijas (`congelado`).
  const token = useRef<string>(crypto.randomUUID());
  // Una vez que un envío quedó sin respuesta, solo se puede reenviar LO MISMO o cerrar, hasta que la base confirme:
  // cambiar la cifra sería otro intento y movería de nuevo lo que quizá ya se movió.
  const [congelado, setCongelado] = useState(false);
  // Candado contra el doble clic en el mismo instante: `cargando` apaga el botón recién en el render siguiente.
  // Mientras guarda tampoco se puede cerrar (Cancelar apagado y `bloqueado` en el Modal).
  const enVuelo = useRef(false);
  // Mover entre piso y almacén mueve stock: pide Responsable como toda acción que guarda en la tienda (ADR-0161).
  const responsable = useResponsable();

  // Solo al retirar: si con esta cantidad la fila va a volver a pedir «Reponer», se dice antes de confirmar.
  const avisoRetiro = sentido === "retirar" ? avisoTrasRetiro(fila, Number(cantidad), politica) : null;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (enVuelo.current) return;
    if (!responsable.listo) return;
    const n = Number(cantidad);
    if (!Number.isInteger(n) || n <= 0) {
      setError("La cantidad debe ser un número entero mayor que cero.");
      return;
    }
    // Reenviar lo congelado no es un movimiento nuevo sino la pregunta «¿se guardó?»: el tope de la pantalla puede ya
    // descontar ese mismo envío, así que responde la base (con la misma marca devuelve lo guardado).
    if (!congelado && n > disponible) {
      setError(regla.noAlcanza(n, disponible));
      return;
    }
    enVuelo.current = true;
    setLoading(true);
    setError(null);
    const supabase = createClient();
    // Sin tope, una conexión colgada dejaría el modal bloqueado para siempre: a los 20 s se corta y se trata como un
    // corte de red (mensaje honesto, se puede cerrar), porque la base pudo haber guardado igual.
    const control = new AbortController();
    const tope = window.setTimeout(() => control.abort(), TOPE_ESPERA_MS);
    const { error: errorRpc } = await firmar(supabase.rpc("mover_interno", {
      p_ubicacion_id: ubicacionId,
      p_variante_id: fila.varianteId,
      p_cantidad: n,
      p_sububicacion_origen_id: sububicacion[regla.origen],
      p_sububicacion_destino_id: sububicacion[regla.destino],
      // Sin «...»: con el objeto escrito entero, `pnpm datos:comparar` puede avisar si producción aún no acepta `p_token`.
      p_nota: sentido === "retirar" && nota.trim() ? nota.trim() : undefined,
      p_token: token.current,
    }).abortSignal(control.signal), responsable.firma());
    window.clearTimeout(tope);
    setLoading(false);
    responsable.despues(errorRpc);
    if (errorRpc) {
      // Solo se vuelve a abrir si falló: si guardó, el modal se cierra y no debe aceptar otro envío.
      enVuelo.current = false;
      setError(mensajeErrorMovimientoPiso(sentido, errorRpc, congelado));
      if (esRespuestaIncierta(errorRpc)) setCongelado(true);
      // Con la red caída no se refresca: un refresh sin red se vuelve navegación completa y borra el mensaje honesto.
      // Con la base respondiendo, las cifras refrescadas muestran si llegó a guardarse antes de repetir.
      if (!esFalloDeRed(errorRpc)) router.refresh();
      return;
    }
    avisar.exito(regla.exito(n), {
      detalle: `${fila.referencia} · ${[fila.talla, fila.color].filter(Boolean).join("/")}`,
    });
    router.refresh();
    onClose();
  }

  return (
    // El recorrido va en la bajada del título: siempre a la vista, aunque debajo haya un error o un aviso.
    <Modal titulo={regla.titulo} subtitulo={regla.recorrido} onClose={onClose} bloqueado={loading} alCerrarEnfocar={alCerrarEnfocar}>
      {(cerrar) => (
        // `noValidate`: sin él la burbuja del navegador frena el envío y no salen los textos propios (lo apartado no se mueve).
        <form onSubmit={onSubmit} className="mt-2 space-y-4" noValidate>
          <p className="text-sm text-tinta">
            {fila.referencia} <span className="text-tinta/65">{[fila.talla, fila.color].filter(Boolean).join("/")}</span>{" "}
            <span className="font-mono text-xs text-tinta/65">{fila.sku}</span>
          </p>

          {/* Las dos cifras llegan NETAS de lo apartado para clientas (Existencias pasa `pisoDisponible` y
              `almacenDisponible`): por eso dicen «Disponible». Rotularlas «actual» hacía creer que el sistema
              perdió prendas cuando la tabla mostraba lo físico y decía otra cifra; desde el 2026-09-26 la tabla
              («Stock actual») también muestra lo libre, con lo apartado debajo: las dos dicen lo mismo. */}
          <div className="card-cayla grid grid-cols-2 divide-x divide-tinta/10 text-center">
            <div className="p-3">
              <p className="label-cayla text-[10px] text-tinta/55">Disponible en piso</p>
              <p className="font-display text-xl text-tinta">{fila.piso ?? 0}</p>
            </div>
            <div className="p-3">
              <p className="label-cayla text-[10px] text-tinta/55">Disponible en almacén</p>
              <p className="font-display text-xl text-tinta">{fila.almacen ?? 0}</p>
            </div>
          </div>

          <CampoTexto
            etiqueta={regla.etiquetaCantidad}
            type="number"
            min={1}
            max={disponible}
            inputMode="numeric"
            value={cantidad}
            disabled={congelado}
            // Un error viejo no se queda pegado a una cifra nueva: taparía el aviso del retiro.
            onChange={(e) => {
              setCantidad(e.target.value);
              setError(null);
            }}
            pie={error ?? undefined}
            tono={error ? "error" : "neutro"}
            autoFocus
          />

          {sentido === "retirar" && (
            // Los textos posibles se apilan invisibles en la misma celda: mide lo del más largo y nada salta al tipear (ADR-0185).
            <div className="grid text-xs leading-snug" aria-live="polite">
              {textosBloqueRetiro(politica).map((t) => (
                <p key={t} aria-hidden inert className="invisible [grid-area:1/1]">
                  {t}
                </p>
              ))}
              <p className={`[grid-area:1/1] ${avisoRetiro ? "text-ambar" : "text-tinta/65"}`}>{avisoRetiro ?? RETIRO_NO_ES_BAJA}</p>
            </div>
          )}

          {sentido === "retirar" && (
            <CampoTexto
              etiqueta="Nota (opcional)"
              placeholder="Por qué se guarda: fin de temporada, cambio de exhibición…"
              maxLength={200}
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              disabled={loading || congelado}
            />
          )}

          <ComboResponsable control={responsable} deshabilitado={loading} />

          <div className="flex gap-2 pt-1">
            <Boton type="button" onClick={cerrar} disabled={loading} className="flex-1">
              Cancelar
            </Boton>
            <Boton
              type="submit"
              peso="primario"
              cargando={loading}
              disabled={(!congelado && disponible === 0) || !responsable.listo}
              title={responsable.motivo ?? undefined}
              className="flex-1"
            >
              {congelado ? BOTON_CONFIRMAR_DE_NUEVO : "Confirmar"}
            </Boton>
          </div>
        </form>
      )}
    </Modal>
  );
}
