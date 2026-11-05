"use client";

import { TituloGrupo } from "@/components/ui/TituloSeccion";
import type { CSSProperties } from "react";
import { AlertTriangle, ArrowLeftRight, CheckCircle2, Circle, Info } from "lucide-react";
import { MiniaturaPrenda, SinFoto } from "@/components/ui/PrendaCelda";
import { ImagenDePrenda } from "@/components/ui/ImagenDePrenda";
import { varianteLegible, type ImpactoOperacion, type Validacion } from "@/lib/cambios-reglas";
import { soles } from "@/lib/compras-reglas";

// Piezas de solo lectura del flujo de Cambios (2026-09-18) — `ListaValidaciones` e
// `ImpactoVista` también las usa Devoluciones: lo que el sistema le explica a la
// colaboradora antes de que confirme. Sin estado propio — todo llega ya calculado desde
// `cambios-reglas.ts` / `devoluciones-reglas.ts`, así la pantalla no puede decir algo
// distinto de lo que la base va a hacer.

export type PrendaFicha = {
  referencia: string;
  talla: string | null;
  color: string | null;
  colorHex: string | null;
  fotoUrl: string | null;
  precio: number;
  /** Una línea corta bajo el precio (p. ej. «Pagó con S/ 20.00 de descuento (lista S/ 100.00)»): por qué ese precio es el que cuenta. */
  detalle?: string | null;
};

/** La foto de la prenda en la balanza: «B · Foto al aire» del Punto de Venta (sin tarjeta, la foto es la pieza). Se pide al
 *  ancho en que se dibuja (hasta 180 px en escritorio; un tercio de la pantalla en el celular). Sin foto, lo de siempre (ADR-0333). */
function FotoDeBalanza({ prenda }: { prenda: PrendaFicha }) {
  // La capa absoluta es de este contenedor: el mosaico trae su propio `relative` (como en `FotoDePrenda`).
  const sinFoto = (
    <div className="absolute inset-0">
      <SinFoto tamano="h-full w-full !rounded-none" colorHex={prenda.colorHex} />
    </div>
  );
  return (
    <div className="posv-foto relative aspect-square overflow-hidden bg-sand/40">
      {prenda.fotoUrl ? <ImagenDePrenda src={prenda.fotoUrl} alt="" fill sizes="(max-width: 639px) 34vw, 180px" className="object-cover" fondo={prenda.colorHex} fallback={sinFoto} /> : sinFoto}
    </div>
  );
}

/** Un platillo de la balanza (A · Balanza, Felipe 2026-11-02, docs/maquetas/posventa-vidrio-2026-11/): la foto de la prenda y,
 *  plano debajo, qué es y cuánto vale. La que trae (`lado="trae"`) se ve un poco apagada: es la que se va. */
function FichaPrenda({ titulo, prenda, vacia, lado }: { titulo: string; prenda: PrendaFicha | null; vacia: string; lado: "trae" | "lleva" }) {
  return (
    <div className="posv-ficha flex min-w-0 flex-col gap-2.5" data-lado={lado}>
      {prenda ? <FotoDeBalanza prenda={prenda} /> : <div className="posv-hueco aspect-square" aria-hidden />}
      <div className="min-w-0">
        <p className="truncate text-[11px] font-semibold uppercase tracking-[0.14em] text-tinta/65">{titulo}</p>
        {prenda ? (
          <>
            <p className="posv-ficha-nombre font-display truncate leading-tight text-tinta">{prenda.referencia}</p>
            <p className="text-sm text-tinta/75">{varianteLegible(prenda)}</p>
            <p className="mt-0.5 text-sm font-semibold tabular-nums text-tinta">{soles(prenda.precio)}</p>
            {prenda.detalle && <p className="text-sm text-tinta/70">{prenda.detalle}</p>}
          </>
        ) : (
          <p className="mt-0.5 text-sm text-tinta/70">{vacia}</p>
        )}
      </div>
    </div>
  );
}

/** Lo que une las dos prendas: una lente de vidrio con ⇄, entre los dos platillos (también en el celular, donde siguen lado a lado). */
function HiloDelCambio() {
  return (
    <span className="posv-lente grid place-items-center self-center rounded-full" role="img" aria-label="se cambia por">
      <ArrowLeftRight className="h-5 w-5 text-tinta" aria-hidden />
    </span>
  );
}

/** "Sale → entra": la comparación que la colaboradora le puede mostrar a la clienta. */
export function ComparacionPrendas({
  devuelta,
  nueva,
  cantidad,
  diferencia,
  otras = [],
}: {
  devuelta: PrendaFicha;
  nueva: PrendaFicha | null;
  cantidad: number;
  diferencia: number;
  /** Las demás prendas que se lleva en el mismo cambio (ADR-0470), cada una con su cantidad y su precio. */
  otras?: readonly (PrendaFicha & { cantidad: number })[];
}) {
  const textoDiferencia = diferencia > 0 ? "Diferencia a cobrar" : diferencia < 0 ? "Diferencia a devolver" : "Diferencia";
  return (
    <div className="space-y-3">
      {/* La balanza: lo que trae y lo que lleva frente a frente, con la lente al medio (vidrio/posventa.css). */}
      <div className="posv-balanza grid items-start">
        <FichaPrenda titulo={cantidad > 1 ? `Devuelve (${cantidad})` : "Prenda que devuelve"} prenda={devuelta} vacia="" lado="trae" />
        <HiloDelCambio />
        <FichaPrenda titulo={cantidad > 1 ? `Se lleva (${cantidad})` : "Nueva prenda"} prenda={nueva} vacia="Elige la talla y el color que se lleva." lado="lleva" />
      </div>
      {nueva && otras.length > 0 && (
        <div className="rounded-[18px] bg-tinta/[0.06] p-[18px]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-tinta/65">Y también se lleva</p>
          <ul className="mt-3 space-y-3">
            {otras.map((p, i) => (
              <li key={`${p.referencia}-${p.talla}-${p.color}-${i}`} className="flex items-center gap-3.5">
                <MiniaturaPrenda fotoUrl={p.fotoUrl} colorHex={p.colorHex} tamano="lg" />
                <div className="min-w-0">
                  <p className="font-display truncate text-[19px] leading-tight text-tinta">
                    {p.referencia}
                    {p.cantidad > 1 ? ` (×${p.cantidad})` : ""}
                  </p>
                  <p className="text-sm text-tinta/75">{varianteLegible(p)}</p>
                  <p className="mt-0.5 text-sm tabular-nums text-tinta">{soles(p.precio * p.cantidad)}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
      {nueva && (
        // La diferencia es una gota: ahumada si se cobra, clara si se devuelve o no hay nada que mover (vidrio/posventa.css).
        <div className="posv-diferencia" data-sentido={diferencia > 0 ? "cobra" : diferencia < 0 ? "devuelve" : "igual"} aria-live="polite">
          <span className="posv-diferencia-texto text-sm">{textoDiferencia}</span>
          <span className="posv-diferencia-monto font-display leading-none tabular-nums">{soles(Math.abs(diferencia))}</span>
        </div>
      )}
    </div>
  );
}

const ICONO_VALIDACION = {
  ok: { Icono: CheckCircle2, clase: "text-verde-profundo", lector: "Listo" },
  alerta: { Icono: AlertTriangle, clase: "text-ambar-profundo", lector: "Atención" },
  pendiente: { Icono: Circle, clase: "text-tinta/40", lector: "Pendiente" },
  aviso: { Icono: Info, clase: "text-ambar-profundo", lector: "Aviso" },
} as const;

/** "✓ Compra encontrada · ✓ Dentro del plazo · ○ Falta el motivo…": lo que el sistema
 *  está validando, dicho en voz alta. Ícono Y palabra — nunca solo color. */
export function ListaValidaciones({ validaciones }: { validaciones: readonly Validacion[] }) {
  return (
    <ul className="space-y-4" aria-label="Qué está validando el sistema">
      {validaciones.map((v, i) => {
        // El plazo vencido va en rojo sea alerta (Cambios) o aviso (Devoluciones): mismo
        // triángulo y la misma palabra para el lector, así que no depende solo del color.
        const { Icono, clase, lector } = v.tono === "rojo" ? { ...ICONO_VALIDACION.alerta, clase: "text-rojo-profundo" } : ICONO_VALIDACION[v.estado];
        return (
          <li key={`${v.clave}-${i}`} className="flex gap-2.5">
            {/* Los checks se trazan uno tras otro al aparecer el panel. */}
            <Icono
              className={`mt-0.5 h-5 w-5 shrink-0 ${clase} ${v.estado === "ok" && v.tono !== "rojo" ? "check-trazo" : ""}`}
              style={{ "--d": `${800 + i * 130}ms` } as CSSProperties}
              aria-hidden
            />
            <div className="min-w-0">
              <p className={`text-sm ${v.estado === "ok" ? "text-tinta" : "font-semibold text-tinta"}`}>
                <span className="sr-only">{lector}: </span>
                {v.titulo}
              </p>
              {v.detalle && <p className="mt-0.5 text-sm text-tinta/70">{v.detalle}</p>}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** Impacto en inventario y en caja — de lo que la base hace de verdad al confirmar (o, en
 *  una devolución, al aprobar). Con `documento`, una tercera línea a lo ancho. */
export function ImpactoVista({ impacto, compacto = false }: { impacto: ImpactoOperacion; compacto?: boolean }) {
  // `compacto`: en la columna angosta del costado las secciones van una bajo la otra.
  return (
    <div className={compacto ? "space-y-5" : "grid gap-6 sm:grid-cols-2"}>
      <section aria-label="Impacto en inventario">
        <TituloGrupo>Impacto en inventario</TituloGrupo>
        <ul className="mt-2.5 space-y-2">
          {impacto.inventario.map((i) => (
            <li key={`${i.signo}|${i.prenda}|${i.donde}`} className="flex gap-3 text-sm">
              <span className={`w-8 shrink-0 font-mono font-semibold tabular-nums ${i.signo === "+" ? "text-verde-profundo" : "text-tinta"}`}>
                {i.signo}
                {i.cantidad}
              </span>
              <span className="min-w-0">
                <span className="text-tinta">{i.prenda}</span>
                <span className="block text-sm text-tinta/70">{i.donde}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>
      <section aria-label="Impacto en caja">
        <TituloGrupo>Impacto en caja</TituloGrupo>
        <p className="mt-2.5 text-sm font-semibold tabular-nums text-tinta">{impacto.caja.titulo}</p>
        <p className="mt-0.5 text-sm text-tinta/70">{impacto.caja.detalle}</p>
      </section>
      {impacto.documento && (
        <section aria-label="Documento que se emite" className={compacto ? "" : "sm:col-span-2"}>
          <TituloGrupo>Documento</TituloGrupo>
          <p className="mt-2.5 text-sm font-semibold text-tinta">{impacto.documento.titulo}</p>
          <p className="mt-0.5 text-sm text-tinta/70">{impacto.documento.detalle}</p>
        </section>
      )}
    </div>
  );
}
