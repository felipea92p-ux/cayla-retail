"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Aviso } from "@/components/ui/Aviso";
import { avisar } from "@/components/ui/Avisos";
import { Boton, CampoSelect, CampoTexto } from "@/components/ui/campos";
import { enterNoGuarda } from "@/components/ui/enterNoGuarda";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import type { ControlResponsable } from "@/lib/useResponsable";
import type { DetalleEnvio } from "@/lib/recepcion-envio-reglas";
import { mensajeAlGuardar } from "@/lib/recepcion-conteo-reglas";
import { corregirProveedorEnvio } from "@/lib/recepcion-conteo-acciones";

// Corregir de quién llegó un envío sin aviso (ADR-0393, act. 2026-11-03): a veces se elige a ciegas para poder cerrar. Cambia el envío, sus lotes y lo recibido, nunca el stock ni el costo.
// Queda en la Actividad con el proveedor de antes, el nuevo y el motivo. Solo quien ve el dinero de Compras.

export function CorregirProveedor({
  detalle,
  actual,
  proveedores,
  responsable,
  onCorregido,
  onCerrar,
}: {
  detalle: DetalleEnvio;
  actual: { id: string; nombre: string };
  proveedores: readonly { id: string; nombre: string }[];
  responsable: ControlResponsable;
  onCorregido: () => void;
  onCerrar: () => void;
}) {
  const [proveedorId, setProveedorId] = useState("");
  const [motivo, setMotivo] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const guia = useGuiaCampos([
    { id: "corregir-proveedor", nombre: "De quién llegó", requerido: true, hecho: proveedorId !== "", pendiente: "Elige de quién llegó de verdad." },
    { id: "corregir-motivo", nombre: "Por qué", requerido: true, hecho: motivo.trim().length >= 3, pendiente: "Escribe por qué se corrige." },
    { id: "corregir-quien", nombre: "Quién lo corrige", requerido: true, hecho: responsable.listo, pendiente: "Elige quién lo corrige." },
  ]);

  async function corregir() {
    if (!guia.puedeConfirmar || guardando) return;
    setGuardando(true);
    setError(null);
    const { error: e } = await corregirProveedorEnvio({ p_despacho_id: detalle.id, p_proveedor_id: proveedorId, p_motivo: motivo.trim() }, responsable.firma());
    responsable.despues(e);
    setGuardando(false);
    if (e) {
      setError(mensajeAlGuardar(e, "corregir el proveedor"));
      return;
    }
    avisar.exito("Proveedor corregido", { detalle: `${detalle.numero} ya no es de ${actual.nombre}.` });
    onCorregido();
  }

  return (
    <Modal titulo="Corregir el proveedor" subtitulo={`${detalle.numero} está a nombre de ${actual.nombre}. El stock y el costo no cambian.`} tamano="mediana" bloqueado={guardando} onClose={onCerrar}>
      {(cerrar) => (
        <form
          noValidate
          onKeyDown={enterNoGuarda}
          onSubmit={(e) => {
            e.preventDefault();
            void corregir();
          }}
          className="space-y-4"
        >
          <CampoGuiado id="corregir-proveedor" guia={guia}>
            <CampoSelect
              etiqueta={guia.etiqueta("corregir-proveedor", "¿De quién llegó?")}
              valor={proveedorId}
              onValor={setProveedorId}
              opciones={proveedores.filter((p) => p.id !== actual.id).map((p) => ({ valor: p.id, texto: p.nombre }))}
              marcador="Elige el proveedor"
            />
          </CampoGuiado>
          <CampoGuiado id="corregir-motivo" guia={guia}>
            <CampoTexto
              etiqueta={guia.etiqueta("corregir-motivo", "¿Por qué se corrige?")}
              value={motivo}
              maxLength={300}
              onChange={(e) => setMotivo(e.target.value)}
              // sugerir-fijo: el motivo de corregir no depende de nada elegido antes
              placeholder="Ej. Compras confirmó que era de otro"
            />
          </CampoGuiado>
          <CampoGuiado id="corregir-quien" guia={guia}>
            <p className="mb-1.5 text-sm font-semibold text-tinta">{guia.etiqueta("corregir-quien", "Quién lo corrige")}</p>
            <ComboResponsable control={responsable} compacto />
          </CampoGuiado>
          {error && (
            <Aviso tono="error" titulo="No se pudo corregir">
              {error}
            </Aviso>
          )}
          <PieGuia guia={guia} listo="Todo listo para corregir." />
          <div className="pie-acciones">
            <Boton type="button" peso="fantasma" onClick={cerrar} disabled={guardando}>
              Cancelar
            </Boton>
            <Boton type="submit" peso="primario" cargando={guardando} textoCargando="Corrigiendo…" confirma={guia} title={guia.frase ?? undefined} className={guia.claseConfirmar}>
              Corregir el proveedor
            </Boton>
          </div>
        </form>
      )}
    </Modal>
  );
}
