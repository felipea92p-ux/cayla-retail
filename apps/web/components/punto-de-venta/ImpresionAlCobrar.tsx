"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { ReciboTermico } from "@/components/ReciboTermico";
import { imprimirBoleta, type FinBoleta } from "@/components/impresion/imprimirBoleta";
import { textoNumeroRecibo, type ReciboVenta } from "@/lib/recibo-reglas";
import { useTituloDeImpresion } from "@/lib/useTituloDeImpresion";

/**
 * La boleta que sale sola al cobrar, sin la hoja «Venta registrada» (`lib/imprimir-al-cobrar.ts`, act. 2026-11-25). No dibuja nada en
 * pantalla: pega el recibo al `<body>` (el CSS de impresión oculta todo lo demás), lo manda a imprimir UNA vez y dice cómo terminó.
 * Quien la usa la desmonta recién en `alTerminar`: antes, se llevaría el papel a medio imprimir.
 */
export function ImpresionAlCobrar({
  recibo,
  conAviso,
  alTerminar,
}: {
  recibo: ReciboVenta;
  /** `false` al cobrar: el aviso de la venta ya dice que se imprimió. `true` al reimprimir desde ese aviso. */
  conAviso: boolean;
  alTerminar: (fin: FinBoleta) => void;
}) {
  // El PDF sale con el número del comprobante («B004-000004.pdf»). Antes que el efecto que imprime: React los corre en ese orden.
  useTituloDeImpresion(textoNumeroRecibo(recibo));
  // Una sola vez: el doble efecto de React en desarrollo no imprime dos boletas.
  const hecho = useRef(false);
  useEffect(() => {
    if (hecho.current) return;
    hecho.current = true;
    void imprimirBoleta({ conAviso }).then(alTerminar);
  }, [conAviso, alTerminar]);
  return createPortal(<ReciboTermico recibo={recibo} />, document.body);
}
