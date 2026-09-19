"use client";

import { useState } from "react";
import { Banknote, Check, Package } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { Modal, botonCancelar, botonPrimario } from "@/components/ui/Modal";
import { BotonConfirmar } from "@/components/ComprobanteBotonConfirmar";
import { conEspera, useConfirmacionPago } from "@/components/ComprobanteConfirmacion";
import { Boton, CampoTexto } from "@/components/ui/campos";
import { CampoFecha } from "@/components/ui/CampoFecha";
import { LineasPago, lineaPagoVacia, lineasPagoParaRpc, sumaLineasPago, type LineaPago } from "@/components/LineasPago";
import { ETIQUETA_METODO, METODO_SALDO_A_FAVOR, soles, type CompraResumen } from "@/lib/compras-reglas";
import { hoyLima } from "@/lib/fechas-lima";
import type { DatosPagoProveedor } from "@/lib/proveedores-reglas";

// Acciones sobre una factura ya registrada (ADR-0035): registrar un pago
// contra el saldo, o anularla. La página (server) dibuja el detalle; este
// componente solo pone los botones (el pie del detalle: enlace «Anular» a la izquierda,
// «Ir a recibir» y «Registrar pago» —el principal, negro— a la derecha). Las reglas —el pago no supera el saldo,
// no se anula con pagos o mercadería recibida— las aplica la base; acá solo
// se evita mostrar un botón que va a fallar.
//
// "Registrar pago" abre el modal de pago ACÁ, encima del detalle (como en el prototipo aprobado): al confirmar,
// la hoja de pago se cierra y el detalle que quedó detrás se actualiza en su sitio (`router.refresh()`): la
// línea de tiempo avanza, las barras continúan desde donde estaban y el pago nuevo entra al historial. Antes
// esto llevaba a Por pagar con `?pagar=<id>` y el detalle se perdía; ese camino (`PagoDesdeUrl`) sigue existiendo
// para quien llega a Por pagar con el enlace. `datosPago` (cuenta, CCI, Yape/Plin, titular, saldo a favor) lo
// carga `cargarDetalleCompra`; sin él el modal funciona igual, solo sin la tarjeta «Paga por».
export function CompraAcciones({ compra, tieneRecepciones, datosPago }: { compra: CompraResumen; tieneRecepciones: boolean; datosPago?: DatosPagoProveedor }) {
  const router = useRouter();
  const [anulando, setAnulando] = useState(false);
  const [pagando, setPagando] = useState(false);
  const vigente = compra.estado === "vigente";
  const puedeRecibir = vigente && compra.estadoRecepcion !== "recibida";
  const puedePagar = vigente && compra.saldo > 0;
  const puedeAnular = vigente && compra.pagado === 0 && !tieneRecepciones;

  // Un comprobante anulado ya no tiene acciones. El modal de pago se sigue dibujando aunque el pago recién saldó el
  // comprobante: si no, el refresco lo desmontaría en plena confirmación y se cortaría su animación de cierre.
  if (!vigente && !pagando) return null;

  // Pie del detalle (prototipo aprobado): a la izquierda las acciones discretas como enlaces de texto (anular);
  // a la derecha «Ir a recibir» (secundario, solo si falta mercadería) y «Registrar pago» como botón PRINCIPAL negro
  // (solo si hay saldo). Con el comprobante ya saldado, en su lugar un botón verde deshabilitado «Pagado».
  return (
    <>
      <div className="flex w-full flex-wrap items-center gap-x-4 gap-y-3">
        {puedeAnular && (
          <button
            type="button"
            onClick={() => setAnulando(true)}
            className="text-xs text-tinta/60 underline-offset-2 transition-colors hover:text-rojo hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rojo/60"
          >
            Anular comprobante
          </button>
        )}
        <div className="ml-auto flex flex-wrap items-center justify-end gap-3">
          {/* Atajo al pie: para una factura recién abierta (todo por recibir) es la acción más probable y antes
              solo vivía como enlace dentro de la sección «Recepciones», fuera de la vista. */}
          {puedeRecibir && (
            <Boton peso="fantasma" onClick={() => router.push(`/compras/recibir?compra=${compra.id}`)}>
              <span className="inline-flex items-center gap-2">
                <Package aria-hidden className="cd-ic-abajo h-4 w-4" />
                Ir a recibir
              </span>
            </Boton>
          )}
          {puedePagar ? (
            <Boton peso="primario" onClick={() => setPagando(true)}>
              <span className="inline-flex items-center gap-2">
                <Banknote aria-hidden className="h-4 w-4" />
                Registrar pago
              </span>
            </Boton>
          ) : (
            vigente && (
              <button type="button" disabled className="label-cayla inline-flex cursor-default items-center gap-2 rounded-md bg-verde px-4 py-3 text-[11px] text-crema transition-colors duration-500">
                <Check aria-hidden className="h-4 w-4" />
                Pagado
              </button>
            )
          )}
        </div>
      </div>
      {anulando && <AnularCompraModal compra={compra} onClose={() => setAnulando(false)} />}
      {pagando && <RegistrarPagoModal compra={compra} saldoFavor={datosPago?.saldoFavor ?? 0} datos={datosPago} onClose={() => setPagando(false)} />}
    </>
  );
}

// Abre el modal de pago al llegar a Por pagar con `?pagar=<id>` (ver arriba).
// La página ya verificó que la factura existe, está vigente y tiene saldo.
// Al cerrar se quita solo `pagar` de la URL (con `replace`, para que "atrás"
// no vuelva a abrirlo) y se conservan los filtros que hubiera.
export function PagoDesdeUrl({ compra, saldoFavor = 0, datos }: { compra: CompraResumen; saldoFavor?: number; datos?: DatosPagoProveedor }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  function cerrar() {
    const p = new URLSearchParams(params.toString());
    p.delete("pagar");
    router.replace(p.size ? `${pathname}?${p}` : pathname);
  }
  return <RegistrarPagoModal compra={compra} saldoFavor={saldoFavor} datos={datos} onClose={cerrar} />;
}

// Desde "Por pagar" se paga sin entrar al detalle: el botón de la fila abre
// EL MISMO modal (un pago sigue siendo contra una sola factura — solo se
// ahorra el clic de ir a verla). `compacto` es la versión que cabe en una
// celda de tabla: peso "fantasma" (borde y texto a tinta plena), no
// "discreto" — es la única acción de esa pantalla y no puede ser lo que
// menos se ve.
export function BotonPagar({ compra, compacto = false, saldoFavor = 0, datos }: { compra: CompraResumen; compacto?: boolean; saldoFavor?: number; datos?: DatosPagoProveedor }) {
  const [abierto, setAbierto] = useState(false);
  if (compra.estado !== "vigente" || compra.saldo <= 0) return null;
  return (
    <>
      <Boton
        type="button"
        peso={compacto ? "discreto" : "primario"}
        className={compacto ? "px-2.5 py-1.5 text-[11px]" : ""}
        onClick={() => setAbierto(true)}
      >
        {compacto ? "Pagar" : `Registrar pago · saldo ${soles(compra.saldo)}`}
      </Boton>
      {abierto && <RegistrarPagoModal compra={compra} saldoFavor={saldoFavor} datos={datos} onClose={() => setAbierto(false)} />}
    </>
  );
}

// `datos` (cuenta, CCI, Yape/Plin, titular del proveedor) llega por props de quien abre el modal: `CompraResumen` no los
// trae y no se amplía. Sin ellos el modal funciona igual, solo que sin la tarjeta «Paga por» ni los destinos por línea.
//
// Confirmar (ADR-0130): el botón pasa a «cargando», luego a «visto», si el pago saldó el comprobante salta un
// destello de chispas, la hoja se cierra y —recién entonces— `router.refresh()` actualiza lo que quedó detrás
// (ver `useConfirmacionPago`). El comprobante se congela al abrir: el refresco cambia su saldo y, sin congelarlo,
// la hoja mostraría «se pasa por…» en plena despedida.
export function RegistrarPagoModal({ compra: compraActual, saldoFavor = 0, datos, onClose }: { compra: CompraResumen; saldoFavor?: number; datos?: DatosPagoProveedor; onClose: () => void }) {
  const [compra] = useState(compraActual);
  const confirmacion = useConfirmacionPago({ onClose });

  return (
    // `max-w-lg`: la fila monto · medio · referencia necesita más que el ancho
    // estándar de modal corto; con `max-w-sm` el rótulo "Medio de pago" se
    // partía y el select y la referencia salían cortados.
    <Modal titulo={`Pago a ${compra.proveedorNombre}`} subtitulo={`${compra.documento} · saldo ${soles(compra.saldo)}`} onClose={confirmacion.alCerrar} ancho="max-w-lg">
      {(cerrar) => <FormularioPago compra={compra} saldoFavor={saldoFavor} datos={datos} cerrar={cerrar} confirmacion={confirmacion} />}
    </Modal>
  );
}

function FormularioPago({
  compra,
  saldoFavor,
  datos,
  cerrar,
  confirmacion,
}: {
  compra: CompraResumen;
  saldoFavor: number;
  datos?: DatosPagoProveedor;
  cerrar: () => void;
  confirmacion: ReturnType<typeof useConfirmacionPago>;
}) {
  // Un pago puede repartirse en varios medios (20260914200000_compras_multipago):
  // la RPC escribe todas las líneas o ninguna. La línea arranca con el medio preferido del proveedor, si lo hay.
  const [lineas, setLineas] = useState<LineaPago[]>(() => {
    const linea = lineaPagoVacia(compra.saldo.toFixed(2));
    const preferido = datos?.formaPagoPreferida;
    return [preferido && preferido in ETIQUETA_METODO ? { ...linea, metodo: preferido } : linea];
  });
  const [fecha, setFecha] = useState(hoyLima());
  const { estado, empezar, fallar, confirmar } = confirmacion;

  const suma = sumaLineasPago(lineas);
  const excede = suma > compra.saldo + 0.005;
  const favorUsado = sumaLineasPago(lineas.filter((l) => l.metodo === METODO_SALDO_A_FAVOR));
  const favorExcedido = favorUsado > saldoFavor + 0.005;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    e.stopPropagation();
    if (estado !== "reposo") return;
    const pagos = lineasPagoParaRpc(lineas);
    const sinMonto = Math.max(0, lineas.findIndex((l) => !(Number(l.monto) > 0)));
    if (!pagos) return void avisar.error("Cada medio de pago necesita su monto.", { enfocar: `pago-monto-${sinMonto}` });
    if (fecha > hoyLima()) return void avisar.error("La fecha del pago no puede ser futura: es cuándo se pagó, no cuándo se pagará.");
    if (compra.fechaEmision && fecha < compra.fechaEmision) return void avisar.error("La fecha del pago no puede ser anterior a la emisión del comprobante.");
    if (excede) return void avisar.error(`El pago supera el saldo pendiente (${soles(compra.saldo)}).`, { enfocar: "pago-monto-0" });
    if (favorExcedido) return void avisar.error(`Usas ${soles(favorUsado)} de saldo a favor y solo tienes ${soles(saldoFavor)}.`, { enfocar: "pago-monto-0" });
    const formulario = e.currentTarget;
    if (!empezar()) return;
    const supabase = createClient();
    const { error } = await conEspera(
      supabase.rpc("registrar_pagos_compra", {
        p_compra_id: compra.id,
        p_pagos: pagos,
        p_fecha: fecha,
      }),
    );
    if (error) {
      fallar();
      avisar.error(traducirError(error, "registrar el pago", { confirmarAntesDeRepetir: true }));
      return;
    }
    const resta = Math.round((compra.saldo - suma) * 100) / 100;
    avisar.exito(`Pago de ${soles(suma)} registrado · ${compra.documento}`, {
      detalle: `${resta > 0 ? `Quedan ${soles(resta)} por pagar.` : "Comprobante saldado."}${favorUsado > 0 ? ` Se descontaron ${soles(favorUsado)} de tu saldo a favor.` : ""}`,
    });
    confirmar(cerrar, { saldado: resta <= 0, origen: formulario.querySelector("[data-confirmar]") });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {/* Primero cuándo, después con qué: la fecha es una sola para todo
          el pago; los medios pueden ser varios y van como bloque propio. */}
      <div className="w-full sm:w-44">
        <CampoFecha etiqueta="Fecha del pago" valor={fecha} onValor={setFecha} required />
      </div>
      <div className="border-t border-tinta/10 pt-3">
        <p className="label-cayla mb-3 text-[11px] text-tinta/65">
          Medios de pago <span className="font-normal normal-case tracking-normal text-tinta/55">· uno o varios</span>
        </p>
        <LineasPago id="pago" lineas={lineas} onLineas={setLineas} objetivo={compra.saldo} exacto={false} autoFocus saldoFavor={saldoFavor} datosProveedor={datos} enlaceFicha={`/compras/proveedores/${compra.proveedorId}`} />
      </div>

      <div className="flex gap-3 pt-2">
        <button type="button" onClick={cerrar} className={botonCancelar} disabled={estado !== "reposo"}>
          Cancelar
        </button>
        <BotonConfirmar estado={estado} disabled={excede || favorExcedido} className="flex-1 px-3">
          {suma > 0 ? `Registrar pago de ${soles(suma)}` : "Registrar pago"}
        </BotonConfirmar>
      </div>
    </form>
  );
}

function AnularCompraModal({ compra, onClose }: { compra: CompraResumen; onClose: () => void }) {
  const router = useRouter();
  const [motivo, setMotivo] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!motivo.trim()) return void avisar.error("Escribe por qué se anula.", { enfocar: "anular-motivo" });
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("anular_compra", { p_compra_id: compra.id, p_motivo: motivo.trim() });
    setLoading(false);
    if (error) {
      avisar.error(traducirError(error, "anular el comprobante"));
      return;
    }
    avisar.exito(`Comprobante ${compra.documento} anulado`, { detalle: "Deja de contar en Por pagar y en Recibir." });
    router.refresh();
    onClose();
  }

  return (
    <Modal titulo="Anular comprobante" subtitulo={`${compra.documento} · ${compra.proveedorNombre}`} onClose={onClose}>
      {(cerrar) => (
        <form onSubmit={onSubmit} className="space-y-4">
          <p className="text-sm text-tinta/75">
            El comprobante queda como anulado y deja de contar en Por pagar y en Recibir. No se borra: el registro se conserva con el motivo.
          </p>
          <CampoTexto etiqueta="Motivo" id="anular-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Se registró por error, el proveedor la reemplazó…" autoFocus />
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={cerrar} className={botonCancelar} disabled={loading}>
              Volver
            </button>
            <button type="submit" className={botonPrimario} disabled={loading}>
              {loading ? "Anulando…" : "Anular"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
