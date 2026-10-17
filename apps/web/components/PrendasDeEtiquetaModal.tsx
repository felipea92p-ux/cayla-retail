"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronRight, FunnelX, Shirt } from "lucide-react";
import { avisar } from "@/components/ui/Avisos";
import { Modal } from "@/components/ui/Modal";
import { Boton } from "@/components/ui/campos";
import { Buscador } from "@/components/ui/Buscador";
import { BotonFiltro } from "@/components/ui/BotonFiltro";
import { DesplegablePildora, TODOS } from "@/components/ui/FiltrosPildora";
import { Chip } from "@/components/ui/Chip";
import { MiniaturaPrenda, categoriaDe } from "@/components/ui/PrendaCelda";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { ComboResponsable } from "@/components/ComboResponsable";
import { useResponsable } from "@/lib/useResponsable";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { firmar } from "@/lib/responsable-reglas";
import { hoyLima } from "@/lib/fechas-lima";
import { soles } from "@/lib/compras-reglas";
import { fotoPrincipal } from "@/lib/inventario-reglas";
import { nombreBajoCosto, prendasBajoCosto, type PrendaConCosto } from "@/lib/etiqueta-campana";
import {
  alternarProducto,
  alternarVariante,
  cambioEntre,
  cuentaPorMarca,
  estadoDe,
  filtrarProductos,
  idsPorMarca,
  llevaEtiqueta,
  marcarProductos,
  precioConCampana,
  textoCambio,
  textoTallas,
  vistaPrevia,
  vistaPreviaQuitar,
  avisoFueraDeVenta,
  type FiltroMarca,
  type ProductoEtiquetable,
} from "@/lib/etiquetar-prendas";
import { Casilla as CasillaSistema } from "@/components/ui/Casilla";
import { Vacio } from "@/components/ui/Vacio";
import { Aviso } from "@/components/ui/Aviso";
import { BotonDeshacer } from "@/components/ui/BotonDeshacer";

/**
 * «Prendas de una etiqueta»: elegir qué prendas llevan, por ejemplo, «Black Friday».
 * Se piensa por PRODUCTO (una casilla marca todas sus tallas y colores) con excepciones
 * por talla al desplegarlo; lo que viaja a la base son ids de variante, todo en una sola
 * llamada atómica (`etiquetar_variantes`, 20260919010000).
 *
 * Una etiqueta con descuento cambia el precio en caja (ADR-0108), así que antes de
 * guardar se muestra QUÉ va a pasar: cuántas prendas, cuánto baja, desde cuándo y, si
 * el descuento las deja por debajo de su costo, cuáles. Quitarla también cambia el precio
 * (sube), y también se confirma. Sin descuento se guarda directo.
 *
 * Las marcas de prendas que ya no se venden (una talla desactivada, un producto
 * descontinuado) no salen en la lista, pero se dicen: si la prenda vuelve a la venta, vuelve
 * con la etiqueta. «Quitárselas» las suma a lo que se quita.
 *
 * Los productos que ya entran por CATEGORÍA (regla de la campaña) aparecen marcados y
 * bloqueados: etiquetarlos a mano sería redundante.
 *
 * Cada fila es la prenda como se ve en el piso: su foto (o su categoría sobre su color), su
 * nombre, cuántas de sus tallas la llevan y, si la etiqueta baja precios, el precio antes y
 * después. La lista tiene alto fijo: filtrar no hace saltar la hoja bajo el mouse (ADR-0185).
 */

export type EtiquetaParaPrendas = {
  id: string;
  nombre: string;
  descuentoPct: number | null;
  vigenteDesde: string | null;
  vigenteHasta: string | null;
  categoriaIds: string[];
};

type Cargado = { productos: ProductoEtiquetable[]; iniciales: Set<string> };

export function PrendasDeEtiquetaModal({
  etiqueta,
  prendasConCosto,
  marcasManuales,
  onClose,
  onAplicado,
}: {
  etiqueta: EtiquetaParaPrendas;
  /** Todas las prendas que llevan la etiqueta a mano, también las que ya no se venden: las mismas con las que cuenta la tarjeta. */
  marcasManuales: readonly string[];
  /** Solo un Líder recibe costos; con la lista vacía simplemente no hay aviso de costo. */
  prendasConCosto: PrendaConCosto[];
  onClose: () => void;
  /** Con el conjunto final de variantes etiquetadas a mano y lo que realmente cambió. */
  onAplicado: (finales: string[], resultado: { agregadas: number; quitadas: number }) => void;
}) {
  const [carga, setCarga] = useState<{ estado: "cargando" } | { estado: "error"; mensaje: string } | ({ estado: "listo" } & Cargado)>({ estado: "cargando" });
  const [intento, setIntento] = useState(0);
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const [texto, setTexto] = useState("");
  const [categoriaId, setCategoriaId] = useState(TODOS);
  // La píldora elegida y los productos que entraban en ella al tocarla (ver `idsPorMarca`).
  const [marca, setMarca] = useState<{ filtro: FiltroMarca; ids: Set<string> | null }>({ filtro: "todas", ids: null });
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());
  const [confirmando, setConfirmando] = useState(false);
  const [quitarFuera, setQuitarFuera] = useState(false);
  const [guardando, setGuardando] = useState(false);
  // Etiquetar prendas es Catálogo (ADR-0161): el combo está junto al botón desde que se abre la hoja, para que quien
  // registra se vea antes de empezar y no aparezca de golpe al primer clic (la confirmación usa el mismo).
  const responsable = useResponsable();

  const porCategoria = useMemo(() => new Set(etiqueta.categoriaIds), [etiqueta.categoriaIds]);

  useEffect(() => {
    let vigente = true;
    (async () => {
      setCarga({ estado: "cargando" });
      const supabase = createClient();
      const { data, error } = await supabase
        .from("productos")
        .select(
          `id, referencia, codigo, descripcion, categoria_id, categoria:categorias ( nombre, prefijo, familia ),
           producto_fotos ( url, orden, es_principal ),
           variantes ( id, activo, precio, color:colores ( nombre, hex ), talla:tallas ( valor ), variante_etiquetas ( etiqueta_id ) )`,
        )
        .eq("estado", "activo")
        .order("referencia");
      if (!vigente) return;
      if (error) {
        setCarga({ estado: "error", mensaje: traducirError(error, "cargar las prendas", { lectura: true }) });
        return;
      }
      const iniciales = new Set<string>();
      const productos: ProductoEtiquetable[] = (data ?? [])
        .map((p) => {
          const variantes = (p.variantes ?? [])
            .filter((v) => v.activo)
            .map((v) => {
              if ((v.variante_etiquetas ?? []).some((e) => e.etiqueta_id === etiqueta.id)) iniciales.add(v.id);
              return { id: v.id, talla: v.talla?.valor ?? null, color: v.color?.nombre ?? null, colorHex: v.color?.hex ?? null, precio: v.precio };
            });
          return {
            id: p.id,
            referencia: p.referencia,
            codigo: p.codigo,
            descripcion: p.descripcion,
            categoriaId: p.categoria_id,
            categoria: p.categoria?.nombre ?? "Sin categoría",
            categoriaPrefijo: p.categoria?.prefijo ?? null,
            categoriaFamilia: p.categoria?.familia ?? null,
            fotoUrl: fotoPrincipal(p.producto_fotos),
            // Sin foto, la miniatura toma el color de su primera talla: el de la prenda que se ve en el piso.
            colorHex: variantes[0]?.colorHex ?? null,
            variantes,
          };
        })
        .filter((p) => p.variantes.length > 0);
      setMarcadas(new Set(iniciales));
      setCarga({ estado: "listo", productos, iniciales });
    })();
    return () => {
      vigente = false;
    };
  }, [etiqueta.id, intento]);

  // Referencias estables: si fueran un `[]`/`new Set()` nuevo en cada render mientras carga,
  // los `useMemo` de abajo se recalcularían todo el tiempo.
  const productos = useMemo(() => (carga.estado === "listo" ? carga.productos : []), [carga]);
  const iniciales = useMemo(() => (carga.estado === "listo" ? carga.iniciales : new Set<string>()), [carga]);
  // Lo que dejan el buscador y la categoría; sobre eso cuentan las píldoras.
  const buscados = useMemo(
    () => filtrarProductos(productos, { texto, categoriaId: categoriaId === TODOS ? null : categoriaId }),
    [productos, texto, categoriaId],
  );
  const visibles = marca.ids ? buscados.filter((p) => marca.ids!.has(p.id)) : buscados;
  // Las marcas de prendas que ya no se venden: las de la tarjeta que no están en la lista (que es lo que está a la venta).
  const fueraDeVenta = useMemo(() => {
    if (carga.estado !== "listo") return [];
    const enVenta = new Set(carga.productos.flatMap((p) => p.variantes.map((v) => v.id)));
    return marcasManuales.filter((id) => !enVenta.has(id));
  }, [carga, marcasManuales]);
  const cuentas = cuentaPorMarca(buscados, marcadas, porCategoria);
  // Lo que se puede tocar: los que NO entran ya por categoría.
  const editables = visibles.filter((p) => !(p.categoriaId && porCategoria.has(p.categoriaId)));
  const porMarcar = editables.filter((p) => estadoDe(p, marcadas) !== "todas").length;
  const porQuitar = editables.filter((p) => estadoDe(p, marcadas) !== "ninguna").length;

  const elegirMarca = (filtro: FiltroMarca) => setMarca({ filtro, ids: idsPorMarca(productos, filtro, marcadas, porCategoria) });

  const opcionesCategoria = useMemo(() => {
    const vistas = new Map<string, string>();
    for (const p of productos) if (p.categoriaId) vistas.set(p.categoriaId, p.categoria);
    return [
      { valor: TODOS, texto: "Todas" },
      ...[...vistas].sort((a, b) => a[1].localeCompare(b[1], "es")).map(([valor, texto]) => ({ valor, texto })),
    ];
  }, [productos]);

  const cambio = cambioEntre(iniciales, marcadas);
  const quitadasFuera = quitarFuera ? fueraDeVenta : [];
  const hayCambio = cambio.agregar.length + cambio.quitar.length + quitadasFuera.length > 0;
  // Lo que se confirma antes de aplicar: con descuento, todo cambio que mueve un precio en caja, al agregar Y al quitar. Las que ya
  // no se venden no mueven ninguno, así que no piden confirmación por sí solas.
  const hoy = hoyLima();
  const vista = vistaPrevia(etiqueta, cambio.agregar.length, hoy);
  const vistaQuitar = vistaPreviaQuitar(etiqueta, cambio.quitar.length, hoy);
  const requiereRevision = !!vista || !!vistaQuitar;
  const aviso = fueraDeVenta.length > 0 ? avisoFueraDeVenta(fueraDeVenta.length, etiqueta.descuentoPct !== null, quitarFuera) : null;
  const bajoCosto = etiqueta.descuentoPct !== null && cambio.agregar.length > 0
    ? prendasBajoCosto(etiqueta.descuentoPct, prendasConCosto, new Set(), new Set(cambio.agregar))
    : [];

  // Guía de foco (CLAUDE.md «Guía de foco»): sale de lo que ya apaga el botón: sin un cambio no hay qué aplicar, y sin quien
  // registra tampoco. En la confirmación, quien registra ya se eligió; si su candado cambió en el camino, el combo vuelve ahí.
  const enConfirmacion = confirmando && requiereRevision;
  const campoResponsable = { id: "responsable", nombre: "Quién registra", requerido: true, hecho: responsable.listo, pendiente: "Elige quién registra." };
  const guia = useGuiaCampos(
    enConfirmacion
      ? [campoResponsable]
      : [{ id: "prendas", nombre: "Un cambio en la lista", requerido: true, hecho: hayCambio, pendiente: "Marca o quita una prenda." }, campoResponsable],
  );

  async function aplicar() {
    if (!responsable.listo) return;
    setGuardando(true);
    try {
      const { data, error } = await firmar(
        createClient().rpc("etiquetar_variantes", {
          p_cambios: [{ etiqueta_id: etiqueta.id, agregar: cambio.agregar, quitar: [...cambio.quitar, ...quitadasFuera] }],
        }),
        responsable.firma(),
      );
      responsable.despues(error);
      if (error) {
        avisar.error(traducirError(error, "etiquetar las prendas"));
        setConfirmando(false);
        return;
      }
      const r = data as { agregadas: number; quitadas: number };
      const partes = [
        r.agregadas > 0 ? `${r.agregadas} ${r.agregadas === 1 ? "prenda etiquetada" : "prendas etiquetadas"}` : null,
        r.quitadas > 0 ? `${r.quitadas} ${r.quitadas === 1 ? "prenda liberada" : "prendas liberadas"}` : null,
      ].filter(Boolean);
      avisar.exito(`«${etiqueta.nombre}»: ${partes.join(" y ") || "sin cambios"}`);
      // Las que ya no se venden siguen puestas si no se quitaron: la tarjeta tiene que seguir contándolas.
      onAplicado([...marcadas, ...(quitarFuera ? [] : fueraDeVenta)], r);
    } catch {
      avisar.error("No se pudo hablar con el servidor. Reintenta en un momento.");
      setConfirmando(false);
    } finally {
      setGuardando(false);
    }
  }

  const subtitulo =
    etiqueta.descuentoPct === null
      ? "Etiqueta informativa: no cambia ningún precio."
      : `${etiqueta.descuentoPct.toLocaleString("es-PE", { maximumFractionDigits: 2 })} % de descuento: en Vender baja solo, a las prendas que lleven la etiqueta.`;

  return (
    <Modal titulo={`Prendas de «${etiqueta.nombre}»`} subtitulo={subtitulo} tamano="ancha" onClose={onClose}>
      {(cerrar) =>
        enConfirmacion ? (
          <div className="mt-5 space-y-4">
            <div
              className={`space-y-3 rounded-lg border p-4 ${vista?.sinEfectoHoy === false || vistaQuitar?.sinEfectoHoy === false ? "border-ambar/40 bg-ambar/10" : "border-tinta/15 bg-tinta/[0.03]"}`}
            >
              {vista && (
                <div>
                  <p className="text-sm font-medium text-tinta">{vista.titulo}</p>
                  <p className="mt-1 text-sm text-tinta/75">{vista.detalle}</p>
                  {bajoCosto.length > 0 && (
                    <p className="mt-2 text-sm text-ambar">
                      Por debajo del costo: {bajoCosto.length} {bajoCosto.length === 1 ? "prenda" : "prendas"}
                      {bajoCosto.length <= 3 ? ` (${bajoCosto.map(nombreBajoCosto).join(", ")})` : ""}.
                    </p>
                  )}
                </div>
              )}
              {vistaQuitar && (
                <div>
                  <p className="text-sm font-medium text-tinta">{vistaQuitar.titulo}</p>
                  <p className="mt-1 text-sm text-tinta/75">{vistaQuitar.detalle}</p>
                </div>
              )}
              {quitadasFuera.length > 0 && (
                <p className="text-xs text-tinta/65">
                  Además se la quitarás a {quitadasFuera.length} {quitadasFuera.length === 1 ? "prenda que ya no se vende" : "prendas que ya no se venden"}.
                </p>
              )}
            </div>
            {!responsable.listo && (
              <CampoGuiado id="responsable" guia={guia}>
                <ComboResponsable control={responsable} deshabilitado={guardando} />
              </CampoGuiado>
            )}
            <PieGuia guia={guia} listo="Todo listo para aplicar." />
            <div className="pie-acciones">
              <Boton peso="fantasma" onClick={() => setConfirmando(false)} disabled={guardando}>
                Volver
              </Boton>
              <Boton peso="primario" onClick={aplicar} cargando={guardando} disabled={!responsable.listo} title={responsable.motivo ?? guia.frase ?? undefined} className={`flex-1 ${guia.claseConfirmar}`}>
                Sí, aplicar
              </Boton>
            </div>
          </div>
        ) : (
          <div className="mt-5 space-y-4">
            <div className="space-y-3">
              <Buscador valor={texto} onCambio={setTexto} placeholder="Busca por nombre, código o categoría" etiqueta="Buscar prendas" />
              <div className="flex flex-wrap items-center gap-2">
                <BotonFiltro activo={marca.filtro === "todas"} onClick={() => elegirMarca("todas")} cuenta={cuentas.todas}>
                  Todas
                </BotonFiltro>
                <BotonFiltro activo={marca.filtro === "con"} onClick={() => elegirMarca("con")} cuenta={cuentas.con}>
                  Con la etiqueta
                </BotonFiltro>
                <BotonFiltro activo={marca.filtro === "sin"} onClick={() => elegirMarca("sin")} cuenta={cuentas.sin}>
                  Sin ella
                </BotonFiltro>
                <DesplegablePildora icono={Shirt} etiqueta="Categoría" valor={categoriaId} onValor={setCategoriaId} opciones={opcionesCategoria} />
              </div>
            </div>

            <CampoGuiado id="prendas" guia={guia} titulo="Prendas que llevan esta etiqueta" className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-tinta/65">
                <span className="tabular-nums">
                  {carga.estado === "listo"
                    ? `${visibles.length} ${visibles.length === 1 ? "producto" : "productos"} · ${marcadas.size} ${marcadas.size === 1 ? "prenda marcada a mano" : "prendas marcadas a mano"}`
                    : " "}
                </span>
                <span className="flex gap-2">
                  <button
                    type="button"
                    disabled={porMarcar === 0 || guardando}
                    onClick={() => setMarcadas(marcarProductos(editables, marcadas, true))}
                    title="Marca todas las tallas de los productos de la lista. Los que entran por su categoría ya la llevan."
                    className="btn-cayla btn-sutil btn-chico"
                  >
                    Marcar todos
                  </button>
                  <button
                    type="button"
                    disabled={porQuitar === 0 || guardando}
                    onClick={() => setMarcadas(marcarProductos(editables, marcadas, false))}
                    title="Quita la etiqueta a los productos de la lista. Los que entran por su categoría la siguen llevando."
                    className="btn-cayla btn-sutil btn-chico"
                  >
                    Quitar todos
                  </button>
                </span>
              </div>

              {aviso && (
                <Aviso
                  tono="info"
                  chico
                  titulo={aviso.titulo}
                  accion={
                    quitarFuera ? (
                      <BotonDeshacer onClick={() => setQuitarFuera(false)} disabled={guardando} />
                    ) : (
                      <button type="button" onClick={() => setQuitarFuera(true)} disabled={guardando} className="btn-cayla btn-sutil btn-chico">
                        Quitárselas
                      </button>
                    )
                  }
                >
                  {aviso.detalle}
                </Aviso>
              )}

              {/* Alto fijo: lo que se filtra cambia el contenido, no el tamaño de la hoja. Toma lo que la pantalla deja libre (de
                  13 a 26 rem) para que el botón quede a la vista en un laptop; si igual no cabe, el pie se queda pegado abajo. */}
              <div className="h-[clamp(13rem,calc(90vh-33rem),26rem)] overflow-y-auto rounded-lg border border-tinta/10">
                {carga.estado === "cargando" && <p className="py-16 text-center text-sm text-tinta/60">Cargando prendas…</p>}
                {carga.estado === "error" && (
                  <div className="space-y-3 py-12 text-center">
                    <p className="text-sm text-tinta/75">{carga.mensaje}</p>
                    <Boton peso="discreto" onClick={() => setIntento((n) => n + 1)}>
                      Reintentar
                    </Boton>
                  </div>
                )}
                {carga.estado === "listo" && visibles.length === 0 && (
                  <Vacio tamano="chico" className="py-12" icono={<FunnelX />}>
                    {marca.filtro === "con" ? "Ninguna prenda de esta búsqueda lleva la etiqueta." : "Ningún producto coincide con ese filtro."}
                  </Vacio>
                )}
                {carga.estado === "listo" && visibles.length > 0 && (
                  <ul className="divide-y divide-tinta/10">
                    {visibles.map((p) => {
                      const heredada = !!p.categoriaId && porCategoria.has(p.categoriaId);
                      const estado = heredada ? "todas" : estadoDe(p, marcadas);
                      const abierto = abiertos.has(p.id);
                      const lleva = llevaEtiqueta(p, marcadas, porCategoria);
                      const precio = precioConCampana(p, etiqueta.descuentoPct);
                      const nombre = p.referencia;
                      return (
                        <li key={p.id}>
                          <div className="flex items-center gap-3 px-3 py-2">
                            <Casilla
                              estado={estado}
                              disabled={heredada || guardando}
                              etiqueta={`${nombre}: marcar todas sus tallas`}
                              onChange={() => setMarcadas(alternarProducto(p, marcadas))}
                            />
                            <button
                              type="button"
                              aria-expanded={abierto}
                              onClick={() => setAbiertos((a) => { const s = new Set(a); if (!s.delete(p.id)) s.add(p.id); return s; })}
                              className="flex min-w-0 flex-1 items-center gap-3 text-left"
                            >
                              <MiniaturaPrenda fotoUrl={p.fotoUrl ?? null} colorHex={p.colorHex} {...categoriaDe(p)} />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm text-tinta">{nombre}</span>
                                <span className="block truncate text-xs text-tinta/60">
                                  {p.categoria} · {textoTallas(p, marcadas, heredada)}
                                  {p.codigo ? <span className="text-tinta/45"> · {p.codigo}</span> : null}
                                </span>
                              </span>
                              {heredada && (
                                <Chip tono="pizarra" title="Entra por la regla de la campaña: la lleva sin marcarla.">
                                  Por categoría
                                </Chip>
                              )}
                              {precio && <PrecioFila precio={precio} lleva={lleva} />}
                              <ChevronRight className={`h-4 w-4 shrink-0 text-tinta/40 transition-transform ${abierto ? "rotate-90" : ""}`} aria-hidden />
                            </button>
                          </div>
                          {abierto && (
                            <ul className="space-y-1 bg-tinta/[0.02] px-3 pb-3 pl-11">
                              {p.variantes.map((v) => {
                                const nombreTalla = [v.talla, v.color].filter(Boolean).join(" · ") || "Única";
                                return (
                                  <li key={v.id}>
                                    <label className={`flex items-center gap-2.5 py-1 text-sm ${heredada ? "text-tinta/50" : "cursor-pointer text-tinta/80"}`}>
                                      <Casilla
                                        estado={heredada || marcadas.has(v.id) ? "todas" : "ninguna"}
                                        disabled={heredada || guardando}
                                        etiqueta={nombreTalla}
                                        onChange={() => setMarcadas(alternarVariante(v.id, marcadas))}
                                      />
                                      {/* El color de la prenda es dato: no cambia en modo oscuro (ADR-0336). */}
                                      <span aria-hidden data-color-dato className="size-2.5 shrink-0 rounded-full border border-tinta/20" style={v.colorHex ? { backgroundColor: v.colorHex } : undefined} />
                                      {nombreTalla}
                                    </label>
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              {porCategoria.size > 0 && (
                <p className="nota-cayla text-xs">«Por categoría»: ya la llevan por la regla de la campaña; se cambian en «Configurar campaña».</p>
              )}
            </CampoGuiado>

            {/* El pie queda a la vista aunque la hoja no quepa (`pie-hoja-fijo`); su línea va en la caja de adentro. */}
            <div className="pie-hoja-fijo">
              <div className="space-y-3 border-t border-tinta/10 pt-4">
                <p className="text-sm text-tinta/75" aria-live="polite">
                  {hayCambio ? textoCambio(cambio, productos, quitadasFuera.length) : "Marca o quita prendas en la lista: aquí verás el cambio antes de aplicarlo."}
                </p>
                <CampoGuiado id="responsable" guia={guia}>
                  <ComboResponsable control={responsable} deshabilitado={guardando} />
                </CampoGuiado>
                {/* Sin un cambio todavía no falta nada (la frase de arriba dice qué hacer), y con todo listo esa frase ya es el resumen. */}
                {hayCambio && guia.faltan.length > 0 && <PieGuia guia={guia} />}
                <div className="pie-acciones">
                  <Boton peso="fantasma" onClick={cerrar} disabled={guardando}>
                    Cancelar
                  </Boton>
                  <Boton
                    peso="primario"
                    className={`flex-1 ${guia.claseConfirmar}`}
                    disabled={!hayCambio || carga.estado !== "listo" || !responsable.listo}
                    title={!hayCambio ? "Marca o quita una prenda para aplicar." : (responsable.motivo ?? guia.frase ?? undefined)}
                    cargando={guardando}
                    onClick={() => (requiereRevision ? setConfirmando(true) : aplicar())}
                  >
                    {requiereRevision ? "Revisar y aplicar" : "Aplicar"}
                  </Boton>
                </div>
              </div>
            </div>
          </div>
        )
      }
    </Modal>
  );
}

/** El precio de la fila: tachado y con el de la campaña si la prenda lleva la etiqueta; solo, en tenue, si no. Marcar la casilla
 *  baja el precio a la vista, que es justo lo que va a pasar en la caja. */
function PrecioFila({ precio, lleva }: { precio: { antes: number; despues: number; desde: boolean }; lleva: boolean }) {
  const desde = precio.desde ? "desde " : "";
  if (!lleva) return <span className="shrink-0 text-right text-xs tabular-nums text-tinta/50">{desde}{soles(precio.antes)}</span>;
  return (
    <span className="shrink-0 text-right tabular-nums leading-tight">
      <span className="block text-[11px] text-tinta/50 line-through">{soles(precio.antes)}</span>
      <span className="block text-sm text-tinta">{desde}{soles(precio.despues)}</span>
    </span>
  );
}

/** La casilla del sistema (`components/ui/Casilla.tsx`, ADR-0358 ronda 6) con los tres estados de un producto: todas, algunas
 *  (a medias) o ninguna. Desactivada cuando la prenda ya hereda la etiqueta por su categoría (no se toca). */
function Casilla({ estado, disabled, etiqueta, onChange }: { estado: "todas" | "algunas" | "ninguna"; disabled: boolean; etiqueta: string; onChange: () => void }) {
  return <CasillaSistema marcada={estado === "todas"} aMedias={estado === "algunas"} disabled={disabled} onCambio={onChange} etiqueta={etiqueta} />;
}
