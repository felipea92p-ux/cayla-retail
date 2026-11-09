import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Plus, Scale, Store } from "lucide-react";
import { EnlaceVer } from "@/components/ui/EnlaceVer";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { BarraAvance } from "@/components/ui/BarraAvance";
import { getFlujoReal } from "@/lib/flujo-caja";
import { soles } from "@/lib/flujo-caja-reglas";
import { fechaCorta } from "@/lib/gastos-reglas";
import type { Periodo } from "@/lib/estados-periodo";
import { diaDelFeed, diasDelFeed, pasosDelFeed, semanasDelFeed, type MovimientoFeed, type TipoMovimientoFeed } from "@/lib/movimientos-resumen-reglas";

// Finanzas ▸ Resumen, camino «A · Bolsillos»: «Movimientos» (Felipe 2026-11-09). Lo que entró y salió de la plata de CAYLA, día por día, como la lista de
// movimientos de la app del banco; un período largo o un mes cerrado, por semanas. Es un Server Component que la página manda dentro de su `Suspense`:
// pide `fn_flujo_caja_real` (la lectura de Estados financieros ▸ Flujo de efectivo) un día a la vez, a la vez, sin hacer esperar al resto del Resumen.
// La base pide el líder: el flujo es de CAYLA entera. Si una lectura se cae, se dice; nunca un día en cero que parezca un dato.

const ICONO: Record<TipoMovimientoFeed, typeof Plus> = { cobro: ArrowDownLeft, entra: Plus, sale: ArrowUpRight, claure: Store, ajuste: Scale, mueve: ArrowLeftRight };

function Renglon({ m }: { m: MovimientoFeed }) {
  const Icono = ICONO[m.tipo];
  const signo = m.tipo === "cobro" || m.tipo === "entra" ? "+" : m.tipo === "mueve" ? "" : m.tipo === "ajuste" ? (m.monto >= 0 ? "+" : "−") : "−";
  return (
    <li className="movs-renglon" data-tipo={m.tipo}>
      <span className="movs-icono" aria-hidden>
        <Icono className="h-4 w-4" />
      </span>
      <span className="bolsillos-texto">
        <b>{m.titulo}</b>
        {m.detalle && <small>{m.detalle}</small>}
      </span>
      <span className="bolsillos-monto num movs-monto">
        {signo}
        {soles(Math.abs(m.monto))}
      </span>
    </li>
  );
}

const NOTA = "Lo que pasa de una caja al banco y lo que le pagas a CLAURE no es gasto: la plata solo cambia de lugar, o vuelve a su dueña.";

export async function Movimientos({ periodo, hoy, hrefFlujo }: { periodo: Periodo; hoy: string; hrefFlujo: string | null }) {
  const dias = diasDelFeed(periodo);
  const accion = hrefFlujo ? <EnlaceVer href={hrefFlujo}>Flujo de efectivo</EnlaceVer> : undefined;

  if (!dias) {
    const real = await getFlujoReal(periodo.desde, periodo.hasta);
    const semanas = real.datos ? semanasDelFeed(real.datos.semanas) : [];
    const mayor = Math.max(1, ...semanas.map((s) => Math.max(s.entro, s.salio)));
    return (
      <section className="fin-superficie fin-pad movs" data-guia="fin-resumen.movimientos">
        <TituloSeccion accion={accion}>Semana a semana</TituloSeccion>
        {real.falla ? (
          <p className="bolsillos-motivo">No se pudo leer lo que entró y salió. Vuelve a cargar la página en un rato.</p>
        ) : semanas.length === 0 ? (
          <p className="bolsillos-motivo">No entró ni salió plata en estas fechas.</p>
        ) : (
          <ol className="movs-semanas">
            {semanas.map((s) => (
              <li key={s.desde}>
                <span className="bolsillos-texto">
                  <b>
                    Del {fechaCorta(s.desde)} al {fechaCorta(s.hasta)}
                  </b>
                  <small>
                    Entró {soles(s.entro)} · salió {soles(s.salio)}
                  </small>
                  <BarraAvance pct={(s.entro / mayor) * 100} alto="fina" tono="tinta" decorativa />
                </span>
                <span className={`bolsillos-monto num ${s.entro - s.salio < 0 ? "movs-baja" : ""}`}>
                  {s.entro - s.salio >= 0 ? "+" : "−"}
                  {soles(Math.abs(s.entro - s.salio))}
                </span>
              </li>
            ))}
          </ol>
        )}
        <p className="nota-cayla mt-3">{NOTA}</p>
      </section>
    );
  }

  const lecturas = await Promise.all(dias.map((d) => getFlujoReal(d, d)));
  const cayo = lecturas.some((l) => l.falla);
  const feed = dias.map((d, i) => (lecturas[i]!.datos ? diaDelFeed(d, hoy, lecturas[i]!.datos!) : null)).filter((x) => x !== null);
  return (
    <section className="fin-superficie fin-pad movs" data-guia="fin-resumen.movimientos">
      <TituloSeccion accion={accion}>Movimientos</TituloSeccion>
      {cayo && <p className="bolsillos-motivo">Algún día no se pudo leer. Vuelve a cargar la página en un rato.</p>}
      {pasosDelFeed(feed).map((p) =>
        p.tipo === "vacios" ? (
          <p key={p.clave} className="movs-vacio">
            {p.texto}
          </p>
        ) : (
          <div key={p.dia.fecha} className="movs-dia">
            <div className="movs-dia-cab">
              <span>{p.dia.nombre}</span>
              <span className={`num ${p.dia.neto < 0 ? "movs-baja" : ""}`}>
                {p.dia.neto >= 0 ? "+" : "−"}
                {soles(Math.abs(p.dia.neto))}
              </span>
            </div>
            <ul className="movs-lista">
              {p.dia.movimientos.map((m) => (
                <Renglon key={m.clave} m={m} />
              ))}
            </ul>
          </div>
        ),
      )}
      <p className="nota-cayla mt-3">{NOTA}</p>
    </section>
  );
}

/** Lo que se ve mientras llegan los movimientos: el esqueleto de la sección, nunca el loader de pantalla completa (ADR-0149). */
export function MovimientosEsperando() {
  return (
    <section className="fin-superficie fin-pad movs" aria-busy="true" aria-label="Movimientos, cargando">
      <TituloSeccion>Movimientos</TituloSeccion>
      <div className="parecidas-esqueleto mt-3">
        <i />
        <i />
        <i />
        <i />
      </div>
    </section>
  );
}
