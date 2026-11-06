"use client";

import { useState, type CSSProperties } from "react";
import Link from "next/link";
import { Chip } from "@/components/ui/Chip";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { BarraAvance } from "@/components/ui/BarraAvance";
import { MESES_DE_MERCADERIA_ALTOS, type Medidores } from "@/lib/vale-reglas";
import { CabeceraBloque, PieTabla, Superficie, TituloDeTarjeta } from "@/components/finanzas/kit";
import { SaldosArranqueModal } from "@/components/finanzas/SaldosArranqueModal";
import {
  agrupar,
  causaCorta,
  cifraChequeo,
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
import { CalendarX, Flag, Scale } from "lucide-react";

// Estados financieros ▸ Balance general: lo que no es la cifra (ADR-0195 F7, ADR-0198, ADR-0585, ADR-0611). Si no cuadra, la comprobación y la guía de qué falta siguen a la vista: el
// Balance no se dibuja (un número falso es peor que ninguno). Si cuadra, la respuesta la dibuja `EstadoVidrio`, y aquí queda lo plegado en «Ver más» (dos preguntas, lo de cada sede, cómo
// se comprobó y los saldos de arranque). La pantalla no calcula plata: todo viene de la base (`fn_conciliacion_contable`, `fn_balance_general`,
// `fn_balance_por_tienda`).

const entra = (i: number, clase = "") => ({
  className: `anim-entra ${clase}`.trim(),
  style: { ["--i" as string]: i } as CSSProperties,
});

export function BalancePanel({
  esLider,
  hoy,
  chequeos,
  unidades,
  saldos,
  propuestaArranque,
}: {
  /** Solo el líder registra los saldos de arranque (`registrar_saldo_inicial`). */
  esLider: boolean;
  hoy: string;
  chequeos: Chequeo[];
  unidades: UnidadBalance[];
  saldos: SaldoInicial[];
  /** La propuesta de los saldos de arranque ya leída (opcional; si no viene, el modal la pide). */
  propuestaArranque?: LineaPropuesta[] | null;
}) {
  const [arranqueAbierto, setArranqueAbierto] = useState(false);
  const arranque = chequeos.find((c) => c.arranque)?.arranque ?? saldos.find((s) => s.vigente)?.fecha ?? null;

  return (
    <div className="space-y-6">
      <VistaSinCuadrar hoy={hoy} chequeos={chequeos} unidades={unidades} esLider={esLider} onArranque={() => setArranqueAbierto(true)} />
      {arranqueAbierto && <SaldosArranqueModal hoy={hoy} arranque={arranque} saldos={saldos} propuestaInicial={propuestaArranque} onCerrar={() => setArranqueAbierto(false)} />}
    </div>
  );
}

const unDecimal = (n: number) => n.toFixed(1).replace(".", ",");

/** Lo plegado cuando el Balance cuadra: dos preguntas que importan, lo que es de cada sede, cómo se comprobó y los saldos de arranque. */
export function MasDelBalance({
  esLider,
  hoy,
  chequeos,
  unidades,
  saldos,
  medidas,
}: {
  esLider: boolean;
  hoy: string;
  chequeos: Chequeo[];
  unidades: UnidadBalance[];
  saldos: SaldoInicial[];
  medidas: Medidores | null;
}) {
  const [arranqueAbierto, setArranqueAbierto] = useState(false);
  const arranque = chequeos.find((c) => c.arranque)?.arranque ?? saldos.find((s) => s.vigente)?.fecha ?? null;
  const visibles = chequeos.filter((c) => c.clave !== "corte");
  return (
    <>
      {medidas && <DosPreguntas m={medidas} />}
      {unidades.length > 0 && (
        <div data-guia="fin-balance.tiendas">
          <TablaTiendas unidades={unidades} />
        </div>
      )}
      <Superficie pad className="fin-balance-tarjeta">
        <CabeceraBloque titulo="Antes de dibujarlo, el sistema lo comprueba" bajada="Cada cuenta se calcula por dos caminos distintos. Si no coinciden, el Balance no se muestra.">
          {esLider && (
            <button type="button" className="btn-cayla btn-secundario" onClick={() => setArranqueAbierto(true)} data-guia="fin-balance.arranque">
              Saldos de arranque
            </button>
          )}
        </CabeceraBloque>
        <ul className="fin-chequeos" data-guia="fin-balance.chequeos">
          {visibles.map((c) => (
            <FilaChequeo key={c.clave} c={c} onArranque={() => setArranqueAbierto(true)} />
          ))}
        </ul>
      </Superficie>
      <div className="nota-cayla" data-guia="fin-balance.nota">
        El <b>capital</b> se registra una vez, al arrancar (lo que pusiste en el negocio), con las utilidades que ya traía. Nunca se calcula como «lo que falta para que cuadre»: si así fuera, el
        Balance cuadraría siempre y no probaría nada. Por sede se muestra <b>lo que es suyo</b> (su cajón, su mercadería, sus muebles y las facturas que pidió, enteras); el banco, el capital y el IGV
        son de CAYLA entera y no se reparten.
      </div>
      {arranqueAbierto && <SaldosArranqueModal hoy={hoy} arranque={arranque} saldos={saldos} onCerrar={() => setArranqueAbierto(false)} />}
    </>
  );
}

/** Dos medidores que traducen el Balance a una decisión. */
function DosPreguntas({ m }: { m: Medidores }) {
  return (
    <section className="grid gap-3 sm:grid-cols-2" data-guia="fin-vale.medidores">
      <TarjetaCifra etiqueta="Si te cobraran todo hoy" valor={m.cobertura === null ? null : `Cubres el ${Math.round(m.cobertura * 100)} %`}>
        {m.cobertura === null ? (
          "No debes nada a la fecha."
        ) : (
          <>
            <BarraAvance pct={Math.min(m.cobertura, 1) * 100} alto="fina" tono={m.cobertura >= 1 ? "verde" : "ambar"} decorativa />
            <span className="mt-1.5 block">
              {solesBalance(m.plataYCobros)} en plata y cobros contra {solesBalance(m.deudas)} de deudas.
            </span>
          </>
        )}
      </TarjetaCifra>
      <TarjetaCifra etiqueta="Mercadería guardada" valor={m.mesesDeMercaderia === null ? null : `${unDecimal(m.mesesDeMercaderia)} meses de venta`}>
        {m.mesesDeMercaderia === null ? (
          "Falta un mes con ventas para medirlo."
        ) : (
          <>
            <BarraAvance pct={Math.min(m.mesesDeMercaderia / (MESES_DE_MERCADERIA_ALTOS * 1.5), 1) * 100} alto="fina" tono={m.mesesDeMercaderia >= MESES_DE_MERCADERIA_ALTOS ? "ambar" : "tinta"} decorativa />
            <span className="mt-1.5 block">{solesBalance(m.mercaderia)} en stock, al ritmo de venta del último mes completo.</span>
          </>
        )}
      </TarjetaCifra>
    </section>
  );
}

const minuscula = (t: string) => t.charAt(0).toLowerCase() + t.slice(1);


// ---- CAYLA entera ---------------------------------------------------------------------------------------------------------

/** Si no cuadra, la comprobación y la guía de qué falta: el Balance no se dibuja (ADR-0198). */
function VistaSinCuadrar({
  hoy,
  chequeos,
  unidades,
  esLider,
  onArranque,
}: {
  hoy: string;
  chequeos: Chequeo[];
  unidades: UnidadBalance[];
  esLider: boolean;
  onArranque: () => void;
}) {
  const sit = situacion(chequeos);
  const visibles = chequeos.filter((c) => c.clave !== "corte");
  return (
    <>
      <div {...entra(1)} data-guia="fin-balance.chequeos">
        <Superficie pad className="fin-balance-tarjeta">
          <CabeceraBloque
            titulo="Antes de dibujarlo, el sistema lo comprueba"
            bajada="Cada cuenta se calcula por dos caminos. Si no coinciden, el Balance no se muestra."
          >
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
              Una sola vez, con el contador: lo que había en el banco, lo que se le debía a SUNAT, lo que le prestaste a CAYLA, el capital y las utilidades hasta ese día.
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
        El <b>capital</b> se registra una vez, al arrancar; nunca se calcula para que cuadre. Por tienda se muestra <b>lo que es suyo</b>; el banco, el capital y el IGV son de CAYLA entera.
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

/** Lo plegado mirando una sede: cómo le fue en el mes y lo que hay que saber de estas cifras. */
export function MasDeLaSede({ unidad, hoy, veTodo }: { unidad: UnidadBalance; hoy: string; veTodo: boolean }) {
  const mes = nombreMes(unidad.desde);
  const enCurso = unidad.hasta === hoy;
  return (
    <>
      <section className="fin-cifras" data-guia="fin-balance.tienda-cifras">
        <TarjetaCifra etiqueta={`Utilidad de ${mes}`} valor={solesBalance(unidad.utilidadMes)} tono={unidad.utilidadMes < 0 ? "text-rojo" : undefined} {...entra(1)}>
          {enCurso ? "a la fecha" : "el mes entero"}
          {!unidad.planillaVisible ? " · sin planilla" : unidad.sueldosEstimados > 0 ? " · con sueldos estimados" : ""}
        </TarjetaCifra>
        <TarjetaCifra etiqueta="Rinde" valor={unidad.tipo === "taller" ? null : textoRinde(unidad.rinde).replace(" al mes", "")} {...entra(2)}>
          {unidad.tipo === "taller" ? "el Taller no vende" : "de lo invertido, al mes"}
        </TarjetaCifra>
        <TarjetaCifra etiqueta={`Ventas de ${mes}`} valor={solesBalance(unidad.ventasMes)} {...entra(3)}>
          sin IGV
        </TarjetaCifra>
      </section>
      <div {...entra(4, "nota-cayla")} data-guia="fin-balance.tienda-nota">
        No es un Balance completo: el <b>banco</b>, el <b>capital</b> y el <b>IGV</b> son de CAYLA entera y no se reparten entre las tiendas (repartirlos sería inventar un número). Aquí está lo que es de
        la tienda y cuánto le rinde: la utilidad del mes (Estado de resultados) ÷ lo invertido.
        {!unidad.planillaVisible && " La utilidad no descuenta la planilla: esa la ve quien tiene acceso en Dynamic."}
        {veTodo && " El Balance de CAYLA entera, eligiendo «Todas» en la barra de sedes."}
      </div>
    </>
  );
}

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const nombreMes = (iso: string) => MESES[Number(iso.slice(5, 7)) - 1] ?? "el mes";
