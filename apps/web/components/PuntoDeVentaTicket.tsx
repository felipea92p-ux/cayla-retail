"use client";

import type { RefObject } from "react";
import { METODOS_PAGO, type MetodoPago } from "@cayla-retail/shared";
import { ETIQUETA_TIPO, type TipoComprobante } from "@/lib/comprobantes-reglas";
import { descuentoUnitarioPorPorcentaje, porcentajeDeLinea, type MomentoTicket } from "@/lib/vender-reglas";
import { Ayuda } from "@/components/Ayuda";
import { ConsultaDocumento } from "@/components/ConsultaDocumento";
import { ID_CARGO_ESPECIAL, money, type DescuentoForm, type ItemCarrito } from "@/components/PuntoDeVenta";

/** 18% — IGV de Perú. Solo para el desglose que se ve en pantalla: el que de
 *  verdad cuenta lo calcula `registrar_venta` en el servidor. */
const TASA_IGV = 0.18;

/** Atajos de % del apartado de descuento — los que se dan de palabra en el mostrador. */
const ATAJOS_DESCUENTO = [5, 10, 15, 20, 25, 50] as const;

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

/** Basurero en trazo — mismo lenguaje que los íconos a mano de AppShell. */
function IconoBasurero() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
    </svg>
  );
}

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
  const descontando = momento === "descuento";
  const etiquetaPrendas = `${prendas} ${prendas === 1 ? "prenda" : "prendas"}`;
  const apagado = bloqueado || motivoBloqueo !== null;

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
          <h2 className="font-display text-2xl leading-none text-tinta">Ticket actual</h2>
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
              <h2 className="font-display text-2xl leading-none text-tinta">{cobrando ? "Cobro" : "Descuento"}</h2>
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
                <legend className="text-[11px] text-tinta/50">Porcentaje</legend>
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

              {/* 2 · A qué: todo el ticket, o solo las prendas que se marquen. */}
              <fieldset className="space-y-2 border-t border-sand pt-4">
                <legend className="text-[11px] text-tinta/50">Aplicar a</legend>
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
                      className={`${OPCION} flex h-12 items-center justify-center px-1 text-center text-[10px] leading-tight capitalize ${
                        metodoPago === m ? OPCION_ACTIVA : OPCION_INACTIVA
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
                        className={`${OPCION} label-cayla h-8 rounded-md text-[11px] ${tipoComprobante === t ? OPCION_ACTIVA : OPCION_INACTIVA}`}
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
                          className={`label-cayla h-8 rounded-md px-2 text-[11px] transition-colors hover:bg-sand/40 ${
                            pctLinea > 0 ? "text-rojo-profundo" : "text-tinta/70 hover:text-tinta"
                          }`}
                        >
                          {pctLinea > 0 ? `−${pctLinea} %` : "% Desc."}
                        </button>
                        <button
                          type="button"
                          aria-label={`Quitar ${it.referencia}`}
                          onClick={() => onQuitar(it.claveLinea)}
                          className="label-cayla h-8 rounded-md px-2 text-[11px] text-rojo-profundo hover:bg-sand/40"
                        >
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
                              <IconoBasurero />
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
                  % Aplicar descuento
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

          {error && <p className="mb-2 text-sm text-rojo">{error}</p>}

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
                <span className="label-cayla text-[11px]">Aplicar descuento</span>
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
