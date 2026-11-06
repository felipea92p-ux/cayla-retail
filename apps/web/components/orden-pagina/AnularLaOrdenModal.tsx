"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ComboResponsable } from "@/components/ComboResponsable";
import { Aviso, AvisoNoSeDeshace } from "@/components/ui/Aviso";
import { avisar } from "@/components/ui/Avisos";
import { Boton, CampoSelect, CampoTexto } from "@/components/ui/campos";
import { Modal } from "@/components/ui/Modal";
import { traducirError } from "@/lib/error-escritura";
import { RPC_ANULAR_CON_TELA_CORTADA, RPC_ANULAR_PRODUCCION, insumosPorDevolver, prendasAfuera, problemaDelDestino, textoAnulasteLaOrden, textoPrendasAfuera, tieneTelaCortada, type DestinoDeLoCortado, type OrdenPagina } from "@/lib/orden-pagina-reglas";
import { firmar } from "@/lib/responsable-reglas";
import { createClient } from "@/lib/supabase/client";
import { useResponsable } from "@/lib/useResponsable";

// «Anular» la orden (ADR-0133, F2; rehecha en la página de la orden en ADR-0400, actividad 6): una orden que se abrió por error o que se canceló. No toca el stock de prendas y SIGUE VISIBLE en
// Terminadas, con su nota, para que no se pierda el registro. Lo que ya se usó de tela y avíos vuelve al estante, cada uno a su lote y a su costo. Con prendas todavía en un servicio no se anula:
// primero su Vuelta, o los faltantes con su motivo (`anular_con_prendas_afuera`). Un solo dato obligatorio —quién la anula—; el motivo es opcional pero queda escrito.

export function AnularLaOrdenModal({ datos, onClose }: { datos: OrdenPagina; onClose: () => void }) {
  const router = useRouter();
  const { orden, fases, insumos } = datos;
  const responsable = useResponsable({ ubicacionId: orden.ubicacionId, etiqueta: orden.ubicacionNombre });
  const [motivo, setMotivo] = useState("");
  const [cargando, setCargando] = useState(false);
  const enVuelo = useRef(false);
  const afuera = prendasAfuera(fases);
  const devuelve = insumosPorDevolver(insumos);
  // Con tela ya cortada se pregunta qué se hace con ella (ADR-0614, P-05): una tela cortada no vuelve a ser un rollo.
  const cortada = tieneTelaCortada(datos);
  const [destino, setDestino] = useState<DestinoDeLoCortado | null>(null);
  const [ordenDestino, setOrdenDestino] = useState("");
  const [otras, setOtras] = useState<{ valor: string; texto: string }[]>([]);
  const faltaDestino = cortada ? problemaDelDestino({ destino, motivo, ordenDestino }) : null;
  useEffect(() => {
    if (destino !== "otra_orden" || otras.length > 0) return;
    void (async () => {
      const { data } = await (createClient().from("producciones").select("id, numero, productos ( referencia )").eq("estado", "en_proceso").eq("ubicacion_id", orden.ubicacionId).neq("id", orden.id).order("numero") as unknown as PromiseLike<{ data: { id: string; numero: number; productos: { referencia: string } | null }[] | null }>);
      setOtras((data ?? []).map((o) => ({ valor: o.id, texto: `OP-${String(o.numero).padStart(6, "0")} · ${o.productos?.referencia ?? ""}` })));
    })();
  }, [destino, otras.length, orden.id, orden.ubicacionId]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (enVuelo.current || afuera || faltaDestino) return;
    if (!responsable.listo) {
      if (responsable.motivo) avisar.error(responsable.motivo);
      return;
    }
    enVuelo.current = true;
    setCargando(true);
    let resultado;
    try {
      resultado = await firmar(
        cortada
          ? createClient().rpc(RPC_ANULAR_CON_TELA_CORTADA as never, { p_produccion_id: orden.id, p_motivo: motivo.trim(), p_destino: destino, p_orden_destino: destino === "otra_orden" ? ordenDestino : null } as never)
          : createClient().rpc(RPC_ANULAR_PRODUCCION as never, { p_produccion_id: orden.id, p_motivo: motivo.trim() === "" ? null : motivo.trim() } as never),
        responsable.firma(),
      );
    } finally {
      enVuelo.current = false;
    }
    const { error } = resultado;
    responsable.despues(error);
    setCargando(false);
    if (error) {
      avisar.error(traducirError(error, "anular la orden", { confirmarAntesDeRepetir: true }));
      return;
    }
    avisar.exito(textoAnulasteLaOrden(orden.producto.referencia));
    onClose();
    router.refresh();
  }

  return (
    <Modal titulo="¿Anulamos esta orden?" subtitulo={`${orden.numeroTexto} · ${orden.producto.referencia} · ${orden.cantidadPlan} ${orden.cantidadPlan === 1 ? "prenda" : "prendas"}`} variante="hoja" tamano="mediana" onClose={onClose}>
      <form onSubmit={onSubmit} className="mt-3.5 space-y-4">
        <p className="text-sm text-tinta/75">
          La orden queda anulada, sin tocar el stock, y sigue a la vista en Terminadas.
        </p>
        {afuera && (
          <Aviso tono="atencion" chico>
            {textoPrendasAfuera(afuera)}
          </Aviso>
        )}
        {cortada && (
          <div className="space-y-3">
            <CampoSelect
              etiqueta="¿Qué se hace con lo cortado?"
              valor={destino ?? ""}
              onValor={(v) => setDestino(v as DestinoDeLoCortado)}
              marcador="Elige qué se hace"
              opciones={[
                { valor: "otra_orden", texto: "Se usa en otra orden" },
                { valor: "liquidar", texto: "Se liquida" },
                { valor: "botar", texto: "Se bota" },
              ]}
              pie={destino === "otra_orden" ? "La tela y su costo pasan a esa orden." : destino ? "La tela no vuelve al estante: su costo queda en esta orden." : "Una tela cortada no vuelve al estante como si fuera un rollo."}
            />
            {destino === "otra_orden" && (
              <CampoSelect etiqueta="A qué orden pasa la tela" valor={ordenDestino} onValor={setOrdenDestino} opciones={otras} marcador={otras.length === 0 ? "No hay otra orden abierta" : "Elige la orden"} />
            )}
          </div>
        )}
        {!cortada && devuelve.length > 0 && (
          <Aviso tono="info" chico>
            <b className="font-semibold">La tela y los avíos que ya se usaron vuelven al estante</b> ({devuelve.map((g) => `${g.nombre} ${g.texto}`).join(", ")}), cada uno a su lote y a su costo. Queda anotado como devolución.
          </Aviso>
        )}
        <CampoTexto id="anular-orden-motivo" etiqueta="Por qué la anulas" pie={cortada ? "Queda escrito en la orden" : "Opcional · queda escrito en la orden"} value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={200} />
        <ComboResponsable control={responsable} deshabilitado={cargando} compacto />
        <AvisoNoSeDeshace />
        <div className="pie-hoja-fijo">
          <div className="pie-acciones border-t border-sand pt-3">
            <Boton type="button" onClick={onClose}>
              Volver
            </Boton>
            <Boton type="submit" peso="primario" cargando={cargando} textoCargando="Anulando…" disabled={!responsable.listo || afuera !== null || faltaDestino !== null} title={afuera ? textoPrendasAfuera(afuera) : (faltaDestino ?? responsable.motivo ?? undefined)}>
              Anular orden
            </Boton>
          </div>
        </div>
      </form>
    </Modal>
  );
}
