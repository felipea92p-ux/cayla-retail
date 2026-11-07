"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { useResponsable } from "@/lib/useResponsable";
import { firmar } from "@/lib/responsable-reglas";

// Lo que comparten «+ Talla» y «+ Color» de la matriz de Nueva orden: la llamada a la base, el responsable firmado y el refresco del modelo. La base
// (`agregar_variantes_a_modelo`, 20261031172000) crea una prenda por cada combinación nueva, con el precio y el costo de su hermana y sin stock, todo o nada.

// La función es nueva (migración 20261031172000) y los tipos generados no la conocen: se llama por su nombre.
const RPC_AGREGAR_VARIANTES = "agregar_variantes_a_modelo";

export type LoQueSeAgrega = { tallaIds: string[] } | { colorCodigos: string[] };

export function useAgregarVariantes({ tallerId, productoId, onClose }: { tallerId: string; productoId: string; onClose: () => void }) {
  const router = useRouter();
  const responsable = useResponsable();
  const [cargando, setCargando] = useState(false);
  const enVuelo = useRef(false);

  /** Agrega y, si la base lo acepta, avisa, cierra la hoja y vuelve a leer el modelo (la tabla de la orden dibuja lo nuevo sin perder lo ya escrito). */
  async function agregar(que: LoQueSeAgrega, mensajeExito: string, verbo: string) {
    if (enVuelo.current) return;
    if (!responsable.listo) {
      if (responsable.motivo) avisar.error(responsable.motivo);
      return;
    }
    enVuelo.current = true;
    setCargando(true);
    let resultado;
    try {
      resultado = await firmar(
        createClient().rpc(
          RPC_AGREGAR_VARIANTES as never,
          {
            p_ubicacion_id: tallerId,
            p_producto_id: productoId,
            p_talla_ids: "tallaIds" in que ? que.tallaIds : null,
            p_color_codigos: "colorCodigos" in que ? que.colorCodigos : null,
          } as never
        ),
        responsable.firma()
      );
    } finally {
      enVuelo.current = false;
    }
    const { error } = resultado;
    responsable.despues(error);
    setCargando(false);
    if (error) {
      avisar.error(traducirError(error, verbo, { confirmarAntesDeRepetir: true }));
      return;
    }
    avisar.exito(mensajeExito);
    onClose();
    router.refresh();
  }

  return { responsable, cargando, agregar };
}
