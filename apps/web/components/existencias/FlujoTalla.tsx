"use client";

import { useEffect, useRef, useState, type ComponentType, type KeyboardEvent as KeyboardEventReact, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Bandage, PencilLine, Truck, Warehouse } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { avisar } from "@/components/ui/Avisos";
import { IconoPercha } from "@/components/ui/IconoPercha";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { useResponsable } from "@/lib/useResponsable";
import { firmar } from "@/lib/responsable-reglas";
import { sonarConfirmacion } from "@/lib/sonido-confirmar";
import { esFalloDeRed, esRespuestaIncierta, traducirError, type ErrorEscritura } from "@/lib/error-escritura";
import { argumentosDeBajada, interpretarErrorDeBajada, itemsParaRpc, leerRespuestaDeBajada, RPC_BAJADA, type LineaBajada } from "@/lib/bajada-reglas";
import { argumentosDeRetiro, interpretarErrorDeRetiro, leerRespuestaDeRetiro, RPC_RETIRO } from "@/lib/retiro-reglas";
import { RPC_SUBIR_PARA_ENVIAR } from "@/lib/para-enviar-reglas";
import { argumentosDeReporte, interpretarErrorDeDanada, leerRespuestaDanada, MAX_TEXTO_DANADA, RPC_REPORTAR_DANADA } from "@/lib/danadas-reglas";
import { argumentosDeAjuste, faltantesDesdeJson } from "@/lib/ajuste-reglas";
import { cantidadesDeLoQueFalta, cantidadesDeTodoElAlmacen, fraseDeLoQueFalta, tallasQueFaltan } from "@/lib/reponer-prenda-reglas";
import { lineasEnUrl, type PrendaAgrupada } from "@/lib/existencias-prendas";
import { RUTA_NUEVO_TRASLADO } from "@/lib/traslados-reglas";
import { nombreCortoSede } from "@/lib/stock-por-sede";
import {
  ETIQUETA_PASO,
  FALTA_PASO,
  NOMBRE_FLUJO,
  celularValido,
  faltanHasta,
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
  type DatosFlujo,
  type PasoFlujo,
  type SedeConCantidad,
  type TipoFlujo,
} from "@/lib/existencias-flujos";
import type { FilaExistencias } from "@/lib/inventario-v2";

type Prenda = PrendaAgrupada<FilaExistencias>;

/** Sin tope, una conexión colgada dejaría el paso bloqueado para siempre: a los 20 s se trata como un corte (como las ventanas). */
const TOPE_ESPERA_MS = 20_000;

const TEXTO_INCIERTO = "Se cortó la conexión y no sabemos si se guardó. Toca el botón otra vez: con la misma marca, si ya se guardó no se repite.";

const ICONO_FINAL: Record<TipoFlujo, ComponentType<{ className?: string; strokeWidth?: number; "aria-hidden"?: boolean }>> = {
  colgar: IconoPercha,
  colgarVarias: IconoPercha,
  subir: Warehouse,
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
        onChange={(e) => onValor(Math.min(tope, Number.parseInt(e.target.value.replace(/\D/g, ""), 10) || 0))}
        className="h-14 w-16 border-x border-sand bg-transparent text-center font-display text-[26px] tabular-nums text-tinta outline-none"
      />
      <button type="button" aria-label="Una más" disabled={valor >= tope} onClick={() => onValor(Math.min(tope, valor + 1))} className="grid h-14 w-14 place-items-center text-2xl text-tinta disabled:text-taupe/40">
        +
      </button>
    </div>
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

const CLASE_TEXTO = "w-full rounded-xl border border-sand bg-crema px-3 py-2.5 text-[15px] text-tinta outline-none placeholder:text-taupe focus:border-tinta";

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
}: {
  tipo: TipoFlujo;
  datosIniciales?: DatosFlujo;
  /** Empezar en un paso ya armado («Pedir» rápido de una fila de agotadas: la tienda elegida, directo a cuántas). */
  pasoInicial?: number;
  /** El color que se mira. */
  prenda: Prenda;
  /** Todos los colores del modelo (para «Colgar varias»). */
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
  onHecho: (texto: string) => void;
  /** Cancelar (o Escape): vuelve a la talla sin guardar. */
  onSalir: () => void;
  /** Pasar a otra acción con lo que ya se eligió («Se dañó» en Ajustar lleva a Reportar dañada). */
  onCambiar: (tipo: TipoFlujo, datos: DatosFlujo) => void;
  /** Abrir la ventana completa de Ajustar (una talla que faltó en un conteo se enlaza ahí). */
  onAjustarCompleto: () => void;
}) {
  const router = useRouter();
  const responsable = useResponsable();
  const [i, setI] = useState(pasoInicial);
  const [d, setD] = useState<DatosFlujo>(() => ({ ...(tipo === "colgarVarias" ? { cant: {} } : {}), ...datosIniciales }));
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Tras una respuesta incierta los datos quedan fijos: cambiarlos sería otro intento y podría mover dos veces.
  const [incierto, setIncierto] = useState(false);
  // Una talla que faltó en un conteo cerrado: la suma se enlaza al conteo en la ventana completa (no se adivina aquí).
  const [faltoEnConteo, setFaltoEnConteo] = useState(false);
  const enVuelo = useRef(false);
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
  const ctx: ContextoFlujo = {
    piso: Math.max(0, fila.pisoDisponible ?? (separa ? 0 : fila.disponible)),
    almacen: Math.max(0, fila.almacenDisponible ?? 0),
    separa,
    almacenPorTalla,
    destinos,
    origenes,
    puedePedirParaCliente,
    responsableListo: responsable.listo,
  };
  const pasos = pasosDe(tipo, d, ctx);
  const paso = pasos[Math.min(i, pasos.length - 1)];
  const ultimo = i >= pasos.length - 1;
  const bloqueoConteo = tipo === "ajustar" && paso === "motivo" && d.signo === "sumar" && faltoEnConteo;
  const completo = pasoCompleto(paso, tipo, d, ctx) && !bloqueoConteo;
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
    const control = new AbortController();
    const tope = window.setTimeout(() => control.abort(), TOPE_ESPERA_MS);
    let data: unknown = null;
    let errorRpc: ErrorEscritura = null;
    try {
      const r = await firmar(createClient().rpc(llamada.rpc as never, llamada.args as never).abortSignal(control.signal), responsable.firma());
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
      setError(llamada.error(errorRpc));
      router.refresh();
      return;
    }
    const yaEstaba = llamada.yaEstaba(data);
    if (yaEstaba) {
      avisar.aviso("Esto ya estaba guardado. No se repitió.", { detalle: prenda.referencia });
    } else {
      sonarConfirmacion();
      avisar.exito(textoHecho(tipo, d, nombreSede(d.sedeId ?? d.origenId)), { detalle: `${prenda.referencia}${prenda.color ? ` · ${prenda.color}` : ""}${tipo === "colgarVarias" ? "" : ` · ${fila.talla ?? "Única"}`}` });
    }
    router.refresh();
    onHecho(textoHecho(tipo, d, nombreSede(d.sedeId ?? d.origenId)));
  }

  /** La función de la base de cada acción, con sus argumentos y cómo leer su respuesta y su error. */
  function armarLlamada(): { rpc: string; args: unknown; error: (e: ErrorEscritura) => string; yaEstaba: (data: unknown) => boolean } | null {
    const n = d.n ?? 0;
    const una: LineaBajada[] = [{ varianteId: fila.varianteId, cantidad: n }];
    switch (tipo) {
      case "colgar":
      case "colgarVarias": {
        const lineas = tipo === "colgar" ? una : Object.entries(d.cant ?? {}).filter(([, x]) => x > 0).map(([varianteId, cantidad]) => ({ varianteId, cantidad }));
        const token = tokenPara(JSON.stringify(["bajar", lineas]));
        return {
          rpc: RPC_BAJADA,
          args: argumentosDeBajada(ubicacionId, lineas, token),
          error: (e) => interpretarErrorDeBajada(e, sedeNombre).mensaje,
          yaEstaba: (x) => leerRespuestaDeBajada(x)?.ya_registrada === true,
        };
      }
      case "subir": {
        const token = tokenPara(JSON.stringify(["subir", una, d.destino, d.sedeId]));
        if (d.destino === "enviar") {
          return {
            rpc: RPC_SUBIR_PARA_ENVIAR,
            args: { p_ubicacion_id: ubicacionId, p_destino_id: d.sedeId, p_items: itemsParaRpc(una), p_nota: null, p_token: token },
            error: (e) => interpretarErrorDeRetiro(e, sedeNombre).mensaje,
            yaEstaba: (x) => leerRespuestaDeRetiro(x)?.ya_registrada === true,
          };
        }
        return {
          rpc: RPC_RETIRO,
          args: argumentosDeRetiro(ubicacionId, una, "", token),
          error: (e) => interpretarErrorDeRetiro(e, sedeNombre).mensaje,
          yaEstaba: (x) => leerRespuestaDeRetiro(x)?.ya_registrada === true,
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
  const fondoContexto = tipo === "colgarVarias" && colores.length > 1 ? `conic-gradient(${colores.map((c) => c.colorHex ?? "var(--color-hueso)").join(",")})` : color;
  const IconoFinal = ICONO_FINAL[tipo];

  function cuerpoDelPaso(): ReactNode {
    switch (paso) {
      case "cantidad": {
        const max = maxCantidad(tipo, d, ctx);
        const de = tipo === "subir" ? "en piso" : tipo === "pedir" ? `en ${nombreSede(d.origenId) ?? "esa sede"}` : tipo === "danada" ? (d.lugar === "almacen" ? "en almacén" : "en piso") : "en almacén";
        const pregunta = tipo === "colgar" ? "¿Cuántas llevas al piso?" : tipo === "subir" ? "¿Cuántas subes al almacén?" : tipo === "pedir" ? "¿Cuántas pides?" : tipo === "enviar" ? "¿Cuántas envías?" : "¿Cuántas están dañadas?";
        return (
          <>
            <Pregunta ayuda={`Hay ${unidades(max)} ${de}.`}>{pregunta}</Pregunta>
            <Stepper id="flujo-cantidad" valor={d.n ?? 0} max={max} etiqueta="Cantidad" onValor={(n) => poner({ n })} />
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
        const faltan = tallasQueFaltan(colores);
        const frase = fraseDeLoQueFalta(colores);
        const cant = d.cant ?? {};
        return (
          <>
            <Pregunta ayuda="Todo empieza en 0. Cada talla dice cuántas hay en almacén.">¿Cuántas llevas al piso de cada color y talla?</Pregunta>
            {frase && <p className="mb-3 rounded-xl bg-hueso px-3 py-2.5 text-sm text-tinta">{frase}</p>}
            <div className="mb-3 flex flex-wrap gap-1.5" role="group" aria-label="Llenar de un toque">
              {faltan.size > 0 && (
                <button type="button" onClick={() => poner({ cant: { ...cantidadesDeLoQueFalta(colores) } })} className="btn-cayla btn-secundario btn-chico gap-1.5">
                  <IconoPercha aria-hidden className="h-4 w-4 text-ambar-profundo" strokeWidth={1.6} />
                  Lo que falta en el piso · {faltan.size}
                </button>
              )}
              <button type="button" onClick={() => poner({ cant: { ...cantidadesDeTodoElAlmacen(colores) } })} className="btn-cayla btn-secundario btn-chico">
                Todo el almacén
              </button>
              <button type="button" onClick={() => poner({ cant: {} })} disabled={totalVarias(d) === 0} className="btn-cayla btn-sutil btn-chico">
                Vaciar
              </button>
            </div>
            <div className="grid gap-2.5">
              {colores.map((c) => (
                <section key={c.clave} aria-label={c.color ?? "Sin color"} className="rounded-2xl border border-sand bg-papel p-3">
                  <header className="mb-2 flex items-center justify-between gap-2 text-sm">
                    <span className="flex items-center gap-2 font-semibold text-tinta">
                      <i aria-hidden className="h-3.5 w-3.5 rounded-full shadow-[0_0_0_1px_var(--color-sand)]" style={{ background: c.colorHex ?? "var(--color-hueso)" }} />
                      {c.color ?? "Sin color"}
                    </span>
                    <span className="text-[13px] text-taupe">
                      Al piso: <b className="text-tinta">{c.tallas.reduce((s, t) => s + (cant[t.varianteId] ?? 0), 0)}</b>
                    </span>
                  </header>
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-2">
                    {c.tallas.map((t) => {
                      const alm = Math.max(0, t.almacenDisponible ?? 0);
                      const piso = Math.max(0, t.pisoDisponible ?? 0);
                      const n = cant[t.varianteId] ?? 0;
                      if (alm === 0)
                        return (
                          <div key={t.varianteId} className="rounded-xl border border-dashed border-sand p-2 text-taupe">
                            <b className="block text-sm text-tinta/60">{t.talla ?? "Única"}</b>
                            <span className="text-[12px]">Nada en almacén</span>
                          </div>
                        );
                      return (
                        <div key={t.varianteId} className={`grid gap-1.5 rounded-xl border p-2 ${n > 0 ? "border-tinta" : faltan.has(t.varianteId) ? "border-ambar/40 bg-ambar/[0.06]" : "border-sand"}`}>
                          <div className="flex items-baseline justify-between gap-1">
                            <b className="flex items-center gap-1 text-sm text-tinta">
                              {t.talla ?? "Única"}
                              {faltan.has(t.varianteId) && n === 0 && <i aria-label="Falta en el piso" className="h-1.5 w-1.5 rounded-full bg-ambar" />}
                            </b>
                            <small className="text-[11px] text-taupe">{alm} en almacén</small>
                          </div>
                          <div className="flex items-center justify-between rounded-lg border border-sand">
                            <button type="button" aria-label={`Una menos de ${c.color ?? ""} ${t.talla ?? ""}`} disabled={n <= 0} onClick={() => poner({ cant: { ...cant, [t.varianteId]: Math.max(0, n - 1) } })} className="h-9 w-9 text-lg disabled:text-taupe/40">
                              −
                            </button>
                            <input
                              inputMode="numeric"
                              aria-label={`Cantidad de ${c.color ?? ""} ${t.talla ?? ""}`}
                              value={n}
                              onChange={(e) => poner({ cant: { ...cant, [t.varianteId]: Math.min(alm, Number.parseInt(e.target.value.replace(/\D/g, ""), 10) || 0) } })}
                              className="w-10 bg-transparent text-center text-base font-semibold tabular-nums outline-none"
                            />
                            <button type="button" aria-label={`Una más de ${c.color ?? ""} ${t.talla ?? ""}`} disabled={n >= alm} onClick={() => poner({ cant: { ...cant, [t.varianteId]: Math.min(alm, n + 1) } })} className="h-9 w-9 text-lg disabled:text-taupe/40">
                              +
                            </button>
                          </div>
                          <small className="text-[11px] text-taupe">{piso === 0 && n === 0 ? "Nada en piso" : `En piso quedan ${piso + n}`}</small>
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
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
              <Opcion marcada={d.lugar === "piso"} titulo="En piso" sub={tipo === "danada" ? `${ctx.piso} libres colgadas` : `El sistema dice ${ctx.piso}`} onClick={() => poner({ lugar: "piso", motivo: undefined, n: tipo === "danada" ? Math.min(d.n ?? 0, ctx.piso) : d.n })} deshabilitada={tipo === "danada" && ctx.piso === 0} />
              <Opcion marcada={d.lugar === "almacen"} titulo="En almacén" sub={tipo === "danada" ? `${ctx.almacen} libres guardadas` : `El sistema dice ${ctx.almacen}`} onClick={() => poner({ lugar: "almacen", motivo: undefined, n: tipo === "danada" ? Math.min(d.n ?? 0, ctx.almacen) : d.n })} deshabilitada={tipo === "danada" && ctx.almacen === 0} />
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
              {tipo === "colgarVarias" ? `${colores.length} ${colores.length === 1 ? "color" : "colores"} · todas las tallas` : `${prenda.color ?? "Sin color"} · talla ${fila.talla ?? "Única"}`}
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
          <p role="alert" className="text-sm text-rojo-profundo">
            {error}
          </p>
        )}
        {!completo && faltanHasta(tipo, i, d, ctx).length > 0 && <PieGuia guia={guiaDePasos} />}
        <div className="flex gap-2">
          <button type="button" onClick={atras} disabled={enviando} className="btn-cayla btn-secundario flex-1 gap-1.5">
            {i === 0 || incierto ? (
              "Cancelar"
            ) : (
              <>
                <ArrowLeft aria-hidden className="h-4 w-4" /> Atrás
              </>
            )}
          </button>
          <button
            type="button"
            onClick={seguir}
            disabled={!completo || enviando}
            title={completo ? undefined : (guia.frase ?? responsable.motivo ?? undefined)}
            className={`btn-cayla btn-primario flex-[2] gap-2 ${completo ? "hilo-seguir" : ""}`}
          >
            {ultimo && <IconoFinal aria-hidden className="h-[18px] w-[18px]" strokeWidth={1.6} />}
            {enviando ? "Guardando…" : ultimo ? (incierto ? "Confirmar de nuevo" : verboFinal(tipo, d, nombreSede(d.sedeId))) : "Continuar"}
            {!ultimo && <ArrowRight aria-hidden className="h-4 w-4" />}
            <kbd className="ml-1 hidden rounded border border-crema/30 px-1 text-[11px] font-normal text-crema/80 sm:inline">↵</kbd>
          </button>
        </div>
      </div>
    </div>
  );
}
