"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
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
import { camposDelPlan } from "@/lib/plan-compra-guia";
import {
  RPC_GUARDAR_LINEA,
  argsGuardar,
  borradorDe,
  calcular,
  comprarPorTalla,
  curvaSugerida,
  lineaDeBorrador,
  porQue,
  type Borrador,
  type CategoriaPlan,
  type LineaPlan,
} from "@/lib/plan-compra-reglas";

// La ventana de una categoría en el plan de campaña (ADR-0349): sus tres escenarios, el precio, el costo, a cuánto se vende lo que
// sobre y la curva de tallas (propuesta por el sistema desde lo vendido; se puede corregir). Mientras se escribe, calcula cuánto
// comprar y por qué. Guía de foco (ADR-0284): cada bloque dice si está hecho, cuál sigue y qué falta, con las MISMAS reglas que la
// base (`camposDelPlan` → `problemasDelBorrador`, con su prueba).

const soles = (n: number) => `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const soloDigitos = (s: string) => s.replace(/[^\d]/g, "");
const soloMonto = (s: string) => s.replace(/[^\d.,]/g, "");

export function PlanCategoriaModal({
  planId,
  planNombre,
  categoria,
  linea,
  stock,
  vendidoPorTalla,
  onClose,
}: {
  planId: string;
  planNombre: string;
  categoria: CategoriaPlan;
  linea: LineaPlan | undefined;
  stock: number;
  vendidoPorTalla: ReadonlyMap<string, number> | undefined;
  onClose: () => void;
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

  async function guardar(e: React.FormEvent, cerrar: () => void) {
    e.preventDefault();
    if (!guia.puedeConfirmar) return;
    setGuardando(true);
    const { error } = await firmar(createClient().rpc(RPC_GUARDAR_LINEA as never, argsGuardar(planId, categoria.id, b, tallas, nota) as never), responsable.firma());
    responsable.despues(error);
    setGuardando(false);
    if (error) return void avisar.error(traducirError(error, "guardar el plan"));
    avisar.exito(`Plan de ${categoria.nombre} guardado`, { detalle: calculo ? `Comprar ${calculo.comprar} · ${soles(calculo.inversion)}` : undefined });
    router.refresh();
    cerrar();
  }

  return (
    <Modal titulo={`Plan de ${categoria.nombre}`} subtitulo={`${planNombre}. Hoy hay ${stock} en la red.`} onClose={onClose} variante="hoja" ancho="max-w-2xl">
      {(cerrar) => (
        <form onSubmit={(e) => guardar(e, cerrar)} className="space-y-6">
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
                  Comprar {calculo.comprar} · {soles(calculo.inversion)}
                </p>
                <p className="mt-1 text-sm text-tinta/75">
                  Conviene tener {calculo.objetivo} para la campaña; ya hay {calculo.stock}. {porQue(calculo)}
                </p>
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
            <div className="flex justify-end gap-3 pt-2">
              <Boton type="button" onClick={cerrar}>
                Cancelar
              </Boton>
              <Boton
                type="submit"
                peso="primario"
                cargando={guardando}
                disabled={!guia.puedeConfirmar}
                title={responsable.motivo ?? guia.frase ?? undefined}
                className={guia.claseConfirmar}
              >
                Guardar
              </Boton>
            </div>
          </div>
        </form>
      )}
    </Modal>
  );
}
