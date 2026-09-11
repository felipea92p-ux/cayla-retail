"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { esFalloDeRed, traducirError } from "@/lib/error-escritura";
import {
  conStockComprometidoDescontado,
  hayConexionAlServidor,
  obtenerCola,
  quitarDeCola,
  type VentaEncolada,
} from "@/lib/ventas-offline";
import { AbrirCajaModal } from "@/components/AbrirCajaModal";
import { RegistrarVentaModal } from "@/components/RegistrarVentaModal";
import { CerrarCajaModal } from "@/components/CerrarCajaModal";

type VarianteBusqueda = {
  varianteId: string;
  sku: string;
  referencia: string;
  talla: string | null;
  color: string | null;
  precio: number | null;
  stockAqui: number;
};

type CajaAbierta = { id: string; montoApertura: number; abiertaEn: string };

type Props = {
  sedeId: string;
  sedeCodigo: string;
  cajaAbierta: CajaAbierta | null;
  variantes: VarianteBusqueda[];
};

/**
 * La cola de ventas offline sube sola (Paso 3D, ADR-0033): al montar, al volver la red
 * (evento `online`) y con un latido cada 30 s por si el navegador nunca dispara ese evento
 * (pasa en algunas redes corporativas y en el `next start` de pruebas). Las tres corren la
 * MISMA función — no hay una ruta especial para "recién volvió la red" — porque las tres
 * describen la misma pregunta: ¿hay algo pendiente y ahora se puede subir?
 */
const LATIDO_MS = 30_000;

export function CajaPanel({ sedeId, sedeCodigo, cajaAbierta, variantes }: Props) {
  const router = useRouter();
  const [modal, setModal] = useState<"abrir" | "vender" | "cerrar" | null>(null);
  const [cola, setCola] = useState<VentaEncolada[]>(() => (cajaAbierta ? obtenerCola(cajaAbierta.id) : []));
  const [sinConexion, setSinConexion] = useState(false);
  const [rechazos, setRechazos] = useState<Record<string, string>>({});
  // Evita que un latido que tardó (la pestaña se puso en segundo plano, por ejemplo) siga
  // escribiendo estado después de que la caja ya cambió o el componente se desmontó.
  const vigente = useRef(true);

  const cajaId = cajaAbierta?.id ?? null;

  useEffect(() => {
    vigente.current = true;
    if (!cajaId) return;
    setCola(obtenerCola(cajaId));

    async function sincronizar() {
      const enLinea = await hayConexionAlServidor();
      if (!vigente.current) return;
      setSinConexion(!enLinea);
      if (!enLinea) return;

      const pendientes = obtenerCola(cajaId!);
      if (pendientes.length === 0) return;

      const supabase = createClient();
      let huboExito = false;
      const nuevosRechazos: Record<string, string> = {};

      for (const venta of pendientes) {
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

      setCola(obtenerCola(cajaId!));
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
  }, [cajaId]);

  // El overlay (Paso 3C): lo que la cola ya vendió sin subir se descuenta EN PANTALLA de
  // `stockAqui`, para que una segunda venta sin red no vea unidades que ya no existen.
  const variantesConOverlay = conStockComprometidoDescontado(variantes, cola);

  if (!cajaAbierta) {
    return (
      <div className="flex items-center justify-between card-cayla p-5">
        <div>
          <p className="label-cayla text-[11px] text-rojo">Caja cerrada</p>
          <p className="mt-1.5 text-sm text-tinta/75">Abre la caja de {sedeCodigo} para registrar ventas hoy.</p>
        </div>
        <button
          onClick={() => setModal("abrir")}
          className="label-cayla rounded-md shrink-0 bg-tinta px-4 py-2.5 text-[11px] text-crema transition-colors hover:bg-rojo"
        >
          Abrir caja
        </button>
        {modal === "abrir" && <AbrirCajaModal sedeId={sedeId} sedeCodigo={sedeCodigo} onClose={() => setModal(null)} />}
      </div>
    );
  }

  return (
    <div className="space-y-3">
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
      {Object.entries(rechazos).map(([token, mensaje]) => (
        <div key={token} className="card-cayla border-rojo/40 bg-rojo/10 p-3 text-xs text-rojo-profundo">
          Una venta guardada sin conexión no pudo subir: {mensaje}
        </div>
      ))}

      <div className="flex items-center justify-between card-cayla p-5">
        <div>
          <p className="label-cayla text-[11px] text-tinta/70">Caja abierta · {sedeCodigo}</p>
          <p className="mt-1.5 text-sm text-tinta/75">
            Apertura <span className="font-display text-base text-tinta">S/{cajaAbierta.montoApertura.toFixed(2)}</span>
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            onClick={() => setModal("vender")}
            className="label-cayla rounded-md bg-tinta px-4 py-2.5 text-[11px] text-crema transition-colors hover:bg-rojo"
          >
            Vender
          </button>
          <button
            onClick={() => setModal("cerrar")}
            className="label-cayla rounded-md border border-tinta/25 px-4 py-2.5 text-[11px] text-tinta transition-colors hover:border-rojo hover:text-rojo"
          >
            Cerrar
          </button>
        </div>

        {modal === "vender" && (
          <RegistrarVentaModal
            sedeCodigo={sedeCodigo}
            cajaId={cajaAbierta.id}
            variantes={variantesConOverlay}
            sinConexion={sinConexion}
            onVentaEncolada={() => setCola(obtenerCola(cajaAbierta.id))}
            onClose={() => setModal(null)}
          />
        )}
        {modal === "cerrar" && (
          <CerrarCajaModal cajaId={cajaAbierta.id} sedeCodigo={sedeCodigo} onClose={() => setModal(null)} />
        )}
      </div>
    </div>
  );
}
