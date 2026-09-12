"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { esFalloDeRed, traducirError } from "@/lib/error-escritura";
import {
  conStockComprometidoDescontado,
  hayConexionAlServidor,
  obtenerColaSede,
  quitarDeCola,
  totalEfectivoEncolado,
  type VentaEncolada,
} from "@/lib/ventas-offline";
import { AbrirCajaModal } from "@/components/AbrirCajaModal";
import { PuntoDeVenta } from "@/components/PuntoDeVenta";
import { CerrarCajaModal } from "@/components/CerrarCajaModal";
import type { ReactNode } from "react";

type VarianteBusqueda = {
  varianteId: string;
  codigo: string | null;
  sku: string;
  referencia: string;
  talla: string | null;
  color: string | null;
  categoria: string | null;
  precio: number | null;
  stockAqui: number;
};

type CajaAbierta = { id: string; montoApertura: number; abiertaEn: string };

type Props = {
  sedeId: string;
  sedeCodigo: string;
  cajaAbierta: CajaAbierta | null;
  variantes: VarianteBusqueda[];
  porCodigoBarras: Record<string, string>;
  ventasHoyNode: ReactNode;
};

/**
 * La cola de ventas offline sube sola (Paso 3D, ADR-0036): al montar, al volver la red
 * (evento `online`) y con un latido cada 30 s por si el navegador nunca dispara ese evento
 * (pasa en algunas redes corporativas y en el `next start` de pruebas). Las tres corren la
 * MISMA función — no hay una ruta especial para "recién volvió la red" — porque las tres
 * describen la misma pregunta: ¿hay algo pendiente y ahora se puede subir?
 *
 * Corre SIEMPRE, tenga o no la sede una caja abierta ahora mismo (Paso 3.1): una venta
 * encolada con la caja de ayer, ya cerrada, tiene que seguir intentando subir hoy — de lo
 * contrario cerrar la caja la deja huérfana para siempre (ver `ventas-offline.ts`).
 */
const LATIDO_MS = 30_000;

export function CajaPanel({
  sedeId,
  sedeCodigo,
  cajaAbierta,
  variantes,
  porCodigoBarras,
  ventasHoyNode,
}: Props) {
  const router = useRouter();
  const [modal, setModal] = useState<"abrir" | "cerrar" | null>(null);
  // La sede que describe `cola` ahora mismo. Si `sedeCodigo` cambia (la Encargada cambia de
  // sede sin que este componente se desmonte), se ajusta ACÁ, durante el render — no en un
  // `useEffect` con un `setState` síncrono al inicio, que React desaconseja porque encadena
  // un render extra evitable (react-hooks/set-state-in-effect). El patrón "ajustar estado
  // durante el render" es el que React mismo recomienda para esto.
  const [sedeDeLaCola, setSedeDeLaCola] = useState(sedeCodigo);
  const [cola, setCola] = useState<VentaEncolada[]>(() => obtenerColaSede(sedeCodigo));
  if (sedeCodigo !== sedeDeLaCola) {
    setSedeDeLaCola(sedeCodigo);
    setCola(obtenerColaSede(sedeCodigo));
  }
  const [sinConexion, setSinConexion] = useState(false);
  const [rechazos, setRechazos] = useState<Record<string, string>>({});
  // El token que está mostrando su confirmación de "Descartar" — nunca se descarta con un
  // solo click, porque es plata que de verdad se cobró (ver `descartar()`).
  const [confirmandoDescarte, setConfirmandoDescarte] = useState<string | null>(null);
  // Evita que un latido que tardó (la pestaña se puso en segundo plano, por ejemplo) siga
  // escribiendo estado después de que el componente ya se desmontó.
  const vigente = useRef(true);

  useEffect(() => {
    vigente.current = true;

    async function sincronizar() {
      const enLinea = await hayConexionAlServidor();
      if (!vigente.current) return;
      setSinConexion(!enLinea);
      if (!enLinea) return;

      const pendientes = obtenerColaSede(sedeCodigo);
      if (pendientes.length === 0) return;

      const supabase = createClient();
      let huboExito = false;
      const nuevosRechazos: Record<string, string> = {};

      for (const venta of pendientes) {
        // `venta.cajaId` es la caja de CUANDO se vendió, no necesariamente la que está
        // abierta ahora — puede ser una que ya cerró. La RPC decide sola si la acepta.
        const { error } = await supabase.rpc("registrar_venta", {
          p_caja_id: venta.cajaId,
          p_metodo_pago: venta.metodoPago,
          p_items: venta.items.map((it) => ({ variante_id: it.varianteId, cantidad: it.cantidad, monto: it.monto })),
          p_token: venta.token,
        });
        if (!vigente.current) return;

        if (!error) {
          quitarDeCola(venta.token);
          huboExito = true;
          continue;
        }
        if (esFalloDeRed(error)) {
          // El resto de la cola fallaría por la misma razón — insistir ahora no suma nada,
          // el siguiente latido lo vuelve a intentar.
          setSinConexion(true);
          break;
        }
        // El servidor SÍ respondió y rechazó la venta (la caja se cerró mientras tanto, por
        // ejemplo). No se borra — borrarla sería perder una venta que ya se le cobró a la
        // clienta — pero sí hay que decirlo, con la referencia, para que alguien lo resuelva.
        nuevosRechazos[venta.token] = traducirError(error, "subir esta venta");
      }

      setCola(obtenerColaSede(sedeCodigo));
      if (Object.keys(nuevosRechazos).length > 0) {
        setRechazos((actual) => ({ ...actual, ...nuevosRechazos }));
      }
      // El refresco va acá, no en cada venta: uno solo al final de la tanda, para que
      // "Ventas de hoy" quede al día sin repintar la pantalla una vez por venta subida.
      if (huboExito) router.refresh();
    }

    sincronizar();
    const intervalo = setInterval(sincronizar, LATIDO_MS);
    window.addEventListener("online", sincronizar);
    return () => {
      vigente.current = false;
      clearInterval(intervalo);
      window.removeEventListener("online", sincronizar);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sedeCodigo]);

  /**
   * Descartar una venta rechazada para siempre (Paso 3.1, deuda cerrada). Es la única
   * salida cuando el rechazo no se va a resolver solo — una caja cerrada no reabre, así
   * que insistir cada 30 s es ruido permanente en la pantalla de quien sea que la vea.
   *
   * ESTO NO REGISTRA LA VENTA NI CORRIGE EL STOCK. Solo borra el intento local — la fila
   * jamás llegó a existir en `ventas` (el rechazo pasó antes de eso), así que no hay nada
   * que revertir en el servidor. Si la prenda de verdad salió de la tienda, alguien tiene
   * que anotarlo a mano (un ajuste en Inventario, o registrar la venta de nuevo) — es
   * plata que se cobró, y la confirmación de abajo lo dice explícito para que no se pierda
   * de vista solo porque el aviso rojo desapareció.
   */
  function descartar(token: string) {
    quitarDeCola(token);
    setCola(obtenerColaSede(sedeCodigo));
    setRechazos((actual) => {
      const resto = { ...actual };
      delete resto[token];
      return resto;
    });
    setConfirmandoDescarte(null);
  }

  // El overlay (Paso 3C): lo que la cola ya vendió sin subir se descuenta EN PANTALLA de
  // `stockAqui`, para que una segunda venta sin red no vea unidades que ya no existen.
  const variantesConOverlay = conStockComprometidoDescontado(variantes, cola);
  const efectivoEncolado = totalEfectivoEncolado(cola);

  // Estos avisos van ARRIBA de las dos ramas (caja abierta/cerrada) a propósito (Paso
  // 3.1): una venta puede seguir esperando subir con la caja que la generó ya cerrada, y
  // la Encargada que entra después —a abrir una caja nueva, o a mirar sin abrir nada— tiene
  // que verla igual. Antes vivían solo dentro de "caja abierta" y desaparecían apenas
  // cerraba, que es justo el síntoma del bug que este paso corrige.
  const avisos = (
    <>
      {sinConexion && (
        <div className="card-cayla border-ambar/50 bg-ambar/10 p-4 text-sm text-ambar-profundo">
          <p className="font-medium">Sin conexión con el servidor.</p>
          <p className="mt-1 leading-relaxed">
            Puedes seguir vendiendo: las ventas se guardan en este equipo y suben solas apenas vuelva la señal.
            Mientras tanto no se puede emitir comprobante para lo que vendas ahora.
          </p>
        </div>
      )}
      {!sinConexion && cola.length > 0 && (
        <div className="card-cayla border-ambar/50 bg-ambar/10 p-3 text-xs text-ambar-profundo">
          Subiendo {cola.length} {cola.length === 1 ? "venta guardada" : "ventas guardadas"} sin conexión…
        </div>
      )}
      {Object.entries(rechazos).map(([token, mensaje]) => {
        const venta = cola.find((v) => v.token === token);
        const monto = venta?.items.reduce((acc, it) => acc + it.cantidad * it.monto, 0) ?? null;
        return (
          <div key={token} className="card-cayla border-rojo/40 bg-rojo/10 p-3 text-xs text-rojo-profundo">
            <p>Una venta guardada sin conexión no pudo subir: {mensaje}</p>
            {confirmandoDescarte === token ? (
              <div className="mt-2 space-y-2 border-t border-rojo/25 pt-2 leading-relaxed">
                <p>
                  Esto NO registra la venta ni corrige el stock — solo hace que el sistema deje de intentar
                  subirla{monto !== null ? ` (era S/${monto.toFixed(2)})` : ""}. Si la clienta sí se llevó la
                  prenda, ajusta el stock a mano en Inventario y anota la venta donde corresponda.
                </p>
                <div className="flex gap-3">
                  <button type="button" onClick={() => setConfirmandoDescarte(null)} className="underline">
                    Cancelar
                  </button>
                  <button type="button" onClick={() => descartar(token)} className="font-medium underline">
                    Sí, descartar
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => setConfirmandoDescarte(token)} className="mt-1 underline">
                Descartar
              </button>
            )}
          </div>
        );
      })}
    </>
  );

  // El catálogo y el ticket se ven SIEMPRE, caja abierta o no (pedido de Felipe,
  // 2026-09-12): con la caja cerrada, PuntoDeVenta se dibuja igual pero desactivado
  // (opacidad + pointer-events-none, más `disabled` real en cada control — no solo
  // visual), y el botón que abre/cierra la caja es el único que sigue activo.
  return (
    <>
      <PuntoDeVenta
        sedeId={sedeId}
        sedeCodigo={sedeCodigo}
        cajaId={cajaAbierta?.id ?? null}
        variantes={variantesConOverlay}
        porCodigoBarras={porCodigoBarras}
        sinConexion={sinConexion}
        colaCount={cola.length}
        avisos={avisos}
        ventasHoyNode={ventasHoyNode}
        onVentaEncolada={() => setCola(obtenerColaSede(sedeCodigo))}
        onAbrirCerrarCaja={() => setModal(cajaAbierta ? "cerrar" : "abrir")}
      />
      {modal === "abrir" && <AbrirCajaModal sedeId={sedeId} sedeCodigo={sedeCodigo} onClose={() => setModal(null)} />}
      {modal === "cerrar" && cajaAbierta && (
        <CerrarCajaModal
          cajaId={cajaAbierta.id}
          sedeCodigo={sedeCodigo}
          efectivoEncoladoSinSubir={efectivoEncolado}
          onClose={() => setModal(null)}
        />
      )}
    </>
  );
}
