"use client";

import { useSearchParams } from "next/navigation";
import type { CSSProperties } from "react";
import { BookOpen, CalendarCheck, ChartColumn, Percent, Wallet } from "lucide-react";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { Aviso } from "@/components/ui/Aviso";
import { Linea } from "@/components/ui/Linea";
import { Vacio } from "@/components/ui/Vacio";
import { CabeceraBloque, Superficie } from "@/components/finanzas/kit";
import { Confianza } from "@/components/finanzas/Confianza";
import { ResumenDecidir } from "@/components/finanzas/ResumenDecidir";
import { RecorridoPlata } from "@/components/finanzas/RecorridoPlata";
import { DockTelar } from "@/components/finanzas/telar/DockTelar";
import { Orillo } from "@/components/finanzas/telar/Orillo";
import { RespuestaTelar } from "@/components/finanzas/telar/RespuestaTelar";
import type { Confianza as ConfianzaDatos } from "@/lib/finanzas-confianza";
import type { Lectura } from "@/lib/resumen-finanzas";
import { soles } from "@/lib/flujo-caja-reglas";
import { mesNombre, type FilaER } from "@/lib/resultados-reglas";
import { hrefTelar, mesDelDia, porSedeDe, SEDE_EMPRESA, type SedeTelar } from "@/lib/finanzas-telar-reglas";
import { recorridoPlata } from "@/lib/recorrido-plata-reglas";
import { avisosParaDecidir, noRevisado, type Acceso, type ResumenFinanzas } from "@/lib/resumen-finanzas-reglas";
import {
  fraseLineaVentas,
  lineaVentasMeta,
  mesAnteriorDe,
  metaVentasPresupuesto,
  respuestaResumen,
  vendidoPorSede,
  type DiaVenta,
} from "@/lib/resumen-telar-reglas";

// Finanzas ▸ Resumen en El telar (Felipe 2026-10-23, ADR-0493): la cabecera común con la respuesta («¿Cuánto te deja octubre?»), el
// orillo con lo que vendió cada sede, el recorrido de la plata al lado de «Hoy te toca», la línea de ventas contra la meta y, al
// final, qué tan seguro es el número (ADR-0417). La sede y el mes los pone la barra común; esta pantalla no tiene selector propio.
// No calcula plata: lo arman `recorrido-plata-reglas`, `resumen-telar-reglas` y `resumen-finanzas-reglas` con lo que lee la página.

const entra = (i: number) => ({ className: "anim-entra", style: { ["--i" as string]: i } as CSSProperties });

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
  acceso: Acceso;
};

const FRASE = "Por dónde pasa la plata del mes: de lo que vende cada tienda a lo que te queda.";

export function ResumenFinanzasPanel({ resumen, falla, confianza, mes, hoy, estadoMes, estadoAntes, ventasPorDia, sedes, acceso }: Props) {
  const sp = useSearchParams();
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
  const avisos = avisosParaDecidir(resumen, acceso);
  const faltan = noRevisado(resumen);
  const sede = r.ver.todas ? "Todas las sedes" : r.ver.soloEmpresa ? "Empresa" : r.ver.nombre.replace(/^Tienda\s+/i, "");
  const hrefDeSede = acceso.lider
    ? Object.fromEntries(sedes.map((s) => [s.clave, hrefTelar("/finanzas/resumen", sp.entries(), { sede: s.clave }, { mismaPantalla: true, mesDeHoy })]))
    : {};

  return (
    <div className="space-y-6">
      <EncabezadoPagina sede={sede} titulo="Resumen" subtitulo={FRASE}>
        <RespuestaTelar pregunta={resp.pregunta} valor={resp.valor} chips={resp.chips} motivo={resp.motivo} />
      </EncabezadoPagina>
      <Orillo porSede={porSedeDe(vendidoPorSede(filas))} sedes={sedes} que="vendido" hoy={hoy} />
      {dock}

      {/* «Hoy te toca» va al lado del recorrido solo cuando cabe (desde 1280 px y con 20 rem de piso); antes, a 1024 px quedaba tan
          angosta que partía el texto palabra por palabra. Más angosto, baja bajo el recorrido, a todo el ancho. */}
      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(20rem,1fr)]">
        <div {...entra(2)}>
          <Superficie pad guia="fin-resumen.recorrido">
            <CabeceraBloque
              titulo="Por dónde pasa la plata"
              bajada={recorrido ? `${recorrido.nota}${acceso.lider ? " Toca una sede para seguirla." : ""}` : `${mesNombre(mes).replace(/^./, (c) => c.toUpperCase())} sin movimientos para dibujar.`}
            />
            {recorrido ? (
              <RecorridoPlata recorrido={recorrido} hrefDeSede={hrefDeSede} colorDeSede={coloresDeSede(sedes)} />
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

        <div {...entra(3)} data-guia="fin-resumen.decidir">
          <Superficie pad>
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

      <div {...entra(4)}>
        <VentasContraMeta r={r} hoy={hoy} enCurso={enCurso} ventasPorDia={ventasPorDia} />
      </div>

      {/* ADR-0417: qué tan cierto es el número del mes y qué falta para que lo sea. Si no se pudo medir, se dice (nunca un 0 % falso). */}
      <div {...entra(5)}>
        {confianza.datos ? (
          <Confianza confianza={confianza.datos} guia="fin-resumen.confianza" />
        ) : (
          <Superficie pad guia="fin-resumen.confianza">
            <CabeceraBloque titulo="Qué tan seguro es este número" bajada={confianza.falla ?? "No se pudo medir."} />
          </Superficie>
        )}
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

/** Ventas del mes contra la meta (con IGV, como Caja): lo vendido acumulado en tinta y la meta en taupe punteado. */
function VentasContraMeta({ r, hoy, enCurso, ventasPorDia }: { r: ResumenFinanzas; hoy: string; enCurso: boolean; ventasPorDia: Props["ventasPorDia"] }) {
  const titulo = `Ventas de ${mesNombre(r.mes)} contra la meta`;
  const vende = r.ver.todas || r.ver.tipo === "tienda";
  if (!vende)
    return (
      <Superficie pad guia="fin-resumen.ventas">
        <CabeceraBloque titulo={titulo} bajada={r.ver.tipo === "taller" ? "El Taller no vende: no hay línea de ventas." : "La empresa no vende: no hay línea de ventas."} />
      </Superficie>
    );
  if (!ventasPorDia)
    return (
      <Superficie pad guia="fin-resumen.ventas">
        <CabeceraBloque titulo={titulo} bajada="La venta día por día sale de Rendimiento, y tu cuenta no lo ve. Pídeselo a tu líder si lo necesitas." />
      </Superficie>
    );
  // La meta del presupuesto es la del mes en curso: para un mes pasado solo vale la de cada sede.
  const l = lineaVentasMeta(ventasPorDia.series, r.mes, hoy, enCurso ? metaVentasPresupuesto(r) : null);
  const dia = Number(hoy.slice(8, 10));
  const frase = `${fraseLineaVentas(l, r.mes, enCurso)}${ventasPorDia.incompleta ? " Falta una tienda que no respondió: la suma está incompleta." : ""}`;
  return (
    <Superficie pad guia="fin-resumen.ventas">
      <CabeceraBloque titulo={titulo} bajada={`${frase} Con IGV, como en Caja.`} />
      <Linea
        etiqueta={`${titulo}. ${frase}`}
        serie={l.serie}
        referencia={l.referencia}
        desde={0}
        hasta={l.diasMes}
        marcasX={[1, 8, 15, 22, l.diasMes].map((x) => ({ x, texto: String(x), fuerte: enCurso && x === dia }))}
        ahora={enCurso ? { x: dia, texto: "hoy" } : null}
        cifra={l.serie.length ? soles(l.vendido) : null}
        cifraReferencia={l.meta !== null ? { valor: soles(l.meta), texto: "meta" } : null}
        leer={(x) => {
          const v = l.serie.find((p) => p.x === Math.round(x));
          const m = l.referencia ? (l.origenMeta === "sedes" ? l.referencia[Math.round(x)]?.y : ((l.meta ?? 0) * Math.round(x)) / l.diasMes) : null;
          return (
            <>
              <b>
                {Math.round(x)} de {mesNombre(r.mes)}
              </b>
              {v && <span>Vendido: {soles(v.y)}</span>}
              {m != null && <span>La meta pedía: {soles(m)}</span>}
            </>
          );
        }}
        vacio={`Todavía no hay ventas en ${mesNombre(r.mes)}.`}
        alto={220}
      />
    </Superficie>
  );
}
