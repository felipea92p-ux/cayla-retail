"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { CampoTexto, Boton } from "@/components/ui/campos";
import { ComboResponsable } from "@/components/ComboResponsable";
import { ConsultaDocumento } from "@/components/ConsultaDocumento";
import { CampoNumeroDocumento, CampoTipoDocumento, ID_NUMERO_DOCUMENTO } from "@/components/CampoDocumentoClienta";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { useResponsable } from "@/lib/useResponsable";
import { avisar } from "@/components/ui/Avisos";
import { traducirError } from "@/lib/error-escritura";
import { registrarClienta, type DatosAlta } from "@/lib/clientas-acciones";
import { camposDeRegistrar, nombreSuficiente } from "@/lib/club-caja-reglas";
import { sePuedeConfirmar } from "@/lib/guia-campos";
import type { Clienta } from "@/lib/clientas-reglas";
import { ajustarNumeroAlTipo, documentoLegible, normalizarNumeroDocumento, problemaDocumento } from "@/lib/documento-clienta-reglas";

const ALTA_VACIA: DatosAlta = {
  documentoTipo: "dni",
  documentoNumero: "",
  nombre: "",
  telefonoWhatsapp: "",
  cumpleDia: "",
  cumpleMes: "",
  cumpleAnio: "",
};

const ID_NOMBRE = "nueva-clienta-nombre";

/** Alta de clienta (D-76/D-77), en `<Modal variante="hoja">` — antes vivía embebida en el cuerpo
 *  de `/clientas`; se separó al paso 2 del acta cuando la pantalla ganó lista, ficha y edición.
 *
 *  ADR-0288 tanda 1g (G-2): se registra SOLO con el documento, igual que en Cobrar —con DNI el nombre llega del padrón; con
 *  carné o pasaporte, se escribe— y quién registra. Ya no pide celular ni cumpleaños, ni une al club: ella se une sola
 *  escaneando el cartel, y ahí escribe su celular y su fecha de nacimiento (G-3). «Editar» de su ficha sigue corrigiéndolos.
 *  La guía y el botón miran la MISMA regla que Cobrar: `camposDeRegistrar` (lib/club-caja-reglas.ts, con pruebas). */
export function NuevaClientaModal({ onClose, onCreada }: { onClose: () => void; onCreada: (clienta: Clienta) => void }) {
  const [alta, setAlta] = useState<DatosAlta>(ALTA_VACIA);
  const [guardando, setGuardando] = useState(false);
  const responsable = useResponsable();

  const esDni = alta.documentoTipo === "dni";
  const campos = camposDeRegistrar({
    documentoTipo: alta.documentoTipo,
    documentoNumero: alta.documentoNumero,
    nombre: alta.nombre,
    responsableListo: responsable.listo,
    responsableMotivo: responsable.motivo,
  });
  const guia = useGuiaCampos(campos);

  async function onRegistrar(e: React.FormEvent) {
    e.preventDefault();
    if (!sePuedeConfirmar(campos)) {
      const problema = problemaDocumento(alta.documentoTipo, alta.documentoNumero);
      if (normalizarNumeroDocumento(alta.documentoNumero) === "" || problema) {
        avisar.error(problema ?? "Elige el tipo de documento y escribe el número.", { enfocar: ID_NUMERO_DOCUMENTO });
      } else if (!nombreSuficiente(alta.nombre)) {
        avisar.error("Escribe su nombre.", { enfocar: esDni ? "documento-nombre" : ID_NOMBRE });
      } else if (responsable.motivo) {
        avisar.error(responsable.motivo);
      }
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
    const numero = normalizarNumeroDocumento(alta.documentoNumero) || null;
    const quien = alta.nombre.trim() || documentoLegible(alta.documentoTipo, numero, false) || "sin nombre";
    avisar.exito("Clienta registrada", { detalle: `${quien}. Para ser del club, que escanee el cartel.` });
    onCreada({
      id,
      documentoTipo: alta.documentoTipo,
      documentoNumero: numero,
      nombre: alta.nombre.trim() || null,
      telefonoWhatsapp: null,
      tienePermisoWhatsapp: false,
      clubDesde: null,
      publicidadDesde: null,
      codigoClub: null,
      cumpleAnio: null,
      cumpleDia: null,
      cumpleMes: null,
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
    <Modal titulo="Registrar clienta" subtitulo="Solo su documento: vino, preguntó, se probó. Para ser del club, se une ella escaneando el cartel." onClose={onClose} variante="hoja">
      {(cerrar) => (
        <form onSubmit={onRegistrar} className="space-y-6">
          <CampoGuiado id="documento" guia={guia} titulo="Documento" ayuda="DNI por defecto">
            <div className="grid grid-cols-[11rem_1fr] items-start gap-3 max-sm:grid-cols-1">
              <CampoTipoDocumento
                tipo={alta.documentoTipo}
                onTipo={(t) => setAlta((a) => ({ ...a, documentoTipo: t, documentoNumero: ajustarNumeroAlTipo(t, a.documentoNumero) }))}
              />
              {esDni ? (
                // Solo el DNI se consulta al padrón (RENIEC, ADR-0008), como en Cobrar: con los 8 dígitos trae el nombre solo. Si
                // el padrón no responde, el nombre se escribe a mano aquí mismo y el alta sigue igual (principio 9).
                <ConsultaDocumento
                  tipo="dni"
                  obligatorio
                  numero={alta.documentoNumero}
                  onNumero={(v) => setAlta((a) => ({ ...a, documentoNumero: v }))}
                  nombre={alta.nombre}
                  onNombre={(v) => setAlta((a) => ({ ...a, nombre: v }))}
                />
              ) : (
                <CampoNumeroDocumento tipo={alta.documentoTipo} numero={alta.documentoNumero} onNumero={(v) => setAlta((a) => ({ ...a, documentoNumero: v }))} />
              )}
            </div>
            {!esDni && <p className="mt-1 text-xs text-tinta/60">Solo el DNI se autocompleta con el padrón; carné y pasaporte llevan el nombre a mano.</p>}
          </CampoGuiado>
          {!esDni && (
            <CampoGuiado id="nombre" guia={guia} titulo="Nombre">
              <CampoTexto id={ID_NOMBRE} etiqueta="Nombre completo" caja value={alta.nombre} onChange={(e) => setAlta((a) => ({ ...a, nombre: e.target.value }))} />
            </CampoGuiado>
          )}
          <CampoGuiado id="responsable" guia={guia}>
            <ComboResponsable control={responsable} deshabilitado={guardando} />
          </CampoGuiado>
          <PieGuia guia={guia} listo="Todo listo para registrar." />
          <div className="flex justify-end gap-3 pt-2">
            <Boton type="button" onClick={cerrar}>
              Cancelar
            </Boton>
            <Boton
              type="submit"
              peso="primario"
              cargando={guardando}
              disabled={!guia.puedeConfirmar}
              title={responsable.motivo ?? guia.frase ?? undefined}
              className={guia.claseConfirmar}
            >
              Registrar
            </Boton>
          </div>
        </form>
      )}
    </Modal>
  );
}
