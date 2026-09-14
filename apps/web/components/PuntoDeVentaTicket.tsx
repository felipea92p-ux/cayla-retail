"use client";

import { METODOS_PAGO, type MetodoPago } from "@cayla-retail/shared";
import { ETIQUETA_TIPO, type TipoComprobante } from "@/lib/comprobantes-reglas";
import type { MomentoTicket } from "@/lib/vender-reglas";
import { Ayuda } from "@/components/Ayuda";
import { ConsultaDocumento } from "@/components/ConsultaDocumento";
import { ID_CARGO_ESPECIAL, money, type ItemCarrito } from "@/components/PuntoDeVenta";

/** 18% — IGV de Perú. Solo para el desglose que se ve en pantalla: el que de
 *  verdad cuenta lo calcula `registrar_venta` en el servidor. */
const TASA_IGV = 0.18;

/** El botón principal es el mismo en los dos momentos; cambian su texto y lo que hace.
 *  Apagado no reacciona al hover: queda justo bajo el cursor al entrar a «cobrar», y un
 *  rojo a medias ahí se leía como "casi se puede". */
const BOTON_PRINCIPAL =
  "alza-cayla flex h-14 w-full items-center justify-between rounded-md bg-tinta px-5 text-crema transition-colors hover:bg-rojo disabled:opacity-50 disabled:hover:bg-tinta";

/** Hay un solo ticket por pantalla, así que un id fijo alcanza para que el botón
 *  apagado apunte a su motivo (`aria-describedby`) sin hooks en este componente. */
const ID_MOTIVO = "ticket-motivo-bloqueo";

/** Basurero en trazo — mismo lenguaje que los íconos a mano de AppShell (V2 no trae
 *  librería de íconos; el corte V1→V2 se llevó `lucide-react` junto con shadcn). */
function IconoBasurero() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
    </svg>
  );
}

type Props = {
  bloqueado: boolean;
  // Ticket
  carrito: ItemCarrito[];
  onQuitar: (claveLinea: string) => void;
  onActualizar: (claveLinea: string, campo: "cantidad" | "precioUnitario", valor: number) => void;
  // Totales — ya calculados en el padre
  total: number;
  prendas: number;
  // Los dos momentos del ticket: «armar» (líneas + total) y «cobrar» (pago + comprobante)
  momento: MomentoTicket;
  onIrACobrar: () => void;
  onVolverATicket: () => void;
  /** Derivado en el padre, una sola vez: por qué el botón principal está apagado
   *  (o null). Apaga el botón y se muestra debajo de él, tal cual. */
  motivoBloqueo: string | null;
  // Método de pago — null hasta que la colaboradora elija uno
  metodoPago: MetodoPago | null;
  onMetodoPago: (m: MetodoPago) => void;
  // Comprobante + documento de la clienta
  tipoComprobante: Extract<TipoComprobante, "boleta" | "factura">;
  onTipoComprobante: (t: Extract<TipoComprobante, "boleta" | "factura">) => void;
  clienteNumDoc: string;
  onClienteNumDoc: (v: string) => void;
  clienteNombre: string;
  onClienteNombre: (v: string) => void;
  /** Derivado en el padre: lo usa `cobrar()` para frenar y acá para encender el (!). */
  facturaSinRuc: boolean;
  // Cobrar
  error: string | null;
  loading: boolean;
  onCobrar: (e: React.FormEvent) => void;
};

/**
 * Panel derecho de Vender, en dos momentos (decidido con Felipe el 2026-09-14):
 * «armar» muestra solo las líneas del ticket y el total; «cobrar» —recién al tocar
 * Cobrar— muestra cuánto y cómo pagó la clienta y, debajo, el comprobante con el
 * documento adentro. Escanear durante «cobrar» sigue agregando al ticket: el conteo
 * de la cabecera y el total se actualizan en vivo.
 *
 * Sin estado propio ni hooks — todo llega por props desde `PuntoDeVenta`, que sigue
 * siendo el único dueño del carrito y de `cobrar()`. Es la costura para trabajar el
 * ticket sin tocar el catálogo (y viceversa).
 */
export function PuntoDeVentaTicket({
  bloqueado,
  carrito,
  onQuitar,
  onActualizar,
  total,
  prendas,
  momento,
  onIrACobrar,
  onVolverATicket,
  motivoBloqueo,
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
  const cobrando = momento === "cobrar";
  const etiquetaPrendas = `${prendas} ${prendas === 1 ? "prenda" : "prendas"}`;
  const apagado = bloqueado || motivoBloqueo !== null;

  return (
    // En escritorio el aside llena toda la fila del POS (la raíz fija la altura al
    // viewport): cabecera y pie quedan fijos y solo el medio —líneas o cobro— scrollea.
    <aside className="flex min-h-[45vh] flex-col bg-papel lg:min-h-0">
      {/* En «armar» la cabecera dice dónde estamos; en «cobrar» ofrece la vuelta al
          ticket y el conteo vivo de prendas. Un solo título grande: la sede ya está en
          la barra de arriba («Venta en tienda · sede»), repetirla acá no decía nada. */}
      <div className="flex min-h-[4.5rem] items-center justify-between border-b border-sand px-5 py-3">
        {cobrando ? (
          <>
            <button
              type="button"
              onClick={onVolverATicket}
              disabled={bloqueado}
              className="label-cayla -ml-2 h-8 rounded-md px-2 text-[11px] text-tinta/70 transition-colors hover:bg-sand/40 hover:text-tinta"
            >
              ← Ticket
            </button>
            <div className="anim-revelar text-right">
              <h2 className="font-display text-2xl leading-none text-tinta">Cobro</h2>
              <p className="mt-1 text-xs text-tinta/60">{etiquetaPrendas}</p>
            </div>
          </>
        ) : (
          <h2 className="font-display text-2xl leading-none text-tinta">Ticket actual</h2>
        )}
      </div>

      <form onSubmit={onCobrar} className="flex min-h-0 flex-1 flex-col">
        <div className="scroll-cayla min-h-40 flex-1 overflow-y-auto">
          {cobrando ? (
            <div className="anim-revelar space-y-5 px-5 py-4">
              {/* 1 · Cuánto y cómo pagó — antes que el comprobante: el cobro existe
                  aunque la clienta no pida nada. El (!) solo aparece mientras falte. */}
              <fieldset className="space-y-2">
                <legend className="text-[11px] text-tinta/50">
                  <span className="flex items-center gap-1">
                    {metodoPago === null && (
                      <Ayuda tono="falta" titulo="Elige cómo pagó la clienta">
                        Toca uno de los cinco. Acá se registra, no se cobra: Yape, Plin y tarjeta se cobran en su
                        propio aparato y esto es la anotación de que entró por ahí. Sirve para el cuadre del cierre,
                        donde solo se cuenta el efectivo.
                      </Ayuda>
                    )}
                    Cómo pagó la clienta
                  </span>
                </legend>
                <div className="grid grid-cols-5 gap-1 rounded-xl bg-sand/50 p-1">
                  {METODOS_PAGO.map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => onMetodoPago(m)}
                      disabled={bloqueado}
                      aria-pressed={metodoPago === m}
                      className={`flex h-12 items-center justify-center rounded-lg px-1 text-center text-[10px] leading-tight capitalize transition-colors ${
                        metodoPago === m ? "bg-papel text-tinta shadow-sm" : "text-tinta/60 hover:bg-papel/60"
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </fieldset>

              {/* 2 · Comprobante, con el documento de la clienta ADENTRO: el DNI o el RUC
                  solo tienen sentido para la boleta o la factura que se va a emitir. */}
              <div className="border-t border-sand pt-4">
                <fieldset className="space-y-2">
                  <legend className="text-[11px] text-tinta/50">
                    <span className="flex items-center gap-1">
                      {facturaSinRuc && (
                        <Ayuda tono="falta" titulo="Escribe el RUC de la empresa">
                          La factura sale a nombre de una empresa y SUNAT exige su RUC. Si la clienta no lo tiene a
                          mano, cambia a boleta: admite DNI opcional o ningún documento.
                        </Ayuda>
                      )}
                      Comprobante
                    </span>
                  </legend>
                  <div className="grid grid-cols-2 gap-1 rounded-lg bg-sand/50 p-1">
                    {(["boleta", "factura"] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => onTipoComprobante(t)}
                        disabled={bloqueado}
                        aria-pressed={tipoComprobante === t}
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
                </fieldset>
              </div>
            </div>
          ) : !carrito.length ? (
            <div className="flex h-full min-h-48 flex-col items-center justify-center px-8 text-center">
              <p className="font-medium text-tinta">El ticket está vacío</p>
              <p className="mt-1 max-w-64 text-sm text-tinta/60">Escanea una etiqueta o elige una prenda del catálogo.</p>
            </div>
          ) : (
            <div className="divide-y divide-sand">
              {carrito.map((it) => (
                // `anim-entrada`: la línea responde al escaneo que la creó (regla del
                // sistema de movimiento: nada se anima solo al entrar a la pantalla).
                <article key={it.claveLinea} className="anim-entrada px-5 py-4">
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
                        {/* En «1» el menos ya no tiene a dónde bajar: pasa a ser el
                            basurero de la línea, que es lo único que queda por hacer. */}
                        {it.cantidad <= 1 ? (
                          <button
                            type="button"
                            aria-label={`Quitar ${it.referencia}`}
                            onClick={() => onQuitar(it.claveLinea)}
                            className="flex h-8 w-8 items-center justify-center rounded-md text-rojo-profundo transition-colors hover:bg-rojo/8 hover:text-rojo"
                          >
                            <IconoBasurero />
                          </button>
                        ) : (
                          <button
                            type="button"
                            aria-label="Reducir cantidad"
                            onClick={() => onActualizar(it.claveLinea, "cantidad", it.cantidad - 1)}
                            className="h-8 w-8 rounded-md text-base hover:bg-sand/40"
                          >
                            −
                          </button>
                        )}
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
                    {/* El precio lo fija el catálogo, no la caja: ya no se edita acá. Lo que
                        se puede decidir en el mostrador es un descuento, y va aparte. */}
                    <div className="text-[10px] text-tinta/50 uppercase">
                      Precio unitario
                      <p className="mt-1 flex h-9 items-center text-sm font-semibold text-tinta normal-case">
                        <span className="mr-1 text-xs font-normal text-tinta/60">S/</span>
                        {it.precioUnitario.toFixed(2)}
                      </p>
                    </div>
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
              <p className="text-xs text-tinta/60">{etiquetaPrendas}</p>
              <p className="text-xs text-tinta/60">Incluye IGV ({(TASA_IGV * 100).toFixed(0)}%)</p>
            </div>
            <div className="text-right">
              <p className="label-cayla text-[11px] text-tinta/60">Total</p>
              {/* `key={total}`: al cambiar el monto el número se vuelve a montar y se
                  asienta (responde a la prenda que entró, no se anima solo). */}
              <p key={total} className="anim-asentar font-display text-5xl leading-none text-tinta">
                {money(total)}
              </p>
            </div>
          </div>

          {error && <p className="mb-2 text-sm text-rojo">{error}</p>}

          {/* El botón apagado dice por qué: el mismo motivo que lo apaga, debajo de él. */}
          {motivoBloqueo !== null && (
            <p id={ID_MOTIVO} className="mb-2 text-center text-[11px] text-tinta/60">
              {motivoBloqueo}
            </p>
          )}

          {cobrando ? (
            <button
              type="submit"
              disabled={apagado || loading}
              aria-describedby={motivoBloqueo !== null ? ID_MOTIVO : undefined}
              className={BOTON_PRINCIPAL}
            >
              <span className="label-cayla text-[11px]">{loading ? "Procesando…" : "Confirmar cobro"}</span>
              <strong className="font-display text-lg">{money(total)}</strong>
            </button>
          ) : (
            <button
              type="button"
              onClick={onIrACobrar}
              disabled={apagado}
              aria-describedby={motivoBloqueo !== null ? ID_MOTIVO : undefined}
              className={BOTON_PRINCIPAL}
            >
              <span className="label-cayla text-[11px]">Cobrar</span>
              <strong className="font-display text-lg">{money(total)}</strong>
            </button>
          )}
        </div>
      </form>
    </aside>
  );
}
