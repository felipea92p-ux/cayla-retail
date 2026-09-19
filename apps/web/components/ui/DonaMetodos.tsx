"use client";

import { useEffect, useId, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { useCountUp } from "@/lib/useCountUp";
import { useEnVista } from "@/lib/useEnVista";
import { arcosDona, arcoDeMarca, CIRCUNFERENCIA, RADIO } from "@/lib/dona-geometria";

/* ====================================================================
   Dona de métodos de pago (2026-09-18, segunda tanda) — SVG puro, sin
   librería, igual que `Graficos.tsx`. Vive aparte porque es la única
   que necesita estado (el método apuntado) y una entrada animada.

   Es una EXCEPCIÓN pedida a propósito a dos reglas de la "Capa de
   movimiento" de globals.css: usa degradado y resplandor (una dona de
   color liso se veía plana) y se anima sola al entrar a la vista. Lo
   que se respeta: nada rebota (todo con --ease-cayla: "instrumento, no
   juguete") y `prefers-reduced-motion` ve el resultado, no el viaje.

   El lenguaje es el de un cuadrante de reloj. El bisel de 100 marcas es
   una escala de porcentaje real (cada marca = 1 %); al apuntar un
   método se encienden las marcas que le tocan. Al recorrer el anillo,
   una aguja fina barre y descubre arcos y bisel a la vez (una máscara
   con la misma curva), mientras el total cuenta hasta su cifra.

   Todo el dibujo es decorativo (`aria-hidden`): la leyenda de al lado y
   la tabla que ofrece `CajaAbiertaPanel` dicen lo mismo con texto.
   ==================================================================== */

export type SegmentoDona = { etiqueta: string; valor: number; color: string };

const GROSOR = 11;
const GROSOR_ACTIVO = 15;
const MARCAS = 100;
/** Largo del trazo de la máscara de barrido: la circunferencia, redondeada hacia arriba. */
const BARRIDO = Math.ceil(CIRCUNFERENCIA);

export function DonaMetodos({
  segmentos,
  total,
  formato,
}: {
  segmentos: SegmentoDona[];
  total: number;
  formato: (n: number) => string;
}) {
  const uid = useId().replace(/\W/g, "");
  const { ref, enVista } = useEnVista<HTMLDivElement>();
  const [activo, setActivo] = useState<number | null>(null);
  // Lo señala la propia dona cuando una venta nueva hace crecer un método (ver el efecto de abajo).
  const [auto, setAuto] = useState<number | null>(null);
  const previo = useRef<Map<string, number> | null>(null);
  const totalAnimado = useCountUp(enVista ? total : 0, 1300);

  const filas = segmentos.filter((s) => s.valor > 0);
  const arcos = arcosDona(filas.map((s) => s.valor));
  const firma = filas.map((s) => `${s.etiqueta}:${s.valor}`).join("|");

  // En vivo: cuando llega una venta y un método crece, la dona lo señala sola un momento —el mismo resalte del
  // ratón: el arco se adelanta y el centro dice su % y su monto—. El ratón manda: si alguien está apuntando, no se
  // lo quitamos. Lo que ya estaba al abrir no cuenta, y con un solo método no hay a quién señalar.
  useEffect(() => {
    const antes = previo.current;
    previo.current = new Map(filas.map((s) => [s.etiqueta, s.valor]));
    if (antes === null || !enVista || filas.length < 2) return;
    const i = filas.findIndex((s) => s.valor > (antes.get(s.etiqueta) ?? 0) + 0.004);
    if (i < 0) return;
    const entra = window.setTimeout(() => setAuto(i), 0);
    const sale = window.setTimeout(() => setAuto(null), 2800);
    return () => {
      window.clearTimeout(entra);
      window.clearTimeout(sale);
    };
    // `filas` cambia de identidad en cada render (y este componente repinta con cada cuadro del conteo): lo que
    // dice si hubo un cambio de verdad es la huella de sus valores.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firma, enVista]);

  // Si los datos se refrescan mientras se apunta (o se señala) un método que ya no existe.
  const elegido = activo ?? auto;
  const sel = elegido !== null && elegido < filas.length ? elegido : null;

  const duenoDeMarca = arcos.length === 0 ? [] : Array.from({ length: MARCAS }, (_, k) => arcoDeMarca(arcos, k, MARCAS));
  const primeraMarca = arcos.map((_, i) => duenoDeMarca.indexOf(i));

  // Ratón y lápiz apuntan; el dedo alterna. `pointerenter` también salta con un toque,
  // y sin esta distinción el método quedaría apuntado apenas se levanta el dedo.
  const puntero = (i: number) => ({
    onPointerEnter: (e: PointerEvent) => e.pointerType === "mouse" && setActivo(i),
    onPointerLeave: (e: PointerEvent) => e.pointerType === "mouse" && setActivo(null),
    onPointerDown: (e: PointerEvent) => e.pointerType !== "mouse" && setActivo((a) => (a === i ? null : i)),
  });

  const dash = (largo: number) => `${largo} ${CIRCUNFERENCIA - largo}`;

  return (
    // `justify-center` centra el conjunto: en fila (anillo + leyenda) queda equilibrado, y si la
    // leyenda baja debajo por falta de ancho, cada línea se centra sola.
    <div ref={ref} className="flex flex-wrap items-center justify-center gap-x-8 gap-y-5">
      {/* El anillo y su texto crecen con el ancho de la TARJETA (`@container` en quien la aloja), no con el de
          la pantalla: la misma pantalla da tarjetas de 300 o de 760 px según cuántas columnas haya. */}
      <div className="relative size-[176px] shrink-0 @[600px]:size-[224px]">
        <svg viewBox="0 0 200 200" className="size-full" aria-hidden>
          <defs>
            <radialGradient id={`${uid}-cara`} cx="50%" cy="42%" r="62%">
              <stop offset="0" style={{ stopColor: "var(--color-papel)" }} />
              <stop offset="1" style={{ stopColor: "color-mix(in srgb, var(--color-sand) 65%, var(--color-papel))" }} />
            </radialGradient>
            <filter id={`${uid}-halo`} filterUnits="userSpaceOnUse" x="-20" y="-20" width="240" height="240">
              <feGaussianBlur stdDeviation="4" />
            </filter>
            {/* Un trazo blanco que da la vuelta descubre lo que tiene detrás. Arranca en las 12
                (por el rotate) y usa la misma curva que la aguja, así que van juntos. */}
            <mask id={`${uid}-barrido`} maskUnits="userSpaceOnUse" x="0" y="0" width="200" height="200">
              <g transform="rotate(-90 100 100)">
                <circle
                  cx="100"
                  cy="100"
                  r={RADIO}
                  fill="none"
                  stroke="white"
                  strokeWidth="64"
                  strokeDasharray={`${BARRIDO} ${BARRIDO}`}
                  strokeDashoffset={BARRIDO}
                  className={enVista ? "anim-dona-barrido" : undefined}
                  style={{ "--dona-c": BARRIDO } as CSSProperties}
                />
              </g>
            </mask>
            {/* La misma luz (arriba a la izquierda) para todos los arcos: el vector está en el
                eje local del anillo, que se dibuja rotado -90°. */}
            {filas.map((s, i) => (
              <linearGradient key={s.etiqueta} id={`${uid}-g${i}`} gradientUnits="userSpaceOnUse" x1="150" y1="50" x2="50" y2="150">
                <stop offset="0" style={{ stopColor: `color-mix(in srgb, ${s.color} 78%, white)` }} />
                <stop offset=".5" style={{ stopColor: s.color }} />
                <stop offset="1" style={{ stopColor: `color-mix(in srgb, ${s.color} 84%, black)` }} />
              </linearGradient>
            ))}
          </defs>

          {/* Cara del cuadrante, ligeramente hundida, y su anillo de puntos */}
          <circle cx="100" cy="100" r="61" fill={`url(#${uid}-cara)`} stroke="var(--color-sand)" strokeWidth=".7" />
          <circle cx="100" cy="100" r="55" fill="none" stroke="var(--color-tinta)" strokeOpacity=".2" strokeWidth=".8" strokeLinecap="round" strokeDasharray="0.1 3.3" />
          {/* Carril vacío: se ve en los huecos y mientras la aguja todavía no llegó */}
          <circle cx="100" cy="100" r={RADIO} fill="none" stroke="var(--color-sand)" strokeOpacity=".55" strokeWidth={GROSOR} />

          <g mask={`url(#${uid}-barrido)`}>
            {/* Resplandor: los mismos arcos, más gruesos y desenfocados */}
            <g transform="rotate(-90 100 100)" filter={`url(#${uid}-halo)`}>
              {arcos.map((a, i) => (
                <circle
                  key={filas[i]!.etiqueta}
                  cx="100"
                  cy="100"
                  r={RADIO}
                  fill="none"
                  stroke={filas[i]!.color}
                  strokeWidth={GROSOR + 4}
                  strokeDasharray={dash(a.largo)}
                  strokeDashoffset={-a.inicio}
                  className="transition-[opacity,stroke-dasharray,stroke-dashoffset] duration-300"
                  style={{ opacity: sel === null ? 0.3 : sel === i ? 0.6 : 0.05 }}
                />
              ))}
            </g>

            <g transform="rotate(-90 100 100)">
              {arcos.map((a, i) => (
                <g
                  key={filas[i]!.etiqueta}
                  className="transition-[transform,opacity] duration-300"
                  style={{
                    transform: sel === i ? `translate(${a.dx}px, ${a.dy}px)` : undefined,
                    opacity: sel !== null && sel !== i ? 0.3 : 1,
                  }}
                >
                  <circle
                    cx="100"
                    cy="100"
                    r={RADIO}
                    fill="none"
                    stroke={`url(#${uid}-g${i})`}
                    strokeWidth={sel === i ? GROSOR_ACTIVO : GROSOR}
                    strokeDasharray={dash(a.largo)}
                    strokeDashoffset={-a.inicio}
                    className="transition-[stroke-width,stroke-dasharray,stroke-dashoffset] duration-300"
                  />
                </g>
              ))}
            </g>

            {/* Bisel: 100 marcas, una por punto porcentual. Cada 5 más larga, cada 10 más larga aún. */}
            <g>
              {duenoDeMarca.map((a, k) => {
                const propia = a === sel;
                const apagada = sel !== null && !propia;
                const mayor = k % 10 === 0;
                const largo = mayor ? 6 : k % 5 === 0 ? 4.2 : 2.8;
                return (
                  <g key={k} transform={`rotate(${k * 3.6} 100 100)`}>
                    <line
                      x1="100"
                      y1="4"
                      x2="100"
                      y2={4 + largo}
                      strokeWidth={mayor ? 1.3 : 0.9}
                      className="transition-[opacity,transform,stroke] duration-300"
                      style={{
                        stroke: propia ? filas[a]!.color : "var(--color-tinta)",
                        opacity: propia ? 1 : apagada ? 0.1 : mayor ? 0.34 : 0.2,
                        transform: propia ? "scaleY(1.75)" : undefined,
                        transformBox: "fill-box",
                        transformOrigin: "50% 0%",
                        // Las marcas del método apuntado se encienden en ola desde donde arranca.
                        transitionDelay: propia ? `${(k - primeraMarca[a]!) * 6}ms` : "0ms",
                      }}
                    />
                  </g>
                );
              })}
            </g>
          </g>

          {/* La aguja: cruza el anillo una vez, al entrar, y se apaga */}
          <g className={enVista ? "anim-dona-mano" : "opacity-0"} pointerEvents="none">
            <line x1="100" y1="4" x2="100" y2="44" stroke="var(--color-tinta)" strokeOpacity=".4" strokeWidth=".8" />
            <circle cx="100" cy="4" r="1.7" fill="var(--color-tinta)" />
          </g>

          {/* Zona de apuntado: más ancha que el arco, para no tener que atinarle a 11 unidades */}
          <g transform="rotate(-90 100 100)">
            {arcos.map((a, i) => (
              <circle
                key={filas[i]!.etiqueta}
                cx="100"
                cy="100"
                r={RADIO}
                fill="none"
                stroke="transparent"
                strokeWidth="30"
                strokeDasharray={dash(a.largo)}
                strokeDashoffset={-a.inicio}
                style={{ pointerEvents: "stroke" }}
                {...puntero(i)}
              />
            ))}
          </g>
        </svg>

        <div aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center text-center">
          {sel === null ? (
            // Antes de entrar a la vista queda oculto: el conteo arranca en 0, y un "S/0" a la vista
            // antes de contar leería como que no hubo ventas.
            <div key="total" className={enVista ? "anim-asentar" : "opacity-0"}>
              <p className="font-display text-[27px] leading-none tabular-nums text-tinta @[600px]:text-[34px]">S/{Math.round(totalAnimado)}</p>
              <p className="label-cayla mt-1.5 text-[9.5px] text-tinta/55 @[600px]:text-[11px]">Hoy</p>
            </div>
          ) : (
            <div key={sel} className="anim-asentar">
              <p className="font-display text-[29px] leading-none tabular-nums text-tinta @[600px]:text-[37px]">{Math.round(arcos[sel]!.frac * 100)}%</p>
              <p className="label-cayla mt-1.5 max-w-[92px] truncate text-[9.5px] text-tinta/60 @[600px]:max-w-[120px] @[600px]:text-[11px]">{filas[sel]!.etiqueta}</p>
              <p className="mt-0.5 text-[12px] font-semibold tabular-nums text-tinta/75 @[600px]:text-[15px]">{formato(filas[sel]!.valor)}</p>
            </div>
          )}
        </div>
        <span className="sr-only">Total de hoy: {formato(total)}</span>
      </div>

      <div className="min-w-[190px] max-w-[280px] flex-1 space-y-1 @[600px]:max-w-[340px]">
        {filas.map((s, i) => {
          const pct = Math.round(arcos[i]!.frac * 100);
          return (
            <div
              key={s.etiqueta}
              {...puntero(i)}
              style={
                {
                  "--i": i,
                  backgroundColor: sel === i ? `color-mix(in srgb, ${s.color} 9%, transparent)` : undefined,
                } as CSSProperties
              }
              className={`rounded-lg px-2.5 py-2 transition-[opacity,background-color] duration-300 ${
                enVista ? "anim-dona-fila" : "opacity-0"
              } ${sel !== null && sel !== i ? "opacity-45" : ""}`}
            >
              <div className="flex items-center justify-between gap-3 text-[13px] @[600px]:text-[15px]">
                <span className="flex min-w-0 items-center gap-2.5 text-tinta">
                  <span
                    aria-hidden
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: s.color, boxShadow: `0 0 0 3px color-mix(in srgb, ${s.color} 16%, transparent)` }}
                  />
                  <span className="truncate">{s.etiqueta}</span>
                </span>
                <span className="shrink-0 font-bold tabular-nums text-tinta/70">
                  {pct}% · {formato(s.valor)}
                </span>
              </div>
              <div aria-hidden className="mt-2 h-[3px] overflow-hidden rounded-full bg-sand">
                <div
                  className={`h-full origin-left rounded-full ${enVista ? "anim-dona-barra" : "scale-x-0"}`}
                  style={{ width: `${pct}%`, backgroundColor: s.color }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
