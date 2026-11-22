"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, ScanBarcode, ScanLine } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { ComboResponsable } from "@/components/ComboResponsable";
import { EscanerConteo, type LecturaConteo } from "@/components/EscanerConteo";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { Aviso as AvisoLinea } from "@/components/ui/Aviso";
import { AvisoRepetida, avisarNoSumo } from "@/components/ui/AvisoRepetida";
import { Boton } from "@/components/ui/campos";
import { MiniaturaPrenda } from "@/components/ui/PrendaCelda";
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
  REINTENTO_MS,
  RPC_ABRIR_BARRIDO,
  RPC_REGISTRAR_LECTURAS,
  camposGuiaBarrido,
  detalleDePrenda,
  esRechazoQueFrena,
  leerEstadoBarrido,
  leerRespuestaLecturas,
  loteParaLaBase,
  nuevaLectura,
  porPrendaALaVista,
  quienesEscanean,
  siguienteLote,
  sinLasSubidas,
  textoDeRechazo,
  type BarridoAbierto,
  type EstadoBarrido,
  type LecturaBarrido,
  type PrendaBarrido,
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

type Aviso = { texto: string; tono: "ambar" | "rojo" };

const nombreDe = (p: PrendaBarrido | undefined) => (p ? [p.referencia, p.talla, p.color].filter(Boolean).join(" · ") : "Esta prenda");
const sumaDe = (r: Record<string, number>) => Object.values(r).reduce((a, n) => a + n, 0);

export function BarridoPiso({ ubicacionId, sede, prendas, estadoInicial }: { ubicacionId: string; sede: string; prendas: PrendaBarrido[]; estadoInicial: EstadoBarrido }) {
  const supabase = useMemo(() => createClient(), []);
  const responsable = useResponsable({ ubicacionId, etiqueta: sede });
  const porId = useMemo(() => new Map(prendas.map((p) => [p.varianteId, p] as const)), [prendas]);

  const [barrido, setBarrido] = useState<BarridoAbierto | null>(estadoInicial.barrido);
  // Lo que la BASE dice que lleva el equipo (por prenda y en total). Lo que este aparato aún no subió se suma al dibujar.
  const [base, setBase] = useState<Record<string, number>>(estadoInicial.barrido?.porPrenda ?? {});
  const [unidadesBase, setUnidadesBase] = useState(estadoInicial.barrido?.unidades ?? 0);
  const [cola, setCola] = useState<LecturaBarrido[]>([]);
  const colaRef = useRef<LecturaBarrido[]>([]);
  // Lo que leyó este aparato en esta visita, por prenda: la lectura repetida y «Tú» se miden con esto.
  const [mias, setMias] = useState<Record<string, number>>({});
  const miasRef = useRef<Record<string, number>>({});
  const [ultima, setUltima] = useState<string | null>(null);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [frenada, setFrenada] = useState<string | null>(null);
  const [abriendo, setAbriendo] = useState(false);
  const [camara, setCamara] = useState(false);
  const [destello, setDestello] = useState(0);
  const repetidaRef = useRef<EstadoRepetida>(ESTADO_REPETIDA_VACIO);
  const [repetida, setRepetida] = useState<EstadoRepetida>(ESTADO_REPETIDA_VACIO);
  const subiendo = useRef(false);
  const reintento = useRef<number | undefined>(undefined);
  const escaner = useRef<HTMLInputElement | null>(null);
  // «Quién está escaneando» mira las últimas lecturas contra esta hora; se pone al día con cada respuesta de la base.
  const [ahora, setAhora] = useState(() => new Date());

  const aLaVista = porPrendaALaVista(base, cola);
  const enCola = cola.reduce((a, l) => a + l.cantidad, 0);
  const unidadesEquipo = unidadesBase + enCola;
  const misUnidades = sumaDe(mias);
  const quienes = barrido ? quienesEscanean(barrido.personas, ahora) : null;
  const guia = useGuiaCampos(camposGuiaBarrido({ responsableListo: responsable.listo, escaneadas: misUnidades, abierto: Boolean(barrido) }), { enModal: false });

  useEffect(() => () => window.clearTimeout(reintento.current), []);

  function cambiarCola(siguiente: LecturaBarrido[]) {
    colaRef.current = siguiente;
    setCola(siguiente);
  }
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
      setAviso({ texto: textoDeRechazo(error.hint) ?? `No se pudo empezar el barrido: ${error.message}`, tono: "rojo" });
      return;
    }
    const estado = leerEstadoBarrido((data as { estado?: unknown } | null)?.estado);
    if (!estado.barrido) {
      setAviso({ texto: "No se pudo leer el barrido recién abierto. Recarga la página.", tono: "rojo" });
      return;
    }
    setBarrido(estado.barrido);
    setBase(estado.barrido.porPrenda);
    setUnidadesBase(estado.barrido.unidades);
    window.setTimeout(() => escaner.current?.focus({ preventScroll: true }), 0);
  }

  // ---- Subir lo leído ----

  async function subir() {
    if (subiendo.current || !barrido) return;
    const lote = siguienteLote(colaRef.current);
    if (lote.length === 0) return;
    subiendo.current = true;
    window.clearTimeout(reintento.current);
    const consulta = supabase
      .rpc(RPC_REGISTRAR_LECTURAS as never, { p_barrido_id: barrido.id, p_lecturas: loteParaLaBase(lote) } as never)
      // Escanear no es «guardar» para la persona: no se tapa la pantalla con el loader entre lectura y lectura (ADR-0149).
      .setHeader("x-espera", "no");
    const { data, error } = await firmar(consulta, lote[0].firma);
    subiendo.current = false;
    if (error) {
      if (esRechazoQueFrena(error.hint)) {
        setFrenada(textoDeRechazo(error.hint));
        avisarLectura("desconocida");
        return;
      }
      // La red o la base que no respondió: lo leído sigue en la cola y se reintenta solo.
      reintento.current = window.setTimeout(() => void subir(), REINTENTO_MS);
      return;
    }
    const r = leerRespuestaLecturas(data);
    cambiarCola(sinLasSubidas(colaRef.current, lote));
    if (r) {
      setBase((b) => ({ ...b, ...r.porPrenda }));
      setUnidadesBase(r.unidades);
    }
    setAhora(new Date());
    if (colaRef.current.length > 0) void subir();
  }

  // ---- Leer ----

  /** Lo que muestra la bandeja de la cámara al leer (se llama desde la lectura, no al dibujar: lee la cola de ahora). */
  function bandeja(p: PrendaBarrido, atencion = false): LecturaConteo {
    return tarjetaDe(p, porPrendaALaVista(base, colaRef.current)[p.varianteId] ?? 0, atencion);
  }

  /** Suma `cantidad` de esa prenda: a la cola, a «Tú» y a la tarjeta; suena y sube. */
  function sumar(p: PrendaBarrido, codigo: string | null, cantidad = 1): LecturaConteo {
    if (!responsable.listo) return { encontrada: false, codigo: codigo ?? "" };
    const firma = responsable.firma();
    const lleva = miasRef.current[p.varianteId] ?? 0;
    const lectura = nuevaLectura({ id: crypto.randomUUID(), varianteId: p.varianteId, codigo, ahora: new Date(), firma, cantidad });
    cambiarCola([...colaRef.current, lectura]);
    miasRef.current = { ...miasRef.current, [p.varianteId]: lleva + cantidad };
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
      setAviso({ texto: `«${codigo}» no es de ninguna prenda del catálogo. Déjala aparte por ahora.`, tono: "ambar" });
      return { encontrada: false, codigo };
    }
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
      tope={null}
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
      <div className="max-w-2xl space-y-5">
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
          {estadoDeSubida(enCola, frenada)}
        </TarjetaCifra>
        <TarjetaCifra className="hidden sm:flex" etiqueta="Prendas distintas" valor={Object.values(aLaVista).filter((n) => n > 0).length.toLocaleString("es-PE")}>
          Tallas y colores ya vistos
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
                  placeholder="Escanea o escribe el código" // sugerir-fijo: dice cómo se escanea; no depende de nada elegido antes en esta pantalla (corto: cabe a 375 px)
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    e.preventDefault();
                    const texto = e.currentTarget.value;
                    e.currentTarget.value = "";
                    leer(texto);
                  }}
                />
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button type="button" data-guia="barrido.camara" onClick={() => setCamara(true)} className="btn-cayla btn-secundario h-11">
                  <Camera aria-hidden className="h-4 w-4" />
                  Escanear con la cámara
                </button>
              </div>
              {!camara && avisoRepetida && <div className="mt-3">{avisoRepetida}</div>}
              {(frenada || aviso) && (
                <AvisoLinea chico className="mt-3" tono={frenada || aviso?.tono === "rojo" ? "error" : "atencion"}>
                  {frenada ?? aviso?.texto}
                </AvisoLinea>
              )}
            </section>
          </CampoGuiado>
          <PieGuia guia={guia} listo="Sigue escaneando: cada prenda se guarda sola." />
        </div>

        <section data-guia="barrido.ultima" aria-live="polite" className="vd-placa self-start rounded-[var(--radius-tarjeta,1rem)] p-4 sm:p-5">
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
      </div>

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

function estadoDeSubida(enCola: number, frenada: string | null): string {
  if (frenada) return "No se pudo guardar: mira el aviso";
  if (enCola === 0) return "Todo guardado";
  return enCola === 1 ? "Guardando 1…" : `Guardando ${enCola.toLocaleString("es-PE")}…`;
}
