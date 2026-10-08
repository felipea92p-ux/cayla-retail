"use client";

import { useEffect, useRef, useState, type ComponentType, type KeyboardEvent as KeyboardEventReact, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Bandage, PencilLine, Truck, Warehouse } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { avisar } from "@/components/ui/Avisos";
import { avisarDestacado } from "@/components/ui/AvisoDestacado";
import { IconoPercha } from "@/components/ui/IconoPercha";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { useResponsable } from "@/lib/useResponsable";
import { firmar } from "@/lib/responsable-reglas";
import { sonarConfirmacion } from "@/lib/sonido-confirmar";
import { esFalloDeRed, esRespuestaIncierta, traducirError, type ErrorEscritura } from "@/lib/error-escritura";
// La caja del almacén en «Así va a quedar» (2026-10-07).
import { Archive } from "lucide-react";
import { argumentosDeBajada, formatearHoraLima, interpretarErrorDeBajada, itemsParaRpc, leerRespuestaDeBajada, respuestaResuelveLaMarca, RPC_BAJADA, textoMarcaSinResolver, type LineaBajada } from "@/lib/bajada-reglas";
import { argumentosDeRetiro, interpretarErrorDeRetiro, leerRespuestaDeRetiro, MAX_NOTA_RETIRO, respuestaResuelveLaMarcaDeRetiro, RPC_RETIRO, textoDelBloqueSubir, textoMarcaSinResolverDeRetiro, tituloDeExitoRetiro } from "@/lib/retiro-reglas";
import { RPC_SUBIR_PARA_ENVIAR } from "@/lib/para-enviar-reglas";
import { argumentosDeReporte, cantidadAjustada, desdeInicial, interpretarErrorDeDanada, leerRespuestaDanada, MAX_TEXTO_DANADA, puedeEnviarReporte, quePasaAlReportar, recordatorioAlReportar, respuestaResuelveLaMarca as reporteResuelveLaMarca, RPC_REPORTAR_DANADA, tallasReportables, textoBotonReportar, tituloExitoReporte } from "@/lib/danadas-reglas";
import { argumentosDeAjuste, faltantesDesdeJson } from "@/lib/ajuste-reglas";
import { cantidadesDeLoQueFalta, coloresParaMover, detalleDeLoMovido, leerCantidadTecleada, lineasDeMoverModelo, tallasParaReponer, tallasQueFaltan, textoFilaSinAlcance } from "@/lib/reponer-prenda-reglas";
import { celdaColgarVarias, celdaSubirVarias, llenarTodasCon, totalesColgar } from "@/lib/colgar-varias-tabla";
import { lineasEnUrl, type PrendaAgrupada } from "@/lib/existencias-prendas";
import { RUTA_NUEVO_TRASLADO } from "@/lib/traslados-reglas";
import { nombreCortoSede } from "@/lib/stock-por-sede";
import {
  ETIQUETA_PASO,
  FALTA_PASO,
  NOMBRE_FLUJO,
  celularValido,
  faltanHasta,
  asiQueda,
  maxCantidad,
  motivoParaLaBase,
  motivoPideNotaFlujo,
  motivosDeAjuste,
  pasoCompleto,
  pasosDe,
  quedaTrasAjuste,
  resumenDeFlujo,
  textoHecho,
  totalVarias,
  verboFinal,
  type ContextoFlujo,
  type LadoMovido,
  type DatosFlujo,
  type PasoFlujo,
  type SedeConCantidad,
  type TipoFlujo,
} from "@/lib/existencias-flujos";
import type { FilaExistencias } from "@/lib/inventario-v2";
import { Volver } from "@/components/ui/Volver";
import { Aviso } from "@/components/ui/Aviso";

type Prenda = PrendaAgrupada<FilaExistencias>;

/** Sin tope, una conexión colgada dejaría el paso bloqueado para siempre: a los 20 s se trata como un corte (como las ventanas). */
const TOPE_ESPERA_MS = 20_000;

const TEXTO_INCIERTO = "Se cortó la conexión y no sabemos si se guardó. Toca el botón otra vez: con la misma marca, si ya se guardó no se repite.";

const ICONO_FINAL: Record<TipoFlujo, ComponentType<{ className?: string; strokeWidth?: number; "aria-hidden"?: boolean }>> = {
  colgar: IconoPercha,
  colgarVarias: IconoPercha,
  subir: Warehouse,
  subirVarias: Warehouse,
  enviar: Truck,
  pedir: ArrowRight,
  ajustar: PencilLine,
  danada: Bandage,
};

const unidades = (n: number) => `${n} ${n === 1 ? "unidad" : "unidades"}`;

/** Una opción grande de la maqueta (`.opcion`): título y una línea debajo; marcada, en tinta. */
function Opcion({ marcada, titulo, sub, onClick, deshabilitada = false }: { marcada: boolean; titulo: ReactNode; sub?: ReactNode; onClick: () => void; deshabilitada?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={marcada}
      disabled={deshabilitada}
      onClick={onClick}
      className="grid min-h-14 content-center gap-0.5 rounded-2xl border border-sand bg-papel px-3.5 py-2.5 text-left transition-colors hover:border-taupe disabled:cursor-not-allowed disabled:opacity-45 aria-pressed:border-tinta aria-pressed:bg-tinta aria-pressed:text-papel [&[aria-pressed=true]_small]:text-sand"
    >
      <b className="text-[15px] font-semibold">{titulo}</b>
      {sub && <small className="text-xs leading-snug text-taupe">{sub}</small>}
    </button>
  );
}

/** − número + (la maqueta: `.stepper`). Se puede escribir el número; nunca pasa del tope ni baja de 0. */
function Stepper({ valor, max, onValor, etiqueta, id }: { valor: number; max: number | null; onValor: (n: number) => void; etiqueta: string; id: string }) {
  const tope = max ?? Number.POSITIVE_INFINITY;
  return (
    <div className="inline-flex items-center overflow-hidden rounded-2xl border border-sand bg-papel">
      <button type="button" aria-label="Una menos" disabled={valor <= 0} onClick={() => onValor(Math.max(0, valor - 1))} className="grid h-14 w-14 place-items-center text-2xl text-tinta disabled:text-taupe/40">
        −
      </button>
      <input
        id={id}
        inputMode="numeric"
        autoComplete="off"
        aria-label={etiqueta}
        value={valor}
        onChange={(e) => onValor(leerCantidadTecleada(e.target.value, tope))}
        className="h-14 w-16 border-x border-sand bg-transparent text-center font-display text-[26px] tabular-nums text-tinta"
      />
      <button type="button" aria-label="Una más" disabled={valor >= tope} onClick={() => onValor(Math.min(tope, valor + 1))} className="grid h-14 w-14 place-items-center text-2xl text-tinta disabled:text-taupe/40">
        +
      </button>
    </div>
  );
}

/** Una de las dos cajas de «Así va a quedar»: el lugar con su dibujo, lo que queda en grande y lo que había, chico. El destino va en
 *  verde: ahí llega la ropa. */
function LadoDelViaje({ lado, destino = false }: { lado: LadoMovido; destino?: boolean }) {
  const Ico = lado.lugar === "piso" ? IconoPercha : Archive;
  return (
    <div className={`rounded-2xl border px-3 py-2.5 text-center ${destino ? "border-verde/40 bg-verde/[0.08]" : "border-sand bg-crema"}`}>
      <p className="flex items-center justify-center gap-1.5 text-[12.5px] text-taupe">
        <Ico aria-hidden className="h-3.5 w-3.5" strokeWidth={1.6} />
        {lado.lugar === "piso" ? "En el piso" : "Almacén"}
      </p>
      <b className={`block font-display text-[38px] font-medium leading-[1.05] tabular-nums ${destino ? "text-verde" : "text-tinta"}`}>{lado.despues}</b>
      <small className="text-[11.5px] text-taupe">antes {lado.antes}</small>
    </div>
  );
}

/** «Por qué la subes (opcional)»: la nota que la subida deja en Movimientos (la misma de la ventana de siempre). */
function NotaSubida({ valor, onValor }: { valor: string; onValor: (v: string) => void }) {
  return (
    <>
      <label htmlFor="flujo-nota-subida" className="label-cayla mb-1.5 mt-4 block text-[11px] text-taupe">
        Por qué la subes · opcional
      </label>
      <textarea
        id="flujo-nota-subida"
        rows={2}
        maxLength={MAX_NOTA_RETIRO}
        // sugerir-fijo: el motivo de subir no depende de la talla ni del destino elegidos
        placeholder="Ej. no cabe en el riel"
        value={valor}
        onChange={(e) => onValor(e.target.value)}
        className={CLASE_TEXTO}
      />
    </>
  );
}

/** Una celda de «Subir varias»: con algo colgado se edita (de 0 a lo colgado); sin nada colgado dice cuántas hay en almacén; sin nada
 *  libre en la sede, «Se acabó». El mismo dibujo que la celda de Colgar varias, con el tope en el piso. */
function CeldaSubir({ celda, n, etiqueta, fondo, onValor }: { celda: ReturnType<typeof celdaSubirVarias>; n: number; etiqueta: string; fondo: string; onValor: (n: number, max: number) => void }) {
  if (celda.tipo === "acabo")
    return <td className="border-t border-sand bg-rojo/[0.09] px-1 py-2 text-center text-[12.5px] font-semibold text-rojo-profundo">Se acabó</td>;
  if (celda.tipo === "sinPiso")
    return (
      <td title={`${etiqueta}: nada colgado`} className="border-t border-sand bg-[repeating-linear-gradient(135deg,transparent_0_6px,color-mix(in_srgb,var(--color-sand)_70%,transparent)_6px_7px)] px-1 py-2 text-center text-taupe">
        <b className="block font-normal">—</b>
        <small className="block text-[10.5px]">{celda.almacen} en almacén</small>
      </td>
    );
  return (
    <td className={`border-t border-sand px-1 py-2 text-center ${fondo}`}>
      <span className="inline-flex items-center gap-px rounded-lg border border-transparent bg-hueso px-0.5 focus-within:border-taupe focus-within:bg-papel">
        <button type="button" aria-label={`Una menos de ${etiqueta}`} disabled={n <= 0} onClick={() => onValor(n - 1, celda.piso)} className="grid h-8 w-6 place-items-center rounded-md text-taupe hover:bg-sand hover:text-tinta disabled:pointer-events-none disabled:opacity-25">
          −
        </button>
        <input
          inputMode="numeric"
          aria-label={`Cuántas descuelgas de ${etiqueta}: hay ${celda.piso} colgada${celda.piso === 1 ? "" : "s"}`}
          value={n === 0 ? "" : n}
          placeholder="0"
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => onValor(leerCantidadTecleada(e.target.value, celda.piso), celda.piso)}
          className={`h-8 w-8 bg-transparent text-center text-[15px] font-bold tabular-nums outline-none placeholder:font-medium placeholder:text-tinta/30 ${n > 0 ? "text-verde" : "text-tinta"}`}
        />
        <button type="button" aria-label={`Una más de ${etiqueta}`} disabled={n >= celda.piso} onClick={() => onValor(n + 1, celda.piso)} className="grid h-8 w-6 place-items-center rounded-md text-taupe hover:bg-sand hover:text-tinta disabled:pointer-events-none disabled:opacity-25">
          +
        </button>
      </span>
      <small className="mt-1 block text-[10.5px] text-taupe">{celda.piso} colgada{celda.piso === 1 ? "" : "s"}</small>
      <small className="block text-[10.5px] text-taupe/75">{celda.almacen} en almacén</small>
    </td>
  );
}

function Pregunta({ children, ayuda }: { children: ReactNode; ayuda?: ReactNode }) {
  return (
    <div className="mb-3">
      <p className="font-display text-[22px] leading-tight text-tinta">{children}</p>
      {ayuda && <p className="mt-1 text-[13px] text-taupe">{ayuda}</p>}
    </div>
  );
}

const CLASE_TEXTO = "w-full rounded-xl border border-sand bg-crema px-3 py-2.5 text-[15px] text-tinta placeholder:text-taupe focus:border-tinta";

/* ====================================================================
   Un paso guiado del panel de la talla (maqueta `docs/maquetas/existencias-tactil-2026-10/`, «flujos guiados»)

   Arriba, la acción y la talla con sus pasos numerados (✓ los hechos); en medio, el paso de ahora con su pregunta grande; abajo
   «Falta: …» (cada cosa lleva a su paso) y Atrás / Continuar. El último paso muestra el resumen y el botón dice qué hace y
   cuánto. Enter sigue, Escape vuelve a la talla. Lo que guarda llama a la MISMA función de la base que la ventana de siempre, con
   la marca del intento (ADR-0208): el mismo envío dos veces (doble clic, reintento tras un corte) no mueve dos veces. Tras un
   corte de red los datos quedan fijos: solo se reenvía LO MISMO.
   ==================================================================== */
export function FlujoTalla({
  tipo,
  datosIniciales = {},
  pasoInicial = 0,
  prenda,
  colores,
  fila,
  ubicacionId,
  sedeNombre,
  separa,
  destinos,
  origenes,
  puedePedirParaCliente,
  sububicacionPisoId,
  sububicacionAlmacenId,
  onHecho,
  onSalir,
  onCambiar,
  onAjustarCompleto,
  onCambios,
}: {
  tipo: TipoFlujo;
  datosIniciales?: DatosFlujo;
  /** Empezar en un paso ya armado («Pedir» rápido de una fila de agotadas: la tienda elegida, directo a cuántas). */
  pasoInicial?: number;
  /** El color que se mira. */
  prenda: Prenda;
  /** Todos los colores del modelo (para «Colgar varias» y «Subir varias»). */
  colores: Prenda[];
  /** La talla que se mira. */
  fila: FilaExistencias;
  ubicacionId: string;
  sedeNombre: string;
  separa: boolean;
  destinos: readonly { id: string; nombre: string }[];
  origenes: readonly SedeConCantidad[];
  puedePedirParaCliente: boolean;
  sububicacionPisoId: string | null;
  sububicacionAlmacenId: string | null;
  /** Terminó bien: el panel vuelve a la talla con el aviso «hecho». */
  /** `cerrar`: lo hecho se confirmó con el aviso destacado y el panel entero se cierra (hoy, bajar al piso). */
  onHecho: (texto: string, opciones?: { cerrar?: boolean }) => void;
  /** Cancelar (o Escape): vuelve a la talla sin guardar. */
  onSalir: () => void;
  /** Pasar a otra acción con lo que ya se eligió («Se dañó» en Ajustar lleva a Reportar dañada). */
  onCambiar: (tipo: TipoFlujo, datos: DatosFlujo) => void;
  /** Abrir la ventana completa de Ajustar (una talla que faltó en un conteo se enlaza ahí). */
  onAjustarCompleto: () => void;
  /** Avisa al panel si hay algo que perder: la persona cambió un dato o avanzó de paso, o hay un guardado en camino. */
  onCambios?: (sucio: boolean) => void;
}) {
  const router = useRouter();
  const responsable = useResponsable();
  const [i, setI] = useState(pasoInicial);
  // Reportar dañada: el lugar entra elegido solo si es el ÚNICO con algo libre (`desdeInicial`, ADR-0328: con los dos, lo dice la persona).
  const [d, setD] = useState<DatosFlujo>(() => {
    const base: DatosFlujo = {
      ...(tipo === "colgarVarias" || tipo === "subirVarias" ? { cant: {} } : {}),
      ...(tipo === "danada" && separa ? { lugar: desdeInicial(tallasReportables([fila])[0]) ?? undefined } : {}),
      ...datosIniciales,
    };
    // Colgar o subir una talla abre con 1 (lo más común), si hay de dónde.
    if ((tipo === "colgar" || tipo === "subir") && base.n === undefined) {
      const hay = tipo === "colgar" ? Math.max(0, separa ? (fila.almacenDisponible ?? 0) : fila.disponible) : Math.max(0, fila.pisoDisponible ?? 0);
      if (hay > 0) base.n = 1;
    }
    // «Colgar varias» abre con 1 en cada talla que falta en el piso (Felipe, 2026-10-07: mínimo 1 colgada por talla).
    if (tipo === "colgarVarias" && Object.keys(base.cant ?? {}).length === 0) base.cant = { ...cantidadesDeLoQueFalta(colores) };
    return base;
  });
  // «Llenar todas con» de la tabla de Colgar varias: lo tecleado, para que la caja no se borre al rellenar.
  const [relleno, setRelleno] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Lo que ya traía el paso al abrirse (una acción rápida entra armada): solo lo que la persona toca después cuenta como «cambios».
  const [huellaInicial] = useState(() => JSON.stringify(d));
  // Tras una respuesta incierta los datos quedan fijos: cambiarlos sería otro intento y podría mover dos veces.
  const [incierto, setIncierto] = useState(false);
  const sucio = i !== pasoInicial || JSON.stringify(d) !== huellaInicial || enviando || incierto;
  useEffect(() => {
    onCambios?.(sucio);
  }, [sucio, onCambios]);
  // Una talla que faltó en un conteo cerrado: la suma se enlaza al conteo en la ventana completa (no se adivina aquí).
  const [faltoEnConteo, setFaltoEnConteo] = useState(false);
  const enVuelo = useRef(false);
  const enviadoEn = useRef<string | null>(null);
  // La marca de cada intento: la misma mientras no cambie lo que se manda (la huella), nueva si cambia.
  const intento = useRef<{ huella: string; token: string } | null>(null);
  const tokenPara = (huella: string) => {
    if (!intento.current || intento.current.huella !== huella) intento.current = { huella, token: crypto.randomUUID() };
    return intento.current.token;
  };

  useEffect(() => {
    if (tipo !== "ajustar") return;
    let vigente = true;
    createClient()
      .rpc("fn_faltantes_de_conteo" as never, { p_ubicacion_id: ubicacionId, p_variante_ids: [fila.varianteId] } as never)
      .then(({ data, error: e }) => {
        if (vigente && !e) setFaltoEnConteo(faltantesDesdeJson(data).has(fila.varianteId));
      });
    return () => {
      vigente = false;
    };
  }, [tipo, ubicacionId, fila.varianteId]);

  const almacenPorTalla = Object.fromEntries(colores.flatMap((c) => c.tallas.map((t) => [t.varianteId, Math.max(0, t.almacenDisponible ?? 0)])));
  const pisoPorTalla = Object.fromEntries(colores.flatMap((c) => c.tallas.map((t) => [t.varianteId, Math.max(0, t.pisoDisponible ?? 0)])));
  const ctx: ContextoFlujo = {
    piso: Math.max(0, fila.pisoDisponible ?? (separa ? 0 : fila.disponible)),
    almacen: Math.max(0, fila.almacenDisponible ?? 0),
    separa,
    almacenPorTalla,
    pisoPorTalla,
    destinos,
    origenes,
    puedePedirParaCliente,
    responsableListo: responsable.listo,
  };
  const pasos = pasosDe(tipo, d, ctx);
  const paso = pasos[Math.min(i, pasos.length - 1)];
  const ultimo = i >= pasos.length - 1;
  const bloqueoConteo = tipo === "ajustar" && paso === "motivo" && d.signo === "sumar" && faltoEnConteo;
  // Con un envío en duda solo falta quién lo hace: se reenvía EXACTAMENTE lo enviado, aunque las cifras releídas ya no lo validen
  // (si se guardó, lo libre ya bajó; apagar el botón dejaría sin saber qué pasó). La misma regla que tenía «Reportar dañada».
  const completo = puedeEnviarReporte(incierto, pasoCompleto(paso, tipo, d, ctx) && !bloqueoConteo, responsable.listo);
  const nombreSede = (id: string | undefined) => [...destinos, ...origenes].find((s) => s.id === id)?.nombre ?? null;
  const nombreTalla = (varianteId: string) => {
    for (const c of colores) {
      const t = c.tallas.find((x) => x.varianteId === varianteId);
      if (t) return `${colores.length > 1 && c.color ? `${c.color} ` : ""}${t.talla ?? "Única"}`;
    }
    return "Talla";
  };

  // La guía de foco del repo (ADR-0284) sobre los pasos hasta el de ahora: «Falta: …» tocable lleva a ESE paso.
  const guia = useGuiaCampos(
    pasos.slice(0, i + 1).map((p) => ({ id: p, nombre: ETIQUETA_PASO[p], requerido: true, hecho: pasoCompleto(p, tipo, d, ctx), pendiente: `Falta ${FALTA_PASO[p]}.` })),
  );
  const guiaDePasos = { ...guia, ir: (id: string) => setI(Math.max(0, pasos.indexOf(id as PasoFlujo))) };

  function poner(cambios: Partial<DatosFlujo>) {
    if (incierto || enviando) return;
    setD((x) => ({ ...x, ...cambios }));
    setError(null);
  }

  function atras() {
    if (enviando) return;
    if (i === 0 || incierto) return onSalir();
    setError(null);
    setI(i - 1);
  }

  async function confirmar() {
    if (enVuelo.current || !completo) return;
    // Enviar a otra sede: el traslado se arma en su pantalla, ya cargado con la talla, la cantidad y la sede.
    if (tipo === "enviar") {
      const href = `${RUTA_NUEVO_TRASLADO}?lineas=${lineasEnUrl([{ varianteId: fila.varianteId, cantidad: d.n ?? 0 }])}&destino=${encodeURIComponent(d.sedeId ?? "")}&desde=existencias`;
      router.push(href);
      onHecho(textoHecho(tipo, d, nombreSede(d.sedeId)));
      return;
    }
    const llamada = armarLlamada();
    if (!llamada) return;
    enVuelo.current = true;
    setEnviando(true);
    setError(null);
    // La hora del primer envío de ESTA marca: si la respuesta no llega, el aviso dice desde cuándo está en duda.
    enviadoEn.current ??= new Date().toISOString();
    const control = new AbortController();
    const tope = window.setTimeout(() => control.abort(), TOPE_ESPERA_MS);
    let data: unknown = null;
    let errorRpc: ErrorEscritura = null;
    try {
      const consulta = createClient().rpc(llamada.rpc as never, llamada.args as never).abortSignal(control.signal);
      const r = await firmar(llamada.sinLoader ? consulta.setHeader("x-espera", "no") : consulta, responsable.firma());
      data = r.data;
      errorRpc = r.error;
    } catch (ex) {
      errorRpc = { message: ex instanceof Error ? ex.message : String(ex) };
    }
    window.clearTimeout(tope);
    setEnviando(false);
    responsable.despues(errorRpc);
    enVuelo.current = false;
    if (errorRpc) {
      if (esRespuestaIncierta(errorRpc) || esFalloDeRed(errorRpc)) {
        setIncierto(true);
        setError(TEXTO_INCIERTO);
        return;
      }
      // Tras un corte, los datos solo se sueltan si la base dijo qué pasó con la marca (se deshizo, o ya estaba): si contestó sin
      // mirarla (sesión vencida, módulo apagado), cambiar algo podría mover dos veces lo que quizá ya se guardó.
      if (incierto && !(llamada.resuelve?.(errorRpc) ?? false)) {
        setError(`${llamada.error(errorRpc)} ${llamada.sinResolver?.(enviadoEn.current ?? new Date().toISOString()) ?? ""}`.trim());
        return;
      }
      setIncierto(false);
      enviadoEn.current = null;
      setError(llamada.error(errorRpc));
      router.refresh();
      return;
    }
    enviadoEn.current = null;
    const yaEstaba = llamada.yaEstaba(data);
    const esBajada = tipo === "colgar" || tipo === "colgarVarias";
    const esSubida = tipo === "subir" || tipo === "subirVarias";
    if (yaEstaba) {
      avisar.aviso("Esto ya estaba guardado. No se repitió.", { detalle: prenda.referencia });
    } else if (esBajada || esSubida) {
      // Bajar al piso y subir al almacén se confirman en grande y el panel se cierra (Felipe, 2026-10-08): la colaboradora está con la
      // prenda en la mano, mirando el perchero, y el aviso de la esquina se le pasaba. La cifra es la que contestó la base; si no vino,
      // la que se envió.
      sonarConfirmacion();
      const varias = tipo === "colgarVarias" || tipo === "subirVarias";
      const respondio = esBajada ? leerRespuestaDeBajada(data)?.unidades : leerRespuestaDeRetiro(data)?.unidades;
      const n = respondio ?? (varias ? totalVarias(d) : (d.n ?? 0));
      const una = n === 1;
      const paraEnviar = esSubida && d.destino === "enviar";
      avisarDestacado({
        titulo: esBajada ? "Bajado al piso" : "Subido al almacén",
        cifra: `${unidades(n)} ${esBajada ? (una ? "colgada" : "colgadas") : una ? "guardada" : "guardadas"}`,
        detalle: varias ? `${prenda.referencia}${llamada.detalle ? ` · ${llamada.detalle}` : ""}` : `${prenda.referencia}${prenda.color ? ` · ${prenda.color}` : ""} · talla ${fila.talla ?? "Única"}`,
        nota: esBajada
          ? `Ya ${una ? "está" : "están"} en el piso de ${sedeNombre}: ${una ? "se puede" : "se pueden"} vender.`
          : paraEnviar
            ? `${una ? "Queda" : "Quedan"} en el almacén, ${una ? "lista" : "listas"} para enviar a ${nombreSede(d.sedeId) ?? "la otra sede"}.`
            : `Ya ${una ? "está" : "están"} en el almacén de ${sedeNombre}.`,
      });
    } else {
      sonarConfirmacion();
      avisar.exito(llamada.titulo?.(data) ?? textoHecho(tipo, d, nombreSede(d.sedeId ?? d.origenId)), {
        detalle: llamada.recordatorio ?? `${prenda.referencia}${prenda.color ? ` · ${prenda.color}` : ""} · ${fila.talla ?? "Única"}`,
      });
    }
    // Si el panel se cierra (bajar al piso, subir al almacén), refresca él, cuando ya retiró la guardia de «¿Salir sin guardar?»
    // (PanelTalla).
    const cerrar = (esBajada || esSubida) && !yaEstaba;
    if (!cerrar) router.refresh();
    onHecho(textoHecho(tipo, d, nombreSede(d.sedeId ?? d.origenId)), { cerrar });
  }

  /** La función de la base de cada acción, con sus argumentos y cómo leer su respuesta y su error. */
  /** `resuelve`: tras un corte, ¿esta respuesta de la base dice qué pasó con la marca? (la vieja ventana lo preguntaba igual). Sin ella,
   *  los datos siguen fijos. `sinResolver`: el aviso para ese caso. */
  type Llamada = {
    rpc: string;
    args: unknown;
    error: (e: ErrorEscritura) => string;
    yaEstaba: (data: unknown) => boolean;
    resuelve?: (e: ErrorEscritura) => boolean;
    sinResolver?: (enviadoEn: string) => string;
    titulo?: (data: unknown) => string;
    detalle?: string;
    /** Lo que hay que hacer con la prenda en la mano, en el aviso (Reportar dañada: sacarla del perchero). */
    recordatorio?: string;
    /** Sin el loader a pantalla completa (ADR-0149, `x-espera: no`): el botón ya dice «Guardando…» y lo que confirma es el aviso
     *  destacado. Bajar al piso y subir al almacén (Felipe, 2026-10-08): el loader con el logo daba la sensación de sacarte de la
     *  pantalla. */
    sinLoader?: boolean;
  };
  function armarLlamada(): Llamada | null {
    const n = d.n ?? 0;
    const una: LineaBajada[] = [{ varianteId: fila.varianteId, cantidad: n }];
    switch (tipo) {
      case "colgar":
      case "colgarVarias": {
        // Colgar varias: las líneas de todos los colores juntas, recortadas a lo libre del almacén (lo que se ve es lo que se envía).
        const modelo = coloresParaMover(colores);
        const lineas = tipo === "colgar" ? una : lineasDeMoverModelo(modelo, d.cant ?? {}, "bajar");
        const token = tokenPara(JSON.stringify(["bajar", lineas]));
        return {
          rpc: RPC_BAJADA,
          args: argumentosDeBajada(ubicacionId, lineas, token),
          error: (e) => {
            const fallo = interpretarErrorDeBajada(e, sedeNombre);
            return fallo.tipo === "sin_alcance" && fallo.lineas.length > 0 ? fallo.lineas.map((l) => `${nombreTalla(l.varianteId)}: ${textoFilaSinAlcance(l.hay, l.motivo)}`).join(" ") : fallo.mensaje;
          },
          yaEstaba: (x) => leerRespuestaDeBajada(x)?.ya_registrada === true,
          resuelve: respuestaResuelveLaMarca,
          sinResolver: (enviadoEn) => textoMarcaSinResolver(enviadoEn, "Confirmar de nuevo"),
          detalle: tipo === "colgarVarias" ? detalleDeLoMovido(modelo, lineas) : undefined,
          sinLoader: true,
        };
      }
      case "subir":
      case "subirVarias": {
        // Subir varias: las líneas de todos los colores juntas, recortadas a lo libre del piso, en UNA llamada (todo o nada).
        const modelo = coloresParaMover(colores);
        const lineas = tipo === "subir" ? una : lineasDeMoverModelo(modelo, d.cant ?? {}, "subir");
        const totalSubido = lineas.reduce((a, l) => a + l.cantidad, 0);
        const nota = (d.nota ?? "").trim();
        const token = tokenPara(JSON.stringify(["subir", lineas, d.destino, d.sedeId, nota]));
        const comunSubir = {
          error: (e: ErrorEscritura) => {
            const fallo = interpretarErrorDeRetiro(e, sedeNombre);
            return fallo.tipo === "sin_alcance" && fallo.lineas.length > 0 ? fallo.lineas.map((l) => `${nombreTalla(l.varianteId)}: ${textoFilaSinAlcance(l.hay, l.motivo, "piso")}`).join(" ") : fallo.mensaje;
          },
          yaEstaba: (x: unknown) => leerRespuestaDeRetiro(x)?.ya_registrada === true,
          resuelve: respuestaResuelveLaMarcaDeRetiro,
          sinResolver: (enviadoEn: string) => textoMarcaSinResolverDeRetiro(formatearHoraLima(enviadoEn)),
          titulo: (x: unknown) => tituloDeExitoRetiro(leerRespuestaDeRetiro(x)?.unidades ?? totalSubido),
          detalle: tipo === "subirVarias" ? detalleDeLoMovido(modelo, lineas) : undefined,
          sinLoader: true,
        };
        if (d.destino === "enviar") {
          return {
            rpc: RPC_SUBIR_PARA_ENVIAR,
            args: { p_ubicacion_id: ubicacionId, p_destino_id: d.sedeId, p_items: itemsParaRpc(lineas), p_nota: nota || null, p_token: token },
            ...comunSubir,
          };
        }
        return {
          rpc: RPC_RETIRO,
          args: argumentosDeRetiro(ubicacionId, lineas, nota, token),
          ...comunSubir,
        };
      }
      case "pedir": {
        if (d.para === "cliente") {
          const datos = { p_ubicacion_id: ubicacionId, p_origen_id: d.origenId, p_variante_id: fila.varianteId, p_cantidad: 1, p_clienta_nombres: (d.nombres ?? "").trim(), p_clienta_apellidos: (d.apellidos ?? "").trim(), p_clienta_celular: (d.celular ?? "").replace(/\D/g, "") };
          return {
            rpc: "pedir_prenda_para_apartar",
            args: { ...datos, p_token: tokenPara(JSON.stringify(["pedir-cliente", datos])) },
            error: (e) => traducirError(e, "pedir la prenda", { confirmarAntesDeRepetir: true }),
            yaEstaba: () => false,
          };
        }
        const lineas = [{ variante_id: fila.varianteId, cantidad: n }];
        return {
          rpc: "pedir_a_otra_sede",
          args: { p_ubicacion_id: ubicacionId, p_origen_id: d.origenId, p_lineas: lineas, p_token: tokenPara(JSON.stringify(["pedir", d.origenId, lineas])) },
          error: (e) => traducirError(e, "pedir las prendas", { confirmarAntesDeRepetir: true }),
          yaEstaba: () => false,
        };
      }
      case "ajustar": {
        if (!d.motivo) return null;
        const base = motivoParaLaBase(d.motivo, d.nota ?? "");
        const delta = d.signo === "sumar" ? n : -n;
        const sububicacionId = separa ? (d.lugar === "almacen" ? sububicacionAlmacenId : sububicacionPisoId) : null;
        return {
          rpc: "ajustar_inventario",
          args: argumentosDeAjuste({
            ubicacionId,
            sububicacionId,
            ajustes: [{ variante: { varianteId: fila.varianteId }, delta }],
            cargaInicial: [],
            motivo: base.motivo,
            alPiso: false,
            nota: base.nota,
            token: tokenPara(JSON.stringify(["ajustar", fila.varianteId, sububicacionId, delta, base])),
          }),
          error: (e) => traducirError(e, "ajustar el inventario"),
          yaEstaba: (x) => typeof x === "object" && x !== null && (x as { ya_registrado?: boolean }).ya_registrado === true,
        };
      }
      case "danada": {
        const desde = d.lugar === "almacen" ? "almacen" : "piso";
        const motivo = (d.nota ?? "").trim();
        return {
          rpc: RPC_REPORTAR_DANADA,
          args: argumentosDeReporte(ubicacionId, fila.varianteId, desde, n, motivo, tokenPara(JSON.stringify(["danada", fila.varianteId, desde, n, motivo]))),
          error: (e) => interpretarErrorDeDanada(e, "reportar la prenda dañada").mensaje,
          yaEstaba: (x) => leerRespuestaDanada(x)?.ya_registrada === true,
          resuelve: reporteResuelveLaMarca,
          titulo: (x) => tituloExitoReporte(leerRespuestaDanada(x)?.unidades ?? n),
          recordatorio: recordatorioAlReportar(desde),
        };
      }
      default:
        return null;
    }
  }

  function seguir() {
    if (!completo || enviando) return;
    if (ultimo) void confirmar();
    else {
      setError(null);
      setI(i + 1);
    }
  }

  // Enter sigue (salvo en una nota larga o sobre un botón que todavía no está elegido, que ya hace lo suyo: elegirse). Sobre la opción
  // recién marcada, Enter también sigue: con teclado se elige y se avanza sin buscar el botón de abajo. Escape vuelve a la talla.
  function alTeclear(e: KeyboardEventReact<HTMLDivElement>) {
    const t = e.target as HTMLElement;
    const botonSinElegir = t.tagName === "BUTTON" && t.getAttribute("aria-pressed") !== "true";
    if (e.key === "Enter" && t.tagName !== "TEXTAREA" && !botonSinElegir) {
      e.preventDefault();
      seguir();
    } else if (e.key === "Escape") {
      // Usa su Escape (vuelve a la talla): el panel no se cierra (useEscapeLibre).
      e.stopPropagation();
      if (!enviando) onSalir();
    }
  }

  // Al cambiar de paso, el cursor va a su primer campo (o a su primer botón): con teclado se sigue sin el mouse.
  const cuerpo = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = cuerpo.current?.querySelector<HTMLElement>("input, textarea, button:not([disabled])");
    el?.focus({ preventScroll: true });
  }, [i, tipo]);

  const color = prenda.colorHex ?? "var(--color-hueso)";
  const fondoContexto = (tipo === "colgarVarias" || tipo === "subirVarias") && colores.length > 1 ? `conic-gradient(${colores.map((c) => c.colorHex ?? "var(--color-hueso)").join(",")})` : color;
  const IconoFinal = ICONO_FINAL[tipo];

  function cuerpoDelPaso(): ReactNode {
    switch (paso) {
      case "cantidad": {
        const max = maxCantidad(tipo, d, ctx);
        const de = tipo === "subir" ? "en piso" : tipo === "pedir" ? `en ${nombreSede(d.origenId) ?? "esa sede"}` : tipo === "danada" ? (d.lugar === "almacen" ? "en almacén" : "en piso") : "en almacén";
        const viaje = asiQueda(tipo, d.n ?? 0, ctx);
        const pregunta = tipo === "colgar" ? "¿Cuántas sacas del almacén?" : tipo === "subir" ? "¿Cuántas descuelgas?" : tipo === "pedir" ? "¿Cuántas pides?" : tipo === "enviar" ? "¿Cuántas envías?" : "¿Cuántas están dañadas?";
        return (
          <>
            <Pregunta ayuda={`Hay ${unidades(max)} ${de}.`}>{pregunta}</Pregunta>
            <div className="flex flex-wrap items-center gap-3">
              <Stepper id="flujo-cantidad" valor={d.n ?? 0} max={max} etiqueta="Cantidad" onValor={(n) => poner({ n })} />
              {/* «Todas (N)»: el atajo de colgar o subir todo lo que hay (2026-10-07). */}
              {viaje && max > 1 && (
                <button type="button" aria-pressed={(d.n ?? 0) === max} onClick={() => poner({ n: max })} className="btn-cayla btn-secundario btn-chico aria-pressed:border-tinta aria-pressed:bg-tinta aria-pressed:text-papel">
                  Todas ({max})
                </button>
              )}
            </div>
            {/* «Así va a quedar»: de dónde sale, lo que viaja y a dónde llega, con el número después en grande y el de antes chico. Reemplaza
                al «0 → 1» que había que descifrar (Felipe, 2026-10-07: «esto también está un poco confuso»). */}
            {viaje && (
              <div className="mt-5">
                <p className="mb-2 text-[15px] font-semibold text-tinta">Así va a quedar</p>
                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                  <LadoDelViaje lado={viaje.de} />
                  <span aria-hidden className="flex flex-col items-center gap-1 text-taupe">
                    <b className="rounded-full bg-tinta px-2.5 py-0.5 text-[13px] text-papel tabular-nums">{d.n ?? 0}</b>
                    <ArrowRight className="h-4 w-4" strokeWidth={1.8} />
                  </span>
                  <LadoDelViaje lado={viaje.a} destino />
                </div>
              </div>
            )}
            {/* Subir: si la talla se queda sin ninguna colgada y el piso la pide, se avisa antes (ADR-0208); si no, que subir no es dar de baja. */}
            {tipo === "subir" && (d.n ?? 0) > 0 && <p className="mt-3 rounded-xl bg-hueso px-3 py-2 text-[13px] text-tinta">{textoDelBloqueSubir(tallasParaReponer([fila]), { [fila.varianteId]: d.n ?? 0 })}</p>}
            {tipo === "subir" && destinos.length === 0 && <NotaSubida valor={d.nota ?? ""} onValor={(nota) => poner({ nota })} />}
            {tipo === "subir" && (
              <p className="mt-4">
                <button type="button" onClick={() => onCambiar("subirVarias", { cant: {} })} className="btn-enlace text-[13px]">
                  ¿Más tallas o colores? Subir varias
                </button>
              </p>
            )}
            {tipo === "colgar" && (
              <p className="mt-4">
                <button type="button" onClick={() => onCambiar("colgarVarias", { cant: {} })} className="btn-enlace text-[13px]">
                  ¿Más tallas o colores? Colgar varias
                </button>
              </p>
            )}
          </>
        );
      }
      case "varias": {
        // La tabla tallas × colores (2026-10-07, como la de cantidades de Nuevo producto): cada celda con algo en almacén se edita;
        // las demás dicen por qué no (`lib/colgar-varias-tabla.ts`). El estado de cada una y los totales son lógica pura.
        const faltan = tallasQueFaltan(colores);
        const cant = d.cant ?? {};
        const tallasDeTodos = [...new Set(colores.flatMap((c) => c.tallas.map((t) => t.talla ?? "Única")))];
        const todas = colores.flatMap((c) => c.tallas);
        const tot = totalesColgar(colores, cant);
        const loQueFalta = cantidadesDeLoQueFalta(colores);
        const nFalta = Object.keys(loQueFalta).length;
        const enPausa = colores.some((c) => c.tallas.some((t) => t.planPiso?.accion === "pausa_sin_cuadre"));
        const muchas = tallasDeTodos.length > 1;
        const poner1 = (id: string, n: number, max: number) => poner({ cant: { ...cant, [id]: Math.max(0, Math.min(max, n)) } });
        // Subir varias: la misma tabla al revés (2026-10-08). Se edita lo colgado; el atajo es «Todo lo colgado», no «lo que falta».
        const subiendo = tipo === "subirVarias";
        const todoLoColgado = llenarTodasCon(todas, Number.MAX_SAFE_INTEGER, "subir");
        const nColgado = Object.values(todoLoColgado).reduce((a, b) => a + b, 0);
        const ayuda = subiendo ? "Elige cuántas descuelgas de cada talla." : nFalta > 0 ? "Ya viene 1 donde falta." : enPausa ? "Piso por cuadrar: revisa lo colgado." : undefined;
        return (
          <>
            {/* Textos cortos (Felipe, 2026-10-07: «con una frase corta se debe entender»): las celdas ya dicen lo demás. */}
            <Pregunta ayuda={ayuda}>{subiendo ? "¿Cuántas descuelgas?" : "¿Cuántas sacas al piso?"}</Pregunta>
            <div className="mb-2.5 flex flex-wrap items-center gap-2 text-[12.5px] text-taupe" role="group" aria-label="Llenar de un toque">
              <label htmlFor="colgar-llenar">Llenar todas con</label>
              <input
                id="colgar-llenar"
                inputMode="numeric"
                maxLength={2}
                placeholder="1"
                value={relleno}
                onChange={(e) => {
                  const limpio = e.target.value.replace(/\D/g, "");
                  setRelleno(limpio);
                  poner({ cant: llenarTodasCon(todas, limpio === "" ? null : Number(limpio), subiendo ? "subir" : "bajar") });
                }}
                onFocus={(e) => e.currentTarget.select()}
                className="h-9 w-14 rounded-[9px] border border-transparent bg-hueso text-center text-[15px] font-semibold tabular-nums text-tinta outline-none placeholder:text-tinta/30 focus:border-taupe focus:bg-papel"
              />
              {subiendo ? (
                <button type="button" disabled={nColgado === 0} onClick={() => { setRelleno(""); poner({ cant: { ...todoLoColgado } }); }} title="Todo lo que está colgado de cada talla" className="btn-cayla btn-secundario btn-chico">
                  Todo lo colgado ({nColgado})
                </button>
              ) : (
                <button type="button" disabled={nFalta === 0} onClick={() => { setRelleno(""); poner({ cant: { ...loQueFalta } }); }} title="1 en cada talla sin ninguna colgada" className="btn-cayla btn-secundario btn-chico">
                  Solo lo que falta ({nFalta})
                </button>
              )}
              <button type="button" disabled={tot.total === 0} onClick={() => { setRelleno(""); poner({ cant: {} }); }} className="btn-cayla btn-sutil btn-chico">
                Vaciar
              </button>
            </div>
            <div className="scroll-cayla max-h-[52vh] overflow-auto rounded-xl border border-sand bg-papel">
              <table className="w-full border-separate border-spacing-0 text-[13px]">
                <thead>
                  <tr>
                    <th scope="col" className="sticky left-0 top-0 z-[3] border-r border-sand bg-hueso py-2 pl-3.5 pr-2 text-left text-xs font-semibold text-tinta">Color</th>
                    {tallasDeTodos.map((t) => (
                      <th key={t} scope="col" className="sticky top-0 z-[2] bg-hueso px-1 py-2 text-center text-xs font-semibold tabular-nums text-tinta">{t}</th>
                    ))}
                    {muchas && <th scope="col" className="sticky top-0 z-[2] border-l border-sand bg-hueso px-2 py-2 text-center text-xs font-semibold text-taupe">Total</th>}
                  </tr>
                </thead>
                <tbody>
                  {colores.map((c, i) => {
                    const fondo = i % 2 === 1 ? "bg-hueso/40" : "bg-papel";
                    return (
                      <tr key={c.clave}>
                        <th scope="row" className={`sticky left-0 z-[1] whitespace-nowrap border-r border-t border-sand py-2 pl-3.5 pr-2.5 text-left text-[13px] font-semibold text-tinta ${fondo}`}>
                          <span aria-hidden data-color-dato className="absolute inset-y-0 left-0 w-[5px]" style={{ background: c.colorHex ?? "var(--color-sand)" }} />
                          <span className="flex items-center gap-1.5">
                            <i aria-hidden data-color-dato className="h-2.5 w-2.5 shrink-0 rounded-full shadow-[0_0_0_1px_var(--color-sand)]" style={{ background: c.colorHex ?? "var(--color-hueso)" }} />
                            {c.color ?? "Sin color"}
                          </span>
                        </th>
                        {tallasDeTodos.map((nombre) => {
                          const t = c.tallas.find((x) => (x.talla ?? "Única") === nombre);
                          if (!t) return <td key={nombre} aria-hidden className={`border-t border-sand ${fondo}`} />;
                          if (subiendo) return <CeldaSubir key={nombre} celda={celdaSubirVarias(t)} n={cant[t.varianteId] ?? 0} etiqueta={`${c.color ?? ""} ${nombre}`} fondo={fondo} onValor={(n, max) => poner1(t.varianteId, n, max)} />;
                          const celda = celdaColgarVarias(t, faltan);
                          if (celda.tipo === "acabo")
                            return (
                              <td key={nombre} className="border-t border-sand bg-rojo/[0.09] px-1 py-2 text-center text-[12.5px] font-semibold text-rojo-profundo">
                                Se acabó
                              </td>
                            );
                          if (celda.tipo === "sinAlmacen")
                            return (
                              <td key={nombre} title={`${c.color ?? ""} ${nombre}: no hay en almacén`} className={`border-t border-sand bg-[repeating-linear-gradient(135deg,transparent_0_6px,color-mix(in_srgb,var(--color-sand)_70%,transparent)_6px_7px)] px-1 py-2 text-center text-taupe`}>
                                <b className="block font-normal">—</b>
                                <small className="block text-[10.5px]">{celda.piso} colgada{celda.piso === 1 ? "" : "s"}</small>
                              </td>
                            );
                          const n = cant[t.varianteId] ?? 0;
                          const etiqueta = `${c.color ?? ""} ${nombre}`;
                          return (
                            <td key={nombre} className={`border-t border-sand px-1 py-2 text-center ${fondo}`}>
                              <span className={`inline-flex items-center gap-px rounded-lg border px-0.5 focus-within:border-taupe focus-within:bg-papel ${celda.falta ? "border-ambar/40 bg-ambar/[0.14]" : "border-transparent bg-hueso"}`}>
                                <button type="button" aria-label={`Una menos de ${etiqueta}`} disabled={n <= 0} onClick={() => poner1(t.varianteId, n - 1, celda.almacen)} className="grid h-8 w-6 place-items-center rounded-md text-taupe hover:bg-sand hover:text-tinta disabled:pointer-events-none disabled:opacity-25">
                                  −
                                </button>
                                <input
                                  inputMode="numeric"
                                  aria-label={`Cuántas cuelgas de ${etiqueta}: hay ${celda.almacen} en almacén`}
                                  value={n === 0 ? "" : n}
                                  placeholder="0"
                                  onFocus={(e) => e.currentTarget.select()}
                                  onChange={(e) => poner({ cant: { ...cant, [t.varianteId]: leerCantidadTecleada(e.target.value, celda.almacen) } })}
                                  className={`h-8 w-8 bg-transparent text-center text-[15px] font-bold tabular-nums outline-none placeholder:font-medium placeholder:text-tinta/30 ${n > 0 ? "text-verde" : "text-tinta"}`}
                                />
                                <button type="button" aria-label={`Una más de ${etiqueta}`} disabled={n >= celda.almacen} onClick={() => poner1(t.varianteId, n + 1, celda.almacen)} className="grid h-8 w-6 place-items-center rounded-md text-taupe hover:bg-sand hover:text-tinta disabled:pointer-events-none disabled:opacity-25">
                                  +
                                </button>
                              </span>
                              <small className={`mt-1 block text-[10.5px] ${celda.falta ? "font-semibold text-ambar-profundo" : "text-taupe"}`}>
                                {celda.falta ? "falta" : celda.piso === 0 ? "nada colgado" : `${celda.piso} colgada${celda.piso === 1 ? "" : "s"}`}
                              </small>
                              <small className="block text-[10.5px] text-taupe/75">{celda.almacen} en almacén</small>
                            </td>
                          );
                        })}
                        {muchas && <td className={`border-l border-t border-sand px-2 text-center font-bold tabular-nums text-taupe ${fondo}`}>{tot.porColor[c.clave] || "·"}</td>}
                      </tr>
                    );
                  })}
                </tbody>
                {colores.length > 1 && (
                  <tfoot>
                    <tr>
                      <th scope="row" className="sticky left-0 z-[1] border-r border-t-[1.5px] border-sand bg-hueso py-2 pl-3.5 text-left text-xs font-semibold">Total</th>
                      {tallasDeTodos.map((t) => (
                        <td key={t} className="border-t-[1.5px] border-sand bg-hueso py-2 text-center font-bold tabular-nums">{tot.porTalla[t] ?? 0}</td>
                      ))}
                      {muchas && <td className="border-l border-t-[1.5px] border-sand bg-hueso py-2 text-center font-bold tabular-nums text-taupe">{tot.total}</td>}
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
            <p className="mt-2 flex flex-wrap gap-x-3.5 gap-y-1 text-[11.5px] text-taupe">
              {!subiendo && <span className="inline-flex items-center gap-1.5"><i aria-hidden className="inline-block h-2.5 w-3 rounded-[3px] border border-ambar/40 bg-ambar/[0.14]" />falta en el piso</span>}
              <span className="inline-flex items-center gap-1.5"><i aria-hidden className="inline-block h-2.5 w-3 rounded-[3px] border border-sand bg-[repeating-linear-gradient(135deg,transparent_0_2px,var(--color-sand)_2px_3px)]" />{subiendo ? "nada colgado" : "no hay en almacén"}</span>
            </p>
            {/* Subir: si alguna talla se queda sin ninguna colgada y el piso la pide, se avisa antes (ADR-0208); si no, que subir no es dar de baja. */}
            {subiendo && tot.total > 0 && <p className="mt-3 rounded-xl bg-hueso px-3 py-2 text-[13px] text-tinta">{textoDelBloqueSubir(tallasParaReponer(todas), cant)}</p>}
            {subiendo && destinos.length === 0 && <NotaSubida valor={d.nota ?? ""} onValor={(nota) => poner({ nota })} />}
          </>
        );
      }
      case "destino":
        return (
          <>
            <Pregunta>¿Se queda en el almacén?</Pregunta>
            <div className="grid gap-2 sm:grid-cols-2">
              <Opcion marcada={d.destino === "queda"} titulo="Se queda aquí" sub={`Vuelve al almacén de ${nombreCortoSede(sedeNombre)}`} onClick={() => poner({ destino: "queda", sedeId: undefined })} />
              <Opcion marcada={d.destino === "enviar"} titulo="Para enviar a otra sede" sub="Queda en «Por enviar» hasta el traslado" onClick={() => poner({ destino: "enviar" })} />
            </div>
            {d.destino === "enviar" && (
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {destinos.map((s) => (
                  <Opcion key={s.id} marcada={d.sedeId === s.id} titulo={s.nombre} onClick={() => poner({ sedeId: s.id })} />
                ))}
              </div>
            )}
            <NotaSubida valor={d.nota ?? ""} onValor={(nota) => poner({ nota })} />
          </>
        );
      case "hacia":
        return (
          <>
            <Pregunta ayuda="Se abre «Nuevo traslado» con esta talla y la cantidad ya puestas: ahí se confirma la salida.">¿A qué sede las envías?</Pregunta>
            <div className="grid gap-2">
              {destinos.map((s) => (
                <Opcion key={s.id} marcada={d.sedeId === s.id} titulo={s.nombre} onClick={() => poner({ sedeId: s.id })} />
              ))}
            </div>
          </>
        );
      case "para":
        return (
          <>
            <Pregunta>¿Es para un cliente que espera?</Pregunta>
            <div className="grid gap-2">
              <Opcion marcada={d.para === "reponer"} titulo="No, para reponer la tienda" sub="La otra sede lo ve en Traslados y lo envía" onClick={() => poner({ para: "reponer" })} />
              <Opcion
                marcada={d.para === "cliente"}
                deshabilitada={!puedePedirParaCliente}
                titulo="Sí, un cliente la espera"
                sub={puedePedirParaCliente ? "Queda apartada en la otra sede · 1 unidad" : "Pide el módulo Apartados"}
                onClick={() => poner({ para: "cliente", n: 1 })}
              />
            </div>
          </>
        );
      case "origen":
        return (
          <>
            <Pregunta>¿A qué sede le pides?</Pregunta>
            <div className="grid gap-2">
              {origenes.length === 0 && <p className="text-sm text-taupe">Ninguna otra tienda tiene esta talla.</p>}
              {origenes.map((s) => (
                <Opcion
                  key={s.id}
                  marcada={d.origenId === s.id}
                  deshabilitada={s.cantidad <= 0}
                  titulo={s.nombre}
                  sub={s.cantidad > 0 ? `Tiene ${unidades(s.cantidad)}` : "No tiene"}
                  onClick={() => poner({ origenId: s.id, n: d.para === "cliente" ? 1 : Math.min(d.n ?? 1, s.cantidad) || 1 })}
                />
              ))}
            </div>
          </>
        );
      case "cliente":
        return (
          <>
            <Pregunta ayuda="Le avisaremos por WhatsApp cuando llegue.">¿Para qué cliente?</Pregunta>
            <div className="grid gap-2 sm:grid-cols-2">
              {/* sugerir-fijo: el rótulo del campo, no un ejemplo: no depende de nada elegido antes */}
              <input id="flujo-nombres" aria-label="Nombres" autoComplete="off" placeholder="Nombres" value={d.nombres ?? ""} onChange={(e) => poner({ nombres: e.target.value })} className={CLASE_TEXTO} />
              {/* sugerir-fijo: el rótulo del campo, no un ejemplo: no depende de nada elegido antes */}
              <input id="flujo-apellidos" aria-label="Apellidos" autoComplete="off" placeholder="Apellidos" value={d.apellidos ?? ""} onChange={(e) => poner({ apellidos: e.target.value })} className={CLASE_TEXTO} />
              <input
                id="flujo-celular"
                aria-label="Celular"
                inputMode="numeric"
                maxLength={9}
                autoComplete="off"
                // sugerir-fijo: el formato del celular peruano (9 dígitos) no depende de nada elegido antes
                placeholder="Celular · 9 dígitos"
                value={d.celular ?? ""}
                onChange={(e) => poner({ celular: e.target.value.replace(/\D/g, "").slice(0, 9) })}
                className={`${CLASE_TEXTO} sm:col-span-2`}
              />
            </div>
            {(d.celular ?? "").length === 9 && !celularValido(d.celular) && <p className="mt-2 text-[13px] text-ambar-profundo">Un celular empieza en 9.</p>}
          </>
        );
      case "lugar": {
        const verbo = tipo === "danada" ? "¿Dónde está la prenda dañada?" : "¿Dónde está el número mal?";
        return (
          <>
            <Pregunta>{verbo}</Pregunta>
            <div className="grid gap-2 sm:grid-cols-2">
              <Opcion marcada={d.lugar === "piso"} titulo="En piso" sub={tipo === "danada" ? `${ctx.piso} libres colgadas` : `El sistema dice ${ctx.piso}`} onClick={() => poner({ lugar: "piso", motivo: undefined, n: tipo === "danada" ? cantidadAjustada(d.n ?? 1, ctx.piso) : d.n })} deshabilitada={tipo === "danada" && ctx.piso === 0} />
              <Opcion marcada={d.lugar === "almacen"} titulo="En almacén" sub={tipo === "danada" ? `${ctx.almacen} libres guardadas` : `El sistema dice ${ctx.almacen}`} onClick={() => poner({ lugar: "almacen", motivo: undefined, n: tipo === "danada" ? cantidadAjustada(d.n ?? 1, ctx.almacen) : d.n })} deshabilitada={tipo === "danada" && ctx.almacen === 0} />
            </div>
          </>
        );
      }
      case "cambio": {
        const queda = quedaTrasAjuste(d, ctx);
        const lugarTxt = !separa ? "en la sede" : d.lugar === "almacen" ? "en almacén" : "en piso";
        const antes = !separa ? ctx.piso + ctx.almacen : d.lugar === "almacen" ? ctx.almacen : ctx.piso;
        return (
          <>
            <Pregunta>¿Sobran o faltan?</Pregunta>
            <div className="grid gap-2 sm:grid-cols-2">
              <Opcion marcada={d.signo === "quitar"} titulo="Faltan · quitar" sub="Hay menos de las que dice" onClick={() => poner({ signo: "quitar", n: 0, motivo: undefined })} />
              <Opcion marcada={d.signo === "sumar"} titulo="Sobran · sumar" sub="Encontré unidades" onClick={() => poner({ signo: "sumar", n: 0, motivo: undefined })} />
            </div>
            {d.signo && (
              <div className="mt-3 flex flex-wrap items-center gap-4">
                <Stepper id="flujo-cambio" valor={d.n ?? 0} max={d.signo === "quitar" ? antes : null} etiqueta="Cuántas" onValor={(n) => poner({ n })} />
                <span className="text-[13px] text-taupe">
                  Queda en <b className="font-display text-[22px] font-medium text-tinta">{queda}</b> {lugarTxt}
                </span>
              </div>
            )}
          </>
        );
      }
      case "motivo": {
        const lista = motivosDeAjuste(d.signo, d.lugar, separa);
        return (
          <>
            <Pregunta>¿Por qué?</Pregunta>
            {bloqueoConteo ? (
              <div className="grid gap-2 rounded-2xl bg-hueso p-3 text-sm text-tinta">
                <span>Esta talla faltó en un conteo cerrado. Lo que encontraste se enlaza con ese conteo en la ventana completa de Ajustar, para que no quede contado dos veces.</span>
                <button type="button" onClick={onAjustarCompleto} className="btn-cayla btn-primario justify-self-start">
                  Abrir Ajustar stock
                </button>
              </div>
            ) : (
              <>
                <div className="grid gap-2 sm:grid-cols-2">
                  {lista.map((m) => (
                    <Opcion key={m.clave} marcada={d.motivo === m.clave} titulo={m.texto} sub={m.ayuda} onClick={() => poner({ motivo: m.clave })} />
                  ))}
                </div>
                {d.motivo === "se_dano" && (
                  <div className="mt-3 grid gap-2 rounded-2xl bg-hueso p-3 text-sm text-tinta">
                    <span>Una unidad dañada no se resta: se reporta y el líder decide si se arregla, se liquida o sale. Así no se pierde de vista.</span>
                    <button type="button" onClick={() => onCambiar("danada", { lugar: d.lugar, n: d.n })} className="btn-cayla btn-primario justify-self-start">
                      Reportar dañada
                    </button>
                  </div>
                )}
                {motivoPideNotaFlujo(d.motivo) && (
                  <>
                    <label htmlFor="flujo-nota" className="label-cayla mb-1.5 mt-3 block text-[11px] text-taupe">
                      {d.motivo === "encontre" ? "¿Dónde estaban?" : "Cuéntalo en una línea"}
                    </label>
                    <textarea
                      id="flujo-nota"
                      rows={2}
                      maxLength={200}
                      // sugerir-fijo: el ejemplo sigue al motivo elegido (las dos únicas notas que pide Ajustar)
                      placeholder={d.motivo === "encontre" ? "Ej. en la caja de la repisa alta" : "Ej. se usó para el maniquí de la vitrina"}
                      value={d.nota ?? ""}
                      onChange={(e) => poner({ nota: e.target.value })}
                      className={CLASE_TEXTO}
                    />
                  </>
                )}
              </>
            )}
          </>
        );
      }
      case "quetiene":
        return (
          <>
            <Pregunta>¿Qué tiene?</Pregunta>
            <div className="mb-2 flex flex-wrap gap-1.5">
              {["Mancha", "Descosido", "Falta un botón", "Roto"].map((x) => (
                <button key={x} type="button" aria-pressed={(d.nota ?? "") === x} onClick={() => poner({ nota: x })} className="rounded-full border border-sand bg-papel px-3 py-1.5 text-[13px] text-tinta aria-pressed:border-tinta aria-pressed:bg-tinta aria-pressed:text-papel">
                  {x}
                </button>
              ))}
            </div>
            <textarea
              id="flujo-quetiene"
              rows={2}
              maxLength={MAX_TEXTO_DANADA}
              // sugerir-fijo: invita a escribir lo que se ve en la prenda; no depende de otro campo
              placeholder="O escríbelo aquí"
              value={d.nota ?? ""}
              onChange={(e) => poner({ nota: e.target.value })}
              className={CLASE_TEXTO}
            />
            {/* Lo que pasa al reportar, ANTES de confirmar: el acto físico primero (si sigue colgada, se puede vender). */}
            <p className="mt-3 rounded-xl bg-hueso px-3 py-2.5 text-[13px] text-tinta">{quePasaAlReportar(d.lugar ?? null)}</p>
          </>
        );
      case "quien": {
        const filas = resumenDeFlujo(tipo, d, ctx, { sede: nombreSede, tallas: nombreTalla });
        return (
          <>
            <dl className="mb-4 divide-y divide-sand rounded-2xl border border-sand bg-crema text-sm">
              {filas.map(([k, v], j) => (
                <div key={`${k}-${j}`} className="flex justify-between gap-4 px-3 py-2">
                  <dt className="text-taupe">{k}</dt>
                  <dd className="text-right font-semibold text-tinta">{v}</dd>
                </div>
              ))}
            </dl>
            <Pregunta ayuda="Se pide una sola vez, al final.">¿Quién lo hace?</Pregunta>
            <ComboResponsable control={responsable} deshabilitado={enviando} />
          </>
        );
      }
    }
  }

  return (
    <div onKeyDown={alTeclear} className="flex min-h-0 flex-1 flex-col">
      {/* La acción, la talla y los pasos. */}
      <div className="grid gap-2.5 border-b border-sand px-[18px] py-3">
        <p className="flex items-center gap-2 text-sm text-tinta">
          <i aria-hidden className="h-4 w-4 shrink-0 rounded-full shadow-[0_0_0_1px_var(--color-sand)]" style={{ background: fondoContexto }} />
          <span className="min-w-0 truncate">
            <b className="font-semibold">{NOMBRE_FLUJO[tipo]}</b>
            <span className="text-taupe">
              {" · "}
              {tipo === "colgarVarias" || tipo === "subirVarias" ? `${colores.length} ${colores.length === 1 ? "color" : "colores"} · todas las tallas` : `${prenda.color ?? "Sin color"} · talla ${fila.talla ?? "Única"}`}
            </span>
          </span>
        </p>
        <ol aria-label="Pasos" className="flex flex-wrap gap-1.5">
          {pasos.map((p, j) => {
            const hecho = j < i && pasoCompleto(p, tipo, d, ctx);
            return (
              <li key={p} aria-current={j === i ? "step" : undefined} className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12.5px] ${j === i ? "border-tinta bg-tinta text-papel" : hecho ? "border-verde/40 text-verde" : "border-sand text-taupe"}`}>
                <span className="tabular-nums">{hecho ? "✓" : j + 1}</span>
                {ETIQUETA_PASO[p]}
              </li>
            );
          })}
        </ol>
      </div>

      <div ref={cuerpo} key={`${tipo}-${paso}`} className="anim-asentar scroll-cayla min-h-0 flex-1 overflow-y-auto px-[18px] pb-4 pt-4">
        <CampoGuiado id={paso} guia={guia} retiene="fila">
          {cuerpoDelPaso()}
        </CampoGuiado>
      </div>

      <div className="grid gap-2 border-t border-sand bg-papel px-[18px] pb-4 pt-3">
        {error && (
          <Aviso tono="error">{error}</Aviso>
        )}
        {!completo && faltanHasta(tipo, i, d, ctx).length > 0 && <PieGuia guia={guiaDePasos} />}
        <div className="flex gap-2">
          {i === 0 || incierto ? (
            <button type="button" onClick={atras} disabled={enviando} className="btn-cayla btn-secundario flex-1 gap-1.5">
              Cancelar
            </button>
          ) : (
            <Volver onClick={atras} deshabilitado={enviando} a="Volver al paso anterior" className="self-center" />
          )}
          <button
            type="button"
            onClick={seguir}
            disabled={!completo || enviando}
            title={completo ? undefined : (guia.frase ?? responsable.motivo ?? undefined)}
            className={`btn-cayla btn-primario flex-[2] gap-2 ${completo ? "hilo-seguir" : ""}`}
          >
            {ultimo && <IconoFinal aria-hidden className="h-[18px] w-[18px]" strokeWidth={1.6} />}
            {enviando ? "Guardando…" : ultimo ? (tipo === "danada" ? textoBotonReportar(d.n ?? 0, incierto) : incierto ? "Confirmar de nuevo" : verboFinal(tipo, d, nombreSede(d.sedeId))) : "Continuar"}
            {!ultimo && <ArrowRight aria-hidden className="h-4 w-4" />}
            <kbd className="ml-1 hidden rounded border border-crema/30 px-1 text-[11px] font-normal text-crema/80 sm:inline">↵</kbd>
          </button>
        </div>
      </div>
    </div>
  );
}
