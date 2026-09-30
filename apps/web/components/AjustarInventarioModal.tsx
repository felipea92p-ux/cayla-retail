"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { esFalloDeRed, esRespuestaIncierta, traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { Modal } from "@/components/ui/Modal";
import { Boton, CampoSelect, CampoTexto, Segmentado } from "@/components/ui/campos";
import {
  MOTIVOS_AJUSTE,
  NOTA_REPOSICION_CERRADA,
  apartadoEn,
  argumentosDeAjuste,
  armarVariantesAjuste,
  candidatasDeHallazgo,
  faltantesDesdeJson,
  resolverHallazgos,
  textoFaltanteConteo,
  textoHallazgoConExceso,
  textoHallazgoSinResponder,
  cargaInicialAlPiso,
  leerResultadoAjuste,
  etiquetaCantidad,
  lineasDeAjuste,
  lugarDeAjuste,
  modoDeAjuste,
  motivosAjusteDisponibles,
  pasarCantidades,
  repartirLineasAjuste,
  reposicionCerrada,
  soloDeLaPrenda,
  stockEn,
  TEXTO_AJUSTE_INCIERTO,
  textoApartadoTalla,
  textoBajoApartado,
  textoCambioTalla,
  textoExitoAjuste,
  textoNegativas,
  textoPrendaNueva,
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
import { useResponsable } from "@/lib/useResponsable";
import { firmar } from "@/lib/responsable-reglas";

// Guarda con `retail.ajustar_inventario` (ADR-0240): UNA llamada, todo o nada y con la marca del intento. Por dentro usa
// las funciones de siempre (`registrar_movimiento` para cada ajuste, `cargar_stock_inicial` para lo nuevo): no existe una
// segunda vía, `stock` sigue siendo un snapshot derivado de `movimientos` (principio 4), y la guarda de negativos vive en
// `fn_aplicar_movimiento` (ADR-0023). Este modal valida en pantalla con el stock ya cargado para dar feedback instantáneo
// (principio 10) — la base queda como red real si el stock cambió mientras el modal estaba abierto.
//
// ADR-0235: una prenda que nunca tuvo un movimiento en esta tienda no se «ajusta» —la base ya no lo deja
// (`ajuste_sin_historia`)—: su primera cantidad entra como STOCK INICIAL (`cargar_stock_inicial`, una entrada), así
// Movimientos no la muestra para siempre como un sobrante. El modal lo hace solo al confirmar, y lo dice en la fila.
// «En el piso» esa carga es además una bajada, que pide el módulo «Bajada al piso» (ADR-0212): sin él, lo nuevo entra al
// almacén —como en «Nuevo producto»— y la fila lo avisa, en vez de fallar al confirmar.
//
// Lo que se escribe en cada talla depende del motivo (`modoDeAjuste`, Felipe 2026-09-28): con «Conteo físico», cuántas
// hay; con los demás, cuánto se suma o se resta. Por eso el motivo va ANTES de las tallas: el número se escribe sabiendo
// qué significa. Si el motivo cambia con cantidades ya escritas, cambian de forma pero no de resultado (`pasarCantidades`).

// Sin respuesta en 20 s, se corta y se trata como respuesta incierta (igual que «Reponer», `ReponerPisoModal`).
const TOPE_ESPERA_MS = 20_000;

export function AjustarInventarioModal({
  productoId,
  prenda,
  ubicacionId,
  sububicaciones,
  puedeBajarAlPiso,
  onClose,
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
}) {
  const router = useRouter();
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
  // «Reposición», que en el piso de una tienda que separa piso y almacén está cerrada.
  const [ubicado, setUbicado] = useState<"piso" | "almacen">("almacen");
  const [motivo, setMotivo] = useState<MotivoAjuste | "">("");
  const [nota, setNota] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // La prenda que faltó en un conteo cerrado y todavía no se recupera (ADR-0291): por prenda, el conteo más reciente. Si sumas
  // una de ellas, el modal pregunta «¿es la que faltó?»; con «sí», el ajuste queda enlazado a ese conteo.
  const [faltantes, setFaltantes] = useState<ReadonlyMap<string, FaltanteConteo>>(new Map());
  const [elecciones, setElecciones] = useState<Record<string, EleccionHallazgo | undefined>>({});
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
    // La talla ya no es una columna de texto de `variantes`: es `talla_id` → `tallas.valor`
    // (20260917100500, ADR-0095), igual que en `getCatalogo`. El resultado se pasa SIN castear
    // a propósito: así `tsc` compara este select con `FilaAjuste` y avisa si vuelve a pedir
    // una columna que no existe (antes un `as unknown as` lo tapaba y solo fallaba en vivo).
    // El orden por talla se hace al armar las filas (S · M · L, no alfabético); el `order("codigo")`
    // solo fija el desempate para que la lista no baraje entre un refresco y otro. Es el `codigo`, no
    // el `sku`: el sku es NULL en casi todas las variantes (ADR-0058) y no desempataba nada.
    createClient()
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
      .order("codigo")
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

  const negativas = lineas.filter((l) => l.resultado < 0);
  const bajoApartado = lineas.filter((l) => l.resultado >= 0 && l.resultado < l.apartado);
  // Lo que se ajusta (prendas con historia en esta tienda) y lo que entra como stock inicial (prendas nuevas en ella).
  const { ajustes, cargaInicial } = repartirLineasAjuste(lineas);
  // Las sumas de prendas que faltaron en un conteo: a cada una se le pregunta «¿es la que faltó?».
  const candidatas = candidatasDeHallazgo(ajustes, faltantes);
  const candidataDe = new Map(candidatas.map((c) => [c.linea.variante.varianteId, c]));
  const hallazgos = resolverHallazgos(candidatas, elecciones);
  const nombreDe = (v: VarianteAjuste) => [v.talla, v.color].filter(Boolean).join(" / ") || "Única";

  // «Reposición» no toca el piso de una tienda que separa piso y almacén (ADR-0208, 20260926000400): no se ofrece ahí.
  const motivos = motivosAjusteDisponibles(ubicado, separaPisoAlmacen);
  const cerrada = reposicionCerrada(ubicado, separaPisoAlmacen);

  function cambiarUbicado(siguiente: "piso" | "almacen") {
    setUbicado(siguiente);
    // Si «Reposición» estaba elegida y ya no se ofrece, no se queda escondida en el formulario.
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
    if (!congelado && negativas.length > 0) {
      setError(textoNegativas(negativas, modo));
      return;
    }
    if (!congelado && bajoApartado.length > 0) {
      setError(textoBajoApartado(bajoApartado[0], modo));
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
      }
      // Con la red caída no se refresca: un refresh sin red se vuelve navegación completa y borra el mensaje honesto.
      if (!esFalloDeRed(errorRpc)) router.refresh();
      return;
    }
    const r = leerResultadoAjuste(data) ?? { ajustes: ajustes.length, cargas: cargaInicial.length, enlazados: hallazgos.enlaces.size, ya_registrado: false };
    avisar.exito(textoExitoAjuste(r), { detalle: referencia });
    router.refresh();
    onClose();
  }

  return (
    <Modal
      titulo="Ajustar inventario"
      // El color va en el título: es lo que distingue esta prenda de las otras del mismo modelo en la lista de Existencias.
      subtitulo={[referencia, colorPrenda].filter(Boolean).join(" · ")}
      onClose={onClose}
      ancho="max-w-md"
      bloqueado={enviando}
    >
      {(cerrar) => (
        <form onSubmit={onSubmit} className="mt-2 space-y-4">
          {cargando ? (
            <p className="text-sm text-tinta/65">Cargando variantes…</p>
          ) : variantes.length === 0 ? (
            <p className="text-sm text-tinta/65">
              {hayPrenda
                ? "No encontramos las tallas de esta prenda. Cierra y vuelve a abrirla desde la lista."
                : "Este producto no tiene variantes."}
            </p>
          ) : (
            <>
              {separaPisoAlmacen && (
                <Segmentado
                  etiqueta="Dónde se ajusta"
                  valor={ubicado}
                  onValor={(v) => !congelado && cambiarUbicado(v)}
                  opciones={[
                    { valor: "almacen", texto: "Almacén de tienda" },
                    { valor: "piso", texto: "Piso de venta" },
                  ]}
                />
              )}

              {/* Antes de las tallas: el motivo decide qué se escribe en ellas (contado o suma/resta). */}
              <CampoSelect etiqueta="Motivo" valor={motivo} onValor={cambiarMotivo} opciones={motivos} marcador="Elegir motivo" />

              <div className="space-y-2">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  {/* El total del lugar, con lo apartado aparte: lo libre es la cifra de la fila de Existencias. */}
                  <p className="text-xs tabular-nums text-tinta/65" aria-live="polite">
                    {textoTotalAjuste(variantes, lugar)}
                  </p>
                  {/* Qué se escribe en cada talla. Los dos rótulos se apilan en la misma celda y mide siempre lo del más
                      largo: cambiar el motivo no mueve las tallas (ADR-0185). */}
                  <p className="label-cayla ml-auto grid text-right text-[11px] text-tinta/55">
                    {(["diferencia", "contado"] as const).map((m) => (
                      <span key={m} className={`[grid-area:1/1] ${m === modo ? "" : "invisible"}`} aria-hidden={m !== modo || undefined}>
                        {etiquetaCantidad(m, lugar)}
                      </span>
                    ))}
                  </p>
                </div>
                {variantes.map((v) => {
                  const actual = stockEn(v, lugar);
                  const linea = lineaDe.get(v.varianteId);
                  const nombre = nombreDe(v);
                  const candidata = candidataDe.get(v.varianteId);
                  const eleccion = elecciones[v.varianteId];
                  return (
                    <div key={v.varianteId} className="border-b border-tinta/10 pb-2">
                      <div className="flex items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-tinta">{nombre}</p>
                        <p className="font-mono text-[11px] text-tinta/55">
                          {v.sku} · stock {actual}
                          {textoCambioTalla(linea, modo)}
                          {textoApartadoTalla(apartadoEn(v, lugar), modo)}
                        </p>
                        {v.sinHistoria && <p className="text-[11px] text-taupe">{textoPrendaNueva(ubicado, separaPisoAlmacen, puedeBajarAlPiso)}</p>}
                      </div>
                      <input
                        type="number"
                        inputMode="numeric"
                        step={1}
                        // Al contar, vacío es «no la conté» (no cambia): el marcador no puede decir 0.
                        min={modo === "contado" ? 0 : undefined}
                        placeholder={modo === "contado" ? "—" : "0"}
                        aria-label={`${etiquetaCantidad(modo, lugar)} · ${nombre}`}
                        value={cantidades[v.varianteId] ?? ""}
                        disabled={congelado}
                        onChange={(e) => setCantidades((prev) => ({ ...prev, [v.varianteId]: e.target.value }))}
                        className="w-20 border-b border-tinta/20 bg-transparent px-1 py-1.5 text-right text-sm text-tinta outline-none focus:border-rojo"
                      />
                      </div>
                      {/* La prenda que faltó en un conteo cerrado y hoy se suma: se pregunta si es esa (el ajuste queda enlazado a ese conteo). */}
                      {candidata && (
                        <div className="mt-2 space-y-1.5 rounded-lg bg-hueso px-3 py-2.5" role="group" aria-label={`Faltante de conteo · ${nombre}`}>
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
                                onClick={() => setElecciones((prev) => ({ ...prev, [v.varianteId]: o.valor }))}
                                className={`btn-cayla h-8 text-xs ${eleccion === o.valor ? "btn-primario" : "btn-secundario"}`}
                              >
                                {o.texto}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* SIEMPRE ocupando su lugar en una tienda que separa piso y almacén: invisible en Almacén, a la vista en Piso.
                  Así cambiar Piso/Almacén no mueve el botón que está bajo el mouse (ADR-0185). */}
              {separaPisoAlmacen && (
                <p className={`nota-cayla ${cerrada ? "" : "invisible"}`} role="status" aria-hidden={!cerrada || undefined}>
                  {NOTA_REPOSICION_CERRADA}
                </p>
              )}

              <CampoTexto
                etiqueta="Observación (opcional)"
                value={nota}
                disabled={congelado}
                onChange={(e) => setNota(e.target.value)}
                maxLength={200}
                placeholder="Detalle libre del ajuste"
              />
            </>
          )}

          <div className="min-h-[1rem] text-xs text-rojo">{error}</div>

          {lineas.length > 0 && (
            <button
              type="button"
              onClick={descargarReporte}
              className="label-cayla -mt-2 text-[11px] text-tinta/55 hover:text-rojo"
            >
              Descargar reporte de este ajuste
            </button>
          )}

          <ComboResponsable control={responsable} deshabilitado={enviando} />

          {/* `pie-hoja-fijo`: Cancelar y Confirmar no se van bajo el pliegue en un laptop de 768 px de alto (globals.css). */}
          <div className="pie-hoja-fijo flex gap-2 pt-1">
            <Boton type="button" onClick={cerrar} className="flex-1">
              Cancelar
            </Boton>
            <Boton
              type="submit"
              peso="primario"
              cargando={enviando}
              disabled={cargando || variantes.length === 0 || !responsable.listo}
              title={responsable.motivo ?? undefined}
              className="flex-1"
            >
              Confirmar
            </Boton>
          </div>
        </form>
      )}
    </Modal>
  );
}
