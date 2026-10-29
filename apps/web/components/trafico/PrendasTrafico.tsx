"use client";

import { useState, type CSSProperties } from "react";
import { Shirt } from "lucide-react";
import { BarraAvance } from "@/components/ui/BarraAvance";
import { Chip } from "@/components/ui/Chip";
import { MiniaturaPrenda } from "@/components/ui/PrendaCelda";
import { Encabezado, Tabla, celda, fila, type Columna, type OrdenTabla } from "@/components/ui/Tabla";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { Vacio } from "@/components/ui/Vacio";
import { Modal } from "@/components/ui/Modal";
import { BotonVerMas } from "@/components/ui/VerMas";
import { franjasDe } from "@/lib/trafico-mosaico";
import {
  barraDeSeparan,
  cambioDe,
  dondeSeAtoraLaPrenda,
  estadoDePrenda,
  miles,
  ordenarPrendas,
  separanDe100,
  separanEnPromedio,
  type CampoPrenda,
  type PrendaTrafico,
} from "@/lib/trafico-reglas";
import { usePrendaAbierta } from "./usePrendaAbierta";

/** Cuántas prendas se ven sin abrir «Ver más». */
const A_LA_VISTA = 8;

const PLANTILLA = "sm:grid-cols-[minmax(12rem,2.2fr)_5.5rem_4.5rem_minmax(8rem,1.3fr)_5.5rem_7rem]";
const COLUMNAS: Columna[] = [
  { titulo: "Prenda" },
  { titulo: "Miraron", alinear: "der", campo: "miraron" },
  { titulo: "Recorrido", ayuda: "Cuántos la miran, eligen talla, la ponen en la bolsa y la separan" },
  { titulo: "Separan", campo: "separan", ayuda: "De cada 100 que la miraron, cuántos la separaron. La raya es el promedio de la tienda" },
  { titulo: "Separaron", alinear: "der", campo: "separaron" },
  { titulo: "Estado" },
];

/**
 * «Qué prendas miran» (actividad 6; maqueta `docs/maquetas/trafico-decisiones-2026-10/`): reemplaza la vitrina de baldosas por una tabla
 * que se ordena por miradas, por cuántos de cada 100 la separan o por cuántos la separaron. Cada fila dice su recorrido en cuatro barras
 * (el paso donde se atora, en ámbar), su «separan» contra la raya del promedio y su estado: Estrella, Normal o Revisar (la miran y no la
 * llevan). Se ven 8; «Ver más» abre una hoja con todas (Felipe, 2026-10-29). Tocar una abre su cajón, que pasa a la de al lado en el orden de
 * la tabla.
 */
export function PrendasTrafico({
  prendas,
  vieron,
  base,
  periodo,
  antes,
}: {
  prendas: PrendaTrafico[];
  /** Personas que vieron al menos una prenda (el paso 1 del recorrido): de ahí sale «de cada 100» del cajón. */
  vieron: number;
  /** El «de costumbre» de los 6 pasos (90 días de toda la tienda), para decir dónde se atora cada prenda. */
  base: number[];
  periodo: string;
  antes: string;
}) {
  const [orden, setOrden] = useState<OrdenTabla>({ campo: "miraron", dir: "desc" });
  const [todas, setTodas] = useState(false);
  const lista = ordenarPrendas(prendas, orden.campo as CampoPrenda, orden.dir);
  const promedio = separanEnPromedio(prendas);
  const { contenedor, abrir, cajon } = usePrendaAbierta({ prendas: lista, vieron, base, periodo, antes });
  const ordenar = (campo: string) => setOrden((o) => (o.campo === campo ? { campo, dir: o.dir === "desc" ? "asc" : "desc" } : { campo, dir: "desc" }));
  const tabla = (filas: PrendaTrafico[], enHoja: boolean) => (
    <>
      <Encabezado columnas={COLUMNAS} plantilla={PLANTILLA} orden={orden} onOrden={ordenar} />
      {filas.map((p, i) => (
        <FilaPrenda key={p.id} p={p} guia={!enHoja && i === 0} promedio={promedio} base={base} onAbrir={() => abrir(i)} />
      ))}
    </>
  );

  return (
    <section
      ref={contenedor}
      className="anim-sube min-w-0"
      style={{ "--i": 9 } as CSSProperties}
      aria-labelledby="trafico-prendas"
      data-guia="trafico.prendas"
    >
      <TituloSeccion id="trafico-prendas" cuenta={prendas.length} dato={prendas.length ? "La raya marca el promedio de la tienda" : undefined}>
        Qué prendas miran
      </TituloSeccion>
      <Tabla className="mt-2">
        {lista.length === 0 ? (
          <Vacio icono={<Shirt />} titulo="Nadie miró una prenda en estos días" tamano="chico">
            Entraron a la tienda, pero se fueron sin abrir ninguna.
          </Vacio>
        ) : (
          tabla(lista.slice(0, A_LA_VISTA), false)
        )}
        {lista.length > A_LA_VISTA && (
          <BotonVerMas abierto={false} onCambiar={() => setTodas(true)} texto={`Ver ${lista.length - A_LA_VISTA} más`} />
        )}
      </Tabla>
      {todas && (
        <Modal
          titulo="Qué prendas miran"
          subtitulo={`Las ${miles(lista.length)} prendas que miraron · ${periodo}`}
          ancho="max-w-5xl" /* unificar-fijo: la tabla de prendas tiene 6 columnas (la de la tarjeta); en la «ancha» de 768 px se corta «Estado» */
          conCerrar
          onClose={() => setTodas(false)}
        >
          <Tabla>{tabla(lista, true)}</Tabla>
        </Modal>
      )}
      {cajon}
    </section>
  );
}

function FilaPrenda({ p, guia, promedio, base, onAbrir }: { p: PrendaTrafico; guia: boolean; promedio: number; base: number[]; onAbrir: () => void }) {
  const estado = estadoDePrenda(p, promedio);
  const cambio = p.anterior === null ? null : cambioDe("entraron", p.recorrido[0], p.anterior);
  return (
    <div className={fila(PLANTILLA, "grid-cols-[minmax(0,1fr)_auto] gap-y-2 sm:items-center")}>
      <span className={celda()}>
        <button
          type="button"
          data-prenda={p.id}
          data-guia={guia ? "trafico.prenda" : undefined}
          onClick={onAbrir}
          className="inline-flex max-w-full items-center gap-3 text-left"
        >
          <MiniaturaPrenda
            tamano="md"
            fotoUrl={p.foto}
            colorHex={franjasDe(p.colores, p.coloresCatalogo)[0]?.hex ?? null}
            prefijo={p.prefijo}
            familia={p.familia}
            categoria={p.categoria}
          />
          <span className="min-w-0">
            <b className="btn-enlace block truncate font-semibold">{p.nombre}</b>
            <small className="block truncate text-[12px] text-tinta/70">{p.categoria ?? "Sin categoría"}</small>
          </span>
        </button>
      </span>
      <span className="justify-self-end sm:hidden">
        <Chip tono={estado.tono} versalitas={false}>
          {estado.texto}
        </Chip>
      </span>
      <span className={celda("der", "font-semibold")}>
        <span className="sm:hidden font-normal text-tinta/70">Miraron </span>
        {miles(p.recorrido[0])}
        {cambio && <small className="block text-[11.5px] font-normal text-tinta/70">{cambio.texto}</small>}
      </span>
      <span className="hidden sm:block">
        <MiniRecorrido p={p} base={base} />
      </span>
      <span className="grid gap-1">
        <span className="text-[12.5px] font-semibold tabular-nums">{separanDe100(p)} de cada 100</span>
        <BarraAvance pct={barraDeSeparan(p, promedio)} alto="normal" tono={estado.tono === "neutro" ? "tinta" : estado.tono} marca={50} decorativa />
      </span>
      <span className={celda("der", "hidden font-semibold sm:block")}>{miles(p.recorrido[3])}</span>
      <span className="hidden sm:block">
        <Chip tono={estado.tono} versalitas={false}>
          {estado.texto}
        </Chip>
      </span>
    </div>
  );
}

/** El recorrido de la prenda en cuatro barras: la miran (tenue), eligen talla, a la bolsa, la separan; el paso donde se atora, en ámbar. */
function MiniRecorrido({ p, base }: { p: PrendaTrafico; base: number[] }) {
  const atora = dondeSeAtoraLaPrenda(p, base);
  const [miraron, talla, bolsa, separaron] = p.recorrido;
  const ALTO = 34;
  return (
    <svg width={52} height={ALTO} viewBox={`0 0 52 ${ALTO}`} role="img" aria-label={`${miles(miraron)} la miran, ${miles(talla)} eligen talla, ${miles(bolsa)} a la bolsa, ${miles(separaron)} la separan`}>
      {[miraron, talla, bolsa, separaron].map((n, k) => {
        const h = Math.max(2, miraron > 0 ? (n / miraron) * ALTO : 0);
        return (
          <rect
            key={k}
            x={k * 13}
            y={ALTO - h}
            width={9}
            height={h}
            rx={2}
            className={atora?.i === k ? "fill-ambar" : "fill-tinta"}
            fillOpacity={k === 0 ? 0.3 : 0.92}
          />
        );
      })}
    </svg>
  );
}
