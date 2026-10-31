"use client";

import { useState, type CSSProperties } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Chip } from "@/components/ui/Chip";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { Balanza } from "@/components/finanzas/estados/Balanza";
import { BotonVerMas, FilasDeMas } from "@/components/ui/VerMas";
import { CabeceraBloque, PieTabla, SelectFin, Superficie, TituloDeTarjeta } from "@/components/finanzas/kit";
import { SaldosArranqueModal } from "@/components/finanzas/SaldosArranqueModal";
import {
  agrupar,
  causaCorta,
  cifraChequeo,
  cortesDisponibles,
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
import { Boton } from "@/components/ui/campos";
import { Vacio } from "@/components/ui/Vacio";
import { CalendarX, Flag, Scale, Store } from "lucide-react";

// Estados financieros ▸ ¿Cuánto vale CAYLA? (balance general; ADR-0195 F7, ADR-0198, ADR-0585). Si todo cuadra: la respuesta (lo tuyo) y la
// balanza (lo que tiene contra lo que debe y lo tuyo, en grupos que se tocan), dos medidores (si te cobraran todo hoy; para cuántos meses de
// venta hay mercadería), lo que es de cada sede y, plegados, cómo se comprobó y el balance formal (sin cuentas: van en lo que se descarga).
// Si no cuadra, la comprobación y la guía de qué falta siguen a la vista: el Balance no se dibuja (un número falso es peor que ninguno). Con
// una sede, lo que es de ella y cuánto rinde. La pantalla no calcula plata: todo viene de la base (`fn_conciliacion_contable`,
// `fn_balance_general`, `fn_balance_por_tienda`).

const entra = (i: number, clase = "") => ({
  className: `anim-entra ${clase}`.trim(),
  style: { ["--i" as string]: i } as CSSProperties,
});

export function BalancePanel({
  esLider,
  veTodo,
  hoy,
  corte,
  ver,
  chequeos,
  lineas,
  unidades,
  saldos,
  propuestaArranque,
  costoDelMes,
  fallas,
}: {
  /** Solo el líder registra los saldos de arranque (`registrar_saldo_inicial`). */
  esLider: boolean;
  /** Ve el Balance de CAYLA entera y el de cualquier tienda (ADR-0585: el líder o quien tiene Estados financieros). */
  veTodo: boolean;
  hoy: string;
  corte: string;
  /** «cayla» (CAYLA entera, quien ve todo) o el id de la tienda que se mira. */
  ver: string;
  chequeos: Chequeo[];
  lineas: LineaBalance[];
  unidades: UnidadBalance[];
  saldos: SaldoInicial[];
  /** La propuesta de los saldos de arranque ya leída (opcional; si no viene, el modal la pide). */
  propuestaArranque?: LineaPropuesta[] | null;
  /** Lo que costó lo vendido en el último mes completo (CAYLA): para cuántos meses de venta alcanza la mercadería. */
  costoDelMes: number | null;
  fallas: string[];
}) {
  const router = useRouter();
  const ruta = usePathname();
  const params = useSearchParams();
  const [arranqueAbierto, setArranqueAbierto] = useState(false);

  const verCayla = veTodo && ver === "cayla";
  const unidad = verCayla ? null : (unidades.find((u) => u.ubicacionId === ver) ?? unidades[0] ?? null);
  const arranque = chequeos.find((c) => c.arranque)?.arranque ?? saldos.find((s) => s.vigente)?.fecha ?? null;
  const cortes = cortesDisponibles(hoy, veTodo ? arranque : null);

  const ir = (cambios: Record<string, string | null>) => {
    const p = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(cambios)) {
      if (v === null) p.delete(k);
      else p.set(k, v);
    }
    router.push(`${ruta}?${p.toString()}`, { scroll: false });
  };



  const selectorCorte = (
    <SelectFin
      etiqueta="Fecha del Balance"
      className="w-fit min-w-[190px]"
      valor={corte}
      onValor={(v) => ir({ corte: v === hoy ? null : v })}
      opciones={[...(cortes.some((c) => c.valor === corte) ? [] : [{ valor: corte, texto: tituloCorte(corte, hoy) }]), ...cortes]}
    />
  );

  return (
    <div className="space-y-6">
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
          costoDelMes={costoDelMes}
          esLider={esLider}
          onArranque={() => setArranqueAbierto(true)}
        />
      ) : (
        <VistaTienda unidad={unidad} hoy={hoy} corte={corte} selectorCorte={selectorCorte} veTodo={veTodo} />
      )}

      {arranqueAbierto && <SaldosArranqueModal hoy={hoy} arranque={arranque} saldos={saldos} propuestaInicial={propuestaArranque} onCerrar={() => setArranqueAbierto(false)} />}
    </div>
  );
}

const minuscula = (t: string) => t.charAt(0).toLowerCase() + t.slice(1);


// ---- CAYLA entera ---------------------------------------------------------------------------------------------------------

function VistaCayla({
  hoy,
  corte,
  chequeos,
  lineas,
  unidades,
  selectorCorte,
  costoDelMes,
  esLider,
  onArranque,
}: {
  hoy: string;
  corte: string;
  chequeos: Chequeo[];
  lineas: LineaBalance[];
  unidades: UnidadBalance[];
  selectorCorte: React.ReactNode;
  costoDelMes: number | null;
  esLider: boolean;
  onArranque: () => void;
}) {
  const sit = situacion(chequeos);
  const visibles = chequeos.filter((c) => c.clave !== "corte");
  const [verFormal, setVerFormal] = useState(false);
  if (sit.tipo === "cuadra") {
    const comprobacion = (
      <Superficie pad className="fin-balance-tarjeta">
        <CabeceraBloque titulo="Antes de dibujarlo, el sistema lo comprueba" bajada="Cada cuenta se calcula por dos caminos distintos. Si no coinciden, el Balance no se muestra: un número falso es peor que ninguno." />
        <ul className="fin-chequeos" data-guia="fin-balance.chequeos">
          {visibles.map((c) => (
            <FilaChequeo key={c.clave} c={c} onArranque={onArranque} />
          ))}
        </ul>
      </Superficie>
    );
    return (
      <>
        <Balanza lineas={lineas} corte={corte} hoy={hoy} selectorCorte={selectorCorte} costoDelMes={costoDelMes} />
        {unidades.length > 0 && (
          <div {...entra(3)} data-guia="fin-balance.tiendas">
            <TablaTiendas unidades={unidades} />
          </div>
        )}
        <section className="space-y-4">
          <BotonVerMas abierto={verFormal} onCambiar={setVerFormal} texto="Ver el formato formal y cómo se comprobó" forma="enlace" controla="fin-vale-formal" data-guia="fin-vale.formal" />
          <FilasDeMas abierto={verFormal} id="fin-vale-formal" className="space-y-4">
            {esLider && (
              <div className="flex flex-wrap items-center gap-2.5">
                <button type="button" className="btn-cayla btn-secundario" onClick={onArranque} data-guia="fin-balance.arranque">
                  Saldos de arranque
                </button>
              </div>
            )}
            {comprobacion}
            <div data-guia="fin-balance.resultado">
              <BalanceCuadra lineas={lineas} corte={corte} hoy={hoy} />
            </div>
            <div className="nota-cayla" data-guia="fin-balance.nota">
              El <b>capital</b> se registra una vez, al arrancar (lo que pusiste en el negocio), con las utilidades que ya traía. Nunca se
              calcula como «lo que falta para que cuadre»: si así fuera, el Balance cuadraría siempre y no probaría nada. Por sede se muestra
              <b> lo que es suyo</b> (su cajón, su mercadería, sus muebles y las facturas que pidió, enteras); el banco, el capital y el IGV son de
              CAYLA entera y no se reparten.
            </div>
          </FilasDeMas>
        </section>
      </>
    );
  }

  return (
    <>
      <div {...entra(1)} data-guia="fin-balance.chequeos">
        <Superficie pad className="fin-balance-tarjeta">
          <CabeceraBloque
            titulo="Antes de dibujarlo, el sistema lo comprueba"
            bajada="Cada cuenta se calcula por dos caminos distintos. Si no coinciden, el Balance no se muestra: un número falso es peor que ninguno."
          >
            {selectorCorte}
            {esLider && (
              <button type="button" className="btn-cayla btn-secundario" onClick={onArranque} data-guia="fin-balance.arranque">
                Saldos de arranque
              </button>
            )}
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

      <div {...entra(2)} data-guia="fin-balance.resultado">
        {sit.tipo === "no_cuadra" ? (
          <GuiaNoCuadra bloqueos={sit.bloqueos} onArranque={onArranque} />
        ) : sit.tipo === "antes_del_arranque" ? (
          <Superficie>
            <Vacio icono={<CalendarX />} titulo="No hay Balance antes del día en que CAYLA empezó a usar el sistema">
              El punto de partida es el {sit.arranque ? tituloCorte(sit.arranque, hoy).replace(/^Al /, "") : "día de arranque"}. Elige una fecha desde ahí.
            </Vacio>
          </Superficie>
        ) : (
          <Superficie>
            <Vacio
              icono={<Flag />}
              titulo="Falta el punto de partida: registra lo que CAYLA tenía el día que empezó a usar el sistema"
              acciones={
                <Boton type="button" peso="primario" onClick={onArranque}>
                  Registrar saldos de arranque
                </Boton>
              }
            >
              El sistema ya sabe lo que hay en cada cajón, la mercadería, los muebles y lo que se debe a cada proveedor. Lo que no sabe lo
              pones tú, una sola vez, con el contador: lo que había en el banco, lo que se le debía a SUNAT, lo que le prestaste a CAYLA,
              el capital y las utilidades acumuladas hasta ese día.
            </Vacio>
          </Superficie>
        )}
      </div>

      {unidades.length > 0 && (
        <div {...entra(3)} data-guia="fin-balance.tiendas">
          <TablaTiendas unidades={unidades} />
        </div>
      )}

      <div {...entra(4, "nota-cayla")} data-guia="fin-balance.nota">
        El <b>capital</b> se registra una vez, al arrancar (lo que pusiste en el negocio), con las utilidades que ya traía. Nunca se
        calcula como «lo que falta para que cuadre»: si así fuera, el Balance cuadraría siempre y no probaría nada. Por tienda se
        muestra <b>lo que es suyo</b> (su cajón, su mercadería, sus muebles y las facturas que pidió, enteras); el banco, el capital y el IGV
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
      <span />
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
    <Superficie>
      <Vacio icono={<Scale />} titulo="No cuadra: el Balance no se muestra hasta resolver la diferencia">
        {m.texto}
        {dif != null && bloqueos[0]?.clave !== "diario" && (
          <>
            {" "}
            Diferencia: <b className="text-tinta">{solesBalance(Math.abs(dif))}</b>.
          </>
        )}
        {m.otros > 0 && ` Y ${m.otros === 1 ? "una cosa más" : `${m.otros} cosas más`} que no cuadra${m.otros === 1 ? "" : "n"} (arriba).`}
      </Vacio>
      {m.causa && (
        <div className="fin-franja mx-5 mb-5">
          <span>
            <b>{m.causa.clave === "sin_explicar" ? "Todavía sin causa:" : "Causa probable:"}</b> {minuscula(causaCorta(m.causa.texto))}, por{" "}
            {solesBalance(Math.abs(m.causa.monto))}.
          </span>
          <EnlaceCausa enlace={m.enlace} onArranque={onArranque} />
        </div>
      )}
    </Superficie>
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
  veTodo,
}: {
  unidad: UnidadBalance | null;
  hoy: string;
  corte: string;
  selectorCorte: React.ReactNode;
  veTodo: boolean;
}) {
  if (!unidad) {
    return (
      <Superficie>
        <Vacio icono={<Store />} titulo="No hay una tienda que mostrar">
          Lo que es de una tienda se ve desde su sede. Si trabajas en una, elígela arriba.
        </Vacio>
      </Superficie>
    );
  }
  const mes = nombreMes(unidad.desde);
  const enCurso = unidad.hasta === hoy;
  return (
    <>
      <section className="fin-cifras" data-guia="fin-balance.tienda-cifras">
        <TarjetaCifra etiqueta="Invertido" valor={solesBalance(unidad.invertido)} {...entra(1)}>
          lo que tiene menos lo que debe
        </TarjetaCifra>
        <TarjetaCifra
          etiqueta={`Utilidad de ${mes}`}
          valor={solesBalance(unidad.utilidadMes)}
          tono={unidad.utilidadMes < 0 ? "text-rojo" : undefined}
          {...entra(2)}
        >
          {enCurso ? "a la fecha" : "el mes entero"}
          {!unidad.planillaVisible ? " · sin planilla" : ""}
        </TarjetaCifra>
        <TarjetaCifra etiqueta="Rinde" valor={unidad.tipo === "taller" ? null : textoRinde(unidad.rinde).replace(" al mes", "")} {...entra(3)}>
          {unidad.tipo === "taller" ? "el Taller no vende" : "de lo invertido, al mes"}
        </TarjetaCifra>
        <TarjetaCifra etiqueta={`Ventas de ${mes}`} valor={solesBalance(unidad.ventasMes)} {...entra(4)}>
          sin IGV
        </TarjetaCifra>
      </section>

      <div {...entra(5)}>
        <Superficie pad className="fin-balance-tarjeta">
          <CabeceraBloque titulo={tituloCorte(corte, hoy)} bajada={`Lo que es de ${unidad.nombre}.`}>
            {selectorCorte}
          </CabeceraBloque>
          <div className="fin-balance" data-guia="fin-balance.tienda-detalle">
            <div>
              <h3>Lo que tiene</h3>
              <ul>
                <li>
                  <span />
                  <span>
                    Cajón y caja fuerte
                    {unidad.caja == null && <small>la caja está abierta: su cifra la ve quien la cierra</small>}
                  </span>
                  <span>{unidad.caja == null ? "—" : solesBalance(unidad.caja)}</span>
                </li>
                <li>
                  <span />
                  <span>Mercadería</span>
                  <span>{solesBalance(unidad.mercaderia)}</span>
                </li>
                <li>
                  <span />
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
                  <span />
                  <span>
                    Las facturas por pagar que pidió
                    <small>enteras, aunque parte de la mercadería vaya a otra tienda</small>
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

      <div {...entra(6, "nota-cayla")} data-guia="fin-balance.tienda-nota">
        No es un Balance completo: el <b>banco</b>, el <b>capital</b> y el <b>IGV</b> son de CAYLA entera y no se reparten entre las
        tiendas (repartirlos sería inventar un número). Aquí está lo que es de la tienda y cuánto le rinde: la utilidad del mes (Estado
        de resultados) ÷ lo invertido.
        {!unidad.planillaVisible && " La utilidad no descuenta la planilla: esa la ve quien tiene acceso en Dynamic."}
        {veTodo && " El Balance de CAYLA entera, eligiendo «Todas» en la barra de sedes."}
      </div>
    </>
  );
}

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const nombreMes = (iso: string) => MESES[Number(iso.slice(5, 7)) - 1] ?? "el mes";
