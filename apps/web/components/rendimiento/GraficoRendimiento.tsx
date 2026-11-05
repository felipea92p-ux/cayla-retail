"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as PE } from "react";
import { Pause, Play } from "lucide-react";
import { SegmentoDeslizante } from "@/components/ui/SegmentoDeslizante";
import { avance } from "@/lib/rendimiento-meta-reglas";
import {
  diasParaGrafico,
  gestoEn,
  mesPasadoEnEje,
  metaSumadaDelMes,
  sumadoDelMes,
  tramoArrastrado,
  tramoDePreset,
  tramoEnPalabras,
  type FilaPersonaDia,
  type GestoTramo,
  type MedidaPersona,
  type Tramo,
} from "@/lib/rendimiento-vista-reglas";

/* ====================================================================
   El gráfico de Rendimiento (ADR-0610): el mismo dibujo que se transforma. Cada barra es la pila de lo que vendió cada persona ese día: en «Cada día» se ven
   juntas; en «Por persona», con su color; en «Sumado» cada pila se vuelve un punto sobre la línea de lo que se lleva. Se arrastra para elegir días, y eso
   cambia TODA la pantalla. Las cuentas son de `rendimiento-vista-reglas.ts`.

   Sin biblioteca: es SVG y CSS para que las barras viajen con transiciones del navegador, sin un cuadro de JavaScript por cada una (ADR-0136 act. 2026-11-04).
   ==================================================================== */

export type ModoGrafico = "dia" | "persona" | "suma";
const MODOS = [
  { clave: "dia", etiqueta: "Cada día" },
  { clave: "persona", etiqueta: "Por persona" },
  { clave: "suma", etiqueta: "Sumado" },
];
const SOLES = new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN", maximumFractionDigits: 0 });
const DIAS_SEMANA = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const diaDeSemana = (iso: string) => DIAS_SEMANA[new Date(`${iso}T12:00:00Z`).getUTCDay()];

function pasoRedondo(x: number) {
  const e = 10 ** Math.floor(Math.log10(x || 1));
  const f = x / e;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * e;
}

export type PropsGrafico = {
  dias: readonly string[];
  hoy: string;
  filas: readonly FilaPersonaDia[];
  /** Las personas que se ven (en el orden de la leyenda). */
  medidas: readonly MedidaPersona[];
  /** Todas las de la tienda, para que cada una conserve su color. */
  colores: ReadonlyMap<string, string>;
  /** Sin filtros: suma también las ventas sin quien atendió, y la meta es la de la tienda. */
  esLaTienda: boolean;
  tramo: Tramo;
  /** `soltando`: terminó el gesto, y es lo que queda para «Deshacer». */
  onTramo: (t: Tramo, soltando: boolean) => void;
  modo: ModoGrafico;
  onModo: (m: ModoGrafico) => void;
  mesPasado: boolean;
  onMesPasado: (v: boolean) => void;
  /** Mientras se repite el mes: el día al que va. Lo que viene después todavía no existe. */
  repitiendo: boolean;
  onRepetir: () => void;
  /** A dónde se llega si se vende esto por día; `null`: el ritmo de hoy. */
  cierre: { valor: number; meta: number | null; desdeHoy: number; simulado: boolean } | null;
  /** Pasar por un día: la tabla dice lo de ese día. */
  onDia: (fecha: string | null) => void;
  onPersona: (m: MedidaPersona) => void;
};

export function GraficoRendimiento({ dias, hoy, filas, medidas, colores, esLaTienda, tramo, onTramo, modo, onModo, mesPasado, onMesPasado, repitiendo, onRepetir, cierre, onDia, onPersona }: PropsGrafico) {
  const caja = useRef<HTMLDivElement>(null);
  const [medida, setMedida] = useState<{ W: number; H: number } | null>(null);
  const [arrastrando, setArrastrando] = useState(false);
  const [diaEncima, setDiaEncima] = useState<{ i: number; x: number; y: number } | null>(null);
  const [usado, setUsado] = useState(false);
  const gesto = useRef<{ tipo: GestoTramo; desdeI: number; hastaI: number; puntoInicial: number; xInicial: number; movio: boolean } | null>(null);

  useLayoutEffect(() => {
    const el = caja.current;
    if (!el) return;
    const medir = () => setMedida((m) => (m && m.W === el.clientWidth && m.H === el.clientHeight ? m : { W: el.clientWidth, H: el.clientHeight }));
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const ids = useMemo(() => new Set(medidas.map((m) => m.personaId)), [medidas]);
  const incluir = (id: string | null) => (id === null ? esLaTienda : ids.has(id));
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `incluir` depende solo de ids y esLaTienda
  const eje = useMemo(() => diasParaGrafico(dias, filas, incluir), [dias, filas, ids, esLaTienda]);
  const cortar = repitiendo ? tramo.hasta : hoy;
  const iHoy = dias.lastIndexOf(hoy);
  const iDesde = Math.max(0, dias.indexOf(tramo.desde));
  const iHasta = Math.max(iDesde, dias.indexOf(tramo.hasta));
  const todoElMes = tramo.desde === tramoDePreset("mes", hoy).desde && tramo.hasta === hoy;
  // eslint-disable-next-line react-hooks/exhaustive-deps -- igual que `eje`
  const pasado = useMemo(() => (mesPasado ? mesPasadoEnEje(dias, filas, hoy, incluir, modo === "suma") : null), [mesPasado, dias, filas, hoy, ids, esLaTienda, modo]);
  const sumado = useMemo(() => sumadoDelMes(eje, hoy, cortar), [eje, hoy, cortar]);
  const metaSumada = useMemo(() => metaSumadaDelMes(eje, hoy), [eje, hoy]);

  const W = medida?.W ?? 0;
  const H = medida?.H ?? 0;
  const izq = W < 480 ? 34 : 50;
  const der = 6;
  const arriba = 30;
  const abajo = 24;
  const base = H - abajo;
  const alto = base - arriba;
  const slot = W > 0 ? (W - izq - der) / Math.max(1, dias.length) : 0;
  const xDe = (i: number) => izq + slot * i;
  const centro = (i: number) => xDe(i) + slot / 2;

  const conMeta = eje.some((d) => (d.metaDia ?? 0) > 0);
  const metaMes = metaSumada.findLast((v) => v !== null) ?? null;
  const valorCierre = cierre?.valor ?? null;
  const ultimoSumado = sumado[iHoy] ?? 0;

  // La escala: en «Sumado», hasta la meta y hasta donde se llega; en las otras, hasta el día más alto.
  const tope = useMemo(() => {
    if (modo === "suma") {
      const candidatos = [ultimoSumado, metaMes ?? 0, repitiendo ? 0 : Math.min(valorCierre ?? 0, (metaMes ?? 0) * 2.4 || (valorCierre ?? 0)), ...(pasado ?? []).map((v) => v ?? 0)];
      return Math.max(1, ...candidatos) * 1.1;
    }
    const dia = Math.max(1, ...eje.map((d) => d.total), ...eje.map((d) => d.metaDia ?? 0), ...(pasado ?? []).map((v) => v ?? 0));
    return dia * 1.16;
  }, [modo, ultimoSumado, metaMes, valorCierre, eje, pasado, repitiendo]);
  const yDe = (v: number) => base - (v / tope) * alto;

  const paso = pasoRedondo(tope / 3);
  const rejas = [0, 1, 2, 3].map((n) => n * paso).filter((v) => v <= tope);

  // El orden de cada pila: siempre el mismo, para que el color de una persona no salte de lugar.
  const orden = useMemo(() => [...colores.keys()], [colores]);

  const lineaSumada = useMemo(() => {
    if (W === 0) return "";
    let d = "";
    sumado.forEach((v, i) => {
      if (v === null || dias[i] > cortar) return;
      d += `${d ? "L" : "M"}${centro(i).toFixed(1)} ${yDe(v).toFixed(1)}`;
    });
    return d;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- depende de la escala y el ancho, ya en las dependencias
  }, [sumado, dias, cortar, W, H, tope]);
  const areaSumada = lineaSumada && (() => {
    const primero = sumado.findIndex((v) => v !== null);
    const ultimo = Math.max(primero, dias.lastIndexOf(cortar));
    return `${lineaSumada}L${centro(ultimo).toFixed(1)} ${base}L${centro(primero).toFixed(1)} ${base}Z`;
  })();
  const trazar = (vals: readonly (number | null)[]) => {
    let d = "";
    vals.forEach((v, i) => {
      if (v === null) return;
      d += `${d ? "L" : "M"}${centro(i).toFixed(1)} ${yDe(Math.min(v, tope)).toFixed(1)}`;
    });
    return d;
  };
  const lineaMetaDia = trazar(eje.map((d) => d.metaDia));
  const lineaTocaba = trazar(metaSumada);
  const lineaPasado = pasado ? trazar(pasado) : "";

  const lineaEntra = useRef<SVGPathElement>(null);
  const modoAntes = useRef(modo);
  useEffect(() => {
    const l = lineaEntra.current;
    if (modo === "suma" && modoAntes.current !== "suma" && l && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const largo = l.getTotalLength();
      l.animate([{ strokeDasharray: `${largo}`, strokeDashoffset: largo }, { strokeDasharray: `${largo}`, strokeDashoffset: 0 }], { duration: 1100, delay: 200, easing: "cubic-bezier(.32,.72,.24,1)", fill: "backwards" });
    }
    modoAntes.current = modo;
  }, [modo]);

  // ---------- los gestos ----------
  function puntoDe(e: PE) {
    const r = caja.current?.getBoundingClientRect();
    return r ? e.clientX - r.left : 0;
  }
  const indiceDe = (x: number) => Math.max(0, Math.min(dias.length - 1, Math.floor((x - izq) / Math.max(1, slot))));

  function alBajar(e: PE<HTMLDivElement>) {
    if (e.button !== 0 || W === 0) return;
    const x = puntoDe(e);
    gesto.current = {
      tipo: gestoEn(x, xDe(iDesde), xDe(iHasta + 1), todoElMes),
      desdeI: iDesde,
      hastaI: iHasta,
      puntoInicial: indiceDe(x),
      xInicial: x,
      movio: false,
    };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }
  function alMover(e: PE<HTMLDivElement>) {
    const x = puntoDe(e);
    const g = gesto.current;
    if (!g) {
      if (W > 0 && x >= izq) {
        const i = indiceDe(x);
        const r = caja.current?.getBoundingClientRect();
        setDiaEncima({ i, x, y: e.clientY - (r?.top ?? 0) });
        onDia(dias[i] <= hoy ? dias[i] : null);
      } else {
        setDiaEncima(null);
        onDia(null);
      }
      return;
    }
    if (!g.movio && Math.abs(x - g.xInicial) < 4) return;
    if (!g.movio) {
      g.movio = true;
      setArrastrando(true);
      setDiaEncima(null);
      onDia(null);
    }
    onTramo(tramoArrastrado({ gesto: g.tipo, dias, hoy, desdeI: g.desdeI, hastaI: g.hastaI, puntoInicial: g.puntoInicial, puntoAhora: indiceDe(x) }), false);
  }
  function alSoltar() {
    const g = gesto.current;
    gesto.current = null;
    if (!g) return;
    setArrastrando(false);
    setUsado(true);
    // Un toque sin arrastrar elige ese día; otro toque en el mismo día vuelve al mes.
    if (!g.movio) {
      if (dias[g.puntoInicial] > hoy) return;
      const fecha = dias[g.puntoInicial];
      onTramo(tramo.desde === fecha && tramo.hasta === fecha ? tramoDePreset("mes", hoy) : { desde: fecha, hasta: fecha }, true);
      return;
    }
    onTramo(tramo, true);
  }

  const encima = diaEncima ? eje[diaEncima.i] : null;
  const puntosDe = (i: number) => {
    const d = eje[i];
    return orden.filter((id) => (d.porPersona.get(id) ?? 0) > 0);
  };

  const fueraDeTramo = (i: number) => !repitiendo && (i < iDesde || i > iHasta);
  const sinTope = dias[iHoy] === undefined;

  // ---------- cada barra ----------
  const ancho = Math.max(2, slot * 0.7);
  const hueco = (slot - ancho) / 2;
  const segmentos: { clave: string; i: number; id: string | null; x: number; y: number; w: number; h: number; rx: number }[] = [];
  if (W > 0) {
    const personasPila: (string | null)[] = [...orden, null];
    eje.forEach((d, i) => {
      let apilado = 0;
      let puso = false;
      const vivo = d.fecha <= cortar;
      for (const id of personasPila) {
        const v = vivo ? (d.porPersona.get(id) ?? 0) : 0;
        if (modo === "suma") {
          const s = sumado[i];
          const primero = !puso && vivo && s !== null && v > 0;
          if (primero) puso = true;
          const y = yDe(s ?? 0);
          segmentos.push({ clave: `${i}-${id}`, i, id, x: centro(i) - 3, y: y - 3, w: primero ? 6 : 0, h: primero ? 6 : 0, rx: 3 });
        } else {
          // Los bordes de cada pila caen en un píxel entero: si no, se ve una costura entre personas cuando la barra es de un solo color.
          const abajoPx = Math.round(base - (apilado / tope) * alto);
          const y = Math.round(base - ((apilado + v) / tope) * alto);
          const h = abajoPx - y;
          apilado += v;
          segmentos.push({ clave: `${i}-${id}`, i, id, x: xDe(i) + hueco, y, w: ancho, h: Math.max(0, h - (modo === "persona" && h > 2 ? 1 : 0)), rx: modo === "persona" ? 2 : 1.5 });
        }
      }
    });
  }

  const marcas = useMemo(() => {
    const paso5 = W < 480 ? 7 : 5;
    return dias
      .map((f, i) => ({ f, i, n: Number(f.slice(8, 10)) }))
      .filter(({ n, f, i }) => f === hoy || i === 0 || (n % paso5 === 0 && Math.abs(i - iHoy) > (W < 480 ? 2 : 1)))
      .map(({ f, i, n }) => ({ f, i, n }));
  }, [dias, hoy, iHoy, W]);

  const lente = { x: xDe(iDesde), w: xDe(iHasta + 1) - xDe(iDesde) };
  const vendidoTramo = eje.reduce((s, d, i) => (i >= iDesde && i <= iHasta ? s + d.total : s), 0);
  const etiquetaLente = iDesde === iHasta ? `Día ${Number(dias[iDesde]?.slice(8, 10))}` : `Del ${Number(dias[iDesde]?.slice(8, 10))} al ${Number(dias[iHasta]?.slice(8, 10))}`;
  const titulo = modo === "suma" ? "Lo que se lleva sumado" : modo === "persona" ? "Ventas de cada día, por persona" : "Ventas de cada día";
  const mostrarCierre = modo === "suma" && !repitiendo && cierre !== null && iHoy >= 0;

  return (
    <section className="mesa-grafico mesa-placa liquido mesa-entra" style={{ "--i": 6 } as CSSProperties} aria-label={titulo} data-guia="rendimiento.grafico">
      <span aria-hidden className="mesa-barrido" style={{ "--i": 6 } as CSSProperties} />
      <div className="mesa-grafico-cabeza">
        <div>
          <h2 className="mesa-grafico-titulo">{titulo}</h2>
          <p className="mesa-grafico-frase">{repitiendo ? `Hasta el día ${Number(tramo.hasta.slice(8, 10))}` : tramoEnPalabras(tramo, hoy).replace(/^./, (c) => c.toUpperCase())}</p>
        </div>
        <div className="mesa-grafico-mandos">
          <div data-guia="rendimiento.grafico-modo">
            <SegmentoDeslizante forma="modo" etiqueta="Cómo se ve" valor={modo} opciones={MODOS} onCambio={(c) => onModo(c as ModoGrafico)} />
          </div>
          <button type="button" className="btn-cayla btn-secundario btn-chico" aria-pressed={mesPasado} data-puesto={mesPasado ? "" : undefined} onClick={() => onMesPasado(!mesPasado)} data-guia="rendimiento.grafico-pasado">
            Mes pasado
          </button>
          <button type="button" className="btn-cayla btn-secundario btn-chico" onClick={onRepetir} aria-pressed={repitiendo} data-guia="rendimiento.grafico-repetir">
            {repitiendo ? <Pause aria-hidden className="h-4 w-4" /> : <Play aria-hidden className="h-4 w-4" />}
            {repitiendo ? "Detener" : "Ver cómo fue"}
          </button>
        </div>
      </div>

      <div
        ref={caja}
        className="mesa-lienzo"
        data-modo={modo}
        data-arrastrando={arrastrando ? "" : undefined}
        onPointerDown={alBajar}
        onPointerMove={alMover}
        onPointerUp={alSoltar}
        onPointerCancel={alSoltar}
        onPointerLeave={() => {
          if (!gesto.current) {
            setDiaEncima(null);
            onDia(null);
          }
        }}
        data-guia="rendimiento.grafico-lienzo"
      >
        {W > 0 && (
          <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${titulo}, ${tramoEnPalabras(tramo, hoy)}. Se vendieron ${SOLES.format(vendidoTramo)}.`}>
            <defs>
              <linearGradient id="mesa-brillo-barra" x1="0" x2="1" y1="0" y2="0">
                <stop offset="0" stopColor="var(--color-vidrio)" stopOpacity="0.34" />
                <stop offset="1" stopColor="var(--color-vidrio)" stopOpacity="0" />
              </linearGradient>
            </defs>
            {rejas.map((v) => (
              <g key={v} className="mesa-reja" style={{ transform: `translateY(${yDe(v)}px)` }}>
                <line x1={0} x2={W} />
                {v > 0 && (
                  <text x={0} y={-5}>
                    {v >= 1000 ? `${(v / 1000).toLocaleString("es-PE")} mil` : v}
                  </text>
                )}
              </g>
            ))}
            {encima && <rect className="mesa-columna" x={xDe(diaEncima?.i ?? 0)} y={arriba - 10} width={slot} height={alto + 10} rx={6} />}

            <g>
              {segmentos.map((s) => (
                <rect
                  key={s.clave}
                  className="mesa-barra"
                  data-persona-barra={s.id ?? "sin"}
                  data-hoy={dias[s.i] === hoy ? "" : undefined}
                  data-fuera={fueraDeTramo(s.i) ? "" : undefined}
                  style={
                    {
                      x: `${s.x}px`,
                      y: `${s.y}px`,
                      width: `${s.w}px`,
                      height: `${s.h}px`,
                      rx: `${s.rx}px`,
                      "--c": s.id ? colores.get(s.id) : "var(--color-grafico-neutro)",
                      "--k": s.i,
                    } as CSSProperties
                  }
                />
              ))}
              {/* El brillo de tubo: la misma luz que las barras de avance del sistema (--tubo-brillo), encima del color del dato. */}
              {modo !== "suma" &&
                eje.map((d, i) => {
                  const alturaPx = d.fecha <= cortar ? (d.total / tope) * alto : 0;
                  return (
                    <rect
                      key={d.fecha}
                      className="mesa-barra-brillo"
                      data-fuera={fueraDeTramo(i) ? "" : undefined}
                      style={{ x: `${xDe(i) + hueco}px`, y: `${base - alturaPx}px`, width: `${ancho * 0.42}px`, height: `${alturaPx}px`, "--k": i } as CSSProperties}
                    />
                  );
                })}
            </g>

            {modo !== "suma" && conMeta && <path className="mesa-linea mesa-linea-meta" d={lineaMetaDia} />}
            {modo === "suma" && conMeta && <path className="mesa-linea mesa-linea-tocaba" d={lineaTocaba} />}
            {modo === "suma" && metaMes !== null && <path className="mesa-linea mesa-linea-tope" d={`M${izq} ${yDe(metaMes)}L${W - der} ${yDe(metaMes)}`} />}
            {modo === "suma" && !!areaSumada && <path className="mesa-area" d={areaSumada} />}
            {modo === "suma" && !!lineaSumada && <path ref={lineaEntra} className="mesa-linea mesa-linea-sumada" d={lineaSumada} />}
            {mostrarCierre && cierre && (
              <path className="mesa-linea mesa-linea-cierre" data-simulado={cierre.simulado ? "" : undefined} d={`M${centro(iHoy)} ${yDe(ultimoSumado)}L${W - der} ${yDe(Math.min(cierre.valor, tope))}`} />
            )}
            {lineaPasado && <path className="mesa-linea mesa-linea-pasado" d={lineaPasado} />}

            {modo === "suma" && metaMes !== null && (
              <text className="mesa-rotulo" x={W - der} y={valorCierre !== null && valorCierre >= metaMes ? yDe(metaMes) + 17 : yDe(metaMes) - 7} textAnchor="end">
                Meta: {SOLES.format(metaMes)}
              </text>
            )}
            {mostrarCierre && cierre && (
              <text className="mesa-rotulo" x={W - der} y={metaMes !== null && cierre.valor < metaMes ? Math.min(yDe(cierre.valor) + 18, base - 6) : yDe(Math.min(cierre.valor, tope)) - 8} textAnchor="end">
                {cierre.simulado ? "Si vendemos eso" : "Si sigue así"}: {SOLES.format(cierre.valor)}
              </text>
            )}

            <line className="mesa-eje" x1={izq} x2={W - der} y1={base} y2={base} />
            {marcas.map(({ f, i, n }) => (
              <text key={f} className={f === hoy ? "mesa-marca mesa-marca-hoy" : "mesa-marca"} x={centro(i)} y={H - 6} textAnchor="middle">
                {n}
              </text>
            ))}
          </svg>
        )}

        {W > 0 && !todoElMes && !repitiendo && !sinTope && (
          <>
            <span className="mesa-lente" style={{ transform: `translateX(${lente.x}px)`, width: lente.w, height: base }}>
              <i className="mesa-lente-canto" data-lado="izq" />
              <i className="mesa-lente-canto" data-lado="der" />
              <i className="mesa-lente-manija" data-lado="izq" />
              <i className="mesa-lente-manija" data-lado="der" />
            </span>
            <span className="mesa-lente-rotulo" style={{ transform: `translateX(calc(${Math.min(Math.max(70, lente.x + lente.w / 2), W - 70)}px - 50%))` }}>
              {etiquetaLente} · {SOLES.format(vendidoTramo)}
            </span>
          </>
        )}

        {encima && diaEncima && !arrastrando && (
          <div className="mesa-globo" style={{ transform: `translate(${Math.min(Math.max(8, diaEncima.x - 90), W - 196)}px, ${Math.max(0, diaEncima.y - 16)}px) translateY(-100%)` }} role="status">
            <b>
              {encima.fecha === hoy ? "Hoy, va en curso" : `${diaDeSemana(encima.fecha)} ${Number(encima.fecha.slice(8, 10))}`}
              {encima.fecha <= hoy && ` · ${SOLES.format(modo === "suma" ? (sumado[diaEncima.i] ?? 0) : encima.total)}`}
              {encima.fecha <= hoy && modo === "suma" && " sumado"}
            </b>
            {encima.fecha > hoy && <p>Todavía no llega</p>}
            {encima.fecha <= hoy &&
              puntosDe(diaEncima.i).map((id) => (
                <p key={id}>
                  <span>{medidas.find((m) => m.personaId === id)?.nombre}</span>
                  <span>{SOLES.format(encima.porPersona.get(id) ?? 0)}</span>
                </p>
              ))}
            {encima.metaDia !== null && (
              <p className="mesa-globo-meta">
                <span>Meta del día</span>
                <span>
                  {SOLES.format(encima.metaDia)}
                  {encima.fecha <= hoy && avance(encima.total, encima.metaDia) !== null && ` · ${avance(encima.total, encima.metaDia)} %`}
                </span>
              </p>
            )}
            {pasado && pasado[diaEncima.i] !== null && (
              <p className="mesa-globo-meta">
                <span>Mes pasado</span>
                <span>{SOLES.format(pasado[diaEncima.i] ?? 0)}</span>
              </p>
            )}
          </div>
        )}
      </div>

      <div className="mesa-leyenda">
        {modo === "persona" &&
          medidas.map((m) => (
            <button key={m.personaId} type="button" data-persona={m.personaId} onClick={() => onPersona(m)} style={{ "--c": colores.get(m.personaId) } as CSSProperties}>
              <i />
              {m.nombre}
            </button>
          ))}
        {modo === "persona" && esLaTienda && eje.some((d) => (d.porPersona.get(null) ?? 0) > 0) && (
          <span className="mesa-leyenda-sin" style={{ "--c": "var(--color-grafico-neutro)" } as CSSProperties}>
            <i />
            Sin quien atendió
          </span>
        )}
        {conMeta && (
          <span className="mesa-leyenda-sin">
            <i data-trazo="meta" />
            {modo === "suma" ? "Lo que tocaba" : "Meta del día"}
          </span>
        )}
        {modo === "suma" && !repitiendo && cierre !== null && (
          <span className="mesa-leyenda-sin">
            <i data-trazo="cierre" />
            {cierre.simulado ? "Si vendemos eso" : "Si sigue así"}
          </span>
        )}
        {mesPasado && (
          <span className="mesa-leyenda-sin">
            <i data-trazo="pasado" />
            Mes pasado
          </span>
        )}
      </div>
      {!usado && <p className="mesa-pista">Arrastra sobre el gráfico para elegir días, o toca un día. Lo demás se acomoda solo.</p>}
    </section>
  );
}
