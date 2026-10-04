"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { avisar, enfocar } from "@/components/ui/Avisos";
import { campoEtiqueta, campoTexto, botonPrimario } from "@/components/ui/Modal";
import { CampoSelect, Desplegable } from "@/components/ui/campos";
import { ComboResponsable } from "@/components/ComboResponsable";
import { useResponsable } from "@/lib/useResponsable";
import { firmar } from "@/lib/responsable-reglas";
import { TrasladoEnviado } from "@/components/TrasladoEnviado";
import { etiquetaDePrenda, type PrendaEnviada } from "@/lib/traslados-reglas";

// Fase UI 1.1 (2026-09-12): sobre la RPC `transferir` de V2
// (`supabase/migrations/0003_funciones.sql:286`), pedida por Felipe tras ver
// que "+Nuevo" solo ofrecía Recepción. Mismo patrón que `RecepcionFormV2.tsx`.
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
  // Lo que se ve tras enviar: el traslado ya está guardado, con su número y su lista (`TrasladoEnviado`).
  const [ok, setOk] = useState<{ id: string | null; numero: number | null; destino: string; whatsapp: string | null; prendas: PrendaEnviada[] } | null>(null);
  // Doble clic (ADR-0190): un token por intento. Si el mismo intento llega dos veces (dos clics, un reintento tras
  // una red que se cae), la base devuelve lo ya guardado en vez de descontar el stock dos veces. Se renueva solo al guardar bien.
  const token = useRef<string>(crypto.randomUUID());
  // Enviar un traslado saca stock del origen: pide Responsable (ADR-0161). La lista es la de turno en el ORIGEN,
  // que es donde está parada quien envía.
  const responsable = useResponsable({ ubicacionId: origenId, etiqueta: origenEtiqueta });

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
    const validas = conCantidad;
    setLoading(true);

    const supabase = createClient();
    const { data: trasladoId, error } = await firmar(supabase.rpc("iniciar_traslado", {
      p_ubicacion_origen_id: origenId,
      p_ubicacion_destino_id: destinoId,
      p_items: validas.map((l) => ({ variante_id: l.varianteId, cantidad: l.cantidadNum })),
      p_fecha_estimada_llegada: new Date(etaLocal).toISOString(),
      p_nota: nota || undefined,
      p_token: token.current,
    }), responsable.firma());

    responsable.despues(error);
    if (error) {
      setLoading(false);
      avisar.error(traducirError(error, "iniciar el traslado"));
      return;
    }
    // El formulario sigue bloqueado (`loading`) hasta que sale la pantalla de «enviado»: entre el guardado y la lectura
    // del número hay una espera, y con el token ya renovado un segundo clic ahí crearía un traslado duplicado.
    token.current = crypto.randomUUID();
    const unidades = validas.reduce((acc, l) => acc + l.cantidadNum, 0);
    const sedeDestino = destinos.find((d) => d.id === destinoId);
    const destino = sedeDestino?.nombre ?? "";
    const id = typeof trasladoId === "string" ? trasladoId : null;
    setOk({
      id,
      numero: id ? await leerNumeroDelTraslado(supabase, id) : null,
      destino,
      whatsapp: sedeDestino?.whatsapp ?? null,
      prendas: validas.map((l) => {
        const v = variantes.find((x) => x.varianteId === l.varianteId);
        return { etiqueta: v ? etiquetaDePrenda(v) : "Prenda", cantidad: l.cantidadNum };
      }),
    });
    setLoading(false);
    avisar.exito(`${unidades} ${unidades === 1 ? "prenda enviada" : "prendas enviadas"} a ${destino}`, {
      detalle: "Salió de tu almacén ahora. Entra a la otra sede cuando la cuenten al recibirla.",
    });
    router.refresh();
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
      <p className="card-cayla p-5 text-sm text-tinta/75">{origenEtiqueta} no tiene stock disponible para mover.</p>
    );
  }

  return (
    // `noValidate`: los avisos del navegador salen en su propio globo y su idioma; los de este formulario, junto al campo.
    <form onSubmit={onSubmit} noValidate className="card-cayla space-y-5 p-5">
      <div className="grid gap-4 sm:grid-cols-2">
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

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label className={campoEtiqueta} htmlFor="mover-eta">
            Llega aproximadamente
          </label>
          <input
            id="mover-eta"
            type="datetime-local"
            value={etaLocal}
            onChange={(e) => {
              setEtaLocal(e.target.value);
              if (errores.eta) setErrores((x) => ({ ...x, eta: undefined }));
            }}
            aria-invalid={errores.eta ? true : undefined}
            aria-describedby={errores.eta ? "mover-eta-error" : undefined}
            className={campoTexto}
          />
          {errores.eta && (
            <p id="mover-eta-error" className="anim-revelar text-xs text-rojo">
              {errores.eta}
            </p>
          )}
        </div>
        <div className="space-y-1.5">
          <label className={campoEtiqueta} htmlFor="mover-nota">
            Nota (opcional)
          </label>
          <input id="mover-nota" value={nota} onChange={(e) => setNota(e.target.value)} className={campoTexto} />
        </div>
      </div>

      <div className="space-y-3">
        <p className={campoEtiqueta}>Prendas que envías</p>
        {lineas.map((l, i) => {
          const tope = stockDe(l.varianteId);
          const error = errores.lineas[i];
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
                  opciones={variantes.map((v) => ({
                    valor: v.varianteId,
                    texto: `${etiquetaDePrenda(v)} — hay ${v.cantidad}${v.sku ? ` · ${v.sku}` : ""}`,
                  }))}
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
                className="w-20 border-b border-tinta/20 bg-transparent px-1 py-2 text-center text-sm text-tinta outline-none focus:border-rojo"
              />
              {l.varianteId && <span className="text-xs text-tinta/65">de {tope}</span>}
              {lineas.length > 1 && (
                <button type="button" onClick={() => quitarLinea(i)} className="text-xs text-rojo">
                  Quitar
                </button>
              )}
            </div>
            {error && <p className="anim-revelar text-xs text-rojo">{error}</p>}
            </div>
          );
        })}
        <button type="button" onClick={agregarLinea} className="label-cayla text-[11px] text-tinta/65 hover:text-rojo">
          + Agregar otra prenda
        </button>
      </div>

      <ComboResponsable control={responsable} deshabilitado={loading} />
      <button type="submit" disabled={loading || !responsable.listo} title={responsable.motivo ?? undefined} className={botonPrimario}>
        {loading ? "Enviando…" : destinoId ? `Enviar a ${destinos.find((d) => d.id === destinoId)?.nombre ?? "…"}` : "Enviar traslado"}
      </button>
    </form>
  );
}
