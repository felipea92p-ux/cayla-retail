"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { firmar } from "@/lib/responsable-reglas";
import { useResponsable } from "@/lib/useResponsable";
import { useSedeActiva } from "@/components/SedeActiva";
import { ComboResponsable } from "@/components/ComboResponsable";
import { diaYHoraLima } from "@/lib/fechas-lima";
import {
  cifrasPorRegularizar,
  esVentaSinCargar,
  estaVencida,
  gruposSinCargar,
  lineaSinCargar,
  motivoPropiaVenta,
  prendaSinCargar,
  salidaPrendaSinCargar,
  tipoDiferencia,
  vendidaPorLaCuenta,
  DIAS_PARA_VENCER,
  type CargaDeLaSede,
  type VentaSinCargar,
} from "@/lib/por-regularizar-reglas";
import { avisosDePlazo, motivoLegible, sedesParaCerrar } from "@/lib/cola-arranque-reglas";
import type { FilaPorRegularizar } from "@/lib/por-regularizar";
import { avisar } from "@/components/ui/Avisos";
import { Modal, botonPrimario } from "@/components/ui/Modal";
import { Desplegable } from "@/components/ui/campos";
import { ComboBuscable } from "@/components/ui/ComboBuscable";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { Chip } from "@/components/ui/Chip";
import { Tabla, Encabezado, fila, celda, TABLA } from "@/components/ui/Tabla";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { camposGuiaRegularizar } from "@/lib/por-regularizar-guia";
import {
  conCandidata,
  formaSugeridaPara,
  hechosPorVenta,
  sugerenciaDeVenta,
  textoProbable,
  type FormaRegularizar,
  type HechoCandidata,
  type PrendaParaRegularizar,
  type SugerenciaVenta,
} from "@/lib/por-regularizar-candidatas";
import type { CategoriaSugerida } from "@/lib/sugerir-categoria-sin-registrar";
import { CerrarColaArranqueModal } from "@/components/CerrarColaArranqueModal";
import { ReabrirPrendaModal } from "@/components/ReabrirPrendaModal";
import { SugerenciasColaModal } from "@/components/SugerenciasColaModal";

export type { PrendaParaRegularizar };

const PLANTILLA = "sm:grid-cols-[minmax(0,2fr)_minmax(0,1.3fr)_6rem_7.5rem_minmax(0,1.6fr)]";
const COLUMNAS = [
  { titulo: "Prenda (lo que anotó caja)" },
  { titulo: "Vendió" },
  { titulo: "Cobrado", alinear: "der" as const },
  { titulo: "Estado" },
  { titulo: "" },
];
const soles = (n: number) => `S/ ${n.toFixed(2)}`;
const FILTROS = [
  { clave: "pendiente", texto: "Pendientes" },
  { clave: "regularizada", texto: "Regularizadas" },
  { clave: "cerrada_sin_prenda", texto: "Cerradas" },
  { clave: "todas", texto: "Todas" },
] as const;

export function PorRegularizarLista({
  filas,
  prendas,
  hechos,
  hechosPorLoEscrito,
  escritas,
  avisoCandidatas,
  ubicacionEtiqueta,
  variasSedes,
  esLider,
  sinCargar,
  puedeCargarStock,
  plazos,
  sedeInicial,
}: {
  filas: FilaPorRegularizar[];
  prendas: PrendaParaRegularizar[];
  /** Las prendas del stock que pueden ser cada venta pendiente (`fn_candidatas_por_regularizar`); vacío si no se pudo leer. */
  hechos: HechoCandidata[];
  /** Las mismas, para las ventas cuya descripción nombra otra categoría, buscadas en la categoría ESCRITA (segunda lectura). */
  hechosPorLoEscrito: HechoCandidata[];
  /** Por venta pendiente: la categoría que nombra lo que escribió la caja, si no es la anotada (`categoriasPorLoEscrito`). */
  escritas: Record<string, CategoriaSugerida>;
  /** Si la lectura de candidatas falló: se dice y se sigue (la persona busca en el catálogo, como antes). */
  avisoCandidatas: string | null;
  /** Para el mensaje de «no hay nada»: la sede que se mira, o «tus tiendas» si es el líder. */
  ubicacionEtiqueta: string;
  /** El líder ve todas las sedes: cada fila dice de cuál es. */
  variasSedes: boolean;
  /** La CUENTA es de un líder: puede regularizar también lo que vendió (ADR-0328; la base lo decide con `fn_es_lider`) y es quien
   *  cierra la cola de arranque (ADR-0334); la base lo vuelve a exigir en las dos. */
  esLider: boolean;
  /** Por venta pendiente: si su prenda está sin cargar en la sede y cómo está la carga de esa sede (`fn_por_regularizar_sin_cargar`);
   *  vacío si no se pudo leer (sin línea de «sin cargar»: la base lo dice al guardar). */
  sinCargar: Record<string, VentaSinCargar>;
  /** Puede abrir la ficha y ajustar su stock (editarCatalogo + ajustarStock): solo entonces se ofrece el enlace para cargarla. */
  puedeCargarStock: boolean;
  /** Hasta cuándo cada tienda puede cerrar su cola (`ubicacion_id → AAAA-MM-DD`). Sin plazo no hay botón. */
  plazos: Record<string, string>;
  /** La tienda que se está mirando (`?ubicacion=`), para que el cierre parta de ella. */
  sedeInicial: string | null;
}) {
  const [filtro, setFiltro] = useState<(typeof FILTROS)[number]["clave"]>("pendiente");
  const [quien, setQuien] = useState("");
  const [abierta, setAbierta] = useState<FilaPorRegularizar | null>(null);
  const personaSesionId = useSedeActiva()?.personaSesionId ?? null;
  const [cerrando, setCerrando] = useState(false);
  const [reabriendo, setReabriendo] = useState<FilaPorRegularizar | null>(null);
  const [sugiriendo, setSugiriendo] = useState(false);
  const ahora = useMemo(() => new Date(), []);
  const cifras = useMemo(() => cifrasPorRegularizar(filas, ahora), [filas, ahora]);
  // ADR-0328 (act. 5): la prenda del stock más probable de cada venta pendiente, ordenada y explicada en `por-regularizar-candidatas`.
  const catalogo = useMemo(() => new Map(prendas.map((p) => [p.id, p])), [prendas]);
  const porVenta = useMemo(() => hechosPorVenta(hechos), [hechos]);
  const porVentaEscrita = useMemo(() => hechosPorVenta(hechosPorLoEscrito), [hechosPorLoEscrito]);
  const sugerenciaDe = useMemo(() => {
    const out = new Map<string, SugerenciaVenta>();
    for (const f of filas) {
      if (f.estado !== "pendiente") continue;
      out.set(f.id, sugerenciaDeVenta(f, porVenta.get(f.id) ?? [], porVentaEscrita.get(f.id) ?? [], catalogo, escritas[f.id] ?? null));
    }
    return out;
  }, [filas, porVenta, porVentaEscrita, catalogo, escritas]);
  const conProbable = useMemo(() => conCandidata(filas.filter((f) => f.estado === "pendiente"), sugerenciaDe), [filas, sugerenciaDe]);
  // Ajuste ADR-0328 (2026-10-04): las ventas de prendas que su sede nunca cargó van en UNA línea por sede (en AQP, casi todas hasta que
  // cargue), no repetidas en cada fila. Una venta con otra pista (una candidata, o la categoría que la caja escribió) queda fuera.
  const conPista = useMemo(() => {
    return (id: string) => {
      const s = sugerenciaDe.get(id);
      return !!s && (s.candidatas.length > 0 || s.escrita !== null);
    };
  }, [sugerenciaDe]);
  const grupos = useMemo(
    () => gruposSinCargar(filas.filter((f) => f.estado === "pendiente"), sinCargar, conPista),
    [filas, sinCargar, conPista],
  );
  const vendedoras = useMemo(() => [...new Set(filas.map((f) => f.vendidoPor))].sort(), [filas]);
  const visibles = filas.filter((f) => (filtro === "todas" || f.estado === filtro) && (!quien || f.vendidoPor === quien));
  // Las tiendas que se pueden cerrar HOY: con pendientes y con plazo vigente. Sin ninguna, el botón no existe.
  const sedesDelLider = useMemo(() => (esLider ? sedesParaCerrar(filas, plazos, ahora) : []), [esLider, filas, plazos, ahora]);
  const sedesCerrables = useMemo(() => sedesDelLider.filter((s) => s.puedeCerrar), [sedesDelLider]);
  // Las sugerencias no dependen del plazo: identificar una venta nunca está vedado, solo cerrarla sin prenda.
  const sedesConPendientes = useMemo(() => sedesDelLider.map((s) => ({ ubicacionId: s.ubicacionId, sede: s.sede, pendientes: s.pendientes })), [sedesDelLider]);
  // Qué dice el plazo de cada tienda: sin esto, vencido el plazo el botón desaparecía sin explicación.
  const avisosPlazo = useMemo(() => avisosDePlazo(sedesDelLider), [sedesDelLider]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <TarjetaCifra compacta className="anim-entra" style={{ "--i": 0 } as CSSProperties} punto={cifras.pendientes > 0 ? "ambar" : "neutro"} etiqueta="Por regularizar" valor={cifras.pendientes}>
          {hechos.length > 0 && cifras.pendientes > 0 ? `${conProbable} con una prenda probable en stock` : "prendas vendidas sin registrar"}
        </TarjetaCifra>
        <TarjetaCifra compacta className="anim-entra" style={{ "--i": 1 } as CSSProperties} punto={cifras.vencidas > 0 ? "rojo" : "neutro"} etiqueta="Vencidas" valor={cifras.vencidas}>
          más de {DIAS_PARA_VENCER} días sin regularizar
        </TarjetaCifra>
        <TarjetaCifra compacta className="anim-entra" style={{ "--i": 2 } as CSSProperties} punto="neutro" etiqueta="Descuento no planificado" valor={soles(cifras.descuentoMes)}>
          se cobró menos que el precio oficial · este mes
        </TarjetaCifra>
        <TarjetaCifra compacta className="anim-entra" style={{ "--i": 3 } as CSSProperties} punto="neutro" etiqueta="Sobreprecio" valor={soles(cifras.sobreprecioMes)}>
          se cobró más que el precio oficial · este mes
        </TarjetaCifra>
      </div>

      {avisoCandidatas && <p className="nota-cayla text-sm">{avisoCandidatas}</p>}

      <Tabla className="anim-entra" style={{ "--i": 4 } as CSSProperties}>
        <div className="flex flex-wrap items-center gap-2 px-5 py-3">
          {FILTROS.map((f) => (
            <button key={f.clave} type="button" aria-pressed={filtro === f.clave} onClick={() => setFiltro(f.clave)} className="pildora-cayla">
              {f.texto}
            </button>
          ))}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {sedesConPendientes.length > 0 && (
              <button type="button" onClick={() => setSugiriendo(true)} className="btn-cayla btn-secundario">
                Identificar con sugerencias
              </button>
            )}
            {sedesCerrables.length > 0 && (
              <button type="button" onClick={() => setCerrando(true)} className="btn-cayla btn-secundario">
                Cerrar la cola de arranque
              </button>
            )}
            <div className="w-60">
              <Desplegable
                valor={quien}
                onValor={setQuien}
                opciones={[{ valor: "", texto: "Todas las colaboradoras" }, ...vendedoras.map((v) => ({ valor: v, texto: v }))]}
                forma="caja"
                etiquetaAccesible="Quién vendió"
              />
            </div>
          </div>
        </div>
        {filtro !== "regularizada" && grupos.length > 0 && (
          <div className="space-y-1 border-t border-sand bg-hueso px-5 py-2.5" data-sin-cargar>
            {grupos.map((g) => (
              <p key={g.ubicacionId} className="text-sm text-tinta">
                {lineaSinCargar(g)}
                {puedeCargarStock && (
                  <>
                    {" "}
                    <Link href="/productos" className="underline decoration-tinta/30 underline-offset-2 hover:text-rojo">
                      Ir a Productos
                    </Link>
                  </>
                )}
              </p>
            ))}
          </div>
        )}
        {avisosPlazo.length > 0 && (
          <ul className="space-y-0.5 px-5 pb-3 text-xs text-taupe">
            {avisosPlazo.map((aviso) => (
              <li key={aviso}>{aviso}</li>
            ))}
          </ul>
        )}
        <Encabezado columnas={COLUMNAS} plantilla={PLANTILLA} />
        {visibles.length === 0 && (
          <p className={TABLA.vacio}>{filtro === "pendiente" ? `No hay prendas por regularizar en ${ubicacionEtiqueta}.` : "Nada que mostrar con estos filtros."}</p>
        )}
        {visibles.map((f) => {
          const { dia, hora } = diaYHoraLima(f.vendidoEn);
          const vencida = f.estado === "pendiente" && estaVencida(f.vendidoEn, ahora);
          const sugerencia = f.estado === "pendiente" ? sugerenciaDe.get(f.id) : undefined;
          const probable = sugerencia ? textoProbable(sugerencia) : null;
          // Va en la línea de arriba: aquí solo una marca corta para saber cuáles son.
          const deLaLinea = f.estado === "pendiente" && esVentaSinCargar(f.id, sinCargar, conPista);
          return (
            <div key={f.id} className={fila(PLANTILLA)}>
              <div className={celda()}>
                <p className="truncate text-sm text-tinta">{f.descripcion}</p>
                <p className="truncate text-xs text-taupe">{[f.categoria, f.talla, f.color].join(" · ")}</p>
                {probable && <p className={`truncate text-xs ${sugerencia?.probable ? "text-tinta/75" : "text-ambar-profundo"}`}>{probable}</p>}
                {deLaLinea && <p className="truncate text-xs text-taupe">Prenda sin cargar en la tienda</p>}
              </div>
              <div className={celda("izq", "whitespace-normal")}>
                <p className="truncate text-sm text-tinta">{f.vendidoPor}</p>
                <p className="text-xs text-taupe">
                  {dia} · {hora}
                  {variasSedes && ` · ${f.sede}`}
                </p>
              </div>
              <div className={celda("der", "text-sm text-tinta")}>{soles(f.precioCobrado)}</div>
              <div className={celda()}>
                {f.estado === "regularizada" ? (
                  <Chip tono="verde">Regularizada</Chip>
                ) : f.estado === "cerrada_sin_prenda" ? (
                  <Chip tono="pizarra">Cerrada sin prenda</Chip>
                ) : f.estado === "anulada" ? (
                  <Chip tono="apagado">Venta anulada</Chip>
                ) : vencida ? (
                  <Chip tono="rojo" vivo>Vencida</Chip>
                ) : (
                  <Chip tono="ambar">Pendiente</Chip>
                )}
              </div>
              <div className={celda("izq", "whitespace-normal sm:text-right")}>
                {f.estado === "pendiente" ? (
                  <>
                    <button type="button" onClick={() => setAbierta(f)} className="btn-cayla btn-secundario">
                      Regularizar
                    </button>
                    {/* ADR-0328: quien vendió no regulariza su propia venta (salvo el líder); la fila lo dice antes de abrirla. */}
                    {vendidaPorLaCuenta(f.vendidoPorId, personaSesionId, esLider) && (
                      <p className="mt-1 text-xs text-taupe">Vendida por ti: la regulariza otra persona</p>
                    )}
                  </>
                ) : f.estado === "cerrada_sin_prenda" && f.cierre ? (
                  <>
                    <p className="truncate text-xs text-tinta">{motivoLegible(f.cierre.motivo)}</p>
                    <p className="text-xs text-taupe">Cerrada el {diaYHoraLima(f.cierre.cerradoEn).dia} · sin identificar la prenda</p>
                    {/* Solo un líder reabre (la base lo exige): para quien la devuelve o la quiere cambiar. */}
                    {esLider && (
                      <button type="button" onClick={() => setReabriendo(f)} className="btn-cayla btn-secundario mt-1.5">
                        Reabrir
                      </button>
                    )}
                  </>
                ) : f.estado === "regularizada" && f.diferencia !== null ? (
                  <>
                    <p className="truncate text-xs text-tinta">{f.prendaReal}</p>
                    <p className="text-xs text-taupe">{textoDiferencia(f.diferencia)}{f.forma === "llego_nueva" ? " · llegó nueva" : " · perdió la etiqueta"}</p>
                  </>
                ) : null}
              </div>
            </div>
          );
        })}
      </Tabla>

      <p className="nota-cayla text-sm">
        Son prendas que caja vendió antes de que estuvieran en el sistema. Al regularizarlas, la venta pasa a la prenda real y el stock queda
        cuadrado. «Probable» es la prenda del stock de esa tienda con la misma categoría (o la que caja escribió en la descripción, si
        nombra otra), talla y color (o uno parecido) que anotó caja: es una sugerencia, la confirmas tú. Pasados {DIAS_PARA_VENCER} días sin
        regularizar, se le avisa al líder. Las pendientes salen todas, sin importar cuándo se vendieron; las ya resueltas, las de este mes y
        el anterior. Las que ya no se pueden identificar, un líder puede cerrarlas todas juntas dentro del plazo de su tienda: quedan sin
        prenda y el stock no cambia.
      </p>

      {abierta && (
        <RegularizarModal
          fila={abierta}
          prendas={prendas}
          sugerencia={sugerenciaDe.get(abierta.id) ?? { candidatas: [], probable: null, escrita: null }}
          esLider={esLider}
          carga={sinCargar[abierta.id]?.carga ?? null}
          puedeCargarStock={puedeCargarStock}
          onClose={() => setAbierta(null)}
        />
      )}
      {sugiriendo && <SugerenciasColaModal filas={filas} prendas={prendas} sedes={sedesConPendientes} inicial={sedeInicial} onClose={() => setSugiriendo(false)} />}
      {reabriendo && <ReabrirPrendaModal fila={reabriendo} onClose={() => setReabriendo(null)} />}
      {cerrando && <CerrarColaArranqueModal sedes={sedesCerrables} inicial={sedeInicial} onClose={() => setCerrando(false)} />}
    </div>
  );
}

/** Lo que anotó caja, sin repetir talla ni color si la descripción ya los dice (la sugerida los trae). */
function subtituloPrenda(f: FilaPorRegularizar): string {
  const extra = [f.talla && !f.descripcion.includes(`Talla ${f.talla}`) ? `Talla ${f.talla}` : null, f.color && !f.descripcion.includes(f.color) ? f.color : null];
  return [f.descripcion, ...extra.filter(Boolean), `cobrada a ${soles(f.precioCobrado)}`].join(" · ");
}

function textoDiferencia(diferencia: number): string {
  const tipo = tipoDiferencia(diferencia);
  if (tipo === "exacto") return "Se cobró el precio oficial";
  return tipo === "descuento" ? `Descuento no planificado: ${soles(-diferencia)}` : `Sobreprecio: ${soles(diferencia)}`;
}

const TEXTO_FORMA: Record<FormaRegularizar, string> = {
  ya_registrada: "Ya estaba registrada, solo perdió la etiqueta",
  llego_nueva: "Llegó nueva y no se contó",
};
const EFECTO_FORMA: Record<FormaRegularizar, string> = {
  ya_registrada: "Se descuenta 1 del stock de esta tienda.",
  llego_nueva: "Se anota que llegó y que se vendió: el stock no cambia.",
};
/** Lo que pasa si se contesta lo contrario de lo que dice el libro (la clave es la respuesta SUGERIDA): el error que se quiere evitar. */
const SI_CONTESTA_MAL: Record<FormaRegularizar, string> = {
  llego_nueva: "Ojo: según el sistema llegó nueva. Si no estaba contada y la descuentas, el stock baja dos veces por la misma prenda.",
  ya_registrada: "Ojo: según el sistema ya estaba contada. Si no la descuentas, el stock queda con una prenda que ya no está.",
};

function RegularizarModal({
  fila: f,
  prendas,
  sugerencia,
  esLider,
  carga,
  puedeCargarStock,
  onClose,
}: {
  fila: FilaPorRegularizar;
  prendas: PrendaParaRegularizar[];
  /** Las prendas del stock que pueden ser esta venta (de la más a la menos probable), la sugerida y si lo escrito nombra otra
   *  categoría (`sugerenciaDeVenta`). Vacía si ninguna calza o no se pudo leer. */
  sugerencia: SugerenciaVenta;
  esLider: boolean;
  /** La carga inicial de la sede de la venta (abierta o cerrada, y hasta cuándo); `null` si no se pudo leer. */
  carga: CargaDeLaSede | null;
  puedeCargarStock: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [elegidaId, setElegidaId] = useState("");
  const [forma, setForma] = useState<FormaRegularizar | null>(null);
  const [guardando, setGuardando] = useState(false);
  // ADR-0328 (actividad 5): regularizar vuelve a pedir el nombre UNA vez por operación (este modal), de quien está en la tienda de
  // la venta. Sin nombre no se puede cumplir «nadie regulariza su propia venta, salvo el líder».
  const activa = useSedeActiva();
  const responsable = useResponsable({ ubicacionId: f.ubicacionId, etiqueta: f.sede || "esta tienda" });
  const motivoPropia = motivoPropiaVenta({
    vendidoPorId: f.vendidoPorId,
    responsableId: responsable.elegidoId,
    personaSesionId: activa?.personaSesionId ?? null,
    esLider,
  });

  const elegida = prendas.find((p) => p.id === elegidaId) ?? null;
  const { candidatas, escrita } = sugerencia;
  const sugerida = sugerencia.probable;
  // La respuesta que dice el libro para la prenda ELEGIDA (si es una candidata con fecha de entrada). Nunca se marca sola.
  const formaSugerida = elegida ? formaSugeridaPara(candidatas, elegida.id) : null;

  // Revisión R6: una prenda sin ningún movimiento en la tienda de la venta no se regulariza (le cerraría su carga inicial); se dice
  // al elegirla, antes del botón. Una candidata tiene stock libre ahí: ya está cargada, no se pregunta. Si la lectura no vuelve o
  // falla (la función aún no está pegada, sin red) no se frena nada: la base lo decide al guardar.
  const esCandidata = candidatas.some((c) => c.prenda.id === elegidaId);
  const [cargada, setCargada] = useState<{ id: string; valor: boolean | null }>({ id: "", valor: null });
  useEffect(() => {
    if (!elegidaId || esCandidata) return;
    let vigente = true;
    void createClient()
      .rpc("fn_prenda_cargada_en_sede", { p_variante_id: elegidaId, p_ubicacion_id: f.ubicacionId })
      .then(({ data, error }) => {
        if (vigente) setCargada({ id: elegidaId, valor: error ? null : (data ?? null) });
      });
    return () => {
      vigente = false;
    };
  }, [elegidaId, esCandidata, f.ubicacionId]);
  const sinCargar = elegida !== null && !esCandidata && cargada.id === elegidaId && cargada.valor === false;
  const motivoPrenda = sinCargar ? prendaSinCargar(f.sede, carga) : null;
  // La salida, como enlace a la ficha (que trabaja sobre la sede activa: si es otra, se dice antes de irse).
  const salida = sinCargar ? salidaPrendaSinCargar({ carga, sede: f.sede, enOtraSede: !!activa && activa.ubicacionId !== f.ubicacionId }) : null;

  const guia = useGuiaCampos(
    camposGuiaRegularizar({ prendaElegida: elegida !== null, motivoPrenda, forma, responsableListo: responsable.listo, motivoPropia }),
  );
  const listo = elegida !== null && motivoPrenda === null && forma !== null && responsable.listo && motivoPropia === null;

  // Primero las candidatas (stock de esta tienda que calza, en su orden de probabilidad) y después el resto del catálogo, con las que
  // calzan con lo que anotó caja (categoría, talla y color) arriba: así almacén la encuentra sin tipear.
  // Si lo escrito nombra otra categoría, el resto del catálogo se ordena por ESA (la escrita): ahí está lo que la caja tenía en la mano.
  const categoriaParaCalce = escrita?.nombre ?? f.categoria;
  const opciones = useMemo(() => {
    const deCandidatas = new Set(candidatas.map((c) => c.prenda.id));
    const calce = (p: PrendaParaRegularizar) => Number(p.categoria === categoriaParaCalce) + Number(p.talla === f.talla) + Number(p.color === f.color);
    return [
      ...candidatas.map((c) => ({
        valor: c.prenda.id,
        texto: c.prenda.nombre,
        detalle: `${c === sugerida ? "Más probable" : "Posible"} · ${c.prenda.talla} · ${c.prenda.color} · ${c.prenda.codigo} · ${soles(c.prenda.precio)}`,
      })),
      ...[...prendas]
        .filter((p) => !deCandidatas.has(p.id))
        .sort((a, b) => calce(b) - calce(a))
        .map((p) => ({ valor: p.id, texto: p.nombre, detalle: `${p.talla} · ${p.color} · ${p.codigo} · ${soles(p.precio)}` })),
    ];
  }, [prendas, candidatas, sugerida, categoriaParaCalce, f.talla, f.color]);

  async function guardar() {
    if (!elegida || !forma || !listo) return;
    setGuardando(true);
    const { data, error } = await firmar(
      createClient().rpc("regularizar_prenda", { p_id: f.id, p_variante_id: elegida.id, p_forma: forma }),
      responsable.firma(),
    );
    setGuardando(false);
    responsable.despues(error);
    if (error) {
      avisar.error(traducirError(error, "regularizar la prenda"));
      return;
    }
    avisar.exito("Prenda regularizada", { detalle: `${f.descripcion} → ${elegida.nombre}. ${textoDiferencia(Number(data))}.` });
    onClose();
    router.refresh();
  }

  return (
    <Modal titulo="Regularizar prenda" subtitulo={subtituloPrenda(f)} onClose={onClose}>
      <div className="space-y-5">
        <CampoGuiado id="prenda" guia={guia} titulo="¿Qué prenda es?">
          {sugerida && elegidaId !== sugerida.prenda.id && (
            <div className="mb-2 rounded-md bg-hueso px-3 py-2 text-sm text-tinta" data-sugerencia-prenda>
              <p className="text-xs text-taupe">
                {sugerida.porLoEscrito && escrita
                  ? `Sugerida · caja anotó ${f.categoria}, pero escribió «${escrita.palabra}»: esta es de ${escrita.nombre}`
                  : candidatas.length > 1
                    ? `Sugerida · la más probable de ${candidatas.length} en el stock`
                    : "Sugerida · la única que calza en el stock"}
              </p>
              <p className="font-semibold">
                {sugerida.prenda.nombre} · {sugerida.prenda.talla} · {sugerida.prenda.color} · {sugerida.prenda.codigo}
              </p>
              <p className="text-xs text-taupe">{sugerida.razones.join(" · ")}</p>
              <button type="button" onClick={() => setElegidaId(sugerida.prenda.id)} className="btn-cayla btn-enlace mt-1">
                Es esta
              </button>
            </div>
          )}
          {escrita && !sugerida && (
            <p className="mb-2 rounded-md bg-hueso px-3 py-2 text-sm text-tinta" data-sugerencia-escrita>
              Caja anotó {f.categoria}, pero escribió «{escrita.palabra}»: búscala entre <span className="font-semibold">{escrita.nombre}</span>. En
              {` ${f.sede || "esta tienda"}`} no hay ninguna de {escrita.nombre} en talla {f.talla} y {f.color.toLowerCase()} con stock libre.
            </p>
          )}
          <ComboBuscable
            valor={elegidaId}
            onValor={setElegidaId}
            opciones={opciones}
            marcador="Busca por nombre, código, talla o color"
            etiquetaAccesible="¿Qué prenda es?"
            autoFocus
          />
          {motivoPrenda && (
            <div className="mt-2 text-xs" role="status" data-prenda-sin-cargar>
              <p className="text-ambar-profundo">{motivoPrenda}</p>
              {salida && puedeCargarStock && elegida && (
                <p className="mt-1 text-taupe">
                  <Link href={`/productos/${elegida.productoId}/editar`} className="underline decoration-tinta/30 underline-offset-2 hover:text-rojo">
                    {salida.texto}
                  </Link>
                  {salida.antes && <span> · {salida.antes}</span>}
                </p>
              )}
            </div>
          )}
          {elegida && (
            <p className="mt-2 rounded-md bg-hueso px-3 py-2 text-sm text-tinta">
              {elegida.nombre} · {elegida.talla} · {elegida.color} · precio oficial {soles(elegida.precio)} ·{" "}
              <span className="text-taupe">{textoDiferencia(Math.round((f.precioCobrado - elegida.precio) * 100) / 100)}</span>
            </p>
          )}
          <p className="mt-2 text-xs text-taupe">
            ¿No está en el catálogo?{" "}
            <Link href="/productos/nuevo" className="underline decoration-tinta/30 underline-offset-2 hover:text-rojo">
              Dala de alta
            </Link>{" "}
            con su precio oficial y vuelve aquí a buscarla.
          </p>
        </CampoGuiado>

        <CampoGuiado id="forma" guia={guia} titulo="¿Cómo estaba esta prenda en el sistema?">
          <div className="flex flex-wrap gap-2" role="group" aria-label="¿Cómo estaba esta prenda en el sistema?">
            {(["ya_registrada", "llego_nueva"] as const).map((op) => (
              // Con «· sugerida» la primera no cabe en una línea del ancho de la hoja (≈ 330 px): se parte en dos, sin salirse.
              <button key={op} type="button" aria-pressed={forma === op} onClick={() => setForma(op)} className="pildora-cayla max-w-full whitespace-normal text-left">
                {TEXTO_FORMA[op]}
                {formaSugerida?.forma === op && <span className="ml-1.5 shrink-0 whitespace-nowrap text-[11px] font-semibold">· sugerida</span>}
              </button>
            ))}
          </div>
          {formaSugerida && (
            <p className="mt-2 text-xs text-tinta/80" data-sugerencia-forma>
              {formaSugerida.porque}
            </p>
          )}
          {elegida && !formaSugerida && !motivoPrenda && (
            <p className="mt-2 text-xs text-taupe">
              Para esta prenda el sistema no puede deducirlo (no calza con lo que anotó caja o no tiene stock libre en esta tienda): mira tú si
              estaba contada.
            </p>
          )}
          {forma && <p className="mt-2 text-xs text-taupe">{EFECTO_FORMA[forma]}</p>}
          {forma && formaSugerida?.forma && forma !== formaSugerida.forma && (
            <p className="mt-1 text-xs text-ambar-profundo" role="status">
              {SI_CONTESTA_MAL[formaSugerida.forma]}
            </p>
          )}
        </CampoGuiado>

        <CampoGuiado id="responsable" guia={guia}>
          <ComboResponsable control={responsable} deshabilitado={guardando} />
          {motivoPropia && (
            <p className="mt-2 text-xs text-ambar-profundo" role="status">
              {motivoPropia}
            </p>
          )}
        </CampoGuiado>

        <div>
          <PieGuia guia={guia} listo="Todo listo para regularizar." />
          <button
            type="button"
            onClick={guardar}
            disabled={guardando || !listo}
            title={guia.frase ?? undefined}
            className={`${botonPrimario} mt-3 w-full ${guia.claseConfirmar}`}
          >
            {guardando ? "Guardando…" : "Regularizar"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
