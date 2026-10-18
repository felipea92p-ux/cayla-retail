"use client";

import { useEffect, useState, type ReactNode } from "react";
import { CuentasProveedor } from "@/components/CuentasProveedor";
import { BotonCopiar } from "@/components/ui/BotonCopiar";
import { Chip } from "@/components/ui/Chip";
import { createClient } from "@/lib/supabase/client";
import {
  contratoPorVencer,
  faltaDeLaFicha,
  leerFicha,
  TEXTO_FORMA_DE_PAGO,
  TEXTO_TIPO_DOCUMENTO,
  textoContratoPorVencer,
  textoDeLoQueFalta,
  type FichaLeida,
} from "@/lib/gasto-fijo-ficha-reglas";
import { telefonoDelProveedor } from "@/lib/proveedor-elegido-reglas";
import type { DatosPagoProveedor } from "@/lib/proveedores-reglas";

// «A quién y cómo se le paga esto», a la vista al registrar un gasto que viene de un fijo (ADR-0452): quien lo paga mañana no
// tiene que llamar a quien lo cargó. Es solo lectura. La cuenta sale solo si la cuenta que mira es de un líder o admin; si no,
// la base ya la devuelve vacía y aquí no se acusa que «falta» (no se sabe). Reutiliza `CuentasProveedor` (el mismo «Copiar» y
// «Ver completos» de Por pagar).

function Dato({ etiqueta, children, copiar, que }: { etiqueta: string; children: ReactNode; copiar?: string; que?: string }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5">
      <div className="min-w-0">
        <p className="label-cayla text-[10px] text-tinta/55">{etiqueta}</p>
        <div className="text-sm text-tinta">{children}</div>
      </div>
      {copiar && que && <BotonCopiar texto={copiar} que={que} forma="icono" />}
    </div>
  );
}

export function FichaDePagoTarjeta({ gastoFijoId, hoy }: { gastoFijoId: string; hoy: string }) {
  const [leida, setLeida] = useState<{ id: string; ficha: FichaLeida | null } | null>(null);

  useEffect(() => {
    let vigente = true;
    // `fn_` es de lectura para el loader (espera-reglas.ts): no tapa la hoja.
    createClient()
      .rpc("fn_gasto_fijo_ficha" as never, { p_gasto_fijo_id: gastoFijoId } as never)
      .then(({ data, error }) => {
        if (!vigente) return;
        const filas = (error ? [] : (data ?? [])) as Record<string, unknown>[];
        setLeida({ id: gastoFijoId, ficha: leerFicha(filas[0]) });
      });
    return () => {
      vigente = false;
    };
  }, [gastoFijoId]);

  // Sin respuesta (la base aún no tiene la ficha, o la cuenta no ve este fijo): la hoja sigue igual de siempre.
  if (!leida || leida.id !== gastoFijoId || !leida.ficha) return null;
  const f = leida.ficha;

  const hayAlgo = !!(f.beneficiario || f.telefono || f.correo || f.formaDePago || f.codigoServicio || f.reciboLlega || f.contratoVence || f.notas || f.tieneCuenta);
  if (!hayAlgo) {
    return (
      <p className="nota-cayla anim-revelar mb-4">
        Este gasto fijo todavía no tiene a quién ni cómo se le paga. Se completa en <b>Configuración ▸ Gastos fijos</b>.
      </p>
    );
  }

  const tel = telefonoDelProveedor(f.telefono || null);
  const hayCuenta = !!(f.cuentaBancaria || f.cci || f.celularBilletera);
  const pago: DatosPagoProveedor | null = f.puedeVerBanco && hayCuenta
    ? {
        proveedorId: gastoFijoId,
        banco: f.banco || null,
        cuentaBancaria: f.cuentaBancaria || null,
        cci: f.cci || null,
        celularBilletera: f.celularBilletera || null,
        billeteras: f.billeteras.length ? f.billeteras : null,
        titular: f.titularCuenta || null,
        telefono: f.telefono || null,
        plazoCreditoDias: null,
        formaPagoPreferida: f.formaDePago === "efectivo" ? "efectivo" : null,
      }
    : null;
  const vence = f.contratoVence ? contratoPorVencer(f.contratoVence, hoy) : null;
  const falta = textoDeLoQueFalta(
    faltaDeLaFicha({ beneficiario: f.beneficiario, formaDePago: f.formaDePago, codigoServicio: f.codigoServicio, contratoVence: f.contratoVence, tieneCuenta: f.tieneCuenta }),
  );

  return (
    <div className="anim-revelar mb-4 space-y-3" aria-live="polite">
      <div className="rounded-xl border border-sand bg-sand/40 p-4">
        <p className="label-cayla text-[10px] text-tinta/55">Se le paga a</p>
        <div className="mt-1 divide-y divide-tinta/10">
          {f.beneficiario && (
            <Dato etiqueta="Propietario o empresa">
              <b className="font-semibold">{f.beneficiario}</b>
              {f.documentoTipo && <span className="text-tinta/60"> · {TEXTO_TIPO_DOCUMENTO[f.documentoTipo]} {f.documentoNumero}</span>}
            </Dato>
          )}
          {tel && (
            <Dato etiqueta="Teléfono" copiar={tel.texto} que="el teléfono">
              {tel.whatsapp ? (
                <a className="btn-cayla btn-enlace" href={tel.whatsapp} target="_blank" rel="noreferrer">
                  {tel.texto}
                </a>
              ) : (
                <span className="tabular-nums">{tel.texto}</span>
              )}
            </Dato>
          )}
          {f.correo && (
            <Dato etiqueta="Correo" copiar={f.correo} que="el correo">
              {f.correo}
            </Dato>
          )}
          {f.codigoServicio && (
            <Dato etiqueta="Código del servicio" copiar={f.codigoServicio} que="el código">
              <span className="tabular-nums">{f.codigoServicio}</span>
            </Dato>
          )}
          {f.reciboLlega && <Dato etiqueta="Cómo llega el recibo">{f.reciboLlega}</Dato>}
          {f.contratoVence && (
            <Dato etiqueta="Vence el contrato">
              <span className="tabular-nums">{f.contratoVence.split("-").reverse().join("/")}</span>{" "}
              {vence && (
                <Chip tono={vence.vencido || vence.dias <= 30 ? "ambar" : "neutro"} versalitas={false}>
                  {textoContratoPorVencer(vence)}
                </Chip>
              )}
            </Dato>
          )}
          {f.notas && (
            <Dato etiqueta="Notas">
              <span className="whitespace-pre-line">{f.notas}</span>
            </Dato>
          )}
        </div>
      </div>
      {pago && <CuentasProveedor datos={pago} titulo="Se le paga por" mostrarPlazo={false} etiquetaForma={f.formaDePago ? TEXTO_FORMA_DE_PAGO[f.formaDePago] : "Sin forma de pago elegida"} />}
      {!pago && f.formaDePago && (
        <p className="text-sm text-tinta/70">
          Forma de pago: <b className="font-semibold text-tinta">{TEXTO_FORMA_DE_PAGO[f.formaDePago]}</b>
          {!f.puedeVerBanco && (f.formaDePago === "transferencia" || f.formaDePago === "billetera" || f.formaDePago === "deposito" || f.formaDePago === "debito")
            ? ". La cuenta la ve solo un líder o admin."
            : ""}
        </p>
      )}
      {falta && <p className="nota-cayla">{falta}: complétalo en Configuración ▸ Gastos fijos.</p>}
    </div>
  );
}
