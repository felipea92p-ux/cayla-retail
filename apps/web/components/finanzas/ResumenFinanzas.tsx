"use client";

import { useSearchParams } from "next/navigation";
import { useState, type CSSProperties } from "react";
import { BookOpen, CalendarCheck, Percent, Wallet } from "lucide-react";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { Aviso } from "@/components/ui/Aviso";
import { CabeceraBloque, Superficie } from "@/components/finanzas/kit";
import { AjustesResumen } from "@/components/finanzas/AjustesResumen";
import { CajaProximaPieza } from "@/components/finanzas/CajaProxima";
import { InversionMercaderia } from "@/components/finanzas/InversionMercaderia";
import { useAjustesResumen } from "@/components/finanzas/useAjustesResumen";
import { CambiosDelMesPieza } from "@/components/finanzas/CambiosDelMes";
import { AdondeVaLaPlata } from "@/components/finanzas/AdondeVaLaPlata";
import { VendidoPorSede } from "@/components/finanzas/VendidoPorSede";
import { EquilibrioMesPieza } from "@/components/finanzas/EquilibrioMes";
import { ResumenDecidir } from "@/components/finanzas/ResumenDecidir";
import { DockTelar } from "@/components/finanzas/telar/DockTelar";
import { TresRespuestas } from "@/components/finanzas/TresRespuestas";
import { alinearAvisoDeCaja, cajaProxima, type FlujoProximo } from "@/lib/caja-proxima-reglas";
import { equilibrioMes } from "@/lib/equilibrio-mes-reglas";
import type { Confianza as ConfianzaDatos } from "@/lib/finanzas-confianza";
import type { Lectura } from "@/lib/resumen-finanzas";
import { mesNombre, type FilaER } from "@/lib/resultados-reglas";
import { hrefTelar, mesDelDia, porSedeDe, type SedeTelar } from "@/lib/finanzas-telar-reglas";
import { soles } from "@/lib/flujo-caja-reglas";
import { recorridoPlata } from "@/lib/recorrido-plata-reglas";
import { desgloseDeTienes, tresRespuestas } from "@/lib/tres-respuestas-reglas";
import { cambiosDelMes } from "@/lib/resumen-cambios-reglas";
import { avisosParaDecidir, noRevisado, ordenarAvisos, type Acceso, type ResumenFinanzas } from "@/lib/resumen-finanzas-reglas";
import { campanasQueSeVen } from "@/lib/ajustes-resumen-reglas";
import { avisoDeInversion, pagosDeLaCompra, type CampanaInversion } from "@/lib/inversion-mercaderia-reglas";
import {
  mesAnteriorDe,
  mesPasadoComparable,
  respuestaResumen,
  vendidoPorSede,
  type DiaVenta,
} from "@/lib/resumen-telar-reglas";

// Finanzas ▸ Resumen en El telar (Felipe 2026-10-23, ADR-0493), pulido el 2026-10-29: arriba, las tres respuestas (¿cuánto tienes —de CAYLA y de CLAURE—?,
// ¿cuánto debes pronto —cada deuda con su fecha—?, ¿cuánto te deja?), «Vendido por sede» con la confianza del número adentro (ADR-0417), la caja
// al lado de «Hoy te toca», «A dónde va la plata» (el anillo), «¿Ya pagaste el mes?» y, al final, la inversión en mercadería (siempre a la vista).
// La sede y el mes los pone la barra común; esta pantalla no tiene selector propio.
// No calcula plata: lo arman `recorrido-plata-reglas`, `resumen-telar-reglas` y `resumen-finanzas-reglas` con lo que lee la página.

/** La entrada escalonada de cada pieza; esta llena su celda: dos tarjetas lado a lado miden lo mismo. */
const alto = (i: number) => ({ className: "anim-entra h-full", style: { ["--i" as string]: i } as CSSProperties });
/** Una tarjeta de las columnas: no se parte entre dos y deja 1 rem hasta la de abajo. */
const columna = (i: number) => ({ className: "anim-entra", style: { ["--i" as string]: i } as CSSProperties });

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
  /** La lectura del Plan de campaña se cayó (ADR-0527): el bloque no se dibuja y se dice, nunca un 0 que parezca un dato. */
  inversionFalla?: string | null;
  acceso: Acceso;
  /** Lo que se le debe a CLAURE (ADR-0560): `null` = no se ve o no hay nada; `saldo: null` = se cayó la lectura. */
  claure?: { saldo: number | null } | null;
};

const FRASE = "De lo que vendes a lo que te queda.";

export function ResumenFinanzasPanel({ resumen, falla, confianza, mes, hoy, estadoMes, estadoAntes, ventasPorDia, sedes, flujoProximo, inversion, inversionFalla = null, acceso, claure = null }: Props) {
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
  const filas = estadoMes.falla ? [] : estadoMes.datos;
  const antes = mesPasadoComparable(filas, estadoAntes);
  const resp = respuestaResumen(r, antes, provisional, enCurso);
  const recorrido = filas.length ? recorridoPlata(filas, r.ver) : null;
  const faltan = noRevisado(resumen);
  // La inversión en mercadería es de CAYLA entera: mirando una sola sede no se reparte (como el saldo de los bancos), así que ahí no se dibuja.
  const todasLasCampanas = r.ver.todas ? delPlan : [];
  const campanas = campanasQueSeVen(todasLasCampanas, ajustes);
  // La compra de campaña que falta pedir entra a la caja como un pago aparte (no como un gasto) si la persona la deja y se mira CAYLA entera.
  const proyeccion = flujoProximo.estado === "ok" ? flujoProximo.datos : null;
  const pagosDeCompra = ajustes.enCaja && proyeccion ? pagosDeLaCompra(campanas, proyeccion, ajustes.conIgv, elegidas) : [];
  const caja = cajaProxima({ flujo: flujoProximo, cuentas: r.cuentas.estado === "ok" ? r.cuentas.datos : null, ver: r.ver, inversion: pagosDeCompra.length ? { pagos: pagosDeCompra, dias: 42 } : null });
  // «¿Cuánto tienes?» de CAYLA entera dice de qué está hecho; una sede no lleva los bancos ni lo que las máquinas deben, así que ahí no se reparte.
  const desglose = caja.tipo === "cayla" ? desgloseDeTienes(r.cuentas.estado === "ok" ? r.cuentas.datos : null, caja.saldoHoy) : null;
  // Lo de CLAURE es de la empresa entera, como los bancos: mirando una sola sede no se reparte.
  const saldoClaure = claure && r.ver.todas && claure.saldo !== null ? { saldo: claure.saldo } : null;
  // Si la lectura de CLAURE se cayó, «¿Cuánto tienes?» lo dice (un chip), no se inventa un reparto ni se calla.
  const claureFalla = !!claure && r.ver.todas && claure.saldo === null;
  // «Hoy te toca» y «Tu caja» cuentan el mismo hecho con el mismo número (el punto más bajo que ve la tarjeta, con la compra si está contada).
  const verReportes = acceso.lider || acceso.modulos.includes("reportes_financieros");
  const avisos = ordenarAvisos([
    ...alinearAvisoDeCaja(avisosParaDecidir(resumen, acceso), caja, verReportes ? "/finanzas/reportes/flujo#y-si" : null),
    ...campanas.flatMap((c) => avisoDeInversion(c, hoy, ajustes.conIgv) ?? []),
  ]);
  const sede = r.ver.todas ? "Todas las sedes" : r.ver.soloEmpresa ? "Empresa" : r.ver.nombre.replace(/^Tienda\s+/i, "");

  // «Vendiste X y salió Y» bajo «¿Cuánto te deja?»: de lo mismo que dibuja «A dónde va la plata» (el recorrido), así que las dos dicen el mismo número.
  const plata = recorrido && recorrido.modo === "vende" ? { vendido: recorrido.nudo.monto, salio: recorrido.salidas.filter((h) => h.tipo !== "deja").reduce((a, h) => a + h.monto, 0) } : null;
  const bajadaPlata = recorrido
    ? recorrido.modo === "vende" && plata
      ? `Vendiste ${soles(plata.vendido)} y salió ${soles(plata.salio)}.`
      : recorrido.nota
    : "";

  return (
    <div className="space-y-6">
      <EncabezadoPagina sede={sede} titulo="Resumen" subtitulo={FRASE} />
      {/* Las tres preguntas que una persona sin formación de finanzas se hace al abrir esta pantalla, con la cifra de cada una. «Tienes» dice cuánto es de CAYLA
          y cuánto de CLAURE, y «Debes pronto» lista cada deuda con su fecha (Felipe 2026-10-29). */}
      <TresRespuestas respuestas={tresRespuestas({ r, caja, deja: resp, hrefDinero: ir("/finanzas/dinero"), hrefPorPagar: ir("/finanzas/dinero/por-pagar"), desglose, claure: saldoClaure, claureFalla, plata })} />
      {/* «Vendido por sede» y la confianza del número, en UNA tarjeta (ADR-0417; Felipe 2026-10-29, opción 3). Si no se pudo medir, se dice (nunca un 0 % falso). */}
      <VendidoPorSede porSede={porSedeDe(vendidoPorSede(filas))} sedes={sedes} hoy={hoy} mes={mesNombre(mes)} confianza={confianza.datos} falla={confianza.falla} />
      {dock}

      {/* La caja y «Hoy te toca» van lado a lado y a la misma altura (desde 1280 px, con 20 rem de piso para «Hoy te toca»: antes, a 1024 px
          quedaba tan angosta que partía el texto palabra por palabra). Más angosto, una bajo la otra. Sin huecos (Felipe 2026-10-26). */}
      <section className="grid items-stretch gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(20rem,1fr)]">
        <div {...alto(2)}>
          <CajaProximaPieza caja={caja} hrefFlujo={ir("/finanzas/reportes/flujo")} className="h-full" incluye={ajustes.conIgv ? "inversión en mercadería (con IGV)" : "inversión en mercadería"} />
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
          <div {...columna(5)}>
            <EquilibrioMesPieza eq={equilibrioMes({ r, filas, ventasPorDia, hoy, mes, enCurso })} provisional={provisional} />
          </div>

          <div {...columna(6)}>
            <CambiosDelMesPieza cambios={cambiosDelMes({ r, ahora: filas, antes, enCurso })} />
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
