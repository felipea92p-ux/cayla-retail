"use client";

import { useSearchParams } from "next/navigation";
import { useState, type CSSProperties } from "react";
import { BookOpen, CalendarCheck, ChartColumn, Percent, Wallet } from "lucide-react";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { Aviso } from "@/components/ui/Aviso";
import { Vacio } from "@/components/ui/Vacio";
import { CabeceraBloque, Superficie } from "@/components/finanzas/kit";
import { AjustesResumen } from "@/components/finanzas/AjustesResumen";
import { CajaProximaPieza } from "@/components/finanzas/CajaProxima";
import { InversionMercaderia } from "@/components/finanzas/InversionMercaderia";
import { useAjustesResumen } from "@/components/finanzas/useAjustesResumen";
import { CambiosDelMesPieza } from "@/components/finanzas/CambiosDelMes";
import { DeCadaCienPieza } from "@/components/finanzas/DeCadaCien";
import { Confianza } from "@/components/finanzas/Confianza";
import { EquilibrioMesPieza } from "@/components/finanzas/EquilibrioMes";
import { ResumenDecidir } from "@/components/finanzas/ResumenDecidir";
import { RecorridoPlata } from "@/components/finanzas/RecorridoPlata";
import { DockTelar } from "@/components/finanzas/telar/DockTelar";
import { Orillo } from "@/components/finanzas/telar/Orillo";
import { TresRespuestas } from "@/components/finanzas/TresRespuestas";
import { alinearAvisoDeCaja, cajaProxima, type FlujoProximo } from "@/lib/caja-proxima-reglas";
import { equilibrioMes } from "@/lib/equilibrio-mes-reglas";
import type { Confianza as ConfianzaDatos } from "@/lib/finanzas-confianza";
import type { Lectura } from "@/lib/resumen-finanzas";
import { mesNombre, type FilaER } from "@/lib/resultados-reglas";
import { hrefTelar, mesDelDia, porSedeDe, SEDE_EMPRESA, type SedeTelar } from "@/lib/finanzas-telar-reglas";
import { deCadaCien } from "@/lib/de-cada-cien-reglas";
import { recorridoPlata } from "@/lib/recorrido-plata-reglas";
import { tresRespuestas } from "@/lib/tres-respuestas-reglas";
import { cambiosDelMes } from "@/lib/resumen-cambios-reglas";
import { avisosParaDecidir, noRevisado, ordenarAvisos, type Acceso, type ResumenFinanzas } from "@/lib/resumen-finanzas-reglas";
import { campanasQueSeVen } from "@/lib/ajustes-resumen-reglas";
import { avisoDeInversion, pagosDeLaCompra, type CampanaInversion } from "@/lib/inversion-mercaderia-reglas";
import {
  mesAnteriorDe,
  respuestaResumen,
  vendidoPorSede,
  type DiaVenta,
} from "@/lib/resumen-telar-reglas";

// Finanzas ▸ Resumen en El telar (Felipe 2026-10-23, ADR-0493): arriba, las tres respuestas (Felipe 2026-10-26: ¿cuánto tienes?, ¿cuánto debes
// pagar pronto?, ¿cuánto te deja este mes?), el
// orillo con lo que vendió cada sede, el recorrido de la plata al lado de «Hoy te toca», la línea de ventas contra la meta y, al
// final, qué tan seguro es el número (ADR-0417). La sede y el mes los pone la barra común; esta pantalla no tiene selector propio.
// No calcula plata: lo arman `recorrido-plata-reglas`, `resumen-telar-reglas` y `resumen-finanzas-reglas` con lo que lee la página.

/** La entrada escalonada de cada pieza; esta llena su celda: dos tarjetas lado a lado miden lo mismo. */
const alto = (i: number) => ({ className: "anim-entra h-full", style: { ["--i" as string]: i } as CSSProperties });
/** Una tarjeta de las columnas: no se parte entre dos y deja 1 rem hasta la de abajo. */
const columna = (i: number) => ({ className: "anim-entra mb-4 break-inside-avoid", style: { ["--i" as string]: i } as CSSProperties });

type Props = {
  resumen: ResumenFinanzas | null;
  falla: string | null;
  confianza: Lectura<ConfianzaDatos | null>;
  /** El mes que se mira («2026-10») y hoy («2026-10-23»). */
  mes: string;
  hoy: string;
  /** El Estado de resultados del mes elegido (al día de hoy si es el mes en curso), de todas las sedes que la cuenta ve. */
  estadoMes: Lectura<FilaER[]>;
  /** El tramo con que se compara (el mes pasado a la misma fecha); `null` si no se pudo leer. */
  estadoAntes: FilaER[] | null;
  /** Lo vendido por día de cada tienda; `null` si la cuenta no ve Rendimiento. */
  ventasPorDia: { series: DiaVenta[][]; incompleta: boolean } | null;
  sedes: SedeTelar[];
  /** La proyección de caja con sus cobros y salidas por día (la de Dinero ▸ Flujo), para «Tu caja en las próximas dos semanas». */
  flujoProximo: FlujoProximo;
  /** La inversión en mercadería que entrega el Plan de campaña; `null` si esta base aún no la trae (entonces no se ofrece nada). */
  inversion: CampanaInversion[] | null;
  acceso: Acceso;
};

const FRASE = "Por dónde pasa la plata del mes: de lo que vende cada tienda a lo que te queda.";

export function ResumenFinanzasPanel({ resumen, falla, confianza, mes, hoy, estadoMes, estadoAntes, ventasPorDia, sedes, flujoProximo, inversion, acceso }: Props) {
  const sp = useSearchParams();
  // «Qué se ve»: lo que esta persona esconde de la inversión en mercadería, y qué forma de pagar mira en cada campaña (mirar no guarda nada).
  const [ajustes, ponerAjustes] = useAjustesResumen();
  const [elegidas, setElegidas] = useState<Record<string, string>>({});
  const [abierta, setAbierta] = useState<string | null>(null);
  const delPlan = inversion ?? [];
  const mesDeHoy = mesDelDia(hoy);
  const enCurso = mes === mesDeHoy;
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

  if (!resumen) {
    return (
      <div className="space-y-6">
        <EncabezadoPagina sede="Finanzas" titulo="Resumen" subtitulo={FRASE} />
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
  const resp = respuestaResumen(r, estadoAntes, provisional, enCurso);
  const filas = estadoMes.falla ? [] : estadoMes.datos;
  const recorrido = filas.length ? recorridoPlata(filas, r.ver) : null;
  const cien = deCadaCien(recorrido);
  const faltan = noRevisado(resumen);
  // La inversión en mercadería es de CAYLA entera: mirando una sola sede no se reparte (como el saldo de los bancos), así que ahí no se dibuja.
  const todasLasCampanas = r.ver.todas ? delPlan : [];
  const campanas = campanasQueSeVen(todasLasCampanas, ajustes);
  // La compra de campaña que falta pedir entra a la caja como un pago aparte (no como un gasto) si la persona la deja y se mira CAYLA entera.
  const proyeccion = flujoProximo.estado === "ok" ? flujoProximo.datos : null;
  const pagosDeCompra = ajustes.enCaja && proyeccion ? pagosDeLaCompra(campanas, proyeccion, ajustes.conIgv, elegidas) : [];
  const caja = cajaProxima({ flujo: flujoProximo, cuentas: r.cuentas.estado === "ok" ? r.cuentas.datos : null, ver: r.ver, inversion: pagosDeCompra.length ? { pagos: pagosDeCompra, dias: 42 } : null });
  // «Hoy te toca» y «Tu caja» cuentan el mismo hecho con el mismo número (el punto más bajo que ve la tarjeta, con la compra si está contada).
  const verReportes = acceso.lider || acceso.modulos.includes("reportes_financieros");
  const avisos = ordenarAvisos([
    ...alinearAvisoDeCaja(avisosParaDecidir(resumen, acceso), caja, verReportes ? "/finanzas/reportes/escenarios" : null),
    ...campanas.flatMap((c) => avisoDeInversion(c, hoy, ajustes.conIgv) ?? []),
  ]);
  const sede = r.ver.todas ? "Todas las sedes" : r.ver.soloEmpresa ? "Empresa" : r.ver.nombre.replace(/^Tienda\s+/i, "");
  const hrefDeSede = acceso.lider
    ? Object.fromEntries(sedes.map((s) => [s.clave, hrefTelar("/finanzas/resumen", sp.entries(), { sede: s.clave }, { mismaPantalla: true, mesDeHoy })]))
    : {};

  return (
    <div className="space-y-6">
      <EncabezadoPagina sede={sede} titulo="Resumen" subtitulo={FRASE} />
      {/* Las tres preguntas que una persona sin formación de finanzas se hace al abrir esta pantalla, con la cifra de cada una. */}
      <TresRespuestas respuestas={tresRespuestas({ r, caja, deja: { ...resp, chips: cien ? [...resp.chips, { texto: cien.chip, tono: "pizarra" as const }] : resp.chips }, hrefDinero: ir("/finanzas/dinero"), hrefPorPagar: ir("/finanzas/dinero/por-pagar") })} />
      {/* ADR-0417: qué tan cierto es el número que acaba de leer, y qué falta para que lo sea. Si no se pudo medir, se dice (nunca un 0 % falso). */}
      {confianza.datos ? (
        <Confianza confianza={confianza.datos} guia="fin-resumen.confianza" />
      ) : (
        <p className="card-cayla px-4 py-3 text-sm text-taupe sm:px-5" data-guia="fin-resumen.confianza">
          {confianza.falla ?? "No se pudo medir qué tan seguro es este número."}
        </p>
      )}
      <Orillo porSede={porSedeDe(vendidoPorSede(filas))} sedes={sedes} que="vendido" hoy={hoy} />
      {dock}

      {/* La caja y «Hoy te toca» van lado a lado y a la misma altura (desde 1280 px, con 20 rem de piso para «Hoy te toca»: antes, a 1024 px
          quedaba tan angosta que partía el texto palabra por palabra). Más angosto, una bajo la otra. Sin huecos (Felipe 2026-10-26). */}
      <section className="grid items-stretch gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(20rem,1fr)]">
        <div {...alto(2)}>
          <CajaProximaPieza caja={caja} hrefFlujo={ir("/finanzas/reportes/flujo")} className="h-full" incluye={ajustes.conIgv ? "inversión en mercadería (con IGV)" : "inversión en mercadería"} />
        </div>

        <div {...alto(3)} data-guia="fin-resumen.decidir">
          <Superficie pad className="h-full">
            <CabeceraBloque
              titulo="Hoy te toca"
              bajada={enCurso ? "Primero lo que más cuesta si se deja pasar." : `Es de hoy, aunque mires ${mesNombre(mes)}. Primero lo que más cuesta si se deja pasar.`}
            />
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

      {/* No es un gasto: sale de la caja cuando se paga. Solo existe si el Plan de campaña la entrega (hoy la base no) y se deja ver. */}
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

      {/* Lo demás, en columnas que se llenan una tras otra: cada tarjeta queda pegada a la de arriba, sin aire. Con ancho para dos
          columnas de 34 rem se reparten (el navegador corta donde las deja más parejas); con menos, van en una sola (Felipe 2026-10-26). */}
      <div className="columns-[34rem] gap-4">
        <div {...columna(4)}>
          <Superficie pad guia="fin-resumen.recorrido">
            <CabeceraBloque
              titulo="Por dónde pasa la plata"
              bajada={recorrido ? `${recorrido.nota}${acceso.lider ? " Toca una sede para seguirla." : ""}` : `${mesNombre(mes).replace(/^./, (c) => c.toUpperCase())} sin movimientos para dibujar.`}
            />
            {recorrido ? (
              <>
                <RecorridoPlata recorrido={recorrido} hrefDeSede={hrefDeSede} colorDeSede={coloresDeSede(sedes)} />
                {cien && <DeCadaCienPieza cien={cien} colorDeSede={coloresDeSede(sedes)} />}
              </>
            ) : (
              <Vacio tamano="chico" icono={<ChartColumn />}>
                {estadoMes.falla
                  ? "No se pudo leer el estado de resultados de este mes. Vuelve a cargar la página en un rato."
                  : r.ver.todas || r.ver.tipo === "tienda"
                    ? "Todavía no hay ventas ni gastos registrados este mes."
                    : "Para ver cómo se sostiene, elige «Todas las sedes» o una tienda: este mes no hay tiendas con qué compararlo."}
              </Vacio>
            )}
          </Superficie>
        </div>

        <div {...columna(5)}>
          <EquilibrioMesPieza eq={equilibrioMes({ r, filas, ventasPorDia, hoy, mes, enCurso })} provisional={provisional} />
        </div>

        <div {...columna(6)}>
          <CambiosDelMesPieza cambios={cambiosDelMes({ r, ahora: filas, antes: estadoAntes, enCurso })} />
        </div>
      </div>
    </div>
  );
}

/** Los colores de sede del telar (`--color-sede-*`) para los hilos del recorrido; «otra» toma el de respaldo. */
function coloresDeSede(sedes: readonly SedeTelar[]): Record<string, string> {
  return Object.fromEntries(
    sedes.filter((s) => s.color !== "otra").map((s) => [s.clave === SEDE_EMPRESA ? "empresa" : s.clave, `var(--color-sede-${s.color})`]),
  );
}
