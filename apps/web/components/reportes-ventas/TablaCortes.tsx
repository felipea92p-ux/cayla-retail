import { BarraAvance } from "@/components/ui/BarraAvance";
import { Chip } from "@/components/ui/Chip";
import { SegmentoEnlaces } from "@/components/ui/SegmentoEnlaces";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { Vacio } from "@/components/ui/Vacio";
import { celda, Encabezado, fila, Tabla, type Columna } from "@/components/ui/Tabla";
import { ArrowDown, ArrowUp, Minus, Store } from "lucide-react";
import { soles } from "@/lib/flujo-caja-reglas";
import { nombreDelMes } from "@/lib/historial-cierres-reglas";
import {
  agruparCola,
  cortesOfrecidos,
  filasDeTabla,
  sentidoDe,
  textoCambio,
  totalDeTabla,
  type CorteDeTabla,
  type CortesMes,
  type FilaDeTabla,
  type ReporteMes,
} from "@/lib/reportes-ventas-reglas";
import { lineaClaure, TITULO_COLUMNA_VENDIDO } from "@/lib/reportes-vendido-reglas";

// La tabla que se corta de «Ventas del mes» (maqueta docs/maquetas/reportes-ventas-2026-11/): el mes por tienda o por categoría, con su «Total» al
// pie. Es `<Tabla>` (ADR-0358); el corte vive en la URL (`?corte=`), así que es de servidor y «atrás» vuelve al corte anterior. El cambio contra el mes
// pasado va con su trazo y su palabra, no solo en color; y donde no hay con qué comparar, va «—».
// Por tienda hay seis datos: bajo xl (1280) caben cuatro (tienda, vendido, cambio, ventas) y el resto se ve desde xl; en el celular la fila se apila y los trae todos.
// «Devuelto» ya no es columna (Felipe, 2026-11-04): lo devuelto del mes es una de las cifras de arriba.
const PLANTILLA_TIENDA = "sm:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_7rem_5rem] xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1.5fr)_7.5rem_5rem_6rem_5rem]";
const PLANTILLA_CATEGORIA = "sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1.6fr)_5rem_7.5rem_5.5rem]";
const COLUMNAS_TIENDA: Columna[] = [
  { titulo: "Tienda" },
  { titulo: TITULO_COLUMNA_VENDIDO },
  { titulo: "vs mes pasado", alinear: "der" },
  { titulo: "Ventas", alinear: "der" },
  { titulo: "Ticket", alinear: "der", desdeXl: true },
  { titulo: "Prendas", alinear: "der", desdeXl: true },
];
const COLUMNAS_CATEGORIA: Columna[] = [
  { titulo: "Categoría" },
  { titulo: TITULO_COLUMNA_VENDIDO },
  { titulo: "% del total", alinear: "der" },
  { titulo: "vs mes pasado", alinear: "der" },
  { titulo: "Prendas", alinear: "der" },
];
const ENTERO = new Intl.NumberFormat("es-PE", { maximumFractionDigits: 0 });
const PORCENTAJE = new Intl.NumberFormat("es-PE", { maximumFractionDigits: 1 });

/** El cambio contra el mes pasado: «↑ +12 %» / «↓ −3 %» / «igual» / «—». */
function Cambio({ c }: { c: number | null }) {
  const sentido = sentidoDe(c);
  if (sentido === null) return <span className="text-taupe">—</span>;
  const Icono = sentido === "sube" ? ArrowUp : sentido === "baja" ? ArrowDown : Minus;
  const tono = sentido === "sube" ? "text-verde-profundo" : sentido === "baja" ? "text-ambar-profundo" : "text-taupe";
  return (
    <span className={`inline-flex items-center gap-1 font-semibold ${tono}`}>
      <Icono aria-hidden className="h-3 w-3" />
      {textoCambio(c)}
    </span>
  );
}

/** En el celular cada dato lleva su nombre delante (la fila se apila y no hay encabezado). */
const Rotulo = ({ children }: { children: string }) => <span className="mr-1 text-taupe sm:hidden">{children}</span>;

/** `claure`: cuánto de lo vendido es de CLAURE; si es mayor que cero, una línea bajo la tabla lo dice (tarea 77). No cambia ninguna cifra. */
export function TablaCortes({ r, cortes, corte, hrefDe, claure = null }: { r: ReporteMes; cortes: CortesMes; corte: CorteDeTabla; hrefDe: (c: CorteDeTabla) => string; claure?: number | null }) {
  const deClaure = lineaClaure(claure ?? 0);
  const ofrecidos = cortesOfrecidos(cortes);
  const porTienda = corte === "tienda";
  const filas: FilaDeTabla[] = filasDeTabla(porTienda ? cortes.tiendas : agruparCola(cortes.categorias), r);
  const total = totalDeTabla(r);
  const plantilla = porTienda ? PLANTILLA_TIENDA : PLANTILLA_CATEGORIA;
  const mes = nombreDelMes({ anio: Number(r.mes.slice(0, 4)), mes: Number(r.mes.slice(5, 7)) });

  const celdas = (f: FilaDeTabla, esTotal: boolean) => {
    const nombre = (
      <span className={celda("izq", esTotal ? "font-semibold" : "")}>
        {f.nombre}
        {f.clave === "otras" && (
          <>
            {" "}
            <Chip tono="pizarra" versalitas={false}>
              las de menos ventas
            </Chip>
          </>
        )}
      </span>
    );
    const vendido = (
      <span className={celda("izq", "block")}>
        <Rotulo>{TITULO_COLUMNA_VENDIDO}</Rotulo>
        <span className={`tabular-nums ${esTotal ? "font-semibold" : ""}`}>{soles(f.vendido)}</span>
        {!esTotal && <BarraAvance pct={f.barra * 100} alto="fina" tono="tinta" decorativa className="mt-1.5" />}
      </span>
    );
    const cambio = (
      <span className={celda("der")}>
        <Rotulo>vs mes pasado</Rotulo>
        <Cambio c={f.cambio} />
      </span>
    );
    const prendas = (
      <span className={celda("der", porTienda ? "sm:max-xl:hidden" : "")}>
        <Rotulo>Prendas</Rotulo>
        {ENTERO.format(f.unidades)}
      </span>
    );
    return porTienda ? (
      <>
        {nombre}
        {vendido}
        {cambio}
        <span className={celda("der")}>
          <Rotulo>Ventas</Rotulo>
          {ENTERO.format(f.tickets)}
        </span>
        <span className={celda("der", "sm:max-xl:hidden")}>
          <Rotulo>Ticket</Rotulo>
          {f.ticket === null ? "—" : soles(f.ticket)}
        </span>
        {prendas}
      </>
    ) : (
      <>
        {nombre}
        {vendido}
        <span className={celda("der")}>
          <Rotulo>% del total</Rotulo>
          {f.parte === null ? "—" : `${PORCENTAJE.format(f.parte * 100)} %`}
        </span>
        {cambio}
        {prendas}
      </>
    );
  };

  return (
    <section aria-label="El mes por tienda y por categoría" data-guia="reportes.tabla" className="anim-sube space-y-3" style={{ "--i": 8 } as React.CSSProperties}>
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div>
          <TituloSeccion>{porTienda ? "Cuánto vendió cada tienda" : "Cuánto vendió cada categoría"}</TituloSeccion>
          <p className="mt-0.5 text-sm text-tinta/60">{mes}{r.enCurso ? " · a la fecha" : ""}</p>
        </div>
        {ofrecidos.length > 1 && (
          <div data-guia="reportes.corte">
            <SegmentoEnlaces
              etiquetaAccesible="Cómo cortar la tabla"
              activo={corte}
              opciones={ofrecidos.map((c) => ({ valor: c, etiqueta: c === "tienda" ? "Por tienda" : "Por categoría", href: hrefDe(c), icono: c === "tienda" ? <Store aria-hidden className="h-3.5 w-3.5" /> : undefined }))}
            />
          </div>
        )}
      </div>
      {filas.length === 0 ? (
        <Vacio tamano="chico" icono={<Store />}>No hay ventas que mostrar en este mes.</Vacio>
      ) : (
        <Tabla>
          <Encabezado columnas={porTienda ? COLUMNAS_TIENDA : COLUMNAS_CATEGORIA} plantilla={plantilla} />
          {filas.map((f) => (
            <div key={f.clave} className={fila(plantilla)} role="row">
              {celdas(f, false)}
            </div>
          ))}
          <div className={fila(plantilla, "bg-tinta/[0.04] font-semibold")} role="row">
            {celdas(total, true)}
          </div>
        </Tabla>
      )}
      {filas.length > 0 && deClaure && <p className="texto-detalle text-taupe">{deClaure}</p>}
    </section>
  );
}
