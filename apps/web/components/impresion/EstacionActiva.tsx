"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { ReciboTermico } from "@/components/ReciboTermico";
import { useSedeActiva } from "@/components/SedeActiva";
import { boletasPorAyudante, imprimirBoleta } from "@/components/impresion/imprimirBoleta";
import { Chip } from "@/components/ui/Chip";
import { createClient } from "@/lib/supabase/client";
import { useCambiosEnVivo } from "@/lib/useCambiosEnVivo";
import { leerVentaDetalle } from "@/lib/venta-detalle";
import { ventanaDelEquipo } from "@/lib/ventana-de-impresion";
import { estacionActiva, estacionDeLaCaja, fraseDeVoz, REVISAR_CADA_MS, SEGUNDA_MIRADA_MS, vozDeLaEstacion } from "@/lib/estacion-de-impresion";
import type { ReciboVenta } from "@/lib/recibo-reglas";

type Fila = { impresion_id: string | null; venta_id: string | null; pendientes: number };

/** Deja que React monte el recibo en el `<body>`. Con un reloj y no con `requestAnimationFrame`: con la ventana de la caja
 *  minimizada o detrás de otra, el navegador no pinta cuadros y la estación se quedaba esperando con la boleta tomada. */
const darleUnMomento = () => new Promise<void>((listo) => window.setTimeout(listo, 80));

/** Las imágenes del recibo (logo, QR) decodificadas, con tope: una que no carga no frena la boleta. */
const imagenesListas = () =>
  Promise.race([
    Promise.all([...document.querySelectorAll<HTMLImageElement>("#comprobante-print img")].map((i) => i.decode().catch(() => undefined))),
    new Promise((listo) => window.setTimeout(listo, 1500)),
  ]);

/**
 * La estación de la caja, ya encendida (se carga aparte desde `EstacionDeImpresion`, ADR-0674). La estación (migración 20261116204000): en la ventana «CAYLA Caja», con «Imprimir lo que se vende en el piso»
 * encendido, toma de la cola cada boleta pedida desde el piso, la imprime sin cuadro y la marca impresa. Se entera por el aviso
 * de venta nueva de su sede (ADR-0603, con una segunda mirada a los 2,5 s) y revisa cada 10 s de respaldo. Imprime una a la vez
 * y nunca mientras «Venta registrada» tiene su propio recibo montado (saldrían los dos en el mismo papel). Montada una vez en
 * el marco del ERP: imprime en cualquier pantalla de la caja. Va con `x-espera: no`: no tapa la pantalla con el loader.
 */
export function EstacionActiva() {
  const sede = useSedeActiva();
  const ventana = useSyncExternalStore(ventanaDelEquipo.suscribir, ventanaDelEquipo.leer, ventanaDelEquipo.leerEnServidor);
  const estacion = useSyncExternalStore(estacionDeLaCaja.suscribir, estacionDeLaCaja.leer, estacionDeLaCaja.leerEnServidor);
  const ubicacionId = sede?.ubicacionId ?? null;
  const porAyudante = useSyncExternalStore(boletasPorAyudante.suscribir, boletasPorAyudante.leer, boletasPorAyudante.leerEnServidor);
  const activa = estacionActiva(ventana, estacion, porAyudante) && Boolean(ubicacionId);
  const [recibo, setRecibo] = useState<ReciboVenta | null>(null);
  const [pendientes, setPendientes] = useState(0);
  const [sinCola, setSinCola] = useState(false);
  const ocupada = useRef(false);

  const revisar = useCallback(async () => {
    if (!activa || !ubicacionId || ocupada.current) return;
    // «Venta registrada» tiene su recibo montado: esperar a que se cierre (la próxima mirada lo toma).
    if (document.getElementById("comprobante-print")) return;
    ocupada.current = true;
    const supabase = createClient();
    try {
      for (let vuelta = 0; vuelta < 20; vuelta++) {
        const { data, error } = await supabase
          .rpc("tomar_impresion" as never, { p_ubicacion_id: ubicacionId, p_equipo: `CAYLA Caja · ${sede?.etiqueta ?? "sede"}` } as never)
          .setHeader("x-espera", "no");
        if (error) {
          setSinCola(true);
          return;
        }
        setSinCola(false);
        const fila = (Array.isArray(data) ? data[0] : null) as Fila | null;
        setPendientes(fila?.pendientes ?? 0);
        if (!fila?.impresion_id || !fila.venta_id) return;

        let impresa = false;
        try {
          const detalle = await leerVentaDetalle(supabase, fila.venta_id, { sede: sede?.etiqueta ?? "", vendedor: null });
          if (detalle.recibo) {
            setRecibo(detalle.recibo);
            await darleUnMomento();
            await imagenesListas();
            // Por el ayudante de la Mac o por la ventana «CAYLA Caja» (sin cuadro). Nunca abre el cuadro: con la ventana minimizada
            // nadie lo vería y la caja quedaría trabada; si no salió, la boleta vuelve a la cola.
            const fin = await imprimirBoleta({ conCuadro: false });
            impresa = fin === "impresa" || fin === "cuadro";
          }
          if (impresa && detalle.recibo) {
            if (vozDeLaEstacion.leer() === "si" && "speechSynthesis" in window) {
              const frase = new SpeechSynthesisUtterance(fraseDeVoz(detalle.recibo.tipo, detalle.recibo.total));
              frase.lang = "es-PE";
              window.speechSynthesis.speak(frase);
            }
          }
        } finally {
          setRecibo(null);
        }
        await supabase
          .rpc("marcar_impresion" as never, { p_impresion_id: fila.impresion_id, p_impresa: impresa } as never)
          .setHeader("x-espera", "no");
        if (!impresa) return;
        await darleUnMomento();
      }
    } finally {
      ocupada.current = false;
    }
  }, [activa, ubicacionId, sede?.etiqueta]);

  useCambiosEnVivo({
    tabla: "ventas",
    ubicacionId,
    activo: activa,
    alCambiar: () => {
      void revisar();
      window.setTimeout(() => void revisar(), SEGUNDA_MIRADA_MS);
    },
  });

  useEffect(() => {
    if (!activa) return;
    void revisar();
    const reloj = window.setInterval(() => void revisar(), REVISAR_CADA_MS);
    return () => window.clearInterval(reloj);
  }, [activa, revisar]);

  if (!activa) return null;
  return (
    <>
      {/* Lo que flota sobre la pantalla lleva el vidrio de lo que flota (recetas.css). Abajo al centro: a la izquierda tapaba la
          cuenta del menú lateral y a la derecha queda el «Cobrar» del ticket; los avisos salen arriba. */}
      <div
        className="pointer-events-none fixed left-1/2 z-40 -translate-x-1/2 rounded-full px-1 py-1"
        style={{
          bottom: "max(12px, env(safe-area-inset-bottom, 0px))",
          background: "var(--vidrio-flota-fondo)",
          backdropFilter: "var(--vidrio-flota-filtro)",
        }}
        role="status"
        aria-live="polite"
      >
        {/* Es un estado: la insignia con su punto (ADR-0358, `estado`); la impresora es solo de los botones que imprimen. */}
        <Chip tono={sinCola ? "ambar" : "pizarra"}>
          {sinCola ? "Caja: sin conexión con la cola" : pendientes > 0 ? `Caja: ${pendientes} por imprimir` : "Caja imprime el piso"}
        </Chip>
      </div>
      {recibo && createPortal(<ReciboTermico recibo={recibo} />, document.body)}
    </>
  );
}
