"use client";

import { useState } from "react";
import { validarDocumento } from "@cayla-retail/shared";
import { createClient } from "@/lib/supabase/client";
import { ConsultaDocumento } from "@/components/ConsultaDocumento";
import { ETIQUETA_METODO } from "@/lib/compras-reglas";
import { Modal } from "@/components/ui/Modal";
import { Boton, CampoSelectNativo, CampoTexto } from "@/components/ui/campos";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";

// Alta y edición de un proveedor (extraído de ProveedoresPanel el 2026-09-18 para que la lista y la
// ficha abran el MISMO formulario: la ficha ganó el botón «Editar» y el formulario no se duplica).
//
// El RUC y la razón social son el mismo <ConsultaDocumento> que usa Vender/Facturación (una sola copia
// de la lógica del padrón, ver el comentario de cabecera de ese componente), en modo `boton`: SUNAT se
// consulta solo al apretar «Buscar», porque cada consulta se paga y quien registra puede preferir
// escribir el nombre a mano. Si el padrón no responde, el nombre se escribe a mano y se guarda igual
// (principio 9): un proveedor no se queda sin registrar por una API ajena.
//
// El rubro sigue siendo texto libre (ADR-0094) pero sugiere los ya usados (`rubros`): así «Tela»,
// «tela» y «Telas» no terminan siendo tres filtros distintos en la lista.

// Mismo vocabulario y orden que el selector de medio de pago en LineasPago.tsx (compra_pagos.metodo):
// un solo catálogo de formas de pago en toda la app.
const FORMAS_PAGO = Object.keys(ETIQUETA_METODO);

export type Borrador = {
  id: string | null;
  nombre: string;
  ruc: string;
  contacto: string;
  telefono: string;
  banco: string;
  cuentaBancaria: string;
  rubro: string;
  plazoCreditoDias: string;
  formaPagoPreferida: string;
};

export const BORRADOR_VACIO: Borrador = {
  id: null,
  nombre: "",
  ruc: "",
  contacto: "",
  telefono: "",
  banco: "",
  cuentaBancaria: "",
  rubro: "",
  plazoCreditoDias: "",
  formaPagoPreferida: "",
};

/** Del proveedor (de la lista o de la ficha) al formulario de edición. */
export function borradorDe(p: {
  id: string;
  nombre: string;
  ruc: string | null;
  contacto: string | null;
  telefono: string | null;
  banco: string | null;
  cuenta_bancaria: string | null;
  rubro: string | null;
  plazo_credito_dias: number | null;
  forma_pago_preferida: string | null;
}): Borrador {
  return {
    id: p.id,
    nombre: p.nombre,
    ruc: p.ruc ?? "",
    contacto: p.contacto ?? "",
    telefono: p.telefono ?? "",
    banco: p.banco ?? "",
    cuentaBancaria: p.cuenta_bancaria ?? "",
    rubro: p.rubro ?? "",
    plazoCreditoDias: p.plazo_credito_dias != null ? String(p.plazo_credito_dias) : "",
    formaPagoPreferida: p.forma_pago_preferida ?? "",
  };
}

export function ProveedorModal({
  inicial,
  rubros = [],
  onClose,
  onGuardado,
  onDesactivar,
}: {
  inicial: Borrador;
  /** Rubros ya usados, para sugerir al escribir. */
  rubros?: string[];
  onClose: () => void;
  onGuardado: () => void;
  /** Solo al editar: desactivar vive acá y no en la fila (ver ProveedoresPanel). */
  onDesactivar?: () => Promise<void>;
}) {
  const [nombre, setNombre] = useState(inicial.nombre);
  const [ruc, setRuc] = useState(inicial.ruc);
  const [contacto, setContacto] = useState(inicial.contacto);
  const [telefono, setTelefono] = useState(inicial.telefono);
  const [banco, setBanco] = useState(inicial.banco);
  const [cuentaBancaria, setCuentaBancaria] = useState(inicial.cuentaBancaria);
  const [rubro, setRubro] = useState(inicial.rubro);
  const [plazoCreditoDias, setPlazoCreditoDias] = useState(inicial.plazoCreditoDias);
  const [formaPagoPreferida, setFormaPagoPreferida] = useState(inicial.formaPagoPreferida);
  const [loading, setLoading] = useState(false);

  const editando = inicial.id !== null;
  const rucValido = ruc.length === 0 || validarDocumento("ruc", ruc).valido;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!nombre.trim()) return void avisar.error("El proveedor necesita un nombre.", { enfocar: "documento-nombre" });
    if (!rucValido) return void avisar.error("El RUC tiene que ser de 11 dígitos. Si no tiene, déjalo en blanco.", { enfocar: "documento-numero" });
    setLoading(true);
    const supabase = createClient();
    const args = {
      p_nombre: nombre.trim(),
      p_ruc: ruc || undefined,
      p_contacto: contacto.trim() || undefined,
      p_rubro: rubro.trim() || undefined,
      p_plazo_credito_dias: plazoCreditoDias ? Number(plazoCreditoDias) : undefined,
      p_forma_pago_preferida: formaPagoPreferida || undefined,
      p_telefono: telefono.trim() || undefined,
      p_banco: banco.trim() || undefined,
      p_cuenta_bancaria: cuentaBancaria.trim() || undefined,
    };
    const { error } = editando
      ? await supabase.rpc("actualizar_proveedor", {
          p_proveedor_id: inicial.id!,
          ...args,
        })
      : await supabase.rpc("registrar_proveedor", args);
    setLoading(false);
    if (error) {
      avisar.error(traducirError(error, editando ? "guardar el proveedor" : "registrar el proveedor"));
      return;
    }
    avisar.exito(editando ? `${nombre.trim()} actualizado` : `Proveedor ${nombre.trim()} registrado`);
    onGuardado();
  }

  return (
    <Modal titulo={editando ? "Editar proveedor" : "Registrar proveedor"} ancho="max-w-xl" onClose={onClose}>
      {(cerrar) => (
        <form onSubmit={onSubmit} className="mt-5 space-y-4">
          <ConsultaDocumento tipo="ruc" obligatorio={false} disparo="boton" numero={ruc} onNumero={setRuc} nombre={nombre} onNombre={setNombre} />

          {/* De acá para abajo, en pares — el modal es ancho para esto (max-w-xl): en escritorio dos campos
              por fila, en celular se apila igual que antes. */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <CampoTexto
              etiqueta={
                <>
                  Contacto <span className="normal-case tracking-normal">(opcional)</span>
                </>
              }
              autoComplete="off"
              placeholder="Nombre o correo de con quién se coordina"
              value={contacto}
              onChange={(e) => setContacto(e.target.value)}
            />
            <CampoTexto
              etiqueta={
                <>
                  Teléfono <span className="normal-case tracking-normal">(opcional)</span>
                </>
              }
              type="tel"
              autoComplete="off"
              placeholder="El WhatsApp por el que se pacta el fardo"
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
            />
            <CampoTexto
              etiqueta={
                <>
                  Banco <span className="normal-case tracking-normal">(opcional)</span>
                </>
              }
              autoComplete="off"
              placeholder="BCP, Interbank…"
              value={banco}
              onChange={(e) => setBanco(e.target.value)}
            />
            <CampoTexto
              etiqueta={
                <>
                  Cuenta bancaria <span className="normal-case tracking-normal">(opcional)</span>
                </>
              }
              autoComplete="off"
              placeholder="Número de cuenta o CCI"
              value={cuentaBancaria}
              onChange={(e) => setCuentaBancaria(e.target.value)}
            />
            <div>
              <CampoTexto
                etiqueta={
                  <>
                    Rubro <span className="normal-case tracking-normal">(opcional)</span>
                  </>
                }
                autoComplete="off"
                list="proveedor-rubros"
                placeholder="Tela, avíos, prenda terminada, servicios…"
                value={rubro}
                onChange={(e) => setRubro(e.target.value)}
              />
              <datalist id="proveedor-rubros">
                {rubros.map((r) => (
                  <option key={r} value={r} />
                ))}
              </datalist>
            </div>
            <CampoTexto
              etiqueta={
                <>
                  Plazo de crédito <span className="normal-case tracking-normal">(opcional, en días)</span>
                </>
              }
              type="number"
              min={1}
              step={1}
              autoComplete="off"
              placeholder="30"
              value={plazoCreditoDias}
              onChange={(e) => setPlazoCreditoDias(e.target.value)}
            />
            <CampoSelectNativo
              etiqueta={
                <>
                  Forma de pago preferida <span className="normal-case tracking-normal">(opcional)</span>
                </>
              }
              value={formaPagoPreferida}
              onChange={(e) => setFormaPagoPreferida(e.target.value)}
            >
              <option value="">Sin definir</option>
              {FORMAS_PAGO.map((m) => (
                <option key={m} value={m}>
                  {ETIQUETA_METODO[m]}
                </option>
              ))}
            </CampoSelectNativo>
          </div>

          <div className="flex gap-2 pt-3">
            <Boton type="button" peso="fantasma" className="flex-1" onClick={cerrar}>
              Cancelar
            </Boton>
            <Boton type="submit" peso="primario" className="flex-1" cargando={loading} disabled={!nombre.trim() || !rucValido}>
              {loading ? "Guardando…" : editando ? "Guardar" : "Registrar"}
            </Boton>
          </div>
          {onDesactivar && (
            <p className="border-t border-tinta/10 pt-3 text-xs text-tinta/55">
              ¿Ya no se le compra?{" "}
              <button type="button" onClick={onDesactivar} disabled={loading} className="text-rojo hover:underline">
                Desactivar proveedor
              </button>
              . Deja de aparecer al registrar comprobantes; su historial se conserva.
            </p>
          )}
        </form>
      )}
    </Modal>
  );
}
