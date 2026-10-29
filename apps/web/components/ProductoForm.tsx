"use client";

import { NombreDelProveedor } from "@/components/ficha-producto/NombreDelProveedor";
import { avisosDeReferencia, otrosTipos, tiposDeCategoria } from "@/lib/nombre-de-prenda";
import { useEffect, useMemo, useRef, useState } from "react";
import { BotonDeshacer } from "@/components/ui/BotonDeshacer";
import { useRouter } from "next/navigation";
import { ChevronDown, Lightbulb, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { esVersionCambiada, traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { MuestraPatron } from "@/components/MuestraPatron";
import { MuestraTejido } from "@/components/MuestraTejido";
import { Campo, CampoSelect, CampoTexto, Interruptor, Segmentado } from "@/components/ui/campos";
import { ComboBuscable } from "@/components/ui/ComboBuscable";
import { BarraDeCambios } from "@/components/BarraDeCambios";
import { ConfirmarCambios } from "@/components/ConfirmarCambios";
import { useSalidaSinGuardar } from "@/components/ui/useSalidaSinGuardar";
import { compararTallas } from "@/lib/tallas";
import type { EjesPorCategoria, ImagenesMuestra, ProductoDetalle, ValorVocabulario } from "@/lib/catalogo-v2";
import { FotosPorColor } from "@/components/ficha-producto/FotosPorColor";
import { comoPrincipal, conFotosNuevas, fotosDelColor, primeraEnSuColor, sinLaFoto, vistaDeFotos, type FotoLocal } from "@/lib/fotos-por-color-reglas";
import { AvisoParecidos } from "@/components/alta-producto/AvisoParecidos";
import { ElegirMarcaProveedor } from "@/components/alta-producto/ElegirMarcaProveedor";
import { claveReferencia, leerErrorAlta, tituloReferencia, type ColorAlta } from "@/lib/alta-producto";
import type { CatalogoMarcas } from "@/lib/marcas-datos";
import { problemaAlEditar } from "@/lib/marca-proveedor-reglas";
import { useParecidos } from "@/lib/use-parecidos";
import { esErrorDeResponsable, firmar } from "@/lib/responsable-reglas";
import {
  cambioDeDato,
  resumenDeCambios,
  textoDeSalidaDeFicha,
  type CampoDato,
  type FichaEditable,
  type NombresFicha as NombresCambios,
  type ResumenCambios,
  type VarianteFicha,
} from "@/lib/producto-cambios-reglas";
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
  agregarCombinaciones,
  unidadesParaNuevas,
  anclarFotos,
  asignacionesDeEtiquetas,
  avisoBloqueSinAplicar,
  conUnReintentoSiChoca,
  consolidar,
  correccionesSinAplicar,
  corregida,
  corregir,
  costosSinComprobar,
  elegirTemporada,
  esChoqueDeCandados,
  bloqueoPorVenta,
  choqueDeCorreccion,
  costoMaximoGuardado,
  etiquetasComunes,
  filasDelEje,
  filasDeProducto,
  FRASE_CHOQUE_DE_CANDADOS,
  fotosComoSeVen,
  marcarEtiquetasGuardadas,
  moverTemporadas,
  mudanzasAlGuardar,
  NACEN_SIN_UNIDADES,
  payloadVariantes,
  precioYCostoPorDefecto,
  problemasVariantes,
  cambiarFila,
  textoChoque,
  todasNuevas,
  ubicar,
  ubicarTemporadas,
  variantesParaResumen,
  type CampoBloque,
  type Destino,
  type EstadoVariante,
  type FilaFicha,
  type NombresFicha,
  type TemporadaElegida,
} from "@/lib/variantes-ficha-reglas";
import { PanelDelTaller } from "@/components/ficha-producto/PanelDelTaller";
import type { PuertaDeLaFicha } from "@/lib/ficha-consumo-datos";
import { SeccionFicha } from "@/components/ficha-producto/SeccionFicha";
import { PreciosPorSede } from "@/components/ficha-producto/PreciosPorSede";
import type { Tienda } from "@/components/ficha-producto/PrecioSedeModal";
import { usePreciosDeTienda } from "@/components/ficha-producto/usePreciosDeTienda";
import {
  MOTIVO_DESDE_LA_TABLA,
  cambioPrecioAqui,
  nombreCorto,
  problemaPrecioAqui,
  soles,
  tiendasAlCambiarPrecio,
  type CambioPrecioAqui,
} from "@/lib/precio-sede-reglas";
import { PrecioAquiTerminal } from "@/components/ficha-producto/PrecioAquiTerminal";
import { MatrizStockFicha, type BotonesDeColor, type VistaMatriz } from "@/components/ficha-producto/MatrizStockFicha";
import { PuertaAjustarStock } from "@/components/ficha-producto/PuertaAjustarStock";
import { QuitarVarianteHoja } from "@/components/ficha-producto/QuitarVarianteHoja";
import { queHaceAlQuitar } from "@/lib/quitar-variante-reglas";
import { hrefAjustarDesdeEditar } from "@/lib/existencias-ajustar-desde-editar";
import { useStockFicha } from "@/components/ficha-producto/useStockFicha";
import { CambiarEnBloque } from "@/components/ficha-producto/CambiarEnBloque";
import { AgregarColoresModal, type ResultadoAgregarColores } from "@/components/ficha-producto/AgregarColoresModal";
import { AgregarTallasModal } from "@/components/ficha-producto/AgregarTallasModal";
import { CorregirVarianteModal, type EjesCorreccion } from "@/components/ficha-producto/CorregirVarianteModal";
import { ImprimirLoQueEntro } from "@/components/ficha-producto/ImprimirLoQueEntro";
import type { FotoSubida } from "@/components/ficha-producto/useSubirFotos";
import {
  comoLlenarHueco,
  coloresQueSeQuitan,
  coloresYaDesactivados,
  correccionesPendientes,
  devolverColor,
  hrefEtiquetasDeSubidas,
  lineasParaImprimir,
  ponerEtiqueta,
  quitarColor,
  quitarTalla,
  tallasQueSeQuitan,
  devolverTalla,
  resumenVariantes,
  type LineaParaImprimir,
} from "@/lib/matriz-ficha-reglas";
import { conDesde } from "@/lib/vuelta-productos";
import { numeroDeMonto } from "@/lib/monto-plata-reglas";
import { urlEtiquetasDePrecio } from "@/lib/etiqueta-precio-reglas";
import { avisoReimprimir } from "@/lib/etiqueta-campana";
import { hoyLima } from "@/lib/fechas-lima";
import {
  cambianEnCajaAlGuardar,
  campanasDeLaFicha,
  fraseCajaCobra,
  precioDeHoy,
  type CampanaDelVocabulario,
  type LadoDeLaFicha,
} from "@/lib/precio-de-hoy";
import { ConMarca } from "@/components/ficha-producto/TiraFicha";
import { irAlIdCampo } from "@/components/alta-producto/useGuiaAlta";
import { MarcaCampo, EtiquetaAhora } from "@/components/alta-producto/guia";
import type { EstadoCampo } from "@/lib/alta-producto-guia";
import { pendientesDeFicha, type IdPendiente, type PendienteFicha } from "@/lib/producto-ficha-guia";
import type { AjusteStockFicha, ContextoFicha, LecturaStockFicha } from "@/components/ficha-producto/piezas";
import { MAX_DESCRIPCION_PRODUCTO, MAX_NOMBRE_PRODUCTO } from "@/lib/catalogo-topes";

/* ====================================================================
   ProductoForm · edición de producto+variantes (V2, 2026-09-15)

   Usado solo por /productos/[id]/editar — el alta vive en
   NuevoProductoForm.tsx (la rama de alta que quedaba acá era código muerto
   y se retiró junto con `catalogo_crear_producto`, ADR-0109).

   VARIANTES (ADR-0263, 2026-09-28). La sección vive en
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
   ADR-0263 también las de las variantes NUEVAS: tras el guardado principal se
   leen sus ids (por su combinación, única en la prenda) y viajan en la misma
   llamada a `actualizar_variantes_etiquetas`.

   TEMPORADA (2026-09-26, ADR-0246). Se elige de la lista cerrada; vacío =
   hereda. Si la prenda tiene 2 o más colores (o uno solo que ya tenga la suya
   guardada), cada color puede tener la suya, que se guarda después del
   guardado principal con UNA llamada a `asignar_temporadas` y solo con los
   colores que cambiaron. Sin la lista en la base (SQL sin pegar), la ficha lo
   dice y manda la temporada tal como la leyó.

   GUARDAR EN DOS TIEMPOS (2026-09-28, ADR-0257). Antes el panel «Guardar
   cambios» estaba a la derecha (al final de la página en una tablet), el botón
   quedaba gris hasta elegir «Responsable» sin decir por qué, y una colaboradora
   apagaba una talla sin saber si quedó hecho. Ahora (Felipe eligió la opción A
   de cada pregunta):
     · lo que se toca se marca (fila en ámbar, «antes: …», «Deshacer») y sube la
       barra «Tienes N cambios sin guardar» (`BarraDeCambios`, sobre `BarraFija`);
       ya no hay panel a la derecha: la barra es el ÚNICO camino para guardar;
     · «Revisar y guardar» abre la hoja con lo que va a cambiar y el combo
       «Confirmar y guardar» (`ConfirmarCambios`; sin combo «Responsable» desde
       2026-09-29, clave `producto_confirmar_cambios`); recién ahí llama a la base;
     · salir con cambios pregunta (`useSalidaSinGuardar`, el mismo aviso de
       Compras y Recibir): enlaces, Atrás y cerrar la pestaña.
   Qué cambió lo decide UNA función pura (`lib/producto-cambios-reglas.ts`) que
   compara TODO lo editable: sin barra no hay dónde guardar, así que un campo que
   se escapara de esa comparación sería un campo que no se puede guardar. Las
   variantes entran a esa cuenta por `variantesParaResumen` (correcciones de
   color y talla, variantes nuevas, desactivadas, precios en bloque) y se cuentan
   contra lo GUARDADO de cada fila, no contra la foto de al abrir: tras un
   guardado a medias (etiquetas o temporada fallaron) la barra dice solo lo que
   falta, y reintentar no crea dos veces las nuevas.

   ADR-0263 reemplaza a la regla de ADR-0258 («color y talla se corrigen solo
   sin historia», D-139/D-140): se corrigen siempre desde el modal «Corregir»;
   si la variante ya se vendió, solo un líder (D-136, lo avisa
   `fn_variantes_estado` y lo vuelve a exigir la base). Los combos de color y
   talla que ADR-0258 ponía en las filas «sin historia» se retiraron.
   ==================================================================== */

type Categoria = { id: string; nombre: string; prefijo: string | null; familia?: string | null; exigeTejidoPatron: boolean; admitePrecioCero: boolean };

const ESTADOS = [
  { valor: "activo", texto: "Activo" },
  { valor: "descontinuado", texto: "Descontinuado" },
] as const;

/** Una foto de la ficha con su color de ORIGEN (ADR-0263): la que se ve y viaja sale de `fotosComoSeVen`. */
type FotoFicha = FotoLocal & { fijo?: boolean };

/** Los datos de la prenda (sin fotos ni variantes), tal como están en sus `useState`. */
type DatosPrenda = {
  referencia: string;
  categoriaId: string;
  descripcion: string;
  estado: (typeof ESTADOS)[number]["valor"];
  stockMinimo: string;
  temporada: string;
  permitirVentaSinStock: boolean;
  tejidoId: string;
  patronId: string;
  marcaId: string;
  proveedorId: string;
};

/** Todo lo que la pantalla deja editar, tal como está en sus `useState` (ADR-0257). Se captura al abrir (para «Descartar») y
 *  se vuelve a poner al descartar o al deshacer un descarte. Las fotos y la temporada por color van con su color de ORIGEN
 *  (ADR-0263): lo que se ve se deriva de ellas y de las correcciones pendientes. */
type EstadoFicha = DatosPrenda & { fotos: FotoFicha[]; filas: FilaFicha[]; temporadaEditada: TemporadaElegida[] };

/** La temporada por color que queda en la base tras mandar estos cambios (`null` = el color vuelve a seguir a su prenda). */
function conCambiosDeColor(base: Readonly<Record<string, string>>, cambios: Readonly<Record<string, string | null>> | null): Record<string, string> {
  const salida = { ...base };
  for (const [color, clave] of Object.entries(cambios ?? {})) {
    if (clave === null) delete salida[color];
    else salida[color] = clave;
  }
  return salida;
}

/** Las variantes que se venden según lo GUARDADO (sus etiquetas y su precio en la base), con el precio que cobra la caja de aquí:
 *  el propio de la tienda si lo tiene, si no el de la variante. */
function variantesGuardadas(filas: readonly FilaFicha[], precioAqui: number | null) {
  return filas.flatMap((f) =>
    f.id && f.guardada?.activo ? [{ id: f.id, etiquetaIds: f.guardada.etiquetaIds, precio: precioAqui ?? numeroDeMonto(f.guardada.precio) }] : [],
  );
}

/** Las mismas, según lo que está en PANTALLA (lo que quedará al guardar). Una nueva se nombra por su clave hasta tener id. */
function variantesEnPantalla(filas: readonly FilaFicha[], precioAqui: number | null) {
  return filas.filter((f) => f.activo).map((f) => ({ id: f.id ?? f.clave, etiquetaIds: f.etiquetaIds, precio: precioAqui ?? numeroDeMonto(f.precio) }));
}

/** La frase de «Precio de la prenda» (ADR-0472): lo guardado contra lo que está en pantalla, con la misma regla de la caja. */
function fraseDeLaFicha(
  campanas: { vocabulario: CampanaDelVocabulario[]; hoy: string },
  filas: readonly FilaFicha[],
  categoriaGuardada: string,
  categoriaEnPantalla: string,
  precioAqui: number | null,
  sede: string | null,
) {
  const guardadas = variantesGuardadas(filas, precioAqui);
  const enPantalla = variantesEnPantalla(filas, precioAqui);
  const deHoy = campanasDeLaFicha(guardadas, categoriaGuardada || null, campanas.vocabulario, campanas.hoy);
  const alGuardar = campanasDeLaFicha(enPantalla, categoriaEnPantalla || null, campanas.vocabulario, campanas.hoy);
  const lista = enPantalla.map((v) => v.precio).filter((p) => p > 0);
  return fraseCajaCobra(
    precioDeHoy(guardadas, (id) => deHoy.get(id)),
    precioDeHoy(enPantalla, (id) => alGuardar.get(id)),
    lista.length > 0 ? { desde: Math.min(...lista), hasta: Math.max(...lista) } : null,
    sede,
  );
}

export function ProductoForm({
  categorias,
  colores: coloresVocabulario,
  ejes,
  imagenes,
  etiquetas,
  avisoEtiquetas,
  campanas = null,
  marcas,
  estadoVariantes,
  esLider,
  puedeCorregir = true,
  fichaConsumo = null,
  ajusteStock = null,
  lecturaStock = null,
  preciosSede = null,
  producto,
  volverA = "/productos",
  nombreProveedor,
}: {
  categorias: Categoria[];
  /** Vocabulario de colores activo, con familia y sinónimos (lo mismo que ve el alta). */
  colores: ColorAlta[];
  /** Tallas/tejidos/patrones ofrecidos, por categoría (20260917100400). */
  ejes: EjesPorCategoria;
  /** La imagen elegida en Atributos para cada tejido y patrón (ADR-0256); sin ella, el dibujo automático. */
  imagenes: ImagenesMuestra;
  /** Vocabulario de etiquetas aprobado+activo, para aplicar a una variante. */
  etiquetas: (ValorVocabulario & { estilo: string })[];
  /** Una línea bajo el selector de etiquetas (ADR-0161 P4: a quien no es líder, que las de descuento no se le ofrecen). */
  avisoEtiquetas?: string;
  /** Las campañas con descuento (aprobadas y activas, con sus categorías) y el día de Lima: con ellas la ficha dice lo que cobra la
   *  caja hoy y lo que cobrará al guardar (ADR-0472). `null` = no lo dice (el alta tiene su propio resumen). */
  campanas?: { vocabulario: CampanaDelVocabulario[]; hoy: string } | null;
  /** Marcas, proveedores y parejas registradas (ADR-0109). */
  marcas: CatalogoMarcas;
  /** Stock y ventas por variante (`fn_variantes_estado`). `null` = no está en la base: la ficha sigue sin stock. */
  estadoVariantes: Record<string, EstadoVariante> | null;
  /** Para anticipar la regla de D-136 (una variante vendida la corrige solo un líder). La base la vuelve a exigir. */
  esLider: boolean;
  /** La base sabe corregir el color y la talla de una variante (tiene el SQL de ADR-0263). Sin eso la ficha no ofrece
   *  corregir: una base vieja ignora la corrección pero SÍ guarda las fotos que se movieron con ella. La página la
   *  calcula siempre (`esFuncionAusente` sobre `fn_variantes_estado`); sin pasarla, se asume que sí. */
  puedeCorregir?: boolean;
  /** La puerta de la «Ficha de consumo» del modelo (ADR-0513): el Taller y los avíos que la hoja necesita. `null` = no se dibuja la tarjeta (modelo nuevo, o no se pudo leer). */
  fichaConsumo?: PuertaDeLaFicha | null;
  /** Ajustar el stock de la sede activa desde la ficha (2026-09-29). `null` = la cuenta no tiene «Ajustar stock». */
  ajusteStock?: AjusteStockFicha | null;
  /** La sede de la que se LEE el stock aunque la cuenta no pueda ajustarlo (sin «Ajustar stock» se ve, no se toca). */
  lecturaStock?: LecturaStockFicha | null;
  /** Precio por tienda (Felipe 2026-10-09; 2026-10-10): las tiendas donde esta cuenta puede poner precio (`tiendas`), todas las
   *  abiertas (`todas`, para mostrar el precio en cada una), el precio de la prenda guardado (`general`: null si cambia según la
   *  talla) y la tienda de quien edita (sus precios propios los lee la ficha: `usePreciosDeTienda`). `null` = no se muestra (alta). */
  preciosSede?: {
    tiendas: Tienda[];
    todas: Tienda[];
    general: number | null;
    ubicacionId: string;
    sede: string;
    /** Una terminal: el bloque «Precio por tienda» muestra solo su tienda. */
    soloAqui?: boolean;
  } | null;
  /** Presente = modo edición. */
  producto?: ProductoDetalle;
  /** Adónde va al guardar o cancelar: la Tabla o Grilla de Productos de donde se salió, con sus filtros. */
  volverA?: string;
  /** Cómo lo llama el proveedor (ADR-0556). `undefined` = la base todavía no tiene la columna: la fila no se dibuja. */
  nombreProveedor?: string | null;
}) {
  const router = useRouter();
  const editando = !!producto;
  // Un color creado desde «Agregar color» (ElegirColores lo deja crear, ADR-0260) se suma al vocabulario de la ficha:
  // así se nombra y se pinta igual que los que venían de la base.
  const [coloresCreados, setColoresCreados] = useState<ColorAlta[]>([]);
  const colores = useMemo(
    () => [...coloresVocabulario, ...coloresCreados.filter((c) => !coloresVocabulario.some((x) => x.codigo === c.codigo))],
    [coloresVocabulario, coloresCreados]
  );

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
  // Cada foto con su color de ORIGEN: el guardado, o el que se le puso a mano (ADR-0263). La que se ve es `fotosVista`.
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
  // Lo que el guardado principal YA hizo (correcciones aplicadas, variantes creadas, lo que la hoja dijo que se iba a
  // hacer) hasta que el guardado termina completo: si fallan las etiquetas o la temporada y se reintenta, el aviso final
  // igual ofrece reimprimir etiquetas, dice que las nuevas nacieron sin unidades y nombra todo lo guardado (tras
  // consolidar, las filas y la barra ya no lo recuerdan).
  const logrado = useRef<{ correcciones: boolean; nuevas: number; cargadas: number; frases: string[] }>({ correcciones: false, nuevas: 0, cargadas: 0, frases: [] });
  // Un monto escrito en «Cambiar en bloque» sin pulsar Aplicar: se perdería en silencio al guardar lo demás.
  const [bloquePendiente, setBloquePendiente] = useState<CampoBloque | null>(null);
  // Quien no ve el dinero recibe el costo vacío (null, 20260923193700): la ficha no muestra el campo y la base no lo toca
  // al guardar (`catalogo_actualizar_producto`). Un producto sin variantes todavía no dice nada: se muestra el campo.
  const veCosto = !producto || producto.variantes.length === 0 || producto.variantes.some((v) => v.costo !== null);
  // Editar una prenda firma con UN responsable (ADR-0354, Felipe 2026-10-06): el historial de la prenda dice quién cambió cada
  // cosa. Es el mismo combo del ajuste de stock (`stock.responsable`, recordado por prenda): una sola persona por guardado, y
  // todas las llamadas de «Confirmar y guardar» van con esa firma (son un solo gesto). De 2026-09-29 a 2026-10-06 se guardaba
  // sin elegir a nadie (`producto_confirmar_cambios`) y, en una terminal, el cambio quedaba sin firma.
  const opcionesEtiqueta = etiquetas.map((e) => ({ valor: e.id, texto: e.texto, estilo: e.estilo }));

  // Renombrar: la misma comprobación que al crear, pero SOLO si el nombre cambia de verdad
  // (otra clave): pasar de "blusa aurora" a "Blusa Aurora" no es un nombre nuevo.
  const nombreNuevo = tituloReferencia(referencia);
  const nombreCambio = !!producto && claveReferencia(nombreNuevo) !== claveReferencia(producto.referencia);
  const parecidos = useParecidos({ nombre: nombreNuevo, activo: nombreCambio, excluirId: producto?.id, marcaId });
  const parejaCambio = !!producto && (marcaId !== producto.marcaId || proveedorId !== producto.proveedorId);
  const categoriaActual = categorias.find((c) => c.id === categoriaId);
  // El estándar de nombres (ADR-0556): al renombrar se avisa lo que no lo sigue (un color, una talla, «oferta»…). Solo avisa; un nombre
  // viejo que no se toca no dice nada.
  const avisosNombre = nombreCambio
    ? avisosDeReferencia(referencia, {
        tipos: tiposDeCategoria({ prefijo: categoriaActual?.prefijo, familia: categoriaActual?.familia }),
        colores: colores.flatMap((c) => [c.nombre, ...(c.sinonimos ?? [])]),
        otrosTipos: otrosTipos(categoriaActual?.prefijo),
      })
    : [];
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

  const ctx: ContextoFicha = {
    nombres,
    colores,
    codigoProducto: producto?.codigo ?? null,
    estado: estadoVariantes,
    esLider,
    veCosto,
    costoSinComprobar: costosSinComprobar(producto?.variantes ?? []),
    puedeCorregir,
    ajusteStock,
    precioFijoEn: preciosSede?.soloAqui ? (preciosSede.tiendas[0]?.nombre ?? "") : null,
  };

  // «Para completar esta ficha» (ADR-0284 c): lo que le falta a la prenda para estar completa. Solo guía; guardar no depende de esto.
  // `pendientesAlAbrir` fija cuáles llegaron pendientes: solo esos llevan marca (✓ al completarse), para no llenar de marcas una ficha
  // que ya venía bien.
  const pendientes = pendientesDeFicha({
    activa: estado === "activo",
    pideTejidoPatron: !!categoriaActual?.exigeTejidoPatron,
    hayTejidos: opcionesTejido.length > 0,
    hayPatrones: opcionesPatron.length > 0,
    tejidoId,
    patronId,
    colores: coloresFicha,
    fotos: fotosVista,
    nombreColor: nombres.color,
  });
  const [pendientesAlAbrir] = useState<ReadonlySet<IdPendiente>>(() => new Set(pendientes.map((p) => p.id)));
  const marcaDe = (id: IdPendiente): EstadoCampo | null =>
    !pendientesAlAbrir.has(id) ? null : pendientes.some((p) => p.id === id) ? (pendientes[0].id === id ? "ahora" : "falta") : "hecho";

  // ---------- la ficha como la maqueta B (Felipe 2026-10-02, docs/maquetas/producto-editar-rediseno-2026-10/b-taller.html) ----------
  // Cuatro secciones plegables (abiertas al entrar, como la maqueta), la matriz color × talla con el stepper del stock y, a la
  // derecha, el panel del taller. Plegar no saca nada de la página: quien lleva a un campo abre antes su sección (`abrir`).
  type Seccion = "producto" | "tejido" | "fotos" | "variantes";
  // Al entrar, todo plegado menos «Variantes y precios»: es lo que más se usa (Felipe 2026-10-03). Llegar con #fotos (la pantalla de
  // éxito de Nuevo producto enlaza así) abre también Fotos. Lo demás se abre al tocarlo, o solo cuando la guía lleva a un campo.
  const [abiertas, setAbiertas] = useState<Record<Seccion, boolean>>({ producto: false, tejido: false, fotos: false, variantes: true });
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- el #fotos solo lo sabe el navegador: leerlo al iniciar el estado rompería la hidratación (misma decisión que BajarAlPisoForm)
    if (window.location.hash === "#fotos") setAbiertas((a) => ({ ...a, fotos: true }));
  }, []);
  const abrir = (sec: Seccion) => setAbiertas((a) => (a[sec] ? a : { ...a, [sec]: true }));
  // Qué se escribe en la matriz (Unidades de hoy · Precios · Costos): las pestañas de la tabla, como en «Unidades de hoy» del alta.
  const [vista, setVista] = useState<VistaMatriz>("unidades");
  /** Muestra la pestaña y, ya dibujada (el campo a enfocar recién existe), hace lo que sigue: el foco de un error. */
  function enVista(v: VistaMatriz, luego: () => void) {
    if (vista === v) return luego();
    setVista(v);
    window.setTimeout(luego, 30);
  }
  const [agregandoColor, setAgregandoColor] = useState(false);
  const [agregandoTalla, setAgregandoTalla] = useState(false);
  // La hoja «Etiquetas de lo que entró», al terminar un guardado en que entraron unidades.
  const [imprimir, setImprimir] = useState<{ nombre: string; lineas: LineaParaImprimir[]; href: string } | null>(null);
  // «Corregir color» (del «⋯» de un color) o «Corregir talla» (de la cabecera de una talla): las filas que corrige y de qué eje.
  const [corrigiendo, setCorrigiendo] = useState<{ claves: string[]; ejes: EjesCorreccion } | null>(null);
  // `undefined` = cerrado; un color (o `null`, sin color) = el ajuste de siempre abierto para ese color (ADR-0291: una talla que
  // faltó en un conteo no se suma a ciegas desde el stepper).
  // El candado de una talla guardada (ADR-0494): la hoja «Ajustar stock» que lleva a Existencias. `null` = cerrada.
  const [puerta, setPuerta] = useState<{ varianteId: string; etiqueta: string } | null>(null);
  // El tacho de un color o de una talla (ADR-0494): la hoja que bloquea el archivado con unidades o pide confirmar. `null` = cerrada.
  const [quitando, setQuitando] = useState<{ eje: "color" | "talla"; id: string | null } | null>(null);
  const stock = useStockFicha({ productoId: producto?.id ?? null, ajuste: ajusteStock, lecturaStock });
  const coloresPanel = coloresFicha.filter((c) => c !== "");
  const [colorElegido, setColorElegido] = useState<string | null>(coloresPanel[0] ?? null);
  // Con el mouse encima de un color de la matriz, el panel lo muestra sin elegirlo (`undefined` = vuelve al elegido).
  const [colorVisto, setColorVisto] = useState<string | null | undefined>(undefined);
  const colorFijo = colorElegido !== null && coloresPanel.includes(colorElegido) ? colorElegido : (coloresPanel[0] ?? null);
  const colorMostrado = colorVisto !== undefined && (colorVisto === null || coloresPanel.includes(colorVisto)) ? colorVisto : colorFijo;

  /** Lo que falta (el panel derecho): tejido o patrón abren su sección y llevan al campo; las fotos, el color que no la tiene. */
  function irAPendiente(p: PendienteFicha, colorSinFoto: string | null) {
    if (p.id === "fotos") {
      if (colorSinFoto) setColorElegido(colorSinFoto);
      abrir("fotos");
      return;
    }
    const yaAbierta = abiertas.tejido;
    abrir("tejido");
    // Recién abierta, la sección todavía está creciendo: se espera su animación (320 ms) para que el campo ya esté a la vista.
    window.setTimeout(() => irAlIdCampo(p.id), yaAbierta ? 0 : 340);
  }

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

  /** Las fotos que se eligieron al agregar colores (ya subidas): entran con el color al que se agregaron (ADR-0279). */
  function sumarFotosDeColores(nuevas: { colorCodigo: string; url: string }[]) {
    cambiarFotos(conFotosNuevas(fotosVista, nuevas.map((n) => ({ clientKey: crypto.randomUUID(), id: null, url: n.url, esPrincipal: false, colorCodigo: n.colorCodigo }))));
  }

  // ---------- qué cambió, contra lo que tiene la base (ADR-0257) ----------
  // De aquí salen la barra «Tienes N cambios sin guardar», las marcas de cada fila y la lista de la hoja «Revisa y guarda los
  // cambios». Sin cambios no hay barra, y sin barra no hay dónde guardar: la comparación cubre TODO lo editable. Deshacer a mano
  // un cambio lo quita de la cuenta (una fila agregada y quitada, o un precio devuelto, no son nada que perder).
  const [hojaAbierta, setHojaAbierta] = useState(false);
  // Precio por tienda: los precios propios de la prenda (los comparten el bloque y la hoja) y las tiendas que, al cambiar el precio
  // de la prenda, se pidió igualar al nuevo (Felipe 2026-10-10: «preguntar al guardar»).
  const preciosTienda = usePreciosDeTienda(preciosSede ? producto?.id : null);
  // El precio propio de la tienda de quien edita, para la cabecera de «Variantes y precios» («S/ 69.90 en TRU»).
  const propioAqui = preciosSede ? preciosTienda.precios?.find((p) => p.ubicacionId === preciosSede.ubicacionId) : undefined;
  const precioPropioAqui = propioAqui ? { sede: nombreCorto(propioAqui.sede), precio: propioAqui.precio } : null;
  // El precio de esta tienda después del último guardado (o null: el de la prenda), para la vista previa de las etiquetas.
  const precioAquiTras = useRef<number | null>(null);
  // Los precios propios que siguen después del último guardado (los igualados se van), para ver en qué tiendas cambió el precio en caja.
  const propiosTras = useRef<ReadonlyMap<string, number>>(new Map());
  const [igualarTiendas, setIgualarTiendas] = useState<ReadonlySet<string>>(new Set());
  // Una terminal escribe el precio de SU tienda en la tabla de «Precios», como un costo (Felipe 2026-10-27), y se guarda con «Revisar y
  // guardar» (`poner_precio_sede`, o `quitar_precio_sede` si vuelve al de la prenda). `null` = no se tocó. Sin motivo que escribir: quién
  // lo cambió lo dice la firma del responsable (Felipe 2026-10-27).
  const tiendaTerminal = preciosSede?.soloAqui ? (preciosSede.tiendas[0] ?? null) : null;
  const [precioAquiEscrito, setPrecioAquiEscrito] = useState<string | null>(null);
  const propioTerminal = tiendaTerminal ? preciosTienda.precios?.find((p) => p.ubicacionId === tiendaTerminal.id) : undefined;
  // Mientras se leen los precios de la tienda no se sabe a cuánto vende: la celda espera (sin caja) y nada cuenta como cambio.
  const precioAquiListo = !!tiendaTerminal && preciosTienda.precios !== null;
  const cambioAqui: CambioPrecioAqui =
    precioAquiListo && preciosSede
      ? cambioPrecioAqui({ escrito: precioAquiEscrito, propio: propioTerminal?.precio ?? null, general: preciosSede.general })
      : { que: "nada" };
  // Ya se guardó bien y la pantalla se está yendo: la barra baja y nada más pregunta.
  const [guardado, setGuardado] = useState(false);

  function datosDeLaPrenda(): DatosPrenda {
    return { referencia, categoriaId, descripcion, estado, stockMinimo, temporada, permitirVentaSinStock, tejidoId, patronId, marcaId, proveedorId };
  }
  function capturar(): EstadoFicha {
    return { ...datosDeLaPrenda(), fotos, filas, temporadaEditada };
  }
  // Lo que había al abrir: se toma UNA vez. (Todo el estado se actualiza sin mutar, así que esta foto no se ensucia.)
  const [inicial] = useState<EstadoFicha>(capturar);
  // Lo que tiene la BASE de la prenda y de sus fotos: al abrir, lo de `inicial`; tras un guardado principal bueno, lo que se
  // mandó. Las variantes no van aquí: cada fila lleva lo suyo en `guardada` (`consolidar` lo actualiza). Contra esto se
  // cuenta lo que falta guardar y a esto vuelve el «Deshacer» de un campo.
  const [enLaBase, setEnLaBase] = useState<{ datos: DatosPrenda; fotos: FotoFicha[] }>(() => ({
    datos: {
      referencia: inicial.referencia,
      categoriaId: inicial.categoriaId,
      descripcion: inicial.descripcion,
      estado: inicial.estado,
      stockMinimo: inicial.stockMinimo,
      temporada: inicial.temporada,
      permitirVentaSinStock: inicial.permitirVentaSinStock,
      tejidoId: inicial.tejidoId,
      patronId: inicial.patronId,
      marcaId: inicial.marcaId,
      proveedorId: inicial.proveedorId,
    },
    fotos: inicial.fotos,
  }));
  // El guardado principal ya salió bien y falló lo que sigue (etiquetas, temporada, o la corrección no se aplicó): la barra
  // lo dice («lo demás ya quedó guardado») en vez de «Aún no se guardó nada», que contradecía al aviso de error.
  const [seGuardoParte, setSeGuardoParte] = useState(false);
  // Sube con «Descartar» (y su «Deshacer»): «Cambiar en bloque» vuelve a nacer, y con él lo que guarda por su cuenta («Precio
  // puesto en N variantes…»).
  const [reinicio, setReinicio] = useState(0);

  // ---------- lo que cobra la caja hoy (ADR-0472) ----------
  // Una etiqueta con descuento no cambia `variantes.precio`: la caja la descuenta al cobrar. Sin decirlo aquí, poner «Aniversario
  // CAYLA» y guardar parecía no hacer nada (Felipe, 2026-10-21). Lo guardado es lo que la caja cobra ahora; lo que está en pantalla, lo
  // que cobrará al guardar. Con precio propio de esta tienda, su caja cobra desde ese (es uno para toda la prenda, ADR-0370).
  const precioCajaAqui = propioAqui?.precio ?? null;
  const fraseCampana = producto && campanas ? fraseDeLaFicha(campanas, filas, enLaBase.datos.categoriaId, categoriaId, precioCajaAqui, propioAqui ? nombreCorto(propioAqui.sede) : null) : null;
  // Lo guardado al empezar un guardado (variantes, categoría y precios propios de cada tienda): al terminar se compara el precio en caja
  // de antes y de después, tienda por tienda, y si cambió (una campaña que entra o sale, otro precio) el aviso ofrece reimprimir sus
  // etiquetas de papel (ADR-0180: el papel dice lo que cobra la caja el día que se imprime). Se toma una vez y sobrevive a los reintentos
  // de un guardado a medias, como `logrado`.
  const cobraAntesDeGuardar = useRef<LadoDeLaFicha | null>(null);
  const propiosDeTienda = () => new Map((preciosTienda.precios ?? []).map((p) => [p.ubicacionId, p.precio] as const));

  // Lo que impide guardar de las variantes (y un monto escrito en «Cambiar en bloque» sin aplicar): «Revisar y guardar» lo
  // dice con el campo a enfocar. Lo que solo avisa (todas quedan desactivadas) se lee en la hoja, antes de confirmar. La
  // sección de variantes marca sus filas con ESTA misma lista (una sola cuenta). La talla de cada variante nueva o corregida
  // se revisa contra la categoría ELEGIDA: es contra la que valida la base.
  const problemas = problemasVariantes(filas, nombres, {
    tallasHabilitadas: tallasCategoria.map((t) => t.id),
    nombre: categoriaActual?.nombre,
    cambio: categoriaId !== enLaBase.datos.categoriaId,
    admitePrecioCero: !!categoriaActual?.admitePrecioCero,
  });
  const avisoBloque = avisoBloqueSinAplicar(bloquePendiente);
  const avisosSinBloquear = problemas.filter((p) => !p.bloquea).map((p) => p.texto);
  // El piso del precio de una tienda (`costoMaximoGuardado`) mira las tallas que ese precio alcanza: la de obsequio (0 en una categoría
  // que admite el 0) no; la de ropa en 0, sí (20261015121000). Con la categoría GUARDADA, la que mira la base (`poner_precio_sede`).
  const admiteCeroGuardada = !!categorias.find((c) => c.id === enLaBase.datos.categoriaId)?.admitePrecioCero;

  function aplicar(e: EstadoFicha) {
    setReferencia(e.referencia);
    setCategoriaId(e.categoriaId);
    setDescripcion(e.descripcion);
    setEstado(e.estado);
    setStockMinimo(e.stockMinimo);
    setTemporada(e.temporada);
    setPermitirVentaSinStock(e.permitirVentaSinStock);
    setTejidoId(e.tejidoId);
    setPatronId(e.patronId);
    setMarcaId(e.marcaId);
    setProveedorId(e.proveedorId);
    setFotos(e.fotos);
    setFilas(e.filas);
    setTemporadaEditada(e.temporadaEditada);
  }

  const nombresCambios: NombresCambios = {
    categoria: (id) => categorias.find((c) => c.id === id)?.nombre ?? "otra categoría",
    // Se busca en todas las categorías: si se cambió de categoría, el tejido de ANTES vive en la lista de la de antes.
    tejido: (id) => Object.values(ejes.tejidos).flat().find((t) => t.id === id)?.texto ?? producto?.tejido ?? "otro tejido",
    patron: (id) => Object.values(ejes.patrones).flat().find((t) => t.id === id)?.texto ?? producto?.patron ?? "otro patrón",
    marca: (id) => marcas.marcas.find((m) => m.id === id)?.nombre ?? (id === producto?.marcaId ? producto.marcaNombre : "otra marca"),
    proveedor: (id) => marcas.proveedores.find((p) => p.id === id)?.nombre ?? (id === producto?.proveedorId ? producto.proveedorNombre : "otro proveedor"),
    temporada: (clave) => opcionesTemporadaPrenda.find((o) => o.valor === clave)?.texto ?? (clave === SIN_PROPIA ? "Sin temporada" : clave),
    temporadaColor: (clave) => opcionesTemporadaColor.find((o) => o.valor === clave)?.texto ?? (clave === SIN_PROPIA ? "Igual que su prenda" : clave),
    color: (codigo) => nombres.color(codigo),
    etiqueta: (id) => etiquetas.find((e) => e.id === id)?.texto ?? "etiqueta",
  };
  // Lo guardado y lo de ahora, con las mismas mudanzas: las fotos y la temporada que se van con un color corregido son parte
  // de esa corrección (la base las muda sola), no un cambio aparte. De la temporada por color cuenta lo que SE MANDA.
  const variantesResumen = variantesParaResumen(filas, nombres, estadoVariantes);
  const fichaEditable = (datos: DatosPrenda, fotosFicha: readonly FotoLocal[], porColor: Record<string, string>, variantes: VarianteFicha[]): FichaEditable => ({
    ...datos,
    temporadaColor: porColor,
    fotos: fotosFicha.map((f) => ({ id: f.id, url: f.url, esPrincipal: f.esPrincipal, colorCodigo: f.colorCodigo })),
    variantes,
  });
  const fotosGuardadas = fotosComoSeVen(enLaBase.fotos, mudanzas);
  const resumen: ResumenCambios = resumenDeCambios(
    fichaEditable(enLaBase.datos, fotosGuardadas, porColorGuardado, variantesResumen.guardadas),
    fichaEditable(datosDeLaPrenda(), fotosVista, conCambiosDeColor(porColorGuardado, cambiosColor), variantesResumen.ahora),
    nombresCambios
  );
  // El stock ya no se toca desde aquí (ADR-0494, actividad 3): lo de las variantes NUEVAS ya cuenta con ellas («agregan»).
  const totalCambios = resumen.total + (cambioAqui.que === "nada" ? 0 : 1);
  // El precio de la tienda escrito en la tabla, como un grupo más de la hoja «Revisa y guarda».
  const grupoPrecioAqui =
    tiendaTerminal && (cambioAqui.que === "poner" || cambioAqui.que === "quitar")
      ? {
          titulo: `Precio en ${nombreCorto(tiendaTerminal.nombre)}`,
          lineas: [
            {
              texto: "Todas las tallas",
              antes: cambioAqui.antes !== null ? soles(cambioAqui.antes) : "Según la talla",
              despues: soles(cambioAqui.que === "poner" ? cambioAqui.precio : cambioAqui.general),
            },
          ],
          nota:
            cambioAqui.que === "poner"
              ? "Las otras tiendas no cambian."
              : "Vuelve al precio de la prenda: deja de tener precio propio. Las otras tiendas no cambian.",
        }
      : null;
  // Si cambió el precio de alguna talla activa y alguna tienda tiene precio propio: qué pasa en cada tienda (la hoja lo pregunta).
  const preciosActivos = (vs: readonly { activo: boolean; precio: string }[]) => vs.filter((v) => v.activo).map((v) => Number(v.precio)).filter((n) => n > 0);
  const alCambiarPrecio =
    preciosSede && preciosTienda.precios
      ? tiendasAlCambiarPrecio({
          propios: preciosTienda.precios,
          tiendas: preciosSede.todas,
          antes: preciosActivos(variantesResumen.guardadas),
          despues: preciosActivos(variantesResumen.ahora),
          puedeTocar: (id) => preciosSede.tiendas.some((t) => t.id === id),
        })
      : null;
  const hayCambios = !guardado && totalCambios > 0;
  // «¿Salir sin guardar?» (Felipe, 2026-09-28: «preguntar antes de perder»): el aviso de Compras y Recibir, con esta frase.
  // Cubre enlaces, Atrás y cerrar la pestaña; ver `useSalidaSinGuardar`.
  const salida = useSalidaSinGuardar(hayCambios, textoDeSalidaDeFicha(totalCambios, producto?.referencia ?? referencia));

  function recargar() {
    // Recargar es justamente descartar lo escrito (otra persona guardó antes): sin el aviso nativo encima.
    salida.soltar();
    window.location.reload();
  }

  /** ¿Ya se guardó algo de esta ficha (el guardado principal salió bien y otra parte falló)? Entonces lo de al abrir ya no es lo
   *  que tiene la base, y «Descartar» recarga en vez de volver a esa foto vieja. */
  const seGuardoAlgo = () => versionRef.current !== (producto?.version ?? null);

  /** «Revisar y guardar»: lo que la base exigiría igual, dicho aquí con el campo a enfocar. Recién con todo en orden se abre la
   *  hoja «Revisa y guarda los cambios»; ahí se confirma. */
  function revisar(e?: React.FormEvent) {
    e?.preventDefault();
    if (!producto) return void avisar.error("Esta pantalla solo edita productos. Para crear uno usa Nuevo producto.");
    if (!hayCambios) return;
    if (versionCambiada) {
      return void avisar.error("Otra persona cambió esta prenda: recárgala para poder guardar.", { accion: { texto: "Recargar", onClick: recargar } });
    }
    if (hayQueRecargar) {
      // Lo principal ya se guardó pero no se supo cómo quedaron las variantes: guardar otra vez crearía las nuevas dos veces.
      return void avisar.error("Recarga la prenda antes de seguir: lo principal ya quedó guardado.", { accion: { texto: "Recargar", onClick: recargar } });
    }
    // Un error lleva a su campo: si su sección estaba plegada, se abre primero (el foco no llega a lo invisible).
    if (!referencia.trim()) {
      abrir("producto");
      return void avisar.error("Falta la referencia del producto.", { enfocar: "producto-referencia" });
    }
    if (stockMinimo.trim() !== "" && (!/^\d+$/.test(stockMinimo.trim()) || Number(stockMinimo) < 0)) {
      abrir("tejido");
      return void avisar.error("El stock mínimo tiene que ser un número entero, 0 o mayor.", { enfocar: "producto-stock-minimo" });
    }
    // Marca y proveedor pueden faltar (ADR-0283), pero lo que el producto ya tenía se cambia, no se deja en blanco.
    const sinDejarEnBlanco = problemaAlEditar({ marcaId: producto?.marcaId ?? "", proveedorId: producto?.proveedorId ?? "" }, { marcaId, proveedorId });
    if (sinDejarEnBlanco) {
      abrir("producto");
      return void avisar.error(sinDejarEnBlanco, { enfocar: "producto-marca" });
    }
    if (nombreCambio) abrir("producto");
    if (nombreCambio && parecidos.comprobando) return void avisar.error("Espera un momento: se está comprobando que el nombre no exista todavía.", { enfocar: "producto-referencia" });
    if (nombreCambio && parecidos.hayIdentico) return void avisar.error("Ya existe un producto con ese nombre.", { enfocar: "producto-referencia" });
    if (nombreCambio && parecidos.hayUnaLetra && !parecidos.confirmo) {
      return void avisar.error("Ese nombre se escribe casi igual que otro producto: confirma que es distinto, o déjalo como estaba.", { enfocar: "producto-referencia" });
    }
    if ((exigeTejido && !tejidoId) || (exigePatron && !patronId)) abrir("tejido");
    if (exigeTejido && !tejidoId) return void avisar.error(`Esta prenda ya tenía tejido y en ${categoriaActual?.nombre ?? "esta categoría"} no se puede dejar sin él. Elige uno.`);
    if (exigePatron && !patronId) return void avisar.error("Esta prenda ya tenía patrón y no se puede dejar sin él (si no tiene diseño, elige Liso).");
    if (avisoBloque && bloquePendiente) {
      abrir("variantes");
      return void enVista(bloquePendiente, () => avisar.error(avisoBloque, { enfocar: "variantes-bloque-monto" }));
    }
    const bloqueante = problemas.find((p) => p.bloquea);
    if (bloqueante) {
      abrir("variantes");
      const enfocar = bloqueante.clave ? `producto-variante-${bloqueante.clave}-precio` : filas.length === 0 ? "variantes-agregar-color" : undefined;
      return void enVista(bloqueante.clave ? "precio" : vista, () => avisar.error(bloqueante.texto, enfocar ? { enfocar } : undefined));
    }
    // El precio de la tienda escrito en la tabla (terminal): lo que la base rechazaría, con la celda a corregir.
    if (tiendaTerminal && cambioAqui.que !== "nada") {
      const costoAqui = veCosto ? costoMaximoGuardado(filas, admiteCeroGuardada) : null;
      const problemaAqui = problemaPrecioAqui(cambioAqui, tiendaTerminal.nombre, preciosSede?.general ?? null, costoAqui);
      const primeraCelda = filas.find((f) => f.activo && f.guardada);
      if (problemaAqui) {
        abrir("variantes");
        return void enVista("precio", () =>
          avisar.error(problemaAqui, primeraCelda ? { enfocar: `producto-variante-${primeraCelda.clave}-precio` } : undefined)
        );
      }
    }
    setHojaAbierta(true);
  }

  /** El precio de la tienda que la terminal escribió en la tabla (Felipe 2026-10-27). Va después del guardado de la prenda, con la misma
   *  firma. Devuelve la frase para el aviso de éxito; `null` si no había nada; `false` si falló (ya avisó; lo escrito sigue en la tabla
   *  y «Revisar y guardar» lo vuelve a intentar). `"responsable"`: quien firma ya no está de turno, la hoja sigue abierta. */
  async function guardarPrecioAqui(supabase: ReturnType<typeof createClient>, firma: NonNullable<ReturnType<typeof stock.responsable.firma>>, nombrePrenda: string) {
    if (!producto || !tiendaTerminal || (cambioAqui.que !== "poner" && cambioAqui.que !== "quitar")) return null;
    const corto = nombreCorto(tiendaTerminal.nombre);
    const { error } = await firmar(
      cambioAqui.que === "poner"
        ? supabase.rpc("poner_precio_sede", {
            p_producto_id: producto.id,
            p_ubicacion_id: tiendaTerminal.id,
            p_precio: cambioAqui.precio,
            p_motivo: MOTIVO_DESDE_LA_TABLA,
          })
        : supabase.rpc("quitar_precio_sede", { p_producto_id: producto.id, p_ubicacion_id: tiendaTerminal.id, p_motivo: "Vuelve al precio de la prenda" }),
      firma
    );
    stock.responsable.despues(error);
    if (error && esErrorDeResponsable(error)) {
      avisar.error(traducirError(error, `guardar el precio de ${corto}`), { enfocar: "confirmar-cambios-responsable" });
      return "responsable" as const;
    }
    if (error) {
      avisar.error(traducirError(error, `guardar el precio de ${corto}`), {
        detalle: resumen.total > 0 ? `${nombrePrenda} ya quedó guardado; el precio de ${corto} sigue como estaba.` : undefined,
      });
      return false as const;
    }
    // Lo que la caja de esta tienda cobra después (la vista previa de las etiquetas y el aviso de reimprimir lo miran).
    const nuevo = cambioAqui.que === "poner" ? cambioAqui.precio : null;
    precioAquiTras.current = nuevo;
    const tras = new Map(propiosTras.current);
    if (nuevo !== null) tras.set(tiendaTerminal.id, nuevo);
    else tras.delete(tiendaTerminal.id);
    propiosTras.current = tras;
    setPrecioAquiEscrito(null);
    preciosTienda.recargar();
    return nuevo !== null ? `${corto} vende a ${soles(nuevo)}` : `${corto} vuelve al precio de la prenda`;
  }

  /** «Confirmar y guardar», desde la hoja. Devuelve si la hoja debe cerrarse: `false` solo cuando falta o no vale el «Responsable»
   *  (se elige ahí mismo, en la hoja); con cualquier otro error se cierra para que se vea la ficha y el campo a corregir. */
  async function guardar(): Promise<boolean> {
    if (!producto) return true;
    precioAquiTras.current = propioAqui?.precio ?? null;
    propiosTras.current = propiosDeTienda();
    // Lo que cobra la caja ANTES de tocar nada; si el guardado queda a medias y se reintenta, sigue el primero.
    cobraAntesDeGuardar.current ??= { variantes: variantesGuardadas(filas, null), categoriaId: enLaBase.datos.categoriaId || null, propios: propiosDeTienda() };
    // Solo se tocó el precio de la tienda (en una terminal): no hay nada de la prenda que mandar (ni versión que subir, ni
    // historial que escribir).
    if (resumen.total === 0) {
      const firmaAqui = cambioAqui.que === "nada" ? null : stock.responsable.firma();
      if (cambioAqui.que !== "nada" && !firmaAqui) {
        avisar.error(stock.responsable.motivo ?? "Elige quién hace estos cambios.", { enfocar: "confirmar-cambios-responsable" });
        return false;
      }
      setLoading(true);
      const cerrarProceso = avisar.proceso(`Guardando el precio de ${referencia.trim()}…`);
      const fraseAqui = firmaAqui ? await guardarPrecioAqui(createClient(), firmaAqui, referencia.trim()) : null;
      if (fraseAqui === false || fraseAqui === "responsable") {
        cerrarProceso();
        setLoading(false);
        if (fraseAqui === false) setHojaAbierta(false);
        return fraseAqui === false;
      }
      cerrarProceso();
      setLoading(false);
      setHojaAbierta(false);
      terminarGuardado(referencia.trim(), fraseAqui ? [fraseAqui] : [], false, 0, 0, filas);
      return true;
    }
    const firma = stock.responsable.firma();
    if (!firma) {
      avisar.error(stock.responsable.motivo ?? "Elige quién hace estos cambios.", { enfocar: "confirmar-cambios-responsable" });
      return false;
    }
    // Lo que dirá el aviso de éxito, tomado ANTES de que el guardado toque nada.
    const hecho = resumen.frasesPasado;

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
    // tallas de esta prenda las toma en otro orden, la base deshace entera a una de las dos (40P01, ADR-0263 T8). Si cae
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
        // Solo se manda el que tiene valor: un campo vacío = «no tocar» (la base no deja borrar lo guardado).
        ...(parejaCambio ? { ...(marcaId ? { p_marca_id: marcaId } : {}), ...(proveedorId ? { p_proveedor_id: proveedorId } : {}) } : {}),
        ...(parecidos.confirmo ? { p_confirmo_distinto: true } : {}),
        ...(versionRef.current !== null ? { p_version_esperada: versionRef.current } : {}),
      }),
      firma
    ));

    stock.responsable.despues(error);
    if (error && esErrorDeResponsable(error)) {
      // Quien se eligió ya no está de turno (o no marcó su entrada): la hoja sigue abierta para elegir a otra persona.
      cerrarProceso();
      setLoading(false);
      avisar.error(traducirError(error, "guardar el producto"), { enfocar: "confirmar-cambios-responsable" });
      return false;
    }
    if (error) {
      cerrarProceso();
      setLoading(false);
      // La hoja se cierra ANTES de avisar, para que el foco pueda irse al campo que hay que corregir.
      setHojaAbierta(false);
      if (esVersionCambiada(error)) {
        // Otra persona guardó esta prenda mientras se editaba: el formulario NO se cierra (lo escrito sigue a la vista
        // para anotarlo) y se ofrece recargar, que trae sus cambios. La barra pasa a decirlo y a ofrecer «Recargar».
        setVersionCambiada(true);
        avisar.error(traducirError(error, "guardar el producto"), { accion: { texto: "Recargar", onClick: recargar } });
        return true;
      }
      const lectura = leerErrorAlta(error);
      if (lectura.tipo !== "otro") {
        // Otra persona creó ese nombre mientras se editaba: se muestra en pantalla, no solo en un aviso.
        parecidos.reintentar();
        avisar.error(lectura.mensaje, { enfocar: "producto-referencia" });
        return true;
      }
      // Cayó dos veces seguidas por el mismo choque: se dice con palabras, no con «deadlock detected».
      avisar.error(esChoqueDeCandados(error) ? FRASE_CHOQUE_DE_CANDADOS : traducirError(error, "guardar el producto"));
      return true;
    }
    if (typeof versionNueva === "number") versionRef.current = versionNueva;
    setSeGuardoParte(true);
    // Lo principal ya está en la base: desde aquí, «sin guardar» se mide contra esto (la barra dice solo lo que falta).
    setEnLaBase({ datos: datosDeLaPrenda(), fotos: fotosVista.map((f) => ({ ...f, fijo: false })) });
    logrado.current.frases = [...new Set([...logrado.current.frases, ...hecho])];

    // Precio por tienda (Felipe 2026-10-10, «preguntar al guardar»): las tiendas que en la hoja se pidió igualar al precio nuevo de la
    // prenda pierden su precio propio. Va JUSTO después del guardado principal (el precio nuevo ya está en la base) y antes del stock,
    // las etiquetas y la temporada: si uno de esos falla, el reintento ya no ve un cambio de precio y la casilla se perdería. Si falla,
    // la prenda igual quedó guardada y esa tienda sigue con su precio: el aviso lo dice, y se iguala desde «Precio por tienda».
    const igualadas = new Set<string>();
    for (const t of alCambiarPrecio?.conPropio.filter((x) => x.que === "se-queda" && x.puedeIgualar && igualarTiendas.has(x.ubicacionId)) ?? []) {
      const { error: errorIgualar } = await firmar(
        supabase.rpc("quitar_precio_sede", { p_producto_id: producto.id, p_ubicacion_id: t.ubicacionId, p_motivo: "Igualado al nuevo precio de la prenda" }),
        firma
      );
      if (errorIgualar) {
        avisar.error(traducirError(errorIgualar, `igualar el precio de ${t.sede}`), {
          detalle: `${nombrePrenda} ya quedó guardado; ${t.sede} sigue con su precio propio. Iguálalo desde «Precio por tienda».`,
        });
        break;
      }
      igualadas.add(t.ubicacionId);
    }
    setIgualarTiendas(new Set());
    // El precio propio de esta tienda que sigue vigente después del guardado (la vista previa de «Etiquetas de lo que entró» sale con él):
    // ni se igualó a mano ni quedó igual al de la prenda (la base lo quita sola).
    const quedaIgual = (ubicacionId: string) =>
      alCambiarPrecio?.conPropio.some((t) => t.ubicacionId === ubicacionId && (t.que === "se-iguala" || igualadas.has(t.ubicacionId))) ?? false;
    precioAquiTras.current = propioAqui && !quedaIgual(propioAqui.ubicacionId) ? propioAqui.precio : null;
    propiosTras.current = new Map([...propiosDeTienda()].filter(([ubicacionId]) => !quedaIgual(ubicacionId)));
    // La base quita sola el precio propio que quedó igual al de la prenda: el bloque se vuelve a leer.
    if ((preciosTienda.precios?.length ?? 0) > 0) preciosTienda.recargar();
    // El precio de la tienda que la terminal escribió en la tabla. Si falla, la prenda igual quedó guardada y lo escrito sigue en la
    // tabla (la barra lo cuenta): «Revisar y guardar» lo vuelve a intentar.
    const fraseAqui = await guardarPrecioAqui(supabase, firma, nombrePrenda);
    if (fraseAqui === false || fraseAqui === "responsable") {
      cerrarProceso();
      setLoading(false);
      setHojaAbierta(false);
      return true;
    }
    if (fraseAqui) logrado.current.frases = [...logrado.current.frases, fraseAqui];

    // Cómo quedaron las variantes: los ids de las nuevas (para sus etiquetas) y si la base aplicó las correcciones. Con
    // la base sin el SQL de ADR-0263, `catalogo_actualizar_producto` ignora el color y la talla de una variante que ya
    // existe SIN error: decir «guardado» sería el mismo engaño que D-133 cerró el 2026-09-26.
    const { data: deLaBase, error: errorLectura } = await supabase.from("variantes").select("id, color_codigo, talla_id, codigo").eq("producto_id", producto.id);
    if (errorLectura || !deLaBase) {
      cerrarProceso();
      setLoading(false);
      setHayQueRecargar(true);
      setHojaAbierta(false);
      avisar.error(`${nombrePrenda} ya quedó guardado, pero no se pudo leer cómo quedaron sus variantes.`, {
        detalle: "Recarga la ficha antes de seguir: así no se crea ninguna variante dos veces.",
        accion: { texto: "Recargar", onClick: recargar },
      });
      return true;
    }
    const sinAplicar = correccionesSinAplicar(filas, deLaBase);
    if (corregidas > sinAplicar.length) logrado.current.correcciones = true;
    logrado.current.nuevas += nuevas;
    let actuales = consolidar(filas, deLaBase);
    setFilas(actuales);
    // Junto con las filas consolidadas, y ANTES de cualquier paso que pueda fallar (stock, etiquetas, temporada): si una corrección
    // ya se aplicó y el stock falla después, las fotos y la temporada no pueden quedarse ancladas al color viejo (el reintento las
    // mandaría a un color que la prenda ya no tiene; revisión del 2026-10-03).
    if (sinAplicar.length === 0) {
      // La base corrigió y mudó fotos y temporada de los colores que se quedaron sin variantes: lo que se veía pasa a ser
      // lo guardado, y a la vez (en la misma pintada) su origen, porque las filas consolidadas ya no tienen mudanzas.
      // Si la base no corrigió (sin el SQL), tampoco mudó nada: todo sigue anclado como estaba.
      setPorColorBase(porColorGuardado);
      setFotos(fotosVista.map((f) => ({ ...f, fijo: false })));
      setTemporadaEditada(Object.entries(temporadaUbicada).map(([color, clave]) => ({ origen: color, fijo: false, clave })));
    }
    // Lo que se puso en las variantes NUEVAS (sus unidades de partida) entra ahora como stock inicial (ya existen y tienen id). Va aparte del
    // guardado de la prenda: si falla, la prenda igual quedó guardada y el aviso lo dice.
    const eranNuevas = new Set(filas.filter((f) => !f.id).map((f) => f.clave));
    const recienCreadas = actuales.filter((f) => eranNuevas.has(f.clave) && f.id);
    logrado.current.cargadas += await stock.cargarNuevas(
      new Map(recienCreadas.map((f) => [f.clave, f.id!])),
      new Map(recienCreadas.map((f) => [f.clave, { color: nombres.color(f.colorCodigo), talla: nombres.talla(f.tallaId) || null }]))
    );
    // Las recién creadas no estaban en el stock leído al abrir: sin releerlo, si la ficha sigue abierta (algo de abajo falla) se ven en 0
    // aunque su stock inicial entró.
    if (recienCreadas.length > 0) stock.recargar();
    const mudanzasTras = mudanzasAlGuardar(actuales);

    // Etiquetas por variante: en la MISMA acción, después del guardado principal, UNA llamada y solo las que cambiaron
    // (mandarlas todas pisaría `variante_etiquetas.created_at` sin motivo). Las nuevas ya tienen id (`consolidar`).
    const asignaciones = asignacionesDeEtiquetas(actuales);
    if (asignaciones.length > 0) {
      const { error: errorEtiquetas } = await firmar(supabase.rpc("actualizar_variantes_etiquetas", { p_asignaciones: asignaciones }), firma);
      if (errorEtiquetas) {
        cerrarProceso();
        setLoading(false);
        // Si falla, la barra sigue con los cambios: «Revisar y guardar» de nuevo es el mismo gesto.
        setHojaAbierta(false);
        avisar.error(traducirError(errorEtiquetas, "guardar las etiquetas de las variantes"), {
          detalle: `${nombrePrenda} ya quedó guardado — vuelve a pulsar «Revisar y guardar» para las etiquetas.`,
        });
        return true;
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
        setHojaAbierta(false);
        avisar.error(traducirError(errorTemporada, "guardar la temporada de los colores"), {
          detalle: `${nombrePrenda} ya quedó guardado — vuelve a pulsar «Revisar y guardar» para la temporada de los colores.`,
        });
        return true;
      }
      // Lo guardado = lo que había + lo que se acaba de mandar; lo elegido a mano para esos colores ya no está pendiente.
      const aplicados = cambiosColor;
      setPorColorBase(conCambiosDeColor(porColorGuardado, aplicados));
      setTemporadaEditada((actual) =>
        actual.filter((e) => {
          const color = ubicar(e, mudanzasTras);
          return color === null || !(color in aplicados);
        })
      );
    }

    cerrarProceso();
    setLoading(false);

    if (sinAplicar.length > 0) {
      // Red de seguridad: la ficha no ofrece corregir sin la función de la base (`puedeCorregir`), pero si igual llega
      // aquí, se queda abierta con las correcciones a la vista, pendientes (la barra las sigue contando), para no perderlas.
      setHojaAbierta(false);
      avisar.error("Se guardó lo demás, pero el color y la talla no se corrigieron.", {
        detalle: "El sistema todavía no pudo corregir el color o la talla; avisa a un líder. Tu corrección sigue en la ficha.",
      });
      return true;
    }

    // El guardado terminó completo: lo logrado se lee (aunque haya llegado en un reintento) y se olvida.
    const { correcciones: huboCorrecciones, nuevas: creadas, cargadas, frases } = logrado.current;
    logrado.current = { correcciones: false, nuevas: 0, cargadas: 0, frases: [] };
    setHojaAbierta(false);
    terminarGuardado(nombrePrenda, [...new Set([...frases, ...hecho])], huboCorrecciones, creadas, cargadas, actuales);
    return true;
  }

  /** El final de un guardado completo: la barra baja, el aviso dice qué se guardó y, si entraron unidades, ofrece imprimir justo
   *  sus etiquetas (Felipe, 2026-10-02: «luego de guardados, el sistema te sugiere imprimir ese ticket»). Al volver a Productos
   *  queda además la franja «prendas nuevas sin etiquetar» hasta imprimirlas o cambiar de módulo (`RecordatorioEtiquetas`). */
  function terminarGuardado(
    nombrePrenda: string,
    hechoTodo: string[],
    huboCorrecciones: boolean,
    creadas: number,
    cargadas: number,
    /** Las filas como quedaron (las nuevas ya con id): de ahí salen el color, la talla y el precio de lo que entró. */
    filasFinales: readonly FilaFicha[]
  ) {
    if (!producto) return;
    // Lo que se confirmó en la hoja (esta función es del render en que se pulsó «Confirmar y guardar»).
    const subidas = stock.tomarSubidas();
    const unidadesNuevas = subidas.reduce((s, x) => s + x.unidades, 0);
    const hrefSubidas = hrefEtiquetasDeSubidas(subidas);
    // Entró stock (subió una talla o un color nuevo nació con unidades) y no hubo correcciones: la hoja grande «Etiquetas de lo
    // que entró» (Felipe 2026-10-03), con una etiqueta por cada prenda que entró. Tras corregir color o talla se reimprime TODO
    // (lo pegado ya no dice lo correcto): eso sigue siendo el botón del aviso.
    // El precio de la tienda es de la PRENDA (2026-10-10): vale para toda talla, también la que nació en este guardado (que no estaba en
    // el mapa leído al abrir). Sin precio propio vigente, el de cada talla.
    const precioAqui = precioAquiTras.current;
    const preciosAquiTras = precioAqui !== null ? Object.fromEntries(filasFinales.filter((f) => f.id).map((f) => [f.id!, precioAqui])) : {};
    // ADR-0472: si el precio que cobra la caja HOY cambió en alguna variante que ya existía (una campaña que entra o sale, otro precio),
    // sus etiquetas de papel dicen el de antes. Se ofrecen esas (y lo que entró, que también necesita la suya), en vez de la hoja de
    // «lo que entró», que solo imprimiría las nuevas. Tienda por tienda (ADR-0486, ADR-0370): si cambió solo en otras tiendas, el aviso las
    // nombra y el botón no sale, porque la impresión de aquí sale con el precio de aquí, que no cambió.
    const antes = cobraAntesDeGuardar.current;
    cobraAntesDeGuardar.current = null;
    const cambian = antes
      ? cambianEnCajaAlGuardar(
          antes,
          { variantes: variantesEnPantalla(filasFinales, null), categoriaId: categoriaId || null, propios: propiosTras.current },
          campanas?.vocabulario ?? [],
          campanas?.hoy ?? hoyLima(),
          { tiendas: preciosSede?.todas ?? [], aqui: preciosSede?.ubicacionId ?? null }
        )
      : null;
    const reimprimir = huboCorrecciones || !cambian ? null : avisoReimprimir(cambian);
    const idsReimprimir = [...new Set([...(cambian?.quedan ?? []), ...(cambian?.salen ?? []), ...subidas.filter((x) => x.unidades > 0).map((x) => x.varianteId)])];
    const lineas = !huboCorrecciones && !reimprimir?.boton && hrefSubidas ? lineasParaImprimir(subidas, filasFinales, nombres, preciosAquiTras) : [];
    // La barra baja y nada más pregunta al salir; el aviso dice qué se guardó (la prueba de que quedó hecho).
    setGuardado(true);
    if (lineas.length > 0 && hrefSubidas) {
      avisar.exito(`${nombrePrenda} guardado`, {
        detalle: [
          hechoTodo.length > 0 ? hechoTodo.join(", ") : null,
          `entraron ${unidadesNuevas} ${unidadesNuevas === 1 ? "unidad" : "unidades"}`,
          // Cambió el precio solo en otras tiendas: aquí se imprime lo que entró y el aviso dice dónde cambiar el papel.
          reimprimir?.detalle ?? null,
        ]
          .filter(Boolean)
          .join(" · "),
      });
      salida.soltar();
      setImprimir({ nombre: nombrePrenda, lineas, href: conDesde(hrefSubidas, volverA) });
      return;
    }
    avisar.exito(`${nombrePrenda} guardado`, {
      detalle:
        [
          hechoTodo.length > 0 ? hechoTodo.join(", ") : null,
          cargadas > 0 ? `${cargadas} ${cargadas === 1 ? "unidad entró" : "unidades entraron"} como stock inicial: queda sellado, desde ahora se ajusta en Existencias` : creadas > 0 ? NACEN_SIN_UNIDADES : null,
          reimprimir?.detalle ?? null,
        ]
          .filter(Boolean)
          .join(" · ") || undefined,
      // Tras corregir color o talla, lo pegado en percha sigue sonando pero ya no dice lo correcto: se reimprime todo. Si no, y
      // entraron unidades, una etiqueta por cada una nueva (las que ya estaban en la tienda ya tienen la suya).
      ...(huboCorrecciones
        ? { accion: { texto: "Imprimir etiquetas", onClick: () => router.push(`/etiquetas-de-precio?producto=${producto.id}`) }, duracion: 10000 }
        : reimprimir?.boton
          ? { accion: { texto: reimprimir.boton, onClick: () => router.push(urlEtiquetasDePrecio({ variantes: idsReimprimir }, volverA)) }, duracion: 10000 }
          : hrefSubidas
            ? {
                accion: {
                  texto: `Imprimir ${unidadesNuevas} ${unidadesNuevas === 1 ? "etiqueta" : "etiquetas"}`,
                  onClick: () => router.push(conDesde(hrefSubidas, volverA)),
                },
                duracion: 10000,
              }
            : {}),
    });
    salida.soltar();
    router.replace(volverA);
    router.refresh();
  }

  /** «Descartar»: todo vuelve a como estaba al abrir, y el aviso ofrece «Deshacer» (sin preguntar antes: 7 s alcanzan para arrepentirse). */
  function descartar() {
    if (seGuardoAlgo()) {
      recargar();
      return;
    }
    const antes = capturar();
    const antesAqui = precioAquiEscrito;
    aplicar(inicial);
    setPrecioAquiEscrito(null);
    const deshacerStock = stock.descartar();
    setVersionCambiada(false);
    // Lo que la sección de variantes guarda por su cuenta también vuelve a cero (un «Precio puesto en 6 variantes» que ya
    // no es cierto, un monto escrito sin aplicar): nace de nuevo.
    setReinicio((r) => r + 1);
    setBloquePendiente(null);
    avisar.exito("Cambios descartados", {
      detalle: "La ficha volvió a como estaba guardada.",
      accion: {
        texto: "Deshacer",
        onClick: () => {
          aplicar(antes);
          setPrecioAquiEscrito(antesAqui);
          deshacerStock();
          setReinicio((r) => r + 1);
        },
      },
      duracion: 7000,
    });
  }

  /** Un dato de la prenda vuelve a lo que tiene la base (lo de al abrir, si todavía no se guardó nada). */
  function deshacerCampo(campo: CampoDato) {
    const base = enLaBase.datos;
    switch (campo) {
      case "referencia":
        return setReferencia(base.referencia);
      case "categoria":
        // Elegir categoría vacía el tejido y el patrón: se devuelven juntos.
        setCategoriaId(base.categoriaId);
        setTejidoId(base.tejidoId);
        return setPatronId(base.patronId);
      case "marcaProveedor":
        setMarcaId(base.marcaId);
        return setProveedorId(base.proveedorId);
      case "descripcion":
        return setDescripcion(base.descripcion);
      case "tejido":
        return setTejidoId(base.tejidoId);
      case "patron":
        return setPatronId(base.patronId);
      case "estado":
        return setEstado(base.estado);
      case "stockMinimo":
        return setStockMinimo(base.stockMinimo);
      case "temporada":
        return setTemporada(base.temporada);
      case "ventaSinStock":
        return setPermitirVentaSinStock(base.permitirVentaSinStock);
    }
  }

  /** La línea «antes: … · Deshacer» bajo un dato de la prenda que cambió (en el pie del campo, que ya tiene su alto reservado). */
  function antesDe(campo: CampoDato) {
    const c = cambioDeDato(resumen, campo);
    if (!c) return null;
    return (
      <span className="inline-flex flex-wrap items-center gap-x-2 text-ambar">
        antes: {c.antes}
        <BotonDeshacer onClick={() => deshacerCampo(campo)} className="text-[12px]" />
      </span>
    );
  }
  const tonoDe = (campo: CampoDato) => (cambioDeDato(resumen, campo) ? ("aviso" as const) : undefined);

  // Lo que dicen las cabeceras plegadas de cada sección (y el panel derecho).
  const marcaNombre = marcaId ? (marcas.marcas.find((m) => m.id === marcaId)?.nombre ?? (marcaId === producto?.marcaId ? producto?.marcaNombre : null) ?? null) : null;
  const proveedorNombre = proveedorId
    ? (marcas.proveedores.find((p) => p.id === proveedorId)?.nombre ?? (proveedorId === producto?.proveedorId ? producto?.proveedorNombre : null) ?? null)
    : null;
  const tejidoNombre = tejidoId ? (opcionesTejido.find((o) => o.valor === tejidoId)?.texto ?? null) : null;
  const patronNombre = patronId ? (opcionesPatron.find((o) => o.valor === patronId)?.texto ?? null) : null;
  const pendienteFotos = pendientes.find((p) => p.id === "fotos") ?? null;
  const vistaFotos = vistaDeFotos(coloresPanel, fotosVista);
  const sinFotoNombres = vistaFotos.tarjetas.filter((t) => t.estado === "sin-foto").map((t) => nombres.color(t.codigo));
  const comunes = etiquetasComunes(
    filas,
    opcionesEtiqueta.map((e) => e.valor)
  );
  const etiquetasTexto = comunes.length > 0 ? comunes.map((id) => opcionesEtiqueta.find((e) => e.valor === id)?.texto ?? "").filter(Boolean).join(", ") : null;
  // Un color recién agregado que todavía no tiene ninguna unidad puesta: el banner «nació sin unidades» lo lleva al stepper.
  const colorSinUnidades = coloresPanel.find((c) => {
    const del = filas.filter((f) => f.activo && f.colorCodigo === c);
    return del.length > 0 && del.every((f) => !f.guardada) && del.every((f) => stock.numeroNueva(f.clave) === 0);
  });

  /** «+ Agregar color» de la matriz: lo mismo que hacía la sección de variantes (`AgregarColoresModal`, ADR-0263/0279). */
  function agregarColores(r: ResultadoAgregarColores) {
    const base = r.colorDeLasQueTiene
      ? corregir(
          filas,
          filasDelEje(filas, "color", null).map((f) => f.clave),
          { colorCodigo: r.colorDeLasQueTiene }
        )
      : filas;
    const siguientes = agregarCombinaciones(base, r.combos, { precio: r.precio, costo: r.costo, etiquetaIds: comunes });
    setFilas(siguientes);
    ponerUnidadesDeLasNuevas(base, siguientes, r.unidades);
    if (r.fotos.length > 0) sumarFotosDeColores(r.fotos);
  }

  /** Las unidades de partida que se escribieron en «Agregar color/talla» pasan a las filas que acaban de nacer: entran como stock inicial
   *  al guardar (`stock.cargarNuevas`) y, ya guardadas, su número lleva candado (ADR-0494). */
  function ponerUnidadesDeLasNuevas(antes: readonly FilaFicha[], despues: readonly FilaFicha[], unidades: Record<string, number>) {
    for (const [clave, n] of Object.entries(unidadesParaNuevas(antes, despues, unidades))) stock.fijarNueva(clave, n);
  }

  /** La celda «—» de la matriz (esa combinación no se vende): la agrega o la reactiva (`comoLlenarHueco`). Nace con el precio y el
   *  costo de su color (lo que la persona ya decidió para él) o, si el color no los tiene, los de la prenda; y con las etiquetas
   *  que llevan todas. */
  const permitidosHueco = { coloresActivos: colores.map((c) => c.codigo), tallasHabilitadas: tallasCategoria.map((t) => t.id) };
  function llenarHueco(c: string | null, t: string | null) {
    const delColor = precioYCostoPorDefecto(filas.filter((f) => f.activo && f.colorCodigo === c));
    const dePrenda = precioYCostoPorDefecto(filas);
    setFilas(
      agregarCombinaciones(filas, [{ colorCodigo: c, tallaId: t }], {
        precio: delColor.precio || dePrenda.precio,
        costo: delColor.costo || dePrenda.costo,
        etiquetaIds: comunes,
      })
    );
  }

  /** «Cambiar foto» del panel: la foto subida entra en su color y pasa a ser la que se ve en él (la principal, si la de antes lo era). */
  function fotosDesdePanel(nuevas: FotoSubida[]) {
    if (nuevas.length === 0) return;
    const conClave = nuevas.map((n) => ({ clientKey: crypto.randomUUID(), id: null, url: n.url, esPrincipal: false, colorCodigo: n.colorCodigo }));
    let siguientes: FotoLocal[] = conFotosNuevas(fotosVista, conClave);
    const portadaAntes = fotosDelColor(fotosVista, conClave[0].colorCodigo)[0];
    siguientes = portadaAntes?.esPrincipal ? comoPrincipal(siguientes, conClave[0].clientKey) : primeraEnSuColor(siguientes, conClave[0].clientKey);
    cambiarFotos(siguientes);
  }

  // Las variantes nuevas a las que ya se les puso stock con el stepper: la hoja dice con cuánto entran (y no «nacen sin unidades»).
  const conStockNuevas = filas.filter((f) => !f.id && stock.numeroNueva(f.clave) > 0);
  const unidadesNuevas = conStockNuevas.reduce((s, f) => s + stock.numeroNueva(f.clave), 0);
  const notaAgregan =
    unidadesNuevas > 0
      ? `Entran con ${unidadesNuevas} ${unidadesNuevas === 1 ? "unidad" : "unidades"} como stock inicial (${conStockNuevas
          .map((f) => `${nombres.color(f.colorCodigo)} ${nombres.talla(f.tallaId) || "Única"} ${stock.numeroNueva(f.clave)}`)
          .join(" · ")}). Las que quedan en 0 nacen sin unidades.`
      : undefined;

  function irAColorNuevo(c: string) {
    document.getElementById(`matriz-color-${c}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    setColorElegido(c);
  }

  /** «Quitar color» (el tacho de un color en la matriz): deja de venderse. Nunca se borra nada: las variantes que ya existen se
   *  desactivan y conservan su stock y su historia; las nuevas, que todavía no existen, no se crean. Lo que se le tocó en esta
   *  visita —stock, precio, costo, etiquetas— se suelta (opción B, Felipe 2026-10-03: `quitarColor` de matriz-ficha-reglas). Se
   *  guarda con «Revisar y guardar» y hasta entonces se deshace. */
  function quitarElColor(c: string | null) {
    const delColor = filas.filter((f) => f.activo && f.colorCodigo === c);
    stock.soltar(delColor.map((f) => f.id ?? f.clave));
    // Un color que la prenda nunca tuvo (todo nuevo, sin variantes guardadas) se va con las fotos que se le subieron en esta visita:
    // si no, quedaban huérfanas, se guardaban igual y hasta podían ser la principal de la prenda (revisión 2026-10-03). Las de un
    // color que ya existía se quedan: el color se desactiva, no desaparece.
    const nuncaExistio = c !== null && !filas.some((f) => f.colorCodigo === c && f.guardada);
    if (nuncaExistio) {
      const suyas = fotosVista.filter((f) => !f.id && f.colorCodigo === c);
      if (suyas.length > 0) cambiarFotos(suyas.reduce((acc, f) => sinLaFoto(acc, f.clientKey), fotosVista));
    }
    setFilas((actual) => quitarColor(actual, c));
  }

  /** «Quitar talla» (el tacho de la cabecera de una talla, Felipe 2026-10-03): lo mismo que «Quitar color», sobre una columna. La
   *  talla deja de venderse en todos los colores; lo tocado en su stock se suelta, y hasta guardar se deshace. */
  function quitarLaTalla(t: string | null) {
    const deTalla = filas.filter((f) => f.activo && f.tallaId === t);
    stock.soltar(deTalla.map((f) => f.id ?? f.clave));
    setFilas((actual) => quitarTalla(actual, t));
  }

  /** El tacho de un color o de una talla: lo que todavía no existe se quita sin más; lo guardado, solo con 0 unidades (hoja que confirma),
   *  y con unidades la hoja dice cuántas son y lleva a dejarlas en 0 en Existencias (`lib/quitar-variante-reglas.ts`, ADR-0494). */
  function pedirQuitar(eje: "color" | "talla", id: string | null) {
    const delEje = filas.filter((f) => f.activo && (eje === "color" ? f.colorCodigo === id : f.tallaId === id));
    const decision = queHaceAlQuitar(delEje, estadoVariantes, ajusteStock?.ubicacionId ?? null);
    if (decision.tipo === "directo") return eje === "color" ? quitarElColor(id) : quitarLaTalla(id);
    setQuitando({ eje, id });
  }

  /** El lápiz (corregir el color si se registró mal: conserva stock e historia) y el tacho (quitarlo) de cada color. */
  function botonesDeColor(c: string | null): BotonesDeColor {
    const delColor = filasDelEje(filas, "color", c);
    const nuevo = todasNuevas(delColor);
    const nombre = nombres.color(c);
    return {
      // «Corregir» si ya existe (se registró mal); «Cambiar» si es nuevo y todavía no existe (D-136).
      corregir: puedeCorregir
        ? {
            titulo: nuevo ? `Cambiar el color ${nombre}` : `Corregir el color ${nombre} (si se registró mal)`,
            motivo: nuevo ? null : bloqueoPorVenta(delColor, estadoVariantes, esLider, nombres),
            onClick: () => setCorrigiendo({ claves: delColor.map((f) => f.clave), ejes: "color" }),
          }
        : null,
      quitar: { titulo: nuevo ? `Quitar ${nombre} (recién agregado)` : `Quitar ${nombre}: deja de venderse al guardar`, onClick: () => pedirQuitar("color", c) },
    };
  }

  // Lo que dice la línea bajo la tabla: los colores que se quitan al guardar (con su «Deshacer» y, si tienen unidades, cuántas
  // quedan en el inventario) y los que ya no se vendían.
  const seQuitan = coloresQueSeQuitan(filas);
  const correcciones = correccionesPendientes(filas, nombres);
  /** «Deshacer» de una corrección: vuelve a su color o talla guardados, salvo que esa combinación ya la ocupe otra variante. */
  function deshacerCorreccion(claves: string[], destino: Destino) {
    const choque = choqueDeCorreccion(filas, claves, destino);
    if (choque) return void avisar.error(textoChoque(choque, destino, filas, ctx));
    setFilas(corregir(filas, claves, destino));
  }
  const yaDesactivados = coloresYaDesactivados(filas);
  const unidadesDe = (c: string | null) =>
    filas.reduce((s, f) => s + (f.colorCodigo === c && f.guardada?.activo && f.id ? (estadoVariantes?.[f.id]?.stock ?? 0) : 0), 0);
  // Lo mismo para las tallas que se quitan (el tacho de su cabecera).
  const tallasSeQuitan = tallasQueSeQuitan(filas, nombres);
  const unidadesDeTalla = (t: string | null) =>
    filas.reduce((s, f) => s + (f.tallaId === t && f.guardada?.activo && f.id ? (estadoVariantes?.[f.id]?.stock ?? 0) : 0), 0);

  return (
    <form
      onSubmit={revisar}
      // Revisar es un acto explícito: Enter dentro de un campo —cerrar un precio, corregir el nombre— no abre la hoja de
      // guardado (con correcciones de color en juego, un Enter de costumbre la abriría a mitad de camino).
      onKeyDown={(e) => {
        if (e.key === "Enter" && e.target instanceof HTMLInputElement) e.preventDefault();
      }}
      className="pb-28 sm:pb-24"
    >
      {/* El panel del taller va a la derecha solo si a la ficha le quedan ~430 px al lado: lo decide el ancho del formulario
          (`@container`), no el de la ventana. Con `lg:` (1024 px de ventana) y el menú lateral abierto, la ficha quedaba en 291 px
          —más angosta que un celular— para darle 340 al panel; ahora, en ese ancho, el panel baja debajo de la ficha. */}
      <div className="@container">
      <div className="grid items-start gap-[26px] @min-[50rem]:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-3">
          {/* ---------- 1 · Producto ---------- */}
          <SeccionFicha
            id="seccion-producto"
            guia="editar.seccion-producto"
            numero={1}
            hecho={!!referencia.trim() && !!categoriaId}
            titulo="Producto"
            resumen={[categoriaActual?.nombre, marcaNombre, proveedorNombre].filter(Boolean).join(" · ") || "Falta la categoría"}
            abierta={abiertas.producto}
            onAbierta={(v) => setAbiertas((a) => ({ ...a, producto: v }))}
            retraso={40}
          >
            <div className="grid gap-4 @lg:grid-cols-2">
            <CampoTexto
              etiqueta="Referencia"
              id="producto-referencia"
              maxLength={MAX_NOMBRE_PRODUCTO}
              value={referencia}
              onChange={(e) => setReferencia(e.target.value)}
              placeholder="Blusa Lino"
              autoFocus
              pie={antesDe("referencia")}
              tono={tonoDe("referencia")}
            />
            <Campo etiqueta="Categoría" pie={antesDe("categoria")} tono={tonoDe("categoria")}>
              <ComboBuscable etiquetaAccesible="Categoría" valor={categoriaId} onValor={elegirCategoria} opciones={opcionesCategoria} marcador="Busca una categoría…" />
            </Campo>
            {nombreCambio && (
              <div className="@lg:col-span-2">
                {nombreNuevo && nombreNuevo !== referencia.trim() && (
                  <p className="mb-2 text-xs text-tinta/60">
                    Se guardará como <strong className="text-tinta">{nombreNuevo}</strong>
                  </p>
                )}
                {avisosNombre.length > 0 && (
                  <ul className="mb-2 space-y-1" aria-live="polite">
                    {avisosNombre.map((a) => (
                      <li key={a.regla} className="flex items-start gap-1.5 text-[13px] text-tinta">
                        <Lightbulb aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ambar" />
                        {a.texto}
                      </li>
                    ))}
                  </ul>
                )}
                <AvisoParecidos parecidos={parecidos.items} confirmo={parecidos.confirmo} onConfirmo={parecidos.confirmar} noSePudoComprobar={parecidos.fallo} />
              </div>
            )}
            <div className="@lg:col-span-2" id="producto-marca">
              <Campo etiqueta="Marca y proveedor" pie={antesDe("marcaProveedor")} tono={tonoDe("marcaProveedor")}>
                <ElegirMarcaProveedor
                  opcional
                  guardado={{ marcaId: producto?.marcaId ?? "", proveedorId: producto?.proveedorId ?? "" }}
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
                  puedeCrear
                />
              </Campo>
            </div>
            {producto && nombreProveedor !== undefined && (
              <div className="@lg:col-span-2">
                <NombreDelProveedor
                  productoId={producto.id}
                  valor={nombreProveedor}
                  firma={() => stock.responsable.firma()}
                  motivoSinFirma={stock.responsable.motivo}
                />
              </div>
            )}
            {/* El ancho completo va en una caja propia: `CampoTexto` le pasa `className` al <input>, no a la celda de la grilla,
                y con la clase ahí la descripción quedaba en media fila con el texto de ayuda cortado. */}
            <div className="@lg:col-span-2">
              <CampoTexto
                etiqueta="Descripción (opcional)"
                maxLength={MAX_DESCRIPCION_PRODUCTO}
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                placeholder="Detalle interno, no se muestra al cliente"
                pie={antesDe("descripcion")}
                tono={tonoDe("descripcion")}
              />
            </div>
          </div>
          </SeccionFicha>

          {/* ---------- 2 · Tejido, patrón y estado ---------- */}
          <SeccionFicha
            id="seccion-tejido"
            guia="editar.seccion-tejido"
            numero={2}
            hecho={!pendientes.some((p) => p.id === "tejido" || p.id === "patron")}
            titulo="Tejido, patrón y estado"
            resumen={[tejidoNombre ?? "Sin tejido", patronNombre ?? "Sin patrón", ESTADOS.find((e) => e.valor === estado)?.texto].filter(Boolean).join(" · ")}
            abierta={abiertas.tejido}
            onAbierta={(v) => setAbiertas((a) => ({ ...a, tejido: v }))}
            retraso={90}
          >
            <div className="grid gap-4 @lg:grid-cols-2">
            <div data-campo="tejido" className="hilo-caja">
            <Campo
              etiqueta={<ConMarca estado={marcaDe("tejido")}>{exigeTejido || familiaExigente ? "Tejido" : "Tejido (opcional)"}</ConMarca>}
              pie={antesDe("tejido")}
              tono={tonoDe("tejido")}
            >
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
            </div>
            <div data-campo="patron" className="hilo-caja">
            <Campo
              etiqueta={<ConMarca estado={marcaDe("patron")}>{exigePatron || familiaExigente ? "Patrón" : "Patrón (opcional)"}</ConMarca>}
              pie={antesDe("patron")}
              tono={tonoDe("patron")}
            >
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
            </div>
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
                <Segmentado etiqueta="Estado" valor={estado} onValor={setEstado} opciones={ESTADOS} pie={antesDe("estado")} tono={tonoDe("estado")} />
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
              pie={antesDe("stockMinimo") ?? "Suma el stock de todas las sedes. En blanco = este producto nunca entra en «Stock bajo» en /productos."}
              tono={tonoDe("stockMinimo")}
            />
            {temporadas ? (
              <CampoSelect
                etiqueta="Temporada (opcional)"
                id="producto-temporada"
                valor={temporada}
                onValor={setTemporada}
                opciones={opcionesTemporadaPrenda}
                pie={
                  antesDe("temporada") ??
                  // Una excepción por color manda sobre esta: se dice aquí, para que nadie crea que la prenda entera es de
                  // la temporada que muestra el combo.
                  (conTemporadaPropia > 0
                    ? `${conTemporadaPropia === 1 ? "1 de sus colores tiene" : `${conTemporadaPropia} de sus colores tienen`} su propia temporada, y esa manda: mira «Temporada por color», abajo.`
                    : "Sin año: el sistema lo sabe por la fecha en que la prenda llega a cada tienda.")
                }
                tono={tonoDe("temporada")}
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
                pie={antesDe("ventaSinStock") ?? "Deja vender este producto aunque el stock marque 0 (pedido especial / preventa)."}
              />
            </div>
            {ofreceTemporadaPorColor && (
              <div className="border-t border-tinta/10 pt-3 @lg:col-span-2">
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
                      su prenda. Se guarda junto con el resto al pulsar &ldquo;Revisar y guardar&rdquo;.
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
                    <div className="mt-2 grid gap-x-4 @lg:grid-cols-2">
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
          </SeccionFicha>

          {/* ---------- 3 · Fotos ----------
               id="fotos": la pantalla de éxito de Nuevo producto (ADR-0109) enlaza acá con #fotos. */}
          <SeccionFicha
            id="fotos"
            guia="editar.seccion-fotos"
            numero={3}
            hecho={!pendienteFotos}
            titulo="Fotos"
            resumen={sinFotoNombres.length > 0 ? `Falta ${sinFotoNombres.join(", ")} — mira el panel de la derecha` : "Completa"}
            abierta={abiertas.fotos}
            onAbierta={(v) => setAbiertas((a) => ({ ...a, fotos: v }))}
            retraso={140}
          >
            <div data-campo="fotos" data-estado={marcaDe("fotos") ?? undefined} className="hilo-tarjeta space-y-3 rounded-xl">
              <p className="text-[11.5px] text-tinta/45">
                La vista grande y el selector de color viven en el panel del taller, a la derecha: usa «Cambiar foto» (o «+ Agregar foto» si al color le falta)
                sobre la imagen grande, ahí mismo. Aquí abajo ves, ordenas o quitas todas.
              </p>
              {marcaDe("fotos") && (
                <p className="flex items-center gap-2 text-[12px] text-taupe">
                  <MarcaCampo estado={marcaDe("fotos")!} />
                  {marcaDe("fotos") === "ahora" ? <EtiquetaAhora /> : marcaDe("fotos") === "hecho" ? "Listo" : "Falta"}
                </p>
              )}
              <FotosPorColor
                fotos={fotosVista}
                onFotos={cambiarFotos}
                guardadas={fotosGuardadas}
                colores={coloresFicha}
                vocabulario={colores}
                nombreColor={nombres.color}
                disabled={loading}
              />
            </div>
          </SeccionFicha>

          {/* ---------- 4 · Variantes y precios (ADR-0263; matriz de la maqueta B) ---------- */}
          <SeccionFicha
            id="seccion-variantes"
            guia="editar.seccion-variantes"
            numero={4}
            hecho={false}
            titulo="Variantes y precios"
            resumen={resumenVariantes(filas, precioPropioAqui)}
            abierta={abiertas.variantes}
            onAbierta={(v) => setAbiertas((a) => ({ ...a, variantes: v }))}
            retraso={190}
          >
            <MatrizStockFicha
              ctx={ctx}
              filas={filas}
              stock={stock}
              vista={vista}
              // Un monto escrito sin aplicar sigue avisando con SU campo: `CambiarEnBloque` guarda uno por campo y lo informa solo.
              onVista={setVista}
              bloque={
                filas.some((f) => f.activo) ? (
                  <div className="mb-1">
                    <CambiarEnBloque
                      key={reinicio}
                      filas={filas}
                      onFilas={setFilas}
                      onPendiente={setBloquePendiente}
                      nombres={nombres}
                      veCosto={veCosto}
                      deshabilitado={loading}
                      campoFijo={vista === "costo" ? "costo" : "precio"}
                      admitePrecioCero={!!categoriaActual?.admitePrecioCero}
                    />
                  </div>
                ) : undefined
              }
              colorActivo={colorFijo}
              onElegirColor={(c) => setColorElegido(c)}
              onVerColor={setColorVisto}
              onCambioFila={(clave, cambio) => setFilas((actual) => cambiarFila(actual, clave, cambio))}
              onAjustar={(varianteId, etiqueta) => setPuerta({ varianteId, etiqueta })}
              etiquetas={opcionesEtiqueta}
              avisoEtiquetas={avisoEtiquetas}
              onEtiqueta={(id, poner, claves) => setFilas((actual) => ponerEtiqueta(actual, id, poner, claves))}
              botonesDeColor={botonesDeColor}
              onCorregirTalla={puedeCorregir ? (t) => setCorrigiendo({ claves: filasDelEje(filas, "talla", t).map((f) => f.clave), ejes: "talla" }) : null}
              onQuitarTalla={(t) => pedirQuitar("talla", t)}
              huecos={{ como: (c, t) => comoLlenarHueco(filas, c, t, permitidosHueco, nombres), onLlenar: llenarHueco }}
              precioAqui={
                tiendaTerminal && precioAquiListo
                  ? {
                      sede: nombreCorto(tiendaTerminal.nombre),
                      valor: (f) => precioAquiEscrito ?? (propioTerminal ? propioTerminal.precio.toFixed(2) : f.precio),
                      cambiado: cambioAqui.que !== "nada",
                      antes: propioTerminal?.precio ?? preciosSede?.general ?? null,
                      onCambio: setPrecioAquiEscrito,
                    }
                  : null
              }
              deshabilitado={loading}
            />

            {vista === "precio" && tiendaTerminal && precioAquiListo && (
              <PrecioAquiTerminal
                sede={tiendaTerminal.nombre}
                propio={propioTerminal}
                cambio={cambioAqui}
                general={preciosSede?.general ?? null}
                costoMaximo={veCosto ? costoMaximoGuardado(filas, admiteCeroGuardada) : null}
                error={
                  cambioAqui.que === "poner"
                    ? problemaPrecioAqui(cambioAqui, tiendaTerminal.nombre, preciosSede?.general ?? null, veCosto ? costoMaximoGuardado(filas, admiteCeroGuardada) : null)
                    : null
                }
              />
            )}

            {/* En una terminal no: el precio de su tienda se escribe en la tabla (arriba). */}
            {producto && preciosSede && !preciosSede.soloAqui && (
              <PreciosPorSede
                productoId={producto.id}
                precios={preciosTienda.precios}
                onCambio={preciosTienda.recargar}
                precioPrenda={preciosSede.general}
                todas={preciosSede.todas}
                tiendas={preciosSede.tiendas}
                ubicacionActual={preciosSede.ubicacionId}
                costoMaximo={veCosto ? costoMaximoGuardado(filas, admiteCeroGuardada) : null}
                deshabilitado={loading}
              />
            )}

            {correcciones.length > 0 && (
              <ul className="mt-2.5 space-y-1.5" aria-label="Correcciones de color o talla que se guardan">
                {correcciones.map((c) => (
                  <li key={c.clave} className="flex gap-2 text-[12.5px] text-ambar-profundo">
                    <span aria-hidden className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-ambar" />
                    <span className="min-w-0">
                      Se corrige al guardar: <b className="font-semibold">{c.texto}</b>. Conserva su stock y su historia.{" "}
                      <BotonDeshacer disabled={loading} onClick={() => deshacerCorreccion(c.claves, c.destino)} className="text-[12px]" />
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {seQuitan.length > 0 && (
              <ul className="mt-2.5 space-y-1.5" aria-label="Colores que se quitan al guardar">
                {seQuitan.map((c) => {
                  const u = unidadesDe(c);
                  return (
                    <li key={c ?? "sin-color"} className="flex gap-2 text-[12.5px] text-ambar-profundo">
                      <span aria-hidden className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-ambar" />
                      <span className="min-w-0">
                        <b className="font-semibold">{nombres.color(c)}</b> deja de venderse al guardar: sus variantes se desactivan y conservan su historia
                        {u > 0
                          ? `. Sus ${u} u. (contando todas las sedes, no solo la tabla de arriba) siguen en el inventario, pero ya no se podrán vender en ninguna: si existen, véndelas antes o pide un ajuste.`
                          : "."}{" "}
                        <BotonDeshacer disabled={loading} onClick={() => setFilas((actual) => devolverColor(actual, c))} className="text-[12px]" />
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
            {tallasSeQuitan.length > 0 && (
              <ul className="mt-2.5 space-y-1.5" aria-label="Tallas que se quitan al guardar">
                {tallasSeQuitan.map((t) => {
                  const u = unidadesDeTalla(t);
                  return (
                    <li key={t ?? "sin-talla"} className="flex gap-2 text-[12.5px] text-ambar-profundo">
                      <span aria-hidden className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-ambar" />
                      <span className="min-w-0">
                        La talla <b className="font-semibold">{nombres.talla(t) || "Única"}</b> deja de venderse en todos los colores al guardar: sus
                        variantes se desactivan y conservan su historia
                        {u > 0
                          ? `. Sus ${u} u. (contando todas las sedes, no solo la tabla de arriba) siguen en el inventario, pero ya no se podrán vender en ninguna: si existen, véndelas antes o pide un ajuste.`
                          : "."}{" "}
                        <BotonDeshacer disabled={loading} onClick={() => setFilas((actual) => devolverTalla(actual, t))} className="text-[12px]" />
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
            {yaDesactivados.length > 0 && (
              <p className="mt-2 text-[12px] text-taupe">
                Ya no se venden: {yaDesactivados.map((c) => nombres.color(c)).join(", ")}. Para volver a venderlos, «+ Agregar color» los reactiva con su
                historia.
              </p>
            )}

            <div data-guia="editar.agregar" className="grid gap-x-2.5 @lg:grid-cols-2">
              {/* Solo abren su ventana (nada se guarda hasta «Revisar y guardar»): `aria-haspopup` lo dice al lector y deja que la guía las abra. */}
              <button type="button" id="variantes-agregar-color" aria-haspopup="dialog" data-guia="editar.agregar-color" className="taller-agregar-color justify-start @lg:justify-center" disabled={loading} onClick={() => setAgregandoColor(true)}>
                <span aria-hidden className="taller-agregar-icono">
                  <Plus className="h-3.5 w-3.5" />
                </span>
                <span className="taller-agregar-texto">
                  <b>Agregar color</b>
                  <small>Una fila nueva, con sus tallas</small>
                </span>
              </button>
              <button type="button" aria-haspopup="dialog" data-guia="editar.agregar-talla" className="taller-agregar-color justify-start @lg:justify-center" disabled={loading || filas.length === 0} onClick={() => setAgregandoTalla(true)}>
                <span aria-hidden className="taller-agregar-icono">
                  <Plus className="h-3.5 w-3.5" />
                </span>
                <span className="taller-agregar-texto">
                  <b>Agregar talla</b>
                  <small>Una columna nueva, en cada color</small>
                </span>
              </button>
            </div>

            {/* «Nacen sin unidades» (NACEN_SIN_UNIDADES): una variante nueva arranca en 0 a propósito. El banner hace obvio el paso
                siguiente: el mismo stepper de arriba, y lo puesto entra como stock inicial al guardar. */}
            {colorSinUnidades && stock.puedeAjustar && (
              <div className="taller-banner-nueva" role="status">
                <span aria-hidden>●</span>
                <span>
                  <b>{nombres.color(colorSinUnidades)}</b> nació sin unidades: así entra el stock real, con el mismo stepper de arriba. Toca «+»; entra al
                  guardar.
                </span>
                <button type="button" onClick={() => irAColorNuevo(colorSinUnidades)}>
                  Ir a {nombres.color(colorSinUnidades)}
                </button>
              </div>
            )}

          </SeccionFicha>
        </div>

        <PanelDelTaller
          ctx={ctx}
          filas={filas}
          colores={coloresPanel}
          colorMostrado={colorMostrado}
          onElegirColor={(c) => setColorElegido(c)}
          fotosVista={fotosVista}
          onFotosSubidas={fotosDesdePanel}
          stock={stock}
          onAjustar={(varianteId, etiqueta) => setPuerta({ varianteId, etiqueta })}
          pendientes={pendientes}
          completadaAqui={pendientesAlAbrir.size > 0}
          onIrPendiente={irAPendiente}
          campana={fraseCampana}
          fichaConsumo={producto && fichaConsumo ? { ...fichaConsumo, productoId: producto.id, referencia: producto.referencia } : null}
          deshabilitado={loading}
        />
      </div>
      </div>

      {agregandoColor && (
        <AgregarColoresModal
          ctx={ctx}
          filas={filas}
          tallas={tallasCategoria}
          categoriaNombre={categoriaActual?.nombre}
          etiquetasTexto={etiquetasTexto}
          onColorCreado={(color) => setColoresCreados((a) => (a.some((c) => c.codigo === color.codigo) ? a : [...a, color]))}
          onConfirmar={agregarColores}
          onClose={() => setAgregandoColor(false)}
          admitePrecioCero={!!categoriaActual?.admitePrecioCero}
        />
      )}
      {agregandoTalla && (
        <AgregarTallasModal
          ctx={ctx}
          filas={filas}
          tallas={tallasCategoria}
          categoriaNombre={categoriaActual?.nombre}
          etiquetasTexto={etiquetasTexto}
          onConfirmar={(r) => {
            const siguientes = agregarCombinaciones(filas, r.combos, { precio: r.precio, costo: r.costo, etiquetaIds: comunes });
            setFilas(siguientes);
            ponerUnidadesDeLasNuevas(filas, siguientes, r.unidades);
          }}
          onClose={() => setAgregandoTalla(false)}
          admitePrecioCero={!!categoriaActual?.admitePrecioCero}
        />
      )}
      {imprimir && (
        <ImprimirLoQueEntro
          prenda={imprimir.nombre}
          lineas={imprimir.lineas}
          colores={colores}
          nombreEtiqueta={(id) => etiquetas.find((e) => e.id === id)?.texto ?? null}
          onImprimir={() => router.push(imprimir.href)}
          onDespues={() => {
            setImprimir(null);
            router.replace(volverA);
            router.refresh();
          }}
        />
      )}
      {corrigiendo && (
        <CorregirVarianteModal
          ctx={ctx}
          filas={filas}
          claves={corrigiendo.claves}
          ejes={corrigiendo.ejes}
          tallas={tallasCategoria}
          onConfirmar={(destino) => setFilas(corregir(filas, corrigiendo.claves, destino))}
          onClose={() => setCorrigiendo(null)}
        />
      )}
      {puerta && producto && (
        // El editor es un <form>: los eventos de la hoja (un portal) suben por el árbol de React (ADR-0128). Sin esto, su «Cancelar» o
        // su Enter abrirían «Revisa y guarda» del producto.
        <span className="contents" onSubmit={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
          <PuertaAjustarStock
            etiqueta={puerta.etiqueta}
            href={hrefAjustarDesdeEditar({ varianteId: puerta.varianteId, productoId: producto.id, desde: volverA })}
            onCerrar={() => setPuerta(null)}
          />
        </span>
      )}

      {quitando && producto && (() => {
        const delEje = filas.filter((f) => f.activo && (quitando.eje === "color" ? f.colorCodigo === quitando.id : f.tallaId === quitando.id));
        const decision = queHaceAlQuitar(delEje, estadoVariantes, ajusteStock?.ubicacionId ?? null);
        if (decision.tipo === "directo") return null;
        return (
          // Un portal dentro de un <form>: sus eventos suben por el árbol de React (ADR-0128).
          <span className="contents" onSubmit={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
            <QuitarVarianteHoja
              que={quitando.eje}
              nombre={quitando.eje === "color" ? nombres.color(quitando.id) : nombres.talla(quitando.id) || "Única"}
              decision={decision}
              hrefAjustar={
                decision.tipo === "bloqueado" && decision.varianteParaAjustar
                  ? hrefAjustarDesdeEditar({ varianteId: decision.varianteParaAjustar, productoId: producto.id, desde: volverA })
                  : null
              }
              onArchivar={() => (quitando.eje === "color" ? quitarElColor(quitando.id) : quitarLaTalla(quitando.id))}
              onCerrar={() => setQuitando(null)}
            />
          </span>
        );
      })()}

      {/* Lo pendiente, siempre a la vista: la única forma de guardar (ADR-0257). Va dentro del formulario para que «Revisar y guardar» lo envíe. */}
      <BarraDeCambios
        cantidad={hayCambios ? totalCambios : 0}
        versionCambiada={versionCambiada}
        sinLeerVariantes={hayQueRecargar}
        yaSeGuardoLoDemas={seGuardoParte}
        bloqueada={loading}
        onDescartar={descartar}
        onRecargar={recargar}
      />
      {hojaAbierta && (
        <ConfirmarCambios
          nombre={producto?.referencia ?? referencia}
          resumen={resumen}
          avisos={avisosSinBloquear}
          notaAgregan={notaAgregan}
          extraPrecio={grupoPrecioAqui}
          tiendas={
            alCambiarPrecio
              ? {
                  datos: alCambiarPrecio,
                  igualar: igualarTiendas,
                  onIgualar: (id, si) =>
                    setIgualarTiendas((previo) => {
                      const n = new Set(previo);
                      if (si) n.add(id);
                      else n.delete(id);
                      return n;
                    }),
                }
              : null
          }
          responsable={stock.responsable}
          onConfirmar={guardar}
          onClose={() => setHojaAbierta(false)}
        />
      )}
      {salida.aviso}
    </form>
  );
}
