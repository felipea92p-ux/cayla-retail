import Link from "next/link";
import { redirect } from "next/navigation";
import { requirePersonaActual } from "@/lib/persona";
import { getEstadosContables } from "@/lib/contabilidad";
import { mesActualLima } from "@/lib/finanzas-nucleo";
import { FinanzasNav } from "@/components/FinanzasNav";
import { Ayuda } from "@/components/Ayuda";

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

const ETIQUETA_GASTO: Record<string, string> = {
  alquiler: "Alquiler", servicios: "Servicios", planilla: "Planilla / honorarios",
  marketing: "Marketing", mantenimiento: "Mantenimiento", suministros: "Suministros", otro: "Otro",
};

function money(n: number) {
  const s = Math.abs(n).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (n < 0 ? "−S/" : "S/") + s;
}

// Los 4 estados financieros de CAYLA (Fase C1) — calculados sobre los sub-libros
// existentes, sin tocar money paths. Ver docs/MANUAL-CONTABLE-CAYLA.md.
export default async function BalancesPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const persona = await requirePersonaActual();
  if (persona.rol !== "lider") redirect("/");

  const { m } = await searchParams;
  const actual = mesActualLima();
  const [anio, mes] = m && /^\d{4}-\d{1,2}$/.test(m) ? m.split("-").map(Number) : [actual.anio, actual.mes];

  const e = await getEstadosContables(persona, anio, mes);
  if (!e) redirect("/");

  const mesPrevio = mes === 1 ? `${anio - 1}-12` : `${anio}-${mes - 1}`;
  const mesSiguiente = mes === 12 ? `${anio + 1}-1` : `${anio}-${mes + 1}`;
  const esMesActual = anio === actual.anio && mes === actual.mes;

  const H2 = "font-display text-lg text-tinta";
  const fila = "flex items-center justify-between px-4 py-2 text-sm";
  const filaTotal = "flex items-center justify-between border-t border-tinta/15 px-4 py-2.5 text-sm font-medium";

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="label-cayla text-[10px] text-tinta/45">Finanzas · Estados financieros</p>
          <h1 className="font-display mt-1 text-2xl text-tinta">{MESES[mes - 1]} {anio}</h1>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/finanzas/balances?m=${mesPrevio}`} className="label-cayla border border-tinta/20 px-3 py-2 text-[10px] text-tinta/60 transition-colors hover:border-rojo hover:text-rojo">
            ← {MESES[(mes + 10) % 12]}
          </Link>
          {!esMesActual && (
            <Link href={`/finanzas/balances?m=${mesSiguiente}`} className="label-cayla border border-tinta/20 px-3 py-2 text-[10px] text-tinta/60 transition-colors hover:border-rojo hover:text-rojo">
              {MESES[mes % 12]} →
            </Link>
          )}
        </div>
      </div>

      <FinanzasNav />

      {/* ==================== 1 · ESTADO DE RESULTADOS ==================== */}
      <section>
        <h2 className={H2}>
          Estado de Resultados
          <Ayuda titulo="Estado de Resultados">
            Responde una pregunta: ¿este mes el negocio ganó o perdió? Empieza por lo que vendiste
            y le va restando lo que costó vender. El resultado final es la utilidad.
          </Ayuda>
        </h2>
        <p className="mb-3 text-xs text-tinta/45">Lo que ganó o perdió el negocio en {MESES[mes - 1]}.</p>
        <div className="card-cayla">
          <div className={fila}>
            <span className="text-tinta/60">Ventas netas
              <Ayuda titulo="Ventas netas">
                El precio de tus ventas SIN el IGV. De una blusa de S/89.90, S/76.19 es tu venta y
                S/13.71 es IGV que solo cobras para SUNAT — no es tuyo.
              </Ayuda>
            </span>
            <span className="text-tinta">{money(e.eerr.ventasNetas)}</span>
          </div>
          <div className={fila}>
            <span className="text-tinta/45">(−) Costo de ventas
              <Ayuda titulo="Costo de ventas">
                Cuánto te costó (a precio de compra o de producción) exactamente lo que vendiste este
                mes. No lo que compraste: solo lo que salió por la puerta vendido.
              </Ayuda>
            </span>
            <span className="text-tinta/60">{money(-e.eerr.costoVentas)}</span>
          </div>
          <div className={fila}>
            <span className="text-tinta/45">(−) Fletes de compra
              <Ayuda titulo="Fletes de compra">
                Lo que pagas por traer los fardos. Va aquí, junto al costo de la mercadería — no entre
                los gastos como el alquiler. Así tu margen bruto dice la verdad.
              </Ayuda>
            </span>
            <span className="text-tinta/60">{money(-e.eerr.fletes)}</span>
          </div>
          <div className={fila}>
            <span className="text-tinta/45">(−) Mermas
              <Ayuda titulo="Mermas">
                El costo de las prendas que se perdieron, se dañaron o se regalaron. Reducen tu margen
                igual que el costo, porque es mercadería que ya no vas a vender.
              </Ayuda>
            </span>
            <span className="text-tinta/60">{money(-e.eerr.mermas)}</span>
          </div>
          <div className={filaTotal}>
            <span className="text-tinta">Margen bruto
              <Ayuda titulo="Margen bruto">
                Lo que te queda de cada venta después de descontar cuánto te costó la mercadería (con
                su flete y mermas). Es EL número con el que decides precios. Fórmula: Ventas netas −
                Costo − Fletes − Mermas.
              </Ayuda>
              {e.eerr.margenBrutoPct != null && <span className="ml-2 text-tinta/40">{e.eerr.margenBrutoPct}%</span>}
            </span>
            <span className="font-display text-base text-tinta">{money(e.eerr.margenBruto)}</span>
          </div>
          {e.eerr.gastosOperativos.map((g) => (
            <div key={g.categoria} className={fila}>
              <span className="text-tinta/45">(−) {ETIQUETA_GASTO[g.categoria] ?? g.categoria}</span>
              <span className="text-tinta/60">{money(-g.monto)}</span>
            </div>
          ))}
          <div className={`${filaTotal} bg-crema`}>
            <span className="label-cayla text-[10px] text-tinta">Utilidad operativa
              <Ayuda titulo="Utilidad operativa">
                Lo que realmente ganó el negocio operando este mes: el margen bruto menos todos los
                gastos de operar (alquiler, planilla, luz, marketing…). Si es negativo, gastaste más
                de lo que dejó la mercadería.
              </Ayuda>
            </span>
            <span className={`font-display text-xl ${e.eerr.utilidadOperativa >= 0 ? "text-tinta" : "text-rojo"}`}>{money(e.eerr.utilidadOperativa)}</span>
          </div>
        </div>
      </section>

      {/* ==================== 2 · BALANCE GENERAL ==================== */}
      <section>
        <div className="flex items-baseline justify-between">
          <h2 className={H2}>
            Balance General
            <Ayuda titulo="Balance General">
              Una foto de cuánto vale CAYLA hoy. A la izquierda, todo lo que tiene (activo). A la
              derecha, cómo se financió: lo que debe (pasivo) más lo que es tuyo (patrimonio). Las
              dos columnas siempre suman igual.
            </Ayuda>
          </h2>
          <span className={`label-cayla text-[9px] ${e.balance.cuadra ? "text-tinta/40" : "text-rojo"}`}>
            {e.balance.cuadra ? "cuadrado ✓" : "descuadre — revisar"}
            <Ayuda titulo="¿Cuadrado?">
              Significa que todo lo que CAYLA tiene es exactamente igual a cómo se financió. Es la
              prueba de que los números no mienten: si no cuadrara, habría un error que corregir.
            </Ayuda>
          </span>
        </div>
        <p className="mb-3 text-xs text-tinta/45">Cuánto vale CAYLA hoy. Activo = Pasivo + Patrimonio.</p>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="card-cayla">
            <p className="label-cayla border-b border-tinta/10 px-4 py-2 text-[9px] text-tinta/45">Activo — lo que tiene</p>
            <div className={fila}><span className="text-tinta/60">Caja (efectivo en tiendas)</span><span className="text-tinta">{money(e.balance.caja)}</span></div>
            <div className={fila}><span className="text-tinta/60">Banco y medios electrónicos</span><span className="text-tinta">{money(e.balance.banco)}</span></div>
            <div className={fila}>
              <span className="text-tinta/60">Inventario (a costo)
                <Ayuda titulo="Inventario a costo">
                  Cuánto vale toda tu mercadería en stock, valorada a lo que te COSTÓ (no a lo que la
                  vendes). Es plata tuya, pero parada: no rinde hasta que se vende.
                </Ayuda>
              </span>
              <span className="text-tinta">{money(e.balance.inventario)}</span>
            </div>
            <div className={fila}><span className="text-tinta/60">Muebles y equipos</span><span className="text-tinta">{money(e.balance.activosFijos)}</span></div>
            <div className={`${filaTotal} bg-crema`}><span className="label-cayla text-[10px] text-tinta">Total activo</span><span className="font-display text-base text-tinta">{money(e.balance.totalActivo)}</span></div>
          </div>
          <div className="card-cayla">
            <p className="label-cayla border-b border-tinta/10 px-4 py-2 text-[9px] text-tinta/45">Pasivo y Patrimonio — cómo se financia</p>
            <div className={fila}>
              <span className="text-tinta/60">IGV por pagar (SUNAT)
                <Ayuda titulo="IGV por pagar">
                  El IGV que cobraste en tus ventas menos el que pagaste en tus compras y gastos. Si
                  sale positivo, se lo debes a SUNAT; si sale negativo, es crédito a tu favor para el
                  próximo mes. Ese dinero nunca fue ganancia tuya.
                </Ayuda>
              </span>
              <span className="text-tinta">{money(e.balance.igvPorPagar)}</span>
            </div>
            <div className={fila}><span className="text-tinta/60">Otras deudas</span><span className="text-tinta">{money(e.balance.pasivosManuales)}</span></div>
            <div className="flex items-center justify-between px-4 py-2 text-sm text-tinta/40"><span>Total pasivo</span><span>{money(e.balance.totalPasivo)}</span></div>
            <div className={fila}>
              <span className="text-tinta/60">Capital y aportes
                <Ayuda titulo="Capital y aportes">
                  Lo que TÚ pusiste en el negocio. Hoy incluye el inventario y los saldos que aún no
                  registramos como compra pagada, por eso se ve grande. Cuando construyamos Cuentas
                  por Pagar, esta cifra baja a tu aporte real.
                </Ayuda>
              </span>
              <span className="text-tinta">{money(e.balance.capital)}</span>
            </div>
            <div className={fila}>
              <span className="text-tinta/60">Utilidades acumuladas
                <Ayuda titulo="Utilidades acumuladas">
                  La suma de todas las ganancias del negocio desde que arrancó el sistema. Es lo que
                  CAYLA generó por sí misma, aparte de lo que tú aportaste.
                </Ayuda>
              </span>
              <span className="text-tinta">{money(e.balance.utilidadesAcumuladas)}</span>
            </div>
            <div className={`${filaTotal} bg-crema`}><span className="label-cayla text-[10px] text-tinta">Total pasivo + patrimonio</span><span className="font-display text-base text-tinta">{money(e.balance.totalPasivo + e.balance.totalPatrimonio)}</span></div>
          </div>
        </div>
        <p className="mt-2 text-xs text-tinta/40">
          &ldquo;Capital y aportes&rdquo; incluye el inventario y los saldos iniciales aún no formalizados como compras — se afinará con el módulo de Cuentas por pagar.
        </p>
      </section>

      {/* ==================== 3 · FLUJO DE EFECTIVO ==================== */}
      <section>
        <h2 className={H2}>
          Flujo de Efectivo
          <Ayuda titulo="Flujo de Efectivo">
            La respuesta a &ldquo;vendí bien pero, ¿dónde está la plata?&rdquo;. Sigue el dinero real:
            cuánto entró en efectivo, cuánto salió, y con cuánto terminaste. Puedes tener utilidad y
            aun así poco efectivo si el dinero se quedó en inventario.
          </Ayuda>
        </h2>
        <p className="mb-3 text-xs text-tinta/45">De dónde vino y a dónde se fue el dinero en {MESES[mes - 1]}.</p>
        <div className="card-cayla">
          <div className={fila}><span className="text-tinta/60">Efectivo al inicio del mes</span><span className="text-tinta">{money(e.flujo.efectivoInicial)}</span></div>
          <div className={fila}><span className="text-tinta/45">(+) Cobros de ventas</span><span className="text-tinta/60">{money(e.flujo.cobrosVentas)}</span></div>
          <div className={fila}><span className="text-tinta/45">(−) Pagos de gastos</span><span className="text-tinta/60">{money(-e.flujo.pagosGastos)}</span></div>
          {e.flujo.ajustes !== 0 && <div className={fila}><span className="text-tinta/45">(±) Ajustes de efectivo</span><span className="text-tinta/60">{money(e.flujo.ajustes)}</span></div>}
          <div className={filaTotal}><span className="text-tinta">Flujo de operación</span><span className={e.flujo.flujoOperacion >= 0 ? "text-tinta" : "text-rojo"}>{money(e.flujo.flujoOperacion)}</span></div>
          <div className={`${filaTotal} bg-crema`}><span className="label-cayla text-[10px] text-tinta">Efectivo al final del mes</span><span className="font-display text-xl text-tinta">{money(e.flujo.efectivoFinal)}</span></div>
        </div>
      </section>

      {/* ==================== 4 · CAMBIOS EN EL PATRIMONIO ==================== */}
      <section>
        <h2 className={H2}>
          Cambios en el Patrimonio
          <Ayuda titulo="Cambios en el Patrimonio">
            Cómo creció (o bajó) lo que es tuyo durante el mes. Separa dos cosas: lo que tú aportaste
            o retiraste, y lo que el negocio ganó solo. Así ves si CAYLA crece por tu bolsillo o por
            su propio motor.
          </Ayuda>
        </h2>
        <p className="mb-3 text-xs text-tinta/45">Cómo cambió lo que es tuyo durante {MESES[mes - 1]}.</p>
        <div className="overflow-x-auto card-cayla">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-tinta/10 text-tinta/40">
              <tr>
                <th className="label-cayla px-4 py-2 text-[9px]"></th>
                <th className="label-cayla px-4 py-2 text-right text-[9px]">Capital</th>
                <th className="label-cayla px-4 py-2 text-right text-[9px]">Utilidades</th>
                <th className="label-cayla px-4 py-2 text-right text-[9px]">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-tinta/5">
              <tr>
                <td className="px-4 py-2.5 text-tinta/60">Saldo inicial</td>
                <td className="px-4 py-2.5 text-right text-tinta/60">{money(e.cambiosPatrimonio.capitalInicial)}</td>
                <td className="px-4 py-2.5 text-right text-tinta/60">{money(e.cambiosPatrimonio.utilidadesInicial)}</td>
                <td className="px-4 py-2.5 text-right text-tinta">{money(e.cambiosPatrimonio.patrimonioInicial)}</td>
              </tr>
              {e.cambiosPatrimonio.aportesNetos !== 0 && (
                <tr>
                  <td className="px-4 py-2.5 text-tinta/45">(+) Aportes netos</td>
                  <td className="px-4 py-2.5 text-right text-tinta/60">{money(e.cambiosPatrimonio.aportesNetos)}</td>
                  <td className="px-4 py-2.5 text-right text-tinta/30">—</td>
                  <td className="px-4 py-2.5 text-right text-tinta/60">{money(e.cambiosPatrimonio.aportesNetos)}</td>
                </tr>
              )}
              <tr>
                <td className="px-4 py-2.5 text-tinta/45">(+) Utilidad del mes</td>
                <td className="px-4 py-2.5 text-right text-tinta/30">—</td>
                <td className="px-4 py-2.5 text-right text-tinta/60">{money(e.cambiosPatrimonio.utilidadDelPeriodo)}</td>
                <td className="px-4 py-2.5 text-right text-tinta/60">{money(e.cambiosPatrimonio.utilidadDelPeriodo)}</td>
              </tr>
              <tr className="bg-crema font-medium">
                <td className="label-cayla px-4 py-3 text-[10px] text-tinta">Saldo final</td>
                <td className="px-4 py-3 text-right text-tinta">{money(e.cambiosPatrimonio.capitalFinal)}</td>
                <td className="px-4 py-3 text-right text-tinta">{money(e.cambiosPatrimonio.utilidadesFinal)}</td>
                <td className="font-display px-4 py-3 text-right text-lg text-tinta">{money(e.cambiosPatrimonio.patrimonioFinal)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <p className="border-t border-tinta/10 pt-4 text-xs text-tinta/40">
        Estos estados se calculan sobre lo que ya registras — nadie escribe asientos contables.
        Aún con simplificaciones declaradas (Balance a hoy, costo vigente, sin depreciación ni cuentas
        por pagar). Ver el manual contable del proyecto para el detalle.
      </p>
    </div>
  );
}
