import { CapsulaColor } from "@/components/ui/MuestraColor";
import { matrizDeVariantes, type VarianteIngresada } from "@/lib/ingresos-reglas";

// El detalle de un modelo de «Ingresos»: lo que entró de cada color y talla, un color por fila y una talla por columna, en el
// orden de la curva (S · M · L, 36 · 38 · 40). Es lo que compras pide «a veces»: por eso vive escondido bajo cada modelo y se
// abre al tocarlo. Una celda vacía es un color que no trajo esa talla; no es un cero.
//
// Es una matriz de tallas y no una tabla de registros: la `<Tabla>` del sistema no aplica aquí (ADR-0358, «Tablas»), como en
// Existencias y Pérdidas, que dibujan la suya.

export function MatrizIngreso({ variantes }: { variantes: readonly VarianteIngresada[] }) {
  const m = matrizDeVariantes(variantes);
  if (m.filas.length === 0) return <p className="text-sm text-taupe">Este modelo no trae detalle de colores ni tallas.</p>;
  const varias = m.filas.length > 1;
  return (
    <div className="overflow-x-auto">
      <table // unificar-fijo: matriz de colores × tallas de un modelo (como la de Existencias y Editar producto), no una lista de registros
        className="min-w-max text-sm tabular-nums"
      >
        <caption className="sr-only">Prendas que entraron, por color y talla</caption>
        <thead>
          <tr>
            <th scope="col" className="py-1 pr-6 text-left text-xs font-normal text-taupe">
              Color
            </th>
            {m.tallas.map((talla) => (
              <th key={talla} scope="col" className="px-3 py-1 text-right text-xs font-normal text-taupe">
                {talla}
              </th>
            ))}
            <th scope="col" className="py-1 pl-3 text-right text-xs font-normal text-taupe">
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {m.filas.map((f) => (
            <tr key={`${f.color ?? ""}|${f.colorHex ?? ""}`}>
              <th scope="row" className="py-1 pr-6 text-left font-normal text-tinta">
                <span className="inline-flex items-center gap-2">
                  {f.color !== null && <CapsulaColor fondo={f.colorHex} compacta />}
                  {f.color ?? "Sin color"}
                </span>
              </th>
              {m.tallas.map((talla) => (
                <td key={talla} className="px-3 py-1 text-right text-tinta">
                  {f.porTalla[talla] ?? <span className="text-tinta/35">·</span>}
                </td>
              ))}
              <td className="py-1 pl-3 text-right font-semibold text-tinta">{f.total}</td>
            </tr>
          ))}
        </tbody>
        {varias && (
          <tfoot>
            <tr className="border-t border-sand">
              <th scope="row" className="py-1 pr-6 text-left text-xs font-normal text-taupe">
                Total
              </th>
              {m.tallas.map((talla) => (
                <td key={talla} className="px-3 py-1 text-right font-semibold text-tinta">
                  {m.totalPorTalla[talla]}
                </td>
              ))}
              <td className="py-1 pl-3 text-right font-semibold text-tinta">{m.total}</td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
