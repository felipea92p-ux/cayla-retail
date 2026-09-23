"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { Modal } from "@/components/ui/Modal";
import { CampoTexto } from "@/components/ui/campos";
import { CampoFecha } from "@/components/ui/CampoFecha";
import { ETIQUETA_METODO, soles } from "@/lib/compras-reglas";
import { hoyLima } from "@/lib/fechas-lima";
import { parseMonto } from "@/lib/por-pagar-reglas";
import { ComboResponsable } from "@/components/ComboResponsable";
import { useResponsable } from "@/lib/useResponsable";
import { firmar } from "@/lib/responsable-reglas";

// Reembolso de un proveedor (ADR-0111, corrección 2026-09-18): en vez de dejar el saldo a favor para descontarlo
// de un próximo pago, el proveedor devuelve el dinero. Es un REGISTRO —baja el saldo a favor—, no mueve caja: sin
// él, un saldo a favor solo podría gastarse comprando. Solo líder; la base lo vuelve a exigir.

export function BotonReembolso({ proveedorId, proveedorNombre, saldoFavor }: { proveedorId: string; proveedorNombre: string; saldoFavor: number }) {
  const [abierto, setAbierto] = useState(false);
  if (saldoFavor <= 0) return null;
  return (
    <>
      <button type="button" onClick={() => setAbierto(true)} className="label-cayla text-[11px] text-rojo hover:underline">
        Registrar reembolso →
      </button>
      {abierto && <ReembolsoModal proveedorId={proveedorId} proveedorNombre={proveedorNombre} saldoFavor={saldoFavor} onClose={() => setAbierto(false)} />}
    </>
  );
}

function ReembolsoModal({ proveedorId, proveedorNombre, saldoFavor, onClose }: { proveedorId: string; proveedorNombre: string; saldoFavor: number; onClose: () => void }) {
  const router = useRouter();
  const [montoTxt, setMontoTxt] = useState(saldoFavor.toFixed(2));
  const [metodo, setMetodo] = useState("transferencia");
  const [referencia, setReferencia] = useState("");
  const [fecha, setFecha] = useState(hoyLima());
  const [nota, setNota] = useState("");
  const [loading, setLoading] = useState(false);
  // Quién registra el reembolso (ADR-0161/0162): `registrar_reembolso_proveedor` firma con esa persona.
  const responsable = useResponsable();
  const monto = parseMonto(montoTxt);
  const montoOk = !Number.isNaN(monto) && monto > 0 && monto <= saldoFavor + 0.005;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!montoOk) return void avisar.error(`El reembolso tiene que ser mayor a cero y no pasar de tu saldo a favor (${soles(saldoFavor)}).`, { enfocar: "reembolso-monto" });
    if (!responsable.listo) return void (responsable.motivo && avisar.error(responsable.motivo));
    setLoading(true);
    const supabase = createClient();
    const { error } = await firmar(supabase.rpc("registrar_reembolso_proveedor", {
      p_proveedor_id: proveedorId,
      p_monto: monto,
      p_metodo: metodo,
      p_fecha: fecha,
      ...(referencia.trim() ? { p_referencia: referencia.trim() } : {}),
      ...(nota.trim() ? { p_nota: nota.trim() } : {}),
    }), responsable.firma());
    setLoading(false);
    responsable.despues(error);
    if (error) {
      avisar.error(traducirError(error, "registrar el reembolso"));
      return;
    }
    avisar.exito(`Reembolso de ${soles(monto)} registrado`, { detalle: `Tu saldo a favor con ${proveedorNombre} baja a ${soles(Math.max(0, Math.round((saldoFavor - monto) * 100) / 100))}.` });
    router.refresh();
    onClose();
  }

  return (
    <Modal titulo="Registrar reembolso" subtitulo={`${proveedorNombre} · saldo a favor ${soles(saldoFavor)}`} onClose={onClose} ancho="max-w-lg">
      {(cerrar) => (
        <form onSubmit={onSubmit} className="space-y-4">
          <p className="text-sm leading-relaxed text-tinta/75">Úsalo cuando el proveedor te devolvió el dinero en vez de dejarlo como saldo a favor. Es un registro: baja tu saldo a favor y queda en su historial.</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <CampoTexto etiqueta="Monto devuelto" id="reembolso-monto" mono inputMode="decimal" value={montoTxt} onChange={(e) => setMontoTxt(e.target.value)} autoFocus />
            <CampoFecha etiqueta="Fecha" valor={fecha} onValor={setFecha} required />
          </div>
          <div>
            <p className="label-cayla text-[11px] text-tinta/65">Cómo te lo devolvió</p>
            <div role="radiogroup" aria-label="Medio de devolución" className="mt-2 flex flex-wrap gap-1.5">
              {Object.entries(ETIQUETA_METODO).map(([v, t]) => (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={metodo === v}
                  onClick={() => setMetodo(v)}
                  className={`label-cayla rounded-full border px-3 py-1 text-[10px] leading-4 transition-colors ${
                    metodo === v ? "border-tinta bg-tinta text-crema" : "border-tinta/15 bg-tinta/[0.04] text-tinta/75 hover:border-rojo hover:text-rojo"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <CampoTexto etiqueta="Referencia" mono value={referencia} onChange={(e) => setReferencia(e.target.value)} placeholder="N° operación" autoComplete="off" />
            <CampoTexto etiqueta="Nota (opcional)" value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Devolvió la diferencia…" />
          </div>
          <ComboResponsable control={responsable} deshabilitado={loading} />
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={cerrar} disabled={loading} className="label-cayla flex-1 rounded-md border border-tinta/25 px-3 py-2.5 text-[11px] text-tinta transition-colors hover:border-rojo hover:text-rojo">
              Cancelar
            </button>
            <button type="submit" disabled={loading || !montoOk} className="label-cayla flex-1 rounded-md bg-tinta px-3 py-2.5 text-[11px] text-crema transition-colors hover:bg-rojo disabled:opacity-50">
              {loading ? "Registrando…" : "Registrar reembolso"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
