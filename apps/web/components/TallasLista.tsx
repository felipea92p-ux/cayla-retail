"use client";

import { useState, type ReactNode } from "react";
import { avisar } from "@/components/ui/Avisos";
import { ComboResponsable } from "@/components/ComboResponsable";
import { ConfirmarConResponsable } from "@/components/ConfirmarConResponsable";
import { confirmacionCatalogo, type Confirmacion } from "@/lib/confirmar-catalogo";
import { encabezadosOmitidos } from "@/lib/responsable-omitido";
import { useResponsable, type ControlResponsable } from "@/lib/useResponsable";
import { BotonFiltro } from "@/components/ui/BotonFiltro";
import { Modal } from "@/components/ui/Modal";
import { Boton, CampoTexto } from "@/components/ui/campos";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import {
  BarraAtributos,
  BotonesPendiente,
  BotonReactivar,
  DesactivarTarjeta,
  GRILLA_ATRIBUTOS,
  PieTarjeta,
  SinCoincidencias,
  TarjetaAtributo,
  TituloGrupo,
} from "@/components/atributos/kit";
import type { Estilo } from "@/components/MuestraEtiqueta";
import { MuestraTalla } from "@/components/MuestraTalla";
import { normalizarNombre } from "@/lib/patron-visual";
import { compararTallas, tipoDeTalla, type TipoTalla } from "@/lib/tallas";

/**
 * Vocabulario cerrado de tallas (ADR-0095/0096) — mismo mecanismo que
 * Colores/Tejidos/Patrones, con UNA diferencia real: aprobar acá exige un
 * comentario (a qué categoría aplica, por qué es distinta de las que ya
 * existen) — el trigger de la base (`fn_tallas_estado_trigger`) lo hace
 * cumplir, no solo esta pantalla. Las otras 4 tablas de vocabulario siguen
 * de un clic sin fricción; talla es la excepción con razón de negocio: un
 * color de más es barato de limpiar, una talla mal aprobada ensucia la
 * unicidad de variante y es más cara de deshacer con SKUs ya colgando.
 *
 * Qué categorías OFRECEN una talla no vive acá — eso es
 * `retail.categoria_tallas`, sin pantalla propia todavía (BACKLOG.md).
 */

type Talla = {
  id: string;
  valor: string;
  activo: boolean;
  notas: string | null;
  estado: "pendiente" | "aprobado" | "rechazado";
};

// Cómo se agrupa y se pinta cada tipo de talla. El tono reutiliza la paleta
// cerrada de Etiquetas (sin rojo: acento sagrado, máx. 2 usos por pantalla).
const TIPOS: Record<TipoTalla, { grupo: string; dot: string; estilo: Estilo }> = {
  letras: { grupo: "Letras", dot: "bg-tinta/25", estilo: "neutral" },
  numeracion: { grupo: "Numeración", dot: "bg-taupe-profundo", estilo: "campana" },
  unica: { grupo: "Única y estándar", dot: "bg-verde", estilo: "positivo" },
  otras: { grupo: "Otras", dot: "bg-ambar", estilo: "urgencia" },
};

const ORDEN_TIPOS: TipoTalla[] = ["letras", "numeracion", "unica", "otras"];

// El orden de la curva (XS·S·M·L, 6·9·26·42), no el alfabético: "26" va después
// de "9", y "XL" después de "L". Es el mismo que usa Recepción para repartir.
function ordenar(lista: Talla[]) {
  return [...lista].sort((a, b) => compararTallas(a.valor, b.valor));
}

/** La tarjeta de una talla: la de las seis pestañas de Atributos (`components/atributos/kit.tsx`). */
function TarjetaTalla({ t, apagada = false, children }: { t: Talla; apagada?: boolean; children?: ReactNode }) {
  return (
    <TarjetaAtributo
      muestra={<MuestraTalla valor={t.valor} estilo={TIPOS[tipoDeTalla(t.valor)].estilo} />}
      nombre={t.valor}
      notas={t.estado !== "rechazado" ? t.notas : null}
      insignia={t.estado === "pendiente" ? "Pendiente" : t.estado === "rechazado" ? "Rechazada" : null}
      apagada={apagada}
    >
      {children}
    </TarjetaAtributo>
  );
}

export function TallasLista({ tallasIniciales, puedeEditar }: { tallasIniciales: Talla[]; puedeEditar: boolean }) {
  // Catálogo firma cada guardado con el combo «Responsable» (ADR-0161), pero nunca arriba de la lista: va dentro de cada
  // ventana (agregar, editar, rechazar) y los botones de un clic (aprobar, desactivar, reactivar) abren una confirmación
  // (`ConfirmarConResponsable`, textos en lib/confirmar-catalogo.ts). Aprobar, rechazar, desactivar y reactivar ya no piden
  // responsable (Felipe, 2026-09-29): se firman con su clave de `responsable-omitido.ts`; agregar y editar conservan el combo.
  const responsable = useResponsable();
  const [confirmando, setConfirmando] = useState<Confirmacion | null>(null);
  const [tallas, setTallas] = useState(() => ordenar(tallasIniciales));
  const [agregando, setAgregando] = useState(false);
  const [valor, setValor] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [cambiandoId, setCambiandoId] = useState<string | null>(null);

  const [aprobandoAbierto, setAprobandoAbierto] = useState<string | null>(null);
  const [comentarioAprobar, setComentarioAprobar] = useState("");
  const [aprobandoId, setAprobandoId] = useState<string | null>(null);

  const [rechazandoAbierto, setRechazandoAbierto] = useState<string | null>(null);
  const [motivoRechazo, setMotivoRechazo] = useState("");
  const [rechazandoId, setRechazandoId] = useState<string | null>(null);

  const [busqueda, setBusqueda] = useState("");
  const [tipo, setTipo] = useState<TipoTalla | "todas">("todas");
  // La grilla solo se re-asienta cuando la persona cambia un filtro, nunca al
  // cargar la pantalla: el movimiento responde a una acción (ver globals.css).
  const [animar, setAnimar] = useState(false);

  const q = normalizarNombre(busqueda);
  const pasaFiltros = (t: Talla) => (tipo === "todas" || tipoDeTalla(t.valor) === tipo) && (!q || normalizarNombre(t.valor).includes(q));
  const hayFiltros = tipo !== "todas" || q !== "";
  const quitarFiltros = () => {
    setTipo("todas");
    setBusqueda("");
    setAnimar(true);
  };

  const activos = tallas.filter((t) => t.activo);
  const desactivados = tallas.filter((t) => !t.activo);
  const tiposConTallas = ORDEN_TIPOS.filter((g) => activos.some((t) => tipoDeTalla(t.valor) === g));
  const activosVisibles = activos.filter(pasaFiltros);
  const desactivadosVisibles = desactivados.filter(pasaFiltros);

  async function guardar() {
    setGuardando(true);
    try {
      const res = await fetch("/api/productos/tallas", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...responsable.encabezados() },
        body: JSON.stringify({ valor }),
      });
      const datos = await res.json();
      if (!res.ok) {
        avisar.error(datos.error ?? "No se pudo agregar la talla.");
        return;
      }
      setTallas((actual) =>
        ordenar([...actual, { id: datos.talla.id, valor: datos.talla.valor, activo: true, notas: datos.talla.notas, estado: datos.talla.estado }])
      );
      responsable.despues(null);
      avisar.exito(
        datos.talla.estado === "pendiente" ? `${datos.talla.valor} agregada — ya la puedes usar` : `Talla ${datos.talla.valor} agregada`,
        datos.talla.estado === "pendiente" ? { detalle: "Queda pendiente de que un Líder la apruebe, pero eso no te frena." } : undefined
      );
      setAgregando(false);
      setValor("");
    } catch {
      avisar.error("No se pudo hablar con el servidor. Reintenta en un momento.");
    } finally {
      setGuardando(false);
    }
  }

  // Aprobar exige comentario — la base lo rechaza si llega vacío, esto solo
  // evita el viaje al servidor con el botón deshabilitado.
  async function aprobar(t: Talla) {
    if (!comentarioAprobar.trim()) return;
    setAprobandoId(t.id);
    try {
      const res = await fetch("/api/productos/tallas", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...encabezadosOmitidos("talla_aprobar") },
        body: JSON.stringify({ id: t.id, estado: "aprobado", notas: comentarioAprobar.trim() }),
      });
      const datos = await res.json();
      if (!res.ok) {
        avisar.error(datos.error ?? "No se pudo aprobar la talla.");
        return;
      }
      setTallas((actual) => ordenar(actual.map((x) => (x.id === t.id ? { ...x, estado: "aprobado" as const, activo: true, notas: datos.talla.notas } : x))));
      avisar.exito(`${t.valor} aprobada`);
      setAprobandoAbierto(null);
      setComentarioAprobar("");
    } catch {
      avisar.error("No se pudo hablar con el servidor. Reintenta en un momento.");
    } finally {
      setAprobandoId(null);
    }
  }

  async function rechazar(t: Talla) {
    setRechazandoId(t.id);
    try {
      const res = await fetch("/api/productos/tallas", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...encabezadosOmitidos("talla_rechazar") },
        body: JSON.stringify({ id: t.id, estado: "rechazado", ...(motivoRechazo.trim() ? { notas: motivoRechazo.trim() } : {}) }),
      });
      const datos = await res.json();
      if (!res.ok) {
        avisar.error(datos.error ?? "No se pudo rechazar la talla.");
        return;
      }
      setTallas((actual) => ordenar(actual.map((x) => (x.id === t.id ? { ...x, activo: false, estado: "rechazado" as const } : x))));
      avisar.exito(`${t.valor} rechazada`, { detalle: "Cae a Desactivadas. Se puede reactivar después si hace falta." });
      setRechazandoAbierto(null);
      setMotivoRechazo("");
    } catch {
      avisar.error("No se pudo hablar con el servidor. Reintenta en un momento.");
    } finally {
      setRechazandoId(null);
    }
  }

  // Reactivar una rechazada TAMBIÉN exige el comentario (misma regla que
  // aprobar, porque en la base es la misma transición estado→'aprobado').
  function abrirReactivar(t: Talla) {
    setAprobandoAbierto(t.id);
    setComentarioAprobar("");
  }

  async function desactivar(t: Talla) {
    setCambiandoId(t.id);
    try {
      const res = await fetch("/api/productos/tallas", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...encabezadosOmitidos("catalogo_confirmar_estado") },
        body: JSON.stringify({ id: t.id, activo: false }),
      });
      const datos = await res.json();
      if (!res.ok) {
        avisar.error(datos.error ?? "No se pudo desactivar la talla.");
        return;
      }
      setTallas((actual) => ordenar(actual.map((x) => (x.id === t.id ? { ...x, activo: false } : x))));
      avisar.exito(`${t.valor} desactivada`, { detalle: "Deja de aparecer al elegir talla en una prenda nueva; el historial se conserva." });
    } catch {
      avisar.error("No se pudo hablar con el servidor. Reintenta en un momento.");
    } finally {
      setCambiandoId(null);
    }
  }

  const aprobandoTalla = tallas.find((t) => t.id === aprobandoAbierto) ?? null;
  const rechazandoTalla = tallas.find((t) => t.id === rechazandoAbierto) ?? null;

  return (
    <div className="space-y-6">
      <BarraAtributos
        etiqueta="Filtrar tallas"
        filtros={
          <>
            <BotonFiltro activo={tipo === "todas"} onClick={() => { setTipo("todas"); setAnimar(true); }} cuenta={activos.length}>
              Todas
            </BotonFiltro>
            {tiposConTallas.map((g) => (
              <BotonFiltro
                key={g}
                activo={tipo === g}
                onClick={() => { setTipo(tipo === g ? "todas" : g); setAnimar(true); }}
                cuenta={activos.filter((t) => tipoDeTalla(t.valor) === g).length}
              >
                {TIPOS[g].grupo}
              </BotonFiltro>
            ))}
          </>
        }
        busqueda={{ valor: busqueda, onValor: setBusqueda, etiqueta: "Buscar talla", placeholder: "Buscar talla" }}
        agregar={{ texto: "+ Agregar talla", onClick: () => setAgregando(true) }}
      />

      {hayFiltros && activosVisibles.length + desactivadosVisibles.length === 0 && (
        <SinCoincidencias onQuitar={quitarFiltros}>
          {q ? <>Ninguna talla coincide con «{busqueda.trim()}» con los filtros actuales.</> : "Ninguna talla cumple estos filtros."}
        </SinCoincidencias>
      )}

      <div key={tipo} className={`space-y-6 ${animar ? "anim-asentar" : ""}`}>
        {ORDEN_TIPOS.map((clave) => {
          const delTipo = activosVisibles.filter((t) => tipoDeTalla(t.valor) === clave);
          if (delTipo.length === 0) return null;
          const { grupo, dot } = TIPOS[clave];
          return (
            <section key={clave} className="space-y-3">
              <TituloGrupo punto={dot} cuenta={delTipo.length}>
                {grupo}
              </TituloGrupo>
              <div className={GRILLA_ATRIBUTOS}>
                {delTipo.map((t) => (
                  <TarjetaTalla key={t.id} t={t}>
                    {puedeEditar &&
                      (t.estado === "pendiente" ? (
                        <BotonesPendiente
                          onAprobar={() => {
                            setAprobandoAbierto(t.id);
                            setComentarioAprobar("");
                          }}
                          onRechazar={() => {
                            setRechazandoAbierto(t.id);
                            setMotivoRechazo("");
                          }}
                        />
                      ) : (
                        <PieTarjeta>
                          <DesactivarTarjeta
                            cambiando={cambiandoId === t.id}
                            onClick={() => setConfirmando(confirmacionCatalogo("desactivar", t.valor, () => desactivar(t)))}
                          />
                        </PieTarjeta>
                      ))}
                  </TarjetaTalla>
                ))}
              </div>
            </section>
          );
        })}
      </div>

      {desactivadosVisibles.length > 0 && (
        <section className="space-y-3">
          <TituloGrupo cuenta={desactivadosVisibles.length}>Desactivadas — ya no se pueden elegir en una prenda nueva</TituloGrupo>
          <div className={GRILLA_ATRIBUTOS}>
            {desactivadosVisibles.map((t) => (
              <TarjetaTalla key={t.id} t={t} apagada>
                {puedeEditar && <BotonReactivar onClick={() => abrirReactivar(t)} />}
              </TarjetaTalla>
            ))}
          </div>
        </section>
      )}

      {agregando && (
        <NuevaTallaModal valor={valor} onValor={setValor} responsable={responsable} guardando={guardando} onGuardar={guardar} onClose={() => setAgregando(false)} />
      )}

      {aprobandoTalla && (
        <Modal
          titulo={`Aprobar «${aprobandoTalla.valor}»`}
          subtitulo="A qué categoría aplica, por qué es distinta de las que ya existen — queda de referencia."
          ancho="max-w-sm"
          onClose={() => setAprobandoAbierto(null)}
        >
          {(cerrar) => (
            <div className="mt-5 space-y-4">
              <CampoTexto etiqueta="Comentario (obligatorio)" value={comentarioAprobar} onChange={(e) => setComentarioAprobar(e.target.value)} autoFocus />
              <div className="flex gap-2">
                <Boton peso="fantasma" className="flex-1" onClick={cerrar} disabled={aprobandoId === aprobandoTalla.id}>
                  Cancelar
                </Boton>
                <Boton
                  peso="primario"
                  className="flex-1"
                  cargando={aprobandoId === aprobandoTalla.id}
                  disabled={!comentarioAprobar.trim()}
                  onClick={() => aprobar(aprobandoTalla)}
                >
                  Confirmar aprobación
                </Boton>
              </div>
            </div>
          )}
        </Modal>
      )}

      {rechazandoTalla && (
        <Modal titulo={`Rechazar «${rechazandoTalla.valor}»`} ancho="max-w-sm" onClose={() => setRechazandoAbierto(null)}>
          {(cerrar) => (
            <div className="mt-5 space-y-4">
              <CampoTexto etiqueta="Motivo (opcional)" value={motivoRechazo} onChange={(e) => setMotivoRechazo(e.target.value)} autoFocus />
              <div className="flex gap-2">
                <Boton peso="fantasma" className="flex-1" onClick={cerrar} disabled={rechazandoId === rechazandoTalla.id}>
                  Cancelar
                </Boton>
                <Boton
                  peso="primario"
                  className="flex-1"
                  cargando={rechazandoId === rechazandoTalla.id}
                  onClick={() => rechazar(rechazandoTalla)}
                >
                  Confirmar rechazo
                </Boton>
              </div>
            </div>
          )}
        </Modal>
      )}

      {confirmando && <ConfirmarConResponsable confirmacion={confirmando} onClose={() => setConfirmando(null)} />}
    </div>
  );
}

/**
 * La ventana de agregar una talla. Su guía de foco (CLAUDE.md «Guía de foco») sale de lo que ya apaga el botón: el valor y alguien
 * que firma. Vive en su propio componente para que la guía nazca y muera con la ventana.
 */
function NuevaTallaModal({
  valor,
  onValor,
  responsable,
  guardando,
  onGuardar,
  onClose,
}: {
  valor: string;
  onValor: (v: string) => void;
  responsable: ControlResponsable;
  guardando: boolean;
  onGuardar: () => void;
  onClose: () => void;
}) {
  const guia = useGuiaCampos([
    { id: "valor", nombre: "Valor de la talla", requerido: true, hecho: valor.trim() !== "", pendiente: "Escribe la talla: M, 38, XSS…" },
    { id: "responsable", nombre: "Quién registra", requerido: true, hecho: responsable.listo, pendiente: "Elige quién registra." },
  ]);
  return (
    <Modal titulo="Nueva talla" subtitulo="Queda disponible de inmediato para cualquier prenda nueva." ancho="max-w-sm" onClose={onClose}>
      {(cerrar) => (
        <div className="mt-5 space-y-4">
          <CampoGuiado id="valor" guia={guia}>
            <CampoTexto etiqueta={guia.etiqueta("valor", "Valor de la talla")} value={valor} onChange={(e) => onValor(e.target.value)} placeholder="Ej. M, 38, XSS" autoFocus />
          </CampoGuiado>
          <CampoGuiado id="responsable" guia={guia}>
            <ComboResponsable control={responsable} deshabilitado={guardando} />
          </CampoGuiado>
          <PieGuia guia={guia} listo="Todo listo para guardar." />
          <div className="flex gap-2">
            <Boton peso="fantasma" className="flex-1" onClick={cerrar} disabled={guardando}>
              Cancelar
            </Boton>
            <Boton
              peso="primario"
              onClick={onGuardar}
              cargando={guardando}
              disabled={!valor.trim() || !responsable.listo}
              title={responsable.motivo ?? guia.frase ?? undefined}
              className={`flex-1 ${guia.claseConfirmar}`}
            >
              Guardar
            </Boton>
          </div>
        </div>
      )}
    </Modal>
  );
}
