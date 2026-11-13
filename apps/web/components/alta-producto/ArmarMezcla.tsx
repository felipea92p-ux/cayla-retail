"use client";

import { useMemo, useState } from "react";
import { avisar } from "@/components/ui/Avisos";
import { Boton } from "@/components/ui/campos";
import { PieAcciones } from "@/components/ui/PieAcciones";
import { Aviso } from "@/components/ui/Aviso";
import { Punto } from "@/components/alta-producto/Punto";
import { AvisoSinIdentidad, ResponsableEnHoja, useFirmaDeMitad, useHayResponsableDeMitad } from "@/components/alta-producto/IdentidadAlta";
import type { ColorAlta } from "@/lib/alta-producto";
import { colorDeRespuesta } from "@/lib/color-alta-reglas";
import { componentesDeMezcla, fondoDeMezcla, mezclaExistente, nombreDeMezcla, tonosDeMezcla } from "@/lib/color-combinado";
import { bordeDeMuestra } from "@/lib/colores-familias";
import { useEnLinea } from "@/lib/useEnLinea";

// «+ acompañante» (ADR-0643): convierte un color elegido en una mezcla. La persona elige de 1 a 3 colores que acompañan a la base
// («Hueso» + «azul» → «Hueso con azul»); la base busca la mezcla o la crea (`retail.color_combinado`) y la pantalla la elige EN VEZ
// de la base: la prenda que llegó es una sola, de base hueso con detalles azules, no una hueso y otra azul.
//
// DESDE EL 2026-11-12 NO ES UNA HOJA (Felipe, al recibir ENV-001660): «abrir el modal dentro de otro modal es algo redundante»; se usa la
// carta que ya está a la vista y «un círculo grande donde se pueda apreciar la combinación de todos los colores». Este es el panel que va
// sobre la carta mientras se arma: la carta (y el buscador) suman o quitan acompañantes —eso lo maneja `ElegirColores`— y aquí se ve la
// mezcla en grande, su nombre armado, qué falta y «Usar la mezcla». Un solo control (los acompañantes): no lleva guía campo por campo.

/** El círculo de la mezcla, en grande: la base y sus acompañantes en partes, como se verá la prenda. */
function CirculoDeMezcla({ base, tonos }: { base: ColorAlta; tonos: readonly string[] }) {
  return (
    <span
      aria-hidden
      className="inline-block h-16 w-16 shrink-0 rounded-full border border-tinta/20"
      style={{ background: tonos.length >= 2 ? fondoDeMezcla(tonos) : (base.hex ?? undefined), borderColor: bordeDeMuestra(base.hex) }}
    />
  );
}

export function ArmarMezcla({
  base,
  colores,
  acompanantes,
  onQuitar,
  onLista,
  onCerrar,
  desde = "carta",
}: {
  base: ColorAlta;
  /** Todos los colores (también las mezclas guardadas): de aquí se reconoce una mezcla que ya existe, aunque la carta ya no las ofrezca. */
  colores: ColorAlta[];
  /** Los acompañantes elegidos en la carta o el buscador, en orden. */
  acompanantes: readonly string[];
  onQuitar: (codigo: string) => void;
  /** La mezcla (nueva o la que ya existía): quien la recibe la elige en vez de la base. */
  onLista: (mezcla: ColorAlta) => void;
  onCerrar: () => void;
  /** De dónde salen los acompañantes: la carta (Nuevo producto, Recibir, Agregar colores) o el buscador de al lado (Corregir color, que no
   *  tiene carta). Solo cambia lo que dice la pista. */
  desde?: "carta" | "buscador";
}) {
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const enLinea = useEnLinea();
  const firma = useFirmaDeMitad("alta_producto_color");
  const conCombo = useHayResponsableDeMitad();

  const porCodigo = useMemo(() => new Map(colores.map((c) => [c.codigo, c])), [colores]);
  const elegidos = acompanantes.map((cod) => porCodigo.get(cod)).filter((c): c is ColorAlta => !!c);
  const componentes = componentesDeMezcla(base.codigo, [...acompanantes]);
  const nombre = nombreDeMezcla(base, elegidos);
  const yaExiste = acompanantes.length > 0 ? mezclaExistente(colores, componentes) : null;
  // Sin acompañantes todavía, el círculo es la base sola.
  const tonos = tonosDeMezcla({ componentes }, porCodigo) ?? [];
  const deLaBase = base.nombre.toLocaleLowerCase("es");

  const falta = acompanantes.length === 0 ? (desde === "carta" ? `Toca en la carta el color que acompaña al ${deLaBase}.` : `Busca el color que acompaña al ${deLaBase}.`) : null;
  const bloqueo = !enLinea ? "Armar una mezcla necesita internet. Cuando vuelva la conexión, vuelve a tocar «Usar la mezcla»." : falta;

  async function usar() {
    if (guardando || bloqueo || !firma.listo) return;
    // Si ya existe, no hace falta ir a la base: se elige la que existe (las mezclas guardadas ya no se ofrecen en la carta, pero se reusan).
    if (yaExiste) {
      onLista(yaExiste);
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      const res = await fetch("/api/productos/colores", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...firma.encabezados() },
        body: JSON.stringify({ componentes }),
      });
      const datos = await res.json().catch(() => null);
      const leido = res.ok ? colorDeRespuesta(datos) : null;
      if (!leido) {
        setError((datos as { error?: string } | null)?.error ?? "No se pudo armar la mezcla. Vuelve a intentarlo.");
        return;
      }
      const creado = (datos as { creado?: boolean } | null)?.creado === true;
      avisar.exito(creado ? `${leido.color.nombre} creado y elegido` : `${leido.color.nombre} elegido`);
      onLista(leido.color);
    } catch {
      setError("No se pudo hablar con el servidor. Revisa la conexión y vuelve a tocar «Usar la mezcla».");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <section aria-label={`Mezcla de ${deLaBase}`} className="space-y-3 rounded-xl border border-tinta/25 bg-papel p-3">
      <div className="flex items-center gap-4" aria-live="polite">
        <CirculoDeMezcla base={base} tonos={tonos} />
        <div className="min-w-0 space-y-1.5">
          <p className="text-base text-tinta">
            {acompanantes.length === 0 ? (
              <>
                {base.nombre} con <span className="text-taupe">…</span>
              </>
            ) : (
              nombre
            )}
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="inline-flex min-h-8 items-center gap-[7px] rounded-full border border-sand bg-hueso py-1 pl-3 pr-3 text-sm text-tinta">
              <Punto hex={base.hex} familia={base.familiaColor} tipo={base.tipo} />
              {base.nombre}
              <span className="text-taupe">· base</span>
            </span>
            {elegidos.map((c) => (
              <span key={c.codigo} className="inline-flex min-h-8 items-center gap-[7px] rounded-full border border-tinta bg-tinta/[0.07] py-1 pl-3 pr-1.5 text-sm text-tinta">
                <Punto hex={c.hex} familia={c.familiaColor} tipo={c.tipo} />
                {c.nombre}
                <button
                  type="button"
                  onClick={() => onQuitar(c.codigo)}
                  disabled={guardando}
                  aria-label={`Quitar ${c.nombre}`}
                  className="area-dedo grid h-6 w-6 place-items-center rounded-full text-[15px] leading-none text-tinta/60 hover:bg-tinta/[0.07] hover:text-tinta"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          <p className="text-sm text-taupe">
            {acompanantes.length === 0 ? `Elige ${desde === "carta" ? "en la carta" : "arriba"} de 1 a 3 colores que lo acompañan.` : yaExiste ? "Ya existe: se elige esa." : "Se crea al usarla."}
          </p>
        </div>
      </div>

      {conCombo ? <ResponsableEnHoja deshabilitado={guardando} /> : <AvisoSinIdentidad firma={firma} enHoja />}
      {error && <Aviso tono="error">{error}</Aviso>}
      {bloqueo && !error && acompanantes.length > 0 && <p className="text-sm text-taupe">{bloqueo}</p>}

      <PieAcciones>
        <Boton peso="fantasma" type="button" onClick={onCerrar} disabled={guardando}>
          Cancelar
        </Boton>
        <Boton
          peso="primario"
          type="button"
          cargando={guardando}
          textoCargando="Armando…"
          onClick={() => void usar()}
          disabled={guardando || !!bloqueo || !firma.listo}
          title={(bloqueo ?? firma.motivo) ?? undefined}
        >
          Usar la mezcla
        </Boton>
      </PieAcciones>
    </section>
  );
}
