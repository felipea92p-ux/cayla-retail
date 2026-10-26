"use client";

import { Punto } from "@/components/alta-producto/Punto";
import { CampoGuiado } from "@/components/guia-de-foco/CampoGuiado";
import type { GuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { QuitarColor } from "@/components/orden-produccion/AgregarColor";
import { Aviso } from "@/components/ui/Aviso";
import { Casilla } from "@/components/ui/Casilla";
import { Chip } from "@/components/ui/Chip";
import { Boton, CampoSelect, CampoTexto, type Opcion } from "@/components/ui/campos";
import { campoEtiqueta } from "@/components/ui/Modal";
import { UNIDADES_INSUMO, cantidadTexto, type UnidadInsumo } from "@/lib/insumos-reglas";
import { soles } from "@/lib/orden-ficha-reglas";
import { cantidadAPedir, consumoSugerido, metrosAPedir, prendasDeLaFila, veredictoTela, type InsumoDelTaller, type OfertaDeConsumo, type ProblemaTela, type TelaBorrador } from "@/lib/orden-tela-reglas";

// «Tela de la orden», el bloque de la hoja «Nueva orden de producción» (ADR-0400, decisión 6; «Pantallas» punto 3). Una FILA por color que la orden
// fabrica: la muestra del color y cuántas prendas son, la tela del estante (primero las del tejido del modelo, las demás bajo «Otras telas»), cuánto
// lleva cada prenda (el modelo lo dice: `producto_consumos`) y, derivado, los metros a pedir con «Alcanza» o «Faltan N m» contra lo que queda libre
// en el estante (saldo − lo que otras órdenes abiertas ya comprometieron − lo que otra fila de ESTA orden pide de la misma tela). Debajo, los avíos
// (botones, cierres, etiquetas, hilo), de toda la orden o de UN color (el hilo del beige: «Para»), plegados bajo «+ Agregar avío». Es opcional: una orden sin tela declarada se abre igual.
//
// No tiene estado de negocio: el formulario es el dueño de `telas` (nace con `telasSugeridas`), lee las faltas con `problemasTela` y las pasa en
// `problemas` (por índice de fila); acá solo se dibuja lo que dice `lib/orden-tela-reglas.ts` y se llama a `onTelas` con la lista entera. Una fila de
// color conserva su lugar en `telas` aunque se le quite la tela (así los índices de las faltas no se corren); un avío que se quita sí desaparece.
//
// En pantalla nunca se dice «insumo» (prueba ciega del 2026-10-14): es «tela» o «avío». «Pedir N m» y el chip son lo que la persona lee, no una cifra cruda.

export type ColorDeLaTela = {
  /** El código del vocabulario; null = el modelo no tiene color (una sola fila). */
  codigo: string | null;
  nombre: string;
  hex: string | null;
  /** Cuántas prendas de ese color lleva la orden hoy. */
  prendas: number;
};

export type PropsTelaDeLaOrden = {
  telas: TelaBorrador[];
  onTelas: (telas: TelaBorrador[]) => void;
  /** Telas y avíos del Taller (archivados incluidos: uno elegido antes de archivarse se sigue viendo, pero no se vuelve a elegir). */
  insumos: InsumoDelTaller[];
  /** El tejido del modelo: filtra las telas que se ofrecen primero. Null = el modelo no lo dice (o es un modelo nuevo). */
  tejidoId: string | null;
  tejidoNombre: string | null;
  /** Los colores que la orden fabrica, con sus prendas (`coloresDeLaOrden`), en el orden de la tabla de cantidades. */
  colores: ColorDeLaTela[];
  /** Por tela: lo que otras órdenes abiertas ya tienen comprometido (plan − usado), en su unidad. */
  comprometido: Map<string, number>;
  /** Por tela: lo que viene en camino (lo que falta recibir de los pedidos, sin los atrasados): se suma a lo que hay para decir «alcanza». */
  enCamino?: Map<string, number>;
  /** Lo que el modelo dice que lleva cada prenda (`producto_consumos`), o null si todavía no lo sabe. */
  consumoDeclarado: { telaPorPrenda: number; fuente: "declarado" | "medido" } | null;
  /** Solo quien ve los costos del Taller: «≈ S/ 756» al lado de los metros. */
  conCostos: boolean;
  /** Por tela o avío: el costo de la unidad (metro, kilo, unidad) del lote que se usaría. */
  costoPorMetro: Map<string, number>;
  guia: GuiaCampos;
  /** Lo que dijo `problemasTela` (por índice en `telas`). */
  problemas: ProblemaTela[];
  /** El consumo escrito contra lo que dice el modelo (`ofertaDeConsumoDelModelo`): decide si se ofrece el interruptor, se avisa o no se dice nada. */
  ofertaConsumo: OfertaDeConsumo;
  /** Corregir lo que el modelo YA dice es de quien edita el catálogo (la base lo vuelve a comprobar). */
  puedeCorregirConsumo: boolean;
  fijarConsumo: boolean;
  onFijarConsumo: (v: boolean) => void;
  /** Editar una orden que ya está abierta (ADR-0510): lo que cambia respecto a Nueva orden. Sin esto, el bloque es el de siempre. */
  edicion?: {
    /** Lo ya usado en la orden, por tela: con consumo anotado el «Alcanza» no se dice aquí (el estante ya bajó) y se muestra cuánto se usó. */
    usado: ReadonlyMap<string, number>;
    /** Una fila de color puede quedarse sin tela (la tela de un color mal elegido se quita con la ×). */
    puedeQuitarTela: boolean;
  };
  /** El nombre del bloque; en la hoja de edición no es el de «Nueva orden». */
  titulo?: string;
};

/** «44 m», «12 unid.»: la unidad corta del catálogo de Insumos; una unidad que el catálogo no conoce sale tal cual. */
function cantidad(n: number, unidad: string): string {
  return unidad in UNIDADES_INSUMO ? cantidadTexto(n, unidad as UnidadInsumo) : `${n.toLocaleString("es-PE", { maximumFractionDigits: 3 })} ${unidad}`;
}

const unidadCorta = (unidad: string) => (unidad in UNIDADES_INSUMO ? UNIDADES_INSUMO[unidad as UnidadInsumo].corta : unidad);

/** El consumo por prenda con sus tres decimales («1.35 m»): `cantidad` redondea los metros a uno y 1.35 saldría «1.4 m». */
const porPrenda = (n: number, unidad: string) => `${n.toLocaleString("es-PE", { minimumFractionDigits: 0, maximumFractionDigits: 3 })} ${unidadCorta(unidad)}`;

const SIN_CAMINO = new Map<string, number>();
const FILA_VACIA = (colorCodigo: string | null): TelaBorrador => ({ insumoId: null, colorCodigo, consumoPorPrenda: "" });

export function TelaDeLaOrden({ telas, onTelas, insumos, tejidoId, tejidoNombre, colores, comprometido, enCamino = SIN_CAMINO, consumoDeclarado, conCostos, costoPorMetro, guia, problemas, ofertaConsumo, puedeCorregirConsumo, fijarConsumo, onFijarConsumo, edicion, titulo = "Tela de la orden" }: PropsTelaDeLaOrden) {
  const porId = new Map(insumos.map((i) => [i.id, i] as const));
  const esAvio = (t: TelaBorrador) => (t.insumoId ? porId.get(t.insumoId)?.tipo === "avio" : false);

  // Qué fila de `telas` es de cada color (la primera que calza y no es un avío); lo que sobra son los avíos (los sin tela elegida incluidos).
  const reclamadas = new Set<number>();
  const porColor = colores.map((color) => {
    const indice = telas.findIndex((t, i) => !reclamadas.has(i) && t.colorCodigo === color.codigo && !esAvio(t));
    if (indice >= 0) reclamadas.add(indice);
    return { color, indice: indice >= 0 ? indice : null, tela: indice >= 0 ? telas[indice] : FILA_VACIA(color.codigo) };
  });
  const avios = telas.map((tela, indice) => ({ tela, indice })).filter((x) => !reclamadas.has(x.indice));

  const telasDelEstante = insumos.filter((i) => i.tipo === "tela" && !i.archivado);
  const aviosDelEstante = insumos.filter((i) => i.tipo === "avio" && !i.archivado);
  const delTejido = tejidoId ? telasDelEstante.filter((i) => i.tejidoId === tejidoId) : [];
  const nombreTejido = tejidoNombre?.toLocaleLowerCase("es") ?? null;
  const algunaElegida = telas.some((t) => t.insumoId);

  // Cuánto pide cada fila (lo que la base guardaría como `cantidad_plan`), para que dos filas de la misma tela no digan «alcanza» contra los mismos metros.
  const planDe = (tela: TelaBorrador, prendas: number): number | null => {
    const insumo = tela.insumoId ? porId.get(tela.insumoId) : undefined;
    return insumo ? metrosAPedir(tela.consumoPorPrenda, prendas, insumo.mermaPct) : null;
  };
  const totalPrendas = colores.reduce((s, c) => s + c.prendas, 0);
  const planPorIndice = new Map<number, number>();
  for (const f of porColor) if (f.indice !== null) planPorIndice.set(f.indice, planDe(f.tela, f.color.prendas) ?? 0);
  for (const a of avios) planPorIndice.set(a.indice, planDe(a.tela, prendasDeLaFila(a.tela.colorCodigo, colores)) ?? 0);
  const comprometidoDe = (insumoId: string, indice: number | null) => {
    let otras = 0;
    for (const [i, plan] of planPorIndice) if (i !== indice && telas[i]?.insumoId === insumoId) otras += plan;
    return (comprometido.get(insumoId) ?? 0) + otras;
  };

  /** Escribe en la fila de un color; si todavía no tiene fila en `telas`, nace antes del primer avío (los avíos van siempre al final). */
  function ponerColor(fila: (typeof porColor)[number], parche: Partial<TelaBorrador>) {
    if (fila.indice !== null) onTelas(telas.map((t, i) => (i === fila.indice ? { ...t, ...parche } : t)));
    else {
      const nueva = { ...fila.tela, ...parche };
      const primerAvio = avios.length > 0 ? avios[0].indice : telas.length;
      onTelas([...telas.slice(0, primerAvio), nueva, ...telas.slice(primerAvio)]);
    }
  }
  function ponerAvio(indice: number, parche: Partial<TelaBorrador>) {
    onTelas(telas.map((t, i) => (i === indice ? { ...t, ...parche } : t)));
  }
  /** Las filas de color que aún no existen nacen primero: así un avío vacío nunca se confunde con la tela de un modelo sin color. */
  function agregarAvio() {
    const faltantes = porColor.filter((f) => f.indice === null).map((f) => f.tela);
    const primerAvio = avios.length > 0 ? avios[0].indice : telas.length;
    onTelas([...telas.slice(0, primerAvio), ...faltantes, ...telas.slice(primerAvio), FILA_VACIA(null)]);
  }
  function quitarAvio(indice: number) {
    onTelas(telas.filter((_, i) => i !== indice));
  }

  const problemasDe = (indice: number | null) => (indice === null ? [] : problemas.filter((p) => p.indice === indice));

  /** Las opciones del combo de tela: las del tejido del modelo primero (y entre ellas, la del color de la fila), las demás bajo «Otras telas». */
  function opcionesTela(fila: (typeof porColor)[number]): Opcion<string>[] {
    const texto = (i: InsumoDelTaller) => `${i.nombre} · hay ${cantidad(i.saldo, i.unidad)}`;
    const delColor = (lista: InsumoDelTaller[]) => [...lista].sort((a, b) => Number(b.colorCodigo === fila.color.codigo) - Number(a.colorCodigo === fila.color.codigo));
    const primero = tejidoId ? delColor(delTejido) : delColor(telasDelEstante);
    const resto = tejidoId ? telasDelEstante.filter((i) => i.tejidoId !== tejidoId) : [];
    // Los grupos solo cuando hay dos: con el tejido del modelo sin telas en el estante, las demás van sueltas (la frase de arriba ya lo explica).
    const conGrupos = primero.length > 0 && resto.length > 0;
    const opciones: Opcion<string>[] = [
      ...primero.map((i) => ({ valor: i.id, texto: texto(i), grupo: conGrupos ? `De ${nombreTejido}` : undefined })),
      ...resto.map((i) => ({ valor: i.id, texto: texto(i), grupo: conGrupos ? "Otras telas" : undefined })),
    ];
    // La elegida que ya no está en el estante (se archivó) se sigue viendo con su nombre, pero no se vuelve a elegir.
    const elegida = fila.tela.insumoId ? porId.get(fila.tela.insumoId) : undefined;
    if (elegida && !opciones.some((o) => o.valor === elegida.id)) opciones.unshift({ valor: elegida.id, texto: `${elegida.nombre} · archivada`, deshabilitada: true });
    return opciones;
  }
  /** A quién va un avío: a toda la orden, o a las prendas de UN color (el hilo del beige). Solo se ofrece si la orden fabrica más de un color. */
  const opcionesPara: Opcion<string>[] = [
    { valor: "todas", texto: `Toda la orden · ${totalPrendas} prendas` },
    ...colores.filter((c) => c.codigo !== null).map((c) => ({ valor: c.codigo as string, texto: `${c.nombre} · ${c.prendas} prendas` })),
  ];
  function opcionesAvio(tela: TelaBorrador): Opcion<string>[] {
    const opciones: Opcion<string>[] = aviosDelEstante.map((i) => ({ valor: i.id, texto: `${i.nombre} · hay ${cantidad(i.saldo, i.unidad)}` }));
    const elegido = tela.insumoId ? porId.get(tela.insumoId) : undefined;
    if (elegido && !opciones.some((o) => o.valor === elegido.id)) opciones.unshift({ valor: elegido.id, texto: `${elegido.nombre} · archivado`, deshabilitada: true });
    return opciones;
  }

  return (
    <section aria-label={titulo} data-guia="prod-orden-nueva.tela">
      <CampoGuiado id="tela" guia={guia} retiene="fila" className="space-y-2">
        <span className={`${campoEtiqueta} block`}>
          {guia.etiqueta("tela", titulo)} {!edicion && <span className="font-normal normal-case text-tinta/45">· opcional</span>}
        </span>

        {!algunaElegida && telasDelEstante.length > 0 && (
          <p className="text-[12.5px] text-tinta/70">Si eliges la tela, la orden te dice cuántos metros pedir y si alcanzan.</p>
        )}
        {tejidoId && nombreTejido && (
          <p className="text-[12.5px] text-tinta/70">
            {delTejido.length > 0 ? `El modelo es de ${nombreTejido}.` : `El modelo es de ${nombreTejido}, pero en Insumos todavía no hay telas de ${nombreTejido}.`}
          </p>
        )}
        {telasDelEstante.length === 0 && (
          <Aviso tono="info" chico>
            Todavía no hay telas en Insumos. Regístralas ahí y la orden te dirá si alcanzan.
          </Aviso>
        )}

        <div className="divide-y divide-sand rounded-2xl border border-sand bg-crema">
          {porColor.map((fila) => {
            const insumo = fila.tela.insumoId ? porId.get(fila.tela.insumoId) : undefined;
            const plan = fila.indice !== null ? (planPorIndice.get(fila.indice) ?? 0) : 0;
            const usado = insumo ? (edicion?.usado.get(insumo.id) ?? 0) : 0;
            const veredicto = insumo && plan > 0 && usado === 0 ? veredictoTela(plan, insumo.saldo, comprometidoDe(insumo.id, fila.indice), enCamino.get(insumo.id) ?? 0) : null;
            const costo = conCostos && insumo && plan > 0 ? costoPorMetro.get(insumo.id) : undefined;
            const pies = piesDe(problemasDe(fila.indice), fila.tela);
            const opciones = opcionesTela(fila);
            return (
              <div key={fila.color.codigo ?? "sin-color"} className="space-y-2 px-3.5 py-3">
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                  <div className="flex min-w-0 items-center gap-2.5">
                    {/* El color de la prenda es dato: no cambia con el tema (ADR-0336). */}
                    <span data-color-dato="" className="inline-flex">
                      <Punto hex={fila.color.hex} grande />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-display text-[15px] leading-tight text-tinta">{fila.color.nombre}</p>
                      <p className="text-[12px] tabular-nums text-taupe">{fila.color.prendas} prendas</p>
                    </div>
                  </div>
                  {insumo && plan > 0 && veredicto && <Derivado plan={plan} unidad={insumo.unidad} veredicto={veredicto} costo={costo !== undefined ? plan * costo : null} />}
                  {insumo && plan > 0 && usado > 0 && <YaUsado plan={plan} usado={usado} unidad={insumo.unidad} />}
                </div>
                <div className={edicion?.puedeQuitarTela ? "grid grid-cols-[minmax(0,1fr)_8.5rem_auto] gap-x-3 gap-y-1" : "grid grid-cols-[minmax(0,1fr)_8.5rem] gap-x-3 gap-y-1"}>
                  <CampoSelect
                    id={`tela-${fila.color.codigo ?? "sin-color"}`}
                    etiqueta="Tela"
                    valor={fila.tela.insumoId ?? ""}
                    onValor={(v) => ponerColor(fila, { insumoId: v || null })}
                    opciones={opciones}
                    marcador={opciones.length === 0 ? "Sin telas en Insumos" : "Elegir la tela"}
                    deshabilitado={opciones.length === 0}
                    {...pies.tela}
                  />
                  <CampoTexto
                    id={`tela-${fila.color.codigo ?? "sin-color"}-consumo`}
                    etiqueta={`${insumo ? unidadCorta(insumo.unidad) : "m"} por prenda`}
                    mono
                    inputMode="decimal"
                    placeholder={consumoSugerido(consumoDeclarado) || "0.000"}
                    value={fila.tela.consumoPorPrenda}
                    onChange={(e) => ponerColor(fila, { consumoPorPrenda: e.target.value })}
                    {...(pies.consumo.pie ? pies.consumo : { pie: pieDelConsumo(consumoDeclarado), tono: "neutro" as const })}
                  />
                  {edicion?.puedeQuitarTela && (
                    <div className="w-6 pt-[1.625rem]">
                      {fila.tela.insumoId && <QuitarColor nombre={insumo?.nombre ?? "esta tela"} onQuitar={() => ponerColor(fila, { insumoId: null, consumoPorPrenda: "" })} />}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {ofertaConsumo.tipo !== "ninguna" && (
            <div data-guia="prod-orden-nueva.consumo-modelo" className="space-y-1.5 px-3.5 py-3">
              {ofertaConsumo.tipo === "primera" ? (
                <p className="text-[12.5px] text-tinta/70">
                  Es la primera orden de este modelo: queda anotado que lleva <b className="font-semibold">{porPrenda(ofertaConsumo.nuevo, ofertaConsumo.unidad)}</b> por prenda. Lo medido al pasar un lote al stock lo corrige.
                </p>
              ) : puedeCorregirConsumo ? (
                <>
                  <label className="flex cursor-pointer items-center gap-2.5 text-[13px] text-tinta">
                    <Casilla marcada={fijarConsumo} onCambio={() => onFijarConsumo(!fijarConsumo)} etiqueta="Dejar este consumo como el del modelo" />
                    Dejar <b className="font-semibold">{porPrenda(ofertaConsumo.nuevo, ofertaConsumo.unidad)}</b> por prenda como el consumo del modelo
                  </label>
                  <p className="pl-[34px] text-[12.5px] text-tinta/70">
                    Hoy el modelo dice {porPrenda(ofertaConsumo.actual, ofertaConsumo.unidad)} ({ofertaConsumo.fuente === "medido" ? "lo medido en las órdenes cerradas" : "lo que se anotó en una orden o se declaró"}). Sin marcar, solo esta orden usa lo que escribiste.
                  </p>
                </>
              ) : (
                <p className="text-[12.5px] text-tinta/70">
                  El modelo dice {porPrenda(ofertaConsumo.actual, ofertaConsumo.unidad)} por prenda y escribiste otra cifra: solo esta orden usa la tuya. Para cambiar el consumo del modelo, pídeselo a quien edita el catálogo.
                </p>
              )}
            </div>
          )}

          {/* Los avíos van para toda la orden o para un color (si la orden fabrica más de uno), plegados: casi siempre la pregunta es solo la tela. */}
          {(avios.length > 0 || aviosDelEstante.length > 0) && (
            <div className="space-y-3 px-3.5 py-3">
              {avios.map(({ tela, indice }) => {
                const insumo = tela.insumoId ? porId.get(tela.insumoId) : undefined;
                const plan = planPorIndice.get(indice) ?? 0;
                const usado = insumo ? (edicion?.usado.get(insumo.id) ?? 0) : 0;
                const veredicto = insumo && plan > 0 && usado === 0 ? veredictoTela(plan, insumo.saldo, comprometidoDe(insumo.id, indice), enCamino.get(insumo.id) ?? 0) : null;
                const costo = conCostos && insumo && plan > 0 ? costoPorMetro.get(insumo.id) : undefined;
                const pies = piesDe(problemasDe(indice), tela);
                const opciones = opcionesAvio(tela);
                return (
                  <div key={indice} className="space-y-1">
                    <div className="grid grid-cols-[minmax(0,1fr)_8.5rem_auto] items-start gap-x-3 gap-y-1">
                      <CampoSelect
                        id={`avio-${indice}`}
                        etiqueta="Avío"
                        valor={tela.insumoId ?? ""}
                        onValor={(v) => ponerAvio(indice, { insumoId: v || null })}
                        opciones={opciones}
                        marcador="Elegir el avío"
                        {...pies.tela}
                      />
                      <CampoTexto
                        id={`avio-${indice}-consumo`}
                        etiqueta={`${insumo ? unidadCorta(insumo.unidad) : "unid."} por prenda`}
                        mono
                        inputMode="decimal"
                        placeholder="0"
                        value={tela.consumoPorPrenda}
                        onChange={(e) => ponerAvio(indice, { consumoPorPrenda: e.target.value })}
                        {...pies.consumo}
                      />
                      {/* A la altura de la caja (la etiqueta mide 11 px + 6 px de aire). */}
                      <div className="pt-[1.625rem]">
                        <QuitarColor nombre={insumo?.nombre ?? "este avío"} onQuitar={() => quitarAvio(indice)} />
                      </div>
                    </div>
                    {insumo && colores.length > 1 && (
                      <div className="max-w-xs">
                        <CampoSelect
                          id={`avio-${indice}-para`}
                          etiqueta="Para"
                          valor={tela.colorCodigo ?? "todas"}
                          onValor={(v) => ponerAvio(indice, { colorCodigo: v === "todas" ? null : v })}
                          opciones={opcionesPara}
                        />
                      </div>
                    )}
                    {insumo && plan > 0 && veredicto && <Derivado plan={plan} unidad={insumo.unidad} veredicto={veredicto} costo={costo !== undefined ? plan * costo : null} />}
                    {insumo && plan > 0 && usado > 0 && <YaUsado plan={plan} usado={usado} unidad={insumo.unidad} />}
                  </div>
                );
              })}
              {aviosDelEstante.length > 0 && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <Boton type="button" peso="fantasma" onClick={agregarAvio}>
                    + Agregar avío
                  </Boton>
                  {avios.length === 0 && <span className="text-[12.5px] text-tinta/70">Botones, cierres, etiquetas o hilo, si quieres que la orden los cuente.</span>}
                </div>
              )}
            </div>
          )}
        </div>
      </CampoGuiado>
    </section>
  );
}

/** «Plan 37.8 m · ya se usaron 10 m»: lo de una tela con consumo anotado. No se dice «Alcanza» aquí: el estante ya bajó con lo usado, y la sección Tela de la orden lo dice con la cuenta de lo que falta. */
function YaUsado({ plan, usado, unidad }: { plan: number; usado: number; unidad: string }) {
  return (
    <p className="text-[13px] tabular-nums text-taupe">
      Plan {porPrenda(plan, unidad)} · ya {usado === 1 ? "se usó" : "se usaron"} {porPrenda(usado, unidad)}
    </p>
  );
}

/** «Pedir 37.8 m · Alcanza · ≈ S/ 756»: lo derivado de la fila. «Faltan» va en ámbar, nunca en rojo: la tela se pide, no es un error. */
function Derivado({ plan, unidad, veredicto, costo }: { plan: number; unidad: string; veredicto: { alcanza: boolean; faltan: number; conLoQueViene: boolean }; costo: number | null }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px] tabular-nums">
      <span className="text-tinta">
        Pedir <b className="font-semibold">{cantidad(cantidadAPedir(plan, unidad), unidad)}</b>
      </span>
      <Chip tono={veredicto.alcanza && !veredicto.conLoQueViene ? "verde" : "ambar"}>
        {veredicto.alcanza ? (veredicto.conLoQueViene ? "Alcanza si llega lo pedido" : "Alcanza") : `Faltan ${cantidad(cantidadAPedir(veredicto.faltan, unidad), unidad)}`}
      </Chip>
      {costo !== null && <span className="text-taupe">≈ {soles(costo)}</span>}
    </div>
  );
}

/** El pie de la caja del consumo cuando no hay falta: de dónde sale el número gris. */
function pieDelConsumo(declarado: PropsTelaDeLaOrden["consumoDeclarado"]): string {
  if (!declarado || !(declarado.telaPorPrenda > 0)) return "cuánto lleva cada prenda, con punto";
  return declarado.fuente === "medido" ? "lo medido en las órdenes cerradas" : "lo que dice el modelo";
}

/**
 * Las faltas de una fila, bajo su campo: las de la tela (no existe, archivada, color ajeno, repetida) en el combo; las del consumo en su caja. Un consumo
 * que todavía no se escribió es un camino (pie neutro); uno mal escrito, un error (rojo). Sin rojo salvo el error real.
 */
function piesDe(problemas: ProblemaTela[], tela: TelaBorrador): { tela: { pie?: string; tono: "neutro" | "error" }; consumo: { pie?: string; tono: "neutro" | "error" } } {
  const deTela = problemas.find((p) => p.hint !== "insumo_consumo_invalido");
  const deConsumo = problemas.find((p) => p.hint === "insumo_consumo_invalido");
  return {
    tela: deTela ? { pie: deTela.texto, tono: "error" } : { tono: "neutro" },
    consumo: deConsumo ? { pie: deConsumo.texto, tono: tela.consumoPorPrenda.trim() === "" ? "neutro" : "error" } : { tono: "neutro" },
  };
}
