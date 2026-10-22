"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, ChevronRight, FunnelX, ScanLine, Shirt } from "lucide-react";
import { avisar } from "@/components/ui/Avisos";
import { Modal } from "@/components/ui/Modal";
import { Boton } from "@/components/ui/campos";
import { Buscador } from "@/components/ui/Buscador";
import { BotonFiltro } from "@/components/ui/BotonFiltro";
import { DesplegablePildora, TODOS } from "@/components/ui/FiltrosPildora";
import { Chip } from "@/components/ui/Chip";
import { MiniaturaPrenda, categoriaDe } from "@/components/ui/PrendaCelda";
import { SegmentoDeslizante } from "@/components/ui/SegmentoDeslizante";
import { usePistola, type Lectura as LecturaPistola } from "@/components/ui/usePistola";
import { EscanerBusqueda, type RespuestaLectura } from "@/components/EscanerBusqueda";
import { EtiquetaColgada } from "@/components/etiqueta-prendas/EtiquetaColgada";
import type { Vuelo } from "@/components/etiqueta-prendas/vuelo";
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
import { avisoReimprimir, destinoReimprimir, nombreBajoCosto, prendasBajoCosto, type PrendaConCosto } from "@/lib/etiqueta-campana";
import {
  alternarProducto,
  alternarVariante,
  cajaAntesDespues,
  cambioEntre,
  cuentaPorMarca,
  estadoDe,
  etiquetaColgada,
  filtrarProductos,
  idsPorMarca,
  leerCodigo,
  llevaEtiqueta,
  marcarProductos,
  mensajeLectura,
  nombreDeTalla,
  otrasTallas,
  precioConCampana,
  prendasQueCambianAlEtiquetar,
  textoCambio,
  textoTallas,
  vistaPrevia,
  vistaPreviaQuitar,
  avisoFueraDeVenta,
  type FiltroMarca,
  type Lectura,
  type ModoLectura,
  type PrendaFueraDeVenta,
  type ProductoEtiquetable,
} from "@/lib/etiquetar-prendas";
import { Casilla as CasillaSistema } from "@/components/ui/Casilla";
import { Vacio } from "@/components/ui/Vacio";
import { Aviso } from "@/components/ui/Aviso";
import { BotonDeshacer } from "@/components/ui/BotonDeshacer";

/**
 * «Prendas de una etiqueta»: elegir qué prendas llevan, por ejemplo, «Black Friday». Desde el 2026-10-22 es «la etiqueta que se
 * llena» (Felipe eligió la B de `docs/maquetas/etiqueta-escanear-2026-10/`): a la izquierda el catálogo, a la derecha LA ETIQUETA
 * colgada con lo que la lleva, y la hoja del alto de la pantalla, sin un scroll que no haga falta (la lista corre por dentro y el
 * mosaico de la etiqueta dibuja lo que cabe).
 *
 * Se marca por PRODUCTO (una casilla marca todas sus tallas y colores) con excepciones por talla al desplegarlo, o ESCANEANDO: la
 * pistola (esté el cursor donde esté) o, en el teléfono, la cámara, leen la etiqueta de la prenda y la marcan. Una lectura marca
 * SOLO esa talla y color (la que está en la mano) y nunca alterna: leer dos veces no la quita; para quitar con el lector se elige
 * «Al escanear: Quitar» (`leerCodigo`, `lib/etiquetar-prendas.ts`). Escanear no guarda nada: lo que viaja a la base son ids de
 * variante, todo en una sola llamada atómica (`etiquetar_variantes`, 20260919010000), al aplicar.
 *
 * Una etiqueta con descuento cambia el precio en caja (ADR-0108), así que antes de guardar se muestra QUÉ va a pasar: cuántas
 * prendas, cuánto baja, desde cuándo y, si el descuento las deja por debajo de su costo, cuáles. Quitarla también cambia el precio
 * (sube), y también se confirma. Sin descuento se guarda directo.
 *
 * Las marcas de prendas que ya no se venden (una talla desactivada, un producto descontinuado) no salen en la lista, pero se
 * dicen: si la prenda vuelve a la venta, vuelve con la etiqueta. «Quitárselas» las suma a lo que se quita. Los productos que ya
 * entran por CATEGORÍA (regla de la campaña) aparecen marcados y bloqueados.
 */

export type EtiquetaParaPrendas = {
  id: string;
  nombre: string;
  descuentoPct: number | null;
  vigenteDesde: string | null;
  vigenteHasta: string | null;
  categoriaIds: string[];
};

type Cargado = { productos: ProductoEtiquetable[]; iniciales: Set<string>; fueraDeVentaLeibles: PrendaFueraDeVenta[] };

/** La última lectura y lo que se le ofrece al lado: «Ponérsela a sus otras N tallas» y «Deshacer». */
type Leida = RespuestaLectura & { lectura: Lectura; otras: string[] };

/** La pistola cuenta aunque el foco no esté en la caja; la cámara se ofrece solo en un aparato táctil (el teléfono, la tablet). */
function usePantallaTactil() {
  const [tactil, setTactil] = useState(false);
  useEffect(() => {
    const m = window.matchMedia?.("(pointer: coarse)");
    if (!m) return;
    const ver = () => setTactil(m.matches && !!navigator.mediaDevices?.getUserMedia);
    ver();
    m.addEventListener?.("change", ver);
    return () => m.removeEventListener?.("change", ver);
  }, []);
  return tactil;
}

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
  const [modo, setModo] = useState<ModoLectura>("poner");
  const [leida, setLeida] = useState<Leida | null>(null);
  const [camara, setCamara] = useState(false);
  const [caben, setCaben] = useState(18);
  // El producto que se pidió ver desde la etiqueta (clic en su pieza): su fila se abre, queda arriba de la lista y respira una vez.
  const [senalada, setSenalada] = useState<{ id: string; clave: number } | null>(null);
  const tactil = usePantallaTactil();
  const buscador = useRef<HTMLInputElement>(null);
  const lista = useRef<HTMLDivElement>(null);
  const vuelo = useRef<Vuelo | null>(null);
  const clave = useRef(0);
  // Etiquetar prendas es Catálogo (ADR-0161): el combo está junto al botón desde que se abre la hoja, para que quien
  // registra se vea antes de empezar y no aparezca de golpe al primer clic (la confirmación usa el mismo).
  const responsable = useResponsable();
  const router = useRouter();

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
           variantes ( id, activo, precio, sku, codigo, codigos_barras ( codigo ), color:colores ( nombre, hex ), talla:tallas ( valor ), variante_etiquetas ( etiqueta_id ) )`,
        )
        .eq("estado", "activo")
        .order("referencia");
      if (!vigente) return;
      if (error) {
        setCarga({ estado: "error", mensaje: traducirError(error, "cargar las prendas", { lectura: true }) });
        return;
      }
      const iniciales = new Set<string>();
      const fueraDeVentaLeibles: PrendaFueraDeVenta[] = [];
      // Lo que lee la pistola: primero el `sku` (puede estar vacío), después el código de la etiqueta y los de fábrica.
      const codigosDe = (v: { sku: string | null; codigo: string | null; codigos_barras: { codigo: string }[] | null }) => [
        v.sku ?? "",
        ...(v.codigo ? [v.codigo] : []),
        ...(v.codigos_barras ?? []).map((c) => c.codigo),
      ];
      const productos: ProductoEtiquetable[] = (data ?? [])
        .map((p) => {
          const variantes = (p.variantes ?? [])
            .filter((v) => {
              if (v.activo) return true;
              // Una talla desactivada no se marca, pero si alguien la escanea se le dice por qué no entra.
              fueraDeVentaLeibles.push({ referencia: p.referencia, talla: v.talla?.valor ?? null, color: v.color?.nombre ?? null, codigos: codigosDe(v) });
              return false;
            })
            .map((v) => {
              if ((v.variante_etiquetas ?? []).some((e) => e.etiqueta_id === etiqueta.id)) iniciales.add(v.id);
              return { id: v.id, talla: v.talla?.valor ?? null, color: v.color?.nombre ?? null, colorHex: v.color?.hex ?? null, precio: v.precio, codigos: codigosDe(v) };
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
      setCarga({ estado: "listo", productos, iniciales, fueraDeVentaLeibles });
    })();
    return () => {
      vigente = false;
    };
  }, [etiqueta.id, intento]);

  // La hoja mide del alto de la pantalla: lo que ocupa su título se descuenta del alto de la lista (`.eqp-hoja`, etiqueta-prendas.css).
  // `offsetTop` y no `getBoundingClientRect`: la hoja entra con un `transform` que movería la medida. Es una ref de función y no un
  // efecto: el contenido de `<Modal>` llega por el portal de Radix un render después, y un efecto del primer render no lo encuentra.
  const hoja = useCallback((el: HTMLDivElement | null) => {
    if (!el) return;
    let cuadro = 0;
    const medir = () => {
      const panel = el.offsetParent as HTMLElement | null;
      if (!panel) {
        cuadro = requestAnimationFrame(medir);
        return;
      }
      const abajo = parseFloat(getComputedStyle(panel).paddingBottom) || 0;
      el.style.setProperty("--eqp-encima", `${el.offsetTop + abajo + 2}px`);
    };
    medir();
    // El título puede pasar a dos líneas al angostar la ventana.
    window.addEventListener("resize", medir);
    return () => {
      cancelAnimationFrame(cuadro);
      window.removeEventListener("resize", medir);
    };
  }, []);

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
  const colgada = useMemo(() => etiquetaColgada(productos, iniciales, marcadas, porCategoria, caben), [productos, iniciales, marcadas, porCategoria, caben]);
  const caja = cajaAntesDespues(productos, cambio.agregar, etiqueta.descuentoPct);

  // Guía de foco (CLAUDE.md «Guía de foco»): sale de lo que ya apaga el botón: sin un cambio no hay qué aplicar, y sin quien
  // registra tampoco. En la confirmación, quien registra ya se eligió; si su candado cambió en el camino, el combo vuelve ahí.
  const enConfirmacion = confirmando && requiereRevision;
  const campoResponsable = { id: "responsable", nombre: "Quién registra", requerido: true, hecho: responsable.listo, pendiente: "Elige quién registra." };
  const guia = useGuiaCampos(
    enConfirmacion
      ? [campoResponsable]
      : [{ id: "prendas", nombre: "Un cambio en la lista", requerido: true, hecho: hayCambio, pendiente: "Marca, quita o escanea una prenda." }, campoResponsable],
  );

  /** Marca a mano (casilla) y, si suma algo, la prenda vuela de su fila a la etiqueta. */
  function marcar(siguiente: Set<string>, productoId: string) {
    const nuevas = [...siguiente].filter((id) => !marcadas.has(id) && !iniciales.has(id));
    if (nuevas.length > 0) vuelo.current = { ids: nuevas, desde: () => miniDeFila(productoId) };
    setMarcadas(siguiente);
  }

  /** Clic en una pieza de la etiqueta: lleva a la fila de ese producto con sus tallas y colores abiertos. Si un filtro la escondía
   *  (la búsqueda, la categoría o una píldora), se quitan: sin eso, el clic no llevaría a ningún lado. */
  function verEnLista(productoId: string) {
    if (!visibles.some((p) => p.id === productoId)) {
      setTexto("");
      setCategoriaId(TODOS);
      setMarca({ filtro: "todas", ids: null });
    }
    setAbiertos((a) => new Set(a).add(productoId));
    setSenalada((s) => ({ id: productoId, clave: (s?.clave ?? 0) + 1 }));
  }

  /** La miniatura de la fila, si se ve dentro de la lista (una fila fuera de la vista no es un buen punto de partida). */
  function miniDeFila(productoId: string): Element | null {
    const el = lista.current?.querySelector(`[data-mini="${CSS.escape(productoId)}"]`);
    const caja = lista.current?.getBoundingClientRect();
    if (!el || !caja) return null;
    const r = el.getBoundingClientRect();
    return r.top >= caja.top - 4 && r.bottom <= caja.bottom + 4 ? el : null;
  }

  // Lo que hace una lectura, de la pistola o de la cámara. De una ref: la pistola y la cámara cuelgan su oyente una vez y tienen que
  // leer contra lo marcado de AHORA.
  const leerAhora = useRef<(codigo: string) => RespuestaLectura | null>(() => null);
  leerAhora.current = (codigo: string) => {
    if (carga.estado !== "listo" || guardando || enConfirmacion) return null;
    const r = leerCodigo(codigo, modo, { productos, marcadas, porCategoria, fueraDeVenta: carga.fueraDeVentaLeibles });
    const m = mensajeLectura(r.lectura);
    const l = r.lectura;
    const otras = l.tipo === "puesta" || l.tipo === "ya-la-llevaba" ? otrasTallas(l.producto, r.marcadas, porCategoria) : [];
    clave.current += 1;
    const respuesta: Leida = { clave: clave.current, ...m, lectura: l, otras };
    if ("producto" in l) {
      // La fila de la prenda queda a la vista (sin animar el scroll: de ahí sale el vuelo) y respira una vez.
      const fila = lista.current?.querySelector(`[data-fila="${CSS.escape(l.producto.id)}"]`);
      fila?.scrollIntoView({ block: "nearest" });
      if (l.tipo === "puesta") vuelo.current = { ids: [l.variante.id], desde: () => miniDeFila(l.producto.id) ?? document.querySelector("[data-leida-mini]") };
    }
    setMarcadas(r.marcadas);
    setLeida(respuesta);
    setSenalada(null);
    return respuesta;
  };

  const alLeerPistola = useCallback((p: LecturaPistola) => {
    // Lo que la pistola escribió en el buscador no es una búsqueda: vuelve lo que había antes.
    if (p.dentro) setTexto(p.antes);
    leerAhora.current(p.codigo);
  }, []);
  usePistola(buscador, { activa: carga.estado === "listo" && !enConfirmacion && !camara && !guardando, alLeer: alLeerPistola, fuera: "leer" });

  // Ya con la fila dibujada y abierta: la lista (solo ella, no la hoja) corre hasta dejarla arriba, con sus tallas debajo, y el foco
  // pasa a su botón para seguir con el teclado desde ahí.
  useEffect(() => {
    if (!senalada) return;
    const caja = lista.current;
    const fila = caja?.querySelector<HTMLElement>(`[data-fila="${CSS.escape(senalada.id)}"]`);
    if (!caja || !fila) return;
    const quieto = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const destino = caja.scrollTop + fila.getBoundingClientRect().top - caja.getBoundingClientRect().top;
    caja.scrollTo({ top: Math.max(0, destino), behavior: quieto ? "auto" : "smooth" });
    fila.querySelector<HTMLElement>("[aria-expanded]")?.focus({ preventScroll: true });
  }, [senalada]);

  function deshacerLeida() {
    if (!leida) return;
    const l = leida.lectura;
    if (l.tipo === "puesta") setMarcadas((m) => { const s = new Set(m); s.delete(l.variante.id); return s; });
    if (l.tipo === "quitada") setMarcadas((m) => new Set(m).add(l.variante.id));
    setLeida(null);
  }

  function ponerOtras() {
    if (!leida || leida.otras.length === 0 || !("producto" in leida.lectura)) return;
    const p = leida.lectura.producto;
    vuelo.current = { ids: leida.otras, desde: () => document.querySelector("[data-leida-mini]") };
    setMarcadas((m) => new Set([...m, ...leida.otras]));
    setLeida({ ...leida, otras: [], estado: "Marcada", tono: "verde", detalle: `Todas sus tallas · ${textoTallas(p, new Set([...marcadas, ...leida.otras]), false)}` });
  }

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
      // Con descuento que rige hoy, las prendas que ganaron o perdieron la etiqueta cambiaron de precio en caja: su etiqueta de papel
      // dice el de antes. El aviso lo dice y lleva a imprimir solo esas, como al guardar una campaña (ADR-0441, ADR-0472).
      const cambian = prendasQueCambianAlEtiquetar(etiqueta, cambio, hoy);
      const destino = destinoReimprimir(cambian, etiqueta.id);
      const reimprimir = avisoReimprimir(cambian.quedan.length + cambian.salen.length, destino !== null);
      avisar.exito(
        `«${etiqueta.nombre}»: ${partes.join(" y ") || "sin cambios"}`,
        reimprimir
          ? { detalle: reimprimir.detalle, accion: destino && reimprimir.boton ? { texto: reimprimir.boton, onClick: () => router.push(destino) } : undefined }
          : undefined,
      );
      // Las que ya no se venden siguen puestas si no se quitaron: la tarjeta tiene que seguir contándolas.
      onAplicado([...marcadas, ...(quitarFuera ? [] : fueraDeVenta)], r);
    } catch {
      avisar.error("No se pudo hablar con el servidor. Reintenta en un momento.");
      setConfirmando(false);
    } finally {
      setGuardando(false);
    }
  }

  // En el celular la franja de la etiqueta ya dice el descuento: la frase se queda para el escritorio y la lista gana ese alto.
  const subtitulo = (
    <span className="max-md:hidden">
      {etiqueta.descuentoPct === null
        ? "No cambia ningún precio. Marca o escanea las prendas que van aquí."
        : `${etiqueta.descuentoPct.toLocaleString("es-PE", { maximumFractionDigits: 2 })} % de descuento: en Vender baja solo, a las prendas marcadas. Márcalas o escanéalas.`}
    </span>
  );
  const listo = carga.estado === "listo";

  return (
    <Modal
      titulo={`Prendas de «${etiqueta.nombre}»`}
      subtitulo={subtitulo}
      ancho="max-w-[78rem]" /* unificar-fijo: la etiqueta que se llena es de diseño propio, a todo lo ancho (maqueta B elegida por Felipe 2026-10-22) */
      bloqueado={guardando}
      onClose={onClose}
    >
      {(cerrar) => (
        <div ref={hoja} className="eqp-hoja mt-4">
          {/* ---- El catálogo: lector, filtros, la última lectura y la lista ---- */}
          <section inert={enConfirmacion} className={`eqp-lista ${enConfirmacion ? "max-md:hidden md:opacity-55" : ""}`}>
            <div className="flex items-center gap-2">
              <Buscador
                ref={buscador}
                valor={texto}
                onCambio={setTexto}
                icono="barras"
                // sugerir-fijo: busca en todo el catálogo y lee la etiqueta: no depende de nada elegido antes
                placeholder={tactil ? "Busca una prenda" : "Busca por nombre o código, o dispara la pistola"}
                etiqueta="Buscar o escanear prendas"
                className="min-w-0 flex-1"
              />
              {/* La cámara, solo en un aparato táctil: en el computador lee la pistola. */}
              {tactil && (
                <Boton peso="fantasma" onClick={() => setCamara(true)} disabled={!listo || guardando} className="shrink-0" title="Escanear las etiquetas con la cámara del teléfono">
                  <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                    <Camera aria-hidden className="h-4 w-4" />
                    Cámara
                  </span>
                </Boton>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
              <div className="-mx-1 flex min-w-0 items-center gap-2 overflow-x-auto px-1 pb-0.5 max-sm:w-full max-sm:flex-nowrap sm:flex-wrap">
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
              <div className="flex items-center gap-2 max-sm:w-full">
                <span className="label-cayla whitespace-nowrap text-[10.5px] text-taupe">Al escanear</span>
                <SegmentoDeslizante
                  forma="modo"
                  etiqueta="Qué hace una lectura"
                  valor={modo}
                  onCambio={(c) => setModo(c as ModoLectura)}
                  opciones={[
                    { clave: "poner", etiqueta: "Poner", ayuda: "Cada prenda que escaneas queda marcada" },
                    { clave: "quitar", etiqueta: "Quitar", ayuda: "Cada prenda que escaneas se desmarca" },
                  ]}
                />
              </div>
            </div>

            {leida ? (
              <LecturaReciente leida={leida} pct={etiqueta.descuentoPct} onDeshacer={deshacerLeida} onOtras={ponerOtras} deshabilitado={guardando} />
            ) : (
              <p className="flex items-center gap-2 text-[12.5px] text-taupe max-md:hidden">
                <ScanLine aria-hidden className="h-4 w-4 shrink-0" />
                {tactil
                  ? "Toca «Cámara» y escanea las etiquetas una tras otra: cada prenda leída se marca sola."
                  : "Dispara la pistola sobre la etiqueta de una prenda: se marca esa talla y color, sin tocar nada más."}
              </p>
            )}

            <CampoGuiado id="prendas" guia={guia} className="eqp-caja-lista">
              <div className="flex items-center justify-between gap-2 border-b border-tinta/10 px-3 py-1.5 text-xs text-taupe">
                <span className="min-w-0 truncate tabular-nums">
                  {listo ? (
                    <>
                      {visibles.length} {visibles.length === 1 ? "producto" : "productos"}
                      <span className="max-sm:hidden"> · {marcadas.size} {marcadas.size === 1 ? "talla marcada a mano" : "tallas marcadas a mano"}</span>
                    </>
                  ) : (
                    " "
                  )}
                </span>
                <span className="flex shrink-0 gap-1.5">
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
                    title="Desmarca los productos de la lista. Los que entran por su categoría siguen marcados."
                    className="btn-cayla btn-sutil btn-chico"
                  >
                    Quitar todos
                  </button>
                </span>
              </div>

              <div ref={lista} className="eqp-scroll scroll-cayla">
                {carga.estado === "cargando" && <p className="py-16 text-center text-sm text-taupe">Cargando prendas…</p>}
                {carga.estado === "error" && (
                  <div className="space-y-3 py-12 text-center">
                    <p className="text-sm text-tinta/75">{carga.mensaje}</p>
                    <Boton peso="discreto" onClick={() => setIntento((n) => n + 1)}>
                      Reintentar
                    </Boton>
                  </div>
                )}
                {listo && visibles.length === 0 && (
                  <Vacio tamano="chico" className="py-12" icono={<FunnelX />}>
                    {marca.filtro === "con" ? "Ninguna prenda de esta búsqueda está marcada." : "Ningún producto coincide con ese filtro."}
                  </Vacio>
                )}
                {listo && visibles.length > 0 && (
                  <ul className="divide-y divide-tinta/10">
                    {visibles.map((p) => {
                      const heredada = !!p.categoriaId && porCategoria.has(p.categoriaId);
                      const estado = heredada ? "todas" : estadoDe(p, marcadas);
                      const abierto = abiertos.has(p.id);
                      const lleva = llevaEtiqueta(p, marcadas, porCategoria);
                      const precio = precioConCampana(p, etiqueta.descuentoPct);
                      const nombre = p.referencia;
                      const recien = leida && "producto" in leida.lectura && leida.lectura.producto.id === p.id ? leida : null;
                      // La fila que acaba de leerse o que se pidió ver desde la etiqueta respira una vez (la clave nueva la repite).
                      const respira = recien
                        ? { clave: `l${recien.clave}`, tono: recien.tono }
                        : senalada?.id === p.id
                          ? { clave: `s${senalada.clave}`, tono: lleva ? "verde" : "taupe" }
                          : null;
                      return (
                        <li key={p.id} data-fila={p.id}>
                          <div key={respira?.clave ?? "fila"} data-tono={respira?.tono} className={`flex items-center gap-3 px-3 py-2 ${respira ? "eqp-fila-leida" : ""}`}>
                            <Casilla
                              estado={estado}
                              disabled={heredada || guardando}
                              etiqueta={`${nombre}: marcar todas sus tallas`}
                              onChange={() => marcar(alternarProducto(p, marcadas), p.id)}
                            />
                            <button
                              type="button"
                              aria-expanded={abierto}
                              onClick={() => setAbiertos((a) => { const s = new Set(a); if (!s.delete(p.id)) s.add(p.id); return s; })}
                              className="flex min-w-0 flex-1 items-center gap-3 text-left"
                            >
                              <span data-mini={p.id} className="shrink-0">
                                <MiniaturaPrenda fotoUrl={p.fotoUrl ?? null} colorHex={p.colorHex} {...categoriaDe(p)} />
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm text-tinta">{nombre}</span>
                                <span className="block truncate text-xs text-taupe">
                                  {p.categoria} · {textoTallas(p, marcadas, heredada)}
                                  {p.codigo ? <span> · {p.codigo}</span> : null}
                                </span>
                              </span>
                              {heredada && (
                                <Chip tono="pizarra" title="Entra por la regla de la campaña: la lleva sin marcarla. Se cambia en «Configurar».">
                                  Por categoría
                                </Chip>
                              )}
                              {precio && <PrecioFila precio={precio} lleva={lleva} />}
                              <ChevronRight className={`h-4 w-4 shrink-0 text-taupe transition-transform ${abierto ? "rotate-90" : ""}`} aria-hidden />
                            </button>
                          </div>
                          {abierto && (
                            <ul className="grid grid-cols-1 gap-x-4 bg-hueso/40 px-3 pb-2.5 pl-11 sm:grid-cols-2 xl:grid-cols-3">
                              {p.variantes.map((v) => {
                                const nombreTalla = nombreDeTalla(v);
                                return (
                                  <li key={v.id}>
                                    <label className={`flex items-center gap-2.5 py-1 text-sm ${heredada ? "text-taupe" : "cursor-pointer text-tinta/80"}`}>
                                      <Casilla
                                        estado={heredada || marcadas.has(v.id) ? "todas" : "ninguna"}
                                        disabled={heredada || guardando}
                                        etiqueta={nombreTalla}
                                        onChange={() => marcar(alternarVariante(v.id, marcadas), p.id)}
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
            </CampoGuiado>

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
          </section>

          {/* ---- La etiqueta colgada o, al revisar, lo que va a pasar ---- */}
          <aside className={`eqp-lado ${enConfirmacion ? "max-md:overflow-y-auto" : ""}`} aria-label={`La etiqueta «${etiqueta.nombre}»`}>
            {enConfirmacion ? (
              <Revision
                vista={vista}
                vistaQuitar={vistaQuitar}
                bajoCosto={bajoCosto.length > 0 ? `Por debajo del costo: ${bajoCosto.length} ${bajoCosto.length === 1 ? "prenda" : "prendas"}${bajoCosto.length <= 3 ? ` (${bajoCosto.map(nombreBajoCosto).join(", ")})` : ""}.` : null}
                quitadasFuera={quitadasFuera.length}
                caja={caja}
              />
            ) : (
              <EtiquetaColgada
                nombre={etiqueta.nombre}
                descuentoPct={etiqueta.descuentoPct}
                vigenteDesde={etiqueta.vigenteDesde}
                vigenteHasta={etiqueta.vigenteHasta}
                conCategorias={porCategoria.size > 0}
                colgada={colgada}
                caja={caja}
                vueloRef={vuelo}
                onCaben={setCaben}
                onVer={verEnLista}
              />
            )}
          </aside>

          {/* ---- Quién registra y los botones, siempre a la vista ---- */}
          <div className="eqp-pie space-y-2.5">
            {!enConfirmacion && (
              <p className="text-[12.5px] leading-snug text-tinta/75 max-md:hidden" aria-live="polite">
                {hayCambio ? textoCambio(cambio, productos, quitadasFuera.length) : "Todavía no cambias nada: marca o escanea prendas."}
              </p>
            )}
            <CampoGuiado id="responsable" guia={guia}>
              <ComboResponsable control={responsable} deshabilitado={guardando} />
            </CampoGuiado>
            {(enConfirmacion || hayCambio) && guia.faltan.length > 0 && <PieGuia guia={guia} />}
            <div className="pie-acciones">
              {enConfirmacion ? (
                <>
                  <Boton peso="fantasma" onClick={() => setConfirmando(false)} disabled={guardando}>
                    Volver
                  </Boton>
                  <Boton peso="primario" onClick={aplicar} cargando={guardando} textoCargando="Aplicando…" disabled={!responsable.listo} title={responsable.motivo ?? guia.frase ?? undefined} className={`flex-1 ${guia.claseConfirmar}`}>
                    Sí, aplicar
                  </Boton>
                </>
              ) : (
                <>
                  <Boton peso="fantasma" onClick={cerrar} disabled={guardando}>
                    Cancelar
                  </Boton>
                  <Boton
                    peso="primario"
                    className={`flex-1 ${guia.claseConfirmar}`}
                    disabled={!hayCambio || !listo || !responsable.listo}
                    title={!hayCambio ? "Marca, quita o escanea una prenda para aplicar." : (responsable.motivo ?? guia.frase ?? undefined)}
                    cargando={guardando}
                    textoCargando="Aplicando…"
                    onClick={() => (requiereRevision ? setConfirmando(true) : aplicar())}
                  >
                    {requiereRevision ? "Revisar y aplicar" : "Aplicar"}
                  </Boton>
                </>
              )}
            </div>
          </div>

          {camara && (
            <EscanerBusqueda
              titulo={`Escanear para «${etiqueta.nombre}»`}
              pista={modo === "poner" ? "Centra la etiqueta de la prenda: se marca sola" : "Centra la etiqueta: se le quita la etiqueta de campaña"}
              continuo={{ respuesta: leida, resumen: `${colgada.total} ${colgada.total === 1 ? "la lleva" : "la llevan"}` }}
              onCodigo={(codigo) => leerAhora.current(codigo)}
              onEscribir={() => {
                setCamara(false);
                buscador.current?.focus();
              }}
              onClose={() => setCamara(false)}
            />
          )}
        </div>
      )}
    </Modal>
  );
}

/** Lo último que se leyó: la prenda, qué pasó, el precio que tendrá en la caja y lo que se puede hacer al lado. */
function LecturaReciente({ leida, pct, onDeshacer, onOtras, deshabilitado }: { leida: Leida; pct: number | null; onDeshacer: () => void; onOtras: () => void; deshabilitado: boolean }) {
  const l = leida.lectura;
  const producto = "producto" in l ? l.producto : null;
  const precio = "variante" in l && l.tipo === "puesta" ? precioConCampana({ ...l.producto, variantes: [l.variante] }, pct) : null;
  return (
    <div key={leida.clave} data-tono={leida.tono} className="eqp-leida anim-revelar" role="status" aria-live="polite">
      {producto ? (
        <span data-leida-mini className="shrink-0">
          <MiniaturaPrenda fotoUrl={producto.fotoUrl ?? null} colorHex={"variante" in l ? (l.variante.colorHex ?? producto.colorHex) : producto.colorHex} {...categoriaDe(producto)} />
        </span>
      ) : (
        <ScanLine aria-hidden className="h-5 w-5 shrink-0 text-ambar" />
      )}
      <span className="min-w-0 flex-1">
        <span className="eqp-leida-estado block">{leida.estado}</span>
        <span className="block truncate text-sm font-medium text-tinta">{leida.titulo}</span>
        <span className="block truncate text-xs text-taupe">{leida.detalle}</span>
      </span>
      {precio && (
        <span className="hidden shrink-0 text-right tabular-nums leading-tight sm:block">
          <span className="block text-[11px] text-taupe line-through">{soles(precio.antes)}</span>
          <span className="block text-sm font-medium text-tinta">{precio.despues === 0 ? "Gratis" : soles(precio.despues)}</span>
        </span>
      )}
      <span className="flex shrink-0 items-center gap-2">
        {leida.otras.length > 0 && (
          <button type="button" onClick={onOtras} disabled={deshabilitado} className="btn-cayla btn-sutil btn-chico whitespace-nowrap">
            <span className="sm:hidden">+{leida.otras.length} {leida.otras.length === 1 ? "talla" : "tallas"}</span>
            <span className="max-sm:hidden">{leida.otras.length === 1 ? "Ponérsela a su otra talla" : `Ponérsela a sus otras ${leida.otras.length}`}</span>
          </button>
        )}
        {(l.tipo === "puesta" || l.tipo === "quitada") && (
          <BotonDeshacer onClick={onDeshacer} disabled={deshabilitado} title="Deshacer esta lectura" />
        )}
      </span>
    </div>
  );
}

/** Revisar antes de aplicar, en el lugar de la etiqueta: qué va a pasar en la caja y desde cuándo. */
function Revision({
  vista,
  vistaQuitar,
  bajoCosto,
  quitadasFuera,
  caja,
}: {
  vista: ReturnType<typeof vistaPrevia>;
  vistaQuitar: ReturnType<typeof vistaPreviaQuitar>;
  bajoCosto: string | null;
  quitadasFuera: number;
  caja: { antes: number; despues: number } | null;
}) {
  const conEfecto = vista?.sinEfectoHoy === false || vistaQuitar?.sinEfectoHoy === false;
  return (
    <div className="anim-revelar space-y-4 py-4 md:pt-5">
      <p className="label-cayla text-[10.5px] text-taupe">Antes de aplicar</p>
      {caja && (
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-xl border border-sand bg-papel p-3 text-center">
          <span>
            <span className="label-cayla block text-[10px] text-taupe">Hoy en caja</span>
            <span className="font-serif text-2xl font-semibold tabular-nums text-taupe line-through decoration-1">{soles(caja.antes)}</span>
          </span>
          <ChevronRight aria-hidden className="h-4 w-4 text-taupe" />
          <span>
            <span className="label-cayla block text-[10px] text-taupe">Con la etiqueta</span>
            <span className="font-serif text-2xl font-semibold tabular-nums">{soles(caja.despues)}</span>
          </span>
        </div>
      )}
      <div className={`space-y-3 rounded-xl border p-3.5 ${conEfecto ? "border-ambar/40 bg-ambar/10" : "border-sand bg-papel"}`}>
        {vista && (
          <div>
            <p className="text-sm font-medium text-tinta">{vista.titulo}</p>
            <p className="mt-1 text-sm text-tinta/75">{vista.detalle}</p>
            {bajoCosto && <p className="mt-2 text-sm text-ambar">{bajoCosto}</p>}
          </div>
        )}
        {vistaQuitar && (
          <div>
            <p className="text-sm font-medium text-tinta">{vistaQuitar.titulo}</p>
            <p className="mt-1 text-sm text-tinta/75">{vistaQuitar.detalle}</p>
          </div>
        )}
        {quitadasFuera > 0 && (
          <p className="text-xs text-tinta/65">
            Además se la quitarás a {quitadasFuera} {quitadasFuera === 1 ? "prenda que ya no se vende" : "prendas que ya no se venden"}.
          </p>
        )}
      </div>
    </div>
  );
}

/** El precio de la fila: tachado y con el de la campaña si la prenda lleva la etiqueta; solo, en tenue, si no. Marcar la casilla
 *  baja el precio a la vista, que es justo lo que va a pasar en la caja. */
function PrecioFila({ precio, lleva }: { precio: { antes: number; despues: number; desde: boolean }; lleva: boolean }) {
  const desde = precio.desde ? "desde " : "";
  if (!lleva) return <span className="shrink-0 text-right text-xs tabular-nums text-taupe">{desde}{soles(precio.antes)}</span>;
  return (
    <span className="shrink-0 text-right tabular-nums leading-tight">
      <span className="block text-[11px] text-taupe line-through">{soles(precio.antes)}</span>
      <span className="block text-sm text-tinta">{desde}{precio.despues === 0 ? "Gratis" : soles(precio.despues)}</span>
    </span>
  );
}

/** La casilla del sistema (`components/ui/Casilla.tsx`, ADR-0358 ronda 6) con los tres estados de un producto: todas, algunas
 *  (a medias) o ninguna. Desactivada cuando la prenda ya hereda la etiqueta por su categoría (no se toca). */
function Casilla({ estado, disabled, etiqueta, onChange }: { estado: "todas" | "algunas" | "ninguna"; disabled: boolean; etiqueta: string; onChange: () => void }) {
  return <CasillaSistema marcada={estado === "todas"} aMedias={estado === "algunas"} disabled={disabled} onCambio={onChange} etiqueta={etiqueta} />;
}
