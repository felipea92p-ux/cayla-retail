"use client";

import { useState, type CSSProperties, type PointerEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { BarraApilada } from "@/components/ui/BarraApilada";
import { Chip } from "@/components/ui/Chip";
import { SegmentoDeslizante } from "@/components/ui/SegmentoDeslizante";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { DEPARTAMENTOS, PERU_ALTO, PERU_ANCHO } from "@/lib/peru-departamentos";
import {
  AYUDA_CAMINO,
  CAMINOS,
  CIUDADES,
  ciudadDeRegion,
  ciudadesDeLaLista,
  ciudadSinTienda,
  colorDeCamino,
  de100,
  hrefTrafico,
  miles,
  personas,
  regionEnElMapa,
  rindeElCamino,
  tinteDeRegion,
  type Camino,
  type Ciudad,
  type FiltrosTrafico,
  type ResumenTrafico,
} from "@/lib/trafico-reglas";

/** Las tiendas CAYLA en el mapa: un punto sobre su departamento. El nombre no se escribe (Felipe 2026-10-29): sale solo al pasar el mouse. */
const TIENDAS: string[] = ["PE-LAL", "PE-LMA", "PE-ARE"];

/**
 * «De dónde vienen» (actividad 5; maqueta `docs/maquetas/trafico-decisiones-2026-10/`): por qué camino llega la gente y cuántos de ellos
 * separan, o desde dónde mira, en el contorno real del Perú con cada departamento más rojo mientras más gente mira desde ahí (Felipe
 * pidió pintar el departamento en vez de un círculo que crece). Cada fila —y cada departamento— es un filtro: tocarlo deja ver solo a
 * esa gente en toda la pantalla; tocarlo otra vez, lo quita. Cada lista se cuenta sin su propio filtro, pero con el otro.
 */
export function DeDondeVienen({ r, filtros }: { r: ResumenTrafico; filtros: FiltrosTrafico }) {
  const [vista, setVista] = useState<"camino" | "ciudad">(filtros.ciudad && !filtros.camino ? "ciudad" : "camino");
  return (
    <section className="anim-sube card-cayla px-5 py-4" style={{ "--i": 7 } as CSSProperties} aria-labelledby="trafico-donde" data-guia="trafico.donde">
      <TituloSeccion id="trafico-donde" dato="Toca uno para filtrar">
        De dónde vienen
      </TituloSeccion>
      <div className="mt-3">
        <SegmentoDeslizante
          forma="modo"
          etiqueta="Ver por"
          valor={vista}
          onCambio={(v) => setVista(v as "camino" | "ciudad")}
          opciones={[
            { clave: "camino", etiqueta: "Por camino" },
            { clave: "ciudad", etiqueta: "Por ciudad" },
          ]}
        />
      </div>
      {vista === "camino" ? <PorCamino r={r} filtros={filtros} /> : <PorCiudad r={r} filtros={filtros} />}
    </section>
  );
}

function PorCamino({ r, filtros }: { r: ResumenTrafico; filtros: FiltrosTrafico }) {
  const total = Object.values<number>(r.caminos).reduce((a, b) => a + b, 0);
  const separaronTodos = Object.values<number>(r.caminosSeparan).reduce((a, b) => a + b, 0);
  const caminos = (Object.keys(CAMINOS) as Camino[]).filter((c) => r.caminos[c] > 0 || filtros.camino === c).sort((a, b) => r.caminos[b] - r.caminos[a]);
  const max = Math.max(1, ...caminos.map((c) => r.caminos[c]));
  if (!caminos.length) return <p className="mt-3 text-[15px] text-tinta/70">Todavía nadie llegó por ningún camino en estos días.</p>;
  return (
    <ul className="mt-2">
      {caminos.map((c) => {
        const n = r.caminos[c];
        const rinde = rindeElCamino(n, r.caminosSeparan[c], total, separaronTodos);
        const elegido = filtros.camino === c;
        return (
          <li key={c}>
            <Link
              href={hrefTrafico(filtros, { camino: elegido ? null : c })}
              scroll={false}
              className="trafico-camino"
              aria-current={elegido ? "true" : undefined}
              title={AYUDA_CAMINO[c]}
              aria-label={`${CAMINOS[c]}: ${personas(n)}, ${rinde.de100} de cada 100 separan. ${elegido ? "Quitar el filtro" : "Ver solo a esta gente"}`}
            >
              <span className="flex min-w-0 items-center gap-2 font-semibold">
                {elegido && <X aria-hidden className="h-3 w-3 shrink-0" />}
                {/* El color del camino, como la maqueta: el punto y la barra (es dato: el nombre va escrito al lado). */}
                <i aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: colorDeCamino(c) }} />
                <span className="truncate">{CAMINOS[c]}</span>
              </span>
              <span className="text-right font-semibold tabular-nums">
                {miles(n)} <small className="ml-1 font-normal text-tinta/70">{de100(n, total)} de 100</small>
              </span>
              <BarraApilada
                className="col-span-2"
                alto={8}
                total={max}
                decorativa
                segmentos={[{ clave: c, nombre: CAMINOS[c], valor: n, color: colorDeCamino(c) }]}
              />
              <span className="col-span-2">
                <Chip tono={rinde.tono}>{rinde.de100} de cada 100 separan</Chip>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function PorCiudad({ r, filtros }: { r: ResumenTrafico; filtros: FiltrosTrafico }) {
  const router = useRouter();
  const [tip, setTip] = useState<{ x: number; y: number; titulo: string; texto: string } | null>(null);
  // Al pasar el mouse (o el foco) por una ciudad de la lista, sus departamentos se iluminan en el mapa y los demás se apagan.
  const [resaltadas, setResaltadas] = useState<readonly Ciudad[] | null>(null);
  const enMapa = DEPARTAMENTOS.map((d) => ({ ...d, ciudad: ciudadDeRegion(d.iso), ...regionEnElMapa(d.iso, d.nombre, r.regiones) }));
  const max = Math.max(0, ...enMapa.map((d) => d.n));
  const sinTienda = ciudadSinTienda(r.ciudades);
  const lista = ciudadesDeLaLista(r.ciudades, filtros.ciudad);
  const resaltar = (c: readonly Ciudad[] | null) => ({
    onPointerEnter: () => setResaltadas(c),
    onPointerLeave: () => setResaltadas(null),
    onFocus: () => setResaltadas(c),
    onBlur: () => setResaltadas(null),
  });

  const mostrar = (e: PointerEvent<SVGSVGElement>) => {
    const dep = (e.target as Element).closest<SVGPathElement>("[data-region]");
    if (!dep) return setTip(null);
    const caja = e.currentTarget.parentElement!.getBoundingClientRect();
    const b = dep.getBoundingClientRect();
    const d = enMapa.find((x) => x.iso === dep.dataset.region);
    if (!d) return setTip(null);
    setTip({ x: b.left - caja.left + b.width / 2, y: b.top - caja.top + b.height / 2, titulo: d.nombre, texto: d.n ? personas(d.n) : "Nadie todavía" });
  };

  return (
    <div className="mt-3">
      {sinTienda && (
        <p className="text-[15px] text-tinta/70">
          Desde <b className="font-semibold text-tinta">{CIUDADES[sinTienda].nombre}</b> miran {personas(r.ciudades[sinTienda])} y todavía no hay tienda ahí.
        </p>
      )}
      <div className="relative mx-auto mt-3 w-full max-w-[260px]">
        <svg
          viewBox={`0 0 ${PERU_ANCHO} ${PERU_ALTO}`}
          className="block h-auto w-full"
          data-resaltando={resaltadas ? "" : undefined}
          role="img"
          aria-label={`Mapa del Perú: mientras más rojo el departamento, más gente mira desde ahí.${sinTienda ? ` Fuera de las tiendas, la que más mira es ${CIUDADES[sinTienda].nombre}.` : ""}`}
          onPointerOver={mostrar}
          onPointerLeave={() => setTip(null)}
        >
          {enMapa.map((d) => (
            <path
              key={d.iso}
              d={d.d}
              data-region={d.iso}
              data-elegido={filtros.ciudad === d.ciudad || undefined}
              data-resaltado={resaltadas?.includes(d.ciudad) || undefined}
              className="trafico-mapa-dep"
              style={{ fill: `color-mix(in srgb, var(--color-rojo) ${tinteDeRegion(d.n, max)}%, var(--color-hueso))` }}
              onClick={() => router.push(hrefTrafico(filtros, { ciudad: filtros.ciudad === d.ciudad ? null : d.ciudad }), { scroll: false })}
            />
          ))}
          {TIENDAS.map((iso) => {
            const d = DEPARTAMENTOS.find((x) => x.iso === iso)!;
            return <circle key={iso} cx={d.x} cy={d.y} r={5} className="trafico-mapa-tienda pointer-events-none" aria-hidden />;
          })}
        </svg>
        {tip && (
          <div role="tooltip" className="linea-globo" style={{ left: tip.x, top: tip.y }}>
            <b className="block font-semibold">{tip.titulo}</b>
            {tip.texto}
          </div>
        )}
      </div>
      <p className="mt-2 flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1 text-sm text-tinta/70">
        <span>Menos gente</span>
        <i aria-hidden className="trafico-calor-escala" />
        <span>Más gente</span>
        <span className="inline-flex items-center gap-1.5">
          <i aria-hidden className="trafico-mapa-muestra" />
          Tienda CAYLA
        </span>
      </p>
      <ul className="mt-3">
        {lista.top.map((c) => {
          const elegida = filtros.ciudad === c;
          return (
            <li key={c}>
              <Link
                href={hrefTrafico(filtros, { ciudad: elegida ? null : c })}
                scroll={false}
                className="trafico-fila"
                aria-current={elegida ? "true" : undefined}
                aria-label={`${CIUDADES[c].nombre}: ${personas(r.ciudades[c])}${CIUDADES[c].tienda ? ", hay una tienda CAYLA" : ""}. ${elegida ? "Quitar el filtro" : "Ver solo a esta gente"}`}
                {...resaltar([c])}
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  {elegida && <X aria-hidden className="h-3 w-3 shrink-0" />}
                  <span className="truncate">{CIUDADES[c].nombre}</span>
                  {CIUDADES[c].tienda && (
                    <Chip tono="pizarra" versalitas={false}>
                      Tienda
                    </Chip>
                  )}
                </span>
                <span />
                <span className="text-right tabular-nums">{miles(r.ciudades[c])}</span>
              </Link>
            </li>
          );
        })}
        {lista.otras > 0 && (
          // Suma ciudades distintas (y el extranjero): no es un filtro, solo se ilumina en el mapa.
          <li>
            <span className="trafico-fila" tabIndex={0} aria-label={`Otras ciudades: ${personas(lista.otras)}`} {...resaltar(lista.grupo)}>
              <span className="truncate">Otras ciudades</span>
              <span />
              <span className="text-right tabular-nums">{miles(lista.otras)}</span>
            </span>
          </li>
        )}
      </ul>
    </div>
  );
}
