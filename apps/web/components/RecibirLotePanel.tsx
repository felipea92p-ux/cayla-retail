"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { RecepcionFormV2 } from "@/components/RecepcionFormV2";
import { RecepcionesRecientes, type CostoRecepcion } from "@/components/RecepcionesRecientes";
import type { RecepcionReciente } from "@/lib/compras-reglas";
import { useColaRecibir } from "@/lib/useColaRecibir";
import { ColaOfflineAviso } from "@/components/ColaOfflineAviso";

type Variante = { varianteId: string; sku: string; referencia: string; talla: string | null; color: string | null };
type Proveedor = { id: string; nombre: string };

// Ingreso sin comprobante (ADR-0111, maqueta 07): la EXCEPCIÓN de recibir. Mercadería que llegó y
// todavía no tiene su comprobante (el proveedor lo manda después), muestras u obsequios. Es el único
// camino que guarda proveedor + guía + costo cuando no hay papel: «Ajustar inventario» sube stock pero no
// guarda ninguno de los tres. La producción propia NO entra por acá: el Taller la ingresa al cerrar la
// orden de producción (`cerrar_produccion`, con su costo real de tela, avíos y maquila).
//
// Vive en Inventario, no como par de Compras: quien recibe contra un comprobante (el camino principal)
// lo hace en Compras → Recibir mercadería. Un colaborador no puede entrar a Compras, así que esta
// pantalla es también su camino para recibir (por eso conserva su acceso en el Inicio y en «+ Nuevo»).
//
// 2026-09-17: antes esta pantalla ERA el formulario — sin lista, sin forma de ver qué se había recibido.
// Mismo patrón que `ColoresLista`/`CategoriasLista` (lista primero, «+ Nuevo» abre un Modal): el
// formulario (`RecepcionFormV2`, sin tocar su lógica de escritura) vive detrás del botón.
export function RecibirLotePanel({
  ubicacionId,
  ubicacionEtiqueta,
  esLider,
  variantes,
  proveedores,
  recepciones,
  costos,
  indicadores,
  aviso,
}: {
  ubicacionId: string;
  ubicacionEtiqueta: string;
  /** El líder puede ir a recibir contra un comprobante (Compras); un colaborador no puede entrar ahí. */
  esLider: boolean;
  variantes: Variante[];
  proveedores: Proveedor[];
  recepciones: RecepcionReciente[];
  /** Costo promedio por lote. Solo para el líder (ADR-0126): sin esto la lista no muestra la columna de costo. */
  costos?: Record<string, CostoRecepcion>;
  indicadores?: ReactNode;
  /** Si falta algo para poder recibir (sin proveedores o sin catálogo), el motivo — en lugar del botón. */
  aviso?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const colaOffline = useColaRecibir();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label-cayla text-[11px] text-tinta/65">Inventario · {ubicacionEtiqueta}</p>
          <h1 className="font-display mt-1 text-2xl text-tinta">Ingreso sin comprobante</h1>
          <p className="mt-1 max-w-2xl text-sm text-tinta/65">
            Mercadería que llegó y todavía no tiene comprobante, o muestras y obsequios. Si tienes el comprobante del proveedor, recibe contra él: así cuenta en la deuda y en el costo.
          </p>
          {esLider && (
            <p className="mt-1 text-xs text-tinta/55">
              ¿Tienes el comprobante?{" "}
              <Link href="/recibir" className="underline decoration-tinta/30 underline-offset-2 hover:text-rojo">
                Recibir contra comprobante
              </Link>
            </p>
          )}
        </div>
        {!aviso && (
          <button
            type="button"
            onClick={() => setAbierto(true)}
            className="label-cayla inline-flex shrink-0 items-center gap-2 rounded-md bg-tinta px-4 py-3 text-[11px] text-crema transition-colors hover:bg-rojo"
          >
            <Plus aria-hidden className="h-3.5 w-3.5" /> Nueva recepción
          </button>
        )}
      </div>

      {/* Lo que se recibió sin red y espera subir (ADR-0210): a la vista aunque el formulario esté cerrado. */}
      <ColaOfflineAviso cola={colaOffline.cola} onDescartar={colaOffline.descartar} uno="recepción" varias="recepciones" />

      {aviso ? (
        <p className="card-cayla p-5 text-sm text-tinta/75">{aviso}</p>
      ) : (
        <>
          {indicadores}
          <div className="space-y-2">
            <p className="label-cayla text-[11px] text-tinta/65">Recepciones sin comprobante · recientes</p>
            <RecepcionesRecientes recepciones={recepciones} costos={costos} vacio="Todavía no se recibió ningún lote sin comprobante en esta ubicación." />
          </div>
        </>
      )}

      {abierto && (
        <Modal
          titulo="Ingreso sin comprobante"
          subtitulo="Mercadería sin comprobante, muestras u obsequios — si tienes el comprobante del proveedor, usa Compras."
          onClose={() => setAbierto(false)}
        >
          <RecepcionFormV2 ubicacionId={ubicacionId} ubicacionEtiqueta={ubicacionEtiqueta} variantes={variantes} proveedores={proveedores} />
        </Modal>
      )}
    </div>
  );
}
