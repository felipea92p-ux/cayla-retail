"use client";

// Corregir un gasto sin anularlo (ADR-0588): su categoría y su «qué fue», que no mueven plata. Se abre en el lugar de la hoja del gasto (nunca una
// hoja sobre otra) y vuelve a ella con la flecha. Lo de adentro: los dos datos con lo que tiene hoy, «lo que cambia» (antes → ahora), el responsable y
// «Guardar N cambios». El `lote` nace al abrir: un doble clic o un reintento devuelve lo que ya quedó. Las reglas, en `lib/gastos-corregir-reglas.ts`.
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { Modal } from "@/components/ui/Modal";
import { Volver } from "@/components/ui/Volver";
import { Boton, CampoSelect, CampoTexto } from "@/components/ui/campos";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { useResponsable } from "@/lib/useResponsable";
import { firmar } from "@/lib/responsable-reglas";
import { MAX_DESCRIPCION_GASTO } from "@/lib/finanzas-topes";
import { sugerirQueFue } from "@/lib/sugerencias-hoja-gasto";
import type { CategoriaGasto, GastoFila } from "@/lib/gastos-reglas";
import {
  RPC_CORREGIR_GASTO_FINANZAS,
  borradorDe,
  cambiosDeLaCorreccion,
  camposDeLaCorreccion,
  categoriasParaCorregir,
  detalleDelGuardado,
  problemaDeLaCorreccion,
  textoDeCambioDeGasto,
  textoGuardarCorreccion,
} from "@/lib/gastos-corregir-reglas";

export function HojaCorregirGasto({
  gasto: g,
  categorias,
  onVolver,
  onCerrar,
}: {
  gasto: GastoFila;
  categorias: CategoriaGasto[];
  /** Vuelve a la hoja del gasto sin guardar. */
  onVolver: () => void;
  onCerrar: () => void;
}) {
  const router = useRouter();
  const responsable = useResponsable();
  const [lote] = useState(() => crypto.randomUUID());
  const [b, setB] = useState(() => borradorDe(g));
  const [guardando, setGuardando] = useState(false);
  const opciones = useMemo(() => categoriasParaCorregir(categorias), [categorias]);
  const cambios = cambiosDeLaCorreccion(g, b, categorias);
  const problema = problemaDeLaCorreccion(b);
  const guia = useGuiaCampos(camposDeLaCorreccion(b, cambios, { listo: responsable.listo, motivo: responsable.motivo }));
  const elegida = categorias.find((c) => c.codigo === b.categoria) ?? null;
  const sePuede = !problema && cambios.length > 0 && responsable.listo;

  async function guardar() {
    if (problema) return avisar.error(problema);
    if (cambios.length === 0) return;
    if (!responsable.listo) {
      if (responsable.motivo) avisar.error(responsable.motivo);
      return;
    }
    setGuardando(true);
    const { error } = await firmar(
      createClient().rpc(RPC_CORREGIR_GASTO_FINANZAS as never, { p_gasto_id: g.id, p_lote: lote, p_categoria: b.categoria, p_descripcion: b.descripcion } as never),
      responsable.firma(),
    );
    setGuardando(false);
    responsable.despues(error);
    if (error) return avisar.error(traducirError(error, "corregir el gasto"));
    avisar.exito(cambios.length === 1 ? "Gasto corregido" : "Gasto corregido: 2 cambios", { detalle: detalleDelGuardado(cambios) });
    onCerrar();
    router.refresh();
  }

  return (
    <Modal
      variante="hoja"
      titulo="Corregir gasto"
      subtitulo="Cambia en qué se gastó o qué fue. El monto, el pago y la fecha no se corrigen aquí: queda escrito quién lo cambió y qué había antes."
      onClose={onCerrar}
      tamano="mediana"
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void guardar();
        }}
      >
        <div className="grid gap-x-3 sm:grid-cols-2">
          <CampoGuiado id="categoria" guia={guia} titulo="En qué">
            <CampoSelect
              etiqueta="Categoría"
              caja
              valor={b.categoria}
              onValor={(v) => setB((x) => ({ ...x, categoria: v }))}
              marcador="Elige…"
              opciones={opciones.map((c) => ({ valor: c.codigo, texto: c.nombre }))}
            />
          </CampoGuiado>
          <CampoGuiado id="descripcion" guia={guia} titulo="Qué fue">
            <CampoTexto
              etiqueta="Qué fue"
              caja
              sinPie
              value={b.descripcion}
              onChange={(e) => setB((x) => ({ ...x, descripcion: e.target.value }))}
              placeholder={sugerirQueFue(elegida)}
              maxLength={MAX_DESCRIPCION_GASTO}
            />
          </CampoGuiado>
        </div>

        <CampoGuiado id="cambio" guia={guia} titulo="Lo que cambia">
          {cambios.length > 0 ? (
            <ul className="rounded-[12px] bg-hueso px-3 py-2 text-sm">
              {cambios.map((c) => (
                <li key={c.campo} className="text-tinta">
                  {textoDeCambioDeGasto(c)}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-taupe">
              Todavía nada: cambia la categoría o qué fue.
            </p>
          )}
        </CampoGuiado>

        <CampoGuiado id="responsable" guia={guia} titulo="Responsable">
          <ComboResponsable control={responsable} deshabilitado={guardando} />
        </CampoGuiado>

        <PieGuia guia={guia} listo="Todo listo para corregir." />
        <div className="pie-acciones pie-hoja-fijo mt-4">
          <Volver onClick={onVolver} a="Volver al gasto" />
          <Boton peso="primario" type="submit" cargando={guardando} disabled={guardando || !sePuede} className="ml-auto">
            {textoGuardarCorreccion(cambios.length)}
          </Boton>
        </div>
      </form>
    </Modal>
  );
}
