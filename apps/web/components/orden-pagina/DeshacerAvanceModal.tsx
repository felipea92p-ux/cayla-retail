"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ComboResponsable } from "@/components/ComboResponsable";
import { avisar } from "@/components/ui/Avisos";
import { Boton } from "@/components/ui/campos";
import { Modal } from "@/components/ui/Modal";
import { PieAcciones } from "@/components/ui/PieAcciones";
import { traducirError } from "@/lib/error-escritura";
import { RPC_DESHACER_AVANCE, type EntradaDeTiempo, type OrdenPagina } from "@/lib/orden-pagina-reglas";
import { firmar } from "@/lib/responsable-reglas";
import { createClient } from "@/lib/supabase/client";
import { useResponsable } from "@/lib/useResponsable";

// «Deshacer» de la línea de tiempo (ADR-0400, decisión 7): deshace lo que se anotó de una vez —un «Terminé» de varias tallas son varios avances— con una fila negativa por cada uno; nada
// se borra (principio 4). Pide quién lo hace porque la base firma cada escritura (ADR-0161/0162). Solo se ofrece sobre el último avance de cada talla y color que la fase siguiente todavía
// no usó (la base lo vuelve a comprobar: `deshacer_no_es_el_ultimo`, `deshacer_ya_avanzo`). Un solo control: quién lo hace.

export function DeshacerAvanceModal({ datos, entrada, onClose }: { datos: OrdenPagina; entrada: EntradaDeTiempo; onClose: () => void }) {
  const router = useRouter();
  const responsable = useResponsable({ ubicacionId: datos.orden.ubicacionId, etiqueta: datos.orden.ubicacionNombre });
  const [cargando, setCargando] = useState(false);
  const enVuelo = useRef(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (enVuelo.current || !entrada.avanceIds) return;
    if (!responsable.listo) {
      if (responsable.motivo) avisar.error(responsable.motivo);
      return;
    }
    enVuelo.current = true;
    setCargando(true);
    const firma = responsable.firma();
    let fallo: Parameters<typeof traducirError>[0] = null;
    try {
      const cliente = createClient();
      for (const id of entrada.avanceIds) {
        const { error } = await firmar(cliente.rpc(RPC_DESHACER_AVANCE as never, { p_avance_id: id } as never), firma);
        responsable.despues(error);
        if (error) {
          fallo = error;
          break;
        }
      }
    } finally {
      enVuelo.current = false;
    }
    setCargando(false);
    if (fallo) {
      avisar.error(traducirError(fallo, "deshacer lo que se anotó"));
      router.refresh();
      return;
    }
    avisar.exito("Deshiciste lo que se había anotado", { detalle: `${datos.orden.numeroTexto} · ${entrada.titulo}` });
    onClose();
    router.refresh();
  }

  return (
    <Modal titulo="¿Deshacer esta anotación?" subtitulo={`${entrada.titulo}${entrada.cuanto ? ` · ${entrada.cuanto}` : ""}. Las prendas vuelven a quedar por terminar.`} variante="hoja" onClose={onClose}>
      <form onSubmit={onSubmit} className="mt-3.5 space-y-4">
        <ComboResponsable control={responsable} deshabilitado={cargando} compacto />
        <PieAcciones>
          <Boton type="button" onClick={onClose}>
            Cancelar
          </Boton>
          <Boton type="submit" peso="primario" cargando={cargando} textoCargando="Deshaciendo…" disabled={!responsable.listo} title={responsable.motivo ?? undefined}>{/* unificar-fijo: confirma la hoja «¿Deshacer esta anotación?», que guarda; no es el enlace chico de BotonDeshacer */}Deshacer</Boton>
        </PieAcciones>
      </form>
    </Modal>
  );
}
