"use client";

import { useMemo, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { firmar } from "@/lib/responsable-reglas";
import { useResponsable } from "@/lib/useResponsable";
import { diaYHoraLima } from "@/lib/fechas-lima";
import { cifrasPorRegularizar, estaVencida, tipoDiferencia, DIAS_PARA_VENCER } from "@/lib/por-regularizar-reglas";
import type { FilaPorRegularizar } from "@/lib/por-regularizar";
import { avisar } from "@/components/ui/Avisos";
import { Modal, botonPrimario } from "@/components/ui/Modal";
import { Campo, Desplegable } from "@/components/ui/campos";
import { ComboBuscable } from "@/components/ui/ComboBuscable";
import { ComboResponsable } from "@/components/ComboResponsable";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { Chip } from "@/components/ui/Chip";
import { Tabla, Encabezado, fila, celda, TABLA } from "@/components/ui/Tabla";

/** Lo mínimo de cada prenda del catálogo para reconocerla (sin costo: esta pantalla la ve almacén). */
export type PrendaParaRegularizar = { id: string; nombre: string; codigo: string; categoria: string; talla: string; color: string; precio: number };

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
  ubicacionEtiqueta,
  variasSedes,
}: {
  filas: FilaPorRegularizar[];
  prendas: PrendaParaRegularizar[];
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
  const vendedoras = useMemo(() => [...new Set(filas.map((f) => f.vendidoPor))].sort(), [filas]);
  const visibles = filas.filter((f) => (filtro === "todas" || f.estado === filtro) && (!quien || f.vendidoPor === quien));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <TarjetaCifra compacta className="anim-entra" style={{ "--i": 0 } as CSSProperties} punto={cifras.pendientes > 0 ? "ambar" : "neutro"} etiqueta="Por regularizar" valor={cifras.pendientes}>
          prendas vendidas sin registrar
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
          return (
            <div key={f.id} className={fila(PLANTILLA)}>
              <div className={celda()}>
                <p className="truncate text-sm text-tinta">{f.descripcion}</p>
                <p className="truncate text-xs text-taupe">{[f.categoria, f.talla, f.color].join(" · ")}</p>
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
        cuadrado. Pasados {DIAS_PARA_VENCER} días sin regularizar, se le avisa al líder.
      </p>

      {abierta && (
        <RegularizarModal fila={abierta} prendas={prendas} onClose={() => setAbierta(null)} />
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

function RegularizarModal({
  fila: f,
  prendas,
  onClose,
}: {
  fila: FilaPorRegularizar;
  prendas: PrendaParaRegularizar[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [elegidaId, setElegidaId] = useState("");
  const [forma, setForma] = useState<"ya_registrada" | "llego_nueva" | null>(null);
  const [guardando, setGuardando] = useState(false);
  // Firma quien regulariza en la sede de la prenda (ADR-0161/0162).
  const responsable = useResponsable({ ubicacionId: f.ubicacionId, etiqueta: f.sede });

  const elegida = prendas.find((p) => p.id === elegidaId) ?? null;
  // Primero las que calzan con lo que anotó caja (categoría, talla y color): así almacén la encuentra sin tipear.
  const opciones = useMemo(() => {
    const calce = (p: PrendaParaRegularizar) => Number(p.categoria === f.categoria) + Number(p.talla === f.talla) + Number(p.color === f.color);
    return [...prendas]
      .sort((a, b) => calce(b) - calce(a))
      .map((p) => ({ valor: p.id, texto: p.nombre, detalle: `${p.talla} · ${p.color} · ${p.codigo} · ${soles(p.precio)}` }));
  }, [prendas, f.categoria, f.talla, f.color]);

  async function guardar() {
    if (!elegida || !forma || !responsable.listo) return;
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
      <div className="space-y-4">
        <div>
          <Campo etiqueta="¿Qué prenda es?">
            <ComboBuscable
              valor={elegidaId}
              onValor={setElegidaId}
              opciones={opciones}
              marcador="Busca por nombre, código, talla o color"
              etiquetaAccesible="¿Qué prenda es?"
              autoFocus
            />
          </Campo>
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
        </div>

        <div>
          <p className="label-cayla text-[11px] text-tinta/65">¿Cómo estaba esta prenda en el sistema?</p>
          <div className="mt-1 flex flex-wrap gap-2">
            <button type="button" aria-pressed={forma === "ya_registrada"} onClick={() => setForma("ya_registrada")} className="pildora-cayla">
              Ya estaba registrada, solo perdió la etiqueta
            </button>
            <button type="button" aria-pressed={forma === "llego_nueva"} onClick={() => setForma("llego_nueva")} className="pildora-cayla">
              Llegó nueva y no se contó en el lote
            </button>
          </div>
          {forma && (
            <p className="mt-2 text-xs text-taupe">
              {forma === "ya_registrada"
                ? "Se descuenta 1 del stock de esta tienda."
                : "Se anota que llegó y que se vendió: el stock no cambia."}
            </p>
          )}
        </div>

        <ComboResponsable control={responsable} deshabilitado={guardando} />
        <button
          type="button"
          onClick={guardar}
          disabled={guardando || !elegida || !forma || !responsable.listo}
          title={responsable.motivo ?? undefined}
          className={`${botonPrimario} w-full`}
        >
          {guardando ? "Guardando…" : "Regularizar"}
        </button>
      </div>
    </Modal>
  );
}
