"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Info, Minus, Plus, ScanLine } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { traducirError, type ErrorEscritura } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { Chip } from "@/components/ui/Chip";
import { MiniaturaPrenda } from "@/components/ui/PrendaCelda";
import { MuestraColor } from "@/components/ui/MuestraColor";
import { TrasladoRecorrido } from "@/components/TrasladoRecorrido";
import { TrasladoConfirmarModal } from "@/components/TrasladoConfirmarModal";
import { TrasladoCerrarModal } from "@/components/TrasladoCerrarModal";
import { TrasladoAnularModal } from "@/components/TrasladoAnularModal";
import { crearColaEnSerie } from "@/lib/conteo-reglas";
import { codigoPrenda } from "@/lib/prenda-reglas";
import { diaHora } from "@/lib/traslados-reglas";
import {
  MS_AGRUPAR_GUARDADO,
  anulacion,
  avisoRecepcion,
  buscarEnTraslado,
  consecuenciaAnular,
  consecuenciaCierre,
  insigniaComparacion,
  leerCasilla,
  leerConteo,
  lugarTexto,
  mensajeEscaneo,
  prendas,
  puedeTerminar,
  recorridoRecepcion,
  resolverEscaneo,
  resumirGuardado,
  sumarAlConteo,
  valorContado,
  type Conteos,
  type DestinoRecepcion,
  type EstadoGuardado,
  type LineaLeida,
} from "@/lib/traslados-recepcion-reglas";
import type { LineaTraslado, TrasladoDetalle } from "@/lib/traslados";
import { ComboResponsable } from "@/components/ComboResponsable";
import { useResponsable } from "@/lib/useResponsable";
import { firmar } from "@/lib/responsable-reglas";

type VarianteBusqueda = { varianteId: string; sku: string; referencia: string; talla: string | null; color: string | null; codigosBarras: string[] };

// El detalle de un traslado y su recepción (ADR-0239, sobre el rediseño ADR-0173). Lo que cambió y por qué:
//  · D-130, se cuenta a ciegas: quien recibe ve prenda, código y «Contado». Lo enviado aparece recién con «Terminé de
//    contar», que marca las que no cuadran («Vuelve a contarla») antes de confirmar. Ya no hay «Coincide»: copiaba lo
//    enviado de un toque y se asumía en vez de contar.
//  · Cada casilla se guarda sola (`registrar_recepcion_traslado`, agrupando los toques de ~600 ms, en fila y SIN el
//    loader global: `x-espera: no`, como la suma por escaneo de Conteo). Al volver a la pantalla, lo contado sigue ahí.
//    Si la red falla, lo contado queda en pantalla con «no se guardó · reintentar» y se reintenta al volver la red.
//  · D-129/D-131: confirmar hace entrar lo que coincide, en el piso de venta o el almacén (se pregunta, piso marcado).
//  · «Cerrar con esta diferencia» (líder) y «Anular envío» (D-132, origen o líder) pasan por un modal con la
//    consecuencia escrita.
// Quién puede qué y cuándo entra el stock siguen en las funciones de la base; aquí solo se decide qué se ve.
export function TrasladoDetallePanel({
  traslado: t,
  esDestino,
  esOrigen,
  esLider,
  ahoraIso,
  puedeCerrarDiferencia,
  opcionesDestino,
  lugarRecibido,
  catalogo,
}: {
  traslado: TrasladoDetalle;
  esDestino: boolean;
  esOrigen: boolean;
  esLider: boolean;
  /** El «ahora» fijado por el servidor (mismo criterio que la lista: el HTML del servidor y el del navegador no difieren). */
  ahoraIso: string;
  puedeCerrarDiferencia: boolean;
  /** Dónde se puede dejar lo que llega a la sede destino; vacío = no tiene piso de venta y no se pregunta (D-131). */
  opcionesDestino: ("piso_venta" | "almacen_tienda")[];
  /** Dónde quedó lo recibido (`transferencias.sububicacion_destino_id`), si ya se confirmó. */
  lugarRecibido: DestinoRecepcion;
  catalogo: VarianteBusqueda[];
}) {
  const router = useRouter();
  // Recibir y anular guardan en la tienda: piden Responsable (ADR-0161). Uno solo para todo el panel: en la sede
  // destino firma el conteo y la confirmación; en la de origen, la anulación.
  const responsable = useResponsable();

  const [conteos, setConteos] = useState<Conteos>({});
  const [guardado, setGuardado] = useState<Record<string, EstadoGuardado | undefined>>({});
  const [fase, setFase] = useState<"contando" | "revisando">("contando");
  const [escaneo, setEscaneo] = useState("");
  const [avisoEscaneo, setAvisoEscaneo] = useState<{ texto: string; fueraId: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<null | "confirmar" | "cerrar" | "anular">(null);
  const [trabajando, setTrabajando] = useState<null | "extra" | "confirmar" | "cerrar" | "anular">(null);

  // El guardado por prenda: en fila (la última en salir es la última en escribirse), con un temporizador por prenda
  // para agrupar toques y un número de versión para no pintar «guardado» sobre un valor que ya cambió.
  const cola = useRef(crearColaEnSerie());
  const temporizadores = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const versiones = useRef(new Map<string, number>());
  const conteosRef = useRef<Conteos>({});
  const estadosRef = useRef<Record<string, EstadoGuardado | undefined>>({});
  // Doble clic al anular (ADR-0190): un token por intento; se renueva solo si la anulación salió bien.
  const tokenAnular = useRef<string>(crypto.randomUUID());

  const enTransito = t.estado === "en_transito";
  const conDiferencia = t.estado === "recibido_con_diferencia";
  const anulada = t.estado === "anulada";
  // Solo la sede destino cuenta, mientras el traslado siga abierto; lo que ya entró al stock no se vuelve a contar.
  const contable = esDestino && (enTransito || conDiferencia);

  const lectura = useMemo(() => leerConteo(t.lineas, conteos), [t.lineas, conteos]);
  const resumenGuardado = resumirGuardado(guardado);
  const revisando = contable && enTransito && fase === "revisando" && lectura.lista;
  // A ciegas mientras se cuenta en la sede destino (D-130). Quien envió, sí ve lo que envió.
  const aCiegas = contable && enTransito && !revisando;
  const terminar = puedeTerminar(lectura, resumenGuardado);
  const ocupado = trabajando !== null;
  const bloqueoConteo = contable && !responsable.listo;

  const pasos = recorridoRecepcion(
    t,
    {
      esDestino,
      meTocaCerrar: esDestino && puedeCerrarDiferencia,
      contadas: lectura.contadas,
      enviadas: lectura.enviadas,
      huboDiferencia: t.lineas.some((l) => l.cantidadRecibida !== null && l.cantidadRecibida !== (l.cantidadEnviada ?? 0)),
      ahoraIso,
    },
  );
  const anular = anulacion({ estado: t.estado, esOrigen, esLider, lineas: t.lineas, destinoNombre: t.ubicacionDestinoNombre });

  const sugerencias = useMemo(() => (escaneo.trim().length < 2 || !contable ? [] : buscarEnTraslado(escaneo, t.lineas).filter((l) => !l.ingresado).slice(0, 6)), [escaneo, contable, t.lineas]);

  function ponerEstado(varianteId: string, e: EstadoGuardado | undefined) {
    estadosRef.current = { ...estadosRef.current, [varianteId]: e };
    setGuardado(estadosRef.current);
  }

  /** Manda UNA prenda a la base. Devuelve si quedó guardada. */
  function guardarLinea(varianteId: string, valor: number, version: number): Promise<boolean> {
    const firma = responsable.firma();
    if (versiones.current.get(varianteId) === version) ponerEstado(varianteId, { tipo: "guardando" });
    return cola.current
      .agregar(async () => {
        const consulta = createClient()
          .rpc("registrar_recepcion_traslado", { p_transferencia_id: t.id, p_variante_id: varianteId, p_cantidad_recibida: valor })
          .setHeader("x-espera", "no");
        const { error } = await firmar(consulta, firma);
        if (error) throw error;
      })
      .then(
        () => {
          if (versiones.current.get(varianteId) === version) ponerEstado(varianteId, { tipo: "guardado" });
          return true;
        },
        (e: ErrorEscritura) => {
          // Un rechazo por el responsable vacía el combo y relee la lista; lo contado sigue en pantalla.
          responsable.despues(e);
          if (versiones.current.get(varianteId) === version) ponerEstado(varianteId, { tipo: "error", mensaje: traducirError(e, "guardar lo contado") });
          return false;
        },
      );
  }

  /** Cambia la casilla y programa su guardado. Vaciarla no se guarda (la base no tiene «sin contar» de vuelta): al
   *  recargar vuelve el último número guardado. */
  function cambiar(varianteId: string, valor: number | null) {
    conteosRef.current = { ...conteosRef.current, [varianteId]: valor };
    setConteos(conteosRef.current);
    const version = (versiones.current.get(varianteId) ?? 0) + 1;
    versiones.current.set(varianteId, version);
    clearTimeout(temporizadores.current.get(varianteId));
    temporizadores.current.delete(varianteId);
    if (valor === null) {
      ponerEstado(varianteId, undefined);
      return;
    }
    ponerEstado(varianteId, { tipo: "espera" });
    temporizadores.current.set(
      varianteId,
      setTimeout(() => {
        temporizadores.current.delete(varianteId);
        void guardarLinea(varianteId, valor, version);
      }, MS_AGRUPAR_GUARDADO),
    );
  }

  function sumar(varianteId: string, delta: number) {
    const l = t.lineas.find((x) => x.varianteId === varianteId);
    if (!l) return;
    cambiar(varianteId, sumarAlConteo(valorContado(l, conteosRef.current), delta));
  }

  /** Vuelve a mandar una prenda que no se guardó (o todas, al volver la red). */
  function reintentar(varianteId: string) {
    const l = t.lineas.find((x) => x.varianteId === varianteId);
    const valor = l ? valorContado(l, conteosRef.current) : null;
    if (valor === null) return;
    const version = (versiones.current.get(varianteId) ?? 0) + 1;
    versiones.current.set(varianteId, version);
    void guardarLinea(varianteId, valor, version);
  }

  /** Antes de terminar, confirmar o cerrar: manda ya lo que esperaba su turno y espera a que la fila se vacíe.
   *  Devuelve si todo quedó guardado. */
  async function guardarPendientes(): Promise<boolean> {
    const envios: Promise<boolean>[] = [];
    for (const [varianteId, temporizador] of temporizadores.current) {
      clearTimeout(temporizador);
      const valor = conteosRef.current[varianteId];
      if (valor !== null && valor !== undefined) envios.push(guardarLinea(varianteId, valor, versiones.current.get(varianteId) ?? 0));
    }
    temporizadores.current.clear();
    const resultados = await Promise.all(envios);
    await cola.current.vaciar();
    return resultados.every(Boolean) && !Object.values(estadosRef.current).some((e) => e?.tipo === "error");
  }

  // Al volver la red, se reintenta lo que no se guardó. El manejador lee la versión más nueva de `reintentar`.
  const reintentarRef = useRef(reintentar);
  useEffect(() => {
    reintentarRef.current = reintentar;
  });
  useEffect(() => {
    const alVolver = () => {
      for (const [id, e] of Object.entries(estadosRef.current)) if (e?.tipo === "error") reintentarRef.current(id);
    };
    window.addEventListener("online", alVolver);
    return () => window.removeEventListener("online", alVolver);
  }, []);
  // Si se sale de la pantalla antes de los 600 ms, lo último contado se manda igual.
  const guardarLineaRef = useRef(guardarLinea);
  useEffect(() => {
    guardarLineaRef.current = guardarLinea;
  });
  useEffect(() => {
    const pendientes = temporizadores.current;
    const valores = conteosRef;
    const vers = versiones.current;
    return () => {
      for (const [id, temporizador] of pendientes) {
        clearTimeout(temporizador);
        const valor = valores.current[id];
        if (valor !== null && valor !== undefined) void guardarLineaRef.current(id, valor, vers.get(id) ?? 0);
      }
      pendientes.clear();
    };
  }, []);

  function alEscanear() {
    const texto = escaneo.trim();
    if (!texto) return;
    const r = resolverEscaneo(texto, t.lineas, catalogo);
    if (r.tipo === "linea") {
      const l = t.lineas.find((x) => x.varianteId === r.varianteId);
      setEscaneo("");
      if (l?.ingresado) {
        setAvisoEscaneo({ texto: "Esa prenda ya entró al stock: no hace falta contarla otra vez.", fueraId: null });
        return;
      }
      // Un escaneo bueno borra el error del anterior (hallazgo 12).
      setAvisoEscaneo(null);
      sumar(r.varianteId, 1);
      return;
    }
    setAvisoEscaneo({ texto: mensajeEscaneo(r, t.ubicacionOrigenNombre) ?? "", fueraId: r.tipo === "fuera" ? r.varianteId : null });
    // Con varias coincidencias se deja lo escrito para elegir en la lista; si no, se limpia para el próximo escaneo
    // (la pistola escribiría encima de lo anterior).
    if (r.tipo !== "varias") setEscaneo("");
  }

  /** Una prenda que no venía en el envío: se anota con 1 y queda como diferencia para el líder. */
  async function anotarDeMas(varianteId: string) {
    if (!responsable.listo) return;
    setTrabajando("extra");
    setError(null);
    const { error } = await firmar(
      createClient().rpc("registrar_recepcion_traslado", { p_transferencia_id: t.id, p_variante_id: varianteId, p_cantidad_recibida: 1 }),
      responsable.firma(),
    );
    setTrabajando(null);
    if (error) {
      responsable.despues(error);
      setError(traducirError(error, "anotar la prenda de más"));
      return;
    }
    setAvisoEscaneo(null);
    avisar.exito("Prenda de más anotada", { detalle: "Quedó en la lista con 1; súmale si llegaron más." });
    router.refresh();
  }

  async function terminarDeContar() {
    setError(null);
    if (!(await guardarPendientes())) {
      setError("Hay prendas que no se guardaron. Reintenta antes de terminar.");
      return;
    }
    setFase("revisando");
  }

  async function confirmar(destino: DestinoRecepcion, cerrarModal: () => void) {
    if (!responsable.listo) return;
    setTrabajando("confirmar");
    setError(null);
    if (!(await guardarPendientes())) {
      setTrabajando(null);
      cerrarModal();
      setError("Hay prendas que no se guardaron. Reintenta antes de confirmar.");
      return;
    }
    const { data, error } = await firmar(
      createClient().rpc("confirmar_traslado", { p_transferencia_id: t.id, p_destino: destino ?? undefined }),
      responsable.firma(),
    );
    setTrabajando(null);
    responsable.despues(error);
    cerrarModal();
    if (error) {
      setError(traducirError(error, "confirmar la recepción"));
      router.refresh();
      return;
    }
    const fila = data?.[0];
    const aviso = avisoRecepcion({
      numero: t.numero,
      resultado: fila?.resultado ?? "",
      unidadesIngresadas: fila?.unidades_ingresadas ?? 0,
      lineasConDiferencia: fila?.lineas_con_diferencia ?? 0,
      destino,
      sede: t.ubicacionDestinoNombre,
      puedeCerrarDiferencia,
    });
    avisar.exito(aviso.titulo, { detalle: aviso.detalle });
    setFase("contando");
    router.refresh();
  }

  async function cerrarConDiferencia(nota: string, cerrarModal: () => void) {
    if (!responsable.listo) return;
    setTrabajando("cerrar");
    setError(null);
    if (!(await guardarPendientes())) {
      setTrabajando(null);
      cerrarModal();
      setError("Hay prendas que no se guardaron. Reintenta antes de cerrar.");
      return;
    }
    const { data, error } = await firmar(createClient().rpc("cerrar_traslado_con_diferencia", { p_transferencia_id: t.id, p_nota: nota }), responsable.firma());
    setTrabajando(null);
    responsable.despues(error);
    cerrarModal();
    if (error) {
      setError(traducirError(error, "cerrar el traslado"));
      return;
    }
    const n = data?.[0]?.unidades_recibidas ?? 0;
    avisar.exito(`Traslado ${t.numero} cerrado`, {
      detalle: n === 0 ? "No entró ninguna prenda más; la diferencia quedó anotada." : `${n === 1 ? "Entró" : "Entraron"} ${prendas(n)} ${lugarTexto(lugarRecibido, t.ubicacionDestinoNombre)}.`,
    });
    router.refresh();
  }

  async function anularEnvio(motivo: string, cerrarModal: () => void) {
    if (!responsable.listo) return;
    setTrabajando("anular");
    setError(null);
    const { error } = await firmar(
      createClient().rpc("anular_traslado", { p_transferencia_id: t.id, p_motivo: motivo, p_token: tokenAnular.current }),
      responsable.firma(),
    );
    setTrabajando(null);
    responsable.despues(error);
    cerrarModal();
    if (error) {
      setError(traducirError(error, "anular el envío"));
      router.refresh();
      return;
    }
    tokenAnular.current = crypto.randomUUID();
    avisar.exito(`Traslado ${t.numero} anulado`, {
      detalle: lectura.unidadesEnviadas === 1 ? `La prenda volvió al stock de ${t.ubicacionOrigenNombre}.` : `Las ${lectura.unidadesEnviadas} prendas volvieron al stock de ${t.ubicacionOrigenNombre}.`,
    });
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

  // Qué columnas lleva la tabla. Cambian con la FASE (contar → comparar), nunca con un toque: nada se corre mientras
  // se cuenta (hallazgo 13).
  const verEnviado = !aCiegas;
  const verComparacion = revisando || conDiferencia || (!enTransito && !anulada);
  const difTotal = lectura.unidadesContadas - lectura.unidadesEnviadas;
  const difLista = !enTransito || revisando;

  return (
    <div className="space-y-5">
      <TrasladoRecorrido pasos={pasos} />

      {/* Tres cifras: lo enviado, lo contado y la diferencia. A ciegas no se muestran: la de «Enviado» diría cuánto hay. */}
      {!aCiegas && !anulada && (
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <Cifra etiqueta="Enviado" valor={lectura.unidadesEnviadas} unidad="prendas" />
          <Cifra
            etiqueta="Recibido"
            valor={lectura.contadas > 0 ? lectura.unidadesContadas : "—"}
            unidad={lectura.contadas > 0 ? `de ${lectura.unidadesEnviadas}` : `lo cuenta ${t.ubicacionDestinoNombre}`}
          />
          <Cifra
            etiqueta="Diferencia"
            valor={!difLista ? "—" : difTotal === 0 ? "0" : `${difTotal > 0 ? "+" : "−"}${Math.abs(difTotal)}`}
            unidad={!difLista ? (lectura.contadas > 0 ? "al terminar de contar" : "") : difTotal === 0 ? "todo coincide" : difTotal < 0 ? "no llegaron" : "llegaron de más"}
            tono={!difLista ? undefined : difTotal < 0 ? "text-rojo-profundo" : difTotal > 0 ? "text-ambar" : undefined}
          />
        </div>
      )}

      {anulada && (
        <Aviso>
          <b>
            Envío anulado{t.anuladoEn ? ` ${diaHora(t.anuladoEn, ahoraIso)}` : ""}
            {t.anuladoPorNombre ? ` por ${t.anuladoPorNombre}` : ""}.
          </b>{" "}
          {t.motivoAnulacion && <>Motivo: «{t.motivoAnulacion}». </>}
          Las prendas volvieron al stock de {t.ubicacionOrigenNombre}; {t.ubicacionDestinoNombre} no tiene nada que recibir.
        </Aviso>
      )}

      {t.nota && (
        <p className="nota-cayla">
          <b>Nota del envío:</b> {t.nota}
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-xl bg-rojo/10 px-4 py-3 text-sm text-rojo-profundo">
          {error}
        </p>
      )}

      <section aria-label="Prendas del traslado" className="card-cayla overflow-hidden">
        {contable && (
          <div className="space-y-2.5 border-b border-sand px-4 py-3.5">
            <p className="text-sm text-taupe">
              {aCiegas ? (
                <>
                  <b className="font-semibold text-tinta">Cuenta lo que llegó en la caja, prenda por prenda.</b> Lo contado se guarda solo; si te interrumpen, sigue
                  aquí al volver.
                </>
              ) : revisando ? (
                <>
                  <b className="font-semibold text-tinta">Compara con lo enviado.</b> Las que dicen «Vuelve a contarla», búscalas otra vez en la caja y corrígelas aquí.
                </>
              ) : (
                <>
                  <b className="font-semibold text-tinta">Lo que coincidió ya está en el stock.</b> Si encuentras algo de lo que falta, corrígelo aquí: se guarda solo.
                </>
              )}
            </p>
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
                    alEscanear();
                  }}
                  placeholder="Escanea la etiqueta o escribe su código"
                  autoComplete="off"
                  disabled={bloqueoConteo || trabajando === "extra"}
                  className="h-full w-full rounded-lg bg-transparent pl-9 pr-3 text-sm text-tinta outline-none placeholder:text-taupe"
                />
              </label>
              <ComboResponsable control={responsable} deshabilitado={ocupado} />
            </div>
            {bloqueoConteo && responsable.motivo && <p className="text-xs text-rojo-profundo">{responsable.motivo}</p>}
            {avisoEscaneo && (
              <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg bg-hueso px-3 py-2 text-sm text-tinta">
                <span>{avisoEscaneo.texto}</span>
                {avisoEscaneo.fueraId && (
                  <button type="button" onClick={() => void anotarDeMas(avisoEscaneo.fueraId!)} disabled={ocupado || !responsable.listo} className="btn-cayla btn-enlace btn-chico">
                    {trabajando === "extra" ? "Anotando…" : "Llegó igual: anotarla como prenda de más"}
                  </button>
                )}
              </div>
            )}
            {sugerencias.length > 0 && (
              <ul className="space-y-1">
                {sugerencias.map((l) => (
                  <li key={l.varianteId}>
                    <button
                      type="button"
                      onClick={() => {
                        setEscaneo("");
                        setAvisoEscaneo(null);
                        sumar(l.varianteId, 1);
                      }}
                      disabled={bloqueoConteo}
                      className="flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-hueso/60"
                    >
                      <span className="min-w-0 truncate">
                        {l.referencia} <span className="text-taupe">· {[l.talla, l.color].filter(Boolean).join(" · ")} · {codigoPrenda(l)}</span>
                      </span>
                      <span className="shrink-0 text-xs text-taupe">+1</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Celular: una tarjeta por prenda, con el contador a la mano. */}
        <ul className="divide-y divide-sand md:hidden">
          {t.lineas.map((l) => {
            const leida = lectura.lineas.get(l.varianteId)!;
            const editable = contable && !l.ingresado;
            return (
              <li key={l.varianteId} className="fila-cayla space-y-2.5 px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <Prenda linea={l} />
                  {verComparacion && <Insignia leida={leida} recontable={revisando} />}
                </div>
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-taupe">{verEnviado && l.cantidadEnviada !== null ? <>Enviado <span className="tabular-nums text-tinta">{l.cantidadEnviada}</span></> : null}</span>
                  {editable ? (
                    <Contador linea={l} valor={leida.valor} deshabilitado={bloqueoConteo || ocupado} onSumar={(d) => sumar(l.varianteId, d)} onCambiar={(n) => cambiar(l.varianteId, n)} />
                  ) : (
                    <span className="text-taupe">
                      {esDestino || !enTransito ? "Recibido" : "Contado"} <span className="tabular-nums text-tinta">{leida.valor ?? "—"}</span>
                    </span>
                  )}
                </div>
                {editable && <EstadoLinea estado={guardado[l.varianteId]} onReintentar={() => reintentar(l.varianteId)} />}
              </li>
            );
          })}
        </ul>

        <div className="hidden md:block">
          <table className="w-full table-fixed text-sm">
            <colgroup>
              <col />
              <col className="w-[190px]" />
              {verEnviado && <col className="w-[96px]" />}
              <col className="w-[210px]" />
              {verComparacion && <col className="w-[170px]" />}
            </colgroup>
            <thead className="encabezado-tabla-cayla">
              <tr className="text-left text-xs text-taupe">
                <th className="px-5 py-2.5 font-normal">Prenda</th>
                <th className="px-3 py-2.5 font-normal">Código</th>
                {verEnviado && <th className="px-3 py-2.5 text-right font-normal">Enviado</th>}
                <th className="px-3 py-2.5 text-right font-normal">{contable ? "Contado" : "Recibido"}</th>
                {verComparacion && <th className="px-5 py-2.5 text-right font-normal" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-sand">
              {t.lineas.map((l) => {
                const leida = lectura.lineas.get(l.varianteId)!;
                const editable = contable && !l.ingresado;
                return (
                  <tr key={l.varianteId} className="fila-cayla align-top">
                    <td className="px-5 py-2.5">
                      <Prenda linea={l} />
                    </td>
                    <td className="truncate px-3 py-3 font-mono text-xs text-tinta/75" title={codigoPrenda(l)}>
                      {codigoPrenda(l)}
                    </td>
                    {verEnviado && <td className="px-3 py-3 text-right tabular-nums text-taupe">{l.cantidadEnviada ?? "—"}</td>}
                    <td className="px-3 py-2 text-right">
                      {editable ? (
                        <span className="inline-flex flex-col items-end">
                          <Contador linea={l} valor={leida.valor} deshabilitado={bloqueoConteo || ocupado} onSumar={(d) => sumar(l.varianteId, d)} onCambiar={(n) => cambiar(l.varianteId, n)} />
                          <EstadoLinea estado={guardado[l.varianteId]} onReintentar={() => reintentar(l.varianteId)} />
                        </span>
                      ) : (
                        <span className="inline-block py-1 tabular-nums text-tinta">{leida.valor ?? <span className="text-taupe">—</span>}</span>
                      )}
                    </td>
                    {verComparacion && (
                      <td className="px-5 py-3 text-right">
                        <Insignia leida={leida} recontable={revisando} />
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {contable && enTransito && (
          <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-3 border-t border-sand bg-papel px-4 py-3.5">
            <span className="text-[13px] text-taupe">
              {revisando
                ? lectura.conDiferencia.length === 0
                  ? "Todo coincide con lo enviado."
                  : `${lectura.conDiferencia.length === 1 ? "1 prenda no cuadra: vuelve a contarla" : `${lectura.conDiferencia.length} prendas no cuadran: vuelve a contarlas`} o confirma igual.`
                : `Llevas ${lectura.unidadesContadas === 1 ? "1 prenda contada" : `${lectura.unidadesContadas} prendas contadas`}${terminar.motivo ? ` · ${terminar.motivo}` : ""}.`}
            </span>
            <div className="flex flex-wrap items-center gap-2.5">
              {revisando ? (
                <>
                  <button type="button" onClick={() => setFase("contando")} disabled={ocupado} className="btn-cayla btn-secundario">
                    Seguir contando
                  </button>
                  <button
                    type="button"
                    onClick={() => setModal("confirmar")}
                    disabled={ocupado || resumenGuardado.errores > 0 || !responsable.listo}
                    title={responsable.motivo ?? undefined}
                    className="btn-cayla btn-primario"
                  >
                    Confirmar recepción
                  </button>
                </>
              ) : (
                <button type="button" onClick={() => void terminarDeContar()} disabled={ocupado || !terminar.habilitado} className="btn-cayla btn-primario">
                  Terminé de contar
                </button>
              )}
            </div>
          </div>
        )}
      </section>

      {/* Lo que pasa después, según quién mira. */}
      {conDiferencia && contable && puedeCerrarDiferencia ? (
        <section aria-labelledby="cierre-t" className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-ambar/30 bg-ambar/[0.07] px-5 py-4">
          <div className="max-w-prose space-y-1">
            <p className="text-xs font-semibold text-ambar">Solo líder</p>
            <h2 id="cierre-t" className="font-display text-xl text-tinta">
              Cerrar con esta diferencia
            </h2>
            <p className="text-sm leading-relaxed text-taupe">
              Si ya buscaron lo que falta y no apareció, ciérralo: lo que no llegó se da por perdido y queda anotado en el Traslado {t.numero}.
            </p>
          </div>
          <button type="button" onClick={() => setModal("cerrar")} disabled={ocupado || resumenGuardado.errores > 0} className="btn-cayla btn-primario">
            Cerrar con esta diferencia…
          </button>
        </section>
      ) : conDiferencia ? (
        <Aviso>
          <b>Lo que coincidió ya está en el stock de {t.ubicacionDestinoNombre}.</b> Las prendas con diferencia esperan a que un líder de {t.ubicacionDestinoNombre} las
          revise y cierre.{esDestino && " Tú ya hiciste tu parte."}
        </Aviso>
      ) : enTransito && !esDestino ? (
        <div className="card-cayla flex flex-wrap items-center justify-between gap-x-5 gap-y-3 px-5 py-3.5">
          <p className="flex items-start gap-2.5 text-sm leading-relaxed text-taupe [&_b]:font-semibold [&_b]:text-tinta">
            <Info aria-hidden strokeWidth={1.5} className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              {esOrigen ? (
                <>
                  <b>Tú ya hiciste tu parte.</b> {t.ubicacionDestinoNombre} lo cuenta cuando llegue; las {lectura.unidadesEnviadas} prendas ya salieron de tu stock y viajan
                  hasta entonces.
                </>
              ) : (
                <>
                  <b>Viaja hacia {t.ubicacionDestinoNombre}.</b> Lo cuenta esa sede cuando llegue.
                </>
              )}
            </span>
          </p>
          {anular.mostrar && (
            <div className="flex flex-col items-end gap-1">
              <button type="button" onClick={() => setModal("anular")} disabled={ocupado || !anular.habilitado} className="btn-cayla btn-peligro">
                Anular envío
              </button>
              {anular.porQueNo && <span className="max-w-xs text-right text-xs text-taupe">{anular.porQueNo}</span>}
            </div>
          )}
        </div>
      ) : !enTransito && !anulada ? (
        <>
          {lugarRecibido && <p className="nota-cayla">Lo que llegó entró {lugarTexto(lugarRecibido, t.ubicacionDestinoNombre)}.</p>}
          {t.notaCierre && (
            <p className="nota-cayla">
              <b>Nota del cierre:</b> {t.notaCierre}
            </p>
          )}
        </>
      ) : null}

      {modal === "confirmar" && (
        <TrasladoConfirmarModal
          numero={t.numero}
          sede={t.ubicacionDestinoNombre}
          opcionesDestino={opcionesDestino}
          lectura={lectura}
          ocupado={trabajando === "confirmar"}
          motivoSinResponsable={responsable.motivo}
          onConfirmar={(destino, cerrar) => void confirmar(destino, cerrar)}
          onClose={() => setModal(null)}
        />
      )}
      {modal === "cerrar" && (
        <TrasladoCerrarModal
          numero={t.numero}
          origenNombre={t.ubicacionOrigenNombre}
          consecuencia={consecuenciaCierre(t.lineas, conteos, { destino: lugarRecibido, sede: t.ubicacionDestinoNombre })}
          ocupado={trabajando === "cerrar"}
          motivoSinResponsable={responsable.motivo}
          onCerrarTraslado={(nota, cerrar) => void cerrarConDiferencia(nota, cerrar)}
          onClose={() => setModal(null)}
        />
      )}
      {modal === "anular" && (
        <TrasladoAnularModal
          numero={t.numero}
          consecuencia={consecuenciaAnular(lectura.unidadesEnviadas, t.ubicacionOrigenNombre, t.ubicacionDestinoNombre)}
          responsable={responsable}
          ocupado={trabajando === "anular"}
          onAnular={(motivo, cerrar) => void anularEnvio(motivo, cerrar)}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}

/** La prenda en una fila: foto, nombre y talla · color. El código va en su propia columna (a ciegas es lo único que
 *  identifica la prenda contra la etiqueta). */
function Prenda({ linea: l }: { linea: LineaTraslado }) {
  return (
    <span className="flex min-w-0 items-start gap-2.5">
      <MiniaturaPrenda fotoUrl={l.fotoUrl} />
      <span className="min-w-0">
        <span className="block truncate text-sm text-tinta" title={l.referencia}>
          {l.referencia}
          {l.cantidadEnviada === null && <span className="ml-2 text-xs text-ambar-profundo">no venía en el envío</span>}
        </span>
        <span className="flex items-center gap-1.5 whitespace-nowrap text-xs text-tinta/65">
          {l.talla && <span>{l.talla}</span>}
          {l.talla && <span>·</span>}
          {l.colorHex === undefined ? <span>{l.color ?? "—"}</span> : <MuestraColor nombre={l.color} hex={l.colorHex} />}
          {/* En el celular no hay columna de código: va debajo del nombre. */}
          <span className="font-mono md:hidden">· {codigoPrenda(l)}</span>
        </span>
      </span>
    </span>
  );
}

/** «−», la casilla y «+». La casilla vacía es «sin contar» (no 0). Ancho fijo: nada se corre al cambiar. */
function Contador({
  linea: l,
  valor,
  deshabilitado,
  onSumar,
  onCambiar,
}: {
  linea: LineaTraslado;
  valor: number | null;
  deshabilitado: boolean;
  onSumar: (delta: number) => void;
  onCambiar: (n: number | null) => void;
}) {
  const nombre = `${l.referencia}${l.talla ? ` talla ${l.talla}` : ""}`;
  return (
    <span className="caja-cayla inline-flex w-[136px] shrink-0 items-center justify-between md:w-[128px]">
      <button
        type="button"
        onClick={() => onSumar(-1)}
        disabled={deshabilitado}
        aria-label={`Uno menos de ${nombre}`}
        className="flex h-10 w-10 items-center justify-center text-taupe transition-colors hover:text-tinta disabled:opacity-50 md:h-8 md:w-8"
      >
        <Minus aria-hidden strokeWidth={1.8} className="h-3.5 w-3.5" />
      </button>
      <input
        type="text"
        inputMode="numeric"
        value={valor ?? ""}
        placeholder="—"
        onChange={(e) => {
          const n = leerCasilla(e.target.value);
          if (n !== undefined) onCambiar(n);
        }}
        onFocus={(e) => e.target.select()}
        disabled={deshabilitado}
        aria-label={`Contado de ${nombre}`}
        className="w-12 min-w-0 bg-transparent py-1.5 text-center text-base tabular-nums text-tinta outline-none placeholder:text-taupe md:text-sm"
      />
      <button
        type="button"
        onClick={() => onSumar(1)}
        disabled={deshabilitado}
        aria-label={`Uno más de ${nombre}`}
        className="flex h-10 w-10 items-center justify-center text-taupe transition-colors hover:text-tinta disabled:opacity-50 md:h-8 md:w-8"
      >
        <Plus aria-hidden strokeWidth={1.8} className="h-3.5 w-3.5" />
      </button>
    </span>
  );
}

/** El guardado de una prenda, discreto y con su alto reservado (la fila no salta cuando aparece o desaparece). */
function EstadoLinea({ estado, onReintentar }: { estado: EstadoGuardado | undefined; onReintentar: () => void }) {
  return (
    <span aria-live="polite" className="mt-1 flex h-4 items-center justify-end gap-1 text-[11px] leading-4">
      {estado?.tipo === "espera" || estado?.tipo === "guardando" ? (
        <span className="text-taupe">Guardando…</span>
      ) : estado?.tipo === "guardado" ? (
        <span className="flex items-center gap-1 text-verde">
          <Check aria-hidden strokeWidth={2} className="h-3 w-3" /> Guardado
        </span>
      ) : estado?.tipo === "error" ? (
        <span className="flex items-center gap-1 text-rojo-profundo" title={estado.mensaje}>
          No se guardó ·
          <button type="button" onClick={onReintentar} className="underline underline-offset-2">
            reintentar
          </button>
        </span>
      ) : null}
    </span>
  );
}

function Insignia({ leida, recontable }: { leida: LineaLeida; recontable: boolean }) {
  const i = insigniaComparacion(leida, { recontable });
  return <Chip tono={i.tono}>{i.texto}</Chip>;
}

function Cifra({ etiqueta, valor, unidad, tono }: { etiqueta: string; valor: number | string; unidad: string; tono?: string }) {
  return (
    <div className="card-cayla px-3.5 py-3 sm:px-5 sm:py-3.5">
      <p className="text-xs font-semibold text-taupe">{etiqueta}</p>
      <p className={`font-display mt-0.5 text-2xl leading-tight tabular-nums sm:text-[28px] ${tono ?? "text-tinta"}`}>
        {valor}
        {unidad && <span className="block font-sans text-xs font-normal text-taupe sm:ml-1.5 sm:inline sm:text-[13px]">{unidad}</span>}
      </p>
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
