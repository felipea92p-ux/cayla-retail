"use client";

import { useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { Modal, botonCancelar, botonPrimario } from "@/components/ui/Modal";
import { CifraQueCuenta } from "@/components/ui/CifraQueCuenta";
import { Confirmacion, DatosDelProveedor, Tilde, type DatosPagoProveedor, type ResultadoPago } from "@/components/PagoPiezas";
import { Boton, CampoTexto } from "@/components/ui/campos";
import { CampoFecha } from "@/components/ui/CampoFecha";
import { LineasPago, lineaPagoVacia, lineasPagoParaRpc, sumaLineasPago, type LineaPago } from "@/components/LineasPago";
import { METODO_SALDO_A_FAVOR, soles, type CompraResumen } from "@/lib/compras-reglas";
import { hoyLima } from "@/lib/fechas-lima";
import { etiquetaVence, tramoDe } from "@/lib/por-pagar-reglas";

// Acciones sobre una factura ya registrada (ADR-0035): registrar un pago
// contra el saldo, o anularla. La página (server) dibuja el detalle; este
// componente solo pone los botones. Las reglas —el pago no supera el saldo,
// no se anula con pagos o mercadería recibida— las aplica la base; acá solo
// se evita mostrar un botón que va a fallar.
//
// "Registrar pago" NO abre el modal acá: lleva a Por pagar con `?pagar=<id>`
// y el modal se abre allá (`PagoDesdeUrl`). Pagar es una tarea de la
// pantalla de deudas —al terminar se quiere ver qué más se debe, no volver
// al detalle— y así el modal de pago tiene UN solo dueño en vez de abrirse
// encima del modal del detalle.
export function CompraAcciones({ compra, tieneRecepciones }: { compra: CompraResumen; tieneRecepciones: boolean }) {
  const router = useRouter();
  const [anulando, setAnulando] = useState(false);
  const puedeRecibir = compra.estado === "vigente" && compra.estadoRecepcion !== "recibida";
  const puedePagar = compra.estado === "vigente" && compra.saldo > 0;
  const puedeAnular = compra.estado === "vigente" && compra.pagado === 0 && !tieneRecepciones;

  if (!puedeRecibir && !puedePagar && !puedeAnular) return null;

  return (
    <>
      <div className="flex flex-wrap gap-3">
        {/* Atajo al pie, junto a Pagar/Anular — antes solo vivía como enlace
            de texto dentro de la sección "Recepciones", más abajo en la
            página: para una factura recién abierta (todo por recibir), esa
            era la acción más probable y quedaba fuera de la vista. */}
        {puedeRecibir && (
          <Boton peso="fantasma" onClick={() => router.push(`/compras/recibir?compra=${compra.id}`)}>
            Recibir mercadería
          </Boton>
        )}
        {puedePagar && (
          <Boton peso="primario" onClick={() => router.push(`/compras/por-pagar?pagar=${compra.id}`)}>
            Registrar pago · saldo {soles(compra.saldo)}
          </Boton>
        )}
        {puedeAnular && (
          <Boton peso="discreto" onClick={() => setAnulando(true)}>
            Anular comprobante
          </Boton>
        )}
      </div>
      {anulando && <AnularCompraModal compra={compra} onClose={() => setAnulando(false)} />}
    </>
  );
}

// Abre el modal de pago al llegar a Por pagar con `?pagar=<id>` (ver arriba).
// La página ya verificó que la factura existe, está vigente y tiene saldo.
// Al cerrar se quita solo `pagar` de la URL (con `replace`, para que "atrás"
// no vuelva a abrirlo) y se conservan los filtros que hubiera.
export function PagoDesdeUrl({ compra, saldoFavor = 0 }: { compra: CompraResumen; saldoFavor?: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  function cerrar() {
    const p = new URLSearchParams(params.toString());
    p.delete("pagar");
    router.replace(p.size ? `${pathname}?${p}` : pathname);
  }
  return <RegistrarPagoModal compra={compra} saldoFavor={saldoFavor} onClose={cerrar} />;
}

// Desde "Por pagar" se paga sin entrar al detalle: el botón de la fila abre
// EL MISMO modal (un pago sigue siendo contra una sola factura — solo se
// ahorra el clic de ir a verla). `compacto` es la versión que cabe en una
// celda de tabla: peso "fantasma" (borde y texto a tinta plena), no
// "discreto" — es la única acción de esa pantalla y no puede ser lo que
// menos se ve.
//
// `datos` (banco, cuenta, Yape del proveedor) y `onPagado` (Por pagar, 2026-09-19): con `datos` el modal muestra dónde se le
// paga, con copiar; con `onPagado` la pantalla que lo abrió hace reaccionar su lista (sello → pliegue → dato fresco) en vez
// de que el modal pida el refresh por su cuenta. Sin ellos —el detalle— todo sigue como antes.
export function BotonPagar({
  compra,
  compacto = false,
  saldoFavor = 0,
  datos,
  onPagado,
}: {
  compra: CompraResumen;
  compacto?: boolean;
  saldoFavor?: number;
  datos?: DatosPagoProveedor;
  onPagado?: (r: ResultadoPago) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  if (compra.estado !== "vigente" || compra.saldo <= 0) return null;
  return (
    <>
      <Boton
        type="button"
        peso={compacto ? "discreto" : "primario"}
        className={compacto ? "px-2.5 py-1.5 text-[11px]" : ""}
        onClick={() => setAbierto(true)}
      >
        {compacto ? "Pagar" : `Registrar pago · saldo ${soles(compra.saldo)}`}
      </Boton>
      {abierto && <RegistrarPagoModal compra={compra} saldoFavor={saldoFavor} datos={datos} onPagado={onPagado} onClose={() => setAbierto(false)} />}
    </>
  );
}

// Pago de UN comprobante (ADR-0035), con la misma cara que «Pagar juntos» (spike 2026-09-19, ADR-0129): cabecera con el proveedor,
// dónde se le paga (copiable), la CASCADA (cuánto del saldo cubre este pago) y el resumen que cuenta; al registrar, el modal se
// vuelve una confirmación y solo al cerrarla se avisa a quien lo abrió. Lo que NO cambia: un pago puede repartirse en varios medios
// (`LineasPago`, RPC `registrar_pagos_compra`, todo o nada) y el saldo a favor se ofrece como un medio más.
const BTN_CANCELAR = "label-cayla rounded-md border border-tinta/25 px-4 py-2.5 text-[11px] text-tinta transition-colors hover:border-rojo hover:text-rojo";

export function RegistrarPagoModal({
  compra,
  saldoFavor = 0,
  datos,
  onClose,
  onPagado,
}: {
  compra: CompraResumen;
  saldoFavor?: number;
  datos?: DatosPagoProveedor;
  onClose: () => void;
  /** Se llama al CERRAR la confirmación de un pago registrado. Sin esto el modal pide el refresh por su cuenta (el detalle). */
  onPagado?: (r: ResultadoPago) => void;
}) {
  const router = useRouter();
  // Un pago puede repartirse en varios medios (20260914200000_compras_multipago):
  // la RPC escribe todas las líneas o ninguna.
  const [lineas, setLineas] = useState<LineaPago[]>([lineaPagoVacia(compra.saldo.toFixed(2))]);
  const [fecha, setFecha] = useState(hoyLima());
  const [loading, setLoading] = useState(false);
  // Pago registrado: la confirmación reemplaza al formulario. El resultado va en una ref porque el cierre lo dispara `Modal`
  // (con su animación de salida) y ahí hay que saber si se cerró un pago o se canceló.
  const [hecho, setHecho] = useState<ResultadoPago | null>(null);
  const resultado = useRef<ResultadoPago | null>(null);
  const ahora = useMemo(() => new Date(), []);

  const suma = sumaLineasPago(lineas);
  const excede = suma > compra.saldo + 0.005;
  const favorUsado = sumaLineasPago(lineas.filter((l) => l.metodo === METODO_SALDO_A_FAVOR));
  const favorExcedido = favorUsado > saldoFavor + 0.005;
  const resta = Math.round((compra.saldo - suma) * 100) / 100;
  const llena = !excede && Math.abs(resta) < 0.005;
  const tramo = tramoDe(compra, ahora);
  const colorVence = tramo === "vencidas" ? "text-rojo" : tramo === "semana" ? "text-ambar-profundo" : "text-tinta/75";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    const pagos = lineasPagoParaRpc(lineas);
    const sinMonto = Math.max(0, lineas.findIndex((l) => !(Number(l.monto) > 0)));
    if (!pagos) return void avisar.error("Cada medio de pago necesita su monto.", { enfocar: `pago-monto-${sinMonto}` });
    if (excede) return void avisar.error(`El pago supera el saldo pendiente (${soles(compra.saldo)}).`, { enfocar: "pago-monto-0" });
    if (favorExcedido) return void avisar.error(`Usas ${soles(favorUsado)} de saldo a favor y solo tienes ${soles(saldoFavor)}.`, { enfocar: "pago-monto-0" });
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("registrar_pagos_compra", {
      p_compra_id: compra.id,
      p_pagos: pagos,
      p_fecha: fecha,
    });
    setLoading(false);
    if (error) {
      avisar.error(traducirError(error, "registrar el pago"));
      return;
    }
    avisar.exito(`Pago de ${soles(suma)} registrado · ${compra.documento}`, {
      detalle: `${resta > 0 ? `Quedan ${soles(resta)} por pagar.` : "Comprobante saldado."}${favorUsado > 0 ? ` Se descontaron ${soles(favorUsado)} de tu saldo a favor.` : ""}`,
    });
    const r: ResultadoPago = { pagadas: llena ? [compra.id] : [], parciales: llena ? [] : [compra.id], total: suma };
    resultado.current = r;
    setHecho(r);
  }

  // Cerrar: si hubo un pago, quien lo abrió reacciona (o, sin `onPagado`, se pide el dato fresco aquí, como siempre).
  function terminar() {
    const r = resultado.current;
    if (!r) return onClose();
    if (onPagado) {
      onClose();
      onPagado(r);
    } else {
      router.refresh();
      onClose();
    }
  }

  return (
    <Modal
      titulo={
        hecho ? (
          <span className="sr-only">Pago registrado</span>
        ) : (
          <>
            <span className="label-cayla mb-0.5 block text-[11px] text-tinta/65">Pagar a proveedor</span>
            <span className="block text-[28px] leading-tight">{compra.proveedorNombre}</span>
          </>
        )
      }
      subtitulo={hecho ? undefined : `1 comprobante · ${compra.documento}`}
      ancho="max-w-2xl"
      onClose={terminar}
    >
      {(cerrar) =>
        hecho ? (
          <Confirmacion
            hecho={hecho}
            proveedorNombre={compra.proveedorNombre}
            credito={favorUsado}
            filas={[{ documento: compra.documento, saldoFinal: Math.max(0, resta) }]}
            cerrar={cerrar}
          />
        ) : (
          <form onSubmit={onSubmit} className="space-y-5">
            <DatosDelProveedor datos={datos} />

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
                <div className="grid items-center gap-x-4 gap-y-1 px-5 py-3 sm:grid-cols-[1fr_9.5rem_7.5rem_8.5rem]">
                  <span className="text-sm tabular-nums text-tinta">{compra.documento}</span>
                  <span className={`text-sm ${colorVence}`}>{compra.fechaVencimiento ? etiquetaVence(compra.fechaVencimiento, ahora) : "Sin fecha"}</span>
                  <span className="text-sm tabular-nums text-tinta/75 sm:text-right">
                    <span className="text-xs text-tinta/55 sm:hidden">Saldo </span>
                    {compra.saldo.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                  <span className={`text-sm tabular-nums sm:text-right ${excede ? "text-rojo" : "text-tinta"}`}>
                    <span className="text-xs text-tinta/55 sm:hidden">Se paga </span>
                    <CifraQueCuenta valor={suma} formato="monto" />
                  </span>
                  {/* La cascada: cuánto del saldo cubre este pago. Verde = queda en cero; rojo = se pasa del saldo. */}
                  <div aria-hidden className="mt-1.5 h-1 overflow-hidden rounded-full bg-sand sm:col-span-3">
                    <div
                      className={`h-full origin-left rounded-full transition-[transform,background-color] duration-500 ease-cayla ${excede ? "bg-rojo" : llena ? "bg-verde" : "bg-tinta"}`}
                      style={{ transform: `scaleX(${compra.saldo > 0 ? Math.min(1, suma / compra.saldo) : 0})` }}
                    />
                  </div>
                  <span className={`mt-1 flex min-h-[18px] items-center gap-1.5 text-xs sm:col-start-4 sm:justify-end ${excede ? "text-rojo" : llena ? "text-verde-profundo" : "text-tinta/55"}`} aria-live="polite">
                    {excede ? (
                      "Supera el saldo"
                    ) : llena ? (
                      <>
                        <Tilde /> queda en cero
                      </>
                    ) : suma > 0 ? (
                      `quedan ${soles(resta)}`
                    ) : (
                      "no se paga ahora"
                    )}
                  </span>
                </div>
                <div className="grid items-center gap-x-4 bg-tinta/[0.04] px-5 py-3 sm:grid-cols-[1fr_auto]">
                  <span className="label-cayla text-[11px] text-tinta">Total del pago</span>
                  <span className="font-display text-right text-[22px] tabular-nums text-tinta">
                    <CifraQueCuenta valor={suma} formato="soles" />
                  </span>
                </div>
              </div>
            </section>

            {/* Primero cuándo, después con qué: la fecha es una sola para todo el pago; los medios pueden ser varios. */}
            <div className="w-full sm:w-44">
              <CampoFecha etiqueta="Fecha del pago" valor={fecha} onValor={setFecha} required />
            </div>
            <div className="space-y-3">
              <p className="label-cayla text-[11px] text-tinta/65">
                Medios de pago <span className="font-normal normal-case tracking-normal text-tinta/55">· uno o varios</span>
              </p>
              <LineasPago id="pago" lineas={lineas} onLineas={setLineas} objetivo={compra.saldo} exacto={false} autoFocus saldoFavor={saldoFavor} />
            </div>

            <div className="border-t border-tinta/10 pt-4">
              <p className="text-sm text-tinta">
                Pagarás <span className="font-display text-xl tabular-nums"><CifraQueCuenta valor={suma} formato="soles" /></span>
                {favorUsado > 0 && <span className="text-tinta/65"> (usando {soles(favorUsado)} de tu saldo a favor)</span>} ·{" "}
                {llena ? (
                  <>
                    quedará en cero <b className="font-semibold">1 comprobante</b>
                  </>
                ) : (
                  <>
                    quedarán <b className="font-semibold">{soles(Math.max(0, resta))}</b> por pagar
                  </>
                )}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-tinta/65">
                {lineas.length > 1 ? (
                  <>
                    Se registra como <b className="font-semibold">un solo pago repartido en {lineas.length} medios</b>: todos o ninguno.
                  </>
                ) : (
                  <>
                    Se registra como <b className="font-semibold">un solo pago</b>; el comprobante conserva su historial.
                  </>
                )}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 border-t border-tinta/10 pt-4">
              <p className="min-w-0 flex-1 text-xs text-tinta/55">Todo o nada: si el comprobante ya no admite el monto, no se registra.</p>
              <button type="button" onClick={cerrar} className={BTN_CANCELAR} disabled={loading}>
                Cancelar
              </button>
              <Boton type="submit" peso="primario" cargando={loading} disabled={loading || excede || favorExcedido}>
                {loading ? "Registrando…" : `Registrar pago de ${soles(suma)}`}
              </Boton>
            </div>
          </form>
        )
      }
    </Modal>
  );
}

function AnularCompraModal({ compra, onClose }: { compra: CompraResumen; onClose: () => void }) {
  const router = useRouter();
  const [motivo, setMotivo] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!motivo.trim()) return void avisar.error("Escribe por qué se anula.", { enfocar: "anular-motivo" });
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("anular_compra", { p_compra_id: compra.id, p_motivo: motivo.trim() });
    setLoading(false);
    if (error) {
      avisar.error(traducirError(error, "anular el comprobante"));
      return;
    }
    avisar.exito(`Comprobante ${compra.documento} anulado`, { detalle: "Deja de contar en Por pagar y en Recibir." });
    router.refresh();
    onClose();
  }

  return (
    <Modal titulo="Anular comprobante" subtitulo={`${compra.documento} · ${compra.proveedorNombre}`} onClose={onClose}>
      {(cerrar) => (
        <form onSubmit={onSubmit} className="space-y-4">
          <p className="text-sm text-tinta/75">
            El comprobante queda como anulado y deja de contar en Por pagar y en Recibir. No se borra: el registro se conserva con el motivo.
          </p>
          <CampoTexto etiqueta="Motivo" id="anular-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Se registró por error, el proveedor la reemplazó…" autoFocus />
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={cerrar} className={botonCancelar} disabled={loading}>
              Volver
            </button>
            <button type="submit" className={botonPrimario} disabled={loading}>
              {loading ? "Anulando…" : "Anular"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
