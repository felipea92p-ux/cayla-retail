"use client";

import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { esMotivoDeAjuste, motivosDeMovimiento, referenciaObligatoria } from "@/lib/caja-panel-reglas";
import { Modal, campoEtiqueta, campoTexto, botonCancelar, botonPrimario } from "@/components/ui/Modal";
import { Desplegable } from "@/components/ui/campos";
import { ComboResponsable } from "@/components/ComboResponsable";
import { useResponsable } from "@/lib/useResponsable";
import { firmar } from "@/lib/responsable-reglas";

// En pantalla se dice «entrada» y «salida» (Felipe, 2026-09-22): es plata que entra o sale del cajón, y así lo dice el
// mostrador. En la base el tipo sigue siendo 'ingreso' | 'egreso' — solo cambian las palabras, no el dato.
const TEXTO_TIPO = { ingreso: "Entrada", egreso: "Salida" } as const;

// «Retiro de efectivo» y «Depósito bancario» son un egreso con motivo predefinido — mismo caso que
// registrar_movimiento_caja() en SQL: un tipo, no una tabla. «Ajuste de caja» además marca es_ajuste=true, que
// la RPC exige de líder (ADR-0056). Las listas y las reglas viven en lib/caja-panel-reglas.ts.

export function MovimientoCajaModal({ cajaId, esLider, onClose }: { cajaId: string; esLider: boolean; onClose: () => void }) {
  const router = useRouter();
  // Nada viene elegido de antemano (auditoría de /caja, #6): un movimiento de plata se decide, no se acepta por defecto.
  const [tipo, setTipo] = useState<"ingreso" | "egreso" | null>(null);
  const [monto, setMonto] = useState("");
  const [motivoRapido, setMotivoRapido] = useState("");
  const [motivoLibre, setMotivoLibre] = useState("");
  const [nota, setNota] = useState("");
  const [loading, setLoading] = useState(false);
  const idEtiquetaMotivo = useId();
  // Doble clic (ADR-0190): un token por intento. Si el mismo intento llega dos veces (dos clics, un reintento tras
  // una red que se cae), la base devuelve lo ya guardado en vez de registrar el retiro dos veces. Uno por cada vez que se abre la ventana.
  const token = useRef<string>(crypto.randomUUID());
  // Quién hace el ingreso o egreso (ADR-0161, A12: el cierre de caja lo muestra por movimiento).
  const responsable = useResponsable();

  const motivosRapidos = tipo ? motivosDeMovimiento(tipo, esLider) : [];
  const mostrarLibre = motivoRapido === "Otro";
  const motivo = mostrarLibre ? motivoLibre : motivoRapido;
  const esAjuste = esMotivoDeAjuste(motivoRapido);
  const pideReferencia = referenciaObligatoria(motivoRapido);

  function cambiarTipo(t: "ingreso" | "egreso") {
    setTipo(t);
    // La lista cambia con el tipo; sin este reseteo el select quedaría con el motivo del tipo anterior.
    setMotivoRapido("");
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!tipo) {
      avisar.error("Elige si es una entrada o una salida.");
      return;
    }
    if (!motivo.trim()) {
      avisar.error("Escribe el motivo.", { enfocar: "mov-motivo-libre" });
      return;
    }
    if (pideReferencia && !nota.trim()) {
      avisar.error("Anota el N.º de operación o una referencia.", { enfocar: "mov-nota" });
      return;
    }
    if (!responsable.listo) {
      if (responsable.motivo) avisar.error(responsable.motivo);
      return;
    }
    setLoading(true);
    const supabase = createClient();
    const { error } = await firmar(
      supabase.rpc("registrar_movimiento_caja", {
        p_caja_id: cajaId,
        p_tipo: tipo,
        p_monto: Number(monto) || 0,
        p_motivo: motivo,
        p_nota: nota.trim() || undefined,
        p_es_ajuste: esAjuste,
        p_token: token.current,
      }),
      responsable.firma(),
    );
    setLoading(false);
    responsable.despues(error);
    if (error) {
      avisar.error(traducirError(error, "registrar el movimiento de caja"));
      return;
    }
    avisar.exito(`${TEXTO_TIPO[tipo]} de caja registrada`, { detalle: `S/ ${(Number(monto) || 0).toFixed(2)} · ${motivo}` });
    router.refresh();
    onClose();
  }

  return (
    <Modal titulo="Entrada o salida de caja" onClose={onClose}>
      {(cerrar) => (
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <span className={campoEtiqueta}>Tipo</span>
          <div className="flex gap-2">
            {(["ingreso", "egreso"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => cambiarTipo(t)}
                className={`flex-1 rounded-md border px-3 py-2 text-sm transition-colors ${
                  tipo !== t
                    ? "border-tinta/20 text-tinta/70"
                    : t === "ingreso"
                      ? "border-verde bg-verde/10 text-verde"
                      : "border-rojo bg-rojo/8 text-rojo"
                }`}
              >
                {TEXTO_TIPO[t]}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <label className={campoEtiqueta} htmlFor="mov-monto">
            Monto
          </label>
          <div className="relative">
            <span aria-hidden className="pointer-events-none absolute left-1 top-1/2 -translate-y-1/2 text-sm text-tinta/55">
              S/
            </span>
            <input
              id="mov-monto"
              type="number"
              inputMode="decimal"
              min={0.01}
              step="0.01"
              required
              autoFocus
              placeholder="0.00"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              className={`${campoTexto} pl-7 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none`}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <span id={idEtiquetaMotivo} className={campoEtiqueta}>
            Motivo
          </span>
          {/* El desplegable del sistema (campos.tsx), no el <select> nativo: la lista del sistema operativo no lleva
              la paleta ni el hilo, y era el único campo del modal que se veía de otra familia. */}
          <Desplegable
            valor={motivoRapido}
            onValor={setMotivoRapido}
            opciones={motivosRapidos.map((m) => ({ valor: m, texto: m }))}
            marcador={tipo ? "Elige un motivo" : "Primero elige entrada o salida"}
            idEtiqueta={idEtiquetaMotivo}
            deshabilitado={!tipo}
          />
          {/* Truco de `grid-template-rows` (0fr↔1fr, igual que el motivo del botón en
              PuntoDeVentaTicket.tsx): el campo libre queda siempre montado, y es la
              altura de su propia fila la que anima — antes el salto al elegir "Otro"
              era de golpe. El `0fr` de la fila no basta para llegar a 0px real: el
              padding/borde del campo (`card-cayla`, `border-b`) le pone un piso de
              ~17px. Se fuerzan a 0 con `!` SOLO mientras está oculto — puesto fijo,
              `min-h-0` deflacionaba también el alto NATURAL del estado abierto (el
              propio alto automático del contenedor ya salía chico, y `1fr` solo
              repartía el 100% de ESE espacio ya achicado — nunca llegaba al alto real
              con interlineado). */}
          <div className={`grid overflow-hidden transition-[grid-template-rows] ${mostrarLibre ? "mt-1.5 grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
            <input
              id="mov-motivo-libre"
              placeholder="Describe el motivo"
              value={motivoLibre}
              onChange={(e) => setMotivoLibre(e.target.value)}
              disabled={!mostrarLibre}
              className={mostrarLibre ? `min-w-0 overflow-hidden ${campoTexto}` : `min-h-0 min-w-0 overflow-hidden !border-0 !py-0 ${campoTexto}`}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className={campoEtiqueta} htmlFor="mov-nota">
            Referencia{pideReferencia ? "" : " (opcional)"}
          </label>
          <input
            id="mov-nota"
            placeholder="N° de operación, voucher, u otra nota"
            required={pideReferencia}
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            className={campoTexto}
          />
        </div>

        <ComboResponsable control={responsable} deshabilitado={loading} />
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={cerrar} className={botonCancelar}>
            Cancelar
          </button>
          <button type="submit" disabled={loading || !tipo || !motivoRapido || !responsable.listo} title={responsable.motivo ?? undefined} className={botonPrimario}>
            {loading ? "Guardando…" : "Registrar"}
          </button>
        </div>
      </form>
      )}
    </Modal>
  );
}
