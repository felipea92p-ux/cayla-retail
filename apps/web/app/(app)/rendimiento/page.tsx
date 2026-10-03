import Link from "next/link";
import { CabeceraPantalla } from "@/components/ui/CabeceraPantalla";
import { Chip } from "@/components/ui/Chip";
import { SegmentoEnlaces } from "@/components/ui/SegmentoEnlaces";
import { celda, Encabezado, fila, Tabla, TABLA, type Columna } from "@/components/ui/Tabla";
import { PanelRendimiento } from "@/components/rendimiento/PanelRendimiento";
import { exigirModulo } from "@/lib/persona-actual";
import { leerPantallaRendimiento, type SedeDeRendimiento } from "@/lib/rendimiento";
import { avance, resumenDeSede, vistaDeUrl } from "@/lib/rendimiento-meta-reglas";

// Rendimiento (ADR-0219, ADR-0318). Arriba, el PANEL de la meta de la tienda (`PanelRendimiento`, en el
// navegador): cifras, cómo va cada persona contra su meta —que la líder de la sede o el Admin pueden cambiar—,
// las ventas contra la meta y el historial de cambios. Abajo, los dos RANKINGS del mes: «Soles por hora» ordena por
// el número CONTRAÍDO hacia el resto de la tienda (Efron-Morris/James-Stein, `rendimiento-reglas.ts`) — no por el
// crudo, que es lo que el ADR proponía antes de esa ficha —, y «Cierra más ventas» sigue siendo un conteo crudo, a
// propósito (funciona sin horas, en AQP y Lima).
//
// Con VARIAS tiendas (el Admin) la pantalla abre en «Todas» —una tarjeta por tienda, nunca un ranking mezclado— y
// elegir una tienda (`?sede=`) muestra su panel completo. La vista (`?vista=hoy|semana|mes`) la cambia el panel sin
// navegar; acá solo se lee para abrir en la misma.
//
// LO QUE FALTA (siguiente paso, no bloquea esta pantalla): ticket promedio por persona, % a precio completo,
// descuento dado, cuadre de caja y bajada al piso (D-116); la ficha de cada persona (`/rendimiento/[persona]`);
// corregir quién atendió una venta (`reasignar_asesora`); el selector de mes (hoy siempre el mes calendario de
// Lima en curso); la sugerencia de meta de la SEDE con 4 semanas de ventas (fase 2 de D-143).

const SOLES = new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN", maximumFractionDigits: 0 });
const SOLES_HORA = new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN", maximumFractionDigits: 1 });

const PLANTILLA = "grid-cols-[1fr_auto]";
const COLUMNAS: Columna[] = [{ titulo: "Integrante" }, { titulo: "Ventas", alinear: "der" }];

export default async function RendimientoPage({ searchParams }: { searchParams: Promise<{ vista?: string; sede?: string }> }) {
  const persona = await exigirModulo("rendimiento");
  const { vista, sede } = await searchParams;
  const { hoy, sedes } = await leerPantallaRendimiento(sede ?? null);
  const varias = sedes.length > 1;
  const elegida = varias ? (sedes.find((s) => s.ubicacionId === sede) ?? null) : (sedes[0] ?? null);

  return (
    <div className="space-y-6">
      <CabeceraPantalla
        sobretitulo="Gestión"
        titulo="Rendimiento"
        bajada={
          elegida
            ? `Las ventas de cada persona de ${elegida.nombre}, contra su meta. Para reconocer y acompañar — sin comisión ni bono.`
            : varias
              ? "Las ventas de cada tienda, contra su meta. Para reconocer y acompañar — sin comisión ni bono."
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

      {varias && (
        <SegmentoEnlaces
          etiquetaAccesible="Tienda"
          activo={elegida?.ubicacionId ?? "todas"}
          deslizante
          idIndicador="rendimiento-tienda"
          opciones={[
            { valor: "todas", etiqueta: "Todas", href: "/rendimiento" },
            ...sedes.map((s) => ({ valor: s.ubicacionId, etiqueta: s.nombre, href: `/rendimiento?sede=${s.ubicacionId}` })),
          ]}
        />
      )}

      {varias && !elegida && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sedes.map((s) => (
            <TarjetaDeTienda key={s.ubicacionId} sede={s} hoy={hoy} />
          ))}
        </div>
      )}

      {elegida && (
        <>
          {elegida.panelDisponible ? (
            <PanelRendimiento
              key={elegida.ubicacionId}
              ubicacionId={elegida.ubicacionId}
              nombre={elegida.nombre}
              hoy={hoy}
              serie={elegida.serie}
              personas={elegida.personas}
              historial={elegida.historial}
              vistaInicial={vistaDeUrl(vista)}
              personaCuentaId={persona.personaId}
              esAdmin={persona.esAdmin}
            />
          ) : (
            <p className="nota-cayla">
              No se pudieron leer las metas de cada persona ahora. Lo demás de esta pantalla —los rankings del mes— sí está al día.
            </p>
          )}
          <Rankings sede={elegida} />
        </>
      )}
    </div>
  );
}

/** Una tienda en la vista «Todas»: lo de hoy y lo del mes contra su meta, y un enlace a su panel. */
function TarjetaDeTienda({ sede, hoy }: { sede: SedeDeRendimiento; hoy: string }) {
  const dia = resumenDeSede(sede.serie, "hoy", hoy);
  const mes = resumenDeSede(sede.serie, "mes", hoy);
  const pctMes = avance(mes.soles, mes.meta);
  const vendieron = sede.personas.filter((p) => p.vendidoMes > 0).length;
  return (
    <div className="card-cayla space-y-3 p-5">
      <h2 className="font-display text-xl text-tinta">{sede.nombre}</h2>
      {sede.panelDisponible ? (
        <>
          <div>
            <p className="label-cayla text-[11px] font-bold text-taupe">Soles hoy</p>
            <p className="font-display text-[26px] leading-tight tabular-nums text-tinta">{SOLES.format(dia.soles)}</p>
          </div>
          <div className="text-sm text-taupe">
            <span className="tabular-nums text-tinta">{SOLES.format(mes.soles)}</span> en el mes
            {pctMes !== null && mes.meta !== null ? ` · ${pctMes} % de ${SOLES.format(mes.meta)}` : " · sin meta cargada"}
          </div>
          <p className="text-xs text-taupe">
            {sede.personas.length > 0
              ? `${sede.personas.length} ${sede.personas.length === 1 ? "persona" : "personas"} · ${vendieron} ${vendieron === 1 ? "vendió" : "vendieron"} este mes`
              : "Sin personal cargado en Dynamic"}
          </p>
        </>
      ) : (
        <p className="text-sm text-taupe">No se pudieron leer las metas ahora.</p>
      )}
      <Link href={`/rendimiento?sede=${sede.ubicacionId}`} className="label-cayla inline-block text-[11px] text-tinta underline underline-offset-2 hover:no-underline">
        Ver {sede.nombre} →
      </Link>
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
