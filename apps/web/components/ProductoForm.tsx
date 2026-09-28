"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { esVersionCambiada, traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { MuestraPatron } from "@/components/MuestraPatron";
import { MuestraTejido } from "@/components/MuestraTejido";
import { Boton, Campo, CampoSelect, CampoTexto, Interruptor, Segmentado } from "@/components/ui/campos";
import { ComboBuscable } from "@/components/ui/ComboBuscable";
import { BarraFija } from "@/components/ui/BarraFija";
import { useSalidaSinGuardar } from "@/components/ui/useSalidaSinGuardar";
import { compararTallas } from "@/lib/tallas";
import type { EjesPorCategoria, ImagenesMuestra, ProductoDetalle, ValorVocabulario } from "@/lib/catalogo-v2";
import { FotosProducto, type FotoLocal } from "@/components/FotosProducto";
import { AvisoParecidos } from "@/components/alta-producto/AvisoParecidos";
import { ElegirMarcaProveedor } from "@/components/alta-producto/ElegirMarcaProveedor";
import { claveReferencia, leerErrorAlta, tituloReferencia, type ColorAlta } from "@/lib/alta-producto";
import type { CatalogoMarcas } from "@/lib/marcas-datos";
import { useParecidos } from "@/lib/use-parecidos";
import { ComboResponsable } from "@/components/ComboResponsable";
import { useResponsable } from "@/lib/useResponsable";
import { firmar } from "@/lib/responsable-reglas";
import { nombreTemporada, opcionesTemporada, SIN_PROPIA } from "@/lib/temporada-reglas";
import {
  cambiosTemporadaPorColor,
  coloresConVariantesActivas,
  coloresSinTemporadaConocida,
  MIN_COLORES_PARA_TEMPORADA_POR_COLOR,
  ofrecerTemporadaPorColor,
  temporadaHeredadaPorColor,
} from "@/lib/temporada-ficha-reglas";
import {
  anclarFotos,
  asignacionesDeEtiquetas,
  avisoBloqueSinAplicar,
  conUnReintentoSiChoca,
  consolidar,
  correccionesSinAplicar,
  corregida,
  elegirTemporada,
  esChoqueDeCandados,
  filasDeProducto,
  FRASE_CHOQUE_DE_CANDADOS,
  fotosComoSeVen,
  hayCambiosVariantes,
  marcarEtiquetasGuardadas,
  moverTemporadas,
  mudanzasAlGuardar,
  NACEN_SIN_UNIDADES,
  payloadVariantes,
  problemasVariantes,
  resumenDeCambios,
  ubicar,
  ubicarTemporadas,
  type CampoBloque,
  type EstadoVariante,
  type FilaFicha,
  type NombresFicha,
  type TemporadaElegida,
} from "@/lib/variantes-ficha-reglas";
import { VariantesFicha } from "@/components/ficha-producto/VariantesFicha";
import type { ContextoFicha } from "@/components/ficha-producto/piezas";

/* ====================================================================
   ProductoForm · edición de producto+variantes (V2, 2026-09-15)

   Usado solo por /productos/[id]/editar — el alta vive en
   NuevoProductoForm.tsx (la rama de alta que quedaba acá era código muerto
   y se retiró junto con `catalogo_crear_producto`, ADR-0109).

   VARIANTES (ADR-0257, 2026-09-28). La sección vive en
   `components/ficha-producto/` y sus reglas en `lib/variantes-ficha-reglas.ts`:
   la prenda se ve por ejes como en el alta, y CORREGIR («se registró mal»:
   conserva id, stock, historia; el código se recalcula y el viejo sigue
   sonando) es otro gesto que AGREGAR («llegó un color o una talla»). Este
   archivo solo orquesta: guarda las filas, mueve con el color las fotos y la
   temporada (lo mismo que hace la base al corregir), y guarda todo en UN
   gesto. Reemplaza a D-133 (color, talla y código de solo lectura) y al SKU
   sugerido por fila: el alta ya no pide SKU y la ficha tampoco; el que ya
   tenía una variante se conserva y no se muestra.

   ETIQUETAS POR VARIANTE (2026-09-17, ADR-0095). Se guardan en la MISMA
   acción que el resto del formulario — nunca un botón de guardar aparte (dos
   formas de guardar en el mismo formulario ya costaron un bug real). Desde
   ADR-0257 también las de las variantes NUEVAS: tras el guardado principal se
   leen sus ids (por su combinación, única en la prenda) y viajan en la misma
   llamada a `actualizar_variantes_etiquetas`.

   TEMPORADA (2026-09-26, ADR-0246). Se elige de la lista cerrada; vacío =
   hereda. Si la prenda tiene 2 o más colores (o uno solo que ya tenga la suya
   guardada), cada color puede tener la suya, que se guarda después del
   guardado principal con UNA llamada a `asignar_temporadas` y solo con los
   colores que cambiaron. Sin la lista en la base (SQL sin pegar), la ficha lo
   dice y manda la temporada tal como la leyó.
   ==================================================================== */

type Categoria = { id: string; nombre: string; prefijo: string | null; exigeTejidoPatron: boolean };

const ESTADOS = [
  { valor: "activo", texto: "Activo" },
  { valor: "descontinuado", texto: "Descontinuado" },
] as const;

/** Lo de la prenda (sin sus variantes) contra lo que se decide si hay algo sin guardar. */
type DatosFicha = {
  referencia: string;
  categoriaId: string;
  descripcion: string;
  estado: string;
  stockMinimo: string;
  temporada: string;
  permitirVentaSinStock: boolean;
  tejidoId: string;
  patronId: string;
  marcaId: string;
  proveedorId: string;
  fotos: string;
};

const ROTULO_DATO: Record<Exclude<keyof DatosFicha, "fotos">, string> = {
  referencia: "nombre",
  categoriaId: "categoría",
  descripcion: "descripción",
  estado: "estado",
  stockMinimo: "stock mínimo",
  temporada: "temporada",
  permitirVentaSinStock: "venta sin stock",
  tejidoId: "tejido",
  patronId: "patrón",
  marcaId: "marca y proveedor",
  proveedorId: "marca y proveedor",
};

const firmaFotos = (fotos: readonly FotoLocal[]) => JSON.stringify(fotos.map((f) => [f.id, f.url, f.esPrincipal, f.colorCodigo]));

/** Una foto de la ficha con su color de ORIGEN (ADR-0257): la que se ve y viaja sale de `fotosComoSeVen`. */
type FotoFicha = FotoLocal & { fijo?: boolean };

export function ProductoForm({
  categorias,
  colores,
  usoColores,
  ejes,
  imagenes,
  etiquetas,
  avisoEtiquetas,
  marcas,
  estadoVariantes,
  esLider,
  puedeCorregir = true,
  producto,
  volverA = "/productos",
}: {
  categorias: Categoria[];
  /** Vocabulario de colores activo, con familia y sinónimos (lo mismo que ve el alta). */
  colores: ColorAlta[];
  /** color → cuántas variantes de la categoría lo usan: los más usados salen primero al agregar un color. */
  usoColores: Record<string, number>;
  /** Tallas/tejidos/patrones ofrecidos, por categoría (20260917100400). */
  ejes: EjesPorCategoria;
  /** La imagen elegida en Atributos para cada tejido y patrón (ADR-0256); sin ella, el dibujo automático. */
  imagenes: ImagenesMuestra;
  /** Vocabulario de etiquetas aprobado+activo, para aplicar a una variante. */
  etiquetas: ValorVocabulario[];
  /** Una línea bajo el selector de etiquetas (ADR-0161 P4: a quien no es líder, que las de descuento no se le ofrecen). */
  avisoEtiquetas?: string;
  /** Marcas, proveedores y parejas registradas (ADR-0109). */
  marcas: CatalogoMarcas;
  /** Stock y ventas por variante (`fn_variantes_estado`). `null` = no está en la base: la ficha sigue sin stock. */
  estadoVariantes: Record<string, EstadoVariante> | null;
  /** Para anticipar la regla de D-136 (una variante vendida la corrige solo un líder). La base la vuelve a exigir. */
  esLider: boolean;
  /** La base sabe corregir el color y la talla de una variante (tiene el SQL de ADR-0257). Sin eso la ficha no ofrece
   *  corregir: una base vieja ignora la corrección pero SÍ guarda las fotos que se movieron con ella. La página la
   *  calcula siempre (`esFuncionAusente` sobre `fn_variantes_estado`); sin pasarla, se asume que sí. */
  puedeCorregir?: boolean;
  /** Presente = modo edición. */
  producto?: ProductoDetalle;
  /** Adónde va al guardar o cancelar: la Tabla o Grilla de Productos de donde se salió, con sus filtros. */
  volverA?: string;
}) {
  const router = useRouter();
  const editando = !!producto;

  const [categoriaId, setCategoriaId] = useState(producto?.categoriaId ?? "");
  const [referencia, setReferencia] = useState(producto?.referencia ?? "");
  const [descripcion, setDescripcion] = useState(producto?.descripcion ?? "");
  const [estado, setEstado] = useState<(typeof ESTADOS)[number]["valor"]>(producto?.estado ?? "activo");
  const [stockMinimo, setStockMinimo] = useState(producto?.stockMinimo != null ? String(producto.stockMinimo) : "");
  const [temporada, setTemporada] = useState(producto?.temporada ?? SIN_PROPIA);
  // ADR-0246: la lista y lo que ya estaba guardado al abrir. `null` = la base todavía no la tiene (SQL sin pegar).
  const temporadas = producto?.temporadas ?? null;
  // color → clave de su temporada propia; un color sin entrada sigue a su prenda. `porColorBase` es lo que hay en la base
  // (al abrir, y tras cada guardado bueno); `temporadaEditada`, solo lo que la persona eligió a mano, anclado a su color
  // de ORIGEN. Lo que se ve y contra qué se compara se DERIVA de las dos y de las correcciones pendientes (más abajo).
  const [porColorBase, setPorColorBase] = useState<Record<string, string>>(() => temporadas?.porColor ?? {});
  const [temporadaEditada, setTemporadaEditada] = useState<TemporadaElegida[]>([]);
  const [permitirVentaSinStock, setPermitirVentaSinStock] = useState(producto?.permitirVentaSinStock ?? false);
  const [tejidoId, setTejidoId] = useState(producto?.tejidoId ?? "");
  const [patronId, setPatronId] = useState(producto?.patronId ?? "");
  const [marcaId, setMarcaId] = useState(producto?.marcaId ?? "");
  const [proveedorId, setProveedorId] = useState(producto?.proveedorId ?? "");
  // Cada foto con su color de ORIGEN: el guardado, o el que se le puso a mano (ADR-0257). La que se ve es `fotosVista`.
  const [fotos, setFotos] = useState<FotoFicha[]>(
    () =>
      producto?.fotos.map((f) => ({
        clientKey: f.id ?? `${f.url}-${Math.random()}`,
        id: f.id,
        url: f.url,
        esPrincipal: f.esPrincipal,
        colorCodigo: f.colorCodigo,
      })) ?? []
  );

  // ---------- cómo se llaman los colores y las tallas (también los que ya no están en el vocabulario activo) ----------
  const tallaPorId = useMemo(() => {
    const m = new Map<string, string>();
    for (const lista of Object.values(ejes.tallas)) for (const t of lista) m.set(t.id, t.texto);
    for (const v of producto?.variantes ?? []) if (v.tallaId && v.talla && !m.has(v.tallaId)) m.set(v.tallaId, v.talla);
    return m;
  }, [ejes.tallas, producto]);
  const nombres: NombresFicha = useMemo(
    () => ({
      color: (c) => (c === null ? "Sin color" : (colores.find((x) => x.codigo === c)?.nombre ?? producto?.variantes.find((v) => v.colorCodigo === c)?.color ?? c)),
      talla: (t) => (t === null ? "" : (tallaPorId.get(t) ?? "")),
    }),
    [colores, producto, tallaPorId]
  );

  const [filas, setFilas] = useState<FilaFicha[]>(() => (producto ? filasDeProducto(producto.variantes, nombres) : []));
  // Fotos y temporada siguen al color como las va a dejar la base al guardar (`mudanzasAlGuardar`), calculado SIEMPRE
  // desde lo guardado y desde el color de ORIGEN de cada cosa: nada se mueve gesto a gesto, así «Deshacer» una
  // corrección devuelve todo a su lugar (fotos guardadas, fotos nuevas y temporada elegida a mano).
  const mudanzas = useMemo(() => mudanzasAlGuardar(filas), [filas]);
  const porColorGuardado = useMemo(() => moverTemporadas(porColorBase, mudanzas), [porColorBase, mudanzas]);
  const temporadaUbicada = useMemo(() => ubicarTemporadas(temporadaEditada, mudanzas, porColorBase), [temporadaEditada, mudanzas, porColorBase]);
  const temporadaColor = useMemo(() => ({ ...porColorGuardado, ...temporadaUbicada }), [porColorGuardado, temporadaUbicada]);
  const fotosVista = useMemo(() => fotosComoSeVen(fotos, mudanzas), [fotos, mudanzas]);
  // La subida de una foto termina después de un `await`: se ancla con las filas de ESE momento, no con las de cuando empezó.
  const filasRef = useRef(filas);
  useEffect(() => {
    filasRef.current = filas;
  }, [filas]);
  const [loading, setLoading] = useState(false);
  // ADR-0193 (edición simultánea): la versión de la prenda cuando se abrió la ficha. Viaja en cada guardado; si otra
  // persona guardó entre medio, la base rechaza (PT409) en vez de pisar sus precios. Tras un guardado bueno se toma la
  // versión que devuelve la base, para que reintentar solo las etiquetas no choque consigo mismo.
  const versionRef = useRef<number | null>(producto?.version ?? null);
  const [versionCambiada, setVersionCambiada] = useState(false);
  // Se guardó lo principal pero no se pudo leer cómo quedaron las variantes: reintentar crearía las nuevas dos veces.
  const [hayQueRecargar, setHayQueRecargar] = useState(false);
  // Lo que el guardado principal YA hizo (correcciones aplicadas, variantes creadas) hasta que el guardado termina
  // completo: si fallan las etiquetas o la temporada y se reintenta, el aviso final igual ofrece reimprimir etiquetas y
  // dice que las nuevas nacieron sin unidades (tras consolidar, las filas ya no lo recuerdan).
  const logrado = useRef({ correcciones: false, nuevas: 0 });
  // Un monto escrito en «Cambiar en bloque» sin pulsar Aplicar: se perdería en silencio al guardar lo demás.
  const [bloquePendiente, setBloquePendiente] = useState<CampoBloque | null>(null);
  // Quien no ve el dinero recibe el costo vacío (null, 20260923193700): la ficha no muestra el campo y la base no lo toca
  // al guardar (`catalogo_actualizar_producto`). Un producto sin variantes todavía no dice nada: se muestra el campo.
  const veCosto = !producto || producto.variantes.length === 0 || producto.variantes.some((v) => v.costo !== null);
  // Editar una prenda es Catálogo, operación de tienda (ADR-0161): quien está de turno firma el guardado (las llamadas
  // de «Guardar cambios» van con la misma firma: son un solo gesto).
  const responsable = useResponsable();
  const opcionesEtiqueta = etiquetas.map((e) => ({ valor: e.id, texto: e.texto }));

  // Renombrar: la misma comprobación que al crear, pero SOLO si el nombre cambia de verdad
  // (otra clave): pasar de "blusa aurora" a "Blusa Aurora" no es un nombre nuevo.
  const nombreNuevo = tituloReferencia(referencia);
  const nombreCambio = !!producto && claveReferencia(nombreNuevo) !== claveReferencia(producto.referencia);
  const parecidos = useParecidos({ nombre: nombreNuevo, activo: nombreCambio, excluirId: producto?.id });
  const parejaCambio = !!producto && (marcaId !== producto.marcaId || proveedorId !== producto.proveedorId);
  const categoriaActual = categorias.find((c) => c.id === categoriaId);
  // Al EDITAR la regla es «no empeora» (ADR-0109, cuarta parte; Felipe, 2026-09-19): en Indumentaria un producto activo que
  // YA tenía tejido o patrón no puede quedarse sin él; uno que nunca los tuvo se guarda igual. Hoy son 38 de los 39 activos: nacieron
  // cuando ninguna categoría tenía tejidos habilitados, y exigirlos habría impedido hasta cambiar un precio. Nuevo producto sí los exige.
  const familiaExigente = !!categoriaActual?.exigeTejidoPatron && estado === "activo";
  const exigeTejido = familiaExigente && !!producto?.tejidoId;
  const exigePatron = familiaExigente && !!producto?.patronId;

  const opcionesCategoria = categorias.map((c) => ({ valor: c.id, texto: c.nombre, detalle: c.prefijo ?? undefined }));
  // Las tallas que la categoría ofrece, en su orden (S, M, L… y no alfabético): para corregir y para agregar.
  const tallasCategoria = [...(ejes.tallas[categoriaId] ?? [])].sort((a, b) => compararTallas(a.texto, b.texto));
  const opcionesTejido = (ejes.tejidos[categoriaId] ?? []).map((t) => ({
    valor: t.id,
    texto: t.texto,
    icono: <MuestraTejido nombre={t.texto} imagenUrl={imagenes.tejidos[t.id]} className="aspect-[3/1] w-[72px]" />,
  }));
  const opcionesPatron = (ejes.patrones[categoriaId] ?? []).map((t) => ({
    valor: t.id,
    texto: t.texto,
    icono: <MuestraPatron nombre={t.texto} imagenUrl={imagenes.patrones[t.id]} className="aspect-[3/1] w-[72px]" />,
  }));

  // ---------- temporada (ADR-0246) ----------
  // La de su categoría se sigue de la categoría ELEGIDA en el formulario (no de la que tenía al abrir): si se cambia de
  // categoría, «Igual que su categoría (…)» ya dice lo que va a heredar.
  const temporadaCategoria = temporadas ? (temporadas.porCategoria[categoriaId] ?? null) : null;
  const opcionesTemporadaPrenda = temporadas
    ? opcionesTemporada(temporadas.lista, { nombre: nombreTemporada(temporadas.lista, temporadaCategoria), de: "categoría" })
    : [];
  const temporadaPrenda = temporadaHeredadaPorColor(temporada, temporadaCategoria);
  const opcionesTemporadaColor = temporadas
    ? opcionesTemporada(temporadas.lista, { nombre: nombreTemporada(temporadas.lista, temporadaPrenda), de: "prenda" })
    : [];
  const coloresFicha = coloresConVariantesActivas(filas.map((f) => ({ colorCodigo: f.colorCodigo ?? "", activo: f.activo })));
  // Un color que estaba todo apagado al abrir y se reactiva: su excepción (si la tiene) no llegó a la ficha. No se le
  // ofrece el desplegable (diría «Igual que su prenda» sin saberlo) ni se manda nada por él; se avisa.
  const coloresInciertos = coloresSinTemporadaConocida(producto?.variantes ?? [], coloresFicha);
  const coloresConTemporada = coloresFicha.filter((c) => !coloresInciertos.includes(c));
  // Sin saber qué excepciones hay guardadas (`porColor` null) no se ofrece: mostraría «Igual que su prenda» sobre una
  // excepción que sí existe. Con un solo color, se ofrece igual si ese color ya tiene la suya (o no se sabe).
  const ofreceTemporadaPorColor = !!temporadas?.porColor && ofrecerTemporadaPorColor(coloresFicha, porColorGuardado, coloresInciertos);
  const conTemporadaPropia = coloresConTemporada.filter((c) => (temporadaColor[c] ?? SIN_PROPIA) !== SIN_PROPIA).length;
  // Plegada: casi ninguna prenda la usa. Abierta si ya hay algún color con la suya, para que se vea sin buscarla.
  const [verTemporadaColor, setVerTemporadaColor] = useState(() => Object.keys(temporadas?.porColor ?? {}).length > 0);
  const cambiosColor = ofreceTemporadaPorColor ? cambiosTemporadaPorColor(coloresConTemporada, temporadaColor, porColorGuardado) : null;

  // ---------- qué hay sin guardar, en palabras (el lateral lo dice antes de pulsar) ----------
  const datosAhora: DatosFicha = {
    referencia: referencia.trim(),
    categoriaId,
    descripcion: descripcion.trim(),
    estado,
    stockMinimo: stockMinimo.trim(),
    temporada,
    permitirVentaSinStock,
    tejidoId,
    patronId,
    marcaId,
    proveedorId,
    fotos: firmaFotos(fotosVista),
  };
  const [datosGuardados, setDatosGuardados] = useState<DatosFicha>(() => datosAhora);
  const datosCambiados = [
    ...new Set(
      (Object.keys(ROTULO_DATO) as (keyof typeof ROTULO_DATO)[]).filter((k) => datosAhora[k] !== datosGuardados[k]).map((k) => ROTULO_DATO[k])
    ),
  ];
  const fotosCambiaron = datosAhora.fotos !== datosGuardados.fotos;
  const resumen = [
    ...(datosCambiados.length > 0 ? [`Datos de la prenda: ${datosCambiados.join(", ")}`] : []),
    ...resumenDeCambios(filas, nombres, estadoVariantes),
    ...(fotosCambiaron ? ["Fotos"] : []),
    ...(cambiosColor ? ["Temporada por color"] : []),
  ];
  const hayCambios = datosCambiados.length > 0 || fotosCambiaron || hayCambiosVariantes(filas) || cambiosColor !== null;
  const problemas = problemasVariantes(filas, nombres);
  const avisoBloque = avisoBloqueSinAplicar(bloquePendiente);
  const bloquean = [...(avisoBloque ? [{ texto: avisoBloque, bloquea: true }] : []), ...problemas.filter((p) => p.bloquea)];
  const avisosSinBloquear = problemas.filter((p) => !p.bloquea);

  const ctx: ContextoFicha = { nombres, colores, codigoProducto: producto?.codigo ?? null, estado: estadoVariantes, esLider, veCosto, puedeCorregir };

  function elegirCategoria(id: string) {
    setCategoriaId(id);
    // Tejido/patrón están filtrados por categoría (20260917100400) — la
    // elección anterior puede no aplicar más a la nueva.
    setTejidoId("");
    setPatronId("");
  }

  /** Lo que devuelve el editor de fotos viene con los colores como se ven: se guarda con su color de origen. */
  function cambiarFotos(siguientes: FotoLocal[]) {
    setFotos((actuales) => anclarFotos(siguientes, actuales, filasRef.current));
  }

  // Barra de guardado abajo (2026-09-28). Bajo 1280 px el panel «Guardar cambios» deja de ir al costado (el formulario
  // necesita ese ancho: a 1024 px quedaba en 329 px) y pasa al final de la página, a ~3500 px de un precio cambiado arriba.
  // Mientras sus botones no se vean, una barra pegada abajo ofrece los mismos; cuando se ven, se va: nunca dos «Guardar» a la
  // vista. Desde 1280 px no aparece: el panel vuelve al costado y fijo.
  const accionesRef = useRef<HTMLDivElement>(null);
  const [accionesALaVista, setAccionesALaVista] = useState(true);
  useEffect(() => {
    const el = accionesRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const obs = new IntersectionObserver(([e]) => setAccionesALaVista(e.isIntersecting));
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  const panelGuardarRef = useRef<HTMLElement>(null);

  // «¿Salir sin guardar?» (2026-09-28): la guardia compartida del ERP (menú, «← Productos», atrás, cerrar la pestaña). Lo
  // que decide si hay algo que perder es `hayCambios`, lo mismo que dice el lateral; y lo que se pierde se nombra.
  const salida = useSalidaSinGuardar(
    hayCambios,
    resumen.length > 0
      ? `Hiciste cambios que todavía no se guardaron (${resumen.slice(0, 3).join("; ")}${resumen.length > 3 ? "; y más" : ""}). Si sales ahora, se pierden.`
      : undefined
  );

  function recargar() {
    // Recargar es justamente descartar lo escrito (otra persona guardó antes): sin el aviso nativo encima.
    salida.soltar();
    window.location.reload();
  }

  function cancelar() {
    salida.pedirSalir(volverA);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!producto) return void avisar.error("Esta pantalla solo edita productos. Para crear uno usa Nuevo producto.");
    if (!referencia.trim()) return void avisar.error("Falta la referencia del producto.", { enfocar: "producto-referencia" });
    if (stockMinimo.trim() !== "" && (!/^\d+$/.test(stockMinimo.trim()) || Number(stockMinimo) < 0)) {
      return void avisar.error("El stock mínimo tiene que ser un número entero, 0 o mayor.", { enfocar: "producto-stock-minimo" });
    }
    if (!marcaId || !proveedorId) return void avisar.error("Elige la marca y el proveedor del producto.", { enfocar: "producto-marca" });
    if (nombreCambio && parecidos.comprobando) return void avisar.error("Espera un momento: se está comprobando que el nombre no exista todavía.", { enfocar: "producto-referencia" });
    if (nombreCambio && parecidos.hayIdentico) return void avisar.error("Ya existe un producto con ese nombre.", { enfocar: "producto-referencia" });
    if (nombreCambio && parecidos.hayUnaLetra && !parecidos.confirmo) {
      return void avisar.error("Ese nombre se escribe casi igual que otro producto: confirma que es distinto, o déjalo como estaba.", { enfocar: "producto-referencia" });
    }
    if (exigeTejido && !tejidoId) return void avisar.error(`Esta prenda ya tenía tejido y en ${categoriaActual?.nombre ?? "esta categoría"} no se puede dejar sin él. Elige uno.`);
    if (exigePatron && !patronId) return void avisar.error("Esta prenda ya tenía patrón y no se puede dejar sin él (si no tiene diseño, elige Liso).");
    if (avisoBloque) return void avisar.error(avisoBloque, { enfocar: "variantes-bloque-monto" });
    const bloqueante = problemas.find((p) => p.bloquea);
    if (bloqueante) {
      const enfocar = bloqueante.clave ? `producto-variante-${bloqueante.clave}-precio` : filas.length === 0 ? "variantes-agregar-color" : undefined;
      return void avisar.error(bloqueante.texto, enfocar ? { enfocar } : undefined);
    }
    const firma = responsable.firma();
    if (!responsable.listo || !firma) return void avisar.error(responsable.motivo ?? "Elige quién hace esta operación.");

    setLoading(true);
    const nombrePrenda = referencia.trim();
    const cerrarProceso = avisar.proceso(`Guardando ${nombrePrenda}…`);
    // Se mira ANTES de consolidar (después, lo corregido ya es «lo guardado» y lo nuevo ya existe).
    const corregidas = filas.filter(corregida).length;
    const nuevas = filas.filter((f) => !f.guardada).length;

    // Las fotos viajan como se ven: la base corrige primero (mudando las guardadas) y después escribe estos colores.
    const payloadFotos = fotosVista.map((f) => ({
      ...(f.id ? { id: f.id } : {}),
      url: f.url,
      es_principal: f.esPrincipal,
      color_codigo: f.colorCodigo || null,
    }));

    const supabase = createClient();
    // Una corrección de color o talla bloquea sus variantes: si en ese mismo instante una venta o un traslado de varias
    // tallas de esta prenda las toma en otro orden, la base deshace entera a una de las dos (40P01, ADR-0257 T8). Si cae
    // esta, no se guardó nada: se repite una vez sola.
    const { data: versionNueva, error } = await conUnReintentoSiChoca(() => firmar(
      supabase.rpc("catalogo_actualizar_producto", {
        p_producto_id: producto.id,
        p_referencia: nombrePrenda,
        p_estado: estado,
        // Primero las corregidas, después las que existen, al final las nuevas; las claves de color y talla, SOLO en las
        // corregidas (sin ellas la base no toca la identidad). Ver `payloadVariantes`.
        p_variantes: payloadVariantes(filas),
        p_permitir_venta_sin_stock: permitirVentaSinStock,
        p_fotos: payloadFotos,
        ...(categoriaId ? { p_categoria_id: categoriaId } : {}),
        ...(descripcion.trim() ? { p_descripcion: descripcion.trim() } : {}),
        ...(stockMinimo.trim() !== "" ? { p_stock_minimo: Number(stockMinimo) } : {}),
        ...(temporada.trim() ? { p_temporada: temporada.trim() } : {}),
        ...(tejidoId ? { p_tejido_id: tejidoId } : {}),
        ...(patronId ? { p_patron_id: patronId } : {}),
        // Marca y proveedor solo si CAMBIARON: si no, un proveedor desactivado más tarde impediría guardar hasta un cambio de precio.
        ...(parejaCambio ? { p_marca_id: marcaId, p_proveedor_id: proveedorId } : {}),
        ...(parecidos.confirmo ? { p_confirmo_distinto: true } : {}),
        ...(versionRef.current !== null ? { p_version_esperada: versionRef.current } : {}),
      }),
      firma
    ));

    if (error) {
      cerrarProceso();
      setLoading(false);
      responsable.despues(error);
      if (esVersionCambiada(error)) {
        // Otra persona guardó esta prenda mientras se editaba: el formulario NO se cierra (lo escrito sigue a la vista
        // para anotarlo) y se ofrece recargar, que trae sus cambios.
        setVersionCambiada(true);
        avisar.error(traducirError(error, "guardar el producto"), { accion: { texto: "Recargar", onClick: recargar } });
        return;
      }
      const lectura = leerErrorAlta(error);
      if (lectura.tipo !== "otro") {
        // Otra persona creó ese nombre mientras se editaba: se muestra en pantalla, no solo en un aviso.
        parecidos.reintentar();
        avisar.error(lectura.mensaje, { enfocar: "producto-referencia" });
        return;
      }
      // Cayó dos veces seguidas por el mismo choque: se dice con palabras, no con «deadlock detected».
      avisar.error(esChoqueDeCandados(error) ? FRASE_CHOQUE_DE_CANDADOS : traducirError(error, "guardar el producto"));
      return;
    }
    if (typeof versionNueva === "number") versionRef.current = versionNueva;
    // Lo principal ya está en la base: desde aquí, «sin guardar» se mide contra esto.
    setDatosGuardados(datosAhora);

    // Cómo quedaron las variantes: los ids de las nuevas (para sus etiquetas) y si la base aplicó las correcciones. Con
    // la base sin el SQL de ADR-0257, `catalogo_actualizar_producto` ignora el color y la talla de una variante que ya
    // existe SIN error: decir «guardado» sería el mismo engaño que D-133 cerró el 2026-09-26.
    const { data: deLaBase, error: errorLectura } = await supabase.from("variantes").select("id, color_codigo, talla_id, codigo").eq("producto_id", producto.id);
    if (errorLectura || !deLaBase) {
      cerrarProceso();
      setLoading(false);
      responsable.despues(null);
      setHayQueRecargar(true);
      avisar.error(`${nombrePrenda} ya quedó guardado, pero no se pudo leer cómo quedaron sus variantes.`, {
        detalle: "Recarga la ficha antes de seguir: así no se crea ninguna variante dos veces.",
        accion: { texto: "Recargar", onClick: recargar },
      });
      return;
    }
    const sinAplicar = correccionesSinAplicar(filas, deLaBase);
    if (corregidas > sinAplicar.length) logrado.current.correcciones = true;
    logrado.current.nuevas += nuevas;
    let actuales = consolidar(filas, deLaBase);
    setFilas(actuales);
    if (sinAplicar.length === 0) {
      // La base corrigió y mudó fotos y temporada de los colores que se quedaron sin variantes: lo que se veía pasa a ser
      // lo guardado, y a la vez (en la misma pintada) su origen, porque las filas consolidadas ya no tienen mudanzas.
      // Si la base no corrigió (sin el SQL), tampoco mudó nada: todo sigue anclado como estaba.
      setPorColorBase(porColorGuardado);
      setFotos(fotosVista.map((f) => ({ ...f, fijo: false })));
      setTemporadaEditada(Object.entries(temporadaUbicada).map(([color, clave]) => ({ origen: color, fijo: false, clave })));
    }
    const mudanzasTras = mudanzasAlGuardar(actuales);

    // Etiquetas por variante: en la MISMA acción, después del guardado principal, UNA llamada y solo las que cambiaron
    // (mandarlas todas pisaría `variante_etiquetas.created_at` sin motivo). Las nuevas ya tienen id (`consolidar`).
    const asignaciones = asignacionesDeEtiquetas(actuales);
    if (asignaciones.length > 0) {
      const { error: errorEtiquetas } = await firmar(supabase.rpc("actualizar_variantes_etiquetas", { p_asignaciones: asignaciones }), firma);
      if (errorEtiquetas) {
        cerrarProceso();
        setLoading(false);
        // Si falla, las etiquetas se quedan: «vuelve a pulsar Guardar cambios» es el mismo gesto (salvo rechazo por responsable).
        responsable.despues(errorEtiquetas);
        avisar.error(traducirError(errorEtiquetas, "guardar las etiquetas de las variantes"), {
          detalle: `${nombrePrenda} ya quedó guardado — vuelve a pulsar "Guardar cambios" para las etiquetas.`,
        });
        return;
      }
      actuales = marcarEtiquetasGuardadas(actuales);
      setFilas(actuales);
    }

    // Temporada por color (ADR-0246): mismo gesto, después del guardado principal (un color recién agregado recién
    // existe ahora) y UNA sola llamada con solo los colores que cambiaron. Todo o nada: si falla, ningún color cambió.
    if (cambiosColor) {
      const { error: errorTemporada } = await firmar(
        supabase.rpc("asignar_temporadas", { p_items: [{ producto_id: producto.id, colores: cambiosColor }] }),
        firma
      );
      if (errorTemporada) {
        cerrarProceso();
        setLoading(false);
        responsable.despues(errorTemporada);
        avisar.error(traducirError(errorTemporada, "guardar la temporada de los colores"), {
          detalle: `${nombrePrenda} ya quedó guardado — vuelve a pulsar "Guardar cambios" para la temporada de los colores.`,
        });
        return;
      }
      // Lo guardado = lo que había + lo que se acaba de mandar; lo elegido a mano para esos colores ya no está pendiente.
      const aplicados = cambiosColor;
      setPorColorBase(() => {
        const base = { ...porColorGuardado };
        for (const [color, clave] of Object.entries(aplicados)) {
          if (clave === null) delete base[color];
          else base[color] = clave;
        }
        return base;
      });
      setTemporadaEditada((actual) =>
        actual.filter((e) => {
          const color = ubicar(e, mudanzasTras);
          return color === null || !(color in aplicados);
        })
      );
    }

    cerrarProceso();
    setLoading(false);
    responsable.despues(null);

    if (sinAplicar.length > 0) {
      // Red de seguridad: la ficha no ofrece corregir sin la función de la base (`puedeCorregir`), pero si igual llega
      // aquí, se queda abierta con las correcciones a la vista, pendientes, para no perderlas.
      avisar.error("Se guardó lo demás, pero el color y la talla no se corrigieron.", {
        detalle: "El sistema todavía no pudo corregir el color o la talla; avisa a un líder. Tu corrección sigue en la ficha.",
      });
      return;
    }

    // El guardado terminó completo: lo logrado se lee (aunque haya llegado en un reintento) y se olvida.
    const { correcciones: huboCorrecciones, nuevas: creadas } = logrado.current;
    logrado.current = { correcciones: false, nuevas: 0 };
    const activas = actuales.filter((f) => f.activo).length;
    const detalle = [
      `${activas} ${activas === 1 ? "variante activa" : "variantes activas"}`,
      ...(huboCorrecciones ? ["las etiquetas nuevas salen con el código corregido"] : []),
      ...(creadas > 0 ? [`${creadas} ${creadas === 1 ? "variante nueva" : "variantes nuevas"}. ${NACEN_SIN_UNIDADES}`] : []),
    ];
    avisar.exito(`${nombrePrenda} guardado`, {
      detalle: detalle.join(" · "),
      // Tras corregir color o talla, lo pegado en percha sigue sonando pero ya no dice lo correcto: se ofrece reimprimir.
      ...(huboCorrecciones ? { accion: { texto: "Imprimir etiquetas", onClick: () => router.push(`/etiquetas-de-precio?producto=${producto.id}`) } } : {}),
    });
    salida.soltar();
    router.replace(volverA);
    router.refresh();
  }

  return (
    <form
      onSubmit={onSubmit}
      // Guardar es un acto explícito (como en Nuevo producto): Enter dentro de un campo —cerrar un precio, corregir el
      // nombre— NO envía la ficha entera. Con correcciones de color en juego, un Enter de costumbre guardaría de más.
      onKeyDown={(e) => {
        if (e.key === "Enter" && e.target instanceof HTMLInputElement) e.preventDefault();
      }}
      className="grid gap-6 pb-28 sm:pb-24 xl:grid-cols-[minmax(0,1fr)_19rem] xl:items-start xl:pb-0"
    >
      <div className="min-w-0 space-y-6">
        {/* ---------- datos del producto ---------- */}
        <section className="card-cayla space-y-4 p-5">
          <p className="label-cayla text-[11px] text-tinta/65">Producto</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <CampoTexto
              etiqueta="Referencia"
              id="producto-referencia"
              value={referencia}
              onChange={(e) => setReferencia(e.target.value)}
              placeholder="Blusa Lino"
              autoFocus
            />
            <Campo etiqueta="Categoría">
              <ComboBuscable etiquetaAccesible="Categoría" valor={categoriaId} onValor={elegirCategoria} opciones={opcionesCategoria} marcador="Busca una categoría…" />
            </Campo>
            {nombreCambio && (
              <div className="sm:col-span-2">
                {nombreNuevo && nombreNuevo !== referencia.trim() && (
                  <p className="mb-2 text-xs text-tinta/60">
                    Se guardará como <strong className="text-tinta">{nombreNuevo}</strong>
                  </p>
                )}
                <AvisoParecidos parecidos={parecidos.items} confirmo={parecidos.confirmo} onConfirmo={parecidos.confirmar} noSePudoComprobar={parecidos.fallo} />
              </div>
            )}
            <div className="sm:col-span-2" id="producto-marca">
              <Campo etiqueta="Marca y proveedor">
                <ElegirMarcaProveedor
                  marcas={marcas.marcas}
                  proveedores={marcas.proveedores}
                  vinculos={marcas.vinculos}
                  usosCategoria={marcas.parejasPorCategoria[categoriaId] ?? []}
                  categoriaNombre={categoriaActual?.nombre}
                  nombresIniciales={producto ? { marca: producto.marcaNombre, proveedor: producto.proveedorNombre } : undefined}
                  marcaId={marcaId}
                  proveedorId={proveedorId}
                  onElegir={(m, p) => {
                    setMarcaId(m);
                    setProveedorId(p);
                  }}
                  onLimpiar={() => {
                    setMarcaId("");
                    setProveedorId("");
                  }}
                  puedeCrear
                />
              </Campo>
            </div>
            <CampoTexto etiqueta="Descripción (opcional)" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Detalle interno, no se muestra a la clienta" className="sm:col-span-2" />
            <Campo etiqueta={exigeTejido ? "Tejido" : "Tejido (opcional)"}>
              <ComboBuscable
                etiquetaAccesible="Tejido"
                valor={tejidoId}
                onValor={setTejidoId}
                opciones={opcionesTejido}
                marcador={categoriaId ? "Sin tejido" : "Elige una categoría primero"}
              />
              {exigeTejido && opcionesTejido.length === 0 && (
                <p className="mt-1 text-xs text-ambar-profundo">
                  Esta prenda ya tenía tejido y {categoriaActual?.nombre} no tiene ninguno habilitado: habilítalos en Catálogo → Categorías para poder guardar.
                </p>
              )}
              {familiaExigente && !exigeTejido && !tejidoId && opcionesTejido.length > 0 && (
                <p className="mt-1 text-xs text-tinta/55">Indumentaria lleva tejido. Complétalo cuando puedas; no hace falta para guardar.</p>
              )}
              {tejidoId && (
                <MuestraTejido
                  nombre={opcionesTejido.find((o) => o.valor === tejidoId)?.texto ?? ""}
                  imagenUrl={imagenes.tejidos[tejidoId]}
                  className="mt-2 aspect-[3/1] w-[120px]"
                />
              )}
            </Campo>
            <Campo etiqueta={exigePatron ? "Patrón" : "Patrón (opcional)"}>
              <ComboBuscable
                etiquetaAccesible="Patrón"
                valor={patronId}
                onValor={setPatronId}
                opciones={opcionesPatron}
                marcador={categoriaId ? "Sin patrón" : "Elige una categoría primero"}
              />
              {exigePatron && opcionesPatron.length === 0 && (
                <p className="mt-1 text-xs text-ambar-profundo">
                  Esta prenda ya tenía patrón y {categoriaActual?.nombre} no tiene ninguno habilitado: habilítalos en Catálogo → Categorías para poder guardar.
                </p>
              )}
              {familiaExigente && !exigePatron && !patronId && opcionesPatron.length > 0 && (
                <p className="mt-1 text-xs text-tinta/55">Indumentaria lleva patrón (si no tiene diseño, elige Liso). Complétalo cuando puedas; no hace falta para guardar.</p>
              )}
              {patronId && (
                <MuestraPatron
                  nombre={opcionesPatron.find((o) => o.valor === patronId)?.texto ?? ""}
                  imagenUrl={imagenes.patrones[patronId]}
                  className="mt-2 aspect-[3/1] w-[120px]"
                />
              )}
            </Campo>
            {editando &&
              (producto?.estadoAlta === "rechazado" ? (
                // Una prenda rechazada en el censo es terminal (productos_rechazado_descontinuado_check): ofrecerle «Activo»
                // sería un botón que la base siempre rechaza. Se dice por qué y qué hacer, en vez de dejar que falle al guardar.
                <div className="space-y-1">
                  <p className="label-cayla text-[11px] text-tinta/70">Estado</p>
                  <p className="text-sm text-tinta">Descontinuado</p>
                  <p className="text-xs text-tinta/60">
                    Se rechazó al revisar un alta al vuelo y no se reactiva. Si fue un error, créala de nuevo con Nuevo producto.
                  </p>
                </div>
              ) : (
                <Segmentado etiqueta="Estado" valor={estado} onValor={setEstado} opciones={ESTADOS} />
              ))}
            <CampoTexto
              etiqueta="Stock mínimo (opcional)"
              id="producto-stock-minimo"
              type="number"
              min={0}
              step={1}
              inputMode="numeric"
              value={stockMinimo}
              onChange={(e) => setStockMinimo(e.target.value)}
              placeholder="Ej. 5"
              pie="Suma el stock de todas las sedes. En blanco = este producto nunca entra en «Stock bajo» en /productos."
            />
            {temporadas ? (
              <CampoSelect
                etiqueta="Temporada (opcional)"
                id="producto-temporada"
                valor={temporada}
                onValor={setTemporada}
                opciones={opcionesTemporadaPrenda}
                pie={
                  // Una excepción por color manda sobre esta: se dice aquí, para que nadie crea que la prenda entera es de
                  // la temporada que muestra el combo.
                  conTemporadaPropia > 0
                    ? `${conTemporadaPropia === 1 ? "1 de sus colores tiene" : `${conTemporadaPropia} de sus colores tienen`} su propia temporada, y esa manda: mira «Temporada por color», abajo.`
                    : "Sin año: el sistema lo sabe por la fecha en que la prenda llega a cada tienda."
                }
              />
            ) : (
              <div>
                <p className="label-cayla text-[11px] text-tinta/65">Temporada</p>
                <p className="mt-1.5 flex h-9 items-center text-sm text-tinta/65">{producto?.temporada ?? "Sin temporada"}</p>
                <p className="mt-1 text-xs text-tinta/55">
                  La lista de temporadas no está disponible ahora (todavía no se activa, o no se pudo leer). Guardar no cambia la temporada.
                </p>
              </div>
            )}
            <div className="flex items-end pb-2">
              <Interruptor
                activo={permitirVentaSinStock}
                onActivo={setPermitirVentaSinStock}
                etiqueta="Permitir venta sin stock"
                pie="Deja vender este producto aunque el stock marque 0 (pedido especial / preventa)."
              />
            </div>
            {ofreceTemporadaPorColor && (
              <div className="border-t border-tinta/10 pt-3 sm:col-span-2">
                <button
                  type="button"
                  aria-expanded={verTemporadaColor}
                  aria-controls="producto-temporada-por-color"
                  onClick={() => setVerTemporadaColor((v) => !v)}
                  className="label-cayla inline-flex items-center gap-1 text-[11px] text-tinta/65 hover:text-rojo"
                >
                  Temporada por color
                  {conTemporadaPropia > 0 ? ` (${conTemporadaPropia} con la suya)` : ""}
                  {coloresInciertos.length > 0 ? ` · ${coloresInciertos.length} por revisar` : ""}
                  <ChevronDown aria-hidden className={`h-3.5 w-3.5 transition-transform ${verTemporadaColor ? "rotate-180" : ""}`} />
                </button>
                {verTemporadaColor && (
                  <div id="producto-temporada-por-color" className="mt-2">
                    <p className="text-xs text-tinta/55">
                      Solo si un color es de otra temporada que el modelo (un color de invierno en un modelo de verano). Si no, déjalo igual que
                      su prenda. Se guarda junto con el resto al pulsar &ldquo;Guardar cambios&rdquo;.
                      {coloresFicha.length < MIN_COLORES_PARA_TEMPORADA_POR_COLOR &&
                        " Con un solo color, lo normal es ponerle la temporada a la prenda (arriba) y dejar el color igual que su prenda."}
                    </p>
                    {coloresInciertos.length > 0 && (
                      <p className="nota-cayla mt-2 text-xs">
                        {coloresInciertos.map((c) => nombres.color(c)).join(", ")}{" "}
                        {coloresInciertos.length === 1 ? "estaba apagado" : "estaban apagados"} al abrir esta ficha: si{" "}
                        {coloresInciertos.length === 1 ? "tenía su propia temporada, la conserva" : "tenían su propia temporada, la conservan"}. Guarda
                        y vuelve a abrir la ficha para verla o cambiarla.
                      </p>
                    )}
                    <div className="mt-2 grid gap-x-4 sm:grid-cols-2">
                      {coloresConTemporada.map((codigo) => {
                        const color = colores.find((c) => c.codigo === codigo);
                        return (
                          <CampoSelect
                            key={codigo}
                            etiqueta={
                              <span className="inline-flex items-center gap-1.5">
                                <span
                                  aria-hidden
                                  className={`inline-block h-2.5 w-5 rounded-full border border-tinta/20 ${color?.hex ? "" : "bg-sand"}`}
                                  style={color?.hex ? { background: color.hex } : undefined}
                                />
                                {nombres.color(codigo)}
                              </span>
                            }
                            valor={temporadaColor[codigo] ?? SIN_PROPIA}
                            onValor={(v) => setTemporadaEditada((actual) => elegirTemporada(actual, codigo, v, filas))}
                            opciones={opcionesTemporadaColor}
                          />
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        {/* ---------- fotos ---------- */}
        {/* id="fotos": la pantalla de éxito de Nuevo producto (ADR-0109) enlaza acá con #fotos. */}
        <section id="fotos" className="card-cayla scroll-mt-6 p-5">
          <FotosProducto fotos={fotosVista} onFotos={cambiarFotos} colores={colores} disabled={loading} />
        </section>

        {/* ---------- variantes (ADR-0257) ---------- */}
        <VariantesFicha
          ctx={ctx}
          filas={filas}
          onFilas={setFilas}
          onBloquePendiente={setBloquePendiente}
          tallasCategoria={tallasCategoria}
          usoColores={usoColores}
          categoriaNombre={categoriaActual?.nombre}
          etiquetas={opcionesEtiqueta}
          avisoEtiquetas={avisoEtiquetas}
          deshabilitado={loading}
        />
      </div>

      <aside ref={panelGuardarRef} className="card-cayla scroll-mt-24 space-y-4 p-5 xl:sticky xl:top-24">
        <p className="label-cayla text-[11px] text-tinta/65">Guardar cambios</p>
        {resumen.length > 0 ? (
          <div aria-live="polite">
            <p className="text-[12.5px] text-taupe">Al guardar:</p>
            <ul className="mt-1.5 space-y-1.5 text-[13.5px] leading-snug text-tinta">
              {resumen.map((linea, i) => (
                <li key={i} className="flex gap-2">
                  <span aria-hidden className="text-taupe">
                    ·
                  </span>
                  <span>{linea}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-sm text-tinta/65">Sin cambios todavía.</p>
        )}
        {bloquean.length > 0 && (
          <ul className="space-y-1 text-[12.5px] text-rojo-profundo" role="alert">
            {bloquean.slice(0, 3).map((p, i) => (
              <li key={i}>{p.texto}</li>
            ))}
            {bloquean.length > 3 && <li>Y {bloquean.length - 3} más: míralos en cada variante.</li>}
          </ul>
        )}
        {avisosSinBloquear.map((p, i) => (
          <p key={i} className="text-[12.5px] text-ambar-profundo">
            {p.texto}
          </p>
        ))}
        <ComboResponsable control={responsable} deshabilitado={loading} />
        {versionCambiada && (
          <div className="nota-cayla space-y-2" role="alert">
            <p>
              Otra persona cambió esta prenda mientras la editabas. Recarga para ver sus cambios; lo que escribiste sigue aquí hasta
              entonces, por si quieres anotarlo.
            </p>
            <Boton type="button" peso="fantasma" onClick={recargar} className="w-full">
              Recargar la prenda
            </Boton>
          </div>
        )}
        {hayQueRecargar && (
          <div className="nota-cayla space-y-2" role="alert">
            <p>La prenda ya quedó guardada, pero no se pudo leer cómo quedaron sus variantes. Recarga antes de seguir.</p>
            <Boton type="button" peso="fantasma" onClick={recargar} className="w-full">
              Recargar la prenda
            </Boton>
          </div>
        )}
        <div ref={accionesRef} className="flex flex-col gap-2">
          <Boton
            type="submit"
            peso="primario"
            cargando={loading}
            disabled={!responsable.listo || !hayCambios || hayQueRecargar}
            title={!hayCambios ? "Todavía no cambiaste nada" : (avisoBloque ?? responsable.motivo ?? undefined)}
            className="w-full"
          >
            Guardar cambios
          </Boton>
          <Boton type="button" peso="discreto" onClick={cancelar} disabled={loading} className="w-full">
            Cancelar
          </Boton>
        </div>
      </aside>

      {/* Bajo 1280 px, mientras los botones del lateral no se ven: los mismos, pegados abajo (nunca dos «Guardar» a la vista). */}
      <BarraFija
        visible={!accionesALaVista}
        className="xl:hidden"
        resumen={
          !responsable.listo ? (
            <span>
              {responsable.motivo ?? "Elige quién hace esta operación."}{" "}
              <button
                type="button"
                onClick={() => panelGuardarRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
                className="font-medium text-rojo underline underline-offset-2"
              >
                Elegir responsable
              </button>
            </span>
          ) : bloquean.length > 0 ? (
            <span className="text-rojo-profundo">{bloquean[0].texto}</span>
          ) : resumen.length > 0 ? (
            <span>
              Al guardar: {resumen[0]}
              {resumen.length > 1 ? ` y ${resumen.length - 1} más` : ""}.
            </span>
          ) : (
            <span>Sin cambios todavía.</span>
          )
        }
        acciones={
          <>
            <Boton type="button" peso="discreto" onClick={cancelar} disabled={loading}>
              Cancelar
            </Boton>
            <Boton
              type="submit"
              peso="primario"
              cargando={loading}
              disabled={!responsable.listo || !hayCambios || hayQueRecargar}
              title={!hayCambios ? "Todavía no cambiaste nada" : (avisoBloque ?? responsable.motivo ?? undefined)}
            >
              Guardar cambios
            </Boton>
          </>
        }
      />
      {salida.aviso}
    </form>
  );
}
