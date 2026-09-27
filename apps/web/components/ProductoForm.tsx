"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { esVersionCambiada, traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { MuestraPatron } from "@/components/MuestraPatron";
import { Boton, Campo, CampoSelect, CampoTexto, Interruptor, Segmentado, SelectorMultiple } from "@/components/ui/campos";
import { ComboBuscable } from "@/components/ui/ComboBuscable";
import { compararTallas } from "@/lib/tallas";
import type { EjesPorCategoria, ProductoDetalle, ValorVocabulario } from "@/lib/catalogo-v2";
import { FotosProducto, type FotoLocal } from "@/components/FotosProducto";
import { AvisoParecidos } from "@/components/alta-producto/AvisoParecidos";
import { ElegirMarcaProveedor } from "@/components/alta-producto/ElegirMarcaProveedor";
import { claveReferencia, leerErrorAlta, tituloReferencia } from "@/lib/alta-producto";
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

/* ====================================================================
   ProductoForm · edición de producto+variantes (V2, 2026-09-15)

   Usado solo por /productos/[id]/editar — el alta vive en
   NuevoProductoForm.tsx (la rama de alta que quedaba acá era código muerto
   y se retiró junto con `catalogo_crear_producto`, ADR-0109), un componente propio desde que tallas/tejidos/
   patrones pasaron a vocabulario cerrado (ADR-0095). Antes de esa fecha
   era un único componente para alta y edición; ese reparto es el que
   sigue explicando por qué la lógica de sugerir SKU vive acá con tanto
   detalle — no porque ambas rutas todavía lo compartan.

   ETIQUETAS POR VARIANTE (2026-09-17, ADR-0095). Aplicar/quitar una
   etiqueta de catálogo ("última unidad") a una variante puntual se
   guarda en la MISMA acción que el resto del formulario — nunca un
   botón de guardar aparte. Dos formas de guardar en el mismo formulario
   ya costó un bug real esta sesión (mapeo categoría↔ejes): el botón
   grande descartaba en silencio lo que el chico no había guardado
   todavía. Solo aparece para variantes que ya existen (`v.id`) — una
   fila nueva no tiene fila en `variante_etiquetas` hasta que el RPC
   principal la cree, y esta sesión no intenta adivinar ese id.

   SKU: se sugiere solo (referencia + talla + color, ver `sugerirSku`) y
   queda editable — decidido con Felipe 2026-09-15. Si la persona lo toca,
   `skuManual` se prende y deja de recalcularse aunque cambie color/talla.
   Es DISTINTO de `variantes.codigo` (el código corto BLU-0042-AZM-M que
   arma el trigger `variantes_asignar_codigo` y que se ve recién después de
   guardar) — acá no se intenta adivinar ese código, solo el SKU.

   TEMPORADA (2026-09-26, ADR-0246). Deja de ser texto libre: se elige de la
   lista cerrada, y la primera opción dice qué pasa si no se elige nada
   («Igual que su categoría (Verano)»). Vacío = hereda, como siempre. Si la
   prenda tiene 2 o más colores (o uno solo que ya tenga la suya guardada),
   cada color puede tener la suya («Temporada
   por color»): se guarda en la MISMA acción, después del guardado principal,
   con UNA llamada a `asignar_temporadas` y solo con los colores que cambiaron
   — el mismo criterio que las etiquetas. Sin la lista en la base (SQL sin
   pegar), la ficha lo dice y manda la temporada tal como la leyó.

   Identidad de variante: una variante con `id` (ya existe en la base) solo
   deja tocar precio, costo y activo — igual que decide la RPC
   `catalogo_actualizar_producto` (20260915150000). Cambiar color o talla de
   una variante que ya se etiquetó es el hueco 3 que V1 nunca cerró
   (docs/datos/modulos/02-catalogo-y-vocabulario.md); para eso se desactiva
   y se agrega una fila nueva.
   ==================================================================== */

type Categoria = { id: string; nombre: string; prefijo: string | null; exigeTejidoPatron: boolean };
type Color = { codigo: string; nombre: string; hex: string | null };

type FilaVariante = {
  /** Presente = variante existente (no se puede quitar, solo desactivar). */
  id: string | null;
  colorCodigo: string;
  /** FK a retail.tallas — talla dejó de ser texto libre (20260917100500). */
  tallaId: string;
  sku: string;
  skuManual: boolean;
  precio: string;
  costo: string;
  activo: boolean;
  /** Etiquetas de catálogo aplicadas a esta variante — solo editable si `id` ya existe. */
  etiquetaIds: string[];
};

const NUMERO =
  "w-full min-w-0 border-b border-tinta/25 bg-transparent px-0.5 py-2 text-sm tabular-nums text-tinta outline-none placeholder:text-tinta/40 focus:border-b-2 focus:border-rojo [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

const PLANTILLA = "sm:grid-cols-[1.6fr_4rem_1.1fr_5rem_5rem_3.5rem_4rem_2.5rem]";

const ESTADOS = [
  { valor: "activo", texto: "Activo" },
  { valor: "descontinuado", texto: "Descontinuado" },
] as const;

/** Referencia → token estable para el SKU sugerido: sin acentos, sin
 *  espacios, mayúsculas, cortado — no es `codigo` (eso lo arma el trigger
 *  con el correlativo real de la categoría; esto es solo una sugerencia
 *  legible que no gasta ningún número). */
function tokenReferencia(referencia: string): string {
  const limpio = referencia
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "");
  return limpio.slice(0, 12) || "PRENDA";
}

function tokenTalla(talla: string): string {
  const t = talla
    .trim()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase();
  if (!t) return "U";
  if (["U", "UNICA", "UNICO", "TALLAUNICA"].includes(t.replace(/\s+/g, ""))) return "U";
  return t.replace(/[^A-Z0-9]/g, "") || "U";
}

function sugerirSku(referencia: string, colorCodigo: string, talla: string): string {
  return [tokenReferencia(referencia), tokenTalla(talla), colorCodigo || null].filter(Boolean).join("-");
}

/** Margen % = (precio − costo) / precio. Solo lectura, no se guarda —
 *  cálculo derivado en cliente (decisión F1: no vale una columna nueva
 *  para lo que sale de dos que ya existen). */
function margenPorcentaje(precio: string, costo: string): number | null {
  const p = Number(precio);
  const c = costo === "" ? 0 : Number(costo);
  if (!Number.isFinite(p) || p <= 0 || !Number.isFinite(c)) return null;
  return ((p - c) / p) * 100;
}

/** Compara dos listas de ids sin importar el orden — para saber si
 *  `etiquetaIds` de verdad cambió, no si solo se reordenó. */
function mismoConjunto(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const ordenA = [...a].sort();
  const ordenB = [...b].sort();
  return ordenA.every((id, i) => id === ordenB[i]);
}

function filaVacia(referencia: string): FilaVariante {
  return { id: null, colorCodigo: "", tallaId: "", sku: referencia.trim() ? sugerirSku(referencia, "", "") : "", skuManual: false, precio: "", costo: "", activo: true, etiquetaIds: [] };
}

export function ProductoForm({
  categorias,
  colores,
  ejes,
  etiquetas,
  avisoEtiquetas,
  marcas,
  producto,
}: {
  categorias: Categoria[];
  colores: Color[];
  /** Tallas/tejidos/patrones ofrecidos, por categoría (20260917100400). */
  ejes: EjesPorCategoria;
  /** Vocabulario de etiquetas aprobado+activo, para aplicar a una variante. */
  etiquetas: ValorVocabulario[];
  /** Una línea bajo el selector de etiquetas (ADR-0161 P4: a quien no es líder, que las de descuento no se le ofrecen). */
  avisoEtiquetas?: string;
  /** Marcas, proveedores y parejas registradas (ADR-0109). */
  marcas: CatalogoMarcas;
  /** Presente = modo edición. */
  producto?: ProductoDetalle;
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
  // color → clave de su temporada propia; un color sin entrada sigue a su prenda. `porColorGuardado` es la foto de lo
  // que había en la base: contra ella se decide qué colores cambiaron (y se actualiza tras guardarlos, para que
  // reintentar otra parte no los vuelva a mandar).
  const [temporadaColor, setTemporadaColor] = useState<Record<string, string>>(() => temporadas?.porColor ?? {});
  const porColorGuardado = useRef<Record<string, string>>(temporadas?.porColor ?? {});
  const [permitirVentaSinStock, setPermitirVentaSinStock] = useState(producto?.permitirVentaSinStock ?? false);
  const [tejidoId, setTejidoId] = useState(producto?.tejidoId ?? "");
  const [patronId, setPatronId] = useState(producto?.patronId ?? "");
  const [marcaId, setMarcaId] = useState(producto?.marcaId ?? "");
  const [proveedorId, setProveedorId] = useState(producto?.proveedorId ?? "");
  const [fotos, setFotos] = useState<FotoLocal[]>(
    () =>
      producto?.fotos.map((f) => ({
        clientKey: f.id ?? `${f.url}-${Math.random()}`,
        id: f.id,
        url: f.url,
        esPrincipal: f.esPrincipal,
        colorCodigo: f.colorCodigo,
      })) ?? []
  );
  const [variantes, setVariantes] = useState<FilaVariante[]>(() => {
    if (!producto) return [filaVacia("")];
    return [...producto.variantes]
      .sort((a, b) => compararTallas(a.talla ?? "", b.talla ?? ""))
      .map((v) => {
        const colorCodigo = v.colorCodigo ?? "";
        const talla = v.talla ?? "";
        // Una variante que ya trae SKU (alguien lo tocó a mano antes) se
        // respeta tal cual. Una que llegó sin él (censo, o creada fuera del
        // formulario) se trata como recién agregada: el sugerido corre solo,
        // igual que en una fila nueva — no se deja en blanco esperando que
        // alguien lo escriba a mano.
        const skuManual = !!v.sku.trim();
        return {
          id: v.id,
          colorCodigo,
          tallaId: v.tallaId ?? "",
          sku: skuManual ? v.sku : sugerirSku(producto.referencia, colorCodigo, talla),
          skuManual,
          precio: String(v.precio),
          costo: v.costo === null ? "" : String(v.costo),
          activo: v.activo,
          etiquetaIds: v.etiquetaIds,
        };
      });
  });
  const [loading, setLoading] = useState(false);
  // ADR-0193 (edición simultánea): la versión de la prenda cuando se abrió la ficha. Viaja en cada guardado; si otra
  // persona guardó entre medio, la base rechaza (PT409) en vez de pisar sus precios. Tras un guardado bueno se toma la
  // versión que devuelve la base, para que reintentar solo las etiquetas no choque consigo mismo.
  const versionRef = useRef<number | null>(producto?.version ?? null);
  const [versionCambiada, setVersionCambiada] = useState(false);
  // Quien no ve el dinero recibe el costo vacío (null, 20260923193700): la ficha no muestra el campo y la base no lo toca
  // al guardar (`catalogo_actualizar_producto`). Un producto sin variantes todavía no dice nada: se muestra el campo.
  const veCosto = !producto || producto.variantes.length === 0 || producto.variantes.some((v) => v.costo !== null);
  // Editar una prenda es Catálogo, operación de tienda (ADR-0161): quien está de turno firma el guardado (las dos
  // llamadas de «Guardar cambios» van con la misma firma: son un solo gesto).
  const responsable = useResponsable();
  // Una sola fila de etiquetas abierta a la vez — mismo criterio que el
  // resto de las pantallas de admin (una edición inline visible por vez).
  const [etiquetasAbiertoEn, setEtiquetasAbiertoEn] = useState<number | null>(null);
  const opcionesEtiqueta = etiquetas.map((e) => ({ valor: e.id, texto: e.texto }));
  // Foto de lo que YA estaba guardado en el servidor al abrir el formulario
  // — para mandar el RPC de etiquetas solo cuando de verdad cambió algo, no
  // en cada guardado del producto (evitaría escribir sobre variantes cuyas
  // etiquetas nadie tocó, pisando su `created_at` sin motivo).
  const etiquetaIdsOriginales = useRef(new Map((producto?.variantes ?? []).map((v) => [v.id, v.etiquetaIds])));

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
  const opcionesColor = colores.map((c) => ({ valor: c.codigo, texto: c.nombre }));
  const tallasCategoria = ejes.tallas[categoriaId] ?? [];
  const opcionesTalla = tallasCategoria.map((t) => ({ valor: t.id, texto: t.texto }));
  const opcionesTejido = (ejes.tejidos[categoriaId] ?? []).map((t) => ({ valor: t.id, texto: t.texto }));
  const opcionesPatron = (ejes.patrones[categoriaId] ?? []).map((t) => ({
    valor: t.id,
    texto: t.texto,
    icono: <MuestraPatron nombre={t.texto} className="aspect-[3/1] w-[72px]" />,
  }));
  const tallaTexto = (tallaId: string) => tallasCategoria.find((t) => t.id === tallaId)?.texto ?? "";

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
  const coloresFicha = coloresConVariantesActivas(variantes);
  // Un color que estaba todo apagado al abrir y se reactiva: su excepción (si la tiene) no llegó a la ficha. No se le
  // ofrece el desplegable (diría «Igual que su prenda» sin saberlo) ni se manda nada por él; se avisa.
  const coloresInciertos = coloresSinTemporadaConocida(producto?.variantes ?? [], coloresFicha);
  const coloresConTemporada = coloresFicha.filter((c) => !coloresInciertos.includes(c));
  // Sin saber qué excepciones hay guardadas (`porColor` null) no se ofrece: mostraría «Igual que su prenda» sobre una
  // excepción que sí existe. Con un solo color, se ofrece igual si ese color ya tiene la suya (o no se sabe).
  const ofreceTemporadaPorColor =
    !!temporadas?.porColor && ofrecerTemporadaPorColor(coloresFicha, temporadas.porColor, coloresInciertos);
  const conTemporadaPropia = coloresConTemporada.filter((c) => (temporadaColor[c] ?? SIN_PROPIA) !== SIN_PROPIA).length;
  const nombreColor = (codigo: string) => colores.find((c) => c.codigo === codigo)?.nombre ?? codigo;
  // Plegada: casi ninguna prenda la usa. Abierta si ya hay algún color con la suya, para que se vea sin buscarla.
  const [verTemporadaColor, setVerTemporadaColor] = useState(() => Object.keys(temporadas?.porColor ?? {}).length > 0);

  function elegirCategoria(id: string) {
    setCategoriaId(id);
    // Tejido/patrón están filtrados por categoría (20260917100400) — la
    // elección anterior puede no aplicar más a la nueva.
    setTejidoId("");
    setPatronId("");
  }

  function actualizarFila(i: number, cambio: Partial<FilaVariante>) {
    setVariantes((actual) => actual.map((f, n) => (n === i ? { ...f, ...cambio } : f)));
  }

  // Al tocar color o talla de una fila SIN sku manual, el sugerido se
  // recalcula con el estado ya actualizado — no con el de la fila vieja.
  function cambiarColorOTalla(i: number, cambio: Partial<Pick<FilaVariante, "colorCodigo" | "tallaId">>) {
    setVariantes((actual) =>
      actual.map((f, n) => {
        if (n !== i) return f;
        const siguiente = { ...f, ...cambio };
        if (siguiente.skuManual) return siguiente;
        return { ...siguiente, sku: sugerirSku(referencia, siguiente.colorCodigo, tallaTexto(siguiente.tallaId)) };
      })
    );
  }

  function cambiarReferencia(v: string) {
    setReferencia(v);
    // Las filas nuevas (sin sku manual) siguen a la referencia; las que la
    // persona ya editó a mano quedan como están.
    setVariantes((actual) => actual.map((f) => (f.skuManual ? f : { ...f, sku: sugerirSku(v, f.colorCodigo, tallaTexto(f.tallaId)) })));
  }

  function agregarFila() {
    setVariantes((a) => [...a, filaVacia(referencia)]);
  }

  function quitarFila(i: number) {
    setVariantes((a) => a.filter((_, n) => n !== i));
  }

  function recargar() {
    window.location.reload();
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!referencia.trim()) return void avisar.error("Falta la referencia del producto.", { enfocar: "producto-referencia" });
    if (variantes.length === 0) return void avisar.error("Agrega al menos una variante (talla y/o color).", { enfocar: "producto-agregar-variante" });
    const sinPrecio = variantes.findIndex((v) => v.precio === "" || Number(v.precio) < 0);
    if (sinPrecio >= 0) return void avisar.error("Cada variante necesita un precio.", { enfocar: `producto-variante-${sinPrecio}-precio` });
    const sinSku = variantes.findIndex((v) => !v.sku.trim());
    if (sinSku >= 0) return void avisar.error("Cada variante necesita un SKU.", { enfocar: `producto-variante-${sinSku}-sku` });
    if (stockMinimo.trim() !== "" && (!/^\d+$/.test(stockMinimo.trim()) || Number(stockMinimo) < 0)) {
      return void avisar.error("El stock mínimo tiene que ser un número entero, 0 o mayor.", { enfocar: "producto-stock-minimo" });
    }
    if (!producto) return void avisar.error("Esta pantalla solo edita productos. Para crear uno usa Nuevo producto.");
    if (!marcaId || !proveedorId) return void avisar.error("Elige la marca y el proveedor del producto.", { enfocar: "producto-marca" });
    if (nombreCambio && parecidos.comprobando) return void avisar.error("Espera un momento: se está comprobando que el nombre no exista todavía.", { enfocar: "producto-referencia" });
    if (nombreCambio && parecidos.hayIdentico) return void avisar.error("Ya existe un producto con ese nombre.", { enfocar: "producto-referencia" });
    if (nombreCambio && parecidos.hayUnaLetra && !parecidos.confirmo) {
      return void avisar.error("Ese nombre se escribe casi igual que otro producto: confirma que es distinto, o déjalo como estaba.", { enfocar: "producto-referencia" });
    }
    if (exigeTejido && !tejidoId) return void avisar.error(`Esta prenda ya tenía tejido y en ${categoriaActual?.nombre ?? "esta categoría"} no se puede dejar sin él. Elige uno.`);
    if (exigePatron && !patronId) return void avisar.error("Esta prenda ya tenía patrón y no se puede dejar sin él (si no tiene diseño, elige Liso).");
    const firma = responsable.firma();
    if (!responsable.listo || !firma) return void avisar.error(responsable.motivo ?? "Elige quién hace esta operación.");

    setLoading(true);
    const cerrarProceso = avisar.proceso(`Guardando ${referencia.trim()}…`);

    const payloadVariantes = variantes.map((v) => ({
      ...(v.id ? { id: v.id } : {}),
      color_codigo: v.colorCodigo || null,
      talla_id: v.tallaId || null,
      sku: v.sku.trim(),
      precio: Number(v.precio),
      costo: v.costo === "" ? 0 : Number(v.costo),
      activo: v.activo,
    }));

    const payloadFotos = fotos.map((f) => ({
      ...(f.id ? { id: f.id } : {}),
      url: f.url,
      es_principal: f.esPrincipal,
      color_codigo: f.colorCodigo || null,
    }));

    const supabase = createClient();
    const { data: versionNueva, error } = await firmar(supabase.rpc("catalogo_actualizar_producto", {
      p_producto_id: producto.id,
      p_referencia: referencia.trim(),
      p_estado: estado,
      p_variantes: payloadVariantes,
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
    }), firma);

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
      avisar.error(traducirError(error, "guardar el producto"));
      return;
    }
    if (typeof versionNueva === "number") versionRef.current = versionNueva;

    // Etiquetas por variante se guardan en la MISMA acción, después del
    // guardado principal — nunca un botón aparte (ver comentario del
    // encabezado del archivo). Solo variantes que YA existían antes de
    // este envío tienen id real para asignarles etiquetas, y de esas, solo
    // las que de verdad cambiaron contra lo que había al abrir el
    // formulario — mandar las 6 variantes en cada guardado (así nadie haya
    // tocado "Etiquetas") pisaría `variante_etiquetas.created_at` de
    // etiquetas que nadie movió, y expondría un guardado de solo precio a
    // un error que no tiene nada que ver con lo que la persona hizo.
    const asignacionesEtiquetas = variantes
      .filter((v) => v.id && !mismoConjunto(v.etiquetaIds, etiquetaIdsOriginales.current.get(v.id) ?? []))
      .map((v) => ({ variante_id: v.id as string, etiqueta_ids: v.etiquetaIds }));
    if (editando && asignacionesEtiquetas.length > 0) {
      const { error: errorEtiquetas } = await firmar(supabase.rpc("actualizar_variantes_etiquetas", { p_asignaciones: asignacionesEtiquetas }), firma);
      if (errorEtiquetas) {
        cerrarProceso();
        setLoading(false);
        // Si falla, el combo se queda: «vuelve a pulsar Guardar cambios» es el mismo gesto (salvo rechazo por responsable).
        responsable.despues(errorEtiquetas);
        avisar.error(traducirError(errorEtiquetas, "guardar las etiquetas de las variantes"), {
          detalle: `${referencia.trim()} ya quedó guardado — vuelve a pulsar "Guardar cambios" para las etiquetas.`,
        });
        return;
      }
      // Ya están en la base: si lo que sigue falla y se reintenta, no se vuelven a mandar.
      for (const a of asignacionesEtiquetas) etiquetaIdsOriginales.current.set(a.variante_id, a.etiqueta_ids);
    }

    // Temporada por color (ADR-0246): mismo gesto, después del guardado principal (un color recién agregado recién
    // existe ahora) y UNA sola llamada con solo los colores que cambiaron. Todo o nada: si falla, ningún color cambió.
    const cambiosColor = ofreceTemporadaPorColor ? cambiosTemporadaPorColor(coloresConTemporada, temporadaColor, porColorGuardado.current) : null;
    if (cambiosColor) {
      const { error: errorTemporada } = await firmar(
        supabase.rpc("asignar_temporadas", { p_items: [{ producto_id: producto.id, colores: cambiosColor }] }),
        firma,
      );
      if (errorTemporada) {
        cerrarProceso();
        setLoading(false);
        responsable.despues(errorTemporada);
        avisar.error(traducirError(errorTemporada, "guardar la temporada de los colores"), {
          detalle: `${referencia.trim()} ya quedó guardado — vuelve a pulsar "Guardar cambios" para la temporada de los colores.`,
        });
        return;
      }
      porColorGuardado.current = { ...temporadaColor };
    }

    cerrarProceso();
    setLoading(false);
    responsable.despues(null);

    avisar.exito(`${referencia.trim()} guardado`, {
      detalle: `${variantes.length} ${variantes.length === 1 ? "variante" : "variantes"}`,
    });
    router.replace("/productos");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_19rem] lg:items-start">
      <div className="min-w-0 space-y-6">
        {/* ---------- datos del producto ---------- */}
        <section className="card-cayla space-y-4 p-5">
          <p className="label-cayla text-[11px] text-tinta/65">Producto</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <CampoTexto
              etiqueta="Referencia"
              id="producto-referencia"
              value={referencia}
              onChange={(e) => cambiarReferencia(e.target.value)}
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
              {patronId && <MuestraPatron nombre={opcionesPatron.find((o) => o.valor === patronId)?.texto ?? ""} className="mt-2 aspect-[3/1] w-[120px]" />}
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
                        {coloresInciertos.map(nombreColor).join(", ")}{" "}
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
                                {nombreColor(codigo)}
                              </span>
                            }
                            valor={temporadaColor[codigo] ?? SIN_PROPIA}
                            onValor={(v) => setTemporadaColor((actual) => ({ ...actual, [codigo]: v }))}
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
          <FotosProducto fotos={fotos} onFotos={setFotos} colores={colores} disabled={loading} />
        </section>

        {/* ---------- variantes ---------- */}
        <section className="card-cayla space-y-3 p-5">
          <p className="label-cayla text-[11px] text-tinta/65">Variantes (talla × color)</p>
          <div className={`hidden gap-2 border-b border-tinta/10 pb-1 sm:grid ${PLANTILLA}`}>
            {["Color", "Talla", "SKU", "Precio", "Costo", "Margen", "Activa", ""].map((t, i) => (
              <span key={i} className={`label-cayla text-[11px] text-tinta/55 ${i >= 3 && i <= 5 ? "text-right" : ""}`}>
                {t}
              </span>
            ))}
          </div>
          {variantes.map((v, i) => (
            <div key={i} className="border-b border-tinta/10 pb-3 last:border-0">
            <div className={`grid gap-2 sm:items-center ${PLANTILLA}`}>
              <ComboBuscable
                etiquetaAccesible="Color"
                valor={v.colorCodigo}
                onValor={(c) => cambiarColorOTalla(i, { colorCodigo: c })}
                opciones={opcionesColor}
                marcador="Sin color"
              />
              <ComboBuscable
                etiquetaAccesible="Talla"
                valor={v.tallaId}
                onValor={(t) => cambiarColorOTalla(i, { tallaId: t })}
                opciones={opcionesTalla}
                marcador={categoriaId ? "Sin talla" : "Elige categoría"}
              />
              <input
                aria-label="SKU"
                id={`producto-variante-${i}-sku`}
                value={v.sku}
                onChange={(e) => actualizarFila(i, { sku: e.target.value, skuManual: true })}
                className="w-full min-w-0 border-b border-tinta/25 bg-transparent px-0.5 py-2 font-mono text-xs tracking-wide text-tinta outline-none focus:border-b-2 focus:border-rojo"
              />
              <input
                type="number"
                min={0}
                step="0.01"
                aria-label="Precio"
                id={`producto-variante-${i}-precio`}
                placeholder="0.00"
                value={v.precio}
                onChange={(e) => actualizarFila(i, { precio: e.target.value })}
                className={`${NUMERO} text-right`}
              />
              {veCosto ? (
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  aria-label="Costo"
                  placeholder="0.00"
                  value={v.costo}
                  onChange={(e) => actualizarFila(i, { costo: e.target.value })}
                  className={`${NUMERO} text-right`}
                />
              ) : (
                <span className="py-2 text-right text-xs text-tinta/45" title="El costo solo lo ve quien tiene permiso de ver el dinero">—</span>
              )}
              <span className="py-2 text-right text-xs tabular-nums text-tinta/55">
                {(() => {
                  if (!veCosto) return "—";
                  const m = margenPorcentaje(v.precio, v.costo);
                  return m === null ? "—" : `${m.toFixed(0)}%`;
                })()}
              </span>
              <span className="flex justify-center py-2">
                {v.id && <Interruptor activo={v.activo} onActivo={(activo) => actualizarFila(i, { activo })} etiqueta={<span className="sr-only">Variante activa</span>} />}
              </span>
              <span className="py-2 text-right">
                {!v.id && (
                  <button type="button" onClick={() => quitarFila(i)} className="text-xs text-rojo">
                    Quitar
                  </button>
                )}
              </span>
            </div>
            {v.id && (
              <div className="mt-1">
                <button
                  type="button"
                  disabled={loading}
                  aria-expanded={etiquetasAbiertoEn === i}
                  onClick={() => setEtiquetasAbiertoEn(etiquetasAbiertoEn === i ? null : i)}
                  className={`label-cayla text-[11px] disabled:opacity-50 ${
                    v.etiquetaIds.length > 0 ? "font-semibold text-rojo hover:text-rojo/75" : "text-tinta/55 hover:text-rojo"
                  }`}
                >
                  Etiquetas{v.etiquetaIds.length > 0 ? ` (${v.etiquetaIds.length})` : ""}
                </button>
                {etiquetasAbiertoEn === i && (
                  <div className="mt-2 space-y-1.5">
                    {opcionesEtiqueta.length > 0 ? (
                      <SelectorMultiple
                        opciones={opcionesEtiqueta}
                        seleccionadas={v.etiquetaIds}
                        onCambio={(ids) => actualizarFila(i, { etiquetaIds: ids })}
                        disabled={loading}
                      />
                    ) : (
                      <p className="text-xs italic text-tinta/55">Todavía no hay etiquetas aprobadas.</p>
                    )}
                    <p className="text-xs text-tinta/55">Se guarda junto con el resto al pulsar &ldquo;Guardar cambios&rdquo;.</p>
                    {avisoEtiquetas && <p className="text-xs text-tinta/55">{avisoEtiquetas}</p>}
                  </div>
                )}
              </div>
            )}
            </div>
          ))}
          <button type="button" id="producto-agregar-variante" onClick={agregarFila} className="label-cayla text-[11px] text-tinta/65 hover:text-rojo">
            + Agregar variante
          </button>
        </section>
      </div>

      <aside className="card-cayla space-y-4 p-5 lg:sticky lg:top-24">
        <p className="label-cayla text-[11px] text-tinta/65">{editando ? "Guardar cambios" : "Crear producto"}</p>
        <p className="text-sm text-tinta/65">
          El código corto de cada variante (para etiqueta y pistola) se asigna solo al guardar — no hace falta escribirlo.
        </p>
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
        <div className="flex flex-col gap-2">
          <Boton type="submit" peso="primario" cargando={loading} disabled={!responsable.listo} title={responsable.motivo ?? undefined} className="w-full">
            {editando ? "Guardar cambios" : "Crear producto"}
          </Boton>
          <Boton type="button" peso="discreto" onClick={() => router.push("/productos")} disabled={loading} className="w-full">
            Cancelar
          </Boton>
        </div>
      </aside>
    </form>
  );
}
