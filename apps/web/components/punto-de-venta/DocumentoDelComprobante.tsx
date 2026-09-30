"use client";

import { ConsultaDocumento } from "@/components/ConsultaDocumento";
import { CampoTipoDocumento } from "@/components/CampoDocumentoClienta";
import { CampoTexto } from "@/components/ui/campos";
import type { TipoComprobante } from "@/lib/comprobantes-reglas";
import { ajustarNumeroAlTipo, largoMaximoDocumento, problemaDocumento, type TipoDocumentoClienta } from "@/lib/documento-clienta-reglas";

// El documento de quien compra, dentro del paso «Comprobante» del ticket (ADR-0288 D-3, tanda 1e). Vive aparte para que
// `PuntoDeVentaTicket` solo lo coloque:
//   · factura → el RUC de la empresa, con el padrón de SUNAT (lo exige SUNAT y la base lo frena sin él);
//   · boleta y nota de venta → el combo «Tipo de documento» (DNI por defecto) y, según el tipo, el DNI con el padrón de
//     RENIEC, o el número del carné de extranjería o del pasaporte con el nombre a mano (no tienen padrón).
// Las reglas del número salen de `lib/documento-clienta-reglas.ts`, las mismas que la base. Un carné o un pasaporte mal
// escrito se dice aquí y, además, no deja cobrar (`problemaDocumentoComprobante` → `motivoBloqueoCobro`): la base lo
// rechazaría y, con él, la venta entera.

/** El id de la caja del número de un carné o un pasaporte. Distinto del de `ConsultaDocumento` (`documento-numero`) y del
 *  de la fila «Clienta» (`clienta-documento-numero`): la hoja de la clienta y este paso pueden estar montados a la vez. */
export const ID_NUMERO_DOC_COMPROBANTE = "comprobante-documento-numero";

export function DocumentoDelComprobante({
  tipoComprobante,
  identidad,
  onIdentidad,
  numero,
  onNumero,
  nombre,
  onNombre,
}: {
  tipoComprobante: Extract<TipoComprobante, "boleta" | "factura" | "nota_venta">;
  /** El documento de identidad de una boleta o nota de venta. En una factura no se usa: siempre es RUC. */
  identidad: TipoDocumentoClienta;
  onIdentidad: (t: TipoDocumentoClienta) => void;
  numero: string;
  onNumero: (v: string) => void;
  nombre: string;
  onNombre: (v: string) => void;
}) {
  if (tipoComprobante === "factura") {
    return <ConsultaDocumento tipo="ruc" obligatorio numero={numero} onNumero={onNumero} nombre={nombre} onNombre={onNombre} />;
  }

  const problema = identidad === "dni" || !numero ? null : problemaDocumento(identidad, numero);
  return (
    <div className="space-y-2">
      {/* Al cambiar de tipo el número NO se vacía: se queda con lo que el tipo nuevo admite (`ajustarNumeroAlTipo`). */}
      <CampoTipoDocumento
        tipo={identidad}
        onTipo={(t) => {
          onIdentidad(t);
          onNumero(ajustarNumeroAlTipo(t, numero));
        }}
      />
      {identidad === "dni" ? (
        <ConsultaDocumento tipo="dni" obligatorio={false} numero={numero} onNumero={onNumero} nombre={nombre} onNombre={onNombre} />
      ) : (
        <>
          <CampoTexto
            id={ID_NUMERO_DOC_COMPROBANTE}
            etiqueta={
              <>
                Número de {identidad === "pasaporte" ? "pasaporte" : "carné"} <span className="normal-case tracking-normal">(opcional)</span>
              </>
            }
            mono
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={largoMaximoDocumento(identidad)}
            value={numero}
            onChange={(e) => onNumero(ajustarNumeroAlTipo(identidad, e.target.value))}
            pie={problema ?? "Sin guiones ni espacios. Solo el DNI consulta el padrón: el nombre va a mano."}
            tono={problema ? "error" : "neutro"}
          />
          <CampoTexto id="comprobante-documento-nombre" etiqueta="Nombre de la clienta" value={nombre} onChange={(e) => onNombre(e.target.value)} />
        </>
      )}
    </div>
  );
}
