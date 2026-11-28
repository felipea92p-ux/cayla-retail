"use client";

// «Proponer precio» (ADR-0641): Claude mira el costo y las prendas parecidas y propone el precio de etiqueta; la regla fija lo lleva a .90 y
// nunca lo deja bajo el margen objetivo de la prenda (ADR-0700: la base del Admin más lo que tiene). La propuesta no se guarda sola: «Usar S/ …» llena el campo y la persona confirma al crear la
// prenda, como siempre.
//
// Dos lugares: Nuevo producto (con el botón, Felipe 2026-11-10; desde el 2026-11-28 `discreta`: el precio que manda es el sugerido de la regla
// y la IA queda como una segunda opinión chica, a pedido —«lo inicial que se ve es lo de la IA y son otro tipo de datos»—) y la hoja de la
// prenda nueva de Recibir mercadería, donde sale SOLA al llegar
// al paso del precio y se elige entre lo que sugirió quien compró y lo que propone la IA (Felipe 2026-11-11, «sola, al llegar al paso»). Una
// respuesta ya pedida con los mismos datos se recuerda mientras la pantalla está abierta: ir y volver de paso no vuelve a gastar.
//
// En Recibir se pide ANTES de llegar (Felipe 2026-11-13: «lo pudo haber hecho desde que empecé a crear el producto»): la hoja la adelanta al
// abrirse con `adelantarPropuestaDePrecio`, y otra vez solo si cambia el tejido. Al llegar al precio, la pieza toma esa misma consulta
// (lista o a medio camino) en vez de pedir otra.

import { Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { RespuestaProponer } from "@/app/api/precio/proponer/route";
import { Aviso } from "@/components/ui/Aviso";
import { Chip } from "@/components/ui/Chip";
import { Boton } from "@/components/ui/campos";
import { soles } from "@/lib/compras-reglas";
import { listaDicha } from "@/lib/lista-dicha";
import type { Rasgo } from "@/lib/margen-por-rasgos";

type Estado = { tipo: "nada" } | { tipo: "pidiendo" } | { tipo: "error"; texto: string } | RespuestaEnPantalla;
type RespuestaEnPantalla = { tipo: "listo"; respuesta: RespuestaProponer };

type Final = Exclude<Estado, { tipo: "nada" } | { tipo: "pidiendo" }>;

/** Con qué datos se pide una propuesta. */
type DatosPropuesta = {
  origen: "alta" | "recepcion";
  productoId?: string;
  /** Lo que la prenda tiene en efecto, como lo ve la pantalla (ADR-0700). Sin él, el servidor usa el de la prenda guardada (o ninguno). */
  rasgos?: readonly Rasgo[];
  categoriaId: string;
  tejidoId: string;
  referencia: string;
  descripcion: string;
  costoBase: string;
};

/** Lo ya respondido en esta pantalla, por los datos con que se pidió. */
const YA_RESPONDIDO = new Map<string, RespuestaProponer>();
/** Lo pedido por adelantado y todavía no mostrado (lista o a medio camino), por los datos con que se pidió. */
const ADELANTADAS = new Map<string, Promise<Final>>();

// Una propuesta se calculó con un costo y una categoría: si cambian, ya no vale (podría quedar bajo el piso del costo nuevo).
function claveDe(d: DatosPropuesta): string {
  return `${d.origen}|${d.productoId ?? ""}|${d.categoriaId}|${d.tejidoId}|${d.costoBase}|${d.rasgos ? d.rasgos.join(",") : "-"}`;
}

async function pedirAlServidor(d: DatosPropuesta): Promise<Final> {
  const costo = Number(d.costoBase);
  try {
    const r = await fetch("/api/precio/proponer", {
      method: "POST",
      // Sin el loader de pantalla completa: la persona sigue viendo el formulario y el botón dice «Calculando…».
      headers: { "content-type": "application/json", "x-espera": "no" },
      body: JSON.stringify({
        origen: d.origen,
        categoriaId: d.categoriaId || null,
        productoId: d.productoId ?? null,
        tejidoId: d.tejidoId || null,
        referencia: d.referencia.trim() || null,
        descripcion: d.descripcion.trim() || null,
        costo: d.costoBase.trim() !== "" && Number.isFinite(costo) && costo > 0 ? costo : null,
        ...(d.rasgos ? { rasgos: d.rasgos } : {}),
      }),
    });
    const datos = (await r.json().catch(() => null)) as (RespuestaProponer & { error?: string }) | null;
    if (!r.ok || !datos || datos.error) return { tipo: "error", texto: datos?.error ?? "No respondió. Prueba de nuevo o ponlo tú." };
    if ("propuesta" in datos) YA_RESPONDIDO.set(claveDe(d), datos);
    return { tipo: "listo", respuesta: datos };
  } catch {
    return { tipo: "error", texto: "Sin conexión. Prueba de nuevo." };
  }
}

/**
 * Pide la propuesta antes de que la pieza aparezca, para que al llegar al precio ya esté (o esté más cerca). Con los mismos datos no
 * vuelve a pedir: ni si ya se respondió ni si va en camino. Si falla, la pieza la pide de nuevo al aparecer.
 */
export function adelantarPropuestaDePrecio(d: DatosPropuesta): void {
  if (!d.categoriaId && !d.productoId) return;
  const clave = claveDe(d);
  if (YA_RESPONDIDO.has(clave) || ADELANTADAS.has(clave)) return;
  ADELANTADAS.set(clave, pedirAlServidor(d));
}

export function PropuestaDePrecio({
  categoriaId,
  tejidoId,
  referencia,
  descripcion,
  costoBase,
  precioBase,
  disabled,
  onUsar,
  origen = "alta",
  automatica = false,
  onDejar,
  productoId,
  rasgos,
  discreta = false,
}: {
  categoriaId: string;
  tejidoId: string;
  referencia: string;
  descripcion: string;
  costoBase: string;
  precioBase: string;
  disabled?: boolean;
  onUsar: (precio: string) => void;
  /** «recepcion»: la hoja de la prenda nueva de Recibir (anota de dónde vino la propuesta). */
  origen?: "alta" | "recepcion";
  /** Pedirla sola al aparecer (Recibir), en vez de esperar el botón. */
  automatica?: boolean;
  /** «Dejar S/ …»: la persona se queda con el precio que ya estaba (el que sugirió quien compró). */
  onDejar?: () => void;
  /** Una prenda que ya existe (el cierre de Recibir): la IA mira su precio de hoy y cómo se vende. La categoría puede venir vacía. */
  productoId?: string;
  /** Lo que la prenda tiene (ADR-0700): sube el objetivo bajo el que la propuesta nunca baja. */
  rasgos?: readonly Rasgo[];
  /** Una segunda opinión junto a un precio sugerido que ya está a la vista (Nuevo producto): se pide con un enlace y responde en chico. */
  discreta?: boolean;
}) {
  // Cada estado guarda con qué datos nació, y uno de otros datos se lee como «nada» (o como lo ya respondido con esos datos).
  const datosDePropuesta: DatosPropuesta = { origen, productoId, rasgos, categoriaId, tejidoId, referencia, descripcion, costoBase };
  const clave = claveDe(datosDePropuesta);
  // Nace con lo ya respondido para estos datos, si lo hay: la hoja de Recibir adelanta la consulta al abrirse y, si la respuesta llegaba ANTES de llegar a este
  // paso, la pieza aparecía vacía (su clave coincide, así que no leía `recordada`) y el efecto de abajo no la pedía porque ya estaba respondida. Quedaba solo el
  // botón, que hace otra consulta: otra espera y otro cobro (auditoría 2026-11-15).
  const [guardado, setGuardado] = useState<{ clave: string; estado: Estado }>(() => {
    const yaRespondida = YA_RESPONDIDO.get(clave);
    return { clave, estado: yaRespondida ? { tipo: "listo", respuesta: yaRespondida } : { tipo: "nada" } };
  });
  const recordada = YA_RESPONDIDO.get(clave);
  const estado: Estado = guardado.clave === clave ? guardado.estado : recordada ? { tipo: "listo", respuesta: recordada } : { tipo: "nada" };
  const [dejado, setDejado] = useState<string | null>(null);

  /** `usarAdelantada`: tomar la consulta que la hoja ya pidió con estos datos; si falló, se pide otra. El botón siempre pide una nueva. */
  const proponer = async (usarAdelantada = false) => {
    const pedidaCon = clave;
    setGuardado({ clave: pedidaCon, estado: { tipo: "pidiendo" } });
    const adelantada = usarAdelantada ? ADELANTADAS.get(pedidaCon) : undefined;
    if (adelantada) ADELANTADAS.delete(pedidaCon);
    let final = adelantada ? await adelantada : null;
    if (!final || final.tipo === "error") final = await pedirAlServidor(datosDePropuesta);
    setGuardado({ clave: pedidaCon, estado: final });
  };

  // Recibir: sola UNA vez, al aparecer (lo ya respondido no se vuelve a pedir). Si después se escribe el costo, se pide con el botón: pedirla
  // sola con cada cambio gastaría una consulta por tecla.
  const pedidaSola = useRef(false);
  useEffect(() => {
    if (!automatica || (!categoriaId && !productoId) || disabled || pedidaSola.current || YA_RESPONDIDO.has(clave)) return;
    pedidaSola.current = true;
    void proponer(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- se pide al aparecer, una sola vez; no en cada cambio de los datos
  }, []);

  const propuesta = estado.tipo === "listo" && "propuesta" in estado.respuesta ? estado.respuesta.propuesta : null;
  const yaUsada = propuesta !== null && Number(precioBase) === propuesta.precio;
  const precioPuesto = Number(precioBase);
  const hayOtroPrecio = onDejar !== undefined && precioBase.trim() !== "" && Number.isFinite(precioPuesto) && precioPuesto > 0 && !yaUsada;
  const seQuedo = propuesta !== null && dejado === precioBase && !yaUsada;

  return (
    <div className="mt-4 space-y-3">
      {!propuesta && discreta && (
        <Boton type="button" peso="discreto" className="btn-chico" onClick={() => proponer()} cargando={estado.tipo === "pidiendo"} textoCargando="Pensando…" disabled={disabled || (!categoriaId && !productoId)}>
          <span className="inline-flex items-center gap-1.5">
            <Sparkles aria-hidden className="h-3.5 w-3.5" />
            {estado.tipo === "error" || (estado.tipo === "listo" && "sinPropuesta" in estado.respuesta) ? "Pedir otra vez a la IA" : "Pedir otra opinión a la IA"}
          </span>
        </Boton>
      )}
      {!propuesta && !discreta && (
        <div className="flex flex-wrap items-center gap-3">
          <Boton type="button" peso="fantasma" onClick={() => proponer()} cargando={estado.tipo === "pidiendo"} textoCargando="Calculando…" disabled={disabled || (!categoriaId && !productoId)}>
            <span className="inline-flex items-center gap-2">
              <Sparkles aria-hidden className="h-4 w-4" />
              {estado.tipo === "error" || (estado.tipo === "listo" && "sinPropuesta" in estado.respuesta) ? "Proponer de nuevo" : "Proponer precio"}
            </span>
          </Boton>
          <p className="text-sm text-taupe">Nunca baja de tu objetivo.</p>
        </div>
      )}

      {estado.tipo === "error" && (
        <Aviso tono="error" chico>
          {estado.texto}
        </Aviso>
      )}
      {estado.tipo === "listo" && "sinPropuesta" in estado.respuesta && (
        <Aviso tono="atencion" chico>
          {estado.respuesta.sinPropuesta.texto}
        </Aviso>
      )}

      {propuesta && discreta && (
        <div className="nota-cayla sin-i space-y-1.5" data-precio-propuesto>
          <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
            <span className="inline-flex items-center gap-1.5 self-center text-secundario">
              <Sparkles aria-hidden className="h-3.5 w-3.5" />
              Otra opinión, de la IA:
            </span>
            <b className="font-semibold tabular-nums text-tinta">{soles(propuesta.precio)}</b>
            <span className="tabular-nums text-secundario">(ganas {propuesta.margen.toFixed(0)} %)</span>
            {propuesta.costoEstimado && (
              <Chip tono="ambar" title={`Esta prenda no tiene costo: se usó el promedio de su categoría (${soles(propuesta.costo)}).`}>
                Costo estimado
              </Chip>
            )}
          </p>
          <p className="text-detalle text-secundario">
            {propuesta.razon}
            {propuesta.parecidas.length > 0 && ` Parecidas: ${listaDicha(propuesta.parecidas.map((p) => `${p.referencia} (${soles(p.precio)})`))}.`}
          </p>
          {/* Enlaces, pero de 24 px de alto: el mínimo para atinarles con el mouse (WCAG 2.5.8; medidos en 21 px el 2026-11-28). */}
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className="btn-cayla btn-enlace min-h-6" disabled={disabled || yaUsada} onClick={() => onUsar(propuesta.precio.toFixed(2))}>
              {yaUsada ? "Precio puesto" : `Usar ${soles(propuesta.precio)}`}
            </button>
            <button type="button" className="btn-cayla btn-enlace min-h-6" onClick={() => proponer()} disabled={disabled}>
              Pedir otra
            </button>
          </div>
        </div>
      )}

      {propuesta && !discreta && (
        <div className="nota-cayla sin-i space-y-2.5" data-precio-propuesto>
          <p className="inline-flex items-center gap-1.5 text-sm text-taupe">
            <Sparkles aria-hidden className="h-3.5 w-3.5" />
            La IA propone
          </p>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <p className="font-display text-[1.75rem] leading-none tabular-nums">{soles(propuesta.precio)}</p>
            <p className="text-sm text-taupe tabular-nums">ganas {propuesta.margen.toFixed(0)} %</p>
            {propuesta.costoEstimado && (
              <Chip tono="ambar" title={`Esta prenda no tiene costo: se usó el promedio de su categoría (${soles(propuesta.costo)}).`}>
                Costo estimado
              </Chip>
            )}
          </div>
          <p className="text-sm">{propuesta.razon}</p>
          {propuesta.subidoAlPiso && (
            <p className="text-sm text-taupe">Es el mínimo para tu objetivo de {propuesta.objetivo} %.</p>
          )}
          {propuesta.parecidas.length > 0 && (
            <p className="text-sm text-taupe">
              Parecidas: {listaDicha(propuesta.parecidas.map((p) => `${p.referencia} (${soles(p.precio)})`))}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Boton type="button" peso="fantasma" disabled={disabled || yaUsada} onClick={() => onUsar(propuesta.precio.toFixed(2))}>
              {yaUsada ? "Precio puesto" : `Usar ${soles(propuesta.precio)}`}
            </Boton>
            {hayOtroPrecio && (
              <Boton
                type="button"
                peso="fantasma"
                disabled={disabled || seQuedo}
                onClick={() => {
                  setDejado(precioBase);
                  onDejar?.();
                }}
              >
                {seQuedo ? `Se queda ${soles(precioPuesto)}` : `Dejar ${soles(precioPuesto)}`}
              </Boton>
            )}
            <button type="button" className="btn-cayla btn-enlace" onClick={() => proponer()} disabled={disabled}>
              Proponer otro
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
