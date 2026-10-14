import { Receipt, ChartColumn } from "lucide-react";
import { Ayuda } from "@/components/Ayuda";
import { Encabezado, Tabla, celda, fila } from "@/components/ui/Tabla";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { Vacio } from "@/components/ui/Vacio";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { VentasPorHoraChart } from "@/components/CajaGraficos";
import { soles } from "@/lib/compras-reglas";
import type { ColaboradoraComercial, PanelComercial, SedeComercial } from "@/lib/comercial";
import {
  avanceDeHoy,
  consolidar,
  descuentoPct,
  horaPico,
  serieHoras,
  textoEstado,
  ticketPromedio,
  unidadesPorTicket,
  type RitmoMes,
} from "@/lib/comercial-reglas";

// Vista del panel comercial (ADR-0110). Solo PINTA: cada número ya viene sumado por el SQL y cada criterio
// ("bajo su ritmo", la proyección) ya viene decidido por `comercial-reglas.ts`. Nada de aritmética de
// negocio acá — si un número se ve raro, se corrige en una sola casa, no en la pantalla.
//
// Patrón "small multiples" (ADR de Egresos, Ronda 2): UNA tarjeta por tienda, siempre todas visibles,
// nunca un selector que esconda que una tienda va distinto a otra. Excepciones primero: la tienda más
// atrasada arriba. El rojo aparece solo en una tienda bajo su ritmo, y cada estado lleva TEXTO además de
// color — un colaborador que no distingue el rojo lee "Bajo su ritmo" igual.

const pct = (n: number) => `${Math.round(n * 100)}%`;
const num1 = (n: number) => n.toLocaleString("es-PE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function etiquetaHora(h: number): string {
  if (h === 0) return "12 am";
  if (h === 12) return "12 pm";
  return h < 12 ? `${h} am` : `${h - 12} pm`;
}

/** "Al 92% de su meta al cierre de ayer" — la frase que acompaña al estado. Vacía si no hay ritmo. */
function detalleRitmo(r: RitmoMes): string {
  if (r.ritmo === null) return "";
  return `al ${pct(r.ritmo)} de lo que prometía su meta, contando hasta el cierre de ayer`;
}

export function PanelComercialVista({ panel }: { panel: PanelComercial }) {
  if (panel.sedes.length === 0) {
    return (
      <div className="card-cayla p-6 text-sm text-tinta/75">
        No hay tiendas activas para mostrar. El panel comercial mide tiendas; el Taller y los almacenes no venden.
      </div>
    );
  }

  const total = consolidar(panel.sedes, panel.fecha);
  const ticketMes = ticketPromedio(total.ventasMes, total.ticketsMes);
  const upt = unidadesPorTicket(total.unidadesMes, total.ticketsMes);

  return (
    <div className="space-y-8">
      {/* ---------- Todo CAYLA ---------- */}
      <section aria-labelledby="titulo-total" className="space-y-3" data-guia="comercial.total">
        <TituloSeccion id="titulo-total">Todas las tiendas</TituloSeccion>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <TarjetaCifra
            etiqueta="Ventas de hoy"
            ayuda={
              <Ayuda titulo="Qué cuenta como venta">
                Lo que cobró el mostrador, con IGV incluido, igual que el cierre de caja. No cuenta lo anulado. Las
                devoluciones aprobadas se muestran aparte, con la fecha en que se aprobaron, y no se restan solas.
              </Ayuda>
            }
            valor={soles(total.ventasHoy)}
            pie={
              <>
                {total.ticketsHoy} {total.ticketsHoy === 1 ? "ticket" : "tickets"} · {total.unidadesHoy}{" "}
                {total.unidadesHoy === 1 ? "unidad" : "unidades"}
                {total.devueltoHoy > 0 && <span className="block">Devuelto hoy: {soles(total.devueltoHoy)}</span>}
              </>
            }
          />
          <TarjetaCifra
            etiqueta="Ventas de la semana"
            valor={soles(total.ventasSemana)}
            pie={
              <>
                {total.ticketsSemana} {total.ticketsSemana === 1 ? "ticket" : "tickets"} · de lunes a hoy
                {total.devueltoSemana > 0 && <span className="block">Devuelto: {soles(total.devueltoSemana)}</span>}
              </>
            }
          />
          <TarjetaCifra
            etiqueta="Ventas del mes"
            ayuda={
              <Ayuda titulo="Ritmo del mes">
                Compara lo vendido en los días ya cerrados del mes contra lo que prometían las metas diarias. No usa lo de
                hoy: a las 11 am toda tienda va &quot;atrasada&quot; y una alarma que salta siempre deja de mirarse. La
                proyección es lineal (promedio diario de los días cerrados × días del mes): una brújula, no una
                predicción.
              </Ayuda>
            }
            valor={soles(total.ventasMes)}
            tono={total.ritmo.estado === "bajo" ? "text-rojo" : undefined}
            pie={
              <>
                {total.ticketsMes} {total.ticketsMes === 1 ? "ticket" : "tickets"}
                {total.ritmo.proyeccion !== null && <span className="block">Proyección al cierre: {soles(total.ritmo.proyeccion)}</span>}
                {total.devueltoMes > 0 && <span className="block">Devuelto en el mes: {soles(total.devueltoMes)}</span>}
              </>
            }
          >
            {total.ritmo.estado === "sin_meta" && total.ritmo.proyeccion === null
              ? "Ninguna tienda tiene meta diaria configurada."
              : total.ritmo.ritmo !== null
                ? `${textoEstado(total.ritmo.estado)}: ${detalleRitmo(total.ritmo)}${
                    total.tiendasConMeta < total.tiendas ? ` (${total.tiendasConMeta} de ${total.tiendas} tiendas con meta)` : ""
                  }.`
                : textoEstado(total.ritmo.estado) + "."}
          </TarjetaCifra>
          {/* Sin ventas en el mes no hay ticket: «sin dato», y la línea de abajo pasa a ser su motivo. */}
          <TarjetaCifra
            etiqueta="Ticket promedio del mes"
            valor={ticketMes === null ? null : soles(ticketMes)}
            pie={ticketMes === null ? undefined : upt === null ? "Aún no hay ventas este mes." : `${num1(upt)} unidades por ticket`}
          >
            {ticketMes === null ? (upt === null ? "Aún no hay ventas este mes." : `${num1(upt)} unidades por ticket`) : undefined}
          </TarjetaCifra>
        </div>
      </section>

      {/* ---------- Una tarjeta por tienda ---------- */}
      <section aria-labelledby="titulo-tiendas" className="space-y-3" data-guia="comercial.tiendas">
        <div>
          <TituloSeccion id="titulo-tiendas">Por tienda</TituloSeccion>
          <p className="mt-1 text-xs text-tinta/60">La tienda que más necesita atención, primero.</p>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {panel.sedes.map((s) => (
            <TarjetaSede key={s.ubicacionId} sede={s} />
          ))}
        </div>
      </section>

      {/* ---------- Ventas por hora, una por tienda ---------- */}
      <section aria-labelledby="titulo-horas" className="space-y-3" data-guia="comercial.horas">
        <div>
          <TituloSeccion id="titulo-horas">Ventas por hora, hoy</TituloSeccion>
          <p className="mt-1 text-xs text-tinta/60">Hora de Lima. Desde la primera venta del día hasta la hora actual.</p>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {panel.sedes.map((s) => {
            const delaSede = panel.horas.filter((h) => h.ubicacionId === s.ubicacionId);
            const serie = serieHoras(delaSede, panel.horaActual);
            const pico = horaPico(delaSede);
            return (
              <div key={s.ubicacionId} className="space-y-1.5">
                <p className="text-sm font-semibold text-tinta">
                  {s.nombre}
                  {pico !== null && <span className="ml-2 text-xs font-normal text-tinta/60">Hora fuerte: {etiquetaHora(pico)}</span>}
                </p>
                {serie.length === 0 ? (
                  <div className="card-cayla">
                    <Vacio tamano="chico" alinear="izquierda" className="px-5 py-4" icono={<ChartColumn />}>
                      Aún no hay ventas hoy en {s.nombre}.
                    </Vacio>
                  </div>
                ) : (
                  <VentasPorHoraChart datos={serie} horaActual={panel.horaActual} />
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* ---------- Colaboradoras ---------- */}
      <section aria-labelledby="titulo-colab" className="space-y-3" data-guia="comercial.colaboradoras">
        <div>
          <TituloSeccion id="titulo-colab">Ventas por colaboradora, este mes</TituloSeccion>
          <p className="mt-1 max-w-2xl text-xs text-tinta/60">
            El descuento va al lado a propósito: vender más regalando precio no es vender mejor. Es una foto de un mes, no
            una evaluación: una colaboradora que cubre menos turnos vende menos sin hacerlo peor.
          </p>
        </div>
        <div className="grid gap-3">
          {panel.sedes.map((s) => (
            <TablaColaboradoras
              key={s.ubicacionId}
              sede={s}
              filas={panel.colaboradoras.filter((c) => c.ubicacionId === s.ubicacionId)}
            />
          ))}
        </div>
      </section>

      <details className="card-cayla p-4 text-xs text-tinta/75" data-guia="comercial.como-se-calcula">
        <summary className="cursor-pointer font-semibold text-tinta" data-guia="comercial.como-abrir">Cómo se calcula todo esto</summary>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 leading-relaxed">
          <li>
            <strong>Venta:</strong> lo cobrado en el mostrador con IGV incluido, sin las ventas anuladas. La diferencia de un
            cambio no cuenta como venta nueva.
          </li>
          <li>
            <strong>Devuelto:</strong> devoluciones aprobadas, con la fecha en que se aprobaron (igual que la caja: la plata sale
            el día que se devuelve). Se muestra aparte; no se resta solo.
          </li>
          <li>
            <strong>Período:</strong> hoy, la semana de lunes a hoy y el mes calendario a hoy, todo en hora de Lima. Una venta a
            las 7:30 pm de Lima cuenta como de hoy aunque en UTC ya sea mañana.
          </li>
          <li>
            <strong>Ritmo y meta:</strong> la meta es una cifra por día por tienda. El semáforo mira los días cerrados del mes,
            no lo de hoy. Es &quot;bajo su ritmo&quot; por debajo del 85% de lo prometido y &quot;sobre su ritmo&quot; desde el
            100%; esos umbrales son provisionales.
          </li>
          <li>
            <strong>Solo tiendas:</strong> el Taller y los almacenes no aparecen porque no venden al público.
          </li>
        </ul>
      </details>
    </div>
  );
}

function TarjetaSede({ sede }: { sede: SedeComercial }) {
  const tk = ticketPromedio(sede.ventasMes, sede.ticketsMes);
  const upt = unidadesPorTicket(sede.unidadesMes, sede.ticketsMes);
  const avance = avanceDeHoy(sede.ventasHoy, sede.metaVentaDiaria);
  const bajo = sede.ritmo.estado === "bajo";
  const alerta =
    sede.ritmo.ritmo !== null
      ? `${textoEstado(sede.ritmo.estado)}: ${detalleRitmo(sede.ritmo)}.`
      : `${textoEstado(sede.ritmo.estado)}.`;

  return (
    <TarjetaCifra
      etiqueta={`${sede.nombre} · hoy`}
      valor={soles(sede.ventasHoy)}
      tono={bajo ? "text-rojo" : undefined}
      pie={
        <dl className="mt-1 space-y-0.5 tabular-nums">
          <Fila k="Tickets de hoy" v={`${sede.ticketsHoy} · ${sede.unidadesHoy} u.`} />
          {avance !== null && sede.metaVentaDiaria !== null && (
            <Fila k="Meta del día" v={`${soles(sede.metaVentaDiaria)} · va al ${pct(avance)}`} />
          )}
          <Fila k="Semana" v={`${soles(sede.ventasSemana)} · ${sede.ticketsSemana} tickets`} />
          <Fila k="Mes" v={`${soles(sede.ventasMes)} · ${sede.ticketsMes} tickets`} />
          {sede.ritmo.proyeccion !== null && <Fila k="Proyección al cierre" v={soles(sede.ritmo.proyeccion)} />}
          <Fila k="Ticket promedio (mes)" v={tk === null ? "—" : `${soles(tk)} · ${upt === null ? "—" : num1(upt)} u.`} />
          {sede.devueltoMes > 0 && <Fila k="Devuelto en el mes" v={soles(sede.devueltoMes)} />}
        </dl>
      }
    >
      {alerta}
    </TarjetaCifra>
  );
}

function Fila({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-tinta/60">{k}</dt>
      <dd className="text-right text-tinta/85">{v}</dd>
    </div>
  );
}

const PLANTILLA_COLABORADORAS = "grid-cols-[minmax(8rem,1.6fr)_5.5rem_6rem_4rem_6rem_5.5rem]";

function TablaColaboradoras({ sede, filas }: { sede: SedeComercial; filas: ColaboradoraComercial[] }) {
  return (
    // La tabla del sistema (ADR-0358, ronda 7): el nombre de la tienda arriba, en su tarjeta.
    <Tabla>
      <p className="px-5 pt-4 pb-3 text-sm font-semibold text-tinta">{sede.nombre}</p>
      {filas.length === 0 ? (
        <Vacio tamano="chico" icono={<Receipt />}>
          Sin ventas este mes.
        </Vacio>
      ) : (
        <div role="table" aria-label={`Ventas por colaboradora en ${sede.nombre}, este mes`} className="min-w-[26rem] divide-y divide-sand text-xs tabular-nums">
          <Encabezado
            siempre
            plantilla={PLANTILLA_COLABORADORAS}
            columnas={[
              { titulo: "Colaboradora" },
              { titulo: "Hoy", alinear: "der" },
              { titulo: "Mes", alinear: "der" },
              { titulo: "Tickets", alinear: "der" },
              { titulo: "Ticket prom.", alinear: "der" },
              { titulo: "Descuento", alinear: "der" },
            ]}
          />
          {filas.map((c) => {
            const tk = ticketPromedio(c.ventasMes, c.ticketsMes);
            const d = descuentoPct(c.brutoMes, c.descuentoMes);
            return (
              <div key={c.personaId ?? "sin-colaboradora"} role="row" className={fila(PLANTILLA_COLABORADORAS)}>
                <span role="rowheader" className={celda("izq", c.personaId === null ? "italic text-tinta/60" : "text-tinta")}>
                  {c.nombre}
                </span>
                <span role="cell" className={celda("der", "text-right text-tinta/85")}>{c.ventasHoy > 0 ? soles(c.ventasHoy) : "—"}</span>
                <span role="cell" className={celda("der", "text-right text-tinta")}>{soles(c.ventasMes)}</span>
                <span role="cell" className={celda("der", "text-right text-tinta/85")}>{c.ticketsMes}</span>
                <span role="cell" className={celda("der", "text-right text-tinta/85")}>{tk === null ? "—" : soles(tk)}</span>
                <span role="cell" className={celda("der", "text-right text-tinta/85")}>{d === null ? "—" : pct(d)}</span>
              </div>
            );
          })}
        </div>
      )}
    </Tabla>
  );
}
