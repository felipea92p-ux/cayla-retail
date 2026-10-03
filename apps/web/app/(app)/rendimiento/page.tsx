import { CabeceraPantalla } from "@/components/ui/CabeceraPantalla";
import { Chip } from "@/components/ui/Chip";
import { celda, Encabezado, fila, Tabla, TABLA, type Columna } from "@/components/ui/Tabla";
import { TiendasRendimiento } from "@/components/rendimiento/TiendasRendimiento";
import { exigirModulo } from "@/lib/persona-actual";
import { leerPantallaRendimiento, type SedeDeRendimiento } from "@/lib/rendimiento";
import { vistaDeUrl } from "@/lib/rendimiento-meta-reglas";

// Rendimiento (ADR-0219, ADR-0318). Arriba, el PANEL de la meta de la tienda (`PanelRendimiento`, en el
// navegador): cifras, cómo va cada persona contra su meta —que la líder de la sede o el Admin pueden cambiar—,
// las ventas contra la meta y el historial de cambios. Abajo, los dos RANKINGS del mes: «Soles por hora» ordena por
// el número CONTRAÍDO hacia el resto de la tienda (Efron-Morris/James-Stein, `rendimiento-reglas.ts`) — no por el
// crudo, que es lo que el ADR proponía antes de esa ficha —, y «Cierra más ventas» sigue siendo un conteo crudo, a
// propósito (funciona sin horas, en AQP y Lima).
//
// Con VARIAS tiendas (el Admin) arriba van tres tarjetas que son a la vez las pestañas (`ComparativoTiendas`: cómo va cada
// tienda este mes, nunca un ranking mezclado) y la pantalla abre en la tienda de la sesión (Felipe, 2026-10-03; antes abría en
// «Todas»). Tocar una tarjeta muestra su panel completo al instante (`TiendasRendimiento`: la tienda elegida es estado del navegador y se anota en `?sede=` sin navegar; el servidor ya leyó todas). La vista (`?vista=hoy|semana|mes`) la cambia el panel sin
// navegar; acá solo se lee para abrir en la misma.
//
// LO QUE FALTA (siguiente paso, no bloquea esta pantalla): ticket promedio por persona, % a precio completo,
// descuento dado, cuadre de caja y bajada al piso (D-116); la ficha de cada persona (`/rendimiento/[persona]`);
// corregir quién atendió una venta (`reasignar_asesora`); el selector de mes (hoy siempre el mes calendario de
// Lima en curso); la sugerencia de meta de la SEDE con 4 semanas de ventas (fase 2 de D-143).

const SOLES_HORA = new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN", maximumFractionDigits: 1 });

const PLANTILLA = "grid-cols-[1fr_auto]";
const COLUMNAS: Columna[] = [{ titulo: "Integrante" }, { titulo: "Ventas", alinear: "der" }];

export default async function RendimientoPage({ searchParams }: { searchParams: Promise<{ vista?: string; sede?: string }> }) {
  const persona = await exigirModulo("rendimiento");
  const { vista, sede } = await searchParams;
  const { hoy, sedes: todas } = await leerPantallaRendimiento();
  // La tienda de la sesión va primera y es la que abre si la URL no pide otra (Felipe, 2026-10-03).
  const sedes = [...todas].sort((a, b) => Number(b.ubicacionId === persona.ubicacionId) - Number(a.ubicacionId === persona.ubicacionId));
  const varias = sedes.length > 1;
  const elegida = sedes.find((s) => s.ubicacionId === sede) ?? sedes[0] ?? null;

  return (
    <div className="space-y-6">
      <CabeceraPantalla
        sobretitulo="Gestión"
        titulo="Rendimiento"
        bajada={
          varias
            ? "Las ventas de cada persona de cada tienda, contra su meta. Para reconocer y acompañar — sin comisión ni bono."
            : elegida
              ? `Las ventas de cada persona de ${elegida.nombre}, contra su meta. Para reconocer y acompañar — sin comisión ni bono.`
              : `Las ventas de cada persona de ${persona.ubicacionEtiqueta}, contra su meta. Para reconocer y acompañar — sin comisión ni bono.`
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

      {elegida && (
        <TiendasRendimiento
          sedes={sedes}
          inicialId={elegida.ubicacionId}
          sesionId={persona.ubicacionId}
          hoy={hoy}
          vistaInicial={vistaDeUrl(vista)}
          personaCuentaId={persona.personaId}
          esAdmin={persona.esAdmin}
          rankings={Object.fromEntries(sedes.map((s) => [s.ubicacionId, <Rankings key={s.ubicacionId} sede={s} />]))}
        />
      )}
    </div>
  );
}

/** Los dos rankings del mes de UNA tienda (solo quien vendió). */
function Rankings({ sede }: { sede: SedeDeRendimiento }) {
  const r = sede.ranking;
  const porHora = r?.rankingSolesPorHora ?? [];
  const porVentas = r?.rankingNumeroVentas ?? [];
  return (
    <section className="space-y-4" aria-label="Rankings del mes">
      <h2 className="label-cayla text-[11px] font-bold text-taupe">Rankings del mes</h2>

      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <h3 className="mb-2 text-sm font-semibold text-taupe">Vende más por hora</h3>
          <Tabla>
            <Encabezado columnas={COLUMNAS} plantilla={PLANTILLA} siempre />
            {porHora.length === 0 && <p className={TABLA.vacio}>Nadie vendió este mes.</p>}
            {porHora.map((f) => (
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
                <span className={celda("der")}>{f.sinHoras ? "—" : SOLES_HORA.format(f.solesPorHoraContraido ?? 0)}</span>
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
            {porVentas.length === 0 && <p className={TABLA.vacio}>Nadie vendió este mes.</p>}
            {porVentas.map((f) => (
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

      <p className="nota-cayla">
        <b>Cómo se lee.</b> Lo vendido cuenta con IGV y sin anuladas; las devoluciones y los cambios no restan. Es de quien atendió la venta. La meta es para{" "}
        <b>reconocer y acompañar</b>: no se usa para pagar ni para evaluar.
      </p>
    </section>
  );
}
