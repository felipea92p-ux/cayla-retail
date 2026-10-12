"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Boton, CampoMonto, CampoTexto } from "@/components/ui/campos";
import { avisar } from "@/components/ui/Avisos";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { createClient } from "@/lib/supabase/client";
import { esFalloDeRed, esVersionCambiada, traducirError } from "@/lib/error-escritura";
import { firmar } from "@/lib/responsable-reglas";
import { useResponsable } from "@/lib/useResponsable";
import { compararTallas } from "@/lib/tallas";
import { BarraRango } from "@/components/plan-compra/BarraRango";
import { camposDelPlan } from "@/lib/plan-compra-guia";
import {
  RPC_GUARDAR_LINEA,
  argsGuardar,
  borradorDe,
  calcular,
  comprarPorTalla,
  curvaSugerida,
  efectoEnElTope,
  enteroES,
  lineaDeBorrador,
  porQue,
  propuestaDeNormal,
  solesES,
  veredictoDeLoQueSobra,
  versionDevuelta,
  versionParaGuardar,
  type Borrador,
  type FilaPlan,
} from "@/lib/plan-compra-reglas";

// El formulario de UNA categoría del plan de campaña (ADR-0349): sus tres escenarios, el precio, el costo, a cuánto se vende lo que
// sobre y la curva de tallas (propuesta por el sistema desde lo vendido; se puede corregir). Mientras se escribe, calcula cuánto
// comprar y por qué. Guía de foco (ADR-0284): cada bloque dice si está hecho, cuál sigue y qué falta, con las MISMAS reglas que la
// base (`camposDelPlan` → `problemasDelBorrador`, con su prueba).
//
// Es UNA sola pieza para dos lugares: la hoja de la tabla (`PlanCategoriaModal`) y el paso a paso. Lo que cambia entre los dos es el
// pie (qué botones hay y qué pasa al guardar), que llega por `pie`.
//
// Formidable (2026-10-10, docs/formidable/compras-plan.md): la respuesta («Comprar N · S/») va en el pie fijo, siempre a la vista mientras
// se escribe; los tres diciembres son UNA pregunta con tres cajas (antes parecían tres opciones para elegir); «Lo que sobre» dice, junto a
// su caja, lo que produce ese porcentaje (es el número que más mueve la compra); y cada caja tiene su nombre para el lector de pantalla.

const soloDigitos = (s: string) => s.replace(/[^\d]/g, "");
const soloMonto = (s: string) => s.replace(/[^\d.,\s]/g, "");

function EfectoEnElTope({ efecto, tope }: { efecto: ReturnType<typeof efectoEnElTope>; tope: number }) {
  return (
    <p className="mt-3 border-t border-sand pt-3 text-sm text-tinta/80">
      Con esto llevarías <b className="font-semibold text-tinta">{solesES(efecto.total)}</b> de {solesES(tope)} de tope ({efecto.porcentaje} %)
      {efecto.excede > 0 && <span className="font-medium text-ambar-profundo"> · te pasas {solesES(efecto.excede)}</span>}.
    </p>
  );
}

/** Lo que el pie necesita para dibujar sus botones: el de guardar va dentro del `<form>` y se deshabilita con la guía. Un botón que
 *  guarda y sigue lleva `data-seguir="1"`: el formulario lo reconoce por él al enviarse. */
export type PieDelFormulario = {
  guardando: boolean;
  /** La guía deja confirmar: lo mismo que la base aceptaría. */
  puedeGuardar: boolean;
  /** Por qué el botón está apagado (el responsable o lo que falta), para su `title`. */
  motivo: string | undefined;
  /** Clase que la guía le pone al botón de guardar. */
  claseConfirmar: string;
};

export function FormularioCategoria({
  planId,
  fila,
  vendidoPorTalla,
  tope,
  inversionDeLasDemas,
  conVersion,
  versionConocida,
  onGuardado,
  onCambios,
  antesDeRefrescar,
  pie,
  enPantalla = false,
  irAlMontar = false,
}: {
  planId: string;
  /** La categoría con todo lo que la lectura sabe de ella: su plan, lo que hay, lo vendido, el catálogo y dónde está el stock. */
  fila: FilaPlan;
  vendidoPorTalla: ReadonlyMap<string, number> | undefined;
  /** El tope de inversión de la campaña (null = sin tope): el resultado dice cuánto llevarías contra él. Solo avisa. */
  tope: number | null;
  /** Lo que cuestan las OTRAS categorías con plan: con lo de esta, el total contra el tope. */
  inversionDeLasDemas: number;
  /** La base ya compara versiones al guardar (B4): si otra persona guardó esta categoría mientras se editaba, rechaza en vez de pisarla. */
  conVersion: boolean;
  /** La versión que devolvió un guardado de esta misma tanda (la lectura del servidor tarda un instante en traerla). */
  versionConocida?: number;
  /** Se llama cuando la base ya guardó. `seguir`: con «Guardar y seguir». `version`: la nueva, si la base la devuelve. */
  onGuardado: (seguir: boolean, version: number | null) => void;
  /** ¿Hay algo escrito sin guardar? Para que quien contiene el formulario pregunte antes de perderlo («¿Salir sin guardar?»). */
  onCambios?: (sucio: boolean) => void;
  /** Lo que hay que hacer ANTES de refrescar la lectura al guardar (retirar la guardia de «¿Salir sin guardar?»: ver `useSalidaSinGuardar`). */
  antesDeRefrescar?: () => Promise<void>;
  /** Los botones de abajo, dentro del `<form>`. */
  pie: (p: PieDelFormulario) => ReactNode;
  /** El formulario vive en la pantalla y no en una hoja (el paso a paso): la guía de foco lleva el campo a la vista de la ventana y el
   *  pie no se pega al borde de abajo. */
  enPantalla?: boolean;
  /** Al aparecer, lleva el cursor al primer campo: se pasó a la siguiente categoría y el botón que se tocó ya no existe. */
  irAlMontar?: boolean;
}) {
  const { c: categoria, linea, stock, ventas, ventas30, sedes, catalogo } = fila;
  const router = useRouter();
  const responsable = useResponsable();
  const tallas = useMemo(() => [...categoria.tallas].sort((a, b) => compararTallas(a.valor, b.valor)), [categoria]);
  const [inicial] = useState(() => ({ b: borradorDe(linea, tallas, vendidoPorTalla, catalogo), nota: linea?.nota ?? "" }));
  const [b, setB] = useState<Borrador>(inicial.b);
  const [nota, setNota] = useState(inicial.nota);
  const [guardando, setGuardando] = useState(false);
  // Un segundo envío mientras el primero viaja (doble clic, Enter repetido) no sale: el estado de React tarda un render en apagar el botón.
  const enviando = useRef(false);
  // La versión con la que se abrió la hoja queda FIJA: si una lectura nueva llegara con la de otra persona, guardar no debe pisarla en silencio.
  const [versionLeida] = useState(() => linea?.version ?? null);

  const sucio = JSON.stringify({ b, nota }) !== JSON.stringify(inicial);
  const avisarCambios = useRef(onCambios);
  useEffect(() => {
    avisarCambios.current = onCambios;
  });
  useEffect(() => {
    avisarCambios.current?.(sucio);
  }, [sucio]);

  const campos = camposDelPlan(b, tallas, { listo: responsable.listo, motivo: responsable.motivo });
  const guia = useGuiaCampos(campos, { enModal: !enPantalla });
  // `guia.ir` cambia en cada render: el efecto de abajo lee siempre el último, sin volver a correr.
  const irAlCampo = useRef(guia.ir);
  useEffect(() => {
    irAlCampo.current = guia.ir;
  });
  useEffect(() => {
    if (!irAlMontar) return;
    const t = window.setTimeout(() => irAlCampo.current("flojo"), 80);
    return () => window.clearTimeout(t);
  }, [irAlMontar]);
  const lineaViva = lineaDeBorrador(b, tallas);
  const calculo = lineaViva ? calcular(lineaViva, stock) : null;
  const porTalla = calculo ? comprarPorTalla(calculo.comprar, tallas, lineaViva!.curva) : null;
  const sumaCurva = tallas.reduce((s, t) => s + (Number(b.curva[t.id] || "0") || 0), 0);
  const cambiar = (k: keyof Omit<Borrador, "curva">) => (v: string) => setB((x) => ({ ...x, [k]: v }));
  const loQueSobra = veredictoDeLoQueSobra(b);

  const propuesta = propuestaDeNormal(ventas);
  // Mientras el precio y el costo sean los que vinieron del catálogo, la ayuda lo dice: «revísalo» (no es una decisión de nadie todavía).
  const delCatalogo = !linea && catalogo !== null ? { precio: catalogo.precio.toFixed(2), costo: catalogo.costo.toFixed(2) } : null;

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (!guia.puedeConfirmar || enviando.current) return;
    // Qué botón envió el formulario: «Guardar y seguir» lo dice con data-seguir="1".
    const seguir = ((e.nativeEvent as SubmitEvent).submitter as HTMLElement | null)?.dataset.seguir === "1";
    enviando.current = true;
    setGuardando(true);
    const args = argsGuardar(planId, categoria.id, b, tallas, nota, versionParaGuardar(conVersion, versionLeida, versionConocida));
    const { data, error } = await firmar(createClient().rpc(RPC_GUARDAR_LINEA as never, args as never), responsable.firma());
    responsable.despues(error);
    setGuardando(false);
    enviando.current = false;
    if (error) {
      // Otra persona guardó esta categoría mientras la editabas: la lista de atrás pasa a mostrar lo suyo; lo tuyo sigue aquí, sin guardar.
      if (esVersionCambiada(error)) router.refresh();
      // Se cortó la red: puede que la base haya guardado y la respuesta no llegó. Volver a guardar lo mismo no duplica ni pisa nada.
      if (esFalloDeRed(error)) return void avisar.error(`Se cortó la conexión mientras guardabas el plan de ${categoria.nombre}: no sabemos si llegó. Vuelve a pulsar «Guardar»; si ya se había guardado, no se duplica.`);
      return void avisar.error(traducirError(error, "guardar el plan"));
    }
    const fuera = antesDeRefrescar?.() ?? Promise.resolve();
    avisar.exito(`Plan de ${categoria.nombre} guardado`, { detalle: calculo ? `Comprar ${calculo.comprar} · ${solesES(calculo.inversion)}` : undefined });
    onGuardado(seguir, versionDevuelta(data));
    void fuera.then(() => router.refresh());
  }

  return (
    // Todos los títulos de la guía con el mismo alto: el que dice «Sigue aquí» medía 21 px y los demás 24,5, y la caja de abajo subía 3 px cada
    // vez que la luz pasaba al siguiente campo (ADR-0185: nada se mueve bajo el mouse).
    <form onSubmit={guardar} className="space-y-6 [&_[data-campo]>p:first-child]:min-h-6.5">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl bg-hueso px-4 py-3 text-sm text-tinta/80">
        <span>
          Vendiste <b className="font-semibold text-tinta">{enteroES.format(ventas)}</b> en 90 días
          {ventas30 !== null && (
            <>
              {" · "}
              <b className="font-semibold text-tinta">{enteroES.format(ventas30)}</b> en los últimos 30
            </>
          )}
        </span>
        <span>
          Hoy hay <b className="font-semibold text-tinta">{enteroES.format(stock)}</b>
          {sedes && sedes.length > 0 ? <span className="text-tinta/70">: {sedes.map((x) => `${x.ubicacion} ${enteroES.format(x.unidades)}`).join(" · ")}</span> : " entre tiendas y Taller"}
        </span>
        <Boton type="button" className="ml-auto" disabled={propuesta === null} onClick={() => propuesta !== null && cambiar("normal")(String(propuesta))}>
          Proponer el normal desde lo vendido
        </Boton>
        <span className="basis-full text-xs text-tinta/65">
          {propuesta === null
            ? "Esta categoría no vendió en los últimos 90 días: no hay de dónde proponer. Escribe tus escenarios."
            : `Diciembre triplica un mes normal: un mes normal son ${enteroES.format(Math.round(ventas / 3))}, así que un diciembre normal serían ${enteroES.format(propuesta)}. El flojo y el bueno los decides tú.`}
        </span>
      </div>

      <fieldset>
        <legend className="text-[13px] font-semibold text-tinta">¿Cuántas venderías en diciembre?</legend>
        <p className="mt-0.5 text-[12.5px] text-tinta/70">Llena las tres cajas: si el mes va flojo, normal o bueno.</p>
        <div className="mt-3 grid gap-4 sm:grid-cols-3">
          <CampoGuiado id="flojo" guia={guia} titulo="Flojo">
            <CampoTexto etiqueta="Diciembre flojo, prendas" caja inputMode="numeric" value={b.flojo} onChange={(e) => cambiar("flojo")(soloDigitos(e.target.value))} />
          </CampoGuiado>
          <CampoGuiado id="normal" guia={guia} titulo="Normal">
            <CampoTexto etiqueta="Diciembre normal, prendas" caja inputMode="numeric" value={b.normal} onChange={(e) => cambiar("normal")(soloDigitos(e.target.value))} />
          </CampoGuiado>
          <CampoGuiado id="bueno" guia={guia} titulo="Bueno">
            <CampoTexto etiqueta="Diciembre bueno, prendas" caja inputMode="numeric" value={b.bueno} onChange={(e) => cambiar("bueno")(soloDigitos(e.target.value))} />
          </CampoGuiado>
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <CampoGuiado id="precio" guia={guia} titulo="Precio de venta">
          <CampoMonto
            etiqueta={<span className="sr-only">Precio de venta, promedio de la categoría</span>}
            pie={delCatalogo && b.precio === delCatalogo.precio ? "Del catálogo · revísalo" : "Promedio de la categoría"}
            inputMode="decimal"
            value={b.precio}
            onChange={(e) => cambiar("precio")(soloMonto(e.target.value))}
          />
        </CampoGuiado>
        <CampoGuiado id="costo" guia={guia} titulo="Costo por prenda">
          <CampoMonto
            etiqueta={<span className="sr-only">Costo por prenda, promedio</span>}
            pie={delCatalogo && b.costo === delCatalogo.costo ? "Del catálogo · revísalo" : "Lo que te cuesta cada una, en promedio"}
            inputMode="decimal"
            value={b.costo}
            onChange={(e) => cambiar("costo")(soloMonto(e.target.value))}
          />
        </CampoGuiado>
      </div>

      <CampoGuiado id="recupero" guia={guia} titulo="Lo que sobre, ¿a qué % del precio lo vendes?">
        <div className="flex flex-wrap items-start gap-x-4 gap-y-1">
          <div className="flex w-32 items-center gap-2">
            <div className="min-w-0 flex-1">
              <CampoTexto etiqueta="Lo que sobre, en % del precio" caja inputMode="numeric" value={b.recupero} onChange={(e) => cambiar("recupero")(soloDigitos(e.target.value))} />
            </div>
            <span aria-hidden className="pb-4 text-sm text-tinta/70">
              %
            </span>
          </div>
          <p className="min-w-0 flex-1 basis-60 pt-2.5 text-[13px] leading-snug text-tinta/80">
            {loQueSobra ?? "Lo que quede sin vender después de diciembre: a cuánto lo venderías en la liquidación de enero. Con el precio y el costo escritos, aquí ves qué cambia en la compra."}
          </p>
        </div>
      </CampoGuiado>

      <CampoGuiado id="curva" guia={guia} titulo="Curva de tallas" ayuda={`Suma ${sumaCurva} %`}>
        {tallas.length === 0 ? (
          <p className="text-sm text-tinta/70">Esta categoría no tiene tallas cargadas: se compra el total.</p>
        ) : (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-3">
              {tallas.map((t) => (
                <div key={t.id} className="flex w-20 flex-col gap-1 text-xs text-tinta/70">
                  <span aria-hidden className="font-semibold text-tinta">
                    {t.valor}
                  </span>
                  <CampoTexto
                    etiqueta={`Talla ${t.valor}, % de la compra`}
                    caja
                    inputMode="numeric"
                    value={b.curva[t.id] ?? ""}
                    onChange={(e) => setB((x) => ({ ...x, curva: { ...x.curva, [t.id]: soloDigitos(e.target.value) } }))}
                  />
                  {porTalla && <span className="tabular-nums">{porTalla.get(t.id) ?? 0} prendas</span>}
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setB((x) => ({ ...x, curva: Object.fromEntries(Object.entries(curvaSugerida(tallas, vendidoPorTalla)).map(([k, v]) => [k, String(v)])) }))}
              className="btn-cayla btn-enlace text-xs"
            >
              Volver a la que propone el sistema
            </button>
            <p className="text-xs text-tinta/65">
              La propone el sistema con lo vendido en 90 días, en tienda o anotado sin registrar, apoyado en un reparto parejo cuando
              hay pocas ventas.
            </p>
          </div>
        )}
      </CampoGuiado>

      <div className="rounded-xl bg-hueso px-4 py-3">
        {calculo ? (
          <>
            <p className="text-sm text-tinta/80">
              Conviene tener <b className="font-semibold text-tinta">{enteroES.format(calculo.objetivo)}</b> para la campaña; ya hay{" "}
              <b className="font-semibold text-tinta">{enteroES.format(calculo.stock)}</b>. {porQue(calculo)}
            </p>
            {lineaViva && (
              <div className="mt-3">
                <BarraRango viva linea={lineaViva} calculo={calculo} />
              </div>
            )}
            {tope !== null && <EfectoEnElTope efecto={efectoEnElTope(inversionDeLasDemas, calculo.inversion, tope)} tope={tope} />}
          </>
        ) : (
          <p className="text-sm text-tinta/70">Cuando completes los tres diciembres, el precio, el costo y lo que sobre, aquí ves por qué se compra eso.</p>
        )}
      </div>

      <CampoTexto etiqueta="Nota (opcional)" caja value={nota} onChange={(e) => setNota(e.target.value)} />

      <CampoGuiado id="responsable" guia={guia}>
        <ComboResponsable control={responsable} deshabilitado={guardando} />
      </CampoGuiado>

      <div className={enPantalla ? "space-y-1" : "pie-hoja-fijo"}>
        {/* La respuesta, siempre a la vista mientras se escribe (antes quedaba al fondo de la hoja, fuera de la pantalla). */}
        <p className="flex flex-wrap items-baseline gap-x-2 pt-1" aria-live="polite">
          {calculo ? (
            <>
              <span className="font-display text-xl text-tinta">
                Comprar {enteroES.format(calculo.comprar)} · {solesES(calculo.inversion)}
              </span>
              {porTalla && calculo.comprar > 0 && (
                <span className="text-xs text-tinta/65">{[...porTalla].filter(([, n]) => n > 0).map(([id, n]) => `${tallas.find((t) => t.id === id)?.valor ?? ""} ${n}`).join(" · ")}</span>
              )}
            </>
          ) : (
            <span className="text-sm text-tinta/65">Comprar: se calcula cuando estén los datos de arriba.</span>
          )}
        </p>
        <PieGuia guia={guia} listo="Todo listo para guardar." />
        {pie({ guardando, puedeGuardar: guia.puedeConfirmar, motivo: responsable.motivo ?? guia.frase ?? undefined, claseConfirmar: guia.claseConfirmar })}
      </div>
    </form>
  );
}
