import Link from "next/link";
import { AlertTriangle, ChevronRight, Info } from "lucide-react";
import { AvatarPersona } from "@/components/ui/AvatarPersona";
import {
  avisoDeRonda,
  dieronDeRonda,
  gastoDeRonda,
  porRevisarDeRonda,
  quedaDeRonda,
  type CompradorSinRonda,
  type RondaDeCompras,
} from "@/lib/compradores-reglas";
import { soles } from "@/lib/compras-reglas";
import { diaMes } from "@/lib/fechas-lima";
import { primerNombre } from "@/lib/fondos-reglas";

// La tarjeta de una persona que está comprando (Compradores, ADR-0704): su nombre y desde cuándo compra, tres números (le diste · gastó · le
// queda, o «no cuadra» si pagó más de lo que le diste), el único aviso que pide atención —en una frase, sin preguntar nada (Felipe
// 2026-11-26)— y sus tres últimas compras. Toda la tarjeta lleva al detalle de la persona. Los tres números salen de su fondo
// (`quedaDeRonda`, `dieronDeRonda`), no solo de lo que anotó en la ronda. `TarjetaSinRonda` es la misma tarjeta para quien tiene plata y
// todavía no abrió su ronda.

const MARCO = "card-cayla group @container flex flex-col gap-4 p-5 transition-transform duration-300 [@media(hover:hover)]:hover:-translate-y-0.5";

const ULTIMAS = 3;

export function TarjetaComprador({ ronda: r, hoy }: { ronda: RondaDeCompras; hoy: string }) {
  const queda = quedaDeRonda(r);
  const dieron = dieronDeRonda(r);
  const noCuadra = queda < -0.005;
  const aviso = avisoDeRonda(r, hoy, soles);
  const porRevisar = porRevisarDeRonda(r);
  const nombre = primerNombre(r.persona);
  return (
    <Link
      href={`/compras/compradores/${r.personaId}`}
      data-guia="compradores.tarjeta"
      className={MARCO}
    >
      <span className="flex items-center gap-3">
        <AvatarPersona personaId={r.personaId} nombre={r.persona} tamano={40} />
        <span className="min-w-0">
          <span className="block truncate text-base font-semibold text-tinta">{nombre}</span>
          <span className="block text-sm text-secundario">
            Comprando desde el {diaMes(r.abiertaEn)}
            {porRevisar > 0 && <span className="font-semibold text-ambar"> · {porRevisar} por revisar</span>}
          </span>
        </span>
      </span>

      <span className="grid grid-cols-3 gap-2 border-y border-sand py-3">
        <Numero etiqueta="Le diste" valor={soles(dieron)} />
        <Numero etiqueta="Gastó" valor={soles(gastoDeRonda(r.cuenta))} />
        <Numero etiqueta={noCuadra ? (dieron > 0.005 ? "No cuadra" : "Sin plata") : "Le queda"} valor={soles(Math.abs(queda))} ambar={noCuadra} />
      </span>

      {aviso && (
        <span className={`flex items-start gap-2 rounded-xl px-3 py-2.5 text-sm text-tinta ${aviso.tono === "ambar" ? "bg-ambar/10" : "vd-placa"}`}>
          {aviso.tono === "ambar" ? (
            <AlertTriangle aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ambar" />
          ) : (
            <Info aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-secundario" />
          )}
          <span>
            {aviso.texto}
            {aviso.cerrarRonda && <span className="font-semibold"> Cierra su ronda desde su detalle.</span>}
          </span>
        </span>
      )}

      {r.compras.length > 0 && (
        <span className="grid gap-1.5 text-sm">
          {r.compras.slice(0, ULTIMAS).map((c) => (
            <span key={c.id} className="flex justify-between gap-3">
              <span className="min-w-0 truncate text-tinta">{c.proveedor}</span>
              <span className="shrink-0 tabular-nums text-tinta">{soles(c.monto)}</span>
            </span>
          ))}
          {r.compras.length > ULTIMAS && (
            <span className="text-secundario">
              y {r.compras.length - ULTIMAS} {r.compras.length - ULTIMAS === 1 ? "compra más" : "compras más"}
            </span>
          )}
        </span>
      )}

      <Pie>Ver sus compras</Pie>
    </Link>
  );
}

/** Quien tiene plata en la mano y todavía no abrió su ronda: sin ella no hay compras que contar, solo lo que tiene. */
export function TarjetaSinRonda({ persona: p }: { persona: CompradorSinRonda }) {
  return (
    <Link href={`/compras/compradores/${p.personaId}`} className={MARCO}>
      <span className="flex items-center gap-3">
        <AvatarPersona personaId={p.personaId} nombre={p.persona} tamano={40} />
        <span className="min-w-0">
          <span className="block truncate text-base font-semibold text-tinta">{primerNombre(p.persona)}</span>
          <span className="block text-sm text-secundario">{p.ultimaEntrega ? `Recibió plata el ${diaMes(p.ultimaEntrega)}` : "Sin ronda abierta"}</span>
        </span>
      </span>

      <span className="grid grid-cols-3 gap-2 border-y border-sand py-3">
        <Numero etiqueta="Tiene" valor={soles(p.tiene)} />
      </span>

      <span className="vd-placa flex items-start gap-2 rounded-xl px-3 py-2.5 text-sm text-tinta">
        <Info aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-secundario" />
        <span>Todavía no abre su ronda.</span>
      </span>

      <Pie>Ver su plata</Pie>
    </Link>
  );
}

function Pie({ children }: { children: string }) {
  return (
    <span className="mt-auto inline-flex items-center gap-1 text-sm font-semibold text-tinta">
      {children}
      <ChevronRight aria-hidden className="h-3.5 w-3.5 transition-transform duration-300 [@media(hover:hover)]:group-hover:translate-x-0.5" />
    </span>
  );
}

function Numero({ etiqueta, valor, ambar = false }: { etiqueta: string; valor: string; ambar?: boolean }) {
  return (
    <span className="min-w-0">
      <span className="block text-xs font-semibold uppercase tracking-[0.1em] text-secundario">{etiqueta}</span>
      <span className={`font-display block whitespace-nowrap text-lg leading-tight tabular-nums @[22rem]:text-xl ${ambar ? "text-ambar" : "text-tinta"}`}>{valor}</span>
    </span>
  );
}
