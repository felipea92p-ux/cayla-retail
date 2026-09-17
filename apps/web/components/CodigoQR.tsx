"use client";

import { QRCodeSVG } from "qrcode.react";
import {
  LADO_QR_MM,
  LADO_VIEWBOX_PX,
  MAX_CARACTERES_COMODOS,
  NIVEL_QR,
  ZONA_MUDA_MODULOS,
} from "@/lib/qr";

/**
 * QR de una prenda, a tamaño físico fijo. Los parámetros viven en `lib/qr.ts` para
 * que la hoja de prueba impresa dibuje exactamente esto y no una versión parecida.
 *
 * POR QUÉ HAY UNA LIBRERÍA ACÁ Y NO EN CODE 128. La tradición del repo es no sumar
 * dependencias, y con Code 128 se sostiene: son una tabla de patrones y un checksum,
 * unas 40 líneas auditables (`lib/codigo128.ts`).
 *
 * QR no es comparable. Necesita corrección de errores Reed-Solomon sobre un campo de
 * Galois, enmascarado con 8 patrones candidatos y evaluación de penalidad, e info de
 * formato con códigos BCH. Son 600+ líneas de aritmética sutil donde un error produce
 * un código que *a veces* escanea — el peor tipo de defecto, porque pasa las pruebas
 * y falla en el mostrador.
 *
 * QR ES MÁS INDULGENTE QUE CODE 128, y vale saber por qué: todos sus módulos son
 * cuadrados del MISMO tamaño, así que escalar el dibujo no puede deformar ninguna
 * proporción — que es exactamente el defecto que rompía el código de barras
 * (2026-09-09). Acá el único riesgo real es que los módulos queden muy chicos. Aun
 * así se dimensiona en milímetros: el tamaño de una etiqueta es una medida física,
 * no un porcentaje.
 */
export function CodigoQR({ texto, ladoMm = LADO_QR_MM }: { texto: string; ladoMm?: number }) {
  if (!texto.trim()) return null;

  if (texto.length > MAX_CARACTERES_COMODOS) {
    return (
      <p className="text-[8px] leading-tight text-rojo">
        «{texto}» tiene {texto.length} caracteres; a {ladoMm} mm entran cómodos{" "}
        {MAX_CARACTERES_COMODOS}. Agrandá el QR o acortá el código.
      </p>
    );
  }

  return (
    <QRCodeSVG
      value={texto}
      size={LADO_VIEWBOX_PX}
      level={NIVEL_QR}
      marginSize={ZONA_MUDA_MODULOS}
      style={{ width: `${ladoMm}mm`, height: `${ladoMm}mm`, display: "block" }}
      role="img"
      aria-label={`Código QR ${texto}`}
    />
  );
}
