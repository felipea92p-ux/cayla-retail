"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, MessageCircle, Minus, Plus, Printer, Search, Trash2 } from "lucide-react";
import { METODOS_PAGO, type MetodoPago } from "@cayla-retail/shared";
import { CampoMonto } from "@/components/ui/CampoMonto";
import { codigoPrenda } from "@/lib/prenda-reglas";
import { descuentoDeCampana } from "@/lib/vender-reglas";
import type { PrendaApartable } from "@/components/apartados/ApartarVista";
import { Modal, botonCancelar, botonPrimario, campoEtiqueta, campoTexto } from "@/components/ui/Modal";
import { avisar } from "@/components/ui/Avisos";
import { money } from "@/components/PuntoDeVenta";
import { ICONO_METODO } from "@/components/PuntoDeVentaTicket";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import {
  AVISO_DIAS,
  EXTENSIONES_MAX,
  FUNCIONES_APARTADOS,
  PRESETS_APARTADOS,
  diasEsperaPorAbono,
  presetDe,
  type FuncionApartados,
  PLAZO_DIAS,
  enlaceWhatsapp,
  estadoVisible,
  formatoCelular,
  mensajeWhatsapp,
  soloDigitos,
  sumarDiasIso,
  textoDevolucion,
  type Apartado,
  type MedioDevolucionReal,
} from "@/lib/separaciones-reglas";
import { NOMBRE_METODO } from "@/lib/recibo-reglas";
import { EstadoChip, FotoPrenda, ReciboApartado, fechaCorta } from "@/components/apartados/piezas";
import { ComboResponsable } from "@/components/ComboResponsable";
import { useResponsable } from "@/lib/useResponsable";
import { firmar } from "@/lib/responsable-reglas";
import { useCuentasParaElegir } from "@/components/finanzas/CampoCuenta";
import { ayudaCuenta, cuentaEfectiva, hayCuentasPara, opcionesDeCuenta } from "@/lib/cuenta-sellada-reglas";
import { CampoSelect } from "@/components/ui/campos";

/** La tienda del apartado: el combo «Responsable» lista a quien está de turno AHÍ, no en otra sede activa. */
export type UbicacionApartado = { ubicacionId: string; etiqueta: string };

/** Imprime y cierra cuando el navegador avisa que terminó (mismo criterio que «Venta registrada»). */
function imprimirYSeguir(cerrar: () => void) {
  let hecho = false;
  const terminar = () => {
    if (hecho) return;
    hecho = true;
    window.removeEventListener("afterprint", terminar);
    clearTimeout(respaldo);
    cerrar();
  };
  window.addEventListener("afterprint", terminar);
  const respaldo = setTimeout(terminar, 4000);
  window.print();
}

/** Los botones van en un pie pegado al fondo de la hoja: con la pantalla baja (captura de Felipe, 2026-09-26) quedaban
 *  debajo del borde y «Solo imprimir / Sin imprimir» se cortaban. `-bottom-6`/`-mx-6` compensan el `p-6` de `<Modal>`. */
function Botones({ cerrar, principal }: { cerrar: () => void; principal: string }) {
  return (
    <div className="sticky -bottom-6 z-10 -mx-6 -mb-6 space-y-2 border-t border-sand bg-crema px-6 pt-3 pb-6">
      <button type="button" autoFocus onClick={() => imprimirYSeguir(cerrar)} className={`${botonPrimario} flex w-full items-center justify-center gap-2`}>
        <Printer className="h-4 w-4" aria-hidden />
        {principal}
      </button>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => window.print()} className={botonCancelar}>
          Solo imprimir
        </button>
        <button type="button" onClick={cerrar} className={botonCancelar}>
          Sin imprimir
        </button>
      </div>
      <p className="text-center text-[11px] text-tinta/55">Enter imprime · Esc sigue sin imprimir</p>
    </div>
  );
}

/** «Apartado registrado»: la forma de «Venta registrada» más lo propio de apartar — la fecha límite y lo que hay que
 *  hacer con la prenda en la mano. */
export function ApartadoRegistradoModal({ apartado, vuelto, sede, onClose }: { apartado: Apartado; vuelto: number; sede: string; onClose: () => void }) {
  const a = apartado;
  const [hechos, setHechos] = useState<boolean[]>([false, false, false]);
  const pasos = [
    `Pega la etiqueta «APARTADO · ${a.codigo}» en la prenda.`,
    a.estante ? `Guárdala en el estante ${a.estante} de Apartados, no en el piso.` : "Guárdala en «Apartados» del almacén, no en el piso.",
    `Envía la boleta por WhatsApp al ${a.celular}.`,
  ];
  const [mes, dia, semana] = [
    new Date(`${a.venceEl}T12:00:00Z`).toLocaleDateString("es-PE", { month: "short", timeZone: "UTC" }).replace(".", "").toUpperCase(),
    Number(a.venceEl.slice(8, 10)),
    new Date(`${a.venceEl}T12:00:00Z`).toLocaleDateString("es-PE", { weekday: "short", timeZone: "UTC" }).replace(".", ""),
  ];
  return (
    <Modal titulo="Apartado registrado" subtitulo={`${sede} · ${a.codigo}`} onClose={onClose} ancho="max-w-md">
      {(cerrar) => (
        <div className="space-y-4">
          <div className="card-cayla p-5 text-center">
            <p className="label-cayla text-[11px] text-verde-profundo">Listo</p>
            <p className="font-display mt-2 text-3xl text-tinta">{money(a.adelanto)}</p>
            <p className="mt-1 text-sm text-tinta/70">
              adelanto de {money(a.total)} · saldo {money(a.total - a.adelanto)}
            </p>
          </div>
          {vuelto > 0 && (
            <div className="flex items-baseline justify-between rounded-xl border border-tinta/15 bg-papel px-4 py-3">
              <span className="label-cayla text-[11px] text-tinta/70">Entregar vuelto</span>
              <span className="font-display text-3xl text-tinta">{money(vuelto)}</span>
            </div>
          )}
          <div className="card-cayla flex items-center gap-4 p-4">
            <div className="w-14 shrink-0 overflow-hidden rounded-lg border border-sand bg-papel text-center">
              <p className="bg-rojo py-0.5 text-[10px] font-semibold tracking-[0.14em] text-papel">{mes}</p>
              <p className="font-display text-3xl leading-tight text-tinta">{dia}</p>
              <p className="pb-1 text-[10px] text-tinta/60">{semana}</p>
            </div>
            <div className="min-w-0 flex-1">
              <p className="label-cayla text-[11px] text-tinta/60">Recoger hasta</p>
              <p className="text-sm text-tinta">
                {fechaCorta(a.venceEl)} · {PLAZO_DIAS} días
              </p>
              <div aria-hidden className="mt-2 grid grid-cols-7 gap-0.5">
                {Array.from({ length: PLAZO_DIAS }, (_, i) => (
                  <span key={i} className={`h-1 rounded-sm ${i === 0 ? "bg-tinta" : i === PLAZO_DIAS - 1 ? "bg-rojo" : "bg-sand"}`} />
                ))}
              </div>
              <p className="mt-1.5 text-[11.5px] text-tinta/60">El aviso para escribirle sale el {fechaCorta(sumarDiasIso(a.venceEl, -AVISO_DIAS))}.</p>
            </div>
          </div>
          <div className="card-cayla space-y-2.5 p-4 text-sm">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-tinta">
                Boleta <span className="font-mono">{a.comprobanteAnticipo}</span> · anticipo
              </span>
              <span className="text-[11px] text-tinta/60">Pendiente de enviar</span>
            </div>
            <div className="space-y-0.5 border-t border-sand pt-2.5 text-xs text-tinta/80">
              {a.pagos.map((p, i) => (
                <p key={i} className="flex justify-between tabular-nums">
                  <span>{NOMBRE_METODO[p.metodo] ?? p.metodo}</span>
                  <span>{money(p.monto)}</span>
                </p>
              ))}
            </div>
            <p className="border-t border-sand pt-2.5 text-xs text-tinta/70">
              Clienta: <span className="text-tinta">{a.nombres} {a.apellidos}</span> · si no recoge: {textoDevolucion(a)}
            </p>
          </div>
          <fieldset className="card-cayla space-y-2 p-4">
            <legend className="sr-only">Con la prenda en la mano</legend>
            <p className="label-cayla text-[11px] text-tinta/60">Ahora, con la prenda en la mano</p>
            {pasos.map((t, i) => (
              <label key={i} className="flex cursor-pointer items-start gap-2.5 text-sm">
                <input type="checkbox" checked={hechos[i]} onChange={(e) => setHechos((h) => h.map((x, j) => (j === i ? e.target.checked : x)))} className="mt-1 accent-tinta" />
                <span className={hechos[i] ? "text-tinta/50 line-through" : "text-tinta"}>{t}</span>
              </label>
            ))}
          </fieldset>
          <Botones cerrar={cerrar} principal="Imprimir y nuevo apartado" />
          <ReciboApartado apartado={a} tipo="anticipo" sede={sede} />
        </div>
      )}
    </Modal>
  );
}

export function ApartadoEntregadoModal({ apartado, pagadoHoy, vuelto, sede, onClose }: { apartado: Apartado; pagadoHoy: { metodo: string; monto: number }[]; vuelto: number; sede: string; onClose: () => void }) {
  const a = apartado;
  return (
    <Modal titulo="Apartado entregado" subtitulo={`${sede} · ${a.codigo}`} onClose={onClose} ancho="max-w-md">
      {(cerrar) => (
        <div className="space-y-4">
          <div className="card-cayla p-5 text-center">
            <p className="label-cayla text-[11px] text-verde-profundo">Liquidado</p>
            <p className="font-display mt-2 text-3xl text-tinta">{money(a.total)}</p>
            <p className="mt-1 text-sm text-tinta/70">
              {money(a.adelanto)} de anticipo + {money(a.total - a.adelanto)} hoy · {a.nombres}
            </p>
          </div>
          {vuelto > 0 && (
            <div className="flex items-baseline justify-between rounded-xl border border-tinta/15 bg-papel px-4 py-3">
              <span className="label-cayla text-[11px] text-tinta/70">Entregar vuelto</span>
              <span className="font-display text-3xl text-tinta">{money(vuelto)}</span>
            </div>
          )}
          <div className="card-cayla space-y-2 p-4 text-xs text-tinta/80">
            <p className="flex justify-between tabular-nums"><span>Total de las prendas</span><span>{money(a.total)}</span></p>
            <p className="flex justify-between tabular-nums"><span>(−) {a.pagos.some((p) => p.abono) ? "Anticipos (apartado y abonos)" : `Anticipo ${a.comprobanteAnticipo}`}</span><span>−{money(a.adelanto)}</span></p>
            {pagadoHoy.map((p, i) => (
              <p key={i} className="flex justify-between tabular-nums text-tinta"><span>Hoy · {p.metodo}</span><span>{money(p.monto)}</span></p>
            ))}
            <p className="border-t border-sand pt-2 text-tinta/70">La venta de {money(a.total)} entra hoy a ingresos y sale de «En custodia».</p>
          </div>
          <Botones cerrar={cerrar} principal="Imprimir y entregar" />
          <ReciboApartado apartado={a} tipo="final" sede={sede} pagadoHoy={pagadoHoy} />
        </div>
      )}
    </Modal>
  );
}

export function LiberarModal({ apartado, ubicacion, onClose }: { apartado: Apartado; ubicacion: UbicacionApartado; onClose: () => void }) {
  const router = useRouter();
  const [enviando, setEnviando] = useState(false);
  const [motivo, setMotivo] = useState<"vencio" | "clienta_desistio" | "error_de_carga" | null>(null);
  // Liberar guarda en la tienda (las prendas vuelven a venderse): pide Responsable (ADR-0161), vacío al abrir.
  const responsable = useResponsable(ubicacion, { modo: "atencion" }); // módulo Punto de venta: «¿Quién está atendiendo?», vacío al abrir
  async function liberar(cerrar: () => void) {
    if (!motivo || !responsable.listo) return;
    setEnviando(true);
    const { error } = await firmar(
      createClient().rpc("liberar_separacion", { p_separacion_id: apartado.id, p_motivo: motivo }),
      responsable.firma(),
    );
    setEnviando(false);
    responsable.despues(error);
    if (error) return avisar.error(traducirError(error, "liberar el apartado"));
    avisar.exito("Prendas liberadas", { detalle: `Falta devolver ${money(apartado.adelanto)} a ${apartado.nombres}.` });
    router.refresh();
    cerrar();
  }
  const opciones: { id: NonNullable<typeof motivo>; texto: string }[] = [
    { id: "vencio", texto: "Venció y no vino" },
    { id: "clienta_desistio", texto: "La clienta desistió" },
    { id: "error_de_carga", texto: "Fue un error al apartar" },
  ];
  return (
    <Modal titulo="¿Liberar el apartado?" subtitulo={`${apartado.nombres} ${apartado.apellidos} · ${apartado.codigo}`} onClose={onClose}>
      {(cerrar) => (
        <div className="space-y-4">
          <p className="text-sm text-tinta/80">
            Las prendas vuelven a estar disponibles para vender. El adelanto de <b>{money(apartado.adelanto)}</b> queda por devolver, por {textoDevolucion(apartado)}.
          </p>
          <div role="radiogroup" aria-label="Por qué se libera" className="grid gap-1.5">
            {opciones.map((o) => (
              <button key={o.id} type="button" role="radio" aria-checked={motivo === o.id} onClick={() => setMotivo(o.id)} className={`rounded-lg border px-3 py-2.5 text-left text-sm transition-colors ${motivo === o.id ? "border-tinta bg-tinta text-papel" : "border-sand hover:border-tinta/40"}`}>
                {o.texto}
              </button>
            ))}
          </div>
          <ComboResponsable control={responsable} deshabilitado={enviando} />
          <div className="flex gap-2">
            <button type="button" onClick={cerrar} className={botonCancelar}>Mejor no</button>
            <button
              type="button"
              disabled={!motivo || enviando || !responsable.listo}
              title={!motivo ? "Elige por qué se libera." : (responsable.motivo ?? undefined)}
              onClick={() => liberar(cerrar)}
              className={botonPrimario}
            >
              {enviando ? "Liberando…" : "Liberar prendas"}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

/** Devolver el adelanto (D4): por el medio que la clienta dejó anotado; efectivo solo si vino a la tienda. */
export function DevolverModal({ apartado, ubicacion, cajaAbierta, onClose }: { apartado: Apartado; ubicacion: UbicacionApartado; cajaAbierta: boolean; onClose: () => void }) {
  const router = useRouter();
  const [medio, setMedio] = useState<MedioDevolucionReal>(apartado.devolucionMedio);
  const [operacion, setOperacion] = useState("");
  const [cci, setCci] = useState("");
  const [intento, setIntento] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const faltaOperacion = medio !== "efectivo" && !operacion.trim();
  const cciMalo = cci !== "" && soloDigitos(cci).length !== 20;
  const sinCaja = medio === "efectivo" && !cajaAbierta;
  // Registrar la devolución mueve dinero de la tienda: pide Responsable (ADR-0161), vacío al abrir.
  const responsable = useResponsable(ubicacion, { modo: "atencion" }); // módulo Punto de venta: «¿Quién está atendiendo?», vacío al abrir
  // «Sale de» (ADR-0195 F3b, situación 10): con Yape, Plin, transferencia o tarjeta se propone la cuenta de esta tienda para
  // ese medio; en efectivo sale del cajón, como siempre.
  const cuentas = useCuentasParaElegir("cobro", ubicacion.ubicacionId);
  const [cuentaElegida, setCuentaElegida] = useState<string | null>(null);
  const hayCuentas = medio !== "efectivo" && cuentas.listo && hayCuentasPara(cuentas.cuentas, "cobro", medio);
  const cuentaSale = hayCuentas ? cuentaEfectiva(cuentas.cuentas, "cobro", medio, cuentaElegida) : null;

  async function devolver(cerrar: () => void) {
    setIntento(true);
    if (faltaOperacion || cciMalo || sinCaja || !responsable.listo) return;
    setEnviando(true);
    const { data, error } = await firmar(
      createClient().rpc("registrar_devolucion_separacion", {
        p_separacion_id: apartado.id,
        p_medio: medio,
        p_operacion: operacion.trim() || undefined,
        p_cci: cci ? soloDigitos(cci) : undefined,
        p_cuenta_id: cuentaSale ?? undefined,
      } as never),
      responsable.firma(),
    );
    setEnviando(false);
    responsable.despues(error);
    if (error) return avisar.error(traducirError(error, "registrar la devolución", { confirmarAntesDeRepetir: true }));
    const aviso = (data as { aviso?: string | null } | null)?.aviso;
    avisar.exito(`Devolución de ${money(apartado.adelanto)} registrada`, { detalle: aviso ?? `${apartado.nombres} · ${NOMBRE_METODO[medio as keyof typeof NOMBRE_METODO] ?? medio}` });
    router.refresh();
    cerrar();
  }

  const medios: MedioDevolucionReal[] = ["yape", "plin", "transferencia", "efectivo", "tarjeta"];
  return (
    <Modal titulo="Devolver el adelanto" subtitulo={`${apartado.nombres} ${apartado.apellidos} · ${apartado.codigo}`} onClose={onClose} ancho="max-w-md">
      {(cerrar) => (
        <div className="space-y-4">
          <div className="card-cayla p-4 text-center">
            <p className="label-cayla text-[11px] text-rojo-profundo">A devolver</p>
            <p className="font-display mt-1 text-3xl text-tinta">{money(apartado.adelanto)}</p>
            <p className="mt-1 text-xs text-tinta/70">Pidió que se le devuelva por {textoDevolucion(apartado)}</p>
          </div>
          <div className="grid grid-cols-5 gap-1 rounded-xl bg-sand/50 p-1">
            {medios.map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={medio === m}
                onClick={() => setMedio(m)}
                style={medio === m ? { backgroundColor: "var(--ct)", color: "var(--cd)" } : undefined}
                className={`metodo-${m} flex h-14 flex-col items-center justify-center gap-1 rounded-lg text-[10px] capitalize transition-colors ${medio === m ? "shadow-sm" : "text-tinta/60 hover:bg-papel/60"}`}
              >
                {ICONO_METODO[m]}
                {m}
              </button>
            ))}
          </div>
          {medio === "efectivo" ? (
            <p className={`rounded-lg border px-3 py-2 text-xs ${sinCaja ? "border-rojo/30 text-rojo-profundo" : "border-sand bg-crema text-tinta/75"}`}>
              {sinCaja ? "Para devolver en efectivo abre primero la caja de la tienda." : "Solo si la clienta vino a la tienda. Sale del cajón como «Devolución de apartado»."}
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {medio === "transferencia" && (
                <label className="block">
                  <span className={campoEtiqueta}>CCI (si cambió)</span>
                  <input value={cci} onChange={(e) => setCci(e.target.value)} inputMode="numeric" placeholder={apartado.devolucionCciFinal ? `…${apartado.devolucionCciFinal}` : "20 dígitos"} className={`${campoTexto} font-mono`} />
                  {intento && cciMalo && <span className="text-xs text-rojo-profundo">El CCI tiene 20 dígitos.</span>}
                </label>
              )}
              <label className="block">
                <span className={campoEtiqueta}>N.º de operación</span>
                <input value={operacion} onChange={(e) => setOperacion(e.target.value)} placeholder="Obligatorio" className={`${campoTexto} font-mono`} />
                {intento && faltaOperacion && <span className="text-xs text-rojo-profundo">Anótalo: es la prueba de que se devolvió.</span>}
              </label>
              <div className="sm:col-span-2">
                <CampoSelect
                  etiqueta="Sale de"
                  valor={cuentaSale ?? ""}
                  onValor={setCuentaElegida}
                  opciones={hayCuentas ? opcionesDeCuenta(cuentas.cuentas, "cobro", medio) : []}
                  marcador={!cuentas.listo ? "…" : hayCuentas ? undefined : "Sin cuenta configurada para este medio"}
                  deshabilitado={!hayCuentas}
                  pie={hayCuentas ? ayudaCuenta(cuentas.cuentas.find((c) => c.id === cuentaSale) ?? null, "sale", "cobro") : "Queda «sin cuenta» hasta que el líder la configure; se registra igual."}
                />
              </div>
            </div>
          )}
          <p className="text-xs text-tinta/60">Se intentará la nota de crédito sobre la boleta {apartado.comprobanteAnticipo}; si SUNAT aún no la aceptó, queda pendiente con aviso.</p>
          <ComboResponsable control={responsable} deshabilitado={enviando} />
          <div className="flex gap-2">
            <button type="button" onClick={cerrar} className={botonCancelar}>Cancelar</button>
            <button type="button" disabled={enviando || !responsable.listo} title={responsable.motivo ?? undefined} onClick={() => devolver(cerrar)} className={botonPrimario}>
              {enviando ? "Registrando…" : "Registrar devolución"}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

/** Extender el plazo 7 días (una sola vez): una confirmación breve para que quien lo hace firme con el combo. */
export function ExtenderModal({ apartado, ubicacion, onClose }: { apartado: Apartado; ubicacion: UbicacionApartado; onClose: () => void }) {
  const router = useRouter();
  const [enviando, setEnviando] = useState(false);
  // Extender guarda en la tienda (cambia la fecha límite de la clienta): pide Responsable (ADR-0161), vacío al abrir.
  const responsable = useResponsable(ubicacion, { modo: "atencion" }); // módulo Punto de venta: «¿Quién está atendiendo?», vacío al abrir
  const agotado = apartado.extensiones >= EXTENSIONES_MAX;

  async function extender(cerrar: () => void) {
    if (agotado || !responsable.listo) return;
    setEnviando(true);
    const { data, error } = await firmar(createClient().rpc("extender_separacion", { p_separacion_id: apartado.id }), responsable.firma());
    setEnviando(false);
    responsable.despues(error);
    if (error) return avisar.error(traducirError(error, "extender el apartado"));
    avisar.exito("Plazo extendido 7 días", { detalle: `${apartado.nombres} recoge hasta el ${fechaCorta(String(data))}. Avísale por WhatsApp.` });
    router.refresh();
    cerrar();
  }

  return (
    <Modal titulo="¿Extender 7 días?" subtitulo={`${apartado.nombres} ${apartado.apellidos} · ${apartado.codigo}`} onClose={onClose}>
      {(cerrar) => (
        <div className="space-y-4">
          <p className="text-sm text-tinta/80">
            Venció el <b>{fechaCorta(apartado.venceEl)}</b>. Las prendas siguen guardadas una semana más y el precio se mantiene. Solo se puede extender una vez.
          </p>
          <ComboResponsable control={responsable} deshabilitado={enviando} />
          <div className="flex gap-2">
            <button type="button" onClick={cerrar} className={botonCancelar}>Mejor no</button>
            <button
              type="button"
              disabled={enviando || agotado || !responsable.listo}
              title={agotado ? "Ya se extendió una vez." : (responsable.motivo ?? undefined)}
              onClick={() => extender(cerrar)}
              className={botonPrimario}
            >
              {enviando ? "Extendiendo…" : "Extender 7 días"}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

/**
 * Recordar (Apartados v2, paso 1 — 20260926233000): escribirle a la clienta por WhatsApp y dejar constancia. Con varias
 * clientas es la cola del día, una tras otra; desde el botón de una fila, esa sola. El chat se abre ANTES de hablar con
 * la base: el navegador solo deja abrir una ventana en el mismo toque, no después de esperar una respuesta. Lo envía la
 * persona desde el WhatsApp de la tienda; el sistema no manda nada solo.
 */
export function RecordarModal({
  cola,
  ubicacion,
  hoy,
  onAvisada,
  onClose,
}: {
  cola: Apartado[];
  ubicacion: UbicacionApartado;
  hoy: string;
  onAvisada: (id: string) => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pos, setPos] = useState(0);
  const [hechas, setHechas] = useState<ReadonlySet<string>>(() => new Set());
  const [enviando, setEnviando] = useState(false);
  // Avisar es una operación de la tienda: firma quien atiende (ADR-0161). En el lote el combo no se vacía entre una
  // clienta y la siguiente —es la misma persona escribiendo—; vuelve a vacío al terminar.
  const responsable = useResponsable(ubicacion, { modo: "atencion" });
  const actual = cola[Math.min(pos, cola.length - 1)];
  const mensaje = mensajeWhatsapp(actual, ubicacion.etiqueta, hoy);

  async function escribir(cerrar: () => void) {
    if (!responsable.listo || enviando) return;
    window.open(enlaceWhatsapp(actual.celular, mensaje), "_blank", "noopener,noreferrer");
    setEnviando(true);
    const { error } = await firmar(createClient().rpc("registrar_aviso_separacion", { p_separacion_id: actual.id }), responsable.firma());
    setEnviando(false);
    if (error) {
      responsable.despues(error);
      return avisar.error(traducirError(error, "anotar el aviso"), { detalle: "El chat se abrió, pero el aviso no quedó anotado: vuelve a intentarlo." });
    }
    const nuevas = new Set([...hechas, actual.id]);
    setHechas(nuevas);
    onAvisada(actual.id);
    const siguiente = cola.findIndex((a) => !nuevas.has(a.id));
    if (siguiente >= 0) return setPos(siguiente);
    responsable.despues(null);
    avisar.exito(nuevas.size === 1 ? `Aviso a ${actual.nombres} anotado` : `${nuevas.size} avisos anotados`);
    router.refresh();
    cerrar();
  }

  function saltar() {
    const resto = cola.map((_, i) => (pos + 1 + i) % cola.length).find((i) => !hechas.has(cola[i].id) && i !== pos);
    if (resto !== undefined) setPos(resto);
  }

  const varias = cola.length > 1;
  return (
    <Modal
      titulo={varias ? "Recordar en lote" : `Escribirle a ${actual.nombres}`}
      subtitulo={varias ? `${hechas.size} de ${cola.length} avisadas · WhatsApp de ${ubicacion.etiqueta}` : `${actual.codigo} · ${formatoCelular(actual.celular)}`}
      onClose={() => {
        if (hechas.size) router.refresh();
        onClose();
      }}
      ancho="max-w-lg"
    >
      {(cerrar) => (
        <div className="space-y-4">
          {varias && (
            <>
              <div aria-hidden className="h-1.5 overflow-hidden rounded-full bg-sand">
                <span className="block h-full rounded-full bg-tinta transition-[width] duration-500 ease-[var(--ease-cayla)]" style={{ width: `${(hechas.size / cola.length) * 100}%` }} />
              </div>
              <ul className="divide-y divide-sand overflow-hidden rounded-xl border border-sand">
                {cola.map((a, i) => (
                  <li key={a.id}>
                    <button
                      type="button"
                      onClick={() => setPos(i)}
                      aria-current={a.id === actual.id ? "true" : undefined}
                      className={`flex w-full items-center gap-3 px-3.5 py-2.5 text-left text-sm transition-colors ${a.id === actual.id ? "bg-crema" : "hover:bg-crema/60"}`}
                    >
                      <span className="min-w-0 flex-1">
                        <b className="font-semibold">{a.nombres} {a.apellidos}</b>{" "}
                        <span className="text-xs text-tinta/55 tabular-nums">{formatoCelular(a.celular)}</span>
                      </span>
                      {hechas.has(a.id) ? (
                        <span className="flex items-center gap-1 text-xs text-verde-profundo"><Check className="h-3.5 w-3.5" aria-hidden /> Avisada</span>
                      ) : (
                        <EstadoChip {...estadoVisible(a, hoy)} />
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
          <div className="card-cayla space-y-2 p-4">
            <p className="label-cayla text-[11px] text-tinta/60">Mensaje para {actual.nombres}</p>
            <p className="rounded-xl rounded-bl-sm bg-hueso px-3.5 py-3 text-[13.5px] text-tinta">{mensaje}</p>
            <p className="text-xs text-tinta/60">Se abre WhatsApp con este texto y lo envías tú. Al volver, queda anotado quién le escribió y cuándo.</p>
          </div>
          <ComboResponsable control={responsable} deshabilitado={enviando} />
          <div className="flex gap-2">
            {varias ? (
              <button type="button" onClick={saltar} disabled={cola.length - hechas.size <= 1} className={botonCancelar}>
                Saltar
              </button>
            ) : (
              <button type="button" onClick={cerrar} className={botonCancelar}>
                Mejor no
              </button>
            )}
            <button
              type="button"
              disabled={enviando || !responsable.listo || hechas.has(actual.id)}
              title={responsable.motivo ?? undefined}
              onClick={() => escribir(cerrar)}
              className={`${botonPrimario} flex flex-1 items-center justify-center gap-2`}
            >
              <MessageCircle className="h-4 w-4" aria-hidden />
              {enviando ? "Anotando…" : varias ? "Abrir WhatsApp y seguir" : "Abrir WhatsApp"}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

/** El precio de hoy de una prenda del catálogo, con la campaña vigente (misma regla que la caja y `separar_prendas`). */
const descuentoHoy = (p: PrendaApartable) => (p.campana ? descuentoDeCampana(p.precio, p.campana.pct) : 0);
const detalleVariante = (p: { color: string | null; talla: string | null; codigo: string | null; sku: string | null }) =>
  [p.color, p.talla, codigoPrenda(p)].filter(Boolean).join(" · ");

/**
 * Abonar a cuenta (Apartados v2, paso 2 — 20260927100000): la clienta paga una parte y la prenda sigue guardada. Sale su
 * boleta de anticipo; al recoger, la boleta final descuenta todos. El plazo no cambia solo: se puede elegir esperarla
 * 2 días más, o 3 si el abono cubre la mitad o más de lo que le faltaba (Felipe, 2026-09-26).
 */
export function AbonarModal({ apartado, ubicacion, cajaAbierta, onClose }: { apartado: Apartado; ubicacion: UbicacionApartado; cajaAbierta: boolean; onClose: () => void }) {
  const router = useRouter();
  const [metodo, setMetodo] = useState<MetodoPago>("yape");
  const [monto, setMonto] = useState(0);
  const [esperar, setEsperar] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const token = useRef<string>(crypto.randomUUID());
  const responsable = useResponsable(ubicacion, { modo: "atencion" });
  const saldo = apartado.saldo;
  const dias = diasEsperaPorAbono(monto, saldo);
  const nuevaFecha = sumarDiasIso(apartado.venceEl < new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" }) ? new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" }) : apartado.venceEl, dias);
  const valido = monto > 0 && monto <= saldo;
  const rapidos = [20, 50].filter((x) => x < saldo);

  async function abonar(cerrar: () => void) {
    if (!valido || !responsable.listo || !cajaAbierta) return;
    setEnviando(true);
    const { data, error } = await firmar(
      createClient().rpc("abonar_separacion", {
        p_separacion_id: apartado.id,
        p_pagos: [{ metodo, monto }],
        p_esperar: esperar,
        p_token: token.current,
      }),
      responsable.firma(),
    );
    setEnviando(false);
    responsable.despues(error);
    if (error) return avisar.error(traducirError(error, "registrar el abono", { confirmarAntesDeRepetir: true }));
    const r = (data ?? {}) as { vence_el?: string; saldo?: number };
    avisar.exito(`Abono de ${money(monto)} anotado`, {
      detalle: `${apartado.nombres}: ${Number(r.saldo ?? saldo - monto) > 0 ? `falta ${money(Number(r.saldo ?? saldo - monto))}` : "ya pagó todo"}${esperar && r.vence_el ? ` · recoge hasta el ${fechaCorta(r.vence_el)}` : ""}. Sale su boleta de anticipo.`,
    });
    router.refresh();
    cerrar();
  }

  return (
    <Modal titulo="Abonar a cuenta" subtitulo={`${apartado.nombres} ${apartado.apellidos} · ${apartado.codigo} · la prenda sigue guardada`} onClose={onClose} ancho="max-w-md">
      {(cerrar) => (
        <div className="space-y-4">
          <div className="card-cayla flex items-baseline justify-between p-4">
            <span className="text-sm text-tinta/70">Falta pagar hoy</span>
            <span className="font-display text-2xl tabular-nums">{money(saldo)}</span>
          </div>
          <div className="grid grid-cols-5 gap-1 rounded-xl bg-sand/50 p-1" role="radiogroup" aria-label="Cómo paga el abono">
            {METODOS_PAGO.map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={metodo === m}
                onClick={() => setMetodo(m)}
                style={metodo === m ? { backgroundColor: "var(--ct)", color: "var(--cd)" } : undefined}
                className={`metodo-${m} flex h-14 flex-col items-center justify-center gap-1 rounded-lg px-1 text-[10px] capitalize transition-colors ${metodo === m ? "shadow-sm" : "text-tinta/60 hover:bg-papel/60"}`}
              >
                {ICONO_METODO[m]}
                {m}
              </button>
            ))}
          </div>
          <label className="flex items-center justify-between gap-3 rounded-xl border border-sand bg-papel px-4 py-3">
            <span className="text-sm">Abona</span>
            <span className="flex items-center gap-1 border-b border-tinta/20 text-lg">
              <span className="text-tinta/50">S/</span>
              <CampoMonto aria-label="Monto del abono" valor={monto} onCambio={setMonto} className="w-24 bg-transparent py-1 text-right tabular-nums outline-none" />
            </span>
          </label>
          <div className="flex flex-wrap gap-1.5">
            {rapidos.map((x) => (
              <button key={x} type="button" onClick={() => setMonto(x)} className="rounded-full border border-sand px-3 py-1 text-xs tabular-nums hover:border-taupe">
                {money(x)}
              </button>
            ))}
            <button type="button" onClick={() => setMonto(saldo)} className="rounded-full border border-sand px-3 py-1 text-xs tabular-nums hover:border-taupe">
              Todo · {money(saldo)}
            </button>
          </div>
          <div aria-hidden className="h-1.5 overflow-hidden rounded-full bg-sand">
            <span className="block h-full rounded-full bg-tinta transition-[width] duration-500 ease-[var(--ease-cayla)]" style={{ width: `${Math.min(100, ((apartado.adelanto + Math.max(0, monto)) / apartado.total) * 100)}%` }} />
          </div>
          <p className="flex justify-between text-xs text-tinta/60 tabular-nums">
            <span>Pagado {money(apartado.adelanto + Math.max(0, monto))} de {money(apartado.total)}</span>
            <b className="text-tinta">Queda {money(Math.max(0, saldo - monto))}</b>
          </p>
          {monto > saldo && <p className="text-xs text-rojo-profundo">El abono no puede pasar lo que falta ({money(saldo)}).</p>}
          <label className="flex cursor-pointer items-start gap-2.5 text-[13px] text-tinta/85">
            <input type="checkbox" checked={esperar} onChange={(e) => setEsperar(e.target.checked)} className="mt-1 accent-tinta" />
            <span>
              Esperarla {dias} días más: recoge hasta el <b>{fechaCorta(nuevaFecha)}</b>
              <span className="block text-xs text-tinta/55">{dias === 3 ? "Abona la mitad o más de lo que le faltaba: 3 días." : "Con la mitad o más de lo que le falta serían 3 días."} Sin marcar, la fecha sigue el {fechaCorta(apartado.venceEl)}.</span>
            </span>
          </label>
          <p className="rounded-xl bg-hueso px-3.5 py-2.5 text-xs text-tinta/75">Sale una boleta de anticipo por el abono. Al recoger, la boleta final descuenta todos los anticipos.</p>
          <ComboResponsable control={responsable} deshabilitado={enviando} />
          <div className="flex gap-2">
            <button type="button" onClick={cerrar} className={botonCancelar}>Mejor no</button>
            <button
              type="button"
              disabled={!valido || enviando || !responsable.listo || !cajaAbierta}
              title={!cajaAbierta ? "Abre la caja para cobrar el abono." : (responsable.motivo ?? undefined)}
              onClick={() => abonar(cerrar)}
              className={botonPrimario}
            >
              {enviando ? "Guardando…" : `Registrar abono · ${money(Math.max(0, monto))}`}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

/**
 * Editar las prendas de un apartado abierto (paso 4 — 20260927120000): quitar, sumar o cambiar la talla, todo o nada.
 * Lo nuevo entra con el precio y la campaña de HOY; el anticipo ya emitido no cambia. Si el nuevo total quedara por
 * debajo de lo que ya pagó, la base lo rechaza (qué hacer con esa diferencia lo decide Felipe).
 */
export function EditarApartadoModal({
  apartado,
  prendas,
  ubicacion,
  onClose,
}: {
  apartado: Apartado;
  prendas: PrendaApartable[];
  ubicacion: UbicacionApartado;
  onClose: () => void;
}) {
  const router = useRouter();
  const porId = useMemo(() => new Map(prendas.map((p) => [p.varianteId, p])), [prendas]);
  const [quitar, setQuitar] = useState<ReadonlySet<string>>(() => new Set());
  const [sumar, setSumar] = useState<{ varianteId: string; cantidad: number }[]>([]);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const token = useRef<string>(crypto.randomUUID());
  const responsable = useResponsable(ubicacion, { modo: "atencion" });

  const quedan = apartado.prendas.filter((p) => !quitar.has(p.itemId));
  const totalNuevo =
    quedan.reduce((t, p) => t + (p.precioUnitario - p.descuentoUnitario) * p.cantidad, 0) +
    sumar.reduce((t, l) => {
      const p = porId.get(l.varianteId);
      return p ? t + (p.precio - descuentoHoy(p)) * l.cantidad : t;
    }, 0);
  const debajo = totalNuevo < apartado.adelanto;
  const sinPrendas = quedan.length + sumar.length === 0;
  const cambio = quitar.size > 0 || sumar.length > 0;
  const sinId = apartado.prendas.some((p) => !p.itemId);

  const disponibleParaSumar = (id: string) => (porId.get(id)?.stockAqui ?? 0) - (sumar.find((l) => l.varianteId === id)?.cantidad ?? 0);
  function agregar(varianteId: string) {
    if (disponibleParaSumar(varianteId) <= 0) return avisar.error("No queda disponible para apartar en esta tienda.");
    setSumar((ls) => (ls.some((l) => l.varianteId === varianteId) ? ls.map((l) => (l.varianteId === varianteId ? { ...l, cantidad: l.cantidad + 1 } : l)) : [...ls, { varianteId, cantidad: 1 }]));
    setTexto("");
  }
  /** Cambiar la talla = sacar esta fila y apartar la otra, en la misma edición. */
  function cambiarTalla(itemId: string, varianteId: string) {
    setQuitar((q) => new Set([...q, itemId]));
    agregar(varianteId);
  }
  const buscados = useMemo(() => {
    const t = texto.trim().toLowerCase();
    if (!t) return [];
    return prendas
      .filter((p) => p.stockAqui > 0 && `${p.referencia} ${p.color ?? ""} ${p.talla ?? ""} ${codigoPrenda(p)}`.toLowerCase().includes(t))
      .slice(0, 6);
  }, [texto, prendas]);

  async function guardar(cerrar: () => void) {
    if (!cambio || debajo || sinPrendas || !responsable.listo) return;
    setEnviando(true);
    const { error } = await firmar(
      createClient().rpc("editar_separacion", {
        p_separacion_id: apartado.id,
        p_quitar: [...quitar],
        p_agregar: sumar.map((l) => {
          const p = porId.get(l.varianteId)!;
          return { variante_id: l.varianteId, cantidad: l.cantidad, precio_unitario: p.precio, descuento_unitario: descuentoHoy(p) };
        }),
        p_token: token.current,
      }),
      responsable.firma(),
    );
    setEnviando(false);
    responsable.despues(error);
    if (error) return avisar.error(traducirError(error, "editar el apartado", { confirmarAntesDeRepetir: true }));
    avisar.exito("Apartado editado", { detalle: `${apartado.codigo}: total ${money(totalNuevo)} · saldo ${money(totalNuevo - apartado.adelanto)}. La fecha no cambia.` });
    router.refresh();
    cerrar();
  }

  return (
    <Modal titulo="Editar prendas del apartado" subtitulo={`${apartado.nombres} ${apartado.apellidos} · ${apartado.codigo} · la fecha límite no cambia`} onClose={onClose} ancho="max-w-xl">
      {(cerrar) => (
        <div className="space-y-4">
          {sinId && <p className="rounded-xl bg-ambar/10 px-3.5 py-2.5 text-xs text-ambar-profundo">Para editar hace falta la actualización de la base de este paso: todavía no está aplicada.</p>}
          <ul className="divide-y divide-sand overflow-hidden rounded-xl border border-sand">
            {apartado.prendas.map((pr) => {
              const v = porId.get(pr.varianteId);
              const fuera = quitar.has(pr.itemId);
              const hermanas = v ? prendas.filter((h) => h.referencia === v.referencia && h.color === v.color) : [];
              return (
                <li key={pr.itemId || pr.varianteId} className={`flex flex-wrap items-center gap-3 px-3.5 py-3 ${fuera ? "bg-crema/70" : ""}`}>
                  <FotoPrenda fotoUrl={v?.fotoUrl} referencia={pr.referencia} ancho={40} className="w-10" />
                  <div className="min-w-0 flex-1">
                    <p className={`truncate text-sm font-semibold ${fuera ? "text-tinta/45 line-through" : "text-tinta"}`}>{pr.referencia}</p>
                    <p className="text-xs text-tinta/60">{v ? detalleVariante(v) : pr.sku} · {pr.cantidad} u.</p>
                  </div>
                  {!fuera && hermanas.length > 1 && (
                    <div className="flex gap-1" role="group" aria-label="Cambiar la talla">
                      {hermanas.map((h) => (
                        <button
                          key={h.varianteId}
                          type="button"
                          disabled={h.varianteId !== pr.varianteId && h.stockAqui <= 0}
                          onClick={() => h.varianteId !== pr.varianteId && cambiarTalla(pr.itemId, h.varianteId)}
                          className={`h-8 min-w-8 rounded-lg border px-2 text-xs font-semibold disabled:opacity-35 ${h.varianteId === pr.varianteId ? "border-tinta bg-tinta text-papel" : "border-sand hover:border-tinta/40"}`}
                        >
                          {h.talla ?? "—"}
                        </button>
                      ))}
                    </div>
                  )}
                  <span className="w-20 text-right text-sm tabular-nums">{money((pr.precioUnitario - pr.descuentoUnitario) * pr.cantidad)}</span>
                  <button
                    type="button"
                    disabled={!pr.itemId}
                    onClick={() => setQuitar((q) => (q.has(pr.itemId) ? new Set([...q].filter((x) => x !== pr.itemId)) : new Set([...q, pr.itemId])))}
                    className="label-cayla text-[10px] text-rojo-profundo disabled:opacity-40"
                  >
                    {fuera ? "Dejar" : "Quitar"}
                  </button>
                </li>
              );
            })}
            {sumar.map((l) => {
              const p = porId.get(l.varianteId)!;
              return (
                <li key={`n-${l.varianteId}`} className="flex flex-wrap items-center gap-3 bg-verde/5 px-3.5 py-3">
                  <FotoPrenda fotoUrl={p.fotoUrl} referencia={p.referencia} ancho={40} className="w-10" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{p.referencia} <span className="ml-1 text-[11px] font-normal text-verde-profundo">nueva</span></p>
                    <p className="text-xs text-tinta/60">{detalleVariante(p)}</p>
                  </div>
                  <span className="inline-flex h-8 items-center rounded-lg border border-sand">
                    <button type="button" aria-label="Una menos" onClick={() => setSumar((ls) => ls.flatMap((x) => (x.varianteId !== l.varianteId ? [x] : x.cantidad > 1 ? [{ ...x, cantidad: x.cantidad - 1 }] : [])))} className="grid h-8 w-7 place-items-center text-tinta/60"><Minus className="h-3 w-3" aria-hidden /></button>
                    <span className="min-w-5 text-center text-sm tabular-nums">{l.cantidad}</span>
                    <button type="button" aria-label="Una más" onClick={() => agregar(l.varianteId)} className="grid h-8 w-7 place-items-center text-tinta/60"><Plus className="h-3 w-3" aria-hidden /></button>
                  </span>
                  <span className="w-20 text-right text-sm tabular-nums">{money((p.precio - descuentoHoy(p)) * l.cantidad)}</span>
                  <button type="button" aria-label="No sumar" onClick={() => setSumar((ls) => ls.filter((x) => x.varianteId !== l.varianteId))} className="text-rojo-profundo"><Trash2 className="h-3.5 w-3.5" aria-hidden /></button>
                </li>
              );
            })}
          </ul>
          <div className="relative">
            <label className="flex h-11 items-center gap-2.5 rounded-xl border border-sand bg-papel px-3.5 focus-within:border-taupe">
              <Search className="h-4 w-4 text-tinta/55" aria-hidden />
              <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Sumar una prenda: nombre, color o código" className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
            </label>
            {buscados.length > 0 && (
              <ul className="mt-1.5 divide-y divide-sand overflow-hidden rounded-xl border border-sand bg-papel">
                {buscados.map((p) => (
                  <li key={p.varianteId}>
                    <button type="button" onClick={() => agregar(p.varianteId)} className="flex w-full items-center gap-3 px-3.5 py-2 text-left text-sm hover:bg-crema/60">
                      <span className="min-w-0 flex-1"><b className="font-semibold">{p.referencia}</b> <span className="text-xs text-tinta/60">{detalleVariante(p)}</span></span>
                      <span className="text-xs tabular-nums">{money(p.precio - descuentoHoy(p))} · {p.stockAqui} disp.</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="card-cayla space-y-1 p-4 text-sm tabular-nums">
            <p className="flex justify-between"><span className="text-tinta/60">Total antes</span><span>{money(apartado.total)}</span></p>
            <p className="flex justify-between"><span className="text-tinta/60">Total ahora</span><b>{money(totalNuevo)}</b></p>
            <p className="flex justify-between"><span className="text-tinta/60">Ya pagó</span><span>−{money(apartado.adelanto)}</span></p>
            <p className="flex justify-between border-t border-sand pt-2 text-base"><span>Saldo al recoger</span><b>{money(Math.max(0, totalNuevo - apartado.adelanto))}</b></p>
          </div>
          {debajo && !sinPrendas && <p className="text-xs text-rojo-profundo">El nuevo total queda por debajo de lo que ya pagó ({money(apartado.adelanto)}): suma otra prenda o libera el apartado.</p>}
          {sinPrendas && <p className="text-xs text-rojo-profundo">El apartado no puede quedarse sin prendas: si ya no quiere nada, libéralo.</p>}
          <p className="rounded-xl bg-hueso px-3.5 py-2.5 text-xs text-tinta/75">Se guarda todo junto o nada: lo que sale vuelve a la tienda, lo nuevo se aparta con el precio de hoy. El anticipo ya emitido sigue valiendo.</p>
          <ComboResponsable control={responsable} deshabilitado={enviando} />
          <div className="flex gap-2">
            <button type="button" onClick={cerrar} className={botonCancelar}>Mejor no</button>
            <button
              type="button"
              disabled={!cambio || debajo || sinPrendas || enviando || !responsable.listo || sinId}
              title={responsable.motivo ?? undefined}
              onClick={() => guardar(cerrar)}
              className={botonPrimario}
            >
              {enviando ? "Guardando…" : "Guardar cambios"}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

/**
 * «Opciones» de Apartados (paso 5 — 20260927130000): qué funciones usa esta tienda. Solo el líder. De fábrica, Completo.
 * Son opciones de PANTALLA: apagar una esconde sus botones; lo ya hecho (un abono, un estante) sigue valiendo.
 */
export function OpcionesApartadosModal({ ubicacion, apagadas: inicial, onClose }: { ubicacion: UbicacionApartado; apagadas: string[]; onClose: () => void }) {
  const router = useRouter();
  const [apagadas, setApagadas] = useState<string[]>(inicial);
  const [enviando, setEnviando] = useState(false);
  const responsable = useResponsable(ubicacion, { modo: "atencion" });
  const preset = presetDe(apagadas);
  const grupos = [...new Set(FUNCIONES_APARTADOS.map((f) => f.grupo))];
  const alternar = (c: FuncionApartados) => setApagadas((a) => (a.includes(c) ? a.filter((x) => x !== c) : [...a, c]));
  const elegirPreset = (k: keyof typeof PRESETS_APARTADOS) =>
    setApagadas(FUNCIONES_APARTADOS.map((f) => f.clave).filter((c) => !PRESETS_APARTADOS[k].encendidas.includes(c)));

  async function guardar(cerrar: () => void) {
    if (!responsable.listo) return;
    setEnviando(true);
    const { error } = await firmar(createClient().rpc("guardar_opciones_apartados", { p_ubicacion_id: ubicacion.ubicacionId, p_apagadas: apagadas }), responsable.firma());
    setEnviando(false);
    responsable.despues(error);
    if (error) return avisar.error(traducirError(error, "guardar las opciones"));
    avisar.exito("Opciones de Apartados guardadas", { detalle: `${ubicacion.etiqueta}: ${preset ? PRESETS_APARTADOS[preset].titulo : "a medida"}.` });
    router.refresh();
    cerrar();
  }

  return (
    <Modal titulo="Opciones de Apartados" subtitulo={`${ubicacion.etiqueta} · elige un punto de partida y ajusta función por función`} onClose={onClose} ancho="max-w-lg">
      {(cerrar) => (
        <div className="space-y-4">
          <div className="grid gap-2" role="radiogroup" aria-label="Punto de partida">
            {(Object.keys(PRESETS_APARTADOS) as (keyof typeof PRESETS_APARTADOS)[]).map((k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={preset === k}
                onClick={() => elegirPreset(k)}
                className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-left transition-colors ${preset === k ? "border-tinta bg-papel" : "border-sand hover:border-tinta/40"}`}
              >
                <span className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border-[1.5px] border-tinta`}>{preset === k && <span className="h-2 w-2 rounded-full bg-tinta" />}</span>
                <span>
                  <b className="text-sm">{PRESETS_APARTADOS[k].titulo}</b>
                  {k === "completo" && <span className="ml-2 rounded-full bg-pizarra/10 px-2 py-0.5 text-[10.5px] text-pizarra">de fábrica</span>}
                  <span className="block text-xs text-tinta/60">{PRESETS_APARTADOS[k].texto}</span>
                </span>
              </button>
            ))}
          </div>
          {grupos.map((g) => (
            <div key={g}>
              <p className="label-cayla mb-1 text-[10.5px] text-tinta/55">{g}</p>
              <ul className="divide-y divide-sand">
                {FUNCIONES_APARTADOS.filter((f) => f.grupo === g).map((f) => {
                  const on = !apagadas.includes(f.clave);
                  return (
                    <li key={f.clave} className="flex items-center gap-3 py-2.5">
                      <span className="min-w-0 flex-1">
                        <b className="block text-sm font-medium">{f.titulo}</b>
                        <span className="text-xs text-tinta/60">{f.texto}</span>
                      </span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={on}
                        aria-label={f.titulo}
                        onClick={() => alternar(f.clave)}
                        className={`relative h-5 w-9 shrink-0 rounded-full transition-colors duration-200 ${on ? "bg-tinta" : "bg-sand"}`}
                      >
                        <span className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-papel shadow-sm transition-transform duration-200 ease-[var(--ease-cayla)] ${on ? "translate-x-4" : ""}`} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
          <p className="rounded-xl bg-hueso px-3.5 py-2.5 text-xs text-tinta/75">Apagar una función esconde sus botones en esta tienda. Lo que ya se hizo con ella (un abono, un estante) sigue contando.</p>
          <ComboResponsable control={responsable} deshabilitado={enviando} />
          <div className="flex gap-2">
            <button type="button" onClick={cerrar} className={botonCancelar}>Mejor no</button>
            <button type="button" disabled={enviando || !responsable.listo} title={responsable.motivo ?? undefined} onClick={() => guardar(cerrar)} className={botonPrimario}>
              {enviando ? "Guardando…" : "Guardar opciones"}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

