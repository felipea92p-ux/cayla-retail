"use client";

import { useEffect, useEffectEvent, useMemo, useRef, useState, useSyncExternalStore, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Camera, Check, Hand, Info, Loader2, Minus, Plus, ScanBarcode } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { ErrorEscritura } from "@/lib/error-escritura";
import { esperaOcupada, suscribirEspera } from "@/lib/espera-estado";
import { avisar } from "@/components/ui/Avisos";
import { Chip } from "@/components/ui/Chip";
import { MiniaturaPrenda, categoriaDe } from "@/components/ui/PrendaCelda";
import { ComboResponsable } from "@/components/ComboResponsable";
import { BajarEnManoModal } from "@/components/BajarEnManoModal";
import { EscanerConteo, type LecturaConteo, type TextosEscaner } from "@/components/EscanerConteo";
import { avisarLectura } from "@/lib/sonido-conteo";
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
  accionDelEnterBajada,
  alBufer,
  argumentosDeBajada,
  avisoDeExito,
  claveDeBorrador,
  conTopeDeLaBase,
  fijarCantidad,
  porEscanear,
  unirConIniciales,
  interpretarErrorDeBajada,
  leerBorrador,
  leerCodigo,
  leerPrenda,
  leerRespuestaDeBajada,
  loQueFalta,
  nombreDePrenda,
  quitarLinea,
  resolverTokenReusado,
  resumenDeBajada,
  serializarBorrador,
  sonidoDeLecturaBajada,
  sumarLectura,
  teclaDeLaPistola,
  textoDeBorrador,
  textoDeConfirmar,
  textoDeEnvioIncierto,
  textoMarcaSinResolver,
  textoNotaDelPie,
  respuestaResuelveLaMarca,
  textoDeExistencia,
  textoDeExito,
  textoDeLectura,
  textoDeResumen,
  textoEscaneoCongelado,
  type BorradorDeBajada,
  type BuferDePistola,
  type ErrorDeBajada,
  type Lectura,
  type LineaBajada,
  type PrendaBajable,
  type RespuestaBajada,
} from "@/lib/bajada-reglas";
import {
  anotarMarca,
  claveDeMarcasEnMano,
  colgadasAquiDe,
  hechaEnMano,
  leerMarcas,
  marcaParaAbrir,
  ofertaEnMano,
  preguntaDelRack,
  serializarMarcas,
  soltarMarca,
  sumarBajadaHecha,
  sumarHecha,
  textoDeHecha,
  textoDeMarcaEnLista,
  textoDeOferta,
  textoYaEstabaColgada,
  type BajadaHechaAqui,
  type HechaEnMano,
  type MarcaEnDuda,
  type MarcaParaAbrir,
  type MarcasEnDuda,
  type RespuestaEnMano,
} from "@/lib/bajada-en-mano";
import { Aviso } from "@/components/ui/Aviso";

/*
 * «Bajar prendas al piso» (ADR-0208, paso 1). Se usa de pie junto al fardo, con la pistola (que es un teclado): cada
 * lectura suma 1 a su línea y la base se toca UNA vez, al confirmar, con `bajar_al_piso` (todo o nada). Por eso no hay
 * <form>: nada de lo que escriba la pistola puede enviar la bajada, y el botón es type="button".
 *
 * El token hace seguro reintentar SOLO con la misma lista. Si la respuesta no llega, no sabemos si se guardó: la lista
 * se CONGELA y el único botón vuelve a enviar lo mismo con el mismo token (y el borrador guarda que ya se envió, para
 * que una recarga tampoco deje empezar otra sin comprobar).
 *
 * «La tengo en la mano» (ADR-0328, actividad 9): ninguna lectura termina en un callejón. Cada una suena (el bip de Conteo: se
 * mira el rack, no la pantalla); si la etiqueta no se lee, se elige la prenda por nombre; con el celular, la cámara en ráfaga de
 * Conteo; y si el sistema dice 0 en el almacén, la tarjeta ofrece corregir y colgar en un paso (`BajarEnManoModal`,
 * `bajar_en_mano`) o, si el sistema ya la cuenta colgada, le pide mirar el rack: si falta alguna, «Ya estaba colgada» (no escribe
 * nada); si están todas, corregir y colgar. Una corrección que quedó sin respuesta se ofrece para COMPROBAR con su misma marca.
 */

/** Las palabras de la cámara en ráfaga (la misma hoja de Conteo) cuando se usa para bajar. */
const TEXTOS_CAMARA: Omit<TextosEscaner, "contador"> = {
  titulo: "Bajar con la cámara",
  subtitulo: "Pasa las etiquetas una tras otra: cada una suma 1.",
  etiqueta: "Bajar · cada lectura suma 1",
  ayuda: "Pasa las etiquetas una tras otra · suena y vibra en cada una",
  enCurso: "Estás bajando",
  vacio: "Lo que escanees aparece aquí, con − / + para corregir.",
};
const MS_PAUSA_BUSQUEDA = 250;

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

export function BajarAlPisoForm({
  ubicacionId,
  sede,
  prendas,
  iniciales = [],
  abrirCamara = false,
}: {
  ubicacionId: string;
  sede: string;
  prendas: PrendaBajable[];
  /** Lo que llega marcado desde Existencias (`?lineas=`, ADR-0237), ya validado contra esta tienda. Si había una bajada
   *  a medias guardada en el aparato, manda esa: la lista de Existencias no pisa lo que se escaneó y no se confirmó. */
  iniciales?: LineaBajada[];
  /** Llegó por «Colgar en tandas» (`?camara=1`): en un aparato táctil la cámara se abre sola. En el computador, no (ahí está la
   *  pistola, y una cámara web que se enciende sola asusta). */
  abrirCamara?: boolean;
}) {
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
  // «La tengo en la mano»: la prenda que el sistema tiene en 0 en el almacén (la tarjeta bajo el campo), la ventana abierta, lo que
  // ya se corrigió y colgó aquí, y la búsqueda por nombre cuando la etiqueta no se lee.
  const [enMano, setEnMano] = useState<PrendaBajable | null>(null);
  const [ventanaEnMano, setVentanaEnMano] = useState<{ prenda: PrendaBajable; yaCuentaEnPiso: number; marca: MarcaParaAbrir } | null>(null);
  const [hechas, setHechas] = useState<HechaEnMano[]>([]);
  // Las bajadas escaneadas que se confirmaron aquí: lo que ella misma colgó no cuenta como «el sistema ya la cuenta colgada».
  const [bajadasAqui, setBajadasAqui] = useState<BajadaHechaAqui[]>([]);
  // Las correcciones enviadas sin respuesta, por prenda, con su marca (también en el aparato: sobreviven a cerrar la ventana y
  // a recargar). Mientras una exista, la ventana de esa prenda reenvía con ESA marca: nunca corrige dos veces la misma prenda.
  const claveMarcas = claveDeMarcasEnMano(ubicacionId);
  const marcasRef = useRef<MarcasEnDuda>({});
  const [marcas, setMarcas] = useState<MarcasEnDuda>({});
  const [sugerencias, setSugerencias] = useState<PrendaBajable[]>([]);
  const busquedaPendiente = useRef<number | null>(null);
  // La cámara en ráfaga (la de Conteo): la última prenda leída para su bandeja, y lo que la bandeja tiene que decir.
  const [camara, setCamara] = useState(false);
  const [ultimaLeida, setUltimaLeida] = useState<string | null>(null);
  const [avisoCamara, setAvisoCamara] = useState<ReactNode>(null);

  // Solo sin el detalle de la base (una base anterior al contrato): no se sabe qué se guardó y esa lista no se reenvía.
  const bloqueada = errorConfirmar?.tipo === "token_reusado";
  const congelada = incierto !== null;
  const botonIncierto = incierto?.origen === "borrador" ? BOTON_COMPROBAR : BOTON_CONFIRMAR_DE_NUEVO;
  const listaQuieta = enviando || congelada;
  const porId = useMemo(() => new Map(prendas.map((p) => [p.varianteId, p] as const)), [prendas]);
  const prendasConTope = useMemo(() => prendas.map((p) => conTopeDeLaBase(p, problemas[p.varianteId])), [prendas, problemas]);
  const porIdConTope = useMemo(() => new Map(prendasConTope.map((p) => [p.varianteId, p] as const)), [prendasConTope]);
  // La marca de la prenda cuya ventana está abierta se anota en cada envío: detrás de la ventana no se pinta como «en duda»
  // (aparecería y desaparecería en cada guardado); si la ventana se cierra sin respuesta, ahí sí aparece.
  const marcasVisibles = ventanaEnMano ? soltarMarca(marcas, ventanaEnMano.prenda.varianteId) : marcas;
  // La tarjeta «La tengo en la mano», con los topes y el piso de AHORA (tras una corrección la pantalla se relee).
  const prendaEnMano = enMano ? (porIdConTope.get(enMano.varianteId) ?? enMano) : null;
  const ofertaVisible = prendaEnMano
    ? ofertaEnMano(prendaEnMano, colgadasAquiDe(hechas, prendaEnMano.varianteId, bajadasAqui), marcasVisibles[prendaEnMano.varianteId] ?? null)
    : null;
  // Las dudas de prendas que la tienda conoce (una prenda archivada la rechaza la base antes de mirar la marca: no se ofrece).
  const marcasALaVista = Object.values(marcasVisibles).flatMap((marca) => {
    const prenda = porIdConTope.get(marca.varianteId);
    return prenda ? [{ marca, prenda }] : [];
  });
  const resumen = resumenDeBajada(lineas, prendas);
  // Lo marcado en Existencias llega «por escanear» (en 0): no se baja hasta leerlo al colgarlo (ADR-0237, act. 2026-09-26).
  const hayEscaneadas = resumen.prendas > 0;
  const motivo = !hayEscaneadas
    ? lineas.length > 0
      ? "Escanea cada prenda de la lista al colgarla: solo se baja lo escaneado."
      : "Escanea al menos una prenda."
    : lineas.length > MAX_LINEAS_BAJADA
        ? `Una bajada admite hasta ${MAX_LINEAS_BAJADA} prendas distintas y esta lista tiene ${lineas.length}: quita ${lineas.length - MAX_LINEAS_BAJADA} y bájalas en otra.`
        : responsable.motivo;
  const puedeConfirmar = !enviando && motivo === null;

  // «Colgar en tandas» (`?camara=1`): con el celular en la mano, la cámara en ráfaga se abre al llegar. No se abre si hay una
  // bajada a medias por decidir o un envío por comprobar: primero eso. El parámetro se quita de la URL para que volver o
  // recargar no la vuelva a abrir encima de lo que la persona esté haciendo.
  const abrirCamaraAlLlegar = useEffectEvent(() => {
    if (!abrirCamara) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("camara");
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    const tactil = window.matchMedia?.("(pointer: coarse)").matches ?? false;
    if (!tactil || borradorPendiente.current || enviadoEn.current) return;
    setCamara(true);
  });

  // localStorage solo existe en el navegador: el borrador se lee al montar, una sola vez (no tras cada router.refresh).
  // Uno ENVIADO vuelve congelado: lo único que se ofrece es comprobarlo, nunca empezar otra encima.
  const restaurarBorrador = useEffectEvent(() => {
    if (borradorLeido.current) return;
    borradorLeido.current = true;
    // Las correcciones «en la mano» que quedaron en duda (un corte, una recarga): vuelven a la vista para comprobarlas.
    const enDuda = leerMarcas(leerTexto(claveMarcas), new Date());
    marcasRef.current = enDuda;
    setMarcas(enDuda);
    const b = leerBorrador(leerTexto(clave), new Date(), prendas);
    if (!b) {
      // Solo se carga: el borrador se escribe con el primer cambio (escanear, fijar o quitar). Si se va sin tocarla, la
      // lista no se perdió — se rearma desde Existencias.
      if (iniciales.length > 0) {
        lineasRef.current = iniciales;
        setLineas(iniciales);
      }
      return;
    }
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
    abrirCamaraAlLlegar();
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
  // Con una ventana abierta (la de la prenda en la mano, la cámara) la tecla es de la ventana: no se le roba el foco.
  const hayVentana = ventanaEnMano !== null || camara;
  useEffect(() => {
    if (bloqueada || congelada || hayVentana) return;
    const alTeclear = (e: KeyboardEvent) => {
      if (teclaSueltaVaAlEscaner(e, document.activeElement)) escaner.current?.focus();
    };
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [bloqueada, congelada, hayVentana]);

  // Cerrar o recargar con prendas escaneadas y sin confirmar: el aviso nativo del navegador. Lo «por escanear» no cuenta:
  // si se va sin leer nada, no pierde nada (la lista se rearma desde Existencias).
  const hayLineas = lineas.length > 0;
  useEffect(() => {
    if (!hayEscaneadas) return;
    const alSalir = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", alSalir);
    return () => window.removeEventListener("beforeunload", alSalir);
  }, [hayEscaneadas]);

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
  // Lo marcado en Existencias (si vino con `?lineas=`) se suma al final, «por escanear» (tarea #11): antes se perdía.
  function seguirConBorrador(b: BorradorDeBajada): LineaBajada[] {
    const lineasDelBorrador = unirConIniciales(b.lineas, iniciales);
    borradorPendiente.current = null;
    token.current = b.token;
    creadoEn.current = b.creadoEn;
    lineasRef.current = lineasDelBorrador;
    setLineas(lineasDelBorrador);
    setBorrador(null);
    setDescartarBorrador(false);
    return lineasDelBorrador;
  }

  // La lista sobre la que cae una lectura (null si ahora no se puede leer). Escanear con la pregunta del borrador a la vista es
  // seguir con él: nada escaneado antes se pierde en silencio.
  function baseParaLeer(): LineaBajada[] | null {
    if (bloqueada) return null;
    if (congelada) {
      setAviso(textoEscaneoCongelado(botonIncierto));
      avisarLectura("desconocida");
      return null;
    }
    const pendiente = borradorPendiente.current;
    return pendiente ? seguirConBorrador(pendiente) : lineasRef.current;
  }

  // Una lectura, venga de la pistola, de la cámara o de la lista por nombre: suena SIEMPRE (con la pistola se mira el rack, no
  // la pantalla) y, si el almacén del sistema está en 0, abre la salida «La tengo en la mano» en vez de un aviso sin salida.
  function aplicarLectura(lectura: Lectura, base: LineaBajada[], conservarExito: boolean): Lectura {
    // Lo que se leyó mientras se guardaba llega después del éxito: la tarjeta sigue a la vista.
    if (!conservarExito) setExito(null);
    setSugerencias([]);
    const sonido = sonidoDeLecturaBajada(lectura);
    if (sonido) avisarLectura(sonido);
    if (lectura.tipo === "suma") {
      cambiarLineas(sumarLectura(base, lectura.prenda.varianteId));
      setAviso(null);
      setEnMano(null);
      setUltimaLeida(lectura.prenda.varianteId);
      setDestello((d) => ({ id: lectura.prenda.varianteId, n: (d?.n ?? 0) + 1 }));
      setAnuncio(textoDeLectura(lectura, sede));
      return lectura;
    }
    if (lectura.tipo === "sin_almacen") {
      setAviso(null);
      setEnMano(lectura.prenda);
      setAnuncio(textoDeLectura(lectura, sede));
      return lectura;
    }
    setEnMano(null);
    setAviso(textoDeLectura(lectura, sede));
    return lectura;
  }

  function leerEscaneo(texto: string, { conservarExito = false }: { conservarExito?: boolean } = {}): Lectura | null {
    if (!texto.trim()) return null;
    const base = baseParaLeer();
    return base ? aplicarLectura(leerCodigo(texto, prendasConTope, base), base, conservarExito) : null;
  }

  // La etiqueta no se lee: ella escribió el modelo, la talla o el color y TOCÓ la prenda en la lista. Es una lectura de esa
  // prenda (ADR-0328: «si la etiqueta no se lee, se elige por nombre»), con los mismos topes y el mismo sonido.
  function elegirPorNombre(prenda: PrendaBajable) {
    const base = baseParaLeer();
    if (!base) return;
    aplicarLectura(leerPrenda(porIdConTope.get(prenda.varianteId) ?? prenda, base), base, false);
    if (escaner.current) escaner.current.value = "";
    volverAlEscaner();
  }

  // Mientras ella teclea (no la pistola: la pistola termina el código y su Enter en menos de 250 ms), la lista por nombre. Lee
  // el campo al vencer la pausa, no el texto de la tecla: si la pistola ya lo vació con su Enter, no muestra nada.
  function programarBusqueda() {
    if (busquedaPendiente.current !== null) window.clearTimeout(busquedaPendiente.current);
    const prendasAhora = prendasConTope;
    const sePuede = !congelada && !bloqueada;
    busquedaPendiente.current = window.setTimeout(() => {
      busquedaPendiente.current = null;
      const accion = sePuede ? accionDelEnterBajada(escaner.current?.value ?? "", prendasAhora, lineasRef.current) : null;
      setSugerencias(accion?.tipo === "elegir" ? accion.opciones : []);
    }, MS_PAUSA_BUSQUEDA);
  }
  useEffect(
    () => () => {
      if (busquedaPendiente.current !== null) window.clearTimeout(busquedaPendiente.current);
    },
    []
  );

  // «Ya estaba colgada»: el sistema ya la cuenta en el piso y en el rack falta alguna: la que tiene es esa. No se escribe nada.
  function yaEstabaColgada(prenda: PrendaBajable) {
    setEnMano(null);
    avisarLectura("suma");
    avisar.exito("Ya estaba colgada", { detalle: textoYaEstabaColgada(prenda) });
    volverAlEscaner();
  }

  // La marca se escribe en el aparato en el mismo instante (no en un efecto): la ventana la anota justo antes de llamar a la
  // base, y un corte de luz en esa llamada no puede encontrarla sin guardar.
  function cambiarMarcas(siguientes: MarcasEnDuda) {
    marcasRef.current = siguientes;
    setMarcas(siguientes);
    if (Object.keys(siguientes).length === 0) borrarTexto(claveMarcas);
    else guardarTexto(claveMarcas, serializarMarcas(siguientes));
  }

  // Toda ventana «en la mano» se abre por aquí: si esa prenda tiene una corrección en duda, reusa SU marca (la ventana abre
  // congelada, para comprobarla); si no, estrena una.
  function abrirEnMano(prenda: PrendaBajable, yaCuentaEnPiso: number) {
    setCamara(false);
    const marca = marcaParaAbrir(marcasRef.current, prenda.varianteId, () => crypto.randomUUID());
    setVentanaEnMano({ prenda, yaCuentaEnPiso: marca.enviadoEn ? 0 : yaCuentaEnPiso, marca });
  }

  function alCambiarMarca(varianteId: string, m: MarcaEnDuda | null) {
    cambiarMarcas(m ? anotarMarca(marcasRef.current, m) : soltarMarca(marcasRef.current, varianteId));
  }

  // La base corrigió (o no hizo falta) y la colgó: queda en la lista de lo hecho aquí, la tarjeta se va y la pantalla se relee
  // (el piso y el almacén de esa prenda cambiaron). Si llegó marcada desde Existencias «por escanear», ya no hace falta buscarla.
  function trasColgarEnMano(prenda: PrendaBajable, r: RespuestaEnMano) {
    setHechas((h) => sumarHecha(h, hechaEnMano(r, prenda.varianteId, prenda)));
    setEnMano(null);
    const linea = lineasRef.current.find((l) => l.varianteId === prenda.varianteId);
    if (linea && porEscanear(linea)) cambiarLineas(quitarLinea(lineasRef.current, prenda.varianteId));
    refrescar();
  }

  // La cámara en ráfaga lee con el MISMO camino que la pistola; a su bandeja le dice qué pasó y, si hace falta, ofrece la salida.
  function leerConCamara(codigo: string): LecturaConteo {
    const lectura = leerEscaneo(codigo);
    if (!lectura || lectura.tipo === "vacio" || lectura.tipo === "desconocido") {
      setAvisoCamara(
        <div className="flex w-full items-center gap-3">
          <span className="min-w-0 flex-1 text-sm text-tinta">
            {congelada ? textoEscaneoCongelado(botonIncierto) : `«${codigo}» no está entre las prendas de ${sede}.`}
          </span>
          {!congelada && (
            <button type="button" onClick={buscarPorNombreDesdeCamara} className="btn-cayla btn-secundario btn-chico shrink-0">
              Buscar por nombre
            </button>
          )}
        </div>
      );
      return { encontrada: false, codigo };
    }
    const p = lectura.prenda;
    const enLista = lineasRef.current.find((l) => l.varianteId === p.varianteId)?.cantidad ?? 0;
    const leida = { encontrada: true as const, referencia: p.referencia, detalle: [p.talla, p.color].filter(Boolean).join(" · "), sku: p.sku, cantidad: enLista };
    if (lectura.tipo === "suma") {
      setAvisoCamara(null);
      return leida;
    }
    if (lectura.tipo === "sin_almacen") {
      const o = ofertaEnMano(p, colgadasAquiDe(hechas, p.varianteId, bajadasAqui), marcasRef.current[p.varianteId] ?? null);
      if (o.tipo === "comprobar") {
        setAvisoCamara(
          <div className="flex w-full flex-wrap items-center gap-2">
            <span className="min-w-0 flex-1 basis-40 text-sm text-tinta">La corrección de esta prenda quedó sin respuesta: compruébala antes de corregir otra.</span>
            <button type="button" onClick={() => abrirEnMano(p, 0)} className="btn-cayla btn-primario btn-chico shrink-0">
              Comprobar
            </button>
          </div>
        );
        return { ...leida, atencion: true };
      }
      if (o.tipo === "preguntar") {
        // Se contesta mirando el rack: ninguna de las dos respuestas va por defecto.
        const rack = preguntaDelRack(o);
        setAvisoCamara(
          <div className="flex w-full flex-wrap items-center gap-2">
            <span className="min-w-0 flex-1 basis-40 text-sm text-tinta">{`El almacén está en 0 y el sistema cuenta ${o.enPiso} en el piso. ${rack.pregunta}`}</span>
            <button type="button" onClick={() => abrirEnMano(p, o.enPiso)} className="btn-cayla btn-secundario btn-chico shrink-0">
              {rack.si}
            </button>
            <button
              type="button"
              onClick={() => {
                yaEstabaColgada(p);
                setAvisoCamara(null);
              }}
              className="btn-cayla btn-secundario btn-chico shrink-0"
            >
              {rack.no}
            </button>
          </div>
        );
        return { ...leida, atencion: true };
      }
      setAvisoCamara(
        <div className="flex w-full flex-wrap items-center gap-2">
          <span className="min-w-0 flex-1 basis-40 text-sm text-tinta">El almacén del sistema está en 0. ¿La tienes en la mano?</span>
          <button type="button" onClick={() => abrirEnMano(p, 0)} className="btn-cayla btn-primario btn-chico shrink-0">
            Corregir y colgar
          </button>
        </div>
      );
      return { ...leida, atencion: true };
    }
    setAvisoCamara(<span className="text-sm text-tinta">{textoDeLectura(lectura, sede)}</span>);
    return { ...leida, atencion: true };
  }

  function buscarPorNombreDesdeCamara() {
    setCamara(false);
    setAvisoCamara(null);
    requestAnimationFrame(() => escaner.current?.focus());
  }

  function cerrarCamara() {
    setCamara(false);
    setAvisoCamara(null);
    volverAlEscaner();
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
        // Lo guardado con esta marca lo colgó ella: cuenta como «colgadas aquí» (antes de estrenar otra marca).
        const guardadas = { token: token.current, lineas: fallo.guardadas };
        setBajadasAqui((b) => sumarBajadaHecha(b, guardadas));
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
    // Lo que se acaba de colgar con esta marca (antes de estrenar otra): «¿ya estaba colgada?» no puede preguntar por esto.
    const colgadaAqui = { token: token.current, lineas: enviadas };
    setBajadasAqui((b) => sumarBajadaHecha(b, colgadaAqui));
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
    // Empezar de nuevo es empezar con lo marcado en Existencias, si vino algo (tarea #11), no con la lista vacía.
    const deExistencias = unirConIniciales([], iniciales);
    lineasRef.current = deExistencias;
    setLineas(deExistencias);
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
        <div className="mt-2 flex gap-2">
          <div className="caja-cayla relative min-w-0 flex-1">
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
              aria-controls={sugerencias.length > 0 ? "bajar-por-nombre" : undefined}
              placeholder="Escanea o escribe el nombre"
              onInput={programarBusqueda}
              onKeyDown={(e) => {
                if (e.key === "Escape" && sugerencias.length > 0) {
                  // Este Escape lo usa el campo (cierra la lista): no sube a nadie más.
                  e.preventDefault();
                  e.stopPropagation();
                  setSugerencias([]);
                  return;
                }
                if (e.key !== "Enter") return;
                e.preventDefault();
                // Se lee el campo y no un estado: con una ráfaga de la pistola, el estado puede ir un carácter atrás.
                const texto = e.currentTarget.value;
                // El campo se vacía SIEMPRE (como en Vender): si quedara el texto, la próxima lectura de la pistola se escribiría
                // encima y ninguna de las dos volvería a coincidir con una prenda.
                e.currentTarget.value = "";
                if (busquedaPendiente.current !== null) window.clearTimeout(busquedaPendiente.current);
                // Un nombre (no un código) deja la lista a la vista para que ella TOQUE la prenda: nunca se elige sola.
                const accion = congelada || bloqueada ? null : accionDelEnterBajada(texto, prendasConTope, lineasRef.current);
                if (accion?.tipo === "elegir") {
                  setSugerencias(accion.opciones);
                  return;
                }
                leerEscaneo(texto);
              }}
              className="h-14 w-full bg-transparent pl-11 pr-4 text-base text-tinta outline-none placeholder:text-tinta/45 disabled:cursor-not-allowed disabled:opacity-60"
            />
          </div>
          {/* La cámara del celular (la misma ráfaga de Conteo): de pie frente al rack, sin pistola. */}
          <button
            type="button"
            disabled={bloqueada || congelada}
            onClick={() => {
              setAvisoCamara(null);
              setCamara(true);
            }}
            aria-label="Escanear con la cámara"
            className="btn-cayla btn-secundario h-14 shrink-0 gap-2 px-4"
          >
            <Camera aria-hidden className="h-5 w-5" />
            <span className="hidden sm:inline">Cámara</span>
          </button>
        </div>
        <p id="bajar-ayuda" className="mt-2 text-xs text-taupe">
          Cada lectura suma 1. Si tienes 12 iguales, escanea una y cambia el número. Si la etiqueta no se lee, escribe el modelo, la talla
          o el color y elígela de la lista.
        </p>
        {sugerencias.length > 0 && (
          <div id="bajar-por-nombre" className="anim-revelar mt-3">
            <p className="label-cayla text-[10px] text-taupe">Toca la prenda que tienes en la mano</p>
            <ul className="mt-1.5 divide-y divide-tinta/10 overflow-hidden rounded-xl border border-sand bg-papel">
              {sugerencias.map((p) => (
                <li key={p.varianteId}>
                  <button
                    type="button"
                    onClick={() => elegirPorNombre(p)}
                    className="flex min-h-12 w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-hueso/70 focus-visible:bg-hueso/70"
                  >
                    <MiniaturaPrenda fotoUrl={p.fotoUrl} {...categoriaDe(p)} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-tinta">{nombreDePrenda(p)}</span>
                      {p.sku && <span className="block truncate font-mono text-[11px] text-tinta/60">{p.sku}</span>}
                    </span>
                    <span className="shrink-0 text-right text-xs tabular-nums text-taupe">{textoDeExistencia(p)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {prendaEnMano && ofertaVisible && (
          <div role="alert" className="anim-revelar mt-3 rounded-xl border border-ambar/35 bg-ambar/[0.07] px-3 py-3 text-sm text-ambar-profundo">
            <p className="flex items-start gap-2">
              <Hand aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{textoDeOferta(ofertaVisible, prendaEnMano, sede)}</span>
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {ofertaVisible.tipo === "comprobar" ? (
                <button type="button" className="btn-cayla btn-primario h-11" onClick={() => abrirEnMano(prendaEnMano, 0)}>
                  Comprobar
                </button>
              ) : ofertaVisible.tipo === "preguntar" ? (
                // Se contesta mirando el rack, no la prenda: ninguna de las dos respuestas va como principal.
                <>
                  <button type="button" className="btn-cayla btn-secundario h-11" onClick={() => abrirEnMano(prendaEnMano, ofertaVisible.enPiso)}>
                    {preguntaDelRack(ofertaVisible).si}
                  </button>
                  <button type="button" className="btn-cayla btn-secundario h-11" onClick={() => yaEstabaColgada(prendaEnMano)}>
                    {preguntaDelRack(ofertaVisible).no}
                  </button>
                </>
              ) : (
                <button type="button" className="btn-cayla btn-primario h-11" onClick={() => abrirEnMano(prendaEnMano, 0)}>
                  La tengo en la mano: corregir y colgar
                </button>
              )}
              <button
                type="button"
                className="btn-cayla btn-sutil h-11"
                onClick={() => {
                  setEnMano(null);
                  volverAlEscaner();
                }}
              >
                Ahora no
              </button>
            </div>
          </div>
        )}
        {aviso && !enMano && (
          <p role="alert" className="anim-revelar mt-3 flex items-start gap-2 rounded-lg border border-ambar/35 bg-ambar/[0.07] px-3 py-2.5 text-sm text-ambar-profundo">
            <Info aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{aviso}</span>
          </p>
        )}
        <p className="sr-only" aria-live="polite">
          {anuncio}
        </p>
      </section>

      {(hechas.length > 0 || marcasALaVista.length > 0) && (
        <section className="card-cayla anim-revelar p-4 sm:px-5">
          <p className="label-cayla text-[11px] text-taupe">Corregidas y colgadas aquí</p>
          <ul className="mt-2 space-y-1.5">
            {/* Lo que quedó en duda va primero: es lo único de esta lista que pide hacer algo. */}
            {marcasALaVista.map(({ marca, prenda }) => (
              <li key={`duda-${marca.varianteId}`} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 text-sm">
                <span className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="text-tinta">{nombreDePrenda(prenda)}</span>
                  <Chip tono="ambar">En duda</Chip>
                </span>
                <span className="flex items-center gap-2">
                  <span className="text-xs tabular-nums text-taupe">{textoDeMarcaEnLista(marca)}</span>
                  <button type="button" className="btn-cayla btn-secundario btn-chico" onClick={() => abrirEnMano(prenda, 0)}>
                    Comprobar
                  </button>
                </span>
              </li>
            ))}
            {hechas.map((h) => (
              <li key={h.bajadaId} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-sm">
                <span className="text-tinta">{h.nombre}</span>
                <span className="text-xs tabular-nums text-taupe">{textoDeHecha(h)}</span>
              </li>
            ))}
          </ul>
          {hechas.length > 0 && (
            <p className="mt-2 text-xs text-taupe">Ya quedaron registradas, con tu nombre, en Movimientos: no hace falta confirmarlas abajo.</p>
          )}
          {marcasALaVista.length > 0 && (
            <p className="mt-2 text-xs text-taupe">«En duda»: se cortó la conexión y no sabemos si se guardó. «Comprobar» la reenvía: si ya se había guardado, no se repite.</p>
          )}
        </section>
      )}

      {/* Con un rechazo a la vista, el aviso de abajo ya dice que sigue en duda: no se repite. */}
      {incierto?.origen === "borrador" && !errorConfirmar && (
        <Aviso tono="atencion">{textoDeEnvioIncierto(incierto.enviadoEn)}</Aviso>
      )}

      {errorConfirmar && !bloqueada && (
        <Aviso tono="error">{errorConfirmar.mensaje}</Aviso>
      )}

      {avisoConfirmar && (
        <Aviso tono="atencion">{avisoConfirmar}</Aviso>
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
                          <MiniaturaPrenda fotoUrl={prenda?.fotoUrl ?? null} tamano="lg" {...categoriaDe(prenda)} />
                          <div className="min-w-0">
                            <p className="text-sm text-tinta">{nombre}</p>
                            {prenda?.sku && <p className="font-mono text-xs text-tinta/65">{prenda.sku}</p>}
                            <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-taupe">
                              {problema && enRojo ? (
                                <Chip tono="rojo">{problema.motivo === "sin_alcance" ? `hay ${problema.hay}` : (MOTIVO_CORTO[problema.motivo] ?? "no se puede bajar")}</Chip>
                              ) : (
                                <span className="tabular-nums">En almacén: {tope}</span>
                              )}
                              {porEscanear(l) && <Chip tono="pizarra">Por escanear</Chip>}
                            </p>
                          </div>
                        </div>
                        <div className="relative ml-auto flex items-center gap-1.5">
                          <button
                            type="button"
                            aria-label={`Una menos de ${nombre}`}
                            disabled={listaQuieta || porEscanear(l)}
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
                            className={`caja-cayla h-11 w-14 text-center text-base tabular-nums disabled:opacity-60 ${enRojo ? "text-rojo-profundo" : "text-tinta"}`}
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
          {sinGuardado && hayEscaneadas && (
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
                  ) : hayEscaneadas ? (
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

      {ventanaEnMano && (
        <BajarEnManoModal
          prenda={ventanaEnMano.prenda}
          ubicacionId={ubicacionId}
          sede={sede}
          responsable={responsable}
          marca={ventanaEnMano.marca}
          onMarca={(m) => alCambiarMarca(ventanaEnMano.prenda.varianteId, m)}
          yaCuentaEnPiso={ventanaEnMano.yaCuentaEnPiso}
          alCerrarEnfocar={escaner}
          onListo={(r) => trasColgarEnMano(ventanaEnMano.prenda, r)}
          onClose={() => setVentanaEnMano(null)}
        />
      )}

      {camara && (
        <EscanerConteo
          onCodigo={leerConCamara}
          actual={(() => {
            const p = ultimaLeida ? porId.get(ultimaLeida) : undefined;
            if (!p) return null;
            const cantidad = lineas.find((l) => l.varianteId === p.varianteId)?.cantidad ?? 0;
            return { encontrada: true, referencia: p.referencia, detalle: [p.talla, p.color].filter(Boolean).join(" · "), sku: p.sku, cantidad };
          })()}
          avance={{ contadas: resumen.prendas, total: resumen.prendas }}
          onPaso={(paso) => {
            const l = ultimaLeida ? lineasRef.current.find((x) => x.varianteId === ultimaLeida) : undefined;
            if (ultimaLeida) cambiarCantidad(ultimaLeida, (l?.cantidad ?? 0) + paso);
          }}
          onEscribir={buscarPorNombreDesdeCamara}
          aviso={avisoCamara}
          textos={{ ...TEXTOS_CAMARA, contador: String(resumen.prendas) }}
          onClose={cerrarCamara}
        />
      )}
    </div>
  );
}
