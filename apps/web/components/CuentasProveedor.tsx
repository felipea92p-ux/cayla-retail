"use client";

import { useState, type ReactNode } from "react";
import { BotonCopiar } from "@/components/ui/BotonCopiar";
import { ETIQUETA_METODO } from "@/lib/compras-reglas";
import {
  billeterasTexto,
  cuentaLocalVisible,
  enmascararCci,
  enmascararCelular,
  enmascararCuenta,
  formatoCci,
  formatoCelular,
  type DatosPagoProveedor,
} from "@/lib/proveedores-reglas";
import { EnlaceVer } from "@/components/ui/EnlaceVer";
import { LapizEditar } from "@/components/ui/BotonEditar";

// «Cómo se le paga a este proveedor» (ADR-0134): cuenta, CCI, Yape/Plin y titular, cada uno con su «Copiar».
// UNA sola fuente para la ficha del proveedor y para los modales de pago (antes eran tres copias distintas,
// y el «Yape / Plin» del pago mostraba el WhatsApp del contacto — plata mandada al celular equivocado).
//
// El TITULAR va primero (Felipe 2026-10-21): es lo que se compara con el nombre que muestra el banco o Yape ANTES de confirmar, y
// pagar al celular equivocado no se revierte. Y si la cuenta que mira no puede ver los datos (`datos.ocultos`), se dice «no puedes
// verlos», nunca «sin cuenta»: no se sabe si el proveedor la tiene.
//
// Los datos salen enmascarados y «Ver completos» los destapa (son datos de un tercero); «Copiar» copia
// siempre el valor completo, sin guiones ni espacios, listo para pegar en la app del banco. Sin cuenta, sin CCI
// y sin billetera se dice, con un enlace para agregarlos, salvo que el proveedor cobre en efectivo: ahí no le
// falta nada.
//
// Movimiento (ADR-0136): al copiar, el botón pasa a verde con transición de color y da un pequeño «pop»
// (`anim-pop`, globals.css) — la confirmación se ve sin leer. Se apaga con movimiento reducido.

type Fila = { clave: string; etiqueta: string; mostrar: string; visible: string; copiar: string };

function filasDe(d: DatosPagoProveedor, ver: boolean): Fila[] {
  const cuenta = cuentaLocalVisible(d.cuentaBancaria, d.cci);
  const filas: Fila[] = [];
  if (d.cci) filas.push({ clave: "cci", etiqueta: "CCI", visible: formatoCci(d.cci), mostrar: ver ? formatoCci(d.cci) : enmascararCci(d.cci), copiar: d.cci });
  if (cuenta) filas.push({ clave: "cuenta", etiqueta: "Cuenta", visible: cuenta, mostrar: ver ? cuenta : enmascararCuenta(cuenta), copiar: cuenta });
  if (d.celularBilletera) {
    filas.push({
      clave: "billetera",
      etiqueta: billeterasTexto(d.billeteras) ?? "Yape / Plin",
      visible: formatoCelular(d.celularBilletera),
      mostrar: ver ? formatoCelular(d.celularBilletera) : enmascararCelular(d.celularBilletera),
      copiar: d.celularBilletera,
    });
  }
  return filas;
}

export function CuentasProveedor({
  datos,
  onEditar,
  titulo = "Paga por",
  className = "",
  mostrarPlazo = true,
  etiquetaForma,
}: {
  datos: DatosPagoProveedor;
  /** Si se pasa, aparece «Editar» y, cuando no hay datos, «Agregar…». */
  onEditar?: () => void;
  titulo?: string;
  className?: string;
  /** «Contado» o «Crédito a N días»: es de un proveedor de Compras; un gasto fijo no lo tiene (ADR-0452). */
  mostrarPlazo?: boolean;
  /** Dice la forma de pago con sus palabras (la ficha de un gasto fijo), en vez de la «preferida» de un proveedor. */
  etiquetaForma?: string;
}) {
  const [ver, setVer] = useState(false);
  const filas = filasDe(datos, ver);
  const cobraEnEfectivo = datos.formaPagoPreferida === "efectivo";
  const sinNada = filas.length === 0;
  const ocultos = datos.ocultos === true;
  // Ámbar solo si de verdad falta la cuenta: lo que no se puede ver no se acusa de faltar.
  const faltaCuenta = sinNada && !cobraEnEfectivo && !ocultos;
  const forma = etiquetaForma ?? (datos.formaPagoPreferida ? (ETIQUETA_METODO[datos.formaPagoPreferida] ?? datos.formaPagoPreferida) : null);

  return (
    <div className={`anim-revelar rounded-xl border p-4 ${faltaCuenta ? "border-ambar/30 bg-ambar/[0.06]" : "border-sand bg-sand/40"} ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <p className="label-cayla text-[10px] text-tinta/55">{titulo}</p>
          <p className="mt-1 text-sm text-tinta">
            {forma ?? "Sin medio preferido"}
            {datos.banco ? ` · ${datos.banco}` : ""}
          </p>
          {mostrarPlazo && <p className="text-xs text-tinta/55">{datos.plazoCreditoDias ? `Crédito a ${datos.plazoCreditoDias} días` : "Contado"}</p>}
        </div>
        <div className="flex items-center gap-4">
          {filas.length > 0 && (
            <button
              type="button"
              onClick={() => setVer((v) => !v)}
              aria-pressed={ver}
              className="btn-cayla btn-enlace text-xs"
            >
              {ver ? "Ocultar" : "Ver completos"}
            </button>
          )}
          {onEditar && (
            <LapizEditar que="la cuenta" onClick={onEditar} />
          )}
        </div>
      </div>

      {(filas.length > 0 || datos.titular) && (
        <dl className="mt-3 divide-y divide-tinta/10 border-t border-tinta/10">
          {datos.titular && <FilaTitular titular={datos.titular} />}
          {filas.map((f) => (
            <FilaDato key={f.clave} etiqueta={f.etiqueta} valor={f.mostrar} copiar={f.copiar} alFallar={() => setVer(true)} />
          ))}
        </dl>
      )}

      {ocultos && <p className="mt-3 text-sm text-tinta/70">No puedes ver los datos de pago de este proveedor. Pídeselos a quien paga.</p>}
      {sinNada && !ocultos && (
        <p className={`mt-3 text-sm ${cobraEnEfectivo ? "text-tinta/70" : "text-ambar-profundo"}`}>
          {cobraEnEfectivo ? "Cobra en efectivo: no necesita cuenta." : "Sin cuenta, CCI ni Yape / Plin registrados."}
          {onEditar && !cobraEnEfectivo && (
            <>
              {" "}
              <EnlaceVer onClick={onEditar}>Agregar</EnlaceVer>
            </>
          )}
        </p>
      )}
    </div>
  );
}

// El titular, primera fila: lo que se compara con el nombre que muestra el banco antes de mandar la plata. No lleva «Copiar» (no es
// un dato que se pegue en la app del banco).
function FilaTitular({ titular }: { titular: string }) {
  return (
    <div className="grid grid-cols-[6.5rem_1fr_auto] items-center gap-3 py-2">
      <dt className="label-cayla text-[10px] text-tinta/55">Titular</dt>
      <dd className="min-w-0 break-words text-sm text-tinta">
        <b className="font-semibold">{titular}</b>
        <span className="block text-xs text-tinta/45">Compáralo con el nombre que muestra el banco antes de confirmar.</span>
      </dd>
    </div>
  );
}

// Copiar es la pieza del sistema (<BotonCopiar>, ronda 13): el ícono junto al dato. Sin permiso del portapapeles, además del aviso,
// se muestran los datos completos («Ver completos») para copiarlos a mano.
function FilaDato({ etiqueta, valor, copiar, alFallar }: { etiqueta: string; valor: ReactNode; copiar: string; alFallar: () => void }) {
  const nombre = etiqueta.toLowerCase();
  const que = nombre === "cuenta" ? "la cuenta" : nombre === "cci" ? "el CCI" : `el ${etiqueta}`;
  return (
    <div className="grid grid-cols-[6.5rem_1fr_auto] items-center gap-3 py-2">
      <dt className="label-cayla text-[10px] text-tinta/55">{etiqueta}</dt>
      <dd className="min-w-0 break-all text-sm tabular-nums tracking-[0.02em] text-tinta">{valor}</dd>
      <BotonCopiar forma="icono" texto={copiar} que={que} alFallar={alFallar} className="-my-1" />
    </div>
  );
}
