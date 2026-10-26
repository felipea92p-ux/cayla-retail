"use client";

import { ChevronDown } from "lucide-react";
import type { CSSProperties } from "react";
import { BarraApilada, MuestraTramo } from "@/components/ui/BarraApilada";
import { Chip } from "@/components/ui/Chip";
import { EnlaceVer } from "@/components/ui/EnlaceVer";
import { Linea, topeRedondo } from "@/components/ui/Linea";
import { Boton } from "@/components/ui/campos";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { CabeceraBloque, OpcionesFin, Superficie } from "@/components/finanzas/kit";
import { diasEntre, fechaEnPalabras, sumarDias } from "@/lib/caja-proxima-reglas";
import { soles } from "@/lib/flujo-caja-reglas";
import type { Proyeccion } from "@/lib/flujo-caja-reglas";
import {
  cajaConCompra,
  diasParaPedir,
  evaluarFormas,
  formaEfectiva,
  formasDePago,
  mejorMezcla,
  pendienteDeCaja,
  repartoDeLaCompra,
  saleDeCajaDelPlan,
  saldoBase,
  type CampanaInversion,
  type FormaEvaluada,
} from "@/lib/inversion-mercaderia-reglas";

// Finanzas ▸ Resumen, «Inversión en mercadería» (Felipe 2026-10-26, demo aprobada). Solo DIBUJA lo que arman las reglas de
// `inversion-mercaderia-reglas`: por campaña, en qué etapa está cada sol del plan (pagado, pedido sin pagar, falta pedir) contra su tope, y, a un
// toque, las formas de pagar lo que falta pedir mirando cómo queda la caja. Mirar no guarda nada: guardar un pago es del Plan de campaña.
// No es un gasto: la nota lo dice, porque es lo que más se confunde («¿por qué no baja “Te deja”?»).

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const diaYMes = (iso: string) => `${Number(iso.slice(8, 10))} ${MESES[Number(iso.slice(5, 7)) - 1]}`;
const entra = (i: number) => ({ className: "anim-entra", style: { ["--i" as string]: i } as CSSProperties });

/** «1–24 dic» (o «27 nov – 3 dic» si cruza de mes). */
function fechasDeCampana(c: CampanaInversion): string {
  const [a, b] = [diaYMes(c.desde), diaYMes(c.hasta)];
  return a.slice(-3) === b.slice(-3) ? `${Number(c.desde.slice(8, 10))}–${b}` : `${a} – ${b}`;
}

function EstadoDeLaCompra({ c, hoy, conIgv }: { c: CampanaInversion; hoy: string; conIgv: boolean }) {
  if (pendienteDeCaja(c, conIgv) <= 0) return <Chip tono="verde">Todo pedido</Chip>;
  const dias = diasParaPedir(c, hoy);
  if (dias === null) return <Chip tono="pizarra">Sin fecha para pedir</Chip>;
  if (dias < 0) return <Chip tono="ambar">Ya pasó la fecha de pedir</Chip>;
  return (
    <Chip tono={dias <= 7 ? "ambar" : "pizarra"}>
      Pide antes del {diaYMes(c.fechaLimite!)} ({dias === 0 ? "es hoy" : dias === 1 ? "falta 1 día" : `faltan ${dias} días`})
    </Chip>
  );
}

function BarraDeLaCompra({ c }: { c: CampanaInversion }) {
  const r = repartoDeLaCompra(c);
  const tope = c.tope ?? c.planSinIgv;
  return (
    <div>
      <BarraApilada
        unidad="soles"
        formato={soles}
        etiqueta={`De ${soles(c.planSinIgv)} planeados: ${soles(r.pagado)} pagados, ${soles(r.pedidoSinPagar)} pedidos sin pagar y ${soles(r.faltaPedir)} por pedir.${c.tope ? ` Tu tope es ${soles(c.tope)}.` : ""}`}
        total={Math.max(tope, c.planSinIgv, c.pedido)}
        segmentos={[
          { clave: "pagado", nombre: "Pagado", valor: r.pagado, clase: "bg-verde" },
          { clave: "pedido", nombre: "Pedido, por pagar", valor: r.pedidoSinPagar, clase: "bg-taupe" },
          { clave: "falta", nombre: "Falta pedir", valor: r.faltaPedir, clase: "bg-tinta/20" },
        ]}
      />
      <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-taupe">
        <span className="inline-flex items-center gap-1.5">
          <MuestraTramo clase="bg-verde" /> Pagado {soles(r.pagado)}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <MuestraTramo clase="bg-taupe" /> Pedido, por pagar {soles(r.pedidoSinPagar)}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <MuestraTramo clase="bg-tinta/20" /> Falta pedir {soles(r.faltaPedir)}
        </span>
        {c.tope !== null && <span>Tu tope: {soles(c.tope)}</span>}
      </p>
      {r.pasaDelPlan > 0 && <p className="mt-1 text-xs text-ambar-profundo">Ya pediste {soles(r.pasaDelPlan)} más de lo que planeaste.</p>}
    </div>
  );
}

type Props = {
  /** Las campañas que se ven (el Plan las deja ver y nadie las escondió). */
  campanas: readonly CampanaInversion[];
  conIgv: boolean;
  hoy: string;
  /** La proyección de caja de la que sale cómo queda con cada forma de pagar; `null` si no se pudo leer. */
  proyeccion: Proyeccion | null;
  elegidas: Readonly<Record<string, string>>;
  onElegir: (id: string, clave: string) => void;
  /** La campaña cuyo cuadro de «cómo pagarla» está abierto. */
  abierta: string | null;
  onAbrir: (id: string | null) => void;
  /** Todas las campañas están ocultas por quien mira (no por el Plan): se dice dónde volver a mostrarlas. */
  ocultasAqui: boolean;
};

export function InversionMercaderia({ campanas, conIgv, hoy, proyeccion, elegidas, onElegir, abierta, onAbrir, ocultasAqui }: Props) {
  if (!campanas.length) {
    // Escondidas aquí: se dice, o parece que «no hay campañas». Sin campañas del Plan: no se dibuja nada (esta base aún no las trae).
    return ocultasAqui ? (
      <p className="nota-cayla" data-guia="fin-resumen.inversion">
        La inversión en mercadería está oculta en este Resumen. Vuelve a mostrarla en «Qué se ve», junto al mes. Sigue en el Plan de campaña y en Compras.
      </p>
    ) : null;
  }
  const total = campanas.reduce((a, c) => a + saleDeCajaDelPlan(c, conIgv), 0);
  const delCuadro = campanas.find((c) => c.id === abierta) ?? null;
  return (
    <Superficie pad guia="fin-resumen.inversion">
      <CabeceraBloque
        titulo="Inversión en mercadería"
        bajada={
          <>
            Lo que vas a poner en prendas para las campañas que vienen. <b>No entra a «Te deja»</b>: es plata comprometida que sale de tu caja cuando pagas, y se vuelve costo cuando vendes.{" "}
            {conIgv ? `Con IGV, de caja saldrán ${soles(total)} en total.` : "Sin contar el IGV."}
          </>
        }
      />
      <div className="grid gap-3 grid-cols-[repeat(auto-fit,minmax(min(100%,26rem),1fr))]">
        {campanas.map((c, i) => {
          const hayQuePagar = pendienteDeCaja(c, conIgv) > 0 && c.fechaLimite !== null;
          const estaAbierta = abierta === c.id;
          return (
            <div key={c.id} {...entra(i)} className="anim-entra card-cayla space-y-3 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <TituloSeccion nivel={3} dato={fechasDeCampana(c)}>
                  {c.nombre}
                </TituloSeccion>
                <EstadoDeLaCompra c={c} hoy={hoy} conIgv={conIgv} />
              </div>
              <BarraDeLaCompra c={c} />
              <div className="flex flex-wrap items-center gap-2">
                {hayQuePagar && (
                  <Boton peso="fantasma" type="button" className="whitespace-nowrap" aria-expanded={estaAbierta} aria-controls={`pagar-${c.id}`} onClick={() => onAbrir(estaAbierta ? null : c.id)}>
                    {estaAbierta ? "Cerrar" : "Ver cómo pagarla"}
                    <ChevronDown aria-hidden className={`h-4 w-4 transition-transform duration-200 ease-cayla motion-reduce:transition-none ${estaAbierta ? "rotate-180" : ""}`} />
                  </Boton>
                )}
                {c.hrefPlan && <EnlaceVer href={c.hrefPlan}>Ver en el Plan de campaña</EnlaceVer>}
                {!hayQuePagar && pendienteDeCaja(c, conIgv) <= 0 && <span className="text-xs text-taupe">Ya está todo pedido: lo que falta pagar está en Por pagar.</span>}
              </div>
            </div>
          );
        })}
      </div>
      {delCuadro && <PagarLaCompra c={delCuadro} conIgv={conIgv} hoy={hoy} proyeccion={proyeccion} elegida={elegidas[delCuadro.id]} onElegir={(k) => onElegir(delCuadro.id, k)} />}
    </Superficie>
  );
}

/** Las formas de pagar lo que falta pedir, lado a lado, con la caja de la que se elija dibujada al lado. */
function PagarLaCompra({ c, conIgv, hoy, proyeccion, elegida, onElegir }: { c: CampanaInversion; conIgv: boolean; hoy: string; proyeccion: Proyeccion | null; elegida: string | undefined; onElegir: (clave: string) => void }) {
  const id = `pagar-${c.id}`;
  if (!proyeccion) {
    return (
      <div id={id} className="mt-4 border-t border-sand pt-4">
        <p className="nota-cayla">No se pudo leer la caja de las próximas semanas, así que no se puede comparar cómo pagarla. Vuelve a cargar la página en un rato.</p>
      </div>
    );
  }
  const formas: FormaEvaluada[] = evaluarFormas(proyeccion, formasDePago(c, hoy, conIgv));
  if (!formas.length) return null;
  const efectiva = formaEfectiva(formas, elegida);
  const mejor = mejorMezcla(formas);
  const caja = efectiva?.caja ?? null;
  const base = saldoBase(proyeccion);
  const ultimo = base.at(-1)!;
  const menor = Math.min(...(caja?.puntos.map((p) => p.saldo) ?? [0]), 0);
  const detalleDe = (f: FormaEvaluada) =>
    [
      `${f.pagos.map((p) => `${soles(p.monto)} el ${diaYMes(p.fecha)}`).join(" · ")}.`,
      f.caja ? `Tu caja más baja: ${soles(f.caja.masBajo.saldo)} (${diaYMes(f.caja.masBajo.fecha)}); ${f.caja.diasBajoMinimo} días bajo tu mínimo.` : "",
      `${f.llegaAbrir} % de lo que falta llega a tiempo para abrir la campaña.`,
      f.requiere ?? "",
    ]
      .filter(Boolean)
      .join(" ");
  // Si la caja ya se queda sin plata ANTES de la compra, la compra no es lo que la rompe: se dice, o parecería que la forma de pagar tiene la culpa.
  const sinLaCompra = cajaConCompra(proyeccion, []);
  const frase = efectiva && caja
    ? sinLaCompra?.sinPlata
      ? `Aun sin la compra tu caja se queda sin plata el ${fechaEnPalabras(sinLaCompra.sinPlata.fecha)}. Con «${efectiva.nombre}» llega a ${soles(caja.masBajo.saldo)}.`
      : caja.sinPlata
      ? `Con «${efectiva.nombre}» la caja se queda sin plata el ${fechaEnPalabras(caja.sinPlata.fecha)}: llega a ${soles(caja.masBajo.saldo)}.`
      : `Con «${efectiva.nombre}» tu caja baja a ${soles(caja.masBajo.saldo)} el ${fechaEnPalabras(caja.masBajo.fecha)}${proyeccion.minimoCaja > 0 ? ` y pasa ${caja.diasBajoMinimo} días bajo tu mínimo` : ""}.`
    : "Elige una forma para ver cómo queda tu caja.";

  return (
    <div id={id} className="mt-4 border-t border-sand pt-4" data-guia="fin-resumen.inversion-pagos">
      <TituloSeccion nivel={3}>Cuándo pagar lo que falta pedir de {c.nombre}</TituloSeccion>
      <p className="mb-3 mt-1 text-sm text-taupe">Mirar no guarda nada: cómo se paga se deja escrito en el Plan de campaña. Lo que elijas aquí se cuenta en «Tu caja» de arriba.</p>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <OpcionesFin
          nombre={`forma-${c.id}`}
          etiqueta={`Cómo pagar lo que falta pedir de ${c.nombre}`}
          valor={efectiva?.clave ?? "junto"}
          onValor={onElegir}
          opciones={formas.map((f) => ({ valor: f.clave, titulo: f.clave === mejor ? `${f.nombre} · la mejor mezcla` : f.nombre, detalle: detalleDe(f) }))}
        />
        <div className="min-w-0 space-y-3">
          <p className="font-serif text-lg leading-snug">{frase}</p>
          {caja && (
            <Linea
              etiqueta={`Tu caja con ${efectiva!.nombre}: ${frase}`}
              serie={caja.puntos.map((p) => ({ x: p.dia, y: p.saldo }))}
              proyeccion={base.map((p) => ({ x: p.dia, y: p.saldo }))}
              referencia={proyeccion.minimoCaja > 0 ? [{ x: 0, y: proyeccion.minimoCaja }, { x: ultimo.dia, y: proyeccion.minimoCaja }] : null}
              desde={0}
              hasta={ultimo.dia}
              minY={menor < 0 ? -topeRedondo(-menor) : 0}
              marcasX={[0, 14, 28, ultimo.dia].filter((x, k, a) => x <= ultimo.dia && a.indexOf(x) === k).map((x) => ({ x, texto: x === 0 ? "hoy" : diaYMes(sumarDias(proyeccion.hoy, x)), fuerte: x === 0 }))}
              cifraReferencia={proyeccion.minimoCaja > 0 ? { valor: soles(proyeccion.minimoCaja), texto: "mínimo" } : null}
              leer={(x) => {
                const p = caja.puntos.reduce((a, b) => (Math.abs(b.dia - x) < Math.abs(a.dia - x) ? b : a));
                return (
                  <>
                    <b>{p.dia === 0 ? "Hoy" : fechaEnPalabras(p.fecha)}</b>
                    <span>Con la compra: {soles(p.saldo)}</span>
                  </>
                );
              }}
              alto={220}
            />
          )}
          <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-taupe">
            <span className="inline-flex items-center gap-1.5">
              <MuestraTramo clase="bg-tinta" /> Con la compra
            </span>
            <span className="inline-flex items-center gap-1.5">
              <MuestraTramo clase="bg-tinta/30" /> Sin la compra
            </span>
          </p>
          {caja && caja.fueraDelHorizonte.length > 0 && (
            <p className="nota-cayla">
              {caja.fueraDelHorizonte.length === 1 ? "Un pago cae" : `${caja.fueraDelHorizonte.length} pagos caen`} después de lo que la caja alcanza a ver (el {fechaEnPalabras(caja.fueraDelHorizonte[0]!.fecha)}): no está en el gráfico.
            </p>
          )}
          <p className="nota-cayla">
            <b>Cómo se elige «la mejor mezcla»:</b> entre las formas que no dependen de nadie, que nunca dejan la caja en negativo y llegan a tiempo con al menos el 70 % de lo que abre la campaña, la que pasa menos días bajo tu mínimo.
            {conIgv && ` De caja sale con IGV; ese IGV vuelve como crédito fiscal en la declaración siguiente (${soles(c.igv)} en esta campaña).`}
          </p>
        </div>
      </div>
      {efectiva && diasEntre(proyeccion.hoy, c.fechaLimite!) < 0 && <p className="nota-cayla mt-3">La fecha para pedir ya pasó: lo que elijas sirve para ver cómo queda la caja, no para llegar a tiempo.</p>}
    </div>
  );
}
