"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { esFalloDeRed, esRespuestaIncierta, traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { sonarConfirmacion } from "@/lib/sonido-confirmar";
import { useRecordatorioEtiquetas } from "@/components/ficha-producto/RecordatorioEtiquetas";
import { FotoDePrenda } from "@/components/ui/FotoDePrenda";
import { categoriaDe } from "@/components/ui/PrendaCelda";
import { Modal } from "@/components/ui/Modal";
import { Boton, CampoSelect, CampoTexto, Segmentado } from "@/components/ui/campos";
import {
  AYUDA_ENCONTRE_PRENDAS,
  MOTIVOS_AJUSTE,
  NOTA_MINIMA_ENCONTRE,
  NOTA_REPOSICION_CERRADA,
  motivoPideNota,
  notaSuficiente,
  textoProblemaMotivo,
  argumentosDeAjuste,
  armarVariantesAjuste,
  candidatasDeHallazgo,
  faltantesDesdeJson,
  resolverHallazgos,
  textoFaltanteConteo,
  textoHallazgoConExceso,
  textoHallazgoSinResponder,
  cargaInicialAlPiso,
  detalleDeTalla,
  leerResultadoAjuste,
  etiquetaCantidad,
  lineasDeAjuste,
  lugarDeAjuste,
  minimoDeAjuste,
  modoDeAjuste,
  motivosAjusteDisponibles,
  pasarCantidades,
  preguntaCantidades,
  repartirLineasAjuste,
  reposicionCerrada,
  soloDeLaPrenda,
  stockEn,
  TEXTO_AJUSTE_INCIERTO,
  textoExitoAjuste,
  textoProblemaTalla,
  textoStockTalla,
  textoTotalAjuste,
  type EleccionHallazgo,
  type FaltanteConteo,
  type MotivoAjuste,
  type PrendaAjuste,
  type VarianteAjuste,
} from "@/lib/ajuste-reglas";
import { descargarCsv } from "@/lib/exportar-csv";
import type { Sububicacion } from "@/lib/sububicaciones";
import { ComboResponsable } from "@/components/ComboResponsable";
import { SelectorDeAjuste, type FilaDeAjuste } from "@/components/SelectorDeAjuste";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { useResponsable } from "@/lib/useResponsable";
import { firmar } from "@/lib/responsable-reglas";
import { useCargaInicial } from "@/lib/useCargaInicial";
import { avisoCargaInicial, cargaAbierta, esRechazoPorCargaCerrada } from "@/lib/carga-inicial-reglas";
import { sugerirNotaAjuste } from "@/lib/sugerencias-ajuste";

// Guarda con `retail.ajustar_inventario` (ADR-0240): UNA llamada, todo o nada y con la marca del intento. Por dentro usa
// las funciones de siempre (`registrar_movimiento` para cada ajuste, `cargar_stock_inicial` para lo nuevo): no existe una
// segunda vía, `stock` sigue siendo un snapshot derivado de `movimientos` (principio 4), y la guarda de negativos vive en
// `fn_aplicar_movimiento` (ADR-0023). Este modal valida en pantalla con el stock ya cargado para dar feedback instantáneo
// (principio 10) — la base queda como red real si el stock cambió mientras el modal estaba abierto.
//
// ADR-0235: una prenda que nunca tuvo un movimiento en esta tienda no se «ajusta» —la base ya no lo deja
// (`ajuste_sin_historia`)—: su primera cantidad entra como STOCK INICIAL (`cargar_stock_inicial`, una entrada), así
// Movimientos no la muestra para siempre como un sobrante. El modal lo hace solo al confirmar, y lo dice en la fila.
// «En el piso» esa carga es además una bajada, que pide Existencias (ADR-0306): sin él, lo nuevo entra al
// almacén —como en «Nuevo producto»— y la fila lo avisa, en vez de fallar al confirmar.
//
// Lo que se escribe en cada talla depende del motivo (`modoDeAjuste`, Felipe 2026-09-28): con «Conteo físico», cuántas
// hay; con los demás, cuánto se suma o se resta. Por eso el motivo va ANTES de las tallas: el número se escribe sabiendo
// qué significa. Si el motivo cambia con cantidades ya escritas, cambian de forma pero no de resultado (`pasarCantidades`).
//
// ADR-0328 (actividad 4): «Reposición» se llama «Encontré prendas», solo suma y pide la nota (dónde estaban). Y la carga
// inicial se cierra POR SEDE en su fecha: antes de esa fecha el modal la avisa junto a las prendas nuevas; después, una prenda
// que nunca estuvo en la tienda ya no entra como stock inicial sino con «Encontré prendas» (la base lo exige igual).

/**
 * Las tallas de una prenda con su stock en UNA sede, para ajustarlo: la única lectura de `stock` de «Ajustar» (ADR-0270, lista
 * LEGADO de `lib/stock-una-sola-cifra.test.ts`). La usa este modal y el stepper de la ficha del producto (`useStockFicha`, maqueta B):
 * los dos ajustan lo mismo, así que leen lo mismo. `sinLoader`: el stepper lee sin el loader de pantalla completa (ADR-0149).
 *
 * La talla ya no es una columna de texto de `variantes`: es `talla_id` → `tallas.valor` (20260917100500, ADR-0095), igual que en
 * `getCatalogo`. El resultado se pasa SIN castear a propósito: así `tsc` compara este select con `FilaAjuste` y avisa si vuelve a
 * pedir una columna que no existe (antes un `as unknown as` lo tapaba y solo fallaba en vivo). El orden por talla se hace al armar
 * las filas (S · M · L, no alfabético); el `order("codigo")` solo fija el desempate para que la lista no baraje entre un refresco y
 * otro. Es el `codigo`, no el `sku`: el sku es NULL en casi todas las variantes (ADR-0058) y no desempataba nada.
 */
export function leerVariantesParaAjuste(productoId: string, ubicacionId: string, { sinLoader = false }: { sinLoader?: boolean } = {}) {
  const consulta = createClient()
    .from("variantes")
    .select(
      `id, sku, codigo,
       talla:tallas ( valor ),
       color:colores ( nombre ),
       producto:productos ( referencia ),
       stock ( cantidad, cantidad_apartada, sububicacion_id )`
    )
    .eq("producto_id", productoId)
    .eq("stock.ubicacion_id", ubicacionId)
    .order("codigo");
  return sinLoader ? consulta.setHeader("x-espera", "no") : consulta;
}

// Sin respuesta en 20 s, se corta y se trata como respuesta incierta (igual que los pasos del panel de la talla, `FlujoTalla`).
const TOPE_ESPERA_MS = 20_000;

export function AjustarInventarioModal({
  productoId,
  prenda,
  ubicacionId,
  sububicaciones,
  puedeBajarAlPiso,
  onClose,
  alCerrarEnfocar,
}: {
  productoId: string;
  /** La prenda (modelo + color) de la fila que lo abre: el modal muestra solo ese color. Sin ella, el modelo entero
   *  (Productos). `soloDeLaPrenda`. */
  prenda?: PrendaAjuste;
  ubicacionId: string;
  sububicaciones: Sububicacion[];
  /** ¿El rol de la cuenta ve «Bajada al piso»? Lo decide la página, en el servidor (`veModulo`), como en Nuevo producto. */
  puedeBajarAlPiso: boolean;
  onClose: () => void;
  /** A dónde vuelve el teclado al cerrar (la tarjeta de Existencias, cuando se abre desde su menú «⋯»). */
  alCerrarEnfocar?: RefObject<HTMLElement | null>;
}) {
  const router = useRouter();
  // Sin Provider (Existencias: InventarioPanel.tsx, SelectorDeAjuste.tsx) `agregar` es un no-op — ver RecordatorioEtiquetas.tsx.
  const { agregar: agregarRecordatorioEtiquetas } = useRecordatorioEtiquetas();
  const sububicacionPiso = sububicaciones.find((s) => s.tipo === "piso_venta") ?? null;
  const sububicacionAlmacen = sububicaciones.find((s) => s.tipo === "almacen_tienda") ?? null;
  const separaPisoAlmacen = !!sububicacionPiso && !!sububicacionAlmacen;
  // La prenda llega como objeto nuevo en cada render de quien abre el modal: la carga depende de sus valores, no del objeto
  // (si no, se volvería a pedir a la base en cada render).
  const hayPrenda = prenda !== undefined;
  const colorPrenda = prenda?.color ?? null;

  const [cargando, setCargando] = useState(true);
  const [referencia, setReferencia] = useState("");
  const [variantes, setVariantes] = useState<VarianteAjuste[]>([]);
  // Lo escrito en cada talla, tal cual (texto): `lineasDeAjuste` decide qué es un ajuste.
  const [cantidades, setCantidades] = useState<Record<string, string>>({});
  // Arranca en almacén, igual que Nuevo producto (Felipe 2026-09-28): el piso se elige a propósito. De paso ofrece
  // «Encontré prendas», que en el piso de una tienda que separa piso y almacén está cerrada.
  const [ubicado, setUbicado] = useState<"piso" | "almacen">("almacen");
  const [motivo, setMotivo] = useState<MotivoAjuste | "">("");
  const [nota, setNota] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // La prenda que faltó en un conteo cerrado y todavía no se recupera (ADR-0291): por prenda, el conteo más reciente. Si sumas
  // una de ellas, el modal pregunta «¿es la que faltó?»; con «sí», el ajuste queda enlazado a ese conteo.
  const [faltantes, setFaltantes] = useState<ReadonlyMap<string, FaltanteConteo>>(new Map());
  const [elecciones, setElecciones] = useState<Record<string, EleccionHallazgo | undefined>>({});
  // La carga inicial de esta sede (lectura opcional: sin ella, el modal se porta como antes y la base decide).
  const { carga, releer: releerCarga } = useCargaInicial(ubicacionId);
  const abiertaCarga = cargaAbierta(carga);
  // Un ajuste de stock guarda en la tienda: pide Responsable (ADR-0161).
  const responsable = useResponsable();
  // La marca de este intento (ADR-0240): la base la anota con el ajuste, y el mismo intento enviado otra vez (un reintento
  // tras un corte) devuelve lo ya guardado sin ajustar de nuevo. Una por modal abierto: un éxito lo cierra, y un rechazo
  // de la base deja la marca libre (la transacción se deshizo).
  const token = useRef<string>(crypto.randomUUID());
  // Tras una respuesta incierta solo se puede reenviar LO MISMO o cerrar: cambiar una cifra sería otro ajuste y podría
  // sumarse al que quizá ya se guardó. Los campos quedan fijos.
  const [congelado, setCongelado] = useState(false);
  // Candado contra el doble clic en el mismo instante: `enviando` apaga el botón recién en el render siguiente.
  const enVuelo = useRef(false);

  useEffect(() => {
    let vigente = true;
    leerVariantesParaAjuste(productoId, ubicacionId)
      .then(({ data, error: errCarga }) => {
        if (!vigente) return;
        if (errCarga) {
          avisar.error(traducirError(errCarga, "cargar las variantes del producto"));
          setCargando(false);
          return;
        }
        const filas = data ?? [];
        setReferencia(filas[0]?.producto?.referencia ?? "");
        const deLaPrenda = soloDeLaPrenda(filas, hayPrenda ? { color: colorPrenda } : undefined);
        setVariantes(armarVariantesAjuste(deLaPrenda, sububicacionPiso?.id, sububicacionAlmacen?.id));
        setCargando(false);
      });
    return () => {
      vigente = false;
    };
  }, [productoId, hayPrenda, colorPrenda, ubicacionId, sububicacionPiso?.id, sububicacionAlmacen?.id]);

  // Lo que faltó en conteos cerrados de esta tienda, de estas prendas. Es una lectura opcional: si la función no existe todavía en
  // la base (la web salió antes que el SQL) o falla, no se pregunta nada y el ajuste sigue como siempre.
  useEffect(() => {
    if (variantes.length === 0) return;
    let vigente = true;
    createClient()
      .rpc("fn_faltantes_de_conteo", { p_ubicacion_id: ubicacionId, p_variante_ids: variantes.map((v) => v.varianteId) })
      .then(({ data, error: errFaltantes }) => {
        if (vigente) setFaltantes(errFaltantes ? new Map() : faltantesDesdeJson(data));
      });
    return () => {
      vigente = false;
    };
  }, [variantes, ubicacionId]);

  const lugar = lugarDeAjuste(ubicado, separaPisoAlmacen);

  const modo = modoDeAjuste(motivo);

  // Tallas con un ajuste, y las que dejarían el stock negativo o por debajo de lo apartado — los mismos dos candados de
  // `fn_aplicar_movimiento`, adelantados acá para no obligar a un viaje a la base a enterarse.
  const lineas = lineasDeAjuste(variantes, cantidades, lugar, modo);
  const lineaDe = new Map(lineas.map((l) => [l.variante.varianteId, l]));

  // Lo que no se puede ajustar con lo escrito, por talla (stock negativo o por debajo de lo apartado): se dice en la fila de la
  // talla, sin códigos, y mientras haya uno no se puede confirmar.
  const problemaDe: Record<string, string> = {};
  for (const l of lineas) {
    const texto = textoProblemaTalla(l, modo) ?? textoProblemaMotivo(l, motivo, abiertaCarga, reposicionCerrada(ubicado, separaPisoAlmacen));
    if (texto) problemaDe[l.variante.varianteId] = texto;
  }
  const hayProblemas = Object.keys(problemaDe).length > 0;
  // Lo que se ajusta (prendas con historia en esta tienda) y lo que entra como stock inicial (prendas nuevas en ella).
  const { ajustes, cargaInicial } = repartirLineasAjuste(lineas, abiertaCarga);
  // «Encontré prendas» dice dónde estaban (la base: `encontre_prendas_sin_nota`). Solo cuenta si hay ajustes: lo nuevo en la tienda
  // con la carga abierta entra como stock inicial, sin motivo ni nota.
  const notaNecesaria = ajustes.length > 0 && motivoPideNota(motivo);
  const notaLista = ajustes.length === 0 || notaSuficiente(motivo, nota);
  const ayudaNota = sugerirNotaAjuste(motivo);
  // El aviso de la carga inicial solo donde importa: si alguna talla todavía no estuvo nunca en esta tienda.
  const avisoCarga = variantes.some((v) => v.sinHistoria) ? avisoCargaInicial(carga) : null;
  // Las sumas de prendas que faltaron en un conteo: a cada una se le pregunta «¿es la que faltó?».
  const candidatas = candidatasDeHallazgo(ajustes, faltantes);
  const candidataDe = new Map(candidatas.map((c) => [c.linea.variante.varianteId, c]));
  const hallazgos = resolverHallazgos(candidatas, elecciones);
  const nombreDe = (v: VarianteAjuste) => [v.talla, v.color].filter(Boolean).join(" / ") || "Única";
  const varianteDe = new Map(variantes.map((v) => [v.varianteId, v]));

  // La guía de foco (ADR-0284) sale de lo que ya bloquea el botón. El motivo va primero porque decide qué significa el número de
  // cada talla; no hace falta si lo único que se escribe son prendas nuevas en la tienda (entran como stock inicial, sin motivo).
  const hayPregunta = hallazgos.sinResponder.length > 0 || hallazgos.conExceso.length > 0;
  const guia = useGuiaCampos([
    { id: "motivo", nombre: "Motivo", requerido: ajustes.length > 0 || lineas.length === 0, hecho: motivo !== "", pendiente: "Elige por qué ajustas." },
    {
      id: "cantidades",
      nombre: "Cantidades",
      requerido: true,
      hecho: lineas.length > 0 && !hayProblemas && !hayPregunta,
      pendiente:
        lineas.length === 0
          ? "Escribe qué cambia en alguna talla."
          : hayProblemas
            ? Object.values(problemaDe)[0]
            : "Responde si es la prenda que faltó en el conteo.",
    },
    {
      id: "nota",
      nombre: notaNecesaria ? "Dónde estaban" : "Observación",
      requerido: notaNecesaria,
      hecho: notaNecesaria ? notaLista : nota.trim() !== "",
      pendiente: `Cuenta dónde estaban o por qué aparecieron (${NOTA_MINIMA_ENCONTRE} letras o más).`,
    },
    { id: "responsable", nombre: "Quién lo hace", requerido: true, hecho: responsable.listo, pendiente: "Elige quién hace el ajuste." },
  ]);

  // Las filas del selector: la talla en voz de tienda (cuánto hay, cómo queda, lo apartado), nunca el código de la etiqueta.
  const filas: FilaDeAjuste[] = variantes.map((v) => ({
    varianteId: v.varianteId,
    talla: v.talla ?? "Única",
    principal: textoStockTalla(v, lugar, !hayPrenda),
    detalle: detalleDeTalla({
      variante: v,
      linea: lineaDe.get(v.varianteId),
      texto: cantidades[v.varianteId] ?? "",
      modo,
      lugar,
      ubicado,
      separaPisoAlmacen,
      puedeBajarAlPiso,
      cargaAbierta: abiertaCarga,
    }),
    actual: stockEn(v, lugar),
    minimo: minimoDeAjuste(v, lugar, modo, motivo),
  }));

  // «Encontré prendas» (antes «Reposición») no toca el piso de una tienda que separa piso y almacén (ADR-0208, 20260926000400).
  const motivos = motivosAjusteDisponibles(ubicado, separaPisoAlmacen);
  const cerrada = reposicionCerrada(ubicado, separaPisoAlmacen);

  function cambiarUbicado(siguiente: "piso" | "almacen") {
    setUbicado(siguiente);
    // Si «Encontré prendas» estaba elegida y ya no se ofrece, no se queda escondida en el formulario.
    if (reposicionCerrada(siguiente, separaPisoAlmacen) && motivo === "reposicion") setMotivo("");
  }

  function cambiarMotivo(siguiente: MotivoAjuste | "") {
    if (congelado) return;
    const a = modoDeAjuste(siguiente);
    if (a !== modo) setCantidades(pasarCantidades(variantes, cantidades, lugar, modo, a));
    setMotivo(siguiente);
  }

  // Reporte de lo tipeado en el formulario, no de lo ya confirmado — sirve tanto
  // de respaldo antes de enviar como para revisar después de un envío exitoso
  // (el modal se cierra solo al confirmar, no queda pantalla de "ya se aplicó").
  function descargarReporte() {
    const motivoTexto = MOTIVOS_AJUSTE.find((m) => m.valor === motivo)?.texto ?? "";
    const fecha = new Date();
    descargarCsv(
      `ajuste-inventario_${referencia || "producto"}_${fecha.toISOString().slice(0, 10)}.csv`.replace(/\s+/g, "-"),
      ["Código", "Talla", "Color", "Stock actual", "Ajuste", "Stock resultante", "Motivo", "Observación"],
      lineas.map((l) => [
        l.variante.sku,
        l.variante.talla ?? "—",
        l.variante.color ?? "—",
        l.actual,
        l.delta > 0 ? `+${l.delta}` : l.delta,
        l.resultado,
        motivoTexto,
        nota.trim() || "—",
      ])
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (enVuelo.current) return;
    if (!responsable.listo) {
      if (responsable.motivo) setError(responsable.motivo);
      return;
    }
    // El motivo es del ajuste: las prendas nuevas en la tienda entran como stock inicial y no lo necesitan.
    if (ajustes.length > 0 && !motivo) {
      setError("Elige un motivo para el ajuste.");
      return;
    }
    if (!notaLista) {
      setError(`Con «Encontré prendas» cuenta dónde estaban o por qué aparecieron (${NOTA_MINIMA_ENCONTRE} letras o más).`);
      return;
    }
    if (lineas.length === 0) {
      setError("Ingresa al menos un ajuste distinto de cero.");
      return;
    }
    // Sumar una prenda que faltó en un conteo: se responde si es esa (el ajuste queda enlazado al conteo) o no. No se adivina.
    if (!congelado && hallazgos.sinResponder.length > 0) {
      const c = hallazgos.sinResponder[0];
      setError(textoHallazgoSinResponder(nombreDe(c.linea.variante), c.faltante));
      return;
    }
    if (!congelado && hallazgos.conExceso.length > 0) {
      const c = hallazgos.conExceso[0];
      setError(textoHallazgoConExceso(nombreDe(c.linea.variante), c.faltante));
      return;
    }
    // Reenviar lo congelado no es un ajuste nuevo sino la pregunta «¿se guardó?»: el stock de la pantalla puede ya
    // incluir ese mismo envío, así que responde la base (con la misma marca devuelve lo guardado).
    if (!congelado && hayProblemas) {
      setError(Object.values(problemaDe)[0]);
      return;
    }

    enVuelo.current = true;
    setEnviando(true);
    setError(null);
    // ADR-0240: TODO el ajuste en una llamada (las prendas nuevas como stock inicial y los ajustes), todo o nada, con la
    // marca de este intento. Antes iba línea por línea: un corte a mitad dejaba la mitad guardada, y reintentar la duplicaba.
    // Sin tope, una conexión colgada dejaría el modal bloqueado: a los 20 s se corta y se trata como respuesta incierta.
    const control = new AbortController();
    const tope = window.setTimeout(() => control.abort(), TOPE_ESPERA_MS);
    const { data, error: errorRpc } = await firmar(
      createClient()
        .rpc(
          "ajustar_inventario",
          argumentosDeAjuste({
            ubicacionId,
            sububicacionId: separaPisoAlmacen ? (ubicado === "piso" ? sububicacionPiso!.id : sububicacionAlmacen!.id) : null,
            ajustes: ajustes.map((l) => ({ ...l, conteoItemId: hallazgos.enlaces.get(l.variante.varianteId) ?? null })),
            cargaInicial,
            motivo,
            alPiso: cargaInicialAlPiso(ubicado, separaPisoAlmacen, puedeBajarAlPiso),
            nota,
            token: token.current,
          })
        )
        .abortSignal(control.signal),
      responsable.firma()
    );
    window.clearTimeout(tope);
    setEnviando(false);
    responsable.despues(errorRpc);
    if (errorRpc) {
      enVuelo.current = false;
      if (esRespuestaIncierta(errorRpc)) {
        // Pudo haberse guardado: desde aquí solo se reenvía LO MISMO (los campos quedan fijos), o se cierra.
        setCongelado(true);
        setError(TEXTO_AJUSTE_INCIERTO);
      } else {
        // La base dijo que no: la transacción se deshizo entera y la marca quedó libre. Se puede corregir y reintentar.
        setError(traducirError(errorRpc, "ajustar el inventario"));
        // La carga de la sede se cerró mientras el modal estaba abierto (pasada la medianoche del último día): se vuelve a leer, y
        // la prenda nueva deja de ir como stock inicial y pide «Encontré prendas» (ADR-0328).
        if (esRechazoPorCargaCerrada(errorRpc)) releerCarga();
      }
      // Con la red caída no se refresca: un refresh sin red se vuelve navegación completa y borra el mensaje honesto.
      if (!esFalloDeRed(errorRpc)) router.refresh();
      return;
    }
    const r = leerResultadoAjuste(data) ?? { ajustes: ajustes.length, cargas: cargaInicial.length, enlazados: hallazgos.enlaces.size, ya_registrado: false };
    sonarConfirmacion();
    avisar.exito(textoExitoAjuste(r), { detalle: referencia });
    // Subir una cantidad es una prenda más sin etiquetar; se junta en el recordatorio del módulo (no se avisa aquí
    // mismo, para no interrumpir con un aviso por cada ajuste — ver RecordatorioEtiquetas.tsx).
    const subieron = lineas.filter((l) => l.delta > 0);
    if (subieron.length > 0) {
      agregarRecordatorioEtiquetas(subieron.map((l) => ({ varianteId: l.variante.varianteId, color: l.variante.color, talla: l.variante.talla })));
    }
    router.refresh();
    onClose();
  }

  return (
    <Modal
      titulo="Ajustar inventario"
      subtitulo="Corrige lo que hay de cada talla"
      onClose={onClose}
      alCerrarEnfocar={alCerrarEnfocar}
      ancho="max-w-md"
      bloqueado={enviando}
      lateral={prenda && prenda.fotoUrl !== undefined ? <FotoDePrenda fotoUrl={prenda.fotoUrl} colorHex={prenda.colorHex} {...categoriaDe(prenda)} /> : undefined}
    >
      {(cerrar) => (
        // `noValidate`: sin él la burbuja del navegador frena el envío y no salen los textos propios.
        <form onSubmit={onSubmit} className="mt-2 space-y-4" noValidate>
          {cargando ? (
            <p className="text-sm text-tinta/65">Cargando las tallas…</p>
          ) : variantes.length === 0 ? (
            <p className="text-sm text-tinta/65">
              {hayPrenda
                ? "No encontramos las tallas de esta prenda. Cierra y vuelve a abrirla desde la lista."
                : "Este producto no tiene variantes."}
            </p>
          ) : (
            <>
              {/* La prenda, como en «Reponer» y «Subir a almacén»: un puntito de su color, el nombre y el color. */}
              <p className="flex items-center gap-2 text-[15px] text-tinta">
                {prenda?.colorHex && <span aria-hidden className="h-4 w-4 shrink-0 rounded-full border border-tinta/15" style={{ background: prenda.colorHex }} />}
                <span className="font-semibold">{referencia}</span>
                {colorPrenda && <span className="text-taupe">{colorPrenda}</span>}
              </p>

              {separaPisoAlmacen && (
                <Segmentado
                  etiqueta="¿Dónde ajustas?"
                  valor={ubicado}
                  onValor={(v) => !congelado && cambiarUbicado(v)}
                  opciones={[
                    { valor: "almacen", texto: "Almacén de tienda" },
                    { valor: "piso", texto: "Piso de venta" },
                  ]}
                />
              )}

              {/* Antes de las tallas: el motivo decide qué se escribe en ellas (contado o suma/resta). */}
              <CampoGuiado id="motivo" guia={guia}>
                <CampoSelect etiqueta={guia.etiqueta("motivo", "¿Por qué ajustas?")} valor={motivo} onValor={cambiarMotivo} opciones={motivos} marcador="Elige un motivo" />
                {motivo === "reposicion" && <p className="mt-1.5 text-xs text-taupe">{AYUDA_ENCONTRE_PRENDAS}</p>}
              </CampoGuiado>

              {/* El total del lugar va junto a la pregunta, con lo apartado aparte: lo libre es la cifra de la fila de Existencias. */}
              <CampoGuiado id="cantidades" guia={guia} titulo={preguntaCantidades(modo, lugar)} ayuda={textoTotalAjuste(variantes, lugar)} retiene="fila">
                <SelectorDeAjuste
                  filas={filas}
                  textos={cantidades}
                  modo={modo}
                  etiquetaControl={etiquetaCantidad(modo, lugar)}
                  problemas={problemaDe}
                  bloqueado={congelado || enviando}
                  onTexto={(varianteId, texto) => setCantidades((previas) => ({ ...previas, [varianteId]: texto }))}
                  extra={(varianteId) => {
                    // La prenda que faltó en un conteo cerrado y hoy se suma: se pregunta si es esa (el ajuste queda enlazado a ese conteo).
                    const candidata = candidataDe.get(varianteId);
                    const variante = varianteDe.get(varianteId);
                    if (!candidata || !variante) return null;
                    const eleccion = elecciones[varianteId];
                    return (
                      <div className="mt-2 space-y-1.5 rounded-lg bg-hueso px-3 py-2.5" role="group" aria-label={`Faltante de conteo · ${nombreDe(variante)}`}>
                        <p className="text-xs text-tinta">
                          {textoFaltanteConteo(candidata.faltante)} <b className="font-medium">¿Es la que se encontró?</b>
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {(
                            [
                              { valor: "si", texto: `Sí, es la del Conteo ${candidata.faltante.conteoNumero}` },
                              { valor: "no", texto: "No, es otra cosa" },
                            ] as const
                          ).map((o) => (
                            <button
                              key={o.valor}
                              type="button"
                              aria-pressed={eleccion === o.valor}
                              disabled={congelado}
                              onClick={() => setElecciones((previas) => ({ ...previas, [varianteId]: o.valor }))}
                              className={`btn-cayla h-8 text-xs ${eleccion === o.valor ? "btn-primario" : "btn-secundario"}`}
                            >
                              {o.texto}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  }}
                />
              </CampoGuiado>

              {/* Solo en el piso de una tienda que separa piso y almacén (ahí «Encontré prendas» está cerrada). La hoja va anclada arriba, así que
                  que aparezca o desaparezca no mueve las pestañas «Almacén / Piso» bajo el mouse (ADR-0185). */}
              {cerrada && (
                <p className="nota-cayla" role="status">
                  {NOTA_REPOSICION_CERRADA}
                </p>
              )}

              {/* ADR-0328: hasta cuándo esta sede carga lo que ya tenía (o que ya se cerró), junto a las prendas nuevas en ella. */}
              {avisoCarga && (
                <p className="nota-cayla" role="status">
                  {avisoCarga}
                </p>
              )}

              <CampoGuiado id="nota" guia={guia}>
                <CampoTexto
                  etiqueta={guia.etiqueta("nota", ayudaNota.etiqueta)}
                  value={nota}
                  disabled={congelado}
                  onChange={(e) => setNota(e.target.value)}
                  maxLength={200}
                  placeholder={ayudaNota.placeholder}
                />
              </CampoGuiado>
            </>
          )}

          {lineas.length > 0 && (
            <button type="button" onClick={descargarReporte} className="label-cayla text-[11px] text-tinta/55 hover:text-rojo">
              Descargar reporte de este ajuste
            </button>
          )}

          <CampoGuiado id="responsable" guia={guia}>
            <ComboResponsable control={responsable} deshabilitado={enviando} />
          </CampoGuiado>

          {error && (
            <p role="alert" className="text-sm text-rojo-profundo">
              {error}
            </p>
          )}

          {!cargando && variantes.length > 0 && <PieGuia guia={guia} listo="Todo listo para ajustar." />}

          {/* `pie-hoja-fijo`: Cancelar y Confirmar no se van bajo el pliegue en un laptop de 768 px de alto (globals.css). */}
          <div className="pie-hoja-fijo flex gap-2 pt-1">
            <Boton type="button" onClick={cerrar} disabled={enviando} className="flex-1">
              Cancelar
            </Boton>
            <Boton
              type="submit"
              peso="primario"
              cargando={enviando}
              disabled={
                cargando ||
                variantes.length === 0 ||
                !responsable.listo ||
                lineas.length === 0 ||
                (ajustes.length > 0 && !motivo) ||
                !notaLista ||
                hayProblemas ||
                (!congelado && hayPregunta)
              }
              title={responsable.motivo ?? guia.frase ?? undefined}
              className={`flex-1 ${guia.claseConfirmar}`}
            >
              Confirmar
            </Boton>
          </div>
        </form>
      )}
    </Modal>
  );
}
