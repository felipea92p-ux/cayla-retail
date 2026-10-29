"use client";

import { useState } from "react";
import { ChevronDown, FileText, Landmark } from "lucide-react";
import { Superficie } from "@/components/finanzas/kit";
import { BotonEnlace } from "@/components/ui/campos";
import { CifraAnimada } from "@/components/ui/CifraAnimada";
import { Vacio } from "@/components/ui/Vacio";
import { solesRedondo } from "@/lib/gastos-reglas";
import type { CuentaImpuestos } from "@/lib/impuestos-cuenta-reglas";

// Finanzas ▸ Impuestos, «E · B++» (Felipe 2026-10-28, ADR-0573): arriba, UNA respuesta grande («Pagas») y, a su lado, la cuenta en líneas:
// vendiste → IGV de tus ventas − IGV de tus compras + renta = pagas. Las cifras las arma `lib/impuestos-cuenta-reglas.ts` sobre lo que ya
// calcula la base; aquí solo se dibujan. El porcentaje de la renta es el del parámetro del año (hoy «por confirmar»).

const mas = (n: number) => solesRedondo(n);

/** La respuesta: lo que de verdad sale hacia SUNAT por el mes que se mira, cuándo se paga y lo que falta hacer. */
export function PagasImpuestos({ cuenta, guia }: { cuenta: CuentaImpuestos; guia?: string }) {
  const hay = cuenta.estado !== "sin_mes";
  return (
    <section className="fin-pagas anim-sube" style={{ ["--i" as string]: 1 }} data-guia={guia} aria-label={cuenta.etiqueta}>
      <p className="fin-pagas-nombre">{cuenta.etiqueta}</p>
      <p className="fin-pagas-cifra">
        <CifraAnimada valor={hay ? Math.round(cuenta.pagas) : 0} formato="soles-redondo" />
      </p>
      {hay && <span className="fin-pagas-chip">{cuenta.chip}</span>}
      <p className="fin-pagas-frase">{cuenta.frase}</p>
      {hay && (
        <div>
          <BotonEnlace href="/finanzas/dinero" peso="fantasma" title="Anota el pago que hiciste desde un banco, en Cuentas y dinero">
            <Landmark aria-hidden className="h-4 w-4" /> Registrar pago
          </BotonEnlace>
        </div>
      )}
    </section>
  );
}

/** La cuenta en líneas. «IGV de tus compras» se abre para ver de dónde sale (mercadería, gastos, máquinas, Taller y notas de crédito). */
export function CuentaLineas({ cuenta, guia }: { cuenta: CuentaImpuestos; guia?: string }) {
  const [abierta, setAbierta] = useState(false);
  if (cuenta.estado === "sin_mes") {
    return (
      <Superficie pad className="anim-sube" guia={guia}>
        <Vacio tamano="chico" icono={<FileText />}>Este mes no hubo ventas ni compras con factura.</Vacio>
      </Superficie>
    );
  }
  const c = cuenta;
  return (
    <Superficie pad className="fin-cuenta anim-sube" guia={guia}>
      <div className="fin-cuenta-fila fin-cuenta-base">
        <span>
          <span className="label-cayla">Vendiste · sin IGV</span>
          <small>{c.comprobantes === 1 ? "1 comprobante" : `${c.comprobantes.toLocaleString("es-PE")} comprobantes`}</small>
        </span>
        <span className="fin-cuenta-monto">{mas(c.vendiste)}</span>
      </div>
      <div className="fin-cuenta-fila">
        <span>
          IGV de tus ventas
          <small>{c.tasaIgv} % de lo vendido</small>
        </span>
        <span className="fin-cuenta-monto">{mas(c.igvVentas)}</span>
      </div>
      <div className="fin-cuenta-fila">
        <span>
          <button type="button" className="btn-cayla btn-enlace fin-cuenta-abrir" aria-expanded={abierta} onClick={() => setAbierta((v) => !v)}>
            − IGV de tus compras
            <ChevronDown aria-hidden className="h-3.5 w-3.5" data-abierta={abierta ? "" : undefined} />
          </button>
          <small>{abierta ? "Toca para ocultar" : "Toca para ver de dónde sale"}</small>
        </span>
        <span className="fin-cuenta-monto">{mas(c.igvCompras)}</span>
      </div>
      {abierta && (
        <div className="fin-cuenta-det">
          {c.lineasCompras.map((l) => (
            <div key={l.clave}>
              <span>{l.resta ? "− " : ""}{l.nombre}</span>
              <span className="num">{mas(l.monto)}</span>
            </div>
          ))}
        </div>
      )}
      {c.saldoAnterior > 0 && (
        <div className="fin-cuenta-fila">
          <span>− Saldo a favor que traías</span>
          <span className="fin-cuenta-monto">{mas(c.saldoAnterior)}</span>
        </div>
      )}
      <div className="fin-cuenta-fila">
        <span>
          + Renta a cuenta
          <small>
            {c.renta.tasa ? `Adelanto del impuesto a la renta: ${c.renta.tasa} de ${mas(c.renta.base)}${c.renta.provisional ? " (tasa por confirmar)" : ""}` : "Falta la tasa del año en Configuración"}
          </small>
        </span>
        <span className="fin-cuenta-monto">{c.renta.monto === null ? "—" : mas(c.renta.monto)}</span>
      </div>
      {c.estado === "a_favor" && (
        <div className="fin-cuenta-fila">
          <span>IGV a favor, pasa al mes que viene</span>
          <span className="fin-cuenta-monto">{mas(c.aFavor)}</span>
        </div>
      )}
      <div className="fin-cuenta-fila fin-cuenta-total">
        <span>= {c.etiqueta}</span>
        <span className="fin-cuenta-monto">{mas(c.pagas)}</span>
      </div>
    </Superficie>
  );
}
