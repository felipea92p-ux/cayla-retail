"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Receipt, Search, ShieldCheck, ShoppingBag, Trash2, Wallet } from "lucide-react";
import { METODOS_PAGO, type MetodoPago } from "@cayla-retail/shared";
import { money, type VarianteBusqueda } from "@/components/PuntoDeVenta";
import { ICONO_METODO } from "@/components/PuntoDeVentaTicket";
import { BilleteRapido } from "@/components/BilleteRapido";
import { CampoMonto } from "@/components/ui/CampoMonto";
import { avisar } from "@/components/ui/Avisos";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { NOMBRE_METODO } from "@/lib/recibo-reglas";
import { cobroDelSaldo, coincide, diasEntre, estadoVisible, formatoCelular, pagosParaRpcApartado, type Apartado, type PagoAdelanto } from "@/lib/separaciones-reglas";
import { EstadoChip, FotoPrenda, fechaCorta } from "@/components/apartados/piezas";
import { ApartadoEntregadoModal } from "@/components/apartados/ModalesApartado";
import { ComboResponsable } from "@/components/ComboResponsable";
import { useResponsable } from "@/lib/useResponsable";
import { firmar } from "@/lib/responsable-reglas";

const OPCION_INACTIVA = "text-tinta/60 hover:bg-papel/60";
const BOTON_PRINCIPAL =
  "alza-cayla flex h-14 w-full items-center justify-between rounded-md bg-tinta px-5 text-crema hover:bg-rojo disabled:opacity-50 disabled:hover:bg-tinta";
const BILLETES = [10, 20, 50, 100, 200];

const iniciales = (a: Apartado) => `${a.nombres[0] ?? ""}${a.apellidos[0] ?? ""}`.toUpperCase();

export function EntregarVista({
  ubicacionId,
  ubicacionEtiqueta,
  hoy,
  cajaAbierta,
  apartados,
  prendas,
  elegido,
  onElegir,
}: {
  ubicacionId: string;
  ubicacionEtiqueta: string;
  hoy: string;
  cajaAbierta: boolean;
  apartados: Apartado[];
  prendas: VarianteBusqueda[];
  elegido: string | null;
  onElegir: (id: string | null) => void;
}) {
  const router = useRouter();
  const fotos = useMemo(() => new Map(prendas.map((p) => [p.varianteId, p.fotoUrl])), [prendas]);
  const [texto, setTexto] = useState("");
  const [pagos, setPagos] = useState<PagoAdelanto[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [entregado, setEntregado] = useState<{ apartado: Apartado; pagadoHoy: { metodo: string; monto: number }[]; vuelto: number } | null>(null);
  const token = useRef<string>(crypto.randomUUID());
  // Entregar guarda en la tienda (cobra el saldo y cierra la venta): pide Responsable (ADR-0161), vacío en cada entrega
  // (módulo Punto de venta: no propone a quien inició sesión).
  const responsable = useResponsable({ ubicacionId, etiqueta: ubicacionEtiqueta }, { proponerSesion: false });

  /** Cambiar de clienta es otra operación: el combo vuelve a vacío. */
  function elegir(id: string | null) {
    responsable.limpiar();
    onElegir(id);
  }

  const abiertos = apartados.filter((a) => a.estado === "abierta");
  const encontrados = abiertos.filter((a) => coincide(a, texto)).sort((x, y) => x.venceEl.localeCompare(y.venceEl));
  const a = elegido ? abiertos.find((x) => x.id === elegido) ?? null : null;
  const saldo = a ? a.saldo : 0;
  const cobro = cobroDelSaldo(pagos, saldo);
  const efectivo = pagos.find((p) => p.metodo === "efectivo");

  function tocarMedio(m: MetodoPago) {
    setPagos((ps) => {
      const i = ps.findIndex((p) => p.metodo === m);
      if (i >= 0) return ps.filter((_, j) => j !== i);
      const puesto = ps.reduce((s, p) => s + p.monto, 0);
      return [...ps, { metodo: m, monto: Math.max(0, Math.round((saldo - puesto) * 100) / 100) }];
    });
  }

  async function entregar() {
    if (!a || !cobro.listo || !cajaAbierta || !responsable.listo) return;
    setEnviando(true);
    const { error } = await firmar(
      createClient().rpc("entregar_separacion", {
        p_separacion_id: a.id,
        p_pagos: pagosParaRpcApartado(pagos),
        p_token: token.current,
      }),
      responsable.firma(),
    );
    setEnviando(false);
    // Éxito → el combo vuelve a vacío; rechazo por el responsable (marcó salida) → vacía y relee la lista.
    responsable.despues(error);
    if (error) {
      avisar.error(traducirError(error, "entregar el apartado", { confirmarAntesDeRepetir: true }));
      return;
    }
    token.current = crypto.randomUUID();
    const pagadoHoy = pagos.map((p) => ({ metodo: NOMBRE_METODO[p.metodo] ?? p.metodo, monto: p.monto }));
    setEntregado({ apartado: a, pagadoHoy, vuelto: cobro.vuelto });
    avisar.exito(`Venta de ${money(a.total)} registrada`, { detalle: `Apartado ${a.codigo} entregado` });
    setPagos([]);
    elegir(null);
    setTexto("");
    router.refresh();
  }

  return (
    <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_420px]">
      <div className="flex min-w-0 flex-col gap-4 border-b border-sand p-5 sm:p-6 lg:border-r lg:border-b-0">
        <label className="flex h-14 items-center gap-3 rounded-xl border border-sand bg-papel px-4 focus-within:border-taupe">
          <Search className="h-5 w-5 shrink-0 text-tinta/60" aria-hidden />
          <input
            autoFocus
            value={texto}
            onChange={(e) => {
              setTexto(e.target.value);
              elegir(null);
              setPagos([]);
            }}
            placeholder="Nombre, DNI, celular o N.º de boleta de la clienta"
            aria-label="Buscar apartado"
            className="min-w-0 flex-1 bg-transparent text-base text-tinta outline-none placeholder:text-tinta/40"
          />
        </label>

        {a ? (
          <article className="anim-revelar space-y-4 rounded-2xl border border-sand p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-center gap-3.5">
                <span className="font-display grid h-12 w-12 place-items-center rounded-full bg-sand/70 text-lg text-tinta">{iniciales(a)}</span>
                <div>
                  <p className="font-display text-2xl leading-tight text-tinta">{a.nombres} {a.apellidos}</p>
                  <p className="text-[12.5px] text-tinta/60 tabular-nums">
                    {formatoCelular(a.celular)}
                    {a.dni && ` · DNI ${a.dni}`}
                    {a.asesora && ` · atendió ${a.asesora}`}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <EstadoChip {...estadoVisible(a, hoy)} />
                <p className="mt-1 font-mono text-[11px] text-tinta/55">{a.codigo} · {a.comprobanteAnticipo}</p>
                <button type="button" onClick={() => elegir(null)} className="label-cayla mt-1 h-7 rounded-md px-2 text-[10.5px] text-tinta/70 hover:bg-sand/40">
                  Otra clienta
                </button>
              </div>
            </div>
            <LineaDeTiempo creadaEl={a.creadaEn.slice(0, 10)} hoy={hoy} venceEl={a.venceEl} />
            <ul className="divide-y divide-sand border-t border-sand">
              {a.prendas.map((pr) => (
                <li key={pr.varianteId} className="flex items-center gap-3 py-2.5">
                  <FotoPrenda fotoUrl={fotos.get(pr.varianteId)} referencia={pr.referencia} ancho={44} className="w-11" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-tinta">{pr.referencia}</p>
                    <p className="font-mono text-[11px] text-tinta/55">{pr.sku} · {pr.cantidad} u.</p>
                  </div>
                  <span className="text-sm font-semibold tabular-nums">{money((pr.precioUnitario - pr.descuentoUnitario) * pr.cantidad)}</span>
                </li>
              ))}
            </ul>
            <p className="flex items-start gap-2 rounded-xl border border-sand bg-crema px-3 py-2.5 text-[12.5px] text-tinta/80">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              Antes de entregar: la prenda está en «Apartados» con la etiqueta {a.codigo} y el DNI o la boleta de la clienta coinciden.
            </p>
          </article>
        ) : (
          <>
            <p className="label-cayla text-[11px] text-tinta/60">{texto ? "Coinciden" : `Por recoger en ${ubicacionEtiqueta}`} · {encontrados.length}</p>
            {encontrados.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-sand px-6 py-10 text-center">
                <p className="font-display text-xl text-tinta">{texto ? `Nadie con «${texto}»` : "No hay apartados por recoger"}</p>
                {texto && <p className="mt-1 text-sm text-tinta/60">Si ya venció y se liberó, está en «Todos».</p>}
              </div>
            ) : (
              <ul className="space-y-2">
                {encontrados.map((x) => (
                  <li key={x.id}>
                    <button type="button" onClick={() => elegir(x.id)} className="anim-revelar grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-sand bg-papel px-4 py-3 text-left hover:border-taupe">
                      <span className="font-display grid h-9 w-9 place-items-center rounded-full bg-sand/70 text-sm">{iniciales(x)}</span>
                      <span className="min-w-0">
                        <b className="font-semibold">{x.nombres} {x.apellidos}</b> <span className="font-mono text-[11px] text-tinta/55">{x.codigo}</span>
                        <span className="block truncate text-[12.5px] text-tinta/60">{x.prendas.map((pr) => `${pr.referencia} ${pr.sku}`).join(" · ")}</span>
                      </span>
                      <span className="text-right">
                        <EstadoChip {...estadoVisible(x, hoy)} />
                        <span className="block text-[13px] tabular-nums">saldo <b>{money(x.saldo)}</b></span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      <aside className="flex min-h-0 flex-col">
        <div className="flex min-h-[84px] items-center justify-between gap-3 border-b border-sand px-5 py-5">
          <h2 className="font-display flex items-center gap-2.5 text-2xl leading-none text-tinta">
            <Wallet className="h-6 w-6 text-tinta/70" aria-hidden /> Saldo
          </h2>
          {a && <span className="font-mono text-xs text-tinta/60">{a.codigo}</span>}
        </div>
        {!a ? (
          <div className="flex flex-1 items-center justify-center px-6 py-10 text-center">
            <div>
              <p className="font-display text-xl text-tinta">Elige un apartado</p>
              <p className="mx-auto mt-1 max-w-[30ch] text-sm text-tinta/60">Sus datos ya están: aquí solo se cobra lo que falta.</p>
            </div>
          </div>
        ) : (
          <>
            <div className="scroll-cayla min-h-40 flex-1 overflow-y-auto">
              <div className="anim-revelar space-y-5 px-5 py-4">
                <div className="space-y-1.5 rounded-xl border border-sand bg-crema p-4 text-[12.5px] text-tinta/75 tabular-nums">
                  <p className="flex justify-between"><span>Total de las prendas</span><span>{money(a.total)}</span></p>
                  {a.pagos.map((p, i) => (
                    <p key={i} className="flex justify-between"><span>Adelantó con {NOMBRE_METODO[p.metodo] ?? p.metodo} · {fechaCorta(a.creadaEn)}</span><span>−{money(p.monto)}</span></p>
                  ))}
                  <p className="flex justify-between border-t border-sand pt-2 text-sm text-tinta"><span>Falta pagar</span><b>{money(saldo)}</b></p>
                </div>
                {saldo > 0 && (
                  <fieldset className="space-y-2">
                    <legend className="mb-2 text-[11px] text-tinta/50">Cómo paga el saldo</legend>
                    <div className="grid grid-cols-5 gap-1 rounded-xl bg-sand/50 p-1">
                      {METODOS_PAGO.map((m, i) => {
                        const puesto = pagos.some((p) => p.metodo === m);
                        return (
                          <button key={m} type="button" aria-pressed={puesto} title={`${m} (F${i + 1})`} onClick={() => tocarMedio(m)} style={puesto ? { backgroundColor: "var(--ct)", color: "var(--cd)" } : undefined} className={`metodo-${m} relative flex h-14 flex-col items-center justify-center gap-1 rounded-lg px-1 text-[10px] capitalize transition-colors ${puesto ? "anim-pop shadow-sm" : OPCION_INACTIVA}`}>
                            <span aria-hidden className="absolute top-0.5 right-1 text-[8px] font-semibold opacity-45">F{i + 1}</span>
                            {ICONO_METODO[m]}
                            {m}
                          </button>
                        );
                      })}
                    </div>
                    {pagos.length > 0 && (
                      <div className="anim-revelar divide-y divide-sand rounded-lg border border-sand bg-crema">
                        {pagos.map((pg, i) => (
                          <div key={pg.metodo} className="flex items-center gap-3 px-3 py-2">
                            <span className={`metodo-${pg.metodo} flex flex-1 items-center gap-2 text-sm capitalize`} style={{ color: "var(--cd)" }}>
                              {ICONO_METODO[pg.metodo]} {pg.metodo}
                            </span>
                            <span className="flex items-center gap-1 border-b border-tinta/20 text-sm">
                              <span className="text-tinta/50">S/</span>
                              <CampoMonto aria-label={`Monto en ${pg.metodo}`} valor={pg.monto} onCambio={(v) => setPagos((ps) => ps.map((y, j) => (j === i ? { ...y, monto: v } : y)))} className="w-20 bg-transparent py-1 text-right tabular-nums outline-none" />
                            </span>
                            <button type="button" aria-label={`Quitar ${pg.metodo}`} onClick={() => setPagos((ps) => ps.filter((_, j) => j !== i))} className="p-1 text-rojo-profundo">
                              <Trash2 className="h-3.5 w-3.5" aria-hidden />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    {efectivo && (
                      <div className="space-y-2">
                        <p className="text-[11px] text-tinta/55">Con cuánto paga en efectivo (toca los billetes)</p>
                        <div className="flex flex-wrap gap-1.5">
                          {BILLETES.map((b) => (
                            <BilleteRapido key={b} valor={b} onSumar={() => setPagos((ps) => ps.map((y) => (y.metodo === "efectivo" ? { ...y, recibido: (y.recibido ?? 0) + b } : y)))} />
                          ))}
                          {efectivo.recibido !== undefined && (
                            <button type="button" onClick={() => setPagos((ps) => ps.map((y) => (y.metodo === "efectivo" ? { ...y, recibido: undefined } : y)))} className="text-xs text-tinta/60 underline">
                              Borrar ({money(efectivo.recibido)})
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                    {cobro.excede && <p className="text-xs text-rojo-profundo">Con esos medios no hay vuelto: cobra justo {money(saldo)}.</p>}
                    {cobro.falta > 0 && pagos.length > 0 && <p className="text-xs text-rojo-profundo tabular-nums">Falta {money(cobro.falta)}</p>}
                    {efectivo?.recibido !== undefined && efectivo.recibido < efectivo.monto && <p className="text-xs text-rojo-profundo">Lo recibido no alcanza.</p>}
                  </fieldset>
                )}
                {cobro.vuelto > 0 && (
                  <div className="anim-revelar flex items-baseline justify-between rounded-xl border border-tinta/15 bg-papel px-4 py-2.5">
                    <span className="label-cayla text-[11px] text-tinta/70">Entregar vuelto</span>
                    <span className="font-display text-2xl tabular-nums">{money(cobro.vuelto)}</span>
                  </div>
                )}
                <p className="flex items-start gap-1.5 text-xs text-tinta/60">
                  <Receipt className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                  {saldo > 0 ? `Sale la boleta final por el saldo, que descuenta el anticipo ${a.comprobanteAnticipo}.` : "Pagó todo al apartar: se entrega sin cobrar nada más."} No se piden datos otra vez.
                </p>
              </div>
            </div>
            <div className="space-y-3 border-t border-sand px-5 py-5">
              <div className="flex items-end justify-between gap-3">
                <dl className="grid grid-cols-[auto_auto] gap-x-3 text-[12.5px] text-tinta/60 tabular-nums">
                  <dt>Total</dt><dd className="text-tinta">{money(a.total)}</dd>
                  <dt>Ya pagó</dt><dd className="text-tinta">−{money(a.adelanto)}</dd>
                </dl>
                <div className="text-right">
                  <p className="label-cayla text-[11px] text-tinta/60">Saldo</p>
                  <p className="font-display text-[44px] leading-none text-tinta tabular-nums">{money(saldo)}</p>
                </div>
              </div>
              {/* El combo «Responsable» (ADR-0161), justo encima del botón que guarda, como en Cobrar; se abre hacia arriba. */}
              {cajaAbierta && <ComboResponsable control={responsable} hacia="arriba" deshabilitado={enviando} />}
              <button
                type="button"
                disabled={enviando || !cobro.listo || !cajaAbierta || !responsable.listo || (efectivo?.recibido !== undefined && efectivo.recibido < efectivo.monto)}
                title={cajaAbierta ? (responsable.motivo ?? undefined) : undefined}
                onClick={entregar}
                className={BOTON_PRINCIPAL}
              >
                <span className="label-cayla flex items-center gap-2.5 text-[11px]"><ShoppingBag className="h-4 w-4" aria-hidden /> {enviando ? "Guardando…" : "Entregar y cobrar"}</span>
                <span className="font-display text-xl tabular-nums">{money(saldo)}</span>
              </button>
              <p className="text-center text-xs text-tinta/55">{!cajaAbierta ? "Abre la caja para poder entregar." : !cobro.listo ? "Elige cómo paga el saldo." : (responsable.motivo ?? "Listo: entrega la prenda y la boleta.")}</p>
            </div>
          </>
        )}
      </aside>

      {entregado && <ApartadoEntregadoModal apartado={entregado.apartado} pagadoHoy={entregado.pagadoHoy} vuelto={entregado.vuelto} sede={ubicacionEtiqueta} onClose={() => setEntregado(null)} />}
    </div>
  );
}

function LineaDeTiempo({ creadaEl, hoy, venceEl }: { creadaEl: string; hoy: string; venceEl: string }) {
  const total = Math.max(1, diasEntre(creadaEl, venceEl));
  const pasados = Math.min(total, Math.max(0, diasEntre(creadaEl, hoy)));
  return (
    <div className="relative grid grid-cols-3 pt-5 text-xs text-tinta/60">
      <span aria-hidden className="absolute top-[7px] right-2 left-2 h-0.5 bg-sand" />
      <span aria-hidden className="absolute top-[7px] left-2 h-0.5 bg-tinta transition-[width] duration-500" style={{ width: `calc(${(pasados / total) * 100}% - 1rem)` }} />
      {[
        { t: "Apartó", f: creadaEl, cls: "", punto: "left-0 bg-papel border-tinta" },
        { t: "Hoy", f: hoy, cls: "text-center", punto: "left-1/2 -translate-x-1/2 bg-tinta border-tinta" },
        { t: "Vence", f: venceEl, cls: "text-right", punto: "right-0 bg-papel border-rojo" },
      ].map((h) => (
        <div key={h.t} className={`relative ${h.cls}`}>
          <span aria-hidden className={`absolute -top-[21px] h-2.5 w-2.5 rounded-full border-2 ${h.punto}`} />
          <b className="block font-semibold text-tinta">{h.t}</b>
          {fechaCorta(h.f)}
        </div>
      ))}
    </div>
  );
}
