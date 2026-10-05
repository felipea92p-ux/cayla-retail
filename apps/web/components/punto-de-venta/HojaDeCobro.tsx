"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { ArrowLeft, Check, FileText, Receipt, StickyNote } from "lucide-react";
import type { MetodoPagoVenta } from "@cayla-retail/shared";
import { ETIQUETA_TIPO, type TipoComprobante } from "@/lib/comprobantes-reglas";
import { lecturaDelRecibido, montosSugeridos, type PagoAplicado } from "@/lib/vender-reglas";
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

/** Nombre corto de un medio para una ficha muy angosta (menos de 6 rem: una tablet a 1024 px): «Transferencia» no cabe entera a un
 *  tamaño legible. Los dos nombres van en la ficha y el CSS (`.hoja-cobro-nombre-corto`) muestra solo uno; el `title` sigue diciendo el
 *  nombre entero. */
const NOMBRE_CORTO: Partial<Record<MetodoPagoVenta, string>> = { transferencia: "Transf." };

/** Los colores de la línea bajo los billetes: lo exacto va en verde, lo que falta en rojo y el vuelto neutro (Felipe 2026-10-05). */
const COLOR_RECIBIDO = {
  vuelto: { etiqueta: "text-tinta/70", cifra: "text-tinta" },
  falta: { etiqueta: "text-rojo-profundo", cifra: "text-rojo-profundo" },
  exacto: { etiqueta: "text-verde-profundo", cifra: "text-verde-profundo" },
} as const;

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
 * Se ajusta a cualquier pantalla (Felipe 2026-10-05, un laptop de ~650 px de alto dejaba «Confirmar cobro» bajo el pliegue):
 *   · el botón y la cabecera NO scrollean — solo lo hacen los pasos, y solo si ni así caben;
 *   · la FORMA no cambia nunca (dos filas de tres fichas; en la hoja ancha, los billetes al lado) y en pantalla grande es el
 *     diseño de siempre, con las fichas cuadradas y grandes; solo cambia el TAMAÑO: bajo 52 rem de alto (el alto REAL de la hoja,
 *     no el de la ventana: `@container cobro (…)` en globals.css) los espacios se aprietan y las fichas se achican con lo que
 *     falta, y en la hoja angosta los billetes pasan a una línea.
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
  const cuerpoRef = useRef<HTMLDivElement>(null);
  // Al elegir el comprobante aparece el documento del cliente; en una hoja baja puede quedar bajo el pliegue. Entonces el cuerpo
  // baja lo justo para mostrarlo (`block: "nearest"`: si ya se ve entero, no se mueve). Lo disparó un toque en un botón, nunca
  // una tecla en un campo de texto de la hoja (guía de foco, regla 6), y sin movimiento con `prefers-reduced-motion`.
  useEffect(() => {
    if (compacta || !tipoComprobante) return;
    const fotograma = requestAnimationFrame(() => {
      const reducido = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      cuerpoRef.current?.querySelector("[data-documento-cobro]")?.scrollIntoView({ block: "nearest", behavior: reducido ? "auto" : "smooth" });
    });
    return () => cancelAnimationFrame(fotograma);
  }, [tipoComprobante, compacta]);

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
  const lectura = lecturaDelRecibido(recibido, aCobrar, vuelto);
  const colorLectura = COLOR_RECIBIDO[lectura?.estado ?? "vuelto"];

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
    <div className={`@container flex min-h-0 flex-col ${compacta ? "gap-3" : "hoja-cobro-raiz flex-1"}`}>
      {!compacta && (
        <div className="hoja-cobro-cabeza shrink-0 border-b border-sand">
          <p className="flex items-baseline gap-3">
            <span className="label-cayla text-xs text-tinta/60">Total</span>
            <span key={total} className="hoja-cobro-total anim-asentar font-display leading-none tabular-nums text-tinta">
              {money(total)}
            </span>
          </p>
          <button
            type="button"
            onClick={onVolver}
            className="hoja-cobro-volver label-cayla flex items-center gap-2 rounded-xl border border-sand text-xs text-tinta transition-colors hover:bg-hueso"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Volver
          </button>
        </div>
      )}

      {/* Los dos pasos van en un cuerpo que scrollea SOLO si no caben (red de seguridad): la cabecera y «Confirmar cobro»
          quedan fuera de él, siempre a la vista. En el celular (`compacta`) el cuerpo no existe: la hoja del ticket scrollea. */}
      <div ref={cuerpoRef} className={compacta ? "contents" : "hoja-cobro-cuerpo scroll-cayla"}>
        {/* 1 · Pago */}
        <section className={`hoja-cobro-paso ${pagoOk ? "es-hecho" : "sigue-aqui"}`}>
          <CabezaPaso numero={1} titulo="Pago" hecho={pagoOk} pista={pagoOk ? null : "Sigue aquí"} estado={estadoPago} />
          <div className="hoja-cobro-pago grid">
            <div className={`hoja-cobro-medios grid ${varios ? "con-montos" : ""}`}>
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
                    <span className="hoja-cobro-nombre label-cayla leading-none font-bold">
                      {NOMBRE_CORTO[m] ? (
                        <>
                          <span className="hoja-cobro-nombre-largo">{NOMBRE_METODO[m]}</span>
                          <span className="hoja-cobro-nombre-corto">{NOMBRE_CORTO[m]}</span>
                        </>
                      ) : (
                        NOMBRE_METODO[m]
                      )}
                    </span>
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
            <div className="hoja-cobro-extra min-w-0">
              {efectivo && efectivo.monto <= 0 ? (
                <p className="hoja-cobro-pista text-tinta/60">
                  Escribe cuánto paga <br />en efectivo.
                </p>
              ) : efectivo ? (
                <div className="hoja-cobro-efectivo anim-revelar">
                  {redondeo > 0 && aCobrar > 0 && (
                    <p className="hoja-cobro-nota rounded-lg bg-hueso text-tinta/80" data-redondeo>
                      Cobra <b className="font-semibold text-tinta tabular-nums">{money(aCobrar)}</b> en efectivo
                      <span className="block text-[12px] text-tinta/60">
                        {TEXTO_REDONDEO} −{money(redondeo)} · {LEY_REDONDEO}
                      </span>
                    </p>
                  )}
                  {/* Menos de la moneda más chica: no hay con qué entregarlo. Lo mismo que dice el botón apagado (`motivoBloqueoCobro`). */}
                  {redondeo > 0 && aCobrar <= 0 && (
                    <p className="hoja-cobro-nota rounded-lg bg-hueso text-ambar-profundo" data-redondeo-sin-moneda>
                      No hay moneda para <b className="font-semibold tabular-nums">{money(cobroEfectivo?.deuda ?? 0)}</b>: la más chica es S/ 0.10. Cóbralo con otro medio.
                    </p>
                  )}
                  {/* Sin nada que cobrar en monedas (menos de S/ 0.10) no hay billetes ni vuelto que anotar. */}
                  {aCobrar > 0 && (
                    <>
                      <p className="hoja-cobro-pregunta label-cayla font-bold text-tinta">{varios ? "Efectivo recibido" : "¿Con cuánto paga?"}</p>
                      <div className="hoja-cobro-billetes grid">
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
                      <p className={`hoja-cobro-vuelto flex items-baseline justify-between ${lectura === null ? "invisible" : ""}`} data-recibido={lectura?.estado}>
                        <span className={`label-cayla text-[13px] ${colorLectura.etiqueta}`}>{lectura?.estado === "vuelto" ? "Vuelto" : lectura?.estado === "falta" ? "Faltan" : "Exacto"}</span>
                        <span
                          key={`${lectura?.estado}-${lectura?.monto}`}
                          className={`hoja-cobro-vuelto-monto ${lectura?.estado === "exacto" ? "es-exacto" : ""} anim-asentar font-display leading-none tabular-nums ${colorLectura.cifra}`}
                        >
                          {lectura === null ? "✓" : lectura.estado === "exacto" ? `✓ ${money(lectura.monto)}` : money(lectura.monto)}
                        </span>
                      </p>
                    </>
                  )}
                </div>
              ) : (
                <p className="hoja-cobro-pista text-tinta/60">
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
                <span className="hoja-cobro-comprobante-nombre label-cayla font-bold">{ETIQUETA_TIPO[tipo]}</span>
              </button>
            ))}
          </div>
          {tipoComprobante && <div data-documento-cobro className="hoja-cobro-doc anim-revelar">{documento}</div>}
        </section>
      </div>

      {!compacta && (
        <div className="hoja-cobro-pie shrink-0">
          <button
            type="submit"
            form={formId}
            disabled={apagado}
            className="hoja-cobro-confirmar flex w-full items-center rounded-2xl bg-tinta text-crema transition-[background-color,transform] duration-200 hover:-translate-y-px disabled:cursor-not-allowed disabled:bg-hueso disabled:text-tinta/60 disabled:hover:translate-y-0"
          >
            {!apagado && <Check className="h-5 w-5 shrink-0" aria-hidden />}
            <span className="hoja-cobro-confirmar-rotulo label-cayla flex-1 truncate text-left">
              {loading ? "Procesando…" : motivoBloqueo ? motivoBloqueo.replace(/\.$/, "") : "Confirmar cobro"}
            </span>
            {!apagado && <span className="hoja-cobro-confirmar-monto font-display leading-none tabular-nums">{money(total)}</span>}
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
    <div className="hoja-cobro-cabeza-paso flex items-center gap-2.5">
      <span
        className={`hoja-cobro-numero grid shrink-0 place-items-center rounded-full border-[1.5px] font-bold transition-colors ${
          hecho ? "border-verde bg-verde text-crema" : "border-rojo text-rojo-profundo"
        }`}
      >
        {hecho ? <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden /> : numero}
      </span>
      <h3 className="label-cayla whitespace-nowrap text-[15px] font-bold text-tinta">{titulo}</h3>
      {pista && (
        <span className={`anim-revelar whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${pistaFuerte ? "bg-rojo/10 text-rojo-profundo" : "bg-hueso text-tinta"}`}>
          {pista}
        </span>
      )}
      {estado && (
        <span className={`ml-auto min-w-0 truncate text-sm font-semibold ${estado.ok ? "text-verde-profundo" : "text-ambar-profundo"}`}>
          {estado.texto}
          {estado.ok ? " ✓" : ""}
        </span>
      )}
    </div>
  );
}
