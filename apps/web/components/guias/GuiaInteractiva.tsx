"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Boton } from "@/components/ui/campos";
import { Volver } from "@/components/ui/Volver";
import { esperaPorAncla, pasoAplica, posicionTarjeta, recorteDe, totalEstimado, type Caja } from "@/lib/guias/reglas";
import type { AccionGuia, Guia, PasoGuia } from "@/lib/guias/tipos";
import { anclasPresentes, ejecutar, esEscapeDelPiloto, esperarAncla, pausa } from "./piloto";

// El motor de una guía interactiva (ADR-0389): oscurece la pantalla, deja a la vista solo la pieza que se explica y la
// recorre paso a paso con una tarjeta. El piloto automático (`piloto.ts`) abre, escribe un ejemplo y elige, pero NUNCA
// guarda: si un paso le pide tocar algo que escribe, lo explica sin tocarlo. Al salir deja la pantalla como estaba.
//
// Por qué no una librería de tours: el velo, la tarjeta y su movimiento tienen que salir de los tokens (ADR-0169, ADR-0336) y
// moverse como el resto del ERP (ADR-0136), y la regla «nunca guardar» vive en el motor. Son ~300 líneas propias.

export type FinDeGuia = "completa" | "salio";

type Mostrando = {
  indice: number;
  paso: PasoGuia;
  /** El recorte en la pantalla, o null si la tarjeta va al centro. */
  recorte: Caja | null;
  /** Lo que el piloto no hizo y por qué (se explica en la tarjeta en vez de tocarlo). */
  nota: string | null;
};

const prefiereQuieto = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function GuiaInteractiva({ guia, onTerminar }: { guia: Guia; onTerminar: (fin: FinDeGuia) => void }) {
  const [mostrando, setMostrando] = useState<Mostrando | null>(null);
  const [ocupada, setOcupada] = useState(true);
  const [ventana, setVentana] = useState({ ancho: 1280, alto: 800 });
  const [total, setTotal] = useState(guia.pasos.length);
  /** Cuántos pasos lleva vistos (el historial, como estado para dibujarlo). */
  const [enCurso, setEnCurso] = useState(0);
  /** El piloto está haciendo algo a la vista («demostrar»): la tarjeta lo marca (`data-piloto`) y el recorredor lo espera. */
  const [pilotoActuando, setPilotoActuando] = useState(false);
  /** El cursor fantasma: viaja a la pieza que el piloto va a tocar y «hace clic» con una onda (ADR-0389, act. 2026-10-07). */
  const [cursor, setCursor] = useState<{ x: number; y: number; visible: boolean; instante: boolean; pulso: number; escribe: boolean }>({
    x: 0,
    y: 0,
    visible: false,
    instante: true,
    pulso: 0,
    escribe: false,
  });
  const ocultarCursor = useRef<ReturnType<typeof setTimeout> | null>(null);
  const historial = useRef<number[]>([]);
  const control = useRef<AbortController | null>(null);
  const capa = useRef<HTMLDivElement>(null);
  const refTarjeta = useRef<HTMLDivElement>(null);
  const elementoActual = useRef<HTMLElement | null>(null);
  const ultimoRescate = useRef(0);
  /** La guía está desplazando la pantalla hacia la pieza: el rescate no debe pelear con ese desplazamiento. */
  const desplazando = useRef(false);
  const dialogosAlEmpezar = useRef(0);
  const terminada = useRef(false);
  // El aviso de fin va por ref: si la pantalla de abajo se redibuja y `onTerminar` cambia de identidad, la guía NO debe
  // volver a empezar (el arranque depende de `irA`, que depende de `terminar`).
  const avisarFin = useRef(onTerminar);
  useEffect(() => {
    avisarFin.current = onTerminar;
  }, [onTerminar]);

  /**
   * Dónde está la pieza AHORA (se pregunta en cada cuadro). No toca el estado de React: antes cada cuadro de un desplazamiento
   * redibujaba la guía entera y el anillo reiniciaba su transición, y el foco avanzaba a saltos.
   */
  const medirMeta = useCallback((v: { ancho: number; alto: number }): Caja | null | undefined => {
    const el = elementoActual.current;
    if (!el || !el.isConnected) return undefined; // sin pieza viva: se queda donde estaba
    const r = el.getBoundingClientRect();
    const nuevo = recorteDe({ top: r.top, left: r.left, width: r.width, height: r.height }, v);
    // La pantalla se movió sola y dejó la pieza fuera de la vista (el Observatorio se desplaza al mapa al acercarse a una tienda):
    // la guía la trae de vuelta, como mucho una vez cada 700 ms para no pelear con un desplazamiento que todavía está en curso.
    if ((nuevo.height < 4 || nuevo.width < 4) && r.height > 0 && !desplazando.current && performance.now() - ultimoRescate.current > 700) {
      ultimoRescate.current = performance.now();
      el.scrollIntoView({ block: r.height > v.alto * 0.6 ? "start" : "center", inline: "nearest", behavior: prefiereQuieto() ? "auto" : "smooth" });
    }
    return nuevo;
  }, []);

  /** Lleva el cursor fantasma hasta la pieza y marca el clic. Arranca desde el botón «Siguiente» de la tarjeta si estaba oculto. */
  const apuntar = useCallback(async (el: HTMLElement, modo: "clic" | "escribir") => {
    if (ocultarCursor.current) clearTimeout(ocultarCursor.current);
    const r = el.getBoundingClientRect();
    const destino =
      modo === "escribir"
        ? { x: r.left + Math.min(28, r.width / 2), y: r.top + r.height / 2 }
        : { x: r.left + Math.min(r.width / 2, 64), y: r.top + Math.min(r.height / 2, 28) };
    const salida = refTarjeta.current?.querySelector<HTMLElement>("[data-guia-siguiente]")?.getBoundingClientRect();
    setCursor((c) => (c.visible ? c : { ...c, x: salida ? salida.left + salida.width / 2 : window.innerWidth / 2, y: salida ? salida.top + salida.height / 2 : window.innerHeight / 2, visible: true, instante: true }));
    await pausa(30);
    setCursor((c) => ({ ...c, ...destino, visible: true, instante: false, escribe: modo === "escribir" }));
    await pausa(720);
    if (modo === "clic") {
      setCursor((c) => ({ ...c, pulso: c.pulso + 1 }));
      await pausa(240);
    }
    ocultarCursor.current = setTimeout(() => setCursor((c) => ({ ...c, visible: false, escribe: false })), modo === "escribir" ? 2200 : 900);
  }, []);

  const terminar = useCallback(
    async (fin: FinDeGuia) => {
      if (terminada.current) return;
      terminada.current = true;
      control.current?.abort();
      // Dejar la pantalla como estaba: lo que la guía declara, y después cerrar los modales que abrió.
      for (const a of guia.alSalir ?? []) await ejecutar(a, undefined, false);
      for (let intento = 0; intento < 4 && modalesAbiertos() > dialogosAlEmpezar.current; intento++) {
        await ejecutar({ tipo: "escape" }, undefined, false);
      }
      avisarFin.current(fin);
    },
    [guia],
  );

  /** Muestra el paso `i` (o el siguiente que aplique, en la dirección pedida). */
  const irA = useCallback(
    async (i: number, direccion: 1 | -1) => {
      control.current?.abort();
      const ac = new AbortController();
      control.current = ac;
      const senal = ac.signal;
      const conMovimiento = !prefiereQuieto();
      setOcupada(true);

      // Hacia atrás: primero se cierra lo que la guía abrió después (el paso anterior lo vuelve a abrir si lo necesita).
      if (direccion === -1) {
        for (let n = 0; n < 4 && modalesAbiertos() > dialogosAlEmpezar.current; n++) await ejecutar({ tipo: "escape" }, senal, conMovimiento);
        if (senal.aborted) return;
      }

      let indice = i;
      while (indice >= 0 && indice < guia.pasos.length) {
        const paso = guia.pasos[indice]!;
        // Un paso de otro ancho (`solo`) se salta ANTES de preparar: si no, tocaba cosas en el ancho que no le corresponde.
        if (paso.solo && !pasoAplica({ ...paso, requiere: undefined, excluye: undefined }, new Set(), window.innerWidth)) {
          indice += direccion;
          continue;
        }
        // Antes de preguntar si aplica, se prepara (abrir el modal donde vive), en las dos direcciones.
        let nota: string | null = null;
        if (paso.preparar && !(paso.prepararSoloAlAvanzar && direccion === -1)) {
          for (const a of paso.preparar) {
            const r = await ejecutar(a, senal, conMovimiento, apuntar);
            if (senal.aborted) return;
            // Solo un toque que no se pudo hacer merece aviso. Vaciar o cerrar algo que no está (en el celular no hay buscador)
            // es una limpieza que no tenía nada que limpiar.
            if (!r.ok && a.tipo === "clic") nota = notaDe(a, r.motivo);
          }
        }
        if (!pasoAplica(paso, anclasPresentes(), window.innerWidth)) {
          indice += direccion;
          continue;
        }
        let el: HTMLElement | null = null;
        if (paso.ancla) {
          el = await esperarAncla(paso.ancla, esperaPorAncla(paso, indice > 0 ? guia.pasos[indice - 1]! : null), senal);
          if (senal.aborted) return;
          if (!el && paso.opcional) {
            indice += direccion;
            continue;
          }
          if (!el) nota = nota ?? "Esta parte no está a la vista ahora (depende de cómo esté la pantalla). Te contamos qué hace igual.";
        }
        elementoActual.current = el;
        if (el && !aLaVista(el)) {
          // Solo se desplaza si la pieza no se ve entera: mover la pantalla sin necesidad desorienta.
          // El velo ya la sigue mientras la pantalla se desplaza; la tarjeta cambia de texto cuando la pieza llegó y se quedó
          // quieta. Antes se cortaba a los 320 ms y, si el desplazamiento suave seguía, saltaba de golpe: el «entrecortado».
          desplazando.current = true;
          el.scrollIntoView({ block: el.getBoundingClientRect().height > window.innerHeight * 0.6 ? "start" : "center", inline: "nearest", behavior: conMovimiento ? "smooth" : "auto" });
          if (conMovimiento) await hastaQueQuieta(el, senal, 1200);
          desplazando.current = false;
          if (senal.aborted) return;
          // Respaldo: si el desplazamiento suave no llegó (pestaña en segundo plano, otro scroll en curso), salta directo.
          if (!aLaVista(el) && el.getBoundingClientRect().height < window.innerHeight) el.scrollIntoView({ block: "center", inline: "nearest" });
        }
        const v = { ancho: window.innerWidth, alto: window.innerHeight };
        const r = el?.getBoundingClientRect();
        if (direccion === 1) historial.current.push(indice);
        else {
          while (historial.current.length > 0 && historial.current[historial.current.length - 1]! > indice) historial.current.pop();
          if (historial.current[historial.current.length - 1] !== indice) historial.current.push(indice);
        }
        // El total cuenta lo que aplica hoy; nunca menos que el paso en que vamos.
        // El total se estima UNA vez, con la pantalla quieta del primer paso; después solo sube si aparecen más pasos de los
        // previstos. Recalcularlo a mitad de camino (con un modal cerrándose) lo hacía saltar de 17 a 11 y de vuelta.
        const enEsteMomento = historial.current.length;
        if (enEsteMomento === 1 && direccion === 1) setTotal(1 + totalEstimado(guia.pasos.slice(indice + 1), anclasPresentes(), v.ancho));
        else setTotal((t) => Math.max(t, enEsteMomento));
        setEnCurso(historial.current.length);
        setVentana(v);
        setMostrando({ indice, paso, recorte: r ? recorteDe({ top: r.top, left: r.left, width: r.width, height: r.height }, v) : null, nota });
        setOcupada(false);

        // Con la pieza ya encendida, el piloto la hace funcionar (escribir un ejemplo), a la vista.
        if (direccion === 1 && paso.demostrar) {
          setPilotoActuando(true);
          await pausa(conMovimiento ? 520 : 0);
          for (const a of paso.demostrar) {
            const res = await ejecutar(a, senal, conMovimiento, apuntar);
            if (senal.aborted) return;
            if (!res.ok && a.tipo !== "vaciar" && a.tipo !== "escape") setMostrando((m) => (m && m.indice === indice ? { ...m, nota: notaDe(a, res.motivo) } : m));
          }
          setPilotoActuando(false);
        }
        return;
      }
      if (indice >= guia.pasos.length) void terminar("completa");
      else setOcupada(false); // hacia atrás no hay nada antes: se queda donde estaba
    },
    [guia, terminar, apuntar],
  );

  // Arranque.
  useEffect(() => {
    dialogosAlEmpezar.current = modalesAbiertos();
    historial.current = [];
    terminada.current = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- la guía se sincroniza con el DOM de la pantalla (espera piezas, abre modales): no hay otra forma que arrancarla al montar
    void irA(0, 1);
    return () => {
      control.current?.abort();
      if (ocultarCursor.current) clearTimeout(ocultarCursor.current);
    };
  }, [irA]);

  const siguiente = useCallback(() => {
    if (ocupada || !mostrando) return;
    void irA(mostrando.indice + 1, 1);
  }, [irA, mostrando, ocupada]);

  const atras = useCallback(() => {
    if (ocupada || enCurso < 2) return;
    const previo = historial.current[historial.current.length - 2]!;
    void irA(previo, -1);
  }, [irA, ocupada, enCurso]);

  // Teclado: → / Enter siguiente, ← atrás, Esc sale. En la CAPTURA de `window`, antes que los modales (Radix escucha en la
  // captura de `document`): si no, Esc cerraría el modal de la demo en vez de salir de la guía.
  useEffect(() => {
    function alTecla(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (esEscapeDelPiloto()) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        void terminar("salio");
      } else if (e.key === "ArrowRight" || e.key === "Enter") {
        e.preventDefault();
        e.stopImmediatePropagation();
        siguiente();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        e.stopImmediatePropagation();
        atras();
      } else if (e.key === "Tab" || e.key === " ") {
        // El foco y el espacio no deben llegar a la pantalla de abajo (un espacio en el buscador, un botón que se activa).
        if (!refTarjeta.current?.contains(e.target as Node)) e.preventDefault();
      }
    }
    window.addEventListener("keydown", alTecla, true);
    return () => window.removeEventListener("keydown", alTecla, true);
  }, [atras, siguiente, terminar]);

  // Un clic sobre la capa no debe llegar al modal de abajo como «clic afuera» (lo cerraría): se corta en la propia capa.
  useEffect(() => {
    const el = capa.current;
    if (!el) return;
    const cortar = (e: Event) => e.stopPropagation();
    el.addEventListener("pointerdown", cortar);
    el.addEventListener("mousedown", cortar);
    el.addEventListener("focusin", cortar);
    return () => {
      el.removeEventListener("pointerdown", cortar);
      el.removeEventListener("mousedown", cortar);
      el.removeEventListener("focusin", cortar);
    };
  }, []);

  // UN solo motor de movimiento para el agujero del velo, su anillo, la onda de llegada y la tarjeta (ADR-0389, act. 2026-10-12).
  // Antes eran tres: el agujero en JS, el anillo con transiciones CSS de left/top (que se reiniciaban en cada cuadro de un
  // desplazamiento y quedaban atrás) y la tarjeta con otra transición; además cada cuadro redibujaba la guía entera en React.
  // Ahora un `requestAnimationFrame` escribe directo en el DOM y cada medida viaja con un RESORTE amortiguado (`resorte`, abajo):
  // sale desde quieto, acelera y frena suave, sigue sin tirones a una pieza que se mueve (un desplazamiento, un modal que entra) y
  // mide el tiempo real de cada cuadro (igual a 60 o a 120 Hz, y sin saltar cuando se pierde uno). El suavizado anterior arrancaba
  // a toda velocidad: el anillo saltaba hasta 98 px en el primer cuadro de cada viaje. El velo es un SVG con un agujero (relleno par-impar): Chrome lo repinta siempre, a diferencia
  // de la sombra gigante de una caja que usábamos antes.
  const refCamino = useRef<SVGPathElement>(null);
  const refAnillo = useRef<HTMLDivElement>(null);
  const refLlegada = useRef<HTMLDivElement>(null);
  const tamTarjeta = useRef({ ancho: 360, alto: 220 });
  const mostrandoRef = useRef<Mostrando | null>(null);
  useEffect(() => {
    mostrandoRef.current = mostrando;
  }, [mostrando]);

  useEffect(() => {
    const el = refTarjeta.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      tamTarjeta.current = { ancho: r.width, alto: r.height };
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    let cuadro = 0;
    let antes = 0;
    let meta: Caja | null = null;
    let agujero: Caja | null = null;
    const velAgujero = { top: 0, left: 0, width: 0, height: 0 };
    let carta: { left: number; top: number } | null = null;
    const velCarta = { left: 0, top: 0 };
    let lado = "";
    let escrito = "";
    // La pieza del cuadro anterior y dónde estaba: si es la MISMA y se movió (la página o la hoja se desplazan, un modal termina
    // de entrar), el agujero y la tarjeta se mueven con ella al instante, pegados; el resorte queda solo para el viaje de una
    // pieza a otra. Con el resorte solo, en un desplazamiento rápido el velo quedaba atrás de la pieza.
    let piezaPrevia: HTMLElement | null = null;
    let metaPrevia: Caja | null = null;
    let cartaPrevia: { left: number; top: number } | null = null;
    const vuelta = (ahora: number) => {
      const v = { ancho: window.innerWidth, alto: window.innerHeight };
      setVentana((a) => (a.ancho === v.ancho && a.alto === v.alto ? a : v));
      const m = mostrandoRef.current;
      const medido = medirMeta(v);
      if (medido !== undefined) meta = medido;
      else if (m && !m.recorte) meta = null;
      const centro = { top: v.alto / 2, left: v.ancho / 2, width: 0, height: 0 };
      const destino = meta ?? centro;
      // Segundos del cuadro, con techo: una pestaña que vuelve del fondo no debe dar un salto de 20 s.
      const dt = antes ? Math.min(0.05, (ahora - antes) / 1000) : 1 / 60;
      antes = ahora;
      const quieto = prefiereQuieto();
      const pieza = elementoActual.current;
      const misma = !!pieza && pieza === piezaPrevia && !!meta && !!metaPrevia;
      const a = { ...(agujero ?? centro) };
      if (misma) {
        a.top += meta!.top - metaPrevia!.top;
        a.left += meta!.left - metaPrevia!.left;
      }
      for (const k of ["top", "left", "width", "height"] as const) {
        if (quieto) [a[k], velAgujero[k]] = [destino[k], 0];
        else [a[k], velAgujero[k]] = resorte(a[k], velAgujero[k], destino[k], dt);
      }
      agujero = a;

      const p = posicionTarjeta(m ? meta : null, v, tamTarjeta.current);
      const c = { ...(carta ?? { left: p.left, top: p.top }) };
      // Si la tarjeta cambia de lado (la pieza bajó y ya no cabe debajo), ese cambio sí viaja con el resorte.
      if (misma && cartaPrevia && p.lado === lado) {
        c.left += p.left - cartaPrevia.left;
        c.top += p.top - cartaPrevia.top;
      }
      for (const k of ["left", "top"] as const) {
        if (quieto) [c[k], velCarta[k]] = [p[k], 0];
        else [c[k], velCarta[k]] = resorte(c[k], velCarta[k], p[k], dt);
      }
      carta = c;
      piezaPrevia = pieza;
      metaPrevia = meta;
      cartaPrevia = { left: p.left, top: p.top };

      // Solo se escribe en el DOM si algo cambió (una pantalla quieta no recalcula estilos).
      const h = agujero;
      const firma = `${v.ancho}|${v.alto}|${h.top.toFixed(1)}|${h.left.toFixed(1)}|${h.width.toFixed(1)}|${h.height.toFixed(1)}|${carta.left.toFixed(1)}|${carta.top.toFixed(1)}`;
      if (firma !== escrito) {
        escrito = firma;
        refCamino.current?.setAttribute("d", caminoDelVelo(v, h));
        for (const anillo of [refAnillo.current, refLlegada.current]) {
          if (!anillo) continue;
          anillo.style.transform = `translate3d(${h.left}px, ${h.top}px, 0)`;
          anillo.style.width = `${h.width}px`;
          anillo.style.height = `${h.height}px`;
        }
        if (refTarjeta.current) refTarjeta.current.style.transform = `translate3d(${carta.left}px, ${carta.top}px, 0)`;
      }
      if (p.lado !== lado && refTarjeta.current) {
        lado = p.lado;
        refTarjeta.current.dataset.lado = p.lado;
      }
      cuadro = requestAnimationFrame(vuelta);
    };
    cuadro = requestAnimationFrame(vuelta);
    return () => cancelAnimationFrame(cuadro);
  }, [medirMeta]);

  // El foco va a la tarjeta SOLO al empezar. Después se queda donde la demo lo deja: si la tarjeta se lo quitara al buscador,
  // su lista de resultados se cerraría justo cuando se la está explicando. El teclado igual manda (se escucha en `window`) y el
  // lector de pantalla lee cada paso por el `aria-live` de la tarjeta.
  const yaEnfocada = useRef(false);
  useEffect(() => {
    if (!mostrando || ocupada || yaEnfocada.current) return;
    yaEnfocada.current = true;
    refTarjeta.current?.querySelector<HTMLElement>("[data-guia-siguiente]")?.focus({ preventScroll: true });
  }, [mostrando, ocupada]);

  if (typeof document === "undefined") return null;

  const recorte = mostrando?.recorte;
  const esUltimo = !!mostrando && guia.pasos.slice(mostrando.indice + 1).every((p) => !pasoAplica(p, anclasPresentes(), ventana.ancho) && !p.preparar);
  const esCierre = esUltimo && !recorte;

  return createPortal(
    <div ref={capa} className="guia-capa" data-guia-motor role="presentation">
      <div className="guia-bloqueo" aria-hidden />
      <svg className="guia-velo" width={ventana.ancho} height={ventana.alto} aria-hidden>
        <path ref={refCamino} fillRule="evenodd" d={`M0 0H${ventana.ancho}V${ventana.alto}H0Z`} />
      </svg>
      {/* El anillo claro alrededor de la pieza: su lugar lo escribe el motor de movimiento, cuadro a cuadro. */}
      <div ref={refAnillo} aria-hidden className="guia-recorte" data-sin-pieza={recorte ? undefined : ""} />
      {/* La llegada: una onda que sale del borde de la pieza una sola vez, cada vez que la guía llega a otra. */}
      {recorte && mostrando && (
        <div
          key={`llega-${mostrando.indice}`}
          ref={refLlegada}
          aria-hidden
          className="guia-llegada"
          style={{ transform: `translate3d(${recorte.left}px, ${recorte.top}px, 0)`, width: recorte.width, height: recorte.height }}
        />
      )}
      {/* El cursor fantasma: muestra DÓNDE toca o escribe el piloto antes de que pase. */}
      <div
        aria-hidden
        className="guia-cursor"
        data-visible={cursor.visible ? "" : undefined}
        data-instante={cursor.instante ? "" : undefined}
        data-escribe={cursor.escribe ? "" : undefined}
        style={{ transform: `translate3d(${cursor.x}px, ${cursor.y}px, 0)` }}
      >
        <span key={cursor.pulso} className="guia-cursor-onda" data-activa={cursor.pulso > 0 ? "" : undefined} />
        <svg viewBox="0 0 24 24" className="guia-cursor-flecha" aria-hidden>
          <path d="M5 3l14 8.2-6.2 1.6L9.6 19z" />
        </svg>
      </div>
      <div
        ref={refTarjeta}
        role="dialog"
        aria-modal="false"
        aria-labelledby="guia-titulo"
        aria-describedby="guia-texto"
        className="guia-tarjeta"
        data-ocupada={ocupada ? "" : undefined}
        data-piloto={pilotoActuando ? "" : undefined}
      >
        <div className="flex items-center justify-between gap-3">
          <p className="label-cayla text-[10.5px] text-taupe-profundo">Guía · {guia.titulo}</p>
          <p className="text-[11px] tabular-nums text-tinta/55" aria-live="polite">
            {enCurso > 0 ? `${enCurso} de ${esUltimo ? enCurso : total}` : ""}
          </p>
        </div>
        <div className="guia-avance mt-2" aria-hidden>
          {Array.from({ length: esUltimo ? enCurso : total }, (_, k) => (
            <span key={k} data-hecho={k < enCurso ? "" : undefined} />
          ))}
        </div>
        {mostrando ? (
          <div key={mostrando.indice} className="guia-contenido mt-3" aria-live="polite">
            {esCierre && (
              <div className="guia-fin" aria-hidden>
                <svg viewBox="0 0 52 52" className="guia-fin-visto">
                  <circle cx="26" cy="26" r="23" />
                  <path d="M15 27l7.5 7.5L37.5 19" />
                </svg>
                {Array.from({ length: 8 }, (_, k) => (
                  <span key={k} className="guia-chispa" style={{ "--k": k } as CSSProperties} />
                ))}
              </div>
            )}
            <div className="flex items-start gap-3">
              {!esCierre && (
                <span className="guia-numero" aria-hidden>
                  {enCurso}
                </span>
              )}
              <h2 id="guia-titulo" className="guia-titulo font-display text-[21px] leading-tight text-tinta">
                {mostrando.paso.titulo}
              </h2>
            </div>
            <p id="guia-texto" className="guia-texto mt-1.5 text-[14px] leading-relaxed text-tinta/80">
              {mostrando.paso.texto}
            </p>
            {mostrando.nota && <p className="guia-nota nota-cayla mt-3 rounded-lg px-3 py-2 text-[12.5px] leading-snug text-tinta/75">{mostrando.nota}</p>}
            {enCurso === 1 && (
              <p className="guia-atajos mt-3 flex flex-wrap items-center gap-1.5 text-[11.5px] text-tinta/60">
                <kbd>←</kbd>
                <kbd>→</kbd> para moverte · <kbd>Esc</kbd> para salir
              </p>
            )}
          </div>
        ) : (
          <p className="mt-3 text-sm text-tinta/65">Preparando la demo…</p>
        )}
        <div className="mt-4 flex items-center gap-2">
          {enCurso > 1 && <Volver onClick={atras} a="el paso anterior" deshabilitado={ocupada} />}
          <Boton type="button" peso="fantasma" className="mr-auto" onClick={() => void terminar("salio")}>
            Salir
          </Boton>
          <Boton type="button" peso="primario" data-guia-siguiente onClick={esUltimo ? () => void terminar("completa") : siguiente} disabled={ocupada}>
            {esUltimo ? "Terminar" : "Siguiente"}
          </Boton>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** El velo: toda la ventana, menos un rectángulo redondeado (el agujero) por donde se ve la pieza. Sin agujero, el velo entero. */
function caminoDelVelo(v: { ancho: number; alto: number }, a: Caja): string {
  const fuera = `M0 0H${v.ancho}V${v.alto}H0Z`;
  if (a.width < 1 || a.height < 1) return fuera;
  const r = Math.min(14, a.width / 2, a.height / 2);
  const { left: x, top: y, width: w, height: h } = a;
  return `${fuera}M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + h}H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`;
}

/** Cuántos modales de la pantalla hay abiertos (la tarjeta de la guía no cuenta). */
function modalesAbiertos(): number {
  return [...document.querySelectorAll("[role=dialog]")].filter((d) => !d.closest("[data-guia-motor]")).length;
}

/**
 * Un paso de un resorte con amortiguación crítica (la solución exacta, estable con cualquier `dt`): parte con la velocidad que
 * traía, llega sin pasarse ni rebotar (ADR-0136) y se asienta en ~0,45 s. Cerca del destino y casi quieto, se clava en él.
 */
const OMEGA = 13; // rad/s: más alto = más rápido. 13 → el 95 % del viaje en ~0,36 s, asentado a los ~0,45 s.
function resorte(x: number, v: number, meta: number, dt: number): [number, number] {
  const d = x - meta;
  const e = Math.exp(-OMEGA * dt);
  const t = (v + OMEGA * d) * dt;
  const d2 = (d + t) * e;
  const v2 = (v - OMEGA * t) * e;
  return Math.abs(d2) < 0.25 && Math.abs(v2) < 4 ? [meta, 0] : [meta + d2, v2];
}

/**
 * Espera a que la pieza deje de moverse (el desplazamiento suave terminó): la misma posición durante 4 cuadros seguidos, o
 * como mucho `ms`. Sirve con cualquier cosa que se desplace (la página o la hoja de un modal), no solo con la ventana.
 */
async function hastaQueQuieta(el: HTMLElement, senal: AbortSignal, ms: number): Promise<void> {
  const fin = performance.now() + ms;
  let previo = "";
  let quietos = 0;
  await new Promise<void>((listo) => {
    const mirar = () => {
      if (senal.aborted || !el.isConnected || performance.now() > fin) return listo();
      const r = el.getBoundingClientRect();
      const ahora = `${Math.round(r.top)}|${Math.round(r.left)}`;
      quietos = ahora === previo ? quietos + 1 : 0;
      previo = ahora;
      if (quietos >= 4) return listo();
      requestAnimationFrame(mirar);
    };
    requestAnimationFrame(mirar);
  });
}

/** ¿La pieza se ve entera en la ventana? */
function aLaVista(el: HTMLElement): boolean {
  const r = el.getBoundingClientRect();
  return r.top >= 0 && r.left >= 0 && r.bottom <= window.innerHeight && r.right <= window.innerWidth;
}

/** Lo que dice la tarjeta cuando el piloto no hizo algo. Un botón que guarda se explica, no se toca. */
function notaDe(accion: AccionGuia, motivo: string): string {
  if (accion.tipo === "clic" && /botón que hace algo|formulario|otra pantalla|sale del ERP/.test(motivo)) {
    return "Este botón hace algo de verdad, así que en la demo no lo tocamos: te contamos qué pasa cuando lo usas.";
  }
  return `La demo no pudo hacer este paso sola (${motivo}). Igual te contamos para qué sirve.`;
}
