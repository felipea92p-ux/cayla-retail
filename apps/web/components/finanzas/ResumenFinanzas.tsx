"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, use, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import { BookOpen, CalendarCheck, Percent, Wallet } from "lucide-react";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { SelectorPeriodo } from "@/components/finanzas/estados/SelectorPeriodo";
import { letraEstados } from "@/lib/letra-estados";
import type { Periodo } from "@/lib/estados-periodo";
import { Aviso } from "@/components/ui/Aviso";
import { CabeceraBloque, Superficie } from "@/components/finanzas/kit";
import { AjustesResumen as AjustesDelResumen } from "@/components/finanzas/AjustesResumen";
import { InversionMercaderia } from "@/components/finanzas/InversionMercaderia";
import { useAjustesResumen } from "@/components/finanzas/useAjustesResumen";
import { CambiosDelMesPieza } from "@/components/finanzas/CambiosDelMes";
import { AdondeVaLaPlata } from "@/components/finanzas/AdondeVaLaPlata";
import { SedesJuntas } from "@/components/finanzas/SedesJuntas";
import { VendidoPorSede } from "@/components/finanzas/VendidoPorSede";
import { sedesJuntas } from "@/lib/sedes-juntas-reglas";
import type { UnidadBalance } from "@/lib/balance-reglas";
import { ResumenDecidir } from "@/components/finanzas/ResumenDecidir";
import { DockTelar } from "@/components/finanzas/telar/DockTelar";
import { SaldoLibre } from "@/components/finanzas/bolsillos/SaldoLibre";
import { TarjetaMes } from "@/components/finanzas/bolsillos/TarjetaMes";
import { Proximos } from "@/components/finanzas/bolsillos/Proximos";
import { Preguntas, type Pregunta } from "@/components/finanzas/bolsillos/Preguntas";
import { EsperaBloque } from "@/components/finanzas/bolsillos/EsperaBloque";
import { HojasResumen, hayHoja, type DatosHojas, type DestinosHojas } from "@/components/finanzas/bolsillos/HojasResumen";
import { ventasDiaADia, type ClaveHoja } from "@/lib/hojas-resumen-reglas";
import type { SedeConValor } from "@/lib/valor-inventario-reglas";
import { FRASE_DE_SIEMPRE, fraseDelResumen } from "@/lib/frase-resumen-reglas";
import { conElRango, nombreDelAnterior, ventasPorFecha } from "@/lib/estados-periodo";
import { alinearAvisoDeCaja, type FlujoProximo } from "@/lib/caja-proxima-reglas";
import { equilibrioMes, type FaltaDelMes } from "@/lib/equilibrio-mes-reglas";
import type { Confianza as ConfianzaDatos } from "@/lib/finanzas-confianza";
import type { Lectura } from "@/lib/resumen-finanzas";
import { AVISO_SUELDOS_SIN_LEER, mesNombre, type FilaER } from "@/lib/resultados-reglas";
import { ventaParaDecir } from "@/lib/igv-ventas-reglas";
import { avisoAntesDelCorte, mesAntesDelCorte } from "@/lib/finanzas-arranque-reglas";
import { hrefTelar, mesDelDia, sedeDeLaUrl, type SedeTelar } from "@/lib/finanzas-telar-reglas";
import { recorridoPlata, vendisteYSalio } from "@/lib/recorrido-plata-reglas";
import { cambiosDelMes } from "@/lib/resumen-cambios-reglas";
import { avisosParaDecidir, filaDeVer, noRevisado, ordenarAvisos, type Acceso, type ResumenFinanzas } from "@/lib/resumen-finanzas-reglas";
import type { AjustesResumen } from "@/lib/ajustes-resumen-reglas";
import { avisoDeInversion, vacioDeInversion, type CampanaInversion } from "@/lib/inversion-mercaderia-reglas";
import { armarCaja, armarMes } from "@/lib/resumen-bloques";
import { dockDelResumen, comparacionMesPasado, respuestaResumen, vendidoPorSede, type DiaVenta } from "@/lib/resumen-telar-reglas";

// Finanzas ▸ Resumen, camino «A · Bolsillos» (Felipe 2026-11-09; antes El telar, ADR-0493): la plata contada como en la app del banco. A la izquierda,
// «Libre para usar» con sus bolsillos, las preguntas de siempre y los movimientos; a la derecha, cómo va el mes, «Hoy te toca», «Próximos» y las tiendas
// con la confianza del número (ADR-0417). Debajo, «Cada sede, junta», «A dónde va la plata», lo que más se movió y, al final, la inversión en mercadería
// (siempre a la vista, Felipe 2026-10-29). La sede la pone la barra común; las fechas, el calendario de Estados financieros en la cabecera.
// No calcula plata: lo arman `bolsillos-reglas`, `te-deja-mes-reglas`, `proximos-reglas`, `recorrido-plata-reglas`, `resumen-telar-reglas` y
// `resumen-finanzas-reglas` con lo que lee la página (juntado en `resumen-bloques`).
//
// POR BLOQUES (ADR-0661, Felipe 2026-11-13). La página llega con la lectura rápida ya hecha (`rapido`: saldos, deudas, la caja que viene…) y con todo lo
// demás como promesas (`lecturas`). Cada bloque espera SOLO lo suyo (`use()` dentro de su `Suspense`) y, mientras tanto, su lugar lo ocupa una tarjeta
// en espera del mismo alto (`EsperaBloque`): así entra cuando llega, sin empujar a los otros (ADR-0185) y sin el loader general (ADR-0149). Lo que la
// persona elige (las hojas, «Qué se ve» de la inversión, la forma de pagar) vive aquí arriba, fuera de toda espera: no se pierde cuando llega un bloque.

/** Lo que el panel recibe sin esperar: cada lectura de la página como promesa (ver `app/(app)/finanzas/resumen/page.tsx`). */
export type LecturasDelResumen = {
  /** El Resumen entero (las tres lecturas juntas): «Hoy te toca» y la meta del mes. `null` si no se pudo leer. */
  todo: Promise<ResumenFinanzas | null>;
  /** El Estado de resultados del mes elegido (al día de hoy si es el mes en curso), de todas las sedes que la cuenta ve, y si faltaron los sueldos. */
  mes: Promise<{ estado: { datos: FilaER[]; falla: string | null }; sueldosSinLeer: boolean }>;
  /** El tramo con que se compara (el mes pasado a la misma fecha); `null` si no se pudo leer. */
  antes: Promise<FilaER[] | null>;
  /** La proyección de caja con sus cobros y salidas por día (la de Dinero ▸ Flujo), para «Tu caja en las próximas dos semanas». */
  flujo: Promise<FlujoProximo>;
  /** La planilla que Dynamic pagó y aquí no bajó del banco; `null` sin lectura. */
  planilla: Promise<number | null>;
  confianza: Promise<Lectura<ConfianzaDatos | null>>;
  faltaDelMes: Promise<readonly FaltaDelMes[] | null>;
  /** Lo vendido por día de cada tienda; `null` si la cuenta no ve Rendimiento. */
  ventas: Promise<{ series: DiaVenta[][]; incompleta: boolean } | null>;
  /** La inversión en mercadería que entrega el Plan de campaña; `datos` null si esta base aún no la trae (entonces no se ofrece nada). */
  inversion: Promise<Lectura<CampanaInversion[] | null>>;
  /** La caja de cada sede, para «Cada sede, junta»; `null` si la cuenta no ve todas las sedes. */
  cajasPorSede: Promise<Lectura<UnidadBalance[]> | null>;
  /** Lo que vale la ropa a costo por sede (para su hoja); `null` si la cuenta no ve el dinero de Compras o la base no respondió. */
  inventarioValor: Promise<SedeConValor[] | null>;
  /** Cuánto de lo vendido lleva costo estimado, por tienda y en `todas`; `null` si la cuenta no ve todas las sedes. */
  estimados: Promise<Readonly<Record<string, number | null>> | null>;
};

type Props = {
  /** La lectura rápida del Resumen (la única que la página espera); `null` si no respondió. */
  rapido: ResumenFinanzas | null;
  falla: string | null;
  lecturas: LecturasDelResumen;
  /** El mes que se mira («2026-10», el de `hasta` del período) y hoy («2026-10-23»). */
  mes: string;
  /** Las fechas del calendario: un mes entero o cualquier tramo (`leerPeriodo`, el mismo de Estados financieros). */
  periodo: Periodo;
  /** Desde cuándo hay Finanzas: el calendario no ofrece antes. */
  minimo: string | null;
  hoy: string;
  sedes: SedeTelar[];
  acceso: Acceso;
  /** «Movimientos» (camino A): lo arma la página como Server Component dentro de su `Suspense`; `null` si la cuenta no ve el flujo de CAYLA entera. */
  movimientos?: ReactNode;
  /** Si la cuenta ve «Cada sede, junta» (todas las sedes): su lugar se guarda desde el principio. */
  veCajasPorSede?: boolean;
  /** Desde cuándo cuenta Finanzas (ADR-0332); `null` sin corte o sin lectura. */
  inicioFinanzas?: string | null;
};

/** Lo que todos los bloques comparten: lo que ya llegó, las promesas y lo que la persona eligió. */
type Contexto = {
  rapido: ResumenFinanzas;
  l: LecturasDelResumen;
  mes: string;
  periodo: Periodo;
  hoy: string;
  sedes: SedeTelar[];
  acceso: Acceso;
  enCurso: boolean;
  inicioFinanzas: string | null;
  ajustes: AjustesResumen;
  elegidas: Record<string, string>;
  ir: (ruta: string) => string;
  ve: (modulo: string) => boolean;
  hrefGanancias: string | null;
  abrirHoja: (h: ClaveHoja | null) => void;
};

/** La entrada escalonada de cada pieza (con la clase de su lugar, si lleva). */
const columna = (i: number, clase = "") => ({ className: `anim-entra ${clase}`.trim(), style: { ["--i" as string]: i } as CSSProperties });

const ICONO_DOCK = { pagar: <Wallet aria-hidden />, igv: <Percent aria-hidden />, cierre: <CalendarCheck aria-hidden />, reportes: <BookOpen aria-hidden /> } as const;

// Los altos de cada lugar en espera (px): lo que cada tarjeta mide a 1440 px con datos (medido en la copia de un año, 2026-11-13). Lo que va en la
// primera pantalla (la frase, lo libre y el mes, las preguntas, lo urgente y lo que viene) guarda su alto justo; lo de más abajo se estima por lo que
// trae (una fila por tienda o por unidad). Si la que llega es más alta, crece hacia abajo, fuera de la vista.
const ALTO = { libre: 490, mes: 490, decidir: 550, proximos: 550, plata: 580, cambios: 580, inversion: 167 } as const;
/** «Tus tiendas»: la cabecera y una fila por tienda. */
const altoTiendas = (tiendas: number) => 165 + 33 * Math.max(1, tiendas);
/** «Cada sede, junta»: la cabecera, una fila por unidad, la de la empresa y la de CAYLA. */
const altoSedes = (unidades: number) => 230 + 62 * (unidades + 2);

export function ResumenFinanzasPanel({ rapido, falla, lecturas, mes, periodo, minimo, hoy, sedes, acceso, movimientos = null, veCajasPorSede = false, inicioFinanzas = null }: Props) {
  const sp = useSearchParams();
  // «Qué se ve»: lo que esta persona esconde de la inversión en mercadería, y qué forma de pagar mira en cada campaña (mirar no guarda nada).
  const [ajustes, ponerAjustes] = useAjustesResumen();
  const [elegidas, setElegidas] = useState<Record<string, string>>({});
  const [abierta, setAbierta] = useState<string | null>(null);
  // La hoja de detalle abierta (camino A): solo se lee, no va en la URL.
  const [hoja, ponerHoja] = useState<ClaveHoja | null>(null);
  // Al cerrar la hoja, el foco vuelve al botón que la abrió (un bolsillo, una pregunta, una cifra), aunque se haya pasado de hoja en hoja.
  const origenDeLaHoja = useRef<HTMLElement | null>(null);
  const setHoja = (c: ClaveHoja | null) => {
    if (!hoja && c && document.activeElement instanceof HTMLElement) origenDeLaHoja.current = document.activeElement;
    ponerHoja(c);
  };
  const mesDeHoy = mesDelDia(hoy);
  // Lo que va por mes (el equilibrio, «al ritmo de hoy») solo se dice mirando un mes entero; el mes en curso es el de hoy hasta hoy.
  const enCurso = periodo.unMes && mes === mesDeHoy;
  // Las acciones del dock llevan la sede y el mes que se miran (`hrefTelar`).
  const ir = (ruta: string) => hrefTelar(ruta, sp.entries(), {}, { mismaPantalla: false, mesDeHoy });
  const dock = (
    <DockTelar
      acciones={dockDelResumen(acceso.modulos).map((a) => ({ texto: a.texto, tecla: a.tecla, icono: ICONO_DOCK[a.clave], principal: a.principal, href: ir(a.ruta) }))}
    />
  );

  const fecha = (
    <span className={`${letraEstados.variable} estados-vidrio contents`}>
      <SelectorPeriodo desde={periodo.desde} hasta={periodo.hasta} hoy={hoy} minimo={minimo} una={false} sede={sedeDeLaUrl({ sede: sp.get("sede"), ver: sp.get("ver") })} />
    </span>
  );

  if (!rapido) {
    return (
      <div className={`pantalla-en-vidrio resumen-bolsillos space-y-6 ${letraEstados.variable}`}>
        <EncabezadoPagina sede="Finanzas" titulo="Resumen" subtitulo={FRASE_DE_SIEMPRE} acciones={fecha} />
        <Aviso tono="error" titulo="El Resumen no respondió">
          {falla ?? "No se pudo leer el resumen. Vuelve a cargar la página; si sigue igual, avisa a Felipe."}
        </Aviso>
        {dock}
      </div>
    );
  }

  const ve = (modulo: string) => acceso.lider || acceso.modulos.includes(modulo);
  const c: Contexto = {
    rapido,
    l: lecturas,
    mes,
    periodo,
    hoy,
    sedes,
    acceso,
    enCurso,
    inicioFinanzas,
    ajustes,
    elegidas,
    ir,
    ve,
    hrefGanancias: ve("reportes_financieros") ? conElRango(ir("/finanzas/reportes"), sp.entries()) : null,
    abrirHoja: setHoja,
  };
  const antesDelCorte = mesAntesDelCorte(mes, inicioFinanzas);
  const v = rapido.ver;
  const sede = v.todas ? "Todas las sedes" : v.soloEmpresa ? "Empresa" : v.nombre.replace(/^Tienda\s+/i, "");
  // «Cada sede, junta» solo mirando CAYLA entera y si la cuenta ve todas las sedes: su lugar se guarda desde el principio.
  const conSedesJuntas = veCajasPorSede && v.todas;

  return (
    // `pantalla-en-vidrio`: el Resumen ya está rediseñado (camino A), así que sus bloques van al vidrio claro, como en la maqueta (ADR-0596); las cifras,
    // en la letra de Estados financieros (Inter, ADR-0611).
    <div className={`pantalla-en-vidrio resumen-bolsillos space-y-6 ${letraEstados.variable}`}>
      <EncabezadoPagina sede={sede} titulo="Resumen" subtitulo={FRASE_DE_SIEMPRE} acciones={fecha} />
      {antesDelCorte && inicioFinanzas && <Aviso tono="info">{avisoAntesDelCorte(inicioFinanzas)}</Aviso>}
      <Suspense fallback={null}>
        <AvisoSueldos l={lecturas} />
      </Suspense>
      {/* La respuesta, a la vista bajo la cabecera, como en la maqueta: cuánto tienes, cuánto puedes usar y cuánto te deja el mes (los mismos números
          de las tarjetas de abajo, `fraseDelResumen`). El subtítulo de la cabecera queda en su «?», como en todo el ERP. */}
      <Suspense fallback={<FraseEsperando />}>
        <Frase c={c} />
      </Suspense>
      {/* Camino «A · Bolsillos» (Felipe 2026-11-09; maqueta docs/maquetas/finanzas-resumen-de-punta-a-punta-2026-11/), armado POR FILAS: lo libre junto al
          mes, las preguntas a lo ancho, lo urgente junto a lo que viene y los movimientos junto a las tiendas. Las dos tarjetas de una fila miden lo mismo,
          así ninguna columna termina antes que la otra (con dos pilas sueltas quedaba media pantalla vacía al pie de la más corta, Felipe 2026-11-09). En
          una sola columna, el orden del código es el de importancia. Cada lugar se guarda con su tarjeta en espera hasta que llega lo suyo. */}
      <div className="resumen-a">
        <Suspense fallback={<Hueco area="libre" titulo="Libre para usar" alto={ALTO.libre} />}>
          <BloqueLibre c={c} />
        </Suspense>
        <Suspense fallback={<Hueco area="mes" titulo={tituloDelMes(mes, periodo, enCurso)} alto={ALTO.mes} />}>
          <BloqueMes c={c} />
        </Suspense>
        <Suspense fallback={<PreguntasEsperando />}>
          <BloquePreguntas c={c} />
        </Suspense>
        <Suspense fallback={<HuecoDecidir c={c} />}>
          <BloqueDecidir c={c} />
        </Suspense>
        <Suspense fallback={<Hueco area="proximos" titulo="Próximos" alto={ALTO.proximos} />}>
          <BloqueProximos c={c} />
        </Suspense>
        {movimientos && (
          <div data-area="movs" {...columna(6)}>
            {movimientos}
          </div>
        )}
        {/* «Tus tiendas»: lo vendido por sede con la confianza del número, en UNA tarjeta (ADR-0417; Felipe 2026-10-29). Sin ventas no se dibuja y los
            movimientos toman la fila entera (`finanzas-bolsillos.css`). */}
        <Suspense fallback={<Hueco area="tiendas" titulo="Tus tiendas" alto={altoTiendas(rapido.unidades.filter((u) => u.tipo === "tienda").length)} solo={!movimientos} />}>
          <BloqueTiendas c={c} solo={!movimientos} />
        </Suspense>
      </div>
      {dock}

      <Suspense fallback={null}>
        <BloqueHojas c={c} abierta={hoja} volverA={origenDeLaHoja} />
      </Suspense>

      {/* «Cada sede, junta» (tarea 27), a todo el ancho: es una tabla. */}
      {conSedesJuntas && (
        <Suspense fallback={<EsperaBloque titulo="Cada sede, junta" alto={altoSedes(rapido.unidades.length)} bandas={Math.max(3, rapido.unidades.length + 2)} />}>
          <BloqueSedes c={c} />
        </Suspense>
      )}

      {/* El último par: a dónde va la plata y lo que más se movió, mitad y mitad y del mismo alto (como las filas de arriba). Sin salidas que repartir, el
          anillo no dibuja nada y no se le guarda lugar: lo que más se movió toma la fila entera. */}
      <div className="resumen-par">
        <Suspense
          fallback={
            <div>
              <EsperaBloque titulo="A dónde va la plata" alto={ALTO.plata} />
            </div>
          }
        >
          <BloquePlata c={c} />
        </Suspense>
        <div {...columna(9)}>
          <Suspense fallback={<EsperaBloque titulo="Lo que más se movió" alto={ALTO.cambios} />}>
            <BloqueCambios c={c} />
          </Suspense>
        </div>
      </div>

      {/* La inversión en mercadería, AL FINAL y siempre a la vista (Felipe 2026-10-29): sin nada pendiente dice eso en una línea. No es un gasto:
          sale de la caja cuando se paga. Solo existe si el Plan de campaña la entrega y se deja ver. */}
      <Suspense
        fallback={
          <div id="inversion" className="resumen-ancla space-y-4 pb-4">
            <EsperaBloque titulo="Inversión en mercadería" alto={ALTO.inversion} bandas={2} />
          </div>
        }
      >
        <BloqueInversion
          c={c}
          onElegir={(id, clave) => setElegidas((e) => ({ ...e, [id]: clave }))}
          abierta={abierta}
          onAbrir={setAbierta}
          onCambiarAjustes={ponerAjustes}
        />
      </Suspense>
    </div>
  );
}

// ---- Los lugares en espera -------------------------------------------------------------------------------------------------

function Hueco({ area, titulo, alto, solo = false }: { area: string; titulo: string; alto: number; solo?: boolean }) {
  return (
    <div data-area={area} data-solo={solo ? "" : undefined}>
      <EsperaBloque titulo={titulo} alto={alto} />
    </div>
  );
}

/** «Hoy te toca» en espera: con su misma cabecera, que no depende de nada leído. */
function HuecoDecidir({ c }: { c: Contexto }) {
  return (
    <div data-area="decidir" data-guia="fin-resumen.decidir" aria-busy="true">
      <Superficie pad className="resumen-espera">
        <CabeceraBloque titulo="Hoy te toca" bajada={bajadaDecidir(c.mes, c.periodo)} />
        <div aria-hidden className="resumen-espera-bandas">
          <div className="h-4 w-[78%] animate-pulse rounded bg-tinta/10" />
          <div className="h-4 w-[64%] animate-pulse rounded bg-tinta/10" />
          <div className="h-4 w-[71%] animate-pulse rounded bg-tinta/10" />
        </div>
      </Superficie>
    </div>
  );
}

/** Las preguntas de siempre en espera: sus píldoras, sin texto. */
function PreguntasEsperando() {
  return (
    <div data-area="preguntas" className="resumen-espera-preguntas" aria-hidden>
      {[150, 190, 160, 170, 180].map((ancho, i) => (
        <span key={i} className="animate-pulse rounded-full bg-tinta/10" style={{ width: ancho }} />
      ))}
    </div>
  );
}

/** La frase de arriba en espera: las dos líneas que ocupa a lo ancho. */
function FraseEsperando() {
  return (
    <p className="resumen-frase resumen-frase-espera" aria-busy="true" aria-label="La respuesta del Resumen, cargando">
      <span aria-hidden className="block h-4 w-[62ch] max-w-full animate-pulse rounded bg-tinta/10" />
      <span aria-hidden className="block h-4 w-[34ch] max-w-[60%] animate-pulse rounded bg-tinta/10" />
    </p>
  );
}

const bajadaDecidir = (mes: string, periodo: Periodo) => (periodo.enCurso ? "Lo urgente, primero." : `Es de hoy, aunque mires ${mesNombre(mes)}. Lo urgente, primero.`);

function tituloDelMes(mes: string, periodo: Periodo, enCurso: boolean): string {
  const Mes = mesNombre(mes).charAt(0).toUpperCase() + mesNombre(mes).slice(1);
  return !periodo.unMes ? periodo.titulo : enCurso ? `${Mes} va así` : `Así cerró ${mesNombre(mes)}`;
}

// ---- Los bloques: cada uno espera SOLO lo suyo -------------------------------------------------------------------------------

/** Los sueldos estimados no se pudieron leer (tarea 43): se dice y las cifras se siguen viendo. */
function AvisoSueldos({ l }: { l: LecturasDelResumen }) {
  const { sueldosSinLeer } = use(l.mes);
  if (!sueldosSinLeer) return null;
  return (
    <Aviso tono="atencion" chico>
      {AVISO_SUELDOS_SIN_LEER} Vuelve a cargar en un rato.
    </Aviso>
  );
}

/** «Libre para usar» y la caja SIN la compra de campaña: no espera la inversión (no la mira). */
function cajaSinCompra(c: Contexto, flujo: FlujoProximo, planilla: number | null) {
  return armarCaja({ r: c.rapido, flujo, planillaSinSalida: planilla, inversion: null, ajustes: c.ajustes, elegidas: c.elegidas });
}

function Frase({ c }: { c: Contexto }) {
  const flujo = use(c.l.flujo);
  const planilla = use(c.l.planilla);
  const m = use(c.l.mes);
  const falta = use(c.l.faltaDelMes);
  const { saldo } = cajaSinCompra(c, flujo, planilla);
  const { te } = armarMes({ base: c.rapido, estadoMes: m.estado, mes: c.mes, hoy: c.hoy, periodo: c.periodo, faltaDelMes: falta });
  return (
    <p className="resumen-frase anim-entra" style={{ ["--i" as string]: 0 } as CSSProperties}>
      {fraseDelResumen({ saldo, te, nombreMes: mesNombre(c.mes), enCurso: c.periodo.enCurso && c.periodo.unMes }).map((p, i) =>
        p.fuerte ? (
          <b key={i} className="num">
            {p.texto}
          </b>
        ) : (
          <span key={i}>{p.texto}</span>
        ),
      )}
    </p>
  );
}

function BloqueLibre({ c }: { c: Contexto }) {
  const { saldo } = cajaSinCompra(c, use(c.l.flujo), use(c.l.planilla));
  return (
    <div data-area="libre" {...columna(1)}>
      <SaldoLibre saldo={saldo} onAbrir={c.abrirHoja} otroMes={c.periodo.enCurso ? null : mesNombre(c.mes)} />
    </div>
  );
}

/** «Noviembre va así» (camino A): lo que te deja el mes —estimado con rango mientras corre (Felipe 2026-11-09)— y, abajo, si ya se pagó el mes. */
function BloqueMes({ c }: { c: Contexto }) {
  const m = use(c.l.mes);
  const falta = use(c.l.faltaDelMes);
  // El presupuesto (la meta del mes, para el equilibrio) viene con las tres lecturas juntas.
  const todo = use(c.l.todo) ?? c.rapido;
  const ventasPorDia = use(c.l.ventas);
  const estadoAntes = use(c.l.antes);
  const confianza = use(c.l.confianza);
  const { mes, hoy, periodo, enCurso, inicioFinanzas } = c;
  const { r, filas, fila, te } = armarMes({ base: todo, estadoMes: m.estado, mes, hoy, periodo, faltaDelMes: falta });
  const provisional = !confianza.datos || confianza.datos.nivel === "bajo";
  const comparacion = comparacionMesPasado(filas, estadoAntes);
  const resp = respuestaResumen(r, comparacion.antes, provisional, enCurso, comparacion.antesDeSueldos, inicioFinanzas);
  const filaAntes = estadoAntes ? (filaDeVer(estadoAntes, r.ver) ?? null) : null;
  const eq = periodo.unMes ? equilibrioMes({ r, filas, ventasPorDia, hoy, mes, enCurso, faltaDelMes: falta, inicioFinanzas }) : null;
  const diaDeHoy = Number(hoy.slice(8, 10));
  const diasMes = new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0)).getUTCDate();
  const noVende = r.ver.todas || r.ver.tipo === "tienda" ? null : resp;
  const cambio = fila && filaAntes && filaAntes.ventas > 0 && !noVende ? { pct: fila.ventas / filaAntes.ventas - 1, contra: nombreDelAnterior(periodo) } : null;
  // Las cifras de la tarjeta que abren su hoja: solo miran el mes.
  const hojas = (["deja", "ventas", "gastos"] as const).filter((h) => hayHoja(h, { fila, filas }));
  return (
    <div data-area="mes" {...columna(2)}>
      <TarjetaMes
        titulo={tituloDelMes(c.mes, c.periodo, c.enCurso)}
        te={te}
        eq={eq}
        vendido={fila?.ventas ?? 0}
        vendidoDicho={fila ? { monto: ventaParaDecir(fila).vendido, rotulo: ventaParaDecir(fila).rotulo } : { monto: 0, rotulo: "sin IGV" }}
        gastos={fila?.gastos ?? 0}
        cambio={cambio}
        noVende={noVende}
        provisional={provisional}
        hoyEnElMes={enCurso ? { van: diaDeHoy, total: diasMes } : null}
        hrefGanancias={c.hrefGanancias}
        onAbrir={c.abrirHoja}
        hojas={hojas}
      />
    </div>
  );
}

/** Las preguntas de siempre: cada una abre su hoja (o baja al bloque que la responde). Solo las que tienen con qué responder. */
function BloquePreguntas({ c }: { c: Contexto }) {
  const todas = c.rapido.ver.todas;
  const { saldo, proximos } = cajaSinCompra(c, use(c.l.flujo), use(c.l.planilla));
  const m = use(c.l.mes);
  // La ropa que tienes es de CAYLA entera: mirando una sede no se pregunta (ni se espera su lectura).
  const inventario = todas ? use(c.l.inventarioValor) : null;
  const { fila, filas } = armarMes({ base: c.rapido, estadoMes: m.estado, mes: c.mes, hoy: c.hoy, periodo: c.periodo, faltaDelMes: null });
  const conHoja = (texto: string, h: ClaveHoja, hay: boolean): Pregunta | null => (hay ? { texto, hoja: h } : null);
  const preguntas: Pregunta[] = (
    todas
      ? [
          { texto: "¿Puedo comprar mercadería?", href: "#inversion" },
          conHoja("¿Cuánto le debo a SUNAT?", "sunat", hayHoja("sunat", { saldo })),
          conHoja("¿Gané plata este mes?", "deja", hayHoja("deja", { fila })),
          conHoja("¿Qué tienda vende más?", "ventas", hayHoja("ventas", { filas })),
          conHoja("¿En qué se va la plata?", "gastos", hayHoja("gastos", { fila })),
          conHoja("¿Cuánta ropa tengo?", "inventario", hayHoja("inventario", { inventario })),
        ]
      : [
          conHoja("¿Ganó plata esta sede?", "deja", hayHoja("deja", { fila })),
          conHoja("¿En qué se va la plata?", "gastos", hayHoja("gastos", { fila })),
          // Mirando una sede no se cuenta la compra de campaña (es de CAYLA entera): sus pagos son los de la caja sin ella.
          conHoja("¿Qué paga esta sede?", "pagos", hayHoja("pagos", { proximos })),
        ]
  ).filter((q): q is Pregunta => q !== null);
  if (!preguntas.length) return null;
  return (
    <div data-area="preguntas" {...columna(3)}>
      <Preguntas preguntas={preguntas} onAbrir={c.abrirHoja} />
    </div>
  );
}

/** La caja CON la compra de campaña (mirando CAYLA entera): «Próximos», «Hoy te toca» y la inversión la usan. */
function useCajaConCompra(c: Contexto) {
  const flujo = use(c.l.flujo);
  // La inversión solo entra mirando CAYLA entera; mirando una sede no se espera su lectura.
  const inversion = c.rapido.ver.todas ? use(c.l.inversion) : null;
  return { inversion, ...armarCaja({ r: c.rapido, flujo, planillaSinSalida: null, inversion: inversion?.datos ?? null, ajustes: c.ajustes, elegidas: c.elegidas }) };
}

function BloqueDecidir({ c }: { c: Contexto }) {
  // «Hoy te toca» y «Próximos» cuentan el mismo hecho con el mismo número (el punto más bajo que ve la tarjeta, con la compra si está contada).
  const todo = use(c.l.todo) ?? c.rapido;
  const { caja, campanas } = useCajaConCompra(c);
  const faltan = noRevisado(todo);
  const verReportes = c.acceso.lider || c.acceso.modulos.includes("reportes_financieros");
  const avisos = ordenarAvisos([
    ...alinearAvisoDeCaja(avisosParaDecidir(todo, c.acceso), caja, verReportes ? "/finanzas/reportes/flujo#y-si" : null),
    ...campanas.flatMap((x) => avisoDeInversion(x, c.hoy, c.ajustes.conIgv) ?? []),
  ]);
  return (
    <div data-area="decidir" {...columna(4)} data-guia="fin-resumen.decidir">
      <Superficie pad>
        <CabeceraBloque titulo="Hoy te toca" bajada={bajadaDecidir(c.mes, c.periodo)} />
        <ResumenDecidir avisos={avisos} parcial={faltan.length > 0} />
        {faltan.length > 0 && (
          <ul className="fin-no-revisado">
            {faltan.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        )}
      </Superficie>
    </div>
  );
}

function BloqueProximos({ c }: { c: Contexto }) {
  const { proximos } = useCajaConCompra(c);
  return (
    <div data-area="proximos" id="proximos" {...columna(5, "resumen-ancla")}>
      <Proximos
        datos={proximos}
        hoy={c.hoy}
        hrefPorPagar={c.ve("cuentas_dinero") ? c.ir("/finanzas/dinero/por-pagar") : null}
        onVerTodo={hayHoja("pagos", { proximos }) ? () => c.abrirHoja("pagos") : undefined}
      />
    </div>
  );
}

function BloqueTiendas({ c, solo }: { c: Contexto; solo: boolean }) {
  const m = use(c.l.mes);
  const confianza = use(c.l.confianza);
  const { filas } = armarMes({ base: c.rapido, estadoMes: m.estado, mes: c.mes, hoy: c.hoy, periodo: c.periodo, faltaDelMes: null });
  // Las tiendas solo se dibujan si alguna vendió (la pieza no dibuja nada sin ventas: no se le guarda lugar).
  const vendidoSedes = vendidoPorSede(filas, c.sedes, mesNombre(c.mes));
  if (!vendidoSedes.tramos.length) return null;
  const reportes = c.ir("/finanzas/reportes");
  return (
    <div data-area="tiendas" data-solo={solo ? "" : undefined} id="tiendas" {...columna(7, "resumen-ancla")}>
      <VendidoPorSede vendido={vendidoSedes} hoy={c.hoy} mes={mesNombre(c.mes)} confianza={confianza.datos} falla={confianza.falla} hrefCuadre={`${reportes}${reportes.includes("?") ? "&" : "?"}cuadre=1#de-ventas-a-finanzas`} />
    </div>
  );
}

/** Las hojas de detalle (camino A, «También las hojas»): de lo que la pantalla ya leyó; cada una termina en la pantalla que lo resuelve. */
function BloqueHojas({ c, abierta, volverA }: { c: Contexto; abierta: ClaveHoja | null; volverA: RefObject<HTMLElement | null> }) {
  const planilla = use(c.l.planilla);
  const m = use(c.l.mes);
  const falta = use(c.l.faltaDelMes);
  const todo = use(c.l.todo) ?? c.rapido;
  const ventasPorDia = use(c.l.ventas);
  const estadoAntes = use(c.l.antes);
  const confianza = use(c.l.confianza);
  const inventarioValor = c.rapido.ver.todas ? use(c.l.inventarioValor) : null;
  const { caja, proximos, cajaSola } = useCajaConCompra(c);
  const { saldo } = armarCaja({ r: c.rapido, flujo: use(c.l.flujo), planillaSinSalida: planilla, inversion: null, ajustes: c.ajustes, elegidas: c.elegidas });
  const { mes, hoy, periodo, enCurso, inicioFinanzas } = c;
  const { r, filas, fila, te } = armarMes({ base: todo, estadoMes: m.estado, mes, hoy, periodo, faltaDelMes: falta });
  const provisional = !confianza.datos || confianza.datos.nivel === "bajo";
  const comparacion = comparacionMesPasado(filas, estadoAntes);
  const resp = respuestaResumen(r, comparacion.antes, provisional, enCurso, comparacion.antesDeSueldos, inicioFinanzas);
  const filaAntes = estadoAntes ? (filaDeVer(estadoAntes, r.ver) ?? null) : null;
  const noVende = r.ver.todas || r.ver.tipo === "tienda" ? null : resp;
  const cambio = fila && filaAntes && filaAntes.ventas > 0 && !noVende ? { pct: fila.ventas / filaAntes.ventas - 1, contra: nombreDelAnterior(periodo) } : null;
  const eq = periodo.unMes ? equilibrioMes({ r, filas, ventasPorDia, hoy, mes, enCurso, faltaDelMes: falta, inicioFinanzas }) : null;
  const datos: DatosHojas = {
    saldo,
    te,
    fila,
    filas,
    filasAntes: estadoAntes,
    contra: cambio?.contra ?? null,
    proximos,
    inventario: r.ver.todas ? inventarioValor : null,
    hoy,
    enElPeriodo: periodo.en,
    eq,
    hoyEnElMes: enCurso ? { van: Number(hoy.slice(8, 10)), total: new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0)).getUTCDate() } : null,
    // Los gráficos de las hojas: la venta de cada día (si la cuenta ve Rendimiento) y la caja de 14 días, la misma de «Próximos».
    ventasDia: ventasPorDia ? ventasDiaADia(ventasPorFecha(ventasPorDia.series), periodo.desde, periodo.hasta, hoy) : null,
    caja: caja.tipo === "cayla" && cajaSola.tipo === "cayla" ? { puntos: caja.puntos.filter((p) => p.fecha <= cajaSola.hasta), minimo: caja.minimo } : null,
    sedes: c.sedes,
  };
  const conDestino = (modulo: string, ruta: string, texto: string) => (c.ve(modulo) ? { href: c.ir(ruta), texto } : undefined);
  const destinos: DestinosHojas = {
    plata: conDestino("cuentas_dinero", "/finanzas/dinero", "Cuentas y dinero"),
    deja: c.hrefGanancias ? { href: c.hrefGanancias, texto: "Ganancias y pérdidas" } : undefined,
    ventas: c.hrefGanancias ? { href: c.hrefGanancias, texto: "Ganancias y pérdidas" } : undefined,
    gastos: conDestino("gastos", "/finanzas/gastos", "Gastos"),
    pagos: conDestino("cuentas_dinero", "/finanzas/dinero/por-pagar", "Por pagar"),
    sunat: conDestino("impuestos", "/finanzas/impuestos", "Impuestos"),
    inventario: c.ve("existencias") ? { href: "/inventario", texto: "Existencias" } : undefined,
  };
  return <HojasResumen abierta={abierta} onAbrir={c.abrirHoja} datos={datos} destinos={destinos} volverA={volverA} />;
}

function BloqueSedes({ c }: { c: Contexto }) {
  const m = use(c.l.mes);
  const cajasPorSede = use(c.l.cajasPorSede);
  const estimados = use(c.l.estimados);
  if (!cajasPorSede) return null;
  const filas = m.estado.falla ? [] : m.estado.datos;
  const juntas = sedesJuntas(filas, cajasPorSede.falla ? null : cajasPorSede.datos, estimados);
  if (!juntas) return null;
  return <SedesJuntas juntas={juntas} mes={mesNombre(c.mes)} hoy={c.hoy} falla={cajasPorSede.falla ?? null} />;
}

/** «A dónde va la plata», con «Vendiste X con IGV y salió Y» debajo: de lo mismo que dibuja el recorrido, así que las dos dicen el mismo número. */
function BloquePlata({ c }: { c: Contexto }) {
  const m = use(c.l.mes);
  const filas = m.estado.falla ? [] : m.estado.datos;
  const recorrido = filas.length ? recorridoPlata(filas, c.rapido.ver) : null;
  if (!recorrido || !recorrido.salidas.some((h) => h.monto > 0)) return null;
  const frasePlata = vendisteYSalio(recorrido);
  return (
    <div id="a-donde-va" {...columna(8, "resumen-ancla")}>
      <AdondeVaLaPlata recorrido={recorrido} bajada={frasePlata ? `${frasePlata} ${recorrido.nota}` : recorrido.nota} />
    </div>
  );
}

function BloqueCambios({ c }: { c: Contexto }) {
  const m = use(c.l.mes);
  const estadoAntes = use(c.l.antes);
  const { r, filas } = armarMes({ base: c.rapido, estadoMes: m.estado, mes: c.mes, hoy: c.hoy, periodo: c.periodo, faltaDelMes: null });
  const comparacion = comparacionMesPasado(filas, estadoAntes);
  return <CambiosDelMesPieza cambios={cambiosDelMes({ r, ...comparacion, enCurso: c.enCurso, inicioFinanzas: c.inicioFinanzas })} />;
}

function BloqueInversion({
  c,
  onElegir,
  abierta,
  onAbrir,
  onCambiarAjustes,
}: {
  c: Contexto;
  onElegir: (id: string, clave: string) => void;
  abierta: string | null;
  onAbrir: (id: string | null) => void;
  onCambiarAjustes: (a: AjustesResumen) => void;
}) {
  const flujo = use(c.l.flujo);
  const inversion = use(c.l.inversion);
  const { todasLasCampanas, campanas, proyeccion } = armarCaja({ r: c.rapido, flujo, planillaSinSalida: null, inversion: inversion.datos, ajustes: c.ajustes, elegidas: c.elegidas });
  return (
    <>
      {inversion.falla && (
        <Aviso tono="atencion" titulo="Inversión en mercadería">
          {inversion.falla} Lo ya registrado (órdenes, facturas por pagar) sigue contando.
        </Aviso>
      )}
      <div id="inversion" className="resumen-ancla space-y-4 pb-4">
        <InversionMercaderia
          campanas={campanas}
          conIgv={c.ajustes.conIgv}
          hoy={c.hoy}
          proyeccion={proyeccion}
          elegidas={c.elegidas}
          onElegir={onElegir}
          abierta={abierta}
          onAbrir={onAbrir}
          vacio={vacioDeInversion({ leida: inversion.datos !== null && !inversion.falla, todas: c.rapido.ver.todas, ocultasAqui: todasLasCampanas.some((x) => x.visible) && campanas.length === 0 })}
        />
        <AjustesDelResumen campanas={todasLasCampanas.filter((x) => x.visible)} ajustes={c.ajustes} onCambiar={onCambiarAjustes} />
      </div>
    </>
  );
}
