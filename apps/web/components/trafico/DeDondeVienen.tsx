import type { CSSProperties } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { BarraAvance } from "@/components/ui/BarraAvance";
import { TituloGrupo, TituloSeccion } from "@/components/ui/TituloSeccion";
import {
  AYUDA_CAMINO,
  CAMINOS,
  CIUDADES,
  de100,
  hrefTrafico,
  lider,
  miles,
  personas,
  type Camino,
  type Ciudad,
  type FiltrosTrafico,
  type ResumenTrafico,
} from "@/lib/trafico-reglas";

/**
 * «De dónde vienen» (ADR-0495, actividad 6; maqueta C): por qué camino llega la gente y desde qué ciudad mira, con una barra a escala de
 * la mayor. Cada fila es un filtro: tocarla deja ver solo a esa gente en toda la pantalla; tocarla otra vez, lo quita. Cada lista se
 * cuenta sin su propio filtro (con Instagram puesto, se ve cuántos llegaron por los demás caminos), pero con el otro.
 */
export function DeDondeVienen({ r, filtros }: { r: ResumenTrafico; filtros: FiltrosTrafico }) {
  const totalCaminos = Object.values<number>(r.caminos).reduce((a, b) => a + b, 0);
  const totalCiudades = Object.values<number>(r.ciudades).reduce((a, b) => a + b, 0);
  const camino = lider(r.caminos);
  const ciudad = lider(r.ciudades);
  return (
    <section className="anim-sube card-cayla px-5 py-4" style={{ "--i": 4 } as CSSProperties} aria-labelledby="trafico-donde" data-guia="trafico.donde">
      <TituloSeccion id="trafico-donde">De dónde vienen</TituloSeccion>
      {camino && ciudad && (
        <p className="mt-1 text-[13.5px] text-tinta/70">
          Llegan sobre todo por <b className="font-semibold text-tinta">{CAMINOS[camino]}</b> ({de100(r.caminos[camino], totalCaminos)} de cada 100) y miran desde{" "}
          <b className="font-semibold text-tinta">{CIUDADES[ciudad].nombre}</b> ({de100(r.ciudades[ciudad], totalCiudades)} de cada 100).
        </p>
      )}
      <div className="mt-3 grid gap-x-5 gap-y-4 sm:grid-cols-2">
        <Lista
          titulo="Por dónde llegan"
          filas={(Object.keys(CAMINOS) as Camino[]).map((c) => ({
            clave: c,
            nombre: CAMINOS[c],
            n: r.caminos[c],
            elegida: filtros.camino === c,
            href: hrefTrafico(filtros, { camino: filtros.camino === c ? null : c }),
            ayuda: AYUDA_CAMINO[c],
          }))}
        />
        <Lista
          titulo="Desde qué ciudad"
          filas={(Object.keys(CIUDADES) as Ciudad[]).map((c) => ({
            clave: c,
            nombre: CIUDADES[c].nombre,
            n: r.ciudades[c],
            elegida: filtros.ciudad === c,
            href: hrefTrafico(filtros, { ciudad: filtros.ciudad === c ? null : c }),
            ayuda: CIUDADES[c].tienda ? "Hay una tienda CAYLA" : undefined,
          }))}
        />
      </div>
    </section>
  );
}

type Fila = { clave: string; nombre: string; n: number; elegida: boolean; href: string; ayuda?: string };

function Lista({ titulo, filas }: { titulo: string; filas: Fila[] }) {
  const max = Math.max(1, ...filas.map((f) => f.n));
  return (
    <div className="min-w-0">
      <TituloGrupo>{titulo}</TituloGrupo>
      <ul className="mt-1.5">
        {filas.map((f) => {
          const contenido = (
            <>
              <span className="flex min-w-0 items-center gap-1">
                {f.elegida && <X aria-hidden className="h-3 w-3 shrink-0" />}
                <span className="truncate">{f.nombre}</span>
              </span>
              <BarraAvance pct={(f.n / max) * 100} alto="normal" tono="tinta" decorativa />
              <span className="text-right tabular-nums">{miles(f.n)}</span>
            </>
          );
          return (
            <li key={f.clave}>
              {f.n > 0 || f.elegida ? (
                <Link
                  href={f.href}
                  scroll={false}
                  className="trafico-fila"
                  aria-current={f.elegida ? "true" : undefined}
                  aria-label={`${f.nombre}: ${personas(f.n)}${f.ayuda ? `, ${f.ayuda.charAt(0).toLowerCase()}${f.ayuda.slice(1)}` : ""}. ${f.elegida ? "Quitar el filtro" : "Ver solo a esta gente"}`}
                  title={f.ayuda}
                >
                  {contenido}
                </Link>
              ) : (
                <span className="trafico-fila" data-cero title={f.ayuda}>
                  {contenido}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
