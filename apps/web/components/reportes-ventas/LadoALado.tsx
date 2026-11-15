import { BarraApilada, MuestraTramo } from "@/components/ui/BarraApilada";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { celda, Encabezado, fila, Tabla, type Columna } from "@/components/ui/Tabla";
import { solesCentimos } from "@/lib/flujo-caja-reglas";
import { colorDeMetodo, nombreDeMetodo } from "@/lib/reportes-ventas-reglas";
import type { LadoDeEmpresa, MesDeEmpresa } from "@/lib/reportes-por-empresa-reglas";

// «CAYLA y CLAURE» lado a lado (ADR-0667): cada empresa en su bloque, con cómo le pagaron (`BarraApilada` y su leyenda con `MuestraTramo`, la pieza única de
// `grafico.barra`) y mes a mes con el comprobante (`<Tabla>`). Una venta mixta cuenta en las dos empresas: es UN comprobante que ampara prendas de las dos.

// Pide ~544 px (corte de 480, `lib/tabla-corte-reglas.ts`): cabe en cada mitad desde 1280 px con el menú abierto; más angosto, la fila se apila.
const PLANTILLA = "sm:grid-cols-[minmax(0,1fr)_3.5rem_3.5rem_3.5rem_3.5rem_minmax(0,1fr)]";
const COLUMNAS: Columna[] = [
  { titulo: "Mes" },
  { titulo: "Ventas", alinear: "der" },
  { titulo: "Prendas", alinear: "der" },
  { titulo: "Boleta", alinear: "der", ayuda: "Ventas con boleta o factura" },
  { titulo: "Nota", alinear: "der", ayuda: "Ventas con nota de venta interna, que no va a SUNAT" },
  { titulo: "Vendido", alinear: "der" },
];
const PORCENTAJE = new Intl.NumberFormat("es-PE", { maximumFractionDigits: 1 });

/** En el celular cada dato lleva su nombre delante (la fila se apila y no hay encabezado). */
const Rotulo = ({ children }: { children: string }) => <span className="mr-1 text-taupe sm:hidden">{children}</span>;

function FilaMes({ m, total }: { m: MesDeEmpresa; total?: boolean }) {
  return (
    <div className={fila(PLANTILLA, total ? "bg-tinta/[0.04] font-semibold" : "")} role="row">
      <span className={celda("izq")}>{m.nombre}</span>
      <span className={celda("der")}>
        <Rotulo>Ventas</Rotulo>
        {m.ventas}
      </span>
      <span className={celda("der")}>
        <Rotulo>Prendas</Rotulo>
        {m.prendas}
      </span>
      <span className={celda("der")}>
        <Rotulo>Boleta</Rotulo>
        {m.boletas + m.facturas}
      </span>
      <span className={celda("der")}>
        <Rotulo>Nota de venta</Rotulo>
        {m.notas}
      </span>
      <span className={celda("der")}>
        <Rotulo>Vendido</Rotulo>
        {solesCentimos(m.vendido)}
      </span>
    </div>
  );
}

export function LadoALado({ lados }: { lados: LadoDeEmpresa[] }) {
  return (
    <div data-guia="empresas.lados" className="grid gap-4 xl:grid-cols-2">
      {lados.map(({ empresa, medios, meses, total }) => {
        const cobrado = medios.reduce((a, m) => a + m.monto, 0);
        const notas = total.ventas > 0 ? Math.round((total.notas / total.ventas) * 1000) / 10 : null;
        return (
          <section key={empresa.id} aria-label={empresa.nombre} className="min-w-0 space-y-4">
            <TituloSeccion dato={solesCentimos(total.vendido)}>{empresa.nombre}</TituloSeccion>
            {medios.length > 0 && (
              <div>
                <BarraApilada
                  alto={12}
                  formato={solesCentimos}
                  etiqueta={`Cómo le pagaron a ${empresa.nombre}: ${medios.map((m) => `${nombreDeMetodo(m.metodo)} ${PORCENTAJE.format((m.monto / cobrado) * 100)} %`).join(", ")}`}
                  segmentos={medios.map((m) => ({ clave: m.metodo, nombre: nombreDeMetodo(m.metodo), valor: m.monto, color: colorDeMetodo(m.metodo) }))}
                />
                <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
                  {medios.map((m) => (
                    <li key={m.metodo} className="inline-flex items-center gap-2 text-tinta/70">
                      <MuestraTramo color={colorDeMetodo(m.metodo)} />
                      {nombreDeMetodo(m.metodo)}
                      <span className="tabular-nums text-tinta">{solesCentimos(m.monto)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <Tabla>
              <Encabezado columnas={COLUMNAS} plantilla={PLANTILLA} />
              {meses.map((m) => (
                <FilaMes key={m.mes} m={m} />
              ))}
              {meses.length > 1 && <FilaMes m={total} total />}
            </Tabla>
            {notas !== null && (total.notas > 0 || total.sinComprobante > 0) && (
              <p className="texto-detalle text-taupe">
                {total.notas > 0 && `${total.notas} de ${total.ventas} ventas (${PORCENTAJE.format(notas)} %) salieron con nota de venta.`}
                {total.sinComprobante > 0 && ` ${total.sinComprobante} sin comprobante.`}
              </p>
            )}
          </section>
        );
      })}
    </div>
  );
}
