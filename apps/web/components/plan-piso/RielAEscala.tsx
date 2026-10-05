"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { asignarGanchos, cuadriculaDelRiel, fondoDeGrupo, tokenDeGrupo, type TokenDeGrupo } from "@/lib/mix-piso-visual";

// El riel a ESCALA (Plan del piso ▸ Propuesta, ADR-0329): una prenda es un gancho. Dos rieles con la MISMA capacidad —el de hoy y el de la
// propuesta— para que se vea lo que una tabla no dice: cuánto del riel está lleno (TRU: 61 de 600) y cómo se reparte entre los grupos. Pasar el
// cursor (o enfocar con el teclado) por un grupo apaga los demás en los dos rieles; tocarlo lo deja fijo.
//
// Es una ayuda para ver, no la fuente: las mismas cifras están en la tabla de abajo, que es lo que lee un lector de pantalla (el canvas lleva su
// resumen en `aria-label`). Colores: solo tokens de la guía, leídos de las variables de CSS (`--color-*`), y sin movimiento: dibuja y listo.

export type GrupoDelRiel = { clave: string; nombre: string; hoy: number; propuesta: number };

const FALLBACK: Record<TokenDeGrupo | "taupe" | "sand", string> = { tinta: "#1a1a18", pizarra: "#4c5d6e", verde: "#48603f", ambar: "#74501a", taupe: "#805c4c", sand: "#eae1d2" };

function colorDe(token: string): string {
  if (typeof window === "undefined") return FALLBACK[token as keyof typeof FALLBACK] ?? "#1a1a18";
  const v = getComputedStyle(document.documentElement).getPropertyValue(`--color-${token}`).trim();
  return v || FALLBACK[token as keyof typeof FALLBACK] || "#1a1a18";
}

/** Dibuja un riel: una fila de ganchos por fila de la cuadrícula, cada prenda como una camisa colgada. Los libres, solo el contorno. */
function dibujar(canvas: HTMLCanvasElement, ganchos: number[], ancho: number, foco: number, atenuado: boolean) {
  const g = cuadriculaDelRiel(ganchos.length, ancho);
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.floor(g.ancho * dpr);
  canvas.height = Math.floor(g.alto * dpr);
  canvas.style.width = `${g.ancho}px`;
  canvas.style.height = `${g.alto}px`;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, g.ancho, g.alto);
  const cw = g.ancho / g.columnas;
  const rh = cw * 1.5;
  const linea = colorDe("sand");
  const libre = colorDe("taupe");
  const borde = colorDe("taupe");
  const colores = [0, 1, 2, 3, 4, 5].map((i) => colorDe(tokenDeGrupo(i)));
  for (let r = 0; r < g.filas; r++) {
    const y = 3 + r * rh;
    ctx.strokeStyle = linea;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(g.ancho, y);
    ctx.stroke();
    for (let c = 0; c < g.columnas; c++) {
      const i = r * g.columnas + c;
      if (i >= ganchos.length) break;
      const grupo = ganchos[i]!;
      const x = c * cw + cw / 2;
      const w = cw * 0.74;
      const h = Math.min(rh * 0.74, w * 1.25);
      const y0 = y + 3;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y0);
      ctx.strokeStyle = linea;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x - 0.2 * w, y0);
      ctx.lineTo(x + 0.2 * w, y0);
      ctx.lineTo(x + 0.5 * w, y0 + 0.22 * h);
      ctx.lineTo(x + 0.5 * w, y0 + h);
      ctx.lineTo(x - 0.5 * w, y0 + h);
      ctx.lineTo(x - 0.5 * w, y0 + 0.22 * h);
      ctx.closePath();
      const apagado = foco >= 0 && grupo !== foco;
      const base = atenuado ? 0.55 : 1;
      if (grupo < 0) {
        ctx.globalAlpha = foco >= 0 ? 0.15 : 0.45;
        ctx.strokeStyle = libre;
        ctx.lineWidth = 1;
        ctx.stroke();
      } else {
        ctx.globalAlpha = (apagado ? 0.14 : 1) * base;
        ctx.fillStyle = colores[((grupo % 6) + 6) % 6]!;
        ctx.fill();
        // El color más claro (sand) se pierde sobre el papel: lleva un borde.
        if (tokenDeGrupo(grupo) === "sand") {
          ctx.strokeStyle = borde;
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
    }
  }
}

function Riel({
  titulo,
  nota,
  ganchos,
  ancho,
  foco,
  atenuado,
  resumen,
  grupos,
  cifra,
  onFoco,
  onFijar,
}: {
  titulo: string;
  nota: string;
  ganchos: number[];
  ancho: number;
  foco: number;
  atenuado: boolean;
  resumen: string;
  grupos: GrupoDelRiel[];
  cifra: (g: GrupoDelRiel) => number;
  onFoco: (g: number) => void;
  onFijar: (g: number) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [tip, setTip] = useState<{ x: number; y: number; texto: string } | null>(null);
  const cuadricula = useMemo(() => cuadriculaDelRiel(ganchos.length, ancho), [ganchos.length, ancho]);

  useEffect(() => {
    if (canvas.current && ancho > 0) dibujar(canvas.current, ganchos, ancho, foco, atenuado);
  }, [ganchos, ancho, foco, atenuado]);

  function grupoEn(e: React.MouseEvent<HTMLCanvasElement>): number | null {
    const el = canvas.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const col = Math.floor(((e.clientX - r.left) / r.width) * cuadricula.columnas);
    const fila = Math.floor((e.clientY - r.top - 3) / (cuadricula.ancho / cuadricula.columnas * 1.5));
    if (col < 0 || col >= cuadricula.columnas || fila < 0 || fila >= cuadricula.filas) return null;
    const i = fila * cuadricula.columnas + col;
    return i < ganchos.length ? ganchos[i]! : null;
  }

  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3 text-xs">
        <span className="font-medium text-tinta">{titulo}</span>
        <span className="text-taupe">{nota}</span>
      </div>
      <div className="relative">
        <canvas
          ref={canvas}
          role="img"
          aria-label={resumen}
          className="block w-full cursor-crosshair"
          style={{ height: cuadricula.alto }}
          onMouseMove={(e) => {
            const g = grupoEn(e);
            if (g === null || g < 0) {
              setTip(null);
              onFoco(-1);
              return;
            }
            const grupo = grupos[g];
            const rect = e.currentTarget.getBoundingClientRect();
            onFoco(g);
            setTip({ x: Math.min(e.clientX - rect.left + 12, rect.width - 190), y: e.clientY - rect.top + 12, texto: grupo ? `${grupo.nombre} · ${cifra(grupo)} prendas` : "" });
          }}
          onMouseLeave={() => {
            setTip(null);
            onFoco(-1);
          }}
          onClick={(e) => {
            const g = grupoEn(e);
            onFijar(g === null || g < 0 ? -1 : g);
          }}
        />
        {tip && (
          <div role="status" className="pointer-events-none absolute z-10 max-w-[190px] rounded-[10px] bg-tinta px-2.5 py-1.5 text-xs leading-snug text-crema" style={{ left: Math.max(4, tip.x), top: tip.y }}>
            {tip.texto}
          </div>
        )}
      </div>
    </div>
  );
}

export function RielAEscala({ grupos, capacidad, cuadrado }: { grupos: GrupoDelRiel[]; capacidad: number; cuadrado: boolean }) {
  const caja = useRef<HTMLDivElement>(null);
  const [ancho, setAncho] = useState(0);
  const [hover, setHover] = useState(-1);
  const [fijo, setFijo] = useState(-1);
  const foco = fijo >= 0 ? fijo : hover;

  useEffect(() => {
    const el = caja.current;
    if (!el) return;
    const medir = () => setAncho(Math.floor(el.clientWidth));
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const hoy = useMemo(() => asignarGanchos(grupos.map((g) => g.hoy), capacidad), [grupos, capacidad]);
  const propuesta = useMemo(() => asignarGanchos(grupos.map((g) => g.propuesta), capacidad), [grupos, capacidad]);
  const pctHoy = capacidad > 0 ? Math.round((hoy.ocupados / capacidad) * 100) : 0;
  const lista = (cifra: (g: GrupoDelRiel) => number) => grupos.filter((g) => cifra(g) > 0).map((g) => `${g.nombre} ${cifra(g)}`).join(", ");

  return (
    <div ref={caja} className="space-y-4">
      <Riel
        titulo="Hoy"
        nota={cuadrado ? `${hoy.ocupados} de ${capacidad} ganchos ocupados · ${pctHoy} %` : `por cuadrar · ${hoy.ocupados} de ${capacidad} según el sistema`}
        ganchos={hoy.ganchos}
        ancho={ancho}
        foco={foco}
        atenuado={!cuadrado}
        resumen={`Riel de hoy: ${hoy.ocupados} de ${capacidad} ganchos ocupados. ${lista((g) => g.hoy)}.`}
        grupos={grupos}
        cifra={(g) => g.hoy}
        onFoco={setHover}
        onFijar={(g) => setFijo((f) => (f === g ? -1 : g))}
      />
      <Riel
        titulo="Propuesta"
        nota={`${propuesta.ocupados} de ${capacidad} ganchos`}
        ganchos={propuesta.ganchos}
        ancho={ancho}
        foco={foco}
        atenuado={false}
        resumen={`Riel de la propuesta: ${propuesta.ocupados} de ${capacidad} ganchos. ${lista((g) => g.propuesta)}.`}
        grupos={grupos}
        cifra={(g) => g.propuesta}
        onFoco={setHover}
        onFijar={(g) => setFijo((f) => (f === g ? -1 : g))}
      />
      {hoy.deMas > 0 && <p className="text-xs text-taupe">Cuelgan {hoy.deMas} prendas más de las que caben en el riel (no se dibujan: no hay más ganchos).</p>}
      <ul className="flex flex-wrap gap-2" aria-label="Grupos del riel: toca uno para resaltarlo">
        {grupos.map((g, i) => (
          <li key={g.clave}>
            <button
              type="button"
              aria-pressed={fijo === i}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(-1)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(-1)}
              onClick={() => setFijo((f) => (f === i ? -1 : i))}
              className={`flex items-center gap-2 rounded-[10px] border px-2.5 py-1.5 text-left text-xs transition-colors ${fijo === i ? "border-tinta bg-sand" : "border-sand bg-papel hover:border-taupe/50"}`}
            >
              <span aria-hidden className={`h-3 w-3 shrink-0 rounded-[3px] ${fondoDeGrupo(i).split(" ")[0]} ${tokenDeGrupo(i) === "sand" ? "border border-taupe/50" : ""}`} />
              <span className="text-tinta">{g.nombre}</span>
              <span className="tabular-nums text-taupe">
                {g.hoy} → {g.propuesta}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
