"use client";

import { useMemo, useState } from "react";
import { avisar } from "@/components/ui/Avisos";
import { Boton } from "@/components/ui/campos";
import { ComboBuscable } from "@/components/ui/ComboBuscable";
import { PieAcciones } from "@/components/ui/PieAcciones";
import { Aviso } from "@/components/ui/Aviso";
import { Punto } from "@/components/alta-producto/Punto";
import { AvisoSinIdentidad, ResponsableEnHoja, useFirmaDeMitad, useHayResponsableDeMitad } from "@/components/alta-producto/IdentidadAlta";
import type { ColorAlta } from "@/lib/alta-producto";
import { colorDeRespuesta } from "@/lib/color-alta-reglas";
import { componentesDeMezcla, MAX_ACOMPANANTES, mezclaExistente, nombreDeMezcla, puedeAcompanar, tonosDeMezcla } from "@/lib/color-combinado";
import { useEnLinea } from "@/lib/useEnLinea";

// «+ acompañante» (ADR-0643): convierte un color elegido en una mezcla. La persona elige de 1 a 3 colores que acompañan a la base
// («Hueso» + «azul» → «Hueso con azul»); la base busca la mezcla o la crea (`retail.color_combinado`) y la pantalla la elige EN VEZ
// de la base: la prenda que llegó es una sola, de base hueso con detalles azules, no una hueso y otra azul.
//
// Un solo control (los acompañantes): por eso no lleva guía de foco campo por campo (ADR-0284: un modal de un control no aplica);
// el pie dice qué falta y el nombre de la mezcla se ve armado antes de guardar.

export function ArmarMezcla({
  base,
  colores,
  onLista,
  onCerrar,
}: {
  base: ColorAlta;
  /** Los colores que ya tiene la pantalla: de aquí salen los acompañantes y se reconoce una mezcla que ya existe. */
  colores: ColorAlta[];
  /** La mezcla (nueva o la que ya existía): quien la recibe la elige en vez de la base. */
  onLista: (mezcla: ColorAlta) => void;
  onCerrar: () => void;
}) {
  const [acompanantes, setAcompanantes] = useState<string[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const enLinea = useEnLinea();
  const firma = useFirmaDeMitad("alta_producto_color");
  const conCombo = useHayResponsableDeMitad();

  const porCodigo = useMemo(() => new Map(colores.map((c) => [c.codigo, c])), [colores]);
  const elegidos = acompanantes.map((cod) => porCodigo.get(cod)).filter((c): c is ColorAlta => !!c);
  const opciones = colores.filter((c) => puedeAcompanar(c, base.codigo));
  const lleno = acompanantes.length >= MAX_ACOMPANANTES;

  const componentes = componentesDeMezcla(base.codigo, acompanantes);
  const nombre = nombreDeMezcla(base, elegidos);
  const yaExiste = acompanantes.length > 0 ? mezclaExistente(colores, componentes) : null;
  const tonos = tonosDeMezcla({ componentes }, porCodigo);

  const falta = acompanantes.length === 0 ? `Elige al menos un color que acompañe al ${base.nombre.toLocaleLowerCase("es")}.` : null;
  const bloqueo = !enLinea ? "Armar una mezcla necesita internet. Cuando vuelva la conexión, vuelve a tocar «Usar la mezcla»." : falta;

  function alternar(cod: string) {
    setError(null);
    setAcompanantes((xs) => (xs.includes(cod) ? xs.filter((x) => x !== cod) : xs.length >= MAX_ACOMPANANTES ? xs : [...xs, cod]));
  }

  async function usar() {
    if (guardando || bloqueo || !firma.listo) return;
    // Si la pantalla ya la tiene, no hace falta ir a la base: se elige la que existe.
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
    <div className="space-y-4">
      <div className="flex min-h-9 flex-wrap items-center gap-1.5">
        <span className="inline-flex min-h-9 items-center gap-[7px] rounded-full border border-sand bg-hueso py-1 pl-3 pr-3 text-[13.5px] text-tinta">
          <Punto hex={base.hex} familia={base.familiaColor} tipo={base.tipo} />
          {base.nombre}
          <span className="text-taupe">· base</span>
        </span>
        {elegidos.map((c) => (
          <span key={c.codigo} className="inline-flex min-h-9 items-center gap-[7px] rounded-full border border-tinta bg-tinta/[0.07] py-1 pl-3 pr-1.5 text-[13.5px] text-tinta">
            <Punto hex={c.hex} familia={c.familiaColor} tipo={c.tipo} />
            {c.nombre}
            <button
              type="button"
              onClick={() => alternar(c.codigo)}
              disabled={guardando}
              aria-label={`Quitar ${c.nombre}`}
              className="grid h-6 w-6 place-items-center rounded-full text-[15px] leading-none text-tinta/60 hover:bg-tinta/[0.07] hover:text-tinta"
            >
              ×
            </button>
          </span>
        ))}
      </div>

      <ComboBuscable
        caja
        etiquetaAccesible="Buscar un color que acompaña"
        autoFocus
        marcador={lleno ? `Ya tiene ${MAX_ACOMPANANTES}: quita uno para cambiarlo` : `Busca el color que acompaña al ${base.nombre.toLocaleLowerCase("es")}`}
        valor=""
        varios
        onValor={(cod) => alternar(cod)}
        opciones={opciones.map((c) => ({
          valor: c.codigo,
          texto: c.nombre,
          detalle: acompanantes.includes(c.codigo) ? "elegido" : undefined,
          claves: c.sinonimos,
          icono: <Punto hex={c.hex} familia={c.familiaColor} tipo={c.tipo} />,
        }))}
      />

      {/* La mezcla, armada antes de guardar: así se lee en la etiqueta y en la carta. */}
      <div className="flex min-h-12 items-center gap-3 rounded-xl border border-sand bg-crema px-3 py-2" aria-live="polite">
        <Punto hex={base.hex} familia={base.familiaColor} tipo={base.tipo} tonos={tonos} grande />
        <p className="min-w-0 text-sm">
          {acompanantes.length === 0 ? (
            <span className="text-taupe">Aquí se arma el nombre: «{base.nombre} con …»</span>
          ) : (
            <>
              <span className="text-tinta">{nombre}</span>
              <span className="text-taupe">{yaExiste ? " · ya existe: se elige esa" : " · se crea al usarla"}</span>
            </>
          )}
        </p>
      </div>

      {conCombo ? <ResponsableEnHoja deshabilitado={guardando} /> : <AvisoSinIdentidad firma={firma} enHoja />}
      {error && <Aviso tono="error">{error}</Aviso>}
      {bloqueo && !error && <p className="text-sm text-taupe">{bloqueo}</p>}

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
    </div>
  );
}
