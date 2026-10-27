"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { TelaDeLaOrden, type ColorDeLaTela } from "@/components/orden-produccion/TelaDeLaOrden";
import { avisar } from "@/components/ui/Avisos";
import { Boton } from "@/components/ui/campos";
import { Modal } from "@/components/ui/Modal";
import { useSalidaSinGuardar } from "@/components/ui/useSalidaSinGuardar";
import { traducirError } from "@/lib/error-escritura";
import { camposDeEditarTela } from "@/lib/orden-pagina-guia";
import { RPC_GUARDAR_INSUMOS_ORDEN, type OrdenPagina } from "@/lib/orden-pagina-reglas";
import { contarCambios, hayCambios, problemasDeEdicion, telasIniciales, textoDeCambios, type DatosEditarTela } from "@/lib/orden-tela-editar-reglas";
import { coloresDeLaOrden, insumosParaRpc, problemasTela, type OfertaDeConsumo, type TelaBorrador } from "@/lib/orden-tela-reglas";
import { firmar } from "@/lib/responsable-reglas";
import { fotoFormulario } from "@/lib/salida-sin-guardar";
import { createClient } from "@/lib/supabase/client";
import { useResponsable } from "@/lib/useResponsable";

// «Editar tela y avíos» de una orden que ya está abierta (ADR-0510, actividad 2). Es el mismo bloque de «Nueva orden» (`TelaDeLaOrden`) sobre lo que la orden ya declaró, y guarda la lista ENTERA con
// `guardar_insumos_orden`: la base la valida con la misma regla que al abrir y no deja quitar una tela con consumo anotado. Aquí esa regla se avisa antes (`problemasDeEdicion`) para que la persona no
// llegue a un rechazo. Sirve también para DECLARAR la tela de una orden que se abrió sin ninguna: la lista de partida está vacía y las filas de cada color esperan su tela.
// Se anota con quien se elige en «Responsable» (ADR-0161/0162). Un doble clic no guarda dos veces: una marca síncrona corta la segunda llamada, y repetir la lista no cambia nada en la base.

const SIN_OFERTA: OfertaDeConsumo = { tipo: "ninguna" };
const SIN_CAMINO = new Map<string, number>();

export function EditarTelaModal({ datos, edicion, onClose }: { datos: OrdenPagina; edicion: DatosEditarTela; onClose: () => void }) {
  const router = useRouter();
  const responsable = useResponsable({ ubicacionId: datos.orden.ubicacionId, etiqueta: datos.orden.ubicacionNombre });
  const inicial = useMemo(() => telasIniciales(datos.insumos), [datos.insumos]);
  const [telasManual, setTelas] = useState<TelaBorrador[] | null>(null);
  const [cargando, setCargando] = useState(false);
  const enVuelo = useRef(false);

  // Los colores que la orden fabrica, con sus prendas, en el orden de la tabla de cantidades.
  const colores = useMemo(() => coloresDeLaOrden(datos.lineas.map((l) => ({ colorCodigo: l.colorCodigo, cantidad: l.cantidadPlan, talla: l.talla }))), [datos.lineas]);
  const coloresDeLaTela = useMemo<ColorDeLaTela[]>(
    () =>
      colores.map((c) => {
        const deLinea = datos.lineas.find((l) => l.colorCodigo === c.colorCodigo);
        return { codigo: c.colorCodigo, nombre: c.colorCodigo === null ? "Sin color" : (deLinea?.colorNombre ?? c.colorCodigo), hex: deLinea?.colorHex ?? null, prendas: c.cantidad, tallas: c.tallas };
      }),
    [colores, datos.lineas]
  );

  const telas = telasManual ?? inicial;
  const nombres = useMemo(() => new Map(edicion.insumos.map((i) => [i.id, i.nombre] as const)), [edicion.insumos]);
  const usado = useMemo(() => new Map(Object.entries(edicion.usado)), [edicion.usado]);
  const comprometido = useMemo(() => new Map(Object.entries(edicion.comprometido)), [edicion.comprometido]);
  const enCamino = useMemo(() => (Object.keys(edicion.enCamino).length > 0 ? new Map(Object.entries(edicion.enCamino)) : SIN_CAMINO), [edicion.enCamino]);
  const costoPorMetro = useMemo(() => new Map(Object.entries(edicion.costoPorUnidad)), [edicion.costoPorUnidad]);

  const problemasDeTela = useMemo(() => problemasTela(telas, { insumos: edicion.insumos, colores }), [telas, edicion.insumos, colores]);
  const problemasDeConsumo = useMemo(() => problemasDeEdicion(inicial, telas, usado, nombres), [inicial, telas, usado, nombres]);
  const cambio = hayCambios(inicial, telas);
  const faltas = [...problemasDeTela.map((p) => p.texto), ...problemasDeConsumo.map((p) => p.texto)];
  const guia = useGuiaCampos(camposDeEditarTela({ faltas, hayCambios: cambio, responsableListo: responsable.listo }));

  // «¿Salir sin guardar?» (ADR-0136): la hoja nace con lo guardado, así que solo cuenta lo que la persona cambió.
  const fotoActual = fotoFormulario({ telas: telas.map((t) => [t.insumoId, t.colorCodigo, t.consumoPorPrenda, t.porTalla ?? null]) });
  const [fotoAlAbrir] = useState(fotoActual);
  const avisoSalida = useSalidaSinGuardar(fotoActual !== fotoAlAbrir, "Cambiaste la tela o los avíos y todavía no se guardó. Si cierras ahora, se pierde lo que cambiaste.");
  function cerrarTrasGuardar() {
    const guardiaFuera = avisoSalida.retirarYa();
    onClose();
    void guardiaFuera.then(() => router.refresh());
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (enVuelo.current) return;
    if (faltas.length > 0) {
      avisar.error(faltas[0]);
      return;
    }
    if (!cambio) {
      avisar.error("Cambia algo de la tela o de los avíos para guardar.");
      return;
    }
    if (!responsable.listo) {
      if (responsable.motivo) avisar.error(responsable.motivo);
      return;
    }
    enVuelo.current = true;
    setCargando(true);
    const firma = responsable.firma();
    let resultado;
    try {
      resultado = await firmar(createClient().rpc(RPC_GUARDAR_INSUMOS_ORDEN as never, { p_produccion_id: datos.orden.id, p_insumos: insumosParaRpc(telas, colores) } as never), firma);
    } finally {
      enVuelo.current = false;
    }
    const { error } = resultado;
    responsable.despues(error);
    setCargando(false);
    if (error) {
      // La lista se guarda entera o no se guarda: repetirla no cambia nada, así que no hace falta mirar antes de volver a intentar.
      avisar.error(traducirError(error, "guardar la tela y los avíos de la orden"));
      return;
    }
    avisar.exito(`Tela y avíos de la orden: ${textoDeCambios(contarCambios(inicial, telas))}.`, { detalle: `${datos.orden.numeroTexto} · ${datos.orden.producto.referencia}` });
    cerrarTrasGuardar();
  }

  const sinNada = inicial.length === 0;
  return (
    <Modal
      titulo={sinNada ? "Declarar la tela y los avíos" : "Editar la tela y los avíos"}
      subtitulo={sinNada ? "Esta orden se abrió sin decir qué lleva. Dilo ahora y la orden te avisa cuántos metros pedir y si alcanzan." : "Lo que ya se usó se queda anotado: puedes corregir cuánto lleva cada prenda, pero no quitar lo que ya se usó."}
      variante="hoja"
      tamano="ancha"
      onClose={onClose}
      antesDeCerrar={avisoSalida.pedirAccion}
    >
      <form onSubmit={onSubmit} className="mt-3.5 space-y-5">
        <div data-guia="prod-orden-editar-tela.lista">
          <TelaDeLaOrden
            telas={telas}
            onTelas={setTelas}
            insumos={edicion.insumos}
            tejidoId={edicion.tejidoId}
            tejidoNombre={edicion.tejidoNombre}
            colores={coloresDeLaTela}
            comprometido={comprometido}
            enCamino={enCamino}
            consumoDeclarado={edicion.consumoDeclarado}
            conCostos={edicion.conCostos}
            costoPorMetro={costoPorMetro}
            guia={guia}
            problemas={problemasDeTela}
            ofertaConsumo={SIN_OFERTA}
            puedeCorregirConsumo={false}
            fijarConsumo={false}
            onFijarConsumo={() => {}}
            edicion={{ usado, puedeQuitarTela: true }}
            titulo="Tela y avíos"
          />
        </div>

        <div data-guia="prod-orden-editar-tela.cierre" className="space-y-3">
          <CampoGuiado id="quien" guia={guia}>
            <ComboResponsable control={responsable} deshabilitado={cargando} compacto />
          </CampoGuiado>
          <PieGuia guia={guia} listo="Todo listo para guardar." conFrase />
        </div>

        <div className="pie-hoja-fijo">
          <div className="pie-acciones border-t border-sand pt-3">
            <Boton type="button" onClick={() => avisoSalida.pedirAccion(onClose)}>
              Cancelar
            </Boton>
            <Boton type="submit" peso="primario" cargando={cargando} textoCargando="Guardando…" disabled={!guia.puedeConfirmar} title={guia.frase ?? responsable.motivo ?? undefined} className={guia.claseConfirmar}>
              Guardar
            </Boton>
          </div>
        </div>
      </form>
      {avisoSalida.aviso}
    </Modal>
  );
}
