"use client";

import Link from "next/link";
import { useState, type CSSProperties } from "react";
import { ChevronRight, CircleHelp } from "lucide-react";
import { BarraApilada } from "@/components/ui/BarraApilada";
import { Chip } from "@/components/ui/Chip";
import { CifraAnimada } from "@/components/ui/CifraAnimada";
import { Modal } from "@/components/ui/Modal";
import { COLOR_LIBRE, cuentaDeLibre, type ClaveBolsillo, type SaldoBolsillos } from "@/lib/bolsillos-reglas";
import { fechaEnPalabras } from "@/lib/caja-proxima-reglas";
import { soles } from "@/lib/flujo-caja-reglas";

// Finanzas ▸ Resumen, camino «A · Bolsillos» (Felipe 2026-11-09): arriba a la izquierda, lo que se puede usar sin dejar de pagar nada, y la plata
// partida en bolsillos con dueño, como las cajitas de la app del banco. Solo DIBUJA lo que arma `saldoEnBolsillos` (la regla, con su prueba). Cada
// bolsillo lleva a la pantalla donde se resuelve; «¿Cómo se calcula?» abre la cuenta renglón por renglón. Mirando una sede, solo su efectivo.

type Props = {
  saldo: SaldoBolsillos;
  /** Adónde lleva cada bolsillo (con la sede y el mes que se miran). Sin destino, el renglón no se toca. */
  destinos: Partial<Record<ClaveBolsillo, string>>;
  /** Para la nota bajo la cifra: «Es de hoy, aunque mires octubre». `null` si se mira hoy. */
  otroMes: string | null;
};

const entra = (i: number) => ({ className: "anim-entra", style: { ["--i" as string]: i } as CSSProperties });

export function SaldoLibre({ saldo, destinos, otroMes }: Props) {
  const [cuenta, setCuenta] = useState(false);

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
          <p className="bolsillos-cifra">
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
        <button type="button" className="btn-cayla btn-enlace bolsillos-como" onClick={() => setCuenta(true)} data-guia="fin-resumen.como-se-calcula">
          <CircleHelp aria-hidden className="h-3.5 w-3.5" />
          ¿Cómo se calcula?
        </button>
      </div>
      <p className={`bolsillos-cifra ${saldo.libre < 0 ? "es-falta" : ""}`}>
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
        </div>
      )}

      {saldo.bolsillos.length > 0 && (
        <>
          <p className="bolsillos-subtitulo">Lo demás, en sus bolsillos · hasta el {fechaEnPalabras(saldo.hasta)}</p>
          <ul className="bolsillos-lista">
            {saldo.bolsillos.map((b, i) => {
              const cuerpo = (
                <>
                  <span aria-hidden className="bolsillos-muestra" style={{ ["--c" as string]: b.color } as CSSProperties} />
                  <span className="bolsillos-texto">
                    <b>{b.nombre}</b>
                    <small>{b.detalle}</small>
                  </span>
                  <span className="bolsillos-monto num">{soles(b.monto)}</span>
                  {destinos[b.clave] && <ChevronRight aria-hidden className="bolsillos-flecha h-4 w-4" />}
                </>
              );
              const href = destinos[b.clave];
              return (
                <li key={b.clave} {...entra(i + 2)}>
                  {href ? (
                    <Link href={href} className="bolsillos-fila es-enlace">
                      {cuerpo}
                    </Link>
                  ) : (
                    <div className="bolsillos-fila">{cuerpo}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}

      {cuenta && (
        <Modal titulo="Cómo se calcula «Libre para usar»" subtitulo="Lo que hay hoy, menos todo lo que ya tiene dueño. No cuenta lo que vas a vender." onClose={() => setCuenta(false)} conCerrar tamano="mediana">
          <ol className="bolsillos-cuenta">
            {cuentaDeLibre(saldo).map((f) => (
              <li key={f.texto} className={f.total ? "es-total" : ""}>
                <span className="bolsillos-texto">
                  <b>{f.texto}</b>
                  <small>{f.detalle}</small>
                </span>
                <span className={`num ${f.monto < 0 && !f.total ? "es-resta" : ""}`}>{f.total ? soles(f.monto) : f.monto < 0 ? `− ${soles(-f.monto)}` : soles(f.monto)}</span>
              </li>
            ))}
          </ol>
          <p className="nota-cayla mt-4">
            Los pagos son los de los próximos 14 días que ya están registrados: planilla, impuestos, facturas de proveedor y gastos fijos. El IGV que vas juntando este mes se paga el mes que viene, pero ya no es tuyo.
          </p>
        </Modal>
      )}
    </section>
  );
}
