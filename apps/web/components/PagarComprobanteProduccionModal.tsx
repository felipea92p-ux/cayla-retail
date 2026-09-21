"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { soles } from "@/lib/compras-reglas";
import { diaMes } from "@/lib/fechas-lima";
import { avisar } from "@/components/ui/Avisos";
import { Boton, CampoTexto } from "@/components/ui/campos";
import { Modal } from "@/components/ui/Modal";
import { MediosDePago } from "@/components/MediosDePago";
import { etiquetaTipo, type ComprobanteProduccion } from "@/lib/comprobantes-produccion-reglas";
import { medioNuevo, mediosParaRpc, repartoDeMedios, type MedioForm } from "@/lib/medios-pago-reglas";

// Pagar un saldo desde Por pagar (ADR-0133, F4c). Entero o en partes, con uno o varios medios: `registrar_pago_comprobante_produccion` bloquea
// el comprobante, no deja pasarse del saldo y con el mismo token no repite el pago (un reintento no cobra dos veces). Con `<Modal>` del sistema.

export function PagarComprobanteProduccionModal({ comprobante: c, hoy, onClose }: { comprobante: ComprobanteProduccion; hoy: string; onClose: () => void }) {
  const router = useRouter();
  const [token] = useState(() => crypto.randomUUID());
  const [medios, setMedios] = useState<MedioForm[]>([medioNuevo("transferencia", c.saldo.toFixed(2))]);
  const [fecha, setFecha] = useState(hoy);
  const [cargando, setCargando] = useState(false);

  const reparto = repartoDeMedios(medios, c.saldo, false);
  const errorFecha = fecha > hoy ? "La fecha del pago no puede ser futura." : fecha < c.fechaEmision ? "El pago no puede ser anterior a la emisión del comprobante." : null;
  const listo = reparto.cuadra && !reparto.error && !errorFecha;
  const quedaria = Math.round((c.saldo - reparto.suma) * 100) / 100;

  async function pagar(e: React.FormEvent) {
    e.preventDefault();
    if (!listo) return;
    setCargando(true);
    const { error } = await createClient().rpc("registrar_pago_comprobante_produccion", {
      p_comprobante_id: c.id,
      p_pagos: mediosParaRpc(medios),
      p_fecha: fecha,
      p_token: token,
    });
    setCargando(false);
    if (error) {
      avisar.error(traducirError(error, "registrar el pago"));
      return;
    }
    avisar.exito(`${soles(reparto.suma)} pagados a ${c.proveedor}`, { detalle: quedaria > 0 ? `Quedan ${soles(quedaria)} por pagar de ${c.serie}-${c.numero}.` : `${c.serie}-${c.numero} quedó pagada.` });
    router.refresh();
    onClose();
  }

  return (
    <Modal titulo="Pagar comprobante" subtitulo={`${c.proveedor} · ${etiquetaTipo(c.tipo, true)} ${c.serie}-${c.numero}`} onClose={onClose} ancho="max-w-lg">
      <form onSubmit={pagar} className="space-y-4">
        <dl className="divide-y divide-tinta/10 overflow-hidden rounded-xl border border-sand bg-crema text-[13px]">
          <div className="flex justify-between gap-3 px-3 py-2">
            <dt>Total del comprobante</dt>
            <dd className="tabular-nums">{soles(c.total)}</dd>
          </div>
          <div className="flex justify-between gap-3 px-3 py-2">
            <dt>Ya pagado</dt>
            <dd className="tabular-nums">{soles(c.pagado)}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-3 px-3 py-2.5">
            <dt className="font-semibold">Saldo{c.fechaVencimiento ? ` · vence ${diaMes(c.fechaVencimiento)}` : ""}</dt>
            <dd className="font-display text-lg tabular-nums">{soles(c.saldo)}</dd>
          </div>
        </dl>

        <MediosDePago medios={medios} onCambio={setMedios} esperado={c.saldo} exacto={false} etiquetaEsperado="Saldo" />

        <CampoTexto etiqueta="Fecha del pago" type="date" value={fecha} min={c.fechaEmision} max={hoy} onChange={(e) => setFecha(e.target.value)} tono={errorFecha ? "error" : "neutro"} pie={errorFecha ?? undefined} />

        <Boton peso="primario" type="submit" cargando={cargando} disabled={!listo} className="w-full">
          {cargando ? "Registrando…" : reparto.suma > 0 ? (quedaria > 0 ? `Pagar ${soles(reparto.suma)} · quedan ${soles(quedaria)}` : `Pagar ${soles(reparto.suma)} y saldar`) : "Pagar"}
        </Boton>
      </form>
    </Modal>
  );
}
