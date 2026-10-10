"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type MouseEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Landmark, PencilLine, Scale, Store, Undo2, UserRound, type LucideIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { esperaOcupada, suscribirEspera } from "@/lib/espera-estado";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { Modal } from "@/components/ui/Modal";
import { Boton, CampoSelect, CampoTexto } from "@/components/ui/campos";
import { useSalidaSinGuardar } from "@/components/ui/useSalidaSinGuardar";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { Baldosa } from "@/components/GastoRapidoModal";
import { useResponsable } from "@/lib/useResponsable";
import { firmar } from "@/lib/responsable-reglas";
import { soles } from "@/lib/compras-reglas";
import {
  INGRESO_RAPIDO_VACIO,
  OPCIONES_DE_DONDE_LIDER,
  conceptoIngresoPorClave,
  conceptosIngresoVisibles,
  limpiarMontoIngreso,
  validarIngreso,
  camposDeIngresoRapido,
  type ClaveIngreso,
  type EstadoIngresoRapido,
  type SedeIngreso,
} from "@/lib/ingreso-rapido-reglas";

// Caja ▸ Registrar ingreso (Felipe 2026-10-10): la hermana del gasto rápido, con su misma hoja, su mosaico y su sello. Reemplaza a
// «Depósito o retiro» en la cabecera de Caja: aquí solo ENTRA plata al cajón abierto, en efectivo y hoy. Cada concepto ya trae su
// motivo de la base (20261010220000) y pide lo que hace falta para rastrearlo al cerrar: quién la trajo y de qué plata es, qué sede
// la presta o qué fue. Guarda con `registrar_ingreso_caja` (20261010220100), que en la misma operación baja la cuenta de donde sale
// la plata: la caja fuerte, el efectivo por rendir o el cajón de la otra sede (o la anota como aporte del dueño). Movimiento: el del gasto rápido (ADR-0136 act. 2026-10-09), heredado de sus mismas clases `gr-*`.

const ICONOS: Record<ClaveIngreso, LucideIcon> = {
  caja_fuerte: Landmark,
  lider: UserRound,
  otra_sede: Store,
  vuelve_retiro: Undo2,
  sobrante: Scale,
  otro: PencilLine,
};

const ID_MONTO = "ingreso-rapido-monto";
const ID_DETALLE: Partial<Record<ClaveIngreso, string>> = {
  lider: "ingreso-rapido-quien",
  otro: "ingreso-rapido-otro",
};
/** Cuánto se queda a la vista el «listo» antes de cerrar la hoja (el mismo tiempo que el gasto rápido). */
const MS_LISTO = 1250;

export function IngresoRapidoModal({
  caja,
  ubicacionNombre,
  esLider,
  sedes,
  accesos,
  onCerrar,
  onRetiro,
}: {
  caja: { id: string; ubicacionId: string };
  ubicacionNombre: string;
  esLider: boolean;
  /** Las otras sedes activas, para «Préstamo de otra sede» (sin la de esta caja). */
  sedes: SedeIngreso[];
  /** Adónde va lo que NO es un ingreso de caja: solo los módulos que la cuenta ve. */
  accesos: { vender: boolean; apartados: boolean };
  onCerrar: () => void;
  /** «¿Sale plata y no es un gasto?»: abre el retiro o depósito. */
  onRetiro?: () => void;
}) {
  const router = useRouter();
  const responsable = useResponsable();
  const [e, setE] = useState<EstadoIngresoRapido>(INGRESO_RAPIDO_VACIO);
  const [guardando, setGuardando] = useState(false);
  const [listo, setListo] = useState<{ que: string; monto: number } | null>(null);
  const [token] = useState(() => crypto.randomUUID());
  const montoRef = useRef<HTMLInputElement>(null);
  const poner = <K extends keyof EstadoIngresoRapido>(k: K, v: EstadoIngresoRapido[K]) => setE((x) => ({ ...x, [k]: v }));

  const conceptos = conceptosIngresoVisibles(esLider);
  const elegido = conceptoIngresoPorClave(e.concepto);
  const detalle = elegido?.detalle ?? "ninguno";
  const deDondeElegido = OPCIONES_DE_DONDE_LIDER.find((o) => o.valor === e.deDonde) ?? null;

  const campos = [
    ...camposDeIngresoRapido(e),
    {
      id: "responsable",
      nombre: "Responsable",
      requerido: true,
      hecho: responsable.listo,
      pendiente: responsable.motivo ?? "Elige quién lo registra.",
    },
  ];
  const guia = useGuiaCampos(campos);
  const montoListo = campos.some((c) => c.id === "monto" && c.hecho);

  const avisoSalida = useSalidaSinGuardar(
    JSON.stringify(e) !== JSON.stringify(INGRESO_RAPIDO_VACIO) && !listo,
    "Llenaste parte de este ingreso y todavía no se registró. Si cierras ahora, se pierde lo que llenaste.",
  );

  function elegir(clave: ClaveIngreso, ev: MouseEvent<HTMLButtonElement>) {
    // La tinta se derrama desde donde tocaste (con el teclado, desde el centro), como en el gasto rápido.
    const r = ev.currentTarget.getBoundingClientRect();
    ev.currentTarget.style.setProperty("--x", `${ev.clientX ? ev.clientX - r.left : r.width / 2}px`);
    ev.currentTarget.style.setProperty("--y", `${ev.clientY ? ev.clientY - r.top : r.height / 2}px`);
    setE((x) => ({ ...x, concepto: clave }));
    // Lo que sigue: el dato que pide el concepto (si se escribe); si no, el monto (si todavía no está).
    requestAnimationFrame(() => {
      const id = ID_DETALLE[clave];
      // «Lo trae el líder» primero pregunta de qué plata es (dos píldoras): el cursor va a «quién» después de elegir.
      if (id && clave !== "lider") document.getElementById(id)?.focus();
      else if (!e.monto && conceptoIngresoPorClave(clave)?.detalle === "ninguno") montoRef.current?.focus({ preventScroll: true });
    });
  }

  async function guardar(ev?: React.FormEvent) {
    ev?.preventDefault();
    if (guardando || listo) return;
    if (!guia.puedeConfirmar) {
      const primero = guia.faltan[0];
      if (primero) guia.ir(primero.id);
      if (responsable.motivo && primero?.id === "responsable") avisar.error(responsable.motivo);
      return;
    }
    const v = validarIngreso(e, sedes, esLider);
    if (!v.ok) return avisar.error(v.error);
    setGuardando(true);
    const { error } = await firmar(
      createClient().rpc(
        "registrar_ingreso_caja" as never,
        {
          p_caja_id: caja.id,
          p_concepto: v.valor.p_concepto,
          p_monto: v.valor.p_monto,
          p_nota: v.valor.p_nota,
          p_de_donde: v.valor.p_de_donde,
          p_sede_origen_id: v.valor.p_sede_origen_id,
          p_token: token,
        } as never,
      ),
      responsable.firma(),
    );
    setGuardando(false);
    responsable.despues(error);
    if (error) return avisar.error(traducirError(error, "registrar el ingreso"));
    setListo({ que: elegido?.nombre ?? "Ingreso", monto: v.valor.p_monto });
  }

  // El sello sale DESPUÉS del loader (ADR-0149), se queda un momento y la hoja se cierra; Caja se refresca (el cajón ya lo suma).
  const pantallaLibre = useSyncExternalStore(
    suscribirEspera,
    () => !esperaOcupada(),
    () => true,
  );
  const [selloAlaVista, setSelloAlaVista] = useState(false);
  if (listo && pantallaLibre && !selloAlaVista) setSelloAlaVista(true);
  useEffect(() => {
    if (!listo || !selloAlaVista) return;
    const corto = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const t = window.setTimeout(
      () => {
        avisar.exito("Ingreso registrado", {
          detalle: `${listo.que} · ${soles(listo.monto)}. Entró al cajón: la caja ya lo suma.`,
        });
        const guardiaFuera = avisoSalida.retirarYa();
        onCerrar();
        void guardiaFuera.then(() => router.refresh());
      },
      corto ? 500 : MS_LISTO,
    );
    return () => window.clearTimeout(t);
    // Solo al aparecer el sello: lo demás no cambia mientras se ve.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selloAlaVista]);

  const textoBoton = montoListo ? `Registrar ${soles(Number(e.monto))}` : "Registrar ingreso";

  return (
    <Modal
      variante="hoja"
      titulo="Registrar ingreso"
      subtitulo={
        <span className="inline-flex items-center gap-2">
          <span aria-hidden className="gr-punto" />
          Entra al cajón de {ubicacionNombre}, que está abierto.
        </span>
      }
      onClose={() => avisoSalida.pedirAccion(onCerrar)}
      bloqueado={guardando}
      ancho="max-w-[560px]"
    >
      {(cerrar) => (
        <form onSubmit={guardar} className="gr-hoja relative space-y-5" noValidate>
          <CampoGuiado id="concepto" guia={guia} titulo="¿De dónde viene la plata?">
            <div role="radiogroup" aria-label="De dónde viene la plata" className="gr-mosaico" data-columnas="3">
              {conceptos.map((c, i) => (
                <Baldosa
                  key={c.clave}
                  clave={c.clave}
                  nombre={c.nombre}
                  Icono={ICONOS[c.clave]}
                  veces={0}
                  frecuente={false}
                  indice={i}
                  elegida={e.concepto === c.clave}
                  hayEleccion={e.concepto !== ""}
                  onElegir={(ev) => elegir(c.clave, ev)}
                />
              ))}
            </div>
            <p className="gr-va-a" aria-live="polite">
              {elegido ? (
                <span key={elegido.clave} className="gr-va-a-texto">
                  {elegido.deDonde}
                </span>
              ) : (
                " "
              )}
            </p>
          </CampoGuiado>

          {/* Lo que pide cada concepto. Uno solo a la vez, en un bloque: los cerrados no dejan aire entre el mosaico y el monto. */}
          <div>
            <div className="gr-plegable" data-abierto={detalle === "quien" || undefined} data-sin-cascada>
              <div className="gr-plegable-dentro space-y-3">
                <CampoGuiado id="de-donde" guia={guia} titulo="¿De qué plata es?">
                  <div role="radiogroup" aria-label="De qué plata es" className="flex flex-wrap gap-2">
                    {OPCIONES_DE_DONDE_LIDER.map((o) => (
                      <button
                        key={o.valor}
                        type="button"
                        role="radio"
                        aria-checked={e.deDonde === o.valor}
                        data-activa={e.deDonde === o.valor || undefined}
                        tabIndex={detalle === "quien" ? 0 : -1}
                        className="pildora-cayla"
                        onClick={() => {
                          poner("deDonde", o.valor);
                          requestAnimationFrame(() => document.getElementById(ID_DETALLE.lider ?? "")?.focus());
                        }}
                      >
                        {o.texto}
                      </button>
                    ))}
                  </div>
                  <p className="gr-va-a" aria-live="polite">
                    {deDondeElegido ? (
                      <span key={deDondeElegido.valor} className="gr-va-a-texto">
                        {deDondeElegido.ayuda}
                      </span>
                    ) : (
                      " "
                    )}
                  </p>
                </CampoGuiado>
                <CampoGuiado id="quien" guia={guia} titulo="¿Quién la trajo?">
                  <CampoTexto
                    id={ID_DETALLE.lider}
                    etiqueta="¿Quién la trajo?"
                    caja
                    value={e.quien}
                    onChange={(ev) => poner("quien", ev.target.value)}
                    maxLength={80}
                    tabIndex={detalle === "quien" ? 0 : -1}
                  />
                </CampoGuiado>
              </div>
            </div>
            <div className="gr-plegable" data-abierto={detalle === "sede" || undefined} data-sin-cascada>
              <div className="gr-plegable-dentro">
                <CampoGuiado id="sede" guia={guia} titulo="¿Qué sede la presta?">
                  <CampoSelect
                    etiqueta="¿Qué sede la presta?"
                    caja
                    valor={e.sedeId}
                    onValor={(v) => poner("sedeId", v)}
                    opciones={sedes.map((s) => ({
                      valor: s.id,
                      texto: s.nombre,
                    }))}
                    marcador="Elige la sede…"
                    deshabilitado={detalle !== "sede"}
                  />
                </CampoGuiado>
              </div>
            </div>
            <div className="gr-plegable" data-abierto={detalle === "que" || undefined} data-sin-cascada>
              <div className="gr-plegable-dentro">
                <CampoGuiado id="otro-texto" guia={guia} titulo="Qué fue">
                  <CampoTexto
                    id={ID_DETALLE.otro}
                    etiqueta="Qué fue"
                    caja
                    value={e.otroTexto}
                    onChange={(ev) => poner("otroTexto", ev.target.value)}
                    maxLength={120}
                    tabIndex={detalle === "que" ? 0 : -1}
                  />
                </CampoGuiado>
              </div>
            </div>
          </div>

          <CampoGuiado id="monto" guia={guia} titulo="¿Cuánto entra?">
            <label className="gr-monto caja-cayla" data-listo={montoListo || undefined}>
              <span aria-hidden className="gr-monto-moneda">
                S/
              </span>
              <input
                ref={montoRef}
                id={ID_MONTO}
                inputMode="decimal"
                autoComplete="off"
                aria-label="Monto en soles"
                // sugerir-fijo: es el formato del monto en soles, no depende de lo elegido
                placeholder="0.00"
                value={e.monto}
                onChange={(ev) => poner("monto", limpiarMontoIngreso(ev.target.value))}
                className="gr-monto-input"
              />
            </label>
          </CampoGuiado>

          <CampoGuiado id="nota" guia={guia} titulo="Nota">
            <CampoTexto etiqueta="Nota" caja value={e.nota} onChange={(ev) => poner("nota", ev.target.value)} maxLength={120} />
          </CampoGuiado>

          {(accesos.apartados || accesos.vender || onRetiro) && (
            <div className="gr-factura space-y-1.5 text-[12.5px] text-taupe">
              {(accesos.apartados || accesos.vender) && (
                <p>
                  Un abono de apartado o una venta no van aquí: se cobran en{" "}
                  {accesos.apartados && (
                    <Link href="/vender/apartados" className="btn-enlace">
                      Apartados
                    </Link>
                  )}
                  {accesos.apartados && accesos.vender && " o en "}
                  {accesos.vender && (
                    <Link href="/vender" className="btn-enlace">
                      Vender
                    </Link>
                  )}
                  .
                </p>
              )}
              {onRetiro && (
                <p>
                  ¿Sale plata del cajón y no es un gasto?{" "}
                  <button type="button" className="btn-enlace" onClick={onRetiro}>
                    Retiro o depósito
                  </button>
                </p>
              )}
            </div>
          )}

          <CampoGuiado id="responsable" guia={guia}>
            <ComboResponsable control={responsable} deshabilitado={guardando} />
          </CampoGuiado>

          <div className="pie-hoja-fijo flex flex-wrap items-center gap-x-3 gap-y-2 pt-2">
            <PieGuia guia={guia} listo="Todo listo: entra al cajón." />
            <div className="ml-auto flex gap-3">
              <Boton type="button" onClick={() => avisoSalida.pedirAccion(cerrar)} disabled={guardando}>
                Cancelar
              </Boton>
              <Boton
                type="submit"
                peso="primario"
                cargando={guardando}
                title={guia.frase ?? undefined}
                aria-disabled={!guia.puedeConfirmar || undefined}
                className={`gr-registrar ${guia.claseConfirmar}`}
              >
                <span key={textoBoton} className="gr-registrar-texto tabular-nums">
                  {textoBoton}
                </span>
              </Boton>
            </div>
          </div>

          {listo && selloAlaVista && (
            <div className="gr-listo" role="status" data-sin-cascada>
              <svg viewBox="0 0 52 52" aria-hidden className="gr-listo-sello">
                <circle cx="26" cy="26" r="23" className="gr-listo-aro" />
                <path d="M15 27l7.5 7.5L37.5 19" className="gr-listo-check" />
              </svg>
              <p className="gr-listo-titulo font-display">{soles(listo.monto)}</p>
              <p className="gr-listo-que">{listo.que}</p>
              <p className="gr-listo-detalle">Entró al cajón: la caja ya lo suma.</p>
            </div>
          )}
          {avisoSalida.aviso}
        </form>
      )}
    </Modal>
  );
}
