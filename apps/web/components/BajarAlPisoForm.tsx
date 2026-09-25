"use client";

import { useEffect, useEffectEvent, useMemo, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Info, Loader2, Minus, Plus, ScanBarcode } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { ErrorEscritura } from "@/lib/error-escritura";
import { esperaOcupada, suscribirEspera } from "@/lib/espera-estado";
import { avisar } from "@/components/ui/Avisos";
import { Chip } from "@/components/ui/Chip";
import { MiniaturaPrenda } from "@/components/ui/PrendaCelda";
import { ComboResponsable } from "@/components/ComboResponsable";
import { useResponsable } from "@/lib/useResponsable";
import { firmar } from "@/lib/responsable-reglas";
import { teclaSueltaVaAlEscaner } from "@/lib/escaner-tecla-suelta";
import {
  BOTON_COMPROBAR,
  BOTON_CONFIRMAR_DE_NUEVO,
  BUFER_VACIO,
  MAX_LINEAS_BAJADA,
  RPC_BAJADA,
  VERSION_BORRADOR,
  alBufer,
  argumentosDeBajada,
  avisoDeExito,
  claveDeBorrador,
  conTopeDeLaBase,
  fijarCantidad,
  interpretarErrorDeBajada,
  leerBorrador,
  leerCodigo,
  leerRespuestaDeBajada,
  loQueFalta,
  nombreDePrenda,
  quitarLinea,
  resolverTokenReusado,
  resumenDeBajada,
  serializarBorrador,
  sumarLectura,
  teclaDeLaPistola,
  textoDeBorrador,
  textoDeConfirmar,
  textoDeEnvioIncierto,
  textoMarcaSinResolver,
  textoNotaDelPie,
  respuestaResuelveLaMarca,
  textoDeExito,
  textoDeLectura,
  textoDeResumen,
  textoEscaneoCongelado,
  type BorradorDeBajada,
  type BuferDePistola,
  type ErrorDeBajada,
  type LineaBajada,
  type PrendaBajable,
  type RespuestaBajada,
} from "@/lib/bajada-reglas";

/*
 * «Bajar prendas al piso» (ADR-0208, paso 1). Se usa de pie junto al fardo, con la pistola (que es un teclado): cada
 * lectura suma 1 a su línea y la base se toca UNA vez, al confirmar, con `bajar_al_piso` (todo o nada). Por eso no hay
 * <form>: nada de lo que escriba la pistola puede enviar la bajada, y el botón es type="button".
 *
 * El token hace seguro reintentar SOLO con la misma lista. Si la respuesta no llega, no sabemos si se guardó: la lista
 * se CONGELA y el único botón vuelve a enviar lo mismo con el mismo token (y el borrador guarda que ya se envió, para
 * que una recarga tampoco deje empezar otra sin comprobar).
 */

type Problema = { hay: number; motivo: string };

/** Envío sin respuesta: la pantalla lo vio fallar (`red`) o lo encontró en el borrador al abrir (`borrador`). */
type Incierto = { origen: "red" | "borrador"; enviadoEn: string };

const MOTIVO_CORTO: Record<string, string> = { archivada: "archivada", no_existe: "ya no existe", no_es_prenda: "no es una prenda" };

// El borrador nunca rompe la pantalla: modo privado, cuota llena o almacenamiento bloqueado = «no se guardó».
function leerTexto(clave: string): string | null {
  try {
    return window.localStorage.getItem(clave);
  } catch {
    return null;
  }
}
function guardarTexto(clave: string, texto: string): boolean {
  try {
    window.localStorage.setItem(clave, texto);
    return true;
  } catch {
    return false;
  }
}
function borrarTexto(clave: string): void {
  try {
    window.localStorage.removeItem(clave);
  } catch {
    // Si no se puede borrar, tampoco se pudo guardar.
  }
}

export function BajarAlPisoForm({ ubicacionId, sede, prendas }: { ubicacionId: string; sede: string; prendas: PrendaBajable[] }) {
  const router = useRouter();
  const responsable = useResponsable({ ubicacionId, etiqueta: sede });
  const clave = claveDeBorrador(ubicacionId);
  const escaner = useRef<HTMLInputElement>(null);
  // Un token por intento (ADR-0190): el mismo intento dos veces (doble clic, reintento tras un corte) no baja dos veces.
  // Se conserva si falla y se renueva solo cuando la base respondió que guardó (o que ya estaba guardada).
  const token = useRef<string>(crypto.randomUUID());
  const creadoEn = useRef<string | null>(null);
  // La hora del envío cuya respuesta aún no llegó; va al borrador ANTES de llamar a la base.
  const enviadoEn = useRef<string | null>(null);
  // Espejo de `lineas` para las ráfagas de la pistola: cada Enter parte de la lista real, no de la del último render.
  const lineasRef = useRef<LineaBajada[]>([]);
  const borradorLeido = useRef(false);
  // El borrador que se ofrece en pantalla, en un ref: varias lecturas del búfer en el mismo render lo toman UNA vez.
  const borradorPendiente = useRef<BorradorDeBajada | null>(null);
  // Dos clics antes de que se pinte el botón apagado no mandan dos veces (el token igual lo haría inofensivo).
  const enviandoRef = useRef(false);
  // Desde que se pide el refresco hasta que la pantalla vuelve a leer: lo que dispare la pistola va al búfer.
  const refrescandoRef = useRef(false);
  // Lo que disparó la pistola mientras se guardaba o se refrescaba (el loader deja la app `inert`: se perdería).
  const bufer = useRef<BuferDePistola>(BUFER_VACIO);
  // Con la lista congelada, un Enter precedido de caracteres es la pistola; uno suelto es ella activando un botón.
  const caracteresCongelada = useRef(false);

  const [lineas, setLineas] = useState<LineaBajada[]>([]);
  const [aviso, setAviso] = useState<string | null>(null);
  const [anuncio, setAnuncio] = useState("");
  const [destello, setDestello] = useState<{ id: string; n: number } | null>(null);
  const [problemas, setProblemas] = useState<Record<string, Problema>>({});
  const [errorConfirmar, setErrorConfirmar] = useState<ErrorDeBajada | null>(null);
  const [avisoConfirmar, setAvisoConfirmar] = useState<string | null>(null);
  const [incierto, setIncierto] = useState<Incierto | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [refrescando, iniciarRefresco] = useTransition();
  const esperaLibre = useSyncExternalStore(suscribirEspera, () => !esperaOcupada(), () => true);
  const [exito, setExito] = useState<{ titulo: string; detalle: string } | null>(null);
  const [borrador, setBorrador] = useState<BorradorDeBajada | null>(null);
  const [descartarBorrador, setDescartarBorrador] = useState(false);
  const [sinGuardado, setSinGuardado] = useState(false);
  const [edicion, setEdicion] = useState<Record<string, string>>({});

  // Solo sin el detalle de la base (una base anterior al contrato): no se sabe qué se guardó y esa lista no se reenvía.
  const bloqueada = errorConfirmar?.tipo === "token_reusado";
  const congelada = incierto !== null;
  const botonIncierto = incierto?.origen === "borrador" ? BOTON_COMPROBAR : BOTON_CONFIRMAR_DE_NUEVO;
  const listaQuieta = enviando || congelada;
  const porId = useMemo(() => new Map(prendas.map((p) => [p.varianteId, p] as const)), [prendas]);
  const prendasConTope = useMemo(() => prendas.map((p) => conTopeDeLaBase(p, problemas[p.varianteId])), [prendas, problemas]);
  const porIdConTope = useMemo(() => new Map(prendasConTope.map((p) => [p.varianteId, p] as const)), [prendasConTope]);
  const resumen = resumenDeBajada(lineas, prendas);
  const motivo =
    lineas.length === 0
      ? "Escanea al menos una prenda."
      : lineas.length > MAX_LINEAS_BAJADA
        ? `Una bajada admite hasta ${MAX_LINEAS_BAJADA} prendas distintas y esta lista tiene ${lineas.length}: quita ${lineas.length - MAX_LINEAS_BAJADA} y bájalas en otra.`
        : responsable.motivo;
  const puedeConfirmar = !enviando && motivo === null;

  // localStorage solo existe en el navegador: el borrador se lee al montar, una sola vez (no tras cada router.refresh).
  // Uno ENVIADO vuelve congelado: lo único que se ofrece es comprobarlo, nunca empezar otra encima.
  const restaurarBorrador = useEffectEvent(() => {
    if (borradorLeido.current) return;
    borradorLeido.current = true;
    const b = leerBorrador(leerTexto(clave), new Date(), prendas);
    if (!b) return;
    if (!b.enviadoEn) {
      borradorPendiente.current = b;
      return setBorrador(b);
    }
    token.current = b.token;
    creadoEn.current = b.creadoEn;
    enviadoEn.current = b.enviadoEn;
    lineasRef.current = b.lineas;
    setLineas(b.lineas);
    setIncierto({ origen: "borrador", enviadoEn: b.enviadoEn });
  });
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- misma decisión que la espera de Vender: no hay otra forma de leerlo sin romper la hidratación
    restaurarBorrador();
  }, []);

  // Fase de captura, antes que nadie: mientras se guarda o se refresca, las teclas de la pistola van al búfer (con la
  // app `inert` caerían en ninguna parte). Con la lista congelada, una lectura no suma: pide primero el botón.
  const alTeclearAntes = useEffectEvent((e: KeyboardEvent) => {
    const activo = document.activeElement;
    const tipo = teclaDeLaPistola(e, activo, activo !== null && activo === escaner.current);
    if (!tipo) return;
    if (enviandoRef.current || refrescandoRef.current || esperaOcupada()) {
      e.preventDefault();
      e.stopPropagation();
      bufer.current = alBufer(bufer.current, tipo, e.key);
      return;
    }
    if (!congelada) return;
    if (tipo === "caracter") {
      e.preventDefault();
      e.stopPropagation();
      caracteresCongelada.current = true;
      return;
    }
    if (!caracteresCongelada.current) return;
    e.preventDefault();
    e.stopPropagation();
    caracteresCongelada.current = false;
    setAviso(textoEscaneoCongelado(botonIncierto));
  });
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => alTeclearAntes(e);
    window.addEventListener("keydown", alTeclear, true);
    return () => window.removeEventListener("keydown", alTeclear, true);
  }, []);

  // La pistola escribe donde esté el foco: si quedó en un botón, el código se perdería y el Enter activaría ese botón.
  useEffect(() => {
    if (bloqueada || congelada) return;
    const alTeclear = (e: KeyboardEvent) => {
      if (teclaSueltaVaAlEscaner(e, document.activeElement)) escaner.current?.focus();
    };
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [bloqueada, congelada]);

  // Cerrar o recargar con prendas escaneadas y sin confirmar: el aviso nativo del navegador.
  const hayLineas = lineas.length > 0;
  useEffect(() => {
    if (!hayLineas) return;
    const alSalir = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", alSalir);
    return () => window.removeEventListener("beforeunload", alSalir);
  }, [hayLineas]);

  function volverAlEscaner() {
    escaner.current?.focus({ preventScroll: true });
  }

  function guardarBorrador(siguientes: readonly LineaBajada[]) {
    if (siguientes.length === 0) {
      creadoEn.current = null;
      borrarTexto(clave);
      return;
    }
    creadoEn.current ??= new Date().toISOString();
    const b: BorradorDeBajada = {
      v: VERSION_BORRADOR,
      token: token.current,
      lineas: [...siguientes],
      creadoEn: creadoEn.current,
      ...(enviadoEn.current ? { enviadoEn: enviadoEn.current } : {}),
    };
    if (!guardarTexto(clave, serializarBorrador(b))) setSinGuardado(true);
  }

  function cambiarLineas(siguientes: LineaBajada[]) {
    lineasRef.current = siguientes;
    setLineas(siguientes);
    guardarBorrador(siguientes);
  }

  // Solo cuando la base ya respondió que guardó (o que ya estaba guardada): lo que siga es otra bajada.
  function estrenarToken() {
    token.current = crypto.randomUUID();
    creadoEn.current = null;
    enviadoEn.current = null;
  }

  function refrescar() {
    refrescandoRef.current = true;
    iniciarRefresco(() => router.refresh());
  }

  // Seguir con el borrador: su lista y SU token, para que un reintento de algo que sí se guardó no baje dos veces.
  function seguirConBorrador(b: BorradorDeBajada): LineaBajada[] {
    borradorPendiente.current = null;
    token.current = b.token;
    creadoEn.current = b.creadoEn;
    lineasRef.current = b.lineas;
    setLineas(b.lineas);
    setBorrador(null);
    setDescartarBorrador(false);
    return b.lineas;
  }

  function leerEscaneo(texto: string, { conservarExito = false }: { conservarExito?: boolean } = {}) {
    if (!texto.trim() || bloqueada) return;
    if (congelada) {
      setAviso(textoEscaneoCongelado(botonIncierto));
      return;
    }
    // Escanear con la pregunta del borrador a la vista es seguir con él: nada escaneado antes se pierde en silencio.
    const pendiente = borradorPendiente.current;
    const base = pendiente ? seguirConBorrador(pendiente) : lineasRef.current;
    const lectura = leerCodigo(texto, prendasConTope, base);
    // Lo que se leyó mientras se guardaba llega después del éxito: la tarjeta sigue a la vista.
    if (!conservarExito) setExito(null);
    if (lectura.tipo === "suma") {
      cambiarLineas(sumarLectura(base, lectura.prenda.varianteId));
      setAviso(null);
      setDestello((d) => ({ id: lectura.prenda.varianteId, n: (d?.n ?? 0) + 1 }));
      setAnuncio(textoDeLectura(lectura, sede));
      return;
    }
    setAviso(textoDeLectura(lectura, sede));
  }

  // Cuando la pantalla vuelve a poder leer (sin guardar, sin refrescar y sin loader), se lee lo que quedó en el búfer
  // con la lógica de siempre, ya sobre la lista y los topes nuevos. El código a medias vuelve al campo para que termine.
  const vaciarBufer = useEffectEvent(() => {
    refrescandoRef.current = false;
    const { codigos, parcial } = bufer.current;
    bufer.current = BUFER_VACIO;
    for (const codigo of codigos) leerEscaneo(codigo, { conservarExito: true });
    if (congelada || bloqueada || !escaner.current) return;
    // Mientras el loader estuvo a la vista el campo no podía recibir el foco (`inert`): se le devuelve si nadie lo tiene.
    const sinFoco = document.activeElement === null || document.activeElement === document.body;
    if (parcial) escaner.current.value = parcial;
    if (parcial || sinFoco) escaner.current.focus({ preventScroll: true });
  });
  useEffect(() => {
    if (enviando || refrescando || !esperaLibre) return;
    vaciarBufer();
  }, [enviando, refrescando, esperaLibre]);

  function cambiarCantidad(varianteId: string, cantidad: number) {
    const prenda = porIdConTope.get(varianteId);
    if (prenda) cambiarLineas(fijarCantidad(lineasRef.current, prenda, cantidad));
    volverAlEscaner();
  }

  function quitar(varianteId: string) {
    cambiarLineas(quitarLinea(lineasRef.current, varianteId));
    volverAlEscaner();
  }

  // El número se valida al salir del campo (no en cada tecla), para poder borrarlo y escribir otro.
  function confirmarNumero(varianteId: string, texto: string) {
    setEdicion((m) => {
      const resto = { ...m };
      delete resto[varianteId];
      return resto;
    });
    const limpio = texto.trim();
    if (!limpio) return;
    // Más de 6 caracteres no es una cantidad (la base admite hasta 999999): es la pistola, que escribió en este campo.
    if (limpio.length > 6) return leerEscaneo(limpio);
    const prenda = porIdConTope.get(varianteId);
    if (prenda) cambiarLineas(fijarCantidad(lineasRef.current, prenda, Number(limpio)));
  }

  function terminarEnvio() {
    enviandoRef.current = false;
    setEnviando(false);
  }

  async function confirmar() {
    const enviadas = lineasRef.current;
    if (!puedeConfirmar || enviandoRef.current || enviadas.length === 0) return;
    enviandoRef.current = true;
    setEnviando(true);
    setErrorConfirmar(null);
    setAvisoConfirmar(null);
    setAviso(null);
    caracteresCongelada.current = false;
    // La marca va al borrador ANTES de la llamada: si se corta la luz ahora, al volver se comprueba en vez de empezar otra.
    // Un reenvío conserva la hora del primer envío, que es la que importa para saber si ya se guardó.
    const eraReenvio = enviadoEn.current !== null;
    const marcaDeEnvio = (enviadoEn.current ??= new Date().toISOString());
    guardarBorrador(enviadas);
    const nombreResponsable = responsable.lista.elegibles.find((p) => p.personaId === responsable.elegidoId)?.nombre ?? null;
    let data: unknown = null;
    let error: ErrorEscritura = null;
    try {
      const respuesta = await firmar(
        createClient().rpc(RPC_BAJADA as never, argumentosDeBajada(ubicacionId, enviadas, token.current) as never),
        responsable.firma(),
      );
      data = respuesta.data;
      error = respuesta.error;
    } catch (e) {
      error = { message: e instanceof Error ? e.message : String(e) };
    }
    responsable.despues(error);

    if (error) {
      const fallo = interpretarErrorDeBajada(error, sede);
      if (fallo.tipo === "red") {
        // Sin respuesta no se sabe si se guardó: la lista se congela y solo se reenvía igual, con el mismo token.
        setIncierto({ origen: "red", enviadoEn: marcaDeEnvio });
        setErrorConfirmar(fallo);
        avisar.error(fallo.mensaje);
        terminarEnvio();
        return;
      }
      if (eraReenvio && !respuestaResuelveLaMarca(error)) {
        // La base contestó sin mirar la marca (módulo apagado, sesión vencida): la bajada anterior sigue en duda. Se
        // conserva congelada y con su marca en el borrador; soltarla dejaría bajar dos veces lo que quizá ya se guardó.
        setIncierto((i) => i ?? { origen: "red", enviadoEn: marcaDeEnvio });
        setErrorConfirmar(fallo);
        setAvisoConfirmar(textoMarcaSinResolver(marcaDeEnvio, botonIncierto));
        avisar.error(fallo.mensaje);
        terminarEnvio();
        return;
      }
      // La base miró la marca: o esa transacción se deshizo entera, o dice qué guardó. La marca de envío sobra.
      enviadoEn.current = null;
      setIncierto(null);
      if (fallo.tipo === "token_reusado" && fallo.guardadas) {
        const salida = resolverTokenReusado(lineasRef.current, fallo.guardadas, fallo.mensaje, sede);
        estrenarToken();
        cambiarLineas(salida.tipo === "faltan" ? salida.lineas : []);
        setProblemas({});
        setEdicion({});
        if (salida.tipo === "ya_estaba") {
          setExito(salida.exito);
          avisar.aviso(salida.exito.detalle, { detalle: sede });
        } else {
          setAvisoConfirmar(salida.mensaje);
          avisar.aviso(salida.mensaje, { detalle: sede });
        }
        // Lo guardado ya salió del almacén: los topes de la pantalla se releen.
        refrescar();
        terminarEnvio();
        volverAlEscaner();
        return;
      }
      setErrorConfirmar(fallo);
      avisar.error(fallo.mensaje);
      if (fallo.tipo === "sin_alcance") setProblemas(Object.fromEntries(fallo.lineas.map((l) => [l.varianteId, { hay: l.hay, motivo: l.motivo }])));
      if (fallo.tipo === "token_reusado") {
        // Sin saber qué se guardó, esa lista no se puede reenviar (bajaría dos veces): ni en pantalla ni en el borrador.
        lineasRef.current = [];
        setLineas([]);
        creadoEn.current = null;
        borrarTexto(clave);
      } else {
        guardarBorrador(lineasRef.current);
      }
      terminarEnvio();
      return;
    }

    // Sin error la transacción se confirmó: si la respuesta no calza con el contrato, se informa con lo que se envió.
    const r: RespuestaBajada = leerRespuestaDeBajada(data) ?? {
      bajada_id: "",
      ya_registrada: false,
      lineas: enviadas.length,
      unidades: resumenDeBajada(enviadas, prendas).prendas,
      registrada_en: new Date().toISOString(),
    };
    setIncierto(null);
    estrenarToken();
    cambiarLineas(loQueFalta(lineasRef.current, enviadas));
    setProblemas({});
    setEdicion({});
    setExito(textoDeExito(r, sede, nombreResponsable));
    if (r.ya_registrada) {
      avisar.aviso(textoDeExito(r, sede).detalle, { detalle: sede });
    } else {
      const a = avisoDeExito(r, sede);
      avisar.exito(a.titulo, { detalle: a.detalle });
    }
    refrescar();
    terminarEnvio();
    volverAlEscaner();
  }

  function empezarOtraBajada() {
    estrenarToken();
    setErrorConfirmar(null);
    setProblemas({});
    setAviso(null);
    // El campo estaba deshabilitado: se enfoca cuando ya se pintó habilitado.
    requestAnimationFrame(() => escaner.current?.focus());
  }

  function empezarDeNuevo() {
    if (!descartarBorrador) return setDescartarBorrador(true);
    borradorPendiente.current = null;
    borrarTexto(clave);
    setBorrador(null);
    setDescartarBorrador(false);
    volverAlEscaner();
  }

  return (
    <div className="space-y-4">
      {borrador && (
        <div className="card-cayla anim-revelar flex flex-wrap items-center justify-between gap-3 p-4 sm:px-5">
          <p className="min-w-0 flex-1 basis-64 text-sm text-tinta">{textoDeBorrador(borrador)}</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-cayla btn-primario h-11"
              onClick={() => {
                seguirConBorrador(borrador);
                volverAlEscaner();
              }}
            >
              Continuar
            </button>
            <button type="button" className={`btn-cayla h-11 ${descartarBorrador ? "btn-peligro" : "btn-secundario"}`} onClick={empezarDeNuevo}>
              {descartarBorrador ? "Sí, borrar esa lista" : "Empezar de nuevo"}
            </button>
          </div>
        </div>
      )}

      <section className="card-cayla p-4 sm:p-5">
        <label htmlFor="bajar-escaner" className="label-cayla text-[11px] text-taupe">
          Escanear prenda
        </label>
        <div className="caja-cayla relative mt-2">
          <ScanBarcode aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-tinta/45" />
          <input
            ref={escaner}
            id="bajar-escaner"
            type="text"
            autoFocus
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="enter"
            disabled={bloqueada || congelada}
            aria-describedby="bajar-ayuda"
            placeholder="Apunta la pistola y dispara, o escribe el código"
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              // Se lee el campo y no un estado: con una ráfaga de la pistola, el estado puede ir un carácter atrás.
              const texto = e.currentTarget.value;
              e.currentTarget.value = "";
              leerEscaneo(texto);
            }}
            className="h-14 w-full bg-transparent pl-11 pr-4 text-base text-tinta outline-none placeholder:text-tinta/45 disabled:cursor-not-allowed disabled:opacity-60"
          />
        </div>
        <p id="bajar-ayuda" className="mt-2 text-xs text-taupe">
          Cada lectura suma 1. Si tienes 12 iguales, escanea una y cambia el número.
        </p>
        {aviso && (
          <p role="alert" className="anim-revelar mt-3 flex items-start gap-2 rounded-lg border border-ambar/35 bg-ambar/[0.07] px-3 py-2.5 text-sm text-ambar-profundo">
            <Info aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{aviso}</span>
          </p>
        )}
        <p className="sr-only" aria-live="polite">
          {anuncio}
        </p>
      </section>

      {/* Con un rechazo a la vista, el aviso de abajo ya dice que sigue en duda: no se repite. */}
      {incierto?.origen === "borrador" && !errorConfirmar && (
        <div role="status" className="anim-revelar rounded-xl border border-l-2 border-ambar/35 border-l-ambar bg-ambar/[0.07] px-4 py-3 text-sm text-ambar-profundo">
          {textoDeEnvioIncierto(incierto.enviadoEn)}
        </div>
      )}

      {errorConfirmar && !bloqueada && (
        <div role="alert" className="anim-revelar rounded-xl border border-l-2 border-rojo/40 border-l-rojo bg-rojo/[0.06] px-4 py-3 text-sm text-tinta">
          {errorConfirmar.mensaje}
        </div>
      )}

      {avisoConfirmar && (
        <div role="status" className="anim-revelar rounded-xl border border-l-2 border-ambar/35 border-l-ambar bg-ambar/[0.07] px-4 py-3 text-sm text-ambar-profundo">
          {avisoConfirmar}
        </div>
      )}

      {bloqueada ? (
        <section role="alert" className="card-cayla anim-revelar space-y-4 border-l-2 border-l-rojo p-5">
          <p className="text-sm text-tinta">{errorConfirmar.mensaje}</p>
          <button type="button" className="btn-cayla btn-primario h-11" onClick={empezarOtraBajada}>
            Empezar otra bajada
          </button>
        </section>
      ) : (
        <>
          {exito && (
            <section role="status" className="card-cayla anim-revelar flex flex-wrap items-center justify-between gap-4 border-l-2 border-l-verde p-5">
              <div className="flex min-w-0 items-start gap-3">
                <Check aria-hidden className="mt-1 h-5 w-5 shrink-0 text-verde" />
                <div className="min-w-0">
                  <p className="font-display text-xl text-tinta">{exito.titulo}</p>
                  <p className="mt-0.5 text-sm text-taupe">{exito.detalle}</p>
                </div>
              </div>
              <button
                type="button"
                className="btn-cayla btn-secundario h-11"
                onClick={() => {
                  setExito(null);
                  volverAlEscaner();
                }}
              >
                Bajar otro fardo
              </button>
            </section>
          )}

          {(hayLineas || !exito) && (
            <section className="card-cayla overflow-hidden">
              {!hayLineas ? (
                <p className="px-5 py-10 text-center text-sm text-taupe">Aún no escaneaste nada.</p>
              ) : (
                <ul className="divide-y divide-tinta/10">
                  {lineas.map((l) => {
                    const prenda = porId.get(l.varianteId);
                    const tope = porIdConTope.get(l.varianteId)?.almacenDisponible ?? 0;
                    const problema = problemas[l.varianteId];
                    const enRojo = !!problema && (problema.motivo !== "sin_alcance" || l.cantidad > problema.hay);
                    const nombre = prenda ? nombreDePrenda(prenda) : "Una prenda";
                    return (
                      <li key={l.varianteId} className={`relative flex flex-wrap items-center gap-x-4 gap-y-2.5 px-4 py-3 sm:px-5 ${enRojo ? "bg-rojo/[0.05]" : ""}`}>
                        {destello?.id === l.varianteId && <span key={destello.n} aria-hidden className="anim-destello-lectura pointer-events-none absolute inset-0" />}
                        <div className="relative flex min-w-0 flex-1 basis-56 items-start gap-3">
                          <MiniaturaPrenda fotoUrl={prenda?.fotoUrl ?? null} tamano="lg" />
                          <div className="min-w-0">
                            <p className="text-sm text-tinta">{nombre}</p>
                            {prenda?.sku && <p className="font-mono text-xs text-tinta/65">{prenda.sku}</p>}
                            <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-taupe">
                              {problema && enRojo ? (
                                <Chip tono="rojo">{problema.motivo === "sin_alcance" ? `hay ${problema.hay}` : (MOTIVO_CORTO[problema.motivo] ?? "no se puede bajar")}</Chip>
                              ) : (
                                <span className="tabular-nums">En almacén: {tope}</span>
                              )}
                            </p>
                          </div>
                        </div>
                        <div className="relative ml-auto flex items-center gap-1.5">
                          <button
                            type="button"
                            aria-label={`Una menos de ${nombre}`}
                            disabled={listaQuieta}
                            onClick={() => cambiarCantidad(l.varianteId, l.cantidad - 1)}
                            className="btn-cayla btn-secundario h-11 w-11 p-0"
                          >
                            <Minus aria-hidden className="h-4 w-4" />
                          </button>
                          <input
                            type="text"
                            inputMode="numeric"
                            aria-label={`Cantidad de ${nombre}`}
                            disabled={listaQuieta}
                            value={edicion[l.varianteId] ?? String(l.cantidad)}
                            onFocus={(e) => e.currentTarget.select()}
                            onChange={(e) => {
                              const valor = e.target.value;
                              setEdicion((m) => ({ ...m, [l.varianteId]: valor }));
                            }}
                            onBlur={(e) => confirmarNumero(l.varianteId, e.currentTarget.value)}
                            onKeyDown={(e) => {
                              if (e.key !== "Enter") return;
                              e.preventDefault();
                              volverAlEscaner();
                            }}
                            className={`caja-cayla h-11 w-14 text-center text-base tabular-nums outline-none disabled:opacity-60 ${enRojo ? "text-rojo-profundo" : "text-tinta"}`}
                          />
                          <button
                            type="button"
                            aria-label={`Una más de ${nombre}`}
                            disabled={listaQuieta || l.cantidad >= tope}
                            onClick={() => cambiarCantidad(l.varianteId, l.cantidad + 1)}
                            className="btn-cayla btn-secundario h-11 w-11 p-0"
                          >
                            <Plus aria-hidden className="h-4 w-4" />
                          </button>
                          <button type="button" disabled={listaQuieta} onClick={() => quitar(l.varianteId)} className="btn-cayla btn-sutil ml-1 h-11">
                            Quitar
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          )}

          {hayLineas && <p className="nota-cayla">{textoNotaDelPie(congelada)}</p>}
          {sinGuardado && hayLineas && (
            <p role="status" className="rounded-xl border border-ambar/35 bg-ambar/[0.07] px-4 py-3 text-sm text-ambar-profundo">
              Este navegador no puede guardar tu lista: confirma antes de salir de la pantalla.
            </p>
          )}

          {/* Pie pegajoso al fondo: desde ADR-0206 el celular no tiene barra abajo (mismo patrón que FichaPrevia). */}
          <div className="sticky bottom-0 z-20 -mx-4 border-t border-sand bg-papel px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] pt-3 sm:bottom-4 sm:mx-0 sm:rounded-xl sm:border sm:px-5 sm:py-3">
            <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
              <div className="min-w-0">
                <p className="font-display text-xl tabular-nums text-tinta">{textoDeResumen(resumen)}</p>
                {motivo && !enviando && (
                  <p id="bajar-motivo" className="mt-0.5 text-xs text-taupe">
                    {motivo}
                  </p>
                )}
              </div>
              <div className="flex w-full flex-col gap-2.5 sm:w-auto sm:flex-row sm:items-end">
                <ComboResponsable control={responsable} deshabilitado={enviando} className="sm:w-64" />
                <button
                  type="button"
                  onClick={confirmar}
                  disabled={!puedeConfirmar}
                  aria-describedby={motivo && !enviando ? "bajar-motivo" : undefined}
                  className="btn-cayla btn-primario h-11 w-full sm:w-auto"
                >
                  {enviando ? (
                    <>
                      <Loader2 aria-hidden className="h-4 w-4 motion-safe:animate-spin" />
                      Guardando…
                    </>
                  ) : congelada ? (
                    botonIncierto
                  ) : hayLineas ? (
                    textoDeConfirmar(resumen.prendas)
                  ) : (
                    "Confirmar bajada"
                  )}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
