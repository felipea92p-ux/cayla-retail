"use client";

import type { CSSProperties } from "react";
import type { FilaColaReintento } from "@/lib/comprobantes";
import { HORAS_AVISO_COLA } from "@/lib/facturacion-reglas";
import { duracionCorta } from "@/lib/facturacion-resumen-reglas";
import { nombreDelTipo } from "@/lib/facturacion-comprobantes-reglas";
import { coincide } from "@/lib/facturacion-busqueda";
import { errorDeColaLegible } from "@/lib/transmision-reglas";
import { useFacturacionBusqueda } from "@/lib/useFacturacionBusqueda";
import { useTransmitir } from "@/lib/useTransmitir";
import { SinCoincidencias } from "@/components/SinCoincidencias";
import { BotonCompacto } from "@/components/ui/BotonCompacto";
import { Chip } from "@/components/ui/Chip";

// «Por reintentar» (D-60): lo que Lucode/SUNAT no aceptó al cobrar y espera en la cola. Se reintenta
// solo (cada cobro y cada apertura de Comprobantes barren la cola, `/api/lucode/reintentar`); acá se ve
// cuántas veces se intentó, el último error y hace cuánto espera. «Reintentar ahora» adelanta el barrido
// para uno. Lo que pasa de una hora se pinta en rojo: el reintento solo no alcanzó y alguien tiene que
// mirar (Lucode caído mucho rato, credenciales vencidas).
export function ColaSunatPanel({ filas, tiendas }: { filas: FilaColaReintento[]; tiendas: { id: string; nombre: string }[] }) {
  const { transmitiendoId, transmitir, confirmacion: confirmacionTransmitir } = useTransmitir();
  const { texto: busqueda } = useFacturacionBusqueda();
  const nombreDe = (id: string) => tiendas.find((t) => t.id === id)?.nombre ?? "—";
  const numero = (f: FilaColaReintento) => `${f.serie}-${String(f.numero).padStart(8, "0")}`;
  const visibles = filas.filter((f) => coincide([numero(f), nombreDelTipo(f.tipo), nombreDe(f.ubicacion_id), errorDeColaLegible(f.ultimo_error_transmision)], busqueda));

  return (
    <div className="card-cayla anim-sube overflow-hidden" style={{ "--i": 3 } as CSSProperties}>
      {/* La confirmación con el combo «Responsable» antes de reintentar (ADR-0161): sin esto, «Reintentar ahora»
          abría una confirmación que nunca se pintaba. */}
      {confirmacionTransmitir}
      <div className="px-5 pt-[18px] pb-3.5">
        <h2 className="font-display text-xl leading-tight text-tinta">Por reintentar</h2>
        <p className="mt-0.5 text-xs text-tinta/65">
          SUNAT no los recibió al cobrar. No pierden su número y se reintentan solos; si uno pasa de {HORAS_AVISO_COLA} hora, mira el error.
        </p>
      </div>

      {filas.length === 0 ? (
        <p className="font-display border-t border-tinta/10 px-5 py-8 text-center text-base italic text-tinta/65">Nada en espera: todo llegó a SUNAT.</p>
      ) : visibles.length === 0 ? (
        <SinCoincidencias />
      ) : (
        visibles.map((f) => {
          const horas = f.horas_esperando ?? 0;
          const atrasado = horas >= HORAS_AVISO_COLA;
          const espera = duracionCorta(Math.round(horas * 3600)) ?? "instantes";
          const enVuelo = transmitiendoId === f.comprobante_id;
          return (
            <div key={f.comprobante_id} className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-tinta/10 px-5 py-3">
              <div className="min-w-[11rem]">
                <p className="text-[15px] text-tinta">
                  <span className="text-tinta/65">{nombreDelTipo(f.tipo)}</span> <b className="whitespace-nowrap font-semibold tabular-nums">{numero(f)}</b>
                </p>
                <p className="text-[13px] text-tinta/65">{nombreDe(f.ubicacion_id)}</p>
              </div>
              <div className="min-w-0 flex-1">
                <Chip tono={atrasado ? "rojo" : "ambar"}>
                  {atrasado ? `Hace ${espera} sin llegar` : `En cola hace ${espera}`}
                </Chip>
                <p className="mt-1 text-[13px] leading-snug text-tinta/70">
                  {f.intentos_transmision} {f.intentos_transmision === 1 ? "intento" : "intentos"}
                  {f.ultimo_error_transmision ? ` · ${errorDeColaLegible(f.ultimo_error_transmision)}` : ""}
                </p>
              </div>
              <BotonCompacto variante="fila-alerta" cargando={enVuelo} aria-label={`Reintentar ahora ${numero(f)}`} onClick={() => transmitir(f.comprobante_id)}>
                {enVuelo ? "Enviando…" : "Reintentar ahora"}
              </BotonCompacto>
            </div>
          );
        })
      )}
    </div>
  );
}
