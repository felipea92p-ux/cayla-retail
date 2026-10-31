"use client";

import Link from "next/link";
import { useState, type CSSProperties } from "react";
import { Landmark, TrendingUp } from "lucide-react";
import { Aviso } from "@/components/ui/Aviso";
import { CifraAnimada } from "@/components/ui/CifraAnimada";
import { Linea } from "@/components/ui/Linea";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { Vacio } from "@/components/ui/Vacio";
import { BotonVerMas, FilasDeMas } from "@/components/ui/VerMas";
import { Superficie } from "@/components/finanzas/kit";
import { CascadaPulso } from "@/components/finanzas/CascadaPulso";
import { soles, solesConSigno } from "@/lib/flujo-caja-reglas";
import { mesCorto, mesNombre, mesTitulo } from "@/lib/resultados-reglas";
import { cambioDelMes, cuadroFormalPatrimonio, fraseTuyo, puenteTuyo, tieneExtremos } from "@/lib/patrimonio-reglas";
import type { PatrimonioCambios } from "@/lib/estados-financieros-reglas";

// Estados financieros ▸ ¿Lo tuyo creció? (estado de cambios en el patrimonio; ADR-0585, actividad 7). De arriba abajo: la respuesta (creció
// o bajó, y cuánto) con la frase de qué parte de lo ganado retiraste; el puente del mes (al empezar → lo que ganaste, pusiste y retiraste →
// al cerrar); lo tuyo mes a mes; y, plegado, el cuadro formal por columna. Las cifras son de `fn_patrimonio_cambios`, el mismo diario que el
// Balance. Lo tuyo es de CAYLA entera: no se reparte por sede.

const entra = (i: number, clase = "") => ({ className: `anim-entra ${clase}`.trim(), style: { ["--i" as string]: i } as CSSProperties });

export function PatrimonioPanel({ datos, falla, mes, enCurso }: { datos: PatrimonioCambios | null; falla: string | null; mes: string; enCurso: boolean }) {
  const [verFormal, setVerFormal] = useState(false);
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

  const cambio = cambioDelMes(datos);
  const crecio = Math.round(cambio) >= 0;
  const serie = datos.serie.map((s, i) => ({ x: i, y: s.total }));
  const menor = Math.min(0, ...serie.map((p) => p.y));
  const formal = cuadroFormalPatrimonio(datos);

  return (
    <div className="min-w-0 space-y-8">
      <section className="fin-pulso-hero" aria-labelledby="fin-tuyo-pregunta" data-guia="fin-patrimonio.respuesta">
        <p id="fin-tuyo-pregunta" {...entra(1, "fin-pulso-pregunta")}>
          ¿Lo tuyo creció en {mesNombre(mes)}?
        </p>
        <p {...entra(2, "fin-pulso-respuesta")}>
          <span className="fin-pulso-verbo">{crecio ? "Sí, creció" : "No, bajó"}</span>
          <span className="fin-pulso-monto">
            <CifraAnimada valor={Math.round(Math.abs(cambio))} formato="soles" />
          </span>
        </p>
        <p {...entra(3, "fin-pulso-explica")}>{fraseTuyo(datos)}</p>
        <div {...entra(4, "fin-pulso-porque")}>
          <CascadaPulso id="fin-tuyo-puente" tramos={puenteTuyo(datos, enCurso)} etiqueta="De cuánto era lo tuyo a cuánto quedó" guia="fin-patrimonio.puente" />
        </div>
      </section>

      <section className="space-y-3" data-guia="fin-patrimonio.linea">
        <TituloSeccion>Lo tuyo, mes a mes</TituloSeccion>
        {serie.length >= 2 ? (
          <Superficie pad>
            <Linea
              serie={serie}
              desde={0}
              hasta={serie.length - 1}
              minY={menor}
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
          </Superficie>
        ) : (
          <Vacio tamano="chico" icono={<TrendingUp />}>
            Con el cierre de un mes más se dibuja la línea.
          </Vacio>
        )}
      </section>

      <section className="space-y-4">
        <BotonVerMas
          abierto={verFormal}
          onCambiar={setVerFormal}
          texto="Ver el formato formal: estado de cambios en el patrimonio"
          forma="enlace"
          controla="fin-tuyo-formal"
          data-guia="fin-patrimonio.formal-abrir"
        />
        <FilasDeMas abierto={verFormal} id="fin-tuyo-formal">
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
                {formal.map((f) => {
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
        </FilasDeMas>
      </section>
    </div>
  );
}
