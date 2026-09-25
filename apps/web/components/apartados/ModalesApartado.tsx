"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Printer } from "lucide-react";
import { Modal, botonCancelar, botonPrimario, campoEtiqueta, campoTexto } from "@/components/ui/Modal";
import { avisar } from "@/components/ui/Avisos";
import { money } from "@/components/PuntoDeVenta";
import { ICONO_METODO } from "@/components/PuntoDeVentaTicket";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { AVISO_DIAS, EXTENSIONES_MAX, PLAZO_DIAS, soloDigitos, sumarDiasIso, textoDevolucion, type Apartado, type MedioDevolucionReal } from "@/lib/separaciones-reglas";
import { NOMBRE_METODO } from "@/lib/recibo-reglas";
import { ReciboApartado, fechaCorta } from "@/components/apartados/piezas";
import { ComboResponsable } from "@/components/ComboResponsable";
import { useResponsable } from "@/lib/useResponsable";
import { firmar } from "@/lib/responsable-reglas";
import { OpcionesCuenta, useCuentasParaElegir } from "@/components/finanzas/CampoCuenta";
import { ayudaCuenta, cuentaEfectiva, hayCuentasPara } from "@/lib/cuenta-sellada-reglas";

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

function Botones({ cerrar, principal }: { cerrar: () => void; principal: string }) {
  return (
    <div className="space-y-2">
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
    "Guárdala en «Apartados» del almacén, no en el piso.",
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
            <p className="flex justify-between tabular-nums"><span>(−) Anticipo {a.comprobanteAnticipo}</span><span>−{money(a.adelanto)}</span></p>
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
              <label className="block sm:col-span-2">
                <span className={campoEtiqueta}>Sale de</span>
                <select value={cuentaSale ?? ""} disabled={!hayCuentas} onChange={(e) => setCuentaElegida(e.target.value)} className={campoTexto}>
                  {hayCuentas ? <OpcionesCuenta cuentas={cuentas.cuentas} clase="cobro" medio={medio} /> : <option value="">{cuentas.listo ? "Sin cuenta configurada para este medio" : "…"}</option>}
                </select>
                <span className="mt-1 block text-xs text-tinta/60">
                  {hayCuentas ? ayudaCuenta(cuentas.cuentas.find((c) => c.id === cuentaSale) ?? null, "sale") : "Queda «sin cuenta» hasta que el líder la configure; se registra igual."}
                </span>
              </label>
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
