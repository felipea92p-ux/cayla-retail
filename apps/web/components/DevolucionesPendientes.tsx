"use client";

import { useState, type RefObject } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, Clock, Info, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { Chip } from "@/components/ui/Chip";
import { MiniaturaPrenda } from "@/components/ui/PrendaCelda";
import { formatearHora } from "@/components/ComprasAgrupadas";
import { BotonPrincipal, BotonRojo, BotonSecundario } from "@/components/FlujoGuiado";
import type { DevolucionPendiente } from "@/lib/devoluciones";
import { DIAS_PLAZO_CAMBIO, METODOS_DIFERENCIA, estadoPlazoCambio, etiquetaDia, varianteLegible } from "@/lib/cambios-reglas";
import { etiquetaCondicion, revisarAprobacion } from "@/lib/devoluciones-reglas";
import { soles } from "@/lib/compras-reglas";
import { codigoPrenda } from "@/lib/prenda-reglas";
import { ComboResponsable } from "@/components/ComboResponsable";
import { useResponsable } from "@/lib/useResponsable";
import { firmar } from "@/lib/responsable-reglas";
import { OpcionesCuenta, useCuentasParaElegir } from "@/components/finanzas/CampoCuenta";
import { ayudaCuenta, cuentaEfectiva, hayCuentasPara } from "@/lib/cuenta-sellada-reglas";

/**
 * «Por aprobar» (2026-09-18): las devoluciones que una colaboradora registró y un líder
 * todavía no resolvió. Un líder ve las acciones; quien no lo es ve que están esperando —
 * `aprobar_devolucion` y `rechazar_devolucion` exigen líder y lo vuelven a validar.
 *
 * Aprobar es lo que mueve las cosas (stock, nota de crédito, reembolso), así que la
 * tarjeta le pone delante al líder lo que necesita para decidir: qué prendas y en qué estado
 * vuelven, cuánto pagó la clienta, y si la compra ya venció el plazo (que no bloquea: lo
 * decide él). El reembolso es opcional y es la última opción (R-37).
 *
 * Aprobar y rechazar firman con el combo «Responsable» (ADR-0161): el permiso sigue siendo del líder (lo pregunta
 * la base a la cuenta), el combo solo dice quién de turno lo hizo. El combo vive en el panel que se abre al tocar
 * Aprobar/Rechazar, no en cada tarjeta, para no leer la asistencia una vez por devolución pendiente.
 */
export function DevolucionesPendientes({
  pendientes,
  esLider,
  cajaAbierta,
  ahora,
  refTitulo,
  ubicacionId,
  sede,
}: {
  pendientes: DevolucionPendiente[];
  esLider: boolean;
  cajaAbierta: boolean;
  ahora: Date;
  refTitulo: RefObject<HTMLHeadingElement | null>;
  /** La tienda de estas devoluciones: la lista de «De turno» del combo es la de aquí. */
  ubicacionId: string;
  sede: string;
}) {
  if (pendientes.length === 0) return null;
  return (
    <section aria-labelledby="por-aprobar" className="space-y-4">
      <div>
        <h2 id="por-aprobar" ref={refTitulo} tabIndex={-1} className="font-display scroll-mt-28 text-[30px] leading-none text-tinta outline-none">
          Por aprobar <span className="text-tinta/70">({pendientes.length})</span>
        </h2>
        <p className="mt-0.5 text-sm text-tinta/70">
          {esLider ? "Revisa cada una: al aprobarla se mueve el stock." : "Esperan que un líder las apruebe: hasta entonces el stock no cambia."}
        </p>
      </div>
      <div className="space-y-3">
        {pendientes.map((d) => (
          <TarjetaPendiente key={d.id} devolucion={d} esLider={esLider} cajaAbierta={cajaAbierta} ahora={ahora} ubicacion={{ ubicacionId, etiqueta: sede }} />
        ))}
      </div>
    </section>
  );
}

type Ubicacion = { ubicacionId: string; etiqueta: string };

function TarjetaPendiente({
  devolucion: d,
  esLider,
  cajaAbierta,
  ahora,
  ubicacion,
}: {
  devolucion: DevolucionPendiente;
  esLider: boolean;
  cajaAbierta: boolean;
  ahora: Date;
  ubicacion: Ubicacion;
}) {
  const [resolviendo, setResolviendo] = useState<"aprobar" | "rechazar" | null>(null);
  const plazo = estadoPlazoCambio(d.vendidoEn, ahora);

  return (
    // `anim-revelar` sin `key` extra: `key={d.id}` del `.map` ya hace que React reutilice la
    // tarjeta de una devolución que sigue pendiente tras un `router.refresh()` (no reanima) y
    // solo monte —y por lo tanto anime— la que recién se registró.
    <article className="anim-revelar rounded-xl bg-papel ring-1 ring-tinta/[0.07]">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-5 pt-4 text-[13px] text-tinta/70">
        <span className="font-semibold text-tinta">{d.comprobante ?? "Venta sin comprobante"}</span>
        <span>
          Pidió {d.solicitadoPorNombre} · {etiquetaDia(d.creadoEn, ahora).toLowerCase()} {formatearHora(d.creadoEn)}
        </span>
        {/* Siempre visible, para que quien aprueba vea de un vistazo si la compra está dentro del
            plazo (verde) o no (rojo). Fuera del plazo no bloquea: solo pide su decisión. */}
        {plazo.estado === "fuera_de_plazo" ? (
          <Chip tono="rojo" versalitas={false}>
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
            Compra hace {DIAS_PLAZO_CAMBIO - plazo.diasRestantes} días · fuera del plazo
          </Chip>
        ) : (
          <Chip tono="verde" versalitas={false}>
            <Clock className="h-3.5 w-3.5" aria-hidden />
            Dentro del plazo · {plazo.diasRestantes === 0 ? "hoy es el último día" : `quedan ${plazo.diasRestantes} día${plazo.diasRestantes === 1 ? "" : "s"}`}
          </Chip>
        )}
      </header>

      <ul className="space-y-1 px-2 pt-2">
        {d.items.map((i, n) => (
          <li key={n} className="flex flex-wrap items-center gap-3 rounded-lg px-3 py-2.5">
            <MiniaturaPrenda fotoUrl={i.fotoUrl} colorHex={i.colorHex} tamano="lg" />
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-semibold text-tinta">
                {i.referencia} <span className="font-normal text-tinta/70">× {i.cantidad}</span>
              </p>
              <p className="text-sm text-tinta/75">{varianteLegible(i)}</p>
              <p className="mt-0.5 text-xs text-tinta/70">
                <span className="font-mono">{codigoPrenda(i)}</span> · {soles(i.valorPagado)}
              </p>
            </div>
            <Chip tono={i.condicion === "vendible" ? "neutro" : "ambar"} versalitas={false}>
              {etiquetaCondicion(i.condicion)}
            </Chip>
          </li>
        ))}
      </ul>

      <div className="space-y-2 px-5 pb-4 pt-2 text-sm">
        <p className="text-tinta/80">
          <span className="font-semibold text-tinta">Motivo:</span> {d.motivo}
        </p>
        <p className="text-xs text-tinta/70">
          La clienta pagó {soles(d.valorPagado)} por esto.
          {d.comprobanteAceptado && " Al aprobarla se emite la nota de crédito."}
        </p>
      </div>

      {!resolviendo && (
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-tinta/[0.07] px-5 py-3.5">
          {esLider ? (
            <>
              <p className="text-xs text-tinta/70">Al aprobarla, las prendas vuelven al piso o entran a cuarentena.</p>
              <div className="flex items-center gap-2">
                <BotonSecundario onClick={() => setResolviendo("rechazar")}>Rechazar</BotonSecundario>
                <BotonPrincipal onClick={() => setResolviendo("aprobar")}>Aprobar</BotonPrincipal>
              </div>
            </>
          ) : (
            <Chip tono="ambar" versalitas={false}>
              <Clock className="h-3.5 w-3.5" aria-hidden />
              Esperando aprobación de un líder
            </Chip>
          )}
        </footer>
      )}

      {resolviendo && (
        <PanelResolver key={resolviendo} modo={resolviendo} devolucion={d} cajaAbierta={cajaAbierta} ubicacion={ubicacion} onCancelar={() => setResolviendo(null)} />
      )}
    </article>
  );
}

/**
 * Lo que se abre al tocar Aprobar o Rechazar: los datos de la decisión, el combo «Responsable» y el botón que guarda.
 * Se monta solo mientras está abierto, así que la lista de quién está de turno se lee solo entonces.
 */
function PanelResolver({
  modo,
  devolucion: d,
  cajaAbierta,
  ubicacion,
  onCancelar,
}: {
  modo: "aprobar" | "rechazar";
  devolucion: DevolucionPendiente;
  cajaAbierta: boolean;
  ubicacion: Ubicacion;
  onCancelar: () => void;
}) {
  const router = useRouter();
  const [monto, setMonto] = useState("");
  const [metodo, setMetodo] = useState<(typeof METODOS_DIFERENCIA)[number]["valor"]>("efectivo");
  const [motivoRechazo, setMotivoRechazo] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const responsable = useResponsable(ubicacion);
  // «Sale de» (ADR-0195 F3b, situación 9): en efectivo sale del cajón, como siempre; con otro medio, se propone la cuenta
  // de esa tienda para ese medio (la del Yape, la de las transferencias, el POS).
  const cuentas = useCuentasParaElegir("cobro", ubicacion.ubicacionId, modo === "aprobar");
  const [cuentaElegida, setCuentaElegida] = useState<string | null>(null);

  const montoNumero = monto.trim() === "" ? null : Number(monto);
  const hayReembolso = montoNumero !== null && montoNumero > 0;
  const conCuenta = hayReembolso && metodo !== "efectivo";
  const hayCuentas = cuentas.listo && hayCuentasPara(cuentas.cuentas, "cobro", metodo);
  const cuentaSale = conCuenta && hayCuentas ? cuentaEfectiva(cuentas.cuentas, "cobro", metodo, cuentaElegida) : null;
  const revision = revisarAprobacion({ monto: montoNumero, metodo, cajaAbierta, valorPagado: d.valorPagado });

  async function aprobar() {
    if (revision.bloqueo) return;
    if (!responsable.listo) {
      setError(responsable.motivo);
      return;
    }
    setCargando(true);
    setError(null);
    const { data, error: fallo } = await firmar(
      createClient().rpc("aprobar_devolucion", {
        p_devolucion_id: d.id,
        p_reembolso_monto: montoNumero && montoNumero > 0 ? montoNumero : undefined,
        p_reembolso_metodo: montoNumero && montoNumero > 0 ? metodo : undefined,
        p_reembolso_cuenta_id: cuentaSale ?? undefined,
      } as never),
      responsable.firma(),
    );
    setCargando(false);
    responsable.despues(fallo);
    if (fallo) {
      setError(traducirError(fallo, "aprobar la devolución"));
      return;
    }
    // Si la venta tenía un comprobante ya aceptado por SUNAT, aprobar_devolucion (ADR-0100)
    // emite la Nota de Crédito sola — nadie tiene que acordarse de ir a Facturación aparte.
    // `data` es una tabla vacía cuando no aplicaba.
    const nota = data?.[0];
    if (nota?.nota_credito_id) {
      avisar.exito("Devolución aprobada", {
        detalle: `Nota de crédito ${nota.nota_credito_serie}-${String(nota.nota_credito_numero).padStart(6, "0")} reservada — transmítela desde Facturación.`,
      });
    } else {
      avisar.exito("Devolución aprobada");
    }
    router.refresh();
  }

  async function rechazar() {
    if (!motivoRechazo.trim()) {
      setError("Escribe el motivo del rechazo.");
      return;
    }
    if (!responsable.listo) {
      setError(responsable.motivo);
      return;
    }
    setCargando(true);
    setError(null);
    const { error: fallo } = await firmar(
      createClient().rpc("rechazar_devolucion", { p_devolucion_id: d.id, p_motivo: motivoRechazo.trim() }),
      responsable.firma(),
    );
    setCargando(false);
    responsable.despues(fallo);
    if (fallo) {
      setError(traducirError(fallo, "rechazar la devolución"));
      return;
    }
    router.refresh();
  }

  function cancelar() {
    setError(null);
    onCancelar();
  }

  return (
    <>
      {modo === "aprobar" && (
        <div className="anim-revelar space-y-4 border-t border-tinta/[0.07] px-5 py-4">
          <div>
            <h3 className="text-sm font-semibold text-tinta">¿Se le reembolsa algo?</h3>
            <p className="mt-0.5 text-xs text-tinta/70">
              Opcional, y es la última opción: primero un cambio, después una nota de crédito. Déjalo vacío si no hay reembolso.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label htmlFor={`monto-${d.id}`} className="text-xs font-semibold text-tinta/70">
                Monto
              </label>
              <div className="mt-1 flex items-center gap-2">
                <input
                  id={`monto-${d.id}`}
                  type="number"
                  min={0}
                  step="0.01"
                  inputMode="decimal"
                  autoFocus
                  value={monto}
                  onChange={(e) => setMonto(e.target.value)}
                  placeholder="S/ 0.00"
                  className="h-10 w-36 rounded-lg border border-tinta/15 bg-papel px-3 text-sm tabular-nums text-tinta outline-none transition-colors duration-200 placeholder:text-tinta/55 focus:border-tinta"
                />
                <button
                  type="button"
                  onClick={() => setMonto(d.valorPagado.toFixed(2))}
                  className="h-10 rounded-lg px-3 text-sm font-medium text-tinta ring-1 ring-tinta/15 transition-colors duration-200 hover:bg-crema/70"
                >
                  Todo ({soles(d.valorPagado)})
                </button>
              </div>
            </div>
            {montoNumero !== null && montoNumero > 0 && (
              <div className="anim-revelar">
                <label htmlFor={`metodo-${d.id}`} className="text-xs font-semibold text-tinta/70">
                  ¿Cómo se le devuelve?
                </label>
                <select
                  id={`metodo-${d.id}`}
                  value={metodo}
                  onChange={(e) => setMetodo(e.target.value as typeof metodo)}
                  className="mt-1 h-10 rounded-lg border border-tinta/15 bg-papel px-3 text-sm text-tinta outline-none transition-colors duration-200 focus:border-tinta"
                >
                  {METODOS_DIFERENCIA.map((m) => (
                    <option key={m.valor} value={m.valor}>
                      {m.etiqueta}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {hayReembolso && (
              <div className="anim-revelar min-w-0 max-w-full flex-1 basis-[14rem]">
                <label htmlFor={`cuenta-${d.id}`} className="text-xs font-semibold text-tinta/70">
                  Sale de
                </label>
                <select
                  id={`cuenta-${d.id}`}
                  value={cuentaSale ?? ""}
                  disabled={!conCuenta || !hayCuentas}
                  onChange={(e) => setCuentaElegida(e.target.value)}
                  className="mt-1 h-10 w-full rounded-lg border border-tinta/15 bg-papel px-3 text-sm text-tinta outline-none transition-colors duration-200 focus:border-tinta disabled:text-tinta/55"
                >
                  {!conCuenta ? (
                    <option value="">El cajón de la tienda</option>
                  ) : hayCuentas ? (
                    <OpcionesCuenta cuentas={cuentas.cuentas} clase="cobro" medio={metodo} />
                  ) : (
                    <option value="">{cuentas.listo ? "Sin cuenta configurada para este medio" : "…"}</option>
                  )}
                </select>
              </div>
            )}
          </div>
          {hayReembolso && (
            <p className="-mt-2 text-xs text-tinta/70">
              {!conCuenta
                ? "En efectivo sale del cajón y resta del cierre, como siempre."
                : hayCuentas
                ? ayudaCuenta(cuentas.cuentas.find((c) => c.id === cuentaSale) ?? null, "sale")
                : "Queda «sin cuenta» hasta que el líder la configure; el reembolso se registra igual."}
            </p>
          )}

          {revision.bloqueo && (
            <p className="flex items-start gap-1.5 text-sm text-ambar-profundo" role="alert">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              {revision.bloqueo}
            </p>
          )}
          {revision.aviso && (
            <p className="flex items-start gap-1.5 text-sm text-ambar-profundo" role="status">
              <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              {revision.aviso}
            </p>
          )}
          {error && (
            <p className="flex items-start gap-1.5 text-sm text-rojo-profundo" role="alert">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              {error}
            </p>
          )}

          <ComboResponsable control={responsable} deshabilitado={cargando} className="max-w-sm" />
          <div className="flex flex-wrap items-center justify-end gap-2">
            <BotonSecundario onClick={cancelar} disabled={cargando}>
              Cancelar
            </BotonSecundario>
            <BotonRojo onClick={aprobar} disabled={cargando || !!revision.bloqueo || !responsable.listo}>
              {cargando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />}
              {cargando ? "Aprobando…" : "Aprobar devolución"}
            </BotonRojo>
          </div>
        </div>
      )}

      {modo === "rechazar" && (
        <div className="anim-revelar space-y-4 border-t border-tinta/[0.07] px-5 py-4">
          <div>
            <label htmlFor={`rechazo-${d.id}`} className="text-sm font-semibold text-tinta">
              ¿Por qué se rechaza?
            </label>
            <p className="mt-0.5 text-xs text-tinta/70">Queda escrito en la devolución. El stock no cambia.</p>
            <input
              id={`rechazo-${d.id}`}
              type="text"
              autoFocus
              value={motivoRechazo}
              onChange={(e) => setMotivoRechazo(e.target.value)}
              className="mt-2 h-10 w-full max-w-lg rounded-lg border border-tinta/15 bg-papel px-3 text-sm text-tinta outline-none transition-colors duration-200 focus:border-tinta"
            />
          </div>
          {error && (
            <p className="flex items-start gap-1.5 text-sm text-rojo-profundo" role="alert">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              {error}
            </p>
          )}
          <ComboResponsable control={responsable} deshabilitado={cargando} className="max-w-sm" />
          <div className="flex flex-wrap items-center justify-end gap-2">
            <BotonSecundario onClick={cancelar} disabled={cargando}>
              Cancelar
            </BotonSecundario>
            <BotonPrincipal onClick={rechazar} disabled={cargando || !responsable.listo}>
              {cargando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              {cargando ? "Rechazando…" : "Rechazar devolución"}
            </BotonPrincipal>
          </div>
        </div>
      )}
    </>
  );
}
