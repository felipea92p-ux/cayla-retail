"use client";

import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { Aviso } from "@/components/ui/Aviso";
import { BotonFiltro } from "@/components/ui/BotonFiltro";
import { Chip } from "@/components/ui/Chip";
import { Boton } from "@/components/ui/campos";
import { FormularioCategoria } from "@/components/plan-compra/FormularioCategoria";
import { TOP_VENTAS, avanceDelPaso, colaDelPaso, enteroES, pendientesDelPaso, solesES, type AlcancePaso, type FilaPlan, type TotalesPlan } from "@/lib/plan-compra-reglas";
import type { FamiliaPlan } from "@/lib/plan-compra";

// El paso a paso del plan de campaña (ADR-0349; maqueta docs/maquetas/plan-de-campana-2026-10/): una categoría a la vez, de la que más
// vende a la que menos, con el MISMO formulario de la hoja (`FormularioCategoria`, con su guía de foco). Para quien llena el plan por
// primera vez: no tiene que decidir por dónde empezar ni acordarse de cuáles faltan. Cada una dice «Guardar y seguir con …»; «Saltar por
// ahora» la manda al final de la fila (no se pierde); al terminar dice qué sigue. El orden y lo que falta salen de
// lib/plan-compra-reglas.ts (`colaDelPaso`, `pendientesDelPaso`, con su prueba).

export function PasoAPaso({
  planId,
  filas,
  vendidoPorTalla,
  totales,
  tope,
  familias,
  onTabla,
}: {
  planId: string;
  filas: readonly FilaPlan[];
  /** Categoría → talla → unidades vendidas en 90 días: con eso el formulario propone la curva de tallas. */
  vendidoPorTalla: ReadonlyMap<string, ReadonlyMap<string, number>>;
  totales: TotalesPlan;
  /** El tope de la campaña (null = sin tope). */
  tope: number | null;
  familias: readonly FamiliaPlan[];
  /** «Ver la tabla»: de vuelta a la lista. */
  onTabla: () => void;
}) {
  const [alcance, setAlcance] = useState<AlcancePaso>("top");
  const [hechas, setHechas] = useState<string[]>([]);
  const [saltadas, setSaltadas] = useState<string[]>([]);
  const [elegida, setElegida] = useState<string | null>(null);

  const cola = colaDelPaso(filas, alcance);
  const pendientes = pendientesDelPaso(cola, hechas, saltadas);
  const actual = (elegida ? cola.find((f) => f.c.id === elegida) : null) ?? pendientes[0] ?? null;
  const siguiente = actual ? (pendientes.find((f) => f.c.id !== actual.c.id) ?? null) : null;
  const avance = avanceDelPaso(cola, hechas);
  const cuantasTodas = colaDelPaso(filas, "todas").length;
  const nombreFamilia = actual?.c.familia ? (familias.find((f) => f.codigo === actual.c.familia)?.nombre ?? actual.c.familia) : null;

  const cambiarAlcance = (a: AlcancePaso) => {
    setAlcance(a);
    setSaltadas([]);
    setElegida(null);
  };

  const lado = (
    <aside className="space-y-3 lg:sticky lg:top-4">
      <div className="rounded-2xl border border-sand p-4">
        <p className="label-cayla text-[11px] text-taupe-profundo">Tu avance</p>
        <p className="mt-1 font-display text-2xl tabular-nums text-tinta">
          {avance.hechas} de {avance.total}
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Ir a una categoría">
          {cola.map((f, i) => {
            const hecha = !!f.linea || hechas.includes(f.c.id);
            const aqui = actual?.c.id === f.c.id;
            return (
              <button
                key={f.c.id}
                type="button"
                onClick={() => setElegida(f.c.id)}
                title={f.c.nombre}
                aria-label={`${f.c.nombre}${hecha ? ", con plan" : ""}${aqui ? ", la que estás armando" : ""}`}
                aria-current={aqui ? "step" : undefined}
                className={`inline-flex h-7 min-w-7 items-center justify-center rounded-full px-2 text-[11.5px] font-semibold tabular-nums transition-colors duration-200 ease-cayla motion-reduce:transition-none ${
                  hecha ? "bg-verde text-crema" : "border border-tinta/25 bg-papel text-tinta/80 hover:border-tinta"
                } ${aqui ? "ring-2 ring-tinta ring-offset-2 ring-offset-papel" : ""}`}
              >
                {hecha ? "✓" : i + 1}
              </button>
            );
          })}
        </div>
      </div>
      <div className="rounded-2xl border border-sand p-4">
        <p className="label-cayla text-[11px] text-taupe-profundo">Lo que llevas</p>
        <p className="mt-2 text-sm text-tinta/80">
          Comprar <b className="font-semibold text-tinta">{enteroES.format(totales.aComprar)}</b> prendas
        </p>
        <p className="text-sm text-tinta/80">
          Inversión <b className="font-semibold text-tinta">{solesES(totales.inversion)}</b>
          {tope !== null && <span className="text-tinta/70"> · {Math.round((totales.inversion / tope) * 100)} % del tope</span>}
        </p>
      </div>
      <div className="rounded-2xl border border-sand p-4">
        <p className="label-cayla text-[11px] text-taupe-profundo">Alcance</p>
        <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Qué categorías recorrer">
          <BotonFiltro activo={alcance === "top"} cuenta={colaDelPaso(filas, "top").length} onClick={() => cambiarAlcance("top")}>
            Las que más venden
          </BotonFiltro>
          <BotonFiltro activo={alcance === "todas"} cuenta={cuantasTodas} onClick={() => cambiarAlcance("todas")}>
            Todas con movimiento
          </BotonFiltro>
        </div>
      </div>
    </aside>
  );

  if (!actual) {
    const hayMas = alcance === "top" && pendientesDelPaso(colaDelPaso(filas, "todas"), hechas).length > 0;
    return (
      <div className="grid gap-5 px-5 pb-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(240px,0.8fr)]">
        <div className="rounded-2xl border border-sand p-6">
          {cola.length === 0 ? (
            <Aviso tono="info" titulo="Todavía no hay cuáles venden más">
              No hubo ventas en los últimos 90 días para decir cuáles son las que más venden. Pasa a «Todas con movimiento» o arma la que quieras desde la tabla.
            </Aviso>
          ) : (
            <Aviso tono="exito" titulo={alcance === "top" ? `Ya tienes las ${cola.length === TOP_VENTAS ? TOP_VENTAS : cola.length} que más venden` : "Ya llenaste todas las que se mueven"}>
              {alcance === "top" ? "Son las que más pesan en la campaña." : "Revisa la tabla: ahí ves cuánto comprar de cada una."}
            </Aviso>
          )}
          <div className="mt-4 flex flex-wrap gap-3">
            {(hayMas || (alcance === "top" && cola.length === 0)) && <Boton onClick={() => cambiarAlcance("todas")}>Seguir con las demás</Boton>}
            <Boton peso="primario" onClick={onTabla}>
              Ver la tabla
            </Boton>
          </div>
        </div>
        {lado}
      </div>
    );
  }

  const lugar = cola.findIndex((f) => f.c.id === actual.c.id) + 1;
  return (
    <div className="grid gap-5 px-5 pb-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(240px,0.8fr)]">
      <div className="rounded-2xl border border-sand p-5 sm:p-6">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="label-cayla text-[11px] text-taupe-profundo">
              Categoría {lugar} de {cola.length}
              {actual.puesto !== null && ` · N.º ${actual.puesto} en ventas`}
            </p>
            <h2 className="mt-1 font-display text-3xl leading-tight text-tinta">{actual.c.nombre}</h2>
          </div>
          {nombreFamilia && <Chip tono="neutro">{nombreFamilia}</Chip>}
        </div>
        <div className="anim-revelar" key={actual.c.id}>
          <FormularioCategoria
            planId={planId}
            fila={actual}
            vendidoPorTalla={vendidoPorTalla.get(actual.c.id)}
            tope={tope}
            inversionDeLasDemas={totales.inversion - (actual.calculo?.inversion ?? 0)}
            enPantalla
            irAlMontar={hechas.length > 0 || elegida !== null || saltadas.length > 0}
            onGuardado={() => {
              setHechas((h) => [...h, actual.c.id]);
              setElegida(null);
            }}
            pie={({ guardando, puedeGuardar, motivo, claseConfirmar }) => (
              <div className="flex flex-wrap justify-end gap-3 pt-2">
                <Boton
                  type="button"
                  disabled={siguiente === null}
                  onClick={() => {
                    setSaltadas((s) => [...s, actual.c.id]);
                    setElegida(null);
                  }}
                >
                  Saltar por ahora
                </Boton>
                <Boton type="submit" data-seguir="1" peso="primario" cargando={guardando} disabled={!puedeGuardar} title={motivo} className={claseConfirmar}>
                  {siguiente ? `Guardar y seguir con ${siguiente.c.nombre}` : "Guardar y terminar"}
                  <ArrowRight aria-hidden className="h-4 w-4" />
                </Boton>
              </div>
            )}
          />
        </div>
      </div>
      {lado}
    </div>
  );
}
