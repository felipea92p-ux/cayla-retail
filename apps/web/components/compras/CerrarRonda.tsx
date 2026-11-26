"use client";

import { useRef, useState, type RefObject } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { Aviso } from "@/components/ui/Aviso";
import { Boton } from "@/components/ui/campos";
import { avisar } from "@/components/ui/Avisos";
import { ComboResponsable } from "@/components/ComboResponsable";
import { useSedeActiva } from "@/components/SedeActiva";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { useResponsable } from "@/lib/useResponsable";
import { firmaOmitida } from "@/lib/responsable-omitido";
import { enterNoGuarda } from "@/components/ui/enterNoGuarda";
import { esFalloDeRed, traducirError } from "@/lib/error-escritura";
import { cerrarRondaSinMovimiento } from "@/lib/compradores-acciones";
import type { CampoDeGuia } from "@/lib/guia-campos";

// «Cerrar su ronda» (Compradores, ADR-0704; Felipe 2026-11-26: a los 14 días sin compras se avisa, nadie la cierra sola). Solo se ofrece
// para una ronda sin nada adentro: no hay plata que decidir, el cierre es «se queda» con S/ 0. La base lo vuelve a mirar
// (`cerrar_ronda_sin_movimiento`). Se puede volver a abrir desde «Mis compras», así que no lleva «No se puede deshacer».

export function CerrarRonda({ rondaId, nombre }: { rondaId: string; nombre: string }) {
  const [abierta, setAbierta] = useState(false);
  const origen = useRef<HTMLElement | null>(null);
  return (
    <>
      <Boton
        peso="fantasma"
        data-guia="comprador.cerrar-ronda"
        onClick={(e) => {
          origen.current = e.currentTarget;
          setAbierta(true);
        }}
      >
        Cerrar su ronda
      </Boton>
      {abierta && <CerrarRondaModal rondaId={rondaId} nombre={nombre} onClose={() => setAbierta(false)} volverA={origen} />}
    </>
  );
}

function CerrarRondaModal({ rondaId, nombre, onClose, volverA }: { rondaId: string; nombre: string; onClose: () => void; volverA: RefObject<HTMLElement | null> }) {
  const router = useRouter();
  const [guardando, setGuardando] = useState(false);
  const [rechazo, setRechazo] = useState<{ titulo: string; texto: string; tono: "error" | "atencion" } | null>(null);
  const enVuelo = useRef(false);
  const esPersona = Boolean(useSedeActiva()?.personaSesionId);
  const responsable = useResponsable();

  // Lo que falta = lo que la base rechazaría: desde una terminal, quién la cierra.
  const campos: CampoDeGuia[] = esPersona
    ? []
    : [{ id: "responsable", nombre: "Quién la cierra", requerido: true, hecho: responsable.listo, pendiente: responsable.motivo ?? "Elige quién la cierra." }];
  const guia = useGuiaCampos(campos);

  async function confirmar() {
    if (guardando || enVuelo.current) return;
    if (!guia.puedeConfirmar) {
      const ahora = guia.ahora ?? guia.faltan[0]?.id;
      if (ahora) guia.ir(ahora);
      return;
    }
    enVuelo.current = true;
    try {
      setGuardando(true);
      setRechazo(null);
      const firma = esPersona ? firmaOmitida("ronda_cerrar_sin_movimiento") : responsable.firma();
      const { error } = await cerrarRondaSinMovimiento(rondaId, firma);
      setGuardando(false);
      if (!esPersona) responsable.despues(error);
      if (error) {
        setRechazo(
          esFalloDeRed(error)
            ? { titulo: "Se cortó la conexión", texto: "No sabemos si alcanzó a cerrarse. Vuelve a tocar el botón: si ya se cerró, no se repite.", tono: "atencion" }
            : { titulo: "No se cerró", texto: traducirError(error, "cerrar la ronda"), tono: "error" },
        );
        return;
      }
      avisar.exito(`Cerraste la ronda de ${nombre}`, { detalle: "Si vuelve a comprar, abre otra desde «Mis compras»." });
      onClose();
      router.refresh();
    } finally {
      enVuelo.current = false;
    }
  }

  return (
    <Modal titulo={`Cerrar la ronda de ${nombre}`} subtitulo="No tiene compras, gastos ni plata." onClose={onClose} variante="hoja" alCerrarEnfocar={volverA}>
      {(cerrar) => (
        <form
          onKeyDown={enterNoGuarda}
          onSubmit={(e) => {
            e.preventDefault();
            void confirmar();
          }}
          className="space-y-5"
        >
          {!esPersona && (
            <CampoGuiado id="responsable" guia={guia} titulo="Quién la cierra">
              <ComboResponsable control={responsable} deshabilitado={guardando} />
            </CampoGuiado>
          )}
          {rechazo && (
            <Aviso tono={rechazo.tono} titulo={rechazo.titulo}>
              {rechazo.texto}
            </Aviso>
          )}
          {!rechazo && <PieGuia guia={guia} listo="Todo listo para cerrarla." conFrase />}
          <div className="pie-hoja-fijo flex justify-end gap-3 pt-1">
            <Boton type="button" onClick={cerrar} disabled={guardando}>
              Cancelar
            </Boton>
            <Boton textoCargando="Cerrando…" type="submit" peso="primario" cargando={guardando} confirma={guia} title={guia.frase ?? undefined} className={guia.claseConfirmar}>
              Cerrar su ronda
            </Boton>
          </div>
        </form>
      )}
    </Modal>
  );
}
