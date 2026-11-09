"use client";

import { useSearchParams } from "next/navigation";
import { useRef, useState, type CSSProperties, type ReactNode } from "react";
import { BookOpen, CalendarCheck, Percent, Wallet } from "lucide-react";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { SelectorPeriodo } from "@/components/finanzas/estados/SelectorPeriodo";
import { letraEstados } from "@/lib/letra-estados";
import type { Periodo } from "@/lib/estados-periodo";
import { Aviso } from "@/components/ui/Aviso";
import { CabeceraBloque, Superficie } from "@/components/finanzas/kit";
import { AjustesResumen } from "@/components/finanzas/AjustesResumen";
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
import { HojasResumen, hojasQueHay, type DatosHojas, type DestinosHojas } from "@/components/finanzas/bolsillos/HojasResumen";
import type { ClaveHoja } from "@/lib/hojas-resumen-reglas";
import type { SedeConValor } from "@/lib/valor-inventario-reglas";
import { proximosPagos } from "@/lib/proximos-reglas";
import { FRASE_DE_SIEMPRE, fraseDelResumen } from "@/lib/frase-resumen-reglas";
import { teDejaDelMes } from "@/lib/te-deja-mes-reglas";
import { conElRango, nombreDelAnterior } from "@/lib/estados-periodo";
import { saldoEnBolsillos } from "@/lib/bolsillos-reglas";
import { alinearAvisoDeCaja, cajaProxima, type FlujoProximo } from "@/lib/caja-proxima-reglas";
import { equilibrioMes, type FaltaDelMes } from "@/lib/equilibrio-mes-reglas";
import type { Confianza as ConfianzaDatos } from "@/lib/finanzas-confianza";
import type { Lectura } from "@/lib/resumen-finanzas";
import { mesNombre, type FilaER } from "@/lib/resultados-reglas";
import { hrefTelar, mesDelDia, porSedeDe, sedeDeLaUrl, type SedeTelar } from "@/lib/finanzas-telar-reglas";
import { soles } from "@/lib/flujo-caja-reglas";
import { recorridoPlata } from "@/lib/recorrido-plata-reglas";
import { cambiosDelMes } from "@/lib/resumen-cambios-reglas";
import { avisosParaDecidir, filaDeVer, noRevisado, ordenarAvisos, type Acceso, type ResumenFinanzas } from "@/lib/resumen-finanzas-reglas";
import { campanasQueSeVen } from "@/lib/ajustes-resumen-reglas";
import { avisoDeInversion, pagosDeLaCompra, type CampanaInversion } from "@/lib/inversion-mercaderia-reglas";
import {
  mesAnteriorDe,
  comparacionMesPasado,
  respuestaResumen,
  vendidoPorSede,
  type DiaVenta,
} from "@/lib/resumen-telar-reglas";

// Finanzas ▸ Resumen, camino «A · Bolsillos» (Felipe 2026-11-09; antes El telar, ADR-0493): la plata contada como en la app del banco. A la izquierda,
// «Libre para usar» con sus bolsillos, las preguntas de siempre y los movimientos; a la derecha, cómo va el mes, «Hoy te toca», «Próximos» y las tiendas
// con la confianza del número (ADR-0417). Debajo, «Cada sede, junta», «A dónde va la plata», lo que más se movió y, al final, la inversión en mercadería
// (siempre a la vista, Felipe 2026-10-29). La sede la pone la barra común; las fechas, el calendario de Estados financieros en la cabecera.
// No calcula plata: lo arman `bolsillos-reglas`, `te-deja-mes-reglas`, `proximos-reglas`, `recorrido-plata-reglas`, `resumen-telar-reglas` y
// `resumen-finanzas-reglas` con lo que lee la página.

/** La entrada escalonada de cada pieza (con la clase de su lugar, si lleva). */
const columna = (i: number, clase = "") => ({ className: `anim-entra ${clase}`.trim(), style: { ["--i" as string]: i } as CSSProperties });

type Props = {
  resumen: ResumenFinanzas | null;
  falla: string | null;
  confianza: Lectura<ConfianzaDatos | null>;
  /** El mes que se mira («2026-10», el de `hasta` del período) y hoy («2026-10-23»). */
  mes: string;
  /** Las fechas del calendario: un mes entero o cualquier tramo (`leerPeriodo`, el mismo de Estados financieros). */
  periodo: Periodo;
  /** Desde cuándo hay Finanzas: el calendario no ofrece antes. */
  minimo: string | null;
  hoy: string;
  /** El Estado de resultados del mes elegido (al día de hoy si es el mes en curso), de todas las sedes que la cuenta ve. */
  estadoMes: Lectura<FilaER[]>;
  /** El tramo con que se compara (el mes pasado a la misma fecha); `null` si no se pudo leer. */
  estadoAntes: FilaER[] | null;
  faltaDelMes: readonly FaltaDelMes[] | null;
  planillaSinSalida: number | null;
  /** Lo vendido por día de cada tienda; `null` si la cuenta no ve Rendimiento. */
  ventasPorDia: { series: DiaVenta[][]; incompleta: boolean } | null;
  sedes: SedeTelar[];
  /** La proyección de caja con sus cobros y salidas por día (la de Dinero ▸ Flujo), para «Tu caja en las próximas dos semanas». */
  flujoProximo: FlujoProximo;
  /** La inversión en mercadería que entrega el Plan de campaña; `null` si esta base aún no la trae (entonces no se ofrece nada). */
  inversion: CampanaInversion[] | null;
  /** La lectura del Plan de campaña se cayó (ADR-0527): el bloque no se dibuja y se dice, nunca un 0 que parezca un dato. */
  inversionFalla?: string | null;
  acceso: Acceso;
  /** «Movimientos» (camino A): lo arma la página como Server Component dentro de su `Suspense`; `null` si la cuenta no ve el flujo de CAYLA entera. */
  movimientos?: ReactNode;
  /** Lo que vale la ropa a costo por sede (para su hoja); `null` si la cuenta no ve el dinero de Compras o la base no respondió. */
  inventarioValor?: SedeConValor[] | null;
  /** La caja de cada sede, para «Cada sede, junta»; `null` si la cuenta no ve todas las sedes. */
  cajasPorSede?: Lectura<UnidadBalance[]> | null;
};


export function ResumenFinanzasPanel({ resumen, falla, confianza, mes, periodo, minimo, hoy, estadoMes, estadoAntes, faltaDelMes, planillaSinSalida, ventasPorDia, sedes, flujoProximo, inversion, inversionFalla = null, acceso, cajasPorSede = null, movimientos = null, inventarioValor = null }: Props) {
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
  const delPlan = inversion ?? [];
  const mesDeHoy = mesDelDia(hoy);
  // Lo que va por mes (el equilibrio, «al ritmo de hoy») solo se dice mirando un mes entero; el mes en curso es el de hoy hasta hoy.
  const enCurso = periodo.unMes && mes === mesDeHoy;
  // Las acciones del dock llevan la sede y el mes que se miran (`hrefTelar`).
  const ir = (ruta: string) => hrefTelar(ruta, sp.entries(), {}, { mismaPantalla: false, mesDeHoy });
  const dock = (
    <DockTelar
      acciones={[
        { texto: "Pagar facturas", tecla: "p", icono: <Wallet aria-hidden />, principal: true, href: ir("/finanzas/dinero/por-pagar") },
        { texto: "IGV del mes", tecla: "i", icono: <Percent aria-hidden />, href: ir("/finanzas/impuestos") },
        { texto: "Cierre de mes", tecla: "m", icono: <CalendarCheck aria-hidden />, href: ir("/finanzas/cierre") },
        { texto: "Reportes", tecla: "r", icono: <BookOpen aria-hidden />, href: ir("/finanzas/reportes") },
      ]}
    />
  );

  const fecha = (
    <span className={`${letraEstados.variable} estados-vidrio contents`}>
      <SelectorPeriodo desde={periodo.desde} hasta={periodo.hasta} hoy={hoy} minimo={minimo} una={false} sede={sedeDeLaUrl({ sede: sp.get("sede"), ver: sp.get("ver") })} />
    </span>
  );

  if (!resumen) {
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

  // El Resumen del mes elegido: los avisos son de hoy, pero la respuesta, el orillo y el recorrido salen del mes de la barra.
  const r: ResumenFinanzas = {
    ...resumen,
    mes,
    mesAnterior: mesAnteriorDe(mes),
    resultadosMes: estadoMes.falla
      ? { estado: "falla", mensaje: "No se pudo leer el estado de resultados de este mes. Vuelve a cargar la página en un rato." }
      : { estado: "ok", datos: estadoMes.datos },
  };
  const provisional = !confianza.datos || confianza.datos.nivel === "bajo";
  const filas = estadoMes.falla ? [] : estadoMes.datos;
  const comparacion = comparacionMesPasado(filas, estadoAntes);
  const resp = respuestaResumen(r, comparacion.antes, provisional, enCurso, comparacion.antesDeSueldos);
  const recorrido = filas.length ? recorridoPlata(filas, r.ver) : null;
  const faltan = noRevisado(resumen);
  // La inversión en mercadería es de CAYLA entera: mirando una sola sede no se reparte (como el saldo de los bancos), así que ahí no se dibuja.
  const todasLasCampanas = r.ver.todas ? delPlan : [];
  const campanas = campanasQueSeVen(todasLasCampanas, ajustes);
  // La compra de campaña que falta pedir entra a la caja como un pago aparte (no como un gasto) si la persona la deja y se mira CAYLA entera.
  const proyeccion = flujoProximo.estado === "ok" ? flujoProximo.datos : null;
  const pagosDeCompra = ajustes.enCaja && proyeccion ? pagosDeLaCompra(campanas, proyeccion, ajustes.conIgv, elegidas) : [];
  const caja = cajaProxima({ flujo: flujoProximo, cuentas: r.cuentas.estado === "ok" ? r.cuentas.datos : null, ver: r.ver, inversion: pagosDeCompra.length ? { pagos: pagosDeCompra, dias: 42 } : null });
  // «Libre para usar» y sus bolsillos (camino A, Felipe 2026-11-09): de la misma caja, pero sin la compra de campaña que todavía no se pide (no tiene dueño
  // aún) y con su ventana de 14 días de siempre, aunque la caja mire seis semanas por la inversión.
  const cajaSola = cajaProxima({ flujo: flujoProximo, cuentas: r.cuentas.estado === "ok" ? r.cuentas.datos : null, ver: r.ver });
  const saldo = saldoEnBolsillos({ caja: cajaSola, proyeccion, planillaSinSalida, cuentas: r.cuentas.estado === "ok" ? r.cuentas.datos : null });
  // «Próximos»: los mismos pagos de los bolsillos, uno por renglón, y el día más justo de la caja que dibuja la pantalla (con la compra si se cuenta).
  const deLaSede = r.ver.todas ? null : r.ver.soloEmpresa ? (u: string | null) => u === null : (u: string | null) => u === r.ver.ubicacionId;
  const proximos = proximosPagos({ cajaSola, caja, proyeccion, compra: pagosDeCompra, deLaSede });
  const ve = (modulo: string) => acceso.lider || acceso.modulos.includes(modulo);
  const destino = (modulo: string, ruta: string) => (ve(modulo) ? ir(ruta) : undefined);

  // «Noviembre va así» (camino A): lo que te deja el mes —estimado con rango mientras corre (Felipe 2026-11-09)— y, abajo, si ya se pagó el mes.
  const fila = filaDeVer(filas, r.ver) ?? null;
  const filaAntes = estadoAntes ? (filaDeVer(estadoAntes, r.ver) ?? null) : null;
  const te = teDejaDelMes({ f: fila, ver: r.ver, mes, hoy, unMes: periodo.unMes, faltaDelMes });
  const eq = periodo.unMes ? equilibrioMes({ r, filas, ventasPorDia, hoy, mes, enCurso, faltaDelMes }) : null;
  const Mes = mesNombre(mes).charAt(0).toUpperCase() + mesNombre(mes).slice(1);
  const tituloMes = !periodo.unMes ? periodo.titulo : enCurso ? `${Mes} va así` : `Así cerró ${mesNombre(mes)}`;
  const diaDeHoy = Number(hoy.slice(8, 10));
  const diasMes = new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0)).getUTCDate();
  const noVende = r.ver.todas || r.ver.tipo === "tienda" ? null : resp;
  const cambio = fila && filaAntes && filaAntes.ventas > 0 && !noVende ? { pct: fila.ventas / filaAntes.ventas - 1, contra: nombreDelAnterior(periodo) } : null;
  // Las tiendas solo se dibujan si alguna vendió (la pieza no dibuja nada sin ventas: no se le guarda lugar).
  const hayTiendas = vendidoPorSede(filas).some((x) => x.monto > 0);
  const hrefGanancias = ve("reportes_financieros") ? conElRango(ir("/finanzas/reportes"), sp.entries()) : null;
  // Las hojas de detalle (camino A, «También las hojas»): de lo que la pantalla ya leyó; cada una termina en la pantalla que lo resuelve.
  const datosHojas: DatosHojas = {
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
  };
  const hay = hojasQueHay(datosHojas);
  const conDestino = (modulo: string, ruta: string, texto: string) => (ve(modulo) ? { href: ir(ruta), texto } : undefined);
  const destinosHojas: DestinosHojas = {
    plata: conDestino("cuentas_dinero", "/finanzas/dinero", "Cuentas y dinero"),
    deja: hrefGanancias ? { href: hrefGanancias, texto: "Ganancias y pérdidas" } : undefined,
    ventas: hrefGanancias ? { href: hrefGanancias, texto: "Ganancias y pérdidas" } : undefined,
    gastos: conDestino("gastos", "/finanzas/gastos", "Gastos"),
    pagos: conDestino("cuentas_dinero", "/finanzas/dinero/por-pagar", "Por pagar"),
    sunat: conDestino("impuestos", "/finanzas/impuestos", "Impuestos"),
    inventario: ve("existencias") ? { href: "/inventario", texto: "Existencias" } : undefined,
  };
  // Las preguntas de siempre: cada una abre su hoja (o baja al bloque que la responde). Solo las que tienen con qué responder.
  const conHoja = (texto: string, h: ClaveHoja): Pregunta | null => (hay.includes(h) ? { texto, hoja: h } : null);
  const preguntas: Pregunta[] = (
    r.ver.todas
      ? [
          { texto: "¿Puedo comprar mercadería?", href: "#inversion" },
          conHoja("¿Cuánto le debo a SUNAT?", "sunat"),
          conHoja("¿Gané plata este mes?", "deja"),
          conHoja("¿Qué tienda vende más?", "ventas"),
          conHoja("¿En qué se va la plata?", "gastos"),
          conHoja("¿Cuánta ropa tengo?", "inventario"),
        ]
      : [conHoja("¿Ganó plata esta sede?", "deja"), conHoja("¿En qué se va la plata?", "gastos"), conHoja("¿Qué paga esta sede?", "pagos")]
  ).filter((q): q is Pregunta => q !== null);
  // «Hoy te toca» y «Próximos» cuentan el mismo hecho con el mismo número (el punto más bajo que ve la tarjeta, con la compra si está contada).
  const verReportes = acceso.lider || acceso.modulos.includes("reportes_financieros");
  const avisos = ordenarAvisos([
    ...alinearAvisoDeCaja(avisosParaDecidir(resumen, acceso), caja, verReportes ? "/finanzas/reportes/flujo#y-si" : null),
    ...campanas.flatMap((c) => avisoDeInversion(c, hoy, ajustes.conIgv) ?? []),
  ]);
  const sede = r.ver.todas ? "Todas las sedes" : r.ver.soloEmpresa ? "Empresa" : r.ver.nombre.replace(/^Tienda\s+/i, "");

  // «Vendiste X y salió Y» bajo «¿Cuánto te deja?»: de lo mismo que dibuja «A dónde va la plata» (el recorrido), así que las dos dicen el mismo número.
  const plata = recorrido && recorrido.modo === "vende" ? { vendido: recorrido.nudo.monto, salio: recorrido.salidas.filter((h) => h.tipo !== "deja").reduce((a, h) => a + h.monto, 0), nota: r.ver.todas ? undefined : recorrido.nota } : null;
  const bajadaPlata = recorrido
    ? recorrido.modo === "vende" && plata
      ? `Vendiste ${soles(plata.vendido)} y salió ${soles(plata.salio)}. ${recorrido.nota}`
      : recorrido.nota
    : "";
  const juntas = cajasPorSede && r.ver.todas ? sedesJuntas(filas, cajasPorSede.falla ? null : cajasPorSede.datos) : null;

  return (
    // `pantalla-en-vidrio`: el Resumen ya está rediseñado (camino A), así que sus bloques van al vidrio claro, como en la maqueta (ADR-0596); las cifras,
    // en la letra de Estados financieros (Inter, ADR-0611).
    <div className={`pantalla-en-vidrio resumen-bolsillos space-y-6 ${letraEstados.variable}`}>
      <EncabezadoPagina sede={sede} titulo="Resumen" subtitulo={FRASE_DE_SIEMPRE} acciones={fecha} />
      {/* La respuesta, a la vista bajo la cabecera, como en la maqueta: cuánto tienes, cuánto puedes usar y cuánto te deja el mes (los mismos números
          de las tarjetas de abajo, `fraseDelResumen`). El subtítulo de la cabecera queda en su «?», como en todo el ERP. */}
      <p className="resumen-frase anim-entra" style={{ ["--i" as string]: 0 } as CSSProperties}>
        {fraseDelResumen({ saldo, te, nombreMes: mesNombre(mes), enCurso: periodo.enCurso && periodo.unMes }).map((p, i) =>
          p.fuerte ? (
            <b key={i} className="num">
              {p.texto}
            </b>
          ) : (
            <span key={i}>{p.texto}</span>
          ),
        )}
      </p>
      {/* Camino «A · Bolsillos» (Felipe 2026-11-09; maqueta docs/maquetas/finanzas-resumen-de-punta-a-punta-2026-11/), armado POR FILAS: lo libre junto al
          mes, las preguntas a lo ancho, lo urgente junto a lo que viene y los movimientos junto a las tiendas. Las dos tarjetas de una fila miden lo mismo,
          así ninguna columna termina antes que la otra (con dos pilas sueltas quedaba media pantalla vacía al pie de la más corta, Felipe 2026-11-09). En
          una sola columna, el orden del código es el de importancia. */}
      <div className="resumen-a">
        <div data-area="libre" {...columna(1)}>
          <SaldoLibre saldo={saldo} onAbrir={setHoja} otroMes={periodo.enCurso ? null : mesNombre(mes)} />
        </div>
        <div data-area="mes" {...columna(2)}>
          <TarjetaMes
            titulo={tituloMes}
            te={te}
            eq={eq}
            vendido={fila?.ventas ?? 0}
            gastos={fila?.gastos ?? 0}
            cambio={cambio}
            noVende={noVende}
            provisional={provisional}
            hoyEnElMes={enCurso ? { van: diaDeHoy, total: diasMes } : null}
            hrefGanancias={hrefGanancias}
            onAbrir={setHoja}
            hojas={hay}
          />
        </div>
        {preguntas.length > 0 && (
          <div data-area="preguntas" {...columna(3)}>
            <Preguntas preguntas={preguntas} onAbrir={setHoja} />
          </div>
        )}
        <div data-area="decidir" {...columna(4)} data-guia="fin-resumen.decidir">
          <Superficie pad>
            <CabeceraBloque titulo="Hoy te toca" bajada={periodo.enCurso ? "Lo urgente, primero." : `Es de hoy, aunque mires ${mesNombre(mes)}. Lo urgente, primero.`} />
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
        <div data-area="proximos" id="proximos" {...columna(5, "resumen-ancla")}>
          <Proximos
            datos={proximos}
            hoy={hoy}
            hrefPorPagar={destino("cuentas_dinero", "/finanzas/dinero/por-pagar") ?? null}
            onVerTodo={hay.includes("pagos") ? () => setHoja("pagos") : undefined}
          />
        </div>
        {movimientos && (
          <div data-area="movs" data-solo={hayTiendas ? undefined : ""} {...columna(6)}>
            {movimientos}
          </div>
        )}
        {/* «Tus tiendas»: lo vendido por sede con la confianza del número, en UNA tarjeta (ADR-0417; Felipe 2026-10-29). Sin ventas no se dibuja. */}
        {hayTiendas && (
          <div data-area="tiendas" data-solo={movimientos ? undefined : ""} id="tiendas" {...columna(7, "resumen-ancla")}>
            <VendidoPorSede porSede={porSedeDe(vendidoPorSede(filas))} sedes={sedes} hoy={hoy} mes={mesNombre(mes)} confianza={confianza.datos} falla={confianza.falla} hrefCuadre={`${ir("/finanzas/reportes")}${ir("/finanzas/reportes").includes("?") ? "&" : "?"}cuadre=1#de-ventas-a-finanzas`} />
          </div>
        )}
      </div>
      {dock}

      <HojasResumen abierta={hoja} onAbrir={setHoja} datos={datosHojas} destinos={destinosHojas} volverA={origenDeLaHoja} />

      {/* «Cada sede, junta» (tarea 27), a todo el ancho: es una tabla. */}
      {juntas && <SedesJuntas juntas={juntas} mes={mesNombre(mes)} hoy={hoy} falla={cajasPorSede?.falla ?? null} />}

      {/* El último par: a dónde va la plata y lo que más se movió, mitad y mitad y del mismo alto (como las filas de arriba). Sin salidas que repartir, el
          anillo no dibuja nada y no se le guarda lugar: lo que más se movió toma la fila entera. */}
      <div className="resumen-par">
        {recorrido && recorrido.salidas.some((h) => h.monto > 0) && (
          <div id="a-donde-va" {...columna(8, "resumen-ancla")}>
            <AdondeVaLaPlata recorrido={recorrido} bajada={bajadaPlata} />
          </div>
        )}
        <div {...columna(9)}>
          <CambiosDelMesPieza cambios={cambiosDelMes({ r, ...comparacion, enCurso })} />
        </div>
      </div>

      {/* La inversión en mercadería, AL FINAL y siempre a la vista (Felipe 2026-10-29): sin nada pendiente dice eso en una línea. No es un gasto:
          sale de la caja cuando se paga. Solo existe si el Plan de campaña la entrega y se deja ver. */}
      {inversionFalla && (
        <Aviso tono="atencion" titulo="Inversión en mercadería">
          {inversionFalla} Lo ya registrado (órdenes, facturas por pagar) sigue contando.
        </Aviso>
      )}
      <div id="inversion" className="resumen-ancla space-y-4 pb-4">
        <InversionMercaderia
          campanas={campanas}
          conIgv={ajustes.conIgv}
          hoy={hoy}
          proyeccion={proyeccion}
          elegidas={elegidas}
          onElegir={(id, clave) => setElegidas((e) => ({ ...e, [id]: clave }))}
          abierta={abierta}
          onAbrir={setAbierta}
          ocultasAqui={todasLasCampanas.some((c) => c.visible) && campanas.length === 0}
        />
        <AjustesResumen campanas={todasLasCampanas.filter((c) => c.visible)} ajustes={ajustes} onCambiar={ponerAjustes} />
      </div>
    </div>
  );
}
