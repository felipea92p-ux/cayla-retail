"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import { Check } from "lucide-react";
import { BarraAvance } from "@/components/ui/BarraAvance";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { ListaDatos } from "@/components/finanzas/kit";
import { TitularEstado } from "@/components/finanzas/estados/TitularEstado";
import { solesBalance, tituloCorte, type LineaBalance } from "@/lib/balance-reglas";
import { gruposDelBalance, medidores, MESES_DE_MERCADERIA_ALTOS, type GrupoBalance } from "@/lib/vale-reglas";

// ¿Cuánto vale CAYLA? cuando el Balance cuadra (ADR-0585, actividad 6), dibujado como la maqueta aprobada
// (`docs/maquetas/finanzas-eeff-2026-10/`): en una tarjeta, la respuesta («CAYLA vale S/ X») y la balanza: dos platillos del MISMO alto
// —lo que tiene, y lo que debe más lo tuyo—, cada uno con sus grupos apilados, de alto proporcional a su monto (`lib/vale-reglas.ts`).
// Tocar un bloque abre sus partes debajo. Después, dos medidores que traducen el Balance a una decisión.

const unDecimal = (n: number) => n.toFixed(1).replace(".", ",");

export function Balanza({
  lineas,
  corte,
  hoy,
  selectorCorte,
  costoDelMes,
  pie,
}: {
  lineas: LineaBalance[];
  corte: string;
  hoy: string;
  selectorCorte: ReactNode;
  costoDelMes: number | null;
  /** Lo que va al final de la tarjeta (lo de cada tienda). */
  pie?: ReactNode;
}) {
  const grupos = gruposDelBalance(lineas);
  const [abierto, setAbierto] = useState<string | null>(null);
  const tiene = grupos.filter((g) => g.lado === "tiene");
  const otroLado = grupos.filter((g) => g.lado !== "tiene");
  const total = (gs: readonly GrupoBalance[]) => gs.reduce((a, g) => a + g.monto, 0);
  const totalTiene = total(tiene);
  const deudas = total(grupos.filter((g) => g.lado === "debe"));
  const tuyo = total(grupos.filter((g) => g.lado === "tuyo"));
  const elegido = grupos.find((g) => g.clave === abierto) ?? null;
  const m = medidores(grupos, costoDelMes);

  const pila = (gs: GrupoBalance[], desde: number) => (
    <div className="fin-pila">
      {gs.map((g, i) => (
        <button
          key={g.clave}
          type="button"
          className="fin-bloque"
          data-lado={g.lado}
          aria-expanded={abierto === g.clave}
          onClick={() => setAbierto((a) => (a === g.clave ? null : g.clave))}
          // El alto de cada bloque es su parte del platillo: un `flex` con su monto (la maqueta aprobada, no una barra apilada).
          style={{ flex: `${Math.max(g.monto, 0)} 1 0`, ["--i" as string]: desde + i } as CSSProperties}
        >
          <span>{g.nombre}</span>
          <b className="num">{solesBalance(g.monto)}</b>
        </button>
      ))}
    </div>
  );

  return (
    <div className="fin-estado min-w-0">
      <TitularEstado
        formal={`Balance general · ${tituloCorte(corte, hoy).replace(/^A/, "a")}`}
        respuesta={`CAYLA vale ${solesBalance(tuyo)}`}
        bajada={`Es lo que tiene, ${solesBalance(totalTiene)}, menos lo que debe, ${solesBalance(deudas)}.`}
        derecha={<div data-guia="fin-vale.fecha">{selectorCorte}</div>}
        guia="fin-vale.respuesta"
      />

      <div className="fin-estado-sep" />
      <div data-guia="fin-vale.balanza">
        <div className="fin-balanza2">
          <div>
            <p className="fin-platillo-cab">
              <span className="label-cayla text-[11px] text-taupe">Lo que tiene</span>
              <b>{solesBalance(totalTiene)}</b>
            </p>
            {pila(tiene, 0)}
          </div>
          <div>
            <p className="fin-platillo-cab">
              <span className="label-cayla text-[11px] text-taupe">Lo que debe + lo tuyo</span>
              <b>{solesBalance(deudas + tuyo)}</b>
            </p>
            {pila(otroLado, tiene.length)}
          </div>
        </div>
        {elegido && (
          <div className="fin-casc-detalle mt-3.5" data-guia="fin-vale.partes">
            <b>{elegido.nombre}</b>
            <ListaDatos filas={elegido.lineas.map((l) => ({ dato: l.nombre, valor: solesBalance(l.monto) }))} />
          </div>
        )}
        <p className="fin-cuadra">
          <Check aria-hidden className="h-4 w-4" />
          Cuadra con las ventas, las compras y los bancos del sistema. Toca un bloque para ver de qué está hecho.
        </p>
      </div>

      <section className="mt-5 grid gap-3 sm:grid-cols-2" data-guia="fin-vale.medidores">
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

      {pie && (
        <>
          <div className="fin-estado-sep" />
          {pie}
        </>
      )}
    </div>
  );
}
