"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChartColumn, Info } from "lucide-react";
import { Ayuda } from "@/components/Ayuda";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CantidadEditable } from "@/components/plan-compra/CantidadEditable";
import { FilaDeModelo, PLANTILLA_DE_MODELOS } from "@/components/plan-compra/FilaDeModelo";
import { useModelosDeLaCategoria } from "@/components/plan-compra/useModelosDeLaCategoria";
import { Aviso } from "@/components/ui/Aviso";
import { avisar } from "@/components/ui/Avisos";
import { BarraAvance } from "@/components/ui/BarraAvance";
import { Boton } from "@/components/ui/campos";
import { Chip } from "@/components/ui/Chip";
import { Encabezado, Tabla } from "@/components/ui/Tabla";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { Vacio } from "@/components/ui/Vacio";
import { createClient } from "@/lib/supabase/client";
import { esFalloDeRed, esVersionCambiada, traducirError } from "@/lib/error-escritura";
import { firmar } from "@/lib/responsable-reglas";
import { useResponsable } from "@/lib/useResponsable";
import {
  MIN_VENTAS_PARA_REPETIR,
  RPC_GUARDAR_PASO_2,
  SIN_EDICIONES,
  calcularReparto,
  edicionesDeLoGuardado,
  editarColor,
  editarModelo,
  editarTalla,
  itemsDelReparto,
  volverALoQuePropone,
  type Ediciones,
  type EntradaDelReparto,
  type ItemDelReparto,
  type LecturaModelos,
} from "@/lib/plan-compra-modelos";
import { curvaSugerida, enteroES, solesES, type FilaPlan } from "@/lib/plan-compra-reglas";
import { exactitudDeLosDatos, periodoDeVentas } from "@/lib/plan-compra-periodo";

// El paso 2 del Plan de campaña (ADR-0526, spike ⑥ «Ranking de modelos» dentro de la hoja de la categoría de ③): de lo que el paso 1 decidió comprar, qué modelos repetir y de cada uno qué colores y tallas.
// Arriba el total del paso 1 (que aquí NO se cambia) y el % que se repite; en medio el ranking de modelos, del que más vendió al que menos, con su marca debajo del nombre y, dentro de cada uno, sus colores
// y tallas; abajo lo que queda para «modelos nuevos por elegir», con una guía de colores y tallas, porque el sistema solo puede nombrar modelos que ya existen. La cuenta es de
// `lib/plan-compra-modelos.ts`; la base, de `guardar_plan_compra_paso_2`.
//
// CAÍDA EXTERNA. Si la base no responde, el paso 2 lo dice y el paso 1 sigue ahí, intacto. Si se corta la red al guardar, no se sabe si llegó: volver a pulsar «Guardar» no duplica nada (lo idéntico a lo ya
// guardado no crea otra foto).

export function PasoModelos({
  planId,
  fila,
  vendidoPorTalla,
  onCambios,
  onCancelar,
  onIrAlPaso1,
}: {
  planId: string;
  fila: FilaPlan;
  vendidoPorTalla: ReadonlyMap<string, number> | undefined;
  /** Hay cambios sin guardar (para preguntar antes de perderlos). */
  onCambios: (sucio: boolean) => void;
  onCancelar: () => void;
  onIrAlPaso1: () => void;
}) {
  const { estado, recargar } = useModelosDeLaCategoria(planId, fila.c.id, true);
  if (estado.fase === "cargando") {
    return (
      <Vacio tamano="chico" icono={<ChartColumn />} titulo="Buscando los modelos">
        Mirando qué modelos de {fila.c.nombre} vendieron y con qué colores y tallas.
      </Vacio>
    );
  }
  if (estado.fase === "sin-soporte") {
    return (
      <Aviso tono="info" titulo="El paso 2 todavía no está disponible">
        La base aún no sabe repartir en modelos. Tu plan de {fila.c.nombre} (paso 1) sigue igual.
      </Aviso>
    );
  }
  if (estado.fase === "fuera") {
    return (
      <Aviso tono="info" titulo={`${fila.c.nombre} no se reparte en modelos`}>
        Esta categoría no entra a los cálculos del plan (es empaque o algo que no se repone por modelo).
      </Aviso>
    );
  }
  if (estado.fase === "error") {
    return (
      <Aviso
        tono="atencion"
        titulo="No se pudieron leer los modelos"
        accion={
          <Boton type="button" peso="fantasma" onClick={recargar}>
            Reintentar
          </Boton>
        }
      >
        La base no respondió. Tu plan de {fila.c.nombre} (paso 1) sigue igual; vuelve a intentarlo en un momento.
      </Aviso>
    );
  }
  return <PasoModelosListo planId={planId} fila={fila} vendidoPorTalla={vendidoPorTalla} lectura={estado.lectura} recargar={recargar} onCambios={onCambios} onCancelar={onCancelar} onIrAlPaso1={onIrAlPaso1} />;
}

const clavesDe = (items: readonly ItemDelReparto[]) => new Map(items.map((i) => [`${i.p}|${i.c}|${i.t ?? ""}`, i.n]));
function mismosItems(a: readonly ItemDelReparto[], b: readonly ItemDelReparto[]): boolean {
  const ma = clavesDe(a);
  const mb = clavesDe(b);
  if (ma.size !== mb.size) return false;
  for (const [k, n] of ma) if (mb.get(k) !== n) return false;
  return true;
}

function PasoModelosListo({
  planId,
  fila,
  vendidoPorTalla,
  lectura,
  recargar,
  onCambios,
  onCancelar,
  onIrAlPaso1,
}: {
  planId: string;
  fila: FilaPlan;
  vendidoPorTalla: ReadonlyMap<string, number> | undefined;
  lectura: LecturaModelos;
  recargar: () => void;
  onCambios: (sucio: boolean) => void;
  onCancelar: () => void;
  onIrAlPaso1: () => void;
}) {
  const router = useRouter();
  const responsable = useResponsable();
  const calculo = fila.calculo;
  const total = calculo?.comprar ?? 0;
  const guardado = lectura.guardado;
  // La curva de tallas del paso 1: la que se guardó en la línea o, si no hay, la que propone el sistema con lo vendido (la misma que usa el formulario del paso 1).
  const curva = useMemo(
    () => (fila.linea && Object.keys(fila.linea.curva).length > 0 ? fila.linea.curva : curvaSugerida(fila.c.tallas, vendidoPorTalla)),
    [fila.linea, fila.c.tallas, vendidoPorTalla],
  );
  const entrada: EntradaDelReparto = useMemo(() => ({ lectura, total, objetivo: calculo?.objetivo ?? 0, curva, dias: fila.diasDeVentas }), [lectura, total, calculo?.objetivo, curva, fila.diasDeVentas]);
  const [pct, setPct] = useState<number | null>(() => (guardado ? guardado.pct : null));
  const [ed, setEd] = useState<Ediciones>(() => (guardado ? edicionesDeLoGuardado(lectura, guardado) : SIN_EDICIONES));
  const [abiertos, setAbiertos] = useState<ReadonlySet<string>>(() => new Set(lectura.modelos.length > 0 ? [lectura.modelos[0].id] : []));
  const [guardando, setGuardando] = useState(false);
  const [conflicto, setConflicto] = useState<string | null>(null);
  const enviando = useRef(false);
  const reparto = useMemo(() => calcularReparto(entrada, pct, ed), [entrada, pct, ed]);
  const items = useMemo(() => itemsDelReparto(reparto), [reparto]);

  // Qué tanto cambió la persona respecto de lo que había: lo guardado o, si nada se guardó, lo que propone el sistema. Sin cambios no hay nada que perder al salir.
  const base = useMemo(() => {
    if (guardado) return { pct: guardado.pct, items: guardado.items };
    const propuesta = calcularReparto(entrada, null, SIN_EDICIONES);
    return { pct: propuesta.pct, items: itemsDelReparto(propuesta) };
  }, [guardado, entrada]);
  const cambio = reparto.pct !== base.pct || !mismosItems(items, base.items);
  const puedeGuardar = reparto.sePasa === 0 && total > 0 && (guardado === null || cambio);
  useEffect(() => {
    onCambios(cambio);
  }, [cambio, onCambios]);

  const modelosConDatos = lectura.modelos.filter((m) => m.vendidas > 0).length;
  const paraRepetir = reparto.modelos.filter((m) => m.elegible).length;
  const exactitud = exactitudDeLosDatos(fila.diasDeVentas, fila.conCampanaAnterior === true);

  const alternar = (id: string) =>
    setAbiertos((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const soltarTodo = () => {
    setPct(null);
    setEd(SIN_EDICIONES);
  };

  async function guardar() {
    if (!puedeGuardar || enviando.current) return;
    if (!responsable.listo) return void avisar.error(responsable.motivo ?? "Elige quién hace esta operación.");
    enviando.current = true;
    setGuardando(true);
    setConflicto(null);
    const firma = responsable.firma();
    const { data, error } = await firmar(
      createClient().rpc(RPC_GUARDAR_PASO_2 as never, { p_plan_id: planId, p_categoria_id: fila.c.id, p_pct: reparto.pct, p_total: total, p_items: items, p_version_esperada: guardado?.version ?? 0 } as never),
      firma,
    );
    responsable.despues(error);
    setGuardando(false);
    enviando.current = false;
    if (error) {
      // Otra persona guardó el paso 2 de esta categoría mientras lo editabas: lo tuyo no se guardó y sigue aquí; la base dice quién y a qué hora.
      if (esVersionCambiada(error)) return void setConflicto(error.message);
      // Se cortó la red: puede que la base haya guardado y la respuesta no llegó. Volver a guardar lo mismo no duplica ni pisa nada.
      if (esFalloDeRed(error)) return void avisar.error(`Se cortó la conexión mientras guardabas el paso 2 de ${fila.c.nombre}: no sabemos si llegó. Vuelve a pulsar «Guardar»; si ya se había guardado, no se duplica.`);
      return void avisar.error(traducirError(error, "guardar el paso 2"));
    }
    const version = Number((data as { version?: unknown } | null)?.version ?? 0);
    avisar.exito(`Paso 2 de ${fila.c.nombre} guardado`, { detalle: `${enteroES.format(reparto.repartido)} en modelos · ${enteroES.format(reparto.nuevos)} para modelos nuevos${version > 0 ? ` · versión ${version}` : ""}` });
    // La lectura vuelve a pedirse: con lo guardado adentro, la hoja queda en lo que ya es de la base (y la lista de atrás marca la categoría).
    recargar();
    router.refresh();
  }

  if (total <= 0) {
    return (
      <Aviso tono="info" titulo={`No hay nada que repartir en ${fila.c.nombre}`}>
        Con lo que ya hay, el plan no pide comprar de esta categoría. Si cambias los escenarios en el paso 1 y piden comprar, aquí repartes en modelos.
      </Aviso>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-guia="paso2.cifras">
        <TarjetaCifra etiqueta="Comprar (paso 1)" valor={enteroES.format(total)} unidad="prendas">
          Lo que decidiste en el paso 1
        </TarjetaCifra>
        <TarjetaCifra etiqueta="Cuesta" valor={solesES(calculo?.inversion ?? 0)}>
          Al costo
        </TarjetaCifra>
        <div className="card-cayla flex flex-col gap-2 p-4 sm:px-5" data-guia="paso2.repetir">
          <p className="label-cayla block min-h-5 text-[11px] font-bold leading-5 text-taupe">Repetir lo que ya vendió</p>
          <div className="flex flex-wrap items-center gap-2">
            <CantidadEditable valor={reparto.pct} onCambiar={(n) => setPct(n)} etiqueta="porcentaje a repetir de lo que ya vendió" tamano="fila" sufijo="%" max={100} deshabilitado={guardando} />
            {reparto.pct !== reparto.pctPorDefecto && (
              <Boton type="button" peso="fantasma" className="btn-chico" onClick={() => setPct(null)} disabled={guardando}>
                Usar {reparto.pctPorDefecto} %
              </Boton>
            )}
          </div>
          <p className="text-xs text-taupe">{reparto.hayParaRepetir ? `El sistema propone ${reparto.pctPorDefecto} %` : "Ningún modelo pide repetirse todavía"}</p>
        </div>
        <TarjetaCifra etiqueta="Quedan para modelos nuevos" valor={enteroES.format(reparto.nuevos)} unidad="prendas" tono={reparto.sePasa > 0 ? "text-ambar-profundo" : undefined}>
          {reparto.sePasa > 0 ? `Te pasaste ${enteroES.format(reparto.sePasa)}` : "Los eliges con tu proveedor o en el Taller"}
        </TarjetaCifra>
      </div>

      <Aviso tono="info" titulo="Por modelo sí hay señal; por color y talla, poca">
        <span>
          De los {enteroES.format(modelosConDatos)} modelos de {fila.c.nombre} que vendieron en {periodoDeVentas(fila.diasDeVentas)}, {enteroES.format(paraRepetir)} vendieron {MIN_VENTAS_PARA_REPETIR} o más:
          esos se pueden repetir. {reparto.ventasSinModelo > 0 ? `Otras ${enteroES.format(reparto.ventasSinModelo)} ventas no tienen modelo (se anotaron «sin registrar»): de esas no hay qué repetir. ` : ""}
          {exactitud ? `${exactitud.titulo}: ${exactitud.detalle}` : ""}
        </span>
      </Aviso>

      {lectura.modelos.length === 0 ? (
        <Vacio tamano="chico" icono={<ChartColumn />} titulo="Ningún modelo vendió todavía">
          Todo el total va a «modelos nuevos por elegir»: abajo tienes los colores y tallas de la categoría para guiarte.
        </Vacio>
      ) : (
        <Tabla guia="paso2.modelos">
          <Encabezado
            plantilla={PLANTILLA_DE_MODELOS}
            columnas={[
              { titulo: "Modelo · marca" },
              { titulo: "Vendió", alinear: "der" },
              { titulo: "Hay hoy", alinear: "der" },
              { titulo: "El sistema propone", alinear: "der", ayuda: "Lo que el sistema propone repetir de cada modelo, con el % de arriba" },
              { titulo: "Tú compras", alinear: "der" },
              { titulo: "Dato" },
            ]}
          />
          {reparto.modelos.map((m) => (
            <FilaDeModelo
              key={m.id}
              m={m}
              abierto={abiertos.has(m.id)}
              tallas={lectura.tallas}
              deshabilitado={guardando}
              onAbrir={() => alternar(m.id)}
              onModelo={(n) => setEd((e) => editarModelo(e, m.id, n))}
              onColor={(codigo, n) => setEd((e) => editarColor(e, m.id, codigo, n))}
              onTalla={(codigo, tallaId, n) => setEd((e) => editarTalla(e, reparto, m.id, codigo, tallaId, n))}
              onVolver={() => setEd((e) => volverALoQuePropone(e, m.id))}
            />
          ))}
          {lectura.modelosTotal > lectura.modelos.length && (
            <p className="px-5 py-2.5 text-xs text-taupe">Se muestran los {enteroES.format(lectura.modelos.length)} que más vendieron de {enteroES.format(lectura.modelosTotal)}.</p>
          )}
        </Tabla>
      )}

      <div className="p2-nuevos" data-guia="paso2.nuevos">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-tinta">Modelos nuevos por elegir</p>
            <p className="text-xs text-taupe">Aquí no se nombra un modelo: lo eliges con tu proveedor o en el Taller</p>
          </div>
          <p className="font-serif text-2xl tabular-nums text-tinta">{enteroES.format(reparto.nuevos)}</p>
          <Chip tono="verde" versalitas={false}>
            Lo eliges tú
          </Chip>
        </div>
        {reparto.guia && (reparto.guia.colores.length > 0 || reparto.guia.tallas.length > 0) && (
          <div className="mt-3 space-y-2 border-t border-sand pt-3 text-sm">
            <p className="text-xs text-taupe">
              <b className="font-semibold text-tinta">Colores y tallas que conviene buscar</b> (de lo que más vende la categoría, restando lo que ya hay):
            </p>
            <div className="flex flex-wrap gap-2">
              {reparto.guia.colores.map((c) => (
                <span key={c.codigo} className="inline-flex items-center gap-1.5 rounded-full bg-hueso px-2.5 py-0.5 text-xs text-tinta">
                  <span data-color-dato aria-hidden className="p2-punto" style={c.hex ? { backgroundColor: c.hex } : undefined} />
                  {c.nombre} · {enteroES.format(c.unidades)}
                </span>
              ))}
            </div>
            {reparto.guia.tallas.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {reparto.guia.tallas.map((t) => (
                  <span key={t.id} className="rounded-lg bg-hueso px-2 py-0.5 text-xs font-semibold tabular-nums text-tinta">
                    {t.valor} {enteroES.format(t.unidades)}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="space-y-3" data-guia="paso2.cuadre">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <div className="min-w-[14rem] flex-1">
            <p className="text-sm font-semibold text-tinta">
              Modelos elegidos {enteroES.format(reparto.repartido)} de {enteroES.format(total)}
            </p>
            <BarraAvance pct={Math.min(100, (reparto.repartido / Math.max(1, total)) * 100)} alto="normal" tono={reparto.sePasa > 0 ? "ambar" : undefined} etiqueta={`${reparto.repartido} de ${total} prendas repartidas en modelos`} />
          </div>
          {reparto.sePasa > 0 ? (
            <Chip tono="ambar" versalitas={false}>
              Te pasaste {enteroES.format(reparto.sePasa)}
            </Chip>
          ) : (
            <Chip tono="verde" versalitas={false}>
              El resto ({enteroES.format(reparto.nuevos)}) queda para modelos nuevos
            </Chip>
          )}
          {(pct !== null || ed.modelo.size + ed.color.size + ed.tallas.size > 0) && (
            <Boton type="button" peso="fantasma" onClick={soltarTodo} disabled={guardando}>
              Usar lo que propone
            </Boton>
          )}
        </div>
        {reparto.sePasa > 0 && (
          <p className="flex flex-wrap items-center gap-x-2 text-sm text-tinta/80">
            <Info aria-hidden className="h-4 w-4 shrink-0 text-ambar-profundo" />
            Quita {enteroES.format(reparto.sePasa)} prendas de algún modelo, o sube el total en el paso 1.
            <button type="button" className="btn-cayla btn-enlace" onClick={onIrAlPaso1}>
              Ir al paso 1
            </button>
          </p>
        )}
        <p className="text-xs text-taupe">
          Toca un modelo para ver sus colores y tallas y cámbialas ahí mismo. Lo que no elijas para un modelo queda como «modelos nuevos por elegir»: así el total siempre cuadra con el paso 1.{" "}
          <Ayuda titulo="Cómo lo calcula el sistema">
            <span className="block">
              Cada modelo pesa lo que vendió contra todo lo que vendió la categoría; a lo que conviene tener de ese modelo se le resta lo que ya hay. Dentro del modelo, cada color y cada talla pesan lo que vendieron, con cautela: con pocas
              ventas se apoyan en un reparto parejo (el mismo peso n/(n+10) de la curva de tallas del paso 1).
            </span>
            <span className="mt-2 block">
              Un modelo con menos de {MIN_VENTAS_PARA_REPETIR} ventas no se propone para repetir: con 1 o 2 ventas no hay un patrón, solo una prenda que salió. Y lo que no se reparte en modelos que ya vendieron queda como «modelos
              nuevos por elegir»: el sistema solo puede nombrar modelos que ya existen.
            </span>
            <span className="mt-2 block">No cuenta lo que ya viene en órdenes de compra por modelo: eso ya se descontó del total en el paso 1.</span>
          </Ayuda>
        </p>
        {conflicto && (
          <Aviso
            tono="atencion"
            titulo="Otra persona guardó este paso 2"
            accion={
              <Boton type="button" peso="fantasma" onClick={recargar}>
                Ver lo que guardó
              </Boton>
            }
          >
            {conflicto}
          </Aviso>
        )}
      </div>

      <div className="space-y-3 border-t border-sand pt-4">
        {guardado && (
          <p className="text-xs text-taupe">
            Guardado{guardado.por ? ` por ${guardado.por}` : ""} (versión {guardado.version}): {enteroES.format(guardado.unidades)} prendas en modelos.
          </p>
        )}
        <ComboResponsable control={responsable} deshabilitado={guardando} />
        <div className="pie-acciones pt-1">
          <Boton type="button" onClick={onCancelar}>
            Cancelar
          </Boton>
          <Boton
            type="button"
            peso="primario"
            cargando={guardando}
            disabled={!puedeGuardar}
            title={reparto.sePasa > 0 ? `Te pasaste ${reparto.sePasa} del total del paso 1` : guardado && !cambio ? "No cambiaste nada" : undefined}
            onClick={() => void guardar()}
          >
            Guardar el paso 2
          </Boton>
        </div>
      </div>
    </div>
  );
}
