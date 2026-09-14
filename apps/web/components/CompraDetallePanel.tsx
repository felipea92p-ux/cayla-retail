"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { Modal, botonCancelar, botonPrimario } from "@/components/ui/Modal";
import { Boton, CampoSelectNativo, CampoTexto } from "@/components/ui/campos";
import { ETIQUETA_METODO, soles, type CompraResumen } from "@/lib/compras-reglas";

// Acciones sobre una factura ya registrada (ADR-0035): registrar un pago
// contra el saldo, o anularla. La página (server) dibuja el detalle; este
// componente solo pone los botones y los dos modales. Las reglas —el pago
// no supera el saldo, no se anula con pagos o mercadería recibida— las
// aplica la base; acá solo se evita mostrar un botón que va a fallar.
const METODOS = Object.keys(ETIQUETA_METODO);

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
  const [monto, setMonto] = useState(compra.saldo.toFixed(2));
  const [metodo, setMetodo] = useState(METODOS[0]);
  const [referencia, setReferencia] = useState("");
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const n = Number(monto);
  const excede = n > compra.saldo + 0.005;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!(n > 0)) return setError("Escribe el monto del pago.");
    if (excede) return setError(`El pago supera el saldo pendiente (${soles(compra.saldo)}).`);
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.rpc("registrar_pago_compra", {
      p_compra_id: compra.id,
      p_monto: n,
      p_metodo: metodo,
      ...(referencia.trim() ? { p_referencia: referencia.trim() } : {}),
      p_fecha: fecha,
    });
    setLoading(false);
    if (error) {
      setError(traducirError(error, "registrar el pago"));
      return;
    }
    router.refresh();
    onClose();
  }

  return (
    <Modal titulo={`Pago a ${compra.proveedorNombre}`} subtitulo={`${compra.documento} · saldo ${soles(compra.saldo)}`} onClose={onClose}>
      {(cerrar) => (
        <form onSubmit={onSubmit} className="space-y-4">
          <CampoTexto
            etiqueta="Monto"
            mono
            type="number"
            min={0.01}
            step="0.01"
            max={compra.saldo}
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            tono={excede ? "error" : "neutro"}
            pie={excede ? "Supera el saldo." : n > 0 && n < compra.saldo ? `Quedarán ${soles(compra.saldo - n)} por pagar.` : n === compra.saldo ? "Salda la factura." : undefined}
            autoFocus
          />
          <CampoSelectNativo etiqueta="Medio de pago" value={metodo} onChange={(e) => setMetodo(e.target.value)}>
            {METODOS.map((m) => (
              <option key={m} value={m}>{ETIQUETA_METODO[m]}</option>
            ))}
          </CampoSelectNativo>
          <CampoTexto etiqueta="Referencia (opcional)" mono value={referencia} onChange={(e) => setReferencia(e.target.value)} placeholder="N° operación" autoComplete="off" />
          <CampoTexto etiqueta="Fecha del pago" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />

          {error && <p className="text-sm text-rojo">{error}</p>}

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
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!motivo.trim()) return setError("Escribe por qué se anula.");
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.rpc("anular_compra", { p_compra_id: compra.id, p_motivo: motivo.trim() });
    setLoading(false);
    if (error) {
      setError(traducirError(error, "anular la factura"));
      return;
    }
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
          <CampoTexto etiqueta="Motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Se registró por error, el proveedor la reemplazó…" autoFocus />
          {error && <p className="text-sm text-rojo">{error}</p>}
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
