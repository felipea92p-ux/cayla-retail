import { Ayuda } from "@/components/Ayuda";
import { TarjetaIndicador } from "@/components/TarjetaIndicador";
import type { PanelCalidad } from "@/lib/calidad";
import { MUESTRA_MINIMA, FACTOR_ATENCION, DEVUELTAS_MINIMAS_ATENCION, textoLectura, type FilaEvaluada } from "@/lib/calidad-reglas";

// Vista del panel de calidad (ADR-0214). Solo PINTA: cada número ya viene contado por el SQL y cada criterio
// ("requiere atención", "muestra chica") ya viene decidido por `calidad-reglas.ts`.
//
// Norman: la pantalla no puede llevar a una conclusión falsa. Por eso una fila con pocas ventas dice "muestra
// chica" con TEXTO y va al final, y "requiere atención" solo aparece con evidencia. El rojo se usa únicamente en
// el texto de una fila que de verdad lo pide, y cada estado lleva palabras, nunca solo color.

const pct = (n: number | null) => (n === null ? "—" : `${(n * 100).toLocaleString("es-PE", { maximumFractionDigits: 1 })}%`);

const fechaCorta = (iso: string) =>
  new Intl.DateTimeFormat("es-PE", { timeZone: "UTC", day: "numeric", month: "short" }).format(new Date(`${iso}T12:00:00Z`));

const etiquetaMes = (iso: string) =>
  new Intl.DateTimeFormat("es-PE", { timeZone: "UTC", month: "short", year: "2-digit" }).format(new Date(`${iso}T12:00:00Z`));

const TOPE_PRODUCTOS = 15;

export function PanelCalidadVista({ panel }: { panel: PanelCalidad }) {
  const { calidad } = panel;
  const t = calidad.total;

  return (
    <div className="space-y-8">
      <p className="max-w-3xl text-xs leading-relaxed text-tinta/65">
        Ventas del <strong>{fechaCorta(panel.cohorteDesde)}</strong> al <strong>{fechaCorta(panel.cohorteHasta)}</strong>. No se
        cuentan las ventas de las últimas {panel.plazoDias}{" "}días: todavía no cumplieron su plazo de cambio y contarlas como
        &quot;vendidas y no devueltas&quot; haría parecer que todo va mejor de lo que va.
      </p>

      {/* ---------- Totales ---------- */}
      <section aria-labelledby="titulo-calidad-total" className="space-y-3">
        <h2 id="titulo-calidad-total" className="label-cayla text-[11px] text-tinta/65">
          Todas las tiendas
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <TarjetaIndicador
            etiqueta="Tasa de devolución"
            ayuda={
              <Ayuda titulo="Cómo se lee">
                Prendas devueltas (devolución aprobada) dividido entre prendas vendidas, en unidades. Una devolución de una
                prenda que volvió sana también cuenta: es una devolución, no una falla. Lo que va aparte es cuántas volvieron
                dañadas.
              </Ayuda>
            }
            valor={pct(t.tasa)}
            pie={`${t.devueltas} devueltas de ${t.vendidas} vendidas`}
          />
          <TarjetaIndicador
            etiqueta="Volvieron dañadas"
            valor={String(t.danadas)}
            pie={t.devueltas > 0 ? `${pct(t.tasaDanadas)} de lo devuelto · ${t.aProveedor} al proveedor` : "Aún no hay devoluciones."}
          />
          <TarjetaIndicador
            etiqueta="Cambios"
            valor={String(t.cambiadas)}
            pie={t.vendidas > 0 ? `${pct(t.tasaCambios)} de lo vendido` : "Aún no hay ventas."}
          />
          <TarjetaIndicador etiqueta="Unidades analizadas" valor={String(t.vendidas)} pie="vendidas en el período" />
        </div>
      </section>

      {t.vendidas === 0 ? (
        <div className="card-cayla p-6 text-sm text-tinta/75">
          Todavía no hay ventas que hayan cumplido su plazo de cambio en este período. Cuando las haya, aquí aparecerá qué
          talla, qué proveedor y qué producto se devuelve más.
        </div>
      ) : (
        <>
          <TablaCalidad
            id="talla"
            titulo="Por talla"
            pregunta="¿Alguna talla se devuelve más que las demás? (una talla que se devuelve mucho suele ser un problema de medidas)"
            filas={calidad.talla}
          />
          <TablaCalidad
            id="origen"
            titulo="Por proveedor o Taller"
            pregunta="¿De dónde vienen las prendas que más vuelven? Se atribuye a quien surtió el producto más recientemente antes de esa venta."
            filas={calidad.origen}
          />
          <TablaCalidad id="categoria" titulo="Por categoría" pregunta="¿Qué tipo de prenda se devuelve más?" filas={calidad.categoria} />
          <TablaCalidad
            id="producto"
            titulo="Por producto"
            pregunta={`Los ${TOPE_PRODUCTOS} que más atención piden.`}
            filas={calidad.producto}
            tope={TOPE_PRODUCTOS}
          />
        </>
      )}

      {/* ---------- Dañadas por tienda y mes ---------- */}
      <section aria-labelledby="titulo-danadas" className="space-y-3">
        <div>
          <h2 id="titulo-danadas" className="label-cayla text-[11px] text-tinta/65">
            Prendas dañadas por tienda y mes
          </h2>
          <p className="mt-1 max-w-3xl text-xs text-tinta/60">
            Prendas que volvieron dañadas (a reparar o a donar) por una devolución o una venta anulada, el mes en que se
            registró. Lo que se devolvió al proveedor va aparte.
          </p>
        </div>
        <div className="card-cayla overflow-x-auto p-4">
          <table className="w-full min-w-[30rem] text-xs tabular-nums">
            <caption className="sr-only">Prendas dañadas por tienda y por mes</caption>
            <thead>
              <tr className="border-b border-tinta/10 text-left text-tinta/60">
                <th scope="col" className="py-1.5 pr-3 font-normal">
                  Tienda
                </th>
                {panel.meses.map((m) => (
                  <th key={m} scope="col" className="whitespace-nowrap px-2 py-1.5 text-right font-normal capitalize">
                    {etiquetaMes(m)}
                  </th>
                ))}
                <th scope="col" className="py-1.5 pl-2 text-right font-normal">
                  Total
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-tinta/10">
              {panel.danadas.map((d) => (
                <tr key={d.ubicacionId}>
                  <th scope="row" className="py-1.5 pr-3 text-left font-normal text-tinta">
                    {d.nombre}
                  </th>
                  {d.meses.map((m) => (
                    <td key={m.mes} className="whitespace-nowrap px-2 py-1.5 text-right text-tinta/85">
                      {m.danadas === 0 && m.aProveedor === 0 ? "—" : m.danadas}
                      {m.aProveedor > 0 && <span className="ml-1 text-tinta/55">(+{m.aProveedor} prov.)</span>}
                    </td>
                  ))}
                  <td className="whitespace-nowrap py-1.5 pl-2 text-right font-semibold text-tinta">
                    {d.totalDanadas}
                    {d.totalAProveedor > 0 && <span className="ml-1 font-normal text-tinta/55">(+{d.totalAProveedor} prov.)</span>}
                  </td>
                </tr>
              ))}
              {panel.danadas.length === 0 && (
                <tr>
                  <td colSpan={panel.meses.length + 2} className="py-3 text-tinta/65">
                    No hay tiendas activas para mostrar.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <details className="card-cayla p-4 text-xs text-tinta/75">
        <summary className="cursor-pointer font-semibold text-tinta">Cómo se calcula todo esto</summary>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 leading-relaxed">
          <li>
            <strong>Qué ventas entran:</strong> las de los últimos {panel.ventanaDias}{" "}días que ya cumplieron su plazo de
            cambio de {panel.plazoDias}{" "}días. Se cuentan devoluciones y cambios de esas ventas sin importar cuándo ocurrieron.
            No entran ventas anuladas.
          </li>
          <li>
            <strong>Devuelta:</strong> devolución aprobada (no pendiente ni rechazada). <strong>Dañada:</strong> volvió a
            reparar o a donar. <strong>Al proveedor:</strong> se manda de vuelta. <strong>Cambio:</strong> la clienta la cambió
            por otra prenda.
          </li>
          <li>
            <strong>A quién se atribuye:</strong>{" "}
            al proveedor de la compra más reciente del producto anterior a la venta, o al
            Taller si una producción terminada fue lo más reciente. Sin ninguno, sale como &quot;Sin origen registrado&quot;.
            Las compras anuladas y las producciones de muestra no cuentan.
          </li>
          <li>
            <strong>Muestra chica:</strong> una fila con menos de {MUESTRA_MINIMA} unidades vendidas. Su tasa no dice nada
            todavía (con 2 ventas, una sola clienta cambia el resultado) y va al final.
          </li>
          <li>
            <strong>Requiere atención:</strong> tasa de al menos {FACTOR_ATENCION} veces la del RESTO de las filas de esa misma tabla (no la del
            total, que incluiría a la propia fila y la disimularía), con al menos {DEVUELTAS_MINIMAS_ATENCION} devoluciones. Estos
            umbrales son provisionales.
          </li>
          <li>Se cuentan unidades, no tickets. La hora es la de Lima.</li>
        </ul>
      </details>
    </div>
  );
}

function TablaCalidad({
  id,
  titulo,
  pregunta,
  filas,
  tope,
}: {
  id: string;
  titulo: string;
  pregunta: string;
  filas: FilaEvaluada[];
  tope?: number;
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
        <table className="w-full min-w-[40rem] text-xs tabular-nums">
          <caption className="sr-only">{titulo}</caption>
          <thead>
            <tr className="border-b border-tinta/10 text-left text-tinta/60">
              <th scope="col" className="py-1.5 pr-3 font-normal first-letter:uppercase">
                {titulo.replace("Por ", "")}
              </th>
              <th scope="col" className="px-2 py-1.5 text-right font-normal">
                Vendidas
              </th>
              <th scope="col" className="px-2 py-1.5 text-right font-normal">
                Devueltas
              </th>
              <th scope="col" className="px-2 py-1.5 text-right font-normal">
                Tasa
              </th>
              <th scope="col" className="px-2 py-1.5 text-right font-normal">
                Dañadas
              </th>
              <th scope="col" className="px-2 py-1.5 text-right font-normal">
                Cambios
              </th>
              <th scope="col" className="py-1.5 pl-3 font-normal">
                Lectura
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-tinta/10">
            {visibles.map((f) => (
              <tr key={f.clave || f.etiqueta}>
                <th scope="row" className={`py-1.5 pr-3 text-left ${f.estado === "atencion" ? "font-semibold text-tinta" : "font-normal text-tinta"}`}>
                  {f.etiqueta}
                </th>
                <td className="px-2 py-1.5 text-right text-tinta/85">{f.vendidas}</td>
                <td className="px-2 py-1.5 text-right text-tinta/85">{f.devueltas}</td>
                <td className="px-2 py-1.5 text-right text-tinta">{pct(f.tasa)}</td>
                <td className="px-2 py-1.5 text-right text-tinta/85">
                  {f.danadas}
                  {f.aProveedor > 0 && <span className="ml-1 text-tinta/55">(+{f.aProveedor} prov.)</span>}
                </td>
                <td className="px-2 py-1.5 text-right text-tinta/85">{f.cambiadas}</td>
                <td className={`py-1.5 pl-3 ${f.estado === "atencion" ? "font-semibold text-rojo" : "text-tinta/60"}`}>{textoLectura(f)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {tope && filas.length > tope && (
          <p className="mt-2 text-[11px] text-tinta/55">
            Se muestran {tope} de {filas.length} productos.
          </p>
        )}
      </div>
    </section>
  );
}
