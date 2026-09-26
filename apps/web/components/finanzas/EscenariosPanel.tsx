"use client";

import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { Chip } from "@/components/ui/Chip";
import { CabeceraReportes } from "@/components/finanzas/CabeceraReportes";
import { CabeceraBloque, InputFin, RadiosFin, SelectFin, Superficie } from "@/components/finanzas/kit";
import { GraficoSemanas } from "@/components/finanzas/GraficoSemanas";
import { descargarBlob } from "@/lib/exportar-csv";
import { sumarDias } from "@/lib/fechas-lima";
import { fechaCorta, parsearMonto, textoMes } from "@/lib/gastos-reglas";
import type { FilaER } from "@/lib/resultados-reglas";
import {
  PALANCAS_INICIALES,
  alquilerDe,
  alquilerDeFijos,
  conclusiones,
  csvEscenario,
  etiquetaSemana,
  etiquetasEje,
  hayCambios,
  proyectar,
  soles,
  tiendaInicial,
  tiendasDeLaProyeccion,
  utilidadConCambios,
  type Palancas,
  type Parte,
  type Proyeccion,
} from "@/lib/flujo-caja-reglas";

// Finanzas ▸ Reportes ▸ Escenarios (ADR-0195 F6), dibujado como el spike aprobado (`vistaEscenarios`, «¿Qué pasa si…?»): a
// la izquierda las palancas; a la derecha qué pasaría, la utilidad de cada unidad y la caja de las próximas semanas. Es la
// MISMA cuenta del flujo de caja (`proyectar`, que sin palancas da las semanas de la base) y la del estado de resultados
// (F5), rehechas aquí con los valores movidos. Nada se guarda: al salir de la pantalla, vuelve a como está.

const entra = (i: number) => ({ className: "anim-entra", style: { ["--i" as string]: i } as CSSProperties });
const pintar = (partes: Parte[]): ReactNode => partes.map((p, i) => (typeof p === "string" ? <span key={i}>{p}</span> : <b key={i}>{p.b}</b>));
const pct = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v)} %`;
const redondear = (v: number, paso: number) => Math.round(v / paso) * paso;
const MOVER = [-2, -1, 1, 2, 3] as const;
const textoMover = (n: number) => (n < 0 ? `${-n} ${n === -1 ? "semana" : "semanas"} antes` : `${n} ${n === 1 ? "semana" : "semanas"} después`);

export function EscenariosPanel({
  proyeccion,
  resultados,
  mesBase,
  fallas,
  hoy,
}: {
  proyeccion: Proyeccion | null;
  /** El estado de resultados del último mes completo (F5). `null` si no se pudo leer. */
  resultados: FilaER[] | null;
  mesBase: string;
  fallas: string[];
  hoy: string;
}) {
  const tiendas = useMemo(() => {
    const deProy = proyeccion ? tiendasDeLaProyeccion(proyeccion).map((t) => ({ id: t.id, nombre: t.nombre })) : [];
    const deER = (resultados ?? []).filter((f) => f.unidad === "tienda" && f.ubicacionId && !deProy.some((t) => t.id === f.ubicacionId));
    return [...deProy, ...deER.map((f) => ({ id: f.ubicacionId!, nombre: f.nombre }))];
  }, [proyeccion, resultados]);
  const inicial = useMemo<Palancas>(() => ({ ...PALANCAS_INICIALES, tienda: tiendaInicial(resultados ?? [], tiendas) }), [resultados, tiendas]);
  const [p, setP] = useState<Palancas>(inicial);
  const [montoNuevo, setMontoNuevo] = useState("1000");
  const cambiar = (x: Partial<Palancas>) => setP((a) => ({ ...a, ...x }));

  const nombreTienda = tiendas.find((t) => t.id === p.tienda)?.nombre ?? null;
  const filaTienda = (resultados ?? []).find((f) => f.ubicacionId === p.tienda);
  const alquilerER = filaTienda ? alquilerDe(filaTienda) : 0;
  const alquilerActual = alquilerER > 0 ? alquilerER : proyeccion ? alquilerDeFijos(proyeccion.salidas, p.tienda) : null;
  const utilidad = resultados && resultados.length ? utilidadConCambios(resultados, p) : null;
  const base = proyeccion ? proyectar(proyeccion) : [];
  const nuevo = proyeccion ? proyectar(proyeccion, p, alquilerActual) : [];
  const pagos = (proyeccion?.salidas ?? []).filter((s) => s.tipo === "vencimiento").sort((a, b) => b.monto - a.monto);
  const pago = p.moverPago ? pagos.find((s) => s.id === p.moverPago!.id) : null;
  const nuevaFecha = pago && p.moverPago ? sumarDias(pago.fecha, 7 * p.moverPago.semanas) : null;
  const pagoMovido =
    pago && nuevaFecha && proyeccion
      ? { titulo: pago.titulo, monto: pago.monto, de: pago.fecha, a: nuevaFecha > proyeccion.hasta ? null : nuevaFecha < proyeccion.desde ? proyeccion.desde : nuevaFecha }
      : null;
  const frases = proyeccion
    ? conclusiones({ utilidad, palancas: p, nombreTienda, semanasBase: base, semanasNuevas: nuevo, minimo: proyeccion.minimoCaja, pagoMovido })
    : [];
  const movido = hayCambios(p, alquilerActual);

  const descargar = () => {
    descargarBlob(`escenario-${hoy}.csv`, new Blob([csvEscenario(base, nuevo, utilidad)], { type: "text/csv;charset=utf-8" }));
  };
  const volver = () => {
    setP(inicial);
    setMontoNuevo("1000");
  };

  return (
    <div className="space-y-6">
      <CabeceraReportes
        pestana="escenarios"
        titulo="¿Qué pasa si…?"
        bajada="Mueve los valores y mira qué pasa con la utilidad de cada tienda y con tu caja. No se guarda nada: es para pensar antes de decidir."
        acciones={
          <>
            <Chip versalitas={false}>CAYLA entera</Chip>
            <button type="button" className="btn-cayla btn-secundario" onClick={descargar} disabled={!proyeccion}>
              Descargar Excel
            </button>
          </>
        }
      />

      {fallas.map((f) => (
        <p key={f} className="card-cayla border-dashed px-5 py-4 text-sm text-tinta/75">
          {f}
        </p>
      ))}

      <section className="fin-dos-col fin-esc">
        <div {...entra(1)}>
          <Superficie pad>
            <CabeceraBloque titulo="Mueve los valores" bajada={`Parte de ${textoMes(mesBase).split(" ")[0]}, el último mes completo, y de tu caja de hoy.`}>
              <button type="button" className="btn-cayla btn-sutil btn-sm" onClick={volver} disabled={!movido}>
                Volver a como está
              </button>
            </CabeceraBloque>

            {tiendas.length > 1 && (
              <div className="fin-campo-esc">
                <label htmlFor="esc-tienda">¿Qué tienda?</label>
                <SelectFin
                  id="esc-tienda"
                  value={p.tienda ?? ""}
                  onChange={(e) => cambiar({ tienda: e.target.value, ventasTienda: 0, alquilerTienda: null, cerrarTienda: false })}
                >
                  {tiendas.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nombre}
                    </option>
                  ))}
                </SelectFin>
              </div>
            )}

            {nombreTienda && alquilerActual !== null && alquilerActual > 0 && (
              <Deslizador
                id="esc-alquiler"
                nombre={`Alquiler de ${nombreTienda}`}
                valor={Math.round(p.alquilerTienda ?? alquilerActual)}
                texto={soles(p.alquilerTienda ?? alquilerActual)}
                min={redondear(alquilerActual * 0.5, 100)}
                max={redondear(alquilerActual * 1.5, 100)}
                paso={50}
                deshabilitado={p.cerrarTienda}
                onValor={(v) => cambiar({ alquilerTienda: v })}
              />
            )}
            {nombreTienda && (
              <Deslizador
                id="esc-ventas-tienda"
                nombre={`Ventas de ${nombreTienda}`}
                valor={p.ventasTienda}
                texto={pct(p.ventasTienda)}
                min={-20}
                max={40}
                paso={1}
                deshabilitado={p.cerrarTienda}
                onValor={(v) => cambiar({ ventasTienda: v })}
              />
            )}
            <Deslizador
              id="esc-ventas-todas"
              nombre="Ventas de todas las tiendas"
              valor={p.ventasTodas}
              texto={pct(p.ventasTodas)}
              min={-20}
              max={30}
              paso={1}
              onValor={(v) => cambiar({ ventasTodas: v })}
            />

            {pagos.length > 0 && (
              <div className="fin-opcion-esc" data-marcada={p.moverPago ? "" : undefined}>
                <label className="fin-opcion-esc-fila">
                  <input
                    type="checkbox"
                    checked={!!p.moverPago}
                    onChange={(e) => cambiar({ moverPago: e.target.checked ? { id: pagos[0]!.id, semanas: 1 } : null })}
                  />
                  <span>
                    <b>Pasar un pago a otra semana</b>
                    <small>
                      {pagoMovido
                        ? `${soles(pagoMovido.monto)} del ${fechaCorta(pagoMovido.de)} ${pagoMovido.a ? `al ${fechaCorta(pagoMovido.a)}` : "a después de estas semanas"}. Hay que hablarlo con el proveedor.`
                        : `${soles(pagos[0]!.monto)} a ${pagos[0]!.titulo}, que vence el ${fechaCorta(pagos[0]!.fecha)}, u otro de lo que se debe.`}
                    </small>
                  </span>
                </label>
                {p.moverPago && (
                  <div className="fin-opcion-esc-campos">
                    <SelectFin aria-label="Qué pago" value={p.moverPago.id} onChange={(e) => cambiar({ moverPago: { id: e.target.value, semanas: p.moverPago!.semanas } })}>
                      {pagos.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.titulo} · {soles(s.monto)} · {s.atrasada ? "vencido" : `vence ${fechaCorta(s.fecha)}`}
                        </option>
                      ))}
                    </SelectFin>
                    <SelectFin aria-label="Cuántas semanas" value={String(p.moverPago.semanas)} onChange={(e) => cambiar({ moverPago: { id: p.moverPago!.id, semanas: Number(e.target.value) } })}>
                      {MOVER.map((n) => (
                        <option key={n} value={n}>
                          {textoMover(n)}
                        </option>
                      ))}
                    </SelectFin>
                  </div>
                )}
              </div>
            )}

            {nombreTienda && (
              <div className="fin-opcion-esc">
                <label className="fin-opcion-esc-fila">
                  <input type="checkbox" checked={p.cerrarTienda} onChange={(e) => cambiar({ cerrarTienda: e.target.checked })} />
                  <span>
                    <b>Cerrar {nombreTienda}</b>
                    <small>Sin sus ventas ni sus costos; lo que se invirtió en ella se sigue depreciando.</small>
                  </span>
                </label>
              </div>
            )}

            <div className="fin-opcion-esc" data-marcada={p.gastoNuevo ? "" : undefined}>
              <label className="fin-opcion-esc-fila">
                <input
                  type="checkbox"
                  checked={!!p.gastoNuevo}
                  onChange={(e) => {
                    const m = parsearMonto(montoNuevo);
                    cambiar({ gastoNuevo: e.target.checked ? { monto: m.ok ? m.valor : 0, mensual: true, semana: 0 } : null });
                  }}
                />
                <span>
                  <b>Un gasto nuevo</b>
                  <small>Contratar a alguien, una máquina, un local más: cuánto y desde cuándo.</small>
                </span>
              </label>
              {p.gastoNuevo && proyeccion && (
                <div className="fin-opcion-esc-campos">
                  <div className="fin-con-unidad">
                    <span>S/</span>
                    <InputFin
                      aria-label="Monto del gasto nuevo"
                      inputMode="decimal"
                      value={montoNuevo}
                      onChange={(e) => {
                        setMontoNuevo(e.target.value);
                        const m = parsearMonto(e.target.value);
                        cambiar({ gastoNuevo: { ...p.gastoNuevo!, monto: m.ok ? m.valor : 0 } });
                      }}
                    />
                  </div>
                  <RadiosFin
                    nombre="esc-frecuencia"
                    etiqueta="Cada cuánto"
                    valor={p.gastoNuevo.mensual ? "mes" : "una"}
                    onValor={(v) => cambiar({ gastoNuevo: { ...p.gastoNuevo!, mensual: v === "mes" } })}
                    opciones={[
                      { valor: "mes", texto: "Cada mes" },
                      { valor: "una", texto: "Una vez" },
                    ]}
                  />
                  <SelectFin aria-label="Desde qué semana" value={String(p.gastoNuevo.semana)} onChange={(e) => cambiar({ gastoNuevo: { ...p.gastoNuevo!, semana: Number(e.target.value) } })}>
                    {proyeccion.semanas.map((w, i) => (
                      <option key={w.desde} value={i}>
                        Desde la semana del {etiquetaSemana(w.desde, w.hasta)}
                      </option>
                    ))}
                  </SelectFin>
                </div>
              )}
            </div>
          </Superficie>
        </div>

        <div className="fin-columna">
          <div {...entra(2)}>
            <Superficie pad>
              <CabeceraBloque titulo="Qué pasaría" bajada="Comparado con cómo está hoy." />
              {frases.length ? (
                <ul className="fin-conclusiones" aria-live="polite">
                  {frases.map((f, i) => (
                    <li key={i}>{pintar(f)}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-taupe">Sin la proyección de la caja no hay con qué comparar.</p>
              )}
            </Superficie>
          </div>

          <div {...entra(3)}>
            {utilidad ? (
              <Superficie>
                <div className="fin-tabla-wrap">
                  <table className="fin-tabla fin-tabla-utilidad">
                    <caption className="sr-only">Utilidad al mes de cada unidad, hoy y con el cambio</caption>
                    <thead>
                      <tr>
                        <th>Utilidad al mes</th>
                        <th className="fin-num">Hoy</th>
                        <th className="fin-num">Con el cambio</th>
                        <th className="fin-num">Diferencia</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...utilidad.unidades, { ubicacionId: "cayla", nombre: "CAYLA", antes: utilidad.cayla.antes, despues: utilidad.cayla.despues }].map((u) => {
                        const dif = Math.round(u.despues) - Math.round(u.antes);
                        const total = u.ubicacionId === "cayla";
                        return (
                          <tr key={u.ubicacionId ?? u.nombre} className={total ? "fin-total-t" : undefined}>
                            <td data-l="Unidad">{total ? <b>CAYLA</b> : u.nombre}</td>
                            <td className="fin-num" data-l="Hoy">
                              {soles(u.antes)}
                            </td>
                            <td className="fin-num" data-l="Con el cambio">
                              <b>{soles(u.despues)}</b>
                            </td>
                            <td className={`fin-num ${dif < 0 ? "fin-dif-baja" : dif > 0 ? "fin-dif-sube" : ""}`} data-l="Diferencia">
                              {dif === 0 ? "—" : `${dif > 0 ? "+" : "−"}${soles(Math.abs(dif))}`}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Superficie>
            ) : (
              <div className="nota-cayla">
                <b>La utilidad sale del estado de resultados de {textoMes(mesBase)}</b> (Reportes ▸ Estado de resultados) y todavía no se pudo leer: por
                ahora el escenario solo mueve tu caja.
              </div>
            )}
          </div>

          {proyeccion && (
            <div {...entra(4)}>
              <Superficie pad>
                <CabeceraBloque titulo="Tu caja con el cambio" bajada={`Próximas ${proyeccion.semanas.length} semanas.`} />
                <GraficoSemanas
                  etiqueta={`Tu caja con el cambio, contra tu mínimo de ${soles(proyeccion.minimoCaja)}`}
                  alto={190}
                  ancho={460}
                  etiquetaValor={soles}
                  umbral={proyeccion.minimoCaja}
                  umbralTexto={`tu mínimo de caja: ${soles(proyeccion.minimoCaja)}`}
                  barras={nuevo.map((w, i) => {
                    const eje = etiquetasEje(nuevo.map((x) => x.desde));
                    return {
                      nombre: eje[i] ?? "",
                      valor: w.saldo,
                      mala: w.bajoMinimo,
                      malaTexto: "bajo el mínimo",
                      titulo: etiquetaSemana(w.desde, w.hasta),
                      lineas: [`Entra ${soles(w.entra)} · Sale ${soles(w.sale)}`, `Queda ${soles(w.saldo)} (hoy: ${soles(base[i]?.saldo ?? w.saldo)})`],
                    };
                  })}
                />
              </Superficie>
            </div>
          )}
        </div>
      </section>

      <div className="nota-cayla">
        Un escenario no reemplaza la conversación: bajar un alquiler hay que negociarlo y vender 15 % más requiere un plan. Lo que sí hace es decirte{" "}
        <b>cuánto vale</b> cada decisión antes de tomarla.
      </div>
    </div>
  );
}

function Deslizador({
  id,
  nombre,
  valor,
  texto,
  min,
  max,
  paso,
  deshabilitado = false,
  onValor,
}: {
  id: string;
  nombre: string;
  valor: number;
  texto: string;
  min: number;
  max: number;
  paso: number;
  deshabilitado?: boolean;
  onValor: (v: number) => void;
}) {
  return (
    <div className="fin-campo-esc" data-apagado={deshabilitado ? "" : undefined}>
      <label htmlFor={id}>
        {nombre}
        <b>{texto}</b>
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={paso}
        value={Math.min(max, Math.max(min, valor))}
        aria-valuetext={texto}
        disabled={deshabilitado}
        onChange={(e) => onValor(Number(e.target.value))}
      />
    </div>
  );
}
