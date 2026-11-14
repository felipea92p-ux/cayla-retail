"use client";

import { enterNoGuarda } from "@/components/ui/enterNoGuarda";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Aviso } from "@/components/ui/Aviso";
import { avisar } from "@/components/ui/Avisos";
import { Boton, CampoMonto, CampoTexto } from "@/components/ui/campos";
import { soltarPaginaEstable } from "@/components/ui/PaginaEstable";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { useSalidaSinGuardar } from "@/components/ui/useSalidaSinGuardar";
import { Volver } from "@/components/ui/Volver";
import { ElegirColores } from "@/components/alta-producto/ElegirColores";
import { ElegirMuestra } from "@/components/alta-producto/ElegirMuestra";
import { ElegirTallas } from "@/components/alta-producto/ElegirTallas";
import { ID_QUIEN_REGISTRA, IdentidadAltaProveedor } from "@/components/alta-producto/IdentidadAlta";
import { NombreDePrenda } from "@/components/alta-producto/NombreDePrenda";
import { PuntosAvance } from "@/components/alta-producto/PuntosAvance";
import { PropuestaDePrecio, adelantarPropuestaDePrecio } from "@/components/alta-producto/PropuestaDePrecio";
import { ComboResponsable } from "@/components/ComboResponsable";
import { FotosDeLaPrenda } from "@/components/alta-producto/FotosDeColores";
import type { FotoPendiente } from "@/components/alta-producto/FotosAlta";
import { useCatalogoIAAlta } from "@/components/alta-producto/useCatalogoIAAlta";
import { createClient } from "@/lib/supabase/client";
import { subirFotoProducto, subirParDeCatalogo } from "@/lib/producto-fotos";
import { leerPermisoDeFotos, type PermisoDeFotos } from "@/lib/foto-catalogo-cliente";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { claveCelda, leerErrorAlta, ordenarFotosAlta, type ColorAlta } from "@/lib/alta-producto";
import type { ValorVocabulario } from "@/lib/catalogo-v2";
import { agruparPorFamilia } from "@/lib/colores-familias";
import { familiaEnCarta } from "@/lib/color-estampado-reglas";
import { esFalloDeRed, traducirError } from "@/lib/error-escritura";
import { avisosDelNombre, floresLibres, otrosTipos, tiposDeCategoria } from "@/lib/nombre-de-prenda";
import { sugerirDescripcion, sugerirNombre } from "@/lib/sugerencias-alta-producto";
import type { ControlResponsable } from "@/lib/useResponsable";
import { prepararPrendaAlRecibir } from "@/lib/recepcion-envio-acciones";
import { fichaDeLaAnterior, loQueLlena, recordarPrenda, type DatoDeLaAnterior, type PrendaAnterior } from "@/lib/recepcion-igual-que-anterior";
import { FichaDeLaAnterior } from "@/components/recepcion-envio/FichaDeLaAnterior";
import {
  AVISO_DE_CORTE_PRENDA,
  argsPrepararPrenda,
  borradorDePrenda,
  camposDelPaso,
  camposDePrenda,
  combinacionesDeLaHoja,
  costoComoTexto,
  mensajeDeLaRecepcion,
  nombreDeLaHoja,
  nombreInicialDeLaHoja,
  PASOS_PRENDA,
  pasoAbrible,
  pasoConFalta,
  pidePatron,
  pideTejido,
  primerPasoConFalta,
  textoDeLoQueSeCrea,
  TOPES_PRENDA,
  type BorradorPrenda,
  type CategoriaParaRecibir,
  type ContextoPrenda,
  type PrendaRecepcion,
  type VocabularioParaRecibir,
} from "@/lib/recepcion-envio-reglas";

// La hoja de la prenda al recibir (ADR-0362, fase 4; decisiones 21 y 49): quien recibe CREA la prenda que llegó, ahí mismo, con las tallas y
// los colores que vinieron y el precio de venta que sugirió quien compró ya puesto («Es nueva»); o le suma a una que ya existe las tallas o
// colores que le faltan («+ talla o color»). Escribe con `preparar_prenda_al_recibir`, que llama al alta de siempre
// (`crear_producto_con_variantes`): sus candados mandan (nombre único en la marca, talla de la categoría, color activo, precio mayor que 0)
// y sus mensajes llegan tal cual. La categoría y la marca son las de la línea: no se eligen aquí.
//
// Crear la prenda va como Nuevo producto (Felipe 2026-11-03: las colaboradoras ya saben usarlo): los mismos pasos y las mismas piezas, sin lo
// que aquí sobra. La categoría ya viene de la línea; temporada e insignias se ponen después en Productos. Solo el precio y lo que hace falta
// para contarla son obligatorios: tejido y patrón no (20261104003000). Lo creado aquí no sale solo en la tienda web.
//
// FOTOS (Felipe 2026-11-13: «que crear producto desde recibir mercadería también pida fotos y allí también esté lo de la IA»): en «Tallas y
// colores», una fila por color elegido con su foto y «Catálogo con IA», las mismas piezas de Nuevo producto (`FotosDeLaPrenda`). Son opcionales
// y solo se ofrecen a quien puede guardarlas (`fn_puede_editar_catalogo`, la regla de `producto_fotos`; se pregunta a `GET /api/fotos/catalogo`):
// quien recibe sin editar el catálogo crea la prenda como antes y las fotos se ponen después en Productos. Se suben al crear, después de la
// prenda y esperando a la IA, como en Nuevo producto; una que falle no deshace la prenda.
//
// Los ejemplos de la caja siguen a la categoría (ADR-0290). La guía de foco enciende lo que sigue dentro del paso (ADR-0284). Un token por hoja:
// un doble clic o un reintento no crea dos prendas.

export type DestinoHoja = {
  modo: "nueva" | "agregar";
  despachoId: string;
  /** La línea del envío; `null` = algo que no estaba en la guía (entonces van la categoría y la marca elegidas). */
  despachoItemId: string | null;
  categoriaId: string;
  /** Vacío = sin marca (ADR-0393, 2026-10-14): la prenda nace sin marca y se completa en Editar producto. */
  marcaId: string | null;
  marcaNombre: string;
  /** Lo que dice la orden de esta prenda («Chompa cuello alto»): se ofrece como nombre. */
  descripcionOrden: string | null;
  /** El nombre que la persona ya escribió al contar: llena la caja. Un nombre provisional («Blusa 1») no viene aquí. */
  nombreEscrito?: string | null;
  /** Lo que escribió al contar para no confundirlo con otro: llena el detalle. */
  nota?: string | null;
  precioSugerido: number | null;
  costoUnitario: number | null;
  /** En «agregar»: la prenda que ya existe. */
  prenda: PrendaRecepcion | null;
  /** Algo fuera de la guía en un envío de dos o más proveedores: de cuál es (`null` en una línea o con un solo proveedor). */
  proveedorId: string | null;
  /** En «agregar»: la talla o el color que la persona pidió sumar desde la tabla, ya marcados. */
  pedidas?: { tallaId?: string; colorCodigo?: string };
  /**
   * En «agregar», abierta desde la tabla de tallas del conteo (ADR-0645): las tallas y los colores que la tabla muestra. La hoja arranca con eso marcado y devuelve lo que quedó
   * marcado, para que la tabla muestre justo eso. Felipe 2026-11-11: agregar una talla o un color abre esta hoja completa, no un combo con buscador.
   */
  enTabla?: { tallaIds: readonly string[]; colorCodigos: readonly string[] };
};

const SIN_OFRECIDOS: Record<"tallas" | "tejidos" | "patrones", ValorVocabulario[]> = { tallas: [], tejidos: [], patrones: [] };

export function HojaPrenda({
  destino,
  categoria,
  colores: coloresIniciales,
  vocabulario,
  responsable,
  onListo,
  onCostoEscrito,
  onUsarExistente,
  onCerrar,
  anterior,
  onRecordar,
}: {
  destino: DestinoHoja;
  /** La categoría con sus tallas, tejidos y patrones; `null` si no se pudo leer el catálogo. */
  categoria: CategoriaParaRecibir | null;
  colores: ColorAlta[];
  /** Todo el vocabulario, para «Otra talla» y «Ver todos»; `null` si no se pudo leer: se elige entre lo de la categoría. */
  vocabulario: VocabularioParaRecibir | null;
  responsable: ControlResponsable;
  /** `marcas`: solo con `destino.enTabla`, las tallas y los colores que quedaron marcados. */
  onListo: (prenda: PrendaRecepcion, marcas?: { tallaIds: readonly string[]; colorCodigos: readonly string[] }) => void;
  /** ADR-0641 act. 2026-11-11: el costo que se escribió en el paso del precio, distinto del de la línea, para que el cierre lo traiga puesto. */
  onCostoEscrito?: (productoId: string, costoTexto: string) => void;
  /** «Ya existe esa prenda»: la pantalla la busca y la pone en la línea. */
  onUsarExistente: (productoId: string, nombre: string) => Promise<boolean>;
  onCerrar: () => void;
  /** «Igual que la anterior» (tarea 7 de Recibir): la prenda recién creada en este envío, para ofrecer su tejido, patrón y tallas de un toque. */
  anterior?: PrendaAnterior | null;
  /** Al crear una prenda nueva: lo que se recuerda de ella para ofrecerlo en la siguiente. */
  onRecordar?: (p: PrendaAnterior) => void;
}) {
  const nueva = destino.modo === "nueva";
  const [coloresCreados, setColoresCreados] = useState<ColorAlta[]>([]);
  const colores = useMemo(() => [...coloresIniciales, ...coloresCreados.filter((c) => !coloresIniciales.some((x) => x.codigo === c.codigo))], [coloresIniciales, coloresCreados]);
  const grupos = useMemo(() => agruparPorFamilia(colores, familiaEnCarta), [colores]);
  // Lo que se ofreció en la categoría desde esta hoja («Otra talla», «Ver todos»): la lista de la categoría ya lo trae desde ahora.
  const [ofrecidos, setOfrecidos] = useState(SIN_OFRECIDOS);

  const ctx: ContextoPrenda = useMemo(
    () => ({
      modo: destino.modo,
      tallas: [...(categoria?.tallas ?? []), ...ofrecidos.tallas.map((t) => ({ id: t.id, valor: t.texto }))],
      exigeTejidoPatron: categoria?.exigeTejidoPatron ?? false,
      tejidos: [...(categoria?.tejidos ?? []), ...ofrecidos.tejidos],
      patrones: [...(categoria?.patrones ?? []), ...ofrecidos.patrones],
      existentes: destino.prenda ? new Set(destino.prenda.variantes.map((v) => claveCelda(v.tallaId, v.colorCodigo))) : undefined,
      enTabla: destino.enTabla,
    }),
    [destino.modo, destino.prenda, destino.enTabla, categoria, ofrecidos],
  );
  const contextoNombre = { familia: categoria?.familia, prefijo: categoria?.prefijo };
  const tipos = tiposDeCategoria(contextoNombre);
  const [{ tipo, propio }, setNombreCaja] = useState(() => nombreInicialDeLaHoja(destino.nombreEscrito, tipos));
  const [borrador, setBorrador] = useState<BorradorPrenda>(() => {
    const b = borradorDePrenda(ctx, { precioSugerido: destino.precioSugerido, prenda: destino.prenda });
    const { tallaId, colorCodigo } = destino.pedidas ?? {};
    return {
      ...b,
      nombre: nueva ? nombreDeLaHoja(tipo, propio) : b.nombre,
      descripcion: nueva ? (destino.nota?.trim().slice(0, TOPES_PRENDA.descripcion) ?? "") : b.descripcion,
      tallaIds: tallaId && !b.tallaIds.includes(tallaId) ? [...b.tallaIds, tallaId] : b.tallaIds,
      colorCodigos: colorCodigo && !b.colorCodigos.includes(colorCodigo) ? [...b.colorCodigos, colorCodigo] : b.colorCodigos,
    };
  });
  // El costo, junto al precio (Felipe 2026-11-07 y 2026-11-11: «el costo y el precio siempre deben salir juntos»): viene el de la línea y se
  // corrige aquí. No va a la base al crear (la prenda nace con el costo de la línea): lo escrito llega puesto al cierre, que es donde se fija.
  const costoDeLinea = destino.costoUnitario != null ? costoComoTexto(destino.costoUnitario) : "";
  const [costo, setCosto] = useState(costoDeLinea);
  // Las fotos de la prenda (solo al crear una nueva): viven aquí hasta crearla.
  const [permisoFotos, setPermisoFotos] = useState<PermisoDeFotos>({ fotos: false, ia: false });
  useEffect(() => {
    if (!nueva) return;
    let vigente = true;
    void leerPermisoDeFotos().then((p) => vigente && setPermisoFotos(p));
    return () => {
      vigente = false;
    };
  }, [nueva]);
  const [fotos, setFotos] = useState<FotoPendiente[]>([]);
  const fotosRef = useRef(fotos);
  useEffect(() => {
    fotosRef.current = fotos;
  }, [fotos]);
  // La hoja va por pasos: un clic en el velo no puede llevarse lo que se llenó en los anteriores.
  const [borradorInicial] = useState(() => JSON.stringify(borrador));
  const avisoSalida = useSalidaSinGuardar(nueva && (JSON.stringify(borrador) !== borradorInicial || fotos.length > 0), "Llenaste parte de esta prenda y todavía no se creó. Si cierras ahora, se pierde lo que llenaste.");
  const cambiar = (cambios: Partial<BorradorPrenda>) => setBorrador((b) => ({ ...b, ...cambios }));
  const cambiarNombre = (nuevoTipo: string, nuevoPropio: string) => {
    setNombreCaja({ tipo: nuevoTipo, propio: nuevoPropio });
    cambiar({ nombre: nombreDeLaHoja(nuevoTipo, nuevoPropio) });
  };
  // Lo que vino puesto (las tallas de siempre, el precio sugerido) se revisa: hasta que se toca es «sugerido» (ADR-0284 act. h).
  const [tocados, setTocados] = useState<{ tallas?: boolean; precio?: boolean }>({});

  const [paso, setPaso] = useState<number>(PASOS_PRENDA[0].numero);
  const [visitados, setVisitados] = useState<ReadonlySet<number>>(() => new Set([PASOS_PRENDA[0].numero]));
  const ultimoPaso = PASOS_PRENDA[PASOS_PRENDA.length - 1].numero;
  const enUltimoPaso = !nueva || paso === ultimoPaso;
  const arriba = useRef<HTMLDivElement>(null);

  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** El nombre ya existe (o se escribe casi igual) en la marca: se ofrece usar esa prenda, o crear la nueva igual (si es casi igual). */
  const [parecida, setParecida] = useState<{ tipo: "nombre_duplicado" | "nombre_casi_igual"; productoId: string | null; mensaje: string } | null>(null);
  const [token] = useState(() => crypto.randomUUID());
  const enVuelo = useRef(false);
  const avisoError = useRef<HTMLDivElement>(null);

  const camposPrenda = camposDePrenda(borrador, ctx, tocados);
  const nuevas = combinacionesDeLaHoja(borrador, ctx).length;
  // Desde la tabla de tallas, sin nada que crear, solo cambia lo que la tabla muestra: no se escribe en la base y no hace falta decir quién.
  const soloMostrar = !!destino.enTabla && !!destino.prenda && nuevas === 0;
  const campoResponsable = responsable.listo || soloMostrar ? [] : [{ id: "prenda-responsable", nombre: "Quién la crea", requerido: true, hecho: false, pendiente: responsable.motivo ?? "Elige quién recibe." }];
  // La guía enciende lo que sigue dentro del paso abierto. Quién la crea se pide a la vista desde el principio, pero solo frena al crear, como en Nuevo producto.
  const campos = nueva ? [...camposDelPaso(camposPrenda, paso), ...(enUltimoPaso ? campoResponsable : [])] : [...camposPrenda, ...campoResponsable];
  const guia = useGuiaCampos(campos);
  const queSeCrea = textoDeLoQueSeCrea(borrador, ctx, (codigo) => colores.find((c) => c.codigo === codigo)?.nombre ?? codigo);
  const catalogo = useCatalogoIAAlta({
    disponible: permisoFotos.ia,
    fotos,
    setFotos,
    colores: borrador.colorCodigos,
    nombreColor: (codigo) => (codigo === null ? "la prenda" : (colores.find((c) => c.codigo === codigo)?.nombre ?? codigo)),
  });

  /** Sube las fotos de la prenda recién creada (las de los colores que quedaron elegidos), esperando a las que la IA prepara. Lo que falle se avisa. */
  async function subirFotos(productoId: string) {
    const elegidos = borrador.colorCodigos;
    const lista = (await catalogo.esperar(fotosRef.current)).filter((f) => f.colorCodigo === null || elegidos.includes(f.colorCodigo));
    if (lista.length === 0) return;
    const supabase = createClient();
    const filas: { producto_id: string; url: string; orden: number; es_principal: boolean; color_codigo: string | null }[] = [];
    const fallidas: string[] = [];
    for (const f of ordenarFotosAlta(lista, elegidos)) {
      const r = f.ia?.usar ? await subirParDeCatalogo(supabase, f.archivo, f.ia.png) : await subirFotoProducto(supabase, f.archivo);
      if ("error" in r) fallidas.push(`${f.archivo.name}: ${r.error}`);
      else filas.push({ producto_id: productoId, url: r.url, orden: filas.length, es_principal: filas.length === 0, color_codigo: f.colorCodigo });
    }
    if (filas.length > 0) {
      const { error: errFotos } = await supabase.from("producto_fotos").insert(filas);
      if (errFotos) fallidas.push(traducirError(errFotos, "guardar las fotos"));
    }
    fotosRef.current.forEach((f) => URL.revokeObjectURL(f.vista));
    if (fallidas.length > 0) avisar.aviso("La prenda se creó, pero no todas sus fotos subieron.", { detalle: `${fallidas.join(" · ")}. Agrégalas en Productos.` });
  }

  useEffect(() => {
    if (error) avisoError.current?.focus();
  }, [error]);

  function irAPaso(numero: number) {
    setPaso(numero);
    setVisitados((v) => new Set([...v, numero]));
  }

  // La propuesta de precio se pide apenas se abre la hoja (Felipe 2026-11-13: «lo pudo haber hecho desde que empecé a crear el producto»):
  // la categoría y el costo vienen de la línea, y el nombre casi siempre de lo contado. La IA tarda 4 a 7 s (medido en producción), así que
  // al llegar al precio ya está. Si se elige otro tejido, se vuelve a pedir con él (es lo único de «Cómo es» que cambia la respuesta); la
  // espera corta junta varios clics seguidos en una sola consulta. Lo de igual clave no se repite: ni lo respondido ni lo que va en camino.
  useEffect(() => {
    if (!nueva || paso > 2) return;
    const espera = window.setTimeout(
      () =>
        adelantarPropuestaDePrecio({
          origen: "recepcion",
          categoriaId: destino.categoriaId,
          tejidoId: borrador.tejidoId,
          referencia: borrador.nombre,
          descripcion: borrador.descripcion,
          costoBase: costo.trim().replace(",", "."),
        }),
      400,
    );
    return () => window.clearTimeout(espera);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- al abrir y al cambiar el tejido; no con cada letra del nombre o del detalle
  }, [paso, borrador.tejidoId]);

  // Cada paso abre desde arriba. Es otra vista y no un bloque que se acortó: sin soltar la reserva de la página, un paso más corto aparece corrido y con aire debajo (ADR-0185).
  const pasoPintado = useRef(paso);
  useLayoutEffect(() => {
    if (pasoPintado.current === paso) return;
    pasoPintado.current = paso;
    soltarPaginaEstable();
    arriba.current?.scrollIntoView({ block: "start" });
  }, [paso]);

  function irALoQueFalta(): boolean {
    if (guia.puedeConfirmar) return false;
    const ahora = guia.ahora ?? guia.faltan[0]?.id;
    if (ahora) guia.ir(ahora);
    return true;
  }

  function seguir() {
    if (irALoQueFalta()) return;
    irAPaso(paso + 1);
  }

  async function crear(confirmoDistinto: boolean) {
    if (guardando || enVuelo.current) return;
    if (irALoQueFalta()) return;
    // Con los puntos de arriba se puede volver a un paso, borrar algo y saltar al último: se vuelve ahí en vez de mandar a la base algo que falta.
    const conFalta = nueva ? primerPasoConFalta(camposPrenda) : null;
    if (conFalta !== null) {
      irAPaso(conFalta);
      return;
    }
    const marcas = destino.enTabla ? { tallaIds: borrador.tallaIds, colorCodigos: borrador.colorCodigos } : undefined;
    if (soloMostrar && destino.prenda) {
      onListo(destino.prenda, marcas);
      return;
    }
    enVuelo.current = true;
    try {
      setGuardando(true);
      setError(null);
      setParecida(null);
      const args = argsPrepararPrenda(borrador, ctx, {
        despachoId: destino.despachoId,
        despachoItemId: destino.despachoItemId,
        categoriaId: destino.categoriaId,
        marcaId: destino.marcaId,
        productoId: destino.prenda?.productoId ?? null,
        confirmoDistinto,
        token,
        proveedorId: destino.proveedorId,
      });
      const { prenda, error: falla } = await prepararPrendaAlRecibir(args, responsable.firma(), destino.prenda);
      // Como el alta al vuelo de un conteo: crear la prenda es un paso de la recepción, así que el éxito no vacía el combo (se recibe
      // enseguida con la misma persona); un rechazo por el responsable sí.
      if (falla) responsable.despues(falla);
      setGuardando(false);
      if (falla) {
        const alta = leerErrorAlta(falla);
        if (alta.tipo === "nombre_duplicado" || alta.tipo === "nombre_casi_igual") {
          setParecida({ tipo: alta.tipo, productoId: alta.existenteId, mensaje: alta.mensaje });
          return;
        }
        setError(esFalloDeRed(falla) ? AVISO_DE_CORTE_PRENDA : (mensajeDeLaRecepcion(falla) ?? traducirError(falla, nueva ? "crear la prenda" : "sumar las tallas o colores")));
        return;
      }
      if (!prenda || prenda.variantes.length === 0) {
        setError("La base respondió, pero no pudimos leer la prenda. Cierra esta hoja y búscala en «Ya la tengo».");
        return;
      }
      // Las fotos, recién ahora que la prenda existe (como Nuevo producto). El botón sigue en «Creando…» mientras suben.
      // (Una foto que la IA prepara ya está en la lista con su real: `useCatalogoIAAlta` la agrega al elegirla.)
      if (nueva && permisoFotos.fotos && fotosRef.current.length > 0) {
        setGuardando(true);
        await subirFotos(prenda.productoId);
        setGuardando(false);
      }
      avisar.exito(nueva ? `${prenda.nombre} creada` : `${prenda.nombre}: tallas o colores sumados`, {
        // Creada por quien no edita el catálogo, nace pendiente (ADR-0371): se recibe igual y un líder la revisa después.
        detalle: prenda.estadoAlta === "pendiente" ? "Ya puedes contarla. Un líder la revisa después en Productos." : "Ya puedes contarla.",
      });
      const costoEscrito = costo.trim().replace(",", ".");
      if (nueva && costoEscrito !== "" && costoEscrito !== costoDeLinea && Number(costoEscrito) > 0) onCostoEscrito?.(prenda.productoId, costoEscrito);
      if (nueva)
        onRecordar?.(
          recordarPrenda(
            { categoriaId: destino.categoriaId, nombre: prenda.nombre, tejidoId: borrador.tejidoId, patronId: borrador.patronId, tallaIds: borrador.tallaIds },
            { tejidos: [...ctx.tejidos, ...(vocabulario?.tejidos ?? [])], patrones: [...ctx.patrones, ...(vocabulario?.patrones ?? [])], tallas: ctx.tallas },
          ),
        );
      onListo(prenda, marcas);
    } finally {
      enVuelo.current = false;
    }
  }

  async function usarExistente() {
    if (!parecida?.productoId) return;
    const nombre = parecida.mensaje.match(/«([^»]+)»|"([^"]+)"/)?.slice(1).find(Boolean) ?? borrador.nombre;
    const ok = await onUsarExistente(parecida.productoId, nombre);
    if (!ok) setError(`No la encontramos entre las prendas de ${[categoria?.nombre ?? "esta categoría", destino.marcaNombre].filter(Boolean).join(" · ")}. Ciérrala y búscala en «Ya la tengo».`);
  }

  // «Igual que la anterior»: una oferta que se toca, nunca un valor puesto (tallas y marca arrancan vacías, tejido y patrón son opcionales).
  const [quitadosDeLaAnterior, setQuitadosDeLaAnterior] = useState<ReadonlySet<DatoDeLaAnterior>>(new Set());
  const fichaAnterior = nueva
    ? fichaDeLaAnterior(
        anterior,
        { categoriaId: destino.categoriaId, curva: ctx.tallas, pideTejido: pideTejido(ctx), pidePatron: pidePatron(ctx), elegido: borrador },
        quitadosDeLaAnterior,
      )
    : null;
  function usarLaAnterior() {
    if (!anterior || !fichaAnterior) return;
    const llena = loQueLlena(anterior, fichaAnterior, ctx.tallas);
    // Un tejido o un patrón que la hoja anterior ofreció con «Ver todos» todavía no está en la lista de esta categoría: se ofrece igual.
    if (llena.tejidoId && anterior.tejido && !ctx.tejidos.some((t) => t.id === anterior.tejido?.id)) ofrecer("tejidos")(anterior.tejido);
    if (llena.patronId && anterior.patron && !ctx.patrones.some((t) => t.id === anterior.patron?.id)) ofrecer("patrones")(anterior.patron);
    if (llena.tallaIds) setTocados((x) => ({ ...x, tallas: true }));
    cambiar(llena);
  }

  const nombreCategoria = categoria?.nombre ?? "esta categoría";
  const tallasCategoria = ctx.tallas.map((t) => ({ id: t.id, texto: t.valor }));
  const habituales = ctx.tallas.filter((t) => t.habitual).map((t) => t.id);
  const ejesActuales = { tallaIds: ctx.tallas.map((t) => t.id), tejidoIds: ctx.tejidos.map((t) => t.id), patronIds: ctx.patrones.map((t) => t.id) };
  const ofrecer = (eje: keyof typeof SIN_OFRECIDOS) => (v: ValorVocabulario) => setOfrecidos((o) => (o[eje].some((x) => x.id === v.id) ? o : { ...o, [eje]: [...o[eje], v] }));
  const nombresColores = colores.map((c) => c.nombre);
  const sugerenciaNombre = sugerirNombre(contextoNombre);
  const sugerenciaDescripcion = sugerirDescripcion(contextoNombre);
  const nombreDeLaOrden = destino.descripcionOrden?.trim() ?? "";
  const titulo = nueva ? "Crear la prenda que llegó" : destino.enTabla ? `Tallas y colores de ${destino.prenda?.nombre ?? "la prenda"}` : `Sumar tallas o colores a ${destino.prenda?.nombre ?? "la prenda"}`;
  const subtitulo = nueva
    ? `${[categoria?.nombre ?? "Categoría", destino.marcaNombre].filter(Boolean).join(" · ")}. Se crea en el catálogo${destino.costoUnitario != null ? ` con el costo de esta línea (S/ ${costoComoTexto(destino.costoUnitario)})` : ""} y queda lista para contar.`
    : destino.enTabla
      ? "Marca las tallas y los colores que llegaron: la tabla muestra justo esos. Lo que la prenda todavía no tiene se crea aquí."
      : "Elige las tallas y los colores que llegaron: se crean las combinaciones que la prenda todavía no tiene.";
  const pasoAbierto = PASOS_PRENDA.find((p) => p.numero === paso) ?? PASOS_PRENDA[0];
  const resumenDe: Record<number, string> = {
    1: borrador.nombre,
    2: queSeCrea ?? "",
    3: borrador.precio ? `S/ ${borrador.precio}` : "",
  };
  const pasosConNombre = PASOS_PRENDA.map((p) => ({
    numero: p.numero,
    nombre: p.nombre,
    nombreCorto: p.nombreCorto,
    detalle: resumenDe[p.numero] ?? "",
    // Un paso solo lleva ✓ si la persona pasó por él (ADR-0284).
    estado: p.numero === paso ? ("abierto" as const) : visitados.has(p.numero) && !pasoConFalta(camposPrenda, p.numero) ? ("hecho" as const) : ("pendiente" as const),
    abrible: pasoAbrible(camposPrenda, p.numero),
  }));

  const elegirTallas = categoria && categoria.tallas.length + ofrecidos.tallas.length > 0 ? (
    <CampoGuiado id="prenda-tallas" guia={guia} retiene="fila" titulo="Tallas" ayuda={nueva ? "Las que llegaron" : "Las que tiene y las que llegaron"}>
      <ElegirTallas
        deLaCategoria={tallasCategoria}
        universo={vocabulario?.tallas ?? tallasCategoria}
        elegidas={borrador.tallaIds}
        onElegidas={(tallaIds) => {
          setTocados((x) => ({ ...x, tallas: true }));
          cambiar({ tallaIds });
        }}
        habituales={habituales}
        categoriaId={categoria.id}
        categoriaNombre={categoria.nombre}
        familia={categoria.familia}
        ejesActuales={ejesActuales}
        onOfrecido={ofrecer("tallas")}
        // Al sumar a una prenda que ya existe, lo que tiene no se desmarca: «Solo las de siempre» no aplica.
        sinAtajos={!nueva}
      />
    </CampoGuiado>
  ) : (
    categoria && <p className="text-sm text-taupe">{categoria.nombre} no tiene tallas: la prenda va en talla única.</p>
  );

  const elegirColores = (
    <CampoGuiado id="prenda-colores" guia={guia} retiene="fila" titulo="Colores" ayuda={borrador.colorCodigos.length > 0 ? `${borrador.colorCodigos.length} elegido${borrador.colorCodigos.length === 1 ? "" : "s"}` : "Si no tiene color, déjalo vacío"}>
      <ElegirColores
        colores={colores}
        grupos={grupos}
        elegidos={borrador.colorCodigos}
        onAlternar={(codigo) => cambiar({ colorCodigos: borrador.colorCodigos.includes(codigo) ? borrador.colorCodigos.filter((c) => c !== codigo) : [...borrador.colorCodigos, codigo] })}
        onCreado={(color) => {
          setColoresCreados((cs) => (cs.some((c) => c.codigo === color.codigo) ? cs : [...cs, color]));
          setBorrador((b) => (b.colorCodigos.includes(color.codigo) ? b : { ...b, colorCodigos: [...b.colorCodigos, color.codigo] }));
        }}
        // Desde la tabla de tallas la carta va abierta: se elige mirando los colores, no buscando su nombre.
        cartaAbierta={nueva || !!destino.enTabla}
        conMezclas
      />
    </CampoGuiado>
  );

  const quienRecibe = !responsable.listo && (
    <div id={ID_QUIEN_REGISTRA}>
      <CampoGuiado id="prenda-responsable" guia={guia} titulo="Quién recibe">
        <ComboResponsable control={responsable} deshabilitado={guardando} />
      </CampoGuiado>
    </div>
  );

  const avisos = (
    <>
      {parecida && (
        <Aviso
          tono="atencion"
          titulo={parecida.tipo === "nombre_duplicado" ? "Esa prenda ya existe en esta marca" : "Hay una prenda que se escribe casi igual"}
          accion={
            <span className="flex flex-wrap gap-2">
              {parecida.productoId && (
                <Boton type="button" onClick={() => void usarExistente()}>
                  Usar esa prenda
                </Boton>
              )}
              {parecida.tipo === "nombre_casi_igual" && (
                <Boton type="button" peso="discreto" onClick={() => void crear(true)}>
                  Es otra: crearla igual
                </Boton>
              )}
            </span>
          }
        >
          {parecida.mensaje}
        </Aviso>
      )}
      {error && (
        <Aviso ref={avisoError} enfocable tono="error" titulo={nueva ? "No se pudo crear la prenda" : "No se pudieron sumar las tallas o colores"}>
          {error}
        </Aviso>
      )}
    </>
  );

  return (
    <Modal titulo={titulo} subtitulo={subtitulo} tamano={nueva || destino.enTabla ? "ancha" : "mediana"} bloqueado={guardando} onClose={onCerrar} antesDeCerrar={avisoSalida.pedirAccion}>
      {(cerrar) => (
        <IdentidadAltaProveedor control={responsable}>
          <form
            data-guia="recepcion.hoja-prenda"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              if (enUltimoPaso) void crear(false);
              else seguir();
            }}
            onKeyDown={enterNoGuarda}
            className="hoja-con-pasos space-y-4"
          >
            {!categoria && (
              <Aviso tono="atencion" titulo="No se pudieron leer las tallas y los colores">
                Cierra esta hoja y vuelve a intentarlo en un momento. Mientras tanto, puedes buscar la prenda en «Ya la tengo».
              </Aviso>
            )}

            {nueva ? (
              <>
                <div ref={arriba} className="scroll-mt-4">
                  <PuntosAvance pasos={pasosConNombre} onAbrir={irAPaso} />
                </div>
                {quienRecibe}
                {/* La entrada sin `fill-mode: both`, como el paso de Nuevo producto: no le deja un `transform` puesto al contenedor, que correría las listas de sus combos. */}
                <div key={paso} className="space-y-4 [animation:cayla-revelar_240ms_var(--ease-cayla)]">
                  <TituloSeccion>{pasoAbierto.titulo}</TituloSeccion>

                  {paso === 1 && (
                    <>
                      {fichaAnterior && (
                        <FichaDeLaAnterior
                          ficha={fichaAnterior}
                          onUsar={usarLaAnterior}
                          onQuitar={(clave) => setQuitadosDeLaAnterior((q) => new Set([...q, clave]))}
                        />
                      )}
                      {pideTejido(ctx) && categoria && (
                        <CampoGuiado id="prenda-tejido" guia={guia} titulo="Tejido" ayuda="Opcional · De qué tela es">
                          <ElegirMuestra
                            tipo="tejidos"
                            deLaCategoria={[...ctx.tejidos]}
                            universo={vocabulario?.tejidos ?? [...ctx.tejidos]}
                            imagenes={vocabulario?.imagenes.tejidos ?? {}}
                            elegidoId={borrador.tejidoId}
                            onElegir={(tejidoId) => cambiar({ tejidoId })}
                            categoriaId={categoria.id}
                            categoriaNombre={nombreCategoria}
                            familia={categoria.familia}
                            ejesActuales={ejesActuales}
                            onOfrecido={ofrecer("tejidos")}
                          />
                        </CampoGuiado>
                      )}
                      {pidePatron(ctx) && categoria && (
                        <CampoGuiado id="prenda-patron" guia={guia} titulo="Patrón" ayuda="Opcional · El dibujo de la tela. Si no tiene, elige Liso">
                          <ElegirMuestra
                            tipo="patrones"
                            deLaCategoria={[...ctx.patrones]}
                            universo={vocabulario?.patrones ?? [...ctx.patrones]}
                            imagenes={vocabulario?.imagenes.patrones ?? {}}
                            elegidoId={borrador.patronId}
                            onElegir={(patronId) => cambiar({ patronId })}
                            categoriaId={categoria.id}
                            categoriaNombre={nombreCategoria}
                            familia={categoria.familia}
                            ejesActuales={ejesActuales}
                            onOfrecido={ofrecer("patrones")}
                          />
                        </CampoGuiado>
                      )}
                      <CampoGuiado id="prenda-descripcion" guia={guia} titulo="Detalle" ayuda="Opcional · Corte, largo o un detalle: lo que no dice el nombre">
                        <CampoTexto
                          etiqueta="Detalle"
                          caja
                          value={borrador.descripcion}
                          onChange={(e) => cambiar({ descripcion: e.target.value })}
                          placeholder={sugerenciaDescripcion.texto}
                          maxLength={TOPES_PRENDA.descripcion}
                        />
                      </CampoGuiado>
                      <CampoGuiado id="prenda-nombre" guia={guia} titulo="Nombre" ayuda={tipo ? "El tipo lo pone la categoría; tú escribes el resto" : "Como se lo dirías a un cliente"}>
                        <NombreDePrenda
                          id="prenda-nombre-caja"
                          tipos={tipos}
                          tipo={tipo}
                          onTipo={(t) => cambiarNombre(t, propio)}
                          valor={propio}
                          onValor={(v) => cambiarNombre(tipo, v)}
                          sugeridas={tipo ? floresLibres({ referencias: vocabulario?.nombresPorCategoria[destino.categoriaId] ?? [], tipos, colores: nombresColores }) : []}
                          avisos={tipo ? avisosDelNombre(propio, { tipos, colores: nombresColores, otrosTipos: otrosTipos(categoria?.prefijo) }) : []}
                          placeholderLibre={sugerenciaNombre.texto}
                          nombreFinal={borrador.nombre}
                        />
                        {nombreDeLaOrden && !propio.trim() && (
                          <p className="mt-2 text-sm text-taupe">
                            En la orden dice «{nombreDeLaOrden}».{" "}
                            <button
                              type="button"
                              onClick={() => {
                                const n = nombreInicialDeLaHoja(nombreDeLaOrden.slice(0, TOPES_PRENDA.nombre), tipos);
                                cambiarNombre(n.tipo, n.propio);
                              }}
                              className="btn-cayla btn-enlace text-xs"
                            >
                              Usar ese nombre
                            </button>
                          </p>
                        )}
                      </CampoGuiado>
                    </>
                  )}

                  {paso === 2 && (
                    <>
                      {elegirTallas}
                      {elegirColores}
                      {/* Reserva su línea: lo que se crea aparece con la primera talla y no empuja el pie. */}
                      <p className="nota-cayla sin-i min-h-11">{queSeCrea ?? "Marca las tallas que llegaron y aquí se ve lo que se va a crear."}</p>
                      {permisoFotos.fotos && (
                        <FotosDeLaPrenda
                          titulo={
                            <span className="campo-etiqueta">
                              Fotos<span className="font-normal normal-case tracking-normal text-taupe"> · opcional</span>
                            </span>
                          }
                          colores={borrador.colorCodigos.flatMap((codigo) => colores.filter((c) => c.codigo === codigo))}
                          fotos={fotos}
                          onFotos={setFotos}
                          catalogo={catalogo}
                          disabled={guardando}
                        />
                      )}
                    </>
                  )}

                  {paso === 3 && (
                    <>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <CampoMonto
                          etiqueta="Costo"
                          pie={destino.costoUnitario != null ? "El de esta compra." : "Opcional. Afina la propuesta."}
                          inputMode="decimal"
                          placeholder="0.00"
                          value={costo}
                          onChange={(e) => setCosto(e.target.value)}
                        />
                        <CampoGuiado id="prenda-precio" guia={guia}>
                          <CampoMonto
                            etiqueta={guia.etiqueta("prenda-precio", "Precio de venta")}
                            pie={destino.precioSugerido != null && destino.precioSugerido > 0 ? "Lo sugirió quien compró." : "Al que se vende en tienda."}
                            inputMode="decimal"
                            placeholder="0.00"
                            value={borrador.precio}
                            onChange={(e) => {
                              setTocados((x) => ({ ...x, precio: true }));
                              cambiar({ precio: e.target.value });
                            }}
                          />
                        </CampoGuiado>
                      </div>
                      {/* ADR-0641 act. 2026-11-11 (Felipe: «sola, al llegar al paso»): la IA propone con el costo de arriba y las parecidas. */}
                      <PropuestaDePrecio
                        origen="recepcion"
                        automatica
                        categoriaId={destino.categoriaId}
                        tejidoId={borrador.tejidoId}
                        referencia={borrador.nombre}
                        descripcion={borrador.descripcion}
                        costoBase={costo.trim().replace(",", ".")}
                        precioBase={borrador.precio}
                        disabled={guardando}
                        onUsar={(p) => {
                          setTocados((x) => ({ ...x, precio: true }));
                          cambiar({ precio: p });
                        }}
                        onDejar={() => setTocados((x) => ({ ...x, precio: true }))}
                      />
                      <p className="nota-cayla">
                        {permisoFotos.fotos ? "No sale en la web hasta publicarla." : "Las fotos y lo demás, después en Productos. No sale en la web hasta publicarla."}
                      </p>
                    </>
                  )}
                </div>
              </>
            ) : (
              <>
                {elegirTallas}
                {elegirColores}
                <CampoGuiado id="prenda-nuevas" guia={guia}>
                  <p className="text-sm text-tinta">{queSeCrea ?? "Elige una talla o un color que la prenda todavía no tenga."}</p>
                </CampoGuiado>
                {quienRecibe}
              </>
            )}

            {avisos}

            <PieGuia guia={guia} listo={soloMostrar ? "Listo: la tabla va a mostrar lo que marcaste." : !nueva ? "Todo listo para sumarlas." : enUltimoPaso ? "Todo listo para crear la prenda." : "Listo: puedes seguir."} />
            <div className="pie-acciones pie-hoja-fijo pt-1">
              {nueva && paso > PASOS_PRENDA[0].numero && <Volver onClick={() => irAPaso(paso - 1)} deshabilitado={guardando} a="Volver al paso anterior" className="mr-auto" />}
              <Boton type="button" peso="fantasma" onClick={() => avisoSalida.pedirAccion(cerrar)} disabled={guardando}>
                Cancelar
              </Boton>
              {/* Una `key` por botón: sin ella, React reusaba el MISMO <button> y, al tocar «Seguir» en el paso 2, lo volvía `submit` antes de
                  que el navegador terminara el clic, que enviaba el formulario y creaba la prenda sin mostrar el paso del precio (Felipe
                  2026-11-12, corrida de /flujo-de-negocio). Lo vigila `lib/botones-que-cambian-de-tipo.test.ts`. */}
              {enUltimoPaso ? (
                <Boton key="crear" type="submit" peso="primario" cargando={guardando} textoCargando={nueva ? "Creando…" : "Sumando…"} title={guia.frase ?? undefined} className={guia.claseConfirmar}>
                  {nueva ? "Crear y contar" : nuevas > 0 ? `Sumar ${nuevas} y contar` : destino.enTabla ? "Listo" : "Sumar y contar"}
                </Boton>
              ) : (
                <Boton key="seguir" type="button" peso="primario" onClick={seguir} title={guia.frase ?? undefined} className={guia.claseConfirmar}>
                  <span className="flex items-center gap-2">
                    Seguir
                    <ArrowRight aria-hidden className="-my-1 h-4 w-4 shrink-0" />
                  </span>
                </Boton>
              )}
            </div>
            {avisoSalida.aviso}
          </form>
          {/* La hoja de ángulos de la IA, fuera del formulario: sus teclas no le llegan (ADR-0128). */}
          {catalogo.hoja}
        </IdentidadAltaProveedor>
      )}
    </Modal>
  );
}
