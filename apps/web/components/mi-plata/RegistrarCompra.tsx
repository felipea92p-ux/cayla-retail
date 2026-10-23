"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowRight, Check, ChevronRight, Plus, SearchX, Shapes, Store, Tag, Truck } from "lucide-react";
import { Aviso } from "@/components/ui/Aviso";
import { BarraAvance } from "@/components/ui/BarraAvance";
import { Boton, BotonEnlace, CampoMonto, CampoTexto } from "@/components/ui/campos";
import { BotonFiltro } from "@/components/ui/BotonFiltro";
import { Buscador } from "@/components/ui/Buscador";
import { TituloGrupo } from "@/components/ui/TituloSeccion";
import { PreguntaParecido } from "@/components/ui/PreguntaParecido";
import { Vacio } from "@/components/ui/Vacio";
import { Volver } from "@/components/ui/Volver";
import { soltarPaginaEstable } from "@/components/ui/PaginaEstable";
import { BotonVerMas, FilasDeMas } from "@/components/ui/VerMas";
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
import { sugerirNombre } from "@/lib/sugerencias-alta-producto";
import type { ProveedorRegistrado } from "@/lib/proveedor-de-orden-reglas";
import { cargarHabituales, registrarCompraRapida, subirFotoPapel } from "@/lib/compra-rapida-acciones";
import {
  HABITUALES_A_LA_VISTA,
  TIPOS_PAPEL,
  camposPapel,
  categoriasConProveedor,
  categoriasDeHabituales,
  cuadraElPapel,
  gananciaDeCompra,
  detalleProveedor,
  inicialesProveedor,
  proveedoresRecientes,
  faltaNombreNuevo,
  faseDePaso,
  filtrarCategoriasNuevo,
  filtrarMarcas,
  filtrarProveedores,
  habitualNuevo,
  habitualParecido,
  lineaDeBorrador,
  lineasParaBase,
  marcasDeHabituales,
  NOMBRE_NUEVO_MAX,
  prendasDeLineas,
  resumenCarrito,
  textoAvance,
  textoHabitual,
  textoPlataDespues,
  tiendaAnterior,
  tiendasDeLineas,
  totalDeLineas,
  type BorradorPrenda,
  type CategoriaParaComprar,
  type Habitual,
  type LineaCompra,
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
// Guardar no mueve plata en los libros (Felipe 2026-10-22): en su plata baja al instante, y los libros la mueven cuando Compras completa
// el papel. Lo que falta en el paso del papel es lo mismo que rechaza la base (`camposPapel`). La compra lleva su identificador desde que se
// abre la pantalla: un doble clic o un reintento tras un corte no la duplican. Quién firma (decisión 39): con la cuenta de una persona, ella;
// desde una terminal, el combo «Responsable».
//
// Actividad 4: «Algo nuevo de este proveedor» (qué es → cómo se llama, con aviso si ya se la compraste → la marca, que se salta si el
// proveedor trae una sola) arma la prenda y sigue por los mismos pasos que las de siempre; un proveedor sin prendas va directo ahí.
// «Nuevo proveedor» es la misma hoja de Nueva orden de compra (`registrar_proveedor_de_orden`: lo básico, no duplica) y sigue con su
// primera compra.

type Datos = {
  proveedores: ProveedorParaComprar[];
  categorias: CategoriaParaComprar[];
  marcas: { id: string; nombre: string }[];
  tiendas: { id: string; nombre: string }[];
  tiene: number | null;
};

/** Lo que se va contestando de una prenda nueva. `descartadas`: los habituales parecidos que ya contestó con «No, es otra». */
type Nuevo = { q: string; categoria: CategoriaParaComprar | null; nombre: string; descartadas: ReadonlySet<string>; qMarca: string; otraMarca: boolean };
const NUEVO_VACIO: Nuevo = { q: "", categoria: null, nombre: "", descartadas: new Set(), qMarca: "", otraMarca: false };

/** La prenda de la hoja abierta: el habitual del que sale y lo escrito. `edita`: la posición en la compra, si se corrige. */
type EnCurso = BorradorPrenda & { habitual: Habitual; edita: number | null };

const ANTERIOR: Partial<Record<PasoCompra, PasoCompra>> = {
  habituales: "proveedor",
  "nuevo-nombre": "nuevo-categoria",
  "nuevo-marca": "nuevo-nombre",
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
  const [nuevo, setNuevo] = useState<Nuevo>(NUEVO_VACIO);
  const [habituales, setHabituales] = useState<Habitual[] | null | "cargando">("cargando");
  const [catHabitual, setCatHabitual] = useState<string | null>(null);
  const [verTodos, setVerTodos] = useState(false);
  const [enCurso, setEnCurso] = useState<EnCurso | null>(null);
  const [lineas, setLineas] = useState<LineaCompra[]>([]);
  const [tipo, setTipo] = useState<TipoPapel | null>(null);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [subida, setSubida] = useState<{ archivo: File; ruta: string } | null>(null);
  const [monto, setMonto] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [rechazo, setRechazo] = useState<{ titulo: string; texto: string; tono: "error" | "atencion" } | null>(null);
  // `tieneAntes`: lo que tenía al guardar. Después de guardar, la pantalla se refresca y `datos.tiene` ya trae esta compra descontada:
  // restarla otra vez decía «Ahora tienes S/ 340» con S/ 400 (prueba ciega de /formidable, 2026-10-23).
  const [guardada, setGuardada] = useState<{ monto: number; prendas: number; tiendas: string[]; tieneAntes: number | null } | null>(null);
  const esPersona = Boolean(useSedeActiva()?.personaSesionId);
  const responsable = useResponsable();

  // Cada paso empieza arriba: una pregunta nueva no se abre a media página (en el celular, la anterior dejaba el scroll abajo). Es otra
  // vista sin cambiar de URL: se suelta la reserva de <PaginaEstable> antes de pintar, o devolvía la vista adonde estaba el clic.
  useLayoutEffect(() => {
    soltarPaginaEstable();
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [paso]);

  const nombresTienda = useMemo(() => new Map(datos.tiendas.map((t) => [t.id, t.nombre])), [datos.tiendas]);
  const deCategoria = useMemo(() => new Map(datos.categorias.map((c) => [c.id, c])), [datos.categorias]);
  const total = totalDeLineas(lineas);
  const ganancia = gananciaDeCompra(lineas);
  const guia = useGuiaCampos(camposPapel({ tipo, conFoto: archivo !== null, monto }, { esPersona, listo: responsable.listo, motivo: responsable.motivo }));
  const montoLeido = leerMontoPlata(monto);
  const cuadra = cuadraElPapel(montoLeido, totalDeLineas(lineas));
  const nombreCorto = proveedor ? proveedor.nombre.replace(/\s+(s\.?a\.?c\.?|e\.?i\.?r\.?l\.?|s\.?r\.?l\.?)$/i, "") : "";

  async function elegirProveedor(p: ProveedorParaComprar) {
    setProveedor(p);
    setCatHabitual(null);
    setVerTodos(false);
    setHabituales("cargando");
    setPaso("habituales");
    const leidos = await cargarHabituales(p.id);
    setHabituales(leidos);
    // Sin nada que se le haya comprado ni prendas suyas en el catálogo: directo a «dinos qué es».
    if (leidos !== null && leidos.length === 0) algoNuevo();
  }

  function alRegistrarProveedor(p: ProveedorRegistrado) {
    const elegido: ProveedorParaComprar = proveedores.find((x) => x.id === p.id) ?? { id: p.id, nombre: p.nombre, ruc: p.ruc, categorias: [], compras: 0, ultima: null };
    setProveedores((ps) => (ps.some((x) => x.id === p.id) ? ps : [...ps, elegido]));
    setRegistrando(false);
    void elegirProveedor(elegido);
  }

  function algoNuevo() {
    setNuevo(NUEVO_VACIO);
    setPaso("nuevo-categoria");
  }

  const habitualesLeidos = Array.isArray(habituales) ? habituales : [];
  const marcasDelProveedor = marcasDeHabituales(habitualesLeidos);
  const parecido = paso === "nuevo-nombre" ? habitualParecido(nuevo.nombre, habitualesLeidos, nuevo.descartadas) : null;

  function seguirNombre() {
    if (faltaNombreNuevo(nuevo.nombre) || parecido) return;
    // Si el proveedor trae una sola marca, se pone sola y no se pregunta (la maqueta aprobada).
    if (marcasDelProveedor.length === 1) return armarNuevo(marcasDelProveedor[0]);
    setNuevo((n) => ({ ...n, qMarca: "", otraMarca: marcasDelProveedor.length === 0 }));
    setPaso("nuevo-marca");
  }

  // Una prenda nueva ya armada vuelve a la grilla con su hoja abierta: se anota igual que una de siempre.
  function armarNuevo(marca: { id: string; nombre: string }) {
    if (!nuevo.categoria) return;
    const h = habitualNuevo(`nuevo:${crypto.randomUUID()}`, { nombre: nuevo.nombre, categoria: nuevo.categoria, marca });
    setEnCurso({ habitual: h, cantidad: "", costo: "", venta: "", destinoId: tiendaAnterior(lineas), edita: null });
    setPaso("habituales");
  }

  function elegirHabitual(h: Habitual) {
    // Si ya va en la compra, la hoja se abre con lo anotado para corregirla.
    const ya = lineas.findIndex((l) => l.clave === h.clave);
    if (ya >= 0) return corregir(ya);
    setEnCurso({
      habitual: h,
      // La cantidad llega vacía: con la de la vez pasada escrita, un toque rápido compraba 10 en vez de 3 (/formidable 2026-10-23,
      // OK de Felipe). La de la vez pasada se ofrece al lado, de un toque. El costo y la venta SÍ llegan con lo de la vez pasada y lo del
      // catálogo (la maqueta: «Toca una prenda: viene con lo de la vez pasada»), con su atajo marcado para volver a ellos.
      cantidad: "",
      costo: h.costo != null ? h.costo.toFixed(2) : "",
      venta: h.venta != null ? h.venta.toFixed(2) : "",
      destinoId: tiendaAnterior(lineas),
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
    setEnCurso({
      habitual: h,
      cantidad: String(l.cantidad),
      costo: l.costo.toFixed(2),
      venta: l.venta != null ? l.venta.toFixed(2) : "",
      destinoId: l.destinoId,
      edita: i,
    });
  }

  // La hoja que ya se agregó o se quitó: un doble clic (dos clics en el mismo instante, antes de que la hoja se cierre) la metía dos veces
  // en la compra, o quitaba dos prendas (/chaos 2026-10-23). Cada hoja abierta es un objeto propio: la segunda vez no hace nada.
  const hojaHecha = useRef<EnCurso | null>(null);

  // «Agregar» de la hoja: la prenda entra a la compra (o se corrige) y se vuelve a donde se estaba, la grilla o el resumen.
  function agregarPrenda() {
    if (!enCurso || hojaHecha.current === enCurso) return;
    const linea: LineaCompra | null = lineaDeBorrador(enCurso.habitual, enCurso);
    if (!linea) return;
    hojaHecha.current = enCurso;
    setLineas((ls) => (enCurso.edita != null ? ls.map((x, i) => (i === enCurso.edita ? linea : x)) : [...ls, linea]));
    setEnCurso(null);
  }

  function quitarPrenda() {
    if (enCurso?.edita == null || hojaHecha.current === enCurso) return;
    hojaHecha.current = enCurso;
    const i = enCurso.edita;
    setLineas((ls) => ls.filter((_, j) => j !== i));
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
    const { error } = await registrarCompraRapida(
      { p_id: id, p_proveedor_id: proveedor.id, p_tipo: tipo!, p_monto: montoLeido ?? 0, p_foto_ruta: ruta, p_lineas: lineasParaBase(lineas) },
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
    setGuardada({ monto: montoLeido ?? 0, prendas: prendasDeLineas(lineas), tiendas: tiendasDeLineas(lineas, nombresTienda), tieneAntes: datos.tiene });
    setPaso("listo");
    router.refresh();
  }

  function otraCompra() {
    setId(crypto.randomUUID());
    setProveedor(null);
    setLineas([]);
    setTipo(null);
    setArchivo(null);
    setSubida(null);
    setMonto("");
    setGuardada(null);
    setRechazo(null);
    setPaso("proveedor");
  }

  // La vuelta de los pasos que dependen de por dónde se llegó: una prenda nueva vuelve a su marca (o a su nombre, si la marca se puso
  // sola), y «dinos qué es» de un proveedor sin prendas vuelve al proveedor.
  const atras: PasoCompra | undefined =
    paso === "nuevo-categoria" && habitualesLeidos.length === 0
        ? "proveedor"
        : paso === "nuevo-categoria"
          ? "habituales"
          : ANTERIOR[paso];
  // Arriba, como la maqueta: la flecha, a quién le compras y en qué paso vas, y la barra de 3 tramos (proveedor · prendas · papel): los
  // hechos en tinta y el de ahora en rojo. Cada tramo es una barra de avance del sistema, llena o vacía.
  const fase = faseDePaso(paso);
  const cabecera = paso !== "listo" && (
    <div className="flex flex-col gap-3" data-guia="compra.avance">
      <div className="flex items-center gap-3">
        {atras ? <Volver onClick={() => setPaso(atras)} a="el paso anterior" /> : <Volver href="/compras/mi-plata" a="Mi plata para compras" />}
        {/* «Compré ropa» ya es el título de la pantalla: aquí solo va a quién, una vez elegido. */}
        <span className="min-w-0">
          {proveedor && <span className="block truncate text-sm font-medium text-tinta">{nombreCorto}</span>}
          <span className="block truncate text-xs text-taupe">{textoAvance(paso)}</span>
        </span>
      </div>
      <div className="grid grid-cols-3 gap-1" role="img" aria-label={textoAvance(paso)}>
        {[1, 2, 3].map((i) => (
          <BarraAvance key={i} pct={i <= fase ? 100 : 0} tono={i === fase ? "rojo" : "tinta"} alto="fina" decorativa />
        ))}
      </div>
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
          <h2 className="compra-pregunta">¿Qué le compras hoy?</h2>
          <p className="-mt-2 text-sm text-taupe">Toca una prenda: anotas cuántas, el precio y a qué tienda va.</p>
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
              alNuevo={algoNuevo}
            />
          )}
          {/* La barra negra de la maqueta: lo que lleva la compra, y «Seguir». Pegada al pie de la columna, no a la ventana: fija, en
              escritorio el menú lateral la tapaba. */}
          <div className="sticky bottom-0 z-10 bg-crema/95 py-3 backdrop-blur">
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

      {paso === "nuevo-categoria" && (
        <PasoCategoriaNueva
          categorias={datos.categorias}
          suyas={new Set(habitualesLeidos.map((h) => h.categoriaId))}
          primera={habitualesLeidos.length === 0}
          q={nuevo.q}
          setQ={(v) => setNuevo((n) => ({ ...n, q: v }))}
          alElegir={(c) => {
            setNuevo((n) => ({ ...n, categoria: c, descartadas: new Set() }));
            setPaso("nuevo-nombre");
          }}
        />
      )}

      {paso === "nuevo-nombre" && nuevo.categoria && (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            seguirNombre();
          }}
        >
          <h2 className="compra-pregunta">¿Cómo se llama?</h2>
          <p className="-mt-3 text-sm text-taupe">{nuevo.categoria.nombre}. Un nombre corto, como lo dicen en la tienda.</p>
          <CampoTexto
            caja
            etiqueta="Nombre de la prenda"
            autoFocus
            maxLength={NOMBRE_NUEVO_MAX}
            value={nuevo.nombre}
            placeholder={sugerirNombre(nuevo.categoria).origen === "categoria" ? `Ej. ${sugerirNombre(nuevo.categoria).texto}` : sugerirNombre(nuevo.categoria).texto}
            data-guia="compra.nombre-nuevo"
            onChange={(e) => setNuevo((n) => ({ ...n, nombre: e.target.value }))}
          />
          {parecido && (
            <PreguntaParecido
              titulo={`¿Es «${parecido.nombre}»?`}
              bajada={parecido.veces > 0 ? "Ya se la compraste: para no anotarla dos veces, úsala." : "Ya está en el catálogo con este proveedor: si es esa, úsala."}
              opciones={[{ id: parecido.clave, nombre: parecido.nombre, detalle: `${parecido.categoria}${parecido.marca ? ` · ${parecido.marca}` : ""}` }]}
              si={() => ({ texto: "Usar esa", onClick: () => elegirHabitual(parecido) })}
              no={{ texto: "No, es otra", onClick: () => setNuevo((n) => ({ ...n, descartadas: new Set([...n.descartadas, parecido.clave]) })) }}
            />
          )}
          <Boton type="submit" peso="primario" disabled={faltaNombreNuevo(nuevo.nombre) !== null || parecido !== null}>
            <span className="inline-flex items-center gap-2">
              Seguir
              <ArrowRight className="h-4 w-4" aria-hidden />
            </span>
          </Boton>
          {(faltaNombreNuevo(nuevo.nombre) || parecido) && (
            <p className="-mt-2 text-center text-xs text-taupe">{faltaNombreNuevo(nuevo.nombre) ?? "Dinos si es la misma prenda"}</p>
          )}
        </form>
      )}

      {paso === "nuevo-marca" && (
        <section className="flex flex-col gap-3">
          <h2 className="compra-pregunta">¿De qué marca?</h2>
          <p className="-mt-2 text-sm text-taupe">{nuevo.nombre.trim()}. Como dice la etiqueta de la prenda.</p>
          {!nuevo.otraMarca ? (
            <ul className="grid grid-cols-2 gap-2" data-guia="compra.marcas">
              {marcasDelProveedor.map((m) => (
                <li key={m.id}>
                  <button type="button" onClick={() => armarNuevo(m)} className="card-cayla mov-boton flex h-full w-full items-center gap-2 p-3 text-left">
                    <Tag className="h-4 w-4 shrink-0 text-taupe" aria-hidden />
                    <span className="min-w-0 font-medium text-tinta">{m.nombre}</span>
                  </button>
                </li>
              ))}
              <li>
                <button
                  type="button"
                  onClick={() => setNuevo((n) => ({ ...n, otraMarca: true }))}
                  className="card-cayla mov-boton flex h-full w-full items-center gap-2 p-3 text-left"
                >
                  <Plus className="h-4 w-4 shrink-0 text-taupe" aria-hidden />
                  <span className="min-w-0">
                    <span className="block font-medium text-tinta">Otra marca</span>
                    <span className="block text-xs text-taupe">La buscas</span>
                  </span>
                </button>
              </li>
            </ul>
          ) : (
            <>
              <Buscador
                valor={nuevo.qMarca}
                onCambio={(v) => setNuevo((n) => ({ ...n, qMarca: v }))}
                etiqueta="Busca la marca"
                placeholder="Busca la marca" // sugerir-fijo: se busca una marca del catálogo por su nombre; no depende de nada elegido antes
                guia="compra.buscar-marca"
              />
              {filtrarMarcas(datos.marcas, nuevo.qMarca).length === 0 ? (
                <Vacio icono={<SearchX aria-hidden />} tamano="chico" accion={{ texto: "Borrar la búsqueda", onClick: () => setNuevo((n) => ({ ...n, qMarca: "" })) }}>
                  No hay una marca «{nuevo.qMarca.trim()}». Si de verdad falta, Compras la crea en Catálogo ▸ Marcas.
                </Vacio>
              ) : (
                <ul className="card-cayla divide-y divide-sand">
                  {filtrarMarcas(datos.marcas, nuevo.qMarca).map((m) => (
                    <li key={m.id}>
                      <button type="button" onClick={() => armarNuevo(m)} className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-tinta hover:bg-sand/30">
                        <Tag className="h-4 w-4 shrink-0 text-taupe" aria-hidden />
                        {m.nombre}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
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
            <ul className="divide-y divide-sand" data-guia="compra.lineas">
              {lineas.map((l, i) => {
                const c = deCategoria.get(l.categoriaId);
                return (
                  <li key={`${l.clave}-${i}`}>
                    <button type="button" onClick={() => corregir(i)} className="grid w-full grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-3 py-3 text-left">
                      <MiniaturaPrenda fotoUrl={null} tamano="md" prefijo={c?.prefijo} familia={c?.familia} categoria={l.categoria} />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-tinta">
                          {l.cantidad} · {l.nombre}
                        </span>
                        <span className="block truncate text-xs tabular-nums text-taupe">
                          {l.cantidad} × {soles(l.costo)} · va a {nombresTienda.get(l.destinoId) ?? "una tienda"}
                        </span>
                      </span>
                      <span className="whitespace-nowrap text-sm tabular-nums text-tinta">{soles(l.cantidad * l.costo)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <button type="button" className="btn-cayla btn-enlace self-start" onClick={() => setPaso("habituales")}>
            <Plus className="h-4 w-4" aria-hidden />
            Otra prenda de {nombreCorto}
          </button>
          {lineas.length > 0 && (
            <div className="flex items-baseline justify-between border-t border-sand pt-3">
              <span className="text-sm text-tinta/65">Pagaste · {prendasDeLineas(lineas)} prendas</span>
              <span className="font-serif text-3xl tabular-nums text-tinta">{soles(total)}</span>
            </div>
          )}
          {ganancia && (
            <p
              /* unificar-fijo: el dato de lo que se gana si se vende todo (la maqueta), no un aviso */ className="flex items-center justify-between gap-3 rounded-[14px] bg-verde/10 px-3.5 py-3 text-sm"
            >
              <span className="text-tinta">
                Si se vende todo, ganas
                <span className="block text-xs text-taupe">Vendes {soles(ganancia.vendes)}</span>
              </span>
              <b className="text-[17px] tabular-nums text-verde">{soles(ganancia.ganas)}</b>
            </p>
          )}
          <div className="sticky bottom-0 z-10 bg-crema/95 py-3 backdrop-blur">
            <Boton peso="primario" className="w-full" onClick={alPapel} disabled={lineas.length === 0} data-guia="compra.al-papel">
              <span className="inline-flex items-center gap-2">
                Sigue: el papel
                <ArrowRight className="h-4 w-4" aria-hidden />
              </span>
            </Boton>
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
          <h2 className="compra-pregunta">¿Qué papel te dieron?</h2>
          <CampoGuiado id="tipo" guia={guia} titulo="El papel">
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
          {tipo !== "sin_comprobante" && (
            <CampoGuiado id="foto" guia={guia} titulo="La foto del papel" ayuda="· opcional">
              <TarjetaFoto
                guia="compra.foto"
                archivo={archivo}
                deshabilitada={guardando}
                ayuda="Que se lea el total y el número. Sin foto, igual se guarda"
                onArchivo={(f) => {
                  setRechazo(null);
                  setArchivo(f);
                }}
              />
            </CampoGuiado>
          )}
          <CampoGuiado id="monto" guia={guia} titulo="¿Cuánto dice el papel?">
            <CampoMonto
              etiqueta="¿Cuánto dice el papel?"
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
          onAgregar={agregarPrenda}
          onQuitar={quitarPrenda}
          onClose={() => setEnCurso(null)}
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
            {guardada.prendas} prendas a {nombreCorto} por {soles(guardada.monto)}.
            {guardada.tieneAntes != null && (
              <>
                <br />
                {textoPlataDespues(guardada.tieneAntes - guardada.monto)}
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
              Ver mi plata
            </Link>
          </div>
        </section>
      )}
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
  const [verTodos, setVerTodos] = useState(false);
  const categorias = categoriasConProveedor(proveedores, datos.categorias);
  const nombreCat = new Map(datos.categorias.map((c) => [c.id, c.nombre]));
  const hoy = hoyLima();
  const buscando = q.trim() !== "" || cat !== null;
  const lista = filtrarProveedores(proveedores, q, cat);
  // Sin buscar: primero a quién le compraste hace poco (la maqueta); los demás, a un toque. Sin ninguno reciente, todos.
  const recientes = proveedoresRecientes(proveedores);
  const resto = proveedores.filter((p) => !recientes.includes(p));
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
      <h2 className="compra-pregunta">¿A quién le compras?</h2>
      <Buscador
        valor={q}
        onCambio={setQ}
        tamano="mostrador"
        etiqueta="Busca el proveedor"
        placeholder="Nombre del proveedor" // sugerir-fijo: se busca un proveedor por su nombre; no depende de nada elegido antes
        guia="compra.buscador"
      />
      {buscando ? (
        lista.length === 0 ? (
          <Vacio icono={<Store aria-hidden />} titulo="No hay un proveedor así" tamano="chico">
            Prueba con otra categoría u otro nombre, o regístralo en «Es un proveedor nuevo», aquí abajo.
          </Vacio>
        ) : (
          <ul className="flex flex-col gap-2" data-guia="compra.proveedores">
            {lista.map(fila)}
          </ul>
        )
      ) : recientes.length > 0 ? (
        <div className="flex flex-col gap-2">
          <span className="label-cayla text-[11px] text-taupe">Les compraste hace poco</span>
          <ul className="flex flex-col gap-2" data-guia="compra.proveedores">
            {recientes.map(fila)}
          </ul>
          {resto.length > 0 && (
            <>
              <FilasDeMas abierto={verTodos} id="compra-otros-proveedores">
                <ul className="flex flex-col gap-2 pt-2">{resto.map(fila)}</ul>
              </FilasDeMas>
              <BotonVerMas
                forma="enlace"
                abierto={verTodos}
                onCambiar={setVerTodos}
                controla="compra-otros-proveedores"
                texto={`Ver los otros ${resto.length}`}
                className="self-start"
              />
            </>
          )}
        </div>
      ) : (
        <ul className="flex flex-col gap-2" data-guia="compra.proveedores">
          {proveedores.map(fila)}
        </ul>
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
      <div className="sticky bottom-0 z-10 bg-crema/95 py-3 backdrop-blur">
        <Boton peso="fantasma" className="w-full" onClick={alNuevo} data-guia="compra.proveedor-nuevo">
          <span className="inline-flex items-center gap-2">
            <Plus className="h-4 w-4" aria-hidden />
            Es un proveedor nuevo
          </span>
        </Boton>
      </div>
    </section>
  );
}

function PasoCategoriaNueva({
  categorias,
  suyas,
  primera,
  q,
  setQ,
  alElegir,
}: {
  categorias: CategoriaParaComprar[];
  suyas: ReadonlySet<string>;
  /** El proveedor no tiene ninguna prenda todavía: es la primera compra. */
  primera: boolean;
  q: string;
  setQ: (v: string) => void;
  alElegir: (c: CategoriaParaComprar) => void;
}) {
  const grupos = filtrarCategoriasNuevo(categorias, q, suyas);
  const tarjeta = (c: CategoriaParaComprar, ya: boolean) => (
    <li key={c.id}>
      <button type="button" onClick={() => alElegir(c)} className="card-cayla mov-boton flex h-full w-full items-center gap-2 p-3 text-left">
        <Shapes className="h-4 w-4 shrink-0 text-taupe" aria-hidden />
        <span className="min-w-0">
          <span className="block font-medium text-tinta">{c.nombre}</span>
          {ya && <span className="block text-xs text-taupe">Ya le compras</span>}
        </span>
      </button>
    </li>
  );
  return (
    <section className="flex flex-col gap-3">
      <h2 className="compra-pregunta">{primera ? "Es tu primera compra a este proveedor: ¿qué es?" : "¿Qué es?"}</h2>
      <p className="-mt-2 text-sm text-taupe">Busca o elige la categoría.</p>
      <Buscador
        valor={q}
        onCambio={setQ}
        etiqueta="Busca la categoría"
        placeholder="Busca la categoría" // sugerir-fijo: se busca una categoría del catálogo por su nombre; no depende de nada elegido antes
        guia="compra.buscar-categoria"
      />
      {grupos.suyas.length === 0 && grupos.otras.length === 0 ? (
        <Vacio icono={<SearchX aria-hidden />} tamano="chico" accion={{ texto: "Borrar la búsqueda", onClick: () => setQ("") }}>
          No hay una categoría «{q.trim()}». Prueba con otra palabra, como «blusa» o «jean».
        </Vacio>
      ) : (
        <div className="flex flex-col gap-3" data-guia="compra.categorias-nuevo">
          {grupos.suyas.length > 0 && (
            <>
              <TituloGrupo>Lo que ya le compras</TituloGrupo>
              <ul className="grid grid-cols-2 gap-2">{grupos.suyas.map((c) => tarjeta(c, true))}</ul>
            </>
          )}
          {grupos.otras.length > 0 && (
            <>
              {grupos.suyas.length > 0 && <TituloGrupo>Otras</TituloGrupo>}
              <ul className="grid grid-cols-2 gap-2">{grupos.otras.map((c) => tarjeta(c, false))}</ul>
            </>
          )}
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
  alNuevo,
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
  alNuevo: () => void;
}) {
  const cats = categoriasDeHabituales(habituales);
  const deCat = cat ? habituales.filter((h) => h.categoriaId === cat) : habituales;
  const ver = verTodos || cat ? deCat : deCat.slice(0, HABITUALES_A_LA_VISTA);
  // La miniatura sin foto es el ícono de su categoría sobre su tono (ADR-0333): el prefijo y la familia salen de la categoría.
  const deCategoria = new Map(categorias.map((c) => [c.id, c]));
  const claves = new Set(habituales.map((h) => h.clave));
  // Las prendas nuevas que ya van en la compra también son tarjetas: así se corrigen igual que las de siempre.
  const nuevas = lineas.map((l, i) => ({ l, i })).filter(({ l }) => !claves.has(l.clave));
  const tarjeta = (clave: string, nombre: string, categoriaId: string, categoria: string, linea: LineaCompra | undefined, abajo: string | null, onClick: () => void) => {
    const c = deCategoria.get(categoriaId);
    return (
      <li key={clave}>
        <button
          type="button"
          onClick={onClick}
          className={`card-cayla mov-boton relative flex h-full w-full flex-col gap-2 rounded-[18px] p-2.5 text-left ${linea ? "border-tinta ring-1 ring-inset ring-tinta" : ""}`}
        >
          <MosaicoPrenda forma="grilla" prefijo={c?.prefijo} familia={c?.familia as never} categoria={categoria} conNombre={false} className="w-full aspect-[4/3]!" />
          {linea && <Globito n={linea.cantidad} esquina etiqueta="en la compra" className="absolute right-4 top-4" />}
          <span className="text-[13.5px] font-medium leading-tight text-tinta">{nombre}</span>
          {(linea || abajo) && (
            <span className="text-[11.5px] leading-snug text-taupe">
              {linea ? `${linea.cantidad} × ${soles(linea.costo)} · ${nombresTienda.get(linea.destinoId) ?? "una tienda"}` : abajo}
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
        {nuevas.map(({ l, i }) => tarjeta(l.clave, l.nombre, l.categoriaId, l.categoria, l, null, () => alCorregir(i)))}
        {ver.map((h) =>
          tarjeta(h.clave, h.nombre, h.categoriaId, h.categoria, lineas.find((l) => l.clave === h.clave), textoHabitual(h) ?? `${h.categoria}${h.marca ? ` · ${h.marca}` : ""}`, () => alElegir(h)),
        )}
        <li>
          <button
            type="button"
            onClick={alNuevo}
            data-guia="compra.algo-nuevo"
            className="mov-boton flex h-full min-h-[170px] w-full flex-col items-center justify-center gap-1 rounded-[18px] border border-dashed border-taupe/60 p-3 text-center text-tinta/75"
          >
            <Plus className="h-5 w-5" aria-hidden />
            <span className="text-[13.5px] font-medium text-tinta">Algo nuevo</span>
            <span className="text-[11.5px] text-taupe">de este proveedor</span>
          </button>
        </li>
      </ul>
      {!verTodos && !cat && habituales.length > HABITUALES_A_LA_VISTA && (
        <BotonVerMas forma="enlace" abierto={false} onCambiar={() => setVerTodos(true)} texto={`Ver todos los suyos (${habituales.length})`} className="self-center" />
      )}
    </>
  );
}
