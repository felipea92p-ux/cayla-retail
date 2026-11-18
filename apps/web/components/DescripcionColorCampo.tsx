"use client";

import { Campo } from "@/components/ui/campos";
import { MAX_DESCRIPCION } from "@/lib/color-referencias";

// «Combina con» vivía junto a este campo hasta el 2026-11-13: salió de todo el ERP (Felipe). La columna `colores.combina_con` guarda lo
// que se escribió antes y la ruta /api/productos/colores no la toca si no se la manda.

/**
 * La descripción del color: qué transmite y dónde funciona, en una o dos frases (hasta 300 caracteres, el tope de la base). Es lo que
 * una asesora le dice a una cliente. Caja hundida como el resto de los campos; el contador sale solo cerca del tope.
 */
export function DescripcionColorCampo({ valor, onValor }: { valor: string; onValor: (texto: string) => void }) {
  const restantes = MAX_DESCRIPCION - valor.length;
  const cerca = restantes <= 40;
  return (
    <Campo
      etiqueta="Descripción"
      tono={restantes < 0 ? "error" : "neutro"}
      pie={
        restantes < 0
          ? `Sobran ${-restantes} caracteres.`
          : cerca
            ? `Quedan ${restantes} caracteres.`
            : "Opcional · qué transmite y dónde funciona."
      }
    >
      {/* La caja que se enciende (ADR-0358, ronda 6), en su forma de texto largo. */}
      <div className="caja-cayla caja-campo caja-campo-texto-largo" data-tono={restantes < 0 ? "error" : undefined}>
        <textarea
          className="self-stretch resize-none"
          value={valor}
          onChange={(e) => onValor(e.target.value)}
          rows={3}
          aria-label="Descripción del color"
          // sugerir-fijo: no depende de nada elegido antes; dice qué escribir, no da un ejemplo de otro color
          placeholder="Qué transmite y dónde funciona"
        />
      </div>
    </Campo>
  );
}
