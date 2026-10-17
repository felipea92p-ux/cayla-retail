"use client";

import { useEffect, useState } from "react";
import { CuentasProveedor } from "@/components/CuentasProveedor";
import { createClient } from "@/lib/supabase/client";
import { faltaDelProveedor, telefonoDelProveedor, type DatosBancariosLeidos } from "@/lib/proveedor-elegido-reglas";
import type { ProveedorGasto } from "@/lib/gastos-reglas";
import type { DatosPagoProveedor } from "@/lib/proveedores-reglas";

// Al elegir un proveedor en un gasto (fijo o suelto) se ve cómo contactarlo y cómo pagarle, sin ir a Compras (ADR-0437): que otra
// persona pueda gestionar CAYLA si Felipe falta. Reutiliza `CuentasProveedor` (la misma pieza de Por pagar). Lo bancario NO viene
// en la lista de proveedores: se pide al elegir con `fn_proveedor_datos_bancarios`, que devuelve cero filas a quien no lo puede ver
// (entonces no se dice «sin cuenta»: no se sabe). Es solo lectura: no guarda nada.


type Bancarios = { banco: string | null; cuenta_bancaria: string | null; cci: string | null; celular_billetera: string | null; billeteras: string[] | null; titular_cuenta: string | null };

export function ProveedorElegido({ proveedor }: { proveedor: ProveedorGasto | undefined }) {
  const id = proveedor?.id ?? null;
  const [leido, setLeido] = useState<{ id: string; datos: Bancarios | null } | null>(null);

  useEffect(() => {
    if (!id) return;
    let vigente = true;
    // `x-espera: no` no hace falta: `fn_` es de lectura para el loader (espera-reglas.ts).
    createClient()
      .rpc("fn_proveedor_datos_bancarios" as never, { p_proveedor_id: id } as never)
      .then(({ data, error }) => {
        if (!vigente) return;
        const filas = (error ? [] : (data ?? [])) as Bancarios[];
        setLeido({ id, datos: filas[0] ?? null });
      });
    return () => {
      vigente = false;
    };
  }, [id]);

  if (!proveedor) return null;
  // Lo leído de OTRO proveedor (el combo cambió y la respuesta aún no llega) no se muestra.
  const datos = leido && leido.id === proveedor.id ? leido.datos : null;
  const cargando = !leido || leido.id !== proveedor.id;

  const bancarios: DatosBancariosLeidos | null = datos
    ? { cuentaBancaria: datos.cuenta_bancaria, cci: datos.cci, celularBilletera: datos.celular_billetera }
    : null;
  const tel = telefonoDelProveedor(proveedor.telefono ?? null);
  const falta = cargando ? null : faltaDelProveedor({ telefono: proveedor.telefono ?? null, formaPagoPreferida: proveedor.forma_pago_preferida ?? null }, bancarios);
  const hayCuenta = !!(datos && (datos.cuenta_bancaria || datos.cci || datos.celular_billetera));
  // Sin cuenta, la nota «Falta cuenta…» ya lo dice: no se repite con la tarjeta vacía (salvo que cobre en efectivo).
  const pago: DatosPagoProveedor | null = datos && (hayCuenta || proveedor.forma_pago_preferida === "efectivo")
    ? {
        proveedorId: proveedor.id,
        banco: datos.banco,
        cuentaBancaria: datos.cuenta_bancaria,
        cci: datos.cci,
        celularBilletera: datos.celular_billetera,
        billeteras: datos.billeteras,
        titular: datos.titular_cuenta,
        telefono: proveedor.telefono ?? null,
        plazoCreditoDias: proveedor.plazo_credito_dias ?? null,
        formaPagoPreferida: proveedor.forma_pago_preferida ?? null,
      }
    : null;

  return (
    <div className="anim-revelar mb-4 space-y-3" aria-live="polite">
      {(tel || proveedor.contacto) && (
        <p className="text-sm text-tinta">
          {proveedor.contacto && <span className="text-tinta/70">{proveedor.contacto}</span>}
          {proveedor.contacto && tel && " · "}
          {tel &&
            (tel.whatsapp ? (
              <a className="btn-cayla btn-enlace" href={tel.whatsapp} target="_blank" rel="noreferrer">
                {tel.texto}
              </a>
            ) : (
              <span className="tabular-nums">{tel.texto}</span>
            ))}
        </p>
      )}
      {pago && <CuentasProveedor datos={pago} titulo="Se le paga por" />}
      {falta && <p className="nota-cayla">{falta}</p>}
    </div>
  );
}
