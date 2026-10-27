"use client";

import Link from "next/link";
import { Boton } from "@/components/ui/campos";
import { fraseDelDescuentoDelPlan, fraseDelRecuperoDelPlan, solesEnterosES } from "@/lib/plan-compra-presupuesto";
import { enteroES, type FilaPlan } from "@/lib/plan-compra-reglas";
import type { LecturaPedido } from "@/lib/plan-compra-pedido";
import type { LecturaPropuesta } from "@/lib/plan-compra-propuesta";
import type { PlazoFijado } from "@/lib/plan-compra-plazo";
import { fraseDeLosMinimos } from "@/lib/plan-compra-reparto";

// «Supuestos» (Presupuesto, spike ④): lo que vale para TODA la campaña y que el plan da por cierto —a cuánto se vende lo que sobra, el descuento, lo que
// ya está pedido, los días que tarda en llegar y cómo se reparte entre tiendas—. Antes vivían en el cajón «Resumen» del Plan; aquí están junto a lo que
// cuestan, que es donde se decide. Cada uno se cambia desde su hoja (las mismas de siempre: este componente solo las abre) o desde la de cada categoría.

function Fila({ nombre, children, accion, pista }: { nombre: string; children: React.ReactNode; accion?: React.ReactNode; /** Una línea más abajo: de dónde sale el número. */ pista?: string }) {
  return (
    <div>
      <span>{nombre}</span>
      <span className="pp-valor">
        {children}
        {accion}
      </span>
      {pista && <span className="pp-pista">{pista}</span>}
    </div>
  );
}

export function SupuestosDelPlan({
  filas,
  hechos,
  pedido,
  plazoFijado,
  diasParaLlegar,
  onRecupero,
  onReparto,
  onPlazo,
}: {
  filas: readonly FilaPlan[];
  /** Los hechos de la propuesta SOLO de esta campaña; null si la base no los manda. */
  hechos: LecturaPropuesta | null;
  pedido: LecturaPedido | null;
  plazoFijado: PlazoFijado | null;
  /** Los días con que se cuenta (el fijado o el supuesto de fábrica). */
  diasParaLlegar: number;
  onRecupero: () => void;
  onReparto: () => void;
  onPlazo: () => void;
}) {
  const descuento = fraseDelDescuentoDelPlan(filas);
  const recupero = hechos ? fraseDelRecuperoDelPlan(hechos.recupero) : null;
  const minimos = hechos ? fraseDeLosMinimos(hechos.tiendasActivas, hechos.minimos) : null;
  return (
    <div className="card-cayla p-4 sm:px-5" data-guia="presupuesto.supuestos">
      <div className="pp-sup">
        {hechos && (
          <Fila
            nombre="Lo que sobra se vende al"
            pista="Con ese % arranca cada categoría nueva; cada una puede cambiarlo."
            accion={
              <Boton peso="discreto" onClick={onRecupero}>
                {hechos.recupero.pct === null || hechos.recupero.heredado ? "Fijar el % de CAYLA" : "Cambiar el %"}
              </Boton>
            }
          >
            {recupero ?? "Sin fijar: cada categoría lo escribe"}
          </Fila>
        )}
        {descuento !== null && <Fila nombre="Descuento de la campaña">{descuento}</Fila>}
        {pedido && (
          <Fila
            nombre="Ya pedido en órdenes"
            accion={
              pedido.ordenes.length > 0 ? (
                <Link href="/compras/ordenes" className="btn-cayla btn-enlace">
                  Ver las órdenes
                </Link>
              ) : undefined
            }
          >
            {solesEnterosES(pedido.total)} · {enteroES.format(pedido.ordenes.length)} {pedido.ordenes.length === 1 ? "orden" : "órdenes"}
            {pedido.porLlegar !== null && pedido.porLlegar > 0 ? ` · ${enteroES.format(pedido.porLlegar)} prendas por llegar` : ""}
          </Fila>
        )}
        <Fila
          nombre="Días para llegar"
          accion={
            plazoFijado ? (
              <Boton peso="discreto" onClick={onPlazo}>
                Cambiar
              </Boton>
            ) : undefined
          }
        >
          {diasParaLlegar}
          {plazoFijado?.dias == null ? " (un supuesto)" : ""}
        </Fila>
        {hechos && hechos.tiendasActivas.length > 1 && (
          <Fila
            nombre="Reparto entre tiendas"
            accion={
              <Boton peso="discreto" onClick={onReparto}>
                {hechos.minimos.size > 0 ? "Cambiar los mínimos" : "Fijar un mínimo"}
              </Boton>
            }
          >
            Por lo que vende cada una{minimos ? `; con mínimo: ${minimos}` : ""}
          </Fila>
        )}
      </div>
      <p className="mt-3 text-[12.5px] text-tinta-60">Son los supuestos de TODA la campaña: se cambian aquí o desde la hoja de cada categoría.</p>
    </div>
  );
}
