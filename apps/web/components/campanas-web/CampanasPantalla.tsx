"use client";

import { useState } from "react";
import { Image as ImagenIcono, Palette, Sparkles } from "lucide-react";
import { Aviso } from "@/components/ui/Aviso";
import { BotonEnlace } from "@/components/ui/campos";
import { Chip, type TonoChip } from "@/components/ui/Chip";
import { CifraQueCuenta } from "@/components/ui/CifraQueCuenta";
import { EnlaceVer } from "@/components/ui/EnlaceVer";
import { Encabezado, Tabla, celda, fila } from "@/components/ui/Tabla";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { Vacio } from "@/components/ui/Vacio";
import {
  ESTADO_DICHO,
  cifrasCampanas,
  contarPorFiltro,
  crucesDeCampanas,
  cuandoDicho,
  disenoDicho,
  fechaCortaDicha,
  filtrarCampanas,
  lineaDeTiempo,
  pctDicho,
  vigenciaDicha,
  type CampanaWeb,
  type EstadoCampana,
  type FiltroCampanas,
  type LecturaCampanasWeb,
} from "@/lib/campanas-web-reglas";

// En el celular la fila es una tarjeta: la campaña arriba y, debajo, su diseño y su estado. Desde `sm`, columnas.
const PLANTILLA = "grid-cols-1 gap-y-2 sm:grid-cols-[minmax(0,1fr)_5.5rem_5.5rem_minmax(9rem,13rem)_7.5rem]";
const TONO_ESTADO: Record<EstadoCampana, TonoChip> = { vivo: "verde", prog: "pizarra", fin: "neutro" };
const FILTROS: { valor: FiltroCampanas; texto: string }[] = [
  { valor: "todas", texto: "Todas" },
  { valor: "vivo", texto: "En vivo" },
  { valor: "prog", texto: "Programadas" },
  { valor: "fin", texto: "Terminadas" },
];

/**
 * Tienda web ▸ Campañas (Felipe 2026-10-21; maqueta docs/maquetas/campanas-tienda-2026-10, pantalla 1). La lista de las campañas de la
 * tienda online con el diseño que tiene cada una y cuáles se verán «como siempre». Esta entrega solo lee: el editor de diseño llega
 * en la actividad siguiente.
 */
export function CampanasPantalla({ lectura, puedeIrAEtiquetas }: { lectura: LecturaCampanasWeb; puedeIrAEtiquetas: boolean }) {
  const [filtro, setFiltro] = useState<FiltroCampanas>("todas");
  const { campanas, hoy } = lectura;

  const cifras = cifrasCampanas(campanas);
  const cuantas = contarPorFiltro(campanas);
  const visibles = filtrarCampanas(campanas, filtro);
  const cruces = crucesDeCampanas(campanas);
  const tiempo = lineaDeTiempo(campanas, hoy);
  const irAEtiquetas = (
    <BotonEnlace href="/productos/atributos?tipo=etiquetas" peso="fantasma">
      Armar una campaña en Etiquetas
    </BotonEnlace>
  );

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3" data-guia="campanas.cifras">
        <TarjetaCifra
          punto={cifras.enVivo > 0 ? "verde" : "neutro"}
          etiqueta="En vivo ahora"
          className="anim-entra"
          style={{ ["--i" as string]: 0 }}
          valor={<CifraQueCuenta valor={cifras.enVivo} alMontar />}
        >
          {cifras.vivaPrimera ? `${cifras.vivaPrimera.nombre} · ${cuandoDicho(cifras.vivaPrimera, hoy).toLowerCase()}` : "Ahora la tienda se ve como siempre"}
        </TarjetaCifra>
        <TarjetaCifra
          punto="neutro"
          etiqueta="Programadas"
          className="anim-entra"
          style={{ ["--i" as string]: 1 }}
          valor={<CifraQueCuenta valor={cifras.programadas} alMontar />}
        >
          {cifras.proxima ? `La próxima: ${cifras.proxima.nombre}${cifras.proxima.desde ? `, ${fechaCortaDicha(cifras.proxima.desde)}` : ""}` : "No hay campañas por empezar"}
        </TarjetaCifra>
        <TarjetaCifra
          punto={cifras.sinDiseno > 0 ? "ambar" : "verde"}
          etiqueta="Sin diseño propio"
          className="anim-entra"
          style={{ ["--i" as string]: 2 }}
          valor={<CifraQueCuenta valor={cifras.sinDiseno} alMontar />}
        >
          {cifras.sinDiseno > 0 ? "Se verán como siempre" : campanas.some((c) => c.estado !== "fin") ? "Todas tienen su diseño" : "No hay campañas por diseñar"}
        </TarjetaCifra>
      </div>

      {campanas.length === 0 ? (
        <section className="card-cayla">
          <Vacio
            icono={<Palette />}
            titulo="Todavía no hay campañas"
            acciones={puedeIrAEtiquetas ? irAEtiquetas : undefined}
          >
            Una campaña se arma en Catálogo ▸ Etiquetas, con su descuento, sus fechas y sus prendas. Cuando exista, aparece aquí para
            darle su diseño.
          </Vacio>
        </section>
      ) : (
        <section className="card-cayla space-y-0">
          <div className="flex flex-wrap items-center gap-3 border-b border-sand px-5 py-4">
            <div className="pildoras-desliza gap-2 sm:flex-wrap" role="group" aria-label="Estado de la campaña" data-guia="campanas.filtros">
              {FILTROS.map((f) => (
                <button key={f.valor} type="button" className="pildora-cayla" aria-pressed={filtro === f.valor} onClick={() => setFiltro(f.valor)}>
                  {f.texto}
                  <span className="pildora-cayla__n">· {cuantas[f.valor]}</span>
                </button>
              ))}
            </div>
            {puedeIrAEtiquetas && <div className="ml-auto">{irAEtiquetas}</div>}
          </div>

          {visibles.length === 0 ? (
            <Vacio icono={<Palette />} tamano="chico">
              No hay campañas {filtro === "vivo" ? "en vivo" : filtro === "prog" ? "programadas" : "terminadas"} ahora.
            </Vacio>
          ) : (
            <Tabla className="rounded-none border-0 shadow-none" guia="campanas.lista">
              <Encabezado
                plantilla={PLANTILLA}
                columnas={[
                  { titulo: "Campaña" },
                  { titulo: "Descuento", alinear: "der", soloEscritorio: true },
                  { titulo: "Prendas", alinear: "der", soloEscritorio: true },
                  { titulo: "Diseño", soloEscritorio: true },
                  { titulo: "Estado" },
                ]}
              />
              {visibles.map((c) => (
                <FilaCampana key={c.id} c={c} hoy={hoy} />
              ))}
            </Tabla>
          )}
        </section>
      )}

      {tiempo.barras.length > 0 && (
        <section className="card-cayla space-y-4 p-5" data-guia="campanas.tiempo">
          <TituloSeccion className="!mt-0">Los próximos 3 meses</TituloSeccion>
          <div className="space-y-2" role="img" aria-label="Línea de tiempo de las campañas de los próximos tres meses">
            <div className="flex gap-3" aria-hidden>
              <span className="w-28 shrink-0" />
              <div className="relative h-5 flex-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-taupe">
                {tiempo.meses.map((m) => (
                  <span key={m.nombre} className="absolute top-0" style={{ left: `${m.izquierda}%` }}>
                    <span className="sm:hidden">{m.nombre.slice(0, 3)}</span>
                    <span className="hidden sm:inline">{m.nombre}</span>
                  </span>
                ))}
              </div>
            </div>
            <div className="relative space-y-2">
              {tiempo.barras.map((b) => (
                <div key={b.campana.id} className="flex items-center gap-3">
                  <span className="w-28 shrink-0 truncate text-[12px] font-semibold" title={b.campana.nombre}>
                    {b.campana.nombre}
                  </span>
                  <div className="relative h-6 flex-1 rounded-md bg-hueso">
                    <span
                      className={`absolute inset-y-0 rounded-md ${b.campana.estado === "vivo" ? "bg-tinta" : "bg-taupe"}`}
                      style={{ left: `${b.izquierda}%`, width: `${b.ancho}%` }}
                      title={`${b.campana.nombre} · ${vigenciaDicha(b.campana.desde, b.campana.hasta)}`}
                    />
                  </div>
                </div>
              ))}
              <span
                className="pointer-events-none absolute inset-y-0 w-px bg-rojo"
                style={{ left: `calc(7.75rem + (100% - 7.75rem) * ${tiempo.hoy / 100})` }}
                aria-hidden
                title="Hoy"
              />
            </div>
          </div>
        </section>
      )}

      {cruces.length > 0 && (
        <Aviso tono="atencion" titulo={cruces.length === 1 ? "Dos campañas coinciden en fechas" : `${cruces.length} cruces entre campañas`}>
          {cruces.map((x) => (
            <span key={`${x.gana.id}-${x.otra.id}`} className="block">
              «{x.gana.nombre}» y «{x.otra.nombre}»{x.desde ? ` del ${fechaCortaDicha(x.desde)}` : ""}
              {x.hasta ? ` al ${fechaCortaDicha(x.hasta)}` : ""}: la tienda muestra la que termina primero, «{x.gana.nombre}».
            </span>
          ))}
        </Aviso>
      )}

      <p className="nota-cayla" data-guia="campanas.nota">
        Al terminar una campaña, la tienda vuelve sola a su diseño de siempre. Una campaña sin diseño se ve como siempre: con su frase en la
        franja de arriba y su cuenta regresiva.
      </p>
    </div>
  );
}

function FilaCampana({ c, hoy }: { c: CampanaWeb; hoy: string }) {
  const diseno = disenoDicho(c.diseno);
  return (
    <div role="row" className={fila(PLANTILLA, "items-center")}>
      <span className={celda("izq", "flex items-center gap-3")}>
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${c.diseno ? "bg-tinta text-crema" : "border border-dashed border-taupe/60 bg-hueso text-taupe"}`}
          aria-hidden
        >
          {c.diseno?.modo === "imagen" ? <ImagenIcono className="h-4 w-4" /> : c.diseno ? <Sparkles className="h-4 w-4" /> : <Palette className="h-4 w-4" />}
        </span>
        <span className="min-w-0">
          <b className="block truncate font-semibold">{c.nombre}</b>
          <small className="block text-[12px] text-tinta/65">
            {vigenciaDicha(c.desde, c.hasta)} · {cuandoDicho(c, hoy)}
          </small>
        </span>
      </span>
      <span className={celda("der", "hidden font-semibold sm:block")}>{pctDicho(c.pct)}</span>
      <span className={celda("der", "hidden tabular-nums sm:block")}>{c.prendas}</span>
      <span className={celda("izq", "hidden sm:block")}>
        <Chip tono={diseno.borrador ? "ambar" : c.diseno ? "neutro" : "apagado"} versalitas={false} tachado={false}>
          {diseno.texto}
        </Chip>
      </span>
      <span className={celda("der", "hidden sm:block")}>
        <Chip tono={TONO_ESTADO[c.estado]}>{ESTADO_DICHO[c.estado]}</Chip>
      </span>
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-tinta/65 sm:hidden">
        <Chip tono={TONO_ESTADO[c.estado]}>{ESTADO_DICHO[c.estado]}</Chip>
        <span>
          {pctDicho(c.pct)} · {diseno.texto}
        </span>
      </span>
    </div>
  );
}
