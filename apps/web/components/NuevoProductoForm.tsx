"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { soltarPaginaEstable } from "@/components/ui/PaginaEstable";
import { CampoMonto, CampoTexto } from "@/components/ui/campos";
import { ArbolCategoria } from "@/components/alta-producto/ArbolCategoria";
import { ElegirEtiquetas } from "@/components/alta-producto/ElegirEtiquetas";
import { ElegirMuestra } from "@/components/alta-producto/ElegirMuestra";
import { ElegirTemporada } from "@/components/alta-producto/ElegirTemporada";
import { AtajosTallas, ElegirTallas } from "@/components/alta-producto/ElegirTallas";
import { ElegirMarcaProveedor } from "@/components/alta-producto/ElegirMarcaProveedor";
import { ConfigurarCategoria } from "@/components/alta-producto/ConfigurarCategoria";
import { ProductoCreado, type ResumenCreado } from "@/components/alta-producto/ProductoCreado";
import { AvisoInline, ChipOpcion, FilaAlta, PasoAlta, PlegableAlta } from "@/components/alta-producto/piezas";
import { ElegirColores } from "@/components/alta-producto/ElegirColores";
import type { FotoPendiente } from "@/components/alta-producto/FotosAlta";
import { MatrizVariantes } from "@/components/alta-producto/MatrizVariantes";
import { MatrizCantidades } from "@/components/alta-producto/MatrizCantidades";
import { FaltanDelPaso } from "@/components/alta-producto/guia";
import { ParecidasBajoNombre, PieConParecidas, RevisaParecidasDelPaso } from "@/components/alta-producto/ParecidasDelAlta";
import { RetencionLuzContexto } from "@/components/guia-de-foco/useRetenerLuz";
import { asegurarVisible, estaEscribiendo, useGuiaAlta } from "@/components/alta-producto/useGuiaAlta";
import { FichaPrevia, type PasoAvance } from "@/components/alta-producto/FichaPrevia";
import { IdentidadAltaProveedor, QuienRegistra, irAQuienRegistra } from "@/components/alta-producto/IdentidadAlta";
import { FAMILIAS_COLOR } from "@/lib/colores-familias";
import { useParecidasAlta } from "@/lib/useParecidasAlta";
import {
  camposDelAlta,
  campoAhora,
  estadosDeCampos,
  faltanDelPaso,
  faltanHastaElPaso,
  pasoConfirmado,
  resumenFaltan,
  siguienteDelHilo,
  type CampoAlta,
  type CampoGuia,
} from "@/lib/alta-producto-guia";
import { nombreTemporada, SIN_PROPIA } from "@/lib/temporada-reglas";
import { temporadaParaAlta } from "@/lib/temporada-ficha-reglas";
import { repartirEtiquetas, unirEtiquetas } from "@/lib/etiquetas-alta-reglas";
import { useResponsable } from "@/lib/useResponsable";
import { firmar } from "@/lib/responsable-reglas";
import { compararTallas } from "@/lib/tallas";
import { textoLoQueFalta } from "@/lib/marca-proveedor-reglas";
import { subirFotoProducto } from "@/lib/producto-fotos";
import { debeEncolarse } from "@/lib/error-escritura";
import { nombreEnCola, nuevaOperacion } from "@/lib/cola-offline";
import { useColaProductos } from "@/lib/useColaProductos";
import { useEnLinea } from "@/lib/useEnLinea";
import { guardarFotos } from "@/lib/fotos-pendientes";
import { ColaOfflineAviso } from "@/components/ColaOfflineAviso";
import { useSalidaSinGuardar } from "@/components/ui/useSalidaSinGuardar";
import { fotoFormulario } from "@/lib/salida-sin-guardar";
import {
  PASOS_ALTA,
  codigoBasePrevisto,
  construirCeldas,
  estadoSubidaSinConexion,
  faltaDelPaso as faltaDelPasoProblema,
  leerCantidad,
  leerErrorAlta,
  margenPorcentaje,
  nivelMargen,
  ordenarColores,
  ordenarFotosAlta,
  pasoAbrible,
  piePaso,
  problemasAlta,
  resumenStock,
  siguienteDelAlta,
  textoDestinoStock,
  textoTallas,
  tituloReferencia,
  type ColorAlta,
  type DestinoStock,
  type ResponsableAlta,
  type EstadoAlta,
  type PasoAlta as NumeroPaso,
} from "@/lib/alta-producto";
import type { ContextoAlta, EtiquetaAlta } from "@/lib/alta-producto-datos";
import type { EjesPorCategoria, ValorVocabulario } from "@/lib/catalogo-v2";
import { sugerirDescripcion, sugerirNombre } from "@/lib/sugerencias-alta-producto";

// "Nuevo producto" en 4 PREGUNTAS (spike v2 2026-09-28, docs/maquetas/producto-nuevo-v2-2026-09; antes 5 pasos, spike
// 2026-09-24, y antes 7 bloques, ADR-0109):
//   1 ¿A qué categoría pertenece? (familia → categoría) · 2 ¿Cómo es? (nombre, descripción, marca y proveedor, tejido,
//   patrón; temporada y etiquetas plegadas) · 3 ¿En qué tallas y colores? (tallas, colores y la tabla talla × color, con
//   la foto en la fila de su color) · 4 ¿Cuánto cuesta y cuántas hay? (precio, costo, la MISMA tabla con cantidades
//   —ADR-0212: la carga inicial de lo que ya está en tienda, en la misma transacción que el producto— y quién lo registra).
// Por qué así (README del spike v2): el paso «Cómo se hace» había crecido a 7 campos; cada color aparecía 4 veces (chips,
// casillas de fotos, tabla de variantes, tabla de stock); había tres marcadores de avance a la vez (barra de 5 segmentos,
// números del acordeón y la caja «Siguiente paso»); y tejido y patrón, que DESCRIBEN la prenda, vivían con sus variantes.
// Ahora tejido y patrón van con el nombre; la tabla se arma una vez (paso 3) y en el 4 se llena; y el único marcador de
// avance, además del acordeón, es la lista «Avance» bajo la ficha.
// TEMPORADA y ETIQUETAS van en «Temporada y etiquetas · opcional», a la vista al abrir el paso pero plegables (plegado, la
// línea dice lo elegido): son opcionales y casi nunca cambian entre prendas de una misma colección. Las etiquetas
// conservan su selector con dibujo por concepto (`ElegirEtiquetas`, ADR-0109 «Actualización b»); tejido y patrón, su foto
// o dibujo real (`contexto.imagenes`).
// Un solo paso abierto a la vez: el terminado se pliega en una línea con «Cambiar» y el que viene es una línea
// punteada. A la derecha, la prenda tal como va a quedar y la lista «Avance» (las 4 preguntas, tocables). En celular esa
// ficha baja a una barra pegada abajo con «Crear».
//
// Diseñado para que equivocarse sea difícil, no para avisar después:
//   * la categoría se elige con tarjetas (arrastra prefijo, tallas, tejidos) y al elegirla se pasa sola al paso 2;
//   * el nombre se comprueba contra el catálogo MIENTRAS se escribe;
//   * lo que la familia exige (Indumentaria: tejido y patrón) no se puede saltar;
//   * lo que viene marcado de antemano es la curva habitual de la categoría;
//   * «Seguir» no se apaga en silencio: al lado dice qué falta. Casi todo es obligatorio, así que se marca lo OPCIONAL
//     («Opcional · …») y el rojo queda para los errores.
//
// El alta es UNA transacción (`crear_producto_con_stock_inicial`, que envuelve a `crear_producto_con_variantes`): producto,
// variantes, etiquetas y el stock de hoy entran juntos o no entra nada. Las FOTOS se eligen en la tabla del paso 3 (en la
// fila de su color) pero se guardan en el navegador y se suben DESPUÉS de que la base creó el producto (ver `FotosAlta`):
// cancelar no deja archivos huérfanos, y si una foto no sube, el producto ya existe y la pantalla de éxito dice cuál
// falta. Las filas de `producto_fotos` se escriben directo: su política `producto_fotos_write_lider`
// (fn_puede_editar_catalogo) es la misma que exige esta pantalla.
//
// Al guardar NO se vuelve a la lista: aparece una pantalla de éxito con tres salidas — fotos, crear otro parecido,
// ir a productos. «Otro parecido» conserva categoría, marca, proveedor, tallas, tejido, patrón, temporada, precio, costo
// y etiquetas y limpia nombre, descripción, colores y fotos: una colección son 10 prendas casi iguales (y de la misma
// temporada, ADR-0246).
//
// El token de idempotencia nace con el formulario (useRef): si la red falla a
// mitad y se reintenta, la base devuelve el mismo producto y no crea un segundo.

const TITULOS: Record<NumeroPaso, string> = {
  1: "¿A qué categoría pertenece?",
  2: "¿Cómo es?",
  3: "¿En qué tallas y colores?",
  4: "¿Cuánto cuesta y cuántas hay?",
};

export function NuevoProductoForm({
  contexto,
  destino,
  puedeAprobarEtiquetas,
}: {
  contexto: ContextoAlta;
  destino: DestinoStock;
  /** Quien crea una etiqueta y la deja aprobada de una: líder o un rol con el módulo Etiquetas (`fn_puede_editar_etiquetas`). */
  puedeAprobarEtiquetas: boolean;
}) {
  const router = useRouter();
  const token = useRef<string>(crypto.randomUUID());

  // Copias locales: configurar una categoría o proponer un valor las modifica sin recargar la página.
  const [ejes, setEjes] = useState<EjesPorCategoria>(contexto.ejes);
  const [universo, setUniverso] = useState(contexto.universo);
  // Marcas, proveedores y vínculos: el selector se desmonta al plegar el paso 2 (y al ver la pantalla de éxito);
  // lo creado aquí adentro (una marca nueva, un proveedor nuevo) tiene que sobrevivir a eso.
  const [listasMarca, setListasMarca] = useState({ marcas: contexto.marcas, proveedores: contexto.proveedores, vinculos: contexto.vinculos });
  // Los colores creados AQUÍ («+ Nuevo color» del paso 3) se suman a los que trajo la página, igual que las etiquetas: si la
  // página se relee (`router.refresh()` al «crear otro parecido») y ya los trae, no se duplican.
  const [coloresNuevos, setColoresNuevos] = useState<ColorAlta[]>([]);
  const colores = useMemo(
    () => [...contexto.colores, ...coloresNuevos.filter((n) => !contexto.colores.some((c) => c.codigo === n.codigo))],
    [contexto.colores, coloresNuevos]
  );

  const [paso, setPaso] = useState<NumeroPaso>(1);
  // Los pasos que la persona ya abrió (ADR-0284): un paso lleva el ✓ solo si lo visitó. Antes bastaba con que no tuviera
  // problemas, y el 3 salía «Listo» sin abrirlo, con las tallas marcadas de antemano y cero colores.
  const [vistos, setVistos] = useState<Set<NumeroPaso>>(() => new Set([1]));
  const guia = useGuiaAlta();
  // El campo donde la persona está escribiendo ahora: conserva «Sigue aquí» hasta que sale de él (una letra del nombre ya lo da por
  // «hecho», pero la luz no puede saltar a media palabra). Lo informa cada `FilaAlta` por el foco; ver `useRetenerLuz`.
  const [escribiendoEn, setEscribiendoEn] = useState<CampoAlta | null>(null);
  const retencionLuz = useMemo(
    () => ({
      enfocar: (id: string) => setEscribiendoEn(id as CampoAlta),
      soltar: (id: string) => setEscribiendoEn((actual) => (actual === id ? null : actual)),
    }),
    []
  );
  const [categoriaId, setCategoriaId] = useState("");
  const [marcaId, setMarcaId] = useState("");
  const [proveedorId, setProveedorId] = useState("");
  const [marcaNombre, setMarcaNombre] = useState("");
  const [proveedorNombre, setProveedorNombre] = useState("");
  const [referencia, setReferencia] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [tallasElegidas, setTallasElegidas] = useState<string[]>([]);
  const [tejidoId, setTejidoId] = useState("");
  const [patronId, setPatronId] = useState("");
  // ADR-0246: opcional. Vacío (SIN_PROPIA) = sigue a su categoría; solo una elegida viaja como `p_temporada`.
  const [temporada, setTemporada] = useState(SIN_PROPIA);
  const [coloresElegidos, setColoresElegidos] = useState<string[]>([]);
  const [fotos, setFotos] = useState<FotoPendiente[]>([]);
  const [precioBase, setPrecioBase] = useState("");
  const [costoBase, setCostoBase] = useState("");
  const [costoTocado, setCostoTocado] = useState(false);
  const [excluidas, setExcluidas] = useState<Set<string>>(new Set());
  const [overridePrecio, setOverridePrecio] = useState<Record<string, string>>({});
  const [etiquetasElegidas, setEtiquetasElegidas] = useState<string[]>([]);
  // Las etiquetas creadas AQUÍ (campo «Etiquetas» del paso 2) se suman a las que trajo la página; si la página se relee
  // (`router.refresh()` al «crear otro parecido») y ya las trae, `unirEtiquetas` no las duplica.
  const [etiquetasNuevas, setEtiquetasNuevas] = useState<EtiquetaAlta[]>([]);
  const vocabEtiquetas = useMemo(() => unirEtiquetas(contexto.etiquetas, etiquetasNuevas), [contexto.etiquetas, etiquetasNuevas]);
  // Lo que alguien sin permiso de aprobar propuso desde el campo y espera a un líder: vive aquí (no en el campo) para que
  // sobreviva a plegar y abrir el paso 2 y no se ofrezca «Crear» otra vez algo que ya está propuesto.
  const [etiquetasPropuestas, setEtiquetasPropuestas] = useState<string[]>([]);
  // «Temporada y etiquetas · opcional» (paso 2) arranca ABIERTO (Felipe 2026-09-29): plegado se pasaba de largo y nadie
  // sabía que ahí se elige la temporada y las etiquetas. Sigue siendo plegable, y plegado la línea dice lo elegido.
  const [masAbierto, setMasAbierto] = useState(true);
  // Paso 4 (ADR-0212): lo que ya hay en tienda. `cantidades` por clave de celda («talla|color»), como lo tipeó la persona.
  const [cantidades, setCantidades] = useState<Record<string, string>>({});
  const [sinStock, setSinStock] = useState(false);
  // Colgadas en el piso o guardadas en el almacén. «Piso» solo si la tienda los separa y la cuenta puede bajar prendas
  // (la base hace la bajada con `bajar_al_piso`, que pide el módulo «Bajada al piso»): si no, van al almacén.
  // Arranca en almacén (Felipe 2026-09-28): colgar en el piso es la decisión que se toma a propósito, no la que se
  // hereda por no mirar la pregunta.
  const puedePiso = destino.separaPiso && destino.puedeBajar;
  const [alPiso, setAlPiso] = useState(false);
  const [cargando, setCargando] = useState(false);
  // Crear una prenda es Catálogo, operación de tienda (ADR-0161): firma quien está de turno. Quien abre el alta se identifica
  // UNA vez, arriba de los pasos (`QuienRegistra`), y esa identidad firma la prenda Y lo que se crea a mitad del formulario
  // (marca, talla, tejido, color… ver `useFirmaDeMitad`): ninguno pinta su propio combo (Felipe, 2026-09-29). Vive en el estado de
  // esta pantalla: al salir del alta se acaba, y «Crear otro parecido» la conserva (sigue siendo la misma persona).
  // La tienda es la misma donde entra el stock de hoy: la base exige que el responsable esté presente AHÍ.
  // El paso 4 («Quién lo registra») solo repite el nombre, con «Cambiar»; la ficha repite qué falta.
  const responsable = useResponsable({ ubicacionId: destino.ubicacionId, etiqueta: destino.etiqueta });
  const responsableAlta: ResponsableAlta = { listo: responsable.listo, faltaElegir: responsable.estado === "falta", motivo: responsable.motivo };
  const quienRegistra = responsable.lista.elegibles.find((p) => p.personaId === responsable.elegidoId)?.nombre ?? null;
  const colaOffline = useColaProductos();
  const enLinea = useEnLinea();
  const [creado, setCreado] = useState<ResumenCreado | null>(null);
  /** Nombre del producto del que se copió al elegir «crear otro parecido»: se muestra hasta el próximo guardado. */
  const [copiadoDe, setCopiadoDe] = useState<string | null>(null);

  // «¿Salir sin guardar?» (2026-09-28). Nuevo producto no guarda borrador: salir a medias pierde TODO lo llenado. La foto
  // junta lo que la persona eligió (no el paso abierto ni lo que se creó a mitad del alta —una marca, una talla—, que ya
  // está en la base). Con el producto creado no hay nada que perder; tras «crear otro parecido» vuelve a preguntar, porque
  // lo copiado también se perdería. La foto de apertura es la del formulario vacío.
  const fotoActual = fotoFormulario({
    categoriaId, marcaId, proveedorId, referencia, descripcion, tallasElegidas, tejidoId, patronId, temporada,
    coloresElegidos, fotos: fotos.map((f) => f.clave), precioBase, costoBase, excluidas: [...excluidas].sort(),
    overridePrecio, etiquetasElegidas, cantidades, sinStock, alPiso,
  });
  const [fotoAlAbrir] = useState(fotoActual);
  const salida = useSalidaSinGuardar(
    !creado && fotoActual !== fotoAlAbrir,
    "Llenaste parte de este producto nuevo y todavía no se creó. Si sales ahora, se pierde lo que llenaste."
  );

  const categoria = contexto.categorias.find((c) => c.id === categoriaId) ?? null;
  const familia = categoria ? (contexto.familias.find((f) => f.codigo === categoria.familia) ?? null) : null;
  const exige = Boolean(familia?.exigeTejidoPatron);
  // Lo que decide los ejemplos de esta pantalla (skill `/sugerir`): la categoría elegida en el paso 1 y su familia.
  const contextoSugerencia = { familia: categoria?.familia ?? null, prefijo: categoria?.prefijo ?? null };

  const tallasCategoria = useMemo(
    () => [...(ejes.tallas[categoriaId] ?? [])].sort((a, b) => compararTallas(a.texto, b.texto)),
    [ejes.tallas, categoriaId]
  );
  const tejidosCategoria = ejes.tejidos[categoriaId] ?? [];
  const patronesCategoria = ejes.patrones[categoriaId] ?? [];
  const habituales = ejes.habituales[categoriaId] ?? [];
  // La temporada de la categoría ELEGIDA: es lo que hereda la prenda si no se elige otra (ADR-0246).
  const listaTemporadas = contexto.temporadas?.lista ?? [];
  const temporadaCategoria = nombreTemporada(listaTemporadas, contexto.temporadas?.porCategoria[categoriaId]);
  // Las elegidas en el orden de la curva (S, M, L), no en el orden en que se tocaron.
  const tallasOrdenadas = tallasCategoria.filter((t) => tallasElegidas.includes(t.id));

  const nombreFinal = tituloReferencia(referencia);
  // Lo elegido en tejido y patrón, en palabras: lo usa la comparación con las prendas que ya existen, la ficha y la línea del paso plegado.
  const tejidoTexto = [...tejidosCategoria, ...universo.tejidos].find((t) => t.id === tejidoId)?.texto ?? null;
  const patronTexto = [...patronesCategoria, ...universo.patrones].find((t) => t.id === patronId)?.texto ?? null;

  // ---------- ¿ya existe algo así? (la base frena; «Prendas parecidas» avisa y ordena) ----------
  // Devuelve lo mismo que devolvía `useParecidos` (con su espera de 350 ms al tipear) y suma la alerta del resumen, la hoja «Ver y comparar» y el
  // pie del paso 2. El candado (`hayIdentico`, `hayUnaLetra`, `confirmo`) sigue saliendo de lo que dice la base: ver `lib/parecidas-alta-estado.ts`.
  const parecidos = useParecidasAlta({
    nombre: nombreFinal,
    descripcion,
    tejido: tejidoTexto,
    patron: patronTexto,
    categoriaId,
    categoriaNombre: categoria?.nombre ?? null,
    marcaId,
    marcaNombre,
    enLinea,
  });
  const comprobandoNombre = Boolean(categoriaId) && parecidos.comprobando;
  const confirmo = parecidos.confirmo;

  function irAPaso(n: NumeroPaso) {
    setPaso(n);
    setVistos((prev) => (prev.has(n) ? prev : new Set(prev).add(n)));
  }

  // El paso que se abre queda a la vista: el anterior se acaba de plegar y la página se acortó.
  //
  // Cambiar de paso es un cambio de VISTA, no un bloque que se encogió, así que primero se suelta <PaginaEstable>
  // (ADR-0185) —antes de pintar, igual que el ticket del Punto de Venta—. Sin esto, el 2026-09-26 «Seguir al precio»
  // dejaba la pantalla en blanco: el paso 3 (con sus fotos) se plegaba, PaginaEstable veía la página acortarse
  // mientras la persona estaba abajo, reservaba ese alto como aire y devolvía la vista al fondo de golpe, cortando el
  // desplazamiento hacia el paso 4. El formulario seguía ahí arriba, pero en pantalla solo se veía el aire.
  const pasoPrevio = useRef(paso);
  useLayoutEffect(() => {
    if (pasoPrevio.current === paso) return;
    pasoPrevio.current = paso;
    soltarPaginaEstable();
    const reducido = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Al título del paso (la sección lleva `scroll-mt-24`, así que queda bajo la cabecera). Con «nearest», elegir la categoría dejaba
    // el paso 2 con su título cortado arriba y el campo «Nombre» pegado al borde (prueba con una trabajadora, 2026-09-29).
    requestAnimationFrame(() =>
      document.getElementById(`paso-${paso}`)?.closest("section")?.scrollIntoView({ block: "start", behavior: reducido ? "auto" : "smooth" }),
    );
  }, [paso]);

  // ---------- elegir / cambiar categoría ----------
  function elegirCategoria(id: string) {
    setCategoriaId(id);
    setTallasElegidas(ejes.habituales[id] ?? []); // la curva habitual viene marcada
    setTejidoId("");
    setPatronId("");
    setExcluidas(new Set());
    setOverridePrecio({});
    setCantidades({});
    // Mientras la persona no haya escrito un costo, el que hay es el sugerido de la categoría ANTERIOR: al cambiar, se
    // reemplaza por el de la nueva o se vacía. Dejarlo sería guardar el costo de una blusa como el de un bolso.
    if (!costoTocado) {
      const sugerido = contexto.costoSugerido[id];
      setCostoBase(sugerido ? sugerido.costo.toFixed(2) : "");
    }
    // Elegir la categoría es UNA decisión: se pasa solo al paso 2 (los demás pasos tienen su «Seguir»).
    irAPaso(2);
  }

  function cambiarCategoria() {
    setCopiadoDe(null);
    setCategoriaId("");
    setTallasElegidas([]);
    setTejidoId("");
    setPatronId("");
    setExcluidas(new Set());
    setOverridePrecio({});
  }

  function alternarColor(codigo: string) {
    if (coloresElegidos.includes(codigo)) {
      // Quitar un color se lleva sus fotos: una foto de un color que el producto no tiene no se ve en ninguna parte.
      const suyas = fotos.filter((f) => f.colorCodigo === codigo);
      suyas.forEach((f) => URL.revokeObjectURL(f.vista));
      if (suyas.length) setFotos((prev) => prev.filter((f) => f.colorCodigo !== codigo));
      setColoresElegidos((prev) => prev.filter((x) => x !== codigo));
    } else {
      setColoresElegidos((prev) => [...prev, codigo]);
    }
  }

  // «+ Nuevo color» desde el alta (spike v2): antes había que ir a Catálogo → Atributos en otra pestaña y volver a
  // «actualizar los colores». El color creado entra a la lista y queda elegido.
  function colorCreado(color: ColorAlta) {
    setColoresNuevos((prev) => (prev.some((c) => c.codigo === color.codigo) ? prev : [...prev, color]));
    setColoresElegidos((prev) => (prev.includes(color.codigo) ? prev : [...prev, color.codigo]));
  }

  // ---------- al configurar una categoría o proponer un valor sin salir del alta ----------
  // Es el `onOfrecido` de ElegirTallas y ElegirMuestra: el valor ya quedó ofrecido en la categoría (desde su hoja «Ver
  // todos» o propuesto nuevo) y aquí SOLO se suma a la fila y al universo. Elegirlo no es cosa de este paso: ElegirMuestra
  // llama después a `onElegir(id)` y ElegirTallas a `onElegidas(lista completa)`. Idempotente: un reintento tras un fallo
  // no lo duplica.
  function ofrecerValor(tipo: "tallas" | "tejidos" | "patrones", valor: ValorVocabulario) {
    setEjes((prev) => {
      const actuales = prev[tipo][categoriaId] ?? [];
      return actuales.some((v) => v.id === valor.id) ? prev : { ...prev, [tipo]: { ...prev[tipo], [categoriaId]: [...actuales, valor] } };
    });
    setUniverso((prev) => (prev[tipo].some((v) => v.id === valor.id) ? prev : { ...prev, [tipo]: [...prev[tipo], valor] }));
  }

  function categoriaConfigurada(tipo: "tallas" | "tejidos" | "patrones", elegidos: ValorVocabulario[]) {
    setEjes((prev) => ({
      ...prev,
      [tipo]: { ...prev[tipo], [categoriaId]: elegidos },
      ...(tipo === "tallas" ? { habituales: { ...prev.habituales, [categoriaId]: elegidos.map((v) => v.id) } } : {}),
    }));
    if (tipo === "tallas") setTallasElegidas(elegidos.map((v) => v.id));
  }

  // ---------- tabla de variantes (barato de calcular: a lo sumo ~20 celdas) ----------
  const celdas = construirCeldas(
    tallasOrdenadas.map((t) => t.id),
    coloresElegidos
  );
  const celdasIncluidas = celdas.filter((c) => !excluidas.has(c.clave));
  const stock = resumenStock(
    cantidades,
    celdasIncluidas.map((c) => c.clave)
  );
  const destinoTexto = textoDestinoStock(destino.etiqueta, puedePiso && alPiso, destino.separaPiso);

  // ---------- qué falta ----------
  const estado: EstadoAlta = {
    categoriaId,
    referencia,
    comprobandoNombre,
    nombreBloqueado: parecidos.hayIdentico,
    nombreSinConfirmar: parecidos.hayUnaLetra && !confirmo,
    categoriaSinTallas: Boolean(categoriaId) && tallasCategoria.length === 0,
    tallasElegidas: tallasElegidas.length,
    exigeTejidoPatron: exige,
    hayTejidosEnCategoria: tejidosCategoria.length > 0,
    hayPatronesEnCategoria: patronesCategoria.length > 0,
    tejidoId,
    patronId,
    celdasIncluidas: celdasIncluidas.length,
    precioBase,
    costoBase,
    stockTotal: stock.total,
    stockInvalidas: stock.invalidas,
    sinStock,
  };
  const problemas = problemasAlta(estado);
  const puedeGuardar = problemas.length === 0 && !cargando;

  // «El hilo» (ADR-0284): cada campo, hecho / sigue aquí / falta / opcional. Sale de los mismos datos que `problemasAlta`.
  const campos = camposDelAlta(estado, {
    coloresElegidos: coloresElegidos.length,
    descripcionEscrita: descripcion.trim() !== "",
    marcaElegida: Boolean(marcaId && proveedorId),
    responsableListo: responsable.listo,
  });
  const est = estadosDeCampos(campos, paso, escribiendoEn);
  const ahoraCampo = campoAhora(campos, paso, escribiendoEn);
  const hilo = siguienteDelHilo(campos);

  // Lleva a la persona a un campo, sea de este paso o de otro (abre el paso y, cuando lo pinta, la lleva).
  function irACampo(c: CampoGuia) {
    // «Quién registra» se elige UNA vez, arriba de los pasos (`QuienRegistra`); la fila del paso 4 solo lo muestra. El botón lleva a
    // donde se elige, desde cualquier paso y sin abrir ninguno.
    if (c.id === "responsable") return irAQuienRegistra();
    if (c.paso !== paso) {
      guia.irCuandoAbra(c.id);
      irAPaso(c.paso);
      return;
    }
    guia.ir(c.id);
  }

  // Al abrir un paso: si lo primero que pide es una caja de texto vacía (el nombre, el precio), el cursor queda ahí. Y al
  // completar un campo, si el que sigue quedó fuera de la vista, se le trae con suavidad. Un paso que se abre para revisarlo
  // (todo hecho) no mueve el foco.
  const guiaPrevia = useRef({ paso, ahora: ahoraCampo });
  useEffect(() => {
    const previa = guiaPrevia.current;
    guiaPrevia.current = { paso, ahora: ahoraCampo };
    if (previa.paso !== paso) {
      if (ahoraCampo === "nombre" || ahoraCampo === "precio") guia.irCuandoAbra(ahoraCampo, { destello: false, sinPisar: true });
      guia.alAbrirPaso();
      return;
    }
    // Nunca se desplaza la página mientras la persona teclea: al escribir el nombre, «Sigue aquí» pasa de la marca al tejido
    // (el tinte se mueve) pero la vista no salta. Se prueba con el foco, no con la tecla: sirve igual con teclado, lector o
    // pantalla táctil.
    if (ahoraCampo && previa.ahora !== ahoraCampo && !estaEscribiendo()) asegurarVisible(ahoraCampo);
  }, [paso, ahoraCampo, guia]);

  function estadoPaso(n: NumeroPaso): "abierto" | "hecho" | "pendiente" {
    if (n === paso) return "abierto";
    // ✓ solo si la persona ya abrió el paso y no le falta nada (ADR-0284); ver `pasoConfirmado`.
    return pasoConfirmado({ paso: n, abierto: paso, vistos, problemas }) ? "hecho" : "pendiente";
  }

  const precioNum = Number(precioBase);
  const costoNum = Number(costoBase);
  const margen = costoBase.trim() === "" ? null : margenPorcentaje(precioNum, costoNum);
  const nivel = nivelMargen(margen);
  const sugerido = categoriaId ? contexto.costoSugerido[categoriaId] : undefined;

  // Sin fila de «más usados» (Felipe, 2026-09-28): los colores se eligen buscándolos o en la carta por familia.
  const { grupos } = useMemo(() => ordenarColores(colores, contexto.usoColores[categoriaId] ?? {}, FAMILIAS_COLOR), [colores, contexto.usoColores, categoriaId]);
  const colorPorCodigo = (cod: string) => colores.find((c) => c.codigo === cod);
  const coloresDatos = coloresElegidos.map((cod) => colorPorCodigo(cod)).filter((c): c is NonNullable<typeof c> => Boolean(c));

  // ---------- código previsto ----------
  const base = codigoBasePrevisto(categoria?.prefijo ?? null, categoria?.prefijo ? (contexto.correlativos[categoria.prefijo] ?? 0) : null);

  // Las etiquetas de campaña que ya rigen sobre esta categoría se aplican solas: elegirlas a mano sería redundante y las
  // dejaría duplicadas en cada variante. Si la persona eligió una y DESPUÉS cambió a una categoría que la cubre, no se manda.
  const { cubiertas: campanasQueAplican } = repartirEtiquetas(vocabEtiquetas, { categoriaId });
  const etiquetasAManda = etiquetasElegidas.filter((id) => {
    const et = vocabEtiquetas.find((x) => x.id === id);
    return et ? !campanasQueAplican.some((c) => c.id === et.id) : false;
  });

  const nombresEtiquetas = etiquetasAManda.map((id) => vocabEtiquetas.find((e) => e.id === id)?.nombre).filter((n): n is string => Boolean(n));

  const fotosOrdenadas = ordenarFotosAlta(fotos, coloresElegidos);

  // ---------- guardar ----------
  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!puedeGuardar) {
      // No debería pasar (el botón está apagado y Enter en un campo no envía), pero un envío programático llegaría hasta acá.
      avisar.error(problemas[0]?.texto ?? "Falta completar el formulario.");
      return;
    }
    if (!responsable.listo) {
      if (responsable.motivo) avisar.error(responsable.motivo);
      return;
    }
    const costo = costoBase.trim() === "" ? 0 : costoNum;
    const variantes = celdasIncluidas.map((c) => {
      const o = overridePrecio[c.clave];
      const precio = o !== undefined && o !== "" ? Number(o) : precioNum;
      // Solo viaja la cantidad de la celda que tiene stock: sin la clave, la base no carga nada (y no inventa un cero).
      const cantidad = leerCantidad(cantidades[c.clave] ?? "") ?? 0;
      return { talla_id: c.tallaId, color_codigo: c.color, precio, costo, ...(cantidad > 0 ? { cantidad } : {}) };
    });
    if (variantes.some((v) => !Number.isFinite(v.precio) || v.precio < 0)) {
      avisar.error("Una de las celdas tiene un precio inválido.");
      return;
    }
    const conStock = stock.total > 0;

    // Dos altas sin red con el mismo nombre: la segunda la rechazaría la base al subir. Mejor decirlo ahora.
    if (nombreEnCola(colaOffline.cola, nombreFinal)) {
      avisar.error(`«${nombreFinal}» ya está guardado sin conexión en este equipo, esperando subir.`, { enfocar: "nombre-producto" });
      return;
    }

    setCargando(true);
    const supabase = createClient();
    const params = {
      p_referencia: nombreFinal,
      p_categoria_id: categoriaId,
      p_variantes: variantes,
      p_descripcion: descripcion.trim() || undefined,
      p_token: token.current,
      p_tejido_id: tejidoId || undefined,
      p_patron_id: patronId || undefined,
      p_confirmo_distinto: confirmo,
      // Solo si se eligió una: sin la clave, la base (aun la que todavía no tiene el SQL de temporadas) crea igual.
      p_temporada: temporadaParaAlta(temporada),
      p_etiqueta_ids: etiquetasAManda.length > 0 ? etiquetasAManda : undefined,
      // Pueden faltar (ADR-0283): sin la clave, el producto nace sin marca o sin proveedor y se completa al editarlo.
      p_marca_id: marcaId || undefined,
      p_proveedor_id: proveedorId || undefined,
      // Paso 4 (ADR-0212): la tienda y el destino solo viajan si hay stock que cargar.
      p_ubicacion_id: conStock ? destino.ubicacionId : undefined,
      p_al_piso: conStock && puedePiso && alPiso,
    };
    const firma = responsable.firma();
    const { data: productoId, error, status } = await firmar(supabase.rpc("crear_producto_con_stock_inicial", params), firma);

    // Sin red (ADR-0210, paso 2): el alta entra a la cola con su token y la hora de ahora. El código y el de barras los
    // pone la base al subir (nunca el navegador); las fotos esperan en IndexedDB y suben después del producto.
    if (error && debeEncolarse(error, status)) {
      // Con stock, la carga firma con el responsable (`fn_actor_persona_id`): al subir, la base tiene que mirar si estaba de
      // turno a la HORA DEL ALTA (`x-momento`, como la venta sin conexión), no a la hora en que volvió la red. Sin esto, un
      // alta hecha a las 7 p. m. que sube al día siguiente se rechazaría porque la persona ya marcó su salida.
      const firmaCola = conStock ? responsable.firma(new Date().toISOString()) : firma;
      const op = nuevaOperacion({
        token: token.current,
        rpc: "crear_producto_con_stock_inicial",
        params,
        firma: firmaCola,
        resumen: `${nombreFinal} · ${variantes.length} variante${variantes.length === 1 ? "" : "s"}${conStock ? ` · ${stock.total} u.` : ""} · ${categoria?.nombre ?? ""}`,
      });
      if (!colaOffline.encolar(op)) {
        setCargando(false);
        avisar.error("Se cortó el internet y este navegador no pudo guardar el producto.", { detalle: "El formulario sigue lleno: vuelve a crear cuando regrese la conexión." });
        return;
      }
      const fotosGuardadas = await guardarFotos(
        token.current,
        nombreFinal,
        fotosOrdenadas.map((f) => ({ archivo: f.archivo, original: f.original, colorCodigo: f.colorCodigo })),
      );
      fotos.forEach((f) => URL.revokeObjectURL(f.vista));
      setFotos([]);
      setCargando(false);
      setCopiadoDe(null);
      avisar.aviso("Producto guardado sin conexión", { detalle: "Recibe su código cuando vuelva el internet." });
      setCreado({
        id: null,
        nombre: nombreFinal,
        categoria: `${familia?.nombre ?? ""} › ${categoria?.nombre ?? ""}`,
        variantes: variantes.length,
        colores: coloresDatos.filter((c) => celdasIncluidas.some((x) => x.color === c.codigo)),
        fotos: { subidas: 0, fallidas: fotosGuardadas ? [] : fotosOrdenadas.map((f) => `${f.archivo.name}: este navegador no pudo guardarla`), coloresConFoto: [] },
        stock: conStock ? { unidades: stock.total, donde: destinoTexto } : null,
        sinMarcaProveedor: textoLoQueFalta(marcaId, proveedorId),
        fotosEnEspera: fotosGuardadas ? fotosOrdenadas.length : 0,
        token: op.token,
      });
      return;
    }
    // Solo si la base rechazó por el responsable (ya no está presente…) se suelta y se relee la lista. Si salió bien NO: la
    // identidad se conserva para «Crear otro parecido» (Felipe, 2026-09-29) y se acaba al salir de la pantalla.
    if (error) responsable.despues(error);

    if (error || !productoId) {
      setCargando(false);
      const lectura = leerErrorAlta(error);
      if (lectura.tipo !== "otro") {
        // Otra persona creó el mismo nombre mientras esta llenaba el formulario: se muestra en el paso 2, no solo en un aviso.
        parecidos.reintentar();
        irAPaso(2);
        avisar.error(lectura.mensaje, { enfocar: "nombre-producto" });
        return;
      }
      avisar.error(traducirError(error, "crear el producto"));
      return;
    }

    // El producto YA existe. Recién ahora suben las fotos: una que falle no deshace nada, se dice en la pantalla de éxito.
    const fallidas: string[] = [];
    const conFoto = new Set<string>();
    let subidas = 0;
    if (fotosOrdenadas.length > 0) {
      const filas: { producto_id: string; url: string; orden: number; es_principal: boolean; color_codigo: string | null }[] = [];
      for (const f of fotosOrdenadas) {
        const r = await subirFotoProducto(supabase, f.archivo, f.original);
        if ("error" in r) {
          fallidas.push(`${f.archivo.name}: ${r.error}`);
          continue;
        }
        // La principal es la primera que SÍ subió (si la del primer color falló, la toma la siguiente).
        filas.push({ producto_id: productoId, url: r.url, orden: filas.length, es_principal: filas.length === 0, color_codigo: f.colorCodigo });
      }
      if (filas.length > 0) {
        const { error: errFotos } = await supabase.from("producto_fotos").insert(filas);
        if (errFotos) fallidas.push(traducirError(errFotos, "guardar las fotos"));
        else {
          subidas = filas.length;
          filas.forEach((f) => f.color_codigo && conFoto.add(f.color_codigo));
        }
      }
      fotos.forEach((f) => URL.revokeObjectURL(f.vista));
      setFotos([]);
    }
    setCargando(false);

    setCopiadoDe(null);
    setCreado({
      id: productoId,
      nombre: nombreFinal,
      categoria: `${familia?.nombre ?? ""} › ${categoria?.nombre ?? ""}`,
      variantes: variantes.length,
      // Solo los colores que quedaron en alguna variante: uno desmarcado en la tabla no necesita foto.
      colores: coloresDatos.filter((c) => celdasIncluidas.some((x) => x.color === c.codigo)),
      fotos: { subidas, fallidas, coloresConFoto: [...conFoto] },
      stock: conStock ? { unidades: stock.total, donde: destinoTexto } : null,
      sinMarcaProveedor: textoLoQueFalta(marcaId, proveedorId),
    });
  }

  // «Crear otro parecido»: conserva lo que casi seguro se repite y limpia lo que casi seguro cambia.
  function otroParecido() {
    if (!creado) return;
    setCopiadoDe(creado.nombre);
    setCreado(null);
    setReferencia("");
    setDescripcion("");
    parecidos.reiniciar();
    setColoresElegidos([]);
    setExcluidas(new Set());
    setOverridePrecio({});
    // Las cantidades son de ESA prenda: la parecida se cuenta de nuevo. Dónde están (piso o almacén) sí se conserva.
    setCantidades({});
    setSinStock(false);
    setCostoTocado(true); // el costo ya es el de la prenda anterior: no volver a sugerir encima
    token.current = crypto.randomUUID(); // un producto nuevo es una operación nueva, no un reintento
    // El correlativo del código previsto ya cambió (y un color creado aquí ya viene en la lista). Sin red NO se relee: la relectura
    // fallaría y Next caería a una navegación completa, que sin internet deja la pestaña en blanco.
    if (creado.id) router.refresh();
    // Los colores y las cantidades son de la prenda nueva: los pasos 3 y 4 vuelven a estar por visitar.
    setVistos(new Set([1, 2]));
    setPaso(2);
    setTimeout(() => document.getElementById("nombre-producto")?.focus(), 50);
  }

  const etiquetaNivel = { negativo: "Pierdes dinero en cada venta", bajo: "Margen bajo", normal: "Buen margen" } as const;

  if (creado) {
    // Un alta guardada sin conexión se sigue en la cola: la pantalla cambia sola cuando sube (o si la base la rechaza).
    const enCola = creado.token ? colaOffline.cola.find((o) => o.token === creado.token) : undefined;
    const subida = estadoSubidaSinConexion({ token: creado.token, descartado: creado.descartado, enCola });
    // Descartar también la saca de la cola: se anota aparte para que la pantalla no la lea como «subió».
    const descartar = (tokenOp: string) => {
      colaOffline.descartar(tokenOp);
      if (tokenOp === creado.token) setCreado((c) => (c ? { ...c, descartado: true } : c));
    };
    return (
      <div className="space-y-4">
        {subida === "rechazada" && <ColaOfflineAviso cola={colaOffline.cola} onDescartar={descartar} uno="prenda nueva" varias="prendas nuevas" />}
        <ProductoCreado creado={creado} onOtroParecido={otroParecido} subida={subida} />
      </div>
    );
  }

  // ---------- la línea de cada paso plegado (y de la lista «Avance» de la ficha) ----------
  const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;
  // Lo que dice «Temporada y etiquetas · opcional» plegado: solo lo que se eligió a propósito.
  const resumenMas =
    [temporada !== SIN_PROPIA ? nombreTemporada(listaTemporadas, temporada) : null, nombresEtiquetas.length ? plural(nombresEtiquetas.length, "etiqueta", "etiquetas") : null]
      .filter(Boolean)
      .join(", ") || null;
  const resumen: Record<NumeroPaso, string> = {
    1: categoria ? `${familia?.nombre ?? ""} › ${categoria.nombre}` : "",
    2: [nombreFinal, marcaNombre, tejidoTexto, patronTexto].filter(Boolean).join(" · "),
    // «26–42 (9) · 8 colores · 68 variantes · 7 fotos»: con muchas tallas se leen primera–última y cuántas.
    3: tallasOrdenadas.length
      ? [
          textoTallas(tallasOrdenadas.map((t) => t.texto)),
          coloresElegidos.length ? plural(coloresElegidos.length, "color", "colores") : "sin color",
          plural(celdasIncluidas.length, "variante", "variantes"),
          fotos.length ? plural(fotos.length, "foto", "fotos") : null,
        ]
          .filter(Boolean)
          .join(" · ")
      : "",
    4: [
      precioNum > 0 ? `S/ ${precioNum.toFixed(2)}` : null,
      stock.total > 0 ? `${plural(stock.total, "unidad", "unidades")} · ${destinoTexto}` : sinStock ? "Sin stock todavía" : null,
    ]
      .filter(Boolean)
      .join(" · "),
  };

  const ejesActuales = (sin?: "tallas" | "tejidos" | "patrones") => ({
    tallaIds: sin === "tallas" ? [] : tallasCategoria.map((t) => t.id),
    tejidoIds: sin === "tejidos" ? [] : tejidosCategoria.map((t) => t.id),
    patronIds: sin === "patrones" ? [] : patronesCategoria.map((t) => t.id),
  });

  // ---------- el pie de cada paso: qué falta, o la acción que lo cierra ----------
  const textoCrear = cargando ? (fotos.length > 0 ? "Creando y subiendo fotos…" : "Creando…") : "Crear producto";
  function pie(n: NumeroPaso) {
    if (n === 1) return undefined; // elegir la categoría ya pasa al paso 2
    const { texto: textoBase, listo: listoBase } = piePaso(problemas, n, responsableAlta);
    // Con algo por hacer (aunque solo sea una sugerencia, los colores) el pie no dice «Listo»: lo dice «Falta: …», tocable.
    const faltan = faltanHastaElPaso(campos, n);
    // «Revisa: 2 parecidas · Ver» (solo el paso 2): lo que conviene mirar antes de seguir. No es una falta ni apaga «Seguir» (ese `disabled` sigue siendo
    // solo `faltaDelPasoProblema`); solo le quita el pulso de «ya puedes seguir» y el «Listo».
    const revisa = n === 2 ? parecidos.pieRevisa : null;
    const listo = listoBase && faltan.length === 0 && !revisa;
    // Lo que lee el lector de pantalla cuando «Falta: …» está a la vista: por qué «Crear» espera, o qué hay por revisar.
    const texto = n === 2 ? (parecidos.motivoBloqueo ?? revisa ?? textoBase) : textoBase;
    const accion =
      n < 4 ? (
        <button
          type="button"
          onClick={() => irAPaso((n + 1) as NumeroPaso)}
          disabled={Boolean(faltaDelPasoProblema(problemas, n))}
          className={`btn-cayla btn-primario ${listo ? "hilo-seguir" : ""}`}
        >
          Seguir →
        </button>
      ) : (
        // El paso 4 cierra el alta: aquí termina la persona, así que aquí está «Crear» (la ficha conserva el suyo).
        <button
          type="submit"
          disabled={!puedeGuardar || !responsable.listo}
          title={responsable.motivo ?? undefined}
          className={`btn-cayla btn-primario ${listo && !cargando ? "hilo-seguir" : ""}`}
        >
          {textoCrear}
        </button>
      );
    const faltanTocables = faltan.length > 0 ? <FaltanDelPaso faltan={faltan} ahora={ahoraCampo} onIr={irACampo} /> : undefined;
    return {
      texto,
      listo,
      accion,
      faltan: revisa ? <PieConParecidas faltan={faltanTocables} revisa={<RevisaParecidasDelPaso texto={revisa} onVer={() => parecidos.abrirHoja()} />} /> : faltanTocables,
    };
  }

  function cuerpo(n: NumeroPaso) {
    if (n === 1) {
      return (
        <div className="space-y-3">
          <p className="text-[13px] text-taupe">
            Con la categoría, el sistema ya sabe el código, las tallas y los tejidos que suele llevar. Al tocarla pasas solo al siguiente paso.
          </p>
          <ArbolCategoria familias={contexto.familias} categorias={contexto.categorias} categoriaId={categoriaId} onElegir={elegirCategoria} onCambiar={cambiarCategoria} />
        </div>
      );
    }
    if (n === 2) {
      const ayudaOpcional = (texto: string) => (exige ? texto : `Opcional · ${texto}`);
      return (
        <div>
          {/* Marca y proveedor va ARRIBA del nombre (Felipe, 2026-09-30): con la marca elegida la lectura de lo que ya existe de esa marca empieza antes de que
              se escriba una letra, y al teclear el nombre la alerta ya tiene con qué comparar. Sigue siendo OPCIONAL y la guía no la señala: «Sigue aquí»
              va al nombre, que es lo primero que falta. */}
          <FilaAlta etiqueta="Marca y proveedor" ayuda="Quién la hace y quién te la trae · opcional" campo="marca" estado={est.marca}>
            <ElegirMarcaProveedor
              opcional
              sugerencias={false}
              marcas={listasMarca.marcas}
              proveedores={listasMarca.proveedores}
              vinculos={listasMarca.vinculos}
              onListas={setListasMarca}
              usosCategoria={contexto.parejasPorCategoria[categoriaId] ?? []}
              categoriaNombre={categoria?.nombre}
              nombresIniciales={marcaId || proveedorId ? { marca: marcaNombre, proveedor: proveedorNombre } : undefined}
              marcaId={marcaId}
              proveedorId={proveedorId}
              onElegir={(m, p, nombres) => {
                setMarcaId(m);
                setProveedorId(p);
                setMarcaNombre(nombres.marca);
                setProveedorNombre(nombres.proveedor);
              }}
              puedeCrear
            />
          </FilaAlta>
          <FilaAlta etiqueta="Nombre" ayuda="Como se lo dirías a un cliente" campo="nombre" estado={est.nombre}>
            <div className="space-y-2">
              <CampoTexto
                id="nombre-producto"
                etiqueta="Nombre"
                caja
                className="!h-12 text-base"
                placeholder={sugerirNombre(contextoSugerencia).texto}
                value={referencia}
                onChange={(e) => setReferencia(e.target.value)}
                autoComplete="off"
                pie={
                  nombreFinal && nombreFinal !== referencia.trim() ? (
                    <span>
                      Se guardará como <strong className="text-tinta">{nombreFinal}</strong>
                    </span>
                  ) : undefined
                }
              />
              <ParecidasBajoNombre p={parecidos.bajoNombre} />
            </div>
          </FilaAlta>
          <FilaAlta etiqueta="Descripción" ayuda="Opcional · lo que no dice el nombre: corte, largo, detalles" campo="descripcion" estado={est.descripcion}>
            <CampoTexto etiqueta="Descripción" caja placeholder={sugerirDescripcion(contextoSugerencia).texto} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
          </FilaAlta>

          {/* Tejido y patrón describen la prenda: van aquí, con el nombre y la marca (spike v2), no con sus variantes. */}
          {(exige || tejidosCategoria.length > 0) && (
            <FilaAlta etiqueta="Tejido" ayuda={ayudaOpcional("De qué tela es")} campo="tejido" estado={est.tejido}>
              {tejidosCategoria.length === 0 && categoria ? (
                <ConfigurarCategoria
                  tipo="tejidos"
                  categoriaId={categoriaId}
                  categoriaNombre={categoria.nombre}
                  universo={universo.tejidos}
                  ejesActuales={ejesActuales("tejidos")}
                  motivoExtra={`${familia?.nombre} exige tejido.`}
                  onGuardado={(el) => categoriaConfigurada("tejidos", el)}
                />
              ) : (
                <ElegirMuestra
                  key={categoriaId}
                  tipo="tejidos"
                  deLaCategoria={tejidosCategoria}
                  universo={universo.tejidos}
                  imagenes={contexto.imagenes.tejidos}
                  elegidoId={tejidoId}
                  onElegir={setTejidoId}
                  categoriaId={categoriaId}
                  categoriaNombre={categoria?.nombre ?? "esta categoría"}
                  familia={categoria?.familia}
                  ejesActuales={ejesActuales()}
                  onOfrecido={(v) => ofrecerValor("tejidos", v)}
                />
              )}
            </FilaAlta>
          )}

          {(exige || patronesCategoria.length > 0) && (
            <FilaAlta etiqueta="Patrón" ayuda={ayudaOpcional("El dibujo de la tela. Si no tiene, elige Liso")} campo="patron" estado={est.patron}>
              {patronesCategoria.length === 0 && categoria ? (
                <ConfigurarCategoria
                  tipo="patrones"
                  categoriaId={categoriaId}
                  categoriaNombre={categoria.nombre}
                  universo={universo.patrones}
                  ejesActuales={ejesActuales("patrones")}
                  motivoExtra={`${familia?.nombre} exige patrón.`}
                  onGuardado={(el) => categoriaConfigurada("patrones", el)}
                />
              ) : (
                <ElegirMuestra
                  key={categoriaId}
                  tipo="patrones"
                  deLaCategoria={patronesCategoria}
                  universo={universo.patrones}
                  imagenes={contexto.imagenes.patrones}
                  elegidoId={patronId}
                  onElegir={setPatronId}
                  categoriaId={categoriaId}
                  categoriaNombre={categoria?.nombre ?? "esta categoría"}
                  familia={categoria?.familia}
                  ejesActuales={ejesActuales()}
                  onOfrecido={(v) => ofrecerValor("patrones", v)}
                />
              )}
            </FilaAlta>
          )}

          <PlegableAlta titulo="Temporada y etiquetas" resumen={resumenMas} abierto={masAbierto} onAlternar={() => setMasAbierto((v) => !v)}>
            <FilaAlta
              etiqueta="Temporada"
              ayuda={`Sin año: el sistema lo sabe por la fecha en que llega. Si eliges «Ninguna», usa la de su categoría${temporadaCategoria ? ` (${temporadaCategoria})` : ""}.`}
            >
              {contexto.temporadas ? (
                <ElegirTemporada temporadas={listaTemporadas} clave={temporada} onElegir={setTemporada} />
              ) : (
                <p className="text-xs text-taupe">
                  La lista de temporadas no está disponible ahora (todavía no se activa, o no se pudo leer). Podrás ponerla después, desde la ficha del
                  producto.
                </p>
              )}
            </FilaAlta>
            <FilaAlta
              etiqueta="Etiquetas"
              ayuda={`Para buscar y agrupar${nombresEtiquetas.length ? ` · ${plural(nombresEtiquetas.length, "elegida", "elegidas")}` : ""}`}
            >
              <ElegirEtiquetas
                etiquetas={vocabEtiquetas}
                categoriaId={categoriaId}
                elegidas={etiquetasElegidas}
                onElegidas={setEtiquetasElegidas}
                puedeAprobar={puedeAprobarEtiquetas}
                enLinea={enLinea}
                onCreada={(e) => setEtiquetasNuevas((prev) => [...prev, e])}
                propuestas={etiquetasPropuestas}
                onPropuesta={(nombre) => setEtiquetasPropuestas((prev) => [...prev, nombre])}
              />
            </FilaAlta>
          </PlegableAlta>
        </div>
      );
    }
    if (n === 3) {
      return (
        <div>
          <FilaAlta
            etiqueta="Tallas"
            campo="tallas"
            estado={est.tallas}
            retiene="fila"
            ayuda={categoria && tallasCategoria.length > 0 ? `${categoria.nombre} ofrece ${plural(tallasCategoria.length, "talla", "tallas")}` : undefined}
            accion={
              tallasCategoria.length > 0 ? (
                <AtajosTallas deLaCategoria={tallasCategoria} universo={universo.tallas} elegidas={tallasElegidas} onElegidas={setTallasElegidas} habituales={habituales} />
              ) : undefined
            }
          >
            {tallasCategoria.length === 0 && categoria ? (
              <ConfigurarCategoria
                tipo="tallas"
                categoriaId={categoriaId}
                categoriaNombre={categoria.nombre}
                universo={universo.tallas}
                ejesActuales={ejesActuales("tallas")}
                onGuardado={(el) => categoriaConfigurada("tallas", el)}
              />
            ) : (
              <ElegirTallas
                key={categoriaId}
                deLaCategoria={tallasCategoria}
                universo={universo.tallas}
                elegidas={tallasElegidas}
                onElegidas={setTallasElegidas}
                habituales={habituales}
                categoriaId={categoriaId}
                categoriaNombre={categoria?.nombre ?? "esta categoría"}
                familia={categoria?.familia}
                ejesActuales={ejesActuales()}
                onOfrecido={(v) => ofrecerValor("tallas", v)}
                sinAtajos
              />
            )}
          </FilaAlta>

          <FilaAlta
            etiqueta="Colores"
            campo="colores"
            estado={est.colores}
            retiene="fila"
            ayuda={coloresElegidos.length ? plural(coloresElegidos.length, "elegido", "elegidos") : "Si no tiene color (un llavero, un cuaderno), déjalo vacío"}
          >
            <ElegirColores colores={colores} grupos={grupos} elegidos={coloresElegidos} onAlternar={alternarColor} onCreado={colorCreado} />
          </FilaAlta>

          {/* La prenda: una fila por color (con su foto) y una columna por talla. En el paso 4 es la MISMA tabla, con números. */}
          <div className="border-t border-sand pt-3.5">
            {tallasCategoria.length > 0 && tallasElegidas.length === 0 ? (
              <AvisoInline tono="neutro">Elige al menos una talla y aquí aparece la prenda: una fila por color, una columna por talla.</AvisoInline>
            ) : (
              <MatrizVariantes
                celdas={celdas}
                tallas={tallasOrdenadas.map((t) => ({ id: t.id, texto: t.texto }))}
                colores={coloresDatos}
                excluidas={excluidas}
                onExcluidas={setExcluidas}
                fotos={fotos}
                onFotos={setFotos}
                disabled={cargando}
              />
            )}
          </div>
        </div>
      );
    }
    // Paso 4: tres filas guiadas (ADR-0284) —precio y costo, las unidades de hoy, quién lo registra—. Antes eran tres bloques
    // sueltos y nada decía que «cuántas hay hoy» (o «todavía no tengo») era una decisión obligatoria.
    return (
      <div>
        <FilaAlta etiqueta="Precio y costo" ayuda="El costo es opcional" campo="precio" estado={est.precio}>
          <div className="grid gap-4 sm:grid-cols-3">
            <CampoMonto etiqueta="Precio de venta" pie="Para todas las tallas y colores" inputMode="decimal" placeholder="0.00" value={precioBase} onChange={(e) => setPrecioBase(e.target.value)} />
            <CampoMonto
              etiqueta="Costo"
              pie={sugerido && !costoTocado ? `Sugerido: el último en ${categoria?.nombre} (${sugerido.referencia})` : "Opcional"}
              inputMode="decimal"
              placeholder="0.00"
              value={costoBase}
              onChange={(e) => {
                setCostoTocado(true);
                setCostoBase(e.target.value);
              }}
            />
            <div>
              <p className="label-cayla text-[11px] text-tinta/65">Margen</p>
              <p
                className={`font-display mt-1.5 pb-1 text-[1.75rem] leading-none tabular-nums ${
                  margen === null ? "text-tinta/25" : nivel === "negativo" ? "text-rojo-profundo" : nivel === "bajo" ? "text-ambar" : "text-verde"
                }`}
              >
                {margen === null ? "—" : `${margen.toFixed(0)} %`}
              </p>
              <p className="mt-1 text-xs text-taupe">{margen === null ? "Con el costo, se calcula" : nivel ? etiquetaNivel[nivel] : ""}</p>
            </div>
          </div>
          {nivel === "negativo" && (
            <div className="mt-3">
              <AvisoInline tono="rojo" alerta>
                Con este precio pierdes dinero en cada venta.
              </AvisoInline>
            </div>
          )}
        </FilaAlta>

        {/* La tabla del paso 3, ahora con números: cuántas hay hoy (ADR-0212) o, en su segmento, el precio distinto. */}
        <FilaAlta etiqueta="Unidades de hoy" ayuda={`Lo que ya tienes en ${destino.etiqueta}. Si no tienes, márcalo abajo`} campo="stock" estado={est.stock}>
          <div className="space-y-5">
            <MatrizCantidades
              celdas={celdas}
              tallas={tallasOrdenadas.map((t) => ({ id: t.id, texto: t.texto }))}
              colores={coloresDatos}
              excluidas={excluidas}
              cantidades={cantidades}
              onCantidad={(clave, valor) => {
                setCantidades((prev) => ({ ...prev, [clave]: valor }));
                if (valor !== "" && valor !== "0") setSinStock(false); // escribir una cantidad responde la pregunta
              }}
              precioBase={precioBase}
              precios={overridePrecio}
              onPrecio={(clave, valor) => setOverridePrecio((prev) => ({ ...prev, [clave]: valor }))}
              destinoEtiqueta={destino.etiqueta}
            />

            {stock.total > 0 ? (
              destino.separaPiso && (
                <div className="space-y-2">
                  <p className="text-[12.5px] font-semibold text-tinta">¿Dónde están?</p>
                  <div className="flex flex-wrap gap-1.5">
                    <ChipOpcion elegido={!puedePiso || !alPiso} onClick={() => setAlPiso(false)}>
                      Guardadas en el almacén
                    </ChipOpcion>
                    <ChipOpcion elegido={puedePiso && alPiso} onClick={() => setAlPiso(true)} disabled={!puedePiso}>
                      En piso de venta
                    </ChipOpcion>
                  </div>
                  {!puedePiso && (
                    <p className="text-xs text-taupe">
                      Entran al almacén. Para colgarlas después, usa «Bajar al piso» en Existencias (tu rol necesita el módulo «Bajada al piso»).
                    </p>
                  )}
                </div>
              )
            ) : (
              <ChipOpcion elegido={sinStock} onClick={() => setSinStock((v) => !v)}>
                Todavía no tengo unidades de este producto
              </ChipOpcion>
            )}

            <p className="nota-cayla text-[12.5px]">
              Es la <strong>carga inicial</strong>: entra al inventario de {destino.etiqueta} sin comprobante y queda en Movimientos como «Carga
              inicial». Lo que llegue después se registra al recibirlo.
            </p>
          </div>
        </FilaAlta>

        {/* Quién firma el alta (ADR-0161): se elige UNA vez, arriba de los pasos (`QuienRegistra`); aquí, donde la persona
            termina, solo se ve a nombre de quién va a quedar, con la salida para cambiarlo. */}
        <FilaAlta etiqueta="Quién lo registra" ayuda="Queda a su nombre en el historial" campo="responsable" estado={est.responsable}>
          <p className="flex flex-wrap items-center gap-x-2 text-[14px]">
            {quienRegistra ? <b className="font-semibold text-tinta">{quienRegistra}</b> : <span className="text-taupe">Todavía nadie</span>}
            <button type="button" onClick={irAQuienRegistra} disabled={cargando} className="btn-cayla btn-enlace text-[12.5px]">
              {quienRegistra ? "Cambiar" : "Elegir"}
            </button>
          </p>
        </FilaAlta>
      </div>
    );
  }

  // La lista «Avance» de la ficha: cada pregunta con su resumen (contestada), lo que le falta (abierta) o «—» (todavía no
  // se llega). Se toca para volver a una; la que no se alcanza no responde.
  const avance: PasoAvance[] = PASOS_ALTA.map((n) => {
    const e = estadoPaso(n);
    const abrible = e !== "pendiente" || pasoAbrible(problemas, n);
    const pieN = n === 1 ? null : piePaso(problemas, n, responsableAlta);
    // Lo que falta, con los nombres de los campos («Faltan: marca y proveedor, tejido»); un paso que aún no se abrió y ya viene
    // armado dice «Por revisar» en vez de un ✓ que nadie se ganó.
    // Con UNA cosa por hacer, la frase de siempre («Elige el tejido.», «Comprobando que el nombre no exista todavía…»): dice qué hacer.
    // Con varias, la lista de lo que falta. Una sugerencia sola (colores) se dice como «Por revisar».
    const faltasN = faltanDelPaso(campos, n);
    const faltanN = faltasN.length > 1 || (faltasN.length === 1 && !faltasN[0].requerido) ? resumenFaltan(faltasN) : null;
    // En el paso 2, lo que hay por mirar de «Prendas parecidas» (candado > parecidas) va antes que «Faltan: …»: lo que falta ya se repite en el pie y en
    // cada campo, y lo parecido solo se dice aquí y en la alerta. Un paso ya ✓ sigue diciendo su resumen: mirar parecidas no le quita el ✓.
    const texto =
      e === "hecho"
        ? resumen[n] || "Listo"
        : n === 2 && abrible && parecidos.resumenAvance
          ? parecidos.resumenAvance
          : e === "abierto"
            ? (faltanN ?? (pieN && !pieN.listo ? pieN.texto : (faltaDelPasoProblema(problemas, n) ?? "Listo")))
            : abrible
              ? (faltanN ?? (faltaDelPasoProblema(problemas, n) ?? "Por revisar"))
              : "—";
    return { numero: n, titulo: TITULOS[n], estado: e, texto, abrible };
  });

  return (
    <IdentidadAltaProveedor control={responsable}>
      <RetencionLuzContexto.Provider value={retencionLuz}>
        <form
          onSubmit={onSubmit}
          // Crear un producto es un acto explícito: Enter dentro de un campo (corregir el nombre con todo ya lleno, cerrar un
          // precio) NO lo envía. Sin esto, con el resto completo, un Enter de costumbre habría creado una prenda que no se borra.
          onKeyDown={(e) => {
            if (e.key === "Enter" && e.target instanceof HTMLInputElement) e.preventDefault();
          }}
          className="space-y-4"
        >
          {/* Sin barra de pasos arriba (spike v2): el avance se lee en el acordeón y en la lista «Avance» de la ficha. */}
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
            <div className="min-w-0 space-y-2.5">
              <QuienRegistra control={responsable} deshabilitado={cargando} />
              <ColaOfflineAviso cola={colaOffline.cola} onDescartar={colaOffline.descartar} uno="prenda nueva" varias="prendas nuevas" />
              {/* Sin red se puede crear el producto (sube solo), pero no lo que se crea A MITAD del alta: cada uno es su propia
                  operación y el producto necesitaría su id. Decirlo antes evita llenar un paso para chocar al final. */}
              {!enLinea && (
                <AvisoInline tono="ambar">
                  <strong>Sin conexión.</strong> Puedes crear el producto: queda en este equipo y recibe su código al subir. Lo que necesita internet: crear una
                  marca, un proveedor, una talla, un tejido, un patrón, un color o una etiqueta nuevos, y comprobar si el nombre ya existe (la base lo vuelve a
                  revisar al subir).
                </AvisoInline>
              )}
              {copiadoDe && (
                <AvisoInline tono="neutro">
                  Empiezas desde <strong>{copiadoDe}</strong>: mantuve la categoría, la marca y el proveedor, las tallas, el tejido, el patrón, la
                  temporada, el precio, el costo y las etiquetas. Cambia lo que sea distinto.
                </AvisoInline>
              )}
              {PASOS_ALTA.map((n) => (
                <PasoAlta key={n} numero={n} titulo={TITULOS[n]} estado={estadoPaso(n)} resumen={resumen[n]} onAbrir={() => irAPaso(n)} pie={pie(n)}>
                  {cuerpo(n)}
                </PasoAlta>
              ))}
            </div>

            <FichaPrevia
              datos={{
                nombre: nombreFinal,
                codigo: categoria ? base : null,
                categoria: categoria ? `${familia?.nombre ?? ""} › ${categoria.nombre}` : null,
                marca: marcaId ? marcaNombre || null : null,
                tejido: tejidoTexto,
                variantes: categoria && tallasElegidas.length > 0 ? celdasIncluidas.length : null,
                hoy: stock.total > 0 ? stock.total : sinStock ? 0 : null,
                precio: precioNum > 0 ? precioNum : null,
                margen,
                colores: coloresDatos.map((c) => ({ codigo: c.codigo, hex: c.hex })),
                foto: fotosOrdenadas[0]?.vista ?? null,
                fotos: fotos.length,
                avance,
                siguiente: siguienteDelAlta(problemas, responsableAlta),
                guia: hilo ? { texto: hilo.campo.pendiente, nombre: hilo.campo.nombre, bloquea: hilo.bloquea, onIr: () => irACampo(hilo.campo) } : null,
              }}
              cargando={cargando}
              onCancelar={() => salida.pedirSalir("/productos")}
              onAbrirPaso={irAPaso}
              parecidas={parecidos.ficha}
            />
          </div>
          {salida.aviso}
        </form>
      </RetencionLuzContexto.Provider>
    </IdentidadAltaProveedor>
  );
}
