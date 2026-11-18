"use client";

import { useRef, useState } from "react";
import { soloDigitos } from "@cayla-retail/shared";
import { Modal } from "@/components/ui/Modal";
import { Aviso } from "@/components/ui/Aviso";
import { Boton, CampoTexto } from "@/components/ui/campos";
import { PreguntaParecido } from "@/components/ui/PreguntaParecido";
import { avisar } from "@/components/ui/Avisos";
import { enterNoGuarda } from "@/components/ui/enterNoGuarda";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { registrarProveedorDeRecepcion } from "@/lib/recepcion-altas-acciones";
import { borradorDeLoBuscado, proveedorConRuc, proveedoresParecidos } from "@/lib/proveedores-reglas";
import type { ControlResponsable } from "@/lib/useResponsable";
import {
  argsProveedorRecepcion,
  avisoProveedorRecepcion,
  camposProveedorRecepcion,
  mensajeAltaRecepcion,
  TOPE_RAZON_SOCIAL,
} from "@/lib/recepcion-altas-reglas";

// «Proveedor nuevo» desde Recibir (ADR-0635, Felipe 2026-11-09): llegó mercadería de un proveedor que nunca se registró y quien recibe lo crea
// ahí mismo, con su razón social y su RUC si lo tiene, sin el módulo Proveedores. Lo demás (contacto, banco, plazo) lo completa después quien
// administra proveedores; Felipe pidió no decirlo en la hoja. Antes de registrar pregunta «¿no será uno que ya tienes?» (no existe fusionar
// proveedores, y un duplicado parte Por pagar en dos fichas). Lo que se guarda lo decide `registrar_proveedor_de_recepcion`, que no duplica si se
// aprieta dos veces: devuelve el que ya estaba, y la hoja lo dice.
//
// ASUME: quien la abre la dibuja FUERA de su <form> (un submit que sube desde un portal llegaría al «Guardar» de su pantalla, ADR-0128).

export type ProveedorDeLaLista = { id: string; nombre: string; ruc?: string | null };

export function ProveedorNuevoRecepcion({
  proveedores,
  tipeado,
  responsable,
  onRegistrado,
  onCerrar,
}: {
  /** El directorio (para preguntar «¿no será…?» y no repetir un RUC). */
  proveedores: readonly ProveedorDeLaLista[];
  /** Lo escrito en el combo: abre con la razón social (o el RUC, si eran 11 dígitos) ya puesto. */
  tipeado: string;
  responsable: ControlResponsable;
  /** El proveedor nuevo, o el que ya estaba: quien la abre lo suma a su lista y lo elige. */
  onRegistrado: (proveedor: { id: string; nombre: string; ruc: string | null }) => void;
  onCerrar: () => void;
}) {
  const [b, setB] = useState(() => borradorDeLoBuscado(tipeado));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Los parecidos que ya se contestaron con «No, es otro»: no se vuelve a preguntar por ellos.
  const [descartados, setDescartados] = useState<ReadonlySet<string>>(new Set());
  // Dos clics en el mismo instante: la ref se pone en el mismo tick.
  const enVuelo = useRef(false);

  const lista = proveedores.map((p) => ({ id: p.id, nombre: p.nombre, ruc: p.ruc ?? null }));
  const repetido = proveedorConRuc(soloDigitos(b.ruc), lista, null);
  const pregunta = repetido ? { igual: null, parecidos: [] } : proveedoresParecidos({ nombre: b.nombre, ruc: b.ruc }, lista);
  const porResponder = pregunta.parecidos.filter(({ proveedor }) => !descartados.has(proveedor.id));
  const preguntaPendiente = Boolean(pregunta.igual) || porResponder.length > 0;
  const guia = useGuiaCampos(camposProveedorRecepcion(b, { rucYaRegistrado: Boolean(repetido), preguntaPendiente }));

  /** Elegir uno que ya estaba: no hace falta llamar a la base. */
  function usar(p: { id: string; nombre: string; ruc: string | null }) {
    const aviso = avisoProveedorRecepcion({ ...p, yaExistia: true }, b);
    avisar.exito(aviso.titulo, { detalle: aviso.detalle });
    onRegistrado(p);
  }

  async function registrar() {
    if (!guia.puedeConfirmar || guardando || enVuelo.current) return;
    enVuelo.current = true;
    setGuardando(true);
    setError(null);
    try {
      const { proveedor, error: falla } = await registrarProveedorDeRecepcion(argsProveedorRecepcion(b), responsable.firma());
      responsable.despues(falla);
      if (falla || !proveedor) {
        setError(mensajeAltaRecepcion(falla, "el proveedor"));
        return;
      }
      const aviso = avisoProveedorRecepcion(proveedor, b);
      avisar.exito(aviso.titulo, { detalle: aviso.detalle });
      onRegistrado({ id: proveedor.id, nombre: proveedor.nombre, ruc: proveedor.ruc });
    } finally {
      enVuelo.current = false;
      setGuardando(false);
    }
  }

  return (
    <Modal titulo="Proveedor nuevo" subtitulo="Con esto alcanza para seguir." tamano="angosta" bloqueado={guardando} onClose={onCerrar}>
      {(cerrar) => (
        <form
          noValidate
          onKeyDown={enterNoGuarda}
          onSubmit={(e) => {
            e.preventDefault();
            void registrar();
          }}
          className="space-y-4"
        >
          <CampoGuiado id="razon-social" guia={guia}>
            <CampoTexto
              etiqueta={guia.etiqueta("razon-social", "Razón social")}
              value={b.nombre}
              maxLength={TOPE_RAZON_SOCIAL}
              autoFocus={b.nombre === ""}
              onChange={(e) => setB((x) => ({ ...x, nombre: e.target.value }))}
            />
          </CampoGuiado>
          {pregunta.igual && (
            <PreguntaParecido
              titulo={`«${pregunta.igual.nombre}» ya está registrado`}
              bajada="Con el mismo nombre no se registra otro: elígelo y sigues con él."
              opciones={[{ id: pregunta.igual.id, nombre: pregunta.igual.nombre }]}
              si={() => ({ texto: `Usar ${pregunta.igual!.nombre}`, onClick: () => usar(pregunta.igual!) })}
              deshabilitado={guardando}
            />
          )}
          {porResponder.length > 0 && (
            <PreguntaParecido
              titulo="¿No será un proveedor que ya tienes?"
              bajada="Si es el mismo, elígelo: sus facturas y lo que se le debe tienen que quedar en una sola ficha."
              opciones={porResponder.map(({ proveedor }) => ({ id: proveedor.id, nombre: proveedor.nombre, detalle: proveedor.ruc ? `RUC ${proveedor.ruc}` : "sin RUC" }))}
              si={(o) => ({ texto: `Sí, es ${o.nombre}`, onClick: () => usar(porResponder.find((x) => x.proveedor.id === o.id)!.proveedor) })}
              no={{
                texto: `No, «${b.nombre.trim()}» es otro proveedor`,
                onClick: () => setDescartados((d) => new Set([...d, ...porResponder.map((x) => x.proveedor.id)])),
              }}
              deshabilitado={guardando}
            />
          )}
          <CampoGuiado id="ruc" guia={guia}>
            <CampoTexto
              etiqueta={
                <>
                  RUC <span className="font-normal normal-case tracking-normal text-taupe">· opcional</span>
                </>
              }
              value={b.ruc}
              inputMode="numeric"
              maxLength={13}
              // sugerir-fijo: el formato del RUC es el mismo para cualquier proveedor; no depende de nada elegido antes
              placeholder="11 dígitos"
              className="tabular-nums"
              autoFocus={b.nombre !== "" && b.ruc === ""}
              onChange={(e) => setB((x) => ({ ...x, ruc: e.target.value.replace(/[^\d\s-]/g, "") }))}
              tono={repetido ? "error" : undefined}
              pie={repetido ? `Ya es de «${repetido.nombre}».` : undefined}
            />
          </CampoGuiado>
          {repetido && (
            <PreguntaParecido
              titulo={`«${repetido.nombre}» ya tiene ese RUC`}
              bajada="Un RUC no se repite: elígelo y sigues con él."
              opciones={[{ id: repetido.id, nombre: repetido.nombre }]}
              si={() => ({ texto: `Usar ${repetido.nombre}`, onClick: () => usar(repetido) })}
              deshabilitado={guardando}
            />
          )}
          {error && <Aviso tono="error" titulo="No se pudo registrar">{error}</Aviso>}
          <div className="pie-hoja-fijo space-y-3 pt-2">
            <PieGuia guia={guia} listo="Todo listo." />
            <div className="pie-acciones">
              <Boton type="button" peso="fantasma" onClick={cerrar} disabled={guardando}>
                Cancelar
              </Boton>
              <Boton type="submit" peso="primario" cargando={guardando} textoCargando="Registrando…" confirma={guia} title={guia.frase ?? undefined} className={guia.claseConfirmar}>
                Registrar y elegir
              </Boton>
            </div>
          </div>
        </form>
      )}
    </Modal>
  );
}
