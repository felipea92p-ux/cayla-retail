"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { Aviso } from "@/components/ui/Aviso";
import { Boton } from "@/components/ui/campos";
import { Modal, campoEtiqueta } from "@/components/ui/Modal";
import { ChipOpcion } from "@/components/alta-producto/piezas";
import { ComboResponsable } from "@/components/ComboResponsable";
import { useResponsable } from "@/lib/useResponsable";
import { firmar } from "@/lib/responsable-reglas";
import { fraseDeLaTallaNueva, tallasQueFaltan } from "@/lib/agregar-variantes-orden-reglas";
import type { CategoriaDeModelo } from "@/lib/modelo-nuevo-reglas";

// «+ Talla» de la matriz de Nueva orden (Felipe, 2026-10-31): una talla que le falta al modelo se agrega aquí, sin salir a Catálogo ▸ Editar producto. La base
// (`agregar_variantes_a_modelo`, 20261031172000) crea una prenda por cada color del modelo, con su precio y su costo y sin stock, y vuelve a comprobar todo.
//
// Va SIN `<form>` a propósito: la hoja se abre desde dentro del formulario de la orden y React hace subir los eventos de un portal por sus ancestros (ADR-0128), así que
// un «submit» de acá abriría la orden entera. Un botón normal no tiene ese riesgo.

// La función es nueva (migración 20261031172000) y los tipos generados no la conocen: se llama por su nombre.
const RPC_AGREGAR_VARIANTES = "agregar_variantes_a_modelo";

export function AgregarTallaModal({
  tallerId,
  productoId,
  referencia,
  categoria,
  variantes,
  onClose,
}: {
  tallerId: string;
  productoId: string;
  referencia: string;
  categoria: CategoriaDeModelo | null;
  variantes: readonly { talla: string | null; color: string | null }[];
  onClose: () => void;
}) {
  const router = useRouter();
  const responsable = useResponsable();
  const faltan = tallasQueFaltan(categoria, variantes);
  const [elegidaId, setElegidaId] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const enVuelo = useRef(false);
  const elegida = faltan.find((t) => t.id === elegidaId) ?? null;

  async function agregar() {
    if (!elegida || enVuelo.current) return;
    if (!responsable.listo) {
      if (responsable.motivo) avisar.error(responsable.motivo);
      return;
    }
    enVuelo.current = true;
    setCargando(true);
    let resultado;
    try {
      resultado = await firmar(
        createClient().rpc(RPC_AGREGAR_VARIANTES as never, { p_ubicacion_id: tallerId, p_producto_id: productoId, p_talla_id: elegida.id, p_color_codigo: null } as never),
        responsable.firma()
      );
    } finally {
      enVuelo.current = false;
    }
    const { error } = resultado;
    responsable.despues(error);
    setCargando(false);
    if (error) {
      avisar.error(traducirError(error, "agregar la talla", { confirmarAntesDeRepetir: true }));
      return;
    }
    avisar.exito(`Talla ${elegida.valor} agregada a ${referencia}`);
    onClose();
    // El modelo vuelve con su talla nueva: la tabla de la orden la dibuja sin perder lo que ya se escribió.
    router.refresh();
  }

  return (
    <Modal titulo="Agregar una talla" subtitulo={`A ${referencia}. Queda en el catálogo, como si la hubieras agregado desde Editar producto.`} variante="hoja" tamano="angosta" onClose={onClose}>
      <div className="mt-3.5 space-y-5">
        <div className="space-y-2">
          <span className={campoEtiqueta}>Qué talla</span>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Tallas que le faltan al modelo">
            {faltan.map((t) => (
              <ChipOpcion key={t.id} elegido={t.id === elegidaId} onClick={() => setElegidaId(t.id === elegidaId ? null : t.id)} disabled={cargando}>
                {t.valor}
              </ChipOpcion>
            ))}
          </div>
        </div>

        {elegida && (
          <Aviso tono="info" chico>
            {fraseDeLaTallaNueva(elegida.valor, variantes)}
          </Aviso>
        )}

        <ComboResponsable control={responsable} deshabilitado={cargando} compacto />

        <div className="pie-hoja-fijo">
          <div className="pie-acciones border-t border-sand pt-3">
            <Boton type="button" onClick={onClose} disabled={cargando}>
              Cancelar
            </Boton>
            <Boton
              type="button"
              peso="primario"
              cargando={cargando}
              textoCargando="Agregando…"
              onClick={agregar}
              disabled={!elegida || !responsable.listo}
              title={!elegida ? "Elige la talla que falta." : (responsable.motivo ?? undefined)}
            >
              {elegida ? `Agregar la talla ${elegida.valor}` : "Agregar la talla"}
            </Boton>
          </div>
        </div>
      </div>
    </Modal>
  );
}
