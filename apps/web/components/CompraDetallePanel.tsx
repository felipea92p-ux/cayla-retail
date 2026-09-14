"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { Modal, botonCancelar, botonPrimario } from "@/components/ui/Modal";
import { Boton, CampoTexto } from "@/components/ui/campos";
import { CampoFecha } from "@/components/ui/CampoFecha";
import { LineasPago, lineaPagoVacia, lineasPagoParaRpc, sumaLineasPago, type LineaPago } from "@/components/LineasPago";
import { soles, type CompraResumen } from "@/lib/compras-reglas";

// Acciones sobre una factura ya registrada (ADR-0035): registrar un pago
// contra el saldo, o anularla. La página (server) dibuja el detalle; este
// componente solo pone los botones y los dos modales. Las reglas —el pago
// no supera el saldo, no se anula con pagos o mercadería recibida— las
// aplica la base; acá solo se evita mostrar un botón que va a fallar.
export function CompraAcciones({ compra, tieneRecepciones }: { compra: CompraResumen; tieneRecepciones: boolean }) {
  const [modal, setModal] = useState<"pago" | "anular" | null>(null);
  const puedePagar = compra.estado === "vigente" && compra.saldo > 0;
  const puedeAnular = compra.estado === "vigente" && compra.pagado === 0 && !tieneRecepciones;

  if (!puedePagar && !puedeAnular) return null;

  return (
    <>
      <div className="flex flex-wrap gap-3">
        {puedePagar && (
          <Boton peso="primario" onClick={() => setModal("pago")}>
            Registrar pago · saldo {soles(compra.saldo)}
          </Boton>
        )}
        {puedeAnular && (
          <Boton peso="discreto" onClick={() => setModal("anular")}>
            Anular factura
          </Boton>
        )}
      </div>
      {modal === "pago" && <RegistrarPagoModal compra={compra} onClose={() => setModal(null)} />}
      {modal === "anular" && <AnularCompraModal compra={compra} onClose={() => setModal(null)} />}
    </>
  );
}

// Desde "Por pagar" se paga sin entrar al detalle: el botón de la fila abre
// EL MISMO modal (un pago sigue siendo contra una sola factura — solo se
// ahorra el clic de ir a verla). `compacto` es la versión que cabe en una
// celda de tabla.
export function BotonPagar({ compra, compacto = false }: { compra: CompraResumen; compacto?: boolean }) {
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
      {abierto && <RegistrarPagoModal compra={compra} onClose={() => setAbierto(false)} />}
    </>
  );
}

export function RegistrarPagoModal({ compra, onClose }: { compra: CompraResumen; onClose: () => void }) {
  const router = useRouter();
  // Un pago puede repartirse en varios medios (20260914200000_compras_multipago):
  // la RPC escribe todas las líneas o ninguna.
  const [lineas, setLineas] = useState<LineaPago[]>([lineaPagoVacia(compra.saldo.toFixed(2))]);
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);

  const suma = sumaLineasPago(lineas);
  const excede = suma > compra.saldo + 0.005;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const pagos = lineasPagoParaRpc(lineas);
    const sinMonto = Math.max(0, lineas.findIndex((l) => !(Number(l.monto) > 0)));
    if (!pagos) return void avisar.error("Cada medio de pago necesita su monto.", { enfocar: `pago-monto-${sinMonto}` });
    if (excede) return void avisar.error(`El pago supera el saldo pendiente (${soles(compra.saldo)}).`, { enfocar: "pago-monto-0" });
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
      detalle: resta > 0 ? `Quedan ${soles(resta)} por pagar.` : "Factura saldada.",
    });
    router.refresh();
    onClose();
  }

  return (
    <Modal titulo={`Pago a ${compra.proveedorNombre}`} subtitulo={`${compra.documento} · saldo ${soles(compra.saldo)}`} onClose={onClose}>
      {(cerrar) => (
        <form onSubmit={onSubmit} className="space-y-4">
          <LineasPago id="pago" lineas={lineas} onLineas={setLineas} objetivo={compra.saldo} exacto={false} autoFocus />
          <CampoFecha etiqueta="Fecha del pago" valor={fecha} onValor={setFecha} required />

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={cerrar} className={botonCancelar} disabled={loading}>
              Cancelar
            </button>
            <button type="submit" className={botonPrimario} disabled={loading || excede}>
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
      avisar.error(traducirError(error, "anular la factura"));
      return;
    }
    avisar.exito(`Factura ${compra.documento} anulada`, { detalle: "Deja de contar en Por pagar y en Recibir." });
    router.refresh();
    onClose();
  }

  return (
    <Modal titulo="Anular factura" subtitulo={`${compra.documento} · ${compra.proveedorNombre}`} onClose={onClose}>
      {(cerrar) => (
        <form onSubmit={onSubmit} className="space-y-4">
          <p className="text-sm text-tinta/75">
            La factura queda como anulada y deja de contar en Por pagar y en Recibir. No se borra: el registro se conserva con el motivo.
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
