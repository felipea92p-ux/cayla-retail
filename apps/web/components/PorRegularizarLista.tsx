"use client";

import { useMemo, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { firmar } from "@/lib/responsable-reglas";
import { firmaOmitida } from "@/lib/responsable-omitido";
import { diaYHoraLima } from "@/lib/fechas-lima";
import { cifrasPorRegularizar, estaVencida, tipoDiferencia, DIAS_PARA_VENCER } from "@/lib/por-regularizar-reglas";
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
  ordenarCandidatas,
  textoProbable,
  type Candidata,
  type FormaRegularizar,
  type HechoCandidata,
  type PrendaParaRegularizar,
} from "@/lib/por-regularizar-candidatas";

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
  { clave: "todas", texto: "Todas" },
] as const;

export function PorRegularizarLista({
  filas,
  prendas,
  hechos,
  avisoCandidatas,
  ubicacionEtiqueta,
  variasSedes,
}: {
  filas: FilaPorRegularizar[];
  prendas: PrendaParaRegularizar[];
  /** Las prendas del stock que pueden ser cada venta pendiente (`fn_candidatas_por_regularizar`); vacío si no se pudo leer. */
  hechos: HechoCandidata[];
  /** Si la lectura de candidatas falló: se dice y se sigue (la persona busca en el catálogo, como antes). */
  avisoCandidatas: string | null;
  /** Para el mensaje de «no hay nada»: la sede que se mira, o «tus tiendas» si es el líder. */
  ubicacionEtiqueta: string;
  /** El líder ve todas las sedes: cada fila dice de cuál es. */
  variasSedes: boolean;
}) {
  const [filtro, setFiltro] = useState<(typeof FILTROS)[number]["clave"]>("pendiente");
  const [quien, setQuien] = useState("");
  const [abierta, setAbierta] = useState<FilaPorRegularizar | null>(null);
  const ahora = useMemo(() => new Date(), []);
  const cifras = useMemo(() => cifrasPorRegularizar(filas, ahora), [filas, ahora]);
  // ADR-0328 (act. 5): la prenda del stock más probable de cada venta pendiente, ordenada y explicada en `por-regularizar-candidatas`.
  const catalogo = useMemo(() => new Map(prendas.map((p) => [p.id, p])), [prendas]);
  const porVenta = useMemo(() => hechosPorVenta(hechos), [hechos]);
  const candidatasDe = useMemo(() => {
    const out = new Map<string, Candidata[]>();
    for (const f of filas) if (f.estado === "pendiente") out.set(f.id, ordenarCandidatas(f, porVenta.get(f.id) ?? [], catalogo));
    return out;
  }, [filas, porVenta, catalogo]);
  const conProbable = useMemo(() => conCandidata(filas.filter((f) => f.estado === "pendiente"), candidatasDe), [filas, candidatasDe]);
  const vendedoras = useMemo(() => [...new Set(filas.map((f) => f.vendidoPor))].sort(), [filas]);
  const visibles = filas.filter((f) => (filtro === "todas" || f.estado === filtro) && (!quien || f.vendidoPor === quien));

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
          <div className="ml-auto w-60">
            <Desplegable
              valor={quien}
              onValor={setQuien}
              opciones={[{ valor: "", texto: "Todas las colaboradoras" }, ...vendedoras.map((v) => ({ valor: v, texto: v }))]}
              forma="caja"
              etiquetaAccesible="Quién vendió"
            />
          </div>
        </div>
        <Encabezado columnas={COLUMNAS} plantilla={PLANTILLA} />
        {visibles.length === 0 && (
          <p className={TABLA.vacio}>{filtro === "pendiente" ? `No hay prendas por regularizar en ${ubicacionEtiqueta}.` : "Nada que mostrar con estos filtros."}</p>
        )}
        {visibles.map((f) => {
          const { dia, hora } = diaYHoraLima(f.vendidoEn);
          const vencida = f.estado === "pendiente" && estaVencida(f.vendidoEn, ahora);
          const probable = f.estado === "pendiente" ? textoProbable(candidatasDe.get(f.id) ?? []) : null;
          return (
            <div key={f.id} className={fila(PLANTILLA)}>
              <div className={celda()}>
                <p className="truncate text-sm text-tinta">{f.descripcion}</p>
                <p className="truncate text-xs text-taupe">{[f.categoria, f.talla, f.color].join(" · ")}</p>
                {probable && <p className="truncate text-xs text-tinta/75">{probable}</p>}
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
                  <button type="button" onClick={() => setAbierta(f)} className="btn-cayla btn-secundario">
                    Regularizar
                  </button>
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
        cuadrado. «Probable» es la prenda del stock de esa tienda con la misma categoría, talla y color (o uno parecido) que anotó caja: es
        una sugerencia, la confirmas tú. Pasados {DIAS_PARA_VENCER} días sin regularizar, se le avisa al líder. Las pendientes salen todas,
        sin importar cuándo se vendieron; las ya resueltas, las de este mes y el anterior.
      </p>

      {abierta && (
        <RegularizarModal fila={abierta} prendas={prendas} candidatas={candidatasDe.get(abierta.id) ?? []} onClose={() => setAbierta(null)} />
      )}
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
  candidatas,
  onClose,
}: {
  fila: FilaPorRegularizar;
  prendas: PrendaParaRegularizar[];
  /** Las prendas del stock que pueden ser esta venta, de la más a la menos probable (vacío si ninguna calza o no se pudo leer). */
  candidatas: Candidata[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [elegidaId, setElegidaId] = useState("");
  const [forma, setForma] = useState<FormaRegularizar | null>(null);
  const [guardando, setGuardando] = useState(false);
  // Regularizar va sin responsable (Felipe, 2026-09-29): firma la cuenta, sin combo.

  const elegida = prendas.find((p) => p.id === elegidaId) ?? null;
  const sugerida = candidatas[0] ?? null;
  // La respuesta que dice el libro para la prenda ELEGIDA (si es una candidata con fecha de entrada). Nunca se marca sola.
  const formaSugerida = elegida ? formaSugeridaPara(candidatas, elegida.id) : null;
  const guia = useGuiaCampos(camposGuiaRegularizar({ prendaElegida: elegida !== null, forma }));

  // Primero las candidatas (stock de esta tienda que calza, en su orden de probabilidad) y después el resto del catálogo, con las que
  // calzan con lo que anotó caja (categoría, talla y color) arriba: así almacén la encuentra sin tipear.
  const opciones = useMemo(() => {
    const deCandidatas = new Set(candidatas.map((c) => c.prenda.id));
    const calce = (p: PrendaParaRegularizar) => Number(p.categoria === f.categoria) + Number(p.talla === f.talla) + Number(p.color === f.color);
    return [
      ...candidatas.map((c, i) => ({
        valor: c.prenda.id,
        texto: c.prenda.nombre,
        detalle: `${i === 0 ? "Más probable" : "Posible"} · ${c.prenda.talla} · ${c.prenda.color} · ${c.prenda.codigo} · ${soles(c.prenda.precio)}`,
      })),
      ...[...prendas]
        .filter((p) => !deCandidatas.has(p.id))
        .sort((a, b) => calce(b) - calce(a))
        .map((p) => ({ valor: p.id, texto: p.nombre, detalle: `${p.talla} · ${p.color} · ${p.codigo} · ${soles(p.precio)}` })),
    ];
  }, [prendas, candidatas, f.categoria, f.talla, f.color]);

  async function guardar() {
    if (!elegida || !forma) return;
    setGuardando(true);
    const { data, error } = await firmar(
      createClient().rpc("regularizar_prenda", { p_id: f.id, p_variante_id: elegida.id, p_forma: forma }),
      firmaOmitida("regularizar_prenda"),
    );
    setGuardando(false);
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
                {candidatas.length > 1 ? `Sugerida · la más probable de ${candidatas.length} en el stock` : "Sugerida · la única que calza en el stock"}
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
          <ComboBuscable
            valor={elegidaId}
            onValor={setElegidaId}
            opciones={opciones}
            marcador="Busca por nombre, código, talla o color"
            etiquetaAccesible="¿Qué prenda es?"
            autoFocus
          />
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
              <button key={op} type="button" aria-pressed={forma === op} onClick={() => setForma(op)} className="pildora-cayla">
                {TEXTO_FORMA[op]}
                {formaSugerida?.forma === op && <span className="ml-1.5 text-[11px] font-semibold">· sugerida</span>}
              </button>
            ))}
          </div>
          {formaSugerida && (
            <p className="mt-2 text-xs text-tinta/80" data-sugerencia-forma>
              {formaSugerida.porque}
            </p>
          )}
          {elegida && !formaSugerida && (
            <p className="mt-2 text-xs text-taupe">
              Para esta prenda el sistema no puede deducirlo (no calza con lo que anotó caja o no tiene fecha de entrada en esta tienda): mira tú
              si estaba contada.
            </p>
          )}
          {forma && <p className="mt-2 text-xs text-taupe">{EFECTO_FORMA[forma]}</p>}
          {forma && formaSugerida && forma !== formaSugerida.forma && (
            <p className="mt-1 text-xs text-ambar-profundo" role="status">
              {SI_CONTESTA_MAL[formaSugerida.forma]}
            </p>
          )}
        </CampoGuiado>

        <div>
          <PieGuia guia={guia} listo="Todo listo para regularizar." />
          <button
            type="button"
            onClick={guardar}
            disabled={guardando || !elegida || !forma}
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
