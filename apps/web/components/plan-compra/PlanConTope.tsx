"use client";

import { useId, useMemo, useState } from "react";
import Link from "next/link";
import { Aviso } from "@/components/ui/Aviso";
import { Boton } from "@/components/ui/campos";
import { Vacio } from "@/components/ui/Vacio";
import { PackageOpen } from "lucide-react";
import { solesEnterosES } from "@/lib/plan-compra-presupuesto";
import { enteroES, solesES } from "@/lib/plan-compra-reglas";
import { compararPlanes, planConGanancia, porcentajeDe, precioDeLaPlataPara, rangoDelTope, topeEnElRango, type LineaDeTope } from "@/lib/plan-compra-tope";

// «Plan con tu tope» (Presupuesto, spike ④): mueves el tope y el sistema te dice qué plan cabe —cuánto compraría de cada categoría— y cuánto dejas de
// ganar por recortar (o qué ganarías por gastar más). Solo simula hasta que lo usas: lo guardado no cambia. La cuenta es de `lib/plan-compra-tope.ts`
// (el precio de la plata, igual para todas las categorías); aquí solo se dice con palabras de tienda y se dibuja como la maqueta.

const signo = (n: number) => (n > 0 ? "+" : "−");

/** El cambio entre paréntesis junto a una cifra: «(+120)» o «(−S/ 1,200)»; nada si no cambió. */
function Cambio({ n, texto, bueno }: { n: number; texto: string; /** Subir es bueno (más ganancia) o malo (más costo). */ bueno: "sube" | "baja" }) {
  if (n === 0) return null;
  const bien = bueno === "sube" ? n > 0 : n < 0;
  return (
    <small className={bien ? "pp-pos" : "pp-neg"}>
      {" "}
      ({signo(n)}
      {texto})
    </small>
  );
}

export function PlanConTope({
  lineas,
  precioGuardado,
  topeGuardado,
  onUsar,
  hrefPlan,
}: {
  lineas: readonly LineaDeTope[];
  /** El precio de la plata del plan de hoy (el guardado; 0 = el plan de siempre). */
  precioGuardado: number;
  /** El tope guardado de la campaña; null = sin tope. */
  topeGuardado: number | null;
  /** Usa este plan: guarda el tope y el precio de la plata. Sin esto (la base todavía no lo guarda) el panel solo simula. */
  onUsar?: (x: { tope: number; precioDeLaPlata: number; prendas: number; inversion: number }) => void;
  /** A dónde lleva «arma el plan» cuando todavía no hay nada que comprar. */
  hrefPlan: string;
}) {
  const id = useId();
  const rango = useMemo(() => rangoDelTope(lineas, topeGuardado), [lineas, topeGuardado]);
  const hoy = useMemo(() => planConGanancia(lineas, precioGuardado), [lineas, precioGuardado]);
  // El deslizador arranca en el tope guardado (o, sin tope, en lo que cuesta el plan de hoy): mover el tope no guarda nada.
  const [tope, setTope] = useState(() => (rango ? topeEnElRango(topeGuardado ?? hoy.inversion, rango) : 0));
  const ajuste = useMemo(() => precioDeLaPlataPara(lineas, tope), [lineas, tope]);
  const propuesto = useMemo(() => planConGanancia(lineas, ajuste.precioDeLaPlata), [lineas, ajuste.precioDeLaPlata]);
  const cambios = useMemo(() => compararPlanes(hoy, propuesto), [hoy, propuesto]);

  if (!rango) {
    return (
      <div className="card-cayla" data-guia="presupuesto.tope">
        <Vacio
          tamano="chico"
          icono={<PackageOpen />}
          accion={{ texto: "Armar el plan", href: hrefPlan }}
        >
          Todavía no hay nada que comprar: arma el plan de las categorías para ver si cabe en tu tope.
        </Vacio>
      </div>
    );
  }

  const sobra = tope - hoy.inversion;
  const difInversion = propuesto.inversion - hoy.inversion;
  const difPrendas = propuesto.prendas - hoy.prendas;
  const difGanancia = propuesto.ganancia - hoy.ganancia;
  const igual = Math.abs(difInversion) < 1;
  const titulo = sobra < 0 ? `Tu plan cuesta ${solesEnterosES(hoy.inversion)} y tu tope es ${solesEnterosES(tope)}: te pasas ${solesEnterosES(-sobra)}.` : `Tu plan cuesta ${solesEnterosES(hoy.inversion)} y tu tope es ${solesEnterosES(tope)}: te sobran ${solesEnterosES(sobra)}.`;
  const detalle = igual
    ? "Ya cabe: no hay nada que ajustar."
    : !ajuste.cabe
      ? `Ni comprando solo lo flojo de cada categoría cabe en ese tope: lo más flaco cuesta ${solesEnterosES(propuesto.inversion)}. Sube el tope o quita categorías del plan.`
      : ajuste.techo && sobra > 0
        ? `Con ese tope ya cubres el escenario bueno en todas las categorías: el plan máximo cuesta ${solesEnterosES(propuesto.inversion)}. Lo demás sería comprar de más.`
        : sobra < 0
          ? "El sistema baja cuánta seguridad quiere tener de cada categoría, empezando por donde cada sol rinde menos."
          : "El sistema subiría la cobertura donde cada sol rinde más.";
  const recorte = difInversion < 0 ? porcentajeDe(-difInversion, hoy.inversion) : null;
  const pierde = difInversion < 0 && hoy.ganancia > 0 ? porcentajeDe(hoy.ganancia - propuesto.ganancia, hoy.ganancia) : null;
  const porSolAhorrado = difInversion < 0 && -difInversion > 0 ? (hoy.ganancia - propuesto.ganancia) / -difInversion : null;
  const maxCambio = Math.max(1, ...cambios.map((c) => Math.abs(c.dif)));

  return (
    <div className="card-cayla pp-tope" data-guia="presupuesto.tope">
      <div className="pp-tope-cab">
        <div className="pp-tope-valor">
          <small>Tu tope</small>
          <b>{solesEnterosES(tope)}</b>
        </div>
        <div className="pp-rango">
          <label className="sr-only" htmlFor={id}>
            Tope de inversión
          </label>
          <input id={id} type="range" min={rango.min} max={rango.max} step={rango.paso} value={tope} aria-valuetext={solesEnterosES(tope)} onChange={(e) => setTope(Number(e.target.value))} />
          <div className="pp-rango-extremos" aria-hidden>
            <span>{solesEnterosES(rango.min)}</span>
            <span>{solesEnterosES(rango.max)}</span>
          </div>
        </div>
      </div>

      <Aviso tono={sobra < 0 ? "atencion" : "exito"} titulo={titulo}>
        {detalle}
      </Aviso>

      {!igual && (
        <>
          <div className="pp-res3" data-guia="presupuesto.resultado">
            <div>
              <div className="pp-t">Compras</div>
              <div className="pp-v">
                {enteroES.format(propuesto.prendas)}
                <Cambio n={difPrendas} texto={enteroES.format(Math.abs(difPrendas))} bueno="sube" />
              </div>
            </div>
            <div>
              <div className="pp-t">Cuesta</div>
              <div className="pp-v">
                {solesEnterosES(propuesto.inversion)}
                <Cambio n={difInversion} texto={solesEnterosES(Math.abs(difInversion))} bueno="baja" />
              </div>
            </div>
            <div>
              <div className="pp-t">Esperas ganar</div>
              <div className="pp-v">
                {solesEnterosES(propuesto.ganancia)}
                <Cambio n={Math.round(difGanancia)} texto={solesEnterosES(Math.abs(difGanancia))} bueno="sube" />
              </div>
            </div>
          </div>

          <p className="text-[13px] text-tinta-60">
            {difInversion < 0
              ? `Recortas ${recorte ?? 0} % de lo que gastas${pierde !== null ? ` y dejas de ganar ${pierde} % de lo que esperabas` : ""}${
                  porSolAhorrado !== null && porSolAhorrado > 0 ? `: por cada sol que ahorras, dejas de ganar ${solesES(porSolAhorrado)}` : ""
                }.`
              : difGanancia > 0
                ? `Gastas ${porcentajeDe(difInversion, hoy.inversion) ?? 0} % más y esperas ganar ${hoy.ganancia > 0 ? (porcentajeDe(difGanancia, hoy.ganancia) ?? 0) : 0} % más.`
                : `Gastas ${porcentajeDe(difInversion, hoy.inversion) ?? 0} % más y no esperas ganar más: lo que pide el plan ya es lo que conviene.`}
          </p>

          <div className="pp-versus" data-guia="presupuesto.comparacion">
            <div className="pp-vrow pp-h" aria-hidden>
              <span>Categoría</span>
              <span className="pp-n">Hoy</span>
              <span className="pp-n">Con tope</span>
              <span className="pp-delta">Cambio</span>
            </div>
            {cambios.map((c) => (
              <div key={c.clave} className="pp-vrow" role="group" aria-label={`${c.nombre}: hoy ${c.hoy}, con tope ${c.conTope}`}>
                <span>
                  <b>{c.nombre}</b>
                </span>
                <span className="pp-n">{enteroES.format(c.hoy)}</span>
                <span className="pp-n">
                  <b>{enteroES.format(c.conTope)}</b>
                </span>
                <span className={`pp-delta ${c.dif < 0 ? "pp-neg" : "pp-pos"}`}>
                  {c.dif === 0 ? "igual" : `${signo(c.dif)}${enteroES.format(Math.abs(c.dif))} · ${signo(c.difInversion)}${solesEnterosES(Math.abs(c.difInversion))}`}
                  <span className="pp-b" aria-hidden>
                    <i className={c.dif > 0 ? "pp-sube" : undefined} style={{ width: `${(Math.abs(c.dif) / maxCambio) * 100}%` }} />
                  </span>
                </span>
              </div>
            ))}
          </div>

          <div className="pie-acciones" data-guia={onUsar ? "presupuesto.usar" : undefined}>
            <Boton peso="fantasma" onClick={() => setTope(topeEnElRango(topeGuardado ?? hoy.inversion, rango))}>
              Dejarlo como está
            </Boton>
            {onUsar && ajuste.cabe && (
              <Boton peso="primario" aria-haspopup="dialog" onClick={() => onUsar({ tope, precioDeLaPlata: ajuste.precioDeLaPlata, prendas: propuesto.prendas, inversion: propuesto.inversion })}>
                Usar el plan con tope
              </Boton>
            )}
          </div>
          {onUsar && (
            <p className="text-xs text-tinta-60">
              «Usar» guarda una versión nueva (la actual queda guardada para volver). Nada se compra: solo cambia el plan.{" "}
              <Link href={hrefPlan} className="btn-cayla btn-enlace">
                Ver el plan
              </Link>
            </p>
          )}
        </>
      )}
    </div>
  );
}
