"use client";

import { useState, useSyncExternalStore } from "react";
import { Printer, Settings, Smartphone } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Interruptor } from "@/components/ui/campos";
import { Chip } from "@/components/ui/Chip";
import { BOTON_ACCESO } from "@/components/punto-de-venta/AccesosVenta";
import { boletasEsperandoALaCaja, suscribirALaCola } from "@/components/impresion/colaDeLaCaja";
import { destinoDelEquipo, fraseDelDestino, imprimirAlCobrar, imprimirEnLaCaja, MQ_SIN_IMPRESORA, TEXTO_DESTINO } from "@/lib/imprimir-al-cobrar";
import { estacionDeLaCaja, vozDeLaEstacion } from "@/lib/estacion-de-impresion";
import { ventanaDelEquipo } from "@/lib/ventana-de-impresion";
import { boletasPorAyudante } from "@/lib/ayudante-de-boletas";

const leerPref = <T,>(p: { suscribir: (f: () => void) => () => void; leer: () => T; leerEnServidor: () => T }) =>
  [p.suscribir, p.leer, p.leerEnServidor] as const;

function suscribirAparato(avisar: () => void) {
  const m = window.matchMedia(MQ_SIN_IMPRESORA);
  m.addEventListener("change", avisar);
  return () => m.removeEventListener("change", avisar);
}

/**
 * La tuerca de Vender (maqueta `docs/maquetas/impresion-vender-2026-11/`, aprobada por Felipe el 2026-11-25): los interruptores de impresión
 * dejaron de vivir al pie de «Venta registrada» (nadie los encontraba: el 2026-11-24 Felipe no sabía que existían) y viven aquí, junto a
 * «Más». Al lado del ícono dice a dónde va la boleta de este equipo y, si hay boletas esperando a la caja, cuántas («1 en cola»).
 *
 * Son LAS MISMAS preferencias de siempre (mismo nombre guardado, mismo valor de fábrica, `lib/imprimir-al-cobrar.ts` y
 * `lib/estacion-de-impresion.ts`): moverlas de lugar no cambia cómo imprime ningún equipo. Lo vigila la prueba «la tuerca no cambia cómo
 * imprime ningún equipo (foto de Trujillo)» en `lib/imprimir-al-cobrar.test.ts`.
 */
export function ImpresionDelEquipo() {
  const [abierto, setAbierto] = useState(false);
  const enLaCaja = useSyncExternalStore(...leerPref(imprimirEnLaCaja)) === "si";
  const imprimeSolo = useSyncExternalStore(...leerPref(imprimirAlCobrar)) === "si";
  const esEstacion = useSyncExternalStore(...leerPref(estacionDeLaCaja)) === "si";
  const conVoz = useSyncExternalStore(...leerPref(vozDeLaEstacion)) === "si";
  // La caja: la ventana «CAYLA Caja» o la Mac con la ticketera en su ayudante (la misma cuenta que hacía «Venta registrada»).
  const esVentanaCaja = useSyncExternalStore(...leerPref(ventanaDelEquipo)) === "caja";
  const esCaja = useSyncExternalStore(boletasPorAyudante.suscribir, boletasPorAyudante.leer, boletasPorAyudante.leerEnServidor) || esVentanaCaja;
  const enCelular = useSyncExternalStore(
    suscribirAparato,
    () => window.matchMedia(MQ_SIN_IMPRESORA).matches,
    () => false,
  );
  const enCola = useSyncExternalStore(suscribirALaCola, boletasEsperandoALaCaja, () => 0);

  const destino = destinoDelEquipo({ esCaja, enLaCaja });
  const Icono = enCelular ? Smartphone : Printer;

  return (
    <>
      <button
        type="button"
        data-guia="vender.impresion"
        onClick={() => setAbierto(true)}
        className={BOTON_ACCESO}
        aria-haspopup="dialog"
        aria-label={`Impresión de este equipo: ${TEXTO_DESTINO[destino]}${enCola ? `, ${enCola} en cola` : ""}`}
      >
        <Settings className="h-4 w-4" aria-hidden />
        <span className="text-secundario">{TEXTO_DESTINO[destino]}</span>
        {enCola > 0 && (
          <Chip tono="ambar">{enCola} en cola</Chip>
        )}
      </button>

      {abierto && (
        // Cada interruptor vale al tocarlo: la hoja no guarda nada, así que su salida es la × (regla «Las hojas», ADR-0358), no un botón al pie.
        <Modal
          conCerrar
          titulo="Impresión de este equipo"
          subtitulo={`Solo cambia ${enCelular ? "este celular" : "esta computadora"}.`}
          onClose={() => setAbierto(false)}
        >
          <div className="space-y-4" data-guia="vender.impresion-panel">
            <p className="vd-placa flex items-center gap-3 rounded-xl px-4 py-3 text-sm text-tinta">
              <Icono className="h-5 w-5 shrink-0 text-secundario" aria-hidden />
              {fraseDelDestino(destino, enCelular)}
            </p>
            <div className="space-y-4">
              {esCaja ? (
                <>
                  <Interruptor
                    activo={esEstacion}
                    onActivo={(v) => estacionDeLaCaja.fijar(v ? "si" : "no")}
                    etiqueta="Imprimir lo que se vende en el piso"
                    pie="Las boletas de los celulares salen aquí."
                  />
                  {esEstacion && <Interruptor activo={conVoz} onActivo={(v) => vozDeLaEstacion.fijar(v ? "si" : "no")} etiqueta="Avisar con voz" />}
                </>
              ) : (
                <Interruptor
                  activo={enLaCaja}
                  onActivo={(v) => imprimirEnLaCaja.fijar(v ? "si" : "no")}
                  etiqueta="Imprimir en la caja"
                  pie="La boleta sale en la computadora de la caja."
                />
              )}
              {/* Mandar a la caja gana: con él encendido, «Imprimir solo al cobrar» no tiene qué hacer aquí. */}
              {(esCaja || !enLaCaja) && (
                <Interruptor
                  activo={imprimeSolo}
                  onActivo={(v) => imprimirAlCobrar.fijar(v ? "si" : "no")}
                  etiqueta="Imprimir solo al cobrar"
                  pie="Sin tocar «Imprimir»."
                />
              )}
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
