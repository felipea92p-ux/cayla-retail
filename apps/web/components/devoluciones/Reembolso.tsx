"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { CampoSelect } from "@/components/ui/campos";
import { Aviso } from "@/components/ui/Aviso";
import { TituloGrupo } from "@/components/ui/TituloSeccion";
import { CLASE_MONTO_ILEGIBLE, atributosMontoTexto } from "@/components/ui/CampoMonto";
import { useCuentasParaElegir } from "@/components/finanzas/CampoCuenta";
import { METODOS_DIFERENCIA } from "@/lib/cambios-reglas";
import { soles } from "@/lib/compras-reglas";
import { ayudaCuenta, cuentaEfectiva, hayCuentasPara, opcionesDeCuenta } from "@/lib/cuenta-sellada-reglas";
import { datosParaAprobar, medioSugeridoReembolso, revisarAprobacion, type ComprobanteSinAceptar, type DatosParaAprobar, type PagoDeLaVenta } from "@/lib/devoluciones-reglas";
import { numeroDeMonto } from "@/lib/monto-plata-reglas";

// El reembolso de una devolución al aprobarla. Una sola pieza para las dos puertas: «Por aprobar» y «Registrar y aprobar» en el
// último paso de la devolución (ADR-0718). Qué se puede aprobar lo decide `revisarAprobacion` (espejo de `aprobar_devolucion`).

type Metodo = (typeof METODOS_DIFERENCIA)[number]["valor"];

export function useReembolso({
  ubicacionId,
  valorPagado,
  pagos,
  cajaAbierta,
  sinAceptar,
  activo,
}: {
  ubicacionId: string;
  valorPagado: number;
  pagos: readonly PagoDeLaVenta[];
  cajaAbierta: boolean;
  sinAceptar: ComprobanteSinAceptar | null;
  activo: boolean;
}) {
  const [monto, setMonto] = useState("");
  // Propone el medio con que se pagó la venta (Felipe 2026-10-12: «libre, con aviso»); lo que la persona elige manda.
  const [metodoElegido, setMetodo] = useState<Metodo | null>(null);
  const metodo = metodoElegido ?? (medioSugeridoReembolso(pagos, METODOS_DIFERENCIA.map((m) => m.valor)) as Metodo);
  // «Sale de» (ADR-0195 F3b, situación 9): en efectivo sale del cajón, como siempre; con otro medio, se propone la cuenta
  // de esa tienda para ese medio (la del Yape, la de las transferencias, el POS).
  const cuentas = useCuentasParaElegir("cobro", ubicacionId, activo);
  const [cuentaElegida, setCuentaElegida] = useState<string | null>(null);

  const montoNumero = monto.trim() === "" ? null : numeroDeMonto(monto);
  const hayReembolso = montoNumero !== null && montoNumero > 0;
  const conCuenta = hayReembolso && metodo !== "efectivo";
  const hayCuentas = cuentas.listo && hayCuentasPara(cuentas.cuentas, "cobro", metodo);
  const cuentaSale = conCuenta && hayCuentas ? cuentaEfectiva(cuentas.cuentas, "cobro", metodo, cuentaElegida) : null;
  const revision = revisarAprobacion({
    monto: montoNumero,
    metodo,
    cajaAbierta,
    valorPagado,
    sinAceptar,
    pagos,
    etiquetaMedio: (m) => METODOS_DIFERENCIA.find((x) => x.valor === m)?.etiqueta ?? m,
  });

  return {
    monto,
    setMonto,
    montoNumero,
    metodo,
    setMetodo,
    hayReembolso,
    conCuenta,
    hayCuentas,
    cuentas,
    cuentaSale,
    setCuentaElegida,
    revision,
    valorPagado,
    /** Lo que viaja a `aprobar_devolucion` además de la devolución. */
    params: {
      p_reembolso_monto: hayReembolso ? montoNumero : undefined,
      p_reembolso_metodo: hayReembolso ? metodo : undefined,
      p_reembolso_cuenta_id: cuentaSale ?? undefined,
    },
  };
}

export function CamposReembolso({ r, id, autoFocus = false }: { r: ReturnType<typeof useReembolso>; id: string; autoFocus?: boolean }) {
  return (
    <div className="space-y-4">
      <div>
        <TituloGrupo>¿Se le reembolsa algo?</TituloGrupo>
        <p className="mt-0.5 text-sm text-secundario">Opcional y última opción: antes, un cambio o una nota de crédito.</p>
      </div>
      <div className="flex flex-wrap items-end gap-4">
        <div className="campo">
          <label htmlFor={`monto-${id}`} className="campo-etiqueta">
            Monto
          </label>
          <div className="mt-1 flex items-center gap-2">
            <input
              id={`monto-${id}`}
              {...atributosMontoTexto(r.monto)}
              autoFocus={autoFocus}
              value={r.monto}
              onChange={(e) => r.setMonto(e.target.value)}
              placeholder="S/ 0.00"
              className={`caja-campo-input w-36 text-sm tabular-nums ${CLASE_MONTO_ILEGIBLE}`}
            />
            <button type="button" onClick={() => r.setMonto(r.valorPagado.toFixed(2))} className="btn-cayla btn-sutil btn-chico">
              Todo ({soles(r.valorPagado)})
            </button>
          </div>
        </div>
        {r.montoNumero !== null && r.montoNumero > 0 && (
          <div className="anim-revelar">
            <CampoSelect etiqueta="¿Cómo se le devuelve?" valor={r.metodo} onValor={r.setMetodo} opciones={METODOS_DIFERENCIA.map((m) => ({ valor: m.valor, texto: m.etiqueta }))} />
          </div>
        )}
        {r.hayReembolso && (
          <div className="anim-revelar min-w-0 max-w-full flex-1 basis-[14rem]">
            {/* El combo del sistema, como su vecino «¿Cómo se le devuelve?»: bloqueado, su marcador dice de dónde sale. */}
            <CampoSelect
              etiqueta="Sale de"
              id={`cuenta-${id}`}
              valor={r.cuentaSale ?? ""}
              onValor={r.setCuentaElegida}
              opciones={r.conCuenta && r.hayCuentas ? opcionesDeCuenta(r.cuentas.cuentas, "cobro", r.metodo) : []}
              marcador={!r.conCuenta ? "El cajón de la tienda" : !r.cuentas.listo ? "…" : r.hayCuentas ? undefined : "Sin cuenta configurada para este medio"}
              deshabilitado={!r.conCuenta || !r.hayCuentas}
            />
          </div>
        )}
      </div>
      {r.hayReembolso && (
        <p className="-mt-2 text-sm text-secundario">
          {!r.conCuenta
            ? "En efectivo sale del cajón y resta del cierre, como siempre."
            : r.hayCuentas
              ? ayudaCuenta(r.cuentas.cuentas.find((c) => c.id === r.cuentaSale) ?? null, "sale", "cobro")
              : "Queda «sin cuenta» hasta que el líder la configure; el reembolso se registra igual."}
        </p>
      )}
      {r.revision.bloqueo && (
        <Aviso tono="atencion" chico>
          {r.revision.bloqueo}
        </Aviso>
      )}
      {r.revision.aviso && (
        <Aviso tono="info" chico>
          {r.revision.aviso}
        </Aviso>
      )}
    </div>
  );
}

/** Lo que hace falta saber de la venta para aprobar en el mismo paso: si su boleta ya la aceptó SUNAT y cómo pagó. Se lee al
 *  llegar al último paso (el estado en SUNAT puede haber cambiado). Si no se puede leer, no se ofrece aprobar. */
export function useDatosParaAprobar(ventaId: string, activo: boolean): { cargando: boolean; datos: DatosParaAprobar | null } {
  const [leido, setLeido] = useState<{ ventaId: string; datos: DatosParaAprobar | null } | null>(null);
  useEffect(() => {
    if (!activo) return;
    let vigente = true;
    const supabase = createClient();
    void Promise.all([
      supabase.from("comprobantes").select("tipo, serie, numero, estado, created_at").eq("venta_id", ventaId).setHeader("x-espera", "no"),
      supabase.from("venta_pagos").select("metodo, monto").eq("venta_id", ventaId).setHeader("x-espera", "no"),
    ]).then(([c, p]) => {
      if (vigente) setLeido({ ventaId, datos: c.error || p.error ? null : datosParaAprobar(c.data ?? [], p.data ?? []) });
    });
    return () => {
      vigente = false;
      setLeido(null);
    };
  }, [ventaId, activo]);
  const mio = leido?.ventaId === ventaId ? leido : null;
  return { cargando: activo && mio === null, datos: mio?.datos ?? null };
}
