"use client";

import { useState, type CSSProperties } from "react";
import Link from "next/link";
import { Chip } from "@/components/ui/Chip";
import { Aviso } from "@/components/ui/Aviso";
import { TituloGrupo } from "@/components/ui/TituloSeccion";
import { BotonVerMas, FilasDeMas } from "@/components/ui/VerMas";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { BarraAvance } from "@/components/ui/BarraAvance";
import { MESES_DE_MERCADERIA_ALTOS, type Medidores } from "@/lib/vale-reglas";
import { CabeceraBloque, PieTabla, Superficie, TituloDeTarjeta } from "@/components/finanzas/kit";
import { SaldosArranqueModal } from "@/components/finanzas/SaldosArranqueModal";
import {
  cifraChequeo,
  enlaceDeCausa,
  iconoChequeo,
  motivoNoCuadra,
  situacion,
  solesBalance,
  textoRinde,
  tituloChequeo,
  tituloCorte,
  type Chequeo,
  type Enlace,
  type LineaPropuesta,
  type SaldoInicial,
  type UnidadBalance,
} from "@/lib/balance-reglas";
import { Boton } from "@/components/ui/campos";
import { Vacio } from "@/components/ui/Vacio";
import { CalendarX, Flag } from "lucide-react";

// Estados financieros ▸ Balance general: lo que no es la cifra (ADR-0195 F7, ADR-0585, ADR-0611, ADR-0619). Si falla lo de fondo (el arranque, el diario o la ecuación), la comprobación y la
// guía de qué falta siguen a la vista y el Balance no se dibuja. Si no, se dibuja, con su aviso si una cuenta difiere, y aquí queda lo plegado en «Ver más» (dos preguntas, lo de cada sede,
// cómo se comprobó y los saldos de arranque). La pantalla no calcula plata: todo viene de la base (`fn_conciliacion_contable`, `fn_balance_general`,
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
  comprobacionFallo = false,
}: {
  /** Solo el líder registra los saldos de arranque (`registrar_saldo_inicial`). */
  esLider: boolean;
  hoy: string;
  chequeos: Chequeo[];
  unidades: UnidadBalance[];
  saldos: SaldoInicial[];
  /** La propuesta de los saldos de arranque ya leída (opcional; si no viene, el modal la pide). */
  propuestaArranque?: LineaPropuesta[] | null;
  /** La comprobación no se pudo leer: la página dice el error, y aquí no se afirma nada del arranque (lo que se leyó de las tiendas sigue a la vista). */
  comprobacionFallo?: boolean;
}) {
  const [arranqueAbierto, setArranqueAbierto] = useState(false);
  const arranque = chequeos.find((c) => c.arranque)?.arranque ?? saldos.find((s) => s.vigente)?.fecha ?? null;

  return (
    <div className="space-y-6">
      <VistaSinCuadrar hoy={hoy} chequeos={chequeos} unidades={unidades} esLider={esLider} comprobacionFallo={comprobacionFallo} onArranque={() => setArranqueAbierto(true)} />
      {arranqueAbierto && <SaldosArranqueModal hoy={hoy} arranque={arranque} saldos={saldos} propuestaInicial={propuestaArranque} onCerrar={() => setArranqueAbierto(false)} />}
    </div>
  );
}

const unDecimal = (n: number) => n.toFixed(1).replace(".", ",");

/** Lo que hay que saber antes de leer un Balance con una cuenta que difiere (ADR-0619): cuál, por cuánto y dónde se arregla. */
export function AvisoDiferencias({ diferencias, esLider, hoy, saldos }: { diferencias: Chequeo[]; esLider: boolean; hoy: string; saldos: SaldoInicial[] }) {
  const [arranqueAbierto, setArranqueAbierto] = useState(false);
  const m = motivoNoCuadra(diferencias);
  const c = diferencias[0]!;
  const arranque = c.arranque ?? saldos.find((s) => s.vigente)?.fecha ?? null;
  return (
    <>
      <Aviso
        tono="atencion"
        guia="fin-vale.aviso"
        titulo={`Balance provisional: ${m.titulo} difiere por ${solesBalance(Math.abs(c.diferencia ?? 0))}`}
        accion={
          m.enlace?.href ? (
            <Link href={m.enlace.href} className="btn-enlace">
              {m.enlace.texto}
            </Link>
          ) : m.enlace?.accion === "arranque" && esLider ? (
            <button type="button" className="btn-enlace" onClick={() => setArranqueAbierto(true)}>
              {m.enlace.texto}
            </button>
          ) : undefined
        }
      >
        {m.texto}
        {m.causa && ` Viene de: ${m.causa.texto}.`}
        {m.otros > 0 && ` Y ${m.otros === 1 ? "una cuenta más difiere" : `${m.otros} cuentas más difieren`}.`}
      </Aviso>
      {arranqueAbierto && <SaldosArranqueModal hoy={hoy} arranque={arranque} saldos={saldos} onCerrar={() => setArranqueAbierto(false)} />}
    </>
  );
}

/** Lo plegado cuando el Balance se dibuja: dos preguntas que importan, lo que es de cada sede, cómo se comprobó y los saldos de arranque. */
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
        <CabeceraBloque titulo="Antes de dibujarlo, el sistema lo comprueba" bajada="Cada cuenta se calcula por dos caminos distintos. Si una no coincide, el Balance sale con un aviso; si falla la ecuación, no se muestra.">
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



// ---- CAYLA entera ---------------------------------------------------------------------------------------------------------

/** Si falla lo de fondo, la comprobación y la guía de qué falta: el Balance no se dibuja (ADR-0619). */
function VistaSinCuadrar({
  hoy,
  chequeos,
  unidades,
  esLider,
  comprobacionFallo,
  onArranque,
}: {
  hoy: string;
  chequeos: Chequeo[];
  unidades: UnidadBalance[];
  esLider: boolean;
  comprobacionFallo: boolean;
  onArranque: () => void;
}) {
  const sit = situacion(chequeos);
  const visibles = chequeos.filter((c) => c.clave !== "corte");
  return (
    <>
      {!comprobacionFallo && (
      <>
      <div {...entra(1)} data-guia="fin-balance.chequeos">
        <Superficie pad className="fin-balance-tarjeta">
          <CabeceraBloque
            titulo="Antes de dibujarlo, el sistema lo comprueba"
            bajada="Cada cuenta se calcula por dos caminos. Si falla el arranque, el diario o la ecuación, el Balance no se muestra."
          >
            {esLider && (
              <button type="button" className="btn-cayla btn-secundario" onClick={onArranque} data-guia="fin-balance.arranque">
                Saldos de arranque
              </button>
            )}
          </CabeceraBloque>
          {sit.tipo === "no_cuadra" ? (
            <BloqueoDelBalance bloqueos={sit.bloqueos} chequeos={visibles} onArranque={onArranque} />
          ) : sit.tipo === "sin_arranque" ? (
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
        {sit.tipo === "no_cuadra" ? null : sit.tipo === "antes_del_arranque" ? (
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
      </>
      )}

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

/**
 * El Balance bloqueado, dicho en una línea (Felipe 2026-11-06, camino A): qué no cuadra y por cuánto, de dónde sale la diferencia con su enlace para
 * arreglarla y, en una fila, cada comprobación con su ✓ o su !. La lista completa, con lo que dice cada cuenta, queda a un toque.
 */
function BloqueoDelBalance({ bloqueos, chequeos, onArranque }: { bloqueos: Chequeo[]; chequeos: Chequeo[]; onArranque: () => void }) {
  const [todas, setTodas] = useState(false);
  const m = motivoNoCuadra(bloqueos);
  const c = bloqueos[0]!;
  const dif = c.clave !== "diario" && c.diferencia != null ? ` por ${solesBalance(Math.abs(c.diferencia))}` : "";
  return (
    <div className="space-y-4">
      <Aviso tono="error" titulo={`El Balance no se muestra: ${m.titulo} no cuadra${dif}`}>
        {m.texto}
        {m.otros > 0 && ` Y ${m.otros === 1 ? "una cosa más" : `${m.otros} cosas más`} que no cuadra${m.otros === 1 ? "" : "n"}.`}
      </Aviso>
      <div className="flex flex-wrap gap-2" aria-label="Cada comprobación">
        {chequeos.map((x) => {
          const ic = iconoChequeo(x.estado);
          return (
            <Chip key={x.clave} tono={ic.tono} versalitas={false} title={ic.texto}>
              {ic.signo} {tituloChequeo(x)}
            </Chip>
          );
        })}
      </div>
      {bloqueos.some((x) => x.causas.length > 0) && (
        <div className="space-y-2">
          <TituloGrupo>De dónde sale la diferencia</TituloGrupo>
          <ul className="fin-causas">
            {bloqueos.flatMap((x) =>
              x.causas.map((k) => (
                <li key={`${x.clave}-${k.clave}`}>
                  <span>
                    {k.texto}
                    {!k.acepta && <EnlaceCausa enlace={enlaceDeCausa(k.clave)} onArranque={onArranque} />}
                  </span>
                  <b>{solesBalance(k.monto)}</b>
                </li>
              )),
            )}
          </ul>
        </div>
      )}
      <BotonVerMas abierto={todas} onCambiar={setTodas} texto="Ver cada comprobación" forma="enlace" />
      <FilasDeMas abierto={todas}>
        <ul className="fin-chequeos">
          {chequeos.map((x) => (
            <FilaChequeo key={x.clave} c={x} onArranque={onArranque} />
          ))}
        </ul>
      </FilasDeMas>
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
        la tienda y cuánto le rinde: la utilidad del mes (Ganancias y pérdidas) ÷ lo invertido.
        {!unidad.planillaVisible && " La utilidad no descuenta la planilla: esa la ve quien tiene acceso en Dynamic."}
        {veTodo && " El Balance de CAYLA entera, eligiendo «Todas» en la barra de sedes."}
      </div>
    </>
  );
}

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const nombreMes = (iso: string) => MESES[Number(iso.slice(5, 7)) - 1] ?? "el mes";
