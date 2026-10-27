"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { X } from "lucide-react";
import { DismissableLayer } from "radix-ui/internal";
import { BarraDeAbajo } from "@/components/ui/BarraDeAbajo";
import { Boton } from "@/components/ui/campos";
import { buscarAncla, ejecutar } from "@/components/guias/piloto";
import { mismaPantalla, rutaDe, seAbreDesdeOtra, type PasoTarea } from "@/lib/asistente/tarea";
import { caminoDelVelo, recorteDe, type Caja } from "@/lib/guias/reglas";
import { GUIAS } from "@/lib/guias/registro";
import { useConsultaMedia } from "@/lib/useConsultaMedia";

// «Pregúntale a CAYLA» acompaña una tarea (Felipe 2026-10-27: «la persona hace los clics; CAYLA la guía», con «una barra fija abajo, como un
// GPS»). Enciende la pieza del paso con un anillo que NO tapa nada (se toca a través), dice la orden en letra grande y pasa sola al
// siguiente cuando la persona la toca —o, si el paso es escribir (el buscador), cuando aparece la pieza del paso que sigue—. Nunca hace
// un clic: lo único que escribe es el nombre de la prenda en el buscador marcado `rellenable`, como el recorrido (`piloto.ejecutar`).
// Termina en el paso de confirmar, que confirma la persona. Vive montado una vez en `AppShell`; la tarea viaja en la pestaña
// (`sessionStorage`), así sigue cuando la pantalla cambia.

const CLAVE = "cayla-tarea";
const EVENTO = "cayla:tarea";
/** Una tarea guardada más vieja que esto ya no es de la pregunta de ahora. */
const VIGENCIA_MS = 20 * 60_000;
/** Lo que se espera tras el toque para pasar: deja que la pantalla responda (abra la hoja, marque el color). */
const TRAS_TOQUE_MS = 450;

type Guardada = { pasos: PasoTarea[]; i: number; desde: number };

function leer(): Guardada | null {
  try {
    const g = JSON.parse(sessionStorage.getItem(CLAVE) ?? "null") as Guardada | null;
    if (!g || !Array.isArray(g.pasos) || g.pasos.length === 0 || Date.now() - g.desde > VIGENCIA_MS) return null;
    return g;
  } catch {
    return null;
  }
}

function guardar(g: Guardada | null) {
  try {
    if (g) sessionStorage.setItem(CLAVE, JSON.stringify(g));
    else sessionStorage.removeItem(CLAVE);
  } catch {
    /* ventana privada: la tarea sigue mientras no se cambie de pantalla */
  }
}

/** Empieza a acompañar una tarea (lo llama el cajón del asistente con «Acompáñame»). */
export function empezarTarea(pasos: readonly PasoTarea[]) {
  // En escritorio no existen la lupa del buscador ni «Ver ticket»: ni se cuentan.
  const celular = window.matchMedia("(max-width: 639.98px)").matches;
  guardar({ pasos: pasos.filter((p) => celular || !p.soloCelular), i: 0, desde: Date.now() });
  window.dispatchEvent(new Event(EVENTO));
}

/** Lo que se espera a una pieza que no aparece antes de saltarla, si una de más adelante ya se puede usar (el combo «quién atiende» no sale
 *  en una cuenta personal; la lupa del buscador solo existe en el celular). Si la que sigue inmediatamente ya está, casi sin esperar. */
const AUSENTE_MS = 2000;
const AUSENTE_SIGUE_MS = 350;

/** Lo que dura escrito el campo de un paso de escribir antes de pasar al siguiente (lo lee la persona). */
const ESCRITO_MS = 1600;

/**
 * Una pieza a la vista y que se puede usar: no apagada (Cobrar está apagado mientras el ticket está vacío). En una pieza con botones
 * manda el principal: el de enviar o, si no hay, el último (en el pie de una hoja, «Agregar» va después de «Cancelar», que nunca se apaga).
 */
function disponible(el: HTMLElement | null): boolean {
  if (!el) return false;
  if (el.matches(":disabled") || el.getAttribute("aria-disabled") === "true") return false;
  const botones = el.matches("button") ? [] : [...el.querySelectorAll<HTMLButtonElement>("button")];
  const principal = botones.find((b) => b.type === "submit") ?? botones.at(-1);
  return !principal || !principal.disabled;
}

/** Un paso de escribir: se pasa cuando el campo tiene lo escrito, no al tocarlo (tocarlo es solo poner el cursor). */
const esCampo = (el: HTMLElement) => el.matches("input, textarea") || !!el.querySelector('input:not([type="checkbox"]):not([type="radio"]), textarea');

/** Lo que se toca de verdad: un toque en el aire de la pieza (el margen entre dos botones) no es haber hecho el paso. */
const CONTROL = 'button, a, input, select, textarea, label, [role="option"], [role="radio"], [role="button"], [role="checkbox"], [role="switch"], [role="tab"]';

/** Lo que deshace o se va no es haber hecho el paso: tocar «Cancelar» en el pie de una hoja no la avanza. */
const NO_AVANZA = /^(cancelar|descartar|cerrar|volver|atr[aá]s|salir)\b/i;

/** Con la pieza en el borde de abajo, la barra se va arriba para no taparla. */
const ALTO_BARRA_PX = 150;

/** Qué tan rápido el recorte y la etiqueta alcanzan a la pieza (1/s): sin pasarse, como el resorte de las guías (ADR-0136). */
const SEGUIR = 16;
/** Alto de la etiqueta más su pico y el aire: si no cabe arriba de la pieza, va abajo. */
const ALTO_ETIQUETA = 52;

const LISTAS_ABIERTAS = '[role="listbox"], [data-capa-flotante] [role="option"]'; // unificar-fijo: busca las listas de los combos para no taparlas; no dibuja una

/** Una lista flotante abierta fuera de la pieza (los colores de un combo, «quién atiende»): el velo se aparta para que se lea. */
function hayListaAfuera(pieza: HTMLElement): boolean {
  return [...document.querySelectorAll<HTMLElement>(LISTAS_ABIERTAS)].some(
    (l) => !pieza.contains(l) && l.getClientRects().length > 0,
  );
}

const nombreDePantalla = (href: string) => GUIAS.find((g) => rutaDe(g.ruta) === rutaDe(href))?.titulo ?? "otra pantalla";

export function Acompanante() {
  const router = useRouter();
  const pathname = usePathname();
  const celular = useConsultaMedia("(max-width: 639.98px)");
  const [tarea, setTarea] = useState<Guardada | null>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [porQue, setPorQue] = useState(false);
  const [listo, setListo] = useState(false);
  /** Cuántas veces y cuándo se escribió el dato de cada paso: una pantalla que todavía se arma puede borrarlo, y se reintenta. */
  const rellenados = useRef(new Map<number, { veces: number; en: number }>());
  const refCapa = useRef<HTMLDivElement>(null);
  const refCamino = useRef<SVGPathElement>(null);
  const refRecorte = useRef<HTMLDivElement>(null);
  const refEtiqueta = useRef<HTMLDivElement>(null);
  const tocado = useRef<number | null>(null);

  useEffect(() => {
    const cargar = () => setTarea(leer());
    cargar();
    window.addEventListener(EVENTO, cargar);
    return () => window.removeEventListener(EVENTO, cargar);
  }, []);

  const ir = useCallback((i: number) => {
    setTarea((t) => {
      if (!t) return t;
      const nueva = { ...t, i };
      guardar(nueva);
      return nueva;
    });
    setPorQue(false);
    tocado.current = null;
  }, []);

  const terminar = useCallback((conListo: boolean) => {
    guardar(null);
    setRect(null);
    if (!conListo) {
      setTarea(null);
      return;
    }
    setListo(true);
    setTimeout(() => {
      setListo(false);
      setTarea(null);
    }, 2200);
  }, []);

  const paso = tarea && !listo ? tarea.pasos[tarea.i] : undefined;

  // Encontrar la pieza, seguirla y pasar adelante cuando la persona ya avanzó. La señal es una pieza de MÁS ADELANTE que apareció o se
  // encendió desde que empezó este paso: «Cobrar» se enciende cuando la prenda entra al ticket; la hoja de tallas o la de cobro aparecen
  // al abrirse. Una pieza que ya estaba a la vista y encendida al empezar no cuenta (el botón Cobrar siempre está, apagado o no).
  useEffect(() => {
    if (!tarea || !paso) return;
    let vivo = true;
    let movido = false;
    let conValorDesde: number | null = null;
    let ausenteDesde: number | null = null;
    const despues = tarea.pasos.slice(tarea.i + 1).map((p) => p.ancla);
    // Qué había a la vista cuando apareció la pieza de ESTE paso (no cuando empezó: tras tocar «Editar» la pantalla nueva todavía carga,
    // y lo que aparece al cargar no es que la persona avanzó).
    let alEmpezar: boolean[] | null = null;
    const id = window.setInterval(() => {
      if (!vivo) return;
      const el = buscarAncla(paso.ancla);
      if (el && !alEmpezar) alEmpezar = despues.map((a) => disponible(buscarAncla(a)));
      const antes = alEmpezar;
      const k = antes ? despues.findIndex((a, n) => !antes[n] && disponible(buscarAncla(a))) : -1;
      if (k >= 0) {
        ir(tarea.i + 1 + k);
        return;
      }
      if (!el) {
        setRect(null);
        // En su pantalla y sin su pieza, con una de más adelante lista para usar: ese paso no toca aquí, se salta.
        ausenteDesde = ausenteDesde ?? Date.now();
        const lista = despues.findIndex((a) => disponible(buscarAncla(a)));
        const espera = lista === 0 ? AUSENTE_SIGUE_MS : AUSENTE_MS;
        if (lista >= 0 && Date.now() - ausenteDesde > espera && mismaPantalla(paso.href, window.location.pathname)) ir(tarea.i + 1 + lista);
        return;
      }
      ausenteDesde = null;
      if (!movido) {
        movido = true;
        el.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
      }
      // El dato que la persona dio, en el buscador: si al rato el campo sigue vacío (la pantalla terminó de armarse y lo borró), otra vez,
      // tres como mucho. Si la persona lo borra a propósito después, no se insiste más allá de eso.
      const hecho = rellenados.current.get(tarea.i);
      const campoVacio = !(el.matches("input, textarea") ? (el as HTMLInputElement) : el.querySelector<HTMLInputElement>("input, textarea"))?.value;
      if (paso.rellenar && campoVacio && (!hecho || (hecho.veces < 3 && Date.now() - hecho.en > 1500))) {
        rellenados.current.set(tarea.i, { veces: (hecho?.veces ?? 0) + 1, en: Date.now() });
        void ejecutar({ tipo: "rellenar", ancla: paso.ancla, texto: paso.rellenar }, undefined, false);
      }
      // Un paso de escribir termina cuando el campo tiene lo escrito un momento (lo escribió CAYLA o la persona).
      if (esCampo(el) && tarea.i < tarea.pasos.length - 1) {
        const valor = (el.matches("input, textarea") ? (el as HTMLInputElement) : el.querySelector<HTMLInputElement>("input, textarea"))?.value.trim() ?? "";
        conValorDesde = valor ? (conValorDesde ?? Date.now()) : null;
        if (conValorDesde !== null && Date.now() - conValorDesde > ESCRITO_MS) {
          ir(tarea.i + 1);
          return;
        }
      }
      setRect(el.getBoundingClientRect());
    }, 200);
    return () => {
      vivo = false;
      window.clearInterval(id);
    };
  }, [tarea, paso, ir]);

  // Lo que se ve, cuadro a cuadro: el velo con su recorte y la etiqueta siguen a la pieza aunque la página se desplace o la hoja se
  // mueva. Se escribe directo en el DOM (sin pasar por React en cada cuadro) y se acerca a la meta sin pasarse.
  useEffect(() => {
    if (!paso) return;
    const quieto = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let actual: Caja | null = null;
    let antes = performance.now();
    let cuadro = 0;
    const mover = (ahora: number) => {
      cuadro = requestAnimationFrame(mover);
      const dt = Math.min(0.05, (ahora - antes) / 1000);
      antes = ahora;
      const capa = refCapa.current;
      const el = buscarAncla(paso.ancla);
      const ventana = { ancho: window.innerWidth, alto: window.innerHeight };
      const r = el?.getBoundingClientRect();
      if (!capa || !el || !r || r.width < 1 || hayListaAfuera(el)) {
        capa?.setAttribute("data-oculta", "");
        actual = null;
        return;
      }
      capa.removeAttribute("data-oculta");
      const meta = recorteDe({ top: r.top, left: r.left, width: r.width, height: r.height }, ventana, 6);
      if (!actual || quieto) actual = meta;
      else {
        const k = 1 - Math.exp(-SEGUIR * dt);
        const a: Caja = actual;
        actual = { top: a.top + (meta.top - a.top) * k, left: a.left + (meta.left - a.left) * k, width: a.width + (meta.width - a.width) * k, height: a.height + (meta.height - a.height) * k };
        if (Math.abs(actual.top - meta.top) + Math.abs(actual.left - meta.left) + Math.abs(actual.width - meta.width) + Math.abs(actual.height - meta.height) < 0.6) actual = meta;
      }
      const c = actual;
      refCamino.current?.setAttribute("d", caminoDelVelo(ventana, c));
      const recorte = refRecorte.current;
      if (recorte) {
        recorte.style.transform = `translate3d(${c.left}px, ${c.top}px, 0)`;
        recorte.style.width = `${c.width}px`;
        recorte.style.height = `${c.height}px`;
      }
      const etiqueta = refEtiqueta.current;
      if (etiqueta) {
        const ancho = etiqueta.offsetWidth;
        const arriba = c.top > ALTO_ETIQUETA + 8;
        const x = Math.min(Math.max(12, c.left), ventana.ancho - ancho - 12);
        const y = arriba ? c.top - ALTO_ETIQUETA + 6 : Math.min(c.top + c.height + 12, ventana.alto - ALTO_ETIQUETA);
        etiqueta.dataset.lado = arriba ? "arriba" : "abajo";
        etiqueta.style.transform = `translate3d(${x}px, ${y}px, 0)`;
        // El pico apunta al centro de la pieza, sin salirse de la etiqueta.
        etiqueta.style.setProperty("--acompana-pico", `${Math.min(Math.max(18, c.left + Math.min(c.width, 64) / 2 - x), ancho - 18)}px`);
      }
    };
    cuadro = requestAnimationFrame(mover);
    return () => cancelAnimationFrame(cuadro);
  }, [paso]);

  // El toque de la persona en la pieza encendida: pasa al siguiente (o termina, si era confirmar).
  useEffect(() => {
    if (!tarea || !paso) return;
    const alTocar = (e: Event) => {
      const el = buscarAncla(paso.ancla);
      const objetivo = e.target instanceof Element ? e.target : null;
      const control = objetivo?.closest(CONTROL) ?? null;
      if (!el || !control || !(el.contains(control) || control.contains(el)) || esCampo(el) || tocado.current === tarea.i) return;
      if (NO_AVANZA.test((control.getAttribute("aria-label") ?? control.textContent ?? "").trim())) return;
      tocado.current = tarea.i;
      const ultimo = tarea.i >= tarea.pasos.length - 1;
      window.setTimeout(() => (ultimo ? terminar(true) : ir(tarea.i + 1)), TRAS_TOQUE_MS);
    };
    document.addEventListener("click", alTocar, true);
    return () => document.removeEventListener("click", alTocar, true);
  }, [tarea, paso, ir, terminar]);

  if (!tarea && !listo) return null;
  const total = tarea?.pasos.length ?? 0;
  const i = tarea?.i ?? 0;
  const enOtraPantalla = !!paso && !rect && !mismaPantalla(paso.href, pathname);
  // Una pantalla que se abre desde otra (Editar producto) no tiene a dónde llevar: se llega con el paso anterior.
  const sinLlevar = !!paso && seAbreDesdeOtra(paso.href);
  const arriba = !!rect && typeof window !== "undefined" && rect.bottom > window.innerHeight - ALTO_BARRA_PX;

  return (
    <DismissableLayer.Branch data-acompanante>
      {/* El velo con su recorte, el halo y la etiqueta del paso (`acompanante.css`): no tapa nada, todo se toca a través. Cada paso
          vuelve a montar el recorte y la etiqueta, así la onda de llegada sale una vez por paso. */}
      {paso ? (
        <div ref={refCapa} aria-hidden className="acompana-capa" data-oculta="">
          <svg className="acompana-velo">
            <path ref={refCamino} fillRule="evenodd" />
          </svg>
          <div key={`r${i}`} ref={refRecorte} className="acompana-recorte" />
          <div key={`e${i}`} ref={refEtiqueta} className="acompana-etiqueta" data-lado="arriba">
            <span className="acompana-numero">{i + 1}</span>
            <span className="acompana-etiqueta-texto">{paso.orden}</span>
          </div>
        </div>
      ) : null}
      <BarraDeAbajo
        sobre={celular && pathname.startsWith("/vender") ? "4.75rem" : undefined}
        className="pointer-events-auto z-[97] sm:left-0 sm:right-0 sm:mx-auto sm:max-w-[44rem]"
        style={arriba ? { top: "0.75rem", bottom: "auto" } : undefined}
        role="status"
        aria-live="polite"
      >
        <div className="min-w-0 flex-1 py-1">
          {listo ? (
            <p className="text-[19px] font-medium leading-snug text-tinta">¡Listo! Lo hiciste tú.</p>
          ) : paso ? (
            <>
              <p className="flex items-center gap-2 whitespace-nowrap text-xs text-taupe">
                <span aria-hidden className="flex gap-1">
                  {tarea!.pasos.map((_, k) => (
                    <span key={k} className={`h-1.5 w-1.5 rounded-full ${k <= i ? "bg-tinta" : "bg-sand"}`} />
                  ))}
                </span>
                {i + 1} de {total}
              </p>
              <p className="mt-1 text-[19px] font-medium leading-snug text-tinta">{paso.orden}</p>
              {enOtraPantalla ? (
                <p className="mt-1 text-sm text-taupe">{sinLlevar ? `Se abre en ${nombreDePantalla(paso.href)}, con el paso anterior.` : `Está en ${nombreDePantalla(paso.href)}.`}</p>
              ) : null}
              {porQue ? <p className="mt-1.5 max-w-prose text-sm text-tinta/75">{paso.porQue}</p> : null}
            </>
          ) : null}
        </div>
        {paso ? (
          <div className="flex items-center gap-1">
            {enOtraPantalla && !sinLlevar ? (
              <Boton peso="primario" onClick={() => router.push(paso.href)}>
                Llévame
              </Boton>
            ) : null}
            <button type="button" className="btn-cayla btn-sutil btn-chico" aria-expanded={porQue} onClick={() => setPorQue((v) => !v)}>
              ¿Por qué?
            </button>
            <button type="button" className="btn-cayla btn-sutil btn-chico" onClick={() => (i >= total - 1 ? terminar(false) : ir(i + 1))}>
              Saltar
            </button>
            <button
              type="button"
              aria-label="Salir del acompañamiento"
              title="Salir"
              onClick={() => terminar(false)}
              className="grid h-8 w-8 place-items-center rounded-full text-tinta/65 transition-colors hover:bg-sand/60 hover:text-tinta"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
        ) : null}
      </BarraDeAbajo>
    </DismissableLayer.Branch>
  );
}
