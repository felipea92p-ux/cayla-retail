import { createElement } from "react";
import { Armchair, ArrowLeftRight, ArrowUpRight, CreditCard, HandCoins, Landmark, Package, Receipt, Scale, ShoppingBag, Store, Users, Wallet, type LucideIcon } from "lucide-react";
import { EnlaceVer } from "@/components/ui/EnlaceVer";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { BarraAvance } from "@/components/ui/BarraAvance";
import { getFlujoReal, getFlujoRealDias } from "@/lib/flujo-caja";
import { soles } from "@/lib/flujo-caja-reglas";
import { fechaCorta } from "@/lib/gastos-reglas";
import type { Periodo } from "@/lib/estados-periodo";
import { diaDelFeed, diasDelFeed, pasosDelFeed, semanasDelFeed, type MovimientoFeed, type TipoMovimientoFeed } from "@/lib/movimientos-resumen-reglas";

// Finanzas ▸ Resumen, camino «A · Bolsillos»: «Movimientos» (Felipe 2026-11-09). Lo que entró y salió de la plata de CAYLA, día por día, como la lista de
// movimientos de la app del banco; un período largo o un mes cerrado, por semanas. Es un Server Component que la página manda dentro de su `Suspense`:
// pide `fn_flujo_caja_real` (la lectura de Estados financieros ▸ Flujo de efectivo) día por día, en UNA lectura (`fn_flujo_caja_real_dias`), sin hacer esperar al resto del Resumen.
// La base pide el líder: el flujo es de CAYLA entera. Si una lectura se cae, se dice; nunca un día en cero que parezca un dato.

/** El ícono de cada movimiento, por su categoría (como en la maqueta): la bolsa para lo cobrado, el recibo para un gasto, las personas para la planilla. */
const ICONO_CATEGORIA: Record<string, LucideIcon> = {
  mercaderia: Package,
  gastos: Receipt,
  planilla: Users,
  impuestos: Landmark,
  comision_pos: CreditCard,
  pago_tarjeta: CreditCard,
  activos: Armchair,
  dueno_saca: Wallet,
  dueno_pone: HandCoins,
  otros_ingresos: HandCoins,
  pago_claure: Store,
  entre_cuentas: ArrowLeftRight,
};
const ICONO_TIPO: Record<TipoMovimientoFeed, LucideIcon> = { cobro: ShoppingBag, entra: HandCoins, sale: ArrowUpRight, claure: Store, ajuste: Scale, mueve: ArrowLeftRight };
const iconoDe = (m: MovimientoFeed): LucideIcon => (m.tipo === "cobro" ? ShoppingBag : (ICONO_CATEGORIA[m.clave.split("|")[1] ?? ""] ?? ICONO_TIPO[m.tipo]));

function Renglon({ m }: { m: MovimientoFeed }) {
  const signo = m.tipo === "cobro" || m.tipo === "entra" ? "+" : m.tipo === "mueve" ? "" : m.tipo === "ajuste" ? (m.monto >= 0 ? "+" : "−") : "−";
  return (
    <li className="movs-renglon" data-tipo={m.tipo}>
      <span className="movs-icono" aria-hidden>
        {createElement(iconoDe(m), { className: "h-4 w-4" })}
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

  // Los días del feed en UNA lectura (ADR-0661 act. 2026-11-14): los saldos se piden una vez por fecha, no tres veces por día.
  const porDia = await getFlujoRealDias(dias);
  const lecturas = dias.map((d) => porDia.get(d) ?? { datos: null, falla: "La base no mandó ese día." });
  const cayo = lecturas.some((l) => l.falla);
  const feed = dias.map((d, i) => (lecturas[i]!.datos ? diaDelFeed(d, hoy, lecturas[i]!.datos!) : null)).filter((x) => x !== null);
  return (
    <section className="fin-superficie fin-pad movs" data-guia="fin-resumen.movimientos">
      <TituloSeccion accion={accion}>Movimientos</TituloSeccion>
      {cayo && <p className="bolsillos-motivo">Algún día no se pudo leer. Vuelve a cargar la página en un rato.</p>}
      <div className="movs-cuerpo">
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
      </div>
      <p className="nota-cayla mt-3">{NOTA}</p>
    </section>
  );
}

/** Lo que se ve mientras llegan los movimientos: el esqueleto de la sección, nunca el loader de pantalla completa (ADR-0149). */
export function MovimientosEsperando({ alto }: { alto?: number }) {
  // `alto`: lo que la sección suele medir (Resumen por bloques, ADR-0661), para que al llegar no empuje lo de abajo.
  return (
    <section className="fin-superficie fin-pad movs" aria-busy="true" aria-label="Movimientos, cargando" style={alto ? { minHeight: alto } : undefined}>
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
