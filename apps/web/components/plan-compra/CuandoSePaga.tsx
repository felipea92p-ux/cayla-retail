"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CostoEIgv } from "@/components/plan-compra/CostoEIgv";
import { TandaDePago } from "@/components/plan-compra/TandaDePago";
import { QuePasaEnFinanzas, SelectorDeVisibilidad } from "@/components/plan-compra/VisibilidadEnFinanzas";
import type { PlanConPlan } from "@/components/plan-compra/usePlanDerivado";
import { Aviso } from "@/components/ui/Aviso";
import { avisar } from "@/components/ui/Avisos";
import { Boton } from "@/components/ui/campos";
import { SegmentoDeslizante } from "@/components/ui/SegmentoDeslizante";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { useSalidaSinGuardar } from "@/components/ui/useSalidaSinGuardar";
import { createClient } from "@/lib/supabase/client";
import { diaYHoraLima } from "@/lib/fechas-lima";
import { esFalloDeRed, esVersionCambiada, traducirError } from "@/lib/error-escritura";
import { firmar } from "@/lib/responsable-reglas";
import { useResponsable } from "@/lib/useResponsable";
import {
  MAX_TANDAS,
  RPC_GUARDAR_PAGOS,
  RPC_VISIBILIDAD,
  TEXTO_DE_VISIBILIDAD,
  ajustarPorcentajes,
  argsGuardarPagos,
  categoriasPorTanda,
  costosConIgv,
  pagosDeLasTandas,
  pagosSonValidos,
  salidaPorMes,
  semanasDePedido,
  tandasPorDefecto,
  type LecturaPagado,
  type LecturaPagos,
  type Tanda,
  type VisibilidadFinanzas,
} from "@/lib/plan-compra-inversion";
import { diasConQueSeCuenta } from "@/lib/plan-compra-plazo";
import { solesEnterosES } from "@/lib/plan-compra-presupuesto";
import { enteroES, fechaCortaES, solesES } from "@/lib/plan-compra-reglas";

// «Cuándo se paga» (Compras ▸ Plan de campaña ▸ Presupuesto ▸ Cuándo se paga; ADR-0527, Felipe 2026-10-26, spike ⑤ «Cuándo se pide y se paga»): de lo que el plan todavía pide comprar, cuándo se
// pide (en 1, 2 o 3 tandas) y cómo se paga cada tanda, cuánto del costo es IGV y si Finanzas ve la compra. Lo que se GUARDA son los pagos (fecha y %), no las tandas: Finanzas lee los pagos y si
// mañana cambia esta pantalla, no se entera. Nada se compra ni se paga aquí: es el plan de pagos; el pago de verdad vive en Compras ▸ Por pagar y reemplaza al planeado.
// Las cuentas son de `lib/plan-compra-inversion.ts` (con su prueba); la base, de `guardar_plan_compra_pagos` y `cambiar_visibilidad_plan_compra` (con la suya). Esta pantalla solo las junta.
//
// CAÍDA EXTERNA. Si la base no responde al guardar, la pantalla lo dice y lo armado sigue aquí; volver a guardar lo mismo no duplica nada (lo idéntico no crea otra foto). Si otra persona guardó
// mientras se editaba, lo de esta persona no pisa a la otra: se dice quién y se ofrece ver lo que guardó.

export function CuandoSePaga({ derivado, lectura, pagado }: { derivado: PlanConPlan; lectura: LecturaPagos; pagado: LecturaPagado | null }) {
  const router = useRouter();
  const responsable = useResponsable();
  const { plan, filas, plazo, plazoFijado, totales } = derivado;
  const hoy = plan.hoy;
  const limite = plazo.limite;
  const diasParaLlegar = diasConQueSeCuenta(plazoFijado);
  const guardado = lectura.guardado;

  // Lo que había al abrir: lo guardado o, si nada se guardó, las tandas de siempre (todas a tiempo y a contado). Quien llama pone `key` con la versión: al cambiar, la pantalla arranca de lo guardado.
  const baseTandas = useMemo(() => guardado?.tandas ?? tandasPorDefecto(2, hoy, limite), [guardado, hoy, limite]);
  const baseIgv = useMemo(() => guardado?.igvIncluido ?? [], [guardado]);
  const [tandas, setTandas] = useState<Tanda[]>(baseTandas);
  const [incluidas, setIncluidas] = useState<ReadonlySet<string>>(() => new Set(baseIgv));
  const [guardando, setGuardando] = useState(false);
  const [conflicto, setConflicto] = useState<string | null>(null);
  const enviando = useRef(false);

  // La visibilidad se guarda al instante; mientras viaja (y hasta que la pantalla se relee) se muestra la elegida y, si falla, vuelve a la que era. La elegida recuerda sobre cuál estaba:
  // cuando llega la lectura nueva, ya no coincide y se muestra la de la base, sin tener que «borrar» nada a mano.
  const [elegidaVis, setElegidaVis] = useState<{ valor: VisibilidadFinanzas; sobre: VisibilidadFinanzas } | null>(null);
  const [cambiandoVis, setCambiandoVis] = useState(false);
  const mostradaVis = elegidaVis && elegidaVis.sobre === lectura.visibilidad ? elegidaVis.valor : lectura.visibilidad;

  const costos = useMemo(
    () => costosConIgv(filas.flatMap((f) => (f.calculo ? [{ clave: f.c.id, nombre: f.c.nombre, inversion: f.calculo.inversion }] : [])), incluidas),
    [filas, incluidas],
  );
  const pagos = useMemo(() => pagosDeLasTandas(tandas), [tandas]);
  const meses = useMemo(() => salidaPorMes(pagos, costos.saleDeCaja, hoy), [pagos, costos.saleDeCaja, hoy]);
  const porTanda = useMemo(() => categoriasPorTanda(costos.filas, tandas), [costos.filas, tandas]);
  const semanas = useMemo(() => semanasDePedido(hoy, limite), [hoy, limite]);

  const foto = (t: readonly Tanda[], i: ReadonlySet<string> | readonly string[]) => JSON.stringify([t.map((x) => [x.pedido, x.pct, x.forma]), [...i].sort()]);
  const cambio = foto(tandas, incluidas) !== foto(baseTandas, baseIgv);
  const valido = pagosSonValidos(pagos);
  const puedeGuardar = valido && (guardado === null || cambio);
  const salida = useSalidaSinGuardar(cambio, "Cambiaste cómo se paga esta campaña y todavía no lo guardaste. Si sales ahora, se pierde.");

  const cambiarTanda = (i: number, c: Partial<Tanda>) => setTandas((prev) => ajustarPorcentajes(prev.map((t, k) => (k === i ? { ...t, ...c } : t))));
  const cambiarCantidad = (n: number) =>
    setTandas((prev) => {
      const nuevas = tandasPorDefecto(n as 1 | 2 | 3, hoy, limite);
      // Lo que ya se eligió de cada tanda que sigue existiendo (su semana y su forma) se conserva; el % vuelve al de siempre.
      return nuevas.map((t, i) => (prev[i] ? { ...t, pedido: prev[i]!.pedido, forma: prev[i]!.forma } : t));
    });
  const marcar = (clave: string, incluido: boolean) =>
    setIncluidas((s) => {
      const n = new Set(s);
      if (incluido) n.add(clave);
      else n.delete(clave);
      return n;
    });
  const marcarTodas = (incluido: boolean) =>
    setIncluidas((s) => {
      const n = new Set(s);
      for (const f of costos.filas) {
        if (incluido) n.add(f.clave);
        else n.delete(f.clave);
      }
      return n;
    });
  const descartar = () => {
    setTandas(baseTandas);
    setIncluidas(new Set(baseIgv));
    setConflicto(null);
  };

  async function guardar() {
    if (!puedeGuardar || enviando.current) return;
    if (!responsable.listo) return void avisar.error(responsable.motivo ?? "Elige quién hace esta operación.");
    enviando.current = true;
    setGuardando(true);
    setConflicto(null);
    const { data, error } = await firmar(createClient().rpc(RPC_GUARDAR_PAGOS as never, argsGuardarPagos(plan.plan.id, tandas, incluidas, guardado?.version ?? 0) as never), responsable.firma());
    responsable.despues(error);
    setGuardando(false);
    enviando.current = false;
    if (error) {
      // Otra persona guardó la forma de pago de esta campaña mientras se editaba: lo de esta persona no se guardó y sigue aquí; la base dice quién y a qué hora.
      if (esVersionCambiada(error)) return void setConflicto(error.message);
      if (esFalloDeRed(error)) return void avisar.error("Se cortó la conexión mientras guardabas cómo se paga: no sabemos si llegó. Vuelve a pulsar «Guardar»; si ya se había guardado, no se duplica.");
      return void avisar.error(traducirError(error, "guardar cómo se paga la campaña"));
    }
    const r = data as { version?: unknown; sin_cambios?: unknown } | null;
    const version = Number(r?.version ?? 0);
    avisar.exito(r?.sin_cambios === true ? "Ya estaba guardado" : "Forma de pago guardada", {
      detalle: `${plan.plan.nombre} · ${tandas.length === 1 ? "1 tanda" : `${tandas.length} tandas`} · ${pagos.length === 1 ? "1 pago" : `${pagos.length} pagos`}${version > 0 ? ` · versión ${version}` : ""}`,
    });
    // La guardia de «salir sin guardar» se retira ANTES de refrescar: si corren a la vez, Next puede caer a una recarga completa.
    await salida.retirarYa();
    router.refresh();
  }

  async function cambiarVisibilidad(v: VisibilidadFinanzas) {
    if (v === mostradaVis || cambiandoVis) return;
    if (!responsable.listo) return void avisar.error(responsable.motivo ?? "Elige quién hace el cambio en «Guardar cómo se paga», abajo.");
    setCambiandoVis(true);
    setElegidaVis({ valor: v, sobre: lectura.visibilidad });
    const { error } = await firmar(createClient().rpc(RPC_VISIBILIDAD as never, { p_plan_id: plan.plan.id, p_valor: v } as never), responsable.firma());
    responsable.despues(error);
    setCambiandoVis(false);
    if (error) {
      setElegidaVis(null);
      if (esFalloDeRed(error)) return void avisar.error("Se cortó la conexión mientras lo cambiabas: no sabemos si llegó. Vuelve a elegirlo; repetir lo mismo no cambia nada.");
      return void avisar.error(traducirError(error, "cambiar lo que Finanzas ve de la campaña"));
    }
    avisar.exito(TEXTO_DE_VISIBILIDAD[v].corto, { detalle: plan.plan.nombre });
    router.refresh();
  }

  const empezo = plazo.estado === "empezo" || plazo.estado === "termino";
  const cuantasTandas = tandas.length;
  const sinNadaPorComprar = costos.filas.length === 0;

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" data-guia="pagos.cifras">
        <TarjetaCifra etiqueta="Compra planeada al costo" valor={solesES(costos.inversion)}>
          {enteroES.format(totales.aComprar)} prendas · lo que falta pedir
        </TarjetaCifra>
        <TarjetaCifra etiqueta="Sale de caja (con IGV)" valor={solesES(costos.saleDeCaja)}>
          {solesEnterosES(costos.sinIgv)} a proveedores + {solesEnterosES(costos.igv)} de IGV · {cuantasTandas === 1 ? "1 tanda" : `${cuantasTandas} tandas`}
        </TarjetaCifra>
        <TarjetaCifra etiqueta="Hasta cuándo pedir" valor={limite ? fechaCortaES(limite) : plazo.estado === "termino" ? "Terminó" : "Ya empezó"}>
          {limite ? `${fechaCortaES(plan.plan.desde)} menos ${diasParaLlegar} días para llegar` : plazo.texto}
        </TarjetaCifra>
        <TarjetaCifra etiqueta="Esto no es un gasto" valor={<span className="text-[1.375rem] leading-tight">Inversión en mercadería</span>}>
          Es mercadería: el costo entra cuando se vende
        </TarjetaCifra>
      </div>

      {pagado && (derivado.pedido?.total ?? 0) > 0 && (
        <Aviso tono="info" chico titulo="Lo que ya se pidió no está aquí">
          De esta campaña ya hay {solesES(derivado.pedido?.total ?? 0)} en órdenes y {solesES(pagado.pagadoSinIgv)} pagados (sin IGV). Lo que armas aquí es solo lo que todavía falta pedir; lo ya pedido se paga desde Compras ▸ Por pagar.
        </Aviso>
      )}

      <div className="grid gap-4 min-[1100px]:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-6">
          <section>
            <TituloSeccion dato="Plan ▸ Presupuesto ▸ Cuándo se paga" className="mb-3">
              Cuándo se pide y cuándo se paga
            </TituloSeccion>
            <div className="card-cayla space-y-4 p-5" data-guia="pagos.tandas">
              {sinNadaPorComprar ? (
                <Aviso tono="info" chico titulo="No hay nada por pedir">
                  Con lo que ya hay y lo que viene en camino, el plan no pide comprar nada de esta campaña. Cuando lo pida, aquí armas cuándo se pide y cómo se paga.
                </Aviso>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                    <span className="label-cayla text-[11px] font-bold text-taupe">Tandas de compra</span>
                    <SegmentoDeslizante
                      etiqueta="Cuántas tandas"
                      valor={String(cuantasTandas)}
                      onCambio={(c) => cambiarCantidad(Number(c))}
                      opciones={Array.from({ length: MAX_TANDAS }, (_, k) => ({ clave: String(k + 1), etiqueta: k === 0 ? "1 tanda" : `${k + 1} tandas` }))}
                    />
                  </div>
                  <div className="space-y-3">
                    {tandas.map((t, i) => (
                      <TandaDePago
                        key={i}
                        numero={i + 1}
                        tanda={t}
                        saleDeCaja={(costos.saleDeCaja * t.pct) / 100}
                        esUltima={i === tandas.length - 1}
                        semanas={semanas}
                        hoy={hoy}
                        limite={limite}
                        diasParaLlegar={diasParaLlegar}
                        desde={plan.plan.desde}
                        categorias={(porTanda[i] ?? []).flatMap((clave) => costos.filas.filter((f) => f.clave === clave).map((f) => ({ clave: f.clave, nombre: f.nombre, saleDeCaja: f.saleDeCaja })))}
                        deshabilitado={guardando}
                        onCambiar={(c) => cambiarTanda(i, c)}
                      />
                    ))}
                  </div>
                  <div data-guia="pagos.meses">
                    <p className="label-cayla mb-2 text-[11px] font-bold text-taupe">Lo que sale de caja, mes a mes</p>
                    <div className="grid grid-cols-2 gap-3 min-[640px]:grid-cols-4">
                      {meses.map((m) => (
                        <TarjetaCifra key={m.clave} etiqueta={m.nombre} valor={m.monto > 0 ? solesEnterosES(m.monto) : "—"} tono={m.monto > 0 ? undefined : "text-taupe"}>
                          {m.monto > 0 ? "con IGV" : "sin pagos"}
                        </TarjetaCifra>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          </section>

          <section>
            <TituloSeccion dato="algunos costos ya lo incluyen y otros no" className="mb-3">
              Costo e IGV
            </TituloSeccion>
            <div className="card-cayla p-5">
              <CostoEIgv costos={costos} onMarcar={marcar} onTodas={marcarTodas} deshabilitado={guardando} />
            </div>
          </section>

          <section data-guia="pagos.guardar">
            {guardado === null && (
              <Aviso tono="info" chico titulo="Todavía no guardaste cómo se paga">
                Mientras no lo guardes, Finanzas cuenta lo que falta pedir sin fechas de pago. {empezo ? "La campaña ya empezó: lo que pidas ahora sirve para reponer." : ""}
              </Aviso>
            )}
            <div className="mt-3 space-y-3">
              {conflicto && (
                <Aviso
                  tono="atencion"
                  titulo="Otra persona guardó cómo se paga"
                  accion={
                    <Boton type="button" peso="fantasma" onClick={() => void salida.retirarYa().then(() => router.refresh())}>
                      Ver lo que guardó
                    </Boton>
                  }
                >
                  {conflicto}
                </Aviso>
              )}
              {!valido && (
                <Aviso tono="atencion" chico titulo="Los pagos no se pueden guardar así">
                  Los pagos tienen que sumar 100 % y cada uno caer en una fecha distinta. Revisa los porcentajes de las tandas.
                </Aviso>
              )}
              {guardado && (
                <p className="text-xs text-taupe">
                  Guardado{guardado.por ? ` por ${guardado.por}` : ""}
                  {guardado.en ? ` el ${diaYHoraLima(guardado.en).dia}` : ""} (versión {guardado.version}): {guardado.pagos.length === 1 ? "1 pago" : `${guardado.pagos.length} pagos`}.
                </p>
              )}
              <ComboResponsable control={responsable} deshabilitado={guardando} />
              <div className="pie-acciones pt-1">
                {cambio && (
                  <Boton type="button" onClick={descartar} disabled={guardando}>
                    Descartar cambios
                  </Boton>
                )}
                <Boton type="button" peso="primario" cargando={guardando} disabled={!puedeGuardar || sinNadaPorComprar} title={!valido ? "Los pagos tienen que sumar 100 %" : guardado && !cambio ? "No cambiaste nada" : undefined} onClick={() => void guardar()}>
                  Guardar cómo se paga
                </Boton>
              </div>
            </div>
          </section>
        </div>

        <div className="min-w-0 space-y-6">
          <section>
            <TituloSeccion dato="qué ve Finanzas" className="mb-3">
              Así se ve en Finanzas
            </TituloSeccion>
            <div className="card-cayla space-y-4 p-5">
              <SelectorDeVisibilidad valor={mostradaVis} onCambio={(v) => void cambiarVisibilidad(v)} cambiando={cambiandoVis} por={lectura.visibilidadPor} en={lectura.visibilidadEn} />
            </div>
          </section>
          <section>
            <TituloSeccion className="mb-3">Qué pasa en Finanzas</TituloSeccion>
            <div className="card-cayla p-5">
              <QuePasaEnFinanzas visibilidad={mostradaVis} />
            </div>
          </section>
        </div>
      </div>
      {salida.aviso}
    </div>
  );
}
