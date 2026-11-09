"use client";

import { useSearchParams } from "next/navigation";
import { useState, type CSSProperties } from "react";
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
import { proximosPagos } from "@/lib/proximos-reglas";
import { teDejaDelMes } from "@/lib/te-deja-mes-reglas";
import { conElRango, nombreDelAnterior } from "@/lib/estados-periodo";
import { saldoEnBolsillos, type ClaveBolsillo } from "@/lib/bolsillos-reglas";
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

// Finanzas ▸ Resumen en El telar (Felipe 2026-10-23, ADR-0493), pulido el 2026-10-29: arriba, las tres respuestas (¿cuánto tienes —de CAYLA y de CLAURE—?,
// ¿cuánto debes pronto —cada deuda con su fecha—?, ¿cuánto te deja?), «Vendido por sede» con la confianza del número adentro (ADR-0417), la caja
// al lado de «Hoy te toca», «A dónde va la plata» (el anillo), «¿Ya pagaste el mes?» y, al final, la inversión en mercadería (siempre a la vista).
// La sede la pone la barra común; las fechas, el calendario de Estados financieros en la cabecera (camino «A · Bolsillos», Felipe 2026-11-09).
// No calcula plata: lo arman `recorrido-plata-reglas`, `resumen-telar-reglas` y `resumen-finanzas-reglas` con lo que lee la página.

/** La entrada escalonada de cada pieza; esta llena su celda: dos tarjetas lado a lado miden lo mismo. */
const alto = (i: number) => ({ className: "anim-entra h-full", style: { ["--i" as string]: i } as CSSProperties });
/** Una tarjeta de las columnas: no se parte entre dos y deja 1 rem hasta la de abajo. */
const columna = (i: number) => ({ className: "anim-entra", style: { ["--i" as string]: i } as CSSProperties });

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
  /** La caja de cada sede, para «Cada sede, junta»; `null` si la cuenta no ve todas las sedes. */
  cajasPorSede?: Lectura<UnidadBalance[]> | null;
};

const FRASE = "De lo que vendes a lo que te queda.";

export function ResumenFinanzasPanel({ resumen, falla, confianza, mes, periodo, minimo, hoy, estadoMes, estadoAntes, faltaDelMes, planillaSinSalida, ventasPorDia, sedes, flujoProximo, inversion, inversionFalla = null, acceso, cajasPorSede = null }: Props) {
  const sp = useSearchParams();
  // «Qué se ve»: lo que esta persona esconde de la inversión en mercadería, y qué forma de pagar mira en cada campaña (mirar no guarda nada).
  const [ajustes, ponerAjustes] = useAjustesResumen();
  const [elegidas, setElegidas] = useState<Record<string, string>>({});
  const [abierta, setAbierta] = useState<string | null>(null);
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
      <div className="space-y-6">
        <EncabezadoPagina sede="Finanzas" titulo="Resumen" subtitulo={FRASE} acciones={fecha} />
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
  const destinos: Partial<Record<ClaveBolsillo, string>> = {
    equipo: destino("cuentas_dinero", "/finanzas/dinero"),
    sunat: destino("impuestos", "/finanzas/impuestos"),
    proveedores: destino("cuentas_dinero", "/finanzas/dinero/por-pagar"),
    fijos: destino("gastos", "/finanzas/gastos"),
    otros: destino("reportes_financieros", "/finanzas/reportes/flujo"),
    compras: destino("cuentas_dinero", "/finanzas/dinero"),
    claure: destino("cuentas_dinero", "/finanzas/dinero/claure"),
    planilla: destino("cuentas_dinero", "/finanzas/dinero"),
  };
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
  const hrefGanancias = ve("reportes_financieros") ? conElRango(ir("/finanzas/reportes"), sp.entries()) : null;
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
    <div className="space-y-6">
      <EncabezadoPagina sede={sede} titulo="Resumen" subtitulo={FRASE} acciones={fecha} />
      {/* Las tres preguntas que una persona sin formación de finanzas se hace al abrir esta pantalla, con la cifra de cada una. «Tienes» dice cuánto es de CAYLA
          y cuánto de CLAURE, y «Debes pronto» lista cada deuda con su fecha (Felipe 2026-10-29). */}
      {/* Camino A (Felipe 2026-11-09): «Libre para usar» con sus bolsillos reemplaza a «¿Cuánto tienes?»; las otras dos respuestas siguen a su lado. */}
      <section className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <SaldoLibre saldo={saldo} destinos={destinos} otroMes={periodo.enCurso ? null : mesNombre(mes)} />
        <div className="flex min-w-0 flex-col gap-4">
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
          />
        </div>
      </section>
      {/* «Vendido por sede» y la confianza del número, en UNA tarjeta (ADR-0417; Felipe 2026-10-29, opción 3). Si no se pudo medir, se dice (nunca un 0 % falso). */}
      <VendidoPorSede porSede={porSedeDe(vendidoPorSede(filas))} sedes={sedes} hoy={hoy} mes={mesNombre(mes)} confianza={confianza.datos} falla={confianza.falla} hrefCuadre={`${ir("/finanzas/reportes")}${ir("/finanzas/reportes").includes("?") ? "&" : "?"}cuadre=1#de-ventas-a-finanzas`} />
      {juntas && <SedesJuntas juntas={juntas} mes={mesNombre(mes)} hoy={hoy} falla={cajasPorSede?.falla ?? null} />}
      {dock}

      {/* La caja y «Hoy te toca» van lado a lado y a la misma altura (desde 1280 px, con 20 rem de piso para «Hoy te toca»: antes, a 1024 px
          quedaba tan angosta que partía el texto palabra por palabra). Más angosto, una bajo la otra. Sin huecos (Felipe 2026-10-26). */}
      <section className="grid items-stretch gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(20rem,1fr)]">
        <div {...alto(2)}>
          <Proximos datos={proximos} hoy={hoy} hrefPorPagar={destino("cuentas_dinero", "/finanzas/dinero/por-pagar") ?? null} hrefFlujo={ve("reportes_financieros") ? ir("/finanzas/reportes/flujo") : null} />
        </div>

        <div {...alto(3)} data-guia="fin-resumen.decidir">
          <Superficie pad className="h-full">
            <CabeceraBloque titulo="Hoy te toca" bajada={enCurso ? "Lo urgente, primero." : `Es de hoy, aunque mires ${mesNombre(mes)}. Lo urgente, primero.`} />
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
      </section>

      {/* Lo demás, en dos columnas FIJAS: el anillo a la izquierda y «¿Ya pagaste el mes?» con «Contra el mes pasado» apiladas a la derecha, cada
          una pegada a la de arriba, sin aire entre ellas (Felipe 2026-10-26). Con menos de 69 rem van en una sola, en el mismo orden. Con columnas
          fijas, lo que crece solo empuja lo que tiene debajo (con `columns-[34rem]` el navegador pasaba una tarjeta de columna a media animación). */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(34rem,100%),1fr))] items-start gap-4">
        <div {...columna(4)}>
          {recorrido ? (
            <AdondeVaLaPlata recorrido={recorrido} bajada={bajadaPlata} />
          ) : (
            <Superficie pad guia="fin-resumen.recorrido">
              <CabeceraBloque
                titulo="A dónde va la plata"
                bajada={
                  estadoMes.falla
                    ? "No se pudo leer el mes. Reintenta en un rato."
                    : r.ver.todas || r.ver.tipo === "tienda"
                      ? "Todavía no hay ventas ni gastos este mes."
                      : "Elige «Todas las sedes» o una tienda para ver esto."
                }
              />
            </Superficie>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <div {...columna(6)}>
            <CambiosDelMesPieza cambios={cambiosDelMes({ r, ...comparacion, enCurso })} />
          </div>
        </div>
      </div>

      {/* La inversión en mercadería, AL FINAL y siempre a la vista (Felipe 2026-10-29): sin nada pendiente dice eso en una línea. No es un gasto:
          sale de la caja cuando se paga. Solo existe si el Plan de campaña la entrega y se deja ver. */}
      {inversionFalla && (
        <Aviso tono="atencion" titulo="Inversión en mercadería">
          {inversionFalla} Lo ya registrado (órdenes, facturas por pagar) sigue contando.
        </Aviso>
      )}
      <div className="space-y-4 pb-4">
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
