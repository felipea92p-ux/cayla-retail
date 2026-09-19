"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { Modal, botonCancelar, botonPrimario } from "@/components/ui/Modal";
import { Boton, CampoTexto } from "@/components/ui/campos";
import { CampoFecha } from "@/components/ui/CampoFecha";
import { LineasPago, lineaPagoVacia, lineasPagoParaRpc, sumaLineasPago, type LineaPago } from "@/components/LineasPago";
import { METODO_SALDO_A_FAVOR, soles, type CompraResumen } from "@/lib/compras-reglas";
import { hoyLima } from "@/lib/fechas-lima";

// Acciones sobre una factura ya registrada (ADR-0035): registrar un pago
// contra el saldo, o anularla. La página (server) dibuja el detalle; este
// componente solo pone los botones. Las reglas —el pago no supera el saldo,
// no se anula con pagos o mercadería recibida— las aplica la base; acá solo
// se evita mostrar un botón que va a fallar.
//
// "Registrar pago" NO abre el modal acá: lleva a Por pagar con `?pagar=<id>`
// y el modal se abre allá (`PagoDesdeUrl`). Pagar es una tarea de la
// pantalla de deudas —al terminar se quiere ver qué más se debe, no volver
// al detalle— y así el modal de pago tiene UN solo dueño en vez de abrirse
// encima del modal del detalle.
export function CompraAcciones({ compra, tieneRecepciones }: { compra: CompraResumen; tieneRecepciones: boolean }) {
  const router = useRouter();
  const [anulando, setAnulando] = useState(false);
  const puedeRecibir = compra.estado === "vigente" && compra.estadoRecepcion !== "recibida";
  const puedePagar = compra.estado === "vigente" && compra.saldo > 0;
  const puedeAnular = compra.estado === "vigente" && compra.pagado === 0 && !tieneRecepciones;

  if (!puedeRecibir && !puedePagar && !puedeAnular) return null;

  return (
    <>
      <div className="flex flex-wrap gap-3">
        {/* Atajo al pie, junto a Pagar/Anular — antes solo vivía como enlace
            de texto dentro de la sección "Recepciones", más abajo en la
            página: para una factura recién abierta (todo por recibir), esa
            era la acción más probable y quedaba fuera de la vista. */}
        {puedeRecibir && (
          <Boton peso="fantasma" onClick={() => router.push(`/compras/recibir?compra=${compra.id}`)}>
            Recibir mercadería
          </Boton>
        )}
        {puedePagar && (
          <Boton peso="primario" onClick={() => router.push(`/compras/por-pagar?pagar=${compra.id}`)}>
            Registrar pago · saldo {soles(compra.saldo)}
          </Boton>
        )}
        {puedeAnular && (
          <Boton peso="discreto" onClick={() => setAnulando(true)}>
            Anular comprobante
          </Boton>
        )}
      </div>
      {anulando && <AnularCompraModal compra={compra} onClose={() => setAnulando(false)} />}
    </>
  );
}

// Abre el modal de pago al llegar a Por pagar con `?pagar=<id>` (ver arriba).
// La página ya verificó que la factura existe, está vigente y tiene saldo.
// Al cerrar se quita solo `pagar` de la URL (con `replace`, para que "atrás"
// no vuelva a abrirlo) y se conservan los filtros que hubiera.
export function PagoDesdeUrl({ compra, saldoFavor = 0 }: { compra: CompraResumen; saldoFavor?: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  function cerrar() {
    const p = new URLSearchParams(params.toString());
    p.delete("pagar");
    router.replace(p.size ? `${pathname}?${p}` : pathname);
  }
  return <RegistrarPagoModal compra={compra} saldoFavor={saldoFavor} onClose={cerrar} />;
}

// Desde "Por pagar" se paga sin entrar al detalle: el botón de la fila abre
// EL MISMO modal (un pago sigue siendo contra una sola factura — solo se
// ahorra el clic de ir a verla). `compacto` es la versión que cabe en una
// celda de tabla: peso "fantasma" (borde y texto a tinta plena), no
// "discreto" — es la única acción de esa pantalla y no puede ser lo que
// menos se ve.
export function BotonPagar({ compra, compacto = false, saldoFavor = 0 }: { compra: CompraResumen; compacto?: boolean; saldoFavor?: number }) {
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
      {abierto && <RegistrarPagoModal compra={compra} saldoFavor={saldoFavor} onClose={() => setAbierto(false)} />}
    </>
  );
}

export function RegistrarPagoModal({ compra, saldoFavor = 0, onClose }: { compra: CompraResumen; saldoFavor?: number; onClose: () => void }) {
  const router = useRouter();
  // Un pago puede repartirse en varios medios (20260914200000_compras_multipago):
  // la RPC escribe todas las líneas o ninguna.
  const [lineas, setLineas] = useState<LineaPago[]>([lineaPagoVacia(compra.saldo.toFixed(2))]);
  const [fecha, setFecha] = useState(hoyLima());
  const [loading, setLoading] = useState(false);

  const suma = sumaLineasPago(lineas);
  const excede = suma > compra.saldo + 0.005;
  const favorUsado = sumaLineasPago(lineas.filter((l) => l.metodo === METODO_SALDO_A_FAVOR));
  const favorExcedido = favorUsado > saldoFavor + 0.005;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    const pagos = lineasPagoParaRpc(lineas);
    const sinMonto = Math.max(0, lineas.findIndex((l) => !(Number(l.monto) > 0)));
    if (!pagos) return void avisar.error("Cada medio de pago necesita su monto.", { enfocar: `pago-monto-${sinMonto}` });
    if (excede) return void avisar.error(`El pago supera el saldo pendiente (${soles(compra.saldo)}).`, { enfocar: "pago-monto-0" });
    if (favorExcedido) return void avisar.error(`Usas ${soles(favorUsado)} de saldo a favor y solo tienes ${soles(saldoFavor)}.`, { enfocar: "pago-monto-0" });
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("registrar_pagos_compra", {
      p_compra_id: compra.id,
      p_pagos: pagos,
      p_fecha: fecha,
    });
    setLoading(false);
    if (error) {
      avisar.error(traducirError(error, "registrar el pago"));
      return;
    }
    const resta = Math.round((compra.saldo - suma) * 100) / 100;
    avisar.exito(`Pago de ${soles(suma)} registrado · ${compra.documento}`, {
      detalle: `${resta > 0 ? `Quedan ${soles(resta)} por pagar.` : "Comprobante saldado."}${favorUsado > 0 ? ` Se descontaron ${soles(favorUsado)} de tu saldo a favor.` : ""}`,
    });
    router.refresh();
    onClose();
  }

  return (
    // `max-w-lg`: la fila monto · medio · referencia necesita más que el ancho
    // estándar de modal corto; con `max-w-sm` el rótulo "Medio de pago" se
    // partía y el select y la referencia salían cortados.
    <Modal titulo={`Pago a ${compra.proveedorNombre}`} subtitulo={`${compra.documento} · saldo ${soles(compra.saldo)}`} onClose={onClose} ancho="max-w-lg">
      {(cerrar) => (
        <form onSubmit={onSubmit} className="space-y-4">
          {/* Primero cuándo, después con qué: la fecha es una sola para todo
              el pago; los medios pueden ser varios y van como bloque propio. */}
          <div className="w-full sm:w-44">
            <CampoFecha etiqueta="Fecha del pago" valor={fecha} onValor={setFecha} required />
          </div>
          <div className="space-y-3 border-t border-tinta/10 pt-3">
            <p className="label-cayla text-[11px] text-tinta/65">
              Medios de pago <span className="font-normal normal-case tracking-normal text-tinta/55">· uno o varios</span>
            </p>
            <LineasPago id="pago" lineas={lineas} onLineas={setLineas} objetivo={compra.saldo} exacto={false} autoFocus saldoFavor={saldoFavor} />
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={cerrar} className={botonCancelar} disabled={loading}>
              Cancelar
            </button>
            <button type="submit" className={botonPrimario} disabled={loading || excede || favorExcedido}>
              {loading ? "Registrando…" : "Registrar pago"}
            </button>
          </div>
        </form>
      )}
    </Modal>
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
