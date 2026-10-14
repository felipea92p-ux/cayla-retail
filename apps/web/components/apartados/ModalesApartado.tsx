"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, MessageCircle, Minus, Plus, Trash2 } from "lucide-react";
import { METODOS_PAGO, type MetodoPago } from "@cayla-retail/shared";
import { CampoMonto } from "@/components/ui/CampoMonto";
import { codigoPrenda } from "@/lib/prenda-reglas";
import { descuentoDeCampana } from "@/lib/vender-reglas";
import type { PrendaApartable } from "@/components/apartados/ApartarVista";
import { Modal, botonCancelar, campoEtiqueta, campoTexto } from "@/components/ui/Modal";
import { avisar } from "@/components/ui/Avisos";
import { money } from "@/components/PuntoDeVenta";
import { ICONO_METODO } from "@/components/PuntoDeVentaTicket";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { diaLima, hoyLima } from "@/lib/fechas-lima";
import {
  AVISO_DIAS,
  EXTENSIONES_MAX,
  FUNCIONES_APARTADOS,
  PRESETS_APARTADOS,
  diasEsperaPorAbono,
  presetDe,
  type FuncionApartados,
  type PedidoApartado,
  PLAZO_DIAS,
  enlaceWhatsapp,
  esConstancia,
  estadoVisible,
  formatoCelular,
  mensajeWhatsapp,
  paraQuienPedido,
  soloDigitos,
  sumarDiasIso,
  textoDevolucion,
  type Apartado,
  type MedioDevolucionReal,
} from "@/lib/separaciones-reglas";
import { NOMBRE_METODO, TEXTO_REDONDEO } from "@/lib/recibo-reglas";
import { EstadoChip, FotoPrenda, ReciboApartado, fechaCorta } from "@/components/apartados/piezas";
import { TicketDeEntrega, useReciboDeApartado } from "@/components/apartados/useReciboDeApartado";
import { ComboResponsable } from "@/components/ComboResponsable";
import { useResponsable } from "@/lib/useResponsable";
import { useTituloDeImpresion } from "@/lib/useTituloDeImpresion";
import { firmar } from "@/lib/responsable-reglas";
import { useIntento } from "@/lib/useIntento";
import { huellaDe } from "@/lib/intento-reglas";
import { AvisoIntentoIncierto, avisarCongelado } from "@/components/ui/AvisoIntentoIncierto";
import { firmaOmitida } from "@/lib/responsable-omitido";
import { useCuentasParaElegir } from "@/components/finanzas/CampoCuenta";
import { ayudaCuenta, cuentaEfectiva, hayCuentasPara, opcionesDeCuenta } from "@/lib/cuenta-sellada-reglas";
import { CampoSelect, Boton } from "@/components/ui/campos";
import { Aviso } from "@/components/ui/Aviso";
import { Buscador } from "@/components/ui/Buscador";
import { Casilla } from "@/components/ui/Casilla";
import { BotonImprimir } from "@/components/ui/BotonImprimir";

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
      <BotonImprimir peso="primario" autoFocus onClick={() => imprimirYSeguir(cerrar)} className="w-full">
        {principal}
      </BotonImprimir>
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
  useTituloDeImpresion(a.codigo); // el PDF sale como «APT-TRU-0004.pdf», no «Retail - CAYLA.pdf»
  const [hechos, setHechos] = useState<boolean[]>([false, false, false]);
  const pasos = [
    `Pega la etiqueta «APARTADO · ${a.codigo}» en la prenda.`,
    a.estante ? `Guárdala en el estante ${a.estante} de Apartados, no en el piso.` : "Guárdala en «Apartados» del almacén, no en el piso.",
    // Sin celular (ADR-0367) no hay a dónde enviarla: la constancia impresa es la que se lleva. Un apartado viejo sigue con su boleta.
    ...(a.celular
      ? [`Envía ${esConstancia(a) ? "la constancia" : "la boleta"} por WhatsApp al ${a.celular}.`]
      : [`Entrégale ${esConstancia(a) ? "la constancia impresa" : "la boleta impresa"}: no dejó celular.`]),
  ];
  const [mes, dia, semana] = [
    new Date(`${a.venceEl}T12:00:00Z`).toLocaleDateString("es-PE", { month: "short", timeZone: "UTC" }).replace(".", "").toUpperCase(),
    Number(a.venceEl.slice(8, 10)),
    new Date(`${a.venceEl}T12:00:00Z`).toLocaleDateString("es-PE", { weekday: "short", timeZone: "UTC" }).replace(".", ""),
  ];
  return (
    <Modal titulo="Apartado registrado" subtitulo={`${sede} · ${a.codigo}`} onClose={onClose}>
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
              {esConstancia(a) ? (
                <>
                  <span className="text-tinta">
                    Constancia <span className="font-mono">{a.codigo}</span>
                  </span>
                  <span className="text-[11px] text-tinta/60">No es comprobante de pago</span>
                </>
              ) : (
                <>
                  <span className="text-tinta">
                    Boleta <span className="font-mono">{a.comprobanteAnticipo}</span> · anticipo
                  </span>
                  <span className="text-[11px] text-tinta/60">Pendiente de enviar</span>
                </>
              )}
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
              Cliente: <span className="text-tinta">{a.nombres} {a.apellidos}</span> · si no recoge: {textoDevolucion(a)}
            </p>
          </div>
          <fieldset className="card-cayla space-y-2 p-4">
            <legend className="sr-only">Con la prenda en la mano</legend>
            <p className="label-cayla text-[11px] text-tinta/60">Ahora, con la prenda en la mano</p>
            {pasos.map((t, i) => (
              <label key={i} className="flex cursor-pointer items-start gap-2.5 text-sm">
                <Casilla marcada={hechos[i]} onCambio={() => setHechos((h) => h.map((x, j) => (j === i ? !x : x)))} etiqueta={t} className="mt-0.5 shrink-0" />
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

export function ApartadoEntregadoModal({ apartado, pagadoHoy, vuelto, redondeo = 0, sede, onClose }: { apartado: Apartado; pagadoHoy: { metodo: string; monto: number }[]; vuelto: number; /** Lo que no se cobró por llevar el efectivo del saldo a S/ 0.10 (ADR-0311). */ redondeo?: number; sede: string; onClose: () => void }) {
  const a = apartado;
  useTituloDeImpresion(a.codigo);
  // Un apartado nuevo imprime LA boleta o factura de siempre (con su QR y su número); uno viejo, su ticket de antes (ADR-0399).
  const recibo = useReciboDeApartado(a, sede, redondeo, esConstancia(a));
  return (
    <Modal titulo="Apartado entregado" subtitulo={`${sede} · ${a.codigo}`} onClose={onClose}>
      {(cerrar) => (
        <div className="space-y-4">
          <div className="card-cayla p-5 text-center">
            <p className="label-cayla text-[11px] text-verde-profundo">Liquidado</p>
            <p className="font-display mt-2 text-3xl text-tinta">{money(a.total)}</p>
            <p className="mt-1 text-sm text-tinta/70">
              {money(a.adelanto)} de adelanto + {money(a.total - a.adelanto)} hoy · {a.nombres}
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
            <p className="flex justify-between tabular-nums"><span>(−) {esConstancia(a) ? "Adelanto" : a.pagos.some((p) => p.abono) ? "Anticipos (apartado y abonos)" : `Anticipo ${a.comprobanteAnticipo}`}</span><span>−{money(a.adelanto)}</span></p>
            {pagadoHoy.map((p, i) => (
              <p key={i} className="flex justify-between tabular-nums text-tinta"><span>Hoy · {p.metodo}</span><span>{money(p.monto)}</span></p>
            ))}
            {redondeo > 0 && (
              <p className="flex justify-between tabular-nums text-tinta/70" data-redondeo><span>{TEXTO_REDONDEO}</span><span>{money(redondeo)}</span></p>
            )}
            <p className="border-t border-sand pt-2 text-tinta/70">La venta de {money(a.total)} entra hoy a ingresos y sale de «En custodia».{esConstancia(a) && " La boleta o factura sale por el total, sin nombrar el adelanto."}</p>
          </div>
          <Botones cerrar={cerrar} principal="Imprimir y entregar" />
          {recibo ? <TicketDeEntrega recibo={recibo} codigo={a.codigo} /> : <ReciboApartado apartado={a} tipo="final" sede={sede} pagadoHoy={pagadoHoy} redondeo={redondeo} />}
        </div>
      )}
    </Modal>
  );
}

/**
 * «Reimprimir» (ADR-0367, Felipe 2026-10-09): el ticket de un apartado ya registrado, desde el Historial. Sale con «COPIA»
 * para que nadie lo confunda con uno nuevo. Un apartado entregado tiene dos: el del anticipo y el final; se elige cuál.
 * No escribe nada: solo vuelve a dibujar lo que la base ya tiene.
 */
export function ReimprimirApartadoModal({ apartado, sede, onClose }: { apartado: Apartado; sede: string; onClose: () => void }) {
  const a = apartado;
  const conFinal = a.estado === "entregada" && !!a.comprobanteFinal;
  const constancia = esConstancia(a);
  const [cual, setCual] = useState<"anticipo" | "final">(conFinal ? "final" : "anticipo");
  const reciboFinal = useReciboDeApartado(a, sede, 0, constancia && conFinal);
  const numero = cual === "final" ? a.comprobanteFinal : constancia ? a.codigo : a.comprobanteAnticipo;
  useTituloDeImpresion(`${a.codigo}${cual === "final" ? "-final" : ""}`);
  return (
    <Modal titulo="Reimprimir ticket" subtitulo={`${sede} · ${a.codigo}`} onClose={onClose} conCerrar>
      {() => (
        <div className="space-y-4">
          {conFinal && (
            <div className="flex flex-wrap gap-2" role="group" aria-label="Qué ticket imprimir">
              <button type="button" aria-pressed={cual === "final"} onClick={() => setCual("final")} className="pildora-cayla">{constancia ? "Boleta o factura" : "Boleta final"}</button>
              <button type="button" aria-pressed={cual === "anticipo"} onClick={() => setCual("anticipo")} className="pildora-cayla">{constancia ? "Constancia" : "Anticipo"}</button>
            </div>
          )}
          <div className="card-cayla space-y-1.5 p-4 text-sm">
            <p className="flex items-baseline justify-between gap-3">
              <span className="text-tinta">
                {cual === "anticipo" && constancia ? "Constancia" : "Boleta"} <span className="font-mono">{numero ?? "—"}</span>
              </span>
              <span className="text-[11px] text-tinta/60">{cual === "final" ? (constancia ? "por el total" : "final") : constancia ? "no es comprobante de pago" : "anticipo"}</span>
            </p>
            <p className="text-xs text-tinta/70">
              {a.nombres} {a.apellidos} · {cual === "final" ? `total ${money(a.total)}` : `adelanto ${money(a.adelanto)} de ${money(a.total)}`}
            </p>
            <p className="text-xs text-tinta/60">Apartado el {fechaCorta(diaLima(a.creadaEn))} · sale marcado como COPIA.</p>
          </div>
          <BotonImprimir peso="primario" autoFocus onClick={() => window.print()} className="w-full">
            Imprimir la copia
          </BotonImprimir>
          {cual === "final" && reciboFinal ? <TicketDeEntrega recibo={reciboFinal} codigo={a.codigo} /> : <ReciboApartado key={cual} apartado={a} tipo={cual} sede={sede} copia />}
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
    { id: "clienta_desistio", texto: "El cliente desistió" },
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
          <div className="pie-acciones">
            <button type="button" onClick={cerrar} className="btn-cayla btn-secundario">Mejor no</button>
            <Boton peso="primario" cargando={enviando} textoCargando="Liberando…"
              type="button"
              disabled={!motivo || enviando || !responsable.listo}
              title={!motivo ? "Elige por qué se libera." : (responsable.motivo ?? undefined)}
              onClick={() => liberar(cerrar)}
            >
              Liberar prendas
            </Boton>
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
    <Modal titulo="Devolver el adelanto" subtitulo={`${apartado.nombres} ${apartado.apellidos} · ${apartado.codigo}`} onClose={onClose}>
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
              {sinCaja ? "Para devolver en efectivo abre primero la caja de la tienda." : "Solo si el cliente vino a la tienda. Sale del cajón como «Devolución de apartado»."}
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
          <p className="text-xs text-tinta/60">
            {esConstancia(apartado)
              ? "Solo se registra que el dinero volvió al cliente: no hay comprobante que anular, así que no se gasta ningún correlativo."
              : `Se intentará la nota de crédito sobre la boleta ${apartado.comprobanteAnticipo}; si SUNAT aún no la aceptó, queda pendiente con aviso.`}
          </p>
          <ComboResponsable control={responsable} deshabilitado={enviando} />
          <div className="pie-acciones">
            <button type="button" onClick={cerrar} className="btn-cayla btn-secundario">Cancelar</button>
            <Boton peso="primario" cargando={enviando} textoCargando="Registrando…" type="button" disabled={enviando || !responsable.listo} title={responsable.motivo ?? undefined} onClick={() => devolver(cerrar)}>
              Registrar devolución
            </Boton>
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
          <div className="pie-acciones">
            <button type="button" onClick={cerrar} className="btn-cayla btn-secundario">Mejor no</button>
            <button
              type="button"
              disabled={enviando || agotado || !responsable.listo}
              title={agotado ? "Ya se extendió una vez." : (responsable.motivo ?? undefined)}
              onClick={() => extender(cerrar)}
              className="btn-cayla btn-primario"
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
  // Avisar va sin responsable (Felipe, 2026-09-29): el aviso queda a nombre de la cuenta, sin combo.
  const actual = cola[Math.min(pos, cola.length - 1)];
  const mensaje = mensajeWhatsapp(actual, ubicacion.etiqueta, hoy);

  async function escribir(cerrar: () => void) {
    if (enviando) return;
    window.open(enlaceWhatsapp(actual.celular, mensaje), "_blank", "noopener,noreferrer");
    setEnviando(true);
    const { error } = await firmar(createClient().rpc("registrar_aviso_separacion", { p_separacion_id: actual.id }), firmaOmitida("aviso_apartado"));
    setEnviando(false);
    if (error) {
      return avisar.error(traducirError(error, "anotar el aviso"), { detalle: "El chat se abrió, pero el aviso no quedó anotado: vuelve a intentarlo." });
    }
    const nuevas = new Set([...hechas, actual.id]);
    setHechas(nuevas);
    onAvisada(actual.id);
    const siguiente = cola.findIndex((a) => !nuevas.has(a.id));
    if (siguiente >= 0) return setPos(siguiente);
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
      subtitulo={varias ? `${hechas.size} de ${cola.length} avisados · WhatsApp de ${ubicacion.etiqueta}` : `${actual.codigo} · ${formatoCelular(actual.celular)}`}
      onClose={() => {
        if (hechas.size) router.refresh();
        onClose();
      }}
      tamano="mediana"
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
                        <span className="flex items-center gap-1 text-xs text-verde-profundo"><Check className="h-3.5 w-3.5" aria-hidden /> Avisado</span>
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
          <div className="pie-acciones">
            {varias ? (
              <button type="button" onClick={saltar} disabled={cola.length - hechas.size <= 1} className="btn-cayla btn-secundario">
                Saltar
              </button>
            ) : (
              <button type="button" onClick={cerrar} className="btn-cayla btn-secundario">
                Mejor no
              </button>
            )}
            <Boton type="button" peso="primario" cargando={enviando} textoCargando="Anotando…" disabled={hechas.has(actual.id)} onClick={() => escribir(cerrar)} className="flex-1">
              <span className="flex items-center justify-center gap-2">
                <MessageCircle className="-my-1 h-4 w-4" aria-hidden />
                {varias ? "Abrir WhatsApp y seguir" : "Abrir WhatsApp"}
              </span>
            </Boton>
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
 * Abonar a cuenta (Apartados v2, paso 2 — 20260927100000): la clienta paga una parte y la prenda sigue guardada. Desde ADR-0399 el abono
 * no emite comprobante (antes sacaba su boleta de anticipo y la final los descontaba); al recoger sale una boleta o factura por el total.
 * El plazo no cambia solo: se puede elegir esperarla
 * 2 días más, o 3 si el abono cubre la mitad o más de lo que le faltaba (Felipe, 2026-09-26).
 */
export function AbonarModal({ apartado, ubicacion, cajaAbierta, onClose }: { apartado: Apartado; ubicacion: UbicacionApartado; cajaAbierta: boolean; onClose: () => void }) {
  const router = useRouter();
  const [metodo, setMetodo] = useState<MetodoPago>("yape");
  const [monto, setMonto] = useState(0);
  const [esperar, setEsperar] = useState(false);
  // La marca del envío sigue a lo que se manda (/chaos 2026-10-13): si la respuesta se pierde, la hoja se congela hasta saber si
  // el abono quedó; cambiar el monto y reenviar con la marca vieja devolvía el abono anterior.
  const envio = useIntento("abonar_separacion");
  const enviando = envio.enviando;
  const [revisando, setRevisando] = useState(false);
  const responsable = useResponsable(ubicacion, { modo: "atencion" });
  const saldo = apartado.saldo;
  const dias = diasEsperaPorAbono(monto, saldo);
  const hoy = hoyLima();
  const nuevaFecha = sumarDiasIso(apartado.venceEl < hoy ? hoy : apartado.venceEl, dias);
  const valido = monto > 0 && monto <= saldo;
  const rapidos = [20, 50].filter((x) => x < saldo);

  async function abonar(cerrar: () => void) {
    if (!valido || !responsable.listo || !cajaAbierta) return;
    const params = { p_separacion_id: apartado.id, p_pagos: [{ metodo, monto }], p_esperar: esperar };
    const res = await envio.enviar(huellaDe(params), (token, senal) =>
      firmar(createClient().rpc("abonar_separacion", { ...params, p_token: token }), responsable.firma()).abortSignal(senal),
    );
    if (res.tipo === "ocupado") return;
    if (res.tipo === "congelado") return avisarCongelado(avisar);
    responsable.despues(res.tipo === "error" || res.tipo === "incierto" ? res.error : null);
    // En duda: la hoja lo dice sobre los botones y se congela hasta saber qué pasó.
    if (res.tipo === "incierto") return;
    if (res.tipo === "error") return avisar.error(traducirError(res.error, "registrar el abono"));
    abonado((res.tipo === "ok" ? res.data : res.datos) as { vence_el?: string; saldo?: number } | null, cerrar);
  }

  async function revisar(cerrar: () => void) {
    setRevisando(true);
    const res = await envio.revisar();
    setRevisando(false);
    if (res.tipo === "hecho") return abonado(res.datos as { vence_el?: string; saldo?: number }, cerrar);
    if (res.tipo === "no_llego") {
      avisar.aviso("El abono no se registró", { detalle: "No se cobró nada. Revisa el monto y vuelve a registrarlo." });
      return;
    }
    if (res.tipo === "sin_respuesta") avisar.error("Todavía no hay respuesta", { detalle: "Revisa el internet y vuelve a tocar «Revisar si se guardó»." });
  }

  function abonado(datos: { vence_el?: string; saldo?: number } | null, cerrar: () => void) {
    const r = datos ?? {};
    avisar.exito(`Abono de ${money(monto)} anotado`, {
      detalle: `${apartado.nombres}: ${Number(r.saldo ?? saldo - monto) > 0 ? `falta ${money(Number(r.saldo ?? saldo - monto))}` : "ya pagó todo"}${esperar && r.vence_el ? ` · recoge hasta el ${fechaCorta(r.vence_el)}` : ""}. Sale su boleta de anticipo.`,
    });
    router.refresh();
    cerrar();
  }

  return (
    <Modal titulo="Abonar a cuenta" subtitulo={`${apartado.nombres} ${apartado.apellidos} · ${apartado.codigo} · la prenda sigue guardada`} onClose={onClose} bloqueado={enviando || envio.incierto}>
      {(cerrar) => (
        <div className="space-y-4">
          {/* En duda, nada se toca: otro monto reenviado podría cobrar el abono dos veces. */}
          <fieldset disabled={envio.incierto} className="min-w-0 space-y-4">
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
          {monto > saldo && <Aviso tono="error" chico>El abono no puede pasar lo que falta ({money(saldo)}).</Aviso>}
          <label className="flex cursor-pointer items-start gap-2.5 text-[13px] text-tinta/85">
            <Casilla marcada={esperar} onCambio={() => setEsperar(!esperar)} etiqueta={`Esperarla ${dias} días más`} className="mt-0.5 shrink-0" />
            <span>
              Esperarla {dias} días más: recoge hasta el <b>{fechaCorta(nuevaFecha)}</b>
              <span className="block text-xs text-tinta/55">{dias === 3 ? "Abona la mitad o más de lo que le faltaba: 3 días." : "Con la mitad o más de lo que le falta serían 3 días."} Sin marcar, la fecha sigue el {fechaCorta(apartado.venceEl)}.</span>
            </span>
          </label>
          <p className="rounded-xl bg-hueso px-3.5 py-2.5 text-xs text-tinta/75">{esConstancia(apartado) ? "El abono se suma al adelanto y no emite comprobante. Al recoger, sale una sola boleta o factura por el total." : "Sale una boleta de anticipo por el abono. Al recoger, la boleta final descuenta todos los anticipos."}</p>
          <ComboResponsable control={responsable} deshabilitado={enviando} />
          </fieldset>
          {envio.incierto && <AvisoIntentoIncierto onRevisar={() => revisar(cerrar)} revisando={revisando} />}
          <div className="pie-acciones">
            <button type="button" onClick={cerrar} disabled={envio.incierto} className="btn-cayla btn-secundario">Mejor no</button>
            <Boton peso="primario" cargando={enviando}
              type="button"
              disabled={!valido || enviando || revisando || !responsable.listo || !cajaAbierta}
              title={!cajaAbierta ? "Abre la caja para cobrar el abono." : (responsable.motivo ?? undefined)}
              onClick={() => abonar(cerrar)}
            >
              {envio.incierto ? "Volver a intentar" : `Registrar abono · ${money(Math.max(0, monto))}`}
            </Boton>
          </div>
        </div>
      )}
    </Modal>
  );
}

/**
 * Editar las prendas de un apartado abierto (paso 4 — 20260927120000): quitar, sumar o cambiar la talla, todo o nada.
 * Lo nuevo entra con el precio y la campaña de HOY; el adelanto ya recibido no cambia. Si el nuevo total quedara por
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
  // La marca del envío sigue a lo que se manda (/chaos 2026-10-13): si la respuesta se pierde, la hoja se congela hasta saber si
  // la edición quedó.
  const envio = useIntento("editar_separacion");
  const enviando = envio.enviando;
  const [revisando, setRevisando] = useState(false);
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
    const params = {
      p_separacion_id: apartado.id,
      p_quitar: [...quitar],
      p_agregar: sumar.map((l) => {
        const p = porId.get(l.varianteId)!;
        return { variante_id: l.varianteId, cantidad: l.cantidad, precio_unitario: p.precio, descuento_unitario: descuentoHoy(p) };
      }),
    };
    const res = await envio.enviar(huellaDe(params), (token, senal) =>
      firmar(createClient().rpc("editar_separacion", { ...params, p_token: token }), responsable.firma()).abortSignal(senal),
    );
    if (res.tipo === "ocupado") return;
    if (res.tipo === "congelado") return avisarCongelado(avisar);
    responsable.despues(res.tipo === "error" || res.tipo === "incierto" ? res.error : null);
    // En duda: la hoja lo dice sobre los botones y se congela hasta saber qué pasó.
    if (res.tipo === "incierto") return;
    if (res.tipo === "error") return avisar.error(traducirError(res.error, "editar el apartado"));
    editado(cerrar);
  }

  async function revisar(cerrar: () => void) {
    setRevisando(true);
    const res = await envio.revisar();
    setRevisando(false);
    if (res.tipo === "hecho") return editado(cerrar);
    if (res.tipo === "no_llego") {
      avisar.aviso("La edición no se guardó", { detalle: "El apartado sigue como estaba. Revisa los cambios y vuelve a guardar." });
      return;
    }
    if (res.tipo === "sin_respuesta") avisar.error("Todavía no hay respuesta", { detalle: "Revisa el internet y vuelve a tocar «Revisar si se guardó»." });
  }

  function editado(cerrar: () => void) {
    avisar.exito("Apartado editado", { detalle: `${apartado.codigo}: total ${money(totalNuevo)} · saldo ${money(totalNuevo - apartado.adelanto)}. La fecha no cambia.` });
    router.refresh();
    cerrar();
  }

  return (
    <Modal titulo="Editar prendas del apartado" subtitulo={`${apartado.nombres} ${apartado.apellidos} · ${apartado.codigo} · la fecha límite no cambia`} onClose={onClose} tamano="mediana" bloqueado={enviando || envio.incierto}>
      {(cerrar) => (
        <div className="space-y-4">
          {/* En duda, nada se toca: otra edición reenviada podría mover prendas dos veces. */}
          <fieldset disabled={envio.incierto} className="min-w-0 space-y-4">
          {sinId && <Aviso tono="atencion" chico>Para editar hace falta la actualización de la base de este paso: todavía no está aplicada.</Aviso>}
          <ul className="divide-y divide-sand overflow-hidden rounded-xl border border-sand">
            {apartado.prendas.map((pr) => {
              const v = porId.get(pr.varianteId);
              const fuera = quitar.has(pr.itemId);
              const hermanas = v ? prendas.filter((h) => h.referencia === v.referencia && h.color === v.color) : [];
              return (
                <li key={pr.itemId || pr.varianteId} className={`flex flex-wrap items-center gap-3 px-3.5 py-3 ${fuera ? "bg-crema/70" : ""}`}>
                  <FotoPrenda fotoUrl={v?.fotoUrl} referencia={pr.referencia} colorHex={v?.colorHex} categoria={v?.categoria} categoriaPrefijo={v?.categoriaPrefijo} categoriaFamilia={v?.categoriaFamilia} ancho={40} className="w-10" />
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
                  <FotoPrenda fotoUrl={p.fotoUrl} referencia={p.referencia} colorHex={p.colorHex} categoria={p.categoria} categoriaPrefijo={p.categoriaPrefijo} categoriaFamilia={p.categoriaFamilia} ancho={40} className="w-10" />
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
            <Buscador valor={texto} onCambio={setTexto} placeholder="Sumar una prenda: nombre, color o código" />
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
          {debajo && !sinPrendas && <Aviso tono="error" chico>El nuevo total queda por debajo de lo que ya pagó ({money(apartado.adelanto)}): suma otra prenda o libera el apartado.</Aviso>}
          {sinPrendas && <Aviso tono="error" chico>El apartado no puede quedarse sin prendas: si ya no quiere nada, libéralo.</Aviso>}
          <p className="rounded-xl bg-hueso px-3.5 py-2.5 text-xs text-tinta/75">Se guarda todo junto o nada: lo que sale vuelve a la tienda, lo nuevo se aparta con el precio de hoy. El adelanto ya recibido sigue valiendo.</p>
          <ComboResponsable control={responsable} deshabilitado={enviando} />
          </fieldset>
          {envio.incierto && <AvisoIntentoIncierto onRevisar={() => revisar(cerrar)} revisando={revisando} />}
          <div className="pie-acciones">
            <button type="button" onClick={cerrar} disabled={envio.incierto} className="btn-cayla btn-secundario">Mejor no</button>
            <Boton peso="primario" cargando={enviando}
              type="button"
              disabled={!cambio || debajo || sinPrendas || enviando || revisando || !responsable.listo || sinId}
              title={responsable.motivo ?? undefined}
              onClick={() => guardar(cerrar)}
            >
              {envio.incierto ? "Volver a intentar" : "Guardar cambios"}
            </Boton>
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
    <Modal titulo="Opciones de Apartados" subtitulo={`${ubicacion.etiqueta} · elige un punto de partida y ajusta función por función`} onClose={onClose} tamano="mediana">
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
                        role="switch" // unificar-fijo: la cara del interruptor del sistema, con su texto a la izquierda en la fila
                        aria-checked={on}
                        aria-label={f.titulo}
                        onClick={() => alternar(f.clave)}
                        className="interruptor"
                      >
                        <span aria-hidden className="interruptor-perilla" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
          <p className="rounded-xl bg-hueso px-3.5 py-2.5 text-xs text-tinta/75">Apagar una función esconde sus botones en esta tienda. Lo que ya se hizo con ella (un abono, un estante) sigue contando.</p>
          <ComboResponsable control={responsable} deshabilitado={enviando} />
          <div className="pie-acciones">
            <button type="button" onClick={cerrar} className="btn-cayla btn-secundario">Mejor no</button>
            <Boton peso="primario" cargando={enviando} type="button" disabled={enviando || !responsable.listo} title={responsable.motivo ?? undefined} onClick={() => guardar(cerrar)}>
              Guardar opciones
            </Boton>
          </div>
        </div>
      )}
    </Modal>
  );
}

/** La otra tienda envía lo que le pidieron: es el traslado de siempre, con la clienta en la nota. */
export function EnviarPedidoModal({ pedido, prenda, ubicacion, onClose }: { pedido: PedidoApartado; prenda: PrendaApartable | undefined; ubicacion: UbicacionApartado; onClose: () => void }) {
  const router = useRouter();
  const manana = sumarDiasIso(hoyLima(), 1);
  const [llega, setLlega] = useState(manana);
  // La marca del envío sigue a lo que se manda (/chaos 2026-10-13): el pedido y la fecha. Si la respuesta se pierde, la hoja se
  // congela hasta saber si el traslado salió.
  const envio = useIntento("enviar_pedido_para_apartar");
  const enviando = envio.enviando;
  const [revisando, setRevisando] = useState(false);
  const responsable = useResponsable(ubicacion, { modo: "atencion" });

  async function enviar(cerrar: () => void) {
    if (!responsable.listo || !llega) return;
    const params = { p_pedido_id: pedido.id, p_fecha_estimada_llegada: `${llega}T12:00:00-05:00` };
    const res = await envio.enviar(huellaDe(params), (token, senal) =>
      firmar(createClient().rpc("enviar_pedido_para_apartar", { ...params, p_token: token }), responsable.firma()).abortSignal(senal),
    );
    if (res.tipo === "ocupado") return;
    if (res.tipo === "congelado") return avisarCongelado(avisar);
    responsable.despues(res.tipo === "error" || res.tipo === "incierto" ? res.error : null);
    // En duda: la hoja lo dice sobre los botones y se congela hasta saber qué pasó.
    if (res.tipo === "incierto") return;
    if (res.tipo === "error") return avisar.error(traducirError(res.error, "enviar la prenda"));
    enviado(cerrar);
  }

  async function revisar(cerrar: () => void) {
    setRevisando(true);
    const res = await envio.revisar();
    setRevisando(false);
    if (res.tipo === "hecho") return enviado(cerrar);
    if (res.tipo === "no_llego") {
      avisar.aviso("La prenda no salió", { detalle: "No se armó ningún traslado. Revisa la fecha y vuelve a enviarla." });
      return;
    }
    if (res.tipo === "sin_respuesta") avisar.error("Todavía no hay respuesta", { detalle: "Revisa el internet y vuelve a tocar «Revisar si se guardó»." });
  }

  function enviado(cerrar: () => void) {
    avisar.exito(`Enviado a ${pedido.otraSede}`, { detalle: "Salió como traslado: sepárala y mándala con la nota del cliente." });
    router.refresh();
    cerrar();
  }

  return (
    <Modal titulo={`Enviar a ${pedido.otraSede}`} subtitulo={paraQuienPedido(pedido)} onClose={onClose} bloqueado={enviando || envio.incierto}>
      {(cerrar) => (
        <div className="space-y-4">
          {/* En duda, nada se toca: otra fecha reenviada podría armar dos traslados. */}
          <fieldset disabled={envio.incierto} className="min-w-0 space-y-4">
          <div className="card-cayla p-4 text-sm">
            <p className="font-semibold">{prenda?.referencia ?? "Prenda"} · {pedido.cantidad} u.</p>
            <p className="text-xs text-tinta/60">{prenda ? detalleVariante(prenda) : ""}</p>
            {pedido.nota && <p className="mt-2 text-xs text-tinta/70">Nota: {pedido.nota}</p>}
          </div>
          <label className="block">
            <span className={campoEtiqueta}>¿Cuándo llega?</span>
            <input type="date" value={llega} min={manana.slice(0, 10)} onChange={(e) => setLlega(e.target.value)} className={campoTexto} />
          </label>
          <p className="rounded-xl bg-hueso px-3.5 py-2.5 text-xs text-tinta/75">Sale de tu almacén como un traslado más; Traslados lo muestra en camino hasta que {pedido.otraSede} lo reciba.</p>
          <ComboResponsable control={responsable} deshabilitado={enviando} />
          </fieldset>
          {envio.incierto && <AvisoIntentoIncierto onRevisar={() => revisar(cerrar)} revisando={revisando} />}
          <div className="pie-acciones">
            <button type="button" onClick={cerrar} disabled={envio.incierto} className="btn-cayla btn-secundario">Mejor no</button>
            <Boton peso="primario" cargando={enviando} textoCargando="Enviando…" type="button" disabled={enviando || revisando || !responsable.listo || !llega} title={responsable.motivo ?? undefined} onClick={() => enviar(cerrar)}>
              {envio.incierto ? "Volver a intentar" : "Enviar por traslado"}
            </Boton>
          </div>
        </div>
      )}
    </Modal>
  );
}

/** Cancelar un pedido (cualquiera de las dos tiendas, antes de apartarlo con adelanto). Si ya llegó, suelta la reserva. */
export function CancelarPedidoModal({ pedido, ubicacion, onClose }: { pedido: PedidoApartado; ubicacion: UbicacionApartado; onClose: () => void }) {
  const router = useRouter();
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const responsable = useResponsable(ubicacion, { modo: "atencion" });
  async function cancelar(cerrar: () => void) {
    if (!responsable.listo) return;
    setEnviando(true);
    const { error } = await firmar(createClient().rpc("cancelar_pedido_para_apartar", { p_pedido_id: pedido.id, p_motivo: motivo.trim() || undefined }), responsable.firma());
    setEnviando(false);
    responsable.despues(error);
    if (error) return avisar.error(traducirError(error, "cancelar el pedido"));
    avisar.exito("Pedido cancelado", { detalle: pedido.estado === "llego" ? "La prenda quedó libre para vender." : `Se le avisa a ${pedido.otraSede} al ver su lista.` });
    router.refresh();
    cerrar();
  }
  return (
    <Modal titulo="¿Cancelar el pedido?" subtitulo={paraQuienPedido(pedido)} onClose={onClose}>
      {(cerrar) => (
        <div className="space-y-4">
          <label className="block">
            <span className={campoEtiqueta}>Por qué (opcional)</span>
            <input value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={120} placeholder={pedido.direccion === "me_piden" ? "Ya no la tenemos" : "El cliente ya no la quiere"} className={campoTexto} />
          </label>
          <ComboResponsable control={responsable} deshabilitado={enviando} />
          <div className="pie-acciones">
            <button type="button" onClick={cerrar} className="btn-cayla btn-secundario">Mejor no</button>
            <Boton peso="primario" cargando={enviando} textoCargando="Cancelando…" type="button" disabled={enviando || !responsable.listo} title={responsable.motivo ?? undefined} onClick={() => cancelar(cerrar)}>
              Cancelar pedido
            </Boton>
          </div>
        </div>
      )}
    </Modal>
  );
}

