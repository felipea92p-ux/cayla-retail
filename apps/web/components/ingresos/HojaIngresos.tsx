import { MiniaturaPrenda } from "@/components/ui/PrendaCelda";
import type { Apariencia } from "@/lib/ingresos";
import { conPreposicion, costoDelModelo, modelosTexto, precioDelModelo, prendasTexto, type ModeloIngresado } from "@/lib/ingresos-reglas";
import { MatrizIngreso } from "./MatrizIngreso";

// La hoja que se imprime de «Ingresos» (A4, en claro, con la foto de cada modelo). En pantalla NO se ve: `#ingresos-print` es
// `display:none` (`app/estilos/ingresos-impresion.css`) y solo existe mientras se imprime. Es lo que se está viendo: los modelos que
// llegan ya vienen buscados, filtrados y ordenados, y los que están abiertos llevan su detalle de color y talla.

export function HojaIngresos({
  modelos,
  abiertos,
  apariencia,
  veCosto,
  sede,
  rangoTexto,
  impresoEn,
}: {
  modelos: readonly ModeloIngresado[];
  abiertos: ReadonlySet<string>;
  apariencia: Record<string, Apariencia>;
  veCosto: boolean;
  sede: string;
  rangoTexto: string;
  /** «28 de octubre de 2026, 10:30 p. m.»: cuándo se sacó (el papel se archiva y compras lo compara con otro). */
  impresoEn: string;
}) {
  const prendas = modelos.reduce((suma, m) => suma + m.unidades, 0);
  const columnas = veCosto ? 5 : 4;
  return (
    <div id="ingresos-print" className="papel-fijo" data-testid="hoja-ingresos">
      <header className="border-b border-tinta pb-3">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-taupe">CAYLA · {sede}</p>
        <h1 className="mt-1 font-serif text-2xl text-tinta">Ingresos de mercadería</h1>
        <p className="mt-1 text-sm text-tinta">Lo que entró {conPreposicion(rangoTexto)}</p>
        <p className="mt-0.5 text-xs text-taupe">Impreso el {impresoEn}</p>
      </header>

      <p className="mt-3 text-sm text-tinta">
        <b>{prendasTexto(prendas)}</b> en {modelosTexto(modelos.length)}
      </p>

      <table // unificar-fijo: la hoja que se imprime (papel, no una pantalla); la <Tabla> del sistema no se imprime con su encabezado repetido
        className="mt-3 w-full border-collapse text-sm"
      >
        <thead className="ing-encabezado">
          <tr className="border-b border-tinta text-left text-xs text-taupe">
            <th scope="col" className="py-1.5 pr-3 font-normal">
              Modelo
            </th>
            <th scope="col" className="px-3 py-1.5 text-right font-normal">
              Prendas
            </th>
            <th scope="col" className="px-3 py-1.5 text-right font-normal">
              Precio
            </th>
            {veCosto && (
              <th scope="col" className="pl-3 py-1.5 text-right font-normal">
                Costo
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {modelos.map((m) => {
            const a = apariencia[m.productoId];
            const detalle = [m.codigo, m.categoria].filter(Boolean).join(" · ");
            return (
              <tr key={m.productoId} className="border-b border-sand align-top">
                <td className="py-2 pr-3">
                  <div className="flex items-start gap-3">
                    <MiniaturaPrenda tamano="xl" fotoUrl={a?.fotoUrl ?? null} prefijo={a?.prefijo} familia={a?.familia} categoria={a?.categoria} />
                    <div className="min-w-0">
                      <p className="font-medium text-tinta">
                        {m.referencia} <span className="ml-1 text-xs font-normal text-taupe">{m.esNuevo ? "· Nuevo" : "· Reingreso"}</span>
                      </p>
                      {detalle && <p className="text-xs text-taupe">{detalle}</p>}
                      {abiertos.has(m.productoId) && (
                        <div className="mt-2">
                          <MatrizIngreso variantes={m.variantes} />
                        </div>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums text-tinta">{m.unidades.toLocaleString("es-PE")}</td>
                <td className="px-3 py-2 text-right tabular-nums text-tinta">{precioDelModelo(m)}</td>
                {veCosto && <td className="pl-3 py-2 text-right tabular-nums text-tinta">{costoDelModelo(m)}</td>}
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t border-tinta font-semibold text-tinta">
            <td className="py-2 pr-3">Total · {modelosTexto(modelos.length)}</td>
            <td className="px-3 py-2 text-right tabular-nums">{prendas.toLocaleString("es-PE")}</td>
            <td colSpan={columnas - 2} />
          </tr>
        </tfoot>
      </table>

      <p className="mt-4 text-xs text-taupe">Cuenta lo que entró como stock inicial y como mercadería recibida. No resta lo que se ajustó o se vendió después.</p>
    </div>
  );
}
