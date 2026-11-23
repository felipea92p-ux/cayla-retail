import { PackageCheck } from "lucide-react";
import { Aviso } from "@/components/ui/Aviso";
import { Vacio } from "@/components/ui/Vacio";
import type { IngresosDeLaSede } from "@/lib/ingresos";
import { conPreposicion, type RangoIngresos } from "@/lib/ingresos-reglas";
import { IngresosTabla } from "./IngresosTabla";
import { SelectorRangoIngresos } from "./SelectorRangoIngresos";

// La pestaña «Ingresos» de Movimientos: qué prendas entraron a la sede entre dos fechas, UNA línea por modelo, con su foto.
// Es la pregunta de la persona de compras cuando llega un fardo; el libro de Movimientos la responde fila por fila, color por
// talla, y no suma por modelo. Solo lectura: cuenta lo que ENTRÓ (stock inicial y mercadería recibida).

export function IngresosVista({ ingresos, rango, sede, hoy }: { ingresos: IngresosDeLaSede | null; rango: RangoIngresos; sede: string; /** El día de Lima. */ hoy: string }) {
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
            Prueba con más días.
          </Vacio>
        </div>
      ) : (
        <IngresosTabla
          modelos={ingresos.resumen.modelos}
          apariencia={ingresos.apariencia}
          veCosto={ingresos.resumen.veCosto}
          rangoTexto={rango.texto}
          sede={sede}
          desde={rango.desde}
          hasta={rango.hasta}
          hoy={hoy}
        />
      )}
      <p data-guia="movimientos.ingresos-nota" className="nota-cayla">
        <b>Qué cuenta:</b> el stock inicial y la mercadería recibida, por modelo. Los ajustes están en Movimientos.
      </p>
    </div>
  );
}
