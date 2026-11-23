"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, ListChecks, ScanBarcode, ScanLine, Tag } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { ComboResponsable } from "@/components/ComboResponsable";
import { EscanerConteo, type LecturaConteo } from "@/components/EscanerConteo";
import { HojaLoEscaneado } from "@/components/barrido-piso/HojaLoEscaneado";
import { HojaApartar } from "@/components/barrido-piso/HojaApartar";
import { HojaConfirmar } from "@/components/barrido-piso/HojaConfirmar";
import { PorResolver } from "@/components/barrido-piso/PorResolver";
import { ListaSugerencias, ariaDelBuscador } from "@/components/ui/ListaSugerencias";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { Aviso as AvisoLinea } from "@/components/ui/Aviso";
import { AvisoRepetida, avisarNoSumo } from "@/components/ui/AvisoRepetida";
import { Boton } from "@/components/ui/campos";
import { Chip } from "@/components/ui/Chip";
import { MiniaturaPrenda } from "@/components/ui/PrendaCelda";
import { TituloGrupo } from "@/components/ui/TituloSeccion";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { Vacio } from "@/components/ui/Vacio";
import { usePistola } from "@/components/ui/usePistola";
import { useResponsable } from "@/lib/useResponsable";
import { firmar } from "@/lib/responsable-reglas";
import { resolverCodigoV2 } from "@/lib/buscar-prenda-v2";
import { categoriaDe } from "@/lib/categoria-de-prenda";
import { avisarLectura } from "@/lib/sonido-conteo";
import { ESTADO_REPETIDA_VACIO, declararPila, decidirLectura, type EstadoRepetida, type PreguntaRepetida } from "@/lib/lectura-repetida";
import {
  INTERVALO_ESTADO_MS,
  LECTURAS_POR_LOTE,
  LECTURA_MAX,
  REINTENTO_MS,
  RPC_ABRIR_BARRIDO,
  RPC_ANULAR_LECTURAS,
  RPC_ANULAR_HALLAZGO,
  RPC_ESTADO_BARRIDO,
  RPC_REGISTRAR_LECTURAS,
  camposGuiaBarrido,
  clasificarError,
  claveColaBarrido,
  juntarColas,
  leerColaGuardada,
  momentoDelLote,
  prefijoColaBarrido,
  personasDelBarrido,
  sugerirPorNombre,
  serializarCola,
  textoDeSubida,
  unidadesDe,
  detalleDePrenda,
  leerEstadoBarrido,
  leerRespuestaLecturas,
  loteParaLaBase,
  nuevaLectura,
  porPrendaALaVista,
  otrosEscaneandoAhora,
  quienesEscanean,
  siguienteLote,
  sinLasSubidas,
  textoDeError,
  textoDeRechazo,
  type BarridoAbierto,
  type ColaGuardada,
  type EstadoBarrido,
  type PorResolver as PorResolverLista,
  type LecturaApartada,
  type LecturaBarrido,
  type PrendaBarrido,
  type TipoHallazgo,
} from "@/lib/barrido-piso-reglas";

/* ====================================================================
   BarridoPiso · escanear lo colgado entre una o varias personas (Inventario ▸ Existencias ▸ Barrido del piso, ADR-0690)

   Cada persona, desde su celular, elige su nombre y escanea. Cada lectura va a la base apenas se lee (en lotes, sin el loader de
   pantalla completa: `x-espera: no`), con su id generado aquí y la firma de quien la leyó EN ESE MOMENTO. El total de cada prenda
   es la suma de todo el equipo: dos personas en la misma blusa se suman, nunca se pisan. Esta pantalla no mueve stock; al
   confirmar el barrido (actividad 5) se corrige piso y almacén.

   La lectura repetida (ADR-0562) mira lo que leyó ESTE aparato, no el equipo: otra persona puede tener en la mano otra unidad de la
   misma blusa, y eso no es repetir.
   ==================================================================== */

/** `apartar`: el código desconocido que se puede apartar con foto desde el mismo aviso. */
type Aviso = { texto: string; tono: "ambar" | "rojo"; apartar?: string };

const nombreDe = (p: PrendaBarrido | undefined) => (p ? [p.referencia, p.talla, p.color].filter(Boolean).join(" · ") : "Esta prenda");

export function BarridoPiso({
  ubicacionId,
  sede,
  prendas,
  estadoInicial,
  porResolverInicial,
  ahoraServidor,
}: {
  ubicacionId: string;
  sede: string;
  prendas: PrendaBarrido[];
  estadoInicial: EstadoBarrido;
  /** Lo que los barridos confirmados dejaron sin cerrar (actividad 8); null si no se pudo leer. */
  porResolverInicial: PorResolverLista | null;
  /** La hora del servidor al armar la página: «hace N min» se dibuja igual en el servidor y en el navegador (si no, la hidratación falla). */
  ahoraServidor: string;
}) {
  const supabase = useMemo(() => createClient(), []);
  const responsable = useResponsable({ ubicacionId, etiqueta: sede });
  const porId = useMemo(() => new Map(prendas.map((p) => [p.varianteId, p] as const)), [prendas]);
  // Un id por pantalla abierta: su cola se guarda bajo su propia clave (dos pestañas del mismo celular no se pisan).
  const [instancia] = useState(() => crypto.randomUUID());

  const [barrido, setBarridoEstado] = useState<BarridoAbierto | null>(estadoInicial.barrido);
  // El barrido de ahora para lo que corre fuera del dibujo (la subida, el reintento, la puesta al día).
  const barridoRef = useRef<BarridoAbierto | null>(estadoInicial.barrido);
  const [enLinea, setEnLinea] = useState(true);
  // Lo que la BASE dice que lleva el equipo (por prenda y en total). Lo que este aparato aún no subió se suma al dibujar.
  const [base, setBase] = useState<Record<string, number>>(estadoInicial.barrido?.porPrenda ?? {});
  const [unidadesBase, setUnidadesBase] = useState(estadoInicial.barrido?.unidades ?? 0);
  const [cola, setCola] = useState<LecturaBarrido[]>([]);
  const colaRef = useRef<LecturaBarrido[]>([]);
  // Lo que la base rechazó: apartado con su motivo, fuera de la cola, para que la persona decida.
  const [apartadas, setApartadas] = useState<LecturaApartada[]>([]);
  const apartadasRef = useRef<LecturaApartada[]>([]);
  const [descartando, setDescartando] = useState(false);
  // Lo que leyó este aparato en esta visita, por prenda: SOLO para la lectura repetida (no para «Escaneaste tú»).
  const [mias, setMias] = useState<Record<string, number>>({});
  const miasRef = useRef<Record<string, number>>({});
  const [ultima, setUltima] = useState<string | null>(null);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [frenada, setFrenadaEstado] = useState<string | null>(null);
  const frenadaRef = useRef<string | null>(null);
  const [abriendo, setAbriendo] = useState(false);
  const [camara, setCamara] = useState(false);
  const [verEscaneado, setVerEscaneado] = useState(false);
  const [revisar, setRevisar] = useState(false);
  // La hoja de confirmar abierta, para lo que corre fuera del dibujo (la puesta al día no debe cerrar la pantalla bajo la hoja).
  const revisarRef = useRef(false);
  useEffect(() => {
    revisarRef.current = revisar;
  }, [revisar]);
  // Lo que no se puede escanear (actividad 4): apartar con foto, y lo escrito que busca por nombre.
  const [apartar, setApartar] = useState<{ tipo: TipoHallazgo; codigo: string | null } | null>(null);
  const [buscado, setBuscado] = useState("");
  const [destello, setDestello] = useState(0);
  const repetidaRef = useRef<EstadoRepetida>(ESTADO_REPETIDA_VACIO);
  const [repetida, setRepetida] = useState<EstadoRepetida>(ESTADO_REPETIDA_VACIO);
  const subiendo = useRef(false);
  const reintento = useRef<number | undefined>(undefined);
  // Las lecturas de un lote que la base rechazó suben de a una, para encontrar la mala sin perder las buenas.
  const aislar = useRef<Set<string>>(new Set());
  // Sube cada vez que cambia lo de este aparato: una puesta al día pedida antes llega vieja y se descarta.
  const version = useRef(0);
  // Una pantalla que ya se cerró no escribe nada más (su cola la recoge la que se abre).
  const vivo = useRef(true);
  const escaner = useRef<HTMLInputElement | null>(null);
  // «Quién está escaneando» mira las últimas lecturas contra esta hora; se pone al día con cada respuesta de la base.
  const [ahora, setAhora] = useState(() => new Date(ahoraServidor));

  const aLaVista = porPrendaALaVista(base, cola);
  const enCola = cola.reduce((a, l) => a + l.cantidad, 0);
  const unidadesEquipo = unidadesBase + enCola;
  // «Escaneaste tú» es de la PERSONA elegida: lo suyo en la base + lo suyo sin subir. Si le pasa el celular a otra, la otra no hereda la
  // cifra, y si recarga no vuelve a 0.
  const misUnidades = barrido ? unidadesDe(responsable.elegidoId, barrido.personas, cola) : 0;
  const quienes = barrido ? quienesEscanean(barrido.personas, ahora) : null;
  // Cada persona con lo suyo en la base más lo suyo que espera en este celular: la lista y «tú» dicen lo mismo.
  const personas = barrido ? personasDelBarrido(barrido.personas, ahora).map((p) => ({ ...p, unidades: unidadesDe(p.personaId, barrido.personas, cola) })) : [];
  // Lo escrito que NO es un código: las prendas que calzan por nombre, para tocar la de la foto (nunca con Enter).
  const sugeridas = buscado.trim() && !resolverCodigoV2(buscado, prendas) ? sugerirPorNombre(buscado, prendas) : [];
  const guia = useGuiaCampos(camposGuiaBarrido({ responsableListo: responsable.listo, escaneadas: misUnidades, abierto: Boolean(barrido) }), { enModal: false });

  useEffect(() => {
    vivo.current = true;
    return () => {
      vivo.current = false;
      window.clearTimeout(reintento.current);
    };
  }, []);

  function setBarrido(b: BarridoAbierto | null) {
    barridoRef.current = b;
    setBarridoEstado(b);
  }
  function frenar(texto: string) {
    frenadaRef.current = texto;
    setFrenadaEstado(texto);
  }

  /**
   * El barrido se cerró (aquí o desde otro celular): la pantalla vuelve a «Nadie está barriendo» sin arrastrar nada del anterior —ni
   * la frenada, ni la pregunta de repetida, ni la cola—. Lo que este celular tenía sin subir ya no entra (la base lo rechaza): se dice
   * cuántas, para que nadie crea que se sumó.
   */
  function reiniciar(porQue: string | null) {
    const tarde = colaRef.current.reduce((a, l) => a + l.cantidad, 0) + apartadasRef.current.reduce((a, l) => a + l.cantidad, 0);
    frenadaRef.current = null;
    setFrenadaEstado(null);
    cambiarRepetida(ESTADO_REPETIDA_VACIO);
    aislar.current.clear();
    window.clearTimeout(reintento.current);
    setBarrido(null); // antes de vaciar la cola: sin barrido, la clave del aparato se borra
    cambiarCola([]);
    cambiarApartadas([]);
    setBase({});
    setUnidadesBase(0);
    setUltima(null);
    miasRef.current = {};
    setMias({});
    const partes = [porQue, tarde > 0 ? `${tarde.toLocaleString("es-PE")} ${tarde === 1 ? "lectura de este celular llegó tarde y no entró" : "lecturas de este celular llegaron tarde y no entraron"}.` : null];
    const texto = partes.filter(Boolean).join(" ");
    setAviso(texto ? { texto, tono: "ambar" } : null);
  }

  /** Lo que este aparato no subió vive también en su almacenamiento, bajo la clave de ESTA pantalla: un corte o un celular que se
   *  reinicia no pierde lo leído. */
  function guardarEnAparato() {
    if (!vivo.current) return;
    const b = barridoRef.current;
    const clave = claveColaBarrido(ubicacionId, instancia);
    try {
      if (!b || (colaRef.current.length === 0 && apartadasRef.current.length === 0)) localStorage.removeItem(clave);
      else localStorage.setItem(clave, serializarCola(b.id, { cola: colaRef.current, apartadas: apartadasRef.current }, new Date()));
    } catch {
      // Sin almacenamiento (modo privado, lleno): la cola sigue en memoria y sube igual mientras la pantalla esté abierta.
    }
  }
  function cambiarCola(siguiente: LecturaBarrido[]) {
    colaRef.current = siguiente;
    setCola(siguiente);
    version.current += 1;
    guardarEnAparato();
  }
  function cambiarApartadas(siguiente: LecturaApartada[]) {
    apartadasRef.current = siguiente;
    setApartadas(siguiente);
    guardarEnAparato();
  }

  /**
   * Lo que la base dice ahora del barrido de la sede. No corre mientras este aparato tenga algo por subir: la base podría ya tener
   * lo que la cola todavía cuenta (una respuesta que se perdió) y se vería dos veces; la subida pide su foto al vaciarse. Y una foto
   * pedida antes de un cambio de este aparato llega vieja: se descarta.
   */
  async function ponerAlDia() {
    if (subiendo.current || colaRef.current.length > 0) return;
    const v = version.current;
    const { data, error } = await supabase.rpc(RPC_ESTADO_BARRIDO as never, { p_ubicacion_id: ubicacionId } as never).setHeader("x-espera", "no");
    if (!vivo.current || error || subiendo.current || version.current !== v || colaRef.current.length > 0) return;
    const estado = leerEstadoBarrido(data);
    const actual = barridoRef.current;
    if (actual && estado.barrido?.id !== actual.id) {
      // Si la hoja de confirmar de ESTE celular está abierta, el cierre es suyo: la hoja lo cuenta.
      if (revisarRef.current) return;
      reiniciar("El barrido se cerró desde otro celular.");
      if (!estado.barrido) return;
    }
    if (!estado.barrido) return;
    setBarrido(estado.barrido);
    setBase(estado.barrido.porPrenda);
    setUnidadesBase(estado.barrido.unidades);
    setAhora(new Date());
  }

  // Al llegar (o al sumarse a un barrido), lo que quedó sin subir en este celular —de esta pantalla o de otra pestaña que se cerró—
  // vuelve a la cola y sube. Subir dos veces lo mismo no duplica (la base es idempotente por id).
  useEffect(() => {
    if (!barrido?.id) return;
    const prefijo = prefijoColaBarrido(ubicacionId);
    const propia = claveColaBarrido(ubicacionId, instancia);
    const otras: { clave: string; guardada: ColaGuardada }[] = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const clave = localStorage.key(i);
        if (clave && clave.startsWith(prefijo) && clave !== propia) otras.push({ clave, guardada: leerColaGuardada(localStorage.getItem(clave), barrido.id, new Date()) });
      }
    } catch {
      return;
    }
    const junta = juntarColas({ cola: colaRef.current, apartadas: apartadasRef.current }, ...otras.map((o) => o.guardada));
    apartadasRef.current = junta.apartadas;
    setApartadas(junta.apartadas);
    cambiarCola(junta.cola); // escribe la propia antes de soltar las otras: nada queda sin dueño
    try {
      for (const o of otras) localStorage.removeItem(o.clave);
    } catch {
      // Si no se pudieron soltar, la próxima pantalla las vuelve a recoger: subir dos veces no duplica.
    }
    void subir();
    // Solo al cambiar de barrido: la cola de después ya la maneja la subida.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [barrido?.id]);

  // La puesta al día: cada 5 s con la pantalla a la vista (también sin barrido: si otra persona lo abre, esta pantalla se suma sola).
  useEffect(() => {
    const vuelta = window.setInterval(() => {
      if (document.visibilityState === "visible") void ponerAlDia();
    }, INTERVALO_ESTADO_MS);
    return () => window.clearInterval(vuelta);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sin red se sigue escaneando; al volver, lo que esperaba sube solo.
  useEffect(() => {
    const cambio = () => {
      setEnLinea(navigator.onLine);
      if (navigator.onLine) void subir();
    };
    cambio();
    window.addEventListener("online", cambio);
    window.addEventListener("offline", cambio);
    return () => {
      window.removeEventListener("online", cambio);
      window.removeEventListener("offline", cambio);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  function cambiarRepetida(siguiente: EstadoRepetida) {
    repetidaRef.current = siguiente;
    setRepetida(siguiente);
  }

  // ---- Abrir (o sumarse) ----

  async function abrir() {
    // `listo` y no `firma()`: una terminal con firma de respaldo (ADR-0454) no tiene firma y sí puede guardar.
    if (!responsable.listo) return; // `confirma={guia}` ya lo dijo bajo el combo
    const firma = responsable.firma();
    setAbriendo(true);
    setAviso(null);
    const { data, error } = await firmar(supabase.rpc(RPC_ABRIR_BARRIDO as never, { p_ubicacion_id: ubicacionId } as never), firma);
    setAbriendo(false);
    if (error) {
      setAviso({ texto: textoDeError(error, "empezar el barrido"), tono: "rojo" });
      return;
    }
    const estado = leerEstadoBarrido((data as { estado?: unknown } | null)?.estado);
    if (!estado.barrido) {
      setAviso({ texto: "No se pudo leer el barrido recién abierto. Recarga la página.", tono: "rojo" });
      return;
    }
    frenadaRef.current = null;
    setFrenadaEstado(null);
    setBarrido(estado.barrido);
    setBase(estado.barrido.porPrenda);
    setUnidadesBase(estado.barrido.unidades);
    window.setTimeout(() => escaner.current?.focus({ preventScroll: true }), 0);
  }

  // ---- Subir lo leído ----

  async function subir() {
    const b = barridoRef.current;
    if (!vivo.current || subiendo.current || !b || frenadaRef.current) return;
    const lote = siguienteLote(colaRef.current, LECTURAS_POR_LOTE, aislar.current);
    if (lote.length === 0) return;
    subiendo.current = true;
    window.clearTimeout(reintento.current);
    const consulta = supabase
      .rpc(RPC_REGISTRAR_LECTURAS as never, { p_barrido_id: b.id, p_lecturas: loteParaLaBase(lote) } as never)
      // Escanear no es «guardar» para la persona: no se tapa la pantalla con el loader entre lectura y lectura (ADR-0149).
      .setHeader("x-espera", "no");
    // La firma viaja con la hora en que se ESCANEÓ: la base mira si esa persona estaba de turno entonces, no al subir.
    const firma = lote[0].firma ? { ...lote[0].firma, momento: momentoDelLote(lote, new Date()) } : null;
    const { data, error } = await firmar(consulta, firma);
    subiendo.current = false;
    if (!vivo.current) return;
    if (error) {
      const clase = clasificarError(error);
      if (clase === "frena_todo") {
        if (error.hint === "barrido_cerrado" && !revisarRef.current) {
          reiniciar("El barrido se cerró.");
          avisarLectura("desconocida");
          return;
        }
        frenar(textoDeRechazo(error.hint) ?? error.message);
        avisarLectura("desconocida");
        return;
      }
      if (clase === "aparta") {
        // La base dijo que no a ESTE lote: reintentarlo daría lo mismo para siempre. Si era más de una, se prueba de a una.
        if (lote.length > 1) {
          for (const l of lote) aislar.current.add(l.id);
        } else {
          aislar.current.delete(lote[0].id);
          cambiarApartadas([...apartadasRef.current, { ...lote[0], motivo: textoDeRechazo(error.hint) ?? error.message }]);
          cambiarCola(sinLasSubidas(colaRef.current, lote));
          avisarLectura("desconocida");
        }
        void subir();
        return;
      }
      // Sin respuesta de la base (sin red, se cayó, tardó): lo leído sigue en la cola y se reintenta solo.
      reintento.current = window.setTimeout(() => void subir(), REINTENTO_MS);
      return;
    }
    for (const l of lote) aislar.current.delete(l.id);
    const r = leerRespuestaLecturas(data);
    cambiarCola(sinLasSubidas(colaRef.current, lote));
    if (r) {
      setBase((x) => ({ ...x, ...r.porPrenda }));
      setUnidadesBase(r.unidades);
      // Lo de cada persona viene con la respuesta: quien escanea seguido ve su cifra sin esperar la próxima puesta al día.
      if (r.personas && barridoRef.current) setBarrido({ ...barridoRef.current, personas: r.personas, unidades: r.unidades });
    }
    setAhora(new Date());
    // Con la cola vacía, la foto entera del equipo; si queda algo, sigue subiendo.
    if (colaRef.current.length > 0) void subir();
    else void ponerAlDia();
  }

  /** Quitar lecturas ya subidas (un tramo o una repetida), sin borrarlas: firmado por quien está elegido. Devuelve el error, o null. */
  async function anular(ids: string[], motivo: "repetida" | "tramo"): Promise<string | null> {
    const b = barridoRef.current;
    if (!b) return "No hay un barrido abierto.";
    if (!responsable.listo) return "Elige quién está quitando: arriba, en «Quién escanea».";
    const { data, error } = await firmar(
      supabase.rpc(RPC_ANULAR_LECTURAS as never, { p_barrido_id: b.id, p_ids: ids, p_motivo: motivo } as never),
      responsable.firma(),
    );
    if (error) {
      if (clasificarError(error) === "frena_todo") frenar(textoDeRechazo(error.hint) ?? error.message);
      return textoDeError(error, "quitar");
    }
    // La foto del equipo ya sin lo quitado (cuenta igual con la cola de este celular: lo que espera subir no se quitó).
    const estado = leerEstadoBarrido((data as { estado?: unknown } | null)?.estado);
    if (estado.barrido && estado.barrido.id === b.id) {
      version.current += 1;
      setBarrido(estado.barrido);
      setBase(estado.barrido.porPrenda);
      setUnidadesBase(estado.barrido.unidades);
      setAhora(new Date());
    }
    return null;
  }

  /** Quitar algo apartado por error (sin borrarlo). Devuelve el error, o null. */
  async function anularAparte(id: string): Promise<string | null> {
    const b = barridoRef.current;
    if (!b) return "No hay un barrido abierto.";
    if (!responsable.listo) return "Elige quién está quitando: arriba, en «Quién escanea».";
    const { data, error } = await firmar(supabase.rpc(RPC_ANULAR_HALLAZGO as never, { p_barrido_id: b.id, p_id: id } as never), responsable.firma());
    if (error) return textoDeError(error, "quitar");
    const aparte = Number((data as { aparte?: unknown } | null)?.aparte ?? b.aparte);
    if (barridoRef.current) setBarrido({ ...barridoRef.current, aparte: Number.isFinite(aparte) ? aparte : b.aparte });
    return null;
  }

  /** «Reintentar»: lo apartado vuelve a la cola, de a una. */
  function reintentarApartadas() {
    const vuelven: LecturaBarrido[] = apartadasRef.current.map((a) => ({ id: a.id, varianteId: a.varianteId, cantidad: a.cantidad, codigo: a.codigo, leidaEnAparato: a.leidaEnAparato, firma: a.firma }));
    for (const l of vuelven) aislar.current.add(l.id);
    cambiarApartadas([]);
    cambiarCola([...vuelven, ...colaRef.current]);
    setDescartando(false);
    void subir();
  }
  /** «Descartar» (con doble confirmación): lo apartado deja de esperar; no se suma al barrido. */
  function descartarApartadas() {
    cambiarApartadas([]);
    setDescartando(false);
  }

  // ---- Leer ----

  /** Lo que muestra la bandeja de la cámara al leer (se llama desde la lectura, no al dibujar: lee la cola de ahora). */
  function bandeja(p: PrendaBarrido, atencion = false): LecturaConteo {
    return tarjetaDe(p, porPrendaALaVista(base, colaRef.current)[p.varianteId] ?? 0, atencion);
  }

  /** Suma `cantidad` de esa prenda: a la cola, a la tarjeta y a la lectura repetida; suena y sube. */
  function sumar(p: PrendaBarrido, codigo: string | null, cantidad = 1): LecturaConteo {
    if (!responsable.listo) return { encontrada: false, codigo: codigo ?? "" };
    const firma = responsable.firma();
    const lleva = miasRef.current[p.varianteId] ?? 0;
    const lectura = nuevaLectura({ id: crypto.randomUUID(), varianteId: p.varianteId, codigo, ahora: new Date(), firma, cantidad: Math.min(Math.max(1, cantidad), LECTURA_MAX) });
    cambiarCola([...colaRef.current, lectura]);
    miasRef.current = { ...miasRef.current, [p.varianteId]: lleva + lectura.cantidad };
    setMias(miasRef.current);
    setUltima(p.varianteId);
    setDestello((n) => n + 1);
    setAviso(null);
    avisarLectura(lleva === 0 ? "nueva" : "suma");
    void subir();
    return bandeja(p);
  }

  function dejarRastroDelNo(anterior: PreguntaRepetida | null) {
    const p = anterior ? porId.get(anterior.varianteId) : undefined;
    if (!anterior || !p) return;
    avisarNoSumo(nombreDe(p), () => cambiarRepetida({ ...repetidaRef.current, pregunta: { varianteId: anterior.varianteId, ignoradas: 0 } }));
  }

  /** Una lectura (pistola, cámara o lo escrito). Devuelve lo que la cámara muestra en su bandeja. */
  function leer(texto: string): LecturaConteo {
    const codigo = texto.trim();
    if (!codigo || !barrido) return { encontrada: false, codigo };
    if (frenada) {
      avisarLectura("desconocida");
      return { encontrada: false, codigo };
    }
    if (!responsable.listo) {
      avisarLectura("desconocida");
      setAviso({ texto: "Elige tu nombre arriba antes de escanear: cada prenda queda a nombre de quien la escaneó.", tono: "ambar" });
      guia.revisar();
      return { encontrada: false, codigo };
    }
    const p = resolverCodigoV2(codigo, prendas);
    if (!p) {
      avisarLectura("desconocida");
      setAviso({ texto: `«${codigo}» no es de ninguna prenda del catálogo.`, tono: "ambar", apartar: codigo });
      return { encontrada: false, codigo };
    }
    return leerPrenda(p, codigo);
  }

  /** Una prenda reconocida (por su código, o tocada en la lista por nombre): la lectura repetida y, si va, se suma. */
  function leerPrenda(p: PrendaBarrido, codigo: string | null): LecturaConteo {
    const lleva = miasRef.current[p.varianteId] ?? 0;
    const decision = decidirLectura(p.varianteId, lleva, true, repetidaRef.current);
    if (decision.tipo === "ignora") {
      cambiarRepetida({ ...repetidaRef.current, pregunta: decision.pregunta });
      return bandeja(p, true);
    }
    if (decision.tipo === "pregunta") {
      if (decision.cierraPregunta) dejarRastroDelNo(repetidaRef.current.pregunta);
      cambiarRepetida({ ...repetidaRef.current, pregunta: decision.pregunta });
      avisarLectura("repetida");
      setAviso(null);
      return bandeja(p, true);
    }
    if (decision.cierraPregunta) {
      dejarRastroDelNo(repetidaRef.current.pregunta);
      cambiarRepetida({ ...repetidaRef.current, pregunta: null });
    }
    return sumar(p, codigo);
  }

  function responderSi() {
    const pregunta = repetidaRef.current.pregunta;
    const p = pregunta ? porId.get(pregunta.varianteId) : undefined;
    cambiarRepetida({ ...repetidaRef.current, pregunta: null });
    if (p) sumar(p, null);
    escaner.current?.focus({ preventScroll: true });
  }
  function responderNo() {
    cambiarRepetida({ ...repetidaRef.current, pregunta: null });
    escaner.current?.focus({ preventScroll: true });
  }
  function ponerVarias(total: number) {
    const pregunta = repetidaRef.current.pregunta;
    const p = pregunta ? porId.get(pregunta.varianteId) : undefined;
    if (!p || !pregunta) return;
    const lleva = miasRef.current[p.varianteId] ?? 0;
    cambiarRepetida({ pregunta: null, pilas: declararPila(repetidaRef.current.pilas, p.varianteId) });
    if (total > lleva) sumar(p, null, total - lleva);
    escaner.current?.focus({ preventScroll: true });
  }

  usePistola(escaner, {
    activa: Boolean(barrido) && !camara,
    fuera: "atraer",
    alLeer: ({ codigo }) => {
      if (escaner.current) escaner.current.value = "";
      leer(codigo);
    },
  });

  // ---- Dibujo ----

  const pregunta = repetida.pregunta;
  const avisoRepetida = pregunta ? (
    <AvisoRepetida
      key={pregunta.varianteId}
      nombre={nombreDe(porId.get(pregunta.varianteId))}
      miniatura={<MiniaturaPrenda fotoUrl={porId.get(pregunta.varianteId)?.fotoUrl ?? null} colorHex={porId.get(pregunta.varianteId)?.colorHex ?? null} tamano="lg" {...categoriaDe(porId.get(pregunta.varianteId))} />}
      lleva={mias[pregunta.varianteId] ?? 0}
      // «Cambiar cantidad» no pasa de lo que una lectura puede sumar en la base (cantidad 1 a 500): más se rechazaría.
      tope={(mias[pregunta.varianteId] ?? 0) + LECTURA_MAX}
      variante={camara ? "camara" : "franja"}
      onSi={responderSi}
      onNo={responderNo}
      onVarias={ponerVarias}
      onCodigo={(codigo) => leer(codigo)}
    />
  ) : null;

  const combo = (
    <CampoGuiado id="responsable" guia={guia} titulo="Quién escanea" ayuda="Cada prenda queda a tu nombre.">
      <div data-guia="barrido.responsable">
        <ComboResponsable control={responsable} deshabilitado={abriendo} />
      </div>
    </CampoGuiado>
  );

  if (!barrido) {
    return (
      // Dos columnas en escritorio: empezar a la izquierda y, al lado, lo que los barridos anteriores dejaron por resolver.
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
        <div className="space-y-5">
          {combo}
          <Vacio
            guia="barrido.empezar"
            icono={<ScanLine />}
            titulo="Nadie está barriendo el piso"
            acciones={
              <div className="space-y-2">
                <PieGuia guia={guia} listo="Listo para empezar." />
                <Boton peso="primario" onClick={abrir} cargando={abriendo} textoCargando="Empezando…" confirma={guia}>
                  Empezar el barrido
                </Boton>
              </div>
            }
          >
            Escaneen todo lo colgado. Quien llegue después se suma desde su celular.
          </Vacio>
          {aviso && <AvisoLinea tono={aviso.tono === "rojo" ? "error" : "atencion"}>{aviso.texto}</AvisoLinea>}
        </div>
        <PorResolver
          ubicacionId={ubicacionId}
          inicial={porResolverInicial}
          prendas={prendas}
          porId={porId}
          firma={() => responsable.firma()}
          listo={responsable.listo}
        />
      </div>
    );
  }

  const prendaUltima = ultima ? porId.get(ultima) : undefined;
  const actual = prendaUltima ? tarjetaDe(prendaUltima, aLaVista[prendaUltima.varianteId] ?? 0) : null;

  return (
    <div className="space-y-5">
      {/* En el celular, dos cifras lado a lado: tres apiladas tapaban el escáner. */}
      <div data-guia="barrido.cifras" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <TarjetaCifra etiqueta="Escaneó el equipo" valor={unidadesEquipo.toLocaleString("es-PE")} unidad={unidadesEquipo === 1 ? "prenda" : "prendas"}>
          {quienes ?? `Empezó ${barrido.abiertoPor ? `${barrido.abiertoPor.split(" ")[0]} ` : ""}a las ${horaCorta(barrido.abiertoEn)}`}
        </TarjetaCifra>
        <TarjetaCifra etiqueta="Escaneaste tú" valor={misUnidades.toLocaleString("es-PE")} unidad={misUnidades === 1 ? "prenda" : "prendas"}>
          {textoDeSubida({ enCola, enLinea, frenada })}
        </TarjetaCifra>
        <TarjetaCifra className="hidden sm:flex" etiqueta="Prendas distintas" valor={Object.values(aLaVista).filter((n) => n > 0).length.toLocaleString("es-PE")}>
          {barrido.aparte > 0 ? `Y ${barrido.aparte.toLocaleString("es-PE")} aparte, por resolver` : "Tallas y colores ya vistos"}
        </TarjetaCifra>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          {combo}
          <CampoGuiado id="colgado" guia={guia} titulo="Lo colgado" ayuda="Cada lectura suma 1. Si la misma se repite, te pregunto antes de sumarla.">
            <section data-guia="barrido.escaner" className="vd-placa rounded-[var(--radius-tarjeta,1rem)] p-4 sm:p-5">
              <label htmlFor="barrido-escaner" className="sr-only">
                Escanear prenda colgada
              </label>
              <div className="caja-cayla caja-campo min-h-14">
                <ScanBarcode aria-hidden className="pointer-events-none h-5 w-5 shrink-0 text-tinta/45" />
                <input
                  className="self-stretch py-0 text-base"
                  ref={escaner}
                  id="barrido-escaner"
                  type="text"
                  autoComplete="off"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  enterKeyHint="enter"
                  placeholder="Escanea, o escribe el código o el nombre" // sugerir-fijo: dice cómo se escanea; no depende de nada elegido antes en esta pantalla (corto: cabe a 375 px)
                  {...ariaDelBuscador("barrido-sugeridas", sugeridas.length > 0, null)}
                  onChange={(e) => setBuscado(e.currentTarget.value)}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    e.preventDefault();
                    const texto = e.currentTarget.value;
                    // Un nombre no se elige con Enter (la pistola remata con Enter): queda escrito y se toca la prenda de la lista.
                    if (!resolverCodigoV2(texto, prendas) && sugerirPorNombre(texto, prendas).length > 0) return;
                    e.currentTarget.value = "";
                    setBuscado("");
                    leer(texto);
                  }}
                />
              </div>
              {sugeridas.length > 0 && (
                <div className="mt-2">
                  <ListaSugerencias
                    id="barrido-sugeridas"
                    etiqueta="Prendas que calzan con lo escrito: toca la que tienes en la mano"
                    sugerencias={sugeridas.map((p) => ({
                      clave: p.varianteId,
                      miniatura: <MiniaturaPrenda fotoUrl={p.fotoUrl} colorHex={p.colorHex} tamano="md" {...categoriaDe(p)} />,
                      titulo: p.referencia,
                      detalle: detalleDePrenda(p),
                    }))}
                    activa={null}
                    tecla={null}
                    onElegir={(i) => {
                      const p = sugeridas[i];
                      if (escaner.current) escaner.current.value = "";
                      setBuscado("");
                      if (p) leerPrenda(p, null);
                      escaner.current?.focus({ preventScroll: true });
                    }}
                  />
                </div>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button type="button" data-guia="barrido.camara" onClick={() => setCamara(true)} className="btn-cayla btn-secundario h-11">
                  <Camera aria-hidden className="h-4 w-4" />
                  Escanear con la cámara
                </button>
                <button type="button" data-guia="barrido.sin-etiqueta" onClick={() => setApartar({ tipo: "sin_etiqueta", codigo: null })} className="btn-cayla btn-secundario h-11">
                  <Tag aria-hidden className="h-4 w-4" />
                  Sin etiqueta
                </button>
                <button type="button" data-guia="barrido.escaneado" onClick={() => setVerEscaneado(true)} className="btn-cayla btn-secundario h-11">
                  <ListChecks aria-hidden className="h-4 w-4" />
                  Ver lo escaneado
                </button>
              </div>
              {!camara && avisoRepetida && <div className="mt-3">{avisoRepetida}</div>}
              {(frenada || aviso) && (
                <AvisoLinea
                  chico
                  className="mt-3"
                  tono={frenada || aviso?.tono === "rojo" ? "error" : "atencion"}
                  accion={
                    frenada ? (
                      <button type="button" className="btn-cayla btn-enlace" onClick={() => window.location.reload()}>
                        Recargar
                      </button>
                    ) : aviso?.apartar ? (
                      <button type="button" className="btn-cayla btn-enlace" onClick={() => setApartar({ tipo: "codigo_desconocido", codigo: aviso.apartar ?? null })}>
                        Apartar con foto
                      </button>
                    ) : undefined
                  }
                >
                  {frenada ?? aviso?.texto}
                </AvisoLinea>
              )}
              {apartadas.length > 0 && (
                <AvisoLinea
                  className="mt-3"
                  tono="error"
                  titulo={apartadas.length === 1 ? "1 lectura no se guardó" : `${apartadas.length.toLocaleString("es-PE")} lecturas no se guardaron`}
                >
                  <ul className="mt-1 space-y-0.5">
                    {apartadas.slice(0, 3).map((l) => (
                      <li key={l.id}>
                        {nombreDe(porId.get(l.varianteId))}: {l.motivo}
                      </li>
                    ))}
                    {apartadas.length > 3 && <li>y {(apartadas.length - 3).toLocaleString("es-PE")} más</li>}
                  </ul>
                  {descartando ? (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span>¿Descartarlas? No se suman al barrido.</span>
                      <Boton peso="primario" className="btn-chico" onClick={descartarApartadas}>
                        Sí, descartar
                      </Boton>
                      <Boton peso="fantasma" className="btn-chico" onClick={() => setDescartando(false)}>
                        No
                      </Boton>
                    </div>
                  ) : (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Boton peso="fantasma" className="btn-chico" onClick={reintentarApartadas}>
                        Reintentar
                      </Boton>
                      <button type="button" className="btn-cayla btn-enlace" onClick={() => setDescartando(true)}>
                        Descartar
                      </button>
                    </div>
                  )}
                </AvisoLinea>
              )}
            </section>
          </CampoGuiado>
          <PieGuia guia={guia} listo="Sigue escaneando: cada prenda se guarda sola." />
          <div data-guia="barrido.confirmar">
            <Boton peso="primario" onClick={() => setRevisar(true)} disabled={unidadesEquipo === 0}>
              Revisar y confirmar
            </Boton>
          </div>
        </div>

        <div className="space-y-4 self-start">
        <section data-guia="barrido.ultima" aria-live="polite" className="vd-placa rounded-[var(--radius-tarjeta,1rem)] p-4 sm:p-5">
          {prendaUltima && actual ? (
            <div key={destello} className="anim-revelar flex items-center gap-4">
              <MiniaturaPrenda fotoUrl={prendaUltima.fotoUrl} colorHex={prendaUltima.colorHex} tamano="2xl" {...categoriaDe(prendaUltima)} />
              <div className="min-w-0 flex-1">
                <p className="label-cayla text-[11px] text-taupe">Última que escaneaste</p>
                <p className="font-display truncate text-2xl text-tinta">{prendaUltima.referencia}</p>
                <p className="texto-detalle truncate text-taupe">{actual.detalle || "Sin talla ni color"}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="font-display text-4xl tabular-nums text-tinta">{actual.cantidad}</p>
                <p className="texto-detalle text-taupe">del equipo</p>
              </div>
            </div>
          ) : (
            <Vacio tamano="chico" icono={<ScanLine />}>
              Aquí aparece la última prenda que escanees, con su foto.
            </Vacio>
          )}
        </section>

          {personas.length > 0 && (
            <section data-guia="barrido.personas" className="vd-placa rounded-[var(--radius-tarjeta,1rem)] p-4 sm:p-5">
              <TituloGrupo cuenta={personas.length}>Quiénes escanearon</TituloGrupo>
              <ul className="mt-2 divide-y divide-tinta/10">
                {personas.map((p) => (
                  <li key={p.personaId} className="flex items-center gap-3 py-2">
                    <span className="min-w-0 flex-1 truncate text-[15px] text-tinta">{p.nombre}</span>
                    {p.activa ? (
                      <Chip tono="verde" versalitas={false}>
                        Escaneando
                      </Chip>
                    ) : (
                      <span className="texto-detalle text-taupe">{p.hace}</span>
                    )}
                    <span className="w-14 text-right font-display text-lg tabular-nums text-tinta">{p.unidades.toLocaleString("es-PE")}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>

      {revisar && (
        <HojaConfirmar
          barridoId={barrido.id}
          esperan={cola.length + apartadas.length}
          recientes={otrosEscaneandoAhora(barrido.personas, responsable.elegidoId, ahora)}
          firma={() => responsable.firma()}
          listo={responsable.listo}
          quien={responsable.lista.elegibles.find((p) => p.personaId === responsable.elegidoId)?.nombre ?? responsable.firmaDeRespaldo ?? null}
          onHecho={() => {
            // El barrido se cerró (confirmado o descartado): la pantalla vuelve a «Nadie está barriendo», sin nada del anterior.
            reiniciar(null);
          }}
          onClose={() => setRevisar(false)}
        />
      )}

      {apartar && (
        <HojaApartar
          barridoId={barrido.id}
          tipo={apartar.tipo}
          codigo={apartar.codigo}
          firma={() => responsable.firma()}
          listo={responsable.listo}
          onListo={(aparte) => {
            if (barridoRef.current) setBarrido({ ...barridoRef.current, aparte });
            setAviso(null);
            avisarLectura("nueva");
          }}
          onClose={() => {
            setApartar(null);
            window.setTimeout(() => escaner.current?.focus({ preventScroll: true }), 0);
          }}
        />
      )}

      {verEscaneado && (
        <HojaLoEscaneado
          barridoId={barrido.id}
          porId={porId}
          esperan={cola.length}
          onAnular={anular}
          onAnularAparte={anularAparte}
          onClose={() => setVerEscaneado(false)}
        />
      )}

      {camara && (
        <EscanerConteo
          onCodigo={leer}
          actual={actual}
          avance={{ contadas: misUnidades, total: 0 }}
          pregunta={avisoRepetida}
          aviso={frenada ? <AvisoLinea chico tono="error">{frenada}</AvisoLinea> : undefined}
          textos={{
            titulo: "Barrido con la cámara",
            subtitulo: "Pasa las etiquetas de lo colgado una tras otra.",
            etiqueta: "Barrido · cada lectura suma 1",
            ayuda: "Pasa las etiquetas una tras otra · suena y vibra en cada una",
            enCurso: "El equipo lleva",
            vacio: "Lo que escanees aparece aquí con su foto.",
            contador: unidadesEquipo.toLocaleString("es-PE"),
          }}
          onEscribir={() => {
            setCamara(false);
            window.setTimeout(() => escaner.current?.focus({ preventScroll: true }), 0);
          }}
          onClose={() => setCamara(false)}
        />
      )}
    </div>
  );
}

function tarjetaDe(p: PrendaBarrido, cantidad: number, atencion = false): Extract<LecturaConteo, { encontrada: true }> {
  return {
    encontrada: true,
    referencia: p.referencia,
    detalle: detalleDePrenda(p),
    sku: p.sku,
    cantidad,
    atencion,
    miniatura: <MiniaturaPrenda fotoUrl={p.fotoUrl} colorHex={p.colorHex} tamano="lg" {...categoriaDe(p)} />,
  };
}

function horaCorta(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "—";
  return new Date(t).toLocaleTimeString("es-PE", { hour: "numeric", minute: "2-digit", timeZone: "America/Lima" });
}

