"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Info, Minus, Plus, ScanLine } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { Chip } from "@/components/ui/Chip";
import { Modal } from "@/components/ui/Modal";
import { ProductoVarianteCelda } from "@/components/ui/PrendaCelda";
import { TrasladoRecorrido } from "@/components/TrasladoRecorrido";
import { resolverCodigoV2 } from "@/lib/buscar-prenda-v2";
import {
  ajustarCantidad,
  leerRecepcion,
  notaCierreValida,
  recorridoTraslado,
  situacionTraslado,
  type Borradores,
} from "@/lib/traslados-reglas";
import type { TrasladoDetalle } from "@/lib/traslados";
import { ComboResponsable } from "@/components/ComboResponsable";
import { useResponsable } from "@/lib/useResponsable";
import { firmar } from "@/lib/responsable-reglas";

type VarianteBusqueda = { varianteId: string; sku: string; referencia: string; talla: string | null; color: string | null; codigosBarras: string[] };

// Traslado en dos fases (20260916150000): quien confirma anota lo que
// REALMENTE llegó, línea por línea — puede diferir de lo enviado en
// cantidad, o ser una prenda que nunca se envió (sustitución). Si todo
// coincide exacto, confirmar_traslado cierra solo; si no, queda pendiente de
// que un líder de destino lo revise (cerrar_traslado_con_diferencia) —
// mismo patrón que cerrar_conteo.
//
// Rediseño 2026-09-22 (ADR-0173), sobre la demo que aprobó Felipe:
//  · Arriba, el recorrido en cuatro pasos y tres cifras (enviado, recibido, diferencia).
//  · Se CUENTA, no se asume: las casillas empiezan vacías (antes venían llenas con lo enviado) y cada
//    línea tiene «−», «+» y «Coincide». Lo contado queda como borrador en la pantalla; recién al
//    confirmar (o cerrar, o guardar el recuento) se manda cada línea cambiada a
//    `registrar_recepcion_traslado` y después la RPC final. Antes cada casilla guardaba al salir de ella
//    y el botón seguía apagado hasta haber pasado por TODAS, aunque ya estuvieran llenas.
//  · Un solo campo para escanear: si la prenda está en el envío suma 1 a su línea; si no, se agrega como
//    prenda de más (lo que antes era una tarjeta aparte).
//  · Confirmar pasa por el modal del sistema (ADR-0136) con el resumen; cerrar con diferencia exige decir
//    qué pasó (`notaCierreValida`).
// Ninguna regla cambia: quién confirma, cuándo entra el stock y quién cierra siguen en las RPC.
export function TrasladoDetallePanel({
  traslado: t,
  esDestino,
  ahoraIso,
  puedeCerrarDiferencia,
  catalogo,
}: {
  traslado: TrasladoDetalle;
  esDestino: boolean;
  /** El «ahora» fijado por el servidor (mismo criterio que la lista: el HTML del servidor y el del navegador no difieren). */
  ahoraIso: string;
  puedeCerrarDiferencia: boolean;
  catalogo: VarianteBusqueda[];
}) {
  const router = useRouter();
  const [borradores, setBorradores] = useState<Borradores>({});
  const [escaneo, setEscaneo] = useState("");
  const [trabajando, setTrabajando] = useState<null | "extra" | "confirmar" | "cerrar" | "recuento">(null);
  const [confirmarAbierto, setConfirmarAbierto] = useState(false);
  const [notaCierre, setNotaCierre] = useState("");
  const [error, setError] = useState<string | null>(null);
  // Recibir un traslado (anotar lo que llegó, confirmar, cerrar con diferencia) guarda en la tienda: pide
  // Responsable (ADR-0161). Uno solo para todo el panel. Contar NO lo pide: los borradores son de la pantalla.
  const responsable = useResponsable();

  // El estado se dice con las mismas palabras que la lista de Traslados: quien mira es el destino o, si no,
  // se lee desde el origen.
  const situacion = situacionTraslado(t, { miUbicacionId: esDestino ? t.ubicacionDestinoId : t.ubicacionOrigenId, puedeCerrarDiferencia, ahoraIso });
  const editable = esDestino && (t.estado === "en_transito" || t.estado === "recibido_con_diferencia");
  const enTransito = t.estado === "en_transito";
  const conDiferencia = t.estado === "recibido_con_diferencia";

  const lectura = useMemo(() => leerRecepcion(t.lineas, borradores), [t.lineas, borradores]);
  const huboDiferencia = t.lineas.some((l) => l.cantidadRecibida !== null && l.cantidadRecibida !== (l.cantidadEnviada ?? 0));
  const pasos = recorridoTraslado(t, situacion, { contadas: lectura.contadas, enviadas: lectura.enviadas, huboDiferencia }, ahoraIso);
  const ocupado = trabajando !== null;

  const enLineas = useMemo(() => new Set(t.lineas.map((l) => l.varianteId)), [t.lineas]);
  const sugerencias = useMemo(() => {
    const q = escaneo.trim().toLowerCase();
    if (q.length < 2) return [];
    return catalogo.filter((v) => (v.sku ?? "").toLowerCase().includes(q) || v.codigosBarras.some((c) => c.toLowerCase() === q)).slice(0, 6);
  }, [escaneo, catalogo]);

  function fijar(varianteId: string, valor: number) {
    setBorradores((b) => ({ ...b, [varianteId]: valor }));
  }
  function vaciar(varianteId: string) {
    setBorradores((b) => ({ ...b, [varianteId]: undefined }));
  }
  function sumar(varianteId: string, delta: number) {
    fijar(varianteId, ajustarCantidad(lectura.lineas.get(varianteId)?.valor ?? null, delta));
  }

  /** Manda a la base cada línea cambiada, una por una. Se detiene en el primer rechazo y lo dice: lo que ya se
   *  guardó queda guardado (`registrar_recepcion_traslado` solo fija una cantidad; repetirla no duplica nada). */
  async function registrar(pendientes: { varianteId: string; cantidad: number }[], que: string): Promise<boolean> {
    const supabase = createClient();
    for (const p of pendientes) {
      const { error } = await firmar(
        supabase.rpc("registrar_recepcion_traslado", { p_transferencia_id: t.id, p_variante_id: p.varianteId, p_cantidad_recibida: p.cantidad }),
        responsable.firma(),
      );
      if (error) {
        responsable.despues(error);
        setError(traducirError(error, que));
        router.refresh();
        return false;
      }
    }
    return true;
  }

  async function agregarExtra(varianteId: string) {
    if (!responsable.listo) {
      setError(responsable.motivo);
      return;
    }
    setTrabajando("extra");
    setError(null);
    const ok = await registrar([{ varianteId, cantidad: 1 }], "agregar la prenda de más");
    setTrabajando(null);
    if (ok) {
      avisar.exito("Prenda de más agregada", { detalle: "Quedó en la lista con 1 unidad; ajústala si llegaron más." });
      router.refresh();
    }
  }

  function alEscanear(texto: string): boolean {
    const v = resolverCodigoV2(texto, catalogo);
    if (!v) return false;
    setEscaneo("");
    if (enLineas.has(v.varianteId)) sumar(v.varianteId, 1);
    else void agregarExtra(v.varianteId);
    return true;
  }

  async function confirmar(cerrarModal: () => void) {
    if (!responsable.listo) return;
    setTrabajando("confirmar");
    setError(null);
    if (!(await registrar(lectura.porGuardar, "registrar lo recibido"))) {
      setTrabajando(null);
      cerrarModal();
      return;
    }
    const { data, error } = await firmar(createClient().rpc("confirmar_traslado", { p_transferencia_id: t.id }), responsable.firma());
    setTrabajando(null);
    responsable.despues(error);
    cerrarModal();
    if (error) {
      setError(traducirError(error, "confirmar la recepción"));
      router.refresh();
      return;
    }
    setBorradores({});
    if (data?.[0]?.resultado === "cerrada") {
      avisar.exito(`Traslado ${t.numero} recibido`, { detalle: `${lectura.recibido} prendas ya están en el stock de ${t.ubicacionDestinoNombre}.` });
    } else {
      avisar.exito(`Traslado ${t.numero} registrado con diferencia`, {
        detalle: puedeCerrarDiferencia ? "Ahora puedes revisarlo y cerrarlo abajo." : "Un líder tiene que revisarlo y cerrarlo.",
      });
    }
    router.refresh();
  }

  async function cerrarConDiferencia() {
    if (!responsable.listo || !notaCierreValida(notaCierre)) return;
    setTrabajando("cerrar");
    setError(null);
    if (!(await registrar(lectura.porGuardar, "registrar el recuento"))) {
      setTrabajando(null);
      return;
    }
    const { error } = await firmar(
      createClient().rpc("cerrar_traslado_con_diferencia", { p_transferencia_id: t.id, p_nota: notaCierre.trim() }),
      responsable.firma(),
    );
    setTrabajando(null);
    responsable.despues(error);
    if (error) {
      setError(traducirError(error, "cerrar el traslado"));
      return;
    }
    setBorradores({});
    avisar.exito(`Traslado ${t.numero} cerrado`, { detalle: `${lectura.recibido} prendas entraron al stock de ${t.ubicacionDestinoNombre}.` });
    router.refresh();
  }

  async function guardarRecuento() {
    if (!responsable.listo) return;
    setTrabajando("recuento");
    setError(null);
    const ok = await registrar(lectura.porGuardar, "guardar el recuento");
    setTrabajando(null);
    if (!ok) return;
    responsable.despues(null);
    setBorradores({});
    avisar.exito("Recuento guardado", { detalle: "Un líder lo verá al revisar la diferencia." });
    router.refresh();
  }

  if (t.lineas.length === 0) {
    return (
      <div className="card-cayla flex items-start gap-3 p-5 text-sm text-taupe">
        <Info aria-hidden strokeWidth={1.5} className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          <span className="font-semibold text-tinta">Este traslado no tiene prendas registradas.</span> Es una cabecera vacía que quedó de la limpieza de datos de prueba: no
          aparece en la lista, no cuenta en el menú y no mueve stock. No hay nada que confirmar.
        </p>
      </div>
    );
  }

  const faltanFilas = lectura.enviadas - lectura.contadas;
  const pct = lectura.enviado === 0 ? 0 : Math.min(100, Math.round((100 * lectura.recibido) / lectura.enviado));
  const puedeConfirmar = enTransito && lectura.completa && responsable.listo && !ocupado;
  const difLista = enTransito ? lectura.completa : lectura.contadas > 0 || lectura.recibido > 0;

  return (
    <div className="space-y-5">
      <TrasladoRecorrido pasos={pasos} />

      {/* Tres cifras: lo que se envió, lo que se lleva contado y la diferencia de lo contado. */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <Cifra etiqueta="Enviado" valor={lectura.enviado} unidad={`u. · ${lectura.enviadas} ${lectura.enviadas === 1 ? "variante" : "variantes"}`} />
        <Cifra
          etiqueta="Recibido"
          valor={lectura.contadas > 0 || lectura.recibido > 0 ? lectura.recibido : "—"}
          unidad={lectura.contadas > 0 || lectura.recibido > 0 ? `de ${lectura.enviado} u.` : esDestino ? "sin contar" : `lo cuenta ${t.ubicacionDestinoNombre}`}
        >
          {editable && enTransito && (
            <span aria-hidden className="mt-2 block h-1 overflow-hidden rounded-full bg-sand">
              <span className={`block h-full transition-[width] duration-300 ${lectura.completa ? "bg-verde" : "bg-tinta"}`} style={{ width: `${pct}%` }} />
            </span>
          )}
        </Cifra>
        {/* Mientras se cuenta, la diferencia total no se dice: a medio conteo «−15» es solo lo que falta contar. */}
        <Cifra
          etiqueta="Diferencia"
          valor={!difLista ? "—" : lectura.diferencia === 0 ? "0" : `${lectura.diferencia > 0 ? "+" : "−"}${Math.abs(lectura.diferencia)}`}
          unidad={!difLista ? (enTransito && lectura.contadas > 0 ? "al terminar de contar" : "") : lectura.diferencia === 0 ? "todo coincide" : lectura.diferencia < 0 ? "no llegaron" : "llegaron de más"}
          tono={!difLista ? undefined : lectura.diferencia < 0 ? "text-rojo-profundo" : lectura.diferencia > 0 ? "text-ambar" : undefined}
        />
      </div>

      {t.nota && (
        <p className="nota-cayla">
          <b>Nota del envío:</b> {t.nota}
        </p>
      )}
      {situacion === "en_camino_entrante" && (
        <Aviso>
          <b>Todavía viaja.</b> Puedes contarlo apenas llegue, aunque sea antes de la hora estimada.
        </Aviso>
      )}
      {error && (
        <p role="alert" className="rounded-xl bg-rojo/10 px-4 py-3 text-sm text-rojo-profundo">
          {error}
        </p>
      )}

      <section aria-label="Prendas del traslado" className="card-cayla overflow-hidden">
        {editable && (
          <div className="border-b border-sand px-4 py-3.5">
            <div className="flex flex-wrap items-center gap-2.5">
              <label className="caja-cayla relative flex h-10 min-w-0 flex-1 basis-72 items-center">
                <ScanLine aria-hidden strokeWidth={1.5} className="pointer-events-none absolute left-3 h-4 w-4 text-taupe" />
                <span className="sr-only">Escanear prenda</span>
                <input
                  type="text"
                  value={escaneo}
                  onChange={(e) => setEscaneo(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    e.preventDefault();
                    if (!alEscanear(escaneo) && escaneo.trim()) setError(`No encontramos el código «${escaneo.trim()}» en el catálogo.`);
                  }}
                  placeholder="Escanea el código o escribe el SKU y presiona Enter"
                  autoComplete="off"
                  disabled={trabajando === "extra"}
                  className="h-full w-full rounded-lg bg-transparent pl-9 pr-3 text-sm text-tinta outline-none placeholder:text-taupe"
                />
              </label>
            </div>
            {sugerencias.length > 0 && (
              <ul className="mt-2 space-y-1">
                {sugerencias.map((v) => {
                  const esta = enLineas.has(v.varianteId);
                  return (
                    <li key={v.varianteId}>
                      <button
                        type="button"
                        onClick={() => {
                          setEscaneo("");
                          if (esta) sumar(v.varianteId, 1);
                          else void agregarExtra(v.varianteId);
                        }}
                        className="flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-hueso/60"
                      >
                        <span className="min-w-0 truncate">
                          {v.referencia} <span className="text-taupe">· {v.sku} {[v.talla, v.color].filter(Boolean).join(" / ")}</span>
                        </span>
                        <span className="shrink-0 text-xs text-taupe">{esta ? "+1 a su línea" : "Agregar: no estaba en el envío"}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="mt-2 text-xs text-taupe">¿Llegó algo que no estaba en el envío? Escanéalo igual: se agrega como prenda de más.</p>
          </div>
        )}

        {/* Celular: una tarjeta por prenda, con el contador a la mano (la tabla obligaba a deslizar de lado). */}
        <ul className="divide-y divide-sand md:hidden">
          {t.lineas.map((l) => {
            const lin = lectura.lineas.get(l.varianteId);
            const valor = lin?.valor ?? null;
            const nueva = l.cantidadEnviada == null;
            return (
              <li key={l.varianteId} className="fila-cayla space-y-2.5 px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <ProductoVarianteCelda
                    referencia={l.referencia}
                    sku={l.sku}
                    talla={l.talla}
                    color={l.color}
                    colorHex={l.colorHex}
                    fotoUrl={l.fotoUrl}
                    senal={nueva ? <span className="ml-2 text-xs text-ambar">no estaba en el envío</span> : undefined}
                  />
                  <Diferencia dif={lin?.diferencia ?? null} />
                </div>
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-taupe">
                    Enviado <span className="tabular-nums text-tinta">{l.cantidadEnviada ?? "—"}</span>
                  </span>
                  {editable ? (
                    <Contador linea={l} valor={valor} ocupado={ocupado} onSumar={(d) => sumar(l.varianteId, d)} onFijar={(n) => fijar(l.varianteId, n)} onVaciar={() => vaciar(l.varianteId)} />
                  ) : (
                    <span className="text-taupe">
                      Recibido <span className="tabular-nums text-tinta">{valor ?? "—"}</span>
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>

        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="encabezado-tabla-cayla">
              <tr className="text-left text-xs text-taupe">
                <th className="px-5 py-2.5 font-normal">Producto / variante</th>
                <th className="px-3 py-2.5 text-right font-normal">Enviado</th>
                <th className="px-3 py-2.5 text-right font-normal">Recibido</th>
                <th className="px-5 py-2.5 text-right font-normal">Diferencia</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sand">
              {t.lineas.map((l) => {
                const lin = lectura.lineas.get(l.varianteId);
                const valor = lin?.valor ?? null;
                const dif = lin?.diferencia ?? null;
                const nueva = l.cantidadEnviada == null;
                return (
                  <tr key={l.varianteId} className="fila-cayla">
                    <td className="px-5 py-2.5">
                      <ProductoVarianteCelda
                        referencia={l.referencia}
                        sku={l.sku}
                        talla={l.talla}
                        color={l.color}
                        colorHex={l.colorHex}
                        fotoUrl={l.fotoUrl}
                        senal={nueva ? <span className="ml-2 text-xs text-ambar">no estaba en el envío</span> : undefined}
                      />
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-taupe">{l.cantidadEnviada ?? "—"}</td>
                    <td className="px-3 py-2.5 text-right">
                      {editable ? (
                        <Contador linea={l} valor={valor} ocupado={ocupado} onSumar={(d) => sumar(l.varianteId, d)} onFijar={(n) => fijar(l.varianteId, n)} onVaciar={() => vaciar(l.varianteId)} />
                      ) : (
                        <span className="tabular-nums text-tinta">{valor ?? <span className="text-taupe">—</span>}</span>
                      )}
                    </td>
                    <td className="px-5 py-2.5 text-right">
                      <Diferencia dif={dif} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {editable && (
          <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-3 border-t border-sand bg-papel px-4 py-3.5">
            {/* Contar no pide responsable; guardar sí (ADR-0161). Por eso el combo va junto al botón que guarda. */}
            <ComboResponsable control={responsable} deshabilitado={ocupado} />
            <div className="flex flex-wrap items-center gap-3">
              {enTransito ? (
                <>
                  <span className="text-[13px] text-taupe">
                    {faltanFilas > 0 ? `Faltan ${faltanFilas} ${faltanFilas === 1 ? "variante" : "variantes"} por contar` : lectura.coincideTodo ? "Todo coincide" : "Todo contado, con diferencia"}
                  </span>
                  <button
                    type="button"
                    onClick={() => setConfirmarAbierto(true)}
                    disabled={!puedeConfirmar}
                    title={!lectura.completa ? "Cuenta cada prenda enviada (aunque sea 0) antes de confirmar." : (responsable.motivo ?? undefined)}
                    className="btn-cayla btn-primario"
                  >
                    {trabajando === "confirmar" ? "Confirmando…" : "Confirmar recepción"}
                  </button>
                </>
              ) : (
                !puedeCerrarDiferencia &&
                lectura.porGuardar.length > 0 && (
                  <button type="button" onClick={guardarRecuento} disabled={ocupado || !responsable.listo} title={responsable.motivo ?? undefined} className="btn-cayla btn-primario">
                    {trabajando === "recuento" ? "Guardando…" : "Guardar recuento"}
                  </button>
                )
              )}
            </div>
          </div>
        )}
      </section>

      {/* Lo que pasa después, según quién mira. */}
      {conDiferencia && editable && puedeCerrarDiferencia ? (
        <section aria-labelledby="cierre-t" className="grid gap-2.5 rounded-2xl border border-ambar/30 bg-ambar/[0.07] px-5 py-4">
          <p className="text-xs font-semibold text-ambar">Solo líder</p>
          <h2 id="cierre-t" className="font-display text-xl text-tinta">
            Cerrar con esta diferencia
          </h2>
          <p className="max-w-prose text-sm leading-relaxed text-taupe">
            Al cerrar, entran <b className="font-semibold text-tinta">{lectura.recibido} prendas</b> al stock de {t.ubicacionDestinoNombre}.
            {lectura.diferencia < 0 && ` Las ${-lectura.diferencia} que no llegaron salen del inventario y quedan anotadas en el Traslado ${t.numero}.`}
            {lectura.diferencia > 0 && ` Las ${lectura.diferencia} de más entran también.`}
          </p>
          <label htmlFor="nota-cierre" className="text-xs text-taupe">
            Qué pasó con la diferencia (obligatorio)
          </label>
          <textarea
            id="nota-cierre"
            value={notaCierre}
            onChange={(e) => setNotaCierre(e.target.value)}
            placeholder="Ej.: faltaron 2 jeans talla 30; Tienda LIM los encontró en su almacén."
            rows={2}
            className="caja-cayla w-full px-3 py-2 text-sm text-tinta outline-none placeholder:text-taupe"
          />
          <div>
            <button
              type="button"
              onClick={cerrarConDiferencia}
              disabled={ocupado || !responsable.listo || !notaCierreValida(notaCierre)}
              title={!notaCierreValida(notaCierre) ? "Escribe qué pasó con la diferencia." : (responsable.motivo ?? undefined)}
              className="btn-cayla btn-primario"
            >
              {trabajando === "cerrar" ? "Cerrando…" : "Cerrar con esta diferencia"}
            </button>
          </div>
        </section>
      ) : conDiferencia ? (
        <Aviso>
          <b>Un líder de {t.ubicacionDestinoNombre} tiene que revisarlo y cerrarlo.</b> Hasta entonces, ninguna prenda de este traslado entra al stock.
          {esDestino && " Tú ya hiciste tu parte."}
        </Aviso>
      ) : situacion === "en_camino_saliente" ? (
        <Aviso>
          <b>Tú ya hiciste tu parte.</b> {t.ubicacionDestinoNombre} confirmará lo que llegó; las {lectura.enviado} prendas ya salieron de tu stock y viajan hasta entonces.
        </Aviso>
      ) : t.notaCierre ? (
        <p className="nota-cayla">
          <b>Nota del cierre:</b> {t.notaCierre}
        </p>
      ) : null}

      {confirmarAbierto && (
        <Modal
          titulo={`Confirmar recepción del Traslado ${t.numero}`}
          subtitulo={
            lectura.coincideTodo
              ? `Todo coincide. Las ${lectura.recibido} prendas entran ahora al stock de ${t.ubicacionDestinoNombre}.`
              : `Contaste ${lectura.recibido} de ${lectura.enviado} prendas. El traslado quedará «con diferencia» y nada entra al stock hasta que un líder lo revise y lo cierre.`
          }
          ancho="max-w-md"
          onClose={() => setConfirmarAbierto(false)}
        >
          {(cerrar) => (
            <div className="space-y-4">
              <dl className="grid gap-1 rounded-xl bg-hueso px-4 py-3 text-sm">
                <Fila etiqueta="Enviado" valor={`${lectura.enviado} u.`} />
                <Fila etiqueta="Recibido" valor={`${lectura.recibido} u.`} />
                {!lectura.coincideTodo && <Fila etiqueta="Diferencia" valor={`${lectura.diferencia > 0 ? "+" : "−"}${Math.abs(lectura.diferencia)} u.`} />}
              </dl>
              <div className="flex flex-wrap justify-end gap-2.5">
                <button type="button" onClick={cerrar} disabled={ocupado} className="btn-cayla btn-secundario">
                  Volver a contar
                </button>
                <button type="button" onClick={() => confirmar(cerrar)} disabled={ocupado || !responsable.listo} className="btn-cayla btn-primario">
                  {trabajando === "confirmar" ? "Confirmando…" : lectura.coincideTodo ? "Confirmar recepción" : "Registrar con diferencia"}
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}

/** «−», la casilla y «+», más «Coincide» (lo enviado de un toque). La casilla vacía es «sin contar». */
function Contador({
  linea: l,
  valor,
  ocupado,
  onSumar,
  onFijar,
  onVaciar,
}: {
  linea: TrasladoDetalle["lineas"][number];
  valor: number | null;
  ocupado: boolean;
  onSumar: (delta: number) => void;
  onFijar: (n: number) => void;
  onVaciar: () => void;
}) {
  const nombre = `${l.referencia}${l.talla ? ` talla ${l.talla}` : ""}`;
  return (
    <span className="inline-flex items-center justify-end gap-2">
      <span className="caja-cayla inline-flex items-center">
        <button
          type="button"
          onClick={() => onSumar(-1)}
          disabled={ocupado}
          aria-label={`Uno menos de ${nombre}`}
          className="flex h-9 w-9 items-center justify-center text-taupe transition-colors hover:text-tinta disabled:opacity-50 md:h-8 md:w-8"
        >
          <Minus aria-hidden strokeWidth={1.8} className="h-3.5 w-3.5" />
        </button>
        <input
          type="number"
          min={0}
          inputMode="numeric"
          value={valor ?? ""}
          placeholder="—"
          onChange={(e) => {
            const n = Number(e.target.value);
            if (e.target.value === "") onVaciar();
            else if (Number.isInteger(n) && n >= 0) onFijar(n);
          }}
          disabled={ocupado}
          aria-label={`Recibido de ${nombre}`}
          className="w-11 bg-transparent py-1.5 text-center text-base tabular-nums text-tinta outline-none [appearance:textfield] placeholder:text-taupe md:text-sm [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        <button
          type="button"
          onClick={() => onSumar(1)}
          disabled={ocupado}
          aria-label={`Uno más de ${nombre}`}
          className="flex h-9 w-9 items-center justify-center text-taupe transition-colors hover:text-tinta disabled:opacity-50 md:h-8 md:w-8"
        >
          <Plus aria-hidden strokeWidth={1.8} className="h-3.5 w-3.5" />
        </button>
      </span>
      {l.cantidadEnviada != null && (
        <button type="button" onClick={() => onFijar(l.cantidadEnviada ?? 0)} disabled={ocupado || valor === l.cantidadEnviada} className="btn-cayla btn-sutil btn-chico disabled:invisible">
          Coincide
        </button>
      )}
    </span>
  );
}

function Diferencia({ dif }: { dif: number | null }) {
  if (dif === null) return <span className="text-taupe">—</span>;
  if (dif === 0) return <Chip tono="verde">Coincide</Chip>;
  return dif < 0 ? <Chip tono="rojo">Faltan {-dif}</Chip> : <Chip tono="ambar">Sobran {dif}</Chip>;
}

function Cifra({ etiqueta, valor, unidad, tono, children }: { etiqueta: string; valor: number | string; unidad: string; tono?: string; children?: React.ReactNode }) {
  return (
    <div className="card-cayla px-3.5 py-3 sm:px-5 sm:py-3.5">
      <p className="text-xs font-semibold text-taupe">{etiqueta}</p>
      <p className={`font-display mt-0.5 text-2xl leading-tight tabular-nums sm:text-[28px] ${tono ?? "text-tinta"}`}>
        {valor}
        {unidad && <span className="block font-sans text-xs font-normal text-taupe sm:ml-1.5 sm:inline sm:text-[13px]">{unidad}</span>}
      </p>
      {children}
    </div>
  );
}

function Aviso({ children }: { children: React.ReactNode }) {
  return (
    <p className="card-cayla flex items-start gap-2.5 px-5 py-3.5 text-sm leading-relaxed text-taupe [&_b]:font-semibold [&_b]:text-tinta">
      <Info aria-hidden strokeWidth={1.5} className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

function Fila({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-taupe">{etiqueta}</dt>
      <dd className="font-medium tabular-nums text-tinta">{valor}</dd>
    </div>
  );
}
