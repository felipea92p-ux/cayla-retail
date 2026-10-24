"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Shirt } from "lucide-react";
import type { Familia } from "@cayla-retail/shared";
import { IconoCategoria } from "@/components/IconoCategoria";
import { tonoDeCategoria } from "@/components/MuestraCategoria";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Vacio } from "@/components/ui/Vacio";
import { estiloMosaicoColor } from "@/lib/color-prenda-reglas";
import { BALDOSAS_A_LA_VISTA, conIcono, etiquetaQueCabe, franjasDe, squarify, type Baldosa } from "@/lib/trafico-mosaico";
import { de100QueVieron, miles, personas, type PrendaTrafico } from "@/lib/trafico-reglas";
import { usePrendaAbierta } from "./usePrendaAbierta";

/** El aire entre baldosa y baldosa (px). */
const HUECO = 3;

/**
 * «La vitrina, por miradas» (ADR-0495, actividad 5; maqueta C «La vitrina»): un mosaico de las prendas que la gente miró en el período.
 * Cada baldosa ocupa lo que la miraron y lleva los colores que eligieron, en franjas; la etiqueta de papel dice su nombre y su cifra.
 * Tocar una abre su cajón con su recorrido, sus tallas, sus colores y de dónde vinieron. Se mide con el ancho y el alto reales de su
 * caja: junto a «De dónde vienen», termina donde termina esa columna.
 */
export function VitrinaTrafico({
  prendas,
  vieron,
  base,
  periodo,
  antes,
}: {
  prendas: PrendaTrafico[];
  /** Personas que vieron al menos una prenda (el paso 1 del recorrido): de ahí sale «de cada 100». */
  vieron: number;
  /** El «de costumbre» de los 6 pasos (90 días de toda la tienda), para decir dónde se atora cada prenda. */
  base: number[];
  /** «Últimos 7 días», «Halloween». */
  periodo: string;
  /** «Los 7 días anteriores». */
  antes: string;
}) {
  const caja = useRef<HTMLDivElement>(null);
  const [lienzo, setLienzo] = useState<{ w: number; h: number } | null>(null);
  const { contenedor, abrir, cajon } = usePrendaAbierta({ prendas, vieron, base, periodo, antes });
  const hay = prendas.length > 0;

  useEffect(() => {
    const el = caja.current;
    if (!el) return;
    const medir = () => setLienzo({ w: el.clientWidth, h: el.clientHeight });
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, [hay]);

  const aLaVista = prendas.slice(0, BALDOSAS_A_LA_VISTA);
  const resto = prendas.slice(BALDOSAS_A_LA_VISTA);
  const miradasDelResto = resto.reduce((a, p) => a + p.recorrido[0], 0);
  const valores = [...aLaVista.map((p) => p.recorrido[0]), ...(resto.length ? [miradasDelResto] : [])];
  const baldosas = lienzo ? squarify(valores, lienzo.w, lienzo.h) : [];
  const mas = prendas[0];

  return (
    <section
      ref={contenedor}
      className="anim-sube card-cayla flex min-w-0 flex-col px-5 py-4"
      style={{ "--i": 3 } as CSSProperties}
      aria-labelledby="trafico-vitrina"
      data-guia="trafico.vitrina"
    >
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <TituloSeccion id="trafico-vitrina">La vitrina, por miradas</TituloSeccion>
        {mas && (
          <p className="text-[13.5px] text-tinta/70">
            <b className="font-semibold text-tinta">La más mirada: {mas.nombre}</b>, {personas(mas.recorrido[0])} ({de100QueVieron(mas, vieron)} de cada 100 que vieron una
            prenda).
          </p>
        )}
        {hay && <p className="text-[12.5px] text-tinta/70 sm:ml-auto">Tamaño: cuántos la miraron · franjas: los colores que eligieron</p>}
      </div>
      {hay ? (
        <TooltipProvider delayDuration={250}>
          <div ref={caja} className="trafico-mosaico mt-3">
            {lienzo && aLaVista.map((p, k) => <Pieza key={p.id} p={p} k={k} b={baldosas[k]} onAbrir={() => abrir(k)} />)}
            {lienzo && resto.length > 0 && <Resto n={resto.length} b={baldosas[aLaVista.length]} />}
            {lienzo && <div aria-hidden className="trafico-barrido" style={{ "--n": aLaVista.length } as CSSProperties} />}
          </div>
        </TooltipProvider>
      ) : (
        <Vacio icono={<Shirt />} titulo="Nadie miró una prenda en estos días" tamano="chico">
          Entraron a la tienda, pero se fueron sin abrir ninguna.
        </Vacio>
      )}
      {cajon}
    </section>
  );
}

/** Una baldosa: los colores en franjas, el ícono de su categoría si cabe y la etiqueta de papel con lo que le quepa. */
function Pieza({ p, k, b, onAbrir }: { p: PrendaTrafico; k: number; b: Baldosa | undefined; onAbrir: () => void }) {
  if (!b || b.w <= 0 || b.h <= 0) return null;
  const x = b.x + HUECO / 2;
  const y = b.y + HUECO / 2;
  const w = Math.max(0, b.w - HUECO);
  const h = Math.max(0, b.h - HUECO);
  const franjas = franjasDe(p.colores, p.coloresCatalogo);
  const tono = tonoDeCategoria((p.familia ?? null) as Familia | null);
  const principal = estiloMosaicoColor(franjas[0]?.hex);
  const ultima = estiloMosaicoColor(franjas.at(-1)?.hex);
  const filo = franjas.some((f) => estiloMosaicoColor(f.hex)?.filo);
  const cabe = etiquetaQueCabe(w, h);
  const n = p.recorrido[0];
  const etiqueta = `${p.nombre}${p.categoria ? `, ${p.categoria}` : ""}: ${personas(n)} la ${n === 1 ? "miró" : "miraron"}, ${k === 0 ? "la más mirada" : `la ${k + 1}.ª más mirada`}. Ver el detalle`;
  const estilo = { left: x, top: y, width: w, height: h, backgroundColor: franjas.length ? undefined : tono.fondo, "--k": k } as CSSProperties;
  const boton = (
    <button
      type="button"
      className="trafico-pieza"
      data-prenda={p.id}
      data-primera={k === 0 ? "" : undefined}
      data-filo={filo ? "" : undefined}
      data-color-dato
      data-guia={k === 0 ? "trafico.prenda" : undefined}
      style={estilo}
      aria-label={etiqueta}
      onClick={onAbrir}
    >
      {franjas.map((f) => (
        <i key={f.hex + f.nombre} aria-hidden className="trafico-franja" data-color-dato style={{ flexGrow: f.peso, backgroundColor: f.hex }} />
      ))}
      {conIcono(w, h) && (
        <span aria-hidden className="trafico-icono" style={{ color: ultima?.trazo ?? principal?.trazo ?? tono.acento }}>
          <IconoCategoria prefijo={p.prefijo} familia={(p.familia ?? null) as Familia | null} className="h-full w-full" />
        </span>
      )}
      {(cabe === "grande" || cabe === "media") && (
        <span aria-hidden className="trafico-etiqueta papel-fijo">
          {k === 0 && <span className="trafico-etiqueta-mas">La más mirada</span>}
          <span className="trafico-etiqueta-nombre">{p.nombre}</span>
          <span className="trafico-etiqueta-n">{personas(n)}</span>
        </span>
      )}
      {cabe === "chica" && (
        <span aria-hidden className="trafico-etiqueta papel-fijo" data-chica>
          <span className="trafico-etiqueta-n tabular-nums">{miles(n)}</span>
        </span>
      )}
    </button>
  );
  if (cabe === "grande" || cabe === "media") return boton;
  // Una baldosa chica no tiene lugar para el nombre: lo dice al pasar el mouse (y entero al tocarla, en su cajón).
  return (
    <Tooltip>
      <TooltipTrigger asChild>{boton}</TooltipTrigger>
      <TooltipContent sideOffset={4}>{`${p.nombre}: ${personas(n)}`}</TooltipContent>
    </Tooltip>
  );
}

/** Lo que no cupo en la vitrina: un hueco con cuántas prendas más miraron. No se abre (la lista completa va en la tabla). */
function Resto({ n, b }: { n: number; b: Baldosa | undefined }) {
  if (!b || b.w <= 0 || b.h <= 0) return null;
  const w = Math.max(0, b.w - HUECO);
  const h = Math.max(0, b.h - HUECO);
  return (
    <p className="trafico-resto" style={{ left: b.x + HUECO / 2, top: b.y + HUECO / 2, width: w, height: h }}>
      {w >= 70 && h >= 36 ? `Y ${miles(n)} ${n === 1 ? "prenda" : "prendas"} más` : `+${miles(n)}`}
    </p>
  );
}
