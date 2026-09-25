"use client";

import { useState, type CSSProperties } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Chip } from "@/components/ui/Chip";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { CabeceraReportes } from "@/components/finanzas/CabeceraReportes";
import { CabeceraBloque, PieTabla, SelectFin, Superficie, TituloDeTarjeta } from "@/components/finanzas/kit";
import { SaldosArranqueModal } from "@/components/finanzas/SaldosArranqueModal";
import {
  agrupar,
  causaCorta,
  cifraChequeo,
  cortesDisponibles,
  csvBalance,
  cuentaLinea,
  enlaceDeCausa,
  iconoChequeo,
  motivoNoCuadra,
  nombreLinea,
  notaLinea,
  situacion,
  solesBalance,
  textoRinde,
  tituloChequeo,
  tituloCorte,
  type Chequeo,
  type Enlace,
  type LineaBalance,
  type LineaPropuesta,
  type SaldoInicial,
  type UnidadBalance,
} from "@/lib/balance-reglas";

// Finanzas ▸ Reportes ▸ Balance (ADR-0195 F7; ADR-0198), dibujado como el spike aprobado (`vista-reportes.js` →
// `vistaBalance`): cabecera «¿Cuánto vale CAYLA?» → la tarjeta «Antes de dibujarlo, el sistema lo comprueba» con cada
// cuenta por dos caminos → el Balance (lo que tiene | lo que debe + lo que es tuyo) SOLO si todo cuadra; si no, la guía
// que dice qué no cuadra, por cuánto y dónde se arregla → lo que es de cada tienda → la nota. Con una tienda (la
// colaboradora, o el líder con «Ver»), lo que es de esa tienda y cuánto rinde. La pantalla no calcula plata: todo viene de
// la base (`fn_conciliacion_contable`, `fn_balance_general`, `fn_balance_por_tienda`).

const entra = (i: number, clase = "") => ({
  className: `anim-entra ${clase}`.trim(),
  style: { ["--i" as string]: i } as CSSProperties,
});

export function BalancePanel({
  esLider,
  hoy,
  corte,
  ver,
  chequeos,
  lineas,
  unidades,
  saldos,
  propuestaArranque,
  tiendaNombre,
  fallas,
}: {
  esLider: boolean;
  hoy: string;
  corte: string;
  /** «cayla» (el líder, CAYLA entera) o el id de la tienda que se mira. */
  ver: string;
  chequeos: Chequeo[];
  lineas: LineaBalance[];
  unidades: UnidadBalance[];
  saldos: SaldoInicial[];
  /** La propuesta de los saldos de arranque ya leída (opcional; si no viene, el modal la pide). */
  propuestaArranque?: LineaPropuesta[] | null;
  tiendaNombre: string;
  fallas: string[];
}) {
  const router = useRouter();
  const ruta = usePathname();
  const params = useSearchParams();
  const [arranqueAbierto, setArranqueAbierto] = useState(false);

  const verCayla = esLider && ver === "cayla";
  const unidad = verCayla ? null : (unidades.find((u) => u.ubicacionId === ver) ?? unidades[0] ?? null);
  const arranque = chequeos.find((c) => c.arranque)?.arranque ?? saldos.find((s) => s.vigente)?.fecha ?? null;
  const cortes = cortesDisponibles(hoy, esLider ? arranque : null);

  const ir = (cambios: Record<string, string | null>) => {
    const p = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(cambios)) {
      if (v === null) p.delete(k);
      else p.set(k, v);
    }
    router.push(`${ruta}?${p.toString()}`, { scroll: false });
  };

  const descargar = () => {
    const url = URL.createObjectURL(
      new Blob([csvBalance(verCayla ? lineas : [], verCayla ? chequeos : [], verCayla ? unidades : unidad ? [unidad] : [], corte)], {
        type: "text/csv;charset=utf-8",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `balance-${corte}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const selectorCorte = (
    <SelectFin className="w-auto min-w-[190px]" value={corte} onChange={(e) => ir({ corte: e.target.value === hoy ? null : e.target.value })} aria-label="Fecha del Balance">
      {cortes.some((c) => c.valor === corte) ? null : <option value={corte}>{tituloCorte(corte, hoy)}</option>}
      {cortes.map((c) => (
        <option key={c.valor} value={c.valor}>
          {c.texto}
        </option>
      ))}
    </SelectFin>
  );

  return (
    <div className="space-y-6">
      <CabeceraReportes
        pestana="balance"
        titulo={verCayla ? "¿Cuánto vale CAYLA?" : `¿Cuánto tiene invertido ${nombreCortoTienda(unidad?.nombre ?? tiendaNombre)}?`}
        bajada={
          verCayla
            ? "Lo que CAYLA tiene, contra lo que debe y lo que es tuyo."
            : "Lo que es de la tienda: su caja, su mercadería, sus muebles y su parte de lo que se debe. El banco y el capital son de CAYLA entera."
        }
        acciones={
          <>
            {esLider ? (
              <label className="fin-ver">
                <span className="label-cayla text-[11px] text-taupe">Ver</span>
                <SelectFin value={ver} onChange={(e) => ir({ ver: e.target.value === "cayla" ? null : e.target.value })} aria-label="Qué mirar">
                  <option value="cayla">CAYLA entera</option>
                  {unidades.map((u) => (
                    <option key={u.ubicacionId} value={u.ubicacionId}>
                      {u.nombre}
                    </option>
                  ))}
                </SelectFin>
              </label>
            ) : (
              <Chip versalitas={false}>{tiendaNombre}</Chip>
            )}
            {esLider && verCayla && (
              <button type="button" className="btn-cayla btn-secundario" onClick={() => setArranqueAbierto(true)}>
                Saldos de arranque
              </button>
            )}
            <button type="button" className="btn-cayla btn-secundario" onClick={descargar}>
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

      {verCayla ? (
        <VistaCayla
          hoy={hoy}
          corte={corte}
          chequeos={chequeos}
          lineas={lineas}
          unidades={unidades}
          selectorCorte={selectorCorte}
          onArranque={() => setArranqueAbierto(true)}
        />
      ) : (
        <VistaTienda unidad={unidad} hoy={hoy} corte={corte} selectorCorte={selectorCorte} esLider={esLider} />
      )}

      {arranqueAbierto && <SaldosArranqueModal hoy={hoy} arranque={arranque} saldos={saldos} propuestaInicial={propuestaArranque} onCerrar={() => setArranqueAbierto(false)} />}
    </div>
  );
}

const minuscula = (t: string) => t.charAt(0).toLowerCase() + t.slice(1);

/** «Tienda Trujillo» → «Trujillo» (el título ya dice qué es). */
const nombreCortoTienda = (n: string) => n.replace(/^Tienda\s+/i, "");

// ---- CAYLA entera ---------------------------------------------------------------------------------------------------------

function VistaCayla({
  hoy,
  corte,
  chequeos,
  lineas,
  unidades,
  selectorCorte,
  onArranque,
}: {
  hoy: string;
  corte: string;
  chequeos: Chequeo[];
  lineas: LineaBalance[];
  unidades: UnidadBalance[];
  selectorCorte: React.ReactNode;
  onArranque: () => void;
}) {
  const sit = situacion(chequeos);
  const visibles = chequeos.filter((c) => c.clave !== "corte");

  return (
    <>
      <div {...entra(1)}>
        <Superficie pad className="fin-balance-tarjeta">
          <CabeceraBloque
            titulo="Antes de dibujarlo, el sistema lo comprueba"
            bajada="Cada cuenta se calcula por dos caminos distintos. Si no coinciden, el Balance no se muestra: un número falso es peor que ninguno."
          >
            {selectorCorte}
          </CabeceraBloque>
          {sit.tipo === "sin_arranque" ? (
            <ul className="fin-chequeos">
              <FilaChequeo c={visibles[0] ?? CHEQUEO_SIN_ARRANQUE} onArranque={onArranque} />
            </ul>
          ) : (
            <ul className="fin-chequeos">
              {visibles.map((c) => (
                <FilaChequeo key={c.clave} c={c} onArranque={onArranque} />
              ))}
            </ul>
          )}
        </Superficie>
      </div>

      <div {...entra(2)}>
        {sit.tipo === "cuadra" ? (
          <BalanceCuadra lineas={lineas} corte={corte} hoy={hoy} />
        ) : sit.tipo === "no_cuadra" ? (
          <GuiaNoCuadra bloqueos={sit.bloqueos} onArranque={onArranque} />
        ) : sit.tipo === "antes_del_arranque" ? (
          <div className="fin-guia">
            <p className="label-cayla text-[11px] text-taupe">Antes del arranque</p>
            <h2>No hay Balance antes del día en que CAYLA empezó a usar el sistema</h2>
            <p>
              El punto de partida es el {sit.arranque ? tituloCorte(sit.arranque, hoy).replace(/^Al /, "") : "día de arranque"}. Elige una fecha desde ahí.
            </p>
          </div>
        ) : (
          <div className="fin-guia">
            <p className="label-cayla text-[11px] text-rojo">Falta el punto de partida</p>
            <h2>Registra lo que CAYLA tenía el día que empezó a usar el sistema</h2>
            <p>
              El sistema ya sabe lo que hay en cada cajón, la mercadería, los muebles y lo que se debe a cada proveedor. Lo que no sabe lo
              pones tú, una sola vez, con el contador: lo que había en el banco, lo que se le debía a SUNAT, lo que le prestaste a CAYLA,
              el capital y las utilidades acumuladas hasta ese día.
            </p>
            <div className="fin-botones mt-5 justify-start">
              <button type="button" className="btn-cayla btn-primario" onClick={onArranque}>
                Registrar saldos de arranque
              </button>
            </div>
          </div>
        )}
      </div>

      {unidades.length > 0 && (
        <div {...entra(3)}>
          <TablaTiendas unidades={unidades} />
        </div>
      )}

      <div {...entra(4, "nota-cayla")}>
        El <b>capital</b> se registra una vez, al arrancar (lo que pusiste en el negocio), con las utilidades que ya traía. Nunca se
        calcula como «lo que falta para que cuadre»: si así fuera, el Balance cuadraría siempre y no probaría nada. Por tienda se
        muestra <b>lo que es suyo</b> (su cajón, su mercadería, sus muebles y su parte de las facturas); el banco, el capital y el IGV
        son de CAYLA entera y no se reparten.
      </div>
    </>
  );
}

const CHEQUEO_SIN_ARRANQUE: Chequeo = {
  orden: 0,
  clave: "arranque",
  titulo: "Saldos de arranque",
  contra: "Lo que CAYLA tenía el día que empezó a usar el sistema: bancos, deudas y capital",
  diario: null,
  otro: null,
  diferencia: null,
  estado: "falta",
  bloquea: true,
  causas: [],
  arranque: null,
  corte: "",
};

function FilaChequeo({ c, onArranque }: { c: Chequeo; onArranque: () => void }) {
  const ic = iconoChequeo(c.estado);
  const mostrarCausas = c.estado !== "ok" && c.causas.length > 0;
  return (
    <li data-estado={c.estado}>
      <span className="fin-ok-ic" data-tono={ic.tono} aria-label={ic.texto} title={ic.texto}>
        {ic.signo}
      </span>
      <div className="min-w-0">
        <b>{tituloChequeo(c)}</b>
        <p>{c.contra}</p>
        {mostrarCausas && (
          <ul className="fin-causas">
            {c.causas.map((x) => (
              <li key={x.clave}>
                <span>
                  {x.texto}
                  {!x.acepta && <EnlaceCausa enlace={enlaceDeCausa(x.clave)} onArranque={onArranque} />}
                </span>
                <b>{solesBalance(x.monto)}</b>
              </li>
            ))}
          </ul>
        )}
      </div>
      <span>{cifraChequeo(c)}</span>
    </li>
  );
}

function EnlaceCausa({ enlace, onArranque }: { enlace: Enlace | null; onArranque: () => void }) {
  if (!enlace) return null;
  return enlace.href ? (
    <>
      {" · "}
      <Link href={enlace.href} className="btn-enlace">
        {enlace.texto}
      </Link>
    </>
  ) : (
    <>
      {" · "}
      <button type="button" className="btn-enlace" onClick={onArranque}>
        {enlace.texto}
      </button>
    </>
  );
}

function BalanceCuadra({ lineas, corte, hoy }: { lineas: LineaBalance[]; corte: string; hoy: string }) {
  const g = agrupar(lineas);
  return (
    <Superficie pad className="fin-balance-tarjeta">
      <CabeceraBloque titulo={tituloCorte(corte, hoy)} bajada="Lo que CAYLA tiene, contra lo que debe y lo que es tuyo.">
        <Chip tono="verde">cuadra</Chip>
      </CabeceraBloque>
      <div className="fin-balance">
        <div>
          <h3>Lo que tiene</h3>
          <ul>
            {g.tiene.map((l) => (
              <LineaFila key={`${l.seccion}-${l.cuenta}`} l={l} />
            ))}
            <li className="fin-balance-tot">
              <span />
              <span>Total</span>
              <span>{solesBalance(g.totalTiene)}</span>
            </li>
          </ul>
        </div>
        <div>
          <h3>Lo que debe</h3>
          <ul>
            {g.debe.map((l) => (
              <LineaFila key={`${l.seccion}-${l.cuenta}`} l={l} />
            ))}
            <li className="fin-balance-tot">
              <span />
              <span>Total</span>
              <span>{solesBalance(g.totalDebe)}</span>
            </li>
          </ul>
          <h3>Lo que es tuyo</h3>
          <ul>
            {g.tuyo.map((l) => (
              <LineaFila key={`${l.seccion}-${l.cuenta}`} l={l} />
            ))}
            <li className="fin-balance-tot">
              <span />
              <span>Deudas + lo tuyo</span>
              <span>{solesBalance(g.totalDebe + g.totalTuyo)}</span>
            </li>
          </ul>
        </div>
      </div>
    </Superficie>
  );
}

function LineaFila({ l }: { l: LineaBalance }) {
  const nota = notaLinea(l);
  return (
    <li>
      <span>{cuentaLinea(l)}</span>
      <span>
        {nombreLinea(l)}
        {nota && <small>{nota}</small>}
      </span>
      <span>{solesBalance(l.monto)}</span>
    </li>
  );
}

function GuiaNoCuadra({ bloqueos, onArranque }: { bloqueos: Chequeo[]; onArranque: () => void }) {
  const m = motivoNoCuadra(bloqueos);
  const dif = bloqueos[0]?.diferencia;
  return (
    <div className="fin-guia">
      <p className="label-cayla text-[11px] text-rojo">No cuadra</p>
      <h2>El Balance no se muestra hasta resolver la diferencia</h2>
      <p>
        {m.texto}
        {dif != null && bloqueos[0]?.clave !== "diario" && (
          <>
            {" "}
            Diferencia: <b className="text-tinta">{solesBalance(Math.abs(dif))}</b>.
          </>
        )}
        {m.otros > 0 && ` Y ${m.otros === 1 ? "una cosa más" : `${m.otros} cosas más`} que no cuadra${m.otros === 1 ? "" : "n"} (arriba).`}
      </p>
      {m.causa && (
        <div className="fin-franja">
          <span>
            <b>{m.causa.clave === "sin_explicar" ? "Todavía sin causa:" : "Causa probable:"}</b> {minuscula(causaCorta(m.causa.texto))}, por{" "}
            {solesBalance(Math.abs(m.causa.monto))}.
          </span>
          <EnlaceCausa enlace={m.enlace} onArranque={onArranque} />
        </div>
      )}
    </div>
  );
}

function TablaTiendas({ unidades }: { unidades: UnidadBalance[] }) {
  const tiendas = unidades.filter((u) => u.tipo === "tienda");
  const mes = unidades[0]?.desde ? nombreMes(unidades[0].desde) : "el mes";
  return (
    <Superficie>
      <TituloDeTarjeta
        titulo="Lo que es de cada tienda"
        bajada={`Cuánta plata tiene metida cada una y cuánto le rindió en ${mes}: la utilidad del mes ÷ lo invertido.`}
      />
      <div className="fin-tabla-wrap">
        <table className="fin-tabla">
          <thead>
            <tr>
              <th scope="col">Tienda</th>
              <th scope="col" className="fin-num">
                Cajón y caja fuerte
              </th>
              <th scope="col" className="fin-num">
                Mercadería
              </th>
              <th scope="col" className="fin-num">
                Muebles
              </th>
              <th scope="col" className="fin-num">
                Facturas por pagar
              </th>
              <th scope="col" className="fin-num">
                Invertido
              </th>
              <th scope="col" className="fin-num">
                Utilidad del mes
              </th>
              <th scope="col" className="fin-num">
                Rinde
              </th>
            </tr>
          </thead>
          <tbody>
            {unidades.map((u) => (
              <tr key={u.ubicacionId}>
                <td data-l="Tienda">
                  <b>{u.nombre}</b>
                </td>
                <td className="fin-num" data-l="Cajón y caja fuerte">
                  {u.caja == null ? <span className="text-taupe">lo ve quien cierra</span> : solesBalance(u.caja)}
                </td>
                <td className="fin-num" data-l="Mercadería">
                  {solesBalance(u.mercaderia)}
                </td>
                <td className="fin-num" data-l="Muebles">
                  {solesBalance(u.activosFijos)}
                </td>
                <td className="fin-num" data-l="Facturas por pagar">
                  {u.facturasPorPagar ? `−${solesBalance(u.facturasPorPagar)}` : solesBalance(0)}
                </td>
                <td className="fin-num" data-l="Invertido">
                  <b>{solesBalance(u.invertido)}</b>
                </td>
                <td className={`fin-num ${u.utilidadMes < 0 ? "text-rojo-profundo" : ""}`} data-l="Utilidad del mes">
                  {solesBalance(u.utilidadMes)}
                </td>
                <td className="fin-num" data-l="Rinde">
                  {u.tipo === "taller" ? <span className="text-taupe">no vende</span> : textoRinde(u.rinde)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <PieTabla>
        <span>
          {tiendas.length > 1 ? "Compara cuánto rinde cada sol metido en cada tienda. " : ""}
          El banco, el capital y el IGV son de CAYLA entera: no se reparten.
        </span>
      </PieTabla>
    </Superficie>
  );
}

// ---- Una tienda ------------------------------------------------------------------------------------------------------------

function VistaTienda({
  unidad,
  hoy,
  corte,
  selectorCorte,
  esLider,
}: {
  unidad: UnidadBalance | null;
  hoy: string;
  corte: string;
  selectorCorte: React.ReactNode;
  esLider: boolean;
}) {
  if (!unidad) {
    return (
      <div className="fin-guia">
        <p className="label-cayla text-[11px] text-taupe">Sin datos</p>
        <h2>No hay una tienda que mostrar</h2>
        <p>Lo que es de una tienda se ve desde su sede. Si trabajas en una, elígela arriba.</p>
      </div>
    );
  }
  const mes = nombreMes(unidad.desde);
  const enCurso = unidad.hasta === hoy;
  return (
    <>
      <section className="fin-cifras">
        <TarjetaCifra compacta etiqueta="Invertido" valor={solesBalance(unidad.invertido)} {...entra(1)}>
          lo que tiene menos lo que debe
        </TarjetaCifra>
        <TarjetaCifra
          compacta
          etiqueta={`Utilidad de ${mes}`}
          valor={solesBalance(unidad.utilidadMes)}
          tono={unidad.utilidadMes < 0 ? "text-rojo" : undefined}
          {...entra(2)}
        >
          {enCurso ? "a la fecha" : "el mes entero"}
          {!unidad.planillaVisible ? " · sin planilla" : ""}
        </TarjetaCifra>
        <TarjetaCifra compacta etiqueta="Rinde" valor={unidad.tipo === "taller" ? "—" : textoRinde(unidad.rinde).replace(" al mes", "")} {...entra(3)}>
          {unidad.tipo === "taller" ? "el Taller no vende" : "de lo invertido, al mes"}
        </TarjetaCifra>
        <TarjetaCifra compacta etiqueta={`Ventas de ${mes}`} valor={solesBalance(unidad.ventasMes)} {...entra(4)}>
          sin IGV
        </TarjetaCifra>
      </section>

      <div {...entra(5)}>
        <Superficie pad className="fin-balance-tarjeta">
          <CabeceraBloque titulo={tituloCorte(corte, hoy)} bajada={`Lo que es de ${unidad.nombre}.`}>
            {selectorCorte}
          </CabeceraBloque>
          <div className="fin-balance">
            <div>
              <h3>Lo que tiene</h3>
              <ul>
                <li>
                  <span>101</span>
                  <span>
                    Cajón y caja fuerte
                    {unidad.caja == null && <small>la caja está abierta: su cifra la ve quien la cierra</small>}
                  </span>
                  <span>{unidad.caja == null ? "—" : solesBalance(unidad.caja)}</span>
                </li>
                <li>
                  <span>201</span>
                  <span>Mercadería</span>
                  <span>{solesBalance(unidad.mercaderia)}</span>
                </li>
                <li>
                  <span>33</span>
                  <span>
                    Muebles, equipos y mejoras
                    {unidad.activosDepreciacion > 0 && (
                      <small>
                        costaron {solesBalance(unidad.activosCosto)}, menos {solesBalance(unidad.activosDepreciacion)} depreciados
                      </small>
                    )}
                  </span>
                  <span>{solesBalance(unidad.activosFijos)}</span>
                </li>
                <li className="fin-balance-tot">
                  <span />
                  <span>Total</span>
                  <span>{solesBalance((unidad.caja ?? 0) + unidad.mercaderia + unidad.activosFijos)}</span>
                </li>
              </ul>
            </div>
            <div>
              <h3>Lo que debe</h3>
              <ul>
                <li>
                  <span>421</span>
                  <span>
                    Su parte de las facturas por pagar
                    <small>el reparto de cada factura entre las tiendas</small>
                  </span>
                  <span>{solesBalance(unidad.facturasPorPagar)}</span>
                </li>
                <li className="fin-balance-tot">
                  <span />
                  <span>Total</span>
                  <span>{solesBalance(unidad.facturasPorPagar)}</span>
                </li>
              </ul>
              <h3>Invertido en la tienda</h3>
              <ul>
                <li className="fin-balance-tot">
                  <span />
                  <span>Lo que tiene − lo que debe</span>
                  <span>{solesBalance(unidad.invertido)}</span>
                </li>
              </ul>
            </div>
          </div>
        </Superficie>
      </div>

      <div {...entra(6, "nota-cayla")}>
        No es un Balance completo: el <b>banco</b>, el <b>capital</b> y el <b>IGV</b> son de CAYLA entera y no se reparten entre las
        tiendas (repartirlos sería inventar un número). Aquí está lo que es de la tienda y cuánto le rinde: la utilidad del mes (Estado
        de resultados) ÷ lo invertido.
        {!unidad.planillaVisible && " La utilidad no descuenta la planilla: esa la ve quien tiene acceso en Dynamic."}
        {esLider && " El Balance de CAYLA entera, en «Ver»."}
      </div>
    </>
  );
}

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const nombreMes = (iso: string) => MESES[Number(iso.slice(5, 7)) - 1] ?? "el mes";
