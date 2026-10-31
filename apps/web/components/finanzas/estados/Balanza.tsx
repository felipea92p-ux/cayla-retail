"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import { BarraApilada, MuestraTramo } from "@/components/ui/BarraApilada";
import { BarraAvance } from "@/components/ui/BarraAvance";
import { Chip } from "@/components/ui/Chip";
import { CifraAnimada } from "@/components/ui/CifraAnimada";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { ListaDatos, Superficie } from "@/components/finanzas/kit";
import { solesBalance, tituloCorte, type LineaBalance } from "@/lib/balance-reglas";
import { gruposDelBalance, medidores, MESES_DE_MERCADERIA_ALTOS, type GrupoBalance } from "@/lib/vale-reglas";

// ¿Cuánto vale CAYLA? cuando el Balance cuadra (ADR-0585, actividad 6). La respuesta (lo tuyo) y la balanza: dos barras del MISMO largo
// —lo que tiene, y lo que debe más lo tuyo—, cada una partida en grupos que una tienda reconoce (`BarraApilada`, la pieza de ADR-0358).
// Tocar un tramo, o su nombre en la leyenda, abre sus partes debajo. Después, dos medidores que traducen el Balance a una decisión.

const entra = (i: number, clase = "") => ({ className: `anim-entra ${clase}`.trim(), style: { ["--i" as string]: i } as CSSProperties });
const unDecimal = (n: number) => n.toFixed(1).replace(".", ",");

export function Balanza({
  lineas,
  corte,
  hoy,
  selectorCorte,
  costoDelMes,
}: {
  lineas: LineaBalance[];
  corte: string;
  hoy: string;
  selectorCorte: ReactNode;
  costoDelMes: number | null;
}) {
  const grupos = gruposDelBalance(lineas);
  const [abierto, setAbierto] = useState<string | null>(null);
  const tiene = grupos.filter((g) => g.lado === "tiene");
  const otroLado = grupos.filter((g) => g.lado !== "tiene");
  const total = (gs: readonly GrupoBalance[]) => gs.reduce((a, g) => a + g.monto, 0);
  const totalTiene = total(tiene);
  const deudas = total(grupos.filter((g) => g.lado === "debe"));
  const tuyo = total(grupos.filter((g) => g.lado === "tuyo"));
  const mayor = Math.max(totalTiene, total(otroLado), 1);
  const elegido = grupos.find((g) => g.clave === abierto) ?? null;
  const m = medidores(grupos, costoDelMes);
  const respuesta = { onElegir: (clave: string) => setAbierto((a) => (a === clave ? null : clave)), elegida: abierto, accion: "Ver sus partes" };
  const barra = (gs: GrupoBalance[], etiqueta: string) => (
    <BarraApilada
      segmentos={gs.map((g) => ({ clave: g.clave, nombre: g.nombre, valor: Math.max(g.monto, 0), clase: g.clase }))}
      total={mayor}
      unidad="soles"
      formato={solesBalance}
      etiqueta={etiqueta}
      respuesta={respuesta}
    />
  );
  const leyenda = (gs: GrupoBalance[]) => (
    <ul className="fin-balanza-leyenda">
      {gs.map((g) => (
        <li key={g.clave}>
          <button type="button" onClick={() => respuesta.onElegir(g.clave)} aria-expanded={abierto === g.clave}>
            <MuestraTramo clase={g.clase} />
            <span>{g.nombre}</span>
            <b className="num">{solesBalance(g.monto)}</b>
          </button>
        </li>
      ))}
    </ul>
  );

  return (
    <>
      <section className="fin-pulso-hero" aria-labelledby="fin-vale-pregunta" data-guia="fin-vale.respuesta">
        <p id="fin-vale-pregunta" {...entra(1, "fin-pulso-pregunta")}>
          ¿Cuánto vale CAYLA {tituloCorte(corte, hoy).replace(/^A/, "a")}?
        </p>
        <p {...entra(2, "fin-pulso-respuesta")}>
          <span className="fin-pulso-verbo">Vale</span>
          <span className="fin-pulso-monto">
            <CifraAnimada valor={Math.round(tuyo)} formato="soles" />
          </span>
        </p>
        <p {...entra(3, "fin-pulso-explica")}>
          Es lo que tiene, {solesBalance(totalTiene)}, menos lo que debe, {solesBalance(deudas)}. <Chip tono="verde">cuadra</Chip>
        </p>
        <div {...entra(4)} data-guia="fin-vale.fecha">
          {selectorCorte}
        </div>
      </section>

      <div {...entra(5)} data-guia="fin-vale.balanza">
        <Superficie pad>
          <div className="fin-balanza">
            <div>
              <p className="fin-balanza-lado">
                <span>Lo que tiene</span>
                <b className="num">{solesBalance(totalTiene)}</b>
              </p>
              {barra(tiene, `Lo que tiene: ${solesBalance(totalTiene)}`)}
              {leyenda(tiene)}
            </div>
            <div>
              <p className="fin-balanza-lado">
                <span>Lo que debe + lo tuyo</span>
                <b className="num">{solesBalance(deudas + tuyo)}</b>
              </p>
              {barra(otroLado, `Lo que debe y lo tuyo: ${solesBalance(deudas + tuyo)}`)}
              {leyenda(otroLado)}
            </div>
          </div>
          {elegido && (
            <div className="fin-balanza-detalle" data-guia="fin-vale.partes">
              <p className="label-cayla text-[11px] text-taupe">{elegido.nombre}</p>
              <ListaDatos filas={elegido.lineas.map((l) => ({ dato: l.nombre, valor: solesBalance(l.monto) }))} />
            </div>
          )}
          <p className="mt-3 text-[12.5px] text-taupe">Toca un tramo o su nombre para ver de qué está hecho.</p>
        </Superficie>
      </div>

      <section className="grid gap-3 sm:grid-cols-2" data-guia="fin-vale.medidores">
        <TarjetaCifra etiqueta="Si te cobraran todo hoy" valor={m.cobertura === null ? null : `Cubres el ${Math.round(m.cobertura * 100)} %`} {...entra(6)}>
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
        <TarjetaCifra
          etiqueta="Mercadería guardada"
          valor={m.mesesDeMercaderia === null ? null : `${unDecimal(m.mesesDeMercaderia)} meses de venta`}
          {...entra(7)}
        >
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
    </>
  );
}
