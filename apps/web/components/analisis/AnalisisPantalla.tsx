"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent, type RefObject } from "react";
import { createPortal } from "react-dom";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { Pestanas, type Pestana } from "@/components/ui/Pestanas";
import { PedirAOtraSedeModal } from "@/components/PedirAOtraSedeModal";
import { avisar } from "@/components/ui/Avisos";
import { Contexto, type ContextoAnalisis, type FiltroAcaba } from "@/components/analisis/contexto";
import { Icono } from "@/components/analisis/iconos";
import { ChipEstado } from "@/components/analisis/piezas";
import { HoyTodaviaNo, VistaTodaviaNo } from "@/components/analisis/TodaviaNo";
import { HojaConfianza } from "@/components/analisis/HojaConfianza";
import { FichaPrenda } from "@/components/analisis/FichaPrenda";
import { PestanaHoy } from "@/components/analisis/PestanaHoy";
import { PestanaAcaba } from "@/components/analisis/PestanaAcaba";
import { PestanaQuieta } from "@/components/analisis/PestanaQuieta";
import { PestanaPedir } from "@/components/analisis/PestanaPedir";
import type { AccesoAnalisis, DatosAnalisis, PrendaAnalisis, VistaAnalisis } from "@/lib/analisis-tipos";
import { coincideBusqueda, GRUPOS_ACABA, GRUPOS_QUIETAS, prendasDe } from "@/lib/analisis-reglas";
import { lineasParaPedir } from "@/lib/analisis-acciones";

// Análisis v4 (ADR-0357): la pantalla. Cabecera con el buscador → cuatro pestañas (Hoy · Se está acabando · No se vende · Qué
// pedir) con el chip de confianza del dato → la pestaña. Cuando la tienda no cumple las tres condiciones del motor (ADR-0346),
// cada pestaña dice «Todavía no» y qué falta. La ficha de cada prenda y la hoja de confianza son hojas del componente Modal (ADR-0136).
//
// Movimiento (ADR-0136, excepción de Análisis): al entrar a una pestaña, sus piezas suben en cascada, las barras crecen, las
// perchas y los puntos asoman y las cifras cuentan, UNA vez; con «reducir movimiento», nada se mueve.

const PESTANAS: { clave: VistaAnalisis; texto: string }[] = [
  { clave: "hoy", texto: "Hoy" },
  { clave: "acaba", texto: "Se está acabando" },
  { clave: "nose", texto: "No se vende" },
  { clave: "pedir", texto: "Qué pedir" },
];

/** Las marcas de los gráficos que encienden su prenda en toda la pantalla (no las filas: esas abren la ficha). */
const MARCA = "[data-ps]:not(.c-fila):not(.rank-f):not(.modelo)";

const reducido = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function AnalisisPantalla({ datos, acceso, vistaInicial }: { datos: DatosAnalisis; acceso: AccesoAnalisis; vistaInicial: VistaAnalisis }) {
  const router = useRouter();
  const [vista, setVista] = useState<VistaAnalisis>(vistaInicial);
  const [q, setQ] = useState("");
  const [liquidarDesde, setLiquidarDesde] = useState(datos.liquidarDesde);
  const [filtroAcaba, setFiltroAcaba] = useState<FiltroAcaba>("todos");
  const [categoria, setCategoria] = useState<string | null>(null);
  const [fichaId, setFichaId] = useState<string | null>(null);
  const [confianza, setConfianza] = useState(false);
  const [pedido, setPedido] = useState<{ origen: { id: string; nombre: string }; lineas: ReturnType<typeof lineasParaPedir> } | null>(null);
  // Cada cambio de pestaña vuelve a montar su contenido y lo anima una vez.
  const [vuelta, setVuelta] = useState(0);
  const [animar, setAnimar] = useState(true);
  const [foco, setFoco] = useState<string | null>(null);
  const raiz = useRef<HTMLDivElement>(null);

  // Si el servidor trae otro «Liquidar desde» (lo guardó alguien), se toma (ajuste durante el render, sin efecto).
  const [liquidarLeido, setLiquidarLeido] = useState(datos.liquidarDesde);
  if (liquidarLeido !== datos.liquidarDesde) {
    setLiquidarLeido(datos.liquidarDesde);
    setLiquidarDesde(datos.liquidarDesde);
  }

  const prendas = useMemo(() => (q.trim() ? datos.prendas.filter((p) => coincideBusqueda(p, q)) : datos.prendas), [datos.prendas, q]);

  const apagarResaltado = useCallback(() => {
    raiz.current?.classList.remove("atenuar");
    raiz.current?.querySelectorAll(".hl").forEach((n) => n.classList.remove("hl"));
    document.querySelector(".an-tip")?.classList.remove("ver");
  }, []);

  const abrirFicha = useCallback(
    (varianteId: string) => {
      apagarResaltado();
      setFichaId(varianteId);
    },
    [apagarResaltado],
  );

  const irA = useCallback((v: VistaAnalisis, opciones?: { foco?: string }) => {
    apagarResaltado();
    setFichaId(null);
    setVista(v);
    setCategoria(null);
    setVuelta((n) => n + 1);
    setAnimar(true);
    setFoco(opciones?.foco ?? null);
    const url = new URL(window.location.href);
    if (v === "hoy") url.searchParams.delete("vista");
    else url.searchParams.set("vista", v);
    window.history.replaceState(window.history.state, "", url);
    if (!opciones?.foco) raiz.current?.scrollIntoView({ block: "start", behavior: reducido() ? "auto" : "smooth" });
  }, [apagarResaltado]);

  const pedir = useCallback(
    (marcadas: readonly PrendaAnalisis[], origenId: string) => {
      const origen = datos.sedes.find((s) => s.id === origenId);
      const lineas = lineasParaPedir(marcadas, origenId);
      if (!origen || lineas.length === 0) return;
      setFichaId(null);
      setPedido({ origen: { id: origen.id, nombre: origen.nombre }, lineas });
    },
    [datos.sedes],
  );

  const contexto: ContextoAnalisis = useMemo(
    () => ({
      datos,
      acceso,
      prendas,
      q,
      liquidarDesde,
      setLiquidarDesde,
      filtroAcaba,
      setFiltroAcaba,
      categoria,
      setCategoria,
      sedeDe: (id: string) => datos.sedes.find((s) => s.id === id),
      abrirFicha,
      irA,
      pedir,
    }),
    [datos, acceso, prendas, q, liquidarDesde, filtroAcaba, categoria, abrirFicha, irA, pedir],
  );

  // La animación de entrada dura lo que dura; después, lo que cambie (un filtro, el umbral) aparece sin volver a animarse.
  useEffect(() => {
    if (!animar) return;
    const t = window.setTimeout(() => setAnimar(false), 2000);
    return () => window.clearTimeout(t);
  }, [animar, vuelta]);

  // Las cifras que cuentan de 0 a su valor, una vez por pestaña.
  useEffect(() => {
    if (reducido() || !raiz.current) return;
    const marcos: number[] = [];
    raiz.current.querySelectorAll<HTMLElement>(".vista [data-cuenta]").forEach((el) => {
      const fin = Number(el.dataset.cuenta);
      if (!Number.isFinite(fin)) return;
      const t0 = performance.now();
      const paso = (t: number) => {
        const k = Math.min(1, (t - t0) / 700);
        el.textContent = String(Math.round(fin * (1 - Math.pow(1 - k, 3))));
        if (k < 1) marcos.push(requestAnimationFrame(paso));
      };
      el.textContent = "0";
      marcos.push(requestAnimationFrame(paso));
    });
    return () => marcos.forEach(cancelAnimationFrame);
  }, [vuelta, vista]);

  // Ir a un grupo del carril desde Hoy: se deja a la vista y destella una vez.
  useEffect(() => {
    if (!foco || !raiz.current) return;
    const el = raiz.current.querySelector<HTMLElement>(`[data-grupo="${CSS.escape(foco)}"]`);
    setFoco(null);
    if (!el) return;
    el.scrollIntoView({ block: "center", behavior: reducido() ? "auto" : "smooth" });
    el.classList.add("destello");
    const t = window.setTimeout(() => el.classList.remove("destello"), 1200);
    return () => window.clearTimeout(t);
  }, [foco, vuelta]);

  // Las teclas: Enter o espacio sobre algo que se toca como botón (`role="button"`) lo activa.
  const alTeclear = (e: KeyboardEvent<HTMLDivElement>) => {
    const t = e.target as HTMLElement;
    if ((e.key === "Enter" || e.key === " ") && t.matches('[role="button"][tabindex]') && !e.defaultPrevented) {
      e.preventDefault();
      t.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    }
  };

  const cuentaAcaba = datos.puedeHablar ? prendasDe(datos.prendas, GRUPOS_ACABA, liquidarDesde).length : null;
  const cuentaQuietas = datos.puedeHablar ? prendasDe(datos.prendas, GRUPOS_QUIETAS, liquidarDesde).length : null;

  let contenido;
  if (!datos.puedeHablar) contenido = vista === "hoy" ? <HoyTodaviaNo /> : <VistaTodaviaNo />;
  else if (vista === "hoy") contenido = <PestanaHoy />;
  else if (vista === "acaba") contenido = <PestanaAcaba />;
  else if (vista === "nose") contenido = <PestanaQuieta />;
  else contenido = <PestanaPedir />;

  return (
    <Contexto.Provider value={contexto}>
      <div ref={raiz} className="analisis" onKeyDown={alTeclear}>
        <EncabezadoPagina sede={datos.sede.nombre} titulo="Análisis" subtitulo="Qué se acaba, qué no se mueve y qué pedir.">
          <label className="buscar">
            <Icono nombre="lupa" />
            <input type="search" placeholder="Busca una prenda" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" aria-label="Busca una prenda" />
          </label>
        </EncabezadoPagina>

        <FilaPestanas vista={vista} irA={irA} cuentaAcaba={cuentaAcaba} cuentaQuietas={cuentaQuietas} puedeHablar={datos.puedeHablar} onConfianza={() => setConfianza(true)} />

        {datos.fallas.length > 0 && (
          <p className="nota-cayla mt-4" role="status">
            {datos.fallas.join(". ")}. Lo demás está al día.
          </p>
        )}

        <div key={`${vista}-${vuelta}`} className={`vista ${animar ? "anim" : ""}`} role="tabpanel" aria-label={PESTANAS.find((p) => p.clave === vista)?.texto}>
          {contenido}
        </div>
      </div>

      <TipDeLaPantalla raiz={raiz} />

      {fichaId && <FichaPrenda varianteId={fichaId} onCerrar={() => setFichaId(null)} />}
      {confianza && <HojaConfianza onCerrar={() => setConfianza(false)} />}
      {pedido && (
        <PedirAOtraSedeModal
          abierto
          ubicacionId={datos.sede.id}
          origen={pedido.origen}
          lineas={pedido.lineas}
          onCerrar={() => setPedido(null)}
          onPedido={() => {
            setPedido(null);
            avisar.exito(`Se lo pediste a ${pedido.origen.nombre}`);
            router.refresh();
          }}
        />
      )}
    </Contexto.Provider>
  );
}

// Las cuatro preguntas son pestañas de vista (cambian de sección): la pieza única del ERP, el vidrio en mayúsculas (ADR-0358,
// Felipe 2026-10-07: «incluye lo de Análisis»). La vista es estado de la pantalla, no URL: `tablist` con flechas.
function FilaPestanas({
  vista,
  irA,
  cuentaAcaba,
  cuentaQuietas,
  puedeHablar,
  onConfianza,
}: {
  vista: VistaAnalisis;
  irA: (v: VistaAnalisis) => void;
  cuentaAcaba: number | null;
  cuentaQuietas: number | null;
  puedeHablar: boolean;
  onConfianza: () => void;
}) {
  const items: Pestana[] = PESTANAS.map((p) => {
    // «Se está acabando» con prendas avisa (rojo, como antes); «No se vende» solo informa. Sin datos, «—».
    // El texto para lector va solo con un número: «— se están acabando» no dice nada.
    if (p.clave === "acaba") return { clave: p.clave, etiqueta: p.texto, conteo: cuentaAcaba ?? "—", pide: cuentaAcaba == null ? undefined : "se están acabando", tono: cuentaAcaba ? "rojo" : "neutro" };
    if (p.clave === "nose") return { clave: p.clave, etiqueta: p.texto, conteo: cuentaQuietas ?? "—", pide: cuentaQuietas == null ? undefined : "no se venden", tono: "neutro" };
    return { clave: p.clave, etiqueta: p.texto };
  });

  return (
    <div className="tabs-fila">
      <Pestanas items={items} activa={vista} etiquetaAccesible="Preguntas de Análisis" onCambio={(c) => irA(c as VistaAnalisis)} idIndicador="analisis" />
      {puedeHablar ? (
        <ChipEstado est="bien" onClick={onConfianza} tip="14 días cobrando con la prenda · piso cuadrado · almacén contado">
          Datos confiables
        </ChipEstado>
      ) : (
        <ChipEstado est="nd" onClick={onConfianza} tip="Todavía no se cumplen las 3 condiciones para recomendar">
          Datos incompletos
        </ChipEstado>
      )}
    </div>
  );
}

const sinSuscripcion = () => () => {};

/**
 * El tooltip de la pantalla (uno solo, como en la maqueta): sale al pasar el mouse, al enfocar con el teclado y al tocar un «?»
 * (nunca solo con el mouse: ADR-0350, ley 6). Lee `data-tip` (texto) o el `TipRico` oculto de adentro (una lista de prendas).
 * Pasar por una marca de un gráfico enciende la misma prenda en toda la pantalla y apaga el resto (`data-ps`).
 */
function TipDeLaPantalla({ raiz }: { raiz: RefObject<HTMLDivElement | null> }) {
  const tip = useRef<HTMLDivElement>(null);
  // En el servidor (y al hidratar) no hay `document`: el tooltip se monta recién en el navegador.
  const montado = useSyncExternalStore(sinSuscripcion, () => true, () => false);

  useEffect(() => {
    const r = raiz.current;
    const t = tip.current;
    if (!r || !t || !montado) return;
    const conTip = (el: EventTarget | null) => (el instanceof Element ? el.closest<HTMLElement>("[data-tip],:has(> .tip-rico)") : null);
    const ver = (el: HTMLElement) => {
      const rico = el.querySelector<HTMLElement>(":scope > .tip-rico");
      if (rico) t.innerHTML = rico.innerHTML;
      else if (el.dataset.tip) t.textContent = el.dataset.tip;
      else return;
      t.classList.add("ver");
      const b = el.getBoundingClientRect();
      const w = t.offsetWidth;
      const h = t.offsetHeight;
      const x = Math.max(8, Math.min(b.left + b.width / 2 - w / 2, window.innerWidth - w - 8));
      let y = b.top - h - 8;
      if (y < 8) y = b.bottom + 8;
      t.style.left = `${x}px`;
      t.style.top = `${y}px`;
    };
    const ocultar = () => t.classList.remove("ver");
    const resaltar = (el: HTMLElement) => {
      const ids = (el.dataset.ps ?? "").split(" ").filter(Boolean);
      if (ids.length === 0) return;
      r.classList.add("atenuar");
      r.querySelectorAll<HTMLElement>("[data-ps]").forEach((n) => n.classList.toggle("hl", (n.dataset.ps ?? "").split(" ").some((m) => ids.includes(m))));
    };
    const apagar = () => {
      r.classList.remove("atenuar");
      r.querySelectorAll(".hl").forEach((n) => n.classList.remove("hl"));
    };
    const sobre = (e: Event) => {
      const el = conTip(e.target);
      if (el && r.contains(el)) ver(el);
      const m = e.target instanceof Element ? e.target.closest<HTMLElement>(MARCA) : null;
      if (m && r.contains(m)) resaltar(m);
    };
    const fuera = (e: Event) => {
      if (conTip(e.target)) ocultar();
      if (e.target instanceof Element && e.target.closest(MARCA)) apagar();
    };
    // Tocar un «?» lo muestra (en una pantalla táctil no hay «pasar el mouse»).
    const toque = (e: Event) => {
      const el = e.target instanceof Element ? e.target.closest<HTMLElement>(".ayuda") : null;
      if (el && r.contains(el)) ver(el);
    };
    r.addEventListener("mouseover", sobre);
    r.addEventListener("mouseout", fuera);
    r.addEventListener("focusin", sobre);
    const salir = () => {
      ocultar();
      apagar();
    };
    r.addEventListener("focusout", salir);
    r.addEventListener("click", toque);
    window.addEventListener("scroll", ocultar, { passive: true });
    return () => {
      r.removeEventListener("mouseover", sobre);
      r.removeEventListener("mouseout", fuera);
      r.removeEventListener("focusin", sobre);
      r.removeEventListener("focusout", salir);
      r.removeEventListener("click", toque);
      window.removeEventListener("scroll", ocultar);
    };
  }, [raiz, montado]);

  if (!montado) return null;
  return createPortal(<div ref={tip} className="an-tip" role="tooltip" />, document.body);
}
