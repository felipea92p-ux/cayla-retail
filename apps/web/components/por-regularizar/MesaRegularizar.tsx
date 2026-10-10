"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { firmar } from "@/lib/responsable-reglas";
import { useResponsable } from "@/lib/useResponsable";
import { indexarPrendas, modoDeMesa, textoDeDiferencia, diferenciaDe, type FormaRegularizar, type ModoDeMesa, type PrendaParaRegularizar } from "@/lib/por-regularizar-mesa";
import type { FilaPorRegularizar } from "@/lib/por-regularizar";
import { avisar } from "@/components/ui/Avisos";
import { Modal } from "@/components/ui/Modal";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { estaEscribiendo } from "@/components/alta-producto/useGuiaAlta";
import { TalonVenta } from "./TalonVenta";
import { PanelPrendas } from "./PanelPrendas";
import { PuenteUnion } from "./PuenteUnion";
import { HilosMesa } from "./HilosMesa";
import { ResumenResuelta, TodoCuadrado } from "./ResumenResuelta";
import { sedeCorta } from "./piezas";

/** Cuánto dura lo que pasa al guardar antes de releer la lista: las dos mitades del puente se juntan, cae el sello y el talón se pliega. */
const MS_AL_GUARDAR = 1700;

/**
 * La mesa de Ventas sin registrar (ADR-0360, maqueta A2 «Puente» elegida por Felipe el 2026-10-07).
 *
 *   tres columnas (≥ 1000 px)   talones · puente · prendas, con sus hilos; las dos de la derecha van pegadas a la ventana;
 *   dos columnas  (≥ 700 px)   talones a la izquierda y, a la derecha, las prendas y el puente;
 *   hoja          (< 700 px)   solo los talones; al tocar uno, las prendas y el puente suben en una hoja (`<Modal>`).
 *
 * El ancho es el de la caja de la mesa, no el de la ventana (el menú lateral le quita 260 px): por eso se mide, no se pregunta al CSS.
 *
 * LO QUE GUARDA ES LO MISMO DE SIEMPRE: `regularizar_prenda(p_id, p_variante_id, p_forma)`, firmada por el «Responsable» (ADR-0162). Nada de
 * stock ni de dinero cambió; la mesa solo ayuda a elegir y explica de antemano lo que la base va a hacer. Un clic en «Regularizar» no
 * puede repetirse (`guardando`), y la lista se relee DESPUÉS de la animación para que el talón alcance a plegarse.
 */
export function MesaRegularizar({
  filas,
  prendas,
  disponibles,
  variasSedes,
  esLider,
  ahora,
  elegidaAlAbrir = null,
  sinPendientes,
  etiquetaSede,
  soloPendientes = false,
  onReabrir,
  onCorregir,
  onHecha,
  vacio,
  pie,
}: {
  /** Las filas de la página actual, ya filtradas y ordenadas. */
  filas: FilaPorRegularizar[];
  prendas: PrendaParaRegularizar[];
  /** Unidades libres por tienda y por prenda (`getDisponiblePorSede`); una tienda que falta = no se pudo leer. */
  disponibles: Record<string, Record<string, number>>;
  variasSedes: boolean;
  esLider: boolean;
  ahora: Date;
  /** La venta que entra elegida (Historial llega con `?item=`). */
  elegidaAlAbrir?: string | null;
  /** No queda NINGUNA pendiente: a la derecha dice «Todo cuadrado». */
  sinPendientes: boolean;
  etiquetaSede: string;
  /** El filtro es «Pendientes»: el chip «Pendiente» de cada talón sobra. */
  soloPendientes?: boolean;
  onReabrir: (f: FilaPorRegularizar) => void;
  /** «Corregir lo anotado» (ADR-0369): la lista abre la hoja. */
  onCorregir: (f: FilaPorRegularizar) => void;
  /** Una venta se regularizó: la franja de arriba baja su cuenta sin esperar a que se relea la lista. */
  onHecha: (id: string) => void;
  /** Lo que se dice si no hay ninguna fila que mostrar. */
  vacio: ReactNode;
  /** Bajo la lista de talones (la paginación). */
  pie?: ReactNode;
}) {
  const router = useRouter();
  const raiz = useRef<HTMLDivElement>(null);
  const puenteRef = useRef<HTMLDivElement>(null);
  const [ancho, setAncho] = useState(1200);
  const [selId, setSelId] = useState<string | null>(elegidaAlAbrir);
  const [prendaId, setPrendaId] = useState<string | null>(null);
  const [forma, setForma] = useState<FormaRegularizar | null>(null);
  const [apuntadaId, setApuntadaId] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [saliendoId, setSaliendoId] = useState<string | null>(null);
  const [hojaAbierta, setHojaAbierta] = useState(false);
  const temporizador = useRef<number | undefined>(undefined);
  // A dónde vuelve el foco al cerrar la hoja del celular: el talón con que se abrió (si no, cae al body y el teclado se pierde).
  const retornoFoco = useRef<HTMLElement | null>(null);
  const responsable = useResponsable();

  // El ancho de la caja de la mesa, medido antes de pintar (sin parpadeo) y cada vez que cambia.
  useLayoutEffect(() => {
    const el = raiz.current;
    if (!el) return;
    const medir = () => setAncho(el.getBoundingClientRect().width);
    medir();
    if (typeof ResizeObserver === "undefined") return;
    const o = new ResizeObserver(medir);
    o.observe(el);
    return () => o.disconnect();
  }, []);
  useEffect(() => () => window.clearTimeout(temporizador.current), []);
  const modo: ModoDeMesa = modoDeMesa(ancho);

  // La venta elegida: la que se tocó o, si no hay (o ya no está en la lista), la primera —salvo en la hoja del celular, donde nada se
  // abre solo—. Es un valor DERIVADO: al cambiar la venta elegida, la prenda y «cómo estaba» vuelven a empezar (ajuste durante el render).
  const tocada = selId !== null && filas.some((f) => f.id === selId) ? selId : null;
  const efectivaId = tocada ?? (modo === "hoja" ? null : (filas[0]?.id ?? null));
  const [previaId, setPreviaId] = useState<string | null>(efectivaId);
  if (previaId !== efectivaId) {
    setPreviaId(efectivaId);
    setPrendaId(null);
    setForma(null);
    setApuntadaId(null);
  }
  const sel = filas.find((f) => f.id === efectivaId) ?? null;
  const pendiente = sel?.estado === "pendiente";

  const indice = useMemo(() => indexarPrendas(prendas), [prendas]);
  const mapas = useMemo(() => Object.fromEntries(Object.entries(disponibles).map(([u, o]) => [u, new Map(Object.entries(o))])), [disponibles]);
  const disponibleDeSede = sel ? (mapas[sel.ubicacionId] ?? null) : null;
  const prenda = prendaId ? (prendas.find((p) => p.id === prendaId) ?? null) : null;
  const unidadesDeLaPrenda = prenda && disponibleDeSede ? (disponibleDeSede.get(prenda.id) ?? 0) : null;
  const hecho = sel !== null && saliendoId === sel.id;

  // La guía de foco (CLAUDE.md «Guía de foco», ADR-0284): lo que falta sale de lo que ya bloquea el botón, nada más.
  const guia = useGuiaCampos(
    [
      { id: "prenda", nombre: "La prenda", requerido: true, hecho: prendaId !== null, pendiente: "Elige qué prenda es." },
      { id: "forma", nombre: "Cómo estaba", requerido: true, hecho: forma !== null, pendiente: "Elige cómo estaba en el sistema." },
      { id: "responsable", nombre: "Responsable", requerido: true, hecho: responsable.listo, pendiente: "Elige quién lo hace." },
    ],
    { enModal: modo === "hoja" },
  );

  function elegirVenta(id: string) {
    if (guardando || saliendoId) return;
    setSelId(id);
    if (modo === "hoja") {
      retornoFoco.current = raiz.current?.querySelector<HTMLElement>(`[data-vsr-talon="${CSS.escape(id)}"]`) ?? null;
      setHojaAbierta(true);
    }
  }

  // Una sola parada de Tab para toda la lista de talones (hasta 25 por página): la de la venta elegida. Entre talones se va con ↑ ↓, Inicio y Fin
  // (se mueve el foco; elegir es Enter o Espacio, que en la hoja del celular abre la hoja).
  function flechasDeLaLista(e: KeyboardEvent<HTMLDivElement>) {
    const teclas: Record<string, number> = { ArrowDown: 1, ArrowUp: -1, Home: -Infinity, End: Infinity };
    const paso = teclas[e.key];
    if (paso === undefined || !(e.target instanceof HTMLElement) || !e.target.matches("[data-vsr-talon]")) return;
    const talones = [...e.currentTarget.querySelectorAll<HTMLElement>("[data-vsr-talon]")];
    const i = talones.indexOf(e.target);
    const destino = talones[Math.max(0, Math.min(talones.length - 1, Number.isFinite(paso) ? i + paso : paso < 0 ? 0 : talones.length - 1))];
    if (destino && destino !== e.target) {
      e.preventDefault();
      destino.focus();
      destino.scrollIntoView({ block: "nearest" });
    }
  }

  function elegirPrenda(id: string) {
    if (guardando || saliendoId) return;
    setPrendaId(id);
    setForma(null);
    traerElBotonALaVista();
  }

  // Lo que sigue (cómo estaba y el botón «Regularizar») queda fuera de vista si la ventana es baja o el puente va debajo de las prendas: se trae
  // con suavidad, y otra vez al elegir «cómo estaba» (el puente crece con su línea de «Unidades libres: 15 → 14»). Nunca mientras se teclea (la búsqueda de
  // prendas elige con Enter): la página no se mueve bajo quien escribe.
  function traerElBotonALaVista() {
    if (estaEscribiendo()) return;
    requestAnimationFrame(() => requestAnimationFrame(() => raiz.current?.querySelector(".vsr-pu-fin")?.scrollIntoView({ block: "nearest", behavior: "smooth" })));
  }

  function elegirForma(f: FormaRegularizar) {
    setForma(f);
    traerElBotonALaVista();
  }

  async function guardar() {
    if (!sel || !prenda || !forma || !responsable.listo || guardando || saliendoId) return;
    setGuardando(true);
    const { data, error } = await firmar(createClient().rpc("regularizar_prenda", { p_id: sel.id, p_variante_id: prenda.id, p_forma: forma }), responsable.firma());
    setGuardando(false);
    responsable.despues(error);
    if (error) {
      // Otra persona ganó la misma venta: la base no hizo nada (protege), pero esta pantalla seguía mostrándola pendiente. Se relee sola.
      if (`${error.message ?? ""}`.includes("prenda_ya_regularizada")) {
        avisar.error("Otra persona ya regularizó esta venta (o se anuló).", { detalle: "Actualizamos la lista para que veas cómo quedó." });
        setPrendaId(null);
        setForma(null);
        router.refresh();
        return;
      }
      avisar.error(traducirError(error, "regularizar la prenda"));
      return;
    }
    avisar.exito("Prenda regularizada", { detalle: `${sel.descripcion} → ${prenda.nombre}. ${textoDeDiferencia(Number(data ?? diferenciaDe(sel, prenda)))}.` });
    setSaliendoId(sel.id);
    onHecha(sel.id);
    if (modo === "hoja") setHojaAbierta(false);
    // La siguiente venta por identificar: la que sigue en la lista (o la primera, si era la última).
    const i = filas.findIndex((f) => f.id === sel.id);
    const siguiente = [...filas.slice(i + 1), ...filas.slice(0, i)].find((f) => f.estado === "pendiente");
    temporizador.current = window.setTimeout(() => {
      setSaliendoId(null);
      setSelId(siguiente?.id ?? null);
      router.refresh();
    }, MS_AL_GUARDAR);
  }

  // En el celular la mesa vive en una hoja: se cierra antes de abrir la de corregir (dos hojas apiladas no se entienden).
  function abrirCorreccion(f: FilaPorRegularizar) {
    if (modo === "hoja") setHojaAbierta(false);
    onCorregir(f);
  }

  const panelPrendas = sel && pendiente && (
    <PanelPrendas key={sel.id} venta={sel} prendas={prendas} indice={indice} disponible={disponibleDeSede} sede={sedeCorta(sel.sede)} seleccionadaId={prendaId} guia={guia} onElegir={elegirPrenda} onApuntar={setApuntadaId} />
  );
  const puente = sel && pendiente && (
    <div className="vsr-puente" ref={puenteRef}>
      <PuenteUnion venta={sel} prenda={prenda} disponible={unidadesDeLaPrenda} forma={forma} onForma={elegirForma} responsable={responsable} guia={guia} guardando={guardando} hecho={hecho} onGuardar={() => void guardar()} onCorregir={() => abrirCorreccion(sel)} alCrecer={traerElBotonALaVista} />
    </div>
  );
  const derecha = !sel ? (
    sinPendientes ? (
      <TodoCuadrado sede={etiquetaSede} />
    ) : null
  ) : !pendiente ? (
    <ResumenResuelta fila={sel} esLider={esLider} onReabrir={onReabrir} onCorregir={onCorregir} />
  ) : modo === "tres" ? (
    <>
      {puente}
      {panelPrendas}
    </>
  ) : modo === "dos" ? (
    <>
      {panelPrendas}
      {puente}
    </>
  ) : null;

  return (
    <div ref={raiz} className="vsr-mesa" data-modo={modo}>
      <HilosMesa raiz={raiz} activo={modo === "tres" && pendiente === true} ventaId={sel?.id ?? null} prendaId={prendaId} apuntadaId={apuntadaId} hecho={hecho} />
      <div className="vsr-col-t">
        {filas.length === 0 ? (
          <div className="vsr-vacio">{vacio}</div>
        ) : (
          <div className="vsr-lista" onKeyDown={flechasDeLaLista}>
            {filas.map((f, i) => (
              <TalonVenta key={f.id} fila={f} ahora={ahora} seleccionado={f.id === efectivaId && modo !== "hoja"} saliendo={f.id === saliendoId} indice={i} variasSedes={variasSedes} tabIndex={f.id === (efectivaId ?? filas[0]?.id) ? 0 : -1} sinChipPendiente={soloPendientes} onElegir={elegirVenta} />
            ))}
          </div>
        )}
        {pie}
      </div>
      {modo !== "hoja" && <div className="vsr-der">{derecha}</div>}
      {modo === "hoja" && hojaAbierta && sel && pendiente && (
        <Modal titulo="Regularizar prenda" subtitulo={`${sel.descripcion} · cobrada a S/ ${sel.precioCobrado.toFixed(2)}`} onClose={() => setHojaAbierta(false)} ancho="max-w-lg" bloqueado={guardando} alCerrarEnfocar={retornoFoco}>
          <div className="vsr-hoja">
            {panelPrendas}
            {puente}
          </div>
        </Modal>
      )}
    </div>
  );
}
