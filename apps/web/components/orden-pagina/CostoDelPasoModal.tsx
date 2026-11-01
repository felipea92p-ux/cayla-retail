"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { Aviso } from "@/components/ui/Aviso";
import { avisar } from "@/components/ui/Avisos";
import { Boton, CampoMonto } from "@/components/ui/campos";
import { enterNoGuarda } from "@/components/ui/enterNoGuarda";
import { Modal, campoEtiqueta } from "@/components/ui/Modal";
import { PieAcciones } from "@/components/ui/PieAcciones";
import { useSalidaSinGuardar } from "@/components/ui/useSalidaSinGuardar";
import { traducirError } from "@/lib/error-escritura";
import { cajasDelCosto, cambiaElCostoDelPaso, leerCostoDelPaso, lineaDelCostoDelPaso } from "@/lib/orden-costo-paso-reglas";
import { camposDeCostoDelPaso } from "@/lib/orden-pagina-guia";
import { RPC_PONER_COSTO_A_FASE, tieneCostoPropio, textoCostoDelPaso, type FasePagina, type OrdenPagina } from "@/lib/orden-pagina-reglas";
import { firmar } from "@/lib/responsable-reglas";
import { fotoFormulario } from "@/lib/salida-sin-guardar";
import { createClient } from "@/lib/supabase/client";
import { useResponsable } from "@/lib/useResponsable";

// «Poner costo» a un paso que hace el Taller (ADR-0597): Habilitado, Costura, Planchado… Hasta hoy solo costaban los pasos que salen afuera; lo que cuesta preparar o coser en el Taller no
// entraba al costo de la prenda. Son los mismos dos datos de un servicio —cuánto por prenda y/o cuánto por toda la orden— y el costo SIGUE a las prendas terminadas: no se teclea un total que
// después no cuadre con lo hecho. Vale también con el paso ya hecho (la base no deja cambiar quién lo hizo, pero sí lo que cuesta), mientras la orden siga en proceso. Quitar el costo es un
// botón aparte, a la izquierda y en rojo: dejar las dos cajas vacías no borra nada por descuido. La base repite todo (`poner_costo_a_fase`) y deja el cambio en Actividad con su firma.

export function CostoDelPasoModal({ datos, fase, onClose }: { datos: OrdenPagina; fase: FasePagina; onClose: () => void }) {
  const router = useRouter();
  const responsable = useResponsable({ ubicacionId: datos.orden.ubicacionId, etiqueta: datos.orden.ubicacionNombre });
  const llevaCosto = tieneCostoPropio(fase);
  const [cajas, setCajas] = useState(() => cajasDelCosto(llevaCosto ? fase : { tarifaPrenda: null, fijoOrden: 0 }));
  const [cargando, setCargando] = useState<"guardar" | "quitar" | null>(null);
  const enVuelo = useRef(false);
  const prendas = datos.orden.cantidadPlan;
  const leido = leerCostoDelPaso(cajas.tarifa, cajas.fijo, prendas);
  const sinCambio = llevaCosto && !cambiaElCostoDelPaso(fase, leido);
  const guia = useGuiaCampos(camposDeCostoDelPaso({ problema: leido.problema, vacio: leido.vacio, responsableListo: responsable.listo }));
  const linea = lineaDelCostoDelPaso(leido, prendas);
  const nombre = fase.nombre.toLocaleLowerCase("es");

  const fotoActual = fotoFormulario(cajas);
  const [fotoAlAbrir] = useState(fotoActual);
  const avisoSalida = useSalidaSinGuardar(fotoActual !== fotoAlAbrir, `Cambiaste el costo de ${nombre} y todavía no se guardó. Si cierras ahora, se pierde lo que cambiaste.`);
  function cerrarTrasGuardar() {
    const guardiaFuera = avisoSalida.retirarYa();
    onClose();
    void guardiaFuera.then(() => router.refresh());
  }

  async function guardar(tarifa: number | null, fijo: number | null, quitando: boolean) {
    if (enVuelo.current) return;
    if (!responsable.listo) {
      if (responsable.motivo) avisar.error(responsable.motivo);
      return;
    }
    enVuelo.current = true;
    setCargando(quitando ? "quitar" : "guardar");
    const firma = responsable.firma();
    const antes = { p_tarifa_prenda: fase.tarifaPrenda, p_fijo_orden: fase.fijoOrden > 0 ? fase.fijoOrden : null };
    let resultado;
    try {
      resultado = await firmar(createClient().rpc(RPC_PONER_COSTO_A_FASE as never, { p_fase_id: fase.id, p_tarifa_prenda: tarifa, p_fijo_orden: fijo } as never), firma);
    } finally {
      enVuelo.current = false;
    }
    const { error } = resultado;
    responsable.despues(error);
    setCargando(null);
    if (error) {
      avisar.error(traducirError(error, `${quitando ? "quitar" : "poner"} el costo de ${nombre}`, { confirmarAntesDeRepetir: true }));
      router.refresh();
      return;
    }
    avisar.exito(quitando ? `${fase.nombre} ya no lleva costo` : `${fase.nombre} cuesta ${textoCostoDelPaso({ tarifaPrenda: tarifa, fijoOrden: fijo ?? 0 })}`, {
      detalle: `${datos.orden.numeroTexto} · ${datos.orden.producto.referencia}`,
      accion: {
        texto: "Deshacer",
        onClick: async () => {
          const { error: e2 } = await firmar(createClient().rpc(RPC_PONER_COSTO_A_FASE as never, { p_fase_id: fase.id, ...antes } as never), firma);
          if (e2) avisar.error(traducirError(e2, `volver a como estaba el costo de ${nombre}`));
          router.refresh();
        },
      },
    });
    cerrarTrasGuardar();
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (leido.problema) {
      avisar.error(leido.problema);
      return;
    }
    if (leido.vacio || sinCambio) return;
    void guardar(leido.tarifaPrenda, leido.fijoOrden > 0 ? leido.fijoOrden : null, false);
  }

  return (
    <Modal
      titulo={llevaCosto ? `Cambiar el costo de ${nombre}` : `¿Cuánto cuesta ${nombre}?`}
      subtitulo={llevaCosto ? `Ahora: ${textoCostoDelPaso(fase)}.` : "Lo que cuesta hacerlo en el Taller. Se suma al costo de cada prenda al pasar al stock."}
      variante="hoja"
      tamano="mediana"
      onClose={onClose}
      antesDeCerrar={avisoSalida.pedirAccion}
    >
      <form onSubmit={onSubmit} onKeyDown={enterNoGuarda} className="mt-3.5 space-y-5">
        <div data-guia="prod-orden-costo.montos">
          {/* `retiene="fila"`: son dos cajas de un mismo dato; la luz espera mientras la persona escribe en una y pasa a la otra. */}
          <CampoGuiado id="costo" guia={guia} retiene="fila" className="space-y-2">
            <span className={`${campoEtiqueta} block`}>{guia.etiqueta("costo", "Cuánto cuesta")}</span>
            <div className="grid gap-3 sm:grid-cols-2">
              <CampoMonto
                etiqueta="Por prenda"
                pie="Lo que cuesta cada prenda terminada"
                inputMode="decimal"
                autoComplete="off"
                value={cajas.tarifa}
                onChange={(e) => setCajas((c) => ({ ...c, tarifa: e.target.value }))}
                tono={leido.donde === "tarifa" ? "error" : undefined}
              />
              <CampoMonto
                etiqueta="Por toda la orden"
                pie="Un monto fijo, sin importar cuántas sean"
                inputMode="decimal"
                autoComplete="off"
                value={cajas.fijo}
                onChange={(e) => setCajas((c) => ({ ...c, fijo: e.target.value }))}
                tono={leido.donde === "fijo" ? "error" : undefined}
              />
            </div>
            {linea && (
              <p className="text-sm tabular-nums text-taupe" aria-live="polite">
                {linea}
              </p>
            )}
          </CampoGuiado>
        </div>

        <Aviso tono="info" chico>
          Si quien hace este paso ya está en la planilla del Taller, su sueldo ya se carga al costo de la prenda: no lo cuentes dos veces.
        </Aviso>

        <div className="space-y-3">
          <CampoGuiado id="quien" guia={guia}>
            <ComboResponsable control={responsable} deshabilitado={cargando !== null} compacto />
          </CampoGuiado>
          <PieGuia guia={guia} listo={sinCambio ? "Todavía no cambiaste nada." : "Todo listo para guardar el costo."} conFrase />
        </div>

        <div className="pie-hoja-fijo">
          <div className="border-t border-sand pt-3">
            <PieAcciones
              izquierda={
                llevaCosto ? (
                  <Boton type="button" peso="peligro" cargando={cargando === "quitar"} textoCargando="Quitando…" disabled={cargando !== null || !responsable.listo} title={responsable.motivo ?? undefined} onClick={() => void guardar(null, null, true)}>
                    Quitar el costo
                  </Boton>
                ) : undefined
              }
            >
              <Boton type="button" onClick={() => avisoSalida.pedirAccion(onClose)}>
                Cancelar
              </Boton>
              <Boton type="submit" peso="primario" cargando={cargando === "guardar"} disabled={!guia.puedeConfirmar || sinCambio || cargando !== null} title={guia.frase ?? responsable.motivo ?? undefined} className={guia.claseConfirmar}>
                Guardar el costo
              </Boton>
            </PieAcciones>
          </div>
        </div>
      </form>
      {avisoSalida.aviso}
    </Modal>
  );
}
