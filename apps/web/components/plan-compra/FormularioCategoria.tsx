"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Boton, CampoMonto, CampoTexto } from "@/components/ui/campos";
import { avisar } from "@/components/ui/Avisos";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
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
  enteroES,
  lineaDeBorrador,
  porQue,
  propuestaDeNormal,
  solesES,
  type Borrador,
  type CategoriaPlan,
  type LineaPlan,
} from "@/lib/plan-compra-reglas";

// El formulario de UNA categoría del plan de campaña (ADR-0349): sus tres escenarios, el precio, el costo, a cuánto se vende lo que
// sobre y la curva de tallas (propuesta por el sistema desde lo vendido; se puede corregir). Mientras se escribe, calcula cuánto
// comprar y por qué. Guía de foco (ADR-0284): cada bloque dice si está hecho, cuál sigue y qué falta, con las MISMAS reglas que la
// base (`camposDelPlan` → `problemasDelBorrador`, con su prueba).
//
// Es UNA sola pieza para dos lugares: la hoja de la tabla (`PlanCategoriaModal`) y el paso a paso. Lo que cambia entre los dos es el
// pie (qué botones hay y qué pasa al guardar), que llega por `pie`.

const soloDigitos = (s: string) => s.replace(/[^\d]/g, "");
const soloMonto = (s: string) => s.replace(/[^\d.,]/g, "");

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
  categoria,
  linea,
  stock,
  ventas,
  vendidoPorTalla,
  onGuardado,
  pie,
}: {
  planId: string;
  categoria: CategoriaPlan;
  linea: LineaPlan | undefined;
  stock: number;
  /** Lo que se vendió de esta categoría en los últimos 90 días: la referencia para escribir los escenarios. */
  ventas: number;
  vendidoPorTalla: ReadonlyMap<string, number> | undefined;
  /** Se llama cuando la base ya guardó (después del aviso y de refrescar la lectura). `seguir`: se guardó con el botón «Guardar y seguir». */
  onGuardado: (seguir: boolean) => void;
  /** Los botones de abajo, dentro del `<form>`. */
  pie: (p: PieDelFormulario) => ReactNode;
}) {
  const router = useRouter();
  const responsable = useResponsable();
  const tallas = useMemo(() => [...categoria.tallas].sort((a, b) => compararTallas(a.valor, b.valor)), [categoria]);
  const [b, setB] = useState<Borrador>(() => borradorDe(linea, tallas, vendidoPorTalla));
  const [nota, setNota] = useState(linea?.nota ?? "");
  const [guardando, setGuardando] = useState(false);

  const campos = camposDelPlan(b, tallas, { listo: responsable.listo, motivo: responsable.motivo });
  const guia = useGuiaCampos(campos);
  const lineaViva = lineaDeBorrador(b, tallas);
  const calculo = lineaViva ? calcular(lineaViva, stock) : null;
  const porTalla = calculo ? comprarPorTalla(calculo.comprar, tallas, lineaViva!.curva) : null;
  const sumaCurva = tallas.reduce((s, t) => s + (Number(b.curva[t.id] || "0") || 0), 0);
  const cambiar = (k: keyof Omit<Borrador, "curva">) => (v: string) => setB((x) => ({ ...x, [k]: v }));

  const propuesta = propuestaDeNormal(ventas);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (!guia.puedeConfirmar) return;
    // Qué botón envió el formulario: «Guardar y seguir» lo dice con data-seguir="1".
    const seguir = ((e.nativeEvent as SubmitEvent).submitter as HTMLElement | null)?.dataset.seguir === "1";
    setGuardando(true);
    const { error } = await firmar(createClient().rpc(RPC_GUARDAR_LINEA as never, argsGuardar(planId, categoria.id, b, tallas, nota) as never), responsable.firma());
    responsable.despues(error);
    setGuardando(false);
    if (error) return void avisar.error(traducirError(error, "guardar el plan"));
    avisar.exito(`Plan de ${categoria.nombre} guardado`, { detalle: calculo ? `Comprar ${calculo.comprar} · ${solesES(calculo.inversion)}` : undefined });
    router.refresh();
    onGuardado(seguir);
  }

  return (
    <form onSubmit={guardar} className="space-y-6">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl bg-hueso px-4 py-3 text-sm text-tinta/80">
        <span>
          Vendiste <b className="font-semibold text-tinta">{enteroES.format(ventas)}</b> en 90 días
        </span>
        <span>
          Hoy hay <b className="font-semibold text-tinta">{enteroES.format(stock)}</b> en la red
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

      <div className="grid gap-4 sm:grid-cols-3">
        <CampoGuiado id="flojo" guia={guia} titulo="Diciembre flojo" ayuda="Unidades">
          <CampoTexto etiqueta={<span className="sr-only">Venderías</span>} caja inputMode="numeric" value={b.flojo} onChange={(e) => cambiar("flojo")(soloDigitos(e.target.value))} />
        </CampoGuiado>
        <CampoGuiado id="normal" guia={guia} titulo="Diciembre normal" ayuda="Unidades">
          <CampoTexto etiqueta={<span className="sr-only">Venderías</span>} caja inputMode="numeric" value={b.normal} onChange={(e) => cambiar("normal")(soloDigitos(e.target.value))} />
        </CampoGuiado>
        <CampoGuiado id="bueno" guia={guia} titulo="Diciembre bueno" ayuda="Unidades">
          <CampoTexto etiqueta={<span className="sr-only">Venderías</span>} caja inputMode="numeric" value={b.bueno} onChange={(e) => cambiar("bueno")(soloDigitos(e.target.value))} />
        </CampoGuiado>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <CampoGuiado id="precio" guia={guia} titulo="Precio" ayuda="De venta, promedio">
          <CampoMonto etiqueta="" inputMode="decimal" value={b.precio} onChange={(e) => cambiar("precio")(soloMonto(e.target.value))} />
        </CampoGuiado>
        <CampoGuiado id="costo" guia={guia} titulo="Costo" ayuda="Por prenda, promedio">
          <CampoMonto etiqueta="" inputMode="decimal" value={b.costo} onChange={(e) => cambiar("costo")(soloMonto(e.target.value))} />
        </CampoGuiado>
        <CampoGuiado id="recupero" guia={guia} titulo="Lo que sobra" ayuda="Lo vendes al % del precio">
          <CampoTexto etiqueta={<span className="sr-only">Porcentaje del precio</span>} caja inputMode="numeric" value={b.recupero} onChange={(e) => cambiar("recupero")(soloDigitos(e.target.value))} />
        </CampoGuiado>
      </div>

      <CampoGuiado id="curva" guia={guia} titulo="Curva de tallas" ayuda={`Suma ${sumaCurva} %`}>
        {tallas.length === 0 ? (
          <p className="text-sm text-tinta/70">Esta categoría no tiene tallas cargadas: se compra el total.</p>
        ) : (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-3">
              {tallas.map((t) => (
                <label key={t.id} className="flex w-20 flex-col gap-1 text-xs text-tinta/70">
                  <span className="font-semibold text-tinta">{t.valor}</span>
                  <CampoTexto
                    etiqueta={<span className="sr-only">{`Porcentaje de la talla ${t.valor}`}</span>}
                    caja
                    inputMode="numeric"
                    value={b.curva[t.id] ?? ""}
                    onChange={(e) => setB((x) => ({ ...x, curva: { ...x.curva, [t.id]: soloDigitos(e.target.value) } }))}
                  />
                  {porTalla && <span className="tabular-nums">{porTalla.get(t.id) ?? 0} prendas</span>}
                </label>
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

      <div className="rounded-xl bg-hueso px-4 py-3" aria-live="polite">
        {calculo ? (
          <>
            <p className="font-display text-xl text-tinta">
              Comprar {calculo.comprar} · {solesES(calculo.inversion)}
            </p>
            <p className="mt-1 text-sm text-tinta/75">
              Conviene tener {calculo.objetivo} para la campaña; ya hay {calculo.stock}. {porQue(calculo)}
            </p>
            {lineaViva && (
              <div className="mt-3">
                <BarraRango viva linea={lineaViva} calculo={calculo} />
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-tinta/70">Cuando completes los escenarios, el precio, el costo y lo que sobra, aquí sale cuánto comprar.</p>
        )}
      </div>

      <CampoTexto etiqueta="Nota (opcional)" caja value={nota} onChange={(e) => setNota(e.target.value)} />

      <CampoGuiado id="responsable" guia={guia}>
        <ComboResponsable control={responsable} deshabilitado={guardando} />
      </CampoGuiado>

      <div className="pie-hoja-fijo">
        <PieGuia guia={guia} listo="Todo listo para guardar." />
        {pie({ guardando, puedeGuardar: guia.puedeConfirmar, motivo: responsable.motivo ?? guia.frase ?? undefined, claseConfirmar: guia.claseConfirmar })}
      </div>
    </form>
  );
}
