import { ArrowRight, Landmark } from "lucide-react";
import { Ayuda } from "@/components/Ayuda";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { Vacio } from "@/components/ui/Vacio";
import { celda, Encabezado, fila, Tabla, type Columna } from "@/components/ui/Tabla";
import { solesCentimos } from "@/lib/flujo-caja-reglas";
import { nombreDeMetodo } from "@/lib/reportes-ventas-reglas";
import type { EmpresaDelReporte, FilaDePlata, PlataPorCuenta as Plata } from "@/lib/reportes-por-empresa-reglas";

// «¿Dónde está la plata?» de «CAYLA y CLAURE» (ADR-0667): cada cobro en la cuenta donde entró, partido por empresa. Es `<Tabla>` (ADR-0358). Una cuenta
// «por depositar» dice a qué banco abona su máquina («Por depositar Izipay → Interbank Empresas»): ahí es donde la tarjeta de las dos empresas llega
// mezclada. Con `onElegir`, cada fila lleva a sus ventas (la tabla de «Venta por venta»).

// Las columnas de cada empresa son de ancho fijo: la plantilla se escribe entera para 2 y 3 empresas (Tailwind no arma clases en tiempo de ejecución).
const PLANTILLAS: Record<number, string> = {
  2: "sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_8rem_8rem_8rem]",
  3: "sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_8rem_8rem_8rem_8rem]",
};

/** En el celular cada dato lleva su nombre delante (la fila se apila y no hay encabezado). */
const Rotulo = ({ children }: { children: string }) => <span className="mr-1 text-taupe sm:hidden">{children}</span>;

const monto = (n: number) => (n === 0 ? "—" : solesCentimos(n));

export function PlataPorCuenta({
  plata,
  empresas,
  cobradoPorLaCasa,
  onElegir,
  elegida = null,
}: {
  plata: Plata;
  empresas: EmpresaDelReporte[];
  /** De cada empresa que no es la casa: cuánto de lo suyo entró a cuentas de CAYLA (id → soles). */
  cobradoPorLaCasa: Record<string, number>;
  onElegir?: (f: FilaDePlata) => void;
  /** La fila que hoy filtra «Venta por venta». */
  elegida?: string | null;
}) {
  const plantilla = PLANTILLAS[empresas.length] ?? PLANTILLAS[2];
  const columnas: Columna[] = [
    { titulo: "Cuenta" },
    { titulo: "Medio" },
    ...empresas.map((e): Columna => ({ titulo: e.nombre, alinear: "der" })),
    { titulo: "Total", alinear: "der" },
  ];
  const otras = empresas.filter((e) => !e.casa);

  const nombreCuenta = (f: FilaDePlata) => (
    <span className="inline-flex flex-wrap items-center gap-x-1.5">
      <span className="font-medium text-tinta">{f.cuenta}</span>
      {f.abonaA && (
        <span className="inline-flex items-center gap-1 text-taupe">
          <ArrowRight aria-hidden className="h-3.5 w-3.5" />
          {f.abonaA}
        </span>
      )}
    </span>
  );

  return (
    <section aria-label="Dónde entró cada cobro" data-guia="empresas.plata" className="space-y-3">
      <TituloSeccion dato={solesCentimos(plata.total)} ayuda="Cada cobro, en la cuenta donde entró. Una venta mixta reparte cada medio según lo cobrado de cada empresa.">
        ¿Dónde está la plata?
      </TituloSeccion>
      {plata.filas.length === 0 ? (
        <Vacio tamano="chico" icono={<Landmark />}>No hay cobros en este período.</Vacio>
      ) : (
        <Tabla>
          <Encabezado columnas={columnas} plantilla={plantilla} />
          {plata.filas.map((f) => {
            const contenido = (
              <>
                <span className={celda("izq", "whitespace-normal")}>{nombreCuenta(f)}</span>
                <span className={celda("izq")}>
                  <Rotulo>Medio</Rotulo>
                  {nombreDeMetodo(f.metodo)}
                </span>
                {empresas.map((e) => (
                  <span key={e.id} className={celda("der")}>
                    <Rotulo>{e.nombre}</Rotulo>
                    {monto(f.porEmpresa[e.id] ?? 0)}
                  </span>
                ))}
                <span className={celda("der", "font-medium")}>
                  <Rotulo>Total</Rotulo>
                  {solesCentimos(f.total)}
                </span>
              </>
            );
            return onElegir ? (
              <button
                key={f.clave}
                type="button"
                className={fila(plantilla, "w-full cursor-pointer text-left")}
                aria-current={elegida === f.clave ? "true" : undefined}
                aria-label={`Ver las ventas cobradas con ${nombreDeMetodo(f.metodo)} en ${f.cuenta}`}
                onClick={() => onElegir(f)}
              >
                {contenido}
              </button>
            ) : (
              <div key={f.clave} className={fila(plantilla)} role="row">
                {contenido}
              </div>
            );
          })}
          <div className={fila(plantilla, "bg-tinta/[0.04] font-semibold")} role="row">
            <span className={celda("izq")}>Total</span>
            <span className={celda("izq", "hidden sm:block")} />
            {empresas.map((e) => (
              <span key={e.id} className={celda("der")}>
                <Rotulo>{e.nombre}</Rotulo>
                {solesCentimos(plata.totales[e.id] ?? 0)}
              </span>
            ))}
            <span className={celda("der")}>
              <Rotulo>Total</Rotulo>
              {solesCentimos(plata.total)}
            </span>
          </div>
        </Tabla>
      )}
      {otras.map((e) => {
        const enLaCasa = cobradoPorLaCasa[e.id] ?? 0;
        const comision = plata.comisiones[e.id];
        if (enLaCasa === 0) return null;
        return (
          <p key={e.id} className="nota-cayla texto-detalle">
            De lo de {e.nombre}, <b className="font-semibold tabular-nums">{solesCentimos(enLaCasa)}</b> entró a cuentas de CAYLA
            {comision ? (
              <>
                {" "}
                · comisión del POS estimada: <span className="tabular-nums">{solesCentimos(comision)}</span>
              </>
            ) : null}
            .{" "}
            <Ayuda titulo={`Lo de ${e.nombre} en cuentas de CAYLA`}>
              Es lo cobrado por Yape, tarjeta y QR de sus prendas. La cuenta con {e.nombre}, en Finanzas, le resta lo ya pagado y los gastos. El efectivo queda en el cajón y no se cuenta aquí.
            </Ayuda>
          </p>
        );
      })}
    </section>
  );
}
