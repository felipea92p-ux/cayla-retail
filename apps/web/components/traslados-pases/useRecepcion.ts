"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError, type ErrorEscritura } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import type { LecturaConteo as LecturaCamara } from "@/components/EscanerConteo";
import { crearColaEnSerie } from "@/lib/conteo-reglas";
import { codigoPrenda } from "@/lib/prenda-reglas";
import {
  MS_AGRUPAR_GUARDADO,
  avisoRecepcion,
  buscarEnTraslado,
  leerConteo,
  lugarTexto,
  mensajeEscaneo,
  prendas,
  puedeTerminar,
  resolverEscaneo,
  resumirGuardado,
  sumarAlConteo,
  valorContado,
  type Conteos,
  type DestinoRecepcion,
  type EstadoGuardado,
} from "@/lib/traslados-recepcion-reglas";
import type { TrasladoDetalle } from "@/lib/traslados";
import { useResponsable } from "@/lib/useResponsable";
import { firmar, type Firma } from "@/lib/responsable-reglas";
import { firmaOmitida, type FirmaOmitida } from "@/lib/responsable-omitido";
import { camposDeFirma, esPedidoDeNombre, firmaEnPantalla, mandaNombre, type FirmaDelPaso } from "@/lib/firma-heredada";
import { claveResponsableRecepcion } from "@/lib/responsable-conteo";

export type VarianteBusqueda = { varianteId: string; sku: string; referencia: string; talla: string | null; color: string | null; codigosBarras: string[] };

// La recepción de un traslado, sin dibujo (ADR-0354: la mueve el reverso del pase; las reglas son las de ADR-0239 y ADR-0328, sin
// cambios respecto del panel de antes):
//  · D-130, se cuenta a ciegas: lo enviado aparece recién al terminar de contar.
//  · Cada casilla se guarda sola (`registrar_recepcion_traslado`, agrupando los toques de ~600 ms, en fila y SIN el loader global:
//    `x-espera: no`). Al volver a la pantalla, lo contado sigue ahí. Si la red falla, queda en pantalla con «no se guardó ·
//    reintentar» y se reintenta al volver la red; si se sale antes de los 600 ms, lo último se manda igual.
//  · D-129/D-131: confirmar hace entrar lo que coincide, en el piso de venta o el almacén.
//  · ADR-0328: el nombre se pide UNA vez por recepción; si la base igual lo pide, el combo aparece entonces.
// Quién puede qué y cuándo entra el stock siguen en las funciones de la base.
export function useRecepcion({
  traslado: t,
  esDestino,
  firma,
  catalogo,
  puedeCerrarDiferencia,
  lugarRecibido,
}: {
  traslado: TrasladoDetalle;
  esDestino: boolean;
  firma: FirmaDelPaso;
  catalogo: VarianteBusqueda[];
  puedeCerrarDiferencia: boolean;
  lugarRecibido: DestinoRecepcion;
}) {
  const router = useRouter();
  const [conteos, setConteos] = useState<Conteos>({});
  const [guardado, setGuardado] = useState<Record<string, EstadoGuardado | undefined>>({});
  const [escaneo, setEscaneo] = useState("");
  const [avisoEscaneo, setAvisoEscaneo] = useState<{ texto: string; fueraId: string | null } | null>(null);
  const [ultimaLeida, setUltimaLeida] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState<null | "extra" | "confirmar" | "cerrar">(null);

  const cola = useRef(crearColaEnSerie());
  const temporizadores = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const versiones = useRef(new Map<string, number>());
  const conteosRef = useRef<Conteos>({});
  const estadosRef = useRef<Record<string, EstadoGuardado | undefined>>({});

  const enTransito = t.estado === "en_transito";
  const conDiferencia = t.estado === "recibido_con_diferencia";
  // Solo la sede destino cuenta, mientras el traslado siga abierto; lo que ya entró al stock no se vuelve a contar.
  const contable = esDestino && (enTransito || conDiferencia);

  // Quién recibe (ADR-0328): su combo recuerda en este aparato a quien eligieron para ESTE traslado.
  const recibe = useResponsable(undefined, { recordarEn: claveResponsableRecepcion(t.id) });
  const [laBasePidioNombre, setLaBasePidioNombre] = useState(false);
  const [aMano, setAMano] = useState(false);
  const nombreRecibe = recibe.listo ? (recibe.lista.elegibles.find((p) => p.personaId === recibe.elegidoId)?.nombre ?? null) : null;
  const enPantalla = contable ? firmaEnPantalla(firma, { recordado: nombreRecibe, aMano, laBaseLoPidio: laBasePidioNombre }, "recepcion_traslado") : null;
  const preguntarNombre = enPantalla?.modo === "elegir";
  const conNombre = enPantalla !== null && mandaNombre(enPantalla);
  const sinNombre = preguntarNombre && !recibe.listo;
  const guiaFirma = useGuiaCampos(camposDeFirma("recepcion_traslado", { preguntar: preguntarNombre, responsableListo: recibe.listo }), { enModal: false });
  const comboRecibe = {
    ...recibe,
    elegir: (personaId: string) => {
      setAMano(true);
      recibe.elegir(personaId);
    },
  };
  const firmaDeRecepcion = useRef<() => Firma | FirmaOmitida | null>(() => firmaOmitida("traslado_recibir"));
  useEffect(() => {
    firmaDeRecepcion.current = () => (conNombre ? recibe.firma() : firmaOmitida("traslado_recibir"));
  });
  function despuesDeFirmar(e: { hint?: string | null; message?: string | null; code?: string | null } | null | undefined) {
    if (esPedidoDeNombre(e)) setLaBasePidioNombre(true);
    if (conNombre) recibe.despues(e);
  }

  const lectura = useMemo(() => leerConteo(t.lineas, conteos), [t.lineas, conteos]);
  const resumenGuardado = resumirGuardado(guardado);
  const terminar = puedeTerminar(lectura, resumenGuardado);
  const sugerencias = useMemo(
    () => (escaneo.trim().length < 2 || !contable ? [] : buscarEnTraslado(escaneo, t.lineas).filter((l) => !l.ingresado).slice(0, 6)),
    [escaneo, contable, t.lineas],
  );

  function ponerEstado(varianteId: string, e: EstadoGuardado | undefined) {
    estadosRef.current = { ...estadosRef.current, [varianteId]: e };
    setGuardado(estadosRef.current);
  }

  /** Manda UNA prenda a la base. Devuelve si quedó guardada. */
  function guardarLinea(varianteId: string, valor: number, version: number): Promise<boolean> {
    if (versiones.current.get(varianteId) === version) ponerEstado(varianteId, { tipo: "guardando" });
    return cola.current
      .agregar(async () => {
        const consulta = createClient()
          .rpc("registrar_recepcion_traslado", { p_transferencia_id: t.id, p_variante_id: varianteId, p_cantidad_recibida: valor })
          .setHeader("x-espera", "no");
        const { error } = await firmar(consulta, firmaDeRecepcion.current());
        if (error) throw error;
      })
      .then(
        () => {
          if (versiones.current.get(varianteId) === version) ponerEstado(varianteId, { tipo: "guardado" });
          return true;
        },
        (e: ErrorEscritura) => {
          if (esPedidoDeNombre(e)) setLaBasePidioNombre(true);
          if (versiones.current.get(varianteId) === version) ponerEstado(varianteId, { tipo: "error", mensaje: traducirError(e, "guardar lo contado") });
          return false;
        },
      );
  }

  /** Cambia la casilla y programa su guardado. Vaciarla no se guarda (la base no tiene «sin contar» de vuelta). */
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

  /** Suma (o resta) a una prenda; devuelve cómo quedó. */
  function sumar(varianteId: string, delta: number): number | null {
    const l = t.lineas.find((x) => x.varianteId === varianteId);
    if (!l) return null;
    const nuevo = sumarAlConteo(valorContado(l, conteosRef.current), delta);
    cambiar(varianteId, nuevo);
    return nuevo;
  }

  function reintentar(varianteId: string) {
    const l = t.lineas.find((x) => x.varianteId === varianteId);
    const valor = l ? valorContado(l, conteosRef.current) : null;
    if (valor === null) return;
    const version = (versiones.current.get(varianteId) ?? 0) + 1;
    versiones.current.set(varianteId, version);
    void guardarLinea(varianteId, valor, version);
  }

  /** Manda ya lo que esperaba su turno y espera a que la fila se vacíe. Devuelve si todo quedó guardado. */
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

  // Al volver la red, se reintenta lo que no se guardó.
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
  // Si se sale de la pantalla (o se pasa a otra caja) antes de los 600 ms, lo último contado se manda igual.
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

  /** Lo que llegó al campo de escanear (la pistola manda el código y Enter, o se escribió un nombre). */
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
      setAvisoEscaneo(null);
      setUltimaLeida(r.varianteId);
      sumar(r.varianteId, 1);
      return;
    }
    setAvisoEscaneo({ texto: mensajeEscaneo(r, t.ubicacionOrigenNombre) ?? "", fueraId: r.tipo === "fuera" ? r.varianteId : null });
    // Con varias coincidencias se deja lo escrito para elegir en la lista; si no, se limpia para el próximo escaneo.
    if (r.tipo !== "varias") setEscaneo("");
  }

  /** Lo que la cámara leyó (`EscanerConteo`): el mismo camino que la pistola, y le cuenta a la hoja cómo quedó. */
  function leerConCamara(codigo: string): LecturaCamara {
    const r = resolverEscaneo(codigo, t.lineas, catalogo);
    const l = r.tipo === "linea" || r.tipo === "fuera" ? t.lineas.find((x) => x.varianteId === r.varianteId) : undefined;
    if (r.tipo === "linea" && l && !l.ingresado) {
      setAvisoEscaneo(null);
      setUltimaLeida(l.varianteId);
      const cantidad = sumar(l.varianteId, 1) ?? 0;
      return { encontrada: true, referencia: l.referencia, detalle: [l.talla, l.color].filter(Boolean).join(" · "), sku: codigoPrenda(l), cantidad };
    }
    if (r.tipo === "linea" && l?.ingresado) {
      setAvisoEscaneo({ texto: "Esa prenda ya entró al stock: no hace falta contarla otra vez.", fueraId: null });
      return { encontrada: true, referencia: l.referencia, detalle: [l.talla, l.color].filter(Boolean).join(" · "), sku: codigoPrenda(l), cantidad: valorContado(l, conteosRef.current) ?? 0, atencion: true };
    }
    if (r.tipo === "fuera") {
      const v = catalogo.find((x) => x.varianteId === r.varianteId);
      setAvisoEscaneo({ texto: mensajeEscaneo(r, t.ubicacionOrigenNombre) ?? "", fueraId: r.varianteId });
      return { encontrada: true, referencia: v?.referencia ?? "Prenda", detalle: [v?.talla, v?.color].filter(Boolean).join(" · "), sku: v?.sku ?? "", cantidad: 0, atencion: true };
    }
    return { encontrada: false, codigo };
  }

  /** La prenda que la cámara está contando, con su cifra en vivo. */
  const enCamara = (() => {
    const l = ultimaLeida ? t.lineas.find((x) => x.varianteId === ultimaLeida) : undefined;
    if (!l) return null;
    return { encontrada: true as const, referencia: l.referencia, detalle: [l.talla, l.color].filter(Boolean).join(" · "), sku: codigoPrenda(l), cantidad: valorContado(l, conteos) ?? 0 };
  })();

  /** Una prenda que no venía en el envío: se anota con 1 y queda como diferencia para el líder. */
  async function anotarDeMas(varianteId: string) {
    setTrabajando("extra");
    setError(null);
    const { error } = await firmar(
      createClient().rpc("registrar_recepcion_traslado", { p_transferencia_id: t.id, p_variante_id: varianteId, p_cantidad_recibida: 1 }),
      firmaDeRecepcion.current(),
    );
    setTrabajando(null);
    despuesDeFirmar(error);
    if (error) {
      setError(traducirError(error, "anotar la prenda de más"));
      return;
    }
    setAvisoEscaneo(null);
    avisar.exito("Prenda de más anotada", { detalle: "Quedó en la lista con 1; súmale si llegaron más." });
    router.refresh();
  }

  /** Antes de comparar: todo lo contado tiene que estar guardado. */
  async function terminarDeContar(): Promise<boolean> {
    setError(null);
    if (!(await guardarPendientes())) {
      setError("Hay prendas que no se guardaron. Reintenta antes de terminar.");
      return false;
    }
    return true;
  }

  /** Confirma la recepción. Devuelve si salió bien (el reverso pone el sello; el aviso sale aquí). */
  async function confirmar(destino: DestinoRecepcion): Promise<boolean> {
    setTrabajando("confirmar");
    setError(null);
    if (!(await guardarPendientes())) {
      setTrabajando(null);
      setError("Hay prendas que no se guardaron. Reintenta antes de confirmar.");
      return false;
    }
    const { data, error } = await firmar(
      createClient().rpc("confirmar_traslado", { p_transferencia_id: t.id, p_destino: destino ?? undefined }),
      firmaDeRecepcion.current(),
    );
    setTrabajando(null);
    despuesDeFirmar(error);
    if (error) {
      setError(traducirError(error, "confirmar la recepción"));
      router.refresh();
      return false;
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
    return true;
  }

  /** Cierra con la diferencia (líder de la sede destino). Devuelve si salió bien. */
  async function cerrarConDiferencia(nota: string): Promise<boolean> {
    setTrabajando("cerrar");
    setError(null);
    if (!(await guardarPendientes())) {
      setTrabajando(null);
      setError("Hay prendas que no se guardaron. Reintenta antes de cerrar.");
      return false;
    }
    const { data, error } = await firmar(createClient().rpc("cerrar_traslado_con_diferencia", { p_transferencia_id: t.id, p_nota: nota }), firmaDeRecepcion.current());
    setTrabajando(null);
    despuesDeFirmar(error);
    if (error) {
      setError(traducirError(error, "cerrar el traslado"));
      return false;
    }
    const n = data?.[0]?.unidades_recibidas ?? 0;
    avisar.exito(`Traslado ${t.numero} cerrado`, {
      detalle: n === 0 ? "No entró ninguna prenda más; la diferencia quedó anotada." : `${n === 1 ? "Entró" : "Entraron"} ${prendas(n)} ${lugarTexto(lugarRecibido, t.ubicacionDestinoNombre)}.`,
    });
    return true;
  }

  return {
    contable,
    conteos,
    guardado,
    lectura,
    resumenGuardado,
    terminar,
    cambiar,
    sumar,
    reintentar,
    escaneo,
    setEscaneo,
    avisoEscaneo,
    setAvisoEscaneo,
    alEscanear,
    leerConCamara,
    enCamara,
    ultimaLeida,
    sugerencias,
    anotarDeMas,
    terminarDeContar,
    confirmar,
    cerrarConDiferencia,
    error,
    setError,
    trabajando,
    ocupado: trabajando !== null,
    firma: { comboRecibe, enPantalla, preguntarNombre, sinNombre, guiaFirma, pedirCambio: () => setAMano(true) },
  };
}

export type Recepcion = ReturnType<typeof useRecepcion>;
