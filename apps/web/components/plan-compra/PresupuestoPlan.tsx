"use client";

import { useMemo, useState } from "react";
import { Ayuda } from "@/components/Ayuda";
import { BarraApilada, MuestraTramo } from "@/components/ui/BarraApilada";
import { Chip } from "@/components/ui/Chip";
import { CifraQueCuenta } from "@/components/ui/CifraQueCuenta";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { Encabezado, Tabla, celda, fila, type Columna } from "@/components/ui/Tabla";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { MarcoPlan, type DelMarco } from "@/components/plan-compra/MarcoPlan";
import { PartesDelPresupuesto } from "@/components/plan-compra/PartesDelPresupuesto";
import { NotaDeVersionModal, type AccionDeVersion } from "@/components/plan-compra/NotaDeVersionModal";
import { PlanConTope } from "@/components/plan-compra/PlanConTope";
import { RecuperoModal } from "@/components/plan-compra/RecuperoModal";
import { RepartoModal } from "@/components/plan-compra/RepartoModal";
import { SimuladorPlan } from "@/components/plan-compra/SimuladorPlan";
import { SinCampana } from "@/components/plan-compra/SinCampana";
import { SupuestosDelPlan } from "@/components/plan-compra/SupuestosDelPlan";
import { TONOS_DE_INVERSION } from "@/components/plan-compra/tonos-de-inversion";
import { TopeModal } from "@/components/plan-compra/TopeModal";
import { VersionesDelPlan } from "@/components/plan-compra/VersionesDelPlan";
import { usePlanDerivado, type PlanConPlan } from "@/components/plan-compra/usePlanDerivado";
import { diasConQueSeCuenta } from "@/lib/plan-compra-plazo";
import { cifrasDelPresupuesto, filasDeCosto, solesEnterosES, tramosDeLaPlata } from "@/lib/plan-compra-presupuesto";
import { enteroES, solesES, type CampanasLeidas } from "@/lib/plan-compra-reglas";
import { lineasDeTope, planConGanancia } from "@/lib/plan-compra-tope";
import { RPC_GUARDAR_VERSION, RPC_RESTAURAR_VERSION, RPC_USAR_CON_TOPE, notaSugerida, planDeLaFoto, type VersionConFoto } from "@/lib/plan-compra-versiones";
import type { LecturaMotor } from "@/lib/motor-demanda";

// Compras ▸ Plan de campaña ▸ Presupuesto (Felipe 2026-10-26, spike ④ de «la visión»): cuánto cuesta lo que el plan pide comprar, si cabe en el tope,
// dónde se va la plata y qué rinde cada sol en cada categoría. Solo lee y propone: el plan se arma en la pestaña Plan y aquí se ve su costo. La cuenta
// es de `lib/plan-compra-tope.ts` y las frases, de `lib/plan-compra-presupuesto.ts` (las dos con su prueba); esta pantalla solo las dibuja.
// Los supuestos de toda la campaña (lo que sobra, el descuento, lo ya pedido, los días para llegar, el reparto) viven aquí desde esta pestaña: antes
// estaban en el cajón «Resumen» del Plan.

// La tabla se adapta al ancho de SU tarjeta, no al de la pantalla (`@container`): con la tarjeta ancha lleva las siete columnas; con la angosta (la
// columna izquierda a 1440 px) deja «% del total» dentro de «Inversión» y «Datos» bajo el nombre, en vez de apretar todo hasta que el nombre desaparezca.
const SOLO_ANCHA = "hidden @min-[760px]:block";
const COLUMNAS: Columna[] = [
  { titulo: "Categoría" },
  { titulo: "Comprar", alinear: "der" },
  { titulo: "Costo por prenda", alinear: "der" },
  { titulo: "Inversión", alinear: "der" },
  { titulo: "% del total", alinear: "der", clase: SOLO_ANCHA },
  { titulo: "Gana por cada S/\u00a01", alinear: "der", ayuda: "Lo que se espera ganar con lo que compras, por cada sol que pagas, descontando lo que sobra" },
  { titulo: "Datos", clase: SOLO_ANCHA },
];
// Las dos plantillas se escriben juntas: la de la tarjeta ancha (la última) gana desde 760 px de ancho de tarjeta.
const PLANTILLA =
  "sm:grid-cols-[minmax(0,1.4fr)_4.5rem_6rem_7.5rem_7rem] @min-[760px]:grid-cols-[minmax(0,1.5fr)_4.5rem_6.5rem_6.5rem_5rem_7.5rem_7.5rem]";

/** Cuántas categorías nombra la leyenda de «Dónde se va la plata»: la barra lleva todas, el texto las que más pesan. */
const EN_LA_LEYENDA = 6;

export function PresupuestoPlan({
  datos,
  falla,
  preparacion,
  campanas,
  puedeContar,
  veAnalisis = false,
  puedeVerCompras = false,
  planPedidoNoExiste = false,
  propuesta = null,
  pedido = null,
  historia = null,
  descuentos = null,
  plazo = null,
  versiones = null,
  versionesFallo = false,
}: {
  datos: unknown;
  falla: string | null;
  preparacion: LecturaMotor;
  campanas: CampanasLeidas | null;
  puedeContar: boolean;
  /** Ve Análisis: el simulador ofrece el acceso a «Qué pedir», prenda por prenda. */
  veAnalisis?: boolean;
  /** Ve Compras ▸ Mis compras (`ordenes_compra`): solo entonces «Ver las órdenes» lleva a donde están. */
  puedeVerCompras?: boolean;
  planPedidoNoExiste?: boolean;
  propuesta?: unknown;
  pedido?: unknown;
  historia?: unknown;
  descuentos?: unknown;
  plazo?: unknown;
  /** El precio de la plata, el tope y las versiones (`fn_plan_compra_versiones`, ADR-0523), crudo; null = la base no lo manda (sin versiones ni «Usar el plan con tope»). */
  versiones?: unknown;
  /** La lectura de versiones falló (no es que la base no la tenga): el plan se calculó sin el tope aplicado y hay que decirlo. */
  versionesFallo?: boolean;
}) {
  const derivado = usePlanDerivado({ datos, descuentos, propuesta, historia, pedido, plazo, versiones, preparacion, puedeContar, campanas });
  if (derivado.plan === null) return <SinCampana activa="presupuesto" campanas={campanas} falla={falla} />;
  return (
    <MarcoPlan
      activa="presupuesto"
      derivado={derivado}
      campanas={campanas}
      planPedidoNoExiste={planPedidoNoExiste}
      versionesFallo={versionesFallo}
      subtitulo={
        <>
          {derivado.plan.plan.nombre}: cuánto cuesta lo que vas a comprar y si cabe en tu tope.{" "}
          <span className="inline-block align-middle">
            <Ayuda titulo="Cómo se lee">
              <span className="block">
                Aquí ves cuánto cuesta, al costo, lo que el plan pide comprar (solo las categorías que ya tienen plan) y si cabe en tu tope. Lo armas en la pestaña Plan; aquí no se compra nada.
              </span>
              <span className="mt-2 block">
                «Lo que se espera ganar» es lo que suma comprar esto frente a no comprar nada, contando lo que alcanza a venderse al precio de la campaña y lo que sobra al % que
                fijaste. Es una estimación: depende de tus tres escenarios.
              </span>
            </Ayuda>
          </span>
        </>
      }
    >
      {(marco) => <ContenidoDelPresupuesto derivado={derivado} marco={marco} veAnalisis={veAnalisis} puedeVerCompras={puedeVerCompras} />}
    </MarcoPlan>
  );
}

function ContenidoDelPresupuesto({ derivado, marco, veAnalisis, puedeVerCompras }: { derivado: PlanConPlan; marco: DelMarco; veAnalisis: boolean; puedeVerCompras: boolean }) {
  const { plan, filas, hechosDelPlan, pedido, plazoFijado, momento, versiones, precioDeLaPlata } = derivado;
  const [editandoTope, setEditandoTope] = useState(false);
  // La hoja de la nota de una versión: guardar una, usar el plan con tope o volver a una (las tres con el mismo camino; ver `NotaDeVersionModal`).
  const [hojaDeVersion, setHojaDeVersion] = useState<AccionDeVersion | null>(null);
  const [editandoRecupero, setEditandoRecupero] = useState(false);
  const [editandoReparto, setEditandoReparto] = useState(false);
  const lineas = useMemo(() => lineasDeTope(filas), [filas]);
  // El plan de hoy: el que cuenta la pantalla Plan, con el precio de la plata que la campaña usa (0 = el de siempre).
  const precioGuardado = precioDeLaPlata;
  const hoy = useMemo(() => planConGanancia(lineas, precioGuardado), [lineas, precioGuardado]);
  const cifras = cifrasDelPresupuesto(hoy, plan.tope.valor);
  const tramos = useMemo(() => tramosDeLaPlata(hoy), [hoy]);
  const costos = useMemo(() => filasDeCosto(hoy, filas), [hoy, filas]);
  const hrefPlan = `/compras/plan?plan=${plan.plan.id}`;
  const pasaDelTope = cifras.pasa !== null && cifras.pasa > 0;

  // Lo que ve la base de lo de hoy, para la versión automática que guarda ANTES de un cambio grande (lo que la pantalla mostraba).
  const antes = { p_prendas_antes: hoy.prendas, p_inversion_antes: hoy.inversion };
  const guardarVersion = () =>
    setHojaDeVersion({
      titulo: "Guardar una versión",
      subtitulo: "Queda como un punto al que puedes volver.",
      textoBoton: "Guardar versión",
      notaInicial: "",
      rpc: RPC_GUARDAR_VERSION,
      args: (nota) => ({ p_plan_id: plan.plan.id, p_nota: nota || null, p_prendas: hoy.prendas, p_inversion: hoy.inversion }),
      exito: "Versión guardada",
      intento: "guardar la versión",
      aclaracion: "Guarda el plan como está hoy: tus categorías, el tope y si usa el plan con tope. Nada se compra.",
    });
  const usarElPlanConTope = (x: { tope: number; precioDeLaPlata: number; prendas: number; inversion: number }) =>
    setHojaDeVersion({
      titulo: "Usar el plan con tope",
      subtitulo: `${enteroES.format(x.prendas)} prendas · ${solesEnterosES(x.inversion)}. Queda como una versión nueva.`,
      textoBoton: "Usar el plan con tope",
      notaInicial: notaSugerida("plan_con_tope", x.tope, null),
      rpc: RPC_USAR_CON_TOPE,
      args: (nota) => ({ p_plan_id: plan.plan.id, p_precio_de_la_plata: x.precioDeLaPlata, p_tope: x.tope, p_nota: nota || null, p_prendas: x.prendas, p_inversion: x.inversion, ...antes }),
      exito: "Plan con tope guardado",
      intento: "usar el plan con tope",
      aclaracion: "El tope pasa a ser el que elegiste y el plan compra lo que cabe en él. Lo que tenías hoy queda guardado como una versión, para volver. Nada se compra.",
    });
  const volverAUnaVersion = (foto: VersionConFoto) => {
    const n = foto.version.numero;
    const deLaFoto = planDeLaFoto(foto.lineas, foto.version.precioDeLaPlata, filas);
    setHojaDeVersion({
      titulo: `Volver a la versión ${n}`,
      subtitulo: `No borra nada: crea una versión nueva con lo mismo que tenía la ${n}. Las versiones de después siguen en la lista.`,
      textoBoton: "Volver a esta versión",
      notaInicial: notaSugerida("restauracion", null, n),
      rpc: RPC_RESTAURAR_VERSION,
      args: (nota) => ({ p_plan_id: plan.plan.id, p_numero: n, p_nota: nota || null, p_prendas: deLaFoto.prendas, p_inversion: deLaFoto.inversion, ...antes }),
      exito: `Volviste a la versión ${n}`,
      intento: "volver a esa versión",
      aclaracion: "Las categorías que armaste después de esa versión no se tocan.",
    });
  };

  return (
    <>
      <PartesDelPresupuesto activa="costos" planId={plan.plan.id} />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" data-guia="presupuesto.cifras">
        <TarjetaCifra
          etiqueta="Inversión al costo"
          valor={
            <>
              S/&nbsp;<CifraQueCuenta valor={cifras.inversion} alMontar />
            </>
          }
        >
          {enteroES.format(cifras.prendas)} prendas · solo categorías con plan
        </TarjetaCifra>
        <TarjetaCifra
          etiqueta="Tu tope"
          valor={cifras.tope === null ? "Sin tope" : solesEnterosES(cifras.tope)}
          detalleTono={cifras.pasa === null ? undefined : pasaDelTope ? "text-ambar-profundo" : "text-verde-profundo"}
          accion={{ texto: cifras.tope === null ? "Poner un tope" : "Editar el tope", onClick: () => setEditandoTope(true) }}
        >
          {cifras.pasa === null
            ? "Ponle uno para ver si el plan cabe"
            : pasaDelTope
              ? `Te pasas ${solesEnterosES(cifras.pasa)}${cifras.pasaPct !== null ? ` (${cifras.pasaPct} %)` : ""}`
              : `Te quedan ${solesEnterosES(-cifras.pasa)} para comprar`}
        </TarjetaCifra>
        <TarjetaCifra
          etiqueta="Lo que se espera ganar"
          valor={solesEnterosES(cifras.ganancia)}
          ayuda={
            <Ayuda titulo="Lo que se espera ganar">
              Lo que suma comprar lo que pide el plan, frente a no comprar nada: lo que alcanza a venderse al precio de la campaña más lo que sobra al % que fijaste, menos lo que costó.
              Sale de tus tres escenarios: es una estimación, no una promesa.
            </Ayuda>
          }
        >
          Con lo que compras, después de lo que sobra
        </TarjetaCifra>
        {cifras.porSol === null ? (
          <TarjetaCifra etiqueta={"Por cada S/\u00a01 que compras"} valor={null}>
            Todavía no hay nada por comprar
          </TarjetaCifra>
        ) : (
          <TarjetaCifra etiqueta={"Por cada S/\u00a01 que compras"} valor={solesES(cifras.porSol)}>
            Ganancia esperada sobre lo invertido
          </TarjetaCifra>
        )}
      </div>

      <div className="grid gap-4 min-[900px]:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-6">
          <section className="card-cayla p-5" data-guia="presupuesto.donde">
            <TituloSeccion dato="al costo, solo las categorías con plan" className="mb-3">
              Dónde se va la plata
            </TituloSeccion>
            <BarraApilada
              alto={12}
              unidad="al costo"
              formato={solesEnterosES}
              total={plan.tope.valor ?? undefined}
              etiqueta={`${solesEnterosES(cifras.inversion)} al costo repartidos en ${tramos.length} ${tramos.length === 1 ? "categoría" : "categorías"}`}
              segmentos={tramos.map((t, i) => ({ clave: t.clave, nombre: t.nombre, valor: t.valor, clase: TONOS_DE_INVERSION[Math.min(i, TONOS_DE_INVERSION.length - 1)] }))}
            />
            <div className="pp-leyenda">
              {tramos.slice(0, EN_LA_LEYENDA).map((t, i) => (
                <span key={t.clave}>
                  <MuestraTramo clase={TONOS_DE_INVERSION[i]} />
                  {t.nombre} {solesEnterosES(t.valor)}
                </span>
              ))}
              {tramos.length > EN_LA_LEYENDA && <span>y {tramos.length - EN_LA_LEYENDA} más</span>}
              {plan.tope.valor !== null && pasaDelTope && (
                <span className="pp-pasa">
                  <b>Tope {solesEnterosES(plan.tope.valor)}</b> · la barra lo pasa
                </span>
              )}
            </div>
          </section>

          <section>
            <TituloSeccion dato="el sistema ajusta cuánta seguridad quiere en cada categoría" className="mb-3">
              Plan con tu tope
            </TituloSeccion>
            <PlanConTope key={`${plan.plan.id}|${plan.tope.valor ?? "sin"}|${precioGuardado}`} lineas={lineas} precioGuardado={precioGuardado} topeGuardado={plan.tope.valor} hrefPlan={hrefPlan} onUsar={versiones ? usarElPlanConTope : undefined} />
          </section>

          {/* Antes de la campaña, el simulador (Felipe 2026-10-12): mover supuestos y ver la compra contra el tope, sin guardar. Estaba en el cajón «Resumen»; aquí está junto al tope. */}
          {momento.estado === "antes" && <SimuladorPlan filas={filas} tope={plan.tope.valor} recuperoDefecto={hechosDelPlan?.recupero.pct ?? null} veAnalisis={veAnalisis} precioDeLaPlata={precioDeLaPlata} />}

          <section>
            <TituloSeccion className="mb-3">Cuánto cuesta cada categoría</TituloSeccion>
            {costos.length === 0 ? (
              <div className="card-cayla p-5 text-sm text-tinta-60">Ninguna categoría tiene plan todavía: cuando armes el primero, aquí verás cuánto cuesta.</div>
            ) : (
              <Tabla guia="presupuesto.costos" className="@container">
                <Encabezado columnas={COLUMNAS} plantilla={PLANTILLA} />
                {costos.map((f) => (
                  <div key={f.clave} className={fila(PLANTILLA)}>
                    <span className={celda("izq", "font-semibold")}>
                      {f.nombre}
                      {f.datos && (
                        // En la tarjeta angosta, «Datos» no tiene columna: va bajo el nombre.
                        <span className="mt-0.5 block @min-[760px]:hidden">
                          <Chip tono={f.datos.tono} title={f.datos.ayuda} versalitas={false}>
                            {f.datos.texto}
                          </Chip>
                        </span>
                      )}
                    </span>
                    <span className={celda("der")}>
                      <span className="text-xs text-taupe sm:hidden">Comprar </span>
                      {f.comprar ? enteroES.format(f.comprar) : "—"}
                    </span>
                    <span className={celda("der")}>
                      <span className="text-xs text-taupe sm:hidden">Costo por prenda </span>
                      {solesES(f.costo)}
                    </span>
                    <span className={celda("der")}>
                      <span className="text-xs text-taupe sm:hidden">Inversión </span>
                      {f.inversion ? solesEnterosES(f.inversion) : "—"}
                      {f.pctDelTotal !== null && f.inversion ? <span className="block text-xs text-taupe @min-[760px]:hidden">{f.pctDelTotal} % del total</span> : null}
                    </span>
                    <span className={celda("der", SOLO_ANCHA)}>{f.pctDelTotal !== null && f.inversion ? `${f.pctDelTotal} %` : "—"}</span>
                    <span className={celda("der")}>
                      <span className="text-xs text-taupe sm:hidden">Gana por cada S/&nbsp;1 </span>
                      {f.retorno === null ? "—" : solesES(f.retorno)}
                    </span>
                    <span className={celda("izq", SOLO_ANCHA)}>
                      {f.datos && (
                        <Chip tono={f.datos.tono} title={f.datos.ayuda} versalitas={false}>
                          {f.datos.texto}
                        </Chip>
                      )}
                    </span>
                  </div>
                ))}
              </Tabla>
            )}
          </section>
        </div>

        <div className="min-w-0 space-y-6">
          {versiones && (
            <section>
              <TituloSeccion dato={`${versiones.versiones.length} ${versiones.versiones.length === 1 ? "guardada" : "guardadas"}`} className="mb-3">
                Versiones del plan
              </TituloSeccion>
              <VersionesDelPlan
                lectura={versiones}
                planId={plan.plan.id}
                filas={filas}
                tope={plan.tope.valor}
                precioDeLaPlata={precioDeLaPlata}
                conCategorias={lineas.length > 0}
                onGuardar={guardarVersion}
                onVolver={volverAUnaVersion}
              />
            </section>
          )}
          <section>
            <TituloSeccion dato="de toda la campaña" className="mb-3">
              Supuestos
            </TituloSeccion>
            <SupuestosDelPlan
              filas={filas}
              hechos={hechosDelPlan}
              pedido={pedido}
              puedeVerCompras={puedeVerCompras}
              plazoFijado={plazoFijado}
              diasParaLlegar={diasConQueSeCuenta(plazoFijado)}
              onRecupero={() => setEditandoRecupero(true)}
              onReparto={() => setEditandoReparto(true)}
              onPlazo={marco.abrirPlazo}
            />
          </section>
        </div>
      </div>

      {hojaDeVersion && <NotaDeVersionModal key={hojaDeVersion.titulo} accion={hojaDeVersion} planNombre={plan.plan.nombre} onClose={() => setHojaDeVersion(null)} />}
      {editandoTope && <TopeModal planId={plan.plan.id} planNombre={plan.plan.nombre} topeActual={plan.tope.valor} onClose={() => setEditandoTope(false)} />}
      {editandoRecupero && hechosDelPlan && (
        <RecuperoModal planId={plan.plan.id} planNombre={plan.plan.nombre} actual={hechosDelPlan.recupero.pct} heredado={hechosDelPlan.recupero.heredado} onClose={() => setEditandoRecupero(false)} />
      )}
      {editandoReparto && hechosDelPlan && (
        <RepartoModal planId={plan.plan.id} planNombre={plan.plan.nombre} tiendas={hechosDelPlan.tiendasActivas} minimos={hechosDelPlan.minimos} onClose={() => setEditandoReparto(false)} />
      )}
    </>
  );
}
