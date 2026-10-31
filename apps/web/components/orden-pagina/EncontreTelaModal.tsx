"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { avisar } from "@/components/ui/Avisos";
import { Boton, CampoSelect, CampoTexto } from "@/components/ui/campos";
import { Modal } from "@/components/ui/Modal";
import { useSalidaSinGuardar } from "@/components/ui/useSalidaSinGuardar";
import { soles } from "@/lib/compras-reglas";
import { traducirError } from "@/lib/error-escritura";
import { camposDeTelaEncontrada } from "@/lib/orden-pagina-guia";
import { cantidadConUnidad, type OrdenPagina } from "@/lib/orden-pagina-reglas";
import { RPC_ENCONTRE_TELA, leerCantidad, leerQuedo, problemaDeTelaEncontrada, telasDeLaOrden } from "@/lib/orden-tela-usada-reglas";
import { firmar } from "@/lib/responsable-reglas";
import { fotoFormulario } from "@/lib/salida-sin-guardar";
import { createClient } from "@/lib/supabase/client";
import { useResponsable } from "@/lib/useResponsable";

// «Encontré tela» (ADR-0570, actividad 4; Felipe 2026-10-29: «retazos o tela sin registrar», con el último precio si no se sabe). Un retazo o un rollo que nunca se anotó entra al estante
// del Taller como un lote más, con su origen a la vista («encontrada»): sin factura ni pago. El precio por metro solo lo escribe quien ve los costos; vacío, la base toma el del último lote
// de esa tela. Después ya se puede anotar lo que quedó. Un doble clic no anota dos veces: la marca síncrona y el token de la llamada (`encontre_tela`, ADR-0190).

export function EncontreTelaModal({ datos, onClose }: { datos: OrdenPagina; onClose: () => void }) {
  const router = useRouter();
  const responsable = useResponsable({ ubicacionId: datos.orden.ubicacionId, etiqueta: datos.orden.ubicacionNombre });
  const telas = useMemo(() => telasDeLaOrden(datos.insumos).filter((t) => t.tipo === "tela"), [datos.insumos]);
  const [insumoId, setInsumoId] = useState(telas.length === 1 ? telas[0].insumoId : "");
  const [cantidad, setCantidad] = useState("");
  const [precio, setPrecio] = useState("");
  const [nota, setNota] = useState("");
  const [cargando, setCargando] = useState(false);
  const [token] = useState(() => crypto.randomUUID());
  const enVuelo = useRef(false);
  const veCostos = datos.permisos.veCostos;
  const tela = telas.find((t) => t.insumoId === insumoId) ?? null;

  const problema = problemaDeTelaEncontrada(cantidad, veCostos ? precio : "");
  const guia = useGuiaCampos(camposDeTelaEncontrada({ problema, responsableListo: responsable.listo, colorElegido: tela !== null }));

  const fotoActual = fotoFormulario({ insumoId, cantidad, precio, nota });
  const [fotoAlAbrir] = useState(fotoActual);
  const avisoSalida = useSalidaSinGuardar(fotoActual !== fotoAlAbrir, "Escribiste la tela que encontraste y todavía no se guardó. Si cierras ahora, se pierde lo que escribiste.");
  function cerrarTrasGuardar() {
    const guardiaFuera = avisoSalida.retirarYa();
    onClose();
    void guardiaFuera.then(() => router.refresh());
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (enVuelo.current || !tela) return;
    const n = leerCantidad(cantidad);
    if (problema || n === null) {
      avisar.error(problema ?? "Escribe cuánta tela encontraste.");
      return;
    }
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
          RPC_ENCONTRE_TELA as never,
          {
            p_insumo_id: tela.insumoId,
            p_ubicacion_id: datos.orden.ubicacionId,
            p_cantidad: n,
            p_costo_unitario: veCostos && precio.trim() !== "" ? leerQuedo(precio) : null,
            p_nota: nota.trim() === "" ? null : nota.trim(),
            p_token: token,
          } as never
        ),
        responsable.firma()
      );
    } finally {
      enVuelo.current = false;
    }
    const { data, error } = resultado as { data: { costo_unitario?: number; precio?: string } | null; error: { message: string } | null };
    responsable.despues(error);
    setCargando(false);
    if (error) {
      avisar.error(traducirError(error, "anotar la tela que encontraste", { confirmarAntesDeRepetir: true }));
      return;
    }
    const costo = typeof data?.costo_unitario === "number" ? data.costo_unitario : null;
    avisar.exito(`Anotaste ${cantidadConUnidad(n, tela.unidad)} de ${tela.nombre} encontrada`, {
      detalle: veCostos && costo !== null ? `${data?.precio === "ultimo" ? "Al último precio" : "Al precio que escribiste"}: ${soles(costo)} el metro` : "Ya puedes anotar lo que quedó",
    });
    cerrarTrasGuardar();
  }

  return (
    <Modal
      titulo="¿Qué tela encontraste?"
      subtitulo="Entra al estante del Taller, sin factura ni pago."
      variante="hoja"
      tamano="mediana"
      onClose={onClose}
      antesDeCerrar={avisoSalida.pedirAccion}
    >
      <form onSubmit={onSubmit} className="mt-3.5 space-y-5">
        {telas.length === 0 ? (
          <p className="text-sm text-tinta/75">Esta orden no declaró qué tela lleva: decláralo primero con «Editar».</p>
        ) : (
          <>
            <div data-guia="prod-orden-encontre.cantidad" className="space-y-4">
              <CampoGuiado id="color" guia={guia}>
                <CampoSelect etiqueta={guia.etiqueta("color", "Qué tela")} id="encontre-tela" valor={insumoId} onValor={setInsumoId} opciones={telas.map((t) => ({ valor: t.insumoId, texto: t.nombre }))} marcador="Elige" />
              </CampoGuiado>
              <div className="grid gap-4 sm:grid-cols-2">
                <CampoGuiado id="cantidad" guia={guia}>
                  <CampoTexto
                    id="encontre-cantidad"
                    etiqueta={guia.etiqueta("cantidad", `Cuántos ${tela && tela.unidad !== "metro" ? tela.unidad : "metros"} encontraste`)}
                    inputMode="decimal"
                    pie={tela ? `En el estante hay ${cantidadConUnidad(tela.saldo, tela.unidad)}` : undefined}
                    value={cantidad}
                    onChange={(e) => setCantidad(e.target.value)}
                    maxLength={12}
                  />
                </CampoGuiado>
                {veCostos && (
                  <CampoTexto id="encontre-precio" etiqueta="Precio por metro" pie="Opcional: vacío, va el último precio de esta tela" inputMode="decimal" value={precio} onChange={(e) => setPrecio(e.target.value)} maxLength={10} />
                )}
              </div>
              <CampoTexto id="encontre-nota" etiqueta="Dónde estaba" pie="Opcional" value={nota} onChange={(e) => setNota(e.target.value)} maxLength={200} />
            </div>

            <div data-guia="prod-orden-encontre.cierre" className="space-y-3">
              <CampoGuiado id="quien" guia={guia}>
                <ComboResponsable control={responsable} deshabilitado={cargando} compacto />
              </CampoGuiado>
              <PieGuia guia={guia} listo="Todo listo para anotar." conFrase />
            </div>
          </>
        )}

        <div className="pie-hoja-fijo">
          <div className="pie-acciones border-t border-sand pt-3">
            <Boton type="button" onClick={() => avisoSalida.pedirAccion(onClose)}>
              Cancelar
            </Boton>
            {telas.length > 0 && (
              <Boton type="submit" peso="primario" cargando={cargando} textoCargando="Anotando…" disabled={!guia.puedeConfirmar} title={guia.frase ?? responsable.motivo ?? undefined} className={guia.claseConfirmar}>
                Anotar la tela
              </Boton>
            )}
          </div>
        </div>
      </form>
      {avisoSalida.aviso}
    </Modal>
  );
}
