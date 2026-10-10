"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronDown, SearchX, Tag } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { Boton } from "@/components/ui/campos";
import { NuevaMarcaForm, type MarcaGuardada } from "@/components/alta-producto/NuevaMarcaForm";
import { EditarMarcaModal, type MarcaEditada } from "@/components/EditarMarcaModal";
import {
  letrasDeMarcas,
  MARCAS_POR_PAGINA,
  marcasDelFiltro,
  paginaDeLaPosicion,
  ordenarPorPrediccion,
  posicionDeLaLetra,
  prediccionDe,
  rangoDeNombres,
  resumenDeMarcas,
  type FiltroMarcas,
  type MarcaFila,
  type ProveedorOpcion,
} from "@/lib/marcas";
import { paginar } from "@/lib/paginacion";
import { PaginacionLocal } from "@/components/ui/PaginacionLocal";
import { IndiceLetras } from "@/components/marcas/IndiceLetras";
import { TarjetaMarca } from "@/components/marcas/TarjetaMarca";
import { ConfirmarConResponsable } from "@/components/ConfirmarConResponsable";
import { confirmacionCatalogo, type Confirmacion } from "@/lib/confirmar-catalogo";
import { useResponsable } from "@/lib/useResponsable";
import { firmar } from "@/lib/responsable-reglas";
import { firmaOmitida } from "@/lib/responsable-omitido";
import { Buscador } from "@/components/ui/Buscador";
import { Vacio } from "@/components/ui/Vacio";
import { Aviso } from "@/components/ui/Aviso";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { Ayuda } from "@/components/Ayuda";
import { soltarPaginaEstable } from "@/components/ui/PaginaEstable";
import { ResumenMarcas } from "@/components/marcas/ResumenMarcas";
import { FiltrosMarcas } from "@/components/marcas/FiltrosMarcas";

/**
 * Marcas del catálogo y sus proveedores (ADR-0109, `retail.marcas` +
 * `retail.marca_proveedores`). Sin proponer/aprobar (como Familias): solo un
 * Líder agrega, renombra o desactiva.
 *
 * Crear usa el MISMO formulario que Nuevo producto (`NuevaMarcaForm`): una sola
 * forma de crear una marca. «Editar» (Felipe, 2026-09-25) abre UNA ventana con el
 * nombre y quién la trae (`EditarMarcaModal` → `editar_marca`, todo o nada): ahí
 * se renombra, se suma un proveedor —de la lista o uno nuevo— y se quita el que se
 * puso por error, solo si ningún producto usa esa pareja. Desactivar va directo a
 * la tabla (la policy es el candado; el trigger `fn_marcas_desactivar_candado`
 * impide desactivar una marca con productos activos y su mensaje llega tal cual).
 *
 * «Eliminar» (Felipe, 2026-09-26: «Cayla 2» se creó por error y desactivarla no la quitaba) aparece SOLO si ningún producto
 * —activo, descontinuado o archivado como prueba— la tiene (`sePuedeEliminarMarca`): borrarla entonces no pierde historia.
 * Una marca con productos se sigue desactivando. Va por `eliminar_marca` (20260926213000, todo o nada), no por un DELETE.
 *
 * El buscador encuentra por marca o por proveedor, sin tildes («¿qué me trae
 * Saavedra?»): con 80 marcas en tarjetas, bajar buscando una no es opción.
 *
 * Responsable (ADR-0161): editar lo pide en su ventana; desactivar y reactivar van sin él (Felipe, 2026-09-29) y
 * eliminar lo pide dentro de su confirmación (`ConfirmarConResponsable`). Crear usa
 * el combo propio de `NuevaMarcaForm`.
 */

export type { MarcaFila };

/** El «!» del título (el texto de la pantalla de siempre, con una frase adaptada: desactivar y eliminar viven en «Más»). */
const AYUDA_MARCAS = (
  <Ayuda titulo="Marcas">
    De quién es cada prenda y qué proveedores la traen. Todo producto tiene una marca y un proveedor, y el proveedor tiene que traer esa marca: la base no
    deja guardar otra pareja. Una marca puede llegar por más de un proveedor. Con «Editar» cambias el nombre y quién la trae: un proveedor se quita solo si
    ninguno de sus productos lo usa. En «Más» desactivas la marca —no se puede si tiene productos activos— o la eliminas —solo si ningún producto la tiene,
    tampoco uno descontinuado—: si se creó por error, primero cámbiale la marca a sus productos en Productos.
  </Ayuda>
);

type Modo = { tipo: "nueva" } | { tipo: "editar"; marca: MarcaFila };

const porNombre = (a: { nombre: string }, b: { nombre: string }) => a.nombre.localeCompare(b.nombre, "es");

export function MarcasLista({
  marcasIniciales,
  proveedores: proveedoresIniciales,
  puedeEditar,
  sede,
}: {
  marcasIniciales: MarcaFila[];
  proveedores: ProveedorOpcion[];
  puedeEditar: boolean;
  /** La sede que se mira (línea de arriba de la cabecera). */
  sede: string;
}) {
  const [marcas, setMarcas] = useState(marcasIniciales);
  const [proveedores, setProveedores] = useState(proveedoresIniciales);
  const [modo, setModo] = useState<Modo | null>(null);
  const [trabajando, setTrabajando] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  // El resumen nace colapsado (Felipe, 2026-10-10: las marcas primero) y no recuerda si quedó abierto.
  const [resumenAbierto, setResumenAbierto] = useState(false);
  const [filtro, setFiltro] = useState<FiltroMarcas>("activas");
  const [verDesactivadas, setVerDesactivadas] = useState(false);
  const [pagina, setPagina] = useState(1);
  // La marca que destella una vez: la que acabas de guardar o a la que saltaste con una letra.
  const [destacada, setDestacada] = useState<string | null>(null);
  // La que se está yendo (desactivada o eliminada): se encoge 240 ms y recién entonces sale de la lista.
  const [saliendo, setSaliendo] = useState<string | null>(null);
  const cajaRef = useRef<HTMLElement>(null);
  // Cambiar de página, saltar a una letra o volver adonde quedó una marca es un cambio de VISTA, no un bloque que se encogió:
  // <PaginaEstable> (ADR-0185) devolvería la vista adonde estaba y, con una página más corta, dejaría aire vacío en pantalla
  // (pasó con la página 4: 17 marcas tras 24, Felipe 2026-10-10). Se suelta ANTES de pintar, como en Traslados y Vender, y
  // recién después se lleva la vista: al inicio de la lista (página) o a la marca (letra, guardado; lo hace el destello).
  const saltoPendiente = useRef<"inicio" | "marca" | null>(null);
  // Catálogo firma cada guardado con el combo «Responsable» (ADR-0161), pero nunca arriba de la lista: va dentro de cada
  // ventana (agregar, editar, rechazar) y los botones de un clic (aprobar, desactivar, reactivar) abren una confirmación
  // (`ConfirmarConResponsable`, textos en lib/confirmar-catalogo.ts). Aprobar, rechazar, desactivar y reactivar ya no piden
  // responsable (Felipe, 2026-09-29): se firman con su clave de `responsable-omitido.ts`; agregar y editar conservan el combo.
  const responsable = useResponsable();
  const [confirmando, setConfirmando] = useState<Confirmacion | null>(null);

  const activas = marcas.filter((m) => m.activo);
  const desactivadas = marcas.filter((m) => !m.activo);
  const resumen = resumenDeMarcas(marcas);
  const buscandoAlgo = busqueda.trim() !== "";
  // Lo que se ve: las desactivadas, o las activas del filtro. Sin búsqueda, por nombre; escribiendo, por lo más probable (ADR-0373),
  // y si nada coincide, las parecidas («wayy» → Wayi). La sombra del buscador completa la marca más probable que EMPIEZA así.
  const base = verDesactivadas ? desactivadas : marcasDelFiltro(marcas, filtro);
  const { lista, parecidas } = ordenarPorPrediccion(base, busqueda);
  const prediccion = buscandoAlgo ? prediccionDe(base, busqueda) : null;
  const pag = paginar(lista, pagina, MARCAS_POR_PAGINA);
  const presentes = letrasDeMarcas(lista);
  const enEstaPagina = letrasDeMarcas(pag.filas);
  // Contra estas pregunta el formulario «¿no será una marca que ya existe?» (las mismas que ofrece Nuevo producto).
  const existentes = activas.map((m) => ({ id: m.id, nombre: m.nombre, proveedores: m.proveedores.map((p) => p.nombre) }));

  const sinMovimiento = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Después de guardar, la lista te lleva a donde quedó la marca: el orden es alfabético y una marca nueva (o renombrada) puede caer
  // en otra página. Suelta el filtro y la búsqueda para que se vea, y la destella una vez.
  function irAMarca(id: string, todas: MarcaFila[]) {
    const i = todas.filter((m) => m.activo).sort(porNombre).findIndex((m) => m.id === id);
    setFiltro("activas");
    setVerDesactivadas(false);
    setBusqueda("");
    saltoPendiente.current = "marca";
    setPagina(i >= 0 ? paginaDeLaPosicion(i) : 1);
    setDestacada(id);
  }

  function alGuardar(r: MarcaGuardada) {
    if (r.proveedorNuevo) setProveedores((prev) => [...prev, { id: r.proveedorId, nombre: r.proveedorNombre }]);
    const par = { id: r.proveedorId, nombre: r.proveedorNombre, productos: 0, productosTotal: 0 };
    const existente = marcas.find((m) => m.id === r.marcaId);
    const nuevas: MarcaFila[] = existente
      ? marcas.map((m) => (m.id === r.marcaId && !m.proveedores.some((p) => p.id === r.proveedorId) ? { ...m, proveedores: [...m.proveedores, par] } : m))
      : [...marcas, { id: r.marcaId, nombre: r.marcaNombre, activo: true, productos: 0, proveedores: [par] }].sort(porNombre);
    setMarcas(nuevas);
    irAMarca(r.marcaId, nuevas);
    avisar.exito(`${r.marcaNombre} · ${r.proveedorNombre}`, { detalle: "Guardado." });
    setModo(null);
  }

  // La tarjeta pinta lo que devolvió la base (con lo que otra persona haya sumado mientras tanto), no el borrador de la
  // ventana. Los conteos de productos se conservan; un proveedor recién sumado no tiene ninguno.
  function alEditar(m: MarcaFila, r: MarcaEditada) {
    const registrados = r.proveedores.filter((p) => !m.proveedores.some((x) => x.id === p.id) && !proveedores.some((x) => x.id === p.id));
    if (registrados.length > 0) setProveedores((prev) => [...prev, ...registrados].sort(porNombre));
    const nuevas = marcas
      .map((x) =>
        x.id !== m.id
          ? x
          : {
              ...x,
              nombre: r.nombre,
              proveedores: r.proveedores.map((p) => {
                const antes = x.proveedores.find((y) => y.id === p.id);
                return { id: p.id, nombre: p.nombre, productos: antes?.productos ?? 0, productosTotal: antes?.productosTotal ?? 0 };
              }),
            }
      )
      .sort(porNombre);
    setMarcas(nuevas);
    irAMarca(m.id, nuevas);
    avisar.exito(`${r.nombre} guardada`, { detalle: r.proveedores.map((p) => p.nombre).join(" · ") });
  }

  useLayoutEffect(() => {
    const salto = saltoPendiente.current;
    if (!salto) return;
    saltoPendiente.current = null;
    soltarPaginaEstable();
    if (salto === "inicio") cajaRef.current?.scrollIntoView({ block: "start", behavior: sinMovimiento() ? "auto" : "smooth" });
  });

  // La que destella queda a la vista (centrada) y el destello se apaga solo.
  useEffect(() => {
    if (!destacada) return;
    document.querySelector(`[data-marca="${destacada}"]`)?.scrollIntoView({ block: "center", behavior: sinMovimiento() ? "auto" : "smooth" });
    const t = window.setTimeout(() => setDestacada(null), 1200);
    return () => window.clearTimeout(t);
  }, [destacada]);

  // Cambiar de página lleva la vista al inicio de la lista (ADR-0185): una paginación al pie no se queda abajo.
  function irAPagina(n: number) {
    saltoPendiente.current = "inicio";
    setPagina(n);
  }

  function irALetra(letra: string) {
    const i = posicionDeLaLetra(lista, letra);
    if (i < 0) return;
    saltoPendiente.current = "marca";
    setPagina(paginaDeLaPosicion(i));
    setDestacada(lista[i].id);
  }

  function alBuscar(v: string) {
    setBusqueda(v);
    setPagina(1);
  }

  // Tab o → completan la sombra; Enter además va a esa marca (queda sola en su página y destella una vez).
  function aceptarPrediccion(id: string, nombre: string, ir: boolean) {
    setBusqueda(nombre);
    setPagina(1);
    if (ir) setDestacada(id);
  }

  // Deja que la tarjeta se encoja antes de sacarla de la lista. Solo tras la respuesta de la base: nunca se anima algo que falló.
  async function irse(id: string) {
    if (sinMovimiento()) return;
    setSaliendo(id);
    await new Promise((r) => window.setTimeout(r, 240));
    setSaliendo(null);
  }

  // Desactivar y reactivar una marca van sin responsable (Felipe, 2026-09-29); eliminar la conserva.
  async function cambiarEstado(m: MarcaFila) {
    setTrabajando(m.id);
    const { error } = await firmar(createClient().from("marcas").update({ activo: !m.activo }).eq("id", m.id), firmaOmitida("catalogo_confirmar_estado"));
    setTrabajando(null);
    if (error) return avisar.error(traducirError(error, m.activo ? "desactivar la marca" : "reactivar la marca"));
    await irse(m.id);
    setMarcas((prev) => prev.map((x) => (x.id === m.id ? { ...x, activo: !x.activo } : x)));
    if (!m.activo && desactivadas.length === 1) setVerDesactivadas(false); // reactivó la última: ya no hay vista que ver
    avisar.exito(m.activo ? `${m.nombre} desactivada` : `${m.nombre} reactivada`);
  }

  async function eliminar(m: MarcaFila) {
    if (!responsable.listo) return avisar.error(responsable.motivo ?? "Elige quién hace esta operación.");
    setTrabajando(m.id);
    const { error } = await firmar(createClient().rpc("eliminar_marca", { p_marca_id: m.id }), responsable.firma());
    setTrabajando(null);
    responsable.despues(error);
    if (error) return avisar.error(traducirError(error, "eliminar la marca"));
    await irse(m.id);
    setMarcas((prev) => prev.filter((x) => x.id !== m.id));
    avisar.exito(`${m.nombre} eliminada`);
  }

  // Tocar el filtro puesto lo suelta (vuelve a «Todas»): una cifra que filtra se apaga como se enciende.
  const alFiltrar = (f: FiltroMarcas) => {
    setVerDesactivadas(false);
    setPagina(1);
    setFiltro((actual) => (actual === f && f !== "activas" ? "activas" : f));
  };

  return (
    <div className="space-y-6">
      <div>
        {/* La cabecera de Catálogo ▸ Productos (ADR-0254); la de Marcas queda igual hasta que Felipe decida otra (CLAUDE.md). */}
        <EncabezadoPagina
          sede={sede}
          titulo={
            <>
              Marcas
              {/* Letra y altura de la frase dentro del título: el globo no hereda la serif de 46 px. */}
              <span className="ml-2.5 inline-block align-middle font-sans text-[15px] leading-normal tracking-normal">{AYUDA_MARCAS}</span>
            </>
          }
          subtitulo="De quién es cada prenda y quién la trae. Todo producto lleva una marca y un proveedor que la traiga."
          acciones={
            puedeEditar && (
              <Boton peso="primario" onClick={() => setModo({ tipo: "nueva" })}>
                + Nueva marca
              </Boton>
            )
          }
        />
        <ResumenMarcas resumen={resumen} filtro={verDesactivadas ? null : filtro} onFiltro={alFiltrar} abierto={resumenAbierto} />
      </div>

      {modo?.tipo === "nueva" && (
        <NuevaMarcaForm proveedores={proveedores} marcas={existentes} onGuardado={alGuardar} onCancelar={() => setModo(null)} />
      )}

      {/* UNA tarjeta: buscador, filtros y lista (CLAUDE.md «Paleta y orden de pantalla»). */}
      <section ref={cajaRef} className="card-cayla scroll-mt-20 space-y-4 p-4 sm:p-5" aria-label="Lista de marcas">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <Buscador
            valor={busqueda}
            onCambio={alBuscar}
            placeholder="Busca una marca o un proveedor"
            etiqueta="Buscar marca o proveedor"
            atajo
            sombra={{ cola: prediccion?.cola ?? "", alAceptar: (ir) => prediccion && aceptarPrediccion(prediccion.marca.id, prediccion.marca.nombre, ir) }}
            className="min-w-0 basis-full sm:flex-1 sm:basis-0 sm:max-w-[34rem]"
          />
          <p className="text-sm text-tinta/70" aria-live="polite">
            {verDesactivadas ? `${lista.length} desactivada${lista.length === 1 ? "" : "s"}` : buscandoAlgo || filtro !== "activas" ? `${lista.length} de ${resumen.activas}` : `${resumen.activas} marcas activas`}
          </p>
          <div className="ml-auto flex items-center gap-2">
            {desactivadas.length > 0 && (
              <button
                type="button"
                className="pildora-cayla"
                aria-pressed={verDesactivadas}
                onClick={() => {
                  setVerDesactivadas((v) => !v);
                  setFiltro("activas");
                  setPagina(1);
                }}
              >
                Desactivadas
                <span className="ml-1 font-medium tabular-nums">{desactivadas.length}</span>
              </button>
            )}
            <button
              type="button"
              className="btn-cayla btn-sutil inline-flex items-center gap-1.5"
              aria-expanded={resumenAbierto}
              aria-controls="resumen-marcas"
              onClick={() => setResumenAbierto((a) => !a)}
            >
              Resumen
              <ChevronDown aria-hidden className={`h-3.5 w-3.5 transition-transform duration-300 ease-cayla motion-reduce:transition-none ${resumenAbierto ? "rotate-180" : ""}`} />
            </button>
          </div>
        </div>

        {!resumenAbierto && <FiltrosMarcas resumen={resumen} filtro={verDesactivadas ? null : filtro} onFiltro={alFiltrar} />}

        {lista.length > 0 && !buscandoAlgo && <IndiceLetras presentes={presentes} enEstaPagina={enEstaPagina} onLetra={irALetra} />}

        {activas.length === 0 && !verDesactivadas && !buscandoAlgo && (
          <Vacio icono={<Tag />} titulo="Todavía no hay marcas activas">
            {puedeEditar ? "Registra la primera con «+ Nueva marca»." : "Cuando se registre una marca, aparece aquí."}
          </Vacio>
        )}

        {lista.length === 0 && activas.length > 0 && !buscandoAlgo && (
          <Vacio icono={<Tag />} titulo="Aquí no hay marcas">
            Ninguna marca cae en este filtro. Toca «Todas» para ver las demás.
          </Vacio>
        )}

        {lista.length === 0 && buscandoAlgo && (
          <Vacio
            icono={<SearchX />}
            titulo={<>Nada coincide con «{busqueda.trim()}»</>}
            acciones={
              <Boton type="button" peso="fantasma" onClick={() => alBuscar("")}>
                Borrar la búsqueda
              </Boton>
            }
          >
            Ninguna marca ni proveedor se llama así, ni parecido. Prueba con otra palabra.
          </Vacio>
        )}

        {parecidas && lista.length > 0 && (
          <Aviso tono="atencion" chico>
            Nada se llama «{busqueda.trim()}». ¿Buscabas alguna de estas?
          </Aviso>
        )}

        {lista.length > 0 && (
          <ul className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
            {pag.filas.map((m, i) => (
              <TarjetaMarca
                key={m.id}
                marca={m}
                puedeEditar={puedeEditar}
                trabajando={trabajando === m.id}
                busqueda={busqueda}
                indice={i}
                destello={destacada === m.id}
                saliendo={saliendo === m.id}
                onEditar={() => setModo({ tipo: "editar", marca: m })}
                onDesactivar={() => setConfirmando(confirmacionCatalogo("desactivar", m.nombre, () => cambiarEstado(m)))}
                onReactivar={() => setConfirmando(confirmacionCatalogo("reactivar", m.nombre, () => cambiarEstado(m)))}
                onEliminar={() => setConfirmando(confirmacionCatalogo("eliminar", m.nombre, () => eliminar(m)))}
              />
            ))}
          </ul>
        )}

        {lista.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-3 border-t border-sand pt-4">
            <p className="text-sm text-tinta/70" aria-live="polite">
              Mostrando{" "}
              <b className="font-semibold text-tinta">
                {pag.desde}–{pag.hasta}
              </b>{" "}
              de <b className="font-semibold text-tinta">{lista.length}</b>
              {!buscandoAlgo && rangoDeNombres(pag.filas) && <> · {rangoDeNombres(pag.filas)}</>}
            </p>
            <PaginacionLocal pagina={pag.pagina} totalPaginas={pag.totalPaginas} onPagina={irAPagina} grande />
          </div>
        )}
      </section>

      <p className="nota-cayla">
        Una marca con productos activos no se puede desactivar. «Eliminar» solo se puede si ningún producto la tuvo, tampoco uno descontinuado: así no se pierde
        historia.
      </p>

      {modo?.tipo === "editar" && (
        <EditarMarcaModal marca={modo.marca} proveedores={proveedores} onGuardado={(r) => alEditar(modo.marca, r)} onClose={() => setModo(null)} />
      )}

      {confirmando && <ConfirmarConResponsable confirmacion={confirmando} control={confirmando.verbo === "Eliminar" ? responsable : undefined} onClose={() => setConfirmando(null)} />}
    </div>
  );
}
