"use client";

import type { ReactNode } from "react";
import { ArrowLeft, Check, FileText, Receipt, StickyNote } from "lucide-react";
import type { MetodoPagoVenta } from "@cayla-retail/shared";
import { ETIQUETA_TIPO, type TipoComprobante } from "@/lib/comprobantes-reglas";
import { montosSugeridos, type PagoAplicado } from "@/lib/vender-reglas";
import { LEY_REDONDEO, NOMBRE_METODO, TEXTO_REDONDEO } from "@/lib/recibo-reglas";
import { CampoMonto } from "@/components/ui/CampoMonto";
import { iconoMetodo } from "@/components/PuntoDeVentaTicket";
import { money } from "@/components/PuntoDeVenta";

type TipoVenta = Extract<TipoComprobante, "boleta" | "factura" | "nota_venta">;

const TIPOS: { tipo: TipoVenta; icono: ReactNode }[] = [
  { tipo: "boleta", icono: <Receipt className="h-5 w-5" aria-hidden /> },
  { tipo: "factura", icono: <FileText className="h-5 w-5" aria-hidden /> },
  { tipo: "nota_venta", icono: <StickyNote className="h-5 w-5" aria-hidden /> },
];

/** El monto de un medio como se muestra en un billete o en el monto dentro del cuadrado: sin «.00» si es entero. */
const corto = (n: number) => (Number.isInteger(n) ? `S/${n}` : money(n));

/**
 * La hoja de cobro (Felipe, 2026-10-02; maqueta `docs/maquetas/cobro-hoja-lateral-2026-10/`, patrón Shopify POS): al
 * tocar «Cobrar» el cobro sale del ticket y entra como una hoja ancha sobre el catálogo, que queda a la vista y atenuado.
 * Dos pasos y un botón, todo a la vista y sin scroll en una pantalla normal:
 *   1 · PAGO — seis cuadrados grandes, uno por medio, con su color. Tocar uno cobra todo con él; tocar un segundo ya es
 *       pago en dos medios (la lógica de siempre, `agregarPago`) y cada cuadrado muestra su monto; el que no se escribió
 *       se queda con «el resto» (`pagosTrasEditarMonto`). Con efectivo, a la derecha: «¿Con cuánto paga?» en billetes
 *       (`montosSugeridos`) y el vuelto, grande.
 *   2 · COMPROBANTE — boleta, factura o nota de venta, ninguno marcado al empezar: se elige siempre (sin elegir no se
 *       cobra, `motivoBloqueoCobro`). Elegido, aparece el documento de la clienta (`documento`).
 *   «Confirmar cobro» — el mismo del ticket, en grande. Apagado dice qué falta.
 * Las palabras van en mayúscula espaciada (`label-cayla`) y las cifras en EB Garamond: la letra del ticket.
 *
 * Sin estado propio: todo llega por props desde `PuntoDeVenta`, dueño del cobro. En escritorio el botón confirma el
 * formulario del ticket desde afuera (`form={formId}`); en el celular la hoja vive DENTRO de ese formulario, en la hoja
 * del ticket (`compacta`).
 */
export function HojaDeCobro({
  total,
  prendas,
  medios,
  pagos,
  restante,
  vuelto,
  cobroEfectivo,
  onTocarMedio,
  onMontoPago,
  onRecibido,
  tipoComprobante,
  onTipoComprobante,
  documento,
  faltaDocumento,
  motivoBloqueo,
  loading,
  bloqueado,
  formId,
  onVolver,
  compacta = false,
}: {
  total: number;
  prendas: number;
  /** Los medios que se ofrecen, en el orden de los atajos F1–F6 (sin QR si la base todavía no lo acepta). */
  medios: readonly MetodoPagoVenta[];
  pagos: PagoAplicado[];
  restante: number;
  vuelto: number;
  /** El cobro en efectivo con el redondeo de la ley (ADR-0311): la deuda exacta, lo que se cobra en monedas y lo que no se cobra
   *  (`cobroEnEfectivo`). Con el redondeo apagado, `aCobrar` es la deuda y `redondeo` 0. `null` si no hay efectivo. */
  cobroEfectivo: { deuda: number; aCobrar: number; redondeo: number } | null;
  /** Tocar un medio: si no está, lo agrega con lo que falta; si está, lo quita (su monto pasa al siguiente). */
  onTocarMedio: (metodo: MetodoPagoVenta) => void;
  onMontoPago: (indice: number, monto: number) => void;
  onRecibido: (monto: number | null) => void;
  tipoComprobante: TipoVenta | null;
  onTipoComprobante: (t: TipoVenta) => void;
  /** El documento de la clienta para el comprobante elegido (`DocumentoDelComprobante`). */
  documento: ReactNode;
  /** Qué le falta al documento para poder cobrar (la factura sin RUC, un carné mal escrito), o null. El paso no se da
   *  por hecho mientras falte. */
  faltaDocumento: string | null;
  motivoBloqueo: string | null;
  loading: boolean;
  bloqueado: boolean;
  /** El formulario del ticket, que es el que cobra (`onSubmit`). */
  formId?: string;
  onVolver: () => void;
  /** En la hoja del ticket del celular: sin cabecera propia (la hoja ya la tiene) y a una columna. */
  compacta?: boolean;
}) {
  const varios = pagos.length > 1;
  const efectivo = pagos.find((p) => p.metodo === "efectivo");
  const pagoOk = pagos.length > 0 && restante === 0 && !pagos.some((p) => varios && p.monto <= 0);
  const comprobanteOk = tipoComprobante !== null && faltaDocumento === null;
  // El que no se escribió a mano se queda con el resto: con dos medios, el otro del editado; con más, el primero libre.
  const libre = varios ? pagos.findIndex((p) => !p.fijo) : -1;
  const apagado = bloqueado || motivoBloqueo !== null || loading;
  // Lo que se entrega en monedas y billetes: con el redondeo (ADR-0311) la deuda bajada a S/ 0.10; los billetes sugeridos, el
  // «Exacto» y el vuelto salen de eso.
  const aCobrar = cobroEfectivo?.aCobrar ?? efectivo?.monto ?? 0;
  const redondeo = cobroEfectivo?.redondeo ?? 0;
  const sugeridos = efectivo ? montosSugeridos(aCobrar) : [];
  const recibido = efectivo?.recibido;
  const enSugeridos = recibido !== undefined && (recibido === aCobrar || sugeridos.includes(recibido));

  const estadoPago = !pagos.length
    ? null
    : restante > 0
      ? { ok: false, texto: `Falta ${money(restante)}` }
      : restante < 0
        ? { ok: false, texto: `Sobra ${money(-restante)}` }
        : pagos.some((p) => varios && p.monto <= 0)
          ? { ok: false, texto: "Falta un monto" }
          : { ok: true, texto: "Cubierto" };

  return (
    <div className={`@container flex min-h-0 flex-col ${compacta ? "gap-3" : "h-full gap-2"}`}>
      {!compacta && (
        <div className="flex items-center justify-between gap-3 border-b border-sand pb-3">
          <p className="flex items-baseline gap-3">
            <span className="label-cayla text-xs text-tinta/60">Total</span>
            <span key={total} className="anim-asentar font-display text-5xl leading-none tabular-nums text-tinta">
              {money(total)}
            </span>
          </p>
          <button
            type="button"
            onClick={onVolver}
            className="label-cayla flex h-11 items-center gap-2 rounded-xl border border-sand px-4 text-xs text-tinta transition-colors hover:bg-hueso"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Volver
          </button>
        </div>
      )}

      {/* 1 · Pago */}
      <section className={`hoja-cobro-paso ${pagoOk ? "es-hecho" : "sigue-aqui"}`}>
        <CabezaPaso numero={1} titulo="Pago" hecho={pagoOk} pista={pagoOk ? null : "Sigue aquí"} estado={estadoPago} />
        <div className="grid gap-4 @[520px]:grid-cols-[minmax(0,25rem)_minmax(13rem,1fr)]">
          <div className="grid grid-cols-3 gap-2.5">
            {medios.map((m, iAtajo) => {
              const indice = pagos.findIndex((p) => p.metodo === m);
              const pago = indice === -1 ? null : pagos[indice];
              return (
                <div
                  key={m}
                  role="button"
                  tabIndex={0}
                  aria-pressed={pago !== null}
                  aria-keyshortcuts={`F${iAtajo + 1}`}
                  title={`${NOMBRE_METODO[m]} (F${iAtajo + 1})`}
                  onClick={(e) => {
                    // Escribir el monto dentro del cuadrado no lo quita.
                    if ((e.target as HTMLElement).closest("label")) return;
                    if (!bloqueado) onTocarMedio(m);
                  }}
                  onKeyDown={(e) => {
                    if ((e.key === "Enter" || e.key === " ") && e.target === e.currentTarget) {
                      e.preventDefault();
                      if (!bloqueado) onTocarMedio(m);
                    }
                  }}
                  className={`metodo-${m} hoja-cobro-medio ${pago ? "es-elegido" : ""} ${varios && pago ? "con-monto" : ""}`}
                >
                  {varios && pago && indice === libre && <span className="hoja-cobro-resto">Resto</span>}
                  {pago && (
                    <span className="hoja-cobro-marca">
                      <Check className="h-3.5 w-3.5" strokeWidth={2.8} aria-hidden />
                    </span>
                  )}
                  <span className="hoja-cobro-icono">{iconoMetodo(m, "h-full w-full")}</span>
                  <span className="hoja-cobro-nombre label-cayla leading-none font-bold">{NOMBRE_METODO[m]}</span>
                  {varios && pago && (
                    <label className="hoja-cobro-monto">
                      <span className="text-[11px] opacity-60">S/</span>
                      <CampoMonto
                        aria-label={`Monto en ${NOMBRE_METODO[m]}`}
                        data-monto-medio={m}
                        valor={pago.monto}
                        onCambio={(monto) => onMontoPago(indice, monto)}
                        disabled={bloqueado}
                        className="w-16 bg-transparent text-center text-base font-bold tabular-nums text-tinta outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                      />
                    </label>
                  )}
                </div>
              );
            })}
          </div>

          {/* A la derecha, solo lo que el medio pide: con efectivo, los billetes y el vuelto; sin efectivo, una pista. */}
          <div className="min-w-0">
            {efectivo && efectivo.monto <= 0 ? (
              <p className="pt-1 text-[15px] leading-relaxed text-tinta/60">
                Escribe cuánto paga <br />en efectivo.
              </p>
            ) : efectivo ? (
              <div className="anim-revelar">
                {redondeo > 0 && aCobrar > 0 && (
                  <p className="mb-2.5 rounded-lg bg-hueso px-3 py-2 text-[13px] leading-snug text-tinta/80" data-redondeo>
                    Cobra <b className="font-semibold text-tinta tabular-nums">{money(aCobrar)}</b> en efectivo
                    <span className="block text-[12px] text-tinta/60">
                      {TEXTO_REDONDEO} −{money(redondeo)} · {LEY_REDONDEO}
                    </span>
                  </p>
                )}
                {/* Menos de la moneda más chica: no hay con qué entregarlo. Lo mismo que dice el botón apagado (`motivoBloqueoCobro`). */}
                {redondeo > 0 && aCobrar <= 0 && (
                  <p className="mb-2.5 rounded-lg bg-hueso px-3 py-2 text-[13px] leading-snug text-ambar-profundo" data-redondeo-sin-moneda>
                    No hay moneda para <b className="font-semibold tabular-nums">{money(cobroEfectivo?.deuda ?? 0)}</b>: la más chica es S/ 0.10. Cóbralo con otro medio.
                  </p>
                )}
                {/* Sin nada que cobrar en monedas (menos de S/ 0.10) no hay billetes ni vuelto que anotar. */}
                {aCobrar > 0 && (
                  <>
                    <p className="label-cayla mb-2.5 text-[13px] font-bold text-tinta">{varios ? "Efectivo recibido" : "¿Con cuánto paga?"}</p>
                    <div className="grid grid-cols-2 gap-2">
                      {[aCobrar, ...sugeridos].map((v, i) => (
                        <button
                          key={v}
                          type="button"
                          disabled={bloqueado}
                          title={i === 0 ? "Exacto" : undefined}
                          onClick={() => onRecibido(recibido === v ? null : v)}
                          style={{ animationDelay: `${i * 40}ms` }}
                          className={`hoja-cobro-billete anim-revelar ${recibido === v ? "es-elegido" : ""}`}
                        >
                          {corto(v)}
                        </button>
                      ))}
                      <label className={`hoja-cobro-billete es-otro ${recibido !== undefined && !enSugeridos ? "es-escrito" : ""}`}>
                        <span className="text-xs text-tinta/50">S/</span>
                        <input
                          aria-label="Otro monto recibido"
                          type="number"
                          inputMode="decimal"
                          min={0}
                          step="0.01"
                          placeholder="Otro" // sugerir-fijo: es la casilla para un monto que no está en los billetes sugeridos
                          value={recibido !== undefined && !enSugeridos ? recibido : ""}
                          onChange={(e) => onRecibido(e.target.value === "" ? null : Number(e.target.value))}
                          disabled={bloqueado}
                          className="w-full min-w-0 bg-transparent text-right font-display text-2xl text-tinta outline-none placeholder:text-tinta/35 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                        />
                      </label>
                    </div>
                    <p className={`mt-4 flex items-baseline justify-between ${recibido === undefined ? "invisible" : ""}`}>
                      <span className="label-cayla text-[13px] text-tinta/70">{vuelto > 0 ? "Vuelto" : recibido !== undefined && recibido < aCobrar ? "Faltan" : "Exacto"}</span>
                      <span key={vuelto} className={`anim-asentar font-display text-4xl leading-none tabular-nums @[640px]:text-5xl ${recibido !== undefined && recibido < aCobrar ? "text-ambar-profundo" : "text-tinta"}`}>
                        {vuelto > 0 ? money(vuelto) : recibido !== undefined && recibido < aCobrar ? money(aCobrar - recibido) : "✓"}
                      </span>
                    </p>
                  </>
                )}
              </div>
            ) : (
              <p className="pt-1 text-[15px] leading-relaxed text-tinta/60">
                {!pagos.length ? (
                  <>¿Pagó con dos? <br />Toca los dos.</>
                ) : pagos.every((p) => p.metodo === "tarjeta") ? (
                  <>Cobra en el POS <br />y confirma.</>
                ) : (
                  <>Confirma cuando <br />veas el pago.</>
                )}
              </p>
            )}
          </div>
        </div>
      </section>

      {/* 2 · Comprobante: ninguno marcado al empezar */}
      <section className={`hoja-cobro-paso ${comprobanteOk ? "es-hecho" : pagoOk ? "sigue-aqui" : ""}`}>
        <CabezaPaso
          numero={2}
          titulo="Comprobante"
          hecho={comprobanteOk}
          pista={tipoComprobante ? (comprobanteOk || !pagoOk ? null : "Sigue aquí") : "Elige uno"}
          pistaFuerte={pagoOk && !comprobanteOk}
          estado={!tipoComprobante ? null : comprobanteOk ? { ok: true, texto: ETIQUETA_TIPO[tipoComprobante] } : { ok: false, texto: faltaDocumento ?? "" }}
        />
        <div className="grid grid-cols-3 gap-2.5">
          {TIPOS.map(({ tipo, icono }) => (
            <button
              key={tipo}
              type="button"
              aria-pressed={tipoComprobante === tipo}
              disabled={bloqueado}
              onClick={() => onTipoComprobante(tipo)}
              className={`hoja-cobro-comprobante ${tipoComprobante === tipo ? "es-elegido" : ""} ${tipoComprobante && tipoComprobante !== tipo ? "es-otro" : ""}`}
            >
              <span className="hoja-cobro-comprobante-icono">{icono}</span>
              <span className="label-cayla truncate text-[13px] font-bold">{ETIQUETA_TIPO[tipo]}</span>
            </button>
          ))}
        </div>
        {tipoComprobante && <div className="hoja-cobro-doc anim-revelar mt-3">{documento}</div>}
      </section>

      {!compacta && (
        <div className="mt-auto pt-2">
          <button
            type="submit"
            form={formId}
            disabled={apagado}
            className="flex h-14 w-full items-center gap-3 rounded-2xl bg-tinta px-6 text-crema transition-[background-color,transform] duration-200 hover:-translate-y-px disabled:cursor-not-allowed disabled:bg-hueso disabled:text-tinta/60 disabled:hover:translate-y-0"
          >
            {!apagado && <Check className="h-5 w-5 shrink-0" aria-hidden />}
            <span className="label-cayla flex-1 truncate text-left text-sm">
              {loading ? "Procesando…" : motivoBloqueo ? motivoBloqueo.replace(/\.$/, "") : "Confirmar cobro"}
            </span>
            {!apagado && <span className="font-display text-3xl leading-none tabular-nums">{money(total)}</span>}
          </button>
          <p className="sr-only">
            {prendas} {prendas === 1 ? "prenda" : "prendas"}
          </p>
        </div>
      )}
    </div>
  );
}

/** El título de un paso: número (✓ al completarlo), nombre, la pastilla de «Sigue aquí»/«Elige uno» y su estado a la derecha. */
function CabezaPaso({
  numero,
  titulo,
  hecho,
  pista,
  pistaFuerte = true,
  estado,
}: {
  numero: number;
  titulo: string;
  hecho: boolean;
  pista: string | null;
  pistaFuerte?: boolean;
  estado: { ok: boolean; texto: string } | null;
}) {
  return (
    <div className="mb-3 flex items-center gap-2.5">
      <span
        className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border-[1.5px] text-xs font-bold transition-colors ${
          hecho ? "border-verde bg-verde text-crema" : "border-rojo text-rojo-profundo"
        }`}
      >
        {hecho ? <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden /> : numero}
      </span>
      <h3 className="label-cayla text-[15px] font-bold text-tinta">{titulo}</h3>
      {pista && (
        <span className={`anim-revelar rounded-full px-2.5 py-0.5 text-xs font-semibold ${pistaFuerte ? "bg-rojo/10 text-rojo-profundo" : "bg-hueso text-tinta"}`}>
          {pista}
        </span>
      )}
      {estado && (
        <span className={`ml-auto text-sm font-semibold ${estado.ok ? "text-verde-profundo" : "text-ambar-profundo"}`}>
          {estado.texto}
          {estado.ok ? " ✓" : ""}
        </span>
      )}
    </div>
  );
}
