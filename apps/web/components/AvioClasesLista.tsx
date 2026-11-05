"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { Aviso } from "@/components/ui/Aviso";
import { avisar } from "@/components/ui/Avisos";
import { Boton, CampoSelect, CampoTexto, Interruptor } from "@/components/ui/campos";
import { BotonEditar } from "@/components/ui/BotonEditar";
import { Chip } from "@/components/ui/Chip";
import { celda, Encabezado, fila, Tabla } from "@/components/ui/Tabla";
import { Modal } from "@/components/ui/Modal";
import { Vacio } from "@/components/ui/Vacio";
import { COMPORTAMIENTOS, medidasDe, UNIDADES_MEDIDA, type ClaseDeAvio, type ComportamientoClase } from "@/lib/avio-clases-reglas";
import { UNIDADES_INSUMO, unidadesPermitidas, type UnidadInsumo } from "@/lib/insumos-reglas";
import { useResponsable } from "@/lib/useResponsable";

// Catálogo ▸ Atributos ▸ Avíos (ADR-0580): el vocabulario de CLASES de avío, en el mismo lugar que los colores, las tallas, los tejidos y los patrones — que es lo que Felipe pidió el
// 2026-10-30 («debería compartir la misma información de atributos… y sincronizar con los atributos»).
//
// Qué decide una clase, y por qué vive aquí y no en el código: de ella salen la UNIDAD que «Nuevo avío» propone (el hilo en conos), si lleva COLOR (una etiqueta de composición no) y qué
// MEDIDA se le pide (18 L en un botón, 40 cm en un cierre). El líder la amplía y la corrige sin esperar un deploy. Lo que NO se amplía desde aquí es el COMPORTAMIENTO: es una lista cerrada
// de seis, porque de cada uno cuelgan reglas escritas en el código (`lib/avio-clases-reglas.ts`) y una regla editable que decide una unidad irreversible es un estado imposible esperando.

const COMPORTAMIENTO_DICE: Record<ComportamientoClase, string> = {
  pieza: "Se cuenta por pieza; su medida (opcional) es el grosor o el diámetro",
  largo: "Lo que lo distingue es su LARGO en centímetros",
  ancho: "Lo que lo distingue es su ANCHO en centímetros",
  titulo: "Lo que lo distingue es su título (el grosor del hilo)",
  etiqueta: "No se mide y no lleva color: lo distingue su nombre",
  otro: "Todavía sin definir: no propone nada ni pide medida",
};

const PLANTILLA = "grid-cols-1 sm:grid-cols-[minmax(0,1.4fr)_5rem_minmax(0,1.6fr)_7rem_6rem_6rem]";
const COLUMNAS = [{ titulo: "Clase" }, { titulo: "Código" }, { titulo: "Qué es" }, { titulo: "Se cuenta en" }, { titulo: "¿Color?" }, { titulo: "", alinear: "der" as const }];

export function AvioClasesLista({ clasesIniciales, puedeEditar }: { clasesIniciales: ClaseDeAvio[]; puedeEditar: boolean }) {
  const router = useRouter();
  const [clases, setClases] = useState(clasesIniciales);
  const [editando, setEditando] = useState<ClaseDeAvio | null>(null);
  const [creando, setCreando] = useState(false);

  function reemplazar(c: ClaseDeAvio) {
    setClases((cs) => (cs.some((x) => x.id === c.id) ? cs.map((x) => (x.id === c.id ? c : x)) : [...cs, c]).sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, "es")));
    router.refresh();
  }

  return (
    <div data-guia="atributos.clases-de-avio" className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="nota-cayla max-w-prose">
          La clase de un avío decide tres cosas en «Nuevo avío»: <strong>en qué se cuenta</strong> (el hilo en conos), <strong>si lleva color</strong> y <strong>qué medida se le pide</strong>.
          Lo que una clase propone se puede cambiar al crear el avío; lo que no se puede cambiar nunca es la unidad, una vez que entró su primer lote.
        </p>
        {puedeEditar && (
          <Boton peso="primario" onClick={() => setCreando(true)}>
            + Nueva clase
          </Boton>
        )}
      </div>

      {clases.length === 0 ? (
        <Vacio icono={<span aria-hidden>◎</span>} titulo="Todavía no hay clases de avío" acciones={puedeEditar ? <Boton peso="primario" onClick={() => setCreando(true)}>Crear la primera</Boton> : undefined}>
          Sin clases, «Nuevo avío» no sabe qué preguntar. Si acabas de publicar, puede que falte pegar su SQL.
        </Vacio>
      ) : (
        <Tabla>
          <Encabezado columnas={COLUMNAS} plantilla={PLANTILLA} />
          {clases.map((c) => (
            <div key={c.id} className={fila(PLANTILLA, c.activo ? "" : "opacity-60")}>
              <span className={celda("izq", "text-[14px] font-medium text-tinta")}>
                {c.nombre}
                {!c.activo && <span className="ml-2 text-[12px] font-normal text-taupe">(apagada)</span>}
              </span>
              <span className={celda("izq", "font-mono text-[12.5px] text-tinta/75")}>{c.prefijo}-</span>
              <span className={celda("izq", "whitespace-normal text-[13px] text-taupe")}>{COMPORTAMIENTO_DICE[c.comportamiento]}</span>
              <span className={celda("izq", "text-[13px] text-tinta")}>{UNIDADES_INSUMO[c.unidadSugerida].larga}</span>
              <span className={celda("izq")}>
                <Chip tono={c.pideColor ? "verde" : "pizarra"} versalitas={false}>
                  {c.pideColor ? "Sí" : "No"}
                </Chip>
              </span>
              <span className={celda("der")}>
                {puedeEditar && <BotonEditar chico onClick={() => setEditando(c)} />}
              </span>
            </div>
          ))}
        </Tabla>
      )}

      {creando && <HojaDeClase clase={null} onGuardada={reemplazar} onClose={() => setCreando(false)} />}
      {editando && <HojaDeClase key={editando.id} clase={editando} onGuardada={reemplazar} onClose={() => setEditando(null)} />}
    </div>
  );
}

/** Crear una clase (solo el nombre: nace en «Otro» y sin proponer nada) o corregir una que ya existe. */
function HojaDeClase({ clase, onGuardada, onClose }: { clase: ClaseDeAvio | null; onGuardada: (c: ClaseDeAvio) => void; onClose: () => void }) {
  const responsable = useResponsable();
  const [nombre, setNombre] = useState(clase?.nombre ?? "");
  const [comportamiento, setComportamiento] = useState<ComportamientoClase>(clase?.comportamiento ?? "otro");
  const [unidad, setUnidad] = useState<UnidadInsumo>(clase?.unidadSugerida ?? "unidad");
  const [pideColor, setPideColor] = useState(clase?.pideColor ?? true);
  const [activo, setActivo] = useState(clase?.activo ?? true);
  const [cargando, setCargando] = useState(false);

  const guia = useGuiaCampos([
    { id: "nombre", nombre: "Nombre", requerido: true, hecho: nombre.trim().length >= 2, pendiente: "Ponle un nombre de al menos dos letras: de ahí salen las letras del código de sus avíos." },
    { id: "quien", nombre: "Quién lo anota", requerido: true, hecho: responsable.listo, pendiente: "Elige quién anota este cambio." },
  ]);

  async function guardar(ev: React.FormEvent) {
    ev.preventDefault();
    if (!responsable.listo) {
      if (responsable.motivo) avisar.error(responsable.motivo);
      return;
    }
    setCargando(true);
    const cuerpo = clase
      ? { id: clase.id, nombre: nombre.trim(), comportamiento, unidadSugerida: unidad, pideColor, activo }
      : { nombre: nombre.trim() };
    try {
      const res = await fetch("/api/produccion/avio-clases", {
        method: clase ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json", ...responsable.encabezados() },
        body: JSON.stringify(cuerpo),
      });
      const datos = await res.json().catch(() => null);
      if (!res.ok || !datos?.clase?.id) {
        avisar.error(datos?.error ?? "No se pudo guardar la clase de avío.");
        return;
      }
      onGuardada({
        id: datos.clase.id,
        nombre: datos.clase.nombre,
        prefijo: datos.clase.prefijo,
        comportamiento: datos.clase.comportamiento,
        unidadSugerida: datos.clase.unidad_sugerida,
        pideColor: datos.clase.pide_color !== false,
        orden: typeof datos.clase.orden === "number" ? datos.clase.orden : 100,
        activo: datos.clase.activo !== false,
        nota: datos.clase.nota ?? null,
      });
      avisar.exito(clase ? `«${datos.clase.nombre}» corregida` : `Clase «${datos.clase.nombre}» creada`, {
        detalle: clase ? undefined : `Sus avíos empezarán con ${datos.clase.prefijo}-.`,
      });
      onClose();
    } catch {
      avisar.error("No se pudo hablar con el servidor. Reintenta en un momento.");
    } finally {
      setCargando(false);
    }
  }

  const medidas = medidasDe(comportamiento);
  return (
    <Modal
      titulo={clase ? `Corregir «${clase.nombre}»` : "Nueva clase de avío"}
      subtitulo={clase ? `Sus avíos empiezan con ${clase.prefijo}-` : "El código de sus avíos sale de las primeras letras del nombre"}
      variante="hoja"
      tamano="mediana"
      onClose={onClose}
    >
      <form onSubmit={guardar} className="mt-3.5 space-y-4">
        <CampoGuiado id="nombre" guia={guia}>
          <CampoTexto etiqueta={guia.etiqueta("nombre", "Nombre")} value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={60} placeholder="Broche, cordón, cinta de sesgo…" autoComplete="off" /> {/* sugerir-fijo: una clase nueva es justo lo que el sistema todavía no conoce; no hay nada elegido antes de lo que pueda derivarse */}
        </CampoGuiado>

        {clase ? (
          <>
            <CampoSelect
              etiqueta="Qué es"
              pie={COMPORTAMIENTO_DICE[comportamiento]}
              valor={comportamiento}
              onValor={(v: ComportamientoClase) => setComportamiento(v)}
              opciones={(Object.keys(COMPORTAMIENTOS) as ComportamientoClase[]).map((c) => ({ valor: c, texto: COMPORTAMIENTO_DICE[c] }))}
            />
            <CampoSelect
              etiqueta="Se cuenta en (lo que se propone)"
              pie="Es solo una propuesta: quien crea el avío la puede cambiar, y después queda fija para siempre."
              valor={unidad}
              onValor={(v: UnidadInsumo) => setUnidad(v)}
              opciones={unidadesPermitidas("avio").map((u) => ({ valor: u, texto: UNIDADES_INSUMO[u].larga }))}
            />
            <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
              <Interruptor etiqueta="Lleva color" activo={pideColor} onActivo={setPideColor} />
              <Interruptor etiqueta="Se puede elegir" activo={activo} onActivo={setActivo} />
            </div>
            {medidas.length > 0 ? (
              <p className="nota-cayla">
                A un «{nombre.trim() || clase.nombre}» se le va a pedir su medida en {medidas.map((u) => UNIDADES_MEDIDA[u].larga.toLowerCase()).join(" o ")}.
              </p>
            ) : (
              <p className="nota-cayla">A un «{nombre.trim() || clase.nombre}» no se le pide medida.</p>
            )}
            {!activo && (
              <Aviso tono="atencion" chico>
                Apagada, deja de ofrecerse al crear un avío. Los avíos que ya la tienen siguen igual: nada se borra.
              </Aviso>
            )}
          </>
        ) : (
          <Aviso tono="info" chico>
            Nace sin definir: no propone unidad ni pide medida, y lleva color. Cuando sepas qué es (un botón se mide en líneas, un cierre por su largo), la corriges aquí mismo.
          </Aviso>
        )}

        <div className="space-y-3">
          <CampoGuiado id="quien" guia={guia}>
            <ComboResponsable control={responsable} deshabilitado={cargando} compacto />
          </CampoGuiado>
          <PieGuia guia={guia} listo={clase ? "Todo listo para guardar." : "Todo listo para crear la clase."} conFrase />
        </div>

        <div className="pie-acciones border-t border-sand pt-3">
          <Boton type="button" onClick={onClose}>
            Cancelar
          </Boton>
          <Boton type="submit" peso="primario" cargando={cargando} disabled={!guia.puedeConfirmar} title={guia.frase ?? undefined} className={guia.claseConfirmar}>
            {clase ? "Guardar" : "Crear la clase"}
          </Boton>
        </div>
      </form>
    </Modal>
  );
}
