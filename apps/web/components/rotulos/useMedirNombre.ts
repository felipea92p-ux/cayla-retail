"use client";

import { useEffect, useState } from "react";
import { anchoEm, type MedirEm } from "@/lib/rotulos-reglas";

/** Se mide a 200 px para que el redondeo de la pantalla no pese: lo que importa es la proporción, en «em». */
const TAMANO_REGLA_PX = 200;

let regla: HTMLSpanElement | null = null;
let memoria = new Map<string, number>();

/**
 * Mide un texto con la letra que ESTA computadora dibuja de verdad en el nombre del rótulo: un `<span class="rot-regla">` fuera
 * de la vista, con la misma letra, el mismo grosor y el mismo espaciado que `.rot-nombre` (`app/estilos/rotulo.css`). Si el
 * navegador no lo dibuja (mide 0), se queda con la tabla de fábrica.
 */
function medirAqui(texto: string): number {
  const guardado = memoria.get(texto);
  if (guardado !== undefined) return guardado;
  if (!regla || !regla.isConnected) {
    regla = document.createElement("span");
    regla.className = "rot-regla";
    regla.setAttribute("aria-hidden", "true");
    document.body.appendChild(regla);
  }
  regla.textContent = texto;
  const em = regla.getBoundingClientRect().width / TAMANO_REGLA_PX;
  const ancho = em > 0 ? em : anchoEm(texto);
  memoria.set(texto, ancho);
  return ancho;
}

/**
 * La medida con que `medidaNombre` decide el tamaño del nombre (ADR-0366, act. 2026-11-07). Arranca con la tabla —la misma del
 * servidor, para que la página hidrate igual— y, cuando la letra terminó de cargar, pasa a medir con la letra real de esta
 * computadora: los rótulos se vuelven a calcular solos. Si la letra cambia después (llega tarde, se recarga), se mide de nuevo.
 */
export function useMedirNombre(): MedirEm {
  const [medir, setMedir] = useState<MedirEm>(() => anchoEm);
  useEffect(() => {
    let vivo = true;
    const listo = () => {
      if (!vivo) return;
      memoria = new Map();
      // Una función nueva cada vez: así React vuelve a dibujar los rótulos con la medida fresca.
      setMedir(() => (texto: string) => medirAqui(texto));
    };
    const fuentes = typeof document !== "undefined" ? document.fonts : undefined;
    if (!fuentes) {
      listo();
      return () => {
        vivo = false;
      };
    }
    void fuentes.ready.then(listo);
    fuentes.addEventListener("loadingdone", listo);
    return () => {
      vivo = false;
      fuentes.removeEventListener("loadingdone", listo);
    };
  }, []);
  return medir;
}
