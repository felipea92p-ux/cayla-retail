"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Aviso } from "@/components/ui/Aviso";
import { Chip } from "@/components/ui/Chip";
import { TituloGrupo } from "@/components/ui/TituloSeccion";
import { Dato } from "@/components/FlujoGuiado";
import { CampoGuiado } from "@/components/guia-de-foco/CampoGuiado";
import type { GuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { DocumentoDelComprobante } from "@/components/punto-de-venta/DocumentoDelComprobante";
import { soles } from "@/lib/compras-reglas";
import {
  TEXTO_BOLETA_PIDE_DOCUMENTO,
  TOPE_BOLETA_SIN_DOCUMENTO,
  clienteLegible,
  leerMemoriaPrevia,
  leerPrevia,
  lineasDeDocumentos,
  nombreConocido,
  recordarPrevia,
  type ClienteDelComprobante,
  type DocumentoOriginal,
  type DocumentosQueSalen,
  type MemoriaPrevia,
  type PreviaDocumentos,
} from "@/lib/cambios-documentos-reglas";

/* ====================================================================
   Los comprobantes de un cambio con diferencia (ADR-0671), en el paso «Revisa y confirma» de Cambios.

   Dice qué sale (la nota de crédito sobre la compra y el comprobante nuevo por lo que se lleva), por cuánto y cuándo, y deja cambiar a
   nombre de quién sale el nuevo (una boleta o una nota de venta: un regalo). Una factura va siempre al mismo RUC: se ve, no se edita.
   Todo lo que dice sale de `lib/cambios-documentos-reglas.ts`; la base tiene la última palabra (`previsualizar_documentos_cambio`).
   ==================================================================== */

/** «Sobre la B001-000004»: el número de un comprobante no se parte en el guion al final de una línea (a 375 px quedaba «B001-» arriba y
 *  «000004» abajo). Solo cambia cómo se dibuja: el texto es el mismo. */
function conNumeroEntero(texto: string) {
  return texto.split(/([A-Z]{1,2}[0-9A-Z]{2,3}-\d+)/).map((parte, i) =>
    i % 2 === 1 ? (
      <span key={i} className="whitespace-nowrap">
        {parte}
      </span>
    ) : (
      parte
    ),
  );
}

/** Lo que se le pregunta a la base; `null` mientras no hay nada que preguntar (sin diferencia, o la base todavía no emite). */
export type ConsultaPrevia = {
  ventaItemId: string;
  ubicacionId: string;
  cantidad: number;
  totalNuevo: number;
  /** El cliente del comprobante nuevo solo si la persona lo cambió (`clienteCambiado`): si no, la base usa el de la compra. */
  cliente: { tipo_doc: string; num_doc: string | null; nombre: string | null } | null;
};

/** Cuánto se espera después de la última tecla antes de preguntar (la misma pausa de los buscadores). */
const PAUSA_MS = 350;

/**
 * Le pregunta a la base qué documentos va a emitir el cambio armado, sin bloquear la pantalla: `previsualizar_` es una lectura para el
 * loader (`espera-reglas.ts`). Mientras llega la respuesta a un cliente nuevo, queda la anterior de la misma línea (`recordarPrevia`):
 * los documentos y lo de la tienda no dependen del cliente, y así nada salta mientras se escribe. Si la base no responde, se sigue con lo
 * que dice la regla de la pantalla y la base vuelve a revisar todo al guardar (principio 9).
 */
export function usePreviaDocumentos(consulta: ConsultaPrevia | null): {
  previa: PreviaDocumentos | null;
  problemaBloque: string | null;
  problemaCliente: string | null;
} {
  const clave = consulta ? JSON.stringify(consulta) : null;
  const linea = consulta ? JSON.stringify({ ...consulta, cliente: null }) : null;
  const [memoria, setMemoria] = useState<MemoriaPrevia | null>(null);

  useEffect(() => {
    if (!clave || !linea) return;
    const pedida = JSON.parse(clave) as ConsultaPrevia;
    let vigente = true;
    const temporizador = setTimeout(async () => {
      let previa: PreviaDocumentos | null = null;
      try {
        const { data, error } = await createClient().rpc("previsualizar_documentos_cambio", {
          p_venta_item_id: pedida.ventaItemId,
          p_ubicacion_id: pedida.ubicacionId,
          p_cantidad: pedida.cantidad,
          p_total_nuevo: pedida.totalNuevo,
          ...(pedida.cliente ? { p_cliente: pedida.cliente } : {}),
        });
        previa = error ? null : leerPrevia(data);
      } catch {
        // Sin red: se sigue con la regla de la pantalla.
      }
      if (vigente) setMemoria((antes) => recordarPrevia(antes, { linea, consulta: clave, previa }));
    }, PAUSA_MS);
    return () => {
      vigente = false;
      clearTimeout(temporizador);
    };
  }, [clave, linea]);

  return leerMemoriaPrevia(memoria, linea, clave);
}

export function ComprobantesDelCambio({
  documentos,
  original,
  cliente,
  onCliente,
  editable,
  clienteFijo,
  problemaBloque,
  guia,
  deshabilitado,
}: {
  documentos: DocumentosQueSalen;
  original: DocumentoOriginal | null;
  cliente: ClienteDelComprobante;
  /** Solo lo que cambió: el combo del documento cambia el tipo y el número en el mismo evento (`conCambioDelCliente`). */
  onCliente: (parche: Partial<ClienteDelComprobante>) => void;
  /** Boleta o nota de venta: el cliente del nuevo se puede cambiar. */
  editable: boolean;
  /** Lo que se ve cuando no se edita (una factura: el mismo RUC). */
  clienteFijo: string | null;
  /** Lo que impide emitir y no se arregla aquí (la serie de la tienda, el techo de las notas), o null. */
  problemaBloque: string | null;
  /** La guía de foco de este bloque (`cliente-comprobante` y `comprobantes`). */
  guia: GuiaCampos;
  deshabilitado: boolean;
}) {
  const tipo = documentos.nuevo.tipo;
  const pideDocumento = tipo === "boleta" && documentos.nuevo.total > TOPE_BOLETA_SIN_DOCUMENTO;
  return (
    <section data-guia="cambios.documentos" aria-label="Comprobantes" className="posv-placa space-y-4 p-5 sm:p-7">
      <TituloGrupo>Comprobantes</TituloGrupo>
      <CampoGuiado id="comprobantes" guia={guia}>
        <ul className="space-y-3">
          {lineasDeDocumentos(documentos).map((l) => (
            <li key={l.clave} className="flex items-start justify-between gap-4 text-sm">
              <span className="min-w-0">
                <span className="block font-semibold text-tinta">{l.titulo}</span>
                {l.detalle && <span className="block text-tinta/70">{conNumeroEntero(l.detalle)}</span>}
              </span>
              <span className="flex shrink-0 flex-col items-end gap-1">
                <span className="font-semibold tabular-nums text-tinta">{soles(l.monto)}</span>
                <Chip tono={l.cuando === "ahora" ? "verde" : "ambar"}>{l.cuando === "ahora" ? "Sale ahora" : "Espera a SUNAT"}</Chip>
              </span>
            </li>
          ))}
        </ul>
      </CampoGuiado>
      <div data-guia="cambios.cliente-comprobante" className="max-w-md">
        {editable ? (
          <CampoGuiado
            id="cliente-comprobante"
            guia={guia}
            titulo={`${tipo === "nota_venta" ? "Nota de venta" : "Boleta"} nueva a nombre de`}
          >
            <fieldset disabled={deshabilitado}>
              <legend className="sr-only">Cliente del comprobante nuevo</legend>
              <DocumentoDelComprobante
                tipoComprobante={tipo}
                identidad={cliente.identidad}
                onIdentidad={(identidad) => onCliente({ identidad })}
                numero={cliente.numero}
                onNumero={(numero) => onCliente({ numero })}
                nombre={cliente.nombre}
                onNombre={(nombre) => onCliente({ nombre })}
                // Lo que pasa sin número: más de S/ 700, la regla (el mismo texto que el error, que lo reemplaza al confirmar); con un
                // nombre escrito no sale a «Cliente varios», así que no se promete.
                sinNumero={pideDocumento ? TEXTO_BOLETA_PIDE_DOCUMENTO : cliente.nombre.trim() ? undefined : "Sin documento sale a «Cliente varios»."}
                nombreDeFicha={nombreConocido(cliente, original)}
              />
            </fieldset>
          </CampoGuiado>
        ) : (
          <dl className="text-sm">
            <Dato titulo="Factura nueva al mismo RUC">{clienteFijo ?? clienteLegible("sin_documento", null, null)}</Dato>
          </dl>
        )}
      </div>
      {/* Lo de la tienda (series, techo de las notas) va al final del bloque, junto a los botones: si llega mientras se escribe el cliente,
          no empuja el campo donde está el cursor. */}
      {problemaBloque && (
        <Aviso tono="atencion" chico>
          {problemaBloque}
        </Aviso>
      )}
    </section>
  );
}
