"use client";

import { useEffect, useEffectEvent, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Camera, Info, Loader2, Minus, Plus, ScanBarcode, Undo2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { ErrorEscritura } from "@/lib/error-escritura";
import { esperaOcupada, suscribirEspera } from "@/lib/espera-estado";
import { avisar } from "@/components/ui/Avisos";
import { BarraFija } from "@/components/ui/BarraFija";
import { Chip } from "@/components/ui/Chip";
import { CampoTexto, Interruptor } from "@/components/ui/campos";
import { MiniaturaPrenda } from "@/components/ui/PrendaCelda";
import { EsqueletoTabla, EsqueletoTarjetas } from "@/components/Esqueleto";
import { ComboResponsable } from "@/components/ComboResponsable";
import { EscanerConteo, type LecturaConteo, type TextosEscaner } from "@/components/EscanerConteo";
import { PasosConteo, type PasoOperacion } from "@/components/conteo/PasosConteo";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { useResponsable } from "@/lib/useResponsable";
import { firmar } from "@/lib/responsable-reglas";
import { teclaSueltaVaAlEscaner } from "@/lib/escaner-tecla-suelta";
import { avisarLectura } from "@/lib/sonido-conteo";
import { BUFER_VACIO, alBufer, teclaDeLaPistola, type BuferDePistola } from "@/lib/bajada-reglas";
import {
  BOTON_COMPROBAR_CUADRE,
  NOTA_MAXIMA_CUADRE,
  RPC_CUADRAR,
  RPC_PREVISUALIZAR,
  VERSION_BORRADOR_CUADRE,
  aGuardado,
  camposGuiaConfirmar,
  camposGuiaEscaneo,
  claveBorradorCuadre,
  desfaseConServidor,
  deshacerUltima,
  escaneoDesdeAhora,
  fijarCantidadCuadre,
  interpretarErrorDeCuadre,
  leerBorradorCuadre,
  leerCodigoCuadre,
  leerRespuestaCuadre,
  leerVistaCuadre,
  motivoNoConfirmar,
  motivoNoRevisar,
  noCargadasAlEscanear,
  pedirReescaneo,
  quitarLineaCuadre,
  reponerLinea,
  resolverPendiente,
  respuestaResuelveLaMarcaCuadre,
  serializarBorradorCuadre,
  sonidoDeLecturaCuadre,
  sumarLecturaCuadre,
  textoConteoAbierto,
  textoCuadradoEn,
  textoQuienConfirma,
  textoDeBorradorCuadre,
  textoDeEnvioIncierto,
  textoDeResultado,
  totalEscaneado,
  type BorradorCuadre,
  type ConteoAbierto,
  type ErrorDeCuadre,
  type EstadoCuadre,
  type LineaCuadre,
  type PrendaCuadre,
  type PrendaMovida,
  type RespuestaCuadre,
  type StockLibre,
  type VistaCuadre,
} from "@/lib/cuadre-piso-reglas";
import { CifrasCuadre, AntesDespues, ListasCuadre } from "./RevisarCuadre";
import { ResultadoCuadre } from "./ResultadoCuadre";

/*
 * «Cuadrar el piso» (ADR-0328, decisión técnica 4). Tres pasos y el resultado:
 *   1. Escanear lo GUARDADO, de pie frente al estante, con la pistola o la cámara en ráfaga (cada lectura suma 1 y suena).
 *   2. Revisar lo que va a pasar, con la cuenta de la base (`previsualizar_cuadre_piso`).
 *   3. Confirmar, una vez, con el nombre de quien lo hace (solo un líder: la cuenta, no el responsable).
 * La lista vive en el navegador (por SEDE: escanea la cuenta Almacén y confirma un líder con su cuenta en el mismo equipo) y la
 * base se toca una vez para confirmar, con marca de reintento. Nada es optimista: la pantalla espera a la base y muestra SU
 * respuesta. Si la respuesta no llega, la lista se congela y solo se puede comprobar con la misma marca.
 */

type Paso = "escanear" | "revisar" | "confirmar";
const PASOS: readonly PasoOperacion[] = [
  { clave: "escanear", nombre: "Escanear lo guardado" },
  { clave: "revisar", nombre: "Revisar" },
  { clave: "confirmar", nombre: "Confirmar" },
];

type Datos = { lineas: LineaCuadre[]; pendientes: string[]; escaneoDesde: string | null; confirmoVacio: boolean; nota: string };
const VACIO: Datos = { lineas: [], pendientes: [], escaneoDesde: null, confirmoVacio: false, nota: "" };
const estaVacio = (d: Datos) => d.lineas.length === 0 && d.pendientes.length === 0 && !d.confirmoVacio && !d.nota && d.escaneoDesde === null;

type Vista = { estado: "cargando" } | { estado: "lista"; datos: VistaCuadre } | { estado: "error"; mensaje: string };
type Aviso = { texto: string; tono: "ambar" | "neutro" };

// Las palabras de la cámara en el cuadre. Sin denominador en el contador (`contador`, abajo): el cuadre no tiene meta, y «12/635»
// se leería como «faltan 623».
const TEXTOS_CAMARA: Omit<TextosEscaner, "contador"> = {
  titulo: "Escanear lo guardado con la cámara",
  subtitulo: "Pasa las etiquetas una tras otra: cada una suma 1.",
  etiqueta: "Cuadrar el piso · cada lectura suma 1",
  ayuda: "Solo lo guardado · suena y vibra en cada una",
  enCurso: "Acabas de escanear",
  vacio: "Lo que escanees aparece aquí, con − / + para corregir.",
};

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

const nombreDe = (p: PrendaCuadre | undefined) => (p ? [p.referencia, p.talla, p.color].filter(Boolean).join(" · ") : "Una prenda");
const cuantas = (n: number, una: string, varias: string) => `${n.toLocaleString("es-PE")} ${n === 1 ? una : varias}`;

export function CuadrarPisoForm({
  ubicacionId,
  sede,
  prendas,
  libre,
  estado,
  esLider,
  ahoraServidor,
}: {
  ubicacionId: string;
  sede: string;
  /** El catálogo ENTERO: una prenda guardada que el sistema no tiene en la sede también se escanea (es una «no cargada»). */
  prendas: PrendaCuadre[];
  /** Lo libre de la sede por prenda: solo para el aviso «no cargada» mientras se escanea. La cuenta la hace la base. */
  libre: Record<string, StockLibre>;
  estado: EstadoCuadre;
  /** La cuenta de un líder: confirmar es solo suyo (la base lo vuelve a preguntar). */
  esLider: boolean;
  /** La hora del servidor al dibujar: la del escaneo se pide en SU reloj, no en el del aparato. */
  ahoraServidor: string;
}) {
  const router = useRouter();
  const responsable = useResponsable({ ubicacionId, etiqueta: sede });
  const clave = claveBorradorCuadre(ubicacionId);
  const porId = useMemo(() => new Map(prendas.map((p) => [p.varianteId, p] as const)), [prendas]);
  const fotos = useMemo(() => new Map(prendas.map((p) => [p.varianteId, p.fotoUrl] as const)), [prendas]);
  const escaner = useRef<HTMLInputElement>(null);
  // Un token por intento (ADR-0190): el mismo cuadre enviado dos veces (doble clic, reintento tras un corte) no cuadra dos veces.
  // Se conserva si falla y se renueva solo cuando la base respondió que guardó (o que ya estaba guardado).
  const token = useRef<string>(crypto.randomUUID());
  const creadoEn = useRef<string | null>(null);
  // La hora del envío cuya respuesta aún no llegó; va al borrador ANTES de llamar a la base.
  const enviadoEn = useRef<string | null>(null);
  const desfase = useRef(0);
  const datosRef = useRef<Datos>(VACIO);
  const borradorLeido = useRef(false);
  const borradorPendiente = useRef<BorradorCuadre | null>(null);
  const enviandoRef = useRef(false);
  const bufer = useRef<BuferDePistola>(BUFER_VACIO);

  const [datos, setDatos] = useState<Datos>(VACIO);
  const [paso, setPaso] = useState<Paso>("escanear");
  const [borrador, setBorrador] = useState<BorradorCuadre | null>(null);
  const [descartar, setDescartar] = useState(false);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [anuncio, setAnuncio] = useState("");
  const [destello, setDestello] = useState<{ id: string; n: number } | null>(null);
  const [vista, setVista] = useState<Vista | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [incierto, setIncierto] = useState<string | null>(null);
  const [error, setError] = useState<ErrorDeCuadre | null>(null);
  // `respuesta` nula: la base confirmó (sin error) pero su respuesta no calzó con el contrato; se dice que quedó cuadrado y el
  // detalle se ve en Existencias y Movimientos (nunca se inventa una cifra).
  const [resultado, setResultado] = useState<{ respuesta: RespuestaCuadre | null; otraPersona: boolean } | null>(null);
  const [movidas, setMovidas] = useState<PrendaMovida[]>([]);
  const [notaExigida, setNotaExigida] = useState(false);
  // El conteo abierto de la sede (lo último que dijo la base: al cargar, al revisar o al rechazar el cuadre). Mientras exista,
  // confirmar está apagado: al cerrarse, el conteo corregiría otra vez lo que el cuadre corrige.
  const [conteo, setConteo] = useState<ConteoAbierto | null>(estado.conteoAbierto);
  const [camara, setCamara] = useState(false);
  const [sinGuardado, setSinGuardado] = useState(false);
  const [edicion, setEdicion] = useState<Record<string, string>>({});
  const esperaLibre = useSyncExternalStore(suscribirEspera, () => !esperaOcupada(), () => true);

  const congelada = incierto !== null;
  const total = totalEscaneado(datos.lineas);
  const notaRequerida = estado.cuadres > 0 || notaExigida;
  const motivoRevisar = motivoNoRevisar({ lineas: datos.lineas.length, confirmoVacio: datos.confirmoVacio, pendientes: datos.pendientes.length });
  const motivoConfirmar = motivoNoConfirmar({ esLider, sede, responsableMotivo: responsable.motivo, notaRequerida, nota: datos.nota, conteoAbierto: conteo });
  const guiaEscaneo = useGuiaCampos(camposGuiaEscaneo({ lineas: datos.lineas.length, confirmoVacio: datos.confirmoVacio, pendientes: datos.pendientes.length }), {
    enModal: false,
  });
  const guiaConfirmar = useGuiaCampos(camposGuiaConfirmar({ responsableListo: responsable.listo, notaRequerida, nota: datos.nota }), { enModal: false });

  // ---- El borrador (por sede) ----

  function persistir(d: Datos) {
    if (estaVacio(d) && !enviadoEn.current) {
      creadoEn.current = null;
      borrarTexto(clave);
      return;
    }
    creadoEn.current ??= new Date().toISOString();
    const b: BorradorCuadre = {
      v: VERSION_BORRADOR_CUADRE,
      token: token.current,
      ...d,
      creadoEn: creadoEn.current,
      ...(enviadoEn.current ? { enviadoEn: enviadoEn.current } : {}),
    };
    if (!guardarTexto(clave, serializarBorradorCuadre(b))) setSinGuardado(true);
  }

  function cambiar(f: (d: Datos) => Datos) {
    const nuevo = f(datosRef.current);
    datosRef.current = nuevo;
    setDatos(nuevo);
    persistir(nuevo);
  }

  function seguirCon(b: BorradorCuadre) {
    borradorPendiente.current = null;
    token.current = b.token;
    creadoEn.current = b.creadoEn;
    const d: Datos = { lineas: b.lineas, pendientes: b.pendientes, escaneoDesde: b.escaneoDesde, confirmoVacio: b.confirmoVacio, nota: b.nota };
    datosRef.current = d;
    setDatos(d);
    setBorrador(null);
    setDescartar(false);
  }

  // localStorage solo existe en el navegador: el borrador se lee al montar, una sola vez. Uno ENVIADO vuelve congelado: lo único que
  // se ofrece es comprobarlo, nunca empezar otro encima.
  const alMontar = useEffectEvent(() => {
    desfase.current = desfaseConServidor(ahoraServidor, Date.now());
    if (borradorLeido.current) return;
    borradorLeido.current = true;
    const b = leerBorradorCuadre(leerTexto(clave), new Date());
    if (!b) return;
    if (!b.enviadoEn) {
      borradorPendiente.current = b;
      return setBorrador(b);
    }
    seguirCon(b);
    enviadoEn.current = b.enviadoEn;
    setIncierto(b.enviadoEn);
    setPaso("confirmar");
  });
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- misma decisión que Bajar al piso: no hay otra forma de leerlo sin romper la hidratación
    alMontar();
    // En computadora el campo toma el foco solo si el puntero es fino: en el celular abriría el teclado encima de la lista.
    if (window.matchMedia?.("(pointer: fine)").matches) escaner.current?.focus({ preventScroll: true });
  }, []);

  // Cerrar o recargar con algo escaneado y sin confirmar: el aviso nativo del navegador (lo escaneado igual queda en el aparato).
  useEffect(() => {
    if (datos.lineas.length === 0 || resultado) return;
    const alSalir = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", alSalir);
    return () => window.removeEventListener("beforeunload", alSalir);
  }, [datos.lineas.length, resultado]);

  // ---- La pistola ----

  // Fase de captura: mientras se guarda o el loader deja la app `inert`, lo que dispara la pistola va al búfer (se perdería).
  const alTeclearAntes = useEffectEvent((e: KeyboardEvent) => {
    if (paso !== "escanear" || resultado) return;
    const activo = document.activeElement;
    const tipo = teclaDeLaPistola(e, activo, activo !== null && activo === escaner.current);
    if (!tipo || !(enviandoRef.current || esperaOcupada())) return;
    e.preventDefault();
    e.stopPropagation();
    bufer.current = alBufer(bufer.current, tipo, e.key);
  });
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => alTeclearAntes(e);
    window.addEventListener("keydown", alTeclear, true);
    return () => window.removeEventListener("keydown", alTeclear, true);
  }, []);

  // La pistola escribe donde esté el foco: si quedó en un botón, el código se perdería y el Enter activaría ese botón.
  useEffect(() => {
    if (paso !== "escanear" || congelada || resultado) return;
    const alTeclear = (e: KeyboardEvent) => {
      if (teclaSueltaVaAlEscaner(e, document.activeElement)) escaner.current?.focus();
    };
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [paso, congelada, resultado]);

  function volverAlEscaner() {
    escaner.current?.focus({ preventScroll: true });
  }

  /** Una lectura (pistola, cámara o lo escrito). Devuelve lo que la cámara muestra en su bandeja. */
  function leer(texto: string): LecturaConteo {
    if (!texto.trim()) return { encontrada: false, codigo: texto };
    if (congelada) {
      setAviso({ texto: `Hay un cuadre enviado sin respuesta: pulsa «${BOTON_COMPROBAR_CUADRE}» antes de seguir escaneando.`, tono: "ambar" });
      return { encontrada: false, codigo: texto.trim() };
    }
    // Escanear con la pregunta del borrador a la vista es seguir con él: nada escaneado antes se pierde en silencio.
    if (borradorPendiente.current) seguirCon(borradorPendiente.current);
    const lectura = leerCodigoCuadre(texto, prendas, datosRef.current.lineas);
    avisarLectura(sonidoDeLecturaCuadre(lectura));
    if (lectura.tipo === "desconocido") {
      setAviso({ texto: `«${lectura.codigo}» no es de ninguna prenda del catálogo. Si esa prenda no tiene etiqueta, déjala aparte: hay que cargarla antes de cuadrar.`, tono: "ambar" });
      return { encontrada: false, codigo: lectura.codigo };
    }
    if (lectura.tipo === "archivada") {
      setAviso({ texto: `${nombreDe(lectura.prenda)} es una talla archivada: el cuadre no la mueve. Déjala donde está y sigue.`, tono: "ambar" });
      return { encontrada: false, codigo: texto.trim() };
    }
    const id = lectura.prenda.varianteId;
    // Lo escaneado cambia lo que se revisó: hay que volver a revisar.
    if (paso !== "escanear") setPaso("escanear");
    setVista(null);
    cambiar((d) => ({
      ...d,
      lineas: sumarLecturaCuadre(d.lineas, id),
      pendientes: resolverPendiente(d.pendientes, id),
      escaneoDesde: d.escaneoDesde ?? escaneoDesdeAhora(Date.now(), desfase.current),
      confirmoVacio: false,
    }));
    const cantidad = datosRef.current.lineas.find((l) => l.varianteId === id)?.cantidad ?? 1;
    const deMas = noCargadasAlEscanear(libre[id], cantidad);
    setDestello((x) => ({ id, n: (x?.n ?? 0) + 1 }));
    setAnuncio(`${nombreDe(lectura.prenda)}: ${cantidad}`);
    setAviso(
      deMas > 0
        ? { texto: `${nombreDe(lectura.prenda)}: llevas ${cantidad} y el sistema tiene ${cantidad - deMas} en ${sede}. ${deMas === 1 ? "La de más no se carga" : `Las ${deMas} de más no se cargan`}: se anotan para cargarlas aparte.`, tono: "ambar" }
        : null,
    );
    return {
      encontrada: true,
      referencia: lectura.prenda.referencia,
      detalle: [lectura.prenda.talla, lectura.prenda.color].filter(Boolean).join(" · "),
      sku: lectura.prenda.sku,
      cantidad,
      atencion: deMas > 0,
    };
  }

  // Cuando la pantalla vuelve a poder leer (sin guardar y sin loader), se lee lo que quedó en el búfer con la lógica de siempre;
  // el código a medias vuelve al campo para que termine.
  const vaciarBufer = useEffectEvent(() => {
    const { codigos, parcial } = bufer.current;
    bufer.current = BUFER_VACIO;
    for (const c of codigos) leer(c);
    if (parcial && escaner.current) {
      escaner.current.value = parcial;
      escaner.current.focus({ preventScroll: true });
    }
  });
  useEffect(() => {
    if (enviando || !esperaLibre) return;
    vaciarBufer();
  }, [enviando, esperaLibre]);

  function deshacer() {
    const { varianteId } = deshacerUltima(datosRef.current.lineas);
    if (!varianteId) return;
    cambiar((d) => ({ ...d, lineas: deshacerUltima(d.lineas).lineas }));
    setVista(null);
    setAnuncio(`Se quitó 1 de ${nombreDe(porId.get(varianteId))}`);
    volverAlEscaner();
  }

  function cambiarCantidad(varianteId: string, cantidad: number) {
    cambiar((d) => ({ ...d, lineas: fijarCantidadCuadre(d.lineas, varianteId, cantidad) }));
    setVista(null);
  }

  function quitar(varianteId: string) {
    const indice = datosRef.current.lineas.findIndex((l) => l.varianteId === varianteId);
    const linea = datosRef.current.lineas[indice];
    if (!linea) return;
    cambiar((d) => ({ ...d, lineas: quitarLineaCuadre(d.lineas, varianteId) }));
    setVista(null);
    avisar.aviso(`Quitaste ${nombreDe(porId.get(varianteId))} (${linea.cantidad}) de lo escaneado.`, {
      accion: { texto: "Deshacer", onClick: () => cambiar((d) => ({ ...d, lineas: reponerLinea(d.lineas, linea, indice) })) },
      duracion: 8000,
    });
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
    // Más de 5 caracteres no es una cantidad (la base admite hasta 99999): es la pistola, que escribió en este campo.
    if (limpio.length > 5 || !/^\d+$/.test(limpio)) return void leer(limpio);
    cambiarCantidad(varianteId, Number(limpio));
  }

  function sinNadaGuardado(varianteId: string) {
    cambiar((d) => ({ ...d, pendientes: resolverPendiente(d.pendientes, varianteId), lineas: quitarLineaCuadre(d.lineas, varianteId) }));
  }

  function empezarDeNuevo() {
    if (!descartar) return setDescartar(true);
    borradorPendiente.current = null;
    token.current = crypto.randomUUID();
    creadoEn.current = null;
    enviadoEn.current = null;
    borrarTexto(clave);
    datosRef.current = VACIO;
    setDatos(VACIO);
    setBorrador(null);
    setDescartar(false);
    setMovidas([]);
    volverAlEscaner();
  }

  // ---- Revisar ----

  async function revisar() {
    if (motivoRevisar || congelada) return;
    setPaso("revisar");
    setVista({ estado: "cargando" });
    setError(null);
    // El «no hay nada guardado» también fija la hora: desde ahí, lo que se mueva en el almacén invalida esa respuesta.
    if (!datosRef.current.escaneoDesde) cambiar((d) => ({ ...d, escaneoDesde: escaneoDesdeAhora(Date.now(), desfase.current) }));
    const { data, error: e } = await createClient().rpc(RPC_PREVISUALIZAR as never, { p_ubicacion_id: ubicacionId, p_guardado: aGuardado(datosRef.current.lineas) } as never);
    if (e) return setVista({ estado: "error", mensaje: e.message || "No se pudo revisar el cuadre." });
    const v = leerVistaCuadre(data);
    if (v) setConteo(v.conteoAbierto);
    setVista(v ? { estado: "lista", datos: v } : { estado: "error", mensaje: "La respuesta de la base no tiene la forma esperada. Vuelve a intentarlo." });
  }

  // ---- Confirmar ----

  function terminarEnvio() {
    enviandoRef.current = false;
    setEnviando(false);
  }

  function cerrarConExito(r: RespuestaCuadre | null, otraPersona: boolean) {
    token.current = crypto.randomUUID();
    creadoEn.current = null;
    enviadoEn.current = null;
    borrarTexto(clave);
    datosRef.current = VACIO;
    setDatos(VACIO);
    setIncierto(null);
    setVista(null);
    setMovidas([]);
    setResultado({ respuesta: r, otraPersona });
    router.refresh();
  }

  async function confirmar() {
    const d = datosRef.current;
    if (enviandoRef.current || (!congelada && (motivoConfirmar || motivoRevisar)) || !d.escaneoDesde) return;
    enviandoRef.current = true;
    setEnviando(true);
    setError(null);
    // La marca va al borrador ANTES de la llamada: si se corta la luz ahora, al volver se comprueba en vez de cuadrar otra vez.
    const eraReenvio = enviadoEn.current !== null;
    enviadoEn.current ??= new Date().toISOString();
    persistir(d);
    let data: unknown = null;
    let e: ErrorEscritura = null;
    try {
      const r = await firmar(
        createClient().rpc(
          RPC_CUADRAR as never,
          { p_ubicacion_id: ubicacionId, p_guardado: aGuardado(d.lineas), p_escaneo_desde: d.escaneoDesde, p_nota: d.nota.trim() || null, p_token: token.current } as never,
        ),
        responsable.firma(),
      );
      data = r.data;
      e = r.error;
    } catch (x) {
      e = { message: x instanceof Error ? x.message : String(x) };
    }
    responsable.despues(e);

    if (e) {
      const fallo = interpretarErrorDeCuadre(e);
      if (fallo.tipo === "red" || (eraReenvio && !respuestaResuelveLaMarcaCuadre(e))) {
        // Sin respuesta (o con una que no miró la marca) no se sabe si se guardó: se congela y solo se reenvía igual.
        setIncierto((i) => i ?? enviadoEn.current);
        setError(fallo);
        avisar.error(fallo.mensaje);
        return terminarEnvio();
      }
      // La base miró la marca: la transacción se deshizo entera (o dice qué hay guardado). La marca de envío sobra.
      enviadoEn.current = null;
      setIncierto(null);
      if (fallo.tipo === "almacen_movido") {
        const ids = fallo.prendas.map((p) => p.varianteId);
        cambiar((x) => ({ ...x, ...pedirReescaneo(x.lineas, x.pendientes, ids), escaneoDesde: fallo.revisadoHasta ?? escaneoDesdeAhora(Date.now(), desfase.current) }));
        setMovidas((m) => [...m.filter((p) => !ids.includes(p.varianteId)), ...fallo.prendas]);
        setAviso(null);
        setVista(null);
        setPaso("escanear");
        setError(fallo);
        avisar.aviso("Mientras escaneabas se movieron prendas en el almacén: vuelve a escanear solo esas.", { detalle: sede });
        return terminarEnvio();
      }
      if (fallo.tipo === "ya_hecho" && fallo.respuesta) {
        cerrarConExito(fallo.respuesta, true);
        avisar.aviso(fallo.mensaje, { detalle: sede });
        return terminarEnvio();
      }
      if (fallo.tipo === "token_reusado") {
        // Sin saber qué se guardó con esa marca, esta lista no se reenvía: se descarta y la pantalla muestra el último cuadre.
        empezarDeNuevoSinPreguntar();
        setError(fallo);
        router.refresh();
        return terminarEnvio();
      }
      if (fallo.tipo === "conteo_abierto" && fallo.conteo) setConteo(fallo.conteo);
      if (fallo.tipo === "nota_requerida") {
        setNotaExigida(true);
        guiaConfirmar.ir("nota");
      }
      persistir(datosRef.current);
      setError(fallo);
      avisar.error(fallo.mensaje);
      return terminarEnvio();
    }

    const r = leerRespuestaCuadre(data);
    if (!r) {
      // Sin error la transacción se confirmó; si la respuesta no calza con el contrato, se dice que quedó cuadrado sin cifras.
      cerrarConExito(null, false);
      avisar.exito(`Piso de ${sede} cuadrado`);
      return terminarEnvio();
    }
    cerrarConExito(r, false);
    const t = textoDeResultado(r, sede);
    if (r.yaRegistrado) avisar.aviso(t.titulo, { detalle: t.detalle });
    else avisar.exito(t.titulo, { detalle: t.detalle });
    terminarEnvio();
  }

  function empezarDeNuevoSinPreguntar() {
    token.current = crypto.randomUUID();
    creadoEn.current = null;
    enviadoEn.current = null;
    borrarTexto(clave);
    datosRef.current = VACIO;
    setDatos(VACIO);
    setIncierto(null);
    setVista(null);
    setPaso("escanear");
  }

  // ---- Dibujo ----

  if (resultado) {
    return resultado.respuesta ? (
      <ResultadoCuadre respuesta={resultado.respuesta} sede={sede} otraPersona={resultado.otraPersona} />
    ) : (
      <p role="status" className="nota-cayla">
        El piso de {sede} quedó cuadrado. Las cifras se ven en Existencias y el detalle, en Movimientos.
      </p>
    );
  }

  const arriba = datos.lineas[0];
  const prendaArriba = arriba ? porId.get(arriba.varianteId) : undefined;
  const nombreMovida = (id: string) => movidas.find((m) => m.varianteId === id)?.prenda ?? nombreDe(porId.get(id));

  return (
    <div className="space-y-4">
      <PasosConteo actual={paso} pasos={PASOS} etiqueta="Pasos del cuadre del piso" />

      {estado.cuadradoEn && (
        <p className="nota-cayla">
          El piso de {sede} ya se cuadró {textoCuadradoEn(estado.cuadradoEn, estado.por)}: {estado.prendasAlPiso.toLocaleString("es-PE")} pasaron al piso y{" "}
          {estado.prendasAlAlmacen.toLocaleString("es-PE")} subieron al almacén. Si lo vuelves a cuadrar, tendrás que decir por qué.
        </p>
      )}

      {conteo && (
        <div
          role="status"
          className="anim-revelar flex flex-wrap items-start justify-between gap-x-3 gap-y-2 rounded-xl border border-ambar/35 bg-ambar/[0.07] px-4 py-3 text-sm text-ambar-profundo"
        >
          <p className="min-w-0 flex-1 basis-64">{textoConteoAbierto(conteo, sede)}</p>
          <Link href={`/inventario/conteo/${conteo.conteoId}`} className="btn-cayla btn-enlace shrink-0 text-[13px]">
            Ir al conteo
          </Link>
        </div>
      )}

      {borrador && (
        <div className="card-cayla anim-revelar flex flex-wrap items-center justify-between gap-3 p-4 sm:px-5">
          <p className="min-w-0 flex-1 basis-64 text-sm text-tinta">{textoDeBorradorCuadre(borrador)}</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-cayla btn-primario h-11"
              onClick={() => {
                seguirCon(borrador);
                volverAlEscaner();
              }}
            >
              Continuar
            </button>
            <button type="button" className={`btn-cayla h-11 ${descartar ? "btn-peligro" : "btn-secundario"}`} onClick={empezarDeNuevo}>
              {descartar ? "Sí, borrar lo escaneado" : "Empezar de nuevo"}
            </button>
          </div>
        </div>
      )}

      {incierto && (
        <div role="status" className="anim-revelar rounded-xl border border-l-2 border-ambar/35 border-l-ambar bg-ambar/[0.07] px-4 py-3 text-sm text-ambar-profundo">
          {textoDeEnvioIncierto(incierto)}
        </div>
      )}

      {error && error.tipo !== "red" && (
        <div role="alert" className="anim-revelar rounded-xl border border-l-2 border-rojo/40 border-l-rojo bg-rojo/[0.06] px-4 py-3 text-sm text-tinta">
          {error.mensaje}
        </div>
      )}

      {paso === "escanear" && (
        <>
          {/* Antes de la primera lectura, lo que hay que cuidar; ya escaneando, una línea (en el celular, el campo tiene que verse sin
              bajar la pantalla). */}
          {datos.lineas.length === 0 && datos.pendientes.length === 0 ? (
            <ul className="nota-cayla list-disc space-y-1 pl-8 text-sm">
              <li>Hazlo antes de abrir: si mientras escaneas se vende, se repone o se recibe algo del almacén, tendrás que volver a escanear esas prendas.</li>
              <li>Escanea solo lo GUARDADO. No escanees las dañadas (cuarentena) ni el estante de Apartados: el cuadre no las mueve.</li>
              <li>Una prenda guardada sin etiqueta no se puede escanear y quedaría como colgada: cárgala antes de cuadrar.</li>
              <li>Lo escaneado se guarda en este equipo hasta 12 horas: termina hoy y aquí.{!esLider && ` ${textoQuienConfirma(sede)}`}</li>
            </ul>
          ) : (
            <p className="text-xs text-taupe">Solo lo guardado · sin dañadas ni Apartados · termina hoy y en este equipo.</p>
          )}

          {datos.pendientes.length > 0 && (
            <CampoGuiado id="reescanear" guia={guiaEscaneo} titulo="Volver a escanear" ayuda="Cambiaron en el almacén mientras escaneabas.">
              <ul className="card-cayla divide-y divide-tinta/10 border-l-2 border-l-ambar">
                {datos.pendientes.map((id) => (
                  <li key={id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-5">
                    <span className="min-w-0 text-sm text-tinta">{nombreMovida(id)}</span>
                    <button type="button" className="btn-cayla btn-sutil btn-chico" onClick={() => sinNadaGuardado(id)}>
                      No hay ninguna guardada
                    </button>
                  </li>
                ))}
              </ul>
            </CampoGuiado>
          )}

          <CampoGuiado id="guardado" guia={guiaEscaneo} titulo="Lo guardado" ayuda="Cada lectura suma 1. Si tienes 12 iguales, escanea una y cambia el número.">
            <section className="card-cayla p-4 sm:p-5">
              <label htmlFor="cuadre-escaner" className="sr-only">
                Escanear prenda guardada
              </label>
              <div className="caja-cayla relative">
                <ScanBarcode aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-tinta/45" />
                <input
                  ref={escaner}
                  id="cuadre-escaner"
                  type="text"
                  autoComplete="off"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  enterKeyHint="enter"
                  disabled={congelada}
                  placeholder="Escanea o escribe el código" // sugerir-fijo: dice cómo se escanea; no depende de nada elegido antes en esta pantalla (corto: cabe a 375 px)
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    e.preventDefault();
                    // Se lee el campo y no un estado: con una ráfaga de la pistola, el estado puede ir un carácter atrás.
                    const texto = e.currentTarget.value;
                    e.currentTarget.value = "";
                    leer(texto);
                  }}
                  className="h-14 w-full bg-transparent pl-11 pr-4 text-base text-tinta outline-none placeholder:text-tinta/45 disabled:cursor-not-allowed disabled:opacity-60"
                />
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => setCamara(true)} disabled={congelada} className="btn-cayla btn-secundario h-11">
                  <Camera aria-hidden className="h-4 w-4" />
                  Escanear con la cámara
                </button>
                {datos.lineas.length > 0 && (
                  <button type="button" onClick={deshacer} disabled={congelada} className="btn-cayla btn-sutil h-11">
                    <Undo2 aria-hidden className="h-4 w-4" />
                    Deshacer la última
                  </button>
                )}
              </div>
              {aviso && (
                <p
                  role="alert"
                  className={`anim-revelar mt-3 flex items-start gap-2 rounded-lg px-3 py-2.5 text-sm ${
                    aviso.tono === "ambar" ? "border border-ambar/35 bg-ambar/[0.07] text-ambar-profundo" : "bg-hueso text-tinta"
                  }`}
                >
                  <Info aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{aviso.texto}</span>
                </p>
              )}
              <p className="sr-only" aria-live="polite">
                {anuncio}
              </p>
              {datos.lineas.length === 0 && (
                <div className="mt-4 border-t border-tinta/10 pt-4">
                  <Interruptor
                    activo={datos.confirmoVacio}
                    onActivo={(v) => cambiar((d) => ({ ...d, confirmoVacio: v }))}
                    etiqueta={`En el almacén de ${sede} no hay nada guardado: todo está colgado`}
                    pie="Así, todo lo que el sistema tiene en el almacén pasa al piso."
                  />
                </div>
              )}
            </section>
          </CampoGuiado>

          {datos.lineas.length > 0 && (
            <section className="card-cayla overflow-hidden" aria-label="Lo escaneado">
              <ul className="divide-y divide-tinta/10">
                {datos.lineas.map((l) => {
                  const p = porId.get(l.varianteId);
                  const deMas = noCargadasAlEscanear(libre[l.varianteId], l.cantidad);
                  const nombre = nombreDe(p);
                  return (
                    <li key={l.varianteId} className="relative flex flex-wrap items-center gap-x-4 gap-y-2.5 px-4 py-3 sm:px-5">
                      {destello?.id === l.varianteId && <span key={destello.n} aria-hidden className="anim-destello-lectura pointer-events-none absolute inset-0" />}
                      <div className="relative flex min-w-0 flex-1 basis-56 items-start gap-3">
                        <MiniaturaPrenda fotoUrl={p?.fotoUrl ?? null} tamano="lg" />
                        <div className="min-w-0">
                          <p className="text-sm text-tinta">{nombre}</p>
                          {p?.sku && <p className="font-mono text-xs text-tinta/65">{p.sku}</p>}
                          <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-taupe">
                            <span className="tabular-nums">
                              En el sistema: {cuantas(libre[l.varianteId]?.almacen ?? 0, "guardada", "guardadas")} · {cuantas(libre[l.varianteId]?.piso ?? 0, "colgada", "colgadas")}
                            </span>
                            {deMas > 0 && <Chip tono="ambar">{deMas === 1 ? "1 no cargada" : `${deMas} no cargadas`}</Chip>}
                          </p>
                        </div>
                      </div>
                      <div className="relative ml-auto flex items-center gap-1.5">
                        <button
                          type="button"
                          aria-label={`Una menos de ${nombre}`}
                          disabled={congelada}
                          onClick={() => cambiarCantidad(l.varianteId, l.cantidad - 1)}
                          className="btn-cayla btn-secundario h-11 w-11 p-0"
                        >
                          <Minus aria-hidden className="h-4 w-4" />
                        </button>
                        <input
                          type="text"
                          inputMode="numeric"
                          aria-label={`Cantidad de ${nombre}`}
                          disabled={congelada}
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
                          className="caja-cayla h-11 w-14 text-center text-base tabular-nums text-tinta disabled:opacity-60"
                        />
                        <button
                          type="button"
                          aria-label={`Una más de ${nombre}`}
                          disabled={congelada}
                          onClick={() => cambiarCantidad(l.varianteId, l.cantidad + 1)}
                          className="btn-cayla btn-secundario h-11 w-11 p-0"
                        >
                          <Plus aria-hidden className="h-4 w-4" />
                        </button>
                        <button type="button" disabled={congelada} onClick={() => quitar(l.varianteId)} className="btn-cayla btn-sutil ml-1 h-11">
                          Quitar
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {sinGuardado && datos.lineas.length > 0 && (
            <p role="status" className="rounded-xl border border-ambar/35 bg-ambar/[0.07] px-4 py-3 text-sm text-ambar-profundo">
              Este navegador no puede guardar lo escaneado: termina el cuadre antes de salir de la pantalla.
            </p>
          )}

          <BarraFija
            aviso={<PieGuia guia={guiaEscaneo} listo="Listo para revisar." />}
            resumen={
              <span>
                <span className="font-display text-lg tabular-nums text-tinta">{total.toLocaleString("es-PE")}</span>{" "}
                {total === 1 ? "prenda escaneada" : "prendas escaneadas"} · {datos.lineas.length === 1 ? "1 talla" : `${datos.lineas.length} tallas`}
              </span>
            }
            acciones={
              <div className="flex w-full items-center gap-2 sm:w-auto">
                <button type="button" onClick={() => setCamara(true)} disabled={congelada} aria-label="Escanear con la cámara" className="btn-cayla btn-secundario h-11 w-11 shrink-0 p-0 sm:hidden">
                  <Camera aria-hidden className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={() => void revisar()}
                  disabled={motivoRevisar !== null || congelada}
                  title={motivoRevisar ?? undefined}
                  className={`btn-cayla btn-primario h-11 flex-1 sm:flex-none ${motivoRevisar ? "" : guiaEscaneo.claseConfirmar}`}
                >
                  Revisar el cuadre
                </button>
              </div>
            }
          />
        </>
      )}

      {paso !== "escanear" && (
        <>
          {vista?.estado === "cargando" && (
            <div className="space-y-4" aria-busy="true" aria-label="Revisando el cuadre">
              <EsqueletoTarjetas tarjetas={3} />
              <EsqueletoTabla filas={5} />
            </div>
          )}
          {vista?.estado === "error" && (
            <div role="alert" className="card-cayla space-y-3 border-l-2 border-l-rojo p-5">
              <p className="text-sm text-tinta">{vista.mensaje}</p>
              <button type="button" className="btn-cayla btn-secundario h-11" onClick={() => void revisar()}>
                Volver a intentar
              </button>
            </div>
          )}
          {vista?.estado === "lista" && (
            <>
              <CifrasCuadre resumen={vista.datos.resumen} sede={sede} />
              <AntesDespues resumen={vista.datos.resumen} sede={sede} />
              {(vista.datos.resumen.apartadas > 0 || vista.datos.resumen.danadas > 0) && (
                <p className="nota-cayla">
                  {vista.datos.resumen.apartadas > 0 &&
                    `${vista.datos.resumen.apartadas === 1 ? "1 prenda apartada" : `${vista.datos.resumen.apartadas} prendas apartadas`} para clientes no se mueve. `}
                  {vista.datos.resumen.danadas > 0 &&
                    `${vista.datos.resumen.danadas === 1 ? "1 prenda dañada" : `${vista.datos.resumen.danadas} prendas dañadas`} en cuarentena no se toca.`}
                </p>
              )}
              {paso === "revisar" && <ListasCuadre lineas={vista.datos.lineas} fotos={fotos} sede={sede} />}
            </>
          )}
          {!incierto && !vista && paso === "confirmar" && (
            <p className="nota-cayla">Vuelve a revisar el cuadre antes de confirmarlo.</p>
          )}

          {paso === "confirmar" && (
            <section className="card-cayla space-y-5 p-4 sm:p-5" aria-label="Confirmar el cuadre">
              <CampoGuiado id="responsable" guia={guiaConfirmar} titulo="Quién cuadra">
                <ComboResponsable control={responsable} deshabilitado={enviando} />
              </CampoGuiado>
              <CampoGuiado id="nota" guia={guiaConfirmar} titulo={notaRequerida ? "Por qué se vuelve a cuadrar" : "Nota (opcional)"}>
                <CampoTexto
                  etiqueta={notaRequerida ? "Por qué se vuelve a cuadrar" : "Nota (opcional)"}
                  value={datos.nota}
                  maxLength={NOTA_MAXIMA_CUADRE}
                  disabled={enviando || congelada}
                  caja
                  onChange={(e) => cambiar((d) => ({ ...d, nota: e.target.value }))}
                  placeholder={notaRequerida ? "Ej.: faltó escanear el estante del fondo" : "Ej.: cuadre de arranque, antes de abrir"} // sugerir-fijo: la nota de un cuadre no depende de una prenda ni de una categoría elegida; solo cambia si es el primero o se repite
                />
              </CampoGuiado>
              {(!esLider || conteo) && <p className="text-sm text-taupe">{motivoConfirmar}</p>}
            </section>
          )}

          <BarraFija
            aviso={paso === "confirmar" && esLider && !conteo ? <PieGuia guia={guiaConfirmar} listo={`Listo para cuadrar el piso de ${sede}.`} /> : undefined}
            resumen={
              vista?.estado === "lista" ? (
                <span className="tabular-nums">
                  {vista.datos.resumen.prendasAlPiso.toLocaleString("es-PE")} al piso · {vista.datos.resumen.prendasAlAlmacen.toLocaleString("es-PE")} al almacén
                  {vista.datos.resumen.prendasNoCargadas > 0 ? ` · ${cuantas(vista.datos.resumen.prendasNoCargadas, "no cargada", "no cargadas")}` : ""}
                </span>
              ) : (
                <span>{cuantas(total, "prenda escaneada", "prendas escaneadas")}</span>
              )
            }
            acciones={
              <div className="flex w-full items-center gap-2 sm:w-auto">
                <button
                  type="button"
                  className="btn-cayla btn-secundario h-11"
                  disabled={enviando || congelada}
                  onClick={() => {
                    setPaso(paso === "confirmar" ? "revisar" : "escanear");
                    if (paso === "revisar") requestAnimationFrame(volverAlEscaner);
                  }}
                >
                  {paso === "confirmar" ? "Volver a revisar" : "Seguir escaneando"}
                </button>
                {paso === "revisar" ? (
                  <button
                    type="button"
                    className="btn-cayla btn-primario h-11 flex-1 sm:flex-none"
                    disabled={vista?.estado !== "lista"}
                    onClick={() => setPaso("confirmar")}
                  >
                    Sigue: confirmar
                  </button>
                ) : (
                  <button
                    type="button"
                    className={`btn-cayla btn-primario h-11 flex-1 sm:flex-none ${motivoConfirmar ? "" : guiaConfirmar.claseConfirmar}`}
                    disabled={enviando || (!congelada && (motivoConfirmar !== null || vista?.estado !== "lista"))}
                    title={motivoConfirmar ?? undefined}
                    onClick={() => void confirmar()}
                  >
                    {enviando ? (
                      <>
                        <Loader2 aria-hidden className="h-4 w-4 motion-safe:animate-spin" />
                        Cuadrando…
                      </>
                    ) : congelada ? (
                      BOTON_COMPROBAR_CUADRE
                    ) : (
                      // En el celular, sin la sede (la barra ya la dice arriba): el nombre largo de una sede no cabe junto a «Volver».
                      <>
                        <span className="sm:hidden">Cuadrar el piso</span>
                        <span className="max-sm:hidden">Cuadrar el piso de {sede}</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            }
          />
        </>
      )}

      {camara && (
        <EscanerConteo
          textos={{ ...TEXTOS_CAMARA, contador: total.toLocaleString("es-PE") }}
          onCodigo={leer}
          actual={
            arriba && prendaArriba
              ? {
                  encontrada: true,
                  referencia: prendaArriba.referencia,
                  detalle: [prendaArriba.talla, prendaArriba.color].filter(Boolean).join(" · "),
                  sku: prendaArriba.sku,
                  cantidad: arriba.cantidad,
                  atencion: noCargadasAlEscanear(libre[arriba.varianteId], arriba.cantidad) > 0,
                }
              : null
          }
          avance={{ contadas: total, total }}
          onPaso={(n) => (n > 0 && arriba ? cambiarCantidad(arriba.varianteId, arriba.cantidad + 1) : deshacer())}
          onEscribir={() => {
            setCamara(false);
            requestAnimationFrame(volverAlEscaner);
          }}
          aviso={aviso ? <span className="text-sm text-tinta">{aviso.texto}</span> : undefined}
          onClose={() => setCamara(false)}
        />
      )}
    </div>
  );
}
