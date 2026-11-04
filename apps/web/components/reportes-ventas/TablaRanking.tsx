import { BarraAvance } from "@/components/ui/BarraAvance";
import { Chip } from "@/components/ui/Chip";
import { MiniaturaPrenda } from "@/components/ui/PrendaCelda";
import { Paginas } from "@/components/ui/Paginas";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { celda, Encabezado, fila, Tabla, type Columna } from "@/components/ui/Tabla";
import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import { soles } from "@/lib/flujo-caja-reglas";
import { sentidoDe, textoCambio } from "@/lib/reportes-ventas-reglas";
import {
  cambioDeFila,
  hrefRanking,
  largoDeBarra,
  parteDeFila,
  POR_PAGINA,
  sePuedeComparar,
  situacionDeStock,
  textoDeDias,
  totalDePaginas,
  type FiltrosRanking,
  type PeriodoRanking,
  type Ranking,
} from "@/lib/reportes-ranking-reglas";

// La tabla del Ranking de prendas (maqueta docs/maquetas/reportes-ventas-2026-11/, cara A): una fila por modelo (o por color y talla), de la que más a la
// que menos, con su foto, lo que se vendió con su barra, el cambio contra el período anterior y cómo está el stock. Es `<Tabla>` (ADR-0358) y la prenda
// sin foto es el mosaico de siempre (ADR-0333). Bajo xl caben cuatro datos y los otros tres se ven desde xl; en el celular la fila se apila con su rótulo.
const PLANTILLA = "sm:grid-cols-[2rem_minmax(0,1.7fr)_minmax(0,1.2fr)_7.5rem] xl:grid-cols-[2.25rem_minmax(0,2fr)_minmax(0,1.3fr)_6.5rem_5rem_7.5rem_8rem]";
const COLUMNAS: Columna[] = [
  { titulo: "#" },
  { titulo: "Prenda" },
  { titulo: "Se vendieron" },
  { titulo: "Vendido", alinear: "der", desdeXl: true },
  { titulo: "% del total", alinear: "der", desdeXl: true },
  { titulo: "vs período anterior", alinear: "der", desdeXl: true },
  { titulo: "Cómo está el stock", alinear: "der" },
];
const ENTERO = new Intl.NumberFormat("es-PE", { maximumFractionDigits: 0 });
const PORCENTAJE = new Intl.NumberFormat("es-PE", { maximumFractionDigits: 1 });

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

const Rotulo = ({ children }: { children: string }) => <span className="mr-1 text-taupe sm:hidden">{children}</span>;

export function TablaRanking({ r, f, periodo, fotos }: { r: Ranking; f: FiltrosRanking; periodo: PeriodoRanking; fotos: Map<string, string> }) {
  const paginas = totalDePaginas(r.cuantos, POR_PAGINA);
  const desde = f.pagina * POR_PAGINA + 1;
  const compara = sePuedeComparar(r);
  const porVariante = f.nivel === "variante";
  const hrefs = Array.from({ length: paginas }, (_, i) => hrefRanking(f, { pagina: i }));
  const orden = f.orden === "soles" ? "soles" : "prendas";

  return (
    <section aria-label="Lo que más se vende" data-guia="ranking.tabla" className="space-y-3">
      <div>
        <TituloSeccion>{porVariante ? "Lo que más se vende, por color y talla" : "Lo que más se vende"}</TituloSeccion>
        <p className="mt-0.5 text-sm text-tinta/60">
          {periodo.etiqueta} · ordenado por <b className="font-semibold text-tinta">{orden}</b>
        </p>
      </div>
      <Tabla>
        <Encabezado columnas={COLUMNAS} plantilla={PLANTILLA} />
        {r.filas.map((x) => {
          const cambio = cambioDeFila(x, f.orden, r);
          const parte = parteDeFila(x, f.orden, r);
          const stock = situacionDeStock(x, periodo.dias);
          const sub = porVariante ? [x.colorNombre, x.talla ? `talla ${x.talla}` : null, x.categoria].filter(Boolean).join(" · ") : [x.categoria, x.marca].filter(Boolean).join(" · ");
          return (
            <div key={`${x.pos}-${x.productoId}`} className={fila(PLANTILLA)} role="row">
              <span className={celda("izq", `font-serif text-lg ${x.pos <= 3 ? "text-tinta" : "text-tinta/60"}`)}>{x.pos}</span>
              <span className={celda("izq", "flex items-center gap-3")}>
                <MiniaturaPrenda fotoUrl={fotos.get(x.productoId) ?? null} colorHex={x.colorHex} tamano="md" prefijo={x.categoriaPrefijo} familia={x.categoriaFamilia} categoria={x.categoria} />
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{x.nombre}</span>
                  <span className="block truncate text-xs text-taupe">{sub}</span>
                </span>
              </span>
              <span className={celda("izq", "block")}>
                <span className="tabular-nums">
                  <b className="font-semibold">{ENTERO.format(x.unidades)}</b> {x.unidades === 1 ? "prenda" : "prendas"}
                </span>
                <BarraAvance pct={largoDeBarra(x, f.orden, r)} alto="fina" tono="tinta" decorativa className="mt-1.5" />
                <span className="mt-1 hidden text-xs sm:block xl:hidden">
                  {compara ? <Cambio c={cambio} /> : null} <span className="text-taupe">· {soles(x.vendido)}</span>
                </span>
              </span>
              <span className={celda("der", "sm:max-xl:hidden xl:block")}>
                <Rotulo>Vendido</Rotulo>
                <b className="font-semibold">{soles(x.vendido)}</b>
              </span>
              <span className={celda("der", "sm:max-xl:hidden")}>
                <Rotulo>% del total</Rotulo>
                {parte === null ? "—" : `${PORCENTAJE.format(parte * 100)} %`}
              </span>
              <span className={celda("der", "sm:max-xl:hidden")}>
                <Rotulo>vs período anterior</Rotulo>
                <Cambio c={cambio} />
              </span>
              <span className={celda("der", "flex flex-col sm:items-end gap-1")}>
                {stock.tipo === "sin" ? (
                  <Chip tono="ambar" versalitas={false}>
                    Sin stock
                  </Chip>
                ) : (
                  <>
                    <span className="tabular-nums">
                      Quedan <b className="font-semibold">{ENTERO.format(x.stock)}</b>
                    </span>
                    {stock.tipo === "poco" && stock.dias !== null && (
                      <Chip tono="ambar" versalitas={false}>
                        {textoDeDias(stock.dias)}
                      </Chip>
                    )}
                  </>
                )}
              </span>
            </div>
          );
        })}
      </Tabla>
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-tinta/65">
        <span>
          Mostrando <b className="font-semibold text-tinta">{desde}–{desde + r.filas.length - 1}</b> de <b className="font-semibold text-tinta">{ENTERO.format(r.cuantos)}</b>
        </span>
        {paginas > 1 && <Paginas pagina={f.pagina + 1} totalPaginas={paginas} hrefs={hrefs} />}
      </div>
    </section>
  );
}
