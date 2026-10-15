"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Boton, Campo, CampoSelect, CampoTexto, Desplegable, Interruptor } from "@/components/ui/campos";
import { Chip } from "@/components/ui/Chip";
import { ComboBuscable } from "@/components/ui/ComboBuscable";
import { MiniaturaPrenda } from "@/components/ui/PrendaCelda";
import { avisar } from "@/components/ui/Avisos";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { createClient } from "@/lib/supabase/client";
import { firmar } from "@/lib/responsable-reglas";
import { useResponsable } from "@/lib/useResponsable";
import { traducirError } from "@/lib/error-escritura";
import { camposDeLook } from "@/lib/vitrina-looks-guia";
import {
  colorInicial,
  errorDeLook,
  fraseLimpia,
  lookDeJson,
  lookSinCambios,
  lugarParaGuardar,
  MAX_FRASE_LOOK,
  MAX_NOMBRE_LOOK,
  MAX_PRENDAS_LOOK,
  modelosParaAgregar,
  nombreLimpio,
  opcionesDeLugar,
  piezasElegidasDe,
  piezasParaGuardar,
  prendasQueNoSeVen,
  type Look,
  type ModeloParaLook,
  type PiezaElegida,
} from "@/lib/vitrina-looks-reglas";

/**
 * La hoja de un look (maqueta v4, «Nuevo look» / «Editar look»): su nombre y su frase, de 2 a 4 prendas (el modelo y su color, de los
 * que se ven en la web), si se ve en «Arma tu look» y en qué lugar. El cliente lo ve armado y lo agrega completo eligiendo cada talla.
 * Guardar firma el «Responsable» (ADR-0162); si otra persona lo cambió mientras estaba abierta, la base lo dice y no pisa nada.
 */
export function LookHoja({
  look,
  modelos,
  cuantos,
  onClose,
  onGuardado,
}: {
  /** `null`: un look nuevo. */
  look: Look | null;
  /** Los modelos que se ven en la web: los únicos que se pueden agregar. */
  modelos: ModeloParaLook[];
  /** Cuántos looks hay hoy (para los lugares que se pueden elegir). */
  cuantos: number;
  onClose: () => void;
  onGuardado: (look: Look) => void;
}) {
  const router = useRouter();
  const responsable = useResponsable();
  const [nombre, setNombre] = useState(look?.nombre ?? "");
  const [frase, setFrase] = useState(look?.frase ?? "");
  // Un look nuevo nace encendido (maqueta): para eso se arma.
  const [publicado, setPublicado] = useState(look ? look.publicado : true);
  const [piezas, setPiezas] = useState<PiezaElegida[]>(look ? piezasElegidasDe(look) : []);
  const lugarInicial = look ? look.lugar : cuantos + 1;
  const [lugar, setLugar] = useState(lugarInicial);
  // Cada vez que se agrega una prenda, el combo vuelve a quedar vacío (se monta de nuevo).
  const [vuelta, setVuelta] = useState(0);
  const [guardando, setGuardando] = useState(false);
  // Un doble clic no manda dos veces: el estado de React llega tarde dentro de un mismo clic.
  const enVuelo = useRef(false);

  const porId = new Map(modelos.map((m) => [m.id, m]));
  // Los nombres de las prendas que ya estaban en el look, aunque hoy no se vean (no están entre los modelos de la web).
  const nombresGuardados = new Map((look?.piezas ?? []).map((p) => [p.productoId, p.nombre]));
  const guardadas = new Map((look?.piezas ?? []).map((p) => [p.productoId, p]));
  const noSeVen = prendasQueNoSeVen(piezas, modelos, nombresGuardados);
  const guia = useGuiaCampos(
    camposDeLook({ nombre, frase, prendas: piezas.length, publicado, noSeVen, responsableListo: responsable.listo, responsableMotivo: responsable.motivo }),
  );
  const sinCambios = lookSinCambios(look, { nombre, frase, publicado, piezas, lugar });
  const paraAgregar = modelosParaAgregar(modelos, piezas);

  const agregar = (id: string) => {
    const m = porId.get(id);
    if (!m || piezas.length >= MAX_PRENDAS_LOOK || piezas.some((p) => p.productoId === id)) return;
    setPiezas((ps) => [...ps, { productoId: id, color: colorInicial(m) }]);
    setVuelta((v) => v + 1);
  };
  const cambiarColor = (i: number, color: string) => setPiezas((ps) => ps.map((p, k) => (k === i ? { ...p, color } : p)));
  const quitar = (i: number) => setPiezas((ps) => ps.filter((_, k) => k !== i));

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (enVuelo.current || !guia.puedeConfirmar) return;
    if (sinCambios) {
      onClose();
      return;
    }
    enVuelo.current = true;
    setGuardando(true);
    const { data, error } = await firmar(
      createClient().rpc("vitrina_guardar_look", {
        p_look_id: look?.id ?? null,
        p_nombre: nombreLimpio(nombre),
        p_frase: fraseLimpia(frase),
        p_publicado: publicado,
        p_piezas: piezasParaGuardar(piezas),
        p_lugar: lugarParaGuardar(lugar, lugarInicial),
        p_version: look?.version ?? null,
      }),
      responsable.firma(),
    );
    enVuelo.current = false;
    setGuardando(false);
    responsable.despues(error);
    if (error || !data) {
      const propio = errorDeLook(`${error?.message ?? ""} ${error?.hint ?? ""}`);
      if (propio) avisar.error(propio.titulo, propio.detalle ? { detalle: propio.detalle } : undefined);
      else avisar.error(traducirError(error ?? { message: "sin respuesta" }, "guardar el look"));
      if (propio?.releer) router.refresh();
      return;
    }
    const nuevo = lookDeJson(data);
    if (nuevo) onGuardado(nuevo);
    avisar.exito(publicado ? "Look guardado. Ya se ve en «Arma tu look»." : "Look guardado. Queda oculto.");
    onClose();
  }

  return (
    <Modal
      titulo={look ? "Editar look" : "Nuevo look"}
      subtitulo="El cliente lo ve armado y lo agrega completo eligiendo cada talla."
      onClose={onClose}
      variante="hoja"
      tamano="mediana"
      bloqueado={guardando}
      conCerrar
    >
      <form onSubmit={guardar} className="space-y-5">
        <CampoGuiado id="nombre" guia={guia}>
          <div data-guia="look.nombre">
            <CampoTexto
              etiqueta={guia.etiqueta("nombre", "Nombre del look")}
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              maxLength={MAX_NOMBRE_LOOK}
              placeholder="Un nombre que diga para qué es" // sugerir-fijo: es lo primero de la hoja; no hay nada elegido antes que lo cambie
              disabled={guardando}
            />
          </div>
        </CampoGuiado>

        <CampoGuiado id="frase" guia={guia} titulo="Frase" ayuda="Opcional · cómo se lleva, en una línea">
          <Campo etiqueta="Frase" etiquetaOculta pie={frase.length > MAX_FRASE_LOOK - 40 ? `Quedan ${Math.max(0, MAX_FRASE_LOOK - frase.length)} letras.` : undefined}>
            <div className="caja-cayla caja-campo caja-campo-texto-largo">
              <textarea
                className="self-stretch resize-none"
                rows={2}
                maxLength={MAX_FRASE_LOOK}
                value={frase}
                onChange={(e) => setFrase(e.target.value)}
                aria-label="Frase del look"
                disabled={guardando}
              />
            </div>
          </Campo>
        </CampoGuiado>

        <CampoGuiado id="prendas" guia={guia} titulo="Prendas del look" ayuda={`${piezas.length} de ${MAX_PRENDAS_LOOK}`} retiene="fila">
          <div className="space-y-2.5" data-guia="look.prendas">
            {piezas.length === 0 ? (
              <p className="text-[13px] text-taupe">Agrega de 2 a 4 prendas que se vean bien juntas. Salen en este orden en la lámina.</p>
            ) : (
              <ol className="divide-y divide-sand rounded-xl border border-sand bg-papel">
                {piezas.map((p, i) => {
                  const m = porId.get(p.productoId);
                  const antes = guardadas.get(p.productoId);
                  const color = m?.colores.find((c) => c.codigo === p.color);
                  const nombrePrenda = m?.nombre ?? antes?.nombre ?? "Prenda";
                  const seVe = Boolean(m && color);
                  return (
                    <li key={p.productoId} className="flex items-center gap-3 px-3 py-2.5">
                      <MiniaturaPrenda
                        fotoUrl={color?.foto ?? m?.foto ?? antes?.foto ?? null}
                        colorHex={color?.hex ?? antes?.color.hex ?? null}
                        tamano="lg"
                        prefijo={m?.prefijo ?? antes?.prefijo ?? null}
                        familia={m?.familia ?? antes?.familia ?? null}
                        categoria={m?.categoria ?? antes?.categoria ?? null}
                      />
                      <span className="min-w-0 flex-1 space-y-1">
                        <span className="flex flex-wrap items-center gap-2 text-[14px] font-medium text-tinta">
                          <span className="truncate">{`${i + 1}. ${nombrePrenda}`}</span>
                          {!seVe && <Chip tono="ambar">No se ve en la web</Chip>}
                        </span>
                        {m && m.colores.length > 1 ? (
                          <Desplegable
                            valor={p.color}
                            onValor={(c) => cambiarColor(i, c)}
                            opciones={m.colores.map((c) => ({ valor: c.codigo, texto: c.foto ? c.nombre : `${c.nombre} (sin foto propia)` }))}
                            etiquetaAccesible={`Color de ${nombrePrenda}`}
                            deshabilitado={guardando}
                            className="max-w-[16rem]"
                          />
                        ) : (
                          <span className="block text-[12px] text-taupe">{color?.nombre ?? antes?.color.nombre ?? p.color}</span>
                        )}
                      </span>
                      <button
                        type="button"
                        aria-label={`Quitar ${nombrePrenda} del look`}
                        onClick={() => quitar(i)}
                        disabled={guardando}
                        className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-tinta/60 hover:bg-tinta/10 hover:text-tinta"
                      >
                        <X aria-hidden className="h-4 w-4" />
                      </button>
                    </li>
                  );
                })}
              </ol>
            )}
            {piezas.length < MAX_PRENDAS_LOOK && (
              <div>
                <ComboBuscable
                  key={vuelta}
                  etiquetaAccesible="Agregar una prenda al look"
                  marcador={paraAgregar.length > 0 ? "Busca por nombre" : "No quedan modelos que se vean en la web"}
                  valor=""
                  onValor={agregar}
                  opciones={paraAgregar.map((m) => ({ valor: m.id, texto: m.nombre, detalle: m.categoria ?? undefined }))}
                />
              </div>
            )}
          </div>
        </CampoGuiado>

        <div className="space-y-4 border-t border-sand pt-4">
          <CampoGuiado id="mostrar" guia={guia}>
            <div data-guia="look.mostrar">
              <Interruptor
                activo={publicado}
                onActivo={setPublicado}
                disabled={guardando}
                etiqueta={guia.etiqueta("mostrar", "Mostrar en la web")}
                pie={
                  noSeVen.length > 0 && publicado
                    ? "Para mostrarlo, todas sus prendas tienen que verse en la web."
                    : "Sale en «Arma tu look» de la tienda online, en el lugar que le toca."
                }
              />
            </div>
          </CampoGuiado>
          <div className="max-w-[18rem]" data-guia="look.lugar">
            <CampoSelect
              etiqueta="Lugar en «Arma tu look»"
              valor={String(lugar)}
              onValor={(v) => setLugar(Number(v))}
              opciones={opcionesDeLugar(look ? cuantos : cuantos + 1)}
              deshabilitado={guardando}
            />
          </div>
        </div>

        <CampoGuiado id="responsable" guia={guia}>
          <div data-guia="look.responsable">
            <ComboResponsable control={responsable} deshabilitado={guardando} />
          </div>
        </CampoGuiado>

        <div className="pie-hoja-fijo flex flex-wrap items-center gap-x-3 gap-y-2 pt-2">
          <PieGuia guia={guia} listo={sinCambios ? "No cambiaste nada." : "Todo listo."} />
          <div className="ml-auto pie-acciones" data-guia="look.guardar">
            <Boton type="button" onClick={onClose}>
              Cancelar
            </Boton>
            <Boton type="submit" peso="primario" cargando={guardando} disabled={!guia.puedeConfirmar} title={guia.frase ?? undefined} className={guia.claseConfirmar}>
              Guardar look
            </Boton>
          </div>
        </div>
      </form>
    </Modal>
  );
}
