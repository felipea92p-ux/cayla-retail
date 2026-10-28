"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { avisar, enfocar } from "@/components/ui/Avisos";
import { campoEtiqueta, campoTexto } from "@/components/ui/Modal";
import { Boton, CampoSelect, Desplegable } from "@/components/ui/campos";
import { ComboResponsable } from "@/components/ComboResponsable";
import { useResponsable } from "@/lib/useResponsable";
import { firmar } from "@/lib/responsable-reglas";
import { TrasladoEnviado } from "@/components/TrasladoEnviado";
import { etiquetaDePrenda, type PrendaEnviada } from "@/lib/traslados-reglas";
import { juntarPorPrenda, prendasNoDisponibles } from "@/lib/traslado-lineas-reglas";
import { Package } from "lucide-react";
import { Aviso } from "@/components/ui/Aviso";
import { Vacio } from "@/components/ui/Vacio";
import { AvisoIntentoIncierto, avisarCongelado } from "@/components/ui/AvisoIntentoIncierto";
import { useIntento } from "@/lib/useIntento";
import { avisoDeTraslado, conEnvio, huellaDe, sinEnvio, trasladosGuardados } from "@/lib/intento-reglas";
import { useEnviosEnCurso } from "@/lib/useEnviosEnCurso";
import { claveLocal, guardar, leer } from "@/lib/almacen-local";
import { hoyLima } from "@/lib/fechas-lima";

// Fase UI 1.1 (2026-09-12): sobre la RPC `transferir` de V2
// (`supabase/migrations/0003_funciones.sql:286`), pedida por Felipe tras ver
// que "+Nuevo" solo ofrecía Recepción. Mismo patrón que la puerta «Llegó mercadería» (`LlegoMercaderia.tsx`).
//
// Traslado en dos fases (2026-09-16, `iniciar_traslado`,
// `20260916150000_traslados_dos_fases.sql`): este formulario ya NO deja el
// stock listo en destino — solo lo saca del origen. El destino confirma
// después en `/inventario/traslados/[id]`, con lo que realmente llegó.
//
// El origen NO es un campo del formulario: es siempre la ubicación de quien
// está parado ahí (`fn_puede_operar_ubicacion` en el RPC lo exige igual — un
// integrante no puede mover DESDE una sede que no es la suya). El destino
// viene exclusivamente de `retail.ubicaciones` vía props — nunca texto libre
// — así que un traslado nunca puede apuntar a un lugar que no existe en la
// tabla. La cantidad de cada línea se limita al stock real que ya trajo el
// servidor: no se puede mover lo que no hay, la UI lo impide antes de que el
// RPC tenga que rechazarlo.
type VarianteConStock = {
  varianteId: string;
  sku: string;
  referencia: string;
  talla: string | null;
  color: string | null;
  cantidad: number;
};
/** `whatsapp`: el celular de WhatsApp de la sede (solo las tiendas lo tienen) para avisarle que salió una caja; null = sin chat directo. */
type Ubicacion = { id: string; nombre: string; whatsapp?: string | null };
// `cantidad` es texto, no número — mismo patrón que ya usa `ConteoPanel.tsx`
// para su campo de cantidad. Un input controlado con `value={numero}` y
// `onChange={(e) => setNumero(Number(e.target.value) || 1)}` nunca puede
// quedar vacío: `Number("") || 1` vuelve a "1" en la MISMA tecla que borra
// el campo, así que borrar para escribir un número nuevo no se podía hacer
// (bug real, reportado por Felipe 2026-09-17). Con texto libre se puede
// vaciar el campo mientras se escribe; el tope de stock se aplica recién al
// salir del campo (`normalizarCantidad`) y otra vez al enviar — nunca a
// mitad de tecla.
type Linea = { varianteId: string; cantidad: string };

// El formulario no decide por ti (ADR-0239, hallazgo 6): el destino y cada prenda empiezan VACÍOS, con su marcador,
// y «+ Agregar otra prenda» suma una línea vacía. Antes el destino venía puesto en el primero de la lista (el Taller)
// y cada línea nueva traía la primera prenda del catálogo: si se te olvidaba cambiarla, esa prenda viajaba.
// Enviar exige destino y prenda en cada línea; el error sale JUNTO al campo (no en una esquina) y el cursor va ahí.
const LINEA_VACIA: Linea = { varianteId: "", cantidad: "1" };
/** El tope de la nota: el mismo que pone la base (`traslado_nota_larga`, ADR-0401). */
const MAX_NOTA_TRASLADO = 200;
type Errores = { destino?: string; eta?: string; lineas: Record<number, string> };
const SIN_ERRORES: Errores = { lineas: {} };
const idLinea = (i: number) => `mover-linea-${i}`;

/** Cuánto se espera el número antes de mostrar la pantalla sin él. El formulario sigue bloqueado mientras tanto (un clic
 *  de más crearía un traslado duplicado): sin tope, una red que se cuelga lo dejaría en «Enviando…» con el traslado ya
 *  guardado, y la persona, creyendo que falló, lo enviaría otra vez. */
const ESPERA_MAXIMA_DEL_NUMERO_MS = 2000;

/** El número corrido del traslado recién creado («Traslado 12»). La RPC devuelve solo el id. Es una lectura que no abre el
 *  loader global (GET a Supabase, ADR-0149). Si falla o tarda más del tope, `null`: el traslado YA está guardado, solo se
 *  pierde el número en pantalla. */
async function leerNumeroDelTraslado(supabase: ReturnType<typeof createClient>, id: string): Promise<number | null> {
  const lectura = (async () => {
    try {
      const { data } = await supabase.from("transferencias").select("numero").eq("id", id).maybeSingle();
      return typeof data?.numero === "number" ? data.numero : null;
    } catch {
      return null;
    }
  })();
  const tope = new Promise<null>((resolver) => setTimeout(() => resolver(null), ESPERA_MAXIMA_DEL_NUMERO_MS));
  return Promise.race([lectura, tope]);
}

export function MoverMercaderiaFormV2({
  origenId,
  origenEtiqueta,
  destinos,
  variantes,
  destinoInicialId,
  lineaInicial,
  lineasIniciales,
}: {
  origenId: string;
  origenEtiqueta: string;
  destinos: Ubicacion[];
  variantes: VarianteConStock[];
  /** Prellenado desde una sugerencia de Resumen (ADR-0101). La página ya
   *  validó que el destino existe y que la variante tiene stock movible en
   *  el origen; acá solo se usa como valor inicial — el usuario sigue
   *  decidiendo todo antes de enviar. */
  destinoInicialId?: string;
  lineaInicial?: { varianteId: string; cantidad: number };
  /** Varias líneas prellenadas (Producción, ADR-0133 F8): la página ya descartó lo que no tiene stock movible y topó cada cantidad. Si viene con datos, manda sobre `lineaInicial`. */
  lineasIniciales?: { varianteId: string; cantidad: number }[];
}) {
  const router = useRouter();
  const [destinoId, setDestinoId] = useState(destinoInicialId ?? "");
  const [nota, setNota] = useState("");
  const [etaLocal, setEtaLocal] = useState("");
  const [lineas, setLineas] = useState<Linea[]>(
    lineasIniciales && lineasIniciales.length > 0
      ? lineasIniciales.map((l) => ({ varianteId: l.varianteId, cantidad: String(Math.max(1, l.cantidad)) }))
      : [
    lineaInicial
      ? { varianteId: lineaInicial.varianteId, cantidad: String(Math.max(1, Math.min(lineaInicial.cantidad, variantes.find((v) => v.varianteId === lineaInicial.varianteId)?.cantidad ?? 1))) }
      : LINEA_VACIA,
  ]);
  const [errores, setErrores] = useState<Errores>(SIN_ERRORES);
  const [loading, setLoading] = useState(false);
  const [revisando, setRevisando] = useState(false);
  // Lo que se ve tras enviar: el traslado ya está guardado, con su número y su lista (`TrasladoEnviado`).
  const [ok, setOk] = useState<{ id: string | null; numero: number | null; destino: string; whatsapp: string | null; prendas: PrendaEnviada[] } | null>(null);
  // La marca del envío sigue a lo que se manda (ADR-0398/0401): dos clics o un reintento con LO MISMO no envían dos veces; si la
  // respuesta se pierde, el formulario se congela hasta reenviar lo mismo o preguntar si se guardó. Antes el token se renovaba solo
  // al guardar bien: tras una respuesta perdida, corregir a 3 y reintentar anunciaba «3 enviadas» y la base tenía las 2 del primero.
  const intento = useIntento("iniciar_traslado");
  // El traslado en curso (NAV-03): se anota antes de mandarlo y se borra al saber qué pasó. Si la página se recarga mientras se
  // envía, al volver esta pantalla le pregunta a la base por ese envío y dice si salió (antes volvía vacía y se enviaba de nuevo).
  const claveTraslado = claveLocal(origenId, "traslado-en-curso");
  // Enviar un traslado saca stock del origen: pide Responsable (ADR-0161). La lista es la de turno en el ORIGEN,
  // que es donde está parada quien envía.
  const responsable = useResponsable({ ubicacionId: origenId, etiqueta: origenEtiqueta });

  useEnviosEnCurso({
    clave: claveTraslado,
    operacion: "iniciar_traslado",
    guardados: trasladosGuardados,
    tokenPropio: () => intento.instantanea()?.marca.token,
    avisoDe: avisoDeTraslado,
    alHecho: () => router.refresh(),
  });
  // Mientras se envía o el envío está en duda, cerrar o recargar la pestaña pregunta antes (el envío anotado igual se resuelve al
  // volver, pero quien despacha no se entera en el momento).
  useEffect(() => {
    if (!loading && !intento.incierto) return;
    const antesDeSalir = (ev: BeforeUnloadEvent) => {
      ev.preventDefault();
      ev.returnValue = "";
    };
    window.addEventListener("beforeunload", antesDeSalir);
    return () => window.removeEventListener("beforeunload", antesDeSalir);
  }, [loading, intento.incierto]);

  function stockDe(varianteId: string): number {
    return variantes.find((v) => v.varianteId === varianteId)?.cantidad ?? 0;
  }

  function agregarLinea() {
    setLineas((actual) => [...actual, LINEA_VACIA]);
    // La línea nueva recibe el cursor: se agregó para elegir una prenda.
    enfocar(idLinea(lineas.length));
  }

  function quitarLinea(i: number) {
    setLineas((actual) => actual.filter((_, n) => n !== i));
    // Los errores de línea van por posición: al quitar una, los de abajo suben un lugar.
    setErrores((e) => {
      const lineasErr: Record<number, string> = {};
      for (const [k, v] of Object.entries(e.lineas)) {
        const n = Number(k);
        if (n < i) lineasErr[n] = v;
        else if (n > i) lineasErr[n - 1] = v;
      }
      return { ...e, lineas: lineasErr };
    });
  }

  // El tope de una línea no es el stock total de la variante: hay que restar
  // lo que OTRAS líneas del mismo formulario ya le piden a esa misma
  // variante. Sin esto, la misma prenda con 10 unidades podía pedirse
  // 10+10 en dos líneas — `iniciar_traslado` rechaza la segunda con "Stock
  // insuficiente", pero el formulario nunca avisó por qué.
  // Desde que el combo no deja repetir una prenda entre líneas
  // (`prendasNoDisponibles`), esto solo actúa si dos líneas llegaran con la
  // misma: queda como red, para que sus cantidades sumadas no pasen del stock.
  function topeDeLinea(actual: Linea[], i: number, varianteId: string): number {
    const usadoEnOtras = actual.reduce(
      (acc, otra, m) => (m !== i && otra.varianteId === varianteId ? acc + (Number(otra.cantidad) || 0) : acc),
      0
    );
    return Math.max(0, stockDe(varianteId) - usadoEnOtras);
  }

  function actualizarLinea(i: number, cambio: Partial<Linea>) {
    if (errores.lineas[i]) {
      setErrores((e) => {
        const resto = { ...e.lineas };
        delete resto[i];
        return { ...e, lineas: resto };
      });
    }
    setLineas((actual) =>
      actual.map((l, n) => {
        if (n !== i) return l;
        const siguiente = { ...l, ...cambio };
        // Cambiar la CANTIDAD se deja pasar tal cual, sin tocarla — es
        // exactamente lo que el usuario está escribiendo, vacío incluido.
        // Cambiar la PRENDA sí revalida al toque: el tope cambia con ella,
        // y una cantidad que ya no cabe se recorta antes de mostrarla.
        if (!("varianteId" in cambio)) return siguiente;
        const tope = topeDeLinea(actual, i, siguiente.varianteId);
        const actualN = Math.trunc(Number(siguiente.cantidad)) || 1;
        return { ...siguiente, cantidad: String(Math.max(1, Math.min(actualN, tope || 1))) };
      })
    );
  }

  // Al salir del campo (no en cada tecla): recorta a un entero entre 1 y el
  // tope real. Antes vivía a mitad de tecla y por eso nunca se podía borrar
  // el campo para escribir un número nuevo — ver el comentario en `Linea`.
  function normalizarCantidad(i: number) {
    setLineas((actual) =>
      actual.map((l, n) => {
        if (n !== i) return l;
        const tope = topeDeLinea(actual, i, l.varianteId);
        const num = Math.trunc(Number(l.cantidad)) || 1;
        return { ...l, cantidad: String(Math.max(1, Math.min(num, tope || 1))) };
      })
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!responsable.listo) return;
    // Todo lo que falta se dice de una vez, cada cosa junto a su campo; el cursor va a la primera.
    const nuevos: Errores = { lineas: {} };
    if (!destinoId) nuevos.destino = "Elige a qué sede va el traslado.";
    if (!etaLocal) nuevos.eta = "Indica cuándo esperas que llegue.";
    else if (etaLocal.slice(0, 10) < hoyLima()) nuevos.eta = "La llegada no puede ser antes de hoy.";
    const conCantidad = lineas.map((l) => ({ ...l, cantidadNum: Math.trunc(Number(l.cantidad)) }));
    conCantidad.forEach((l, i) => {
      if (!l.varianteId) nuevos.lineas[i] = "Elige la prenda, o quita esta línea.";
      else if (!(l.cantidadNum > 0)) nuevos.lineas[i] = "Escribe cuántas envías.";
    });
    const primeraLineaMala = Object.keys(nuevos.lineas).map(Number).sort((a, b) => a - b)[0];
    const primerError = nuevos.destino ? "mover-destino" : nuevos.eta ? "mover-eta" : primeraLineaMala !== undefined ? idLinea(primeraLineaMala) : null;
    setErrores(nuevos);
    if (primerError) {
      enfocar(primerError);
      return;
    }
    // Una fila por prenda: `transferencia_items` no admite la misma `variante_id` dos veces en un traslado. El combo ya
    // no deja repetirla; esto es la red por si dos líneas llegaran con la misma (se suman, no se rechazan).
    const items = juntarPorPrenda(conCantidad);
    const sedeDestino = destinos.find((d) => d.id === destinoId);
    const destino = sedeDestino?.nombre ?? "";
    const unidades = items.reduce((acc, it) => acc + it.cantidad, 0);
    const notaLimpia = nota.trim();
    setLoading(true);

    const supabase = createClient();
    const r = await intento.enviar<string>(huellaDe({ origenId, destinoId, items, eta: etaLocal, nota: notaLimpia }), (token, senal) => {
      guardar(claveTraslado, conEnvio(trasladosGuardados(leer(claveTraslado, [])), { token, destino, prendas: unidades, enviadoEn: new Date().toISOString() }));
      return firmar(
        supabase.rpc("iniciar_traslado", {
          p_ubicacion_origen_id: origenId,
          p_ubicacion_destino_id: destinoId,
          p_items: items,
          p_fecha_estimada_llegada: new Date(etaLocal).toISOString(),
          p_nota: notaLimpia || undefined,
          p_token: token,
        }),
        responsable.firma(),
      ).abortSignal(senal);
    });
    // Otro envío ya está en camino (una ráfaga de clics): este no manda nada.
    if (r.tipo === "ocupado") return;
    if (r.tipo === "congelado") {
      setLoading(false);
      avisarCongelado(avisar);
      return;
    }
    responsable.despues(r.tipo === "error" || r.tipo === "incierto" ? r.error : null);
    // En duda: el formulario lo dice sobre el botón y se congela hasta saber qué pasó. El traslado anotado queda por resolver.
    if (r.tipo === "incierto") {
      setLoading(false);
      return;
    }
    guardar(claveTraslado, sinEnvio(trasladosGuardados(leer(claveTraslado, [])), r.token));
    if (r.tipo === "error") {
      setLoading(false);
      avisar.error(traducirError(r.error, "iniciar el traslado"));
      return;
    }
    const id = r.tipo === "ok" ? (typeof r.data === "string" ? r.data : null) : typeof r.datos.transferencia_id === "string" ? r.datos.transferencia_id : null;
    await mostrarEnviado(id, items, destino, sedeDestino?.whatsapp ?? null, unidades);
  }

  /** Lo que se ve al saber que salió: su número, su lista y el aviso. El formulario sigue bloqueado mientras se lee el número. */
  async function mostrarEnviado(id: string | null, items: { variante_id: string; cantidad: number }[], destino: string, whatsapp: string | null, unidades: number) {
    setLoading(true);
    setOk({
      id,
      numero: id ? await leerNumeroDelTraslado(createClient(), id) : null,
      destino,
      whatsapp,
      // Lo que de verdad se guardó: una fila por prenda (`items`), no las líneas tecleadas.
      prendas: items.map((it) => {
        const v = variantes.find((x) => x.varianteId === it.variante_id);
        return { etiqueta: v ? etiquetaDePrenda(v) : "Prenda", cantidad: it.cantidad };
      }),
    });
    setLoading(false);
    avisar.exito(`${unidades} ${unidades === 1 ? "prenda enviada" : "prendas enviadas"} a ${destino}`, {
      detalle: "Salió de tu almacén ahora. Entra a la otra sede cuando la cuenten al recibirla.",
    });
    router.refresh();
  }

  /** «Revisar si se guardó»: le pregunta a la base por el envío en duda. */
  async function revisar() {
    const token = intento.instantanea()?.marca.token;
    setRevisando(true);
    const res = await intento.revisar();
    setRevisando(false);
    if (res.tipo === "sin_respuesta") {
      avisar.error("Todavía no hay respuesta", { detalle: "Revisa el internet y vuelve a tocar «Revisar si se guardó»." });
      return;
    }
    if (token) guardar(claveTraslado, sinEnvio(trasladosGuardados(leer(claveTraslado, [])), token));
    if (res.tipo === "no_llego") {
      avisar.aviso("El traslado no se envió", { detalle: "No salió nada de tu almacén. Revisa los datos y vuelve a enviarlo." });
      return;
    }
    // Salió: lo que se ve es lo que estaba en el formulario (congelado desde el envío, así que es lo mismo que se guardó).
    const items = juntarPorPrenda(lineas.map((l) => ({ ...l, cantidadNum: Math.trunc(Number(l.cantidad)) })));
    const sedeDestino = destinos.find((d) => d.id === destinoId);
    const unidades = typeof res.datos.prendas === "number" ? res.datos.prendas : items.reduce((acc, it) => acc + it.cantidad, 0);
    await mostrarEnviado(typeof res.datos.transferencia_id === "string" ? res.datos.transferencia_id : null, items, sedeDestino?.nombre ?? "", sedeDestino?.whatsapp ?? null, unidades);
  }

  if (ok) {
    return (
      <TrasladoEnviado
        id={ok.id}
        numero={ok.numero}
        origen={origenEtiqueta}
        destino={ok.destino}
        whatsappDestino={ok.whatsapp}
        prendas={ok.prendas}
        onOtro={() => {
          // El siguiente envío también empieza vacío: el destino de este no se arrastra al otro.
          setOk(null);
          setDestinoId("");
          setLineas([LINEA_VACIA]);
          setNota("");
          setEtaLocal("");
          setErrores(SIN_ERRORES);
        }}
      />
    );
  }

  if (variantes.length === 0) {
    return (
      <div className="card-cayla">
        <Vacio icono={<Package />} titulo="No hay prendas para mover">
          {origenEtiqueta} no tiene stock disponible para mover.
        </Vacio>
      </div>
    );
  }

  return (
    // `noValidate`: los avisos del navegador salen en su propio globo y su idioma; los de este formulario, junto al campo.
    <form onSubmit={onSubmit} noValidate className="card-cayla space-y-5 p-5">
      {/* Los campos se congelan mientras no se sabe si el traslado salió (`useIntento`): solo se puede reenviar lo mismo o revisar. */}
      <fieldset disabled={intento.incierto} className="campos-congelables min-w-0 space-y-5">
      <div data-guia="nuevo-traslado.ruta" className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <span className={campoEtiqueta}>Desde</span>
          <p className="w-full border-b border-tinta/10 px-1 py-2 text-sm text-tinta/75">{origenEtiqueta}</p>
        </div>
        {/* Vacío hasta que la persona elige (marcador, no una opción): ADR-0209. El id es el del disparador, para
            llevar el cursor ahí si falta. */}
        <CampoSelect
          etiqueta="Hacia"
          id="mover-destino"
          valor={destinoId}
          onValor={(v) => {
            setDestinoId(v);
            if (errores.destino) setErrores((e) => ({ ...e, destino: undefined }));
          }}
          opciones={destinos.map((d) => ({ valor: d.id, texto: d.nombre }))}
          marcador="Elige a qué sede"
          pie={errores.destino}
          tono={errores.destino ? "error" : "neutro"}
        />
      </div>

      <div data-guia="nuevo-traslado.cuando" className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label className={campoEtiqueta} htmlFor="mover-eta">
            Llega aproximadamente
          </label>
          <input
            id="mover-eta"
            type="datetime-local"
            className={campoTexto}
            min={`${hoyLima()}T00:00`}
            value={etaLocal}
            onChange={(e) => {
              setEtaLocal(e.target.value);
              if (errores.eta) setErrores((x) => ({ ...x, eta: undefined }));
            }}
            aria-invalid={errores.eta ? true : undefined}
            aria-describedby={errores.eta ? "mover-eta-error" : undefined}
          />
          {errores.eta && (
            <Aviso tono="error" chico id="mover-eta-error">
              {errores.eta}
            </Aviso>
          )}
        </div>
        <div className="space-y-1.5">
          <label className={campoEtiqueta} htmlFor="mover-nota">
            Nota (opcional)
          </label>
          <input id="mover-nota" value={nota} maxLength={MAX_NOTA_TRASLADO} onChange={(e) => setNota(e.target.value)} className={campoTexto} />
        </div>
      </div>

      <div data-guia="nuevo-traslado.prendas" className="space-y-3">
        <p className={campoEtiqueta}>Prendas que envías</p>
        {lineas.map((l, i) => {
          const tope = stockDe(l.varianteId);
          const error = errores.lineas[i];
          // Una prenda va una sola vez por traslado: la que ya está en otra línea se ve, con su motivo, pero no se elige.
          const yaElegidas = prendasNoDisponibles(lineas, i);
          return (
            <div key={i} className="space-y-1">
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-[14rem] flex-1">
                {/* Vacía hasta que se elige (ADR-0239): el marcador lo pide. El código va al final y solo si existe —
                    sirve para buscar escribiéndolo, pero no es lo que se lee primero. */}
                <Desplegable
                  id={idLinea(i)}
                  valor={l.varianteId}
                  onValor={(v) => actualizarLinea(i, { varianteId: v })}
                  opciones={variantes.map((v) => {
                    const repetida = yaElegidas.has(v.varianteId);
                    return {
                      valor: v.varianteId,
                      texto: `${etiquetaDePrenda(v)} — hay ${v.cantidad}${repetida ? " · ya está en otra línea" : ""}${v.sku ? ` · ${v.sku}` : ""}`,
                      deshabilitada: repetida,
                    };
                  })}
                  marcador="Elige la prenda"
                  etiquetaAccesible={`Prenda ${i + 1}`}
                />
              </div>
              <input
                type="number"
                min={1}
                max={l.varianteId ? tope : undefined}
                aria-label="Cantidad"
                value={l.cantidad}
                onChange={(e) => actualizarLinea(i, { cantidad: e.target.value })}
                onBlur={() => normalizarCantidad(i)}
                className="caja-campo-input w-20 text-center"
              />
              {l.varianteId && <span className="text-xs text-tinta/65">de {tope}</span>}
              {lineas.length > 1 && (
                <button type="button" onClick={() => quitarLinea(i)} className="text-xs text-rojo">
                  Quitar
                </button>
              )}
            </div>
            {error && (
              <Aviso tono="error" chico>
                {error}
              </Aviso>
            )}
            </div>
          );
        })}
        {/* Una acción chica que agrega algo: botón chico (ADR-0358, ronda 9); el «+» lo dibuja la pieza y da su cuarto de vuelta. */}
        <Boton type="button" peso="discreto" onClick={agregarLinea} className="btn-chico self-start">
          + Agregar otra prenda
        </Boton>
      </div>

      <div data-guia="nuevo-traslado.responsable">
        <ComboResponsable control={responsable} deshabilitado={loading || intento.incierto} />
      </div>
      </fieldset>
      {intento.incierto && <AvisoIntentoIncierto onRevisar={revisar} revisando={revisando} />}
      <Boton type="submit" peso="primario" cargando={loading} textoCargando="Enviando…" data-guia="nuevo-traslado.enviar" disabled={revisando || !responsable.listo} title={responsable.motivo ?? undefined} className="flex-1">
        {intento.incierto ? "Volver a intentar" : destinoId ? `Enviar a ${destinos.find((d) => d.id === destinoId)?.nombre ?? "…"}` : "Enviar traslado"}
      </Boton>
    </form>
  );
}
