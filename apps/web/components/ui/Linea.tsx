"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { anchoDeTexto, radioDeToque, separarMarcas, textosQueCaben } from "@/lib/linea-marcas-reglas";
import { filasDeNotas, lugarDeLaCifra, muestrearTrazo, separarAlFinal } from "@/lib/linea-textos-reglas";

/* ====================================================================
   La línea — una sola pieza (ADR-0358, ronda 14, Felipe eligió P1 el 2026-10-15)

   Cómo va algo en el tiempo, casi siempre contra una referencia: lo vendido hoy contra ayer (Caja), el mes contra la meta (Rendimiento),
   lo vendido contra el plan (el plan de campaña), el costo de una prenda compra a compra (la ficha de un proveedor).
   · Lo de hoy en TINTA (2,5 px) con un área suave debajo; la referencia (ayer, la meta, el plan) en TAUPE punteado, siempre igual; lo que
     viene («si sigue así») en tinta suave punteada.
   · Tres rayas de fondo con sus montos (`ejes`) y las marcas de tiempo que pasa la pantalla; el último punto con su `cifra` en serif.
   · Al pasar el mouse, una guía salta al punto más cercano (o recorre cualquier momento, `continuo`) y un globito dice lo que pasa la
     pantalla (`leer`). Lo que está bien o mal (vas arriba o abajo de ayer) lo dice la frase de la pantalla, no el color de la línea.
   · Se dibuja de izquierda a derecha una vez al verse (900 ms), el área aparece detrás y el punto final con su cifra al llegar.
   · `escalones`: el valor se queda quieto hasta el punto siguiente y salta ahí (un costo, que solo cambia cuando llega mercadería). Con
     `marcas`, cada salto lleva su número (①②③) y lo que pasó en dos palabras; el número se toca y lleva a su detalle (la pestaña «Costo»
     del Historial de la prenda, 2026-10-24). `arreglos`: un lápiz punteado sobre la fecha de algo que se corrigió (un costo mal
     anotado), fuera de la línea: lo arreglado no mueve la línea, solo se avisa que pasó.
   · Ninguna línea tapa un texto (Felipe 2026-10-30, «Cuándo» de Gastos): todo texto sobre el dibujo lleva un borde del color del fondo
     (`--linea-fondo`, de fábrica papel), la cifra del último punto busca un hueco si su lugar de siempre choca con un trazo, las cifras del
     final se separan si caen juntas, y las `notas` (lo que pasó en un punto, «Alquileres · 3 al 5 oct») van en una franja SOBRE el gráfico
     con un hilo hasta su punto (lib/linea-textos-reglas.ts). `vienen`: puntos huecos sobre el «si sigue así» (un fijo que falta pagar).
     `onElegir`: tocar un momento lo elige (con el teclado, ← → y Enter) y queda marcado en rojo (`elegido`).
   En una fila de una lista, la mini es `<Sparkline>` (components/ui/Sparkline.tsx). Registro: docs/unificar/grafico.linea.md.
   Nunca una `<polyline>` ni un `<path>` de datos dibujados a mano.
   ==================================================================== */

export type PuntoLinea = { x: number; y: number };

/** Un lápiz sobre la fecha de algo que se corrigió: se toca y lleva a su detalle. */
export type ArregloLinea = { x: number; etiqueta: string; onElegir?: () => void };

/** Un número sobre la línea que se toca: dice qué pasó en ese punto y lleva a su detalle. */
export type MarcaLinea = {
  x: number;
  y: number;
  n: number;
  /** Lo que pasó, en dos palabras («↑ subió S/ 1.61»): encima del número (debajo si `tono` es «baja»). */
  texto: string;
  /** Sube en ámbar, baja en verde, el resto en taupe: lo que el número le hizo a la línea. */
  tono?: "sube" | "baja" | "neutro";
  /** El número elegido: lleno de tinta. */
  activa?: boolean;
  /** Para el lector de pantalla: «Compra 2, 14 oct: subió S/ 1.61». */
  etiqueta: string;
  onElegir?: () => void;
};

/** Lo que pasó en un punto de la serie, en la franja de arriba con un hilo hasta él: «Alquileres · 3 al 5 oct» y su `detalle` («S/ 7.2k»). */
export type NotaLinea = {
  x: number;
  texto: string;
  detalle?: string;
  /** Si las notas no caben en dos filas con `texto`, todas pasan a su `corto` («Alquileres»). */
  corto?: string;
  etiqueta: string;
  onElegir?: () => void;
};

/** Algo que se sabe que viene, sobre el «si sigue así»: un punto hueco (un fijo que falta pagar). */
export type VieneLinea = { x: number; y: number; etiqueta: string };

type Props = {
  /** Lo de hoy (lo vendido, el costo): la línea de tinta con su área. Puede llegar solo hasta «ahora». */
  serie: readonly PuntoLinea[];
  /** Ayer, la meta, el plan: taupe punteado. */
  referencia?: readonly PuntoLinea[] | null;
  /** «Si sigue así»: sigue desde el último punto, en tinta suave punteada. */
  proyeccion?: readonly PuntoLinea[] | null;
  /** El tramo de tiempo del eje x. */
  desde: number;
  hasta: number;
  /** El piso y el techo del eje y (de fábrica, de cero al mayor valor, redondeado). */
  minY?: number;
  maxY?: number;
  /** Las marcas de tiempo bajo el gráfico; `fuerte` la de hoy. */
  marcasX?: readonly { x: number; texto: string; fuerte?: boolean }[];
  /** Cómo se escribe un monto del eje («1,2 mil»). */
  formatoY?: (v: number) => string;
  /** Tres rayas de fondo con sus montos (de fábrica, sí). */
  ejes?: boolean;
  /** El área suave debajo de la línea (de fábrica, sí). */
  area?: boolean;
  /** Un punto en cada dato (las compras de un proveedor). */
  puntos?: boolean;
  /** El valor se queda quieto hasta el punto siguiente y salta ahí (un costo). */
  escalones?: boolean;
  /** Números que se tocan sobre la línea. */
  marcas?: readonly MarcaLinea[];
  /** Lápices sobre la fecha de lo que se corrigió (fuera de la línea). */
  arreglos?: readonly ArregloLinea[];
  /** Lo que pasó en algunos puntos, en una franja sobre el gráfico. */
  notas?: readonly NotaLinea[];
  /** Lo que viene, en puntos huecos sobre la proyección. */
  vienen?: readonly VieneLinea[];
  /** La raya punteada vertical de «ahora», con su texto (vacío: solo la raya). */
  ahora?: { x: number; texto: string } | null;
  /** La cifra del último punto, en serif. */
  cifra?: string | null;
  /** La cifra al final de la referencia («15,500 · meta»). */
  cifraReferencia?: { valor: string; texto: string } | null;
  /** La cifra al final de la proyección («≈ 16 mil · si sigue así»). */
  cifraProyeccion?: { valor: string; texto: string } | null;
  /** Tocar un momento lo elige; `elegido` lo marca. */
  onElegir?: (x: number) => void;
  elegido?: number | null;
  /** El globito al pasar el mouse: qué dice en ese momento. Sin `leer`, no hay guía. */
  leer?: (x: number) => ReactNode;
  /** La guía recorre cualquier momento (de fábrica, salta al punto más cercano). */
  continuo?: boolean;
  /** Hasta dónde llega la guía (de fábrica, `hasta`): en Caja, hasta «ahora». */
  guiaHasta?: number;
  /** Alto del gráfico en px (de fábrica 200). */
  alto?: number;
  /** Lo que le dice al lector de pantalla. */
  etiqueta: string;
  /** Lo que se escribe si la serie está vacía («Sin ventas todavía este mes»). */
  vacio?: string;
  className?: string;
};

/** El tope «redondo» de un eje: 1, 1,5, 2, 2,5, 3, 4, 5, 6, 8 o 10 por una potencia de diez. */
export function topeRedondo(mx: number): number {
  const mag = 10 ** Math.floor(Math.log10(Math.max(mx, 1)));
  return [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].map((k) => k * mag).find((t) => t >= mx) ?? mx;
}

// Un solo lienzo para medir textos en toda la página (el gráfico se dibuja recién cuando conoce su ancho, ya en el navegador).
let lienzo: CanvasRenderingContext2D | null | undefined;
/** El ancho de un texto con su letra («600 12px DM Sans»); sin lienzo, una cuenta gruesa. */
function anchoDe(texto: string, letra: string): number {
  if (lienzo === undefined) lienzo = typeof document === "undefined" ? null : document.createElement("canvas").getContext("2d");
  if (!lienzo) return anchoDeTexto(texto);
  lienzo.font = letra;
  return lienzo.measureText(texto).width;
}

const montoCorto = (v: number) => (v >= 1000 ? `${(v / 1000).toLocaleString("es-PE", { maximumFractionDigits: 1 })} mil` : Math.round(v).toLocaleString("es-PE"));

/** El valor de una línea en el momento `x` (interpolado entre sus dos puntos vecinos; con `escalones`, el del último punto que pasó). */
export function valorEnLinea(puntos: readonly PuntoLinea[], x: number, escalones = false): number | null {
  if (puntos.length === 0) return null;
  if (escalones) return [...puntos].reverse().find((p) => p.x <= x)?.y ?? puntos[0]!.y;
  if (x <= puntos[0]!.x) return puntos[0]!.y;
  for (let i = 1; i < puntos.length; i++) {
    const a = puntos[i - 1]!, b = puntos[i]!;
    if (x <= b.x) return b.x === a.x ? b.y : a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x);
  }
  return puntos[puntos.length - 1]!.y;
}

export function Linea({
  serie,
  referencia = null,
  proyeccion = null,
  desde,
  hasta,
  minY = 0,
  maxY,
  marcasX = [],
  formatoY = montoCorto,
  ejes = true,
  area = true,
  puntos = false,
  escalones = false,
  marcas = [],
  arreglos = [],
  notas = [],
  vienen = [],
  ahora = null,
  cifra = null,
  cifraReferencia = null,
  cifraProyeccion = null,
  onElegir,
  elegido = null,
  leer,
  continuo = false,
  guiaHasta,
  alto = 200,
  etiqueta,
  vacio,
  className = "",
}: Props) {
  // El gráfico mide su ancho real: el texto y los puntos conservan su tamaño en vez de encogerse con el dibujo.
  const caja = useRef<HTMLDivElement>(null);
  const [ancho, setAncho] = useState(0);
  // Las letras de verdad, para medir los textos que se acomodan (las notas, la cifra): la del cuerpo y la serif de la cifra.
  const [letras, setLetras] = useState({ sans: "sans-serif", serif: "serif" });
  useEffect(() => {
    const el = caja.current;
    if (!el) return;
    const medir = () => setAncho(Math.floor(el.clientWidth));
    medir();
    const estilo = getComputedStyle(el);
    setLetras({ sans: estilo.fontFamily || "sans-serif", serif: estilo.getPropertyValue("--font-serif").trim() || "serif" });
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const [guia, setGuia] = useState<number | null>(null);

  const todos = [...serie, ...(referencia ?? []), ...(proyeccion ?? [])].map((p) => p.y);
  const techo = maxY ?? topeRedondo(Math.max(1, ...todos));
  const W = Math.max(ancho, 1);
  const angosto = W < 420;
  const L = ejes ? (angosto ? 36 : 44) : 8;
  const R = cifra || cifraReferencia || cifraProyeccion ? (angosto ? 52 : 64) : 12;
  const B = marcasX.length > 0 ? 24 : 8;
  const X = (x: number) => L + (hasta === desde ? 0 : ((x - desde) / (hasta - desde)) * (W - L - R));
  // Las notas se acomodan antes que nada: cuántas filas ocupan decide dónde empieza el gráfico, que crece hacia arriba para no achicarse.
  const anchoNota = (n: NotaLinea, largo: boolean) =>
    anchoDe(largo ? n.texto : (n.corto ?? n.texto), `600 12px ${letras.sans}`) + (n.detalle ? anchoDe(` ${n.detalle}`, `12px ${letras.sans}`) : 0);
  const ubicarNotas = (largo: boolean) => filasDeNotas(notas.map((n) => ({ x: X(n.x), ancho: anchoNota(n, largo) })), 4, W - 4);
  let notasLargas = true;
  let lugarNotas = ancho > 0 && notas.length > 0 ? ubicarNotas(true) : [];
  if (lugarNotas.some((u) => u.fila < 0 || u.fila > 1) && notas.some((n) => n.corto)) {
    notasLargas = false;
    lugarNotas = ubicarNotas(false);
  }
  const FILA = 19;
  const filasNotas = Math.max(0, ...lugarNotas.map((u) => u.fila + 1));
  const T = filasNotas > 0 ? filasNotas * FILA + 18 : 16;
  const H = alto + (T - 16);
  const baseNota = (fila: number) => T - 14 - fila * FILA;
  const Y = (v: number) => T + (H - T - B) * (1 - (v - minY) / Math.max(techo - minY, 1e-9));
  const camino = (ps: readonly PuntoLinea[], escalon = false) =>
    ps.map((p, i) => (i === 0 ? `M${X(p.x).toFixed(1)},${Y(p.y).toFixed(1)}` : escalon ? `H${X(p.x).toFixed(1)} V${Y(p.y).toFixed(1)}` : `L${X(p.x).toFixed(1)},${Y(p.y).toFixed(1)}`)).join(" ");
  // Los números de `marcas` se separan cuando caen casi juntos (seis compras en dos días): el número se corre, el escalón no.
  const lugarMarcas = separarMarcas(marcas.map((m) => X(m.x)), 26, L + 12, W - R);
  const textoCabe = textosQueCaben(lugarMarcas, marcas.map((m) => m.texto));
  const ultimo = serie.at(-1) ?? null;
  const finRef = referencia?.at(-1) ?? null;
  const finProy = proyeccion?.at(-1) ?? null;
  const yNota = (n: NotaLinea) => valorEnLinea(serie, n.x, escalones) ?? minY;

  // Las cifras del final (la referencia y el «si sigue así»), en el margen derecho y separadas si caen juntas: cada una ocupa dos líneas.
  const finales = [
    finRef && cifraReferencia ? { clave: "ref" as const, punto: finRef, ...cifraReferencia } : null,
    finProy && cifraProyeccion ? { clave: "proy" as const, punto: finProy, ...cifraProyeccion } : null,
  ].filter((f): f is NonNullable<typeof f> => !!f);
  const yFinales = separarAlFinal(finales.map((f) => Y(f.punto.y)), 28);
  const xFinal = W - R + 8;

  // Lo que ya está dibujado, para que la cifra del último punto no lo pise: los trazos, los puntos, los hilos y las cifras del final.
  const trazo = (ps: readonly PuntoLinea[], escalon = false): [number, number][] =>
    ps.flatMap((p, i) => (escalon && i > 0 ? [[X(p.x), Y(ps[i - 1]!.y)] as [number, number], [X(p.x), Y(p.y)] as [number, number]] : [[X(p.x), Y(p.y)] as [number, number]]));
  let lugarCifra: { x: number; y: number; anclaje: "start" | "middle" | "end" } | null = null;
  if (cifra && ultimo && ancho > 0) {
    const obstaculos: [number, number][] = [
      ...muestrearTrazo(trazo(serie, escalones)),
      ...(referencia ? muestrearTrazo(trazo(referencia)) : []),
      ...(proyeccion ? muestrearTrazo(trazo(proyeccion)) : []),
      ...vienen.map((v) => [X(v.x), Y(v.y)] as [number, number]),
      ...notas.flatMap((n, i) =>
        (lugarNotas[i]?.fila ?? -1) >= 0 ? muestrearTrazo([[X(n.x), baseNota(lugarNotas[i]!.fila) + 5], [X(n.x), Y(yNota(n))]]) : [[X(n.x), Y(yNota(n))] as [number, number]],
      ),
      ...finales.flatMap((_, i) => muestrearTrazo([[xFinal, yFinales[i]! - 6], [W - 4, yFinales[i]! - 6], [W - 4, yFinales[i]! + 16], [xFinal, yFinales[i]! + 16]], 4)),
    ];
    const anchoCifra = anchoDe(cifra, `15px ${letras.serif}`);
    // Hacia la derecha puede asomarse hasta 24 px fuera del dibujo, como siempre lo hizo (el margen de la tarjeta lo recibe).
    lugarCifra = lugarDeLaCifra(X(ultimo.x), Y(ultimo.y), anchoCifra, 15, obstaculos, { x: L - 2, y: T - 4, ancho: W - L + 26, alto: H - B - T + 4 }, [9, 5, "start"]);
  }

  const momentos = [...new Set([...serie, ...(referencia ?? []), ...(proyeccion ?? [])].map((p) => p.x))].sort((a, b) => a - b);
  /** El momento bajo el puntero: cualquiera (`continuo`) o el punto más cercano de la serie, la referencia o la proyección. */
  function momentoEn(clientX: number, svg: SVGSVGElement): number | null {
    const r = svg.getBoundingClientRect();
    const px = ((clientX - r.left) / r.width) * W;
    const xv = desde + ((px - L) / (W - L - R)) * (hasta - desde);
    const tope = guiaHasta ?? hasta;
    if (continuo) return Math.max(desde, Math.min(tope, xv));
    const xs = momentos.filter((x) => x <= tope);
    if (xs.length === 0) return null;
    return xs.reduce((m, x) => (Math.abs(x - xv) < Math.abs(m - xv) ? x : m), xs[0]!);
  }

  function alMover(e: React.PointerEvent<SVGSVGElement>) {
    if (!leer && !onElegir) return;
    const x = momentoEn(e.clientX, e.currentTarget);
    if (x !== null) setGuia(x);
  }

  // Con el teclado: la guía aparece en el momento elegido (o el último), ← → la llevan al momento de al lado y Enter lo elige.
  const momentoInicial = () => elegido ?? ultimo?.x ?? momentos[0] ?? null;
  function alTeclear(e: React.KeyboardEvent<SVGSVGElement>) {
    if (!onElegir) return;
    const xs = momentos.filter((x) => x <= (guiaHasta ?? hasta));
    const actual = guia ?? momentoInicial();
    if (xs.length === 0 || actual === null) return;
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const i = xs.reduce((m, x, k) => (Math.abs(x - actual) < Math.abs(xs[m]! - actual) ? k : m), 0);
      setGuia(xs[Math.max(0, Math.min(xs.length - 1, i + (e.key === "ArrowRight" ? 1 : -1)))]!);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onElegir(actual);
    } else if (e.key === "Escape" && guia !== null) {
      e.stopPropagation();
      setGuia(null);
    }
  }

  const gSerie = guia === null || !ultimo || guia > ultimo.x ? null : valorEnLinea(serie, guia, escalones);
  const gRef = guia === null || !referencia ? null : valorEnLinea(referencia, guia);
  const gProy = guia === null || !proyeccion || !ultimo || guia <= ultimo.x ? null : valorEnLinea(proyeccion, guia);
  const contenido = guia === null || !leer ? null : leer(guia);
  const yGlobo = guia === null ? 0 : Math.min(...[gSerie, gRef, gProy].filter((v): v is number => v !== null).map(Y), H);

  return (
    <div ref={caja} className={`linea-cayla relative ${className}`} style={{ height: H }}>
      {ancho > 0 && (
        <svg
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          aria-label={etiqueta}
          className={`block overflow-visible ${onElegir ? "linea-elegible" : ""}`}
          onPointerMove={alMover}
          onPointerLeave={() => setGuia(null)}
          {...(onElegir
            ? {
                // Tocar un momento lo elige; con el teclado se recorre como un deslizador (← →) y Enter elige.
                role: "slider",
                tabIndex: 0,
                "aria-valuemin": desde,
                "aria-valuemax": guiaHasta ?? hasta,
                "aria-valuenow": guia ?? momentoInicial() ?? desde,
                onKeyDown: alTeclear,
                onFocus: () => setGuia(momentoInicial()),
                onBlur: () => setGuia(null),
                onClick: (e: React.MouseEvent<SVGSVGElement>) => {
                  // Un clic en una nota o una marca es de ellas, no del momento que hay debajo.
                  if ((e.target as Element).closest("[role=button]")) return;
                  const x = momentoEn(e.clientX, e.currentTarget);
                  if (x !== null) onElegir(x);
                },
              }
            : { role: "img" })}
        >
          {ejes &&
            [minY, minY + (techo - minY) / 2, techo].map((v) => (
              <g key={v}>
                <line x1={L} x2={W - R} y1={Y(v)} y2={Y(v)} className="linea-rejilla" />
                <text x={L - 6} y={Y(v) + 3.5} textAnchor="end" className="linea-eje">
                  {formatoY(v)}
                </text>
              </g>
            ))}
          {marcasX.map((m) => (
            <text key={`${m.x}-${m.texto}`} x={X(m.x)} y={H - 6} textAnchor="middle" className={`linea-eje ${m.fuerte ? "linea-eje-fuerte" : ""}`}>
              {m.texto}
            </text>
          ))}
          {ahora && (
            <g>
              <line x1={X(ahora.x)} x2={X(ahora.x)} y1={T} y2={H - B} className="linea-ahora" />
              {ahora.texto && (
                <text x={X(ahora.x) + 5} y={T + 8} className="linea-eje linea-eje-fuerte linea-sobre">
                  {ahora.texto}
                </text>
              )}
            </g>
          )}
          {referencia && referencia.length > 1 && <path d={camino(referencia)} className="linea-referencia" />}
          {proyeccion && proyeccion.length > 1 && <path d={camino(proyeccion)} className="linea-proyeccion" />}
          {vienen.map((v, i) => (
            <circle key={`${v.x}-${i}`} cx={X(v.x)} cy={Y(v.y)} r={4.5} className="linea-viene" style={{ "--i": i } as CSSProperties}>
              <title>{v.etiqueta}</title>
            </circle>
          ))}
          {/* Las cifras del final, en el margen: la de la referencia (con su punto) y la del «si sigue así», separadas si caen juntas. */}
          {finales.map((f, i) => (
            <g key={f.clave}>
              {f.clave === "ref" && <circle cx={X(f.punto.x)} cy={Y(f.punto.y)} r={4} className="linea-punto-ref" />}
              <text x={xFinal} y={yFinales[i]! + 3.5} className="linea-cifra-chica linea-sobre">
                {f.valor}
              </text>
              <text x={xFinal} y={yFinales[i]! + 15} className="linea-eje linea-sobre">
                {f.texto}
              </text>
            </g>
          ))}
          {serie.length > 0 && ultimo ? (
            <>
              {area && serie.length > 1 && (
                <path d={`${camino(serie, escalones)} L${X(ultimo.x).toFixed(1)},${Y(minY).toFixed(1)} L${X(serie[0]!.x).toFixed(1)},${Y(minY).toFixed(1)} Z`} className="linea-area" />
              )}
              {serie.length > 1 && <path d={camino(serie, escalones)} pathLength={1} className="linea-trazo" />}
              {puntos &&
                serie.map((p, i) => (
                  <circle key={i} cx={X(p.x)} cy={Y(p.y)} r={guia === p.x ? 6.5 : 4.5} className="linea-punto" style={{ "--i": i } as CSSProperties} />
                ))}
              {!puntos && <circle cx={X(ultimo.x)} cy={Y(ultimo.y)} r={4.5} className="linea-punto-fin" />}
              {cifra && lugarCifra && (
                <text x={lugarCifra.x} y={lugarCifra.y} textAnchor={lugarCifra.anclaje} className="linea-cifra linea-sobre">
                  {cifra}
                </text>
              )}
              {arreglos.map((a, i) => {
                // Sobre la raya del piso; lo de antes del primer punto se dibuja en su comienzo, sin pisar el monto del eje.
                const ax = Math.max(X(Math.min(Math.max(a.x, desde), hasta)), L + 14);
                const ay = Y(minY);
                return (
                  <g
                    key={`${a.x}-${i}`}
                    role="button"
                    tabIndex={0}
                    aria-label={a.etiqueta}
                    className="linea-arreglo"
                    style={{ "--i": i } as CSSProperties}
                    onClick={a.onElegir}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        a.onElegir?.();
                      }
                    }}
                  >
                    <title>{a.etiqueta}</title>
                    <circle cx={ax} cy={ay} r={16} className="linea-marca-toque" />
                    <circle cx={ax} cy={ay} r={9} className="linea-arreglo-fondo" />
                    {/* El lápiz de lucide, a escala: dibujado en el propio SVG (un foreignObject se corre en Safari). */}
                    <path d="M4 20h4L19 9l-4-4L4 16z" transform={`translate(${ax - 5.4} ${ay - 5.4}) scale(0.45)`} className="linea-arreglo-lapiz" />
                  </g>
                );
              })}
              {/* En su orden: mover un nodo de lugar reinicia su animación de entrada. Separados a 26 px no se tapan entre sí. */}
              {marcas.map((m, i) => {
                  const cx = lugarMarcas[i]!;
                  const real = X(m.x);
                  const cy = Y(m.y);
                  const verTexto = textoCabe[i] || !!m.activa;
                  return (
                    <g
                      key={m.n}
                      role="button"
                      tabIndex={0}
                      aria-label={m.etiqueta}
                      aria-pressed={!!m.activa}
                      className={`linea-marca linea-marca-${m.tono ?? "neutro"} ${m.activa ? "linea-marca-activa" : ""}`}
                      style={{ "--i": i } as CSSProperties}
                      onClick={m.onElegir}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          m.onElegir?.();
                        }
                      }}
                    >
                      <title>{m.etiqueta}</title>
                      {/* Un hilo une el número corrido con el punto de la línea donde de verdad pasó (el empujoncito del borde izquierdo no lo lleva). */}
                      {Math.abs(cx - real) > 14 && <line x1={real} y1={cy} x2={cx} y2={cy} className="linea-marca-hilo" />}
                      <circle cx={cx} cy={cy} r={radioDeToque(lugarMarcas, i)} className="linea-marca-toque" />
                      <circle cx={cx} cy={cy} r={12} className="linea-marca-fondo" />
                      <text x={cx} y={cy + 4} textAnchor="middle" className="linea-marca-n">
                        {m.n}
                      </text>
                      {verTexto && (
                        <text x={cx} y={m.tono === "baja" ? cy + 30 : cy - 20} textAnchor="middle" className="linea-marca-texto linea-sobre">
                          {m.texto}
                        </text>
                      )}
                    </g>
                  );
                })}
            </>
          ) : (
            vacio && (
              <text x={L + 10} y={Y(minY + (techo - minY) * 0.85)} className="linea-eje">
                {vacio}
              </text>
            )
          )}
          {/* Las notas, en su franja sobre el gráfico: el punto en la línea, el hilo que sube y el texto, encima de todo. */}
          {notas.map((n, i) => {
            const u = lugarNotas[i];
            const px = X(n.x);
            const py = Y(yNota(n));
            if (!u) return null;
            const dibujo = (
              <>
                <circle cx={px} cy={py} r={4} className="linea-nota-punto" />
                {u.fila >= 0 && (
                  <>
                    <line x1={px} x2={px} y1={baseNota(u.fila) + 5} y2={py - 6} className="linea-nota-hilo" />
                    <text x={u.desde} y={baseNota(u.fila)} className="linea-nota linea-sobre">
                      <tspan className="linea-nota-texto">{notasLargas ? n.texto : (n.corto ?? n.texto)}</tspan>
                      {n.detalle && ` ${n.detalle}`}
                    </text>
                  </>
                )}
              </>
            );
            return n.onElegir ? (
              <g
                key={`${n.x}-${i}`}
                role="button"
                tabIndex={0}
                aria-label={n.etiqueta}
                className="linea-nota-g"
                style={{ "--i": i } as CSSProperties}
                onClick={n.onElegir}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    e.stopPropagation();
                    n.onElegir?.();
                  }
                }}
              >
                <title>{n.etiqueta}</title>
                {dibujo}
              </g>
            ) : (
              <g key={`${n.x}-${i}`} className="linea-nota-g" style={{ "--i": i } as CSSProperties}>
                <title>{n.etiqueta}</title>
                {dibujo}
              </g>
            );
          })}
          {elegido !== null && <line x1={X(elegido)} x2={X(elegido)} y1={T} y2={H - B} className="linea-elegido" aria-hidden />}
          {guia !== null && (
            <g aria-hidden>
              <line x1={X(guia)} x2={X(guia)} y1={T} y2={H - B} className="linea-guia" />
              {gRef !== null && <circle cx={X(guia)} cy={Y(gRef)} r={4} className="linea-punto-ref" />}
              {gProy !== null && <circle cx={X(guia)} cy={Y(gProy)} r={4} className="linea-punto-proy" />}
              {gSerie !== null && <circle cx={X(guia)} cy={Y(gSerie)} r={5} className="linea-punto-fin" />}
            </g>
          )}
        </svg>
      )}
      {contenido !== null && guia !== null && (
        <div role="tooltip" className="linea-globo" style={{ left: Math.min(Math.max(X(guia), 90), W - 90), top: yGlobo }}>
          {contenido}
        </div>
      )}
    </div>
  );
}
