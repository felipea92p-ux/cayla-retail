"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Copy } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { Modal } from "@/components/ui/Modal";
import { CampoTexto } from "@/components/ui/campos";
import { CampoFecha } from "@/components/ui/CampoFecha";
import { ETIQUETA_METODO, soles, type CompraResumen } from "@/lib/compras-reglas";
import { hoyLima } from "@/lib/fechas-lima";
import { etiquetaVence, parseMonto, repartirPago, tramoDe } from "@/lib/por-pagar-reglas";

// Pago juntos (D3, ADR-0106): UNA transferencia que se aplica a varios comprobantes DEL MISMO
// proveedor. En Gamarra se le paga al proveedor «lo que se le debe», no factura por factura;
// obligar a registrar N pagos sueltos deja el estado de cuenta del banco (una línea) imposible
// de conciliar con el sistema (N pagos). Cada comprobante conserva su propio historial: la base
// escribe una fila de pago por comprobante y todas comparten un `pago_grupo_id`.
//
// `registrar_pago_compras` es todo-o-nada y aplica candado por comprobante; el `token` hace que
// apretar dos veces (o reintentar tras un corte) no pague dos veces. El pago individual de
// siempre (`BotonPagar`) no cambia: este modal es el camino del lote.
//
// Saldo a favor (ADR-0106, corrección 2026-09-18): si el proveedor le debe algo a CAYLA (una nota de
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

// Botones del pie sin `flex-1` (los de `Modal` se estiran; acá conviven con una nota a la izquierda).
const BTN_CANCELAR = "label-cayla rounded-md border border-tinta/25 px-4 py-2.5 text-[11px] text-tinta transition-colors hover:border-rojo hover:text-rojo";
const BTN_PRIMARIO = "label-cayla rounded-md bg-tinta px-4 py-2.5 text-[11px] text-crema transition-colors hover:bg-rojo disabled:opacity-50";

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
  onPagado: () => void;
}) {
  const router = useRouter();
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
  function alElegirModo(m: Modo) {
    setModo(m);
    if (m === "vencida") {
      const n = parseMonto(totalTxt);
      repartir(Number.isNaN(n) ? totalSaldos : n);
    }
  }

  async function copiar(valor: string, que: string) {
    try {
      await navigator.clipboard.writeText(valor);
      avisar.exito(`${que} copiado`);
    } catch {
      avisar.error(`No se pudo copiar ${que.toLowerCase()}`, { detalle: "Selecciónalo y cópialo a mano." });
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
    router.refresh();
    onPagado();
  }

  const hayDatos = !!(datos && (datos.formaPagoPreferida || datos.banco || datos.cuentaBancaria || datos.telefono));
  const ahora = new Date();

  return (
    <Modal
      titulo={
        <>
          <span className="label-cayla mb-0.5 block text-[11px] font-normal text-tinta/65">Pagar a proveedor</span>
          <span className="block text-[28px] leading-tight">{proveedorNombre}</span>
        </>
      }
      subtitulo={`${ordenados.length === 1 ? "1 comprobante" : `${ordenados.length} comprobantes`} · una sola transferencia`}
      ancho="max-w-2xl"
      onClose={onClose}
    >
      {(cerrar) => (
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
                const pasa = !Number.isNaN(monto) && monto > c.saldo + 0.005;
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
                      aria-invalid={pasa || undefined}
                      className={`w-full rounded-lg border bg-papel px-2.5 py-1.5 text-right text-sm tabular-nums text-tinta outline-none focus:border-rojo ${pasa ? "border-rojo text-rojo" : "border-tinta/25"}`}
                    />
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
                  <span className="font-display text-right text-[22px] tabular-nums text-tinta">{soles(total)}</span>
                )}
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <span className="label-cayla text-[10.5px] text-tinta/65">Si pagas menos</span>
              <div role="radiogroup" aria-label="Cómo repartir un pago menor al total" className="inline-flex h-9 overflow-hidden rounded-lg border border-tinta/15">
                {(
                  [
                    ["vencida", "Cubrir primero la más vencida"],
                    ["mano", "Repartir a mano"],
                  ] as const
                ).map(([v, t]) => (
                  <button
                    key={v}
                    type="button"
                    role="radio"
                    aria-checked={modo === v}
                    onClick={() => alElegirModo(v)}
                    className={`label-cayla px-3.5 text-[11px] transition-colors ${modo === v ? "bg-tinta text-crema" : "text-tinta/65 hover:text-rojo"}`}
                  >
                    {t}
                  </button>
                ))}
              </div>
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
                  className={`relative h-[23px] w-10 shrink-0 rounded-full transition-colors ${usarFavor ? "bg-tinta" : "bg-tinta/25"}`}
                >
                  <span aria-hidden className={`absolute left-[3px] top-[3px] h-[17px] w-[17px] rounded-full bg-crema transition-transform ${usarFavor ? "translate-x-[17px]" : ""}`} />
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
                  Transferirás <span className="font-display text-xl tabular-nums">{soles(aTransferir)}</span> <span className="text-tinta/65">(pago de {soles(total)} usando {soles(credito)} a favor)</span>
                </>
              ) : (
                <>
                  Pagarás <span className="font-display text-xl tabular-nums">{soles(total)}</span>
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
            <button type="submit" className={BTN_PRIMARIO} disabled={!puedeRegistrar}>
              {loading ? "Registrando…" : credito > 0 ? `Registrar pago de ${soles(total)} (${soles(credito)} a favor)` : `Registrar pago de ${soles(total)}`}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

function DatoCopiable({ etiqueta, valor, onCopiar }: { etiqueta: string; valor: string; onCopiar: () => void }) {
  return (
    <div className="min-w-0">
      <p className="label-cayla text-[10px] text-tinta/55">{etiqueta}</p>
      <p className="mt-1 flex items-center gap-2 text-sm tabular-nums text-tinta">
        <span className="truncate">{valor}</span>
        <button type="button" onClick={onCopiar} aria-label={`Copiar ${etiqueta.toLowerCase()}`} className="shrink-0 text-tinta/55 transition-colors hover:text-rojo">
          <Copy aria-hidden className="h-3.5 w-3.5" />
        </button>
      </p>
    </div>
  );
}
