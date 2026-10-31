"use client";

import Link from "next/link";
import { useState, type CSSProperties } from "react";
import { ArrowLeftRight, CircleHelp, Clock, Handshake, Percent, type LucideIcon } from "lucide-react";
import { BarraApilada, MuestraTramo } from "@/components/ui/BarraApilada";
import { BarraAvance } from "@/components/ui/BarraAvance";
import { Chip } from "@/components/ui/Chip";
import { EnlaceVer } from "@/components/ui/EnlaceVer";
import { Encabezado, Tabla, celda, fila } from "@/components/ui/Tabla";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { Vacio } from "@/components/ui/Vacio";
import { useAbrirMovimiento } from "@/components/finanzas/CuentasDinero";
import { AbrirPagoDesdeUrl } from "@/components/finanzas/dinero/AbrirPagoDesdeUrl";
import { BotonPagarClaure } from "@/components/finanzas/dinero/BotonPagarClaure";
import { HistorialClaure } from "@/components/finanzas/dinero/HistorialClaure";
import { soles } from "@/lib/compras-reglas";
import { solesRedondo } from "@/lib/gastos-reglas";
import { NOTA_CLAURE, NOTA_GASTOS_CLAURE, NOTA_PAGOS_CLAURE, filasContadas, montoSugeridoPago, resumenClaure, type FilaClaure, type GastoClaure, type PagoClaure } from "@/lib/cuenta-claure-reglas";
import {
  avisosClaure,
  fechaCortaIso,
  fechaDiaMes,
  libroClaure,
  porRevisar,
  repartoPorCuenta,
  repartoPorMedio,
  semanasClaure,
  terminosClaure,
  type AvisoClaure,
  type FiltroLibro,
  type PeriodoLibro,
} from "@/lib/cuenta-claure-vista-reglas";

// Finanzas ▸ Cuentas y dinero ▸ CLAURE, rediseño «B+C · Fusión» (Felipe 2026-10-31; maqueta docs/maquetas/finanzas-claure-rediseno-2026-10/index.html#d). Solo
// cambia el orden y la cara: lo cobrado, devuelto, el IGV, la comisión, los gastos suyos, lo ya pagado, los cambios por revisar y «Pagar a CLAURE» son los
// de siempre. La COMPOSICIÓN es la de la maqueta; donde pedía algo con pieza única (ADR-0358) se usa la pieza: `TarjetaCifra` para cada término, `BarraApilada`
// para lo cobrado por medio, `BarraAvance` para cada cuenta, `Tabla`, `TituloSeccion`, `Chip`, `EnlaceVer` y, en el historial, `Modal`, `pildora-cayla` y
// `Paginas`. Lo único propio: la ficha oscura de lo que se le debe, las barras de la semana (dos series) y la lista de avisos, como en «Dónde está».
// Estilos: `app/estilos/finanzas-dinero.css` (`cl-*`). El saldo no se guarda: sale de `resumenClaure`, y el libro del historial termina en la misma cifra.

const entra = (i: number) => ({ className: "anim-entra", style: { ["--i" as string]: i } as CSSProperties });

/** El ícono de cada aviso, en su círculo (la maqueta usaba signos: «⇄», «%», «?», «S/»). */
const ICONO_AVISO: Record<AvisoClaure["clave"], LucideIcon> = { cambios: ArrowLeftRight, "sin-tarifa": Percent, "sin-cuenta": CircleHelp, "sin-pago": Clock };
const COLOR_AVISO: Record<AvisoClaure["tono"], string> = { atencion: "var(--color-ambar)", info: "var(--color-pizarra)" };

const PLANTILLA_MEDIOS = "sm:grid-cols-[minmax(0,1.3fr)_repeat(3,minmax(0,1fr))]";
const COLUMNAS_MEDIOS = [{ titulo: "Medio" }, { titulo: "Cobrado", alinear: "der" as const }, { titulo: "Comisión", alinear: "der" as const }, { titulo: "Para Claudia", alinear: "der" as const }];

const PAGOS_A_LA_VISTA = 4;

export function CuentaClaure({ filas, pagos, gastos, esLider, hoy }: { filas: FilaClaure[]; pagos: PagoClaure[]; gastos: GastoClaure[]; esLider: boolean; hoy: string }) {
  const abrirMovimiento = useAbrirMovimiento();
  const [historial, setHistorial] = useState<{ filtro: FiltroLibro; periodo: PeriodoLibro } | null>(null);

  const contadas = filasContadas(filas);
  const r = resumenClaure(filas, pagos, gastos);
  const libro = libroClaure(filas, pagos, gastos);
  const avisos = avisosClaure(filas, pagos, r, hoy, esLider);
  const nCobros = contadas.filter((f) => f.origen === "venta").reduce((a, f) => a + f.nPagos, 0);
  const terminos = terminosClaure(r, nCobros, gastos.length, pagos.length);
  const medios = repartoPorMedio(filas);
  const cuentas = repartoPorCuenta(filas);
  const semanas = semanasClaure(filas, pagos);
  const maximoSemana = Math.max(1, ...semanas.flatMap((s) => [s.cobrado, s.pagado]));
  const ultimosPagos = libro.filter((m) => m.tipo === "pago");
  const montoSugerido = montoSugeridoPago(r.saldo);
  const aFavor = r.saldo < 0;
  const faltan = porRevisar(avisos);
  const vacio = contadas.length === 0 && filas.length === 0 && pagos.length === 0 && gastos.length === 0;

  if (vacio)
    return (
      <div className="cl-marco">
        <Vacio icono={<Handshake />} titulo="Todavía no hay cobros de CLAURE en cuentas de CAYLA">
          Cuando una venta de una prenda de CLAURE se cobre con tarjeta, QR, Yape o transferencia, aparecerá aquí con lo que se le debe a Claudia.
        </Vacio>
      </div>
    );

  return (
    <div className="cl-marco space-y-6">
      {esLider && <AbrirPagoDesdeUrl montoSugerido={montoSugerido} />}

      <section className="cl-fichas" aria-label="Cómo se llega a lo que se le debe" data-guia="fin-claure.cifras">
        <div className="cl-debe anim-entra" style={{ ["--i" as string]: 0 } as CSSProperties}>
          <span className="cl-debe-etq">{aFavor ? "¿Cuánto te debe CLAURE?" : "¿Cuánto le debes?"}</span>
          <span className="cl-debe-valor">{soles(Math.abs(r.saldo))}</span>
          <span className="cl-debe-pie">{aFavor ? "Se le pagó de más: queda a favor de CAYLA" : faltan > 0 ? `${faltan} por revisar` : "Nada por revisar"}</span>
        </div>
        {terminos.map((t, i) => (
          <TarjetaCifra key={t.clave} etiqueta={t.titulo} valor={solesRedondo(t.valor)} punto={t.punto} onClick={() => setHistorial({ filtro: t.filtro, periodo: "todo" })} {...entra(i + 1)}>
            {t.detalle}
          </TarjetaCifra>
        ))}
      </section>

      <div className="cl-dos">
        <section className="card-cayla anim-sube" aria-label="Por dónde entra la plata de Claudia" data-guia="fin-claure.entra">
          <TituloSeccion dato={<span className="cl-tenue">{solesRedondo(r.cobrado)} cobrados</span>}>Por dónde entra la plata de Claudia</TituloSeccion>
          {medios.length === 0 ? (
            <Vacio tamano="chico" icono={<Handshake />}>
              Todavía no hay cobros de CLAURE en cuentas de CAYLA.
            </Vacio>
          ) : (
            <>
              <BarraApilada
                segmentos={medios.map((m) => ({ clave: m.medio, nombre: m.texto, valor: m.cobrado, color: m.color }))}
                unidad="soles"
                formato={solesRedondo}
                alto={12}
                decorativa
              />
              <p className="cl-ley">
                {medios.map((m) => (
                  <span key={m.medio}>
                    <MuestraTramo color={m.color} />
                    {m.texto} <b className="cl-num">{solesRedondo(m.cobrado)}</b> · {Math.round(m.pct)} %
                  </span>
                ))}
              </p>
              <div>
                <span className="cl-versalita">A qué cuenta llegó</span>
                {cuentas.map((c) => (
                  <div key={c.nombre} className="cl-cta">
                    <b>
                      {c.nombre}
                      {c.sinCuenta && (
                        <Chip tono="ambar" versalitas={false}>
                          falta asignar
                        </Chip>
                      )}
                    </b>
                    <BarraAvance pct={c.pct} alto="normal" tono="tinta" decorativa />
                    <span className="cl-num font-semibold">{solesRedondo(c.monto)}</span>
                  </div>
                ))}
              </div>
              <div className="cl-llena">
                <span className="cl-versalita">Lo que deja cada medio</span>
                <Tabla className="@container">
                  <Encabezado plantilla={PLANTILLA_MEDIOS} columnas={COLUMNAS_MEDIOS} />
                  {medios.map((m) => (
                    <div key={m.medio} className={fila(PLANTILLA_MEDIOS)}>
                      <span className={celda("izq", "font-semibold text-tinta")}>
                        <MuestraTramo color={m.color} className="mr-2" />
                        {m.texto}
                      </span>
                      <span className={celda("der")}>
                        <span className="text-taupe sm:hidden">Cobrado · </span>
                        {solesRedondo(m.cobrado)}
                      </span>
                      <span className={celda("der")}>
                        <span className="text-taupe sm:hidden">Comisión · </span>
                        {m.comision > 0 ? `−${solesRedondo(m.comision)}` : "—"}
                      </span>
                      <span className={celda("der", "font-semibold text-tinta")}>
                        <span className="font-normal text-taupe sm:hidden">Para Claudia · </span>
                        {solesRedondo(m.paraClaudia)}
                      </span>
                    </div>
                  ))}
                </Tabla>
                <span className="cl-tenue">Para Claudia = cobrado − IGV − comisión, antes de devoluciones, gastos y pagos.</span>
              </div>
            </>
          )}
        </section>

        <section className="card-cayla anim-sube" aria-label="Pide tu atención" data-guia="fin-claure.atencion">
          <TituloSeccion dato={<Chip tono={avisos.length ? "ambar" : "verde"}>{avisos.length === 0 ? "Todo en orden" : `${avisos.length} ${avisos.length === 1 ? "cosa" : "cosas"}`}</Chip>}>Pide tu atención</TituloSeccion>
          {avisos.length === 0 ? (
            <p className="cl-tenue">Nada de CLAURE pide revisión.</p>
          ) : (
            <ul className="cl-aten" role="list">
              {avisos.map((a) => {
                const Icono = ICONO_AVISO[a.clave];
                return (
                  <li key={a.clave} style={{ ["--c" as string]: COLOR_AVISO[a.tono] } as CSSProperties}>
                    <span className="cl-ic" aria-hidden>
                      <Icono className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <b>{a.titulo}</b>
                      <span className="cl-d">{a.detalle}</span>
                    </div>
                    {"href" in a.accion ? (
                      <Link href={a.accion.href} className="btn-cayla btn-enlace">
                        {a.accion.texto}
                      </Link>
                    ) : (
                      <button type="button" className="btn-cayla btn-enlace" aria-haspopup="dialog" onClick={() => abrirMovimiento("pago_claure", undefined, montoSugerido || undefined)}>
                        {a.accion.texto}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          <div className="cl-llena">
            <span className="cl-versalita">Cómo se llega a lo que se le debe</span>
            <dl className="cl-cuenta">
              <div>
                <dt>Cobrado en tus cuentas</dt>
                <dd>+{soles(r.cobrado)}</dd>
              </div>
              {r.devuelto > 0 && (
                <div>
                  <dt>Devuelto</dt>
                  <dd>−{soles(r.devuelto)}</dd>
                </div>
              )}
              <div>
                <dt>IGV (lo paga CAYLA)</dt>
                <dd>−{soles(r.igv)}</dd>
              </div>
              {r.comision > 0 && (
                <div>
                  <dt>Comisión del POS</dt>
                  <dd>−{soles(r.comision)}</dd>
                </div>
              )}
              {r.gastos > 0 && (
                <div>
                  <dt>Gastos suyos que pagó CAYLA</dt>
                  <dd>−{soles(r.gastos)}</dd>
                </div>
              )}
              {r.pagado > 0 && (
                <div>
                  <dt>Ya pagado</dt>
                  <dd>−{soles(r.pagado)}</dd>
                </div>
              )}
              <div className="cl-cuenta-tot">
                <dt>{aFavor ? "CLAURE te debe" : "Le debes a CLAURE"}</dt>
                <dd>{soles(Math.abs(r.saldo))}</dd>
              </div>
            </dl>
          </div>
        </section>
      </div>

      <div className="cl-dos">
        <section className="card-cayla anim-sube" aria-label="Cobrado y pagado por semana" data-guia="fin-claure.semana">
          <TituloSeccion dato={<span className="cl-tenue">últimas {semanas.length} {semanas.length === 1 ? "semana" : "semanas"}</span>}>Cobrado y pagado por semana</TituloSeccion>
          {semanas.length === 0 ? (
            <Vacio tamano="chico" icono={<Handshake />}>
              Todavía no hay semanas con cobros ni pagos.
            </Vacio>
          ) : (
            <>
              <p className="cl-ley">
                <span>
                  <MuestraTramo color="var(--color-verde)" />
                  Cobrado
                </span>
                <span>
                  <MuestraTramo color="var(--color-pizarra)" />
                  Pagado a CLAURE
                </span>
              </p>
              <div className="cl-sem" role="img" aria-label={`Cobrado y pagado a CLAURE, ${semanas.map((s) => `semana del ${fechaDiaMes(s.lunes)}: cobrado ${solesRedondo(s.cobrado)}, pagado ${solesRedondo(s.pagado)}`).join("; ")}`}>
                {semanas.map((s, i) => (
                  <div key={s.lunes}>
                    <div className="cl-sem-bb">
                      <i style={{ ["--c" as string]: "var(--color-verde)", ["--h" as string]: `${(s.cobrado / maximoSemana) * 100}%`, animationDelay: `${i * 70}ms` } as CSSProperties} title={`Cobrado ${solesRedondo(s.cobrado)}`} />
                      <i style={{ ["--c" as string]: "var(--color-pizarra)", ["--h" as string]: `${(s.pagado / maximoSemana) * 100}%`, animationDelay: `${i * 70 + 40}ms` } as CSSProperties} title={`Pagado ${solesRedondo(s.pagado)}`} />
                    </div>
                    <small>{fechaDiaMes(s.lunes)}</small>
                  </div>
                ))}
              </div>
              <span className="cl-tenue">
                {aFavor ? "Se le pagó de más:" : "Hoy se le deben"} <b className="cl-num text-tinta">{soles(Math.abs(r.saldo))}</b>
                {aFavor ? " a favor de CAYLA" : ""}: lo cobrado menos devuelto, IGV, comisión, gastos suyos y lo ya pagado.
              </span>
            </>
          )}
        </section>

        <section className="card-cayla anim-sube" aria-label="Lo que ya se le pagó" data-guia="fin-claure.pagos">
          <TituloSeccion accion={esLider ? <BotonPagarClaure montoSugerido={montoSugerido} conGuia={false} /> : undefined}>Lo que ya se le pagó</TituloSeccion>
          {ultimosPagos.length === 0 ? (
            <Vacio tamano="chico" icono={<Handshake />}>
              {esLider ? "Todavía no se le pagó nada. Cuando le pases la plata a Claudia, regístralo aquí: sale de un banco de CAYLA y baja lo que se le debe." : "Todavía no se le pagó nada. El pago a Claudia lo registra el líder."}
            </Vacio>
          ) : (
            <ul className="cl-mov" role="list">
              {ultimosPagos.slice(0, PAGOS_A_LA_VISTA).map((p) => (
                <li key={p.clave}>
                  <span className="cl-f">{fechaCortaIso(p.fecha)}</span>
                  <div>
                    <b>{p.titulo}</b>
                    <small>{p.detalle}</small>
                  </div>
                  <span className="cl-m">{soles(p.bruto)}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="cl-llena">
            <div>
              <EnlaceVer onClick={() => setHistorial({ filtro: "todo", periodo: "mes" })}>Ver historial completo</EnlaceVer>
            </div>
          </div>
        </section>
      </div>

      <p {...entra(8)} className="nota-cayla anim-entra">
        {NOTA_CLAURE} {gastos.length > 0 ? NOTA_GASTOS_CLAURE : ""} {NOTA_PAGOS_CLAURE}
      </p>

      {historial && <HistorialClaure libro={libro} hoy={hoy} filtroInicial={historial.filtro} periodoInicial={historial.periodo} onCerrar={() => setHistorial(null)} />}
    </div>
  );
}
