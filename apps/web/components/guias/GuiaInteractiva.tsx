"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Boton } from "@/components/ui/campos";
import { Volver } from "@/components/ui/Volver";
import { esperaPorAncla, pasoAplica, posicionTarjeta, recorteDe, totalEstimado, type Caja } from "@/lib/guias/reglas";
import type { AccionGuia, Guia, PasoGuia } from "@/lib/guias/tipos";
import { anclasPresentes, ejecutar, esEscapeDelPiloto, esperarAncla, pausa } from "./piloto";

// El motor de una guía interactiva (ADR-0362): oscurece la pantalla, deja a la vista solo la pieza que se explica y la
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
  const [tarjeta, setTarjeta] = useState({ ancho: 360, alto: 220 });
  const [ventana, setVentana] = useState({ ancho: 1280, alto: 800 });
  const [total, setTotal] = useState(guia.pasos.length);
  /** Cuántos pasos lleva vistos (el historial, como estado para dibujarlo). */
  const [enCurso, setEnCurso] = useState(0);
  const historial = useRef<number[]>([]);
  const control = useRef<AbortController | null>(null);
  const capa = useRef<HTMLDivElement>(null);
  const refTarjeta = useRef<HTMLDivElement>(null);
  const elementoActual = useRef<HTMLElement | null>(null);
  const dialogosAlEmpezar = useRef(0);
  const terminada = useRef(false);
  // El aviso de fin va por ref: si la pantalla de abajo se redibuja y `onTerminar` cambia de identidad, la guía NO debe
  // volver a empezar (el arranque depende de `irA`, que depende de `terminar`).
  const avisarFin = useRef(onTerminar);
  useEffect(() => {
    avisarFin.current = onTerminar;
  }, [onTerminar]);

  const medirRecorte = useCallback(() => {
    const el = elementoActual.current;
    const v = { ancho: window.innerWidth, alto: window.innerHeight };
    setVentana((a) => (a.ancho === v.ancho && a.alto === v.alto ? a : v));
    if (!el || !el.isConnected) return;
    const r = el.getBoundingClientRect();
    const nuevo = recorteDe({ top: r.top, left: r.left, width: r.width, height: r.height }, v);
    setMostrando((m) => {
      if (!m || !m.recorte) return m;
      const a = m.recorte;
      if (Math.abs(a.top - nuevo.top) < 0.5 && Math.abs(a.left - nuevo.left) < 0.5 && Math.abs(a.width - nuevo.width) < 0.5 && Math.abs(a.height - nuevo.height) < 0.5) return m;
      return { ...m, recorte: nuevo };
    });
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
        // Antes de preguntar si aplica, se prepara (abrir el modal donde vive), en las dos direcciones.
        let nota: string | null = null;
        if (paso.preparar) {
          for (const a of paso.preparar) {
            const r = await ejecutar(a, senal, conMovimiento);
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
          el.scrollIntoView({ block: el.getBoundingClientRect().height > window.innerHeight * 0.6 ? "start" : "center", inline: "nearest", behavior: conMovimiento ? "smooth" : "auto" });
          await pausa(conMovimiento ? 320 : 0);
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
          await pausa(conMovimiento ? 520 : 0);
          for (const a of paso.demostrar) {
            const res = await ejecutar(a, senal, conMovimiento);
            if (senal.aborted) return;
            if (!res.ok && a.tipo !== "vaciar" && a.tipo !== "escape") setMostrando((m) => (m && m.indice === indice ? { ...m, nota: notaDe(a, res.motivo) } : m));
          }
        }
        return;
      }
      if (indice >= guia.pasos.length) void terminar("completa");
      else setOcupada(false); // hacia atrás no hay nada antes: se queda donde estaba
    },
    [guia, terminar],
  );

  // Arranque.
  useEffect(() => {
    dialogosAlEmpezar.current = modalesAbiertos();
    historial.current = [];
    terminada.current = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- la guía se sincroniza con el DOM de la pantalla (espera piezas, abre modales): no hay otra forma que arrancarla al montar
    void irA(0, 1);
    return () => control.current?.abort();
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

  // La pieza se mueve (scroll, una lista que carga, el modal que termina de entrar): el recorte la sigue.
  useEffect(() => {
    let cuadro = 0;
    const vuelta = () => {
      medirRecorte();
      cuadro = requestAnimationFrame(vuelta);
    };
    cuadro = requestAnimationFrame(vuelta);
    return () => cancelAnimationFrame(cuadro);
  }, [medirRecorte]);

  // El tamaño real de la tarjeta, para ubicarla sin taparse con la pieza.
  useLayoutEffect(() => {
    const el = refTarjeta.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (Math.abs(r.width - tarjeta.ancho) > 1 || Math.abs(r.height - tarjeta.alto) > 1) setTarjeta({ ancho: r.width, alto: r.height });
  }, [mostrando, tarjeta.ancho, tarjeta.alto]);

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

  const pos = posicionTarjeta(mostrando?.recorte ?? null, ventana, tarjeta);
  const recorte = mostrando?.recorte;
  const esUltimo = !!mostrando && guia.pasos.slice(mostrando.indice + 1).every((p) => !pasoAplica(p, anclasPresentes(), ventana.ancho) && !p.preparar);

  return createPortal(
    <div ref={capa} className="guia-capa" data-guia-motor role="presentation">
      <div className="guia-bloqueo" aria-hidden />
      <div
        aria-hidden
        className="guia-recorte"
        data-sin-pieza={recorte ? undefined : ""}
        style={
          recorte
            ? { transform: `translate3d(${recorte.left}px, ${recorte.top}px, 0)`, width: recorte.width, height: recorte.height }
            : { transform: `translate3d(${ventana.ancho / 2}px, ${ventana.alto / 2}px, 0)`, width: 0, height: 0 }
        }
      />
      <div
        ref={refTarjeta}
        role="dialog"
        aria-modal="false"
        aria-labelledby="guia-titulo"
        aria-describedby="guia-texto"
        className="guia-tarjeta"
        data-ocupada={ocupada ? "" : undefined}
        style={{ transform: `translate3d(${pos.left}px, ${pos.top}px, 0)` }}
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
            <h2 id="guia-titulo" className="font-display text-[21px] leading-tight text-tinta">
              {mostrando.paso.titulo}
            </h2>
            <p id="guia-texto" className="mt-1.5 text-[14px] leading-relaxed text-tinta/80">
              {mostrando.paso.texto}
            </p>
            {mostrando.nota && <p className="nota-cayla mt-3 rounded-lg px-3 py-2 text-[12.5px] leading-snug text-tinta/75">{mostrando.nota}</p>}
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

/** Cuántos modales de la pantalla hay abiertos (la tarjeta de la guía no cuenta). */
function modalesAbiertos(): number {
  return [...document.querySelectorAll("[role=dialog]")].filter((d) => !d.closest("[data-guia-motor]")).length;
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
