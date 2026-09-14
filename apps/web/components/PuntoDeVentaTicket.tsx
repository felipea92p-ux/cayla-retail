"use client";

import { METODOS_PAGO, type MetodoPago } from "@cayla-retail/shared";
import { ETIQUETA_TIPO, type TipoComprobante } from "@/lib/comprobantes-reglas";
import { Ayuda } from "@/components/Ayuda";
import { ConsultaDocumento } from "@/components/ConsultaDocumento";
import { ID_CARGO_ESPECIAL, money, type ItemCarrito } from "@/components/PuntoDeVenta";

/** 18% — IGV de Perú. Solo para el desglose que se ve en pantalla: el que de
 *  verdad cuenta lo calcula `registrar_venta` en el servidor. */
const TASA_IGV = 0.18;

type Props = {
  ubicacionEtiqueta: string;
  bloqueado: boolean;
  // Ticket
  carrito: ItemCarrito[];
  onQuitar: (claveLinea: string) => void;
  onActualizar: (claveLinea: string, campo: "cantidad" | "precioUnitario", valor: number) => void;
  // Totales — ya calculados en el padre
  total: number;
  prendas: number;
  // Método de pago
  metodoPago: MetodoPago;
  onMetodoPago: (m: MetodoPago) => void;
  // Comprobante + documento de la clienta
  tipoComprobante: Extract<TipoComprobante, "boleta" | "factura">;
  onTipoComprobante: (t: Extract<TipoComprobante, "boleta" | "factura">) => void;
  clienteNumDoc: string;
  onClienteNumDoc: (v: string) => void;
  clienteNombre: string;
  onClienteNombre: (v: string) => void;
  /** Derivado en el padre: lo usa `cobrar()` para frenar y acá para apagar el botón. */
  facturaSinRuc: boolean;
  // Cobrar
  error: string | null;
  loading: boolean;
  onCobrar: (e: React.FormEvent) => void;
};

/**
 * Panel derecho de Vender: ticket, totales, método de pago, comprobante y Cobrar.
 * Sin estado propio ni hooks — todo llega por props desde `PuntoDeVenta`, que sigue
 * siendo el único dueño del carrito y de `cobrar()`. Es la costura para trabajar el
 * ticket sin tocar el catálogo (y viceversa).
 */
export function PuntoDeVentaTicket({
  ubicacionEtiqueta,
  bloqueado,
  carrito,
  onQuitar,
  onActualizar,
  total,
  prendas,
  metodoPago,
  onMetodoPago,
  tipoComprobante,
  onTipoComprobante,
  clienteNumDoc,
  onClienteNumDoc,
  clienteNombre,
  onClienteNombre,
  facturaSinRuc,
  error,
  loading,
  onCobrar,
}: Props) {
  return (
    <aside className="flex min-h-[45vh] flex-col bg-papel lg:max-h-[42rem]">
      <div className="flex items-center justify-between border-b border-sand px-5 py-4">
        <div>
          <p className="text-xs text-tinta/60">Ticket actual</p>
          <h2 className="font-display text-base text-tinta">{ubicacionEtiqueta}</h2>
        </div>
      </div>

      <form onSubmit={onCobrar} className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-40 flex-1 overflow-y-auto">
          {!carrito.length ? (
            <div className="flex h-full min-h-48 flex-col items-center justify-center px-8 text-center">
              <p className="font-medium text-tinta">El ticket está vacío</p>
              <p className="mt-1 max-w-64 text-sm text-tinta/60">Escanea una etiqueta o elige una prenda del catálogo.</p>
            </div>
          ) : (
            <div className="divide-y divide-sand">
              {carrito.map((it) => (
                <article key={it.claveLinea} className="px-5 py-4">
                  <div className="flex justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-semibold text-tinta">{it.referencia}</h3>
                      <p className="font-mono text-xs text-tinta/60">{it.sku}</p>
                    </div>
                    <button
                      type="button"
                      aria-label={`Quitar ${it.referencia}`}
                      onClick={() => onQuitar(it.claveLinea)}
                      className="label-cayla h-8 shrink-0 rounded-md px-2 text-[11px] text-rojo-profundo hover:bg-sand/40"
                    >
                      Quitar
                    </button>
                  </div>
                  <div className="mt-3 flex items-end justify-between gap-3">
                    <label className="text-[10px] text-tinta/50 uppercase">
                      Cantidad
                      <div className="mt-1 flex h-9 items-center rounded-lg border border-sand bg-crema">
                        <button
                          type="button"
                          aria-label="Reducir cantidad"
                          onClick={() => onActualizar(it.claveLinea, "cantidad", it.cantidad - 1)}
                          className="h-8 w-8 rounded-md text-base hover:bg-sand/40"
                        >
                          −
                        </button>
                        <input
                          aria-label={`Cantidad de ${it.referencia}`}
                          type="number"
                          min={1}
                          max={it.stockAqui}
                          value={it.cantidad}
                          onChange={(e) => onActualizar(it.claveLinea, "cantidad", Number(e.target.value))}
                          className="w-8 bg-transparent text-center text-sm font-semibold text-tinta outline-none"
                        />
                        <button
                          type="button"
                          aria-label="Aumentar cantidad"
                          onClick={() => onActualizar(it.claveLinea, "cantidad", it.cantidad + 1)}
                          disabled={it.cantidad >= it.stockAqui}
                          className="h-8 w-8 rounded-md text-base hover:bg-sand/40 disabled:opacity-40"
                        >
                          +
                        </button>
                      </div>
                    </label>
                    <label className="text-[10px] text-tinta/50 uppercase">
                      Precio unitario
                      <div className="mt-1 flex h-9 items-center rounded-lg border border-sand bg-crema px-2">
                        <span className="mr-1 text-xs text-tinta/60">S/</span>
                        <input
                          aria-label={`Precio de ${it.referencia}`}
                          type="number"
                          min={0}
                          step="0.10"
                          value={it.precioUnitario}
                          onChange={(e) => onActualizar(it.claveLinea, "precioUnitario", Number(e.target.value))}
                          className="w-16 bg-transparent text-right text-sm font-semibold text-tinta outline-none"
                        />
                      </div>
                    </label>
                    <div className="pb-2 text-right">
                      <p className="text-[10px] text-tinta/50 uppercase">Importe</p>
                      <p className="text-sm font-bold text-tinta">{money(it.cantidad * (it.precioUnitario - it.descuentoUnitario))}</p>
                    </div>
                  </div>
                  <p className="mt-2 text-[11px] text-tinta/50">
                    {it.varianteId === ID_CARGO_ESPECIAL ? "Cargo sin control de stock." : `Máximo disponible en sede: ${it.stockAqui}`}
                  </p>
                </article>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-sand bg-papel px-5 pt-4 pb-5">
          <div className="mb-4 flex items-end justify-between">
            <div>
              <p className="text-xs text-tinta/60">
                {prendas} {prendas === 1 ? "prenda" : "prendas"}
              </p>
              <p className="text-xs text-tinta/60">Incluye IGV ({(TASA_IGV * 100).toFixed(0)}%)</p>
            </div>
            <div className="text-right">
              <p className="label-cayla text-[11px] text-tinta/60">Total</p>
              <p className="font-display text-5xl leading-none text-tinta">{money(total)}</p>
            </div>
          </div>

          <div className="mb-3 grid grid-cols-5 gap-1 rounded-xl bg-sand/50 p-1">
            {METODOS_PAGO.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => onMetodoPago(m)}
                disabled={bloqueado}
                className={`flex h-12 items-center justify-center rounded-lg px-1 text-center text-[10px] leading-tight capitalize transition-colors ${
                  metodoPago === m ? "bg-papel text-tinta shadow-sm" : "text-tinta/60 hover:bg-papel/60"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
          <span className="mb-4 flex items-center gap-1 text-[11px] text-tinta/50">
            Cómo pagó la clienta
            <Ayuda titulo="Método de pago">
              Cómo pagó la clienta. Acá se registra, no se cobra: Yape, Plin y tarjeta se cobran en su propio
              aparato y esto es la anotación de que entró por ahí. Sirve para el cuadre del cierre, donde solo se
              cuenta el efectivo.
            </Ayuda>
          </span>

          <div className="mb-4 space-y-2 border-t border-sand pt-3">
            <span className="flex items-center gap-1 text-[11px] text-tinta/50">
              Comprobante
              <Ayuda titulo="Boleta o factura">
                Se emite junto con la venta, con serie y número oficial. Boleta admite DNI opcional o ningún
                documento; factura exige el RUC de la empresa. Si la clienta no pide nada, deja «Boleta» con el
                documento en blanco.
              </Ayuda>
            </span>
            <div className="grid grid-cols-2 gap-1 rounded-lg bg-sand/50 p-1">
              {(["boleta", "factura"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => onTipoComprobante(t)}
                  disabled={bloqueado}
                  className={`label-cayla h-8 rounded-md text-[11px] transition-colors ${
                    tipoComprobante === t ? "bg-papel text-tinta shadow-sm" : "text-tinta/60 hover:bg-papel/60"
                  }`}
                >
                  {ETIQUETA_TIPO[t]}
                </button>
              ))}
            </div>
            <fieldset disabled={bloqueado}>
              <ConsultaDocumento
                tipo={tipoComprobante === "factura" ? "ruc" : "dni"}
                obligatorio={tipoComprobante === "factura"}
                numero={clienteNumDoc}
                onNumero={onClienteNumDoc}
                nombre={clienteNombre}
                onNombre={onClienteNombre}
              />
            </fieldset>
          </div>

          {error && <p className="mb-2 text-sm text-rojo">{error}</p>}

          <button
            type="submit"
            disabled={bloqueado || loading || carrito.length === 0 || facturaSinRuc}
            className="flex h-14 w-full items-center justify-between rounded-md bg-tinta px-5 text-crema transition-colors hover:bg-rojo disabled:opacity-50"
          >
            <span className="label-cayla text-[11px]">{loading ? "Procesando…" : "Cobrar"}</span>
            <strong className="font-display text-lg">{money(total)}</strong>
          </button>
        </div>
      </form>
    </aside>
  );
}
