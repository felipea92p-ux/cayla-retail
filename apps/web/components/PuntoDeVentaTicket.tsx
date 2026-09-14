"use client";

import type { RefObject } from "react";
import { BadgePercent, Banknote, Check, CreditCard, FileText, KeyRound, Landmark, Percent, Receipt, ShoppingBag, Trash2, Wallet } from "lucide-react";
import { METODOS_PAGO, type MetodoPago } from "@cayla-retail/shared";
import { ETIQUETA_TIPO, type TipoComprobante } from "@/lib/comprobantes-reglas";
import { descuentoUnitarioPorPorcentaje, porcentajeDeLinea, type MomentoTicket } from "@/lib/vender-reglas";
import { Ayuda } from "@/components/Ayuda";
import { ConsultaDocumento } from "@/components/ConsultaDocumento";
import { ID_CARGO_ESPECIAL, money, type DescuentoForm, type ItemCarrito, type PagoAplicado } from "@/components/PuntoDeVenta";

/** 18% — IGV de Perú. Solo para el desglose que se ve en pantalla: el que de
 *  verdad cuenta lo calcula `registrar_venta` en el servidor. */
const TASA_IGV = 0.18;

/** Atajos de % del apartado de descuento — los que se dan de palabra en el mostrador. */
const ATAJOS_DESCUENTO = [5, 10, 15, 20, 25, 50] as const;

/** Billetes de sol que se reciben en el mostrador — las teclas de «Recibido» los suman. */
const BILLETES = [10, 20, 50, 100, 200] as const;

/** El botón principal es el mismo en los tres momentos; cambian su texto y lo que hace.
 *  Apagado no reacciona al hover: queda justo bajo el cursor al entrar a «cobrar», y un
 *  rojo a medias ahí se leía como "casi se puede". */
const BOTON_PRINCIPAL =
  "alza-cayla flex h-14 w-full items-center justify-between rounded-md bg-tinta px-5 text-crema transition-colors hover:bg-rojo disabled:opacity-50 disabled:hover:bg-tinta";

/** Botones de opción dentro de una pista `bg-sand/50` (métodos, boleta/factura, atajos). */
const OPCION = "rounded-lg transition-colors";
const OPCION_ACTIVA = "bg-papel text-tinta shadow-sm";
const OPCION_INACTIVA = "text-tinta/60 hover:bg-papel/60";

/** Hay un solo ticket por pantalla, así que un id fijo alcanza para que el botón
 *  apagado apunte a su motivo (`aria-describedby`) sin hooks en este componente. */
const ID_MOTIVO = "ticket-motivo-bloqueo";

/** El campo numérico sin las flechitas del navegador: «−» y «+» ya son eso. */
const SIN_FLECHAS = "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

/** Íconos de cada apartado y método (pedido de Felipe, 2026-09-14): `lucide` para lo
 *  genérico y, para Yape y Plin, sus marcas dibujadas a mano en MONOCROMO — heredan
 *  `currentColor` (tinta / tinta-60 según el estado del botón), nunca el morado ni el
 *  azul de las marcas: el sistema tiene tres colores y el rojo es acento, no logo. */
const ICONO = "h-5 w-5 shrink-0";
const ICONO_CHICO = "h-3.5 w-3.5 shrink-0";

/** Yape: la burbuja rellena con «S/» adentro, como su isotipo. */
function IconoYape({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M12 2.5a8.5 8.5 0 0 0-6.3 14.2l-.6 4.1a.6.6 0 0 0 .9.6l3.5-2.1A8.5 8.5 0 1 0 12 2.5Z" />
      <text x="12" y="14.4" textAnchor="middle" fontSize="8" fontWeight="700" fontFamily="ui-sans-serif, system-ui, sans-serif" className="fill-papel">
        S/
      </text>
    </svg>
  );
}

/** Plin: la burbuja en trazo con la palabra adentro, como su isotipo. */
function IconoPlin({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinejoin="round">
      <path d="M12 3a8.8 8.8 0 0 1 0 17.6c-1.4 0-2.7-.3-3.9-.9L4 21l.8-3.6A8.8 8.8 0 0 1 12 3Z" />
      <text x="12" y="14.3" textAnchor="middle" fontSize="6.5" fontWeight="700" fontFamily="ui-sans-serif, system-ui, sans-serif" fill="currentColor" stroke="none">
        plin
      </text>
    </svg>
  );
}

const ICONO_METODO: Record<MetodoPago, React.ReactNode> = {
  efectivo: <Banknote className={ICONO} aria-hidden />,
  tarjeta: <CreditCard className={ICONO} aria-hidden />,
  yape: <IconoYape className={ICONO} />,
  plin: <IconoPlin className={ICONO} />,
  transferencia: <Landmark className={ICONO} aria-hidden />,
};

/** Marca de «elegida» en la lista del apartado de descuento. */
function IconoCheck() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12.5l4.5 4.5L19 7" />
    </svg>
  );
}

type Props = {
  bloqueado: boolean;
  // Ticket
  carrito: ItemCarrito[];
  /** Ref de la lista de líneas: el padre le captura la posición para el reflujo `Flip`. */
  listaRef: RefObject<HTMLDivElement | null>;
  onQuitar: (claveLinea: string) => void;
  onCantidad: (claveLinea: string, valor: number) => void;
  // Descuento — un solo apartado (momento «descuento»), dos entradas
  descuento: DescuentoForm;
  onDescuento: (cambio: Partial<DescuentoForm>) => void;
  /** Abre el apartado para esas líneas; `null` = todo el ticket. */
  onAbrirDescuento: (claves: string[] | null) => void;
  onAplicarDescuento: () => void;
  onQuitarDescuento: () => void;
  /** Un Líder no ve el campo «Código»; una Colaboradora lo necesita para descontar. */
  esLider: boolean;
  codigoDescuento: string;
  onCodigoDescuento: (v: string) => void;
  // Nota del ticket — una línea, hasta 200; vive con las líneas (momento «armar»)
  nota: string;
  onNota: (v: string) => void;
  // Totales — ya calculados en el padre
  total: number;
  prendas: number;
  // Los momentos del ticket: «armar» (líneas + total), «descuento» y «cobrar» (pago + comprobante)
  momento: MomentoTicket;
  onIrACobrar: () => void;
  onVolverATicket: () => void;
  /** Derivado en el padre, una sola vez: por qué el botón principal está apagado
   *  (o null). Apaga el botón y se muestra debajo de él, tal cual. */
  motivoBloqueo: string | null;
  // Pago mixto — una fila por medio; `restante` y `vuelto` ya derivados en el padre
  pagos: PagoAplicado[];
  restante: number;
  vuelto: number;
  onAgregarPago: (metodo: MetodoPago) => void;
  onMontoPago: (indice: number, monto: number) => void;
  onQuitarPago: (indice: number) => void;
  /** Lo entregado en efectivo (null = borrar). Solo de pantalla, para el vuelto. */
  onRecibido: (monto: number | null) => void;
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
  loading: boolean;
  onCobrar: (e: React.FormEvent) => void;
};

/**
 * Panel derecho de Vender, en momentos (decidido con Felipe el 2026-09-14, ADR-0044):
 * «armar» muestra solo las líneas del ticket y el total; «descuento» es el apartado
 * para decidir un % (a todo el ticket o solo a las prendas elegidas) y vuelve a
 * «armar»; «cobrar» —recién al tocar Cobrar— muestra cuánto y cómo pagó la clienta y,
 * debajo, el comprobante con el documento adentro. Escanear en cualquier momento sigue
 * agregando al ticket: el conteo de la cabecera y el total se actualizan en vivo.
 *
 * Sin estado propio ni hooks — todo llega por props desde `PuntoDeVenta`, que sigue
 * siendo el único dueño del carrito y de `cobrar()`. Es la costura para trabajar el
 * ticket sin tocar el catálogo (y viceversa).
 */
export function PuntoDeVentaTicket({
  bloqueado,
  carrito,
  listaRef,
  onQuitar,
  onCantidad,
  descuento,
  onDescuento,
  onAbrirDescuento,
  onAplicarDescuento,
  onQuitarDescuento,
  esLider,
  codigoDescuento,
  onCodigoDescuento,
  nota,
  onNota,
  total,
  prendas,
  momento,
  onIrACobrar,
  onVolverATicket,
  motivoBloqueo,
  pagos,
  restante,
  vuelto,
  onAgregarPago,
  onMontoPago,
  onQuitarPago,
  onRecibido,
  tipoComprobante,
  onTipoComprobante,
  clienteNumDoc,
  onClienteNumDoc,
  clienteNombre,
  onClienteNombre,
  facturaSinRuc,
  loading,
  onCobrar,
}: Props) {
  const cobrando = momento === "cobrar";
  const descontando = momento === "descuento";
  const etiquetaPrendas = `${prendas} ${prendas === 1 ? "prenda" : "prendas"}`;
  const apagado = bloqueado || motivoBloqueo !== null;

  // Qué falta del pago, para el (!) de la leyenda: nada elegido, no cubre, o se pasa.
  const faltaPago = !cobrando
    ? null
    : pagos.length === 0
      ? "Elige cómo pagó la clienta"
      : restante > 0
        ? `Falta cubrir ${money(restante)}`
        : restante < 0
          ? "Los pagos superan el total"
          : null;

  // Lo que ya se descontó (suma de todas las líneas), para la fila sobre el total.
  const totalDescuento = carrito.reduce((acc, it) => acc + it.cantidad * it.descuentoUnitario, 0);

  // ---- Apartado de descuento: todo derivado de props, sin estado propio ----------
  const pct = Number(descuento.pct);
  const pctValido = Number.isFinite(pct) && pct > 0 && pct <= 100;
  const elegidas = descuento.elegidas;
  const todoElTicket = elegidas === null;
  const alcanza = (claveLinea: string) => elegidas === null || elegidas.includes(claveLinea);
  const elegidasCuenta = elegidas === null ? carrito.length : elegidas.length;
  // Adelanto del total con el % puesto: lo que va a quedar si se aplica ahora.
  const totalConDescuento = carrito.reduce((acc, it) => {
    const descuentoUnitario = alcanza(it.claveLinea) ? descuentoUnitarioPorPorcentaje(it.precioUnitario, pct) : it.descuentoUnitario;
    return acc + it.cantidad * (it.precioUnitario - descuentoUnitario);
  }, 0);
  const hayDescuentoEnAlcance = carrito.some((it) => alcanza(it.claveLinea) && it.descuentoUnitario > 0);
  const motivoDescuento = !pctValido ? "Elige un porcentaje entre 1 y 100." : elegidasCuenta === 0 ? "Elige al menos una prenda." : null;
  function alternarPrenda(claveLinea: string) {
    // Desde «todo el ticket», desmarcar una prenda deja marcadas todas las demás.
    if (elegidas === null) return onDescuento({ elegidas: carrito.filter((it) => it.claveLinea !== claveLinea).map((it) => it.claveLinea) });
    onDescuento({ elegidas: elegidas.includes(claveLinea) ? elegidas.filter((k) => k !== claveLinea) : [...elegidas, claveLinea] });
  }

  return (
    // En escritorio el aside llena toda la fila del POS (la raíz fija la altura al
    // viewport): cabecera y pie quedan fijos y solo el medio scrollea.
    <aside className="flex min-h-[45vh] flex-col bg-papel lg:min-h-0">
      {/* Un solo título grande por momento: la sede ya está en la barra de arriba
          («Venta en tienda · sede»), repetirla acá no decía nada. Fuera de «armar», la
          cabecera ofrece la vuelta al ticket y el conteo vivo. */}
      <div className="flex min-h-[4.5rem] items-center justify-between border-b border-sand px-5 py-3">
        {momento === "armar" ? (
          <h2 className="flex items-center gap-2.5 font-display text-2xl leading-none text-tinta">
            <ShoppingBag className="h-6 w-6 text-tinta/70" aria-hidden />
            Ticket actual
          </h2>
        ) : (
          <>
            <button
              type="button"
              onClick={onVolverATicket}
              disabled={bloqueado}
              className="label-cayla -ml-2 h-8 rounded-md px-2 text-[11px] text-tinta/70 transition-colors hover:bg-sand/40 hover:text-tinta"
            >
              ← Ticket
            </button>
            <div key={momento} className="anim-revelar text-right">
              <h2 className="flex items-center justify-end gap-2.5 font-display text-2xl leading-none text-tinta">
                {cobrando ? <Wallet className="h-6 w-6 text-tinta/70" aria-hidden /> : <BadgePercent className="h-6 w-6 text-tinta/70" aria-hidden />}
                {cobrando ? "Cobro" : "Descuento"}
              </h2>
              <p className="mt-1 text-xs text-tinta/60">
                {cobrando ? etiquetaPrendas : todoElTicket ? "Todo el ticket" : `${elegidasCuenta} de ${carrito.length} prendas`}
              </p>
            </div>
          </>
        )}
      </div>

      <form onSubmit={onCobrar} className="flex min-h-0 flex-1 flex-col">
        <div className="scroll-cayla min-h-40 flex-1 overflow-y-auto">
          {descontando ? (
            <div className="anim-revelar space-y-5 px-5 py-4">
              {/* 1 · Cuánto: atajos de palabra o un número a mano. */}
              <fieldset className="space-y-2">
                <legend className="text-[11px] text-tinta/50">
                  <span className="flex items-center gap-1.5">
                    <Percent className={ICONO_CHICO} aria-hidden />
                    Porcentaje
                  </span>
                </legend>
                <div className="grid grid-cols-6 gap-1 rounded-xl bg-sand/50 p-1">
                  {ATAJOS_DESCUENTO.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => onDescuento({ pct: String(p) })}
                      disabled={bloqueado}
                      aria-pressed={descuento.pct === String(p)}
                      className={`${OPCION} h-11 text-sm font-semibold ${descuento.pct === String(p) ? OPCION_ACTIVA : OPCION_INACTIVA}`}
                    >
                      {p}%
                    </button>
                  ))}
                </div>
                <label className="flex h-11 items-center gap-2 rounded-lg border border-sand bg-crema px-3 focus-within:border-rojo focus-within:ring-2 focus-within:ring-rojo/20">
                  <span className="text-[11px] text-tinta/50">Otro</span>
                  <input
                    aria-label="Porcentaje de descuento"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={100}
                    value={descuento.pct}
                    onChange={(e) => onDescuento({ pct: e.target.value })}
                    placeholder="0"
                    disabled={bloqueado}
                    className={`min-w-0 flex-1 bg-transparent text-right text-lg font-semibold text-tinta outline-none placeholder:text-tinta/30 ${SIN_FLECHAS}`}
                  />
                  <span className="text-sm text-tinta/60">%</span>
                </label>
              </fieldset>

              {/* Código: solo para quien no es Líder. La base (registrar_venta) es la que
                  exige que exista, esté vigente y que el % no pase su tope — acá solo se
                  escribe; el error, si lo hay, llega por avisar.error al confirmar el cobro. */}
              {!esLider && (
                <fieldset className="space-y-2 border-t border-sand pt-4">
                  <legend className="text-[11px] text-tinta/50">
                    <span className="flex items-center gap-1.5">
                      <KeyRound className={ICONO_CHICO} aria-hidden />
                      Código de descuento
                    </span>
                  </legend>
                  <label className="flex h-11 items-center gap-2 rounded-lg border border-sand bg-crema px-3 focus-within:border-rojo focus-within:ring-2 focus-within:ring-rojo/20">
                    <input
                      aria-label="Código de descuento"
                      type="text"
                      autoComplete="off"
                      autoCapitalize="characters"
                      spellCheck={false}
                      value={codigoDescuento}
                      onChange={(e) => onCodigoDescuento(e.target.value.toUpperCase())}
                      placeholder="Pídeselo a un Líder"
                      disabled={bloqueado}
                      className="min-w-0 flex-1 bg-transparent font-mono text-sm font-semibold tracking-wider text-tinta outline-none placeholder:font-sans placeholder:font-normal placeholder:tracking-normal placeholder:text-tinta/40"
                    />
                  </label>
                </fieldset>
              )}

              {/* 2 · A qué: todo el ticket, o solo las prendas que se marquen. */}
              <fieldset className="space-y-2 border-t border-sand pt-4">
                <legend className="text-[11px] text-tinta/50">
                  <span className="flex items-center gap-1.5">
                    <ShoppingBag className={ICONO_CHICO} aria-hidden />
                    Aplicar a
                  </span>
                </legend>
                <button
                  type="button"
                  onClick={() => onDescuento({ elegidas: null })}
                  disabled={bloqueado}
                  aria-pressed={todoElTicket}
                  className={`flex h-10 w-full items-center gap-2 rounded-lg border px-3 text-sm transition-colors ${
                    todoElTicket ? "border-tinta bg-tinta text-crema" : "border-sand bg-crema text-tinta hover:bg-sand/40"
                  }`}
                >
                  <span className={`flex h-5 w-5 items-center justify-center rounded-full border ${todoElTicket ? "border-crema/60" : "border-tinta/30"}`}>
                    {todoElTicket && <IconoCheck />}
                  </span>
                  Todo el ticket
                </button>
                <div className="divide-y divide-sand rounded-lg border border-sand bg-crema">
                  {carrito.map((it) => {
                    const marcada = alcanza(it.claveLinea);
                    return (
                      <button
                        key={it.claveLinea}
                        type="button"
                        onClick={() => alternarPrenda(it.claveLinea)}
                        disabled={bloqueado}
                        aria-pressed={marcada}
                        className="flex h-11 w-full items-center gap-3 px-3 text-left text-sm transition-colors hover:bg-sand/40"
                      >
                        <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors ${marcada ? "border-tinta bg-tinta text-crema" : "border-tinta/30"}`}>
                          {marcada && <IconoCheck />}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-tinta">{it.referencia}</span>
                        <span className="shrink-0 text-xs text-tinta/60">
                          {it.cantidad > 1 ? `${it.cantidad} × ` : ""}
                          {money(it.precioUnitario)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              {/* Lo que va a quedar si se aplica ahora — la colaboradora lo ve antes de tocar. */}
              {pctValido && elegidasCuenta > 0 && (
                <p key={totalConDescuento} className="anim-asentar flex items-baseline justify-between border-t border-sand pt-4 text-sm text-tinta/70">
                  <span>Quedaría en</span>
                  <span className="font-display text-2xl text-tinta">{money(totalConDescuento)}</span>
                </p>
              )}
            </div>
          ) : cobrando ? (
            <div className="anim-revelar space-y-5 px-5 py-4">
              {/* 1 · Cuánto y cómo pagó — antes que el comprobante: el cobro existe
                  aunque la clienta no pida nada. Tocar un medio agrega su fila con lo que
                  falta; combinar («Yape + efectivo», la venta más común de la tienda) es bajar
                  un monto y tocar otro. El (!) solo aparece mientras no esté cubierto. */}
              <fieldset className="space-y-2">
                <legend className="text-[11px] text-tinta/50">
                  <span className="flex items-center gap-1">
                    {faltaPago !== null && (
                      <Ayuda tono="falta" titulo={faltaPago}>
                        {pagos.length === 0
                          ? "Toca uno de los cinco. Acá se registra, no se cobra: Yape, Plin y tarjeta se cobran en su propio aparato y esto es la anotación de que entró por ahí. Sirve para el cuadre del cierre, donde solo se cuenta el efectivo."
                          : restante > 0
                            ? "Los medios puestos no llegan al total. Sube un monto o toca otro medio para el resto."
                            : "La suma de los medios pasa el total y la venta no cuadraría. Baja un monto o quita un medio."}
                      </Ayuda>
                    )}
                    <Wallet className={ICONO_CHICO} aria-hidden />
                    Cómo pagó la clienta
                  </span>
                </legend>
                <div className="grid grid-cols-5 gap-1 rounded-xl bg-sand/50 p-1">
                  {METODOS_PAGO.map((m) => {
                    const puesto = pagos.some((p) => p.metodo === m);
                    return (
                      <button
                        key={m}
                        type="button"
                        onClick={() => onAgregarPago(m)}
                        disabled={bloqueado || puesto}
                        aria-pressed={puesto}
                        className={`${OPCION} flex h-14 flex-col items-center justify-center gap-1 px-1 text-center text-[10px] leading-tight capitalize ${
                          puesto ? OPCION_ACTIVA : OPCION_INACTIVA
                        }`}
                      >
                        {ICONO_METODO[m]}
                        {m}
                      </button>
                    );
                  })}
                </div>

                {pagos.length > 0 && (
                  <div className="anim-revelar divide-y divide-sand rounded-lg border border-sand bg-crema">
                    {pagos.map((p, i) => (
                      <div key={p.metodo} className="space-y-2 px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <span className="text-tinta/70">{ICONO_METODO[p.metodo]}</span>
                          <span className="min-w-0 flex-1 truncate text-sm capitalize text-tinta">{p.metodo}</span>
                          <label className="flex h-9 items-center gap-1 rounded-md border border-sand bg-papel px-2 focus-within:border-rojo focus-within:ring-2 focus-within:ring-rojo/20">
                            <span className="text-xs text-tinta/60">S/</span>
                            <input
                              aria-label={`Monto en ${p.metodo}`}
                              type="number"
                              inputMode="decimal"
                              min={0}
                              step="0.01"
                              value={p.monto}
                              onChange={(e) => onMontoPago(i, Number(e.target.value))}
                              disabled={bloqueado}
                              className={`w-20 bg-transparent text-right text-sm font-semibold text-tinta outline-none ${SIN_FLECHAS}`}
                            />
                          </label>
                          <button
                            type="button"
                            aria-label={`Quitar pago en ${p.metodo}`}
                            onClick={() => onQuitarPago(i)}
                            disabled={bloqueado}
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-rojo-profundo transition-colors hover:bg-rojo/8 hover:text-rojo"
                          >
                            <Trash2 className="h-4 w-4" aria-hidden />
                          </button>
                        </div>

                        {/* Solo el efectivo da vuelto: lo entregado se anota para calcularlo y
                            mostrarlo grande — nunca viaja a la venta. Las teclas SUMAN billetes
                            (S/100 + S/50 = 150); «Exacto» pone lo justo; el campo corrige. */}
                        {p.metodo === "efectivo" && (
                          <div className="space-y-2 rounded-md bg-sand/40 p-2">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[11px] text-tinta/50">Recibido</span>
                              <span className="flex items-center gap-1">
                                <label className="flex h-8 items-center gap-1 rounded-md border border-sand bg-papel px-2 focus-within:border-rojo focus-within:ring-2 focus-within:ring-rojo/20">
                                  <span className="text-xs text-tinta/60">S/</span>
                                  <input
                                    aria-label="Efectivo recibido"
                                    type="number"
                                    inputMode="decimal"
                                    min={0}
                                    step="0.01"
                                    value={p.recibido ?? ""}
                                    onChange={(e) => onRecibido(e.target.value === "" ? null : Number(e.target.value))}
                                    placeholder="0.00"
                                    disabled={bloqueado}
                                    className={`w-20 bg-transparent text-right text-sm font-semibold text-tinta outline-none placeholder:text-tinta/30 ${SIN_FLECHAS}`}
                                  />
                                </label>
                                {p.recibido !== undefined && (
                                  <button
                                    type="button"
                                    aria-label="Borrar lo recibido"
                                    onClick={() => onRecibido(null)}
                                    disabled={bloqueado}
                                    className="flex h-8 w-8 items-center justify-center rounded-md text-tinta/50 transition-colors hover:bg-sand/60 hover:text-tinta"
                                  >
                                    ×
                                  </button>
                                )}
                              </span>
                            </div>
                            <div className="grid grid-cols-6 gap-1">
                              {BILLETES.map((b) => (
                                <button
                                  key={b}
                                  type="button"
                                  onClick={() => onRecibido((p.recibido ?? 0) + b)}
                                  disabled={bloqueado}
                                  className="h-8 rounded-md border border-sand bg-papel text-xs font-semibold text-tinta transition-colors hover:bg-sand/40"
                                >
                                  +{b}
                                </button>
                              ))}
                              <button
                                type="button"
                                onClick={() => onRecibido(p.monto)}
                                disabled={bloqueado}
                                className="label-cayla h-8 rounded-md border border-tinta/25 bg-papel text-[10px] text-tinta transition-colors hover:bg-sand/40"
                              >
                                Exacto
                              </button>
                            </div>
                            {vuelto > 0 && (
                              <p key={vuelto} className="anim-asentar flex items-baseline justify-between pt-1">
                                <span className="label-cayla text-[11px] text-tinta/60">Vuelto</span>
                                <span className="font-display text-3xl leading-none text-tinta">{money(vuelto)}</span>
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {pagos.length > 0 && (
                  <p
                    key={restante}
                    className={`anim-asentar flex items-baseline justify-between text-xs ${
                      restante === 0 ? "text-verde-profundo" : restante > 0 ? "text-tinta/70" : "text-rojo-profundo"
                    }`}
                  >
                    <span>{restante === 0 ? "Cubierto" : restante > 0 ? "Falta cubrir" : "Se pasa por"}</span>
                    <span className="font-semibold">{restante === 0 ? "✓" : money(Math.abs(restante))}</span>
                  </p>
                )}
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
                      <Receipt className={ICONO_CHICO} aria-hidden />
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
                        className={`${OPCION} label-cayla flex h-9 items-center justify-center gap-1.5 rounded-md text-[11px] ${
                          tipoComprobante === t ? OPCION_ACTIVA : OPCION_INACTIVA
                        }`}
                      >
                        {t === "boleta" ? <Receipt className={ICONO_CHICO} aria-hidden /> : <FileText className={ICONO_CHICO} aria-hidden />}
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
            // La entrada y el reflujo de cada línea los anima el padre con `Flip`
            // (responde al escaneo que la creó); acá solo va el ref de la lista.
            <div ref={listaRef} className="divide-y divide-sand">
              {carrito.map((it) => {
                const pctLinea = porcentajeDeLinea(it);
                const precioNeto = it.precioUnitario - it.descuentoUnitario;
                return (
                  <article key={it.claveLinea} className="px-5 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate text-sm font-semibold text-tinta">{it.referencia}</h3>
                        <p className="font-mono text-xs text-tinta/60">{it.sku}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={() => onAbrirDescuento([it.claveLinea])}
                          disabled={bloqueado}
                          aria-label={`Descuento para ${it.referencia}`}
                          className={`label-cayla flex h-8 items-center gap-1 rounded-md px-2 text-[11px] transition-colors hover:bg-sand/40 ${
                            pctLinea > 0 ? "text-rojo-profundo" : "text-tinta/70 hover:text-tinta"
                          }`}
                        >
                          <Percent className={ICONO_CHICO} aria-hidden />
                          {pctLinea > 0 ? `−${pctLinea} %` : "Desc."}
                        </button>
                        <button
                          type="button"
                          aria-label={`Quitar ${it.referencia}`}
                          onClick={() => onQuitar(it.claveLinea)}
                          className="label-cayla flex h-8 items-center gap-1 rounded-md px-2 text-[11px] text-rojo-profundo hover:bg-sand/40"
                        >
                          <Trash2 className={ICONO_CHICO} aria-hidden />
                          Quitar
                        </button>
                      </div>
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
                              <Trash2 className="h-4 w-4" aria-hidden />
                            </button>
                          ) : (
                            <button
                              type="button"
                              aria-label="Reducir cantidad"
                              onClick={() => onCantidad(it.claveLinea, it.cantidad - 1)}
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
                            onChange={(e) => onCantidad(it.claveLinea, Number(e.target.value))}
                            className={`w-8 bg-transparent text-center text-sm font-semibold text-tinta outline-none ${SIN_FLECHAS}`}
                          />
                          <button
                            type="button"
                            aria-label="Aumentar cantidad"
                            onClick={() => onCantidad(it.claveLinea, it.cantidad + 1)}
                            disabled={it.cantidad >= it.stockAqui}
                            className="h-8 w-8 rounded-md text-base hover:bg-sand/40 disabled:opacity-40"
                          >
                            +
                          </button>
                        </div>
                      </label>
                      {/* El precio lo fija el catálogo, no la caja: ya no se edita acá. Con
                          descuento se ve el de lista tachado y el que se cobra. */}
                      <div className="text-[10px] text-tinta/50 uppercase">
                        Precio unitario
                        <p className="mt-1 flex h-9 items-center gap-1.5 text-sm font-semibold text-tinta normal-case">
                          {pctLinea > 0 && <s className="text-xs font-normal text-tinta/45">{money(it.precioUnitario)}</s>}
                          <span>{money(precioNeto)}</span>
                        </p>
                      </div>
                      <div className="pb-2 text-right">
                        <p className="text-[10px] text-tinta/50 uppercase">Importe</p>
                        <p className="text-sm font-bold text-tinta">{money(it.cantidad * precioNeto)}</p>
                      </div>
                    </div>
                    <p className="mt-2 text-[11px] text-tinta/50">
                      {it.varianteId === ID_CARGO_ESPECIAL ? "Cargo sin control de stock." : `Máximo disponible en sede: ${it.stockAqui}`}
                    </p>
                  </article>
                );
              })}
            </div>
          )}
        </div>

        <div className="border-t border-sand bg-papel px-5 pt-4 pb-5">
          {/* Fila «Descuento», solo mientras se arma la venta: el descuento cambia cuánto
              se cobra, así que se decide antes de cobrar (decisión 3-A). */}
          {momento === "armar" && (
            <div className="mb-3 flex items-center justify-between text-xs">
              {totalDescuento > 0 ? (
                <>
                  <span className="text-tinta/60">Descuento</span>
                  <span className="flex items-center gap-2">
                    <span key={totalDescuento} className="anim-asentar font-semibold text-rojo-profundo">−{money(totalDescuento)}</span>
                    <button
                      type="button"
                      onClick={() => onAbrirDescuento(null)}
                      disabled={bloqueado}
                      className="label-cayla h-7 rounded-md px-2 text-[11px] text-tinta/70 transition-colors hover:bg-sand/40 hover:text-tinta"
                    >
                      Cambiar
                    </button>
                  </span>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => onAbrirDescuento(null)}
                  disabled={bloqueado || carrito.length === 0}
                  className="label-cayla -ml-2 h-7 rounded-md px-2 text-[11px] text-tinta/70 transition-colors hover:bg-sand/40 hover:text-tinta disabled:opacity-40 disabled:hover:bg-transparent"
                >
                  <span className="flex items-center gap-1.5">
                    <Percent className={ICONO_CHICO} aria-hidden />
                    Aplicar descuento
                  </span>
                </button>
              )}
            </div>
          )}

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


          {/* El botón apagado dice por qué: el mismo motivo que lo apaga, debajo de él. */}
          {(descontando ? motivoDescuento : motivoBloqueo) !== null && (
            <p id={ID_MOTIVO} className="mb-2 text-center text-[11px] text-tinta/60">
              {descontando ? motivoDescuento : motivoBloqueo}
            </p>
          )}

          {descontando ? (
            <>
              <button
                type="button"
                onClick={onAplicarDescuento}
                disabled={bloqueado || motivoDescuento !== null}
                aria-describedby={motivoDescuento !== null ? ID_MOTIVO : undefined}
                className={BOTON_PRINCIPAL}
              >
                <span className="label-cayla flex items-center gap-2 text-[11px]">
                  <BadgePercent className={ICONO} aria-hidden />
                  Aplicar descuento
                </span>
                <strong className="font-display text-lg">{pctValido ? `−${pct}%` : "—"}</strong>
              </button>
              {hayDescuentoEnAlcance && (
                <button
                  type="button"
                  onClick={onQuitarDescuento}
                  disabled={bloqueado}
                  className="label-cayla mt-2 h-9 w-full rounded-md text-[11px] text-rojo-profundo transition-colors hover:bg-sand/40"
                >
                  Quitar descuento
                </button>
              )}
            </>
          ) : cobrando ? (
            <button
              type="submit"
              disabled={apagado || loading}
              aria-describedby={motivoBloqueo !== null ? ID_MOTIVO : undefined}
              className={BOTON_PRINCIPAL}
            >
              <span className="label-cayla flex items-center gap-2 text-[11px]">
                <Check className={ICONO} aria-hidden />
                {loading ? "Procesando…" : "Confirmar cobro"}
              </span>
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
              <span className="label-cayla flex items-center gap-2 text-[11px]">
                <Wallet className={ICONO} aria-hidden />
                Cobrar
              </span>
              <strong className="font-display text-lg">{money(total)}</strong>
            </button>
          )}
        </div>
      </form>
    </aside>
  );
}
