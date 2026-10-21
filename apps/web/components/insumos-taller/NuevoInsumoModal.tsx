"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CamposDeLaFicha } from "@/components/insumos-taller/CamposDeLaFicha";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { avisar } from "@/components/ui/Avisos";
import { Boton, CampoSelect, CampoTexto } from "@/components/ui/campos";
import { Modal } from "@/components/ui/Modal";
import { useSalidaSinGuardar } from "@/components/ui/useSalidaSinGuardar";
import { traducirError } from "@/lib/error-escritura";
import { valoresDeLaFicha, type VocabularioDeTelas } from "@/lib/insumos-ficha-reglas";
import { camposDeInsumoNuevo, problemasDeInsumoNuevo } from "@/lib/insumos-guia";
import { TIPOS_INSUMO, UNIDADES_INSUMO, type TipoInsumo, type UnidadInsumo } from "@/lib/insumos-reglas";
import { firmar } from "@/lib/responsable-reglas";
import { fotoFormulario } from "@/lib/salida-sin-guardar";
import { sugerirInsumo } from "@/lib/sugerencias-insumos";
import { createClient } from "@/lib/supabase/client";
import { useResponsable } from "@/lib/useResponsable";

// «Nuevo insumo» (ADR-0133, F3; ADR-0400, actividad 8e): crea la tela o el avío en el catálogo del Taller. Solo el líder (la política `insumos_insert_lider` lo vuelve a comprobar). Con `<Modal>` del sistema
// (ADR-0136), la guía de foco (ADR-0284) y ejemplos que siguen al tipo elegido y evitan lo que ya existe (ADR-0290: `lib/sugerencias-insumos.ts`). Las reglas con las que decide si guarda son las de
// `problemasDeInsumoNuevo`; el tejido y el color se piden pero nunca bloquean (de ellos vive la sugerencia de «Nueva orden»).

/** Unidad que se propone según el tipo: la tela se compra por metro; un avío casi siempre por unidad. */
const UNIDAD_SUGERIDA: Record<TipoInsumo, UnidadInsumo> = { tela: "metro", avio: "unidad" };

export function NuevoInsumoModal({ existentes, vocabulario, leyoVocabulario, onClose }: { existentes: { codigo: string; nombre: string }[]; vocabulario: VocabularioDeTelas; leyoVocabulario: boolean; onClose: () => void }) {
  const router = useRouter();
  const [tipo, setTipo] = useState<TipoInsumo>("tela");
  const [unidad, setUnidad] = useState<UnidadInsumo>("metro");
  const [codigo, setCodigo] = useState("");
  const [nombre, setNombre] = useState("");
  const [merma, setMerma] = useState("");
  const [minimo, setMinimo] = useState("");
  const [nota, setNota] = useState("");
  const [tejidoId, setTejidoId] = useState("");
  const [colorCodigo, setColorCodigo] = useState("");
  const [cargando, setCargando] = useState(false);
  const enVuelo = useRef(false);
  // Responsable (ADR-0161 act. d): el alta queda en `insumos.creado_por` (lo pone un disparador leyendo el combo).
  const responsable = useResponsable();

  const entrada = { tipo, codigo, nombre, merma, minimo, tejidoId, colorCodigo, responsableListo: responsable.listo };
  const problemas = problemasDeInsumoNuevo(entrada);
  const guia = useGuiaCampos(camposDeInsumoNuevo(entrada));
  const ejemplo = sugerirInsumo(tipo, existentes);

  // «¿Salir sin guardar?» (ADR-0136): solo cuenta lo que la persona escribió o eligió.
  const fotoActual = fotoFormulario({ tipo, unidad, codigo, nombre, merma, minimo, nota, tejidoId, colorCodigo });
  const [fotoAlAbrir] = useState(fotoActual);
  const avisoSalida = useSalidaSinGuardar(fotoActual !== fotoAlAbrir, "Empezaste a describir un insumo y todavía no se agregó al catálogo. Si cierras ahora, se pierde lo que escribiste.");
  function cerrarTrasGuardar() {
    const guardiaFuera = avisoSalida.retirarYa();
    onClose();
    void guardiaFuera.then(() => router.refresh());
  }

  function cambiarTipo(t: TipoInsumo) {
    setTipo(t);
    setUnidad(UNIDAD_SUGERIDA[t]);
    // El tejido es de una tela: al pasar a avío no se queda escondido para guardarse después.
    if (t === "avio") setTejidoId("");
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (enVuelo.current) return;
    if (problemas.length > 0) {
      avisar.error(problemas[0]);
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
      const mermaPct = merma.trim() === "" ? 0 : Number(merma) / 100;
      // `tejido_id` y `color_codigo` son nuevas (ADR-0400) y los tipos generados todavía no las traen: el objeto se pasa tipado a mano.
      const valores = {
        codigo: codigo.trim().toUpperCase(),
        nombre: nombre.trim(),
        tipo,
        unidad_medida: unidad,
        merma_pct: mermaPct,
        stock_minimo: minimo.trim() === "" ? null : Number(minimo),
        nota: nota.trim() || null,
        ...valoresDeLaFicha({ tipo, tejidoId, colorCodigo }, vocabulario),
      };
      resultado = await firmar(createClient().from("insumos").insert(valores as never), responsable.firma());
    } finally {
      enVuelo.current = false;
    }
    const { error } = resultado;
    setCargando(false);
    responsable.despues(error);
    if (error) {
      // 23505 = código repetido: la base lo impide con su restricción única.
      avisar.error(error.code === "23505" ? "Ya hay un insumo con ese código." : traducirError(error, "crear el insumo", { confirmarAntesDeRepetir: true }));
      return;
    }
    avisar.exito(`${nombre.trim()} entró al catálogo`, { detalle: "Ahora puedes ingresar su primer lote." });
    cerrarTrasGuardar();
  }

  return (
    <Modal titulo="Nuevo insumo" subtitulo="Tela o avío que el Taller compra" variante="hoja" tamano="mediana" onClose={onClose} antesDeCerrar={avisoSalida.pedirAccion}>
      <form onSubmit={guardar} className="mt-3.5 space-y-4">
        <div data-guia="prod-insumo-nuevo.tipo" className="grid grid-cols-2 gap-3">
          <CampoSelect etiqueta="Tipo" valor={tipo} onValor={cambiarTipo} opciones={TIPOS_INSUMO.map((t) => ({ valor: t.valor, texto: t.etiqueta }))} />
          <CampoSelect
            etiqueta="Se mide en"
            valor={unidad}
            onValor={(v) => setUnidad(v)}
            opciones={Object.entries(UNIDADES_INSUMO).map(([k, u]) => ({ valor: k as UnidadInsumo, texto: u.larga }))}
          />
        </div>
        <div data-guia="prod-insumo-nuevo.nombre" className="grid gap-3 sm:grid-cols-[8rem_1fr]">
          <CampoGuiado id="codigo" guia={guia}>
            <CampoTexto etiqueta={guia.etiqueta("codigo", "Código")} mono placeholder={ejemplo.codigo} value={codigo} onChange={(e) => setCodigo(e.target.value)} maxLength={20} />
          </CampoGuiado>
          <CampoGuiado id="nombre" guia={guia}>
            <CampoTexto etiqueta={guia.etiqueta("nombre", "Nombre")} placeholder={ejemplo.nombre} value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={120} />
          </CampoGuiado>
        </div>

        <CamposDeLaFicha tipo={tipo} tejidoId={tejidoId} colorCodigo={colorCodigo} onTejido={setTejidoId} onColor={setColorCodigo} vocabulario={vocabulario} leyo={leyoVocabulario} foco={guia} guia="prod-insumo-nuevo.ficha" />

        <div data-guia="prod-insumo-nuevo.minimo" className="grid grid-cols-2 gap-3">
          <CampoGuiado id="minimo" guia={guia}>
            <CampoTexto
              etiqueta={guia.etiqueta("minimo", "Mínimo")}
              pie={`Avisa cuando quede menos de esto (${UNIDADES_INSUMO[unidad].corta})`}
              inputMode="decimal"
              placeholder="Sin mínimo"
              value={minimo}
              onChange={(e) => setMinimo(e.target.value)}
            />
          </CampoGuiado>
          <CampoGuiado id="merma" guia={guia}>
            <CampoTexto etiqueta={guia.etiqueta("merma", "Merma al cortar (%)")} pie="Lo que se pierde de cada corte" inputMode="decimal" placeholder="0" value={merma} onChange={(e) => setMerma(e.target.value)} />
          </CampoGuiado>
        </div>
        <div data-guia="prod-insumo-nuevo.nota">
          <CampoTexto etiqueta="Nota" placeholder={ejemplo.nota} value={nota} onChange={(e) => setNota(e.target.value)} maxLength={300} />
        </div>
        <div data-guia="prod-insumo-nuevo.cierre" className="space-y-3">
          <CampoGuiado id="quien" guia={guia}>
            <ComboResponsable control={responsable} deshabilitado={cargando} compacto />
          </CampoGuiado>
          <PieGuia guia={guia} listo="Todo listo para agregarlo al catálogo." conFrase />
        </div>

        <div className="pie-hoja-fijo">
          <div className="pie-acciones border-t border-sand pt-3">
            <Boton type="button" onClick={() => avisoSalida.pedirAccion(onClose)}>
              Cancelar
            </Boton>
            <Boton type="submit" peso="primario" cargando={cargando} disabled={!guia.puedeConfirmar} title={guia.frase ?? responsable.motivo ?? undefined} className={guia.claseConfirmar}>
              Agregar al catálogo
            </Boton>
          </div>
        </div>
      </form>
      {avisoSalida.aviso}
    </Modal>
  );
}
