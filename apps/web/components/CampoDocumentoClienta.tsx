"use client";

import { CampoSelect, CampoTexto } from "@/components/ui/campos";
import {
  TIPOS_DOCUMENTO_CLIENTA,
  ajustarNumeroAlTipo,
  largoMaximoDocumento,
  problemaDocumento,
  type TipoDocumentoClienta,
} from "@/lib/documento-clienta-reglas";

// El documento de una clienta en un formulario (ADR-0288 D-2): el combo «Tipo de documento» y la caja del número. Lo usan
// el alta (`NuevaClientaModal`, donde el DNI pasa además por el padrón con `ConsultaDocumento`) y la edición de la ficha
// (`ClientaFichaModal`). Las reglas no viven aquí: salen de `lib/documento-clienta-reglas.ts`, que repite las de la base.

const OPCIONES_TIPO = TIPOS_DOCUMENTO_CLIENTA.map((t) => ({ valor: t.valor, texto: t.etiqueta }));

/** El id de la caja del número: el mismo que usa `ConsultaDocumento`, para `avisar.error(…, { enfocar })`. */
export const ID_NUMERO_DOCUMENTO = "documento-numero";

/** El combo. Quien lo usa, al cambiar de tipo, pasa el número por `ajustarNumeroAlTipo` (no lo vacía).
 *  `corto`: en el celular va al lado del número (no encima), y su título se acorta a «Tipo» para caber en la columna angosta. */
export function CampoTipoDocumento({ tipo, onTipo, corto = false }: { tipo: TipoDocumentoClienta; onTipo: (tipo: TipoDocumentoClienta) => void; corto?: boolean }) {
  const etiqueta = corto ? (
    <>
      <span className="sm:hidden">Tipo</span>
      <span className="max-sm:hidden">Tipo de documento</span>
    </>
  ) : (
    "Tipo de documento"
  );
  return <CampoSelect etiqueta={etiqueta} valor={tipo} onValor={onTipo} opciones={OPCIONES_TIPO} />;
}

/** La caja del número: solo deja tipear lo que el tipo admite y, si el número está a medias o mal, lo dice debajo. */
export function CampoNumeroDocumento({
  tipo,
  numero,
  onNumero,
  opcional = false,
}: {
  tipo: TipoDocumentoClienta;
  numero: string;
  onNumero: (numero: string) => void;
  /** Agrega «(opcional)» a la etiqueta, como el campo de DNI con padrón del alta. */
  opcional?: boolean;
}) {
  const problema = problemaDocumento(tipo, numero);
  const etiqueta = TIPOS_DOCUMENTO_CLIENTA.find((t) => t.valor === tipo)?.etiqueta ?? "DNI";
  return (
    <CampoTexto
      id={ID_NUMERO_DOCUMENTO}
      etiqueta={
        <>
          {etiqueta} {opcional && <span className="normal-case tracking-normal">(opcional)</span>}
        </>
      }
      pie={problema}
      tono={problema ? "error" : "neutro"}
      mono
      inputMode={tipo === "dni" ? "numeric" : "text"}
      autoCapitalize={tipo === "dni" ? undefined : "characters"}
      maxLength={largoMaximoDocumento(tipo)}
      placeholder={tipo === "dni" ? "8 dígitos" : "6 a 12 letras o números"}
      value={numero}
      onChange={(e) => onNumero(ajustarNumeroAlTipo(tipo, e.target.value))}
    />
  );
}
