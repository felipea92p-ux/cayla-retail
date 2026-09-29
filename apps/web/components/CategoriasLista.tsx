"use client";

import { useState } from "react";
import Link from "next/link";
import { avisar } from "@/components/ui/Avisos";
import { ComboResponsable } from "@/components/ComboResponsable";
import { ConfirmarConResponsable } from "@/components/ConfirmarConResponsable";
import { confirmacionCatalogo, type Confirmacion } from "@/lib/confirmar-catalogo";
import { encabezadosOmitidos } from "@/lib/responsable-omitido";
import { useResponsable } from "@/lib/useResponsable";
import { Modal } from "@/components/ui/Modal";
import { Chip } from "@/components/ui/Chip";
import { BotonFiltro } from "@/components/ui/BotonFiltro";
import { Boton, Campo, CampoSelect, CampoTexto, SelectorMultiple } from "@/components/ui/campos";
import { buscarCategorias } from "@/lib/categorias-reglas";
import type { EjesPorCategoria, ValorVocabulario } from "@/lib/catalogo-v2";
import type { Familia } from "@cayla-retail/shared";
import { IconoCategoria } from "@/components/IconoCategoria";
import { MuestraCategoria, tonoDeCategoria } from "@/components/MuestraCategoria";
import { BarraAtributos, GRILLA_ATRIBUTOS, SinCoincidencias, TarjetaAtributo, TituloGrupo } from "@/components/atributos/kit";
import { PUNTO_DEL_TONO, tonoDeFamilia } from "@/lib/categoria-tonos";
import { avisoChoque, ejemploParaFamilia, prefijoDesdeNombre, quienUsaNombre, quienUsaPrefijo } from "@/lib/categoria-alta-reglas";

/**
 * Las familias del negocio (Indumentaria, Calzado...), cada una con sus
 * categorías (BLU, POL, JEA…). Portado de V1 (ADR-0095) — a diferencia de
 * V1, en V2 `categorias.nombre` es único GLOBAL (no por familia): dos
 * familias no pueden tener una categoría con el mismo nombre, a propósito,
 * para no repetir el error que V1 sí permitía.
 *
 * FAMILIA YA NO ES UNA LISTA FIJA (2026-09-18, `retail.familias`). Antes
 * eran 6 valores hardcodeados en `packages/shared` (CHECK constraint en la
 * base); ahora es una tabla que un Líder edita desde `/productos/familias`
 * — el prop `familias` de este componente es esa lista (solo activas). Sin
 * proponer/aprobar como colores/tallas: agregar una familia es una decisión
 * de marca, no operativa (ver 20260918010000_familias_tabla_propia.sql).
 *
 * ALTA, EDICIÓN Y DESACTIVAR/REACTIVAR (2026-09-15). El prefijo queda fijo
 * apenas hay un producto con esa categoría (es la letra del código corto de
 * la prenda), y desactivar se bloquea si hay productos activos — el mensaje
 * con el conteo llega tal cual de `retail.desactivar_categoria`
 * (20260915160000_categorias_editar_desactivar.sql) vía `traducirError`.
 *
 * SUBCATEGORÍA OPCIONAL, UN SOLO NIVEL (2026-09-15, F3). Una categoría
 * puede tener hijas (`categoria_padre_id`) — el candado de un solo nivel y
 * la familia heredada del padre los cierra `retail.fn_valida_categoria_subcategoria`
 * (20260915224500) — esta pantalla nunca deja elegir un padre que ya sea
 * hija, ni un padre para una categoría que ya tiene hijas propias, pero el
 * candado real vive en la base, no acá.
 *
 * TALLAS/TEJIDOS/PATRONES QUE OFRECE (2026-09-17, ADR-0095).
 * `categoria_tallas`/`categoria_tejidos`/`categoria_patrones` reemplazan,
 * no amplían: una subcategoría tiene su propia lista, nunca hereda la del
 * padre. Se guarda JUNTO con el resto del formulario, un solo botón
 * ("Guardar cambios").
 *
 * REDISEÑO A TARJETAS + VISTA RÁPIDA (2026-09-17, pedido de Felipe).
 * Antes: fila de chips de texto, clic abría directo el formulario de
 * edición completo — ni colaboradores sin permiso de editar podían ver qué
 * tallas ofrecía una categoría o cuántos productos tiene. Ahora sigue la
 * misma línea visual que `ProductosGrilla` (tarjeta con ícono, elevación al
 * pasar el mouse, "Vista rápida" separada de "Editar"): un clic SIEMPRE
 * abre una vista de solo lectura (cualquier rol) con el conteo de
 * productos, subcategorías y los 3 ejes; "Editar" (solo Líder) recién ahí
 * entra al formulario de siempre, sin tocar ninguna de sus mutaciones.
 *
 * TEMPORADA POR DEFECTO (2026-09-26, ADR-0246). Cada categoría puede tener
 * una («Ropa de baño» → Verano) que heredan sus prendas sin temporada propia.
 * Aquí solo se MUESTRA: se elige en Atributos ▸ Temporadas, junto a la lista
 * y a cuántas prendas la heredan (cambiarla las reclasifica todas a la vez, y
 * esa cifra vive allá). Un solo lugar para cambiarla.
 *
 * BUSCADOR (2026-09-28). Por nombre o prefijo, sin tildes ni mayúsculas, como
 * Marcas y Tallas. Una subcategoría que responde trae la tarjeta de su padre
 * (las hijas no tienen tarjeta propia) y la tarjeta dice cuál respondió.
 * Mientras se busca, las familias sin nada que mostrar se ocultan. La regla
 * vive en `lib/categorias-reglas.ts`, con su prueba.
 */

/** Dónde se elige la temporada de una categoría: la vista «Por categoría» de la pestaña Temporadas (ADR-0246). */
// `desde=categorias`: la vista de destino muestra «← Categorías» (Atributos está en el menú y no la lleva siempre).
const HREF_TEMPORADAS = "/productos/atributos?tipo=temporadas&vista=categorias&desde=categorias";

type Categoria = {
  id: string;
  nombre: string;
  prefijo: string | null;
  familia: Familia | null;
  activo: boolean;
  categoriaPadreId: string | null;
  notas: string | null;
};

// El nombre visible de cada familia (ej. "Accesorios y Complementos") ya no
// se hardcodea acá: viene de `retail.familias` (20260918010000) — un Líder
// la edita desde /productos/familias sin tocar código. `familias` es el
// prop con esa lista (solo activas: una familia no se puede desactivar con
// categorías activas colgando, así que siempre hay una fila para todo `f`).
type FamiliaOpcion = { codigo: string; nombre: string };

const SIN_PADRE = "__ninguna__";

type Borrador = { id: string | null; nombre: string; prefijo: string; familia: Familia; notas: string; categoriaPadreId: string | null };
const borradorVacio = (familias: FamiliaOpcion[]): Borrador => ({
  id: null,
  nombre: "",
  prefijo: "",
  familia: familias[0]?.codigo ?? "",
  notas: "",
  categoriaPadreId: null,
});

/** `tallaHabitualIds`: la curva habitual (20260918230100) — las tallas que vienen MARCADAS al crear un producto. Siempre un subconjunto de `tallaIds`. */
type EjesDraft = { tallaIds: string[]; tallaHabitualIds: string[]; tejidoIds: string[]; patronIds: string[] };
const EJES_VACIO: EjesDraft = { tallaIds: [], tallaHabitualIds: [], tejidoIds: [], patronIds: [] };

export function CategoriasLista({
  categoriasIniciales,
  puedeEditar,
  universo,
  ejesPorCategoria: ejesPorCategoriaInicial,
  familias,
  productosPorCategoria,
  productosTotalesPorCategoria,
  temporadaPorCategoria = null,
}: {
  categoriasIniciales: Categoria[];
  puedeEditar: boolean;
  universo: { tallas: ValorVocabulario[]; tejidos: ValorVocabulario[]; patrones: ValorVocabulario[] };
  ejesPorCategoria: EjesPorCategoria;
  familias: FamiliaOpcion[];
  productosPorCategoria: Record<string, number>;
  /** Productos de cualquier estado por categoría (`n_total`): con uno solo el prefijo ya no cambia. Vacío si la base
   *  todavía no lo devuelve — entonces el campo no se bloquea de antemano y el rechazo llega al guardar, como antes. */
  productosTotalesPorCategoria: Record<string, number>;
  /** categoriaId → nombre de su temporada por defecto (ADR-0246). `null` = la base todavía no tiene la lista: no se
   *  dice nada de temporadas. Una categoría sin temporada no está en el mapa. */
  temporadaPorCategoria?: Record<string, string> | null;
}) {
  const etiquetaFamilia = (codigo: Familia) => familias.find((f) => f.codigo === codigo)?.nombre ?? codigo;
  const opcionesFamilia = familias.map((f) => ({ valor: f.codigo, texto: f.nombre }));
  // Catálogo firma cada guardado con el combo «Responsable» (ADR-0161), pero nunca arriba de la lista: va dentro de cada
  // ventana (agregar, editar, rechazar) y los botones de un clic (aprobar, desactivar, reactivar) abren una confirmación
  // (`ConfirmarConResponsable`, textos en lib/confirmar-catalogo.ts). Aprobar, rechazar, desactivar y reactivar ya no piden
  // responsable (Felipe, 2026-09-29): se firman con su clave de `responsable-omitido.ts`; agregar y editar conservan el combo.
  const responsable = useResponsable();
  const [confirmando, setConfirmando] = useState<Confirmacion | null>(null);
  const [categorias, setCategorias] = useState(categoriasIniciales);
  const [borrador, setBorrador] = useState<Borrador | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [cambiandoId, setCambiandoId] = useState<string | null>(null);
  const [subDraft, setSubDraft] = useState({ nombre: "", prefijo: "" });
  const [subGuardando, setSubGuardando] = useState(false);
  // ¿El prefijo lo escribió la persona? Mientras no, sigue al nombre (`prefijoDesdeNombre`); apenas lo toca, se respeta
  // lo suyo. Si lo vacía, queda vacío (para que pueda escribir otro) y la propuesta vuelve al cambiar el nombre. Al
  // editar una categoría existente arranca en «propio»: su prefijo ya existe y cambiarle el nombre no debe moverlo.
  const [prefijoPropio, setPrefijoPropio] = useState(false);
  const [subPrefijoPropio, setSubPrefijoPropio] = useState(false);
  // Qué categoría está en "Vista rápida" (solo lectura, cualquier rol) —
  // separado de `borrador`: un clic en la tarjeta abre esto, nunca el
  // formulario directamente. `abrirBorrador` sigue siendo el único camino
  // al formulario de edición real.
  const [viendoId, setViendoId] = useState<string | null>(null);
  // Copia local de lo que YA ofrece cada categoría — igual que `categorias`,
  // arranca del prop y se actualiza sola tras cada guardado, así reabrir el
  // modal de la misma categoría en la misma sesión muestra lo recién
  // guardado en vez de la foto del primer render.
  const [ejesPorCategoria, setEjesPorCategoria] = useState(ejesPorCategoriaInicial);
  const [ejesDraft, setEjesDraft] = useState<EjesDraft>(EJES_VACIO);
  const [busqueda, setBusqueda] = useState("");
  // Filtro por familia (las píldoras de arriba, como en Atributos). Solo estado de pantalla: no cambia qué se guarda ni qué se lee.
  const [familiaFiltro, setFamiliaFiltro] = useState("todas");

  const editando = borrador?.id !== null && borrador?.id !== undefined;
  const activas = categorias.filter((c) => c.activo);
  const desactivadas = categorias.filter((c) => !c.activo);
  const viendo = categorias.find((c) => c.id === viendoId) ?? null;
  // `null` = no se busca nada. Si no, id → nombres de las subcategorías que respondieron (ver `buscarCategorias`).
  // Activas y desactivadas por separado: una hija desactivada no debe hacer salir a su padre activo.
  const coinciden = buscarCategorias(activas, busqueda);
  const seVe = (c: Categoria) => coinciden === null || coinciden.has(c.id);
  const desactivadasCoinciden = buscarCategorias(desactivadas, busqueda);
  // Una familia que ya no está (se desactivó desde /productos/familias) no puede quedar elegida: cae a «Todas».
  const familiaActiva = familias.some((f) => f.codigo === familiaFiltro) ? familiaFiltro : "todas";
  const enLaFamilia = (c: Categoria) => familiaActiva === "todas" || c.familia === familiaActiva;
  const desactivadasVisibles = desactivadas.filter((c) => (desactivadasCoinciden === null || desactivadasCoinciden.has(c.id)) && enLaFamilia(c));
  const quitarFiltros = () => {
    setBusqueda("");
    setFamiliaFiltro("todas");
  };

  function abrirBorrador(b: Borrador | null) {
    setViendoId(null);
    setBorrador(b);
    setPrefijoPropio(Boolean(b?.id));
    setSubDraft({ nombre: "", prefijo: "" });
    setSubPrefijoPropio(false);
    setEjesDraft(
      b?.id
        ? {
            tallaIds: (ejesPorCategoria.tallas[b.id] ?? []).map((v) => v.id),
            tallaHabitualIds: ejesPorCategoria.habituales[b.id] ?? [],
            tejidoIds: (ejesPorCategoria.tejidos[b.id] ?? []).map((v) => v.id),
            patronIds: (ejesPorCategoria.patrones[b.id] ?? []).map((v) => v.id),
          }
        : EJES_VACIO
    );
  }

  // Una hija "visible como raíz" cubre el caso raro de que su padre se haya
  // desactivado: sigue activa, así que tiene que aparecer en algún lado en
  // vez de perderse (principio 2 — cero estados inconsistentes).
  function esRaizVisible(c: Categoria) {
    if (!c.categoriaPadreId) return true;
    const padre = categorias.find((p) => p.id === c.categoriaPadreId);
    return !padre || !padre.activo;
  }
  const hijasDe = (padreId: string) => activas.filter((c) => c.categoriaPadreId === padreId);

  // Candidatas a "categoría padre" en el selector de alta: solo raíces
  // activas — una hija no puede a su vez ser padre (candado real en la
  // base; acá solo evitamos ofrecer una opción que la base va a rechazar).
  const raicesElegibles = activas.filter((c) => c.categoriaPadreId === null);

  async function guardar() {
    if (!borrador) return;
    setGuardando(true);
    try {
      const res = await fetch("/api/productos/categorias", {
        method: editando ? "PUT" : "POST",
        headers: { "Content-Type": "application/json", ...responsable.encabezados() },
        body: JSON.stringify({
          id: borrador.id ?? undefined,
          nombre: borrador.nombre,
          familia: borrador.familia,
          prefijo: borrador.prefijo,
          notas: borrador.notas,
          categoriaPadreId: borrador.categoriaPadreId ?? undefined,
        }),
      });
      const datos = await res.json();
      if (!res.ok) {
        avisar.error(datos.error ?? `No se pudo ${editando ? "editar" : "agregar"} la categoría.`);
        return;
      }
      const guardada: Categoria = {
        id: datos.categoria.id,
        nombre: datos.categoria.nombre,
        prefijo: datos.categoria.prefijo,
        familia: datos.categoria.familia ?? borrador.familia,
        activo: true,
        categoriaPadreId: datos.categoria.categoriaPadreId ?? borrador.categoriaPadreId ?? null,
        notas: datos.categoria.notas ?? (borrador.notas.trim() || null),
      };
      setCategorias((actual) => {
        const sinEsta = actual.filter((c) => c.id !== guardada.id);
        return [...sinEsta, guardada].sort((a, b) => a.nombre.localeCompare(b.nombre));
      });

      // Tallas/tejidos/patrones se guardan en la MISMA acción — antes vivían
      // en un botón aparte dentro del mismo modal, y el botón grande de
      // abajo ("Guardar cambios", el que cualquiera espera que cierre el
      // formulario guardando todo) los descartaba en silencio mostrando
      // igual un aviso de éxito. Dos botones de guardar en el mismo modal
      // era el error de diseño, no una falta de atención de quien hacía
      // clic — se resuelve juntándolos en uno solo, no agregando una
      // advertencia encima.
      if (editando) {
        const resEjes = await fetch("/api/productos/categorias/ejes", {
          method: "PUT",
          headers: { "Content-Type": "application/json", ...responsable.encabezados() },
          body: JSON.stringify({ categoriaId: guardada.id, ...ejesDraft }),
        });
        if (!resEjes.ok) {
          const datosEjes = await resEjes.json().catch(() => null);
          avisar.error(datosEjes?.error ?? "La categoría se guardó, pero no se pudieron guardar las tallas/tejidos/patrones. Reintenta editándola de nuevo.");
          // La categoría sí quedó guardada (y el modal se cierra): reintentar es otra operación, con combo vacío.
          responsable.despues(null);
          abrirBorrador(null);
          return;
        }
        setEjesPorCategoria((actual) => ({
          tallas: { ...actual.tallas, [guardada.id]: universo.tallas.filter((v) => ejesDraft.tallaIds.includes(v.id)) },
          // La curva habitual que se acaba de guardar (actualizar_categoria_ejes).
          habituales: { ...actual.habituales, [guardada.id]: ejesDraft.tallaHabitualIds },
          tejidos: { ...actual.tejidos, [guardada.id]: universo.tejidos.filter((v) => ejesDraft.tejidoIds.includes(v.id)) },
          patrones: { ...actual.patrones, [guardada.id]: universo.patrones.filter((v) => ejesDraft.patronIds.includes(v.id)) },
        }));
      }

      responsable.despues(null);

      avisar.exito(editando ? `Categoría ${guardada.nombre} actualizada` : `Categoría ${guardada.nombre} agregada`);
      abrirBorrador(null);
    } catch {
      avisar.error("No se pudo hablar con el servidor. Reintenta en un momento.");
    } finally {
      setGuardando(false);
    }
  }

  async function guardarSubcategoria(padre: { id: string; familia: Familia }) {
    if (!subDraft.nombre.trim() || subDraft.prefijo.length !== 3) return;
    setSubGuardando(true);
    try {
      const res = await fetch("/api/productos/categorias", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...responsable.encabezados() },
        body: JSON.stringify({
          nombre: subDraft.nombre,
          familia: padre.familia,
          prefijo: subDraft.prefijo,
          categoriaPadreId: padre.id,
        }),
      });
      const datos = await res.json();
      if (!res.ok) {
        avisar.error(datos.error ?? "No se pudo agregar la subcategoría.");
        return;
      }
      const nueva: Categoria = {
        id: datos.categoria.id,
        nombre: datos.categoria.nombre,
        prefijo: datos.categoria.prefijo,
        familia: datos.categoria.familia ?? padre.familia,
        activo: true,
        categoriaPadreId: datos.categoria.categoriaPadreId ?? padre.id,
        notas: null,
      };
      setCategorias((actual) => [...actual, nueva]);
      responsable.despues(null);
      avisar.exito(`Subcategoría ${nueva.nombre} agregada`);
      setSubDraft({ nombre: "", prefijo: "" });
      setSubPrefijoPropio(false);
    } catch {
      avisar.error("No se pudo hablar con el servidor. Reintenta en un momento.");
    } finally {
      setSubGuardando(false);
    }
  }

  // `soltada`: el clic viene de la confirmación de un clic (reactivar), que va sin responsable (Felipe, 2026-09-29). El
  // «Desactivar categoría» de la ventana de edición conserva su combo.
  async function cambiarEstado(c: Categoria, soltada = false) {
    setCambiandoId(c.id);
    try {
      const res = await fetch("/api/productos/categorias", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(soltada ? encabezadosOmitidos("catalogo_confirmar_estado") : responsable.encabezados()) },
        body: JSON.stringify({ id: c.id, activo: !c.activo }),
      });
      const datos = await res.json();
      if (!res.ok) {
        avisar.error(datos.error ?? `No se pudo ${c.activo ? "desactivar" : "reactivar"} la categoría.`);
        return;
      }
      setCategorias((actual) => actual.map((x) => (x.id === c.id ? { ...x, activo: !c.activo } : x)));
      if (!soltada) responsable.despues(null);
      avisar.exito(c.activo ? `${c.nombre} desactivada` : `${c.nombre} reactivada`, {
        detalle: c.activo ? "Deja de aparecer al crear productos; el historial se conserva." : "Vuelve a estar disponible para productos nuevos.",
      });
      if (c.activo) abrirBorrador(null);
    } catch {
      avisar.error("No se pudo hablar con el servidor. Reintenta en un momento.");
    } finally {
      setCambiandoId(null);
    }
  }

  const hijasDeEditada = editando && borrador ? hijasDe(borrador.id!) : [];
  // El prefijo es la letra del código de cada prenda (BLU-0042-AZM-M): con un producto creado, de cualquier estado,
  // ya no cambia. Se bloquea ANTES de escribir, con el mismo conteo que usa el candado de la base
  // (`fn_categorias_vigencia_candados`), en vez de dejar tipearlo y rechazarlo al guardar.
  const productosConEstePrefijo = editando && borrador ? productosTotalesPorCategoria[borrador.id!] ?? 0 : 0;
  const prefijoFijo = productosConEstePrefijo > 0;
  // Choques contra TODAS las categorías (también las desactivadas: los candados de la base no las excluyen). Se avisa
  // al tipear y se bloquea «Guardar»; el candado real sigue en la base (dos líderes guardando a la vez).
  const excluirId = borrador?.id ?? null;
  const ejemplo = borrador ? ejemploParaFamilia(borrador.familia, categorias) : null;
  const choquePrefijo = borrador && !prefijoFijo ? quienUsaPrefijo(borrador.prefijo, categorias, excluirId) : null;
  const choqueNombre = borrador ? quienUsaNombre(borrador.nombre, categorias, excluirId) : null;
  const subChoquePrefijo = quienUsaPrefijo(subDraft.prefijo, categorias, null);
  const subChoqueNombre = quienUsaNombre(subDraft.nombre, categorias, null);

  // Lo que se ve, calculado una vez: las familias (todas, o solo la elegida en las píldoras) con sus categorías raíz que responden
  // al buscador. Buscando, una familia sin nada que mostrar no aparece («Sin categorías todavía» mentiría); sin buscar, una
  // familia vacía sí (un Líder que acaba de crearla tiene que verla).
  const raicesDe = (f: string) => activas.filter((c) => c.familia === f && esRaizVisible(c));
  const totalRaices = familias.reduce((n, f) => n + raicesDe(f.codigo).length, 0);
  const grupos = familias
    .filter((f) => familiaActiva === "todas" || f.codigo === familiaActiva)
    .map((f) => ({ codigo: f.codigo, raices: raicesDe(f.codigo).filter(seVe) }))
    .filter((g) => coinciden === null || g.raices.length > 0);
  const hayFiltros = coinciden !== null || familiaActiva !== "todas";
  const nadaQueMostrar = hayFiltros && grupos.length === 0 && desactivadasVisibles.length === 0;

  return (
    <div className="space-y-6">
      <BarraAtributos
        etiqueta="Filtrar por familia"
        filtros={
          <>
            <BotonFiltro activo={familiaActiva === "todas"} onClick={() => setFamiliaFiltro("todas")} cuenta={totalRaices}>
              Todas
            </BotonFiltro>
            {familias.map((f) => (
              <BotonFiltro
                key={f.codigo}
                activo={familiaActiva === f.codigo}
                onClick={() => setFamiliaFiltro(familiaActiva === f.codigo ? "todas" : f.codigo)}
                cuenta={raicesDe(f.codigo).length}
              >
                {f.nombre}
              </BotonFiltro>
            ))}
          </>
        }
        busqueda={{ valor: busqueda, onValor: setBusqueda, etiqueta: "Buscar categoría o prefijo", placeholder: "Categoría o prefijo" }}
        agregar={puedeEditar ? { texto: "+ Agregar categoría", onClick: () => abrirBorrador(borradorVacio(familias)) } : undefined}
      />

      {nadaQueMostrar && (
        <SinCoincidencias onQuitar={quitarFiltros}>
          {coinciden !== null ? <>Ninguna categoría coincide con «{busqueda.trim()}» con los filtros actuales.</> : "Ninguna categoría cumple este filtro."}
        </SinCoincidencias>
      )}

      {grupos.map(({ codigo: f, raices }) => (
        <section key={f} className="space-y-3">
          <TituloGrupo punto={PUNTO_DEL_TONO[tonoDeFamilia(f)]} cuenta={raices.length}>
            {etiquetaFamilia(f)}
          </TituloGrupo>
          {raices.length > 0 ? (
            <div className={GRILLA_ATRIBUTOS}>
              {raices.map((c) => (
                <TarjetaCategoria
                  key={c.id}
                  c={c}
                  productos={productosPorCategoria[c.id] ?? 0}
                  subcategorias={hijasDe(c.id).length}
                  temporada={temporadaPorCategoria?.[c.id] ?? null}
                  subcategoriasQueCoinciden={coinciden?.get(c.id) ?? []}
                  onClick={() => setViendoId(c.id)}
                />
              ))}
            </div>
          ) : (
            <p className="text-xs italic text-tinta/65">Sin categorías todavía.</p>
          )}
        </section>
      ))}

      {viendo && (
        <VistaRapidaCategoria
          categoria={viendo}
          familia={viendo.familia}
          nombreFamilia={viendo.familia ? etiquetaFamilia(viendo.familia) : null}
          productos={productosPorCategoria[viendo.id] ?? 0}
          hijas={hijasDe(viendo.id)}
          padre={viendo.categoriaPadreId ? categorias.find((c) => c.id === viendo.categoriaPadreId) ?? null : null}
          tallas={ejesPorCategoria.tallas[viendo.id] ?? []}
          tallasHabituales={ejesPorCategoria.habituales[viendo.id] ?? []}
          tejidos={ejesPorCategoria.tejidos[viendo.id] ?? []}
          patrones={ejesPorCategoria.patrones[viendo.id] ?? []}
          temporada={temporadaPorCategoria ? { nombre: temporadaPorCategoria[viendo.id] ?? null } : null}
          puedeEditar={puedeEditar}
          onClose={() => setViendoId(null)}
          onVerHija={(id) => setViendoId(id)}
          onEditar={() =>
            abrirBorrador({
              id: viendo.id,
              nombre: viendo.nombre,
              prefijo: viendo.prefijo ?? "",
              familia: viendo.familia ?? "indumentaria",
              notas: viendo.notas ?? "",
              categoriaPadreId: viendo.categoriaPadreId,
            })
          }
        />
      )}

      {borrador && (
        <Modal
          titulo={editando ? "Editar categoría" : "Nueva categoría"}
          subtitulo={
            editando
              ? prefijoFijo
                ? "El prefijo queda fijo: ya hay productos creados con este código."
                : "El prefijo ya no se puede cambiar si hay productos con esta categoría."
              : "Queda disponible de inmediato en Productos."
          }
          ancho="max-w-xl"
          onClose={() => abrirBorrador(null)}
        >
          {(cerrar) => (
            <>
          <div className="mt-5 space-y-4">
            {!editando && (
              <CampoSelect
                etiqueta="Categoría padre (opcional)"
                valor={borrador.categoriaPadreId ?? SIN_PADRE}
                onValor={(v) => {
                  if (v === SIN_PADRE) {
                    setBorrador({ ...borrador, categoriaPadreId: null });
                    return;
                  }
                  const padre = raicesElegibles.find((c) => c.id === v);
                  setBorrador({ ...borrador, categoriaPadreId: v, familia: padre?.familia ?? borrador.familia });
                }}
                opciones={[
                  { valor: SIN_PADRE, texto: "— Ninguna (categoría de primer nivel) —" },
                  ...raicesElegibles.map((c) => ({ valor: c.id, texto: c.nombre })),
                ]}
              />
            )}

            <div className="grid gap-4 sm:grid-cols-[1fr_2fr_1fr]">
              {borrador.categoriaPadreId ? (
                <div>
                  <p className="label-cayla text-[11px] text-tinta/65">Familia</p>
                  <p className="mt-1.5 flex h-9 items-center text-sm text-tinta/65">{etiquetaFamilia(borrador.familia)} (heredada)</p>
                </div>
              ) : (
                <CampoSelect
                  etiqueta="Familia"
                  valor={borrador.familia}
                  onValor={(v) => setBorrador({ ...borrador, familia: v })}
                  opciones={opcionesFamilia}
                />
              )}
              <CampoTexto
                etiqueta="Nombre"
                value={borrador.nombre}
                onChange={(e) => {
                  const nombre = e.target.value;
                  setBorrador({ ...borrador, nombre, prefijo: prefijoPropio ? borrador.prefijo : prefijoDesdeNombre(nombre, categorias, excluirId) ?? "" });
                }}
                placeholder={`Ej. ${ejemplo?.nombre ?? ""}`}
                tono={choqueNombre ? "error" : undefined}
                pie={choqueNombre ? avisoChoque("nombre", choqueNombre) : undefined}
              />
              <CampoTexto
                etiqueta="Prefijo (3 letras)"
                mono
                value={borrador.prefijo}
                maxLength={3}
                onChange={(e) => {
                  const prefijo = e.target.value.toUpperCase();
                  setPrefijoPropio(prefijo !== "");
                  setBorrador({ ...borrador, prefijo });
                }}
                placeholder={ejemplo?.prefijo}
                disabled={prefijoFijo}
                title={prefijoFijo ? "Es la letra del código de cada prenda: ya está impreso en sus etiquetas." : undefined}
                className={prefijoFijo ? "cursor-not-allowed text-tinta/65" : ""}
                tono={choquePrefijo ? "error" : undefined}
                pie={
                  prefijoFijo
                    ? `Fijo: ${productosConEstePrefijo === 1 ? "1 producto lo usa" : `${productosConEstePrefijo.toLocaleString("es-PE")} productos lo usan`}`
                    : choquePrefijo
                      ? avisoChoque("prefijo", choquePrefijo)
                      : !prefijoPropio && borrador.prefijo
                        ? "Sale del nombre; puedes cambiarlo"
                        : undefined
                }
              />
            </div>

            <Campo etiqueta="Notas internas (opcional)">
              <textarea
                value={borrador.notas}
                onChange={(e) => setBorrador({ ...borrador, notas: e.target.value })}
                rows={2}
                maxLength={2000}
                placeholder="Solo la ve el equipo — nunca la clienta."
                className="w-full resize-none rounded-md border border-tinta/15 bg-papel px-2.5 py-2 text-sm text-tinta outline-none placeholder:text-tinta/45 focus:border-rojo/50"
              />
            </Campo>

            {editando && temporadaPorCategoria && borrador.id && (
              <p className="text-xs text-tinta/65">
                Temporada por defecto: <span className="font-medium text-tinta">{temporadaPorCategoria[borrador.id] ?? "sin temporada"}</span>.{" "}
                Se elige en{" "}
                <Link href={HREF_TEMPORADAS} className="underline underline-offset-2 hover:text-rojo">
                  Atributos ▸ Temporadas
                </Link>
                .
              </p>
            )}
          </div>

          {editando && !borrador.categoriaPadreId && (
            <div className="mt-5 border-t border-tinta/10 pt-4">
              <p className="label-cayla text-[11px] text-tinta/65">Subcategorías</p>
              {hijasDeEditada.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {hijasDeEditada.map((h) => (
                    <button
                      key={h.id}
                      type="button"
                      onClick={() =>
                        abrirBorrador({
                          id: h.id,
                          nombre: h.nombre,
                          prefijo: h.prefijo ?? "",
                          familia: h.familia ?? borrador.familia,
                          notas: h.notas ?? "",
                          categoriaPadreId: h.categoriaPadreId,
                        })
                      }
                      className="flex items-center gap-1.5 rounded-lg border border-tinta/10 bg-papel py-1 pl-1.5 pr-2.5 text-xs text-tinta hover:border-rojo/40 hover:text-rojo"
                    >
                      <span className="rounded bg-sand px-1.5 py-0.5 font-mono text-[10px] font-semibold text-tinta/65">{h.prefijo ?? "—"}</span>
                      {h.nombre}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-xs italic text-tinta/65">Sin subcategorías todavía.</p>
              )}
              {puedeEditar && (
                <div className="mt-3 flex items-end gap-2">
                  <div className="flex-1">
                    <CampoTexto
                      etiqueta="Nueva subcategoría"
                      value={subDraft.nombre}
                      onChange={(e) => {
                        const nombre = e.target.value;
                        setSubDraft({ nombre, prefijo: subPrefijoPropio ? subDraft.prefijo : prefijoDesdeNombre(nombre, categorias, null) ?? "" });
                      }}
                      placeholder="Nombre de la subcategoría"
                      tono={subChoqueNombre ? "error" : undefined}
                      pie={subChoqueNombre ? avisoChoque("nombre", subChoqueNombre) : undefined}
                    />
                  </div>
                  <div className="w-24">
                    <CampoTexto
                      etiqueta="Prefijo"
                      mono
                      value={subDraft.prefijo}
                      maxLength={3}
                      onChange={(e) => {
                        const prefijo = e.target.value.toUpperCase();
                        setSubPrefijoPropio(prefijo !== "");
                        setSubDraft({ ...subDraft, prefijo });
                      }}
                      placeholder="ABC"
                      tono={subChoquePrefijo ? "error" : undefined}
                      pie={subChoquePrefijo ? avisoChoque("prefijo", subChoquePrefijo) : undefined}
                    />
                  </div>
                  <Boton
                    peso="fantasma"
                    cargando={subGuardando}
                    disabled={!subDraft.nombre.trim() || subDraft.prefijo.length !== 3 || !!subChoquePrefijo || !!subChoqueNombre || !borrador.id || !responsable.listo}
                    title={responsable.motivo ?? undefined}
                    onClick={() => guardarSubcategoria({ id: borrador.id!, familia: borrador.familia })}
                  >
                    + Agregar
                  </Boton>
                </div>
              )}
            </div>
          )}

          {editando && borrador.categoriaPadreId && (
            <p className="mt-3 text-xs text-tinta/65">
              Es subcategoría de{" "}
              <span className="font-medium text-tinta">
                {categorias.find((c) => c.id === borrador.categoriaPadreId)?.nombre ?? "una categoría"}
              </span>
              .
            </p>
          )}

          {editando && (
            <div className="mt-5 space-y-4 border-t border-tinta/10 pt-4">
              <div>
                <p className="label-cayla text-[11px] text-tinta/65">Tallas que ofrece</p>
                {universo.tallas.length > 0 ? (
                  <div className="mt-1.5">
                    <SelectorMultiple
                      opciones={universo.tallas.map((v) => ({ valor: v.id, texto: v.texto }))}
                      seleccionadas={ejesDraft.tallaIds}
                      // Quitar una talla también la saca de la curva: la habitual es siempre un subconjunto de las que ofrece.
                      onCambio={(v) => setEjesDraft({ ...ejesDraft, tallaIds: v, tallaHabitualIds: ejesDraft.tallaHabitualIds.filter((id) => v.includes(id)) })}
                    />
                  </div>
                ) : (
                  <p className="mt-1.5 text-xs italic text-tinta/65">Todavía no hay tallas aprobadas.</p>
                )}
                {ejesDraft.tallaIds.length > 0 && (
                  <div className="mt-3">
                    <p className="label-cayla text-[11px] text-tinta/65">Curva habitual</p>
                    <p className="mt-0.5 text-xs text-tinta/60">Las que vienen marcadas de antemano al crear un producto de esta categoría.</p>
                    <div className="mt-1.5">
                      <SelectorMultiple
                        opciones={universo.tallas.filter((v) => ejesDraft.tallaIds.includes(v.id)).map((v) => ({ valor: v.id, texto: v.texto }))}
                        seleccionadas={ejesDraft.tallaHabitualIds}
                        onCambio={(v) => setEjesDraft({ ...ejesDraft, tallaHabitualIds: v })}
                      />
                    </div>
                  </div>
                )}
              </div>
              <div>
                <p className="label-cayla text-[11px] text-tinta/65">Tejidos que ofrece</p>
                {universo.tejidos.length > 0 ? (
                  <div className="mt-1.5">
                    <SelectorMultiple
                      opciones={universo.tejidos.map((v) => ({ valor: v.id, texto: v.texto }))}
                      seleccionadas={ejesDraft.tejidoIds}
                      onCambio={(v) => setEjesDraft({ ...ejesDraft, tejidoIds: v })}
                    />
                  </div>
                ) : (
                  <p className="mt-1.5 text-xs italic text-tinta/65">Todavía no hay tejidos aprobados.</p>
                )}
              </div>
              <div>
                <p className="label-cayla text-[11px] text-tinta/65">Patrones que ofrece</p>
                {universo.patrones.length > 0 ? (
                  <div className="mt-1.5">
                    <SelectorMultiple
                      opciones={universo.patrones.map((v) => ({ valor: v.id, texto: v.texto }))}
                      seleccionadas={ejesDraft.patronIds}
                      onCambio={(v) => setEjesDraft({ ...ejesDraft, patronIds: v })}
                    />
                  </div>
                ) : (
                  <p className="mt-1.5 text-xs italic text-tinta/65">Todavía no hay patrones aprobados.</p>
                )}
              </div>
              {puedeEditar && <p className="text-xs text-tinta/55">Se guarda junto con el resto al pulsar &ldquo;Guardar cambios&rdquo;.</p>}
            </div>
          )}

          <ComboResponsable control={responsable} deshabilitado={guardando || subGuardando || cambiandoId !== null} className="mt-5" />
          <div className="mt-5 flex items-center justify-between gap-2">
            {editando ? (
              <button
                type="button"
                onClick={() => {
                  const c = categorias.find((x) => x.id === borrador.id);
                  if (c) cambiarEstado(c);
                }}
                disabled={cambiandoId === borrador.id || !responsable.listo}
                title={responsable.motivo ?? undefined}
                className="text-xs text-rojo hover:underline disabled:opacity-50 disabled:no-underline"
              >
                {cambiandoId === borrador.id ? "Desactivando…" : "Desactivar categoría"}
              </button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Boton peso="fantasma" onClick={cerrar} disabled={guardando}>
                Cancelar
              </Boton>
              <Boton peso="primario" onClick={guardar} cargando={guardando} disabled={!borrador.nombre.trim() || borrador.prefijo.length !== 3 || !!choquePrefijo || !!choqueNombre || !responsable.listo} title={responsable.motivo ?? undefined}>
                {editando ? "Guardar cambios" : "Guardar categoría"}
              </Boton>
            </div>
          </div>
            </>
          )}
        </Modal>
      )}

      {desactivadasVisibles.length > 0 && (
        <section className="space-y-2">
          <p className="label-cayla text-[11px] text-tinta/65">Desactivadas — no aparecen al crear productos nuevos</p>
          <div className="card-cayla flex flex-wrap gap-2 p-5">
            {desactivadasVisibles.map((c) => (
              <span
                key={c.id}
                className="flex items-center gap-2 rounded-lg border border-tinta/10 bg-papel py-1.5 pl-2 pr-3 text-sm text-tinta/60"
              >
                <span className="rounded bg-sand px-1.5 py-0.5 font-mono text-[10.5px] font-semibold text-tinta/50">{c.prefijo ?? "—"}</span>
                {c.nombre}
                {/* Sin familia o sin prefijo no hay nada que reactivar: quedaría activa, sin código y fuera de toda
                    sección. La base lo rechaza igual (`fn_categorias_vigencia_candados`); acá no se ofrece el botón. */}
                {puedeEditar && (!c.familia || !c.prefijo) && (
                  <span className="text-[11px] text-tinta/65" title="Le falta la familia o el prefijo. Para usarla, crea una categoría nueva.">
                    No se reactiva
                  </span>
                )}
                {puedeEditar && c.familia && c.prefijo && (
                  <Boton
                    peso="discreto"
                    className="px-2 py-1 text-[10.5px]"
                    cargando={cambiandoId === c.id}
                    onClick={() => setConfirmando(confirmacionCatalogo("reactivar", c.nombre, () => cambiarEstado(c, true)))}
                  >
                    Reactivar
                  </Boton>
                )}
              </span>
            ))}
          </div>
        </section>
      )}

      {confirmando && <ConfirmarConResponsable confirmacion={confirmando} onClose={() => setConfirmando(null)} />}
    </div>
  );
}

/** Tarjeta de categoría: la de Atributos (`TarjetaAtributo`, ADR-0261) con el banner de su ícono y el tono de su familia
 *  (`MuestraCategoria`). Siempre clicable para cualquier rol —ver qué ofrece una categoría es lectura, no requiere ser
 *  Líder (RLS de `categorias_select` ya lo permite)—. «Desactivar» vive en la ventana de Editar. */
function TarjetaCategoria({
  c,
  productos,
  subcategorias,
  temporada,
  subcategoriasQueCoinciden,
  onClick,
}: {
  c: Categoria;
  productos: number;
  subcategorias: number;
  /** Nombre de su temporada por defecto (ADR-0246), o null si no tiene. */
  temporada: string | null;
  /** Subcategorías que respondieron al buscador: la tarjeta dice por qué salió. */
  subcategoriasQueCoinciden: string[];
  onClick: () => void;
}) {
  return (
    <TarjetaAtributo
      muestra={<MuestraCategoria nombre={c.nombre} prefijo={c.prefijo} familia={c.familia} />}
      // «Ropa interior/Lencería» no tiene dónde partirse y en una tarjeta angosta se sale: un espacio de ancho cero tras la barra.
      nombre={c.nombre.replace(/\//g, "/\u200B")}
      abrir={{ onClick, titulo: `Ver ${c.nombre}` }}
      detalle={
        <>
          <p className="text-xs tabular-nums text-tinta/65">
            <span className="mr-1.5 font-mono text-[10.5px] font-semibold text-tinta/55">{c.prefijo ?? "—"}</span>
            {subcategorias > 0 ? `${subcategorias} sub · ` : ""}
            {productos === 0 ? "sin productos" : `${productos} ${productos === 1 ? "producto" : "productos"}`}
          </p>
          {temporada && <p className="text-xs text-taupe-profundo">{temporada}</p>}
          {subcategoriasQueCoinciden.length > 0 && <p className="text-xs text-tinta/65">Sub: {subcategoriasQueCoinciden.join(", ")}</p>}
        </>
      }
    />
  );
}

/** La "vuelta de tuerca": clic en una tarjeta ya no cae directo al
 *  formulario. Cae acá primero — mismo molde que `VistaRapidaModal` de
 *  Productos (bloque de ícono a la izquierda, datos + acciones a la
 *  derecha) — y "Editar" recién ahí entra al formulario real. */
function VistaRapidaCategoria({
  categoria,
  familia,
  nombreFamilia,
  productos,
  hijas,
  padre,
  tallas,
  tallasHabituales,
  tejidos,
  patrones,
  temporada,
  puedeEditar,
  onClose,
  onVerHija,
  onEditar,
}: {
  categoria: Categoria;
  familia: Familia | null;
  /** Nombre visible de la familia, ya resuelto contra `retail.familias` por quien llama. */
  nombreFamilia: string | null;
  productos: number;
  hijas: Categoria[];
  padre: Categoria | null;
  tallas: ValorVocabulario[];
  tallasHabituales: string[];
  tejidos: ValorVocabulario[];
  patrones: ValorVocabulario[];
  /** Su temporada por defecto (`nombre` null = no tiene). `null` = la base todavía no tiene la lista: no se muestra. */
  temporada: { nombre: string | null } | null;
  puedeEditar: boolean;
  onClose: () => void;
  onVerHija: (id: string) => void;
  onEditar: () => void;
}) {
  return (
    <Modal titulo={categoria.nombre} subtitulo={familia ? (nombreFamilia ?? familia) : "Sin familia asignada"} onClose={onClose} ancho="max-w-lg">
      <div className="mt-1 grid gap-5 sm:grid-cols-[auto_1fr]">
        <div className="flex items-center gap-3 sm:flex-col sm:items-start sm:gap-2">
          <div
            className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl"
            style={{ backgroundColor: tonoDeCategoria(familia).fondo, color: tonoDeCategoria(familia).acento }}
          >
            <IconoCategoria prefijo={categoria.prefijo} familia={familia} className="h-8 w-8" />
          </div>
          <span className="rounded-md bg-sand px-2 py-1 font-mono text-xs font-semibold text-tinta/70">{categoria.prefijo ?? "—"}</span>
        </div>

        <div className="space-y-4">
          <Link
            href={`/productos?cat=${categoria.id}`}
            className="group flex items-center justify-between rounded-lg border border-tinta/10 bg-papel px-3 py-2.5 transition-colors hover:border-rojo/40"
          >
            <span className="text-sm text-tinta">
              {productos === 0 ? "Sin productos todavía" : `${productos} ${productos === 1 ? "producto activo" : "productos activos"}`}
            </span>
            <span className="label-cayla text-[10px] text-tinta/55 group-hover:text-rojo">Ver en Productos →</span>
          </Link>

          {padre && (
            <p className="text-xs text-tinta/65">
              Subcategoría de <span className="font-medium text-tinta">{padre.nombre}</span>
            </p>
          )}

          {hijas.length > 0 && (
            <div>
              <p className="label-cayla text-[10.5px] text-tinta/55">Subcategorías</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {hijas.map((h) => (
                  <button
                    key={h.id}
                    type="button"
                    onClick={() => onVerHija(h.id)}
                    className="flex items-center gap-1.5 rounded-lg border border-tinta/10 bg-papel py-1 pl-1.5 pr-2.5 text-xs text-tinta hover:border-rojo/40 hover:text-rojo"
                  >
                    <span className="rounded bg-sand px-1.5 py-0.5 font-mono text-[10px] font-semibold text-tinta/65">{h.prefijo ?? "—"}</span>
                    {h.nombre}
                  </button>
                ))}
              </div>
            </div>
          )}

          <GrupoEjes titulo="Tallas" valores={tallas} marcados={tallasHabituales} />
          <GrupoEjes titulo="Tejidos" valores={tejidos} />
          <GrupoEjes titulo="Patrones" valores={patrones} />

          {temporada && (
            <div>
              <p className="label-cayla text-[10.5px] text-tinta/55">Temporada por defecto</p>
              <p className="mt-1 text-sm text-tinta">{temporada.nombre ?? "Sin temporada"}</p>
              <p className="mt-0.5 text-xs text-tinta/60">
                La heredan sus prendas que no tienen la suya.
                {puedeEditar && (
                  <>
                    {" "}
                    <Link href={HREF_TEMPORADAS} className="underline underline-offset-2 hover:text-rojo">
                      {temporada.nombre ? "Cambiarla" : "Elegirla"} en Atributos ▸ Temporadas
                    </Link>
                  </>
                )}
              </p>
            </div>
          )}

          {categoria.notas && (
            <div>
              <p className="label-cayla text-[10.5px] text-tinta/55">Notas internas</p>
              <p className="mt-1 text-xs text-tinta/70">{categoria.notas}</p>
            </div>
          )}
        </div>
      </div>

      <div className="mt-6 flex justify-end gap-2 border-t border-tinta/10 pt-4">
        <Boton peso="fantasma" onClick={onClose}>
          Cerrar
        </Boton>
        {puedeEditar && (
          <Boton peso="primario" onClick={onEditar}>
            Editar
          </Boton>
        )}
      </div>
    </Modal>
  );
}

function GrupoEjes({ titulo, valores, marcados }: { titulo: string; valores: ValorVocabulario[]; /** Los que vienen marcados de antemano (la curva habitual). */ marcados?: string[] }) {
  if (valores.length === 0) return null;
  const hayMarcados = !!marcados && marcados.length > 0;
  return (
    <div>
      <p className="label-cayla text-[10.5px] text-tinta/55">{titulo}{hayMarcados && " · ✓ = curva habitual"}</p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {valores.map((v) => (
          <Chip key={v.id} tono="neutro">
            {marcados?.includes(v.id) && "✓ "}
            {v.texto}
          </Chip>
        ))}
      </div>
    </div>
  );
}
