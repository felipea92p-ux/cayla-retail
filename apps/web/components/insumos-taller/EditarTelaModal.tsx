"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ComboResponsable } from "@/components/ComboResponsable";
import { IdentidadAltaProveedor } from "@/components/alta-producto/IdentidadAlta";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { CompraDeLaTela, TejidoYComposicion, useTejidosDeLaTela } from "@/components/insumos-taller/PiezasDeLaTela";
import { avisar } from "@/components/ui/Avisos";
import { Aviso } from "@/components/ui/Aviso";
import { Boton, CampoTexto } from "@/components/ui/campos";
import { Modal } from "@/components/ui/Modal";
import { TituloGrupo } from "@/components/ui/TituloSeccion";
import { useSalidaSinGuardar } from "@/components/ui/useSalidaSinGuardar";
import { avisosDeEditarTela, camposDeEditarTela, datosDeLaTelaYaGuardada, hayCambiosEnLaTela, notaDeLosColores, payloadDeEditarTela, problemasDeEditarTela } from "@/lib/editar-tela-reglas";
import { esVersionCambiada, traducirError } from "@/lib/error-escritura";
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
  coloresDesfasados = 0,
  tallerId,
  vocabulario,
  leyoVocabulario,
  onClose,
}: {
  material: MaterialVista;
  /** Cuántos colores tiene hoy: la hoja dice a cuántos les llega el cambio. */
  cuantosColores: number;
  /** Cuántos de esos colores tienen un nombre que ya no sigue al de su color en Catálogo (alguien lo renombró): guardar la tela, aunque no cambie nada, los pone al día. */
  coloresDesfasados?: number;
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
  // Sin cambios en la tela todavía hay algo que guardar si hay colores con el nombre desfasado: guardarla los pone al día (la base reescribe el nombre de cada color al tocar su tela).
  const soloPonerAlDia = !hayCambios && coloresDesfasados > 0;
  const puedeGuardar = hayCambios || soloPonerAlDia;
  const avisos = avisosDeEditarTela(inicial, datos);
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

  // «Recargar» tras un choque de versión: se cierra la hoja (lo escrito se pierde, el aviso ya lo dijo) y la pantalla trae lo que la otra persona guardó.
  function recargar() {
    cerrarTrasGuardar();
  }

  async function guardar(ev: React.FormEvent) {
    ev.preventDefault();
    if (enVuelo.current) return;
    if (problemas.length > 0) {
      avisar.error(problemas[0]);
      return;
    }
    if (!puedeGuardar) {
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
      const consulta = createClient().rpc("editar_material" as never, { p_material_id: material.id, p_ubicacion_id: tallerId, p_material: payloadDeEditarTela(datos, material.version) } as never);
      resultado = await firmar(consulta, responsable.firma());
    } finally {
      enVuelo.current = false;
    }
    const { error } = resultado;
    responsable.despues(error);
    setCargando(false);
    if (error) {
      // Otra persona guardó esta tela mientras se editaba: la hoja NO se cierra (lo escrito sigue a la vista para anotarlo) y se ofrece recargar, que trae sus cambios.
      if (esVersionCambiada(error)) {
        avisar.error(traducirError(error, "guardar los cambios de la tela"), { accion: { texto: "Recargar", onClick: recargar } });
        return;
      }
      // Editar una tela es idempotente (escribir los mismos datos dos veces deja lo mismo): repetirlo no duplica nada.
      avisar.error(traducirError(error, "guardar los cambios de la tela"));
      return;
    }
    const losColores = cuantosColores === 1 ? "Su color la sigue" : `Sus ${cuantosColores} colores la siguen`;
    avisar.exito(soloPonerAlDia ? `Los nombres de ${coloresDesfasados === 1 ? "un color" : `${coloresDesfasados} colores`} de ${datos.nombre.trim()} se pusieron al día` : `${datos.nombre.trim()} se actualizó`, {
      detalle: cuantosColores > 0 ? `${losColores}; ningún stock ni costo cambió.` : "Ningún stock ni costo cambió.",
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
            <p className="nota-cayla">{notaDeLosColores(cuantosColores)}</p>
            {avisos.map((t) => (
              <Aviso key={t} tono="atencion" chico>
                {t}
              </Aviso>
            ))}
            {coloresDesfasados > 0 && (
              <Aviso tono="info" chico>
                {coloresDesfasados === 1 ? "Un color tiene un nombre que ya no sigue al de su color en Catálogo" : `${coloresDesfasados} colores tienen un nombre que ya no sigue al de su color en Catálogo`}. Al guardar la tela se ponen al día, aunque no cambies nada.
              </Aviso>
            )}
          </section>

          <div data-guia="prod-tela-editar.cierre" className="space-y-3">
            <CampoGuiado id="quien" guia={guia}>
              <ComboResponsable control={responsable} deshabilitado={cargando} compacto />
            </CampoGuiado>
            {/* Con todo en orden pero nada cambiado, «Todo listo» sería mentira: el botón sigue apagado. Se dice por qué. */}
            {!(guia.faltan.length === 0 && !puedeGuardar) && (
              <PieGuia guia={guia} listo={soloPonerAlDia ? "Todo listo para poner al día los nombres de los colores." : "Todo listo para guardar los cambios."} conFrase />
            )}
            {!puedeGuardar && guia.puedeConfirmar && (
              <p role="status" className="pt-1 text-[12.5px] text-tinta/80">
                Todavía no cambiaste nada: el botón se enciende cuando corrijas algo.
              </p>
            )}
          </div>

          <div className="pie-hoja-fijo">
            <div className="pie-acciones border-t border-sand pt-3">
              <Boton type="button" onClick={() => avisoSalida.pedirAccion(onClose)}>
                Cancelar
              </Boton>
              <Boton type="submit" peso="primario" cargando={cargando} disabled={!guia.puedeConfirmar || !puedeGuardar} title={!puedeGuardar ? "No cambiaste nada de la tela." : (guia.frase ?? responsable.motivo ?? undefined)} className={puedeGuardar ? guia.claseConfirmar : ""}>
                {soloPonerAlDia ? "Poner al día los nombres" : "Guardar los cambios"}
              </Boton>
            </div>
          </div>
        </form>
      </IdentidadAltaProveedor>
      {avisoSalida.aviso}
    </Modal>
  );
}
