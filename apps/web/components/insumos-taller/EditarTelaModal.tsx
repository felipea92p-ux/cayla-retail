"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ComboResponsable } from "@/components/ComboResponsable";
import { IdentidadAltaProveedor } from "@/components/alta-producto/IdentidadAlta";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { CompraDeLaTela, TejidoYComposicion, useTejidosDeLaTela } from "@/components/insumos-taller/PiezasDeLaTela";
import { avisar } from "@/components/ui/Avisos";
import { Boton, CampoTexto } from "@/components/ui/campos";
import { Modal } from "@/components/ui/Modal";
import { TituloGrupo } from "@/components/ui/TituloSeccion";
import { useSalidaSinGuardar } from "@/components/ui/useSalidaSinGuardar";
import { camposDeEditarTela, datosDeLaTelaYaGuardada, hayCambiosEnLaTela, payloadDeEditarTela, problemasDeEditarTela } from "@/lib/editar-tela-reglas";
import { traducirError } from "@/lib/error-escritura";
import type { VocabularioDeTelas } from "@/lib/insumos-ficha-reglas";
import { textoDeCompra, type MaterialVista } from "@/lib/insumos-reglas";
import { firmar } from "@/lib/responsable-reglas";
import { fotoFormulario } from "@/lib/salida-sin-guardar";
import { createClient } from "@/lib/supabase/client";
import type { DatosDeLaTela } from "@/lib/tela-nueva-reglas";
import { useResponsable } from "@/lib/useResponsable";

// «Editar tela» (ADR-0554, actividad 3; revisión del 28-oct: «una tela ya creada no se podía corregir»): la MISMA hoja con que se creó, con lo que la tela ya dice, para corregir su nombre, su tejido, su composición, su
// merma o cómo se compra. Los colores no se editan aquí: siguen a su tela en la misma transacción (`editar_material`), así que un nombre mal escrito o un tejido que faltaba se arreglan una vez y valen para todos.
// Es del líder (la base lo exige; el botón solo se ofrece a él). Cambiarla no mueve stock, lotes ni costos. El código de la tela y el de cada color no cambian. Con el mismo `<Modal>`, la guía de foco (ADR-0284)
// y el combo Responsable que el resto.

export function EditarTelaModal({
  material,
  cuantosColores,
  tallerId,
  vocabulario,
  leyoVocabulario,
  onClose,
}: {
  material: MaterialVista;
  /** Cuántos colores tiene hoy: la hoja dice a cuántos les llega el cambio. */
  cuantosColores: number;
  tallerId: string;
  vocabulario: VocabularioDeTelas;
  /** `false`: los tejidos no se pudieron leer; la hoja lo dice. */
  leyoVocabulario: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const responsable = useResponsable();
  const { tejidos, crearTejido } = useTejidosDeLaTela(vocabulario.tejidos, responsable);
  const [inicial] = useState<DatosDeLaTela>(() => datosDeLaTelaYaGuardada(material));
  const [datos, setDatos] = useState<DatosDeLaTela>(inicial);
  const [cargando, setCargando] = useState(false);
  const enVuelo = useRef(false);
  const cambiar = (c: Partial<DatosDeLaTela>) => setDatos((d) => ({ ...d, ...c }));

  const problemas = problemasDeEditarTela(datos);
  const hayCambios = hayCambiosEnLaTela(inicial, datos);
  const guia = useGuiaCampos(camposDeEditarTela({ ...datos, responsableListo: responsable.listo }));

  // «¿Salir sin guardar?» (ADR-0136): solo cuenta lo que la persona cambió.
  const fotoActual = fotoFormulario({ ...datos });
  const [fotoAlAbrir] = useState(fotoActual);
  const avisoSalida = useSalidaSinGuardar(fotoActual !== fotoAlAbrir, "Cambiaste datos de la tela y todavía no se guardaron. Si cierras ahora, se pierde lo que cambiaste.");
  function cerrarTrasGuardar() {
    const guardiaFuera = avisoSalida.retirarYa();
    onClose();
    void guardiaFuera.then(() => router.refresh());
  }

  async function guardar(ev: React.FormEvent) {
    ev.preventDefault();
    if (enVuelo.current) return;
    if (problemas.length > 0) {
      avisar.error(problemas[0]);
      return;
    }
    if (!hayCambios) {
      avisar.aviso("No cambiaste nada de la tela.");
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
      // La función es nueva (ADR-0554) y los tipos generados todavía no la traen: la llamada se tipa a mano, como `crear_material`.
      const consulta = createClient().rpc("editar_material" as never, { p_material_id: material.id, p_ubicacion_id: tallerId, p_material: payloadDeEditarTela(datos) } as never);
      resultado = await firmar(consulta, responsable.firma());
    } finally {
      enVuelo.current = false;
    }
    const { error } = resultado;
    responsable.despues(error);
    setCargando(false);
    if (error) {
      // Editar una tela es idempotente (escribir los mismos datos dos veces deja lo mismo): repetirlo no duplica nada.
      avisar.error(traducirError(error, "guardar los cambios de la tela"));
      return;
    }
    avisar.exito(`${datos.nombre.trim()} se actualizó`, {
      detalle: cuantosColores > 0 ? `${cuantosColores === 1 ? "Su color la sigue" : `Sus ${cuantosColores} colores la siguen`}; ningún stock ni costo cambió.` : "Ningún stock ni costo cambió.",
    });
    cerrarTrasGuardar();
  }

  return (
    <Modal
      titulo={`Editar «${material.nombre}»`}
      subtitulo={`${material.codigo} · ${textoDeCompra(material)}`}
      variante="hoja"
      tamano="mediana"
      onClose={onClose}
      antesDeCerrar={avisoSalida.pedirAccion}
    >
      <IdentidadAltaProveedor control={responsable}>
        <form onSubmit={guardar} className="mt-3.5 space-y-6">
          <section data-guia="prod-tela-editar.campos" className="space-y-3">
            <TituloGrupo>Qué tela es</TituloGrupo>
            <CampoGuiado id="nombre" guia={guia}>
              <CampoTexto etiqueta={guia.etiqueta("nombre", "Nombre de la tela")} value={datos.nombre} onChange={(ev) => cambiar({ nombre: ev.target.value })} maxLength={120} autoComplete="off" />
            </CampoGuiado>
            <TejidoYComposicion
              guia={guia}
              tejidos={tejidos}
              leyoVocabulario={leyoVocabulario}
              tejidoId={datos.tejidoId}
              onTejido={(id) => cambiar({ tejidoId: id })}
              onCrearTejido={(t) => void crearTejido(t, (id) => cambiar({ tejidoId: id }))}
              composicion={datos.composicion}
              onComposicion={(t) => cambiar({ composicion: t })}
            />
            <TituloGrupo>Cómo la compras</TituloGrupo>
            <CompraDeLaTela
              guia={guia}
              datos={datos}
              onCompra={(nueva) => cambiar({ compra: nueva })}
              onAncho={(t) => cambiar({ ancho: t })}
              onGramaje={(t) => cambiar({ gramaje: t })}
              onMetrosPorRollo={(t) => cambiar({ metrosPorRollo: t })}
              onMerma={(t) => cambiar({ merma: t })}
            />
            <p className="nota-cayla">
              {cuantosColores > 0
                ? `El nombre, el tejido y la merma que pongas aquí les llegan a sus ${cuantosColores === 1 ? "color" : `${cuantosColores} colores`} al guardar. El código de la tela y el de cada color no cambian, y el stock tampoco.`
                : "El código de la tela no cambia, y el stock tampoco."}
            </p>
          </section>

          <div data-guia="prod-tela-editar.cierre" className="space-y-3">
            <CampoGuiado id="quien" guia={guia}>
              <ComboResponsable control={responsable} deshabilitado={cargando} compacto />
            </CampoGuiado>
            <PieGuia guia={guia} listo="Todo listo para guardar los cambios." conFrase />
          </div>

          <div className="pie-hoja-fijo">
            <div className="pie-acciones border-t border-sand pt-3">
              <Boton type="button" onClick={() => avisoSalida.pedirAccion(onClose)}>
                Cancelar
              </Boton>
              <Boton type="submit" peso="primario" cargando={cargando} disabled={!guia.puedeConfirmar || !hayCambios} title={!hayCambios ? "No cambiaste nada de la tela." : (guia.frase ?? responsable.motivo ?? undefined)} className={guia.claseConfirmar}>
                Guardar los cambios
              </Boton>
            </div>
          </div>
        </form>
      </IdentidadAltaProveedor>
      {avisoSalida.aviso}
    </Modal>
  );
}
