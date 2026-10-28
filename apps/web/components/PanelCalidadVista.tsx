import type { CSSProperties } from "react";
import { Store } from "lucide-react";
import { Ayuda } from "@/components/Ayuda";
import { Encabezado, TABLA, Tabla, celda, fila } from "@/components/ui/Tabla";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { Vacio } from "@/components/ui/Vacio";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import type { PanelCalidad } from "@/lib/calidad";
import { MUESTRA_MINIMA, FACTOR_ATENCION, DEVUELTAS_MINIMAS_ATENCION, textoLectura, type FilaEvaluada } from "@/lib/calidad-reglas";

/** La tabla de tienda × mes: sus columnas de mes cambian con el panel, así que la plantilla viaja en `--cols` (la pone la `Tabla`). */
const COLS_VARIABLES = "grid-cols-[var(--cols)]";
const PLANTILLA_CALIDAD = "grid-cols-[minmax(9rem,1.6fr)_4.5rem_4.75rem_4rem_6.5rem_4.5rem_minmax(9rem,1.4fr)]";

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
      <p className="max-w-3xl text-xs leading-relaxed text-tinta/65" data-guia="calidad.periodo">
        Ventas del <strong>{fechaCorta(panel.cohorteDesde)}</strong> al <strong>{fechaCorta(panel.cohorteHasta)}</strong>. No se
        cuentan las ventas de las últimas {panel.plazoDias}{" "}días: todavía no cumplieron su plazo de cambio y contarlas como
        &quot;vendidas y no devueltas&quot; haría parecer que todo va mejor de lo que va.
      </p>

      {/* ---------- Totales ---------- */}
      <section aria-labelledby="titulo-calidad-total" className="space-y-3" data-guia="calidad.total">
        <TituloSeccion id="titulo-calidad-total">Todas las tiendas</TituloSeccion>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {/* La pieza única de cifra (TarjetaCifra, ADR-0358). Sin ventas cerradas no hay tasa: «sin dato», con su motivo. */}
          <TarjetaCifra
            etiqueta="Tasa de devolución"
            ayuda={
              <Ayuda titulo="Cómo se lee">
                Prendas devueltas (devolución aprobada) dividido entre prendas vendidas, en unidades. Una devolución de una
                prenda que volvió sana también cuenta: es una devolución, no una falla. Lo que va aparte es cuántas volvieron
                dañadas.
              </Ayuda>
            }
            valor={t.tasa === null ? null : pct(t.tasa)}
            pie={t.tasa === null ? undefined : `${t.devueltas} devueltas de ${t.vendidas} vendidas`}
          >
            {t.tasa === null ? `${t.devueltas} devueltas de ${t.vendidas} vendidas` : undefined}
          </TarjetaCifra>
          <TarjetaCifra
            etiqueta="Volvieron dañadas"
            valor={String(t.danadas)}
            pie={t.devueltas > 0 ? `${pct(t.tasaDanadas)} de lo devuelto · ${t.aProveedor} al proveedor` : "Aún no hay devoluciones."}
          />
          <TarjetaCifra
            etiqueta="Cambios"
            valor={String(t.cambiadas)}
            pie={t.vendidas > 0 ? `${pct(t.tasaCambios)} de lo vendido` : "Aún no hay ventas."}
          />
          <TarjetaCifra etiqueta="Unidades analizadas" valor={String(t.vendidas)} pie="vendidas en el período" />
        </div>
      </section>

      {t.vendidas === 0 ? (
        <div className="card-cayla p-6 text-sm text-tinta/75" data-guia="calidad.sin-ventas">
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
      <section aria-labelledby="titulo-danadas" className="space-y-3" data-guia="calidad.danadas">
        <div>
          <TituloSeccion id="titulo-danadas">Prendas dañadas por tienda y mes</TituloSeccion>
          <p className="mt-1 max-w-3xl text-xs text-tinta/60">
            Prendas que volvieron dañadas (a reparar o a donar) por una devolución o una venta anulada, el mes en que se
            registró. Lo que se devolvió al proveedor va aparte.
          </p>
        </div>
        {/* La tabla del sistema (ADR-0358, ronda 7). Las columnas de mes cambian con el panel: la plantilla va en `--cols`. */}
        {panel.danadas.length === 0 ? (
          <Tabla>
            <Vacio tamano="chico" icono={<Store />}>
              No hay tiendas activas para mostrar.
            </Vacio>
          </Tabla>
        ) : (
          <Tabla style={{ "--cols": `minmax(7rem,1.4fr) repeat(${panel.meses.length}, minmax(5.5rem,1fr)) minmax(6.5rem,1fr)` } as CSSProperties}>
            <div role="table" aria-label="Prendas dañadas por tienda y por mes" className="min-w-[30rem] divide-y divide-sand text-xs tabular-nums">
              <Encabezado
                siempre
                plantilla={COLS_VARIABLES}
                columnas={[
                  { titulo: "Tienda" },
                  ...panel.meses.map((m) => ({ titulo: <span className="capitalize">{etiquetaMes(m)}</span>, alinear: "der" as const })),
                  { titulo: "Total", alinear: "der" },
                ]}
              />
              {panel.danadas.map((d) => (
                <div key={d.ubicacionId} role="row" className={fila(COLS_VARIABLES)}>
                  <span role="rowheader" className={celda("izq", "text-tinta")}>
                    {d.nombre}
                  </span>
                  {d.meses.map((m) => (
                    <span key={m.mes} role="cell" className={celda("der", "text-right text-tinta/85")}>
                      {m.danadas === 0 && m.aProveedor === 0 ? "—" : m.danadas}
                      {m.aProveedor > 0 && <span className="ml-1 text-tinta/55">(+{m.aProveedor} prov.)</span>}
                    </span>
                  ))}
                  <span role="cell" className={celda("der", "text-right font-semibold text-tinta")}>
                    {d.totalDanadas}
                    {d.totalAProveedor > 0 && <span className="ml-1 font-normal text-tinta/55">(+{d.totalAProveedor} prov.)</span>}
                  </span>
                </div>
              ))}
            </div>
          </Tabla>
        )}
      </section>

      <details className="card-cayla p-4 text-xs text-tinta/75" data-guia="calidad.como-se-calcula">
        <summary className="cursor-pointer font-semibold text-tinta" data-guia="calidad.como-abrir">Cómo se calcula todo esto</summary>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 leading-relaxed">
          <li>
            <strong>Qué ventas entran:</strong> las de los últimos {panel.ventanaDias}{" "}días que ya cumplieron su plazo de
            cambio de {panel.plazoDias}{" "}días. Se cuentan devoluciones y cambios de esas ventas sin importar cuándo ocurrieron.
            No entran ventas anuladas.
          </li>
          <li>
            <strong>Devuelta:</strong> devolución aprobada (no pendiente ni rechazada). <strong>Dañada:</strong> volvió a
            reparar o a donar. <strong>Al proveedor:</strong> se manda de vuelta. <strong>Cambio:</strong> el cliente la cambió
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
            todavía (con 2 ventas, un solo cliente cambia el resultado) y va al final.
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
    <section aria-labelledby={`titulo-${id}`} className="space-y-3" data-guia={`calidad.tabla-${id}`}>
      <div>
        <TituloSeccion id={`titulo-${id}`}>{titulo}</TituloSeccion>
        <p className="mt-1 max-w-3xl text-xs text-tinta/60">{pregunta}</p>
      </div>
      <Tabla>
        <div role="table" aria-label={titulo} className="min-w-[40rem] divide-y divide-sand text-xs tabular-nums">
          <Encabezado
            siempre
            plantilla={PLANTILLA_CALIDAD}
            columnas={[
              { titulo: titulo.replace("Por ", ""), clase: "first-letter:uppercase" },
              { titulo: "Vendidas", alinear: "der" },
              { titulo: "Devueltas", alinear: "der" },
              { titulo: "Tasa", alinear: "der" },
              { titulo: "Dañadas", alinear: "der" },
              { titulo: "Cambios", alinear: "der" },
              { titulo: "Lectura" },
            ]}
          />
          {visibles.map((f) => (
            <div key={f.clave || f.etiqueta} role="row" className={fila(PLANTILLA_CALIDAD)}>
              <span role="rowheader" className={`min-w-0 ${f.estado === "atencion" ? "font-semibold text-tinta" : "text-tinta"}`}>
                {f.etiqueta}
              </span>
              <span role="cell" className={celda("der", "text-right text-tinta/85")}>{f.vendidas}</span>
              <span role="cell" className={celda("der", "text-right text-tinta/85")}>{f.devueltas}</span>
              <span role="cell" className={celda("der", "text-right text-tinta")}>{pct(f.tasa)}</span>
              <span role="cell" className={celda("der", "text-right text-tinta/85")}>
                {f.danadas}
                {f.aProveedor > 0 && <span className="ml-1 text-tinta/55">(+{f.aProveedor} prov.)</span>}
              </span>
              <span role="cell" className={celda("der", "text-right text-tinta/85")}>{f.cambiadas}</span>
              <span role="cell" className={`min-w-0 ${f.estado === "atencion" ? "font-semibold text-rojo" : "text-tinta/60"}`}>
                {textoLectura(f)}
              </span>
            </div>
          ))}
        </div>
        {tope && filas.length > tope && (
          <p className={TABLA.pie}>
            Se muestran {tope} de {filas.length} productos.
          </p>
        )}
      </Tabla>
    </section>
  );
}
