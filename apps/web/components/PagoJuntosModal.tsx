"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Copy } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { Modal } from "@/components/ui/Modal";
import { Boton, CampoTexto } from "@/components/ui/campos";
import { CifraQueCuenta } from "@/components/ui/CifraQueCuenta";
import { SegmentoDeslizante } from "@/components/ui/SegmentoDeslizante";
import { CampoFecha } from "@/components/ui/CampoFecha";
import { ETIQUETA_METODO, soles, type CompraResumen } from "@/lib/compras-reglas";
import { hoyLima } from "@/lib/fechas-lima";
import { etiquetaVence, parseMonto, repartirPago, tramoDe } from "@/lib/por-pagar-reglas";

// Pago juntos (D3, ADR-0111): UNA transferencia que se aplica a varios comprobantes DEL MISMO
// proveedor. En Gamarra se le paga al proveedor «lo que se le debe», no factura por factura;
// obligar a registrar N pagos sueltos deja el estado de cuenta del banco (una línea) imposible
// de conciliar con el sistema (N pagos). Cada comprobante conserva su propio historial: la base
// escribe una fila de pago por comprobante y todas comparten un `pago_grupo_id`.
//
// `registrar_pago_compras` es todo-o-nada y aplica candado por comprobante; el `token` hace que
// apretar dos veces (o reintentar tras un corte) no pague dos veces. El pago individual de
// siempre (`BotonPagar`) no cambia: este modal es el camino del lote.
//
// Por pagar responde (2026-09-19, spike `docs/maquetas/por-pagar-spike-2026-09/`, mismo modelo que ADR-0128):
//  · CASCADA: cada comprobante muestra una barra con cuánto del pago recibe, en el orden real de `repartirPago`
//    (verde = queda en cero, rojo = se pasa). «Cubrir primero la más vencida» era una regla que había que creerse.
//  · ATAJOS: «Todo» y «Solo lo vencido», para no sumar de cabeza y escribir el monto.
//  · CONFIRMACIÓN: al registrar, el modal se vuelve una confirmación (el círculo y el tilde se dibujan, cada comprobante
//    aparece con su saldo en cero) y recién al cerrarla se le avisa a la lista, que hace reaccionar la pantalla.
//    El `router.refresh()` ya no vive acá: lo pide la lista cuando termina de plegar las filas pagadas, para que el
//    dato fresco no llegue a mitad de la animación y las haga desaparecer de golpe.
//
// Saldo a favor (ADR-0111, corrección 2026-09-18): si el proveedor le debe algo a CAYLA (una nota de
// crédito que superó lo que se le debía, típico de una factura al contado), acá se ofrece descontarlo del
// pago. Viene activado —pagar de más al proveedor con plata que ya tenemos a favor es el error caro— pero
// se ve, con el monto a transferir ya reducido, y se puede apagar. La base lo aplica en el mismo pago
// (`p_credito`): las filas del historial de cada comprobante dicen «Saldo a favor» y descuentan del libro.

export type DatosPagoProveedor = {
  banco: string | null;
  cuentaBancaria: string | null;
  telefono: string | null;
  plazoCreditoDias: number | null;
  formaPagoPreferida: string | null;
  /** Lo que el proveedor le debe a CAYLA (saldo a favor), disponible para descontar de este pago. */
  saldoFavor?: number;
};

type Modo = "vencida" | "mano";

/** Lo que el modal le cuenta a la lista cuando el pago quedó registrado (para que la pantalla reaccione). */
export type ResultadoPago = {
  /** Comprobantes que quedaron en cero con este pago. */
  pagadas: string[];
  /** Comprobantes que recibieron pago pero todavía deben algo. */
  parciales: string[];
  total: number;
};

// Botones del pie sin `flex-1` (los de `Modal` se estiran; acá conviven con una nota a la izquierda).
const BTN_CANCELAR = "label-cayla rounded-md border border-tinta/25 px-4 py-2.5 text-[11px] text-tinta transition-colors hover:border-rojo hover:text-rojo";
// Píldora de atajo (mismo aire que las de medio de pago, pero en minúscula normal: lleva un monto).
const PILDORA = "rounded-full border border-tinta/15 px-3 py-1 text-xs tabular-nums text-tinta/75 transition-colors duration-200 hover:border-rojo hover:text-rojo";

export function PagoJuntosModal({
  proveedorId,
  proveedorNombre,
  comprobantes,
  datos,
  onClose,
  onPagado,
}: {
  proveedorId: string;
  proveedorNombre: string;
  comprobantes: CompraResumen[];
  datos?: DatosPagoProveedor;
  onClose: () => void;
  /** Se llama al CERRAR la confirmación de un pago registrado (no antes), con lo que quedó pagado. */
  onPagado: (resultado: ResultadoPago) => void;
}) {
  // El orden del modal es el de la aplicación: primero lo más vencido.
  const ordenados = useMemo(
    () => [...comprobantes].sort((a, b) => (a.fechaVencimiento ?? "9999").localeCompare(b.fechaVencimiento ?? "9999") || a.fechaEmision.localeCompare(b.fechaEmision)),
    [comprobantes],
  );
  const totalSaldos = useMemo(() => Math.round(ordenados.reduce((a, c) => a + c.saldo, 0) * 100) / 100, [ordenados]);

  const [modo, setModo] = useState<Modo>("vencida");
  const [totalTxt, setTotalTxt] = useState(totalSaldos.toFixed(2));
  const [montos, setMontos] = useState<Record<string, string>>(() => Object.fromEntries(ordenados.map((c) => [c.id, c.saldo.toFixed(2)])));
  const formaInicial = datos?.formaPagoPreferida && datos.formaPagoPreferida in ETIQUETA_METODO ? datos.formaPagoPreferida : "transferencia";
  const [metodo, setMetodo] = useState(formaInicial);
  const [referencia, setReferencia] = useState("");
  const [fecha, setFecha] = useState(hoyLima());
  const [loading, setLoading] = useState(false);
  // Pago registrado: la confirmación reemplaza al formulario. El resultado se guarda en una ref porque el cierre
  // lo dispara `Modal` (con su animación de salida) y ahí hay que saber si se cerró un pago o se canceló.
  const [hecho, setHecho] = useState<ResultadoPago | null>(null);
  const resultado = useRef<ResultadoPago | null>(null);
  const saldoFavor = datos?.saldoFavor ?? 0;
  const [usarFavor, setUsarFavor] = useState(saldoFavor > 0);
  // Estable durante los reintentos: si la respuesta se corta después de que la base pagó,
  // reintentar con el mismo token no paga otra vez.
  const token = useRef<string>(crypto.randomUUID());

  const aplicaciones = ordenados.map((c) => ({ c, monto: parseMonto(montos[c.id] ?? "") }));
  const hayInvalido = aplicaciones.some((a) => Number.isNaN(a.monto));
  const excede = aplicaciones.some((a) => !Number.isNaN(a.monto) && a.monto > a.c.saldo + 0.005);
  const total = hayInvalido ? 0 : Math.round(aplicaciones.reduce((s, a) => s + a.monto, 0) * 100) / 100;
  const enCero = aplicaciones.filter((a) => !Number.isNaN(a.monto) && Math.abs(a.monto - a.c.saldo) < 0.005).length;
  const puedeRegistrar = total > 0 && !hayInvalido && !excede && !loading;
  // Cuánto del pago se cubre con saldo a favor y cuánto sale de verdad (transferencia, efectivo…).
  const credito = usarFavor ? Math.round(Math.min(saldoFavor, total) * 100) / 100 : 0;
  const aTransferir = Math.round((total - credito) * 100) / 100;
  const todoConFavor = credito > 0 && aTransferir <= 0;

  function repartir(nuevoTotal: number) {
    const r = repartirPago(nuevoTotal, ordenados);
    setMontos(Object.fromEntries(ordenados.map((c) => [c.id, (r[c.id] ?? 0).toFixed(2)])));
  }
  function alCambiarTotal(txt: string) {
    setTotalTxt(txt);
    const n = parseMonto(txt);
    if (!Number.isNaN(n)) repartir(n);
  }
  function alCambiarMonto(id: string, txt: string) {
    setModo("mano");
    const nuevos = { ...montos, [id]: txt };
    setMontos(nuevos);
    const suma = ordenados.reduce((s, c) => s + (parseMonto(nuevos[c.id] ?? "") || 0), 0);
    setTotalTxt((Math.round(suma * 100) / 100).toFixed(2));
  }
  // Atajos: fijan el total y reparten «cubriendo primero la más vencida».
  function aplicarAtajo(valor: number) {
    setModo("vencida");
    setTotalTxt(valor.toFixed(2));
    repartir(valor);
  }
  const totalVencido = useMemo(
    () => Math.round(ordenados.filter((c) => tramoDe(c, new Date()) === "vencidas").reduce((a, c) => a + c.saldo, 0) * 100) / 100,
    [ordenados],
  );
  function alElegirModo(m: Modo) {
    setModo(m);
    if (m === "vencida") {
      const n = parseMonto(totalTxt);
      repartir(Number.isNaN(n) ? totalSaldos : n);
    }
  }

  // El acuse de que se copió es el propio botón (✓ Copiado, `DatoCopiable`); solo un fallo merece un aviso.
  async function copiar(valor: string, que: string): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(valor);
      return true;
    } catch {
      avisar.error(`No se pudo copiar ${que.toLowerCase()}`, { detalle: "Selecciónalo y cópialo a mano." });
      return false;
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (hayInvalido) return void avisar.error("Revisa los montos: cada uno debe ser un número mayor o igual a cero.");
    if (excede) return void avisar.error("Un comprobante recibe más de lo que debe. Baja el monto marcado en rojo.");
    const lote = aplicaciones.filter((a) => a.monto > 0).map((a) => ({ compra_id: a.c.id, monto: a.monto }));
    if (lote.length === 0) return void avisar.error("El pago necesita al menos un comprobante con monto.");
    setLoading(true);
    const cerrarProceso = avisar.proceso("Registrando el pago…");
    const supabase = createClient();
    const { error } = await supabase.rpc("registrar_pago_compras", {
      p_proveedor_id: proveedorId,
      p_metodo: metodo,
      p_aplicaciones: lote,
      ...(referencia.trim() ? { p_referencia: referencia.trim() } : {}),
      p_fecha: fecha,
      p_token: token.current,
      ...(credito > 0 ? { p_credito: credito } : {}),
    });
    cerrarProceso();
    setLoading(false);
    if (error) {
      avisar.error(traducirError(error, "registrar el pago"));
      return;
    }
    token.current = crypto.randomUUID();
    avisar.exito(`Pago de ${soles(total)} registrado`, {
      detalle: `${lote.length === 1 ? "1 comprobante" : `${lote.length} comprobantes`} de ${proveedorNombre}, como un solo pago.${credito > 0 ? ` Se descontaron ${soles(credito)} de tu saldo a favor.` : ""}`,
    });
    // Quedan en cero los que recibieron todo su saldo; el resto sigue debiendo (y la lista lo enciende en verde).
    const r: ResultadoPago = {
      pagadas: aplicaciones.filter((a) => a.monto > 0 && Math.abs(a.monto - a.c.saldo) < 0.005).map((a) => a.c.id),
      parciales: aplicaciones.filter((a) => a.monto > 0 && Math.abs(a.monto - a.c.saldo) >= 0.005).map((a) => a.c.id),
      total,
    };
    resultado.current = r;
    setHecho(r);
  }

  const hayDatos = !!(datos && (datos.formaPagoPreferida || datos.banco || datos.cuentaBancaria || datos.telefono));
  const ahora = new Date();

  return (
    <Modal
      titulo={
        hecho ? (
          <span className="sr-only">Pago registrado</span>
        ) : (
          <>
            <span className="label-cayla mb-0.5 block text-[11px] text-tinta/65">Pagar a proveedor</span>
            <span className="block text-[28px] leading-tight">{proveedorNombre}</span>
          </>
        )
      }
      subtitulo={hecho ? undefined : `${ordenados.length === 1 ? "1 comprobante" : `${ordenados.length} comprobantes`} · una sola transferencia`}
      ancho="max-w-2xl"
      onClose={() => (resultado.current ? onPagado(resultado.current) : onClose())}
    >
      {(cerrar) =>
        hecho ? (
          <Confirmacion hecho={hecho} proveedorNombre={proveedorNombre} credito={credito} filas={aplicaciones.filter((a) => a.monto > 0).map((a) => ({ documento: a.c.documento, saldoFinal: Math.max(0, Math.round((a.c.saldo - a.monto) * 100) / 100) }))} cerrar={cerrar} />
        ) : (
        <form onSubmit={onSubmit} className="space-y-5">
          {hayDatos && (
            <div className="grid gap-4 rounded-xl border border-sand bg-sand/40 p-4 sm:grid-cols-[1fr_1.5fr_1.2fr]">
              <div>
                <p className="label-cayla text-[10px] text-tinta/55">Paga por</p>
                <p className="mt-1 text-sm text-tinta">
                  {datos?.formaPagoPreferida ? (ETIQUETA_METODO[datos.formaPagoPreferida] ?? datos.formaPagoPreferida) : "Sin definir"}
                  {datos?.banco ? ` · ${datos.banco}` : ""}
                </p>
                {datos?.plazoCreditoDias != null && <p className="text-xs text-tinta/55">Crédito a {datos.plazoCreditoDias} días</p>}
              </div>
              {datos?.cuentaBancaria && (
                <DatoCopiable etiqueta="Cuenta o CCI" valor={datos.cuentaBancaria} onCopiar={() => copiar(datos.cuentaBancaria!, "Cuenta")} />
              )}
              {datos?.telefono && <DatoCopiable etiqueta="Yape / Plin" valor={datos.telefono} onCopiar={() => copiar(datos.telefono!, "Teléfono")} />}
            </div>
          )}

          <section>
            <p className="label-cayla mb-2 text-[11px] text-tinta/65">Cómo se aplica el pago</p>
            <div className="card-cayla divide-y divide-tinta/10 overflow-hidden">
              <div className="hidden gap-x-4 px-5 py-2 sm:grid sm:grid-cols-[1fr_9.5rem_7.5rem_8.5rem]">
                {["Comprobante", "Vence", "Saldo", "Se paga"].map((t, i) => (
                  <span key={t} className={`label-cayla text-[11px] text-tinta/55 ${i >= 2 ? "text-right" : ""}`}>
                    {t}
                  </span>
                ))}
              </div>
              {aplicaciones.map(({ c, monto }) => {
                const tramo = tramoDe(c, ahora);
                const colorVence = tramo === "vencidas" ? "text-rojo" : tramo === "semana" ? "text-ambar-profundo" : "text-tinta/75";
                const invalido = Number.isNaN(monto);
                const pasa = !invalido && monto > c.saldo + 0.005;
                const aplicado = invalido ? 0 : monto;
                const llena = !invalido && !pasa && Math.abs(aplicado - c.saldo) < 0.005;
                return (
                  <div key={c.id} className="grid items-center gap-x-4 gap-y-1 px-5 py-3 sm:grid-cols-[1fr_9.5rem_7.5rem_8.5rem]">
                    <span className="text-sm tabular-nums text-tinta">{c.documento}</span>
                    <span className={`text-sm ${colorVence}`}>{c.fechaVencimiento ? etiquetaVence(c.fechaVencimiento, ahora) : "Sin fecha"}</span>
                    <span className="text-sm tabular-nums text-tinta/75 sm:text-right">
                      <span className="text-xs text-tinta/55 sm:hidden">Saldo </span>
                      {c.saldo.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                    <input
                      inputMode="decimal"
                      value={montos[c.id] ?? ""}
                      onChange={(e) => alCambiarMonto(c.id, e.target.value)}
                      onFocus={(e) => e.target.select()}
                      aria-label={`Monto a pagar de ${c.documento}`}
                      aria-invalid={pasa || invalido || undefined}
                      className={`w-full rounded-lg border bg-papel px-2.5 py-1.5 text-right text-sm tabular-nums text-tinta outline-none transition-colors duration-200 focus:border-rojo ${pasa || invalido ? "border-rojo text-rojo" : "border-tinta/25"}`}
                    />
                    {/* La cascada: cuánto del pago recibe este comprobante. Verde = queda en cero; rojo = se pasa del saldo. */}
                    <div aria-hidden className="mt-1.5 h-1 overflow-hidden rounded-full bg-sand sm:col-span-3">
                      <div
                        className={`h-full origin-left rounded-full transition-[transform,background-color] duration-500 ease-cayla ${pasa ? "bg-rojo" : llena ? "bg-verde" : "bg-tinta"}`}
                        style={{ transform: `scaleX(${c.saldo > 0 ? Math.min(1, aplicado / c.saldo) : 0})` }}
                      />
                    </div>
                    <span className={`mt-1 flex min-h-[18px] items-center gap-1.5 text-xs sm:col-start-4 sm:justify-end ${pasa || invalido ? "text-rojo" : llena ? "text-verde-profundo" : "text-tinta/55"}`} aria-live="polite">
                      {invalido ? (
                        "Monto no válido"
                      ) : pasa ? (
                        "Supera el saldo"
                      ) : llena ? (
                        <>
                          <Tilde /> queda en cero
                        </>
                      ) : aplicado > 0 ? (
                        `quedan ${soles(Math.round((c.saldo - aplicado) * 100) / 100)}`
                      ) : (
                        "no se paga ahora"
                      )}
                    </span>
                  </div>
                );
              })}
              <div className="grid items-center gap-x-4 bg-tinta/[0.04] px-5 py-3 sm:grid-cols-[1fr_auto]">
                <span className="label-cayla text-[11px] text-tinta">Total del pago</span>
                {modo === "vencida" ? (
                  <label className="flex items-baseline justify-end gap-1">
                    <span className="font-display text-[22px] text-tinta">S/</span>
                    <input
                      inputMode="decimal"
                      value={totalTxt}
                      onChange={(e) => alCambiarTotal(e.target.value)}
                      onFocus={(e) => e.target.select()}
                      aria-label="Total del pago"
                      className="font-display w-36 border-b border-tinta/25 bg-transparent text-right text-[22px] tabular-nums text-tinta outline-none focus:border-b-2 focus:border-rojo"
                    />
                  </label>
                ) : (
                  <span className="font-display text-right text-[22px] tabular-nums text-tinta">
                    <CifraQueCuenta valor={total} formato="soles" />
                  </span>
                )}
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
              <span className="label-cayla text-[10.5px] text-tinta/65">Si pagas menos</span>
              <SegmentoDeslizante
                etiqueta="Cómo repartir un pago menor al total"
                valor={modo}
                onCambio={(v) => alElegirModo(v as Modo)}
                opciones={[
                  { clave: "vencida", etiqueta: "Cubrir primero la más vencida" },
                  { clave: "mano", etiqueta: "Repartir a mano" },
                ]}
                className="h-9 [&_button]:py-0"
              />
              {(ordenados.length > 1 || totalVencido > 0) && (
                <span className="flex flex-wrap items-center gap-2">
                  <span className="label-cayla text-[10.5px] text-tinta/65">Atajos</span>
                  <button type="button" onClick={() => aplicarAtajo(totalSaldos)} className={PILDORA}>
                    Todo · {soles(totalSaldos)}
                  </button>
                  {totalVencido > 0 && totalVencido < totalSaldos && (
                    <button type="button" onClick={() => aplicarAtajo(totalVencido)} className={PILDORA}>
                      Solo lo vencido · {soles(totalVencido)}
                    </button>
                  )}
                </span>
              )}
            </div>
          </section>

          {saldoFavor > 0 && (
            <div className="rounded-xl border border-verde/40 bg-verde/[0.06] p-4">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  role="switch"
                  aria-checked={usarFavor}
                  aria-label={`Descontar mi saldo a favor con ${proveedorNombre}`}
                  onClick={() => setUsarFavor((v) => !v)}
                  className={`relative h-[23px] w-10 shrink-0 rounded-full transition-colors duration-[260ms] ease-cayla ${usarFavor ? "bg-tinta" : "bg-tinta/25"}`}
                >
                  <span aria-hidden className={`absolute left-[3px] top-[3px] h-[17px] w-[17px] rounded-full bg-crema transition-transform duration-300 ease-cayla ${usarFavor ? "translate-x-[17px]" : ""}`} />
                </button>
                <div>
                  <p className="text-sm font-semibold text-tinta">Tienes {soles(saldoFavor)} a favor con {proveedorNombre}</p>
                  <p className="text-xs text-tinta/65">
                    Es plata que el proveedor te debe (una nota de crédito que superó lo que se le debía). {usarFavor ? "Se descuenta de este pago." : "Si lo apagas, no se toca y sigue a tu favor."}
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className={`grid gap-5 sm:grid-cols-[1.7fr_1fr_1fr] ${todoConFavor ? "opacity-50" : ""}`}>
            <div>
              <p className="label-cayla text-[11px] text-tinta/65">Medio de pago{todoConFavor ? " (no hace falta: cubre todo el saldo a favor)" : ""}</p>
              <div className="mt-2 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Medio de pago">
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
            <CampoTexto etiqueta="Referencia" mono value={referencia} onChange={(e) => setReferencia(e.target.value)} placeholder="Op. 00871234" autoComplete="off" />
            <CampoFecha etiqueta="Fecha del pago" valor={fecha} onValor={setFecha} required />
          </div>

          <div className="border-t border-tinta/10 pt-4">
            <p className="text-sm text-tinta">
              {credito > 0 ? (
                <>
                  Transferirás <span className="font-display text-xl tabular-nums"><CifraQueCuenta valor={aTransferir} formato="soles" /></span> <span className="text-tinta/65">(pago de {soles(total)} usando {soles(credito)} a favor)</span>
                </>
              ) : (
                <>
                  Pagarás <span className="font-display text-xl tabular-nums"><CifraQueCuenta valor={total} formato="soles" /></span>
                </>
              )}{" "}
              · quedarán en cero <b className="font-semibold">{enCero === 1 ? "1 comprobante" : `${enCero} comprobantes`}</b>
            </p>
            <p className="mt-1 text-xs leading-relaxed text-tinta/65">
              {aTransferir > 0 ? (
                <>
                  Se registra como <b className="font-semibold">un solo pago</b>: en el estado de cuenta del banco verás una línea de {soles(aTransferir)}. Cada comprobante conserva su propio historial de pagos.
                </>
              ) : (
                <>Se cubre entero con tu saldo a favor: no sale plata del banco. Cada comprobante lo muestra en su historial como «Saldo a favor».</>
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 border-t border-tinta/10 pt-4">
            <p className="min-w-0 flex-1 text-xs text-tinta/55">Todo o nada: si un comprobante ya no admite el monto, no se registra ninguno.</p>
            <button type="button" onClick={cerrar} className={BTN_CANCELAR} disabled={loading}>
              Cancelar
            </button>
            <Boton type="submit" peso="primario" cargando={loading} disabled={!puedeRegistrar}>
              {loading ? "Registrando…" : credito > 0 ? `Registrar pago de ${soles(total)} (${soles(credito)} a favor)` : `Registrar pago de ${soles(total)}`}
            </Boton>
          </div>
        </form>
        )
      }
    </Modal>
  );
}

function DatoCopiable({ etiqueta, valor, onCopiar }: { etiqueta: string; valor: string; onCopiar: () => Promise<boolean> }) {
  // «✓ Copiado» durante un momento y vuelve el ícono: el gesto se confirma donde se hizo, sin un aviso aparte.
  const [copiado, setCopiado] = useState(false);
  useEffect(() => {
    if (!copiado) return;
    const t = setTimeout(() => setCopiado(false), 1700);
    return () => clearTimeout(t);
  }, [copiado]);
  return (
    <div className="min-w-0">
      <p className="label-cayla text-[10px] text-tinta/55">{etiqueta}</p>
      <p className="mt-1 flex items-center gap-2 text-sm tabular-nums text-tinta">
        <span className="truncate">{valor}</span>
        <button
          type="button"
          onClick={async () => setCopiado(await onCopiar())}
          aria-label={`Copiar ${etiqueta.toLowerCase()}`}
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-md px-1 py-0.5 text-[11px] transition-colors duration-200 ${copiado ? "bg-verde/10 text-verde-profundo" : "text-tinta/55 hover:text-rojo"}`}
        >
          {copiado ? (
            <>
              <Tilde /> Copiado
            </>
          ) : (
            <Copy aria-hidden className="h-3.5 w-3.5" />
          )}
        </button>
      </p>
    </div>
  );
}

/** El tilde que se DIBUJA (`pathLength="1"`): el estado nuevo se hace en vez de aparecer. */
function Tilde() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="h-3 w-3 shrink-0 fill-none stroke-current" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
      <path pathLength={1} d="M20 6 9 17l-5-5" className="trazo-linea anim-tilde" />
    </svg>
  );
}

/**
 * La confirmación que reemplaza al formulario cuando el pago quedó registrado: el círculo y el tilde se dibujan, cada
 * comprobante aparece con su saldo resultante (en cero, verde) y a los 3.2 s se cierra sola (o con «Listo»). Al cerrarse,
 * la lista hace reaccionar la pantalla. Sin movimiento, es solo la frase y la lista.
 */
function Confirmacion({
  hecho,
  proveedorNombre,
  credito,
  filas,
  cerrar,
}: {
  hecho: ResultadoPago;
  proveedorNombre: string;
  credito: number;
  filas: { documento: string; saldoFinal: number }[];
  cerrar: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(cerrar, 3200);
    return () => clearTimeout(t);
  }, [cerrar]);
  return (
    <div className="anim-asentar px-2 pb-1 pt-6 text-center">
      <svg aria-hidden viewBox="0 0 64 64" className="mx-auto mb-3 h-16 w-16 fill-none stroke-verde" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <circle pathLength={1} cx="32" cy="32" r="29" className="trazo-linea anim-trazo" style={{ ["--i" as string]: 0 }} />
        <path pathLength={1} d="M19 33l9 9 17-20" className="trazo-linea anim-trazo" style={{ ["--i" as string]: 8 }} />
      </svg>
      <h3 className="font-display text-[28px] leading-tight text-tinta">Pago de {soles(hecho.total)} registrado</h3>
      <p className="mt-1 text-sm text-tinta/65">
        {filas.length === 1 ? "1 comprobante" : `${filas.length} comprobantes`} de {proveedorNombre}, como un solo pago.
        {credito > 0 ? ` Se descontaron ${soles(credito)} de tu saldo a favor.` : ""}
      </p>
      <ul className="mx-auto mt-[18px] max-w-sm text-left">
        {filas.map((f, i) => (
          <li key={f.documento} className="anim-revelar flex items-center justify-between gap-3 border-t border-tinta/10 py-2 text-[13.5px]" style={{ animationDelay: `${900 + i * 90}ms` }}>
            <span className="tabular-nums text-tinta">{f.documento}</span>
            <span className={`flex items-center gap-1.5 tabular-nums ${f.saldoFinal <= 0 ? "text-verde-profundo" : "text-tinta/75"}`}>
              {f.saldoFinal <= 0 ? (
                <>
                  <Tilde /> saldo {soles(0)}
                </>
              ) : (
                `saldo ${soles(f.saldoFinal)}`
              )}
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-[22px] flex justify-center">
        <Boton type="button" peso="primario" onClick={cerrar}>
          Listo
        </Boton>
      </div>
    </div>
  );
}
