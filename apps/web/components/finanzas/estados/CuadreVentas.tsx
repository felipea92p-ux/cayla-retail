import { Aviso } from "@/components/ui/Aviso";
import { Chip } from "@/components/ui/Chip";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import type { CuadroVentas } from "@/lib/cuadre-ventas-reglas";
import { solesCentimos } from "@/lib/flujo-caja-reglas";

// ¿Ganamos? ▸ De Ventas a Finanzas (ADR-0609). Las dos pantallas parten de las mismas ventas y dan cifras distintas a propósito: este cuadro
// dice qué las separa, en céntimos, para que nadie tenga que sacar la cuenta. Si algo no tiene nombre, sale «Sin explicar»: no se reparte ni se esconde.

export function CuadreVentas({ cuadro, falla }: { cuadro: CuadroVentas | null; falla: string | null }) {
  if (falla) return <Aviso tono="error">{falla}</Aviso>;
  if (!cuadro) return null;
  const { columnas, filas, conTotal, sinExplicar } = cuadro;
  const cuadra = Math.round(sinExplicar * 100) === 0;
  return (
    <section data-guia="fin-ganamos.cuadre">
      <TituloSeccion
        accion={
          cuadra ? (
            <Chip tono="verde" versalitas={false} title="Todo lo que separa las dos cifras tiene nombre">
              Cuadra al céntimo
            </Chip>
          ) : (
            <Chip tono="rojo" versalitas={false}>
              {`${solesCentimos(Math.abs(sinExplicar))} sin explicar`}
            </Chip>
          )
        }
      >
        De Ventas a Finanzas
      </TituloSeccion>
      <p className="mt-1 text-sm text-taupe">Parten de las mismas ventas. Ventas muestra lo cobrado; Finanzas, lo que es ingreso de CAYLA.</p>
      <div className="fin-tabla-wrap mt-3">
        <table className="fin-tabla fin-tabla-flujo" /* unificar-fijo: la tabla del kit de Finanzas (fin-tabla), como sus vecinas de Estados financieros, ADR-0195 */>
          <caption className="sr-only">De lo vendido en Ventas a las ventas de Finanzas</caption>
          <thead>
            <tr>
              <th>Concepto</th>
              {columnas.map((c) => (
                <th key={c} className="fin-num">
                  {c}
                </th>
              ))}
              {conTotal && <th className="fin-num">Total</th>}
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => {
              const fuerte = f.clave === "vendido" || f.clave === "ventasNetas";
              return (
                <tr key={f.clave}>
                  <td data-l="Concepto">
                    {fuerte ? <b>{f.nombre}</b> : f.nombre}
                    <span className="fin-sub">{f.detalle}</span>
                  </td>
                  {f.montos.map((m, i) => (
                    <td key={columnas[i]} className="fin-num" data-l={columnas[i]}>
                      {fuerte ? <b>{solesCentimos(m)}</b> : solesCentimos(m)}
                    </td>
                  ))}
                  {conTotal && (
                    <td className="fin-num" data-l="Total">
                      <b>{solesCentimos(f.total)}</b>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
