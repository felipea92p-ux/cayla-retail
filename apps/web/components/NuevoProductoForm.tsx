"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { CampoMonto, CampoTexto } from "@/components/ui/campos";
import { MuestraPatron } from "@/components/MuestraPatron";
import { ArbolCategoria } from "@/components/alta-producto/ArbolCategoria";
import { AvisoParecidos } from "@/components/alta-producto/AvisoParecidos";
import { ElegirMarcaProveedor } from "@/components/alta-producto/ElegirMarcaProveedor";
import { ConfigurarCategoria } from "@/components/alta-producto/ConfigurarCategoria";
import { ProductoCreado, type ResumenCreado } from "@/components/alta-producto/ProductoCreado";
import { ProponerValor } from "@/components/alta-producto/ProponerValor";
import { AvisoInline, ChipOpcion, FilaAlta, PasoAlta } from "@/components/alta-producto/piezas";
import { ElegirColores } from "@/components/alta-producto/ElegirColores";
import { FotosAlta, type FotoPendiente } from "@/components/alta-producto/FotosAlta";
import { MatrizVariantes } from "@/components/alta-producto/MatrizVariantes";
import { MatrizCantidades } from "@/components/alta-producto/MatrizCantidades";
import { FichaPrevia } from "@/components/alta-producto/FichaPrevia";
import { FAMILIAS_COLOR } from "@/lib/colores-familias";
import { useParecidos } from "@/lib/use-parecidos";
import { useResponsable } from "@/lib/useResponsable";
import { firmar } from "@/lib/responsable-reglas";
import { compararTallas } from "@/lib/tallas";
import { subirFotoProducto } from "@/lib/producto-fotos";
import { debeEncolarse } from "@/lib/error-escritura";
import { nombreEnCola, nuevaOperacion } from "@/lib/cola-offline";
import { useColaProductos } from "@/lib/useColaProductos";
import { useEnLinea } from "@/lib/useEnLinea";
import { guardarFotos } from "@/lib/fotos-pendientes";
import { ColaOfflineAviso } from "@/components/ColaOfflineAviso";
import {
  PASOS_ALTA,
  codigoBasePrevisto,
  codigoVariantePrevisto,
  construirCeldas,
  estadoSubidaSinConexion,
  faltaDelPaso,
  leerCantidad,
  leerErrorAlta,
  margenPorcentaje,
  nivelMargen,
  ordenarColores,
  ordenarFotosAlta,
  pasoHecho,
  problemasAlta,
  resumenStock,
  textoDestinoStock,
  tituloReferencia,
  type DestinoStock,
  type EstadoAlta,
  type PasoAlta as NumeroPaso,
} from "@/lib/alta-producto";
import type { ContextoAlta } from "@/lib/alta-producto-datos";
import type { EjesPorCategoria, ValorVocabulario } from "@/lib/catalogo-v2";

// "Nuevo producto" en 5 PASOS (spike 2026-09-24, docs/maquetas/producto-nuevo-spike-2026-09; antes 7 bloques, ADR-0109):
//   1 Qué es (familia → categoría) · 2 Quién es y cómo se llama (nombre, marca, proveedor) · 3 Cómo se hace (tallas,
//   tejido, patrón, colores, fotos) · 4 Precio y variantes (precio, costo, tabla talla × color, etiquetas) · 5 Cuántas
//   tienes hoy (ADR-0212: la carga inicial de lo que ya está en tienda, en la misma transacción que el producto).
// Un solo paso abierto a la vez: el terminado se pliega en una línea con «Cambiar» y el que viene es una línea
// punteada. A la derecha, la prenda tal como va a quedar y UNA frase: el siguiente paso (no la lista entera de lo
// que falta). En celular esa ficha baja a una barra pegada abajo con «Crear».
//
// Diseñado para que equivocarse sea difícil, no para avisar después:
//   * la categoría se elige con tarjetas (arrastra prefijo, tallas, tejidos) y al elegirla se pasa sola al paso 2;
//   * el nombre se comprueba contra el catálogo MIENTRAS se escribe;
//   * lo que la familia exige (Indumentaria: tejido y patrón) no se puede saltar;
//   * lo que viene marcado de antemano es la curva habitual de la categoría;
//   * «Seguir» no se apaga en silencio: al lado dice qué falta.
//
// El alta es UNA transacción (`crear_producto_con_stock_inicial`, que envuelve a `crear_producto_con_variantes`): producto,
// variantes, etiquetas y el stock de hoy entran juntos o no entra nada. Las FOTOS se eligen en el paso 3 pero se guardan en el navegador y se suben DESPUÉS de que la base creó
// el producto (ver `FotosAlta`): cancelar no deja archivos huérfanos, y si una foto no sube, el producto ya existe y
// la pantalla de éxito dice cuál falta. Las filas de `producto_fotos` se escriben directo: su política
// `producto_fotos_write_lider` (fn_puede_editar_catalogo) es la misma que exige esta pantalla.
//
// Al guardar NO se vuelve a la lista: aparece una pantalla de éxito con tres salidas — fotos, crear otro parecido,
// ir a productos. «Otro parecido» conserva categoría, marca, proveedor, tallas, tejido, patrón, precio, costo y
// etiquetas y limpia nombre, descripción, colores y fotos: una colección son 10 prendas casi iguales.
//
// El token de idempotencia nace con el formulario (useRef): si la red falla a
// mitad y se reintenta, la base devuelve el mismo producto y no crea un segundo.

const TITULOS: Record<NumeroPaso, string> = {
  1: "Qué producto es",
  2: "Quién es y cómo se llama",
  3: "Cómo se hace",
  4: "Precio y variantes",
  5: "Cuántas tienes hoy",
};
const CORTOS: Record<NumeroPaso, string> = { 1: "Qué es", 2: "Nombre y marca", 3: "Cómo se hace", 4: "Precio", 5: "Stock" };

export function NuevoProductoForm({ contexto, destino }: { contexto: ContextoAlta; destino: DestinoStock }) {
  const router = useRouter();
  const token = useRef<string>(crypto.randomUUID());

  // Copias locales: configurar una categoría o proponer un valor las modifica sin recargar la página.
  const [ejes, setEjes] = useState<EjesPorCategoria>(contexto.ejes);
  const [universo, setUniverso] = useState(contexto.universo);
  // Marcas, proveedores y vínculos: el selector se desmonta al plegar el paso 2 (y al ver la pantalla de éxito);
  // lo creado aquí adentro (una marca nueva, un proveedor nuevo) tiene que sobrevivir a eso.
  const [listasMarca, setListasMarca] = useState({ marcas: contexto.marcas, proveedores: contexto.proveedores, vinculos: contexto.vinculos });

  const [paso, setPaso] = useState<NumeroPaso>(1);
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
  const [coloresElegidos, setColoresElegidos] = useState<string[]>([]);
  const [fotos, setFotos] = useState<FotoPendiente[]>([]);
  const [precioBase, setPrecioBase] = useState("");
  const [costoBase, setCostoBase] = useState("");
  const [costoTocado, setCostoTocado] = useState(false);
  const [excluidas, setExcluidas] = useState<Set<string>>(new Set());
  const [overridePrecio, setOverridePrecio] = useState<Record<string, string>>({});
  const [editandoPrecios, setEditandoPrecios] = useState(false);
  const [etiquetasElegidas, setEtiquetasElegidas] = useState<string[]>([]);
  const [verEtiquetas, setVerEtiquetas] = useState(false);
  // Paso 5 (ADR-0212): lo que ya hay en tienda. `cantidades` por clave de celda («talla|color»), como lo tipeó la persona.
  const [cantidades, setCantidades] = useState<Record<string, string>>({});
  const [sinStock, setSinStock] = useState(false);
  // Colgadas en el piso o guardadas en el almacén. «Piso» solo si la tienda los separa y la cuenta puede bajar prendas
  // (la base hace la bajada con `bajar_al_piso`, que pide el módulo «Bajada al piso»): si no, van al almacén.
  const puedePiso = destino.separaPiso && destino.puedeBajar;
  const [alPiso, setAlPiso] = useState(puedePiso);
  const [cargando, setCargando] = useState(false);
  // Crear una prenda es Catálogo, operación de tienda (ADR-0161): firma quien está de turno. Los guardados que se hacen
  // A MITAD del formulario (marca nueva, talla nueva, configurar la categoría) llevan su propio combo: son otra operación.
  // La tienda es la misma donde entra el stock de hoy: la base exige que el responsable esté presente AHÍ.
  const responsable = useResponsable({ ubicacionId: destino.ubicacionId, etiqueta: destino.etiqueta });
  const colaOffline = useColaProductos();
  const enLinea = useEnLinea();
  const [creado, setCreado] = useState<ResumenCreado | null>(null);
  /** Nombre del producto del que se copió al elegir «crear otro parecido»: se muestra hasta el próximo guardado. */
  const [copiadoDe, setCopiadoDe] = useState<string | null>(null);

  const categoria = contexto.categorias.find((c) => c.id === categoriaId) ?? null;
  const familia = categoria ? (contexto.familias.find((f) => f.codigo === categoria.familia) ?? null) : null;
  const exige = Boolean(familia?.exigeTejidoPatron);

  const tallasCategoria = useMemo(
    () => [...(ejes.tallas[categoriaId] ?? [])].sort((a, b) => compararTallas(a.texto, b.texto)),
    [ejes.tallas, categoriaId]
  );
  const tejidosCategoria = ejes.tejidos[categoriaId] ?? [];
  const patronesCategoria = ejes.patrones[categoriaId] ?? [];
  const habituales = ejes.habituales[categoriaId] ?? [];
  const tallaTexto = (id: string) => tallasCategoria.find((t) => t.id === id)?.texto ?? "";
  // Las elegidas en el orden de la curva (S, M, L), no en el orden en que se tocaron.
  const tallasOrdenadas = tallasCategoria.filter((t) => tallasElegidas.includes(t.id));

  const nombreFinal = tituloReferencia(referencia);

  // ---------- ¿ya existe algo así? (aviso en vivo, con espera de 350 ms al tipear) ----------
  const parecidos = useParecidos({ nombre: nombreFinal, activo: Boolean(categoriaId) });
  const comprobandoNombre = Boolean(categoriaId) && parecidos.comprobando;
  const confirmo = parecidos.confirmo;

  function irAPaso(n: NumeroPaso) {
    setPaso(n);
    // El paso que se abre queda a la vista: el anterior se acaba de plegar y la página se acortó.
    requestAnimationFrame(() => document.getElementById(`paso-${n}`)?.closest("section")?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
  }

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

  function alternarTalla(id: string) {
    setTallasElegidas((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  const curvaCambiada =
    habituales.length > 0 &&
    (tallasElegidas.length !== habituales.length || tallasElegidas.some((t) => !habituales.includes(t)));

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

  // ---------- al configurar una categoría o proponer un valor sin salir del alta ----------
  function agregarValor(tipo: "tallas" | "tejidos" | "patrones", valor: ValorVocabulario) {
    setEjes((prev) => ({ ...prev, [tipo]: { ...prev[tipo], [categoriaId]: [...(prev[tipo][categoriaId] ?? []), valor] } }));
    setUniverso((prev) => (prev[tipo].some((v) => v.id === valor.id) ? prev : { ...prev, [tipo]: [...prev[tipo], valor] }));
    if (tipo === "tallas") setTallasElegidas((prev) => [...prev, valor.id]); // recién creada para este producto: queda elegida
    if (tipo === "tejidos") setTejidoId(valor.id);
    if (tipo === "patrones") setPatronId(valor.id);
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
    marcaId,
    proveedorId,
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

  function estadoPaso(n: NumeroPaso): "abierto" | "hecho" | "pendiente" {
    if (n === paso) return "abierto";
    // Hecho = él y los anteriores sin nada pendiente. Un paso anterior al abierto con lo suyo resuelto también se ve
    // hecho aunque falte algo más atrás (se volvió a abrir un paso previo con «Cambiar»).
    return pasoHecho(problemas, n) || (n < paso && !faltaDelPaso(problemas, n)) ? "hecho" : "pendiente";
  }

  const precioNum = Number(precioBase);
  const costoNum = Number(costoBase);
  const margen = costoBase.trim() === "" ? null : margenPorcentaje(precioNum, costoNum);
  const nivel = nivelMargen(margen);
  const sugerido = categoriaId ? contexto.costoSugerido[categoriaId] : undefined;

  const { frecuentes, grupos } = useMemo(
    () => ordenarColores(contexto.colores, contexto.usoColores[categoriaId] ?? {}, FAMILIAS_COLOR, 6),
    [contexto.colores, contexto.usoColores, categoriaId]
  );
  const colorPorCodigo = (cod: string) => contexto.colores.find((c) => c.codigo === cod);
  const coloresDatos = coloresElegidos.map((cod) => colorPorCodigo(cod)).filter((c): c is NonNullable<typeof c> => Boolean(c));

  // ---------- código previsto ----------
  const base = codigoBasePrevisto(categoria?.prefijo ?? null, categoria?.prefijo ? (contexto.correlativos[categoria.prefijo] ?? 0) : null);
  const codigosVariantes = celdasIncluidas.map((c) => codigoVariantePrevisto(base, c.color, c.tallaId ? tallaTexto(c.tallaId) : null));

  // Las etiquetas de campaña que ya rigen sobre esta categoría se aplican solas: elegirlas a mano sería redundante y las
  // dejaría duplicadas en cada variante. Si la persona eligió una y DESPUÉS cambió a una categoría que la cubre, no se manda.
  const cubiertaPorCampana = (et: ContextoAlta["etiquetas"][number]) => Boolean(categoriaId) && et.categoriaIds.includes(categoriaId);
  const etiquetasAManda = etiquetasElegidas.filter((id) => {
    const et = contexto.etiquetas.find((x) => x.id === id);
    return et ? !cubiertaPorCampana(et) : false;
  });
  const campanasQueAplican = contexto.etiquetas.filter(cubiertaPorCampana);

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
      p_etiqueta_ids: etiquetasAManda.length > 0 ? etiquetasAManda : undefined,
      p_marca_id: marcaId,
      p_proveedor_id: proveedorId,
      // Paso 5 (ADR-0212): la tienda y el destino solo viajan si hay stock que cargar.
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
        fotosOrdenadas.map((f) => ({ archivo: f.archivo, colorCodigo: f.colorCodigo })),
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
        fotosEnEspera: fotosGuardadas ? fotosOrdenadas.length : 0,
        token: op.token,
      });
      return;
    }
    responsable.despues(error);

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
        const r = await subirFotoProducto(supabase, f.archivo);
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
    // El correlativo del código previsto y los colores «más usados» ya cambiaron. Sin red NO se relee: la relectura
    // fallaría y Next caería a una navegación completa, que sin internet deja la pestaña en blanco.
    if (creado.id) router.refresh();
    setPaso(2);
    setTimeout(() => document.getElementById("nombre-producto")?.focus(), 50);
  }

  const etiquetaNivel = { negativo: "Con este precio pierdes dinero", bajo: "Poco: un descuento se lo come", normal: "Sin descontar IGV" } as const;

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

  // ---------- la línea de cada paso plegado ----------
  const resumen: Record<NumeroPaso, string> = {
    1: categoria ? `${familia?.nombre ?? ""} › ${categoria.nombre}` : "",
    2: [nombreFinal, marcaNombre && `${marcaNombre}${proveedorNombre ? ` (${proveedorNombre})` : ""}`].filter(Boolean).join(" · "),
    3: [
      tallasOrdenadas.map((t) => t.texto).join(" "),
      tejidosCategoria.find((t) => t.id === tejidoId)?.texto,
      patronesCategoria.find((t) => t.id === patronId)?.texto,
      coloresElegidos.length ? `${coloresElegidos.length} color${coloresElegidos.length === 1 ? "" : "es"}` : "sin color",
      fotos.length ? `${fotos.length} foto${fotos.length === 1 ? "" : "s"}` : null,
    ]
      .filter(Boolean)
      .join(" · "),
    4: [precioNum > 0 ? `S/ ${precioNum.toFixed(2)}` : null, `${celdasIncluidas.length} variante${celdasIncluidas.length === 1 ? "" : "s"}`].filter(Boolean).join(" · "),
    5: stock.total > 0 ? `${stock.total} unidad${stock.total === 1 ? "" : "es"} · ${destinoTexto}` : sinStock ? "Sin stock todavía" : "",
  };

  const ejesActuales = (sin?: "tallas" | "tejidos" | "patrones") => ({
    tallaIds: sin === "tallas" ? [] : tallasCategoria.map((t) => t.id),
    tejidoIds: sin === "tejidos" ? [] : tejidosCategoria.map((t) => t.id),
    patronIds: sin === "patrones" ? [] : patronesCategoria.map((t) => t.id),
  });

  function cuerpo(n: NumeroPaso) {
    if (n === 1) {
      return (
        <div className="space-y-2">
          <ArbolCategoria familias={contexto.familias} categorias={contexto.categorias} categoriaId={categoriaId} onElegir={elegirCategoria} onCambiar={cambiarCategoria} />
          <p className="text-xs text-taupe">La categoría decide el código, las tallas y los tejidos. Al elegirla pasas solo al siguiente paso.</p>
        </div>
      );
    }
    if (n === 2) {
      return (
        <div>
          <FilaAlta etiqueta="Nombre" ayuda="Como lo dirías en tienda">
            <div className="space-y-2">
              <CampoTexto
                id="nombre-producto"
                etiqueta="Referencia"
                caja
                placeholder="Blusa Aurora"
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
              <AvisoParecidos parecidos={parecidos.items} confirmo={confirmo} onConfirmo={parecidos.confirmar} noSePudoComprobar={parecidos.fallo} />
            </div>
          </FilaAlta>
          <FilaAlta etiqueta="Descripción" ayuda="Opcional">
            <CampoTexto etiqueta="Descripción" caja placeholder="Tela, corte, detalle…" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
          </FilaAlta>
          <FilaAlta etiqueta="Marca y proveedor" ayuda="Quién la hace y quién la trae">
            <ElegirMarcaProveedor
              marcas={listasMarca.marcas}
              proveedores={listasMarca.proveedores}
              vinculos={listasMarca.vinculos}
              onListas={setListasMarca}
              usosCategoria={contexto.parejasPorCategoria[categoriaId] ?? []}
              categoriaNombre={categoria?.nombre}
              nombresIniciales={marcaId ? { marca: marcaNombre, proveedor: proveedorNombre } : undefined}
              marcaId={marcaId}
              proveedorId={proveedorId}
              onElegir={(m, p, nombres) => {
                setMarcaId(m);
                setProveedorId(p);
                setMarcaNombre(nombres.marca);
                setProveedorNombre(nombres.proveedor);
              }}
              onLimpiar={() => {
                setMarcaId("");
                setProveedorId("");
                setMarcaNombre("");
                setProveedorNombre("");
              }}
              puedeCrear
            />
          </FilaAlta>
        </div>
      );
    }
    if (n === 3) {
      return (
        <div>
          <FilaAlta etiqueta="Tallas" ayuda={habituales.length > 0 ? "Vienen las habituales" : undefined}>
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
              <div className="space-y-2">
                <div className="flex flex-wrap gap-1.5">
                  {tallasCategoria.map((t) => (
                    <ChipOpcion key={t.id} elegido={tallasElegidas.includes(t.id)} onClick={() => alternarTalla(t.id)} className="tabular-nums">
                      {t.texto}
                    </ChipOpcion>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  {curvaCambiada && (
                    <button type="button" onClick={() => setTallasElegidas(habituales)} className="btn-cayla btn-enlace text-xs">
                      Volver a la curva habitual
                    </button>
                  )}
                  <ProponerValor tipo="tallas" categoriaId={categoriaId} ejesActuales={ejesActuales()} universo={universo.tallas} onCreado={(v) => agregarValor("tallas", v)} />
                </div>
              </div>
            )}
          </FilaAlta>

          {(exige || tejidosCategoria.length > 0) && (
            <FilaAlta etiqueta="Tejido" ayuda={exige ? `${familia?.nombre} lo pide` : "Opcional"}>
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
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-1.5">
                    {tejidosCategoria.map((t) => (
                      <ChipOpcion key={t.id} elegido={tejidoId === t.id} onClick={() => setTejidoId((prev) => (prev === t.id ? "" : t.id))}>
                        {t.texto}
                      </ChipOpcion>
                    ))}
                  </div>
                  <ProponerValor tipo="tejidos" categoriaId={categoriaId} ejesActuales={ejesActuales()} universo={universo.tejidos} onCreado={(v) => agregarValor("tejidos", v)} />
                </div>
              )}
            </FilaAlta>
          )}

          {(exige || patronesCategoria.length > 0) && (
            <FilaAlta etiqueta="Patrón" ayuda={exige ? "Sin diseño = Liso" : "Opcional"}>
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
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-1.5">
                    {patronesCategoria.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setPatronId((prev) => (prev === t.id ? "" : t.id))}
                        aria-pressed={patronId === t.id}
                        className={`flex w-[96px] flex-col gap-1.5 rounded-md border p-1.5 text-left text-[12.5px] transition-colors ${
                          patronId === t.id ? "border-tinta bg-tinta/[0.07] text-tinta" : "border-tinta/15 text-tinta/75 hover:border-tinta/40"
                        }`}
                      >
                        <MuestraPatron nombre={t.texto} />
                        <span className="px-0.5">
                          {patronId === t.id && <span aria-hidden>✓ </span>}
                          {t.texto}
                        </span>
                      </button>
                    ))}
                  </div>
                  <ProponerValor tipo="patrones" categoriaId={categoriaId} ejesActuales={ejesActuales()} universo={universo.patrones} onCreado={(v) => agregarValor("patrones", v)} />
                </div>
              )}
            </FilaAlta>
          )}

          <FilaAlta
            etiqueta="Colores"
            ayuda={coloresElegidos.length ? `${coloresElegidos.length} elegido${coloresElegidos.length === 1 ? "" : "s"}` : "Sin colores = una variante sin color"}
          >
            <div className="space-y-2">
              <ElegirColores
                colores={contexto.colores}
                frecuentes={frecuentes}
                grupos={grupos}
                elegidos={coloresElegidos}
                onAlternar={alternarColor}
                categoriaNombre={categoria?.nombre}
              />
              <p className="text-xs text-taupe">
                ¿Falta un color?{" "}
                <Link href="/productos/atributos?tipo=colores" target="_blank" className="underline underline-offset-2 hover:text-tinta">
                  Créalo en Catálogo → Atributos
                </Link>{" "}
                (otra pestaña) y luego{" "}
                <button type="button" onClick={() => router.refresh()} className="underline underline-offset-2 hover:text-tinta">
                  actualiza los colores
                </button>
                .
              </p>
            </div>
          </FilaAlta>

          <FilaAlta etiqueta="Fotos" ayuda="Opcional · una o más por color">
            <FotosAlta colores={coloresDatos} fotos={fotos} onFotos={setFotos} disabled={cargando} />
          </FilaAlta>
        </div>
      );
    }
    if (n === 5) {
      return (
        <div className="space-y-4">
          <p className="text-sm text-tinta">
            ¿Cuántas tienes hoy en <strong>{destino.etiqueta}</strong>?{" "}
            <span className="text-taupe">Cuenta cada talla y color. Lo que no tengas, déjalo vacío.</span>
          </p>
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
          />

          {stock.total > 0 ? (
            destino.separaPiso && (
              <div className="space-y-2">
                <p className="text-[12.5px] font-semibold text-tinta">¿Dónde están?</p>
                <div className="flex flex-wrap gap-1.5">
                  <ChipOpcion elegido={puedePiso && alPiso} onClick={() => setAlPiso(true)} disabled={!puedePiso}>
                    Colgadas en el piso de venta
                  </ChipOpcion>
                  <ChipOpcion elegido={!puedePiso || !alPiso} onClick={() => setAlPiso(false)}>
                    Guardadas en el almacén
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
            Es la <strong>carga inicial</strong>: lo que ya está en la tienda entra al inventario sin comprobante ni proveedor, y queda en
            Movimientos como «Carga inicial». La mercadería que llegue después se registra al recibirla (Compras o «Recibir sin comprobante»).
          </p>
        </div>
      );
    }
    return (
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <CampoMonto etiqueta="Precio de venta" pie="Para todas las variantes" inputMode="decimal" placeholder="0.00" value={precioBase} onChange={(e) => setPrecioBase(e.target.value)} />
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
          <AvisoInline tono="rojo" alerta>
            Con este precio pierdes dinero en cada venta.
          </AvisoInline>
        )}

        <div>
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm">
              <b className="tabular-nums">{celdasIncluidas.length}</b>{" "}
              <span className="text-taupe">variante{celdasIncluidas.length === 1 ? "" : "s"} · toca una celda para quitarla</span>
            </p>
            {celdasIncluidas.length > 0 && (
              <button type="button" onClick={() => setEditandoPrecios((v) => !v)} className="btn-cayla btn-enlace text-[12.5px]">
                {editandoPrecios ? "Listo, volver" : "Poner un precio distinto a alguna"}
              </button>
            )}
          </div>
          <MatrizVariantes
            celdas={celdas}
            tallas={tallasOrdenadas.map((t) => ({ id: t.id, texto: t.texto }))}
            colores={coloresDatos}
            excluidas={excluidas}
            onExcluidas={setExcluidas}
            precioBase={precioBase}
            precios={overridePrecio}
            onPrecio={(clave, valor) => setOverridePrecio((prev) => ({ ...prev, [clave]: valor }))}
            editandoPrecios={editandoPrecios}
          />
        </div>

        <div className="border-t border-sand pt-4">
          {verEtiquetas || etiquetasElegidas.length > 0 ? (
            <div className="space-y-2">
              <p className="text-[12.5px] font-semibold text-tinta">
                Etiquetas <span className="font-normal text-taupe">· opcional, para todas las variantes</span>
              </p>
              {contexto.etiquetas.length === 0 ? (
                <p className="text-sm text-taupe">Todavía no hay etiquetas aprobadas.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {contexto.etiquetas.map((et) =>
                    cubiertaPorCampana(et) ? (
                      <span
                        key={et.id}
                        title="Esta campaña ya rige sobre todas las prendas de esta categoría: se aplica sola, no hace falta elegirla."
                        className="flex min-h-9 items-center gap-1.5 rounded-md border border-dashed border-tinta/30 bg-tinta/[0.03] px-2.5 py-1.5 text-sm text-tinta/70"
                      >
                        <span aria-hidden className="text-[11px]">
                          ✓
                        </span>
                        {et.nombre}
                        {et.descuentoPct !== null && <span className="tabular-nums">· {et.descuentoPct.toFixed(0)} % dto</span>}
                        <span className="text-[11px] text-tinta/50">· ya aplica por campaña</span>
                      </span>
                    ) : (
                      <ChipOpcion
                        key={et.id}
                        elegido={etiquetasElegidas.includes(et.id)}
                        onClick={() => setEtiquetasElegidas((prev) => (prev.includes(et.id) ? prev.filter((x) => x !== et.id) : [...prev, et.id]))}
                      >
                        {et.nombre}
                      </ChipOpcion>
                    )
                  )}
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-taupe">
              <button type="button" onClick={() => setVerEtiquetas(true)} className="btn-cayla btn-enlace text-[12.5px]">
                + Etiquetas (opcional)
              </button>
              {campanasQueAplican.length > 0 &&
                ` · ${campanasQueAplican.map((c) => `«${c.nombre}»`).join(", ")} ya se aplica${campanasQueAplican.length === 1 ? "" : "n"} sola${campanasQueAplican.length === 1 ? "" : "s"} a ${categoria?.nombre}`}
            </p>
          )}
        </div>

      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      // Crear un producto es un acto explícito: Enter dentro de un campo (corregir el nombre con todo ya lleno, cerrar un
      // precio) NO lo envía. Sin esto, con el resto completo, un Enter de costumbre habría creado una prenda que no se borra.
      onKeyDown={(e) => {
        if (e.key === "Enter" && e.target instanceof HTMLInputElement) e.preventDefault();
      }}
      className="space-y-4"
    >
      {/* Los 4 pasos de un vistazo: el hecho en verde, el abierto en tinta. Se puede volver a uno hecho. */}
      <nav aria-label="Pasos" className="grid grid-cols-5 gap-1.5">
        {PASOS_ALTA.map((n) => {
          const e = estadoPaso(n);
          return (
            <button
              key={n}
              type="button"
              disabled={e === "pendiente"}
              onClick={() => irAPaso(n)}
              aria-current={e === "abierto" ? "step" : undefined}
              aria-label={TITULOS[n]}
              className={`flex items-baseline gap-2 border-t-2 pt-2 text-left text-[12.5px] transition-colors disabled:cursor-default ${
                e === "abierto" ? "border-tinta text-tinta" : e === "hecho" ? "border-verde text-tinta" : "border-sand text-tinta/55"
              }`}
            >
              <span className="text-[11px] font-bold tabular-nums">{e === "hecho" ? "✓" : n}</span>
              <span className="hidden font-semibold sm:inline">{CORTOS[n]}</span>
            </button>
          );
        })}
      </nav>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        <div className="min-w-0 space-y-2.5">
          <ColaOfflineAviso cola={colaOffline.cola} onDescartar={colaOffline.descartar} uno="prenda nueva" varias="prendas nuevas" />
          {/* Sin red se puede crear el producto (sube solo), pero no lo que se crea A MITAD del alta: cada uno es su propia
              operación y el producto necesitaría su id. Decirlo antes evita llenar un paso para chocar al final. */}
          {!enLinea && (
            <AvisoInline tono="ambar">
              <strong>Sin conexión.</strong> Puedes crear el producto: queda en este equipo y recibe su código al subir. Lo que necesita internet: crear una
              marca, un proveedor, una talla, un tejido o un patrón nuevos, y comprobar si el nombre ya existe (la base lo vuelve a revisar al subir).
            </AvisoInline>
          )}
          {copiadoDe && (
            <AvisoInline tono="neutro">
              Empiezas desde <strong>{copiadoDe}</strong>: mantuve la categoría, la marca y el proveedor, las tallas, el tejido, el patrón, el precio, el
              costo y las etiquetas. Cambia lo que sea distinto.
            </AvisoInline>
          )}
          {PASOS_ALTA.map((n) => (
            <PasoAlta
              key={n}
              numero={n}
              titulo={TITULOS[n]}
              estado={estadoPaso(n)}
              resumen={resumen[n]}
              onAbrir={() => irAPaso(n)}
              falta={faltaDelPaso(problemas, n)}
              onSeguir={n >= 2 && n <= 4 ? () => irAPaso((n + 1) as NumeroPaso) : undefined}
              textoSeguir={n === 3 ? "Seguir al precio" : n === 4 ? "Seguir a las cantidades" : "Seguir"}
            >
              {cuerpo(n)}
            </PasoAlta>
          ))}
        </div>

        <FichaPrevia
          datos={{
            nombre: nombreFinal,
            codigo: categoria ? base : null,
            codigosVariantes: categoria && tallasElegidas.length ? codigosVariantes : [],
            categoria: categoria ? `${familia?.nombre ?? ""} › ${categoria.nombre}` : null,
            marca: marcaId ? marcaNombre || null : null,
            tallas: tallasOrdenadas.map((t) => t.texto).join(" · "),
            tejidoPatron: [tejidosCategoria.find((t) => t.id === tejidoId)?.texto, patronesCategoria.find((t) => t.id === patronId)?.texto].filter(Boolean).join(" · "),
            variantes: categoria && tallasElegidas.length > 0 ? celdasIncluidas.length : null,
            precio: precioNum > 0 ? precioNum : null,
            colores: coloresDatos.map((c) => ({ codigo: c.codigo, hex: c.hex })),
            foto: fotosOrdenadas[0]?.vista ?? null,
            fotos: fotos.length,
            stock: stock.total > 0 ? `${stock.total} · ${puedePiso && alPiso ? "piso" : destino.separaPiso ? "almacén" : destino.etiqueta}` : sinStock ? "Ninguna todavía" : null,
            siguiente: problemas[0]?.texto ?? null,
          }}
          responsable={responsable}
          cargando={cargando}
          puedeGuardar={puedeGuardar}
          onCancelar={() => router.push("/productos")}
        />
      </div>
    </form>
  );
}
