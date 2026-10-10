"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import { Bike, Coffee, Droplet, Package, Paperclip, PencilLine, ShoppingBag, Smartphone, SprayCan, Star, Toilet, Wrench, Zap, type LucideIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { esperaOcupada, suscribirEspera } from "@/lib/espera-estado";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { Modal } from "@/components/ui/Modal";
import { Boton, CampoSelect, CampoTexto, Segmentado } from "@/components/ui/campos";
import { useSalidaSinGuardar } from "@/components/ui/useSalidaSinGuardar";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { useResponsable } from "@/lib/useResponsable";
import { firmar } from "@/lib/responsable-reglas";
import { soles } from "@/lib/compras-reglas";
import { partirSerieNumero, validarGasto, type CategoriaGasto } from "@/lib/gastos-reglas";
import {
  CLAVE_OTRO,
  DIAS_FRECUENCIA,
  GASTO_RAPIDO_VACIO,
  TEXTO_COMPROBANTE_RAPIDO,
  borradorDeGastoRapido,
  camposDeGastoRapido,
  categoriaDe,
  conceptoPorClave,
  ejemploSerie,
  limpiarMonto,
  nombreCategoria,
  opcionesOtro,
  textoVeces,
  type ComprobanteRapido,
  type ConceptoOrdenado,
  type EstadoGastoRapido,
} from "@/lib/gasto-rapido-reglas";

// Caja ▸ Registrar gasto, la versión rápida (maqueta A, Felipe 2026-10-09: docs/maquetas/gasto-rapido-caja-2026-10/).
// Un mosaico con lo que se paga en una tienda —ordenado por lo que más se usa en ESTA sede, con ★ y sus veces en los 4 primeros—,
// el monto (con los montos de siempre de ese concepto) y listo: sale del cajón abierto, al contado. La factura o boleta se abre
// solo si la dieron. La regla es la de Finanzas (`validarGasto` → `registrar_gasto`): esta hoja solo arma el borrador más corto.
// Movimiento rico por decisión de Felipe (ADR-0136, act. 2026-10-09): ola del mosaico, ★ que se dibuja, veces que cuentan, tinta que
// se derrama desde el clic, cifra del botón que sube, check que se dibuja al terminar. Sin rebote ni bucle; se apaga con reduced-motion.

const ICONOS: Record<string, LucideIcon> = {
  agua: Droplet,
  luz: Zap,
  internet: Smartphone,
  bano: Toilet,
  movilidad: Bike,
  envio: Package,
  bolsas: ShoppingBag,
  limpieza: SprayCan,
  utiles: Paperclip,
  arreglo: Wrench,
  refrigerio: Coffee,
  [CLAVE_OTRO]: PencilLine,
};

const ID_MONTO = "gasto-rapido-monto";
const ID_OTRO = "gasto-rapido-otro";
/** Cuánto se queda a la vista el «listo» antes de cerrar la hoja. */
const MS_LISTO = 1250;

export type ProveedorRapido = { id: string; nombre: string; ruc: string | null };

/** Un número que cuenta desde cero al aparecer (las «12 veces» de la ★). Con reduced-motion llega de una. */
function useCuenta(objetivo: number, retraso: number): number {
  const [n, setN] = useState(0);
  const [quieto] = useState(() => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const sinCuenta = quieto || objetivo <= 1;
  useEffect(() => {
    if (sinCuenta) return;
    let frame = 0;
    const inicio = performance.now() + retraso;
    const paso = (t: number) => {
      const p = Math.min(1, Math.max(0, (t - inicio) / 620));
      setN(Math.round(objetivo * (1 - Math.pow(1 - p, 3))));
      if (p < 1) frame = requestAnimationFrame(paso);
    };
    frame = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(frame);
  }, [objetivo, retraso, sinCuenta]);
  return sinCuenta ? objetivo : n;
}

function Baldosa({
  clave,
  nombre,
  veces,
  frecuente,
  indice,
  elegida,
  hayEleccion,
  onElegir,
}: {
  clave: string;
  nombre: string;
  veces: number;
  frecuente: boolean;
  indice: number;
  elegida: boolean;
  hayEleccion: boolean;
  onElegir: (e: MouseEvent<HTMLButtonElement>) => void;
}) {
  const Icono = ICONOS[clave] ?? PencilLine;
  const retrasoEstrella = 420 + indice * 40;
  const cuenta = useCuenta(frecuente ? veces : 0, retrasoEstrella);
  return (
    <button
      type="button"
      role="radio"
      aria-checked={elegida}
      aria-label={frecuente ? `${nombre}, de lo más frecuente: ${textoVeces(veces)} en ${DIAS_FRECUENCIA} días` : nombre}
      onClick={onElegir}
      data-otro={clave === CLAVE_OTRO || undefined}
      data-atenuada={hayEleccion && !elegida ? "" : undefined}
      className="gr-baldosa mov-boton"
      style={{ "--i": indice } as CSSProperties}
    >
      <span aria-hidden className="gr-tinta" />
      {frecuente && (
        <span aria-hidden className="gr-estrella" style={{ "--retraso": `${retrasoEstrella}ms` } as CSSProperties}>
          <Star strokeWidth={1.8} />
        </span>
      )}
      <Icono aria-hidden key={elegida ? "si" : "no"} className="gr-icono" strokeWidth={1.6} />
      <span className="gr-nombre">{nombre}</span>
      {frecuente && <span className="gr-veces tabular-nums">{textoVeces(cuenta)}</span>}
    </button>
  );
}

export function GastoRapidoModal({
  caja,
  ubicacionNombre,
  conceptos,
  categorias,
  proveedores,
  hoy,
  onCerrar,
  onFormularioCompleto,
}: {
  caja: { id: string; ubicacionId: string };
  ubicacionNombre: string;
  /** Ya ordenados por frecuencia en la sede (`ordenarPorFrecuencia`, en el servidor). */
  conceptos: ConceptoOrdenado[];
  categorias: CategoriaGasto[];
  proveedores: ProveedorRapido[];
  hoy: string;
  onCerrar: () => void;
  /** «Proveedor nuevo o a crédito»: abre el formulario completo de Finanzas ▸ Gastos. */
  onFormularioCompleto?: () => void;
}) {
  const router = useRouter();
  const responsable = useResponsable();
  const [e, setE] = useState<EstadoGastoRapido>(GASTO_RAPIDO_VACIO);
  const [documento, setDocumento] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [listo, setListo] = useState<{ que: string; monto: number } | null>(null);
  const [token] = useState(() => crypto.randomUUID());
  const montoRef = useRef<HTMLInputElement>(null);
  const poner = <K extends keyof EstadoGastoRapido>(k: K, v: EstadoGastoRapido[K]) => setE((x) => ({ ...x, [k]: v }));

  const elegido = conceptos.find((c) => c.concepto.clave === e.concepto) ?? null;
  const esOtro = e.concepto === CLAVE_OTRO;
  const categoria = nombreCategoria(categorias, categoriaDe(e));
  const hayFrecuentes = conceptos.some((c) => c.frecuente);

  const campos = [
    ...camposDeGastoRapido(e),
    {
      id: "responsable",
      nombre: "Responsable",
      requerido: true,
      hecho: responsable.listo,
      pendiente: responsable.motivo ?? "Elige quién lo registra.",
    },
  ];
  const guia = useGuiaCampos(campos);
  const montoNumero = Number(e.monto);
  const montoListo = campos.some((c) => c.id === "monto" && c.hecho);

  const avisoSalida = useSalidaSinGuardar(
    JSON.stringify(e) !== JSON.stringify(GASTO_RAPIDO_VACIO) && !listo,
    "Llenaste parte de este gasto y todavía no se registró. Si cierras ahora, se pierde lo que llenaste.",
  );

  function elegir(clave: string, ev: MouseEvent<HTMLButtonElement>) {
    // La tinta se derrama desde donde tocaste (con el teclado, desde el centro).
    const r = ev.currentTarget.getBoundingClientRect();
    const x = ev.clientX ? ev.clientX - r.left : r.width / 2;
    const y = ev.clientY ? ev.clientY - r.top : r.height / 2;
    ev.currentTarget.style.setProperty("--x", `${x}px`);
    ev.currentTarget.style.setProperty("--y", `${y}px`);
    setE((x0) => ({ ...x0, concepto: clave }));
    // Lo que sigue: «qué fue» en Otro; si no, el monto (si todavía no está).
    requestAnimationFrame(() => {
      if (clave === CLAVE_OTRO) document.getElementById(ID_OTRO)?.focus();
      else if (!e.monto) montoRef.current?.focus({ preventScroll: true });
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
    const v = validarGasto(borradorDeGastoRapido(e, caja, hoy), hoy);
    if (!v.ok) return avisar.error(v.error);
    setGuardando(true);
    const { error } = await firmar(createClient().rpc("registrar_gasto" as never, { ...v.valor, p_token: token } as never), responsable.firma());
    setGuardando(false);
    responsable.despues(error);
    if (error) return avisar.error(traducirError(error, "registrar el gasto"));
    const que = esOtro ? e.otroTexto.trim() : (conceptoPorClave(e.concepto)?.nombre ?? "Gasto");
    setListo({ que, monto: v.valor.p_monto_total });
  }

  // El sello de «listo» sale DESPUÉS del loader, nunca debajo (la regla de ADR-0149: primero «espera», después «listo»). Una vez a la
  // vista se queda un momento, y después la hoja se cierra y Caja se refresca (el cajón ya lo descuenta).
  const pantallaLibre = useSyncExternalStore(suscribirEspera, () => !esperaOcupada(), () => true);
  const [selloAlaVista, setSelloAlaVista] = useState(false);
  // Una vez a la vista se queda, aunque el refresco de después vuelva a ocupar la pantalla (se ajusta al dibujar, sin efecto).
  if (listo && pantallaLibre && !selloAlaVista) setSelloAlaVista(true);
  useEffect(() => {
    if (!listo || !selloAlaVista) return;
    const corto = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const t = window.setTimeout(() => {
      avisar.exito("Gasto registrado", { detalle: `${listo.que} · ${soles(listo.monto)}. Salió del cajón: la caja ya lo descuenta.` });
      const guardiaFuera = avisoSalida.retirarYa();
      onCerrar();
      void guardiaFuera.then(() => router.refresh());
    }, corto ? 500 : MS_LISTO);
    return () => window.clearTimeout(t);
    // Solo al aparecer el sello: lo demás no cambia mientras se ve.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selloAlaVista]);

  const textoBoton = montoListo ? `Registrar ${soles(montoNumero)}` : "Registrar gasto";

  return (
    <Modal
      variante="hoja"
      titulo="Registrar gasto"
      subtitulo={
        <span className="inline-flex items-center gap-2">
          <span aria-hidden className="gr-punto" />
          Sale del cajón de {ubicacionNombre}, que está abierto.
        </span>
      }
      onClose={() => avisoSalida.pedirAccion(onCerrar)}
      bloqueado={guardando}
      ancho="max-w-[560px]"
    >
      {(cerrar) => (
        <form onSubmit={guardar} className="gr-hoja relative space-y-5" noValidate>
          <CampoGuiado
            id="concepto"
            guia={guia}
            titulo="¿En qué se gastó?"
            ayuda={
              hayFrecuentes ? (
                <span className="inline-flex items-center gap-1">
                  <Star aria-hidden className="gr-estrella-chica" strokeWidth={1.8} /> lo más frecuente aquí en {DIAS_FRECUENCIA} días
                </span>
              ) : undefined
            }
          >
            <div role="radiogroup" aria-label="En qué se gastó" className="gr-mosaico">
              {conceptos.map((c, i) => (
                <Baldosa
                  key={c.concepto.clave}
                  clave={c.concepto.clave}
                  nombre={c.concepto.nombre}
                  veces={c.veces}
                  frecuente={c.frecuente}
                  indice={i}
                  elegida={e.concepto === c.concepto.clave}
                  hayEleccion={e.concepto !== ""}
                  onElegir={(ev) => elegir(c.concepto.clave, ev)}
                />
              ))}
              <Baldosa
                clave={CLAVE_OTRO}
                nombre="Otro"
                veces={0}
                frecuente={false}
                indice={conceptos.length}
                elegida={esOtro}
                hayEleccion={e.concepto !== ""}
                onElegir={(ev) => elegir(CLAVE_OTRO, ev)}
              />
            </div>
            <p className="gr-va-a" aria-live="polite">
              {categoria ? (
                <span key={categoria} className="gr-va-a-texto">
                  Va a <b>{categoria}</b>. Nadie la elige: viene con lo que tocaste.
                </span>
              ) : esOtro ? (
                <span key="otro" className="gr-va-a-texto">
                  Di qué fue y a qué se parece: así llega a su cuenta.
                </span>
              ) : (
                " "
              )}
            </p>
          </CampoGuiado>

          <div className="gr-plegable" data-abierto={esOtro || undefined} data-sin-cascada>
            <div className="gr-plegable-dentro">
              <div className="grid gap-3 pt-1 sm:grid-cols-2">
                <CampoGuiado id="otro-texto" guia={guia} titulo="Qué fue">
                  <CampoTexto
                    id={ID_OTRO}
                    etiqueta="Qué fue"
                    caja
                    value={e.otroTexto}
                    onChange={(ev) => poner("otroTexto", ev.target.value)}
                    tabIndex={esOtro ? 0 : -1}
                  />
                </CampoGuiado>
                <CampoGuiado id="otro-categoria" guia={guia} titulo="¿A qué se parece?">
                  <CampoSelect
                    etiqueta="¿A qué se parece?"
                    caja
                    valor={e.otroCategoria}
                    onValor={(v) => poner("otroCategoria", v)}
                    opciones={opcionesOtro(categorias)}
                    marcador="Elige a qué se parece…"
                    deshabilitado={!esOtro}
                  />
                </CampoGuiado>
              </div>
            </div>
          </div>

          <CampoGuiado id="monto" guia={guia} titulo="¿Cuánto?">
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
                onChange={(ev) => poner("monto", limpiarMonto(ev.target.value))}
                className="gr-monto-input"
              />
            </label>
            {elegido && elegido.montos.length > 0 && (
              <div key={elegido.concepto.clave} className="gr-montos" aria-label={`Lo de siempre en ${elegido.concepto.nombre.toLowerCase()}`}>
                <span className="gr-montos-titulo">Lo de siempre:</span>
                {elegido.montos.map((m, i) => (
                  <button
                    key={m}
                    type="button"
                    className="pildora-cayla gr-monto-chip"
                    data-activa={Number(e.monto) === m || undefined}
                    style={{ "--i": i } as CSSProperties}
                    onClick={() => poner("monto", m.toFixed(2))}
                  >
                    {soles(m)}
                  </button>
                ))}
              </div>
            )}
          </CampoGuiado>

          <CampoGuiado id="nota" guia={guia} titulo="Nota">
            <CampoTexto etiqueta="Nota" caja value={e.nota} onChange={(ev) => poner("nota", ev.target.value)} maxLength={120} />
          </CampoGuiado>

          <div className="gr-factura" data-abierto={e.conComprobante || undefined}>
            <button
              type="button"
              className="gr-factura-boton"
              aria-expanded={e.conComprobante}
              onClick={() => poner("conComprobante", !e.conComprobante)}
            >
              <span aria-hidden className="gr-factura-mas" />
              ¿Te dieron factura o boleta?
            </button>
            <div className="gr-plegable" data-abierto={e.conComprobante || undefined} data-sin-cascada>
              <div className="gr-plegable-dentro">
                <div className="space-y-3 pt-3">
                  <Segmentado<ComprobanteRapido>
                    etiqueta="Comprobante"
                    valor={e.comprobante}
                    onValor={(v) => poner("comprobante", v)}
                    opciones={(Object.keys(TEXTO_COMPROBANTE_RAPIDO) as ComprobanteRapido[]).map((t) => ({ valor: t, texto: TEXTO_COMPROBANTE_RAPIDO[t] }))}
                  />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <CampoGuiado id="proveedor" guia={guia} titulo="Proveedor">
                      <CampoSelect
                        etiqueta="Proveedor"
                        caja
                        valor={e.proveedorId}
                        onValor={(v) => poner("proveedorId", v)}
                        opciones={proveedores.map((p) => ({ valor: p.id, texto: `${p.nombre}${p.ruc ? ` · ${p.ruc}` : ""}` }))}
                        marcador="Elige el proveedor…"
                        deshabilitado={!e.conComprobante}
                      />
                    </CampoGuiado>
                    <CampoGuiado id="documento" guia={guia} titulo="Serie y número">
                      <CampoTexto
                        etiqueta="Serie y número"
                        caja
                        mono
                        value={documento}
                        placeholder={ejemploSerie(e.comprobante)}
                        tabIndex={e.conComprobante ? 0 : -1}
                        onChange={(ev) => {
                          const texto = ev.target.value.toUpperCase();
                          setDocumento(texto);
                          const partes = partirSerieNumero(texto);
                          setE((x) => ({ ...x, serie: partes.serie, numero: partes.numero }));
                        }}
                      />
                    </CampoGuiado>
                  </div>
                  {onFormularioCompleto && (
                    <p className="text-[12.5px] text-taupe">
                      ¿Proveedor nuevo, o se paga a crédito?{" "}
                      <button type="button" className="btn-enlace" onClick={onFormularioCompleto}>
                        Usa el formulario completo
                      </button>
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>

          <CampoGuiado id="responsable" guia={guia}>
            <ComboResponsable control={responsable} deshabilitado={guardando} />
          </CampoGuiado>

          <div className="pie-hoja-fijo flex flex-wrap items-center gap-x-3 gap-y-2 pt-2">
            <PieGuia guia={guia} listo="Todo listo: sale del cajón." />
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
              <p className="gr-listo-detalle">Salió del cajón: la caja ya lo descuenta.</p>
            </div>
          )}
          {avisoSalida.aviso}
        </form>
      )}
    </Modal>
  );
}
