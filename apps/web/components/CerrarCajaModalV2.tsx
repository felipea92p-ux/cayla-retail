"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CloudOff } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { Modal, campoEtiqueta, botonCancelar, botonPrimario } from "@/components/ui/Modal";
import { totalEfectivoEncolado, type VentaEncolada } from "@/lib/ventas-offline";
import { CampoSelect, CampoTexto } from "@/components/ui/campos";
import { ComboResponsable } from "@/components/ComboResponsable";
import { useResponsable } from "@/lib/useResponsable";
import { firmar } from "@/lib/responsable-reglas";
import {
  DESTINOS_TRASLADO,
  cuadra,
  etiquetaDestino,
  fondoTrasCierre,
  leerMonto,
  motivoTrasladoInvalido,
  type DestinoTraslado,
} from "@/lib/caja-cierre-reglas";
import { dejaMenosDelFondo, trasladoParaDejarFondo } from "@/lib/configuracion-reglas";

function money(n: number) {
  return (n < 0 ? "-S/ " : "S/ ") + Math.abs(n).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

type Esperado = {
  apertura: number;
  ventasEfectivo: number;
  ingresos: number;
  egresos: number;
  reembolsos: number;
  cambios: number;
  esperado: number;
};

/** Billetes y monedas en circulación (S/). El conteo por denominación es opcional: suma y llena el total. */
const DENOMINACIONES = [200, 100, 50, 20, 10, 5, 2, 1, 0.5, 0.2, 0.1];

/**
 * Cierre en tres pasos (ADR-0186, spike docs/maquetas/caja-cierre-spike-2026-09/): 1) contar, con lo que espera el
 * sistema a la vista y la diferencia al instante; 2) trasladar, un solo monto y un destino, y lo que queda en el cajón
 * para el próximo turno se calcula; 3) el resultado.
 *
 * El esperado ya NO es ciego (decisión de Felipe, 2026-09-23): se lee de `fn_esperado_caja`, que usa el mismo cálculo
 * que `cerrar_caja`. Es una vista previa; el número que queda guardado es el que calcula `cerrar_caja` al cerrar (si
 * entró una venta mientras el modal estaba abierto, el resultado lo muestra).
 *
 * `cola` (ADR-0092): las ventas offline de esta sede que aún no subieron al servidor. El esperado lee solo
 * `venta_pagos` ya persistidas, así que efectivo cobrado pero encolado infla el conteo sin que el esperado lo sepa.
 * Prop obligatoria a propósito: si mañana un tercer lugar monta este modal, TypeScript exige decidir de dónde sale.
 */
export function CerrarCajaModalV2({
  cajaId,
  cola,
  fondo: fondoPedido = null,
  onClose,
}: {
  cajaId: string;
  cola: VentaEncolada[];
  /** Lo que debe quedar en el cajón hoy y por qué (ADR-0195 F1: lo normal de la tienda o la campaña que lo sube). Si queda
   *  menos, se pide confirmar pero NO se bloquea; la base anota el fondo que regía (`cajas.fondo_requerido`). */
  fondo?: { monto: number; motivo: string } | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [paso, setPaso] = useState<"contar" | "trasladar">("contar");
  const [esperado, setEsperado] = useState<Esperado | null>(null);
  const [falloEsperado, setFalloEsperado] = useState(false);
  const [contadoTexto, setContadoTexto] = useState("");
  const [billetes, setBilletes] = useState<Record<number, string>>({});
  const [trasladoTexto, setTrasladoTexto] = useState("");
  const [destino, setDestino] = useState<DestinoTraslado>("caja_fuerte");
  const [referencia, setReferencia] = useState("");
  const [loading, setLoading] = useState(false);
  // «Vas a dejar menos del fondo»: la confirmación que no bloquea (ADR-0195 L).
  const [pideConfirmar, setPideConfirmar] = useState(false);
  // Quién cierra (ADR-0161): el cierre pide Responsable como cualquier acción que guarda.
  const responsable = useResponsable();
  const [resultado, setResultado] = useState<{
    sistema: number;
    contado: number;
    diferencia: number;
    trasladado: number;
    fondo: number;
    fondoPedido: number | null;
    destino: DestinoTraslado;
    referencia: string;
    efectivoEncoladoAlCerrar: number;
    quienCerro: string | null;
  } | null>(null);

  // El esperado se pide al abrir el modal (el modal solo se monta cuando alguien pulsa «Cerrar caja»).
  useEffect(() => {
    let vigente = true;
    createClient()
      .rpc("fn_esperado_caja", { p_caja_id: cajaId })
      .single()
      .then(({ data, error }) => {
        if (!vigente) return;
        if (error || !data) {
          setFalloEsperado(true);
          return;
        }
        setEsperado({
          apertura: Number(data.apertura),
          ventasEfectivo: Number(data.ventas_efectivo),
          ingresos: Number(data.ingresos),
          egresos: Number(data.egresos),
          reembolsos: Number(data.reembolsos_efectivo),
          cambios: Number(data.cambios_efectivo),
          esperado: Number(data.esperado),
        });
      });
    return () => {
      vigente = false;
    };
  }, [cajaId]);

  const efectivoEncolado = totalEfectivoEncolado(cola);
  // `navigator.onLine` solo promete "hay una interfaz de red arriba", no "el servidor responde" — por eso el bloqueo
  // es temporal (le da tiempo al latido de 30 s de `PuntoDeVenta.tsx` para subir la venta sola) y nunca definitivo.
  const enLinea = typeof navigator !== "undefined" && navigator.onLine;
  // Bloquea SOLO con red Y plata encolada: con conexión, más vale esperar los ~30 s del reintento automático que
  // forzar un cierre con un sobrante fantasma. Sin red se deja cerrar, con el aviso bien visible.
  const bloqueaCierre = efectivoEncolado > 0 && enLinea;

  const contado = leerMonto(contadoTexto);
  const trasladado = leerMonto(trasladoTexto) ?? 0;
  const fondo = contado === null ? 0 : fondoTrasCierre(contado, trasladado);
  const diferencia = contado !== null && esperado ? Math.round((contado - esperado.esperado) * 100) / 100 : null;
  const destinoElegido = DESTINOS_TRASLADO.find((d) => d.valor === destino)!;
  const invalido = contado === null ? null : motivoTrasladoInvalido({ contado, trasladado, destino, referencia });

  function cambiarBillete(den: number, cantidad: string) {
    const siguiente = { ...billetes, [den]: cantidad };
    setBilletes(siguiente);
    const total = DENOMINACIONES.reduce((s, d) => s + d * (parseInt(siguiente[d] ?? "", 10) || 0), 0);
    setContadoTexto(total > 0 ? total.toFixed(2) : "");
  }

  const dejaMenos = contado !== null && dejaMenosDelFondo(fondo, fondoPedido?.monto ?? null);

  async function cerrarCaja(e: React.FormEvent | null, aunqueFalte = false) {
    e?.preventDefault();
    // Menos del fondo: se pregunta una vez, dentro del mismo paso. «Cerrar igual» vuelve a entrar con `aunqueFalte`.
    if (dejaMenos && !aunqueFalte) {
      setPideConfirmar(true);
      return;
    }
    setPideConfirmar(false);
    // Refuerza el `disabled` del botón: un Enter con foco en un campo puede disparar el submit del <form>.
    if (bloqueaCierre) {
      avisar.error("Hay ventas offline subiendo al sistema todavía — espera unos segundos y vuelve a intentar.");
      return;
    }
    if (contado === null || invalido || !responsable.listo) return;
    setLoading(true);
    const supabase = createClient();
    const { data, error } = await firmar(
      supabase
        .rpc("cerrar_caja", {
          p_caja_id: cajaId,
          p_monto_real: contado,
          p_traslado_monto: trasladado,
          // Sin traslado no se mandan destino ni referencia (`undefined` no viaja en el JSON): los parámetros van escritos
          // uno por uno para que `pnpm datos:comparar` pueda cotejarlos con producción.
          p_traslado_destino: trasladado > 0 ? destino : undefined,
          p_traslado_referencia: trasladado > 0 ? referencia.trim() : undefined,
        })
        .single(),
      responsable.firma(),
    );
    setLoading(false);
    if (error) {
      responsable.despues(error);
      avisar.error(traducirError(error, "cerrar la caja"));
      return;
    }
    const dif = Number(data.diferencia);
    const quienCerro = responsable.lista.elegibles.find((p) => p.personaId === responsable.elegidoId)?.nombre ?? null;
    responsable.despues(null);
    avisar.exito("Caja cerrada", {
      detalle: cuadra(dif, 0) ? "Cuadró exacto." : `${dif > 0 ? "Sobran" : "Faltan"} ${money(Math.abs(dif))} contra el sistema.`,
    });
    setResultado({
      sistema: Number(data.monto_sistema),
      contado: Number(data.monto_real),
      diferencia: dif,
      trasladado: Number(data.monto_trasladado),
      fondo: Number(data.monto_fondo),
      fondoPedido: fondoPedido?.monto ?? null,
      destino,
      referencia: referencia.trim(),
      efectivoEncoladoAlCerrar: efectivoEncolado,
      quienCerro,
    });
  }

  /**
   * El refresco va acá y no al cerrar: al refrescar, el servidor responde que la ubicación ya no tiene caja abierta,
   * el panel que monta este modal deja de renderizarse y el resultado se desmonta antes de que nadie alcance a leerlo.
   */
  function cerrarYRefrescar() {
    router.refresh();
    onClose();
  }

  const avisoOffline = efectivoEncolado > 0 && (
    <div className="space-y-1.5 rounded-lg border border-ambar/30 bg-ambar/10 px-3 py-2.5 text-xs text-ambar-profundo">
      <p className="flex items-center gap-2">
        <CloudOff className="h-4 w-4 shrink-0" aria-hidden />
        Hay {money(efectivoEncolado)} en ventas offline que todavía no subieron al sistema — no están incluidas en lo
        que espera el sistema.
      </p>
      {bloqueaCierre && (
        <p className="pl-6 text-tinta/70">
          Tu sede tiene conexión: espera unos segundos a que esas ventas suban solas (reintentan cada 30&nbsp;s) antes
          de cerrar caja.
        </p>
      )}
    </div>
  );

  const barraPasos = (n: 1 | 2) => (
    <div className="space-y-1.5" aria-hidden>
      <p className="label-cayla text-[10px] text-taupe-profundo">
        Paso {n} de 3 · {n === 1 ? "Contar" : "Trasladar"}
      </p>
      <div className="flex gap-1.5">
        {[1, 2, 3].map((i) => (
          <span key={i} className={`h-[3px] flex-1 rounded-full ${i <= n ? "bg-tinta" : "bg-tinta/10"}`} />
        ))}
      </div>
    </div>
  );

  if (resultado) {
    const cuadro = cuadra(resultado.diferencia, 0);
    return (
      <Modal titulo="Caja cerrada" onClose={cerrarYRefrescar}>
        {(cerrar) => (
          <div className="space-y-4 text-center">
            <p className={`label-cayla text-[11px] ${cuadro ? "text-verde-profundo" : "text-rojo"}`}>
              {cuadro ? "Cuadró" : "No cuadró"}
            </p>
            <p className={`font-display text-3xl ${cuadro ? "text-tinta" : "text-rojo"}`}>
              {resultado.diferencia >= 0 ? "+" : ""}
              {money(resultado.diferencia)}
            </p>
            <dl className="mx-auto flex max-w-[19rem] flex-col gap-1 border-t border-tinta/10 pt-3 text-left text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-tinta/60">El sistema esperaba</dt>
                <dd className="whitespace-nowrap tabular-nums">{money(resultado.sistema)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-tinta/60">Contaste</dt>
                <dd className="whitespace-nowrap tabular-nums">{money(resultado.contado)}</dd>
              </div>
              {resultado.trasladado > 0 && (
                <div className="flex justify-between gap-3">
                  <dt className="text-tinta/60">
                    → {etiquetaDestino(resultado.destino)}
                    {resultado.referencia && <span className="block text-xs text-tinta/50">{resultado.referencia}</span>}
                  </dt>
                  <dd className="whitespace-nowrap tabular-nums">− {money(resultado.trasladado)}</dd>
                </div>
              )}
              <div className="flex justify-between gap-3 border-t border-tinta/10 pt-1.5 font-semibold">
                <dt>Queda en el cajón para el próximo turno</dt>
                <dd className="whitespace-nowrap tabular-nums">{money(resultado.fondo)}</dd>
              </div>
              {resultado.fondoPedido !== null && dejaMenosDelFondo(resultado.fondo, resultado.fondoPedido) && (
                <div className="flex justify-between gap-3 text-ambar-profundo">
                  <dt>Dejaste menos del fondo</dt>
                  <dd className="whitespace-nowrap tabular-nums">pedía {money(resultado.fondoPedido)}</dd>
                </div>
              )}
              {resultado.quienCerro && (
                <div className="flex justify-between gap-3">
                  <dt className="text-tinta/60">Responsable del cierre</dt>
                  <dd>{resultado.quienCerro}</dd>
                </div>
              )}
              {resultado.efectivoEncoladoAlCerrar > 0 && (
                <div className="flex justify-between gap-3 text-ambar-profundo">
                  <dt>Ventas offline sin subir</dt>
                  <dd className="whitespace-nowrap tabular-nums">{money(resultado.efectivoEncoladoAlCerrar)}</dd>
                </div>
              )}
            </dl>
            {/* No afirma que esto explica TODA la diferencia (podría haber, además, un faltante real): solo pone el
                dato al lado para que nadie salte a «falta plata» sin saber que había ventas offline en camino. */}
            {resultado.efectivoEncoladoAlCerrar > 0 && (
              <p className="mx-auto max-w-[18rem] text-xs text-ambar-profundo">
                De esta diferencia, {money(resultado.efectivoEncoladoAlCerrar)} son ventas que ya cobraste sin conexión —
                el sistema todavía no las sumó. No es un error tuyo: suben solas apenas vuelva el internet.
              </p>
            )}
            <button type="button" autoFocus onClick={cerrar} className={`${botonPrimario} w-full`}>
              Listo
            </button>
          </div>
        )}
      </Modal>
    );
  }

  // Un solo <Modal> para los dos pasos: cambiar de paso cambia el contenido, no vuelve a montar el modal (si no, el
  // velo y la hoja volverían a entrar en cada «Continuar»).
  return (
    <Modal
      titulo={paso === "contar" ? "Cerrar caja" : "¿Qué haces con el efectivo?"}
      subtitulo={
        paso === "contar"
          ? "Cuenta el efectivo del cajón y escribe cuánto hay. Solo efectivo: tarjeta, Yape y Plin no se cuentan."
          : "Escribe cuánto vas a trasladar. Lo que no traslades se queda en el cajón para el próximo turno."
      }
      onClose={onClose}
      ancho="max-w-lg"
    >
      {(cerrar) =>
        paso === "contar" ? (
          <form key="contar"
            onSubmit={(e) => {
              e.preventDefault();
              if (contado === null) return;
              // El traslado viene propuesto para dejar justo el fondo de hoy; quien cierra lo puede cambiar.
              if (fondoPedido && trasladoTexto.trim() === "") {
                const propuesto = trasladoParaDejarFondo(contado, fondoPedido.monto);
                if (propuesto > 0) setTrasladoTexto(propuesto.toFixed(2));
              }
              setPaso("trasladar");
            }}
            className="space-y-4"
          >
            {barraPasos(1)}
            {avisoOffline}
            <div className="grid gap-3 sm:grid-cols-2">
              <section className="rounded-xl border border-sand bg-crema/60 p-3.5" aria-labelledby="cierre-sistema">
                <p id="cierre-sistema" className={campoEtiqueta}>
                  Según el sistema
                </p>
                {esperado ? (
                  <>
                    <p className="font-display mt-1 text-3xl tabular-nums text-tinta">{money(esperado.esperado)}</p>
                    <dl className="mt-2 space-y-0.5 text-xs text-tinta/65">
                      <Linea etiqueta="Apertura" valor={esperado.apertura} />
                      <Linea etiqueta="+ Ventas en efectivo" valor={esperado.ventasEfectivo} />
                      {esperado.ingresos > 0 && <Linea etiqueta="+ Ingresos" valor={esperado.ingresos} />}
                      {esperado.egresos > 0 && <Linea etiqueta="− Egresos" valor={esperado.egresos} />}
                      {esperado.reembolsos > 0 && <Linea etiqueta="− Reembolsos" valor={esperado.reembolsos} />}
                      {esperado.cambios !== 0 && <Linea etiqueta="± Diferencia de cambios" valor={esperado.cambios} />}
                      <div className="flex justify-between border-t border-sand pt-1 font-semibold text-tinta">
                        <dt>Debería haber</dt>
                        <dd className="tabular-nums">{money(esperado.esperado)}</dd>
                      </div>
                    </dl>
                  </>
                ) : falloEsperado ? (
                  <p className="mt-2 text-xs text-tinta/65">
                    No se pudo leer lo que espera el sistema. Puedes cerrar igual: al cerrar te decimos si cuadra.
                  </p>
                ) : (
                  <p className="mt-2 text-xs text-tinta/50">Calculando…</p>
                )}
              </section>
              <section className="rounded-xl border border-sand bg-papel p-3.5">
                <label htmlFor="cierre-monto" className={campoEtiqueta}>
                  Contado en físico
                </label>
                <div className="mt-1 flex items-baseline gap-1.5 border-b border-tinta/20 focus-within:border-rojo">
                  <span className="font-display text-xl text-tinta/50">S/</span>
                  <input
                    id="cierre-monto"
                    inputMode="decimal"
                    autoComplete="off"
                    autoFocus
                    placeholder="0.00"
                    value={contadoTexto}
                    onChange={(e) => setContadoTexto(e.target.value)}
                    className="font-display w-full bg-transparent py-1 text-3xl tabular-nums text-tinta outline-none"
                  />
                </div>
                <details className="mt-3 rounded-lg border border-dashed border-sand px-3 py-2">
                  <summary className="cursor-pointer text-xs font-semibold text-tinta/80">Contar por billetes y monedas</summary>
                  {/* Una fila por billete o moneda: denominación · cantidad · subtotal. En dos columnas el campo quedaba
                      de pocos píxeles dentro de la tarjeta y el número no se veía. */}
                  <div className="mt-2 space-y-1">
                    {DENOMINACIONES.map((d) => {
                      const cantidad = parseInt(billetes[d] ?? "", 10) || 0;
                      return (
                        <label key={d} className="grid grid-cols-[3.25rem_4rem_1fr] items-center gap-2 text-xs text-tinta/65">
                          <b className="font-semibold text-tinta">{d >= 1 ? `S/ ${d}` : `${Math.round(d * 100)} cts`}</b>
                          <input
                            inputMode="numeric"
                            placeholder="0"
                            value={billetes[d] ?? ""}
                            onChange={(e) => cambiarBillete(d, e.target.value.replace(/\D/g, ""))}
                            aria-label={`Cantidad de ${d >= 1 ? `billetes o monedas de ${d} soles` : `monedas de ${Math.round(d * 100)} céntimos`}`}
                            className="w-full rounded border border-sand bg-white px-2 py-1 text-right text-sm tabular-nums text-tinta outline-none focus:border-rojo"
                          />
                          <span className={`text-right tabular-nums ${cantidad > 0 ? "text-tinta" : "text-tinta/35"}`}>
                            {money(cantidad * d)}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </details>
              </section>
            </div>
            {diferencia !== null && (
              <p
                role="status"
                className={`rounded-lg px-3 py-2 text-sm ${cuadra(diferencia, 0) ? "bg-verde/10 text-verde-profundo" : "bg-rojo/10 text-rojo-profundo"}`}
              >
                {cuadra(diferencia, 0) ? (
                  <>
                    <b>Cuadra exacto.</b> Lo contado coincide con el sistema.
                  </>
                ) : (
                  <>
                    <b>
                      {diferencia > 0 ? "Sobran" : "Faltan"} {money(Math.abs(diferencia))}.
                    </b>{" "}
                    Vuelve a contar antes de seguir; si se confirma, queda registrado así.
                  </>
                )}
              </p>
            )}
            <div className="flex gap-2 pt-1">
              <button type="button" onClick={cerrar} className={botonCancelar}>
                Cancelar
              </button>
              <button type="submit" disabled={contado === null || contado < 0} className={botonPrimario}>
                Continuar
              </button>
            </div>
          </form>
        ) : (
        <form key="trasladar" onSubmit={cerrarCaja} className="space-y-4">
          {barraPasos(2)}
          <div className="flex items-baseline justify-between rounded-xl border border-sand bg-crema/60 px-3.5 py-2.5">
            <span className={campoEtiqueta}>Contaste</span>
            <span className="font-display text-2xl tabular-nums">{money(contado ?? 0)}</span>
          </div>
          {fondoPedido && (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-pizarra/30 bg-pizarra/10 px-3.5 py-2.5">
              <span className="text-sm font-semibold text-tinta">Deja {money(fondoPedido.monto)} para el próximo turno</span>
              <span className="text-xs text-pizarra">{fondoPedido.motivo}</span>
            </div>
          )}
          <div className="space-y-1.5">
            <label className={campoEtiqueta} htmlFor="traslado-monto">
              ¿Cuánto vas a trasladar?
            </label>
            <div className="flex items-baseline gap-1.5 border-b border-tinta/20 focus-within:border-rojo">
              <span className="font-display text-xl text-tinta/50">S/</span>
              <input
                id="traslado-monto"
                inputMode="decimal"
                autoComplete="off"
                autoFocus
                placeholder="0.00"
                value={trasladoTexto}
                onChange={(e) => {
                  setTrasladoTexto(e.target.value);
                  setPideConfirmar(false);
                }}
                className="font-display w-full bg-transparent py-1 text-3xl tabular-nums text-tinta outline-none"
              />
            </div>
          </div>
          {trasladado > 0 && (
            <div className="space-y-1">
              <CampoSelect
                etiqueta="¿A dónde va?"
                valor={destino}
                onValor={(v) => {
                  setDestino(v);
                  setReferencia("");
                }}
                opciones={DESTINOS_TRASLADO.map((d) => ({ valor: d.valor, texto: d.etiqueta }))}
              />
              {destinoElegido.referencia && (
                <CampoTexto
                  etiqueta={
                    destinoElegido.exigeReferencia ? destinoElegido.referencia : `${destinoElegido.referencia} (opcional)`
                  }
                  placeholder={destinoElegido.referencia}
                  value={referencia}
                  onChange={(e) => setReferencia(e.target.value)}
                />
              )}
            </div>
          )}
          <div className="flex items-center justify-between gap-3 rounded-xl border border-ambar/35 bg-ambar/10 px-3.5 py-2.5">
            <span className="label-cayla text-[10px] leading-snug text-ambar-profundo">
              Queda en el cajón
              <br />
              para el próximo turno
            </span>
            <span className={`font-display text-2xl tabular-nums ${fondo < 0 ? "text-rojo" : dejaMenos ? "text-ambar-profundo" : "text-tinta"}`}>{money(fondo)}</span>
          </div>
          {pideConfirmar && dejaMenos && fondoPedido && (
            <div role="alert" data-sin-cascada className="space-y-2 rounded-xl border border-ambar/35 bg-ambar/10 px-3.5 py-3 text-sm">
              <p className="font-semibold text-ambar-profundo">
                Vas a dejar {money(fondo)} y hoy se pide {money(fondoPedido.monto)}.
              </p>
              <p className="text-xs text-tinta/70">El próximo turno puede quedarse sin sencillo. Si cierras igual, queda anotado en el cierre.</p>
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  className={botonCancelar}
                  onClick={() => {
                    setTrasladoTexto(trasladoParaDejarFondo(contado ?? 0, fondoPedido.monto).toFixed(2));
                    setPideConfirmar(false);
                  }}
                >
                  Volver y dejar {money(fondoPedido.monto)}
                </button>
                <button type="button" className={botonPrimario} disabled={loading} onClick={() => cerrarCaja(null, true)}>
                  Cerrar igual
                </button>
              </div>
            </div>
          )}
          {invalido && trasladoTexto.trim() !== "" && (
            <p role="alert" className="rounded-lg bg-ambar/10 px-3 py-2 text-xs text-ambar-profundo">
              {invalido}
            </p>
          )}
          {avisoOffline}
          <ComboResponsable control={responsable} deshabilitado={loading} />
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={() => setPaso("contar")} className={botonCancelar}>
              Atrás
            </button>
            <button
              type="submit"
              disabled={loading || bloqueaCierre || !!invalido || !responsable.listo}
              title={responsable.motivo ?? invalido ?? undefined}
              className={botonPrimario}
            >
              {loading
                ? "Cerrando…"
                : bloqueaCierre
                  ? "Esperando ventas offline…"
                  : trasladado > 0
                    ? `Cerrar caja · trasladar ${money(trasladado)}`
                    : "Cerrar caja sin trasladar"}
            </button>
          </div>
        </form>
        )
      }
    </Modal>
  );
}

function Linea({ etiqueta, valor }: { etiqueta: string; valor: number }) {
  return (
    <div className="flex justify-between gap-2">
      <dt>{etiqueta}</dt>
      <dd className="tabular-nums">{money(valor)}</dd>
    </div>
  );
}
