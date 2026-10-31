"use client";

import { useState } from "react";
import { Chip } from "@/components/ui/Chip";
import { BarraAvance } from "@/components/ui/BarraAvance";
import { SegmentoDeslizante } from "@/components/ui/SegmentoDeslizante";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { Vacio } from "@/components/ui/Vacio";
import { ChartNoAxesColumn } from "lucide-react";
import { useAbrirMovimiento } from "@/components/finanzas/CuentasDinero";
import { fechaCorta, solesRedondo } from "@/lib/gastos-reglas";
import type { MovimientoDinero } from "@/lib/cuentas-dinero-reglas";
import { graficoDelDueno, type VistaDueno } from "@/lib/dinero-dueno-cobros-reglas";

// Cuentas y dinero ▸ Dónde está ▸ «Plata del dueño» (rediseño Felipe 2026-10-31, maqueta docs/maquetas/finanzas-dinero-rediseno-2026-10/): la tarjeta de
// siempre (qué es un aporte y qué un préstamo, cuánto te debe CAYLA, cada préstamo con lo devuelto, «Poner plata» y «Sacar plata», que abren el mismo
// «Registrar movimiento») y, a su lado, quién puso y sacó plata. «Quién» es quien REGISTRÓ el movimiento, no necesariamente quien lo pidió. Solo el
// líder y solo con todas las sedes. El gráfico lee los últimos movimientos que la pantalla ya trae (`fn_movimientos_dinero`, 150), no una lectura nueva.

export function PlataDelDueno({
  deuda,
  prestamos,
  movimientos,
}: {
  deuda: number;
  prestamos: { id: string; fecha: string; monto: number; referencia: string | null; devuelto: number }[];
  movimientos: MovimientoDinero[];
}) {
  const abrir = useAbrirMovimiento();
  const [vista, setVista] = useState<VistaDueno>("quien");
  const g = graficoDelDueno(movimientos, vista);
  const neto = Math.round((g.puso - g.saco) * 100) / 100;

  return (
    <section className="card-cayla dp-dueno" aria-label="Plata del dueño" data-guia="fin-dinero.dueno">
      <header className="dp-dueno-cab">
        <div>
          <TituloSeccion>Plata del dueño</TituloSeccion>
          <p className="dp-tenue">
            Cuando pones plata en un mal momento, eliges si es un <b className="font-semibold text-tinta">aporte</b> (se queda en CAYLA) o un <b className="font-semibold text-tinta">préstamo</b> (CAYLA te lo devuelve).
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button type="button" className="btn-cayla btn-secundario btn-chico" onClick={() => abrir("dueno_pone")} aria-haspopup="dialog" data-guia="fin-dinero.poner-plata">
            Poner plata
          </button>
          <button type="button" className="btn-cayla btn-sutil btn-chico" onClick={() => abrir("dueno_saca")} aria-haspopup="dialog">
            Sacar plata
          </button>
        </div>
      </header>

      <div className="dp-dueno-cuerpo">
        <div className="dp-dueno-izq">
          <div>
            <span className="dp-versalita">CAYLA te debe</span>
            <div className={`dp-dueno-debe ${deuda > 0 ? "dp-ambar" : ""}`}>{solesRedondo(deuda)}</div>
            <Chip tono={deuda > 0 ? "ambar" : "verde"} versalitas={false}>
              {deuda > 0 ? "Préstamo sin devolver" : "Al día: no te debe nada"}
            </Chip>
          </div>
          {prestamos.length === 0 ? (
            <p className="dp-tenue" style={{ fontSize: "13.5px" }}>
              Sin préstamos del dueño.
            </p>
          ) : (
            <ul className="dp-prestamos" role="list">
              {prestamos.map((p) => (
                <li key={p.id}>
                  <span>
                    {fechaCorta(p.fecha)} · préstamo{p.referencia ? ` · ${p.referencia}` : ""}
                  </span>
                  <span className="dp-num">
                    {solesRedondo(p.monto)} · devuelto {solesRedondo(p.devuelto)}
                  </span>
                  <BarraAvance pct={p.monto > 0 ? (p.devuelto / p.monto) * 100 : 0} alto="fina" tono="ambar" decorativa />
                </li>
              ))}
            </ul>
          )}
          {g.filas.length > 0 && (
            <dl className="dp-dueno-stats">
              <div>
                <dt>Puso</dt>
                <dd className="dp-num" style={{ color: "var(--color-verde)" }}>
                  {solesRedondo(g.puso)}
                </dd>
              </div>
              <div>
                <dt>Sacó</dt>
                <dd className="dp-num" style={{ color: "var(--color-ambar)" }}>
                  {solesRedondo(g.saco)}
                </dd>
              </div>
              <div>
                <dt>Queda en CAYLA</dt>
                <dd className="dp-num">
                  {neto < 0 ? "−" : "+"}
                  {solesRedondo(Math.abs(neto))}
                </dd>
              </div>
            </dl>
          )}
        </div>

        <div className="dp-dueno-der" data-guia="fin-dinero.dueno-grafico">
          <div className="dp-dueno-grafico-cab">
            <TituloSeccion nivel={3}>Quién puso y sacó plata</TituloSeccion>
            <SegmentoDeslizante
              etiqueta="Agrupar el gráfico"
              forma="modo"
              valor={vista}
              onCambio={(v) => setVista(v as VistaDueno)}
              opciones={[
                { clave: "quien", etiqueta: "Por quién" },
                { clave: "cuenta", etiqueta: "Por cuenta" },
                { clave: "mes", etiqueta: "Por mes" },
              ]}
            />
          </div>
          {g.filas.length === 0 ? (
            <Vacio tamano="chico" icono={<ChartNoAxesColumn />}>
              Todavía no hay aportes, préstamos ni retiros del dueño en los últimos movimientos.
            </Vacio>
          ) : (
            <>
              <p className="dp-ley">
                <span>
                  <i style={{ background: "var(--color-verde)" }} />
                  Puso
                </span>
                <span>
                  <i style={{ background: "var(--color-ambar)" }} />
                  Sacó
                </span>
              </p>
              <ul className="dp-dueno-filas" role="list">
                {g.filas.map((f, i) => (
                  <li key={f.clave} title={f.detalle}>
                    <span className="dp-dueno-k">{f.titulo}</span>
                    <div className="dp-dueno-barras">
                      <div>
                        <BarraAvance pct={g.maximo > 0 ? (f.puso / g.maximo) * 100 : 0} alto="normal" tono="verde" decorativa indice={i} />
                        <b className="dp-num" style={{ color: "var(--color-verde)" }}>
                          {f.puso ? `+${solesRedondo(f.puso)}` : "—"}
                        </b>
                      </div>
                      <div>
                        <BarraAvance pct={g.maximo > 0 ? (f.saco / g.maximo) * 100 : 0} alto="normal" tono="ambar" decorativa indice={i} />
                        <b className="dp-num" style={{ color: "var(--color-ambar)" }}>
                          {f.saco ? `−${solesRedondo(f.saco)}` : "—"}
                        </b>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
              <p className="dp-tenue" style={{ fontSize: "12.5px" }}>
                Puso <b className="dp-num" style={{ color: "var(--color-verde)" }}>{solesRedondo(g.puso)}</b> · Sacó <b className="dp-num" style={{ color: "var(--color-ambar)" }}>{solesRedondo(g.saco)}</b> · Neto{" "}
                <b className="dp-num text-tinta">
                  {neto < 0 ? "−" : "+"}
                  {solesRedondo(Math.abs(neto))}
                </b>{" "}
                para CAYLA. Cuenta a quien registró el movimiento; pasa el mouse por una fila para ver aportes, préstamos, devoluciones y retiros.
              </p>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
