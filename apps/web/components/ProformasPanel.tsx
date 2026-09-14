"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Proforma } from "@/lib/proformas";
import type { TipoComprobante } from "@/lib/comprobantes-reglas";
import { tipoDocumentoDeCliente } from "@/lib/comprobantes-reglas";
import { ConsultaDocumento } from "@/components/ConsultaDocumento";
import { Ayuda } from "@/components/Ayuda";
import { TarjetaIndicador } from "@/components/TarjetaIndicador";
import { Modal, campoEtiqueta, campoTexto, campoSelect, botonCancelar, botonPrimario } from "@/components/ui/Modal";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";

type Ubicacion = { id: string; nombre: string };

const ESTADO_ESTILO: Record<Proforma["estado"], string> = {
  vigente: "border-ambar/30 bg-ambar/10 text-ambar-profundo",
  convertida: "border-verde/45 bg-verde/10 text-verde-profundo",
  vencida: "border-tinta/20 bg-tinta/5 text-tinta/65",
  anulada: "border-tinta/20 bg-tinta/5 text-tinta/65",
};

const ESTADO_ETIQUETA: Record<Proforma["estado"], string> = {
  vigente: "Vigente",
  convertida: "Convertida",
  vencida: "Vencida",
  anulada: "Anulada",
};

function money(n: number) {
  return "S/" + n.toFixed(2);
}

function formatearFecha(iso: string) {
  return new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(
    new Date(iso)
  );
}

// Proforma / nota de venta: NO es un comprobante de pago (Art. 2, RS 007-99/SUNAT
// — ver ADR-0007). Sirve para cotizar o reservar antes de que la clienta decida
// comprar. Por eso vive en su propio panel, con su propia tabla, y "convertir"
// crea un comprobante NUEVO — nunca actualiza el estado de la proforma a boleta.
//
// Excepciones primero (hallazgo Oracle, Ronda 2): las proformas por vencer se
// muestran arriba de las demás, no detrás de un filtro que haya que recordar
// aplicar — es la clienta que puede volver hoy a comprar, la que más importa
// ver primero.
export function ProformasPanel({
  proformas,
  ubicaciones,
  ubicacionActualId,
}: {
  proformas: Proforma[];
  ubicaciones: Ubicacion[];
  ubicacionActualId: string;
}) {
  const router = useRouter();
  const [modal, setModal] = useState<"crear" | { convertir: Proforma } | null>(null);
  const [loading, setLoading] = useState(false);

  // Formulario de creación
  const [ubicacionId, setUbicacionId] = useState(ubicacionActualId);
  const [total, setTotal] = useState(0);
  const [clienteNombre, setClienteNombre] = useState("");
  const [venceEnDias, setVenceEnDias] = useState(7);

  // Formulario de conversión
  const [tipo, setTipo] = useState<TipoComprobante>("boleta");
  const [clienteNumDoc, setClienteNumDoc] = useState("");
  const [convertirNombre, setConvertirNombre] = useState("");
  const clienteTipoDoc = tipoDocumentoDeCliente(tipo, clienteNumDoc);

  const vigentes = proformas.filter((p) => p.estado === "vigente");
  const porVencer = vigentes.filter((p) => p.porVencer);
  const montoVigente = vigentes.reduce((acc, p) => acc + Number(p.total), 0);

  function cerrarModal() {
    setModal(null);
    setTotal(0);
    setClienteNombre("");
    setVenceEnDias(7);
    setClienteNumDoc("");
    setConvertirNombre("");
    setTipo("boleta");
  }

  async function onCrear(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const supabase = createClient();
    const igv = Math.round((total - total / 1.18) * 100) / 100;
    const subtotal = Math.round((total - igv) * 100) / 100;
    const venceAt = new Date(Date.now() + venceEnDias * 24 * 3600 * 1000).toISOString();
    const { error } = await supabase.rpc("crear_proforma", {
      p_ubicacion_id: ubicacionId,
      // Sin catálogo de ítems en esta pantalla todavía (mismo nivel de detalle
      // que "Emitir comprobante" hoy: un total, no líneas) — se guarda como un
      // solo ítem para no inventar una estructura que nadie lee todavía.
      // `precio_unitario`, no `precio`: es la forma que espera emitir_comprobante()
      // cuando convertir_proforma_a_comprobante() reenvía estos items (0010) — con
      // el nombre viejo, Lucode recibía un precio undefined en cada línea.
      p_items: [{ descripcion: "Venta", cantidad: 1, precio_unitario: total }],
      p_subtotal: subtotal,
      p_igv: igv,
      p_total: total,
      p_cliente_nombre: clienteNombre || undefined,
      p_vence_at: venceAt,
    });
    if (error) {
      avisar.error(traducirError(error, "crear la proforma"));
      setLoading(false);
      return;
    }
    setLoading(false);
    avisar.exito(`Proforma de S/ ${total.toFixed(2)} creada`, { detalle: `Vence en ${venceEnDias} ${venceEnDias === 1 ? "día" : "días"}.` });
    cerrarModal();
    router.refresh();
  }

  async function onConvertir(e: React.FormEvent, proforma: Proforma) {
    e.preventDefault();
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("convertir_proforma_a_comprobante", {
      p_proforma_id: proforma.id,
      p_tipo: tipo,
      p_cliente_tipo_doc: clienteTipoDoc,
      p_cliente_num_doc: clienteNumDoc || undefined,
      p_cliente_nombre: convertirNombre || proforma.cliente_nombre || undefined,
    });
    if (error) {
      avisar.error(traducirError(error, "convertir la proforma en comprobante"));
      setLoading(false);
      return;
    }
    setLoading(false);
    avisar.exito("Proforma convertida en comprobante", { detalle: "Búscalo en Comprobantes para transmitirlo." });
    cerrarModal();
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <TarjetaIndicador etiqueta="Proformas vigentes" valor={String(vigentes.length)} />
        <TarjetaIndicador etiqueta="Monto en proformas" valor={money(montoVigente)} />
        <TarjetaIndicador
          etiqueta="Por vencer (48h)"
          valor={String(porVencer.length)}
          critico={porVencer.length > 0}
          alerta={porVencer.length > 0 ? "Son las clientas con más chance de volver hoy a comprar." : undefined}
        />
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="label-cayla text-[11px] text-tinta/65">
            Proformas
            <Ayuda titulo="Proforma / nota de venta">
              No es un comprobante de pago — no la reconoce SUNAT ni consume un número de serie.
              Sirve para cotizar o reservar antes de que la clienta decida comprar. Cuando compra
              de verdad, la conviertes a boleta o factura y ahí nace el comprobante real.
            </Ayuda>
          </h2>
          <button
            onClick={() => setModal("crear")}
            className="label-cayla rounded-md border border-tinta/20 px-3 py-2 text-[11px] text-tinta/75 transition-colors hover:border-rojo hover:text-rojo"
          >
            Nueva proforma
          </button>
        </div>

        {proformas.length === 0 ? (
          <p className="font-display card-cayla py-8 text-center text-base italic text-tinta/65">
            Sin proformas este mes.
          </p>
        ) : (
          <div className="overflow-x-auto card-cayla">
            <table className="w-full min-w-[760px] text-left text-xs">
              <thead className="border-b border-tinta/10 text-tinta/65">
                <tr>
                  <th className="label-cayla px-3 py-2 text-[11px]">Fecha</th>
                  <th className="label-cayla px-3 py-2 text-[11px]">Cliente</th>
                  <th className="label-cayla px-3 py-2 text-[11px]">Total</th>
                  <th className="label-cayla px-3 py-2 text-[11px]">Estado</th>
                  <th className="label-cayla px-3 py-2 text-[11px]" />
                </tr>
              </thead>
              {/* Excepciones primero: vigentes (y entre ellas, por vencer) arriba de convertidas/vencidas. */}
              <tbody className="divide-y divide-tinta/5">
                {[...proformas]
                  .sort((a, b) => {
                    const orden = { vigente: 0, convertida: 1, vencida: 2, anulada: 3 };
                    // Y dentro de las vigentes, las que están por vencer primero
                    // (el comentario de arriba lo prometía; el orden no lo hacía).
                    return orden[a.estado] - orden[b.estado] || Number(b.porVencer) - Number(a.porVencer);
                  })
                  .map((p) => (
                    <tr key={p.id}>
                      <td className="px-3 py-2.5 text-tinta/75">
                        {p.porVencer && (
                          <span
                            title="Vence en menos de 48 horas"
                            className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-ambar align-middle"
                          />
                        )}
                        {formatearFecha(p.created_at)}
                      </td>
                      <td className="px-3 py-2.5 text-tinta/75">{p.cliente_nombre ?? "Cliente varios"}</td>
                      <td className="px-3 py-2.5 font-medium text-tinta">{money(Number(p.total))}</td>
                      <td className="px-3 py-2.5">
                        <span className={`label-cayla border px-3 py-1 text-[11px] ${ESTADO_ESTILO[p.estado]}`}>
                          {ESTADO_ETIQUETA[p.estado]}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        {p.estado === "vigente" && (
                          <button
                            onClick={() => setModal({ convertir: p })}
                            className="label-cayla rounded border border-tinta/25 px-2.5 py-1.5 text-[11px] text-tinta/75 transition-colors hover:border-rojo hover:text-rojo"
                          >
                            Convertir
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ==================== Modal: crear proforma ==================== */}
      {modal === "crear" && (
        <Modal titulo="Nueva proforma" onClose={cerrarModal}>
          <form onSubmit={onCrear} className="space-y-4">
            <div className="space-y-1.5">
              <label className={campoEtiqueta}>Ubicación</label>
              <select value={ubicacionId} onChange={(e) => setUbicacionId(e.target.value)} className={campoSelect}>
                {ubicaciones.map((u) => (
                  <option key={u.id} value={u.id}>{u.nombre}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className={campoEtiqueta}>Cliente (opcional)</label>
              <input
                value={clienteNombre}
                onChange={(e) => setClienteNombre(e.target.value)}
                placeholder="Nombre de la clienta"
                className={campoTexto}
              />
            </div>
            <div className="space-y-1.5">
              <label className={campoEtiqueta}>Total (incluye IGV)</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                value={total || ""}
                onChange={(e) => setTotal(Number(e.target.value))}
                className={campoTexto}
              />
            </div>
            <div className="space-y-1.5">
              <label className={campoEtiqueta}>Vigente por (días)</label>
              <input
                type="number"
                min="1"
                required
                value={venceEnDias}
                onChange={(e) => setVenceEnDias(Number(e.target.value))}
                className={campoTexto}
              />
            </div>
            <div className="flex gap-2 pt-1">
              <button type="button" onClick={cerrarModal} className={botonCancelar}>
                Cancelar
              </button>
              <button type="submit" disabled={loading} className={botonPrimario}>
                {loading ? "Guardando…" : "Guardar proforma"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ==================== Modal: convertir a comprobante ==================== */}
      {modal && typeof modal === "object" && (
        <Modal titulo="Convertir a comprobante" onClose={cerrarModal}>
          <form onSubmit={(e) => onConvertir(e, modal.convertir)} className="space-y-4">
            <p className="text-xs text-tinta/75">
              {modal.convertir.cliente_nombre ?? "Cliente varios"} · {money(Number(modal.convertir.total))}
            </p>

            <div className="space-y-1.5">
              <label className={campoEtiqueta}>Tipo</label>
              <div className="flex gap-2">
                {(["boleta", "factura"] as TipoComprobante[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => {
                      setTipo(t);
                      setClienteNumDoc("");
                      setConvertirNombre("");
                    }}
                    className={`label-cayla flex-1 border px-3 py-2 text-[11px] transition-colors ${
                      tipo === t ? "border-rojo bg-rojo/10 text-rojo-profundo" : "border-tinta/20 text-tinta/70"
                    }`}
                  >
                    {t === "boleta" ? "Boleta" : "Factura"}
                  </button>
                ))}
              </div>
            </div>

            <ConsultaDocumento
              tipo={tipo === "factura" ? "ruc" : "dni"}
              obligatorio={tipo === "factura"}
              numero={clienteNumDoc}
              onNumero={setClienteNumDoc}
              nombre={convertirNombre}
              onNombre={setConvertirNombre}
            />

            <div className="flex gap-2 pt-1">
              <button type="button" onClick={cerrarModal} className={botonCancelar}>
                Cancelar
              </button>
              <button type="submit" disabled={loading} className={botonPrimario}>
                {loading ? "Emitiendo…" : "Emitir comprobante"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
