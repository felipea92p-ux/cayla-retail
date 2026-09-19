import { Ayuda } from "@/components/Ayuda";
import { TarjetaIndicador } from "@/components/TarjetaIndicador";
import { soles } from "@/lib/compras-reglas";
import type { PanelRentabilidad } from "@/lib/rentabilidad";
import {
  COBERTURA_MINIMA,
  MIN_FILAS_REFERENCIA,
  MUESTRA_MINIMA_VENTAS,
  descuentoSobreLista,
  pideAtencion,
  textoLectura,
  type FilaEvaluada,
  type Lectura,
} from "@/lib/rentabilidad-reglas";

// Vista del panel de rentabilidad (ADR-0118). Solo PINTA: cada número ya viene sumado por el SQL y cada criterio
// ("vende mucho y deja poco", "margen parcial") ya viene decidido por `rentabilidad-reglas.ts`.
//
// Norman: esta pantalla no puede llevar a una conclusión falsa. Cuando no hay costo cargado dice "—" y lo explica, nunca un
// margen inventado; cuando el costo es parcial lo dice con TEXTO junto a la cifra; y cada lectura lleva palabras, nunca solo
// color. El rojo aparece únicamente en el texto de una fila que de verdad pide atención.
//
// Nota de JSX: los textos con un número pegado a una palabra se arman con plantillas (`${n} unidades`) y no con
// `{n} unidades`: el compilador descarta ese espacio cuando el texto continúa en varias líneas (ya pasó en Calidad).

const pct = (n: number | null) => (n === null ? "—" : `${(n * 100).toLocaleString("es-PE", { maximumFractionDigits: 1 })}%`);
const dias = (n: number | null) => (n === null ? "—" : `${Math.round(n).toLocaleString("es-PE")} d`);
const TOPE = 8;
const TOPE_PRODUCTOS = 20;

const fechaCorta = (iso: string) =>
  new Intl.DateTimeFormat("es-PE", { timeZone: "UTC", day: "numeric", month: "short" }).format(new Date(`${iso}T12:00:00Z`));

export function PanelRentabilidadVista({ panel }: { panel: PanelRentabilidad }) {
  const { rentabilidad: r } = panel;
  const t = r.total;
  const sinCosto = t.unidadesSinCosto;
  const descuento = descuentoSobreLista(t, panel.igv);
  const hayAlgo = t.unidades > 0 || (t.stock ?? 0) > 0;

  const productos = r.producto;
  const parado = productos.filter((f) => f.lectura === "inventario_parado");
  const muchoPoco = productos.filter((f) => f.lectura === "vende_mucho_deja_poco");
  const bienLento = productos.filter((f) => f.lectura === "deja_bien_rota_lento");

  return (
    <div className="space-y-8">
      <p className="max-w-3xl text-xs leading-relaxed text-tinta/65">
        {`Ventas del ${fechaCorta(panel.desde)} al ${fechaCorta(panel.hasta)} (${panel.diasVentana} días, hoy incluido). Todo va SIN IGV: el precio de venta lo lleva adentro y el costo no, así que comparar uno con otro tal cual inflaría el margen en un ${Math.round(panel.igv * 100)}%. El margen es antes de devoluciones.`}
      </p>

      {/* ---------- Totales ---------- */}
      <section aria-labelledby="titulo-rent-total" className="space-y-3">
        <h2 id="titulo-rent-total" className="label-cayla text-[11px] text-tinta/65">
          Todo lo vendido
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <TarjetaIndicador
            etiqueta="Margen"
            ayuda={
              <Ayuda titulo="Cómo se calcula">
                Venta sin IGV menos el costo que tenía cada prenda el día que se vendió. Solo cuenta lo que tiene costo cargado: una
                prenda con costo en cero saldría con 100% de margen y encabezaría cualquier ranking con una ganancia inventada.
              </Ayuda>
            }
            valor={t.margen === null ? "—" : soles(t.margen)}
            pie={t.margenPct === null ? "Aún no hay ventas con costo cargado." : `${pct(t.margenPct)} de la venta con costo cargado`}
          />
          <TarjetaIndicador
            etiqueta="Venta neta (sin IGV)"
            valor={soles(t.ventaNeta)}
            pie={`${t.unidades} ${t.unidades === 1 ? "unidad vendida" : "unidades vendidas"}`}
          />
          <TarjetaIndicador
            etiqueta="Costo cargado"
            valor={pct(t.cobertura)}
            critico={t.cobertura !== null && t.cobertura < COBERTURA_MINIMA}
            alerta={
              sinCosto > 0
                ? `Falta el costo de ${sinCosto} ${sinCosto === 1 ? "unidad vendida" : "unidades vendidas"}: su margen no cuenta. Cárgalo en el catálogo para verlo.`
                : undefined
            }
            pie="de la venta tiene costo"
          />
          <TarjetaIndicador
            etiqueta="Descuento regalado"
            valor={soles(t.descuento)}
            pie={descuento === null ? "Aún no hay ventas." : `${pct(descuento)} del precio de lista (con IGV)`}
          />
        </div>
      </section>

      {!hayAlgo ? (
        <div className="card-cayla p-6 text-sm text-tinta/75">
          Todavía no hay ventas ni inventario en este período. Cuando las haya, aquí aparecerá qué vende mucho y deja poco, y qué
          deja bien pero rota lento.
        </div>
      ) : (
        <>
          {/* ---------- Lo que pide atención ---------- */}
          <section aria-labelledby="titulo-rent-atencion" className="space-y-3">
            <div>
              <h2 id="titulo-rent-atencion" className="label-cayla text-[11px] text-tinta/65">
                Lo que pide atención
              </h2>
              <p className="mt-1 max-w-3xl text-xs text-tinta/60">
                {`Productos que se salen de lo normal. "Mucho" y "poco" se miden contra la mediana de los demás productos con ventas y costo suficientes; con menos de ${MIN_FILAS_REFERENCIA} para comparar no se juzga.`}
              </p>
            </div>
            <div className="grid gap-3 lg:grid-cols-3">
              <ListaAtencion
                titulo="Vende mucho y deja poco"
                pista="Candidatos a subir el precio o renegociar el costo."
                vacio="Ninguno por ahora."
                filas={muchoPoco}
                columna="margen"
              />
              <ListaAtencion
                titulo="Deja buen margen pero rota lento"
                pista="Candidatos a promocionar o a exhibir mejor."
                vacio="Ninguno por ahora."
                filas={bienLento}
                columna="rotacion"
              />
              <ListaAtencion
                titulo="Inventario parado"
                pista="Hay stock y no se vendió nada en la ventana."
                vacio="Ninguno por ahora."
                filas={parado}
                columna="stock"
              />
            </div>
          </section>

          <TablaRentabilidad id="categoria" titulo="Por categoría" pregunta="¿Qué tipo de prenda deja más?" filas={r.categoria} />
          <TablaRentabilidad
            id="origen"
            titulo="Por proveedor o Taller"
            pregunta="¿De dónde vienen las prendas que más dejan? Se atribuye a quien surtió el producto más recientemente antes de cada venta. El stock no se reparte por origen."
            filas={r.origen}
            conStock={false}
          />
          <TablaRentabilidad id="temporada" titulo="Por temporada" pregunta="¿Qué temporada deja más y cuál se quedó parada?" filas={r.temporada} />
          <TablaRentabilidad
            id="producto"
            titulo="Por producto"
            pregunta={`Los ${TOPE_PRODUCTOS} primeros: primero lo que pide atención, después lo que más margen deja.`}
            filas={productos}
            tope={TOPE_PRODUCTOS}
          />
        </>
      )}

      <details className="card-cayla p-4 text-xs text-tinta/75">
        <summary className="cursor-pointer font-semibold text-tinta">Cómo se calcula todo esto</summary>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 leading-relaxed">
          <li>
            <strong>Venta neta:</strong> lo cobrado (precio menos descuento) dividido entre 1,{String(Math.round(panel.igv * 100)).padStart(2, "0")}, sin las
            ventas anuladas. <strong>Margen:</strong> venta neta menos el costo sellado el día de cada venta, solo de lo que tiene
            costo cargado.
          </li>
          <li>
            <strong>Costo cargado:</strong> qué fracción de lo vendido tiene costo. Debajo del {Math.round(COBERTURA_MINIMA * 100)}% el margen de esa fila
            es &quot;parcial&quot; y no se compara; sin ningún costo no hay margen.
          </li>
          <li>
            <strong>Días de inventario:</strong> unidades en stock dividido entre lo que se vende por día en la ventana.{" "}
            <strong>Sell-through:</strong> vendidas ÷ (vendidas + en stock). El stock es lo vendible hoy: no cuenta lo que está en
            cuarentena.
          </li>
          <li>
            <strong>Vende mucho y deja poco:</strong> vende igual o más que la mediana pero su margen es menor que la mediana.{" "}
            <strong>Deja bien y rota lento:</strong> margen igual o mayor que la mediana pero su sell-through es menor.
          </li>
          <li>
            <strong>Muestra chica:</strong> menos de {MUESTRA_MINIMA_VENTAS} unidades vendidas: un margen con tan pocas ventas no dice nada.
          </li>
          <li>
            La velocidad se mide sobre toda la ventana: un producto recién lanzado parecerá lento. Los umbrales son provisionales.
          </li>
        </ul>
      </details>
    </div>
  );
}

function ListaAtencion({
  titulo,
  pista,
  vacio,
  filas,
  columna,
}: {
  titulo: string;
  pista: string;
  vacio: string;
  filas: FilaEvaluada[];
  columna: "margen" | "rotacion" | "stock";
}) {
  const visibles = filas.slice(0, TOPE);
  return (
    <div className="card-cayla p-4">
      <p className="text-sm font-semibold text-tinta">{titulo}</p>
      <p className="mt-0.5 text-xs text-tinta/60">{pista}</p>
      {visibles.length === 0 ? (
        <p className="mt-3 text-xs text-tinta/55">{vacio}</p>
      ) : (
        <ul className="mt-3 space-y-1.5 text-xs tabular-nums">
          {visibles.map((f) => (
            <li key={f.clave} className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate text-tinta">{f.etiqueta}</span>
              <span className="shrink-0 text-tinta/70">
                {columna === "margen" && `${f.unidades} u. · ${pct(f.margenPct)}`}
                {columna === "rotacion" && `${pct(f.margenPct)} · ${dias(f.diasInventario)} de stock`}
                {columna === "stock" && `${f.stock ?? 0} u. en stock`}
              </span>
            </li>
          ))}
        </ul>
      )}
      {filas.length > TOPE && <p className="mt-2 text-[11px] text-tinta/55">{`Se muestran ${TOPE} de ${filas.length}.`}</p>}
    </div>
  );
}

function TablaRentabilidad({
  id,
  titulo,
  pregunta,
  filas,
  tope,
  conStock = true,
}: {
  id: string;
  titulo: string;
  pregunta: string;
  filas: FilaEvaluada[];
  tope?: number;
  conStock?: boolean;
}) {
  const visibles = tope ? filas.slice(0, tope) : filas;
  return (
    <section aria-labelledby={`titulo-${id}`} className="space-y-3">
      <div>
        <h2 id={`titulo-${id}`} className="label-cayla text-[11px] text-tinta/65">
          {titulo}
        </h2>
        <p className="mt-1 max-w-3xl text-xs text-tinta/60">{pregunta}</p>
      </div>
      <div className="card-cayla overflow-x-auto p-4">
        <table className="w-full min-w-[46rem] text-xs tabular-nums">
          <caption className="sr-only">{titulo}</caption>
          <thead>
            <tr className="border-b border-tinta/10 text-left text-tinta/60">
              <th scope="col" className="py-1.5 pr-3 font-normal first-letter:uppercase">
                {titulo.replace("Por ", "")}
              </th>
              <th scope="col" className="px-2 py-1.5 text-right font-normal">
                Unid.
              </th>
              <th scope="col" className="px-2 py-1.5 text-right font-normal">
                Venta neta
              </th>
              <th scope="col" className="px-2 py-1.5 text-right font-normal">
                Margen
              </th>
              <th scope="col" className="px-2 py-1.5 text-right font-normal">
                Margen %
              </th>
              {conStock && (
                <>
                  <th scope="col" className="px-2 py-1.5 text-right font-normal">
                    Días de inv.
                  </th>
                  <th scope="col" className="px-2 py-1.5 text-right font-normal">
                    Sell-through
                  </th>
                </>
              )}
              <th scope="col" className="py-1.5 pl-3 font-normal">
                Lectura
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-tinta/10">
            {visibles.map((f) => (
              <tr key={f.clave || f.etiqueta}>
                <th scope="row" className={`py-1.5 pr-3 text-left ${pideAtencion(f.lectura) ? "font-semibold text-tinta" : "font-normal text-tinta"}`}>
                  {f.etiqueta}
                </th>
                <td className="px-2 py-1.5 text-right text-tinta/85">{f.unidades}</td>
                <td className="whitespace-nowrap px-2 py-1.5 text-right text-tinta/85">{soles(f.ventaNeta)}</td>
                <td className="whitespace-nowrap px-2 py-1.5 text-right text-tinta">{f.margen === null ? "—" : soles(f.margen)}</td>
                <td className="px-2 py-1.5 text-right text-tinta">
                  {pct(f.margenPct)}
                  {f.lectura === "costo_parcial" && <span className="ml-1 text-tinta/55">(parcial)</span>}
                </td>
                {conStock && (
                  <>
                    <td className="whitespace-nowrap px-2 py-1.5 text-right text-tinta/85">{dias(f.diasInventario)}</td>
                    <td className="px-2 py-1.5 text-right text-tinta/85">{pct(f.sellThrough)}</td>
                  </>
                )}
                <td className={`py-1.5 pl-3 ${pideAtencion(f.lectura) ? "font-semibold text-rojo" : "text-tinta/60"}`}>{textoLectura(f.lectura as Lectura)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {tope && filas.length > tope && <p className="mt-2 text-[11px] text-tinta/55">{`Se muestran ${tope} de ${filas.length} productos.`}</p>}
      </div>
    </section>
  );
}
