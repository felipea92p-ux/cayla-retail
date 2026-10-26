"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowRight, Check, ChevronRight, Plus, Store, Truck } from "lucide-react";
import { Chip } from "@/components/ui/Chip";
import { Aviso } from "@/components/ui/Aviso";
import { FichasMedio } from "@/components/ui/FichasMedio";
import { CaminoDePasos } from "./CaminoDePasos";
import { Boton, BotonEnlace, CampoMonto } from "@/components/ui/campos";
import { BotonFiltro } from "@/components/ui/BotonFiltro";
import { Buscador } from "@/components/ui/Buscador";
import { Vacio } from "@/components/ui/Vacio";
import { Volver } from "@/components/ui/Volver";
import { soltarPaginaEstable } from "@/components/ui/PaginaEstable";
import { useSalidaSinGuardar } from "@/components/ui/useSalidaSinGuardar";
import { BotonVerMas } from "@/components/ui/VerMas";
import { hoyLima } from "@/lib/fechas-lima";
import { ComboResponsable } from "@/components/ComboResponsable";
import { MosaicoPrenda } from "@/components/MosaicoPrenda";
import { MiniaturaPrenda } from "@/components/ui/PrendaCelda";
import { Globito } from "@/components/ui/Globito";
import { HojaPrenda } from "@/components/mi-plata/HojaPrenda";
import { TarjetaFoto } from "@/components/mi-plata/TarjetaFoto";
import { RegistrarProveedorOrden } from "@/components/ordenes-compra/RegistrarProveedorOrden";
import { useSedeActiva } from "@/components/SedeActiva";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { useResponsable } from "@/lib/useResponsable";
import { firmaOmitida } from "@/lib/responsable-omitido";
import { esFalloDeRed, traducirError } from "@/lib/error-escritura";
import { leerMontoPlata } from "@/lib/monto-plata-reglas";
import { soles } from "@/lib/compras-reglas";
import type { ProveedorRegistrado } from "@/lib/proveedor-de-orden-reglas";
import { cargarFotosDeHabituales, cargarHabituales, registrarCompraRapida, registrarMarcaDeCompra, subirFotoPapel } from "@/lib/compra-rapida-acciones";
import { ImagenDePrenda } from "@/components/ui/ImagenDePrenda";
import {
  HABITUALES_A_LA_VISTA,
  PROVEEDORES_POR_TANDA,
  tandaDeLista,
  MEDIOS_PAGO_COMPRA,
  PAGO_DE_FABRICA,
  TIPOS_PAPEL,
  camposPapel,
  categoriasConProveedor,
  categoriasDeHabituales,
  cuadraElPapel,
  gananciaDeCompra,
  detalleProveedor,
  inicialesProveedor,
  proveedoresRecientes,
  faseDePaso,
  filtrarProveedores,
  habitualDeNuevo,
  nuevoVacio,
  borradorDeLineas,
  lineasDeBorrador,
  textoPrendaEnCompra,
  nombreCortoTienda,
  lineasParaBase,
  marcasPorCrear,
  conMarcasCreadas,
  marcasDeHabituales,
  prendasDeLineas,
  prendasDeLaCompra,
  totalesPorTienda,
  resumenCarrito,
  textoAvance,
  lineaDeAvance,
  PASOS_DE_LA_COMPRA,
  textoHabitual,
  pagoParaBase,
  textoLoQueFalta,
  textoPlataDespues,
  tiendaAnterior,
  tiendasDeLineas,
  totalDeLineas,
  type BorradorNuevo,
  type BorradorPrenda,
  type CategoriaParaComprar,
  type Habitual,
  type LineaCompra,
  type PagoCompra,
  type PasoCompra,
  type ProveedorParaComprar,
  type TipoPapel,
} from "@/lib/compra-rapida-reglas";

// Compras simple (ADR-0480, actividad 3): «Compré ropa», hecho para el celular. Rediseño aprobado por Felipe el 2026-10-23
// (docs/maquetas/compras-formidable-2026-10/). Siempre tres pasos: 1 · el proveedor (los de hace poco primero, o buscado por nombre o por
// lo que vende) → 2 · las prendas (sus habituales en una grilla; al tocar una se abre UNA hoja con cuántas, el costo, la venta y a qué
// tienda va —la tienda, por prenda—; la barra negra de abajo suma; al final, revisar) → 3 · el papel (qué le dieron, la foto y cuánto
// pagó, que viene con el total anotado).
//
// Quién paga (Felipe 2026-10-23, 20261023181000; rótulos de la maqueta mis-compras-rediseno-2026-10): de fábrica «Pagué ahora» todo lo del
// papel, por Yape. «Pagué solo una parte» (escondido hasta tocarlo) baja el monto (lo que falta queda en Por pagar); o «Paga Compras» y
// le deja todo. Los tres métodos salen de su plata para compras.
//
// Guardar no mueve plata en los libros (Felipe 2026-10-22): en su plata baja al instante, y los libros la mueven cuando Compras completa
// el papel. Lo que falta en el paso del papel es lo mismo que rechaza la base (`camposPapel`). La compra lleva su identificador desde que se
// abre la pantalla: un doble clic o un reintento tras un corte no la duplican. Quién firma (decisión 39): con la cuenta de una persona, ella;
// desde una terminal, el combo «Responsable».
//
// Actividad 4: «Algo nuevo de este proveedor» abre la MISMA hoja que una prenda de siempre, con qué es, la marca y cómo se llama arriba
// (Felipe 2026-10-23; antes eran tres pantallas seguidas). Es solo una referencia: no crea nada en el catálogo, lo crea la tienda al
// recibir. Un proveedor sin prendas la abre de entrada.
// «Nuevo proveedor» es la misma hoja de Nueva orden de compra (`registrar_proveedor_de_orden`: lo básico, no duplica) y sigue con su
// primera compra.

type Datos = {
  proveedores: ProveedorParaComprar[];
  categorias: CategoriaParaComprar[];
  marcas: { id: string; nombre: string }[];
  tiendas: { id: string; nombre: string }[];
  tiene: number | null;
};

/**
 * La prenda de la hoja abierta: el habitual del que sale y lo escrito. `edita`: su clave, si ya va en la compra y se corrige (una prenda
 * repartida entre tiendas son varias líneas con la misma clave: se corrigen y se quitan juntas).
 */
type EnCurso = BorradorPrenda & { habitual: Habitual; edita: string | null; nueva?: BorradorNuevo };

/** El habitual de una hoja «Algo nuevo» mientras se describe: sin nada de antes. Al agregarla, se arma con lo elegido. */
const EN_BLANCO: Habitual = {
  clave: "nuevo",
  productoId: null,
  nombre: "",
  categoriaId: "",
  categoria: "",
  marcaId: null,
  marca: null,
  veces: 0,
  ultimaFecha: null,
  ultimaCantidad: null,
  costo: null,
  venta: null,
};

/** Lo que se escribió en una hoja de prenda: si cambia desde que se abrió, cerrarla pregunta. */
function firmaHoja(e: EnCurso): string {
  return JSON.stringify({ c: e.cantidad, k: e.costo, v: e.venta, d: e.destinos, r: e.reparto, n: e.nueva ? { ...e.nueva, descartadas: [...e.nueva.descartadas] } : null });
}

const ANTERIOR: Partial<Record<PasoCompra, PasoCompra>> = {
  habituales: "proveedor",
  revisar: "habituales",
  papel: "revisar",
};

export function RegistrarCompra({ datos }: { datos: Datos }) {
  const router = useRouter();
  const [id, setId] = useState(() => crypto.randomUUID());
  const [paso, setPaso] = useState<PasoCompra>("proveedor");
  const [q, setQ] = useState("");
  const [catProveedor, setCatProveedor] = useState<string | null>(null);
  const [proveedores, setProveedores] = useState(datos.proveedores);
  const [registrando, setRegistrando] = useState(false);
  const [proveedor, setProveedor] = useState<ProveedorParaComprar | null>(null);
  const [habituales, setHabituales] = useState<Habitual[] | null | "cargando">("cargando");
  // La foto de cada prenda del catálogo entre sus habituales, por `producto_id`: llega después de la grilla (sin ella, su categoría).
  const [fotos, setFotos] = useState<ReadonlyMap<string, string>>(new Map());
  const [catHabitual, setCatHabitual] = useState<string | null>(null);
  const [verTodos, setVerTodos] = useState(false);
  const [enCurso, setEnCurso] = useState<EnCurso | null>(null);
  // Cómo llegó la hoja abierta: si lo escrito ya no es eso, cerrarla (o salir de la pantalla) pregunta antes de perderlo.
  const [hojaInicial, setHojaInicial] = useState<string | null>(null);
  const [lineas, setLineas] = useState<LineaCompra[]>([]);
  const [tipo, setTipo] = useState<TipoPapel | null>(null);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [subida, setSubida] = useState<{ archivo: File; ruta: string } | null>(null);
  const [monto, setMonto] = useState("");
  const [pago, setPago] = useState<PagoCompra>(PAGO_DE_FABRICA);
  // Lo pagado sigue a lo que dice el papel hasta que la persona lo cambia: así «Pagar ahora» de fábrica es todo.
  const [pagadoPropio, setPagadoPropio] = useState(false);
  // «Pagué solo una parte» está escondido hasta tocarlo (maqueta mis-compras-rediseno-2026-10): lo normal es pagar todo lo del papel.
  const [pagoParcial, setPagoParcial] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [rechazo, setRechazo] = useState<{ titulo: string; texto: string; tono: "error" | "atencion" } | null>(null);
  // `tieneAntes`: lo que tenía al guardar. Después de guardar, la pantalla se refresca y `datos.tiene` ya trae esta compra descontada:
  // restarla otra vez decía «Ahora tienes S/ 340» con S/ 400 (prueba ciega de /formidable, 2026-10-23).
  const [guardada, setGuardada] = useState<{ monto: number; pagado: number; prendas: number; tiendas: string[]; tieneAntes: number | null } | null>(null);
  const esPersona = Boolean(useSedeActiva()?.personaSesionId);
  const responsable = useResponsable();
  const hojaTocada = enCurso !== null && firmaHoja(enCurso) !== hojaInicial;
  // En el celular, el gesto «atrás» (o un toque en el menú) sacaba de la pantalla y la compra a medias se perdía sin aviso: los pasos no
  // cambian la dirección. Con una prenda anotada (o la hoja de una a medio llenar), salir pregunta: la misma guardia de todo el ERP.
  // Guardada, ya no hay nada que perder.
  const salida = useSalidaSinGuardar(
    paso !== "listo" && (lineas.length > 0 || hojaTocada),
    lineas.length > 0
      ? `Llevas ${prendasDeLineas(lineas) === 1 ? "1 prenda anotada" : `${prendasDeLineas(lineas)} prendas anotadas`} en esta compra y todavía no se guarda. Si sales ahora, se pierde lo que anotaste.`
      : "Empezaste a anotar una prenda y la compra todavía no se guarda. Si sales ahora, se pierde lo que anotaste.",
  );

  function abrirHoja(e: EnCurso) {
    setHojaInicial(firmaHoja(e));
    setEnCurso(e);
  }

  // Cada paso empieza arriba: una pregunta nueva no se abre a media página (en el celular, la anterior dejaba el scroll abajo). Es otra
  // vista sin cambiar de URL: se suelta la reserva de <PaginaEstable> antes de pintar, o devolvía la vista adonde estaba el clic.
  useLayoutEffect(() => {
    soltarPaginaEstable();
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [paso]);

  // Sin «Tienda» delante: «va a Lima», «Mandarla a Trujillo» (Felipe 2026-10-23).
  const nombresTienda = useMemo(() => new Map(datos.tiendas.map((t) => [t.id, nombreCortoTienda(t.nombre)])), [datos.tiendas]);
  const deCategoria = useMemo(() => new Map(datos.categorias.map((c) => [c.id, c])), [datos.categorias]);
  const total = totalDeLineas(lineas);
  const ganancia = gananciaDeCompra(lineas);
  const pagoAhora: PagoCompra = { ...pago, pagado: pagadoPropio ? pago.pagado : monto };
  // Con el monto escondido, lo pagado es todo lo del papel: no hay nada que la guía pida ahí.
  const verParte = pagoParcial || pagadoPropio;
  const guia = useGuiaCampos(
    camposPapel({ tipo, conFoto: archivo !== null, monto, pago: pagoAhora }, { esPersona, listo: responsable.listo, motivo: responsable.motivo }).filter(
      (c) => c.id !== "pagado" || verParte,
    ),
  );
  const montoLeido = leerMontoPlata(monto);
  const pagadoLeido = pago.forma === "despues" ? 0 : leerMontoPlata(pagoAhora.pagado);
  const cuadra = cuadraElPapel(montoLeido, totalDeLineas(lineas));
  const nombreCorto = proveedor ? proveedor.nombre.replace(/\s+(s\.?a\.?c\.?|e\.?i\.?r\.?l\.?|s\.?r\.?l\.?)$/i, "") : "";
  /** Una prenda de la compra, en su fila (la de «¿Está bien así?» se toca para corregirla; la del papel solo se lee). */
  const filaDeLinea = (l: LineaCompra) => {
    const c = deCategoria.get(l.categoriaId);
    return (
      <span className="grid grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-3 py-3">
        <MiniaturaPrenda fotoUrl={(l.productoId && fotos.get(l.productoId)) || null} tamano="md" prefijo={c?.prefijo} familia={c?.familia} categoria={l.categoria} />
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-tinta">
            {l.cantidad} · {l.nombre}
          </span>
          <span className="block truncate text-xs tabular-nums text-taupe">
            {l.cantidad} × {soles(l.costo)} · va a {nombresTienda.get(l.destinoId) ?? "una tienda"}
          </span>
        </span>
        <span className="whitespace-nowrap text-sm tabular-nums text-tinta">{soles(l.cantidad * l.costo)}</span>
      </span>
    );
  };

  // El último proveedor elegido: con el internet lento del celular, quien elegía uno, volvía y elegía otro recibía las prendas del PRIMERO
  // si su respuesta llegaba después (y hasta su hoja de «Algo nuevo»). Solo cuenta la respuesta del último.
  const proveedorPedido = useRef<string | null>(null);

  async function elegirProveedor(p: ProveedorParaComprar) {
    proveedorPedido.current = p.id;
    setProveedor(p);
    setCatHabitual(null);
    setVerTodos(false);
    setHabituales("cargando");
    setFotos(new Map());
    setPaso("habituales");
    const leidos = await cargarHabituales(p.id);
    if (proveedorPedido.current !== p.id) return;
    setHabituales(leidos);
    if (leidos?.length)
      void cargarFotosDeHabituales(leidos.flatMap((h) => (h.productoId ? [h.productoId] : []))).then((f) => {
        if (proveedorPedido.current === p.id) setFotos(f);
      });
    // Sin nada que se le haya comprado ni prendas suyas en el catálogo: la hoja de «Algo nuevo», de entrada.
    if (leidos !== null && leidos.length === 0) algoNuevo([]);
  }

  function alRegistrarProveedor(p: ProveedorRegistrado) {
    const elegido: ProveedorParaComprar = proveedores.find((x) => x.id === p.id) ?? { id: p.id, nombre: p.nombre, ruc: p.ruc, categorias: [], compras: 0, ultima: null };
    setProveedores((ps) => (ps.some((x) => x.id === p.id) ? ps : [...ps, elegido]));
    setRegistrando(false);
    void elegirProveedor(elegido);
  }

  const habitualesLeidos = Array.isArray(habituales) ? habituales : [];
  const marcasDelProveedor = marcasDeHabituales(habitualesLeidos);

  // «Algo nuevo»: la misma hoja, con qué es, la marca y el nombre arriba. `suyos`: los habituales recién leídos (al elegir un proveedor
  // sin prendas, el estado todavía no los tiene).
  function algoNuevo(suyos: Habitual[] = habitualesLeidos) {
    abrirHoja({ habitual: EN_BLANCO, cantidad: "", costo: "", venta: "", ...destinosDeEntrada(), edita: null, nueva: nuevoVacio(marcasDeHabituales(suyos)) });
  }

  // La tienda llega marcada con la de la prenda anterior; el reparto, vacío hasta que se marque otra.
  function destinosDeEntrada(): Pick<BorradorPrenda, "destinos" | "reparto"> {
    const anterior = tiendaAnterior(lineas);
    return { destinos: anterior ? [anterior] : [], reparto: {} };
  }

  function elegirHabitual(h: Habitual) {
    // Si ya va en la compra, la hoja se abre con lo anotado para corregirla.
    const ya = lineas.findIndex((l) => l.clave === h.clave);
    if (ya >= 0) return corregir(ya);
    abrirHoja({
      habitual: h,
      // La cantidad llega vacía: con la de la vez pasada escrita, un toque rápido compraba 10 en vez de 3 (/formidable 2026-10-23,
      // OK de Felipe). La de la vez pasada se ofrece al lado, de un toque. El costo y la venta SÍ llegan con lo de la vez pasada y lo del
      // catálogo (la maqueta: «Toca una prenda: viene con lo de la vez pasada»), con su atajo marcado para volver a ellos.
      cantidad: "",
      costo: h.costo != null ? h.costo.toFixed(2) : "",
      venta: h.venta != null ? h.venta.toFixed(2) : "",
      ...destinosDeEntrada(),
      edita: null,
    });
    if (paso !== "habituales") setPaso("habituales");
  }

  function corregir(i: number) {
    const l = lineas[i];
    const h = (Array.isArray(habituales) ? habituales.find((x) => x.clave === l.clave) : undefined) ?? {
      clave: l.clave,
      productoId: l.productoId,
      nombre: l.nombre,
      categoriaId: l.categoriaId,
      categoria: l.categoria,
      marcaId: l.marcaId,
      marca: l.marca,
      veces: 0,
      ultimaFecha: null,
      ultimaCantidad: null,
      costo: null,
      venta: null,
    };
    // Repartida entre tiendas, son varias líneas: se juntan de vuelta en la hoja.
    abrirHoja({ habitual: h, ...borradorDeLineas(lineas.filter((x) => x.clave === l.clave)), edita: l.clave });
  }

  // La hoja que ya se agregó o se quitó: un doble clic (dos clics en el mismo instante, antes de que la hoja se cierre) la metía dos veces
  // en la compra, o quitaba dos prendas (/chaos 2026-10-23). Cada hoja abierta es un objeto propio: la segunda vez no hace nada.
  const hojaHecha = useRef<EnCurso | null>(null);

  // «Agregar» de la hoja: la prenda entra a la compra (o se corrige) y se vuelve a donde se estaba, la grilla o el resumen.
  function agregarPrenda() {
    if (!enCurso || hojaHecha.current === enCurso) return;
    const h = enCurso.nueva ? habitualDeNuevo(`nuevo:${crypto.randomUUID()}`, enCurso.nueva, datos.categorias, datos.marcas) : enCurso.habitual;
    const nuevas: LineaCompra[] = h ? lineasDeBorrador(h, enCurso) : [];
    if (nuevas.length === 0) return;
    hojaHecha.current = enCurso;
    const clave = enCurso.edita;
    setLineas((ls) => {
      if (clave == null) return [...ls, ...nuevas];
      // Corrige: las líneas de esa prenda se reemplazan en su lugar (pueden ser más o menos que antes, si cambió el reparto).
      const desde = ls.findIndex((x) => x.clave === clave);
      const resto = ls.filter((x) => x.clave !== clave);
      return [...resto.slice(0, desde), ...nuevas, ...resto.slice(desde)];
    });
    setEnCurso(null);
  }

  function quitarPrenda() {
    if (enCurso?.edita == null || hojaHecha.current === enCurso) return;
    hojaHecha.current = enCurso;
    const clave = enCurso.edita;
    setLineas((ls) => ls.filter((x) => x.clave !== clave));
    setEnCurso(null);
  }

  function alPapel() {
    setMonto(total.toFixed(2));
    setPaso("papel");
  }

  async function guardar() {
    if (guardando || !proveedor) return;
    if (!guia.puedeConfirmar) {
      const ahora = guia.ahora ?? guia.faltan[0]?.id;
      if (ahora) guia.ir(ahora);
      return;
    }
    setRechazo(null);
    setGuardando(true);
    let ruta: string | null = null;
    if (archivo) {
      if (subida?.archivo === archivo) ruta = subida.ruta;
      else {
        const r = await subirFotoPapel(archivo);
        if (!r.ruta) {
          setGuardando(false);
          return setRechazo({ titulo: "No se subió la foto", texto: r.motivo ?? "Vuelve a tomarla.", tono: "error" });
        }
        setSubida({ archivo, ruta: r.ruta });
        ruta = r.ruta;
      }
    }
    const firma = esPersona ? firmaOmitida("compra_rapida") : responsable.firma();
    // Las marcas escritas con «+» en «Algo nuevo» se crean ahora, unidas al proveedor: si la compra se cancelaba antes, no quedaba una marca
    // suelta. Si ya existían, la base devuelve esa. Un reintento tras un corte las vuelve a encontrar.
    const creadas = new Map<string, string>();
    for (const m of marcasPorCrear(lineas)) {
      const r = await registrarMarcaDeCompra(m.nombre, proveedor.id, firma);
      if (!r.id) {
        setGuardando(false);
        if (!esPersona) responsable.despues(r.error);
        return setRechazo(
          r.error && esFalloDeRed(r.error)
            ? { titulo: "Se cortó la conexión", texto: "No se guardó la compra. Vuelve a tocar «Guardar».", tono: "atencion" }
            : { titulo: `No se creó la marca «${m.nombre}»`, texto: traducirError(r.error, "crear la marca"), tono: "error" },
        );
      }
      creadas.set(m.id, r.id);
    }
    const { error } = await registrarCompraRapida(
      {
        p_id: id,
        p_proveedor_id: proveedor.id,
        p_tipo: tipo!,
        p_monto: montoLeido ?? 0,
        p_foto_ruta: ruta,
        p_lineas: lineasParaBase(conMarcasCreadas(lineas, creadas)),
        ...pagoParaBase(pagoAhora),
      },
      firma,
    );
    setGuardando(false);
    if (!esPersona) responsable.despues(error);
    if (error) {
      return setRechazo(
        esFalloDeRed(error)
          ? { titulo: "Se cortó la conexión", texto: "No sabemos si se guardó. Vuelve a tocar «Guardar»: si ya se guardó, no se repite.", tono: "atencion" }
          : { titulo: "No se guardó", texto: traducirError(error, "guardar la compra"), tono: "error" },
      );
    }
    setGuardada({ monto: montoLeido ?? 0, pagado: pagadoLeido ?? 0, prendas: prendasDeLineas(lineas), tiendas: tiendasDeLineas(lineas, nombresTienda), tieneAntes: datos.tiene });
    setPaso("listo");
    // La guardia del «atrás» se retira antes de refrescar: los dos a la vez pueden recargar la página entera (useSalidaSinGuardar).
    void salida.retirarYa().then(() => router.refresh());
  }

  function otraCompra() {
    setId(crypto.randomUUID());
    setProveedor(null);
    setLineas([]);
    setTipo(null);
    setArchivo(null);
    setSubida(null);
    setMonto("");
    setPago(PAGO_DE_FABRICA);
    setPagadoPropio(false);
    setPagoParcial(false);
    setGuardada(null);
    setRechazo(null);
    setPaso("proveedor");
  }

  const atras = ANTERIOR[paso];
  // Arriba, como la maqueta (mis-compras-rediseno-2026-10): la flecha, a quién le compraste y en qué paso vas, y el camino de 3 tramos con
  // nombre (El proveedor · Las prendas · Papel y pago): los hechos en verde con su ✓, el de ahora en tinta, el que falta en arena.
  const fase = faseDePaso(paso);
  const cabecera = paso !== "listo" && (
    <div className="flex flex-col gap-3" data-guia="compra.avance">
      <div className="flex items-center gap-3">
        {atras ? <Volver onClick={() => setPaso(atras)} a="el paso anterior" /> : <Volver href="/compras/mi-plata" a="Mis compras" />}
        <span className="min-w-0 truncate text-xs text-taupe">{lineaDeAvance(paso, proveedor ? nombreCorto : null)}</span>
      </div>
      <CaminoDePasos pasos={PASOS_DE_LA_COMPRA} ahora={fase - 1} etiqueta={textoAvance(paso)} />
    </div>
  );

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-5 pb-8">
      {cabecera}
      {paso === "proveedor" && (
        <PasoProveedor
          datos={datos}
          proveedores={proveedores}
          alNuevo={() => setRegistrando(true)}
          q={q}
          setQ={setQ}
          cat={catProveedor}
          setCat={setCatProveedor}
          alElegir={(p) => void elegirProveedor(p)}
        />
      )}
      {registrando && (
        <RegistrarProveedorOrden
          proveedores={proveedores}
          tipeado={q}
          esPersona={esPersona}
          responsable={responsable}
          sinResponsable="Desde una terminal no se registra un proveedor aquí: entra con tu cuenta, o pídele a tu líder que lo registre en Compras ▸ Proveedores."
          onRegistrado={alRegistrarProveedor}
          onClose={() => setRegistrando(false)}
        />
      )}

      {paso === "habituales" && proveedor && (
        <section className="flex flex-col gap-4">
          <h2 className="compra-pregunta">¿Qué le compraste?</h2>
          <p className="-mt-2 text-sm text-taupe">
            {Array.isArray(habituales) && habituales.length === 0
              ? "Todavía no le compraste nada: descríbelo con «Algo nuevo»."
              : "Toca una prenda de las suyas: viene con lo de la vez pasada. Si es otra, usa «Algo nuevo»."}
          </p>
          {habituales === "cargando" ? (
            <p className="text-sm text-taupe" role="status">
              Buscando lo que le compras…
            </p>
          ) : habituales === null ? (
            <Aviso tono="error" titulo="No se pudieron leer sus prendas">
              Vuelve atrás y elige otra vez al proveedor.
            </Aviso>
          ) : (
            <ListaHabituales
              habituales={habituales}
              lineas={lineas}
              categorias={datos.categorias}
              nombresTienda={nombresTienda}
              cat={catHabitual}
              setCat={setCatHabitual}
              verTodos={verTodos}
              setVerTodos={setVerTodos}
              alElegir={elegirHabitual}
              alCorregir={corregir}
              fotos={fotos}
            />
          )}
          {/* La barra de abajo: «Algo nuevo» y la barra negra de la maqueta (lo que lleva la compra, y «Seguir»). Pegada al pie de la
              columna, no a la ventana: fija, en escritorio el menú lateral la tapaba. */}
          <div className="sticky bottom-0 z-10 flex flex-col gap-2 bg-crema/95 py-3 backdrop-blur">
            {/* «Algo nuevo», fijo abajo junto a lo que lleva la compra (Felipe 2026-10-23): con muchas prendas, la tarjeta del final de la
                grilla quedaba lejos y en el celular había que bajar hasta ella. */}
            {Array.isArray(habituales) && (
              <button
                type="button"
                onClick={() => algoNuevo()}
                data-guia="compra.algo-nuevo"
                /* unificar-fijo: la misma fila punteada de «Es un proveedor nuevo», en chico, para que «Algo nuevo» se vea sin competir con la barra */
                className="card-cayla mov-boton grid grid-cols-[32px_minmax(0,1fr)] items-center gap-3 rounded-[16px] border-dashed border-tinta/50 bg-papel px-3 py-2 text-left"
              >
                <span aria-hidden className="grid h-8 w-8 place-items-center rounded-full bg-tinta text-crema">
                  <Plus className="h-4 w-4" />
                </span>
                {/* También es la salida de quien no encuentra la prenda en la grilla o no sabe cómo la llaman en la tienda (Felipe
                    2026-10-23): la describe como la conoce, y Recibir la registra después. */}
                <span className="min-w-0">
                  <span className="block text-sm font-semibold leading-tight text-tinta">Algo nuevo</span>
                  <span className="block truncate text-xs text-taupe">Una prenda que no está en la lista</span>
                </span>
              </button>
            )}
            {lineas.length > 0 ? (
              <div className="flex items-center gap-3 rounded-full bg-tinta py-1.5 pl-5 pr-1.5 text-crema" data-guia="compra.carrito">
                <span className="min-w-0 flex-1">
                  <b className="block truncate text-[15px] font-medium tabular-nums">{resumenCarrito(lineas).titulo}</b>
                  <span className="block text-xs text-crema/75">{resumenCarrito(lineas).detalle}</span>
                </span>
                {/* Sobre la barra negra el secundario (transparente) quedaba tinta sobre tinta: lleva el fondo crema de la maqueta, que en
                    modo oscuro se invierte con la barra. */}
                <Boton peso="fantasma" className="border-transparent bg-crema" onClick={() => setPaso("revisar")} data-guia="compra.revisar">
                  <span className="inline-flex items-center gap-2">
                    Seguir
                    <ArrowRight className="h-4 w-4" aria-hidden />
                  </span>
                </Boton>
              </div>
            ) : (
              <p className="text-center text-sm text-taupe">Elige al menos una prenda para seguir</p>
            )}
          </div>
        </section>
      )}

      {paso === "revisar" && (
        <section className="flex flex-col gap-4">
          <h2 className="compra-pregunta">¿Está bien así?</h2>
          <p className="-mt-2 text-sm text-taupe">Toca una prenda para corregirla o quitarla.</p>
          {lineas.length === 0 ? (
            <Vacio icono={<Store aria-hidden />} titulo="Todavía no anotas nada" tamano="chico">
              Elige qué le compras.
            </Vacio>
          ) : (
            // Una tarjeta por prenda (no una fila por tienda): su foto, cuántas y a cuánto, y a qué tiendas va; el total a la derecha.
            <ul className="flex flex-col gap-2.5" data-guia="compra.lineas">
              {prendasDeLaCompra(lineas).map((pr) => {
                const c = deCategoria.get(pr.categoriaId);
                return (
                  <li key={pr.clave}>
                    <button
                      type="button"
                      onClick={() => corregir(pr.indice)}
                      className="card-cayla mov-boton grid w-full grid-cols-[48px_minmax(0,1fr)_auto] items-start gap-3 rounded-[18px] p-3 text-left"
                    >
                      <MiniaturaPrenda fotoUrl={(pr.productoId && fotos.get(pr.productoId)) || null} tamano="lg" prefijo={c?.prefijo} familia={c?.familia} categoria={pr.categoria} />
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-tinta">{pr.nombre}</span>
                        <span className="block text-xs tabular-nums text-taupe">
                          {pr.cantidad} × {soles(pr.costo)}
                        </span>
                        <span className="mt-1.5 flex flex-wrap gap-1.5">
                          {pr.tiendas.map((t) => (
                            <Chip key={t.destinoId} tono="neutro" versalitas={false}>
                              {nombresTienda.get(t.destinoId) ?? "Tienda"} {t.cantidad}
                            </Chip>
                          ))}
                        </span>
                      </span>
                      <span className="flex flex-col items-end gap-1">
                        <span className="whitespace-nowrap font-medium tabular-nums text-tinta">{soles(pr.total)}</span>
                        <ChevronRight className="h-4 w-4 text-taupe" aria-hidden />
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <button
            type="button"
            onClick={() => setPaso("habituales")}
            /* unificar-fijo: la misma fila punteada de «Es un proveedor nuevo» y «Algo nuevo», en chico */
            className="card-cayla mov-boton grid grid-cols-[32px_minmax(0,1fr)] items-center gap-3 rounded-[16px] border-dashed border-tinta/50 bg-papel px-3 py-2 text-left"
          >
            <span aria-hidden className="grid h-8 w-8 place-items-center rounded-full bg-tinta text-crema">
              <Plus className="h-4 w-4" />
            </span>
            <span className="min-w-0 truncate text-sm font-semibold text-tinta">Otra prenda de {nombreCorto}</span>
          </button>
          {lineas.length > 0 && (
            // La cuenta de la compra: lo que cuesta, lo que se vende y lo que se gana, y qué le toca a cada tienda.
            <div className="card-cayla flex flex-col gap-3 rounded-[18px] p-4" data-guia="compra.resumen">
              {/* «Total», no «Pagaste»: todavía no se eligió cómo pagar (puede ser «Paga Compras»). */}
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-tinta/65">Total · {prendasDeLineas(lineas) === 1 ? "1 prenda" : `${prendasDeLineas(lineas)} prendas`}</span>
                <span className="font-serif text-3xl tabular-nums text-tinta">{soles(total)}</span>
              </div>
              {totalesPorTienda(lineas).length > 1 && (
                <ul className="flex flex-col gap-1 border-t border-sand pt-2.5 text-sm">
                  {totalesPorTienda(lineas).map((t) => (
                    <li key={t.destinoId} className="flex justify-between gap-3 text-tinta/75">
                      <span>
                        {nombresTienda.get(t.destinoId) ?? "Tienda"} · {t.prendas === 1 ? "1 prenda" : `${t.prendas} prendas`}
                      </span>
                      <span className="tabular-nums">{soles(t.total)}</span>
                    </li>
                  ))}
                </ul>
              )}
              {ganancia && (
                <p
                  /* unificar-fijo: el dato de lo que se gana si se vende todo (la maqueta), no un aviso */ className="flex items-center justify-between gap-3 rounded-[12px] bg-verde/10 px-3 py-2.5 text-sm"
                >
                  <span className="text-tinta">
                    Si se vende todo, ganas
                    <span className="block text-xs text-taupe">Vendes {soles(ganancia.vendes)}</span>
                  </span>
                  <b className="text-[17px] tabular-nums text-verde">{soles(ganancia.ganas)}</b>
                </p>
              )}
            </div>
          )}
          <div className="sticky bottom-0 z-10 bg-crema/95 py-3 backdrop-blur">
            <div className="flex items-center gap-3 rounded-full bg-tinta py-1.5 pl-5 pr-1.5 text-crema">
              <span className="min-w-0 flex-1">
                <b className="block truncate text-[15px] font-medium tabular-nums">{resumenCarrito(lineas).titulo}</b>
                <span className="block text-xs text-crema/75">{resumenCarrito(lineas).detalle}</span>
              </span>
              <Boton peso="fantasma" className="border-transparent bg-crema" onClick={alPapel} disabled={lineas.length === 0} data-guia="compra.al-papel">
                <span className="inline-flex items-center gap-2">
                  Sigue: el papel
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </span>
              </Boton>
            </div>
          </div>
        </section>
      )}

      {paso === "papel" && (
        <form
          className="flex flex-col gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            void guardar();
          }}
        >
          <h2 className="compra-pregunta">El papel y el pago</h2>
          {/* Lo que llevas, para revisarlo de un vistazo antes de contestar (maqueta mis-compras-rediseno-2026-10). */}
          <ul className="-mt-2 divide-y divide-sand rounded-[18px] border border-sand bg-papel px-3" data-guia="compra.llevas">
            {lineas.map((l, i) => (
              <li key={`${l.clave}-${i}`}>{filaDeLinea(l)}</li>
            ))}
          </ul>
          <CampoGuiado id="tipo" guia={guia} titulo="¿Qué papel te dieron?">
            <div role="group" aria-label="¿Qué te dio el proveedor?" className="grid grid-cols-2 gap-2" data-guia="compra.tipo">
              {(Object.keys(TIPOS_PAPEL) as TipoPapel[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={tipo === k}
                  disabled={guardando}
                  onClick={() => {
                    setRechazo(null);
                    setTipo(k);
                  }}
                  className={`card-cayla mov-boton flex flex-col items-start gap-0.5 p-3 text-left ${tipo === k ? "border-tinta bg-sand/40" : ""}`}
                >
                  <span className="flex w-full items-center justify-between font-medium text-tinta">
                    {TIPOS_PAPEL[k].nombre}
                    {tipo === k && <Check className="h-4 w-4" aria-hidden />}
                  </span>
                  <span className="text-xs text-taupe">{TIPOS_PAPEL[k].ayuda}</span>
                </button>
              ))}
            </div>
          </CampoGuiado>
          {tipo !== null && tipo !== "sin_comprobante" && (
            <CampoGuiado id="foto" guia={guia} titulo="Foto del papel" ayuda="· opcional">
              <TarjetaFoto
                guia="compra.foto"
                archivo={archivo}
                deshabilitada={guardando}
                ayuda="Opcional: ayuda a Compras a copiar el número"
                onArchivo={(f) => {
                  setRechazo(null);
                  setArchivo(f);
                }}
              />
            </CampoGuiado>
          )}
          <CampoGuiado id="monto" guia={guia} titulo={tipo === "sin_comprobante" ? "¿Cuánto dice lo que pagaste?" : "¿Cuánto dice el papel?"}>
            <CampoMonto
              etiqueta={tipo === "sin_comprobante" ? "¿Cuánto dice lo que pagaste?" : "¿Cuánto dice el papel?"}
              etiquetaOculta
              inputMode="decimal"
              autoComplete="off"
              value={monto}
              disabled={guardando}
              data-guia="compra.monto"
              onChange={(e) => {
                setRechazo(null);
                setMonto(e.target.value);
              }}
            />
            {cuadra && (
              <p className={`mt-2 flex items-start gap-2 text-[13px] ${cuadra.cuadra ? "text-verde" : "text-ambar"}`}>
                {cuadra.cuadra ? <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> : <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />}
                {cuadra.texto}
              </p>
            )}
          </CampoGuiado>
          <div className="flex flex-col gap-2" data-guia="compra.pago">
            <span className="campo-etiqueta">¿Quién paga?</span>
            <div role="group" aria-label="¿Quién paga?" className="grid grid-cols-2 gap-2">
              {(
                [
                  { forma: "ahora", nombre: "Pagué ahora", ayuda: "Sale de tu plata" },
                  { forma: "despues", nombre: "Paga Compras", ayuda: "Después, desde Por pagar" },
                ] as const
              ).map((o) => (
                <button
                  key={o.forma}
                  type="button"
                  aria-pressed={pago.forma === o.forma}
                  disabled={guardando}
                  onClick={() => {
                    setRechazo(null);
                    setPago((p) => ({ ...p, forma: o.forma }));
                  }}
                  className={`card-cayla mov-boton flex flex-col items-start gap-0.5 p-3 text-left ${pago.forma === o.forma ? "border-tinta bg-sand/40" : ""}`}
                >
                  <span className="flex w-full items-center justify-between font-medium text-tinta">
                    {o.nombre}
                    {pago.forma === o.forma && <Check className="h-4 w-4" aria-hidden />}
                  </span>
                  <span className="text-xs text-taupe">{o.ayuda}</span>
                </button>
              ))}
            </div>
          </div>
          {pago.forma === "ahora" && (
            <>
              <CampoGuiado id="medio" guia={guia} titulo="¿Con qué pagaste?">
                <FichasMedio
                  etiqueta="¿Con qué pagaste?"
                  opciones={MEDIOS_PAGO_COMPRA}
                  valor={pago.medio}
                  onValor={(m) => {
                    setRechazo(null);
                    setPago((p) => ({ ...p, medio: m }));
                  }}
                  guia={(m) => (m === "yape" ? "compra.medio" : undefined)}
                  deshabilitado={guardando}
                />
              </CampoGuiado>
              {/* «Pagué solo una parte»: escondido hasta tocarlo. Al volver a «Pagué todo», lo pagado vuelve a seguir al papel. */}
              {verParte ? (
                <CampoGuiado id="pagado" guia={guia} titulo="¿Cuánto pagaste?">
                  <CampoMonto
                    etiqueta="¿Cuánto pagaste?"
                    etiquetaOculta
                    inputMode="decimal"
                    autoComplete="off"
                    value={pagoAhora.pagado}
                    disabled={guardando}
                    data-guia="compra.pagado"
                    onChange={(e) => {
                      setRechazo(null);
                      setPagadoPropio(true);
                      setPago((p) => ({ ...p, pagado: e.target.value }));
                    }}
                  />
                  {textoLoQueFalta(montoLeido, pagadoLeido) && <p className="mt-2 text-[13px] text-taupe">{textoLoQueFalta(montoLeido, pagadoLeido)}</p>}
                  <button
                    type="button"
                    className="btn-cayla btn-enlace mt-1 self-start"
                    onClick={() => {
                      setPagoParcial(false);
                      setPagadoPropio(false);
                    }}
                  >
                    Pagué todo
                  </button>
                </CampoGuiado>
              ) : (
                <button type="button" className="btn-cayla btn-enlace -mt-2 self-start" data-guia="compra.parte" onClick={() => setPagoParcial(true)}>
                  Pagué solo una parte
                </button>
              )}
            </>
          )}
          {!esPersona && (
            <CampoGuiado id="responsable" guia={guia} titulo="Quién compró">
              <ComboResponsable control={responsable} deshabilitado={guardando} />
            </CampoGuiado>
          )}
          {rechazo && (
            <Aviso tono={rechazo.tono} titulo={rechazo.titulo}>
              {rechazo.texto}
            </Aviso>
          )}
          <PieGuia guia={guia} listo="Todo listo para guardar." conFrase />
          <Boton
            type="submit"
            peso="primario"
            cargando={guardando}
            textoCargando="Guardando…"
            disabled={!guia.puedeConfirmar}
            title={guia.frase ?? undefined}
            className={guia.claseConfirmar}
            data-guia="compra.guardar"
          >
            {montoLeido != null && montoLeido > 0 ? `Guardar la compra · ${soles(montoLeido)}` : "Guardar la compra"}
          </Boton>
        </form>
      )}

      {enCurso && (
        <HojaPrenda
          habitual={enCurso.habitual}
          borrador={enCurso}
          cambiar={(cambio) => setEnCurso((e) => (e ? { ...e, ...cambio } : e))}
          tiendas={datos.tiendas}
          tiendaAnterior={tiendaAnterior(lineas)}
          corrige={enCurso.edita != null}
          tocada={hojaTocada}
          onAgregar={agregarPrenda}
          onQuitar={quitarPrenda}
          onClose={() => setEnCurso(null)}
          nueva={
            enCurso.nueva && proveedor
              ? {
                  borrador: enCurso.nueva,
                  cambiar: (cambio) => setEnCurso((e) => (e?.nueva ? { ...e, nueva: { ...e.nueva, ...cambio } } : e)),
                  proveedor: nombreCorto,
                  categorias: datos.categorias,
                  suyas: new Set(habitualesLeidos.map((x) => x.categoriaId)),
                  marcas: datos.marcas,
                  marcasDelProveedor,
                  habituales: habitualesLeidos,
                  usar: elegirHabitual,
                }
              : undefined
          }
        />
      )}

      {paso === "listo" && guardada && (
        <section className="flex flex-col items-center gap-4 pt-6 text-center" data-guia="compra.listo">
          {/* El visto que se dibuja una vez (la maqueta), con la misma clase que el ícono de un vacío o un aviso. */}
          <span className="trazo-dibuja grid h-24 w-24 place-items-center rounded-full bg-verde text-crema" aria-hidden>
            <Check className="h-11 w-11" />
          </span>
          <h2 className="compra-pregunta">Compra guardada</h2>
          <p className="-mt-2 text-sm text-tinta/70">
            {guardada.prendas === 1 ? "1 prenda" : `${guardada.prendas} prendas`} a {nombreCorto} por {soles(guardada.monto)}.
            {guardada.tieneAntes != null && (
              <>
                <br />
                {textoPlataDespues(guardada.tieneAntes - guardada.pagado)}
              </>
            )}
            {textoLoQueFalta(guardada.monto, guardada.pagado) && (
              <>
                <br />
                {textoLoQueFalta(guardada.monto, guardada.pagado)}
              </>
            )}
          </p>
          <p className="nota-cayla w-full text-left text-sm">Compras copia el número del papel después. Tú ya terminaste con esta compra.</p>
          <div className="flex w-full flex-col gap-2 pt-2">
            {guardada.tiendas.length > 0 && (
              <BotonEnlace href="/compras/mi-plata?mandar=1" peso="primario" data-guia="compra.mandar">
                <span className="inline-flex items-center gap-2">
                  <Truck className="h-4 w-4" aria-hidden />
                  Mandarla a {guardada.tiendas.join(" y ")} ahora
                </span>
              </BotonEnlace>
            )}
            <Boton peso={guardada.tiendas.length > 0 ? "fantasma" : "primario"} onClick={otraCompra}>
              <span className="inline-flex items-center gap-2">
                <Plus className="h-4 w-4" aria-hidden />
                Anotar otra compra
              </span>
            </Boton>
            <Link href="/compras/mi-plata" className="btn-cayla btn-enlace self-center">
              Ver mis compras
            </Link>
          </div>
        </section>
      )}
      {salida.aviso}
    </div>
  );
}

function PasoProveedor({
  datos,
  proveedores,
  alNuevo,
  q,
  setQ,
  cat,
  setCat,
  alElegir,
}: {
  datos: Datos;
  proveedores: ProveedorParaComprar[];
  alNuevo: () => void;
  q: string;
  setQ: (v: string) => void;
  cat: string | null;
  setCat: (v: string | null) => void;
  alElegir: (p: ProveedorParaComprar) => void;
}) {
  const categorias = categoriasConProveedor(proveedores, datos.categorias);
  const nombreCat = new Map(datos.categorias.map((c) => [c.id, c.nombre]));
  const hoy = hoyLima();
  const buscando = q.trim() !== "" || cat !== null;
  // Sin buscar: primero a quién le compraste hace poco (la maqueta), después los demás. Buscando: lo que coincide.
  const recientes = buscando ? [] : proveedoresRecientes(proveedores);
  const lista = buscando ? filtrarProveedores(proveedores, q, cat) : [...recientes, ...proveedores.filter((p) => !recientes.includes(p))];
  // De 10 en 10 (Felipe 2026-10-23): se dibujan los primeros y, al llegar al final de la lista, la tanda siguiente. Cambiar la búsqueda o la
  // categoría vuelve a los primeros 10 (la tanda se guarda con la búsqueda a la que pertenece: sin efecto que la reinicie).
  const claveBusqueda = `${q.trim()}|${cat ?? ""}`;
  const [tanda, setTanda] = useState({ clave: claveBusqueda, cuantos: PROVEEDORES_POR_TANDA });
  const cuantos = tanda.clave === claveBusqueda ? tanda.cuantos : PROVEEDORES_POR_TANDA;
  const { visibles, quedan } = tandaDeLista(lista, cuantos);
  const verRecientes = visibles.filter((p) => recientes.includes(p));
  const verResto = visibles.filter((p) => !recientes.includes(p));
  // El centinela al pie de la lista suma una tanda al asomar (como la grilla de Vender): el `setTanda` vive en el callback del observador.
  const centinela = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = centinela.current;
    if (!el || quedan === 0 || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entradas) => {
        if (entradas[0]?.isIntersecting) setTanda({ clave: claveBusqueda, cuantos: cuantos + PROVEEDORES_POR_TANDA });
      },
      // Solo cuando el pie de la lista de verdad asoma: con margen, la tanda siguiente llegaba antes de terminar de ver la primera.
      { rootMargin: "0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [claveBusqueda, cuantos, quedan]);
  const fila = (p: ProveedorParaComprar) => (
    <li key={p.id}>
      <button
        type="button"
        onClick={() => alElegir(p)}
        className="card-cayla mov-boton grid w-full grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl p-3 text-left"
      >
        <span className="compra-iniciales" aria-hidden>
          {inicialesProveedor(p.nombre)}
        </span>
        <span className="min-w-0">
          <span className="block truncate font-medium text-tinta">{p.nombre}</span>
          <span className="block truncate text-xs text-taupe">
            {p.compras > 0
              ? detalleProveedor(p, hoy)
              : p.categorias.length
                ? `Vende ${p.categorias.map((c) => nombreCat.get(c) ?? "").filter(Boolean).slice(0, 3).join(", ").toLowerCase()}`
                : "Todavía no le compras"}
          </span>
        </span>
        <ChevronRight className="h-4 w-4 text-taupe" aria-hidden />
      </button>
    </li>
  );
  return (
    <section className="flex flex-col gap-4">
      <h2 className="compra-pregunta">¿A quién le compraste?</h2>
      <Buscador
        valor={q}
        onCambio={setQ}
        tamano="mostrador"
        etiqueta="Busca el proveedor"
        placeholder="Nombre del proveedor" // sugerir-fijo: se busca un proveedor por su nombre; no depende de nada elegido antes
        guia="compra.buscador"
      />
      {/* Registrar un proveedor nuevo, a la vista bajo el buscador (Felipe 2026-10-23: «no se nota que tiene esa opción»; antes era un
          botón gris pegado al pie). */}
      <button
        type="button"
        onClick={alNuevo}
        data-guia="compra.proveedor-nuevo"
        className="card-cayla mov-boton grid grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-3 rounded-[18px] border-dashed border-tinta/40 px-3.5 py-3 text-left"
      >
        <span aria-hidden className="grid h-10 w-10 place-items-center rounded-full bg-tinta text-crema">
          <Plus className="h-5 w-5" />
        </span>
        <span className="min-w-0">
          <span className="block font-medium text-tinta">Es un proveedor nuevo</span>
          <span className="block text-xs text-taupe">¿Primera vez que le compras? Regístralo aquí</span>
        </span>
        <ChevronRight className="h-4 w-4 text-taupe" aria-hidden />
      </button>
      {buscando && lista.length === 0 ? (
        <Vacio
          icono={<Store aria-hidden />}
          titulo="No hay un proveedor así"
          tamano="chico"
          acciones={
            <Boton peso="primario" onClick={alNuevo}>
              <span className="inline-flex items-center gap-2">
                <Plus className="h-4 w-4" aria-hidden />
                {q.trim() ? `Registrar «${q.trim()}»` : "Registrar un proveedor nuevo"}
              </span>
            </Boton>
          }
        >
          Si es la primera vez que le compras, regístralo.
        </Vacio>
      ) : (
        <div className="flex flex-col gap-2" data-guia="compra.proveedores">
          {verRecientes.length > 0 && (
            <>
              <span className="label-cayla text-[11px] text-taupe">Les compraste hace poco</span>
              <ul className="flex flex-col gap-2">{verRecientes.map(fila)}</ul>
            </>
          )}
          {verResto.length > 0 && (
            <>
              {verRecientes.length > 0 && <span className="label-cayla pt-2 text-[11px] text-taupe">Los demás</span>}
              <ul className="flex flex-col gap-2">{verResto.map(fila)}</ul>
            </>
          )}
          {/* Sin IntersectionObserver (navegador viejo), el centinela es un botón que trae la tanda siguiente. */}
          {quedan > 0 && (
            <div ref={centinela} className="flex justify-center pt-1">
              <BotonVerMas
                forma="enlace"
                abierto={false}
                onCambiar={() => setTanda({ clave: claveBusqueda, cuantos: cuantos + PROVEEDORES_POR_TANDA })}
                texto={quedan <= PROVEEDORES_POR_TANDA ? `Ver ${quedan === 1 ? "el que falta" : `los ${quedan} que faltan`}` : `Ver ${PROVEEDORES_POR_TANDA} más · faltan ${quedan}`}
              />
            </div>
          )}
        </div>
      )}
      {categorias.length > 1 && (
        <div className="flex flex-col gap-2">
          <span className="label-cayla text-[11px] text-taupe">O busca por lo que vende</span>
          <div className="flex flex-wrap gap-2" data-guia="compra.categorias">
            {categorias.map((c) => (
              <BotonFiltro key={c.id} activo={cat === c.id} onClick={() => setCat(cat === c.id ? null : c.id)} cuenta={proveedores.filter((p) => p.categorias.includes(c.id)).length}>
                {c.nombre}
              </BotonFiltro>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function ListaHabituales({
  habituales,
  lineas,
  categorias,
  nombresTienda,
  cat,
  setCat,
  verTodos,
  setVerTodos,
  alElegir,
  alCorregir,
  fotos,
}: {
  habituales: Habitual[];
  lineas: LineaCompra[];
  categorias: CategoriaParaComprar[];
  nombresTienda: ReadonlyMap<string, string>;
  cat: string | null;
  setCat: (v: string | null) => void;
  verTodos: boolean;
  setVerTodos: (v: boolean) => void;
  alElegir: (h: Habitual) => void;
  alCorregir: (i: number) => void;
  /** La foto de cada prenda del catálogo, por `producto_id`. */
  fotos: ReadonlyMap<string, string>;
}) {
  const cats = categoriasDeHabituales(habituales);
  const deCat = cat ? habituales.filter((h) => h.categoriaId === cat) : habituales;
  const ver = verTodos || cat ? deCat : deCat.slice(0, HABITUALES_A_LA_VISTA);
  // La miniatura sin foto es el ícono de su categoría sobre su tono (ADR-0333): el prefijo y la familia salen de la categoría.
  const deCategoria = new Map(categorias.map((c) => [c.id, c]));
  const claves = new Set(habituales.map((h) => h.clave));
  // Las prendas nuevas que ya van en la compra también son tarjetas: así se corrigen igual que las de siempre (una por prenda).
  const nuevas = lineas.map((l, i) => ({ l, i })).filter(({ l, i }) => !claves.has(l.clave) && lineas.findIndex((x) => x.clave === l.clave) === i);
  const tarjeta = (clave: string, productoId: string | null, nombre: string, categoriaId: string, categoria: string, abajo: string | null, onClick: () => void) => {
    const c = deCategoria.get(categoriaId);
    const mosaico = <MosaicoPrenda forma="grilla" prefijo={c?.prefijo} familia={c?.familia as never} categoria={categoria} conNombre={false} className="w-full aspect-[4/3]!" />;
    const foto = productoId ? fotos.get(productoId) : undefined;
    // Repartida entre tiendas, una prenda son varias líneas: la tarjeta suma todas.
    const suyas = lineas.filter((l) => l.clave === clave);
    const linea = suyas.length > 0;
    return (
      <li key={clave}>
        <button
          type="button"
          onClick={onClick}
          className={`card-cayla mov-boton relative flex h-full w-full flex-col gap-2 rounded-[18px] p-2.5 text-left ${linea ? "border-tinta ring-1 ring-inset ring-tinta" : ""}`}
        >
          {/* La foto de la prenda, servida al tamaño en que se ve; sin foto (o si no carga), su categoría sobre su tono (ADR-0333). */}
          {foto ? (
            <span className="relative block aspect-[4/3] w-full overflow-hidden rounded-xl border border-tinta/10 bg-sand/50">
              <ImagenDePrenda src={foto} alt="" fill sizes="(min-width: 640px) 140px, 45vw" className="object-cover" fallback={mosaico} />
            </span>
          ) : (
            mosaico
          )}
          {linea && <Globito n={prendasDeLineas(suyas)} esquina etiqueta="en la compra" className="absolute right-4 top-4" />}
          <span className="text-[13.5px] font-medium leading-tight text-tinta">{nombre}</span>
          {(linea || abajo) && (
            <span className="text-[11.5px] leading-snug text-taupe">
              {linea ? textoPrendaEnCompra(suyas, nombresTienda) : abajo}
            </span>
          )}
        </button>
      </li>
    );
  };
  return (
    <>
      {cats.length > 1 && (
        <div className="flex flex-wrap gap-2" data-guia="compra.categorias-suyas">
          <BotonFiltro activo={cat === null} onClick={() => setCat(null)} cuenta={habituales.length}>
            Todos
          </BotonFiltro>
          {cats.map((c) => (
            <BotonFiltro key={c.id} activo={cat === c.id} onClick={() => setCat(cat === c.id ? null : c.id)} cuenta={c.cuantos}>
              {c.nombre}
            </BotonFiltro>
          ))}
        </div>
      )}
      <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3" data-guia="compra.habituales">
        {nuevas.map(({ l, i }) => tarjeta(l.clave, l.productoId, l.nombre, l.categoriaId, l.categoria, null, () => alCorregir(i)))}
        {ver.map((h) =>
          tarjeta(h.clave, h.productoId, h.nombre, h.categoriaId, h.categoria, textoHabitual(h) ?? `${h.categoria}${h.marca ? ` · ${h.marca}` : ""}`, () => alElegir(h)),
        )}
      </ul>
      {!verTodos && !cat && habituales.length > HABITUALES_A_LA_VISTA && (
        <BotonVerMas forma="enlace" abierto={false} onCambiar={() => setVerTodos(true)} texto={`Ver todos los suyos (${habituales.length})`} className="self-center" />
      )}
    </>
  );
}
