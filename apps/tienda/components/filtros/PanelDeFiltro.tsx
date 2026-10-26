"use client";

import { useRef, useState, type KeyboardEvent, type MouseEvent, type Ref } from "react";
import {
  compararTallas,
  etiquetaDeTalla,
  nombreDeFamilia,
  sistemaDeTalla,
  unir,
  UNICA,
  type Elegido,
  type Faceta,
  type SistemaDeTalla,
} from "@/lib/filtros-color-talla";
import type { FamiliaDeColorId } from "@cayla-retail/shared/colores-de-la-tienda";
import { useFiltros } from "./ProveedorFiltros";

// El panel de COLOR o de TALLA (maqueta «Opción 1 · Filtros que se abren», ADR-0512 actividad 4): las opciones con cuántas prendas daría cada
// una, las que no darían ninguna apagadas y explicadas con una nota siempre a la vista (nunca solo con el mouse), y «Ver N prendas». Se abre
// bajo la barra pegada y se cuenta en vivo: no hay «Aplicar».

const SISTEMAS: { clave: SistemaDeTalla; titulo: string; nota?: string }[] = [
  { clave: "letra", titulo: "Ropa" },
  { clave: "cintura", titulo: "Cintura", nota: "pantalones, faldas y shorts" },
  { clave: "numero", titulo: "Número" },
  { clave: "otra", titulo: "Otras" },
  { clave: "unica", titulo: "Talla única" },
];

const prendas = (n: number) => `${n} ${n === 1 ? "prenda" : "prendas"}`;

/** «sin prendas en talla M»: lo que está elegido en la OTRA faceta explica por qué esta opción no suma. */
function otraFrase(faceta: Faceta, e: Elegido): string {
  if (faceta === "color") {
    return e.talla.length === 0 ? "" : `${e.talla.length === 1 ? "talla" : "tallas"} ${unir(e.talla.map((t) => (t === UNICA ? "estándar / única" : t)), "o")}`;
  }
  return unir(e.color.map(nombreDeFamilia), "o");
}

/** Un color claro lleva su ✓ en tinta; uno oscuro, en papel (el color de una muestra es un dato: no cambia con el tema). */
function luma(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
}

const Visto = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="square" aria-hidden="true">
    <path d="M5.5 12.5 10 17l8.5-9.5" />
  </svg>
);

/** Con las flechas se pasa de una opción a la vecina (las apagadas también se pueden enfocar y leer): la más cercana en esa dirección. */
function vecinoDe(actual: HTMLElement, tecla: string, lista: readonly HTMLElement[]): HTMLElement | null {
  const a = actual.getBoundingClientRect();
  const ax = a.left + a.width / 2;
  const ay = a.top + a.height / 2;
  let mejor: HTMLElement | null = null;
  let mejorD = Number.POSITIVE_INFINITY;
  for (const el of lista) {
    if (el === actual) continue;
    const r = el.getBoundingClientRect();
    const dx = r.left + r.width / 2 - ax;
    const dy = r.top + r.height / 2 - ay;
    const bien =
      tecla === "ArrowRight" ? dx > 4 && Math.abs(dy) < a.height / 2
      : tecla === "ArrowLeft" ? dx < -4 && Math.abs(dy) < a.height / 2
      : tecla === "ArrowDown" ? dy > a.height / 2
      : dy < -a.height / 2;
    if (!bien) continue;
    const dist = tecla === "ArrowRight" || tecla === "ArrowLeft" ? Math.abs(dx) : Math.abs(dy) * 4 + Math.abs(dx);
    if (dist < mejorD) {
      mejorD = dist;
      mejor = el;
    }
  }
  return mejor;
}

export function PanelDeFiltro({
  faceta,
  id,
  ref,
  cerrar,
}: {
  faceta: Faceta;
  id: string;
  ref: Ref<HTMLElement>;
  cerrar: (devolverFoco: boolean) => void;
}) {
  const f = useFiltros();
  const [voz, setVoz] = useState("");
  const [resalta, setResalta] = useState(false);
  const temporizador = useRef(0);
  if (!f) return null;
  const { elegido, vivo, estado } = f;
  const abierto = f.abierto === faceta;
  const esColor = faceta === "color";
  const otra = otraFrase(faceta, elegido);
  const total = vivo?.conteos.total ?? 0;
  const cuantas = (valor: string): number => (esColor ? vivo?.conteos.color.get(valor as FamiliaDeColorId) : vivo?.conteos.talla.get(valor)) ?? 0;
  const estaElegida = (valor: string): boolean => (elegido[faceta] as readonly string[]).includes(valor);

  // Cada opción: su número, y si está elegida, apagada (no daría nada) o «muerta» (elegida, pero con lo otro ya no queda nada).
  const opcion = (valor: string, nombre: string, hex: string | null) => {
    const n = cuantas(valor);
    const elegida = estaElegida(valor);
    const muerta = elegida && (vivo?.muertas[faceta] as readonly string[] | undefined)?.includes(valor) === true;
    const apagada = !elegida && n === 0;
    const situacion = muerta ? "muerta" : elegida ? "elegida" : apagada ? "apagada" : "libre";
    const lectura = muerta ? `${nombre}, elegido, pero sin prendas en ${otra}. Tócalo para quitarlo` : apagada ? `${nombre}, sin prendas en ${otra}` : `${nombre}, ${prendas(n)}`;
    const alPulsar = (e: MouseEvent<HTMLButtonElement>) => {
      if (!apagada) {
        f.tocar(faceta, valor);
        return;
      }
      // Una opción apagada que se toca responde: se sacude un poco y su nota se enciende un momento (y el lector la lee).
      setVoz("");
      requestAnimationFrame(() => setVoz(`${nombre}: sin prendas en ${otra}.`));
      const b = e.currentTarget;
      b.removeAttribute("data-sacude");
      void b.offsetWidth;
      b.setAttribute("data-sacude", "");
      window.setTimeout(() => b.removeAttribute("data-sacude"), 320);
      setResalta(true);
      window.clearTimeout(temporizador.current);
      temporizador.current = window.setTimeout(() => setResalta(false), 1600);
    };
    return (
      <button
        key={valor}
        type="button"
        className={`fp-op ${esColor ? "fp-op-color" : "fp-chip"}`}
        data-valor={valor}
        data-estado={situacion}
        aria-pressed={elegida}
        aria-disabled={apagada}
        aria-label={lectura}
        title={apagada ? `Sin prendas en ${otra}` : undefined}
        onClick={alPulsar}
      >
        {hex && (
          <span className="fp-mu" style={{ "--hex": hex, "--marca": luma(hex) > 0.6 ? "var(--t-tinta-fija)" : "var(--t-papel-fijo)" } as React.CSSProperties}>
            <Visto />
          </span>
        )}
        <span className="fp-nom">{nombre}</span>
        <span className="fp-n">{n}</span>
      </button>
    );
  };

  const ids: string[] = vivo ? (esColor ? vivo.opciones.familias.map((x) => x.id) : [...vivo.opciones.tallas]) : [];
  const muertas = vivo ? (vivo.muertas[faceta] as readonly string[]) : [];
  const apagadas = ids.filter((id) => !estaElegida(id) && cuantas(id) === 0);
  const nombreDe = (id: string) => (esColor ? nombreDeFamilia(id as FamiliaDeColorId) : etiquetaDeTalla(id));

  function alTeclear(e: KeyboardEvent<HTMLElement>) {
    if (!/^Arrow(Right|Left|Up|Down)$/.test(e.key)) return;
    const b = (e.target as HTMLElement).closest<HTMLElement>(".fp-op");
    if (!b) return;
    const lista = Array.from(e.currentTarget.querySelectorAll<HTMLElement>(".fp-op")).filter((x) => x.offsetParent !== null);
    const v = vecinoDe(b, e.key, lista);
    if (v) {
      e.preventDefault();
      v.focus();
    }
  }

  return (
    <section
      ref={ref}
      id={id}
      className="fp-panel"
      role="dialog"
      aria-label={esColor ? "Color" : "Talla"}
      data-abierto={abierto ? "" : undefined}
      inert={!abierto}
      tabIndex={-1}
      onKeyDown={alTeclear}
    >
      <div className="fp-p-cuerpo">
        <p className="fp-lema">{esColor ? "Elige uno o varios colores" : "Elige una o varias tallas"}</p>
        {!vivo ? (
          estado === "caida" ? (
            <p className="fp-nota" role="status">
              <span>No pudimos cargar {esColor ? "los colores" : "las tallas"} ahora. La lista sigue igual. </span>
              <button type="button" className="fp-enlace" onClick={f.cargar}>
                Volver a intentar
              </button>
            </p>
          ) : (
            <p className="fp-nota" role="status" aria-busy="true">
              <span>Un momento…</span>
            </p>
          )
        ) : esColor ? (
          <div className="fp-lista-color" role="group" aria-label="Colores">
            {vivo.opciones.familias.map((x) => opcion(x.id, x.nombre, x.muestra))}
          </div>
        ) : (
          SISTEMAS.map(({ clave, titulo, nota }) => {
            const tallas = vivo.opciones.tallas.filter((t) => sistemaDeTalla(t) === clave).sort(compararTallas);
            if (tallas.length === 0) return null;
            return (
              <div key={clave} className="fp-sis" data-sis={clave} role="group" aria-label={titulo}>
                <p className="fp-sis-t">
                  <span className="fp-etq">{titulo}</span>
                  {nota && <em>{nota}</em>}
                </p>
                <div className="fp-chips">{tallas.map((t) => opcion(t, etiquetaDeTalla(t), null))}</div>
              </div>
            );
          })
        )}
        {vivo && (
          <div className="fp-notas">
            {muertas.length > 0 && (
              <p className="fp-nota" data-tipo="muerta">
                <i className="fp-ley" />
                <span>
                  {unir(muertas.map(nombreDe), "y")}: sin prendas en {otra}. Quítalo con un toque.
                </span>
              </p>
            )}
            {apagadas.length > 0 && otra && (
              <p className="fp-nota" data-tipo="apagada" data-resalta={resalta ? "" : undefined}>
                <i className="fp-ley" />
                <span>En gris: sin prendas en {otra}.</span>
              </p>
            )}
            <p className="fp-nota" data-tipo="info">
              <span>
                El número es cuántas prendas hay en cada {esColor ? "color" : "talla"}.
                {elegido[faceta].length > 0 ? (esColor ? " Si eliges varios, ves las de todos." : " Si eliges varias, ves las de todas.") : ""}
              </span>
            </p>
          </div>
        )}
        <p className="t-sr" role="status" aria-live="polite">
          {voz}
        </p>
      </div>
      <div className="fp-p-pie">
        <button
          type="button"
          className="fp-qt fp-etq"
          hidden={elegido[faceta].length === 0}
          onClick={(e) => {
            f.quitar(faceta);
            // El botón se oculta: el foco pasa a donde la persona seguiría (la primera opción del panel).
            const panel = e.currentTarget.closest("section");
            requestAnimationFrame(() => panel?.querySelector<HTMLElement>(".fp-op")?.focus({ preventScroll: true }));
          }}
        >
          {esColor ? "Quitar colores" : "Quitar tallas"}
        </button>
        <button type="button" className="fp-cierra fp-etq" onClick={() => cerrar(true)}>
          Ver {prendas(total)}
        </button>
      </div>
    </section>
  );
}
