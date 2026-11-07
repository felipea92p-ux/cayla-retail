"use client";

import { useState } from "react";
import { useValidarAlSalir } from "@/components/ui/useValidarAlSalir";
import { MONTO_ILEGIBLE, lecturaCampoMonto, montoIlegible, montoParaMostrar, porcentajeMalEscrito } from "@/lib/monto-plata-reglas";

/**
 * Campo de un monto en soles que se puede vaciar y reescribir sin que se le pegue un «0», y que entiende la coma decimal.
 *
 * Es un campo de TEXTO con teclado decimal, no un `type="number"`: el del navegador borraba la coma sin avisar y «2,5» llegaba como 25
 * (S/ 25 en vez de S/ 2.50, /chaos de Apartados 2026-10-15; ADR-0419). Lo escrito se lee con `leerMontoPlata`, la misma regla de las hojas
 * del fondo: «2,5», «1.299,50» y «1,299.50» se entienden; «12.500» no se adivina. Lo que no se entiende queda escrito, marcado en rojo con
 * su porqué, y le avisa 0 al padre: ningún botón guarda un monto adivinado.
 *
 * El campo lleva su propio BORRADOR de texto mientras se edita y, al salir, muestra el número que entendió (si lo entendió), con miles y dos decimales
 * (ADR-0611, mejora 3). Al entrar: si el monto es 0 el campo queda vacío (se ve el «0.00» de ayuda), y si no, el valor queda seleccionado para
 * reemplazarlo de un tirón.
 *
 * Es el `<input>` solo, para una fila que ya tiene su caja. Con su caja, su «S/» y su etiqueta, el de `ui/campos.tsx` (`CampoMonto`).
 */
export function EntradaMonto({
  valor,
  onCambio,
  className,
  disabled,
  "aria-label": ariaLabel,
  "data-monto-medio": medio,
}: {
  valor: number;
  onCambio: (monto: number) => void;
  className?: string;
  disabled?: boolean;
  "aria-label": string;
  /** El medio de pago del monto (hoja de cobro): por él se le da el foco al agregar un segundo medio. */
  "data-monto-medio"?: string;
}) {
  // `null` = no se está editando: se muestra el número del padre.
  const [borrador, setBorrador] = useState<string | null>(null);
  // Mientras escribe, «12.5» puede estar a medias: lo que no se entiende se marca al salir, no a la primera letra (ADR-0611, mejora 2).
  const aviso = useValidarAlSalir(borrador !== null && lecturaCampoMonto(borrador).ilegible ? MONTO_ILEGIBLE : null);
  return (
    <input
      aria-label={ariaLabel}
      aria-invalid={aviso.motivo ? true : undefined}
      title={aviso.motivo ?? undefined}
      data-monto-medio={medio}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      placeholder="0.00"
      value={borrador ?? montoParaMostrar(String(valor))}
      disabled={disabled}
      className={`${className ?? ""} ${CLASE_MONTO_ILEGIBLE}`}
      onFocus={(e) => {
        if (valor === 0) return setBorrador("");
        // Se edita lo escrito, sin los miles; el valor cambia al repintar y por eso se selecciona después.
        const caja = e.currentTarget;
        setBorrador(String(valor));
        requestAnimationFrame(() => caja.select());
      }}
      onChange={(e) => {
        setBorrador(e.target.value);
        onCambio(lecturaCampoMonto(e.target.value).valor);
      }}
      // Al salir se ve el número entendido; lo que no se entendió se queda escrito, en rojo, para corregirlo.
      onBlur={() => {
        aviso.alSalir();
        setBorrador((b) => (b !== null && lecturaCampoMonto(b).ilegible ? b : null));
      }}
    />
  );
}

/** Lo escrito que no se entiende se ve en rojo con un subrayado ondulado (lo pone `aria-invalid`), pero no mientras se escribe: «12.5» puede estar a
 *  medias (ADR-0611, mejora 2). Un `<input>` propio la suma a su clase; un `CampoTexto` dice el porqué en su pie (`tono="error"`). */
export const CLASE_MONTO_ILEGIBLE =
  "not-focus:aria-[invalid=true]:text-rojo-profundo not-focus:aria-[invalid=true]:underline not-focus:aria-[invalid=true]:decoration-rojo not-focus:aria-[invalid=true]:decoration-wavy";

/**
 * Para un campo de plata que guarda lo escrito como TEXTO y no puede ser un `EntradaMonto` (su padre lee el texto, lleva su propia caja o
 * etiqueta): campo de texto con teclado decimal, marcado en rojo si no se entiende. Se lee con `numeroDeMonto` (`lib/monto-plata-reglas.ts`),
 * nunca con `Number(…)`. ADR-0419: el `type="number"` del navegador borraba la coma («2,5» → 25).
 */
export function atributosMontoTexto(texto: string) {
  const ilegible = montoIlegible(texto);
  return {
    type: "text",
    inputMode: "decimal",
    autoComplete: "off",
    "aria-invalid": ilegible || undefined,
    title: ilegible ? MONTO_ILEGIBLE : undefined,
  } as const;
}

/** Lo mismo para el % de un descuento, que acepta decimales y se lee igual que el monto de al lado (`numeroDeMonto`): «2,5» es 2.5. Un `type="number"` no dejaba entrar la coma, y quedaba 25 %. */
export function atributosPorcentajeTexto(texto: string) {
  const mal = porcentajeMalEscrito(texto);
  return {
    type: "text",
    inputMode: "decimal",
    autoComplete: "off",
    "aria-invalid": mal || undefined,
    title: mal ? "El porcentaje va de 1 a 100, sin signo: 2,5 o 15." : undefined,
  } as const;
}
