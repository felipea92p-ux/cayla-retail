import { CabeceraPantalla } from "@/components/ui/CabeceraPantalla";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { Chip } from "@/components/ui/Chip";
import { celda, Encabezado, fila, Tabla, TABLA, type Columna } from "@/components/ui/Tabla";
import { exigirModulo } from "@/lib/persona-actual";
import { leerRendimientoEquipo } from "@/lib/rendimiento";

// Rendimiento (ADR-0219): las ventas de cada persona del mes, con dos rankings. «Soles por hora»
// ordena por el número CONTRAÍDO hacia el resto de la tienda (Efron-Morris/James-Stein,
// `rendimiento-reglas.ts`) — no por el crudo, que es lo que el ADR proponía antes de esta ficha.
// «Cierra más ventas» sigue siendo un conteo crudo, a propósito (funciona sin horas, en AQP y Lima).
//
// LO QUE FALTA (siguiente paso, no bloquea esta pantalla): ticket promedio, % a precio completo,
// descuento dado, cuadre de caja y bajada al piso (D-116); la ficha de cada persona
// (`/rendimiento/[persona]`); corregir quién atendió una venta (`reasignar_asesora`); el selector
// de mes (hoy siempre el mes calendario de Lima en curso).

const SOLES = new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN", maximumFractionDigits: 0 });
const SOLES_HORA = new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN", maximumFractionDigits: 1 });

const PLANTILLA = "grid-cols-[1fr_auto]";
const COLUMNAS: Columna[] = [{ titulo: "Integrante" }, { titulo: "Ventas", alinear: "der" }];

export default async function RendimientoPage() {
  const persona = await exigirModulo("rendimiento");
  const sedes = await leerRendimientoEquipo();

  return (
    <div className="space-y-6">
      <CabeceraPantalla
        sobretitulo="Gestión"
        titulo="Rendimiento"
        bajada={
          sedes.length > 1
            ? "Las ventas de cada persona de cada tienda, este mes. Para reconocer y acompañar — sin comisión ni bono."
            : `Las ventas de cada persona de ${persona.ubicacionEtiqueta}, este mes. Para reconocer y acompañar — sin comisión ni bono.`
        }
      />

      {sedes.length === 0 && (
        <div className="card-cayla p-5">
          <p className={TABLA.vacio}>
            No hay una tienda que mirar desde esta cuenta: Rendimiento es de quien lleva una tienda o
            del Admin. Si crees que deberías verla, pídele a tu líder que revise tu sede en Colaboradores
            ▸ Roles y accesos.
          </p>
        </div>
      )}

      {sedes.map((sede) => (
        <section key={sede.ubicacionId} className="space-y-4">
          {sedes.length > 1 && <h2 className="text-lg font-semibold text-tinta">{sede.ubicacionNombre}</h2>}

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <TarjetaCifra etiqueta="Ventas del mes" valor={String(sede.totalVentas)} />
            <TarjetaCifra etiqueta="Soles del mes" valor={SOLES.format(sede.totalSoles)} />
            <TarjetaCifra etiqueta="Personas que vendieron" valor={String(sede.rankingNumeroVentas.length)} />
            <TarjetaCifra
              etiqueta="Ticket promedio"
              valor={sede.totalVentas > 0 ? SOLES.format(sede.totalSoles / sede.totalVentas) : "—"}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <h3 className="mb-2 text-sm font-semibold text-taupe">Vende más por hora</h3>
              <Tabla>
                <Encabezado columnas={COLUMNAS} plantilla={PLANTILLA} siempre />
                {sede.rankingSolesPorHora.length === 0 && <p className={TABLA.vacio}>Nadie vendió este mes.</p>}
                {sede.rankingSolesPorHora.map((f) => (
                  <div key={f.personaId} className={fila(PLANTILLA)} role="row">
                    <span className={celda()}>
                      {f.nombre}{" "}
                      {f.esEncargada && (
                        <Chip tono="pizarra" versalitas={false}>
                          Encargada
                        </Chip>
                      )}{" "}
                      {f.muestraChica && (
                        <Chip tono="ambar" versalitas={false}>
                          Muestra chica ({f.ventas})
                        </Chip>
                      )}{" "}
                      {f.sinHoras && (
                        <Chip tono="neutro" versalitas={false}>
                          Sin horas
                        </Chip>
                      )}
                    </span>
                    <span className={celda("der")}>
                      {f.sinHoras ? "—" : SOLES_HORA.format(f.solesPorHoraContraido ?? 0)}
                    </span>
                  </div>
                ))}
              </Tabla>
              <p className="nota-cayla">
                El número no es el crudo: se corrige hacia el promedio del resto de la tienda, tanto
                menos cuanto más horas tenga cada persona (contracción de Efron-Morris). Así un mes muy
                corto no parece mejor que uno sostenido. «Muestra chica» es menos de 40 ventas en el mes.
              </p>
            </div>

            <div>
              <h3 className="mb-2 text-sm font-semibold text-taupe">Cierra más ventas</h3>
              <Tabla>
                <Encabezado columnas={COLUMNAS} plantilla={PLANTILLA} siempre />
                {sede.rankingNumeroVentas.length === 0 && <p className={TABLA.vacio}>Nadie vendió este mes.</p>}
                {sede.rankingNumeroVentas.map((f) => (
                  <div key={f.personaId} className={fila(PLANTILLA)} role="row">
                    <span className={celda()}>
                      {f.nombre}{" "}
                      {f.esEncargada && (
                        <Chip tono="pizarra" versalitas={false}>
                          Encargada
                        </Chip>
                      )}{" "}
                      {f.muestraChica && (
                        <Chip tono="ambar" versalitas={false}>
                          Muestra chica
                        </Chip>
                      )}
                    </span>
                    <span className={celda("der")}>{f.ventas}</span>
                  </div>
                ))}
              </Tabla>
              <p className="nota-cayla">Número de ventas del mes, sin corregir: funciona igual con o sin horas registradas.</p>
            </div>
          </div>
        </section>
      ))}
    </div>
  );
}
