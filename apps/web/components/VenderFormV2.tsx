"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { campoEtiqueta, campoSelect, botonPrimario } from "@/components/ui/Modal";
import { Segmentado } from "@/components/ui/campos";
import { ConsultaDocumento } from "@/components/ConsultaDocumento";
import { ETIQUETA_TIPO, tipoDocumentoDeCliente, type TipoComprobante } from "@/lib/comprobantes-reglas";

// Prioridad 1 (2026-09-12): pantalla mínima para poder probar Caja/POS de
// punta a punta (una caja sin ventas no se puede cuadrar). No reemplaza a
// `RegistrarVentaModal.tsx` (V1, con buscador tipo pistola Zebra) — esa
// experiencia se retoma cuando Ventas entre de lleno al roadmap; esto solo
// prueba `registrar_venta` con caja + pagos múltiples reales.
//
// Boleta/factura en el mismo paso (pedido de Felipe, 2026-09-12): antes,
// vender y facturar eran dos pantallas sin relación — la venta no dejaba
// ningún comprobante, y Facturación emitía uno "suelto" tecleando el total
// a mano. Ahora `registrar_venta` recibe el tipo elegido acá y emite el
// comprobante en la MISMA transacción (0011_venta_con_comprobante.sql):
// si no hay serie registrada para esa ubicación, la venta entera revienta
// antes de tocar el stock, en vez de quedar cobrada y sin forma de facturar.
type Variante = { varianteId: string; sku: string; referencia: string; talla: string | null; color: string | null; precio: number };
type Linea = { varianteId: string; cantidad: number; precioUnitario: number; descuentoUnitario: number };
type Pago = { metodo: "efectivo" | "tarjeta" | "yape" | "plin" | "transferencia"; monto: number };
type ComprobanteEmitido = { tipo: TipoComprobante; texto: string } | null;

const METODOS: Pago["metodo"][] = ["efectivo", "tarjeta", "yape", "plin", "transferencia"];

export function VenderFormV2({
  ubicacionId,
  ubicacionEtiqueta,
  variantes,
}: {
  ubicacionId: string;
  ubicacionEtiqueta: string;
  variantes: Variante[];
}) {
  const router = useRouter();
  const primeraVariante = variantes[0];
  const [lineas, setLineas] = useState<Linea[]>(
    primeraVariante ? [{ varianteId: primeraVariante.varianteId, cantidad: 1, precioUnitario: primeraVariante.precio, descuentoUnitario: 0 }] : []
  );
  const [pagos, setPagos] = useState<Pago[]>([{ metodo: "efectivo", monto: 0 }]);
  const [tipoComprobante, setTipoComprobante] = useState<TipoComprobante>("boleta");
  const [clienteNumDoc, setClienteNumDoc] = useState("");
  const [clienteNombre, setClienteNombre] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [ok, setOk] = useState<{ total: number; comprobante: ComprobanteEmitido } | null>(null);
  const tokenVenta = useRef<string>(crypto.randomUUID());

  const clienteTipoDoc = tipoDocumentoDeCliente(tipoComprobante, clienteNumDoc);

  const total = useMemo(
    () => lineas.reduce((acc, l) => acc + (l.precioUnitario - l.descuentoUnitario) * l.cantidad, 0),
    [lineas]
  );
  const totalPagos = useMemo(() => pagos.reduce((acc, p) => acc + p.monto, 0), [pagos]);

  function agregarLinea() {
    if (!primeraVariante) return;
    setLineas((a) => [...a, { varianteId: primeraVariante.varianteId, cantidad: 1, precioUnitario: primeraVariante.precio, descuentoUnitario: 0 }]);
  }
  function quitarLinea(i: number) {
    setLineas((a) => a.filter((_, n) => n !== i));
  }
  function actualizarLinea(i: number, cambio: Partial<Linea>) {
    setLineas((a) =>
      a.map((l, n) => {
        if (n !== i) return l;
        const siguiente = { ...l, ...cambio };
        if (cambio.varianteId) {
          const v = variantes.find((v) => v.varianteId === cambio.varianteId);
          if (v) siguiente.precioUnitario = v.precio;
        }
        return siguiente;
      })
    );
    tokenVenta.current = crypto.randomUUID();
  }

  function agregarPago() {
    setPagos((a) => [...a, { metodo: "efectivo", monto: 0 }]);
  }
  function quitarPago(i: number) {
    setPagos((a) => a.filter((_, n) => n !== i));
  }
  function actualizarPago(i: number, cambio: Partial<Pago>) {
    setPagos((a) => a.map((p, n) => (n === i ? { ...p, ...cambio } : p)));
  }
  // Un solo pago: se mantiene igual al total automáticamente (el caso común
  // — cobrar completo con un método). Con más de uno, cada monto se escribe
  // a mano porque ya es una decisión real (cuánto en efectivo, cuánto en Yape).
  function alFocoUnicoPago() {
    if (pagos.length === 1) actualizarPago(0, { monto: total });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (lineas.length === 0) {
      setError("Agrega al menos una prenda.");
      return;
    }
    if (Math.abs(total - totalPagos) > 0.001) {
      setError(`Los pagos (S/${totalPagos.toFixed(2)}) no cuadran con el total (S/${total.toFixed(2)}).`);
      return;
    }
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { data: ventaId, error } = await supabase.rpc("registrar_venta", {
      p_ubicacion_id: ubicacionId,
      p_items: lineas.map((l) => ({
        variante_id: l.varianteId,
        cantidad: l.cantidad,
        precio_unitario: l.precioUnitario,
        descuento_unitario: l.descuentoUnitario,
      })),
      p_pagos: pagos.filter((p) => p.monto > 0),
      p_token: tokenVenta.current,
      p_tipo_comprobante: tipoComprobante,
      p_cliente_tipo_doc: clienteTipoDoc,
      p_cliente_num_doc: clienteNumDoc || undefined,
      p_cliente_nombre: clienteNombre || undefined,
    });
    if (error) {
      setLoading(false);
      setError(traducirError(error, "registrar la venta"));
      return;
    }
    // El comprobante ya quedó creado en la misma transacción de arriba —
    // esta consulta es solo para mostrar su serie-número, nunca puede
    // "fallar en emitir": si algo salió mal, registrar_venta ya revirtió
    // todo y el error se mostró arriba en vez de llegar hasta acá.
    let comprobante: ComprobanteEmitido = null;
    if (ventaId) {
      const { data: comp } = await supabase
        .from("comprobantes")
        .select("tipo, serie, numero")
        .eq("venta_id", ventaId)
        .maybeSingle();
      if (comp) comprobante = { tipo: comp.tipo as TipoComprobante, texto: `${comp.serie}-${String(comp.numero).padStart(6, "0")}` };
    }
    setLoading(false);
    tokenVenta.current = crypto.randomUUID();
    setOk({ total, comprobante });
    router.refresh();
  }

  if (ok) {
    return (
      <div className="card-cayla space-y-3 p-5 text-center">
        <p className="label-cayla text-[11px] text-verde-profundo">Venta registrada</p>
        <p className="font-display text-3xl text-tinta">S/{ok.total.toFixed(2)}</p>
        {ok.comprobante && (
          <p className="text-sm text-tinta/75">
            {ETIQUETA_TIPO[ok.comprobante.tipo]} <span className="font-mono tabular-nums">{ok.comprobante.texto}</span>
          </p>
        )}
        <button
          type="button"
          autoFocus
          onClick={() => {
            setOk(null);
            if (primeraVariante) {
              setLineas([{ varianteId: primeraVariante.varianteId, cantidad: 1, precioUnitario: primeraVariante.precio, descuentoUnitario: 0 }]);
            }
            setPagos([{ metodo: "efectivo", monto: 0 }]);
            setTipoComprobante("boleta");
            setClienteNumDoc("");
            setClienteNombre("");
          }}
          className={`${botonPrimario} w-full`}
        >
          Nueva venta
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="card-cayla space-y-5 p-5">
      <div className="space-y-3">
        <p className={campoEtiqueta}>Prendas</p>
        {lineas.map((l, i) => (
          <div key={i} className="flex flex-wrap items-end gap-2">
            <select
              aria-label="Prenda"
              value={l.varianteId}
              onChange={(e) => actualizarLinea(i, { varianteId: e.target.value })}
              className={`${campoSelect} min-w-[13rem] flex-1`}
            >
              {variantes.map((v) => (
                <option key={v.varianteId} value={v.varianteId}>
                  {v.referencia} · {v.sku} {[v.talla, v.color].filter(Boolean).join("/")} — S/{v.precio.toFixed(2)}
                </option>
              ))}
            </select>
            <input
              type="number"
              min={1}
              aria-label="Cantidad"
              value={l.cantidad}
              onChange={(e) => actualizarLinea(i, { cantidad: Math.max(1, Number(e.target.value) || 1) })}
              className="w-16 border-b border-tinta/20 bg-transparent px-1 py-2 text-center text-sm text-tinta outline-none focus:border-rojo"
            />
            <input
              type="number"
              min={0}
              step="0.10"
              aria-label="Precio"
              value={l.precioUnitario}
              onChange={(e) => actualizarLinea(i, { precioUnitario: Number(e.target.value) || 0 })}
              className="w-24 border-b border-tinta/20 bg-transparent px-1 py-2 text-right text-sm text-tinta outline-none focus:border-rojo"
            />
            {lineas.length > 1 && (
              <button type="button" onClick={() => quitarLinea(i)} className="text-xs text-rojo">
                Quitar
              </button>
            )}
          </div>
        ))}
        <button type="button" onClick={agregarLinea} className="label-cayla text-[11px] text-tinta/65 hover:text-rojo">
          + Agregar línea
        </button>
      </div>

      <div className="flex justify-between border-t border-sand pt-3 text-sm font-semibold text-tinta">
        <span>Total</span>
        <span>S/{total.toFixed(2)}</span>
      </div>

      <div className="space-y-3 border-t border-sand pt-4">
        <Segmentado
          etiqueta="Comprobante"
          valor={tipoComprobante}
          onValor={(t) => {
            setTipoComprobante(t);
            setClienteNumDoc("");
            setClienteNombre("");
          }}
          opciones={[
            { valor: "boleta", texto: ETIQUETA_TIPO.boleta },
            { valor: "factura", texto: ETIQUETA_TIPO.factura },
          ] as const}
        />
        <ConsultaDocumento
          tipo={tipoComprobante === "factura" ? "ruc" : "dni"}
          obligatorio={tipoComprobante === "factura"}
          numero={clienteNumDoc}
          onNumero={setClienteNumDoc}
          nombre={clienteNombre}
          onNombre={setClienteNombre}
        />
      </div>

      <div className="space-y-3">
        <p className={campoEtiqueta}>Cómo paga — {ubicacionEtiqueta}</p>
        {pagos.map((p, i) => (
          <div key={i} className="flex flex-wrap items-end gap-2">
            <select
              aria-label="Método de pago"
              value={p.metodo}
              onChange={(e) => actualizarPago(i, { metodo: e.target.value as Pago["metodo"] })}
              className={`${campoSelect} flex-1`}
            >
              {METODOS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <input
              type="number"
              min={0}
              step="0.10"
              aria-label="Monto"
              value={p.monto}
              onFocus={alFocoUnicoPago}
              onChange={(e) => actualizarPago(i, { monto: Number(e.target.value) || 0 })}
              className="w-28 border-b border-tinta/20 bg-transparent px-1 py-2 text-right text-sm text-tinta outline-none focus:border-rojo"
            />
            {pagos.length > 1 && (
              <button type="button" onClick={() => quitarPago(i)} className="text-xs text-rojo">
                Quitar
              </button>
            )}
          </div>
        ))}
        <button type="button" onClick={agregarPago} className="label-cayla text-[11px] text-tinta/65 hover:text-rojo">
          + Pago mixto (otro método)
        </button>
        <p className={`text-xs ${Math.abs(total - totalPagos) < 0.001 ? "text-tinta/55" : "text-ambar-profundo"}`}>
          Pagos: S/{totalPagos.toFixed(2)} de S/{total.toFixed(2)}
        </p>
      </div>

      {error && <p className="text-sm text-rojo">{error}</p>}

      <button type="submit" disabled={loading} className={botonPrimario}>
        {loading ? "Registrando…" : "Registrar venta"}
      </button>
    </form>
  );
}
