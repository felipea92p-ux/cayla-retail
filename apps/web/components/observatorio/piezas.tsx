"use client";

// Las piezas del Observatorio (ADR-0322), con el movimiento de la maqueta aprobada (docs/maquetas/inicio-admin-v3-2026-10/):
// cifras que cuentan (`Cifra`) o ruedan dígito por dígito (`Odometro`), barras y anillos que crecen desde cero al llegar y
// después van de su valor viejo al nuevo, trazos que se dibujan de izquierda a derecha (`Revela`) y se transforman punto
// por punto cuando cambian los datos (`Trazo`), y el control segmentado con su indicador que se desliza (`Segmento`).
//
// Todo lee el contexto de la pantalla: `entrando` (la primera llegada: las cifras arrancan en cero), `rapido` («Repetir el
// día»: todo en 110 ms, lineal) y `reducido` (`prefers-reduced-motion`: salta al valor).

import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { formatoSoles } from "@/lib/resumen-formato";
import { formatoVariacionObs } from "@/lib/observatorio-reglas";

export type Formato = "s" | "n" | "p" | "v" | "d";

export function fmt(f: Formato, v: number): string {
  if (f === "s") return formatoSoles(v);
  if (f === "n") return Math.round(v).toLocaleString("en-US");
  if (f === "p") return `${Math.round(v)}%`;
  if (f === "v") return formatoVariacionObs(v);
  return (Math.round(v * 10) / 10).toFixed(1);
}

const recortar = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

// ── Contexto de la pantalla ───────────────────────────────────────────────────────────────────────────────────────────

export type ContextoObs = {
  entrando: boolean;
  rapido: boolean;
  reducido: boolean;
  mostrarTip: (contenido: ReactNode, x: number, y: number) => void;
  ocultarTip: () => void;
};

export const ObsCtx = createContext<ContextoObs>({
  entrando: false,
  rapido: false,
  reducido: false,
  mostrarTip: () => {},
  ocultarTip: () => {},
});

export const useObs = () => useContext(ObsCtx);

export function useReducido(): boolean {
  const [reducido, setReducido] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    const cambiar = () => setReducido(m.matches);
    cambiar();
    m.addEventListener("change", cambiar);
    return () => m.removeEventListener("change", cambiar);
  }, []);
  return reducido;
}

// ── Arranque: lo que crece desde cero al aparecer ─────────────────────────────────────────────────────────────────────

export type Arranque = {
  /** `false` en el primer cuadro (se pinta el valor inicial, 0) y `true` dos cuadros después (la transición arranca). */
  listo: boolean;
  /** El retraso de la cascada de llegada; después de la llegada, ninguno (un cambio responde en el acto). */
  demora: (ms: number) => string | undefined;
};

/** Un bloque que «se arma» al aparecer: sus barras y anillos arrancan en cero y crecen con la cascada de la maqueta.
 *  `activo = false` lo deja esperando (por ejemplo, hasta que la persona lo ve). */
export function useArranque(activo = true): Arranque {
  const [listo, setListo] = useState(false);
  const [primera, setPrimera] = useState(true);
  useEffect(() => {
    if (!activo || listo) return;
    let b = 0;
    const a = requestAnimationFrame(() => {
      b = requestAnimationFrame(() => setListo(true));
    });
    return () => {
      cancelAnimationFrame(a);
      cancelAnimationFrame(b);
    };
  }, [activo, listo]);
  useEffect(() => {
    if (!listo) return;
    const t = setTimeout(() => setPrimera(false), 2800);
    return () => clearTimeout(t);
  }, [listo]);
  return { listo, demora: (ms) => (primera && ms ? `${ms}ms` : undefined) };
}

/** El ancho de una barra que crece desde cero (`pct` de 0 a 100). */
export function ancho(a: Arranque, pct: number, dl = 0): CSSProperties {
  return { width: a.listo ? `${recortar(pct, 0, 100).toFixed(1)}%` : "0%", transitionDelay: a.demora(dl) };
}

// ── Cifras ────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Una cifra que cuenta: en la llegada, desde 0 (1,2 s, después de `retraso`); después, del valor viejo al nuevo. */
export function Cifra({ v, f = "s", retraso = 200, activo = true }: { v: number; f?: Formato; retraso?: number; activo?: boolean }) {
  const { entrando, rapido, reducido } = useObs();
  const [desdeCero] = useState(entrando);
  const [mostrado, setMostrado] = useState(desdeCero ? 0 : v);
  const enPantalla = useRef(desdeCero ? 0 : v);
  const llegada = useRef(desdeCero);

  useEffect(() => {
    if (!activo) return;
    const desde = enPantalla.current;
    if (desde === v) {
      llegada.current = false;
      return;
    }
    let cuadro = 0;
    if (reducido) {
      cuadro = requestAnimationFrame(() => {
        enPantalla.current = v;
        setMostrado(v);
      });
      return () => cancelAnimationFrame(cuadro);
    }
    const esLlegada = llegada.current;
    const ms = esLlegada ? 1200 : rapido ? 110 : 700;
    const t0 = performance.now() + (esLlegada ? retraso : 0);
    const paso = (t: number) => {
      const x = recortar((t - t0) / ms, 0, 1);
      const k = rapido ? x : 1 - Math.pow(1 - x, 3);
      const valor = x >= 1 ? v : desde + (v - desde) * k;
      enPantalla.current = valor;
      setMostrado(valor);
      if (x < 1) cuadro = requestAnimationFrame(paso);
      else llegada.current = false;
    };
    cuadro = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(cuadro);
  }, [v, activo, reducido, rapido, retraso]);

  return <span className="o-k">{fmt(f, mostrado)}</span>;
}

const DIGITOS = Array.from({ length: 30 }, (_, i) => i % 10);
const posicion = (n: number) => `translateY(${(-n * 100) / 30}%)`;

/**
 * Una cifra grande que rueda como un odómetro: cada dígito es una tira 0-9 (tres veces) que gira hasta su número. Al
 * aparecer gira desde el 0 dos vueltas, en cascada de izquierda a derecha; al cambiar, cada dígito va del viejo al nuevo.
 */
export function Odometro({ v, f = "s", retraso = 200 }: { v: number; f?: Formato; retraso?: number }) {
  const { entrando, rapido, reducido } = useObs();
  const texto = fmt(f, v);
  const raiz = useRef<HTMLSpanElement>(null);
  const previo = useRef<string | null>(null);
  const [nacioEntrando] = useState(entrando);

  useLayoutEffect(() => {
    const el = raiz.current;
    if (!el) return;
    const tiras = [...el.querySelectorAll<HTMLElement>(".tira")];
    const antes = previo.current;
    previo.current = texto;
    if (reducido) {
      for (const t of tiras) {
        t.style.transition = "none";
        t.style.transform = posicion(10 + Number(t.dataset.d));
      }
      return;
    }
    const llegada = antes === null;
    const viejos = antes ? [...antes].filter((c) => /\d/.test(c)) : [];
    const n = tiras.length;
    const movimientos: [HTMLElement, number, number, number][] = [];
    tiras.forEach((t, i) => {
      const d = Number(t.dataset.d);
      const desdeLaDerecha = n - 1 - i;
      let desde: number;
      let hasta: number;
      if (llegada) {
        desde = 0;
        hasta = 20 + d;
      } else {
        const pv = viejos[viejos.length - 1 - desdeLaDerecha];
        desde = pv === undefined ? 10 : 10 + Number(pv);
        hasta = 10 + d;
      }
      t.style.transition = "none";
      t.style.transform = posicion(desde);
      if (desde === hasta) return;
      const base = nacioEntrando ? retraso : 420;
      movimientos.push([t, hasta, llegada ? base + i * 85 : i * 35, llegada ? 1500 + (n - i) * 90 : rapido ? 110 : 900]);
    });
    if (!movimientos.length) return;
    void el.getBoundingClientRect();
    let b = 0;
    const a = requestAnimationFrame(() => {
      b = requestAnimationFrame(() => {
        for (const [t, hasta, dl, du] of movimientos) {
          t.style.transition = `transform ${du}ms ${rapido ? "linear" : "cubic-bezier(.16,.84,.28,1)"} ${dl}ms`;
          t.style.transform = posicion(hasta);
        }
      });
    });
    return () => {
      cancelAnimationFrame(a);
      cancelAnimationFrame(b);
    };
    // `rapido`, `retraso` y `reducido` se leen al momento de rodar: no hacen rodar por sí solos.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texto]);

  const chars = [...texto];
  return (
    <span className="o-odo" ref={raiz} aria-label={texto} role="img">
      {chars.map((c, i) => {
        const clave = chars.length - 1 - i;
        if (!/\d/.test(c)) {
          return (
            <span key={`s${clave}`} className="sep" aria-hidden="true">
              {c === " " ? " " : c}
            </span>
          );
        }
        return (
          <span key={`d${clave}`} className="dg" aria-hidden="true">
            <span className="tira" data-d={c} style={{ transform: posicion(10 + Number(c)) }}>
              {DIGITOS.map((d, j) => (
                <span key={j}>{d}</span>
              ))}
            </span>
          </span>
        );
      })}
    </span>
  );
}

// ── Anillo de meta ────────────────────────────────────────────────────────────────────────────────────────────────────

export function Anillo({ pct, a, r = 52, w = 8, dl = 250 }: { pct: number | null; a: Arranque; r?: number; w?: number; dl?: number }) {
  const p = recortar(pct ?? 0, 0, 100);
  return (
    <svg viewBox="0 0 120 120" className="o-anillo" aria-hidden="true">
      <circle cx="60" cy="60" r={r} className="o-an-f" strokeWidth={w} />
      <circle
        cx="60"
        cy="60"
        r={r}
        pathLength={100}
        strokeWidth={w}
        className={`o-an-v ${(pct ?? 0) >= 100 ? "ok" : ""}`}
        style={{ strokeDasharray: a.listo ? `${p.toFixed(2)} 100` : "0 100", transitionDelay: a.demora(dl) }}
      />
    </svg>
  );
}

// ── Control segmentado ────────────────────────────────────────────────────────────────────────────────────────────────

export function Segmento<T extends string>({
  valor,
  opciones,
  onValor,
  onPasar,
  chico = false,
  etiqueta,
}: {
  valor: T;
  opciones: readonly (readonly [T, ReactNode])[];
  onValor: (v: T) => void;
  onPasar?: (v: T) => void;
  chico?: boolean;
  etiqueta: string;
}) {
  const i = Math.max(0, opciones.findIndex((o) => o[0] === valor));
  return (
    <div className={`o-sd ${chico ? "chico" : ""}`} style={{ "--n": opciones.length } as CSSProperties} role="tablist" aria-label={etiqueta}>
      <i className="o-sd-ind" style={{ transform: `translateX(${i * 100}%)` }} />
      {opciones.map(([v, t]) => (
        <button
          key={v}
          type="button"
          role="tab" // unificar-fijo: Segmento del Observatorio, ADR-0322
          aria-selected={v === valor}
          className={v === valor ? "on" : ""}
          onClick={() => onValor(v)}
          onPointerEnter={onPasar ? () => onPasar(v) : undefined}
          onFocus={onPasar ? () => onPasar(v) : undefined}
        >
          {t}
        </button>
      ))}
    </div>
  );
}

// ── Trazos ────────────────────────────────────────────────────────────────────────────────────────────────────────────

export type PuntoGraf = readonly [number, number];

/** Curva suave que pasa por los puntos sin pasarse de largo (monótona: un acumulado nunca parece bajar). */
function curvaSuave(pts: readonly PuntoGraf[]): string {
  const p = pts.filter((q, i) => i === 0 || Math.abs(q[0] - pts[i - 1][0]) > 0.01 || Math.abs(q[1] - pts[i - 1][1]) > 0.01);
  const n = p.length;
  const f = (v: number) => v.toFixed(2);
  if (n === 0) return "";
  if (n < 3) return `M${p.map((q) => `${f(q[0])} ${f(q[1])}`).join(" L")}`;
  const dx: number[] = [];
  const m: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx.push(p[i + 1][0] - p[i][0]);
    m.push(dx[i] > 1e-6 ? (p[i + 1][1] - p[i][1]) / dx[i] : 0);
  }
  const t = [m[0]];
  for (let i = 1; i < n - 1; i++) t.push(m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2);
  t.push(m[n - 2]);
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) {
      t[i] = 0;
      t[i + 1] = 0;
      continue;
    }
    const a = t[i] / m[i];
    const b = t[i + 1] / m[i];
    const h = a * a + b * b;
    if (h > 9) {
      const k = 3 / Math.sqrt(h);
      t[i] = k * a * m[i];
      t[i + 1] = k * b * m[i];
    }
  }
  let d = `M${f(p[0][0])} ${f(p[0][1])}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d += ` C${f(p[i][0] + h)} ${f(p[i][1] + t[i] * h)} ${f(p[i + 1][0] - h)} ${f(p[i + 1][1] - t[i + 1] * h)} ${f(p[i + 1][0])} ${f(p[i + 1][1])}`;
  }
  return d;
}

function trazoDe(pts: readonly PuntoGraf[], tipo: "l" | "a"): string {
  let d = curvaSuave(pts);
  if (tipo === "a" && pts.length) d += ` L${pts[pts.length - 1][0].toFixed(2)} 100 L${pts[0][0].toFixed(2)} 100 Z`;
  return d;
}

/** Una línea (`l`) o un área (`a`) de un gráfico 100×100. Si cambian los datos con la misma cantidad de puntos, se
 *  transforma punto por punto (800 ms); si no, se redibuja (el `Revela` de afuera lo vuelve a trazar). */
export function Trazo({ pts, tipo, className }: { pts: readonly PuntoGraf[]; tipo: "l" | "a"; className: string }) {
  const { rapido, reducido } = useObs();
  const ref = useRef<SVGPathElement>(null);
  const pintado = useRef<readonly PuntoGraf[]>(pts);
  const [inicial] = useState(() => trazoDe(pts, tipo));
  const firma = JSON.stringify(pts);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const desde = pintado.current;
    const hasta = pts;
    pintado.current = hasta;
    if (desde === hasta) return;
    if (reducido || desde.length !== hasta.length) {
      el.setAttribute("d", trazoDe(hasta, tipo));
      return;
    }
    const t0 = performance.now();
    const ms = rapido ? 110 : 800;
    let cuadro = 0;
    const paso = (t: number) => {
      const x = recortar((t - t0) / ms, 0, 1);
      const k = rapido ? x : 1 - Math.pow(1 - x, 3);
      el.setAttribute("d", trazoDe(desde.map((p, i) => [p[0] + (hasta[i][0] - p[0]) * k, p[1] + (hasta[i][1] - p[1]) * k] as const), tipo));
      if (x < 1) cuadro = requestAnimationFrame(paso);
    };
    cuadro = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(cuadro);
    // la firma resume los puntos: un arreglo nuevo con los mismos valores no es un cambio
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firma, tipo]);

  return <path ref={ref} className={className} d={inicial} />;
}

/** El lienzo 100×100 de un gráfico que se dibuja de izquierda a derecha al aparecer (y al volver a montarse). */
export function Revela({ children, activo = true }: { children: ReactNode; activo?: boolean }) {
  const [ya, setYa] = useState(false);
  useEffect(() => {
    if (!activo || ya) return;
    let b = 0;
    const a = requestAnimationFrame(() => {
      b = requestAnimationFrame(() => setYa(true));
    });
    return () => {
      cancelAnimationFrame(a);
      cancelAnimationFrame(b);
    };
  }, [activo, ya]);
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className={`o-revela${ya ? " ya" : ""}`} aria-hidden="true">
      {children}
    </svg>
  );
}

/** Mini gráfico de área (tickets o prendas por hora o por día). */
export function Spark({ valores }: { valores: readonly number[] }) {
  const mx = Math.max(...valores, 1);
  const n = valores.length;
  const pts = valores.map((v, i) => [n === 1 ? 50 : (i / (n - 1)) * 100, 100 - (v / mx) * 92] as const);
  return (
    <div className="o-graf o-spark">
      <Revela key={n}>
        <Trazo pts={pts} tipo="a" className="ar" />
        <Trazo pts={pts} tipo="l" className="ln f" />
      </Revela>
    </div>
  );
}

/** Iniciales de un nombre («Rosa Quispe» → «RQ»). */
export function iniciales(nombre: string): string {
  return nombre
    .split(/\s+/)
    .filter(Boolean)
    .map((x) => x[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}
