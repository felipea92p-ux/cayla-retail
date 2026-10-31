"use client";

import Link from "next/link";
import { ArrowRight, Landmark, TrendingUp } from "lucide-react";
import { Aviso } from "@/components/ui/Aviso";
import { Linea } from "@/components/ui/Linea";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { Vacio } from "@/components/ui/Vacio";
import { Superficie } from "@/components/finanzas/kit";
import { CascadaEstados } from "@/components/finanzas/estados/CascadaEstados";
import { TitularEstado } from "@/components/finanzas/estados/TitularEstado";
import { soles, solesConSigno } from "@/lib/flujo-caja-reglas";
import { mesCorto, mesNombre, mesTitulo } from "@/lib/resultados-reglas";
import { cambioDelMes, cuadroFormalPatrimonio, filasTuyo, fraseTuyo, tieneExtremos } from "@/lib/patrimonio-reglas";
import type { FormaEstado, PatrimonioCambios } from "@/lib/estados-financieros-reglas";

// Estados financieros ▸ ¿Lo tuyo creció? (estado de cambios en el patrimonio; ADR-0585, actividad 7), dibujado como la maqueta aprobada
// (`docs/maquetas/finanzas-eeff-2026-10/`): en una tarjeta, la respuesta (creció o bajó, y qué parte de lo ganado retiraste), lo tuyo al
// empezar y al cerrar el mes, «Qué lo movió» en la cascada y lo tuyo mes a mes. Con «Formato formal» arriba (`?forma=formal`), el cuadro del
// contador por columna. Las cifras son de `fn_patrimonio_cambios`, el mismo diario que el Balance. Lo tuyo es de CAYLA entera.

export function PatrimonioPanel({ datos, falla, mes, enCurso, forma }: { datos: PatrimonioCambios | null; falla: string | null; mes: string; enCurso: boolean; forma: FormaEstado }) {
  if (falla)
    return (
      <Aviso tono="error" titulo="No se pudo leer lo tuyo">
        {falla}
      </Aviso>
    );
  if (!tieneExtremos(datos))
    return (
      <Vacio icono={<Landmark />} titulo="Faltan los saldos de arranque" guia="fin-patrimonio.vacio">
        Lo tuyo se cuenta desde el día en que CAYLA empezó a usar el sistema. El líder los registra en{" "}
        <Link href="/finanzas/reportes/balance" className="btn-enlace">
          ¿Cuánto vale CAYLA?
        </Link>
        .
      </Vacio>
    );

  if (forma === "formal") return <Formal datos={datos} mes={mes} />;

  const cambio = cambioDelMes(datos);
  const crecio = Math.round(cambio) >= 0;
  const serie = datos.serie.map((s, i) => ({ x: i, y: s.total }));
  // La línea empieza cerca del mes más bajo (con sus montos en el eje), como la maqueta: desde cero, un cambio chico se vería plano.
  const valores = serie.map((p) => p.y);
  const bajo = Math.min(...valores);
  const alto = Math.max(...valores);
  const holgura = (alto - bajo || Math.abs(bajo) * 0.1 || 1) * 0.5;
  const nombreMes = mesNombre(mes);

  return (
    <div className="fin-estado min-w-0">
      <TitularEstado
        formal={`Cambios en el patrimonio · ${nombreMes}`}
        si={crecio}
        respuesta={`${crecio ? "Creció" : "Bajó"} ${soles(Math.abs(cambio))}`}
        bajada={fraseTuyo(datos)}
        guia="fin-patrimonio.respuesta"
      />

      <div className="fin-extremos" data-guia="fin-patrimonio.extremos">
        <div className="fin-extremo">
          <span className="label-cayla text-[11px] text-taupe">{`Al empezar ${nombreMes}`}</span>
          <div className="fin-extremo-valor num">{soles(datos.inicio.total)}</div>
        </div>
        <ArrowRight aria-hidden className="h-5 w-5 text-taupe" />
        <div className="fin-extremo" data-fin>
          <span className="label-cayla text-[11px]">{enCurso ? "Hoy" : `Al cerrar ${nombreMes}`}</span>
          <div className="fin-extremo-valor num">{soles(datos.fin.total)}</div>
        </div>
      </div>

      <div className="fin-estado-sep" />
      <section data-guia="fin-patrimonio.puente">
        <TituloSeccion>Qué lo movió</TituloSeccion>
        <div className="mt-3">
          <CascadaEstados id="fin-tuyo-puente" filas={filasTuyo(datos)} etiqueta="Qué movió lo tuyo en el mes" />
        </div>
      </section>

      <div className="fin-estado-sep" />
      <section data-guia="fin-patrimonio.linea">
        <TituloSeccion accion={serie.length >= 2 ? <span className="text-[13px] text-taupe">{solesConSigno(serie.at(-1)!.y - serie[0]!.y)}</span> : undefined}>
          {`Últimos ${serie.length} ${serie.length === 1 ? "mes" : "meses"}`}
        </TituloSeccion>
        <div className="mt-3">
          {serie.length >= 2 ? (
            <Linea
              serie={serie}
              desde={0}
              hasta={serie.length - 1}
              minY={bajo - holgura}
              maxY={alto + holgura}
              alto={170}
              puntos
              marcasX={datos.serie.map((s, i) => ({ x: i, texto: mesCorto(s.mes), fuerte: i === serie.length - 1 }))}
              cifra={soles(datos.fin.total)}
              leer={(x) => {
                const s = datos.serie[Math.max(0, Math.min(datos.serie.length - 1, Math.round(x)))]!;
                return (
                  <>
                    <b>{mesTitulo(s.mes)}</b>
                    <span>
                      {s.mes === datos.mes && enCurso ? "Hoy" : "Al cerrar"}: {soles(s.total)}
                    </span>
                  </>
                );
              }}
              etiqueta={`Lo tuyo al cierre de cada mes, de ${mesNombre(datos.serie[0]!.mes)} a ${mesNombre(datos.serie.at(-1)!.mes)}`}
            />
          ) : (
            <Vacio tamano="chico" icono={<TrendingUp />}>
              Con el cierre de un mes más se dibuja la línea.
            </Vacio>
          )}
        </div>
      </section>
    </div>
  );
}

/** El estado de cambios en el patrimonio como lo lee un contador: capital, aportes y resultados acumulados, cada uno del inicio al cierre. */
function Formal({ datos, mes }: { datos: Parameters<typeof cuadroFormalPatrimonio>[0]; mes: string }) {
  const filas = cuadroFormalPatrimonio(datos);
  return (
    <Superficie pad guia="fin-patrimonio.formal">
      <p className="mb-3 text-[13px] text-taupe">Estado de cambios en el patrimonio de {mesNombre(mes)}.</p>
      <div className="fin-tabla-wrap" data-guia="fin-patrimonio.formal-tabla">
        <table className="fin-tabla fin-tabla-flujo">
          <caption className="sr-only">Estado de cambios en el patrimonio de {mesNombre(mes)}</caption>
          <thead>
            <tr>
              <th>Partida</th>
              <th className="fin-num">Capital</th>
              <th className="fin-num">Aportes</th>
              <th className="fin-num">Resultados acumulados</th>
              <th className="fin-num">Total</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => {
              const cifra = (v: number) => (f.fuerte ? soles(v) : Math.round(v) === 0 ? "—" : solesConSigno(v));
              const celda = (v: number, l: string) => (
                <td className="fin-num" data-l={l}>
                  {f.fuerte ? <b>{cifra(v)}</b> : cifra(v)}
                </td>
              );
              return (
                <tr key={f.clave} className={f.fuerte ? "fin-suave" : undefined}>
                  <td data-l="Partida">{f.fuerte ? <b>{f.nombre}</b> : f.nombre}</td>
                  {celda(f.capital, "Capital")}
                  {celda(f.aportes, "Aportes")}
                  {celda(f.utilidades, "Resultados acumulados")}
                  {celda(f.total, "Total")}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Superficie>
  );
}
