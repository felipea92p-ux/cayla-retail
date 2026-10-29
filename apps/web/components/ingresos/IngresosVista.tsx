import { PackageCheck } from "lucide-react";
import { Aviso } from "@/components/ui/Aviso";
import { MiniaturaPrenda } from "@/components/ui/PrendaCelda";
import { Encabezado, Tabla, celda, fila, type Columna } from "@/components/ui/Tabla";
import { Vacio } from "@/components/ui/Vacio";
import type { IngresosDeLaSede } from "@/lib/ingresos";
import { conPreposicion, modelosTexto, prendasTexto, type RangoIngresos } from "@/lib/ingresos-reglas";
import { SelectorRangoIngresos } from "./SelectorRangoIngresos";

// La pestaña «Ingresos» de Movimientos: qué prendas entraron a la sede entre dos fechas, UNA línea por modelo, con su foto.
// Es la pregunta de la persona de compras cuando llega un fardo; el libro de Movimientos la responde fila por fila, color por
// talla, y no suma por modelo. Solo lectura: cuenta lo que ENTRÓ (stock inicial y mercadería recibida).

const PLANTILLA = "sm:grid-cols-[minmax(0,1fr)_7rem]";
const COLUMNAS: Columna[] = [{ titulo: "Modelo" }, { titulo: "Prendas", alinear: "der" }];

export function IngresosVista({ ingresos, rango, sede }: { ingresos: IngresosDeLaSede | null; rango: RangoIngresos; sede: string }) {
  return (
    <div className="space-y-4">
      <SelectorRangoIngresos periodo={rango.periodo} desde={rango.desde} hasta={rango.hasta} />
      {ingresos === null ? (
        <Aviso tono="error" titulo="No se pudieron leer los ingresos">
          La base no respondió. Prueba otra vez en un momento; no se perdió ni cambió nada.
        </Aviso>
      ) : ingresos.resumen.modelos.length === 0 ? (
        <div className="card-cayla">
          <Vacio icono={<PackageCheck />} titulo={`No entró nada ${conPreposicion(rango.texto)}`}>
            En {sede} no se cargó stock inicial ni se recibió mercadería en ese período. Prueba con más días.
          </Vacio>
        </div>
      ) : (
        <>
          <p data-guia="movimientos.ingresos-total" className="text-sm text-taupe">
            <b className="font-semibold text-tinta">{prendasTexto(ingresos.resumen.totales.unidades)}</b> en {modelosTexto(ingresos.resumen.totales.modelos)}, {rango.texto}.
          </p>
          <Tabla guia="movimientos.ingresos-tabla">
            <Encabezado columnas={COLUMNAS} plantilla={PLANTILLA} />
            {ingresos.resumen.modelos.map((m) => {
              const apariencia = ingresos.apariencia[m.productoId];
              const detalle = [m.codigo, m.categoria].filter(Boolean).join(" · ");
              return (
                <div key={m.productoId} role="row" className={fila(PLANTILLA, "items-center")}>
                  <div className={celda("izq", "flex items-center gap-3")}>
                    <MiniaturaPrenda tamano="lg" fotoUrl={apariencia?.fotoUrl ?? null} prefijo={apariencia?.prefijo} familia={apariencia?.familia} categoria={apariencia?.categoria} />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-tinta">{m.referencia}</span>
                      {detalle && <span className="block truncate text-xs text-taupe">{detalle}</span>}
                    </span>
                  </div>
                  <span
                    className={celda("der", "text-sm font-semibold text-tinta")}
                    title={`${m.deStockInicial.toLocaleString("es-PE")} de stock inicial · ${m.deRecepcion.toLocaleString("es-PE")} de mercadería recibida`}
                  >
                    {m.unidades.toLocaleString("es-PE")}
                  </span>
                </div>
              );
            })}
          </Tabla>
        </>
      )}
      <p data-guia="movimientos.ingresos-nota" className="nota-cayla">
        <b>Qué cuenta:</b> lo que entró como stock inicial y como mercadería recibida, sumado por modelo. No resta lo que se ajustó después: para eso está
        la lista de Movimientos.
      </p>
    </div>
  );
}
