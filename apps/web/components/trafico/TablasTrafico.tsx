"use client";

import Link from "next/link";
import { Shirt } from "lucide-react";
import { MiniaturaPrenda } from "@/components/ui/PrendaCelda";
import { Chip } from "@/components/ui/Chip";
import { Encabezado, Tabla, celda, fila, type Columna } from "@/components/ui/Tabla";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { Vacio } from "@/components/ui/Vacio";
import { franjasDe } from "@/lib/trafico-mosaico";
import {
  CAMINOS,
  CIUDADES,
  de100,
  dondeSeAtora,
  hrefTrafico,
  miles,
  PASOS,
  picoDeHoras,
  tramosDeTres,
  tramoTexto,
  type Camino,
  type Ciudad,
  type FiltrosTrafico,
  type ResumenTrafico,
} from "@/lib/trafico-reglas";
import { usePrendaAbierta } from "./usePrendaAbierta";

const P_PRENDAS = "sm:grid-cols-[2rem_minmax(12rem,2fr)_minmax(7rem,1fr)_repeat(5,minmax(5.5rem,0.6fr))]";
const C_PRENDAS: Columna[] = [
  { titulo: "#", alinear: "der" },
  { titulo: "Prenda" },
  { titulo: "Categoría" },
  { titulo: "La miraron", alinear: "der" },
  { titulo: "Eligieron talla", alinear: "der" },
  { titulo: "A la bolsa", alinear: "der" },
  { titulo: "Separaron", alinear: "der" },
  { titulo: "Recogieron", alinear: "der" },
];
const P_RECORRIDO = "sm:grid-cols-[minmax(9rem,2fr)_repeat(3,minmax(5.5rem,1fr))]";
const C_RECORRIDO: Columna[] = [{ titulo: "Paso" }, { titulo: "Personas", alinear: "der" }, { titulo: "De cada 100", alinear: "der" }, { titulo: "Se fueron aquí", alinear: "der" }];
const P_CAMINOS = "sm:grid-cols-[minmax(9rem,2fr)_repeat(2,minmax(5.5rem,1fr))]";
const C_CAMINOS: Columna[] = [{ titulo: "Camino" }, { titulo: "Personas", alinear: "der" }, { titulo: "De cada 100", alinear: "der" }];
const P_CIUDADES = "sm:grid-cols-[minmax(8rem,2fr)_minmax(6rem,1fr)_repeat(2,minmax(5.5rem,1fr))]";
const C_CIUDADES: Columna[] = [{ titulo: "Ciudad" }, { titulo: "Tienda CAYLA" }, { titulo: "Personas", alinear: "der" }, { titulo: "De cada 100", alinear: "der" }];
const P_HORAS = P_CAMINOS;
const C_HORAS: Columna[] = [{ titulo: "Tramo" }, { titulo: "Personas", alinear: "der" }, { titulo: "De cada 100", alinear: "der" }];

/**
 * La vista de tabla de Tráfico (ADR-0495, actividad 6): los mismos números que el gráfico, en filas, para quien prefiere leer cifras o
 * usa un lector de pantalla. Las prendas son TODAS las que se miraron (la vitrina dibuja 24) y abren el mismo cajón; los caminos y las
 * ciudades filtran como en «De dónde vienen».
 */
export function TablasTrafico({ r, filtros, periodo, antes }: { r: ResumenTrafico; filtros: FiltrosTrafico; periodo: string; antes: string }) {
  const { contenedor, abrir, cajon } = usePrendaAbierta({ prendas: r.prendas, vieron: r.pasos[1], base: r.base, periodo, antes });
  const total = r.pasos[0];
  const atora = dondeSeAtora(r.pasos, r.base);
  const totalCaminos = Object.values<number>(r.caminos).reduce((a, b) => a + b, 0);
  const totalCiudades = Object.values<number>(r.ciudades).reduce((a, b) => a + b, 0);
  const pico = picoDeHoras(r.horas);

  return (
    <div ref={contenedor} className="grid gap-6 xl:grid-cols-2">
      <section className="min-w-0 xl:col-span-2" aria-labelledby="trafico-t-prendas">
        <TituloSeccion id="trafico-t-prendas" cuenta={r.prendas.length}>
          Las prendas que miraron
        </TituloSeccion>
        <Tabla className="mt-2">
          <Encabezado columnas={C_PRENDAS} plantilla={P_PRENDAS} />
          {r.prendas.length === 0 && (
            <Vacio icono={<Shirt />} titulo="Nadie miró una prenda en estos días" tamano="chico">
              Entraron a la tienda, pero se fueron sin abrir ninguna.
            </Vacio>
          )}
          {r.prendas.map((p, i) => (
            <div key={p.id} className={fila(P_PRENDAS, "sm:items-center")}>
              <span className={celda("der")}>{i + 1}</span>
              <span className={celda()}>
                <button type="button" data-prenda={p.id} onClick={() => abrir(i)} className="inline-flex max-w-full items-center gap-2.5 text-left">
                  <MiniaturaPrenda fotoUrl={p.foto} colorHex={franjasDe(p.colores, p.coloresCatalogo)[0]?.hex ?? null} prefijo={p.prefijo} familia={p.familia} categoria={p.categoria} />
                  <span className="btn-enlace truncate">{p.nombre}</span>
                </button>
              </span>
              <span className={celda()}>{p.categoria ?? "—"}</span>
              {p.recorrido.map((n, k) => (
                <span key={k} className={celda("der")}>
                  {miles(n)}
                </span>
              ))}
            </div>
          ))}
        </Tabla>
      </section>

      <section className="min-w-0" aria-labelledby="trafico-t-recorrido">
        <TituloSeccion id="trafico-t-recorrido">El recorrido</TituloSeccion>
        <Tabla className="mt-2">
          <Encabezado columnas={C_RECORRIDO} plantilla={P_RECORRIDO} />
          {PASOS.map((paso, i) => (
            <div key={paso.nombre} className={fila(P_RECORRIDO)}>
              {/* Sin `truncate`: la insignia de «Aquí se atora» baja de línea antes que cortarse. */}
              <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                {paso.nombre}
                {atora?.i === i && <Chip tono="rojo">Aquí se atora</Chip>}
              </span>
              <span className={celda("der")}>{miles(r.pasos[i])}</span>
              <span className={celda("der")}>{i === 0 ? 100 : de100(r.pasos[i], total)}</span>
              <span className={celda("der")}>{i === 0 ? "—" : miles(r.pasos[i - 1] - r.pasos[i])}</span>
            </div>
          ))}
        </Tabla>
      </section>

      <section className="min-w-0" aria-labelledby="trafico-t-horas">
        <TituloSeccion id="trafico-t-horas" dato={pico ? `más gente ${tramoTexto(pico.desde, pico.hasta)}` : undefined}>
          A qué hora entran
        </TituloSeccion>
        <Tabla className="mt-2">
          <Encabezado columnas={C_HORAS} plantilla={P_HORAS} />
          {tramosDeTres(r.horas).map((t) => (
            <div key={t.desde} className={fila(P_HORAS)} aria-current={pico?.desde !== undefined && pico.desde < t.hasta && t.desde < pico.hasta ? "true" : undefined}>
              <span className={celda()}>{tramoTexto(t.desde, t.hasta).replace(/^de /, "De ")}</span>
              <span className={celda("der")}>{miles(t.n)}</span>
              <span className={celda("der")}>{de100(t.n, total)}</span>
            </div>
          ))}
        </Tabla>
      </section>

      <section className="min-w-0" aria-labelledby="trafico-t-caminos">
        <TituloSeccion id="trafico-t-caminos" dato="toca uno para ver solo a esa gente">
          Por dónde llegan
        </TituloSeccion>
        <Tabla className="mt-2">
          <Encabezado columnas={C_CAMINOS} plantilla={P_CAMINOS} />
          {(Object.keys(CAMINOS) as Camino[]).map((c) => (
            <div key={c} className={fila(P_CAMINOS)} aria-current={filtros.camino === c ? "true" : undefined}>
              <span className={celda()}>
                <Link href={hrefTrafico(filtros, { camino: filtros.camino === c ? null : c })} scroll={false} className="btn-enlace">
                  {CAMINOS[c]}
                </Link>
                {filtros.camino === c && <span className="ml-2 text-[12px] text-tinta/70">(filtro puesto)</span>}
              </span>
              <span className={celda("der")}>{miles(r.caminos[c])}</span>
              <span className={celda("der")}>{de100(r.caminos[c], totalCaminos)}</span>
            </div>
          ))}
        </Tabla>
      </section>

      <section className="min-w-0" aria-labelledby="trafico-t-ciudades">
        <TituloSeccion id="trafico-t-ciudades" dato="toca una para ver solo a esa gente">
          Desde qué ciudad miran
        </TituloSeccion>
        <Tabla className="mt-2">
          <Encabezado columnas={C_CIUDADES} plantilla={P_CIUDADES} />
          {(Object.keys(CIUDADES) as Ciudad[]).map((c) => (
            <div key={c} className={fila(P_CIUDADES)} aria-current={filtros.ciudad === c ? "true" : undefined}>
              <span className={celda()}>
                <Link href={hrefTrafico(filtros, { ciudad: filtros.ciudad === c ? null : c })} scroll={false} className="btn-enlace">
                  {CIUDADES[c].nombre}
                </Link>
                {filtros.ciudad === c && <span className="ml-2 text-[12px] text-tinta/70">(filtro puesto)</span>}
              </span>
              <span className={celda()}>{CIUDADES[c].tienda ? "Sí" : "No"}</span>
              <span className={celda("der")}>{miles(r.ciudades[c])}</span>
              <span className={celda("der")}>{de100(r.ciudades[c], totalCiudades)}</span>
            </div>
          ))}
        </Tabla>
      </section>
      {cajon}
    </div>
  );
}
