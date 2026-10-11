"use client";

import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { ChevronDown } from "lucide-react";
import { BarraApilada, MuestraTramo, type SegmentoBarra } from "@/components/ui/BarraApilada";
import { asignarGanchos, cifraEs as n, claseDeTramo, cuadriculaDelRiel, escalaDelRiel, prendasEs, tokenDeGrupo } from "@/lib/mix-piso-visual";
import { suscribirTema, temaDelDocumento } from "@/lib/tema-cliente";
import { TEMA_POR_DEFECTO } from "@/lib/tema-reglas";

// El riel a ESCALA (Plan del piso ▸ Propuesta, ADR-0329): dos barras con la MISMA capacidad —la de hoy y la de la propuesta— para que se vea lo
// que una tabla no dice: cuánto del riel está lleno (AQP: 78 de 1,800) y cómo se reparte entre los grupos. Lo libre es la pista de arena, sin
// dibujar nada: un riel casi vacío son 1,700 contornos iguales que tapan lo único que importa. Pasar el cursor (o enfocar con el teclado) por un
// grupo apaga los demás en las dos barras; tocarlo lo deja fijo.
//
// Las barras son `<BarraApilada>` (ADR-0358, la única barra del ERP). El riel con un gancho por prenda —el de ADR-0329— sigue ahí, pero detrás de
// «Ver cada gancho»: es lo que se abre para ESTAR en el piso, no lo que se necesita para decidir (ADR-0352, actualización 2026-10-10 (b)).
//
// Es una ayuda para ver, no la fuente: las mismas cifras están en la tabla de abajo, que es lo que lee un lector de pantalla (las barras y el canvas
// llevan su resumen en `aria-label`). Colores: solo tokens de la guía, leídos de las variables de CSS (`--color-*`) en el canvas.

export type GrupoDelRiel = { clave: string; nombre: string; hoy: number; propuesta: number };

// Un canvas no hereda el CSS: se le pasa el color ya resuelto. Se lee de la variable del token EN CADA DIBUJO (no se copia a una constante),
// para que siga al modo oscuro (ADR-0336), que redefine los mismos tokens; por eso el riel se repinta cuando cambia el tema (más abajo).
// `dibujar` solo corre en el navegador (dentro de un efecto), con las variables ya puestas; si una faltara, `currentColor` toma el del texto.
function colorDe(token: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(`--color-${token}`).trim() || "currentColor";
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
        if (tokenDeGrupo(grupo) === "sand") {
          // El sexto grupo se dibuja como su tramo en las barras (`claseDeTramo`: taupe a 45 % sobre arena), no como arena lisa que se pierde sobre el papel.
          ctx.fillStyle = colores[((grupo % 6) + 6) % 6]!;
          ctx.fill();
          ctx.globalAlpha *= 0.45;
          ctx.fillStyle = libre;
          ctx.fill();
        } else {
          ctx.fillStyle = colores[((grupo % 6) + 6) % 6]!;
          ctx.fill();
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
  // El servidor pinta el claro y al hidratar se corrige (el mismo patrón del botón del tema): el canvas solo se dibuja en el navegador.
  const tema = useSyncExternalStore(suscribirTema, temaDelDocumento, () => TEMA_POR_DEFECTO);
  const [tip, setTip] = useState<{ x: number; y: number; texto: string } | null>(null);
  const cuadricula = useMemo(() => cuadriculaDelRiel(ganchos.length, ancho), [ganchos.length, ancho]);

  useEffect(() => {
    if (canvas.current && ancho > 0) dibujar(canvas.current, ganchos, ancho, foco, atenuado);
  }, [ganchos, ancho, foco, atenuado, tema]);

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

/** Una barra del riel («Hoy» o «Propuesta»): un tramo por grupo, todos sobre la misma capacidad; lo que no se llena queda de pista (lo libre). */
function Banda({
  titulo,
  cuando,
  nota,
  grupos,
  cifra,
  escala,
  resumen,
  atenuada,
  retraso,
  claveEnFoco,
  claveFija,
  onApuntar,
  onElegir,
  onSoltar,
}: {
  titulo: string;
  /** Cómo se dice de qué barra es cada tramo para el lector de pantalla: «hoy», «en la propuesta» (las dos barras repiten los mismos grupos). */
  cuando: string;
  nota: string;
  grupos: GrupoDelRiel[];
  cifra: (g: GrupoDelRiel) => number;
  /** Lo que vale el 100 % de la pista, el MISMO en las dos barras (`escalaDelRiel`): lo que sobra de lo que se llena es lo libre. */
  escala: number;
  resumen: string;
  atenuada: boolean;
  retraso: number;
  claveEnFoco: string | null;
  claveFija: string | null;
  onApuntar: (clave: string | null) => void;
  onElegir: (clave: string) => void;
  /** Se tocó lo libre de la barra (no un tramo): suelta el grupo fijo, como hacía tocar un gancho vacío en el canvas. */
  onSoltar: () => void;
}) {
  const segmentos: SegmentoBarra[] = grupos.map((g, i) => ({
    clave: g.clave,
    nombre: g.nombre,
    valor: cifra(g),
    clase: claseDeTramo(i),
    titulo: `${g.nombre} · ${prendasEs(cifra(g))}`,
    // Sin esto el lector diría «Jeans: 3» en una barra y «Jeans: 169» en la otra, sin decir cuál es cuál ni de qué.
    etiqueta: `${g.nombre}: ${prendasEs(cifra(g))} ${cuando}. Resaltar este grupo en las dos barras`,
  }));
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-3 text-xs">
        <span className="font-medium text-tinta">{titulo}</span>
        <span className="text-right text-taupe">{nota}</span>
      </div>
      {/* Una sede que no cuadró su piso dibuja «Hoy» más tenue (lo que cuelga de verdad puede ser muy distinto), como lo hacía el canvas. */}
      <div className={atenuada ? "opacity-60" : undefined} onClick={(e) => { if (!(e.target as HTMLElement).closest("button")) onSoltar(); }}>
        <BarraApilada
          segmentos={segmentos}
          unidad="ganchos"
          etiqueta={resumen}
          total={escala}
          alto={12}
          retraso={retraso}
          respuesta={{ onApuntar, onElegir, elegida: claveFija, resaltada: claveEnFoco }}
        />
      </div>
    </div>
  );
}

export function RielAEscala({ grupos, capacidad, cuadrado }: { grupos: GrupoDelRiel[]; capacidad: number; cuadrado: boolean }) {
  const caja = useRef<HTMLDivElement>(null);
  const idGanchos = useId();
  const [ancho, setAncho] = useState(0);
  const [hover, setHover] = useState(-1);
  const [fijo, setFijo] = useState(-1);
  const [verGanchos, setVerGanchos] = useState(false);
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
  // Las dos barras se miden contra lo mismo: si hoy cuelga más de lo que cabe, la propuesta (que suma la capacidad) queda más corta que «Hoy» en vez de estirarse a su ancho.
  const escala = escalaDelRiel(capacidad, grupos.reduce((s, g) => s + Math.max(0, g.hoy), 0), grupos.reduce((s, g) => s + Math.max(0, g.propuesta), 0));
  const lista = (cifra: (g: GrupoDelRiel) => number) => grupos.filter((g) => cifra(g) > 0).map((g) => `${g.nombre} ${n(cifra(g))}`).join(", ");
  const indiceDe = (clave: string | null) => (clave === null ? -1 : grupos.findIndex((g) => g.clave === clave));
  const claveDe = (i: number) => (i >= 0 ? (grupos[i]?.clave ?? null) : null);
  const apuntar = (clave: string | null) => setHover(indiceDe(clave));
  const elegir = (clave: string) => setFijo((f) => (f === indiceDe(clave) ? -1 : indiceDe(clave)));
  const notaHoy = cuadrado
    ? `${n(hoy.ocupados)} de ${n(capacidad)} ganchos ocupados · ${pctHoy} %`
    : `por cuadrar · ${n(hoy.ocupados)} de ${n(capacidad)} según el sistema`;
  const resumenHoy = `Riel de hoy: ${n(hoy.ocupados)} de ${n(capacidad)} ganchos ocupados. ${lista((g) => g.hoy)}.`;
  const resumenPropuesta = `Riel de la propuesta: ${n(propuesta.ocupados)} de ${n(capacidad)} ganchos. ${lista((g) => g.propuesta)}.`;

  return (
    <div ref={caja} className="space-y-4">
      <Banda
        titulo="Hoy"
        cuando="hoy"
        nota={notaHoy}
        grupos={grupos}
        cifra={(g) => g.hoy}
        escala={escala}
        resumen={resumenHoy}
        atenuada={!cuadrado}
        retraso={0}
        claveEnFoco={claveDe(foco)}
        claveFija={claveDe(fijo)}
        onApuntar={apuntar}
        onElegir={elegir}
        onSoltar={() => setFijo(-1)}
      />
      <Banda
        titulo="Propuesta"
        cuando="en la propuesta"
        nota={`${n(propuesta.ocupados)} de ${n(capacidad)} ganchos`}
        grupos={grupos}
        cifra={(g) => g.propuesta}
        escala={escala}
        resumen={resumenPropuesta}
        atenuada={false}
        retraso={2}
        claveEnFoco={claveDe(foco)}
        claveFija={claveDe(fijo)}
        onApuntar={apuntar}
        onElegir={elegir}
        onSoltar={() => setFijo(-1)}
      />
      {hoy.deMas > 0 && <p className="text-xs text-taupe">Cuelgan {n(hoy.deMas)} prendas más de las que caben en el riel (no hay más ganchos).</p>}
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
              <MuestraTramo clase={claseDeTramo(i)} />
              <span className="text-tinta">{g.nombre}</span>
              <span className="tabular-nums text-taupe">
                {n(g.hoy)} → {n(g.propuesta)}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {/* El riel con un gancho por prenda: lo de siempre, pero cerrado. Con 1,800 ganchos son 960 px de contornos que empujan la respuesta bajo el pliegue. */}
      <div className="border-t border-sand pt-3">
        <button
          type="button"
          aria-expanded={verGanchos}
          aria-controls={idGanchos}
          onClick={() => setVerGanchos((v) => !v)}
          className="btn-cayla btn-sutil gap-1.5"
        >
          <ChevronDown aria-hidden className={`h-4 w-4 transition-transform duration-200 ease-cayla motion-reduce:transition-none ${verGanchos ? "rotate-180" : ""}`} />
          {verGanchos ? "Ocultar los ganchos" : `Ver cada gancho (${n(capacidad)})`}
        </button>
        <div id={idGanchos} hidden={!verGanchos} className="mt-3 space-y-4">
          {verGanchos && (
            <>
              <p className="text-xs text-taupe">Cada gancho es una prenda y los dos rieles tienen la misma capacidad.</p>
              <Riel
                titulo="Hoy"
                nota={notaHoy}
                ganchos={hoy.ganchos}
                ancho={ancho}
                foco={foco}
                atenuado={!cuadrado}
                resumen={resumenHoy}
                grupos={grupos}
                cifra={(g) => g.hoy}
                onFoco={setHover}
                onFijar={(g) => setFijo((f) => (f === g ? -1 : g))}
              />
              <Riel
                titulo="Propuesta"
                nota={`${n(propuesta.ocupados)} de ${n(capacidad)} ganchos`}
                ganchos={propuesta.ganchos}
                ancho={ancho}
                foco={foco}
                atenuado={false}
                resumen={resumenPropuesta}
                grupos={grupos}
                cifra={(g) => g.propuesta}
                onFoco={setHover}
                onFijar={(g) => setFijo((f) => (f === g ? -1 : g))}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
