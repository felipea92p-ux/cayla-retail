import { Ayuda } from "@/components/Ayuda";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { Chip } from "@/components/ui/Chip";
import { celda, Encabezado, fila, Tabla, type Columna } from "@/components/ui/Tabla";
import { MesaRendimiento } from "@/components/rendimiento/MesaRendimiento";
import { exigirModulo } from "@/lib/persona-actual";
import { leerPantallaRendimiento, type SedeDeRendimiento } from "@/lib/rendimiento";
import { tramoDeUrl } from "@/lib/rendimiento-vista-reglas";
import { Receipt, Store } from "lucide-react";
import { Vacio } from "@/components/ui/Vacio";
import { TituloSeccion } from "@/components/ui/TituloSeccion";

// Rendimiento (ADR-0219, ADR-0325, ADR-0610). Arriba, la MESA (`MesaRendimiento`, en el navegador): tiendas, días, cifras, gráfico y tabla sobre un solo estado.
// Abajo, los dos RANKINGS del mes: «Soles por hora» ordena por el número CONTRAÍDO hacia el resto de la tienda (Efron-Morris/James-Stein, `rendimiento-reglas.ts`), no por
// el crudo, y «Cierra más ventas» sigue siendo un conteo crudo, a propósito (funciona sin horas). El servidor lee TODAS las tiendas de una vez: cambiar de tienda o de
// días no vuelve a preguntarle nada a la base. La pantalla abre en la tienda de la sesión (Felipe, 2026-10-03) y en este mes (ADR-0610).
//
// LO QUE FALTA (no bloquea esta pantalla): % a precio completo, descuento dado, cuadre de caja y bajada al piso (D-116); corregir quién atendió una venta
// (`reasignar_asesora`); el selector de mes; la sugerencia de meta de la SEDE con 4 semanas de ventas (fase 2 de D-143).

const SOLES_HORA = new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN", maximumFractionDigits: 1 });

const PLANTILLA = "grid-cols-[1fr_auto]";
const COLUMNAS: Columna[] = [{ titulo: "Integrante" }, { titulo: "Ventas", alinear: "der" }];
const COLUMNAS_HORA: Columna[] = [{ titulo: "Integrante" }, { titulo: "Por hora", alinear: "der" }];

export default async function RendimientoPage({ searchParams }: { searchParams: Promise<{ sede?: string; vista?: string; desde?: string; hasta?: string; modo?: string }> }) {
  const persona = await exigirModulo("rendimiento");
  const { sede, vista, desde, hasta, modo } = await searchParams;
  const { hoy, sedes: todas } = await leerPantallaRendimiento();
  // La tienda de la sesión va primera y es la que abre si la URL no pide otra (Felipe, 2026-10-03).
  const sedes = [...todas].sort((a, b) => Number(b.ubicacionId === persona.ubicacionId) - Number(a.ubicacionId === persona.ubicacionId));
  const varias = sedes.length > 1;
  const elegida = sedes.find((s) => s.ubicacionId === sede) ?? sedes[0] ?? null;

  return (
    <div className="space-y-6">
      {/* La cabecera de todo el ERP menos Finanzas (ADR-0358, Felipe 2026-10-14). */}
      <EncabezadoPagina
        sede={varias ? "Todas las tiendas" : (elegida?.nombre ?? persona.ubicacionEtiqueta)}
        titulo="Rendimiento"
        subtitulo={
          // Una frase corta y, un paso más abajo en el globo del «?», cómo se lee (Felipe, 2026-10-03; ronda 18 de /unificar).
          <>
            {varias
              ? "Las ventas de cada persona de cada tienda, contra su meta."
              : `Las ventas de cada persona de ${elegida?.nombre ?? persona.ubicacionEtiqueta}, contra su meta.`}{" "}
            Para reconocer y acompañar — sin comisión ni bono.
          </>
        }
        ayuda={
          <>
            <span className="block">
              Lo vendido cuenta con IGV y sin anuladas; las devoluciones y los cambios no restan. Es de quien atendió la venta. No cuenta lo que se vendió
              de CLAURE (de Claudia, en Tienda Lima): no es venta de CAYLA.
            </span>
            <span className="mt-2 block">
              La meta es para <b>reconocer y acompañar</b>: no se usa para pagar ni para evaluar.
            </span>
          </>
        }
      />

      {sedes.length === 0 && (
        <div className="card-cayla">
          <Vacio icono={<Store />}>
            Rendimiento es de quien lleva una tienda. Si deberías verla, pídele a tu líder que revise tu sede en Colaboradores.
          </Vacio>
        </div>

      )}

      {elegida && (
        <MesaRendimiento
          sedes={sedes}
          inicialId={elegida.ubicacionId}
          sesionId={persona.ubicacionId}
          hoy={hoy}
          tramoInicial={tramoDeUrl({ desde, hasta, vista }, hoy)}
          modoInicial={modo === "persona" || modo === "suma" ? modo : "dia"}
          personaCuentaId={persona.personaId}
          esAdmin={persona.esAdmin}
          rankings={Object.fromEntries(sedes.map((s) => [s.ubicacionId, <Rankings key={`rankings-${s.ubicacionId}`} sede={s} />]))}
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
    <section className="space-y-4" aria-label="Rankings del mes" data-guia="rendimiento.rankings">
      <TituloSeccion>Rankings del mes</TituloSeccion>

      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <TituloSeccion nivel={3} className="mb-2">
            Vende más por hora
            <Ayuda titulo="Vende más por hora">
              <span className="block">
                El número no es el crudo: se corrige hacia el promedio de la tienda, tanto menos cuanto más horas tenga cada persona (contracción de Efron-Morris).
              </span>
              <span className="mt-2 block">
                <b>El orden</b> no es por ese número sino por lo que podemos asegurar de él (el número menos su margen de error): quien tiene poca evidencia queda más
                abajo que quien tiene mucha, aunque su número sea mayor.
              </span>
              <span className="mt-2 block">«Muestra chica» es menos de 40 ventas en el mes.</span>
            </Ayuda>
          </TituloSeccion>
          <Tabla>
            <Encabezado columnas={COLUMNAS_HORA} plantilla={PLANTILLA} siempre />
            {porHora.length === 0 && (
              <Vacio tamano="chico" icono={<Receipt />} className="py-5">
                Nadie vendió este mes.
              </Vacio>
            )}
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
        </div>

        <div>
          <TituloSeccion nivel={3} className="mb-2">
            Cierra más ventas
            <Ayuda titulo="Cierra más ventas">
              <span className="block">Número de ventas del mes, sin corregir: funciona igual con o sin horas registradas.</span>
              <span className="mt-2 block">«Muestra chica» es menos de 40 ventas en el mes.</span>
            </Ayuda>
          </TituloSeccion>
          <Tabla>
            <Encabezado columnas={COLUMNAS} plantilla={PLANTILLA} siempre />
            {porVentas.length === 0 && (
              <Vacio tamano="chico" icono={<Receipt />} className="py-5">
                Nadie vendió este mes.
              </Vacio>
            )}
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
        </div>
      </div>
    </section>
  );
}
