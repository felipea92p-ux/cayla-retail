"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { CampoTexto, Boton, Interruptor } from "@/components/ui/campos";
import { ComboResponsable } from "@/components/ComboResponsable";
import { useResponsable } from "@/lib/useResponsable";
import { avisar } from "@/components/ui/Avisos";
import { traducirError } from "@/lib/error-escritura";
import { registrarClienta, type DatosAlta } from "@/lib/clientas-acciones";
import type { Clienta } from "@/lib/clientas-reglas";

const ALTA_VACIA: DatosAlta = { dni: "", nombre: "", telefonoWhatsapp: "", aceptaWhatsapp: false, cumpleDia: "", cumpleMes: "" };

/** Alta de clienta (D-76/D-77), en `<Modal variante="hoja">` — antes vivía embebida en el cuerpo
 *  de `/clientas`; se separó al paso 2 del acta cuando la pantalla ganó lista, ficha y edición. */
export function NuevaClientaModal({ onClose, onCreada }: { onClose: () => void; onCreada: (clienta: Clienta) => void }) {
  const [alta, setAlta] = useState<DatosAlta>(ALTA_VACIA);
  const [guardando, setGuardando] = useState(false);
  const responsable = useResponsable();

  async function onRegistrar(e: React.FormEvent) {
    e.preventDefault();
    if (alta.dni.trim() === "" && alta.nombre.trim() === "" && alta.telefonoWhatsapp.trim() === "") {
      avisar.error("Escribe al menos un dato — DNI, nombre o WhatsApp — antes de registrar.");
      return;
    }
    if (!responsable.listo) {
      if (responsable.motivo) avisar.error(responsable.motivo);
      return;
    }
    setGuardando(true);
    const { id, error } = await registrarClienta(alta, responsable.firma());
    setGuardando(false);
    responsable.despues(error);
    if (error || !id) {
      avisar.error(traducirError(error, "registrar la clienta"));
      return;
    }
    avisar.exito("Clienta registrada", { detalle: alta.nombre.trim() || alta.dni.trim() || "sin nombre" });
    onCreada({
      id,
      dni: alta.dni.trim() || null,
      nombre: alta.nombre.trim() || null,
      telefonoWhatsapp: alta.telefonoWhatsapp.trim() || null,
      tienePermisoWhatsapp: alta.aceptaWhatsapp,
      cumpleDia: alta.cumpleDia.trim() === "" ? null : Number(alta.cumpleDia),
      cumpleMes: alta.cumpleMes.trim() === "" ? null : Number(alta.cumpleMes),
      tallas: null,
      createdAt: new Date().toISOString(),
      version: 1,
      archivadaEn: null,
      motivoArchivo: null,
      anonimizada: false,
      fusionadaEnId: null,
    });
  }

  return (
    <Modal titulo="Registrar clienta" subtitulo="Identificación mínima y no invasiva: DNI o celular alcanzan." onClose={onClose} variante="hoja">
      {(cerrar) => (
        <form onSubmit={onRegistrar} className="space-y-4">
          <CampoTexto etiqueta="DNI (opcional)" value={alta.dni} onChange={(e) => setAlta((a) => ({ ...a, dni: e.target.value }))} mono inputMode="numeric" />
          <CampoTexto etiqueta="Nombre" value={alta.nombre} onChange={(e) => setAlta((a) => ({ ...a, nombre: e.target.value }))} />
          <CampoTexto
            etiqueta="WhatsApp"
            value={alta.telefonoWhatsapp}
            onChange={(e) => setAlta((a) => ({ ...a, telefonoWhatsapp: e.target.value }))}
            mono
            inputMode="tel"
          />
          <Interruptor
            activo={alta.aceptaWhatsapp}
            onActivo={(v) => setAlta((a) => ({ ...a, aceptaWhatsapp: v }))}
            etiqueta="Acepta que la contactemos por WhatsApp"
            pie="Permiso APARTE de dejar el número — nunca se asume (Ley 29733)."
          />
          <div className="grid grid-cols-2 gap-3">
            <CampoTexto
              etiqueta="Día de cumpleaños"
              value={alta.cumpleDia}
              onChange={(e) => setAlta((a) => ({ ...a, cumpleDia: e.target.value }))}
              mono
              inputMode="numeric"
              placeholder="1-31"
            />
            <CampoTexto
              etiqueta="Mes de cumpleaños"
              value={alta.cumpleMes}
              onChange={(e) => setAlta((a) => ({ ...a, cumpleMes: e.target.value }))}
              mono
              inputMode="numeric"
              placeholder="1-12"
            />
          </div>
          <ComboResponsable control={responsable} deshabilitado={guardando} />
          <div className="flex justify-end gap-3 pt-2">
            <Boton type="button" onClick={cerrar}>
              Cancelar
            </Boton>
            <Boton type="submit" peso="primario" cargando={guardando} disabled={!responsable.listo} title={responsable.motivo ?? undefined}>
              Registrar
            </Boton>
          </div>
        </form>
      )}
    </Modal>
  );
}
