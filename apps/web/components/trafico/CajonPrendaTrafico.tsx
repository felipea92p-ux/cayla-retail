"use client";

import { Minus, TrendingDown, TrendingUp } from "lucide-react";
import { BarraAvance } from "@/components/ui/BarraAvance";
import { BotonVer } from "@/components/ui/BotonDescargar";
import { Cajon } from "@/components/ui/Cajon";
import { Chip } from "@/components/ui/Chip";
import { MiniaturaPrenda } from "@/components/ui/PrendaCelda";
import { TituloGrupo } from "@/components/ui/TituloSeccion";
import { soles } from "@/lib/precio-sede-reglas";
import { franjasDe } from "@/lib/trafico-mosaico";
import {
  CAMINOS,
  cambioDeLaPrenda,
  de100,
  de100QueVieron,
  dondeSeAtoraLaPrenda,
  miles,
  PASOS_DE_LA_PRENDA,
  personas,
  POCAS_PERSONAS,
  type PrendaTrafico,
} from "@/lib/trafico-reglas";

/**
 * El cajón de una prenda de la vitrina de Tráfico (ADR-0495, actividad 5): cuántas personas la miraron y contra los días de antes, su
 * recorrido (de mirarla a recogerla), las tallas y los colores que eligieron y por dónde llegaron. ↑ ↓ pasan a la prenda de al lado,
 * en el orden de la vitrina. Solo lee: no hay nada que guardar aquí.
 */
export function CajonPrendaTrafico({
  p,
  puesto,
  total,
  vieron,
  base,
  periodo,
  antes,
  onCerrar,
  onNavegar,
}: {
  p: PrendaTrafico;
  /** 1 = la más mirada. */
  puesto: number;
  total: number;
  vieron: number;
  base: number[];
  periodo: string;
  antes: string;
  onCerrar: () => void;
  onNavegar: (delta: 1 | -1) => void;
}) {
  const miraron = p.recorrido[0];
  const c = cambioDeLaPrenda(p);
  const Icono = c.sube === null || c.sube === 0 ? Minus : c.sube > 0 ? TrendingUp : TrendingDown;
  const atora = dondeSeAtoraLaPrenda(p, base);
  const totalTallas = p.tallas.reduce((a, t) => a + t.n, 0);
  const totalColores = p.colores.reduce((a, t) => a + t.n, 0);
  const totalCaminos = p.caminos.reduce((a, t) => a + t.n, 0);
  const maxCamino = Math.max(1, ...p.caminos.map((x) => x.n));
  const colorDeLaMarca = franjasDe(p.colores, p.coloresCatalogo)[0]?.hex ?? null;
  const frase = [p.precio !== null ? soles(p.precio) : null, p.codigo, periodo].filter(Boolean).join(" · ");

  return (
    <Cajon
      onCerrar={onCerrar}
      clave={p.id}
      guia="trafico.cajon"
      marca={<MiniaturaPrenda fotoUrl={p.foto} colorHex={colorDeLaMarca} tamano="md" prefijo={p.prefijo} familia={p.familia} categoria={p.categoria} />}
      sobre={p.categoria ?? "Prenda"}
      titulo={p.nombre}
      frase={frase}
      debajo={
        <div className="flex flex-wrap gap-1.5">
          <Chip tono={puesto === 1 ? "tinta" : "neutro"} versalitas={false}>
            {puesto === 1 ? "La más mirada" : `${puesto}.ª más mirada de ${miles(total)}`}
          </Chip>
          <Chip tono={c.tono} versalitas={false}>
            <Icono className="h-3 w-3" aria-hidden />
            {c.texto}
          </Chip>
        </div>
      }
      navegacion={{ indice: puesto - 1, total, onNavegar, que: "Prenda" }}
      pie={<BotonVer href="/tienda-web/vitrina">Ver en la vitrina</BotonVer>}
      claseCuerpo="space-y-6"
    >
      <div>
        <p className="flex items-baseline gap-2.5">
          <span className="font-display text-[40px] leading-[1.05] tabular-nums">{miles(miraron)}</span>
          <span className="text-[15px] text-tinta/70">{miraron === 1 ? "persona la miró" : "personas la miraron"}</span>
        </p>
        <p className="mt-1 text-[13.5px] text-tinta/70">
          De cada 100 que vieron una prenda, <b className="font-semibold text-tinta">{de100QueVieron(p, vieron)} miraron esta</b>. {antes}:{" "}
          {personas(p.anterior)}.
        </p>
      </div>

      <section>
        <TituloGrupo>Su recorrido</TituloGrupo>
        <ol className="mt-2.5 space-y-2.5">
          {PASOS_DE_LA_PRENDA.map((paso, i) => {
            const n = p.recorrido[i];
            const pct = i === 0 ? 100 : de100(n, miraron);
            return (
              <li key={paso.nombre} className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-1">
                <span className="text-[13.5px]">
                  {paso.nombre}
                  {atora?.i === i && <span className="label-cayla ml-2 text-[11px] font-bold text-rojo">Aquí se atora</span>}
                </span>
                <span className="text-[13px] tabular-nums">
                  {miles(n)}
                  {i > 0 && <span className="text-tinta/70"> · {pct} de cada 100</span>}
                </span>
                <BarraAvance pct={pct} alto="fina" tono="tinta" decorativa indice={i} className="col-span-2" />
              </li>
            );
          })}
        </ol>
        {atora && (
          <p className="mt-2.5 text-[13px] text-tinta/70">
            De cada 100 que {PASOS_DE_LA_PRENDA[atora.i - 1].nombre.toLowerCase()}, {atora.seFueronDe100} se fueron {PASOS_DE_LA_PRENDA[atora.i].seFueron}.
          </p>
        )}
      </section>

      <section>
        <TituloGrupo>Tallas que eligieron</TituloGrupo>
        {totalTallas ? (
          <div className="mt-2.5 flex flex-wrap gap-2">
            {p.tallas.map((t, i) => (
              <span key={t.talla} className="trafico-talla" data-mas={i === 0 ? "" : undefined}>
                <b>{t.talla}</b>
                {de100(t.n, totalTallas)} de cada 100
              </span>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-[13px] text-tinta/70">Nadie eligió talla en estos días.</p>
        )}
      </section>

      <section>
        <TituloGrupo>Colores que eligieron</TituloGrupo>
        {totalColores ? (
          <ul className="mt-2.5 flex flex-wrap gap-x-4 gap-y-2 text-[13px]">
            {p.colores.map((c) => (
              <li key={c.codigo} className="inline-flex items-center gap-2">
                <span aria-hidden className="trafico-muestra" data-color-dato style={{ backgroundColor: c.hex ?? undefined }} />
                {c.nombre}
                <span className="text-tinta/70">· {de100(c.n, totalColores)} de cada 100</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-[13px] text-tinta/70">Nadie eligió color en estos días.</p>
        )}
      </section>

      <section>
        <TituloGrupo>Por dónde llegaron</TituloGrupo>
        {totalCaminos ? (
          <ul className="mt-2.5 space-y-2">
            {p.caminos.map((x, i) => (
              <li key={x.camino} className="grid grid-cols-[8rem_minmax(0,1fr)_3rem] items-center gap-3 text-[13px]">
                <span className="truncate">{CAMINOS[x.camino]}</span>
                <BarraAvance pct={(x.n / maxCamino) * 100} alto="normal" tono="tinta" decorativa indice={i} />
                <span className="text-right tabular-nums">{miles(x.n)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-[13px] text-tinta/70">Sin datos de por dónde llegaron.</p>
        )}
      </section>

      {miraron < POCAS_PERSONAS && <p className="nota-cayla text-[13px]">Con tan poca gente, tómalo como una pista, no como una regla.</p>}
    </Cajon>
  );
}
