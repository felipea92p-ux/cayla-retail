"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { diaMes } from "@/lib/fechas-lima";
import { avisar } from "@/components/ui/Avisos";
import { Boton, CampoTexto } from "@/components/ui/campos";
import { Modal } from "@/components/ui/Modal";
import { etiquetaTipo } from "@/lib/comprobantes-produccion-reglas";
import { UNIDADES_INSUMO, cantidadTexto } from "@/lib/insumos-reglas";
import { MOTIVOS_CIERRE, armarRecepcion, cantidadLlegada, entradaInicial, type ComprobantePorRecibir, type EntradaLinea, type MotivoCierre } from "@/lib/recibir-produccion-reglas";

// Recibir una entrega (ADR-0133, F4d). Por cada línea pendiente: cuánto llegó (en blanco = todo lo pendiente) y, si el resto no va a llegar,
// se marca «no llegará» con su motivo. Cada línea que llega abre UN lote con el costo de la línea, que la base pone sola: aquí no aparece
// ningún importe. Con el mismo token un reintento no duplica la recepción. Con `<Modal>` del sistema (ADR-0136).

export function RecibirComprobanteModal({ comprobante: c, tallerId, onClose }: { comprobante: ComprobantePorRecibir; tallerId: string; onClose: () => void }) {
  const router = useRouter();
  const [token] = useState(() => crypto.randomUUID());
  const [entradas, setEntradas] = useState<EntradaLinea[]>(c.pendientes.map(entradaInicial));
  const [nota, setNota] = useState("");
  const [cargando, setCargando] = useState(false);

  const cambiar = (itemId: string, cambio: Partial<EntradaLinea>) => setEntradas((es) => es.map((e) => (e.itemId === itemId ? { ...e, ...cambio } : e)));
  const armado = armarRecepcion(c.pendientes, entradas);

  async function recibir(e: React.FormEvent) {
    e.preventDefault();
    if (armado.error) return avisar.error(armado.error);
    setCargando(true);
    const { error } = await createClient().rpc("recibir_comprobante_produccion", {
      p_comprobante_id: c.comprobanteId,
      p_ubicacion_id: tallerId,
      p_lineas: armado.lineas,
      p_cierres: armado.cierres,
      p_nota: nota.trim() || undefined,
      p_token: token,
    });
    setCargando(false);
    if (error) {
      avisar.error(traducirError(error, "registrar la recepción"));
      return;
    }
    const partes = [armado.lotes > 0 ? `${armado.lotes === 1 ? "Se abrió 1 lote" : `Se abrieron ${armado.lotes} lotes`}` : null, armado.cierres.length > 0 ? `${armado.cierres.length === 1 ? "1 línea cerrada" : `${armado.cierres.length} líneas cerradas`}` : null].filter(Boolean);
    avisar.exito(`Recepción de ${c.documento} registrada`, { detalle: `${partes.join(" · ")}. El saldo de Insumos ya lo refleja.` });
    router.refresh();
    onClose();
  }

  return (
    <Modal titulo="Recibir mercadería" subtitulo={`${c.proveedor} · ${etiquetaTipo(c.tipo, true)} ${c.documento} · ${diaMes(c.fechaEmision)}`} onClose={onClose} ancho="max-w-xl">
      <form onSubmit={recibir} className="space-y-4">
        <ul className="space-y-3">
          {c.pendientes.map((l) => {
            const e = entradas.find((x) => x.itemId === l.itemId) ?? entradaInicial(l);
            const q = cantidadLlegada(l, e);
            const resto = Math.round((l.pendiente - (Number.isNaN(q) ? 0 : q)) * 1000) / 1000;
            return (
              <li key={l.itemId} className="rounded-2xl border border-sand bg-crema p-3.5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-[14px] text-tinta">{l.insumo}</p>
                  <p className="text-xs tabular-nums text-tinta/65">
                    faltan <b className="font-semibold text-tinta">{cantidadTexto(l.pendiente, l.unidad)}</b>
                    {(l.recibido > 0 || l.cerrado > 0) && ` de ${cantidadTexto(l.facturado, l.unidad)}`}
                  </p>
                </div>
                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  <label className="flex items-center gap-2">
                    <span className="text-xs text-tinta/70">Llegó</span>
                    <input
                      inputMode="decimal"
                      aria-label={`Cantidad que llegó de ${l.insumo}`}
                      placeholder={String(l.pendiente)}
                      value={e.llego}
                      onChange={(ev) => cambiar(l.itemId, { llego: ev.target.value })}
                      className="h-9 w-28 rounded-md border border-tinta/25 bg-papel px-2 text-right text-sm tabular-nums text-tinta outline-none focus:border-rojo"
                    />
                    <span className="text-sm text-tinta/65">{UNIDADES_INSUMO[l.unidad].corta}</span>
                  </label>
                  <input
                    aria-label={`Código de lote de ${l.insumo}`}
                    placeholder="Código de lote (opcional)"
                    value={e.codigoLote}
                    onChange={(ev) => cambiar(l.itemId, { codigoLote: ev.target.value })}
                    className="h-9 min-w-0 flex-1 rounded-md border border-tinta/25 bg-papel px-2 font-mono text-sm text-tinta outline-none focus:border-rojo"
                  />
                </div>
                {resto > 0 && !Number.isNaN(q) && (
                  <div className="mt-2.5 space-y-2">
                    <label className="flex items-center gap-2 text-[13px] text-tinta/80">
                      <input type="checkbox" checked={e.noLlegara} onChange={(ev) => cambiar(l.itemId, { noLlegara: ev.target.checked })} />
                      El resto ({cantidadTexto(resto, l.unidad)}) no va a llegar
                    </label>
                    {e.noLlegara && (
                      <select
                        aria-label={`Motivo por el que no llega el resto de ${l.insumo}`}
                        value={e.motivo}
                        onChange={(ev) => cambiar(l.itemId, { motivo: ev.target.value as MotivoCierre })}
                        className="h-9 w-full rounded-md border border-tinta/25 bg-papel px-2 text-sm text-tinta outline-none focus:border-rojo"
                      >
                        {MOTIVOS_CIERRE.map((m) => (
                          <option key={m.valor} value={m.valor}>
                            {m.etiqueta}
                          </option>
                        ))}
                      </select>
                    )}
                    {!e.noLlegara && q > 0 && <p className="text-xs text-tinta/60">El resto seguirá pendiente: podrás recibirlo en otra entrega.</p>}
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        <CampoTexto etiqueta="Nota de la entrega" placeholder="Opcional · guía, quién la trajo…" value={nota} onChange={(e) => setNota(e.target.value)} />

        <div className="space-y-1.5">
          <p className="min-h-4 text-xs text-tinta/65" role="status">
            {armado.error ?? (armado.lotes > 0 ? `Se abrirá${armado.lotes === 1 ? " 1 lote" : `n ${armado.lotes} lotes`}, uno por cada línea que llegó.` : "")}
          </p>
          <Boton peso="primario" type="submit" cargando={cargando} disabled={!!armado.error} className="w-full">
            {cargando ? "Registrando…" : "Registrar recepción"}
          </Boton>
        </div>
      </form>
    </Modal>
  );
}
