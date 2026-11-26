"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Coins } from "lucide-react";
import { soles } from "@/lib/compras-reglas";
import type { EficienciaPeriodo } from "@/lib/eficiencia-reglas";
import { costoDelPeriodo, filasDelGasto, formaDelCosto, mesesDeEficiencia, nombresDePeriodos, paresDelPeriodo, textoDeLaPlanilla, type NombreDePeriodo } from "@/lib/eficiencia-textos";
import type { EstadoPlanilla } from "@/lib/eficiencia";
import { Ayuda } from "@/components/Ayuda";
import { Aviso } from "@/components/ui/Aviso";
import { BarraAvance } from "@/components/ui/BarraAvance";
import { BarrasTiempo } from "@/components/ui/BarrasTiempo";
import { Chip } from "@/components/ui/Chip";
import { CifraQueCuenta } from "@/components/ui/CifraQueCuenta";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { ParDato, Pares } from "@/components/ui/ParDato";
import { Pestanas } from "@/components/ui/Pestanas";
import { TituloGrupo, TituloSeccion } from "@/components/ui/TituloSeccion";
import { Vacio } from "@/components/ui/Vacio";

// Eficiencia del Taller (ADR-0133, F7; D-31 y D-33). La pantalla responde UNA pregunta: cuánto cuesta hacer una prenda (2026-11-26, «Producción más clara»).
//   · El bloque principal lo dice en grande, lo compara en soles con el período anterior y muestra de qué se forma (materiales; mano de obra y gastos).
//   · «En qué se fue la plata»: cada parte del gasto en su fila, con su barra a escala de la mayor.
//   · «Mes a mes»: una barra por período; tocarla lo elige.
// Lo que explica (qué incluye la planilla, que las segundas no se cuentan, qué es «a tiempo») va detrás del «?» de su bloque. Sin planilla visible NO se inventa
// el costo: se muestran los materiales por prenda y se dice qué falta. Las cuentas son de `lib/eficiencia-reglas.ts`; las palabras, de `lib/eficiencia-textos.ts`.

export function EficienciaTallerPanel({
  periodos,
  estadoPlanilla,
  hayGastos,
  sede,
}: {
  periodos: EficienciaPeriodo[];
  estadoPlanilla: EstadoPlanilla;
  hayGastos: boolean;
  /** La sede de la línea de arriba de la cabecera (el Taller). */
  sede: string;
}) {
  const [clave, setClave] = useState(periodos[0]?.ventana.clave ?? "");
  const i = Math.max(0, periodos.findIndex((p) => p.ventana.clave === clave));
  const actual = periodos[i];
  const anterior = periodos[i + 1] ?? null;
  const nombres = useMemo(() => nombresDePeriodos(periodos.map((p) => p.ventana)), [periodos]);
  const meses = useMemo(() => mesesDeEficiencia(periodos, nombres), [periodos, nombres]);
  const nombre = actual ? nombres.get(actual.ventana.clave) : undefined;

  return (
    <div className="@container space-y-6">
      {/* La cabecera de todo el ERP menos Finanzas (ADR-0358, Felipe 2026-10-14). Eficiencia es una pestaña del Resumen, no una fila
          del menú: su título es el nombre de la pestaña. Lo que antes era la nota del pie va en su «?». */}
      <EncabezadoPagina
        sede={sede}
        titulo="Eficiencia"
        subtitulo="Cuánto cuesta de verdad cada prenda del Taller: materiales más planilla y gastos, repartidos entre las prendas buenas."
        guiaAyuda="prod-eficiencia.nota"
        ayuda={
          <>
            Las prendas segundas no se cuentan: el costo de lo que salió mal lo pagan las buenas. Para ver cuánto rinde la tela de cada modelo, mira{" "}
            <Link href="/produccion" className="btn-enlace">
              el Resumen
            </Link>{" "}
            y el análisis de insumos al abrir una orden.
          </>
        }
      />

      {/* «Hoy | Eficiencia»: las dos miradas del líder sobre el Taller (ADR-0133, F6 y F7), con la pestaña de vista del sistema
          (ADR-0358). Eficiencia NO es una fila del lateral (el menú de Producción está en su tope de hijas): se llega desde aquí. */}
      <Pestanas
        etiquetaAccesible="Miradas del Taller"
        idIndicador="produccion-miradas"
        guia="produccion.miradas"
        activa="eficiencia"
        items={[
          { clave: "hoy", etiqueta: "Hoy", href: "/produccion", ayuda: "Qué necesita mi decisión" },
          { clave: "eficiencia", etiqueta: "Eficiencia", href: "/produccion/eficiencia", ayuda: "Cuánto cuesta cada prenda" },
        ]}
      />

      {estadoPlanilla === "sin_vista" && (
        <Aviso tono="info" titulo="Todavía no se puede leer la planilla" guia="prod-eficiencia.aviso-planilla">
          Mientras tanto se ven los materiales por prenda.
        </Aviso>
      )}
      {estadoPlanilla === "vacia" && (
        <Aviso tono="info" titulo="No hay planilla del Taller para mostrar" guia="prod-eficiencia.aviso-planilla">
          Sin ella solo se ven los materiales por prenda.
        </Aviso>
      )}

      {periodos.length > 1 && (
        // El período es un filtro de un valor: la píldora del sistema (ADR-0358). `suppressHydrationWarning`: `FilasQueSeDeslizan`
        // (app/layout.tsx) le pone `data-mas-izq`/`data-mas-der` desde afuera de React (como en `<Pestanas>`).
        <div data-guia="prod-eficiencia.periodos" role="group" aria-label="Período" className="pildoras-desliza gap-2 sm:flex-wrap" suppressHydrationWarning>
          {periodos.map((p, n) => (
            <button key={p.ventana.clave} type="button" data-guia={n === 0 ? "prod-eficiencia.periodo-actual" : n === 1 ? "prod-eficiencia.periodo-otro" : undefined} aria-pressed={clave === p.ventana.clave} onClick={() => setClave(p.ventana.clave)} className="pildora-cayla shrink-0">
              {nombres.get(p.ventana.clave)?.pildora ?? p.ventana.etiqueta}
            </button>
          ))}
        </div>
      )}

      {actual && nombre && (
        <>
          <BloquePrincipal actual={actual} anterior={anterior} nombre={nombre} nombreAnterior={anterior ? (nombres.get(anterior.ventana.clave) ?? null) : null} estadoPlanilla={estadoPlanilla} />

          <div className="grid items-start gap-x-7 gap-y-6 @min-[56rem]:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
            <EnQueSeFue actual={actual} hayGastos={hayGastos} />

            {periodos.length > 1 && (
              <section data-guia="prod-eficiencia.tendencia" aria-label={meses.titulo} className="space-y-3">
                <TituloSeccion ayuda="Cada barra es un período, del más viejo al más reciente. Toca una para ver su detalle arriba. Un período sin barra no tiene el dato: no se cerró ninguna orden o falta su planilla.">
                  {meses.titulo}
                </TituloSeccion>
                <div className="card-cayla px-4 pb-4 pt-5 @min-[40rem]:px-6">
                  <BarrasTiempo
                    etiqueta={meses.titulo}
                    alto={190}
                    cifras="todas"
                    destacada={actual.ventana.clave}
                    respuesta={{ onElegir: setClave }}
                    barras={meses.barras.map((b) => ({ clave: b.clave, valor: b.valor, etiqueta: b.etiqueta, cifra: b.cifra, aria: b.aria, tip: b.aria }))}
                  />
                </div>
              </section>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/** El bloque principal: lo que costó hacer una prenda, contra el período anterior, y de qué se forma. */
function BloquePrincipal({
  actual,
  anterior,
  nombre,
  nombreAnterior,
  estadoPlanilla,
}: {
  actual: EficienciaPeriodo;
  anterior: EficienciaPeriodo | null;
  nombre: NombreDePeriodo;
  nombreAnterior: NombreDePeriodo | null;
  estadoPlanilla: EstadoPlanilla;
}) {
  const costo = costoDelPeriodo(actual, anterior, nombre, nombreAnterior);
  const forma = formaDelCosto(actual);
  const pares = paresDelPeriodo(actual);
  return (
    <section data-guia="prod-eficiencia.cifras" aria-label="Cuánto costó hacer una prenda" className="card-cayla anim-entra grid items-center gap-x-12 gap-y-7 p-5 @min-[40rem]:p-8 @min-[56rem]:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
      <div className="min-w-0">
        <p className="text-sm text-secundario">
          {costo.rotulo}
          <Ayuda titulo="Cómo se calcula">
            <span className="block">{nombre.fechas}: es el período de la planilla.</span>
            <span className="mt-2 block">Materiales: la tela, los avíos y los servicios de afuera de las órdenes que pasaron al stock.</span>
            <span className="mt-2 block">Mano de obra y gastos: la planilla del Taller y sus gastos del período, repartidos entre las prendas buenas. Una segunda o una faltante sube el costo de las demás.</span>
            <span className="mt-2 block">Una entrega es a tiempo si la orden se cerró en su fecha de entrega o antes.</span>
            {estadoPlanilla === "vacia" && <span className="mt-2 block">No hay planilla para mostrar: todavía no hay períodos pagados, o tu cuenta no la puede ver (la ve quien administra al personal).</span>}
          </Ayuda>
        </p>
        {costo.valor !== null && (
          <p className="mt-1 whitespace-nowrap font-serif text-[3.375rem] font-medium leading-[1.05] tabular-nums text-tinta @min-[40rem]:text-[4.5rem]">
            <CifraQueCuenta valor={costo.valor} formato="soles" alMontar />
          </p>
        )}
        {costo.insignia && (
          <Chip tono={costo.insignia.tono} className="mt-3">
            {costo.insignia.texto}
          </Chip>
        )}
        {costo.falta && <p className="mt-3 text-detalle text-secundario">{costo.falta}</p>}
      </div>

      {(forma.length > 0 || pares.length > 0) && (
        // Su propio contenedor: las filas pasan a «nombre, barra, monto» cuando ESTA columna tiene ancho, no cuando lo tiene la pantalla.
        <div className="@container min-w-0">
          {forma.length > 0 && (
            <>
              <TituloGrupo>De qué se forma</TituloGrupo>
              <div className="mt-3 space-y-3.5">
                {forma.map((parte, n) => (
                  <div key={parte.clave} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3.5 gap-y-1.5 text-sm text-tinta @min-[30rem]:grid-cols-[13rem_minmax(0,1fr)_6.5rem]">
                    <span>{parte.etiqueta}</span>
                    <BarraAvance pct={parte.pct} tono="tinta" alto="gruesa" indice={n} decorativa className="order-3 col-span-2 @min-[30rem]:order-none @min-[30rem]:col-span-1" />
                    <b className="whitespace-nowrap text-right font-semibold tabular-nums">{soles(parte.monto)}</b>
                  </div>
                ))}
              </div>
            </>
          )}
          {pares.length > 0 && (
            <Pares className={forma.length > 0 ? "mt-5 border-t border-sand pt-5" : ""}>
              {pares.map((par) => (
                <ParDato key={par.clave} rotulo={par.rotulo} tono={par.tono} grande>
                  <span data-guia={par.clave === "entregas" ? "prod-eficiencia.entregas" : undefined}>{par.valor}</span>
                </ParDato>
              ))}
            </Pares>
          )}
        </div>
      )}
    </section>
  );
}

/** «En qué se fue la plata»: el total a la derecha del título y cada parte del gasto en su fila, con su barra a escala de la mayor. */
function EnQueSeFue({ actual, hayGastos }: { actual: EficienciaPeriodo; hayGastos: boolean }) {
  const filas = filasDelGasto(actual);
  return (
    <section data-guia="prod-eficiencia.reparto" aria-label="En qué se fue la plata" className="space-y-3">
      <TituloSeccion
        dato={
          filas.length > 0 ? (
            <>
              Total <b>{soles(actual.gastadoTotal)}</b>
            </>
          ) : undefined
        }
        ayuda={
          <>
            <span className="block">Lo que gastó el Taller en el período: la planilla, los gastos generales, y la tela, los avíos y los servicios de afuera de las órdenes que pasaron al stock.</span>
            {actual.planilla !== null && <span className="mt-2 block">{textoDeLaPlanilla(actual.ventana.planilla?.personas ?? 0)}</span>}
            {!hayGastos && <span className="mt-2 block">El alquiler y los servicios del Taller aparecerán aquí cuando se registren como gastos del Taller en Finanzas.</span>}
          </>
        }
      >
        En qué se fue la plata
      </TituloSeccion>
      <div className="card-cayla @container">
        {filas.length === 0 ? (
          <Vacio tamano="chico" icono={<Coins />} className="py-5">
            No hay gasto del Taller en este período.
          </Vacio>
        ) : (
          <ul className="divide-y divide-sand px-4 @min-[30rem]:px-6">
            {filas.map((f, n) => (
              <li key={f.clave} className="py-3.5">
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3.5 gap-y-1.5 text-sm text-tinta @min-[30rem]:grid-cols-[12rem_minmax(0,1fr)_7rem_3.5rem]">
                  <span>{f.etiqueta}</span>
                  <BarraAvance pct={f.pct} tono="tinta" indice={n} decorativa className="order-3 col-span-2 @min-[30rem]:order-none @min-[30rem]:col-span-1" />
                  <b className="whitespace-nowrap text-right font-semibold tabular-nums">{soles(f.monto)}</b>
                  <span className="hidden whitespace-nowrap text-right text-detalle tabular-nums text-secundario @min-[30rem]:block">{f.porcentaje}</span>
                </div>
                {f.detalle.length > 0 && (
                  <Pares className="mt-2.5">
                    {f.detalle.map((g) => (
                      <ParDato key={g.categoria} rotulo={g.categoria}>
                        {soles(g.total)}
                      </ParDato>
                    ))}
                  </Pares>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
