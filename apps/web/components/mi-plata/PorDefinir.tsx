"use client";

import { enterNoGuarda } from "@/components/ui/enterNoGuarda";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Aviso } from "@/components/ui/Aviso";
import { Boton, CampoMonto, CampoSelect } from "@/components/ui/campos";
import { avisar } from "@/components/ui/Avisos";
import { Chip } from "@/components/ui/Chip";
import { Modal } from "@/components/ui/Modal";
import { MiniaturaPrenda } from "@/components/ui/PrendaCelda";
import { PieAcciones } from "@/components/ui/PieAcciones";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { useSalidaSinGuardar } from "@/components/ui/useSalidaSinGuardar";
import { ComboResponsable } from "@/components/ComboResponsable";
import { useSedeActiva } from "@/components/SedeActiva";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { createClient } from "@/lib/supabase/client";
import { firmar } from "@/lib/responsable-reglas";
import { firmaOmitida } from "@/lib/responsable-omitido";
import { useResponsable } from "@/lib/useResponsable";
import { esFalloDeRed, traducirError } from "@/lib/error-escritura";
import { soles } from "@/lib/compras-reglas";
import type { CategoriaParaComprar } from "@/lib/compra-rapida-reglas";
import {
  RPC_DEFINIR_PRENDA,
  camposDefinir,
  definirParaBase,
  detalleDelModelo,
  faltasDelModelo,
  gananciaDefinida,
  textoAvisoPorDefinir,
  type BorradorDefinir,
  type ModeloPorDefinir,
} from "@/lib/por-definir-reglas";

// «Por definir» (ADR-0660, Felipe 2026-11-13: «Hay que crear esa opción de por definir y un aviso en pantalla. Ejemplo: 3 productos a la
// espera de definir categoría»). La sección que lo cuenta y lleva a cada prenda, y la hoja «Definir» que llena lo que falta. Vive en «Revisar
// compras» (Compras define cualquiera) y en «Mis compras» (la compradora, las suyas): las dos con la misma pieza. Lo que nadie define antes de
// que llegue lo dice la tienda al recibirla.

export function PorDefinir({ modelos, categorias, guia }: { modelos: ModeloPorDefinir[]; categorias: CategoriaParaComprar[]; guia: string }) {
  const [abierto, setAbierto] = useState<ModeloPorDefinir | null>(null);
  const aviso = textoAvisoPorDefinir(modelos);
  if (!aviso) return null;
  const detalle = aviso.detalle ? `${aviso.detalle.charAt(0).toUpperCase()}${aviso.detalle.slice(1)}. ` : "";
  return (
    <section id="por-definir" className="scroll-mt-24 space-y-3" data-guia={guia}>
      <TituloSeccion cuenta={modelos.length}>Por definir</TituloSeccion>
      <Aviso tono="atencion" titulo={aviso.titulo} chico>
        {detalle}Lo que nadie defina antes, lo dice la tienda al recibirlo.
      </Aviso>
      <ul className="@container divide-y divide-sand">
        {modelos.map((m) => (
          <li key={m.ids.join(",")} className="grid grid-cols-[3rem_minmax(0,1fr)] items-center gap-x-3 gap-y-2 py-3 @min-[32rem]:grid-cols-[3rem_minmax(0,1fr)_auto]">
            <MiniaturaPrenda fotoUrl={null} tamano="lg" categoria={m.categoria} />
            <div className="min-w-0">
              <p className="truncate text-[15px] font-semibold leading-tight text-tinta">
                {m.nombre} <span className="font-normal text-taupe">· {m.cantidad} unid.</span>
              </p>
              <p className="texto-detalle mt-0.5 text-taupe">{detalleDelModelo(m)}</p>
              <span className="mt-1.5 flex flex-wrap gap-1.5">
                {faltasDelModelo(m).map((f) => (
                  <Chip key={f} tono="ambar" title={f === "Sin categoría" ? "Todavía no se sabe qué es" : "A la espera de precio sugerido"}>
                    {f}
                  </Chip>
                ))}
              </span>
            </div>
            <div className="col-start-2 flex justify-start @min-[32rem]:col-start-3 @min-[32rem]:justify-end">
              <Boton type="button" peso="fantasma" onClick={() => setAbierto(m)}>
                Definir
              </Boton>
            </div>
          </li>
        ))}
      </ul>
      {abierto && <HojaDefinir modelo={abierto} categorias={categorias} onClose={() => setAbierto(null)} />}
    </section>
  );
}

function HojaDefinir({ modelo: m, categorias, onClose }: { modelo: ModeloPorDefinir; categorias: CategoriaParaComprar[]; onClose: () => void }) {
  const router = useRouter();
  const [b, setB] = useState<BorradorDefinir>({ categoriaId: null, precio: "" });
  const [guardando, setGuardando] = useState(false);
  const [rechazo, setRechazo] = useState<{ titulo: string; texto: string; tono: "error" | "atencion" } | null>(null);
  // Uno por hoja abierta: un reintento tras un corte vuelve con el mismo y la base devuelve lo que ya quedó, sin anotarlo dos veces.
  const token = useMemo(() => crypto.randomUUID(), []);
  const esPersona = Boolean(useSedeActiva()?.personaSesionId);
  const responsable = useResponsable();
  const admiteCeroElegida = categorias.find((c) => c.id === b.categoriaId)?.admitePrecioCero === true;
  const admiteCero = m.categoriaPorDefinir ? admiteCeroElegida : m.admitePrecioCero;
  const guia = useGuiaCampos(camposDefinir(m, b, admiteCeroElegida, { esPersona, listo: responsable.listo, motivo: responsable.motivo }));
  const ganancia = m.precioPorDefinir ? gananciaDefinida(m.costo, b.precio, admiteCero) : null;
  const salida = useSalidaSinGuardar(
    b.categoriaId !== null || b.precio.trim() !== "",
    "Empezaste a definir esta prenda y todavía no lo guardas. Si cierras ahora, se pierde lo que elegiste.",
    { soloAlCerrar: true },
  );
  const opciones = useMemo(() => categorias.map((c) => ({ valor: c.id, texto: c.nombre })), [categorias]);
  const cambiar = (cambio: Partial<BorradorDefinir>) => {
    setRechazo(null);
    setB((x) => ({ ...x, ...cambio }));
  };

  async function confirmar() {
    if (guardando) return;
    const args = definirParaBase(m, b, admiteCeroElegida);
    if (!guia.puedeConfirmar || !args) {
      const ahora = guia.ahora ?? guia.faltan[0]?.id;
      if (ahora) guia.ir(ahora);
      return;
    }
    setGuardando(true);
    const { error } = await firmar(
      createClient().rpc(RPC_DEFINIR_PRENDA as never, { ...args, p_token: token } as never),
      esPersona ? firmaOmitida("compra_definir") : responsable.firma(),
    );
    setGuardando(false);
    if (!esPersona) responsable.despues(error);
    if (error) {
      return setRechazo(
        esFalloDeRed(error)
          ? { titulo: "Se cortó la conexión", texto: "No sabemos si se guardó. Vuelve a tocar el botón: si ya se guardó, no se repite.", tono: "atencion" }
          : { titulo: "No se guardó", texto: traducirError(error, "definir la prenda"), tono: "error" },
      );
    }
    const que = [args.p_categoria_id ? "qué es" : null, args.p_precio_venta != null ? "su precio" : null].filter(Boolean).join(" y ");
    avisar.exito(`«${m.nombre}» ya tiene ${que}`, {
      detalle: m.categoriaPorDefinir && !args.p_categoria_id ? "Todavía espera saber qué es." : m.precioPorDefinir && args.p_precio_venta == null ? "Todavía espera su precio." : undefined,
    });
    onClose();
    router.refresh();
  }

  const subtitulo = [`${m.cantidad} unid.`, m.costo != null ? `te costó ${soles(m.costo)} c/u` : null, m.categoria].filter(Boolean).join(" · ");
  return (
    <Modal titulo={m.nombre} subtitulo={subtitulo} onClose={onClose} antesDeCerrar={salida.pedirAccion}>
      {(cerrar) => (
        <form
          className="space-y-4"
          onKeyDown={enterNoGuarda}
          onSubmit={(e) => {
            e.preventDefault();
            void confirmar();
          }}
        >
          <p className="texto-bajada text-taupe">{detalleDelModelo(m)}</p>
          <CampoGuiado id="definir" guia={guia} titulo={m.categoriaPorDefinir && m.precioPorDefinir ? "Lo que ya sepas · basta una" : undefined}>
            <div className="space-y-4">
              {m.categoriaPorDefinir && (
                <CampoSelect
                  etiqueta="¿Qué es?"
                  valor={b.categoriaId ?? ""}
                  onValor={(v) => cambiar({ categoriaId: v || null })}
                  opciones={opciones}
                  marcador="Elige una categoría"
                  deshabilitado={guardando}
                />
              )}
              {m.precioPorDefinir && (
                <CampoMonto
                  etiqueta="Se vende a"
                  inputMode="decimal"
                  autoComplete="off"
                  value={b.precio}
                  disabled={guardando}
                  onChange={(e) => cambiar({ precio: e.target.value })}
                  pie={ganancia != null ? (ganancia >= 0 ? `Por cada una ganas ${soles(ganancia)}` : "Se vende por debajo de lo que costó") : undefined}
                  tono={ganancia != null && ganancia < 0 ? "aviso" : undefined}
                />
              )}
            </div>
          </CampoGuiado>
          {!esPersona && (
            <CampoGuiado id="responsable" guia={guia} titulo="Quién define">
              <ComboResponsable control={responsable} deshabilitado={guardando} />
            </CampoGuiado>
          )}
          {rechazo && (
            <Aviso tono={rechazo.tono} titulo={rechazo.titulo}>
              {rechazo.texto}
            </Aviso>
          )}
          <PieGuia guia={guia} listo="Listo para guardar." conFrase />
          <PieAcciones className="pie-hoja-fijo pt-1">
            <Boton type="button" peso="fantasma" onClick={() => salida.pedirAccion(cerrar)} disabled={guardando}>
              Cancelar
            </Boton>
            <Boton type="submit" peso="primario" confirma={guia} cargando={guardando} disabled={guardando} className={guia.claseConfirmar}>
              Guardar
            </Boton>
          </PieAcciones>
          {salida.aviso}
        </form>
      )}
    </Modal>
  );
}
