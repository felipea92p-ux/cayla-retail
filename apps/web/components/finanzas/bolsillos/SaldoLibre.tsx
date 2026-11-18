"use client";

import type { CSSProperties } from "react";
import { ChevronRight, CircleHelp, Landmark, Receipt, ShoppingBag, Store, UserCheck, Users, Wallet, Zap, type LucideIcon } from "lucide-react";
import { BarraApilada } from "@/components/ui/BarraApilada";
import { Chip } from "@/components/ui/Chip";
import { CifraAnimada } from "@/components/ui/CifraAnimada";
import { COLOR_LIBRE, type ClaveBolsillo, type SaldoBolsillos } from "@/lib/bolsillos-reglas";
import type { ClaveHoja } from "@/lib/hojas-resumen-reglas";
import { fechaEnPalabras } from "@/lib/caja-proxima-reglas";
import { soles } from "@/lib/flujo-caja-reglas";

// Finanzas ▸ Resumen, camino «A · Bolsillos» (Felipe 2026-11-09): arriba a la izquierda, lo que se puede usar sin dejar de pagar nada, y la plata
// partida en bolsillos con dueño, como las cajitas de la app del banco. Solo DIBUJA lo que arma `saldoEnBolsillos` (la regla, con su prueba). Cada
// bolsillo y «¿Cómo se calcula?» abren su hoja de detalle (`HojasResumen`), que termina en la pantalla donde se resuelve. Mirando una sede, su efectivo.

type Props = {
  saldo: SaldoBolsillos;
  /** Abre la hoja de detalle de un bolsillo (o la de «Libre», con `"plata"`). */
  onAbrir: (hoja: ClaveHoja) => void;
  /** Para la nota bajo la cifra: «Es de hoy, aunque mires octubre». `null` si se mira hoy. */
  otroMes: string | null;
};

/** El ícono de cada bolsillo, sobre un cuadrito teñido de su color (como en la maqueta). */
const ICONO: Record<ClaveBolsillo, LucideIcon> = { equipo: Users, sunat: Landmark, proveedores: Receipt, fijos: Zap, otros: Wallet, compras: ShoppingBag, claure: Store, planilla: UserCheck };

const entra = (i: number) => ({ className: "anim-entra", style: { ["--i" as string]: i } as CSSProperties });

/** Qué hoja abre cada bolsillo: SUNAT la suya; lo que ya tiene otro dueño, la cuenta de «Libre»; los demás pagos, «Lo que viene». */
const HOJA_DE: Record<ClaveBolsillo, ClaveHoja> = { equipo: "pagos", sunat: "sunat", proveedores: "pagos", fijos: "pagos", otros: "pagos", compras: "plata", claure: "plata", planilla: "plata" };

export function SaldoLibre({ saldo, onAbrir, otroMes }: Props) {
  if (saldo.tipo === "sin_dato") {
    return (
      <section className="fin-superficie fin-pad bolsillos" data-guia="fin-resumen.libre">
        <p className="bolsillos-etiqueta">Libre para usar</p>
        <p className="bolsillos-motivo">{saldo.motivo}</p>
      </section>
    );
  }

  if (saldo.tipo === "sede") {
    return (
      <section className="fin-superficie fin-pad bolsillos" data-guia="fin-resumen.libre">
        <p className="bolsillos-etiqueta">En {saldo.nombre}</p>
        {saldo.efectivo !== null && saldo.vende ? (
          <p className="bolsillos-cifra cifra-a">
            <CifraAnimada valor={Math.round(saldo.efectivo)} formato="soles-redondo" />
          </p>
        ) : null}
        <p className="bolsillos-dicho">{saldo.dicho}</p>
        {otroMes && <p className="bolsillos-hoy">Es de hoy, aunque mires {otroMes}.</p>}
      </section>
    );
  }

  const tramos = [
    ...(saldo.libre > 0 ? [{ clave: "libre", nombre: "Libre para usar", valor: saldo.libre, color: COLOR_LIBRE }] : []),
    ...saldo.bolsillos.map((b) => ({ clave: b.clave, nombre: b.nombre, valor: b.monto, color: b.color })),
  ];

  return (
    <section className="fin-superficie fin-pad bolsillos" data-guia="fin-resumen.libre">
      <div className="bolsillos-cab">
        <p className="bolsillos-etiqueta">Libre para usar</p>
        <button type="button" className="btn-cayla btn-enlace bolsillos-como" onClick={() => onAbrir("plata")} data-guia="fin-resumen.como-se-calcula">
          <CircleHelp aria-hidden className="h-3.5 w-3.5" />
          ¿Cómo se calcula?
        </button>
      </div>
      <p className={`bolsillos-cifra cifra-a ${saldo.libre < 0 ? "es-falta" : ""}`}>
        <CifraAnimada valor={Math.round(saldo.libre)} formato="soles-redondo" />
      </p>
      <p className="bolsillos-dicho">{saldo.dicho}</p>
      {(saldo.provisional || saldo.sinPlanilla || otroMes) && (
        <div className="bolsillos-chips">
          {saldo.provisional && (
            <Chip tono="ambar" versalitas={false} title="A la proyección le falta algo (el saldo de arranque, las facturas de proveedor…): Reportes ▸ Flujo dice qué.">
              Provisional
            </Chip>
          )}
          {saldo.sinPlanilla && (
            <Chip tono="pizarra" versalitas={false} title="Tu rol no ve la planilla en Dynamic: los sueldos no se restan de lo libre.">
              Sin la planilla
            </Chip>
          )}
          {otroMes && (
            <Chip tono="pizarra" versalitas={false}>
              Es de hoy, aunque mires {otroMes}
            </Chip>
          )}
        </div>
      )}

      {tramos.length > 0 && (
        <div className="bolsillos-barra">
          <BarraApilada
            alto={12}
            decorativa
            unidad="soles"
            formato={soles}
            etiqueta={`Lo que tienes, repartido: ${tramos.map((t) => `${t.nombre.toLowerCase()}: ${soles(t.valor)}`).join("; ")}`}
            segmentos={tramos.map((t) => ({ clave: t.clave, nombre: t.nombre, valor: t.valor, color: t.color }))}
          />
          {saldo.bolsillos.length > 0 && (
            <p className="bolsillos-ley">
              {saldo.libre > 0 && (
                <span>
                  <i aria-hidden style={{ ["--c" as string]: COLOR_LIBRE } as CSSProperties} />
                  Libre
                </span>
              )}
              <span>Lo demás, en sus bolsillos, hasta el {fechaEnPalabras(saldo.hasta)}:</span>
            </p>
          )}
        </div>
      )}

      {saldo.bolsillos.length > 0 && (
        <ul className="bolsillos-lista">
          {saldo.bolsillos.map((b, i) => {
            const Icono = ICONO[b.clave];
            return (
              <li key={b.clave} {...entra(i + 2)}>
                <button type="button" className="bolsillos-fila es-enlace" style={{ ["--c" as string]: b.color } as CSSProperties} onClick={() => onAbrir(HOJA_DE[b.clave])}>
                  <span aria-hidden className="bolsillos-icono">
                    <Icono className="h-4 w-4" />
                  </span>
                  <span className="bolsillos-texto bolsillos-texto-fila">
                    <b>{b.nombre}</b>
                    <small>{b.detalle}</small>
                  </span>
                  <span className="bolsillos-monto num">{soles(b.monto)}</span>
                  <ChevronRight aria-hidden className="bolsillos-flecha h-4 w-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
