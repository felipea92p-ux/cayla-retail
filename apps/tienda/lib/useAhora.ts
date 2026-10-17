"use client";

import { useEffect, useState } from "react";

/**
 * La hora del aparato, segundo a segundo, para una cuenta regresiva (ADR-0432). Antes de que la página llegue al navegador vale `null`:
 * una página que se arma por adelantado no puede saber qué hora será cuando alguien la abra (Next no deja leer el reloj al armarla),
 * y mostrar la hora del servidor era mostrar una cifra distinta a la del primer segundo. Quien la usa dibuja un hueco con la misma
 * forma hasta que llega la hora, y el primer valor llega en el primer instante después de pintar.
 */
export function useAhora(cadaMs = 1000): number | null {
  const [ahora, setAhora] = useState<number | null>(null);
  useEffect(() => {
    const marcar = () => setAhora(Date.now());
    marcar();
    const reloj = setInterval(marcar, cadaMs);
    return () => clearInterval(reloj);
  }, [cadaMs]);
  return ahora;
}
