"use client";

// «Proponer precio» en Nuevo producto (ADR-0641, Felipe 2026-11-10): Claude mira el costo y las prendas parecidas y propone el precio
// de etiqueta; la regla fija lo lleva a .90 y nunca lo deja bajo costo + 30 % de margen. La propuesta no se guarda sola: «Usar este
// precio» llena el campo y la persona confirma al crear el producto, como siempre.

import { Sparkles } from "lucide-react";
import { useState } from "react";
import type { RespuestaProponer } from "@/app/api/precio/proponer/route";
import { Aviso } from "@/components/ui/Aviso";
import { Chip } from "@/components/ui/Chip";
import { Boton } from "@/components/ui/campos";
import { soles } from "@/lib/compras-reglas";

type Estado = { tipo: "nada" } | { tipo: "pidiendo" } | { tipo: "error"; texto: string } | RespuestaEnPantalla;
type RespuestaEnPantalla = { tipo: "listo"; respuesta: RespuestaProponer };

export function PropuestaDePrecio({
  categoriaId,
  tejidoId,
  referencia,
  descripcion,
  costoBase,
  precioBase,
  disabled,
  onUsar,
}: {
  categoriaId: string;
  tejidoId: string;
  referencia: string;
  descripcion: string;
  costoBase: string;
  precioBase: string;
  disabled?: boolean;
  onUsar: (precio: string) => void;
}) {
  // Una propuesta se calculó con un costo y una categoría: si cambian, ya no vale (podría quedar bajo el piso del costo nuevo). Cada
  // estado guarda con qué datos nació, y uno de otros datos se lee como «nada».
  const clave = `${categoriaId}|${tejidoId}|${costoBase}`;
  const [guardado, setGuardado] = useState<{ clave: string; estado: Estado }>({ clave, estado: { tipo: "nada" } });
  const estado: Estado = guardado.clave === clave ? guardado.estado : { tipo: "nada" };
  const setEstado = (e: Estado) => setGuardado({ clave, estado: e });

  const costo = Number(costoBase);
  const proponer = async () => {
    setEstado({ tipo: "pidiendo" });
    try {
      const r = await fetch("/api/precio/proponer", {
        method: "POST",
        // Sin el loader de pantalla completa: la persona sigue viendo el formulario y el botón dice «Calculando…».
        headers: { "content-type": "application/json", "x-espera": "no" },
        body: JSON.stringify({
          origen: "alta",
          categoriaId,
          tejidoId: tejidoId || null,
          referencia: referencia.trim() || null,
          descripcion: descripcion.trim() || null,
          costo: costoBase.trim() !== "" && Number.isFinite(costo) && costo > 0 ? costo : null,
        }),
      });
      const datos = (await r.json().catch(() => null)) as (RespuestaProponer & { error?: string }) | null;
      if (!r.ok || !datos || datos.error) {
        setEstado({ tipo: "error", texto: datos?.error ?? "No se pudo calcular ahora. Prueba de nuevo en un momento." });
        return;
      }
      setEstado({ tipo: "listo", respuesta: datos });
    } catch {
      setEstado({ tipo: "error", texto: "Sin conexión: no se pudo calcular. Prueba de nuevo." });
    }
  };

  const propuesta = estado.tipo === "listo" && "propuesta" in estado.respuesta ? estado.respuesta.propuesta : null;
  const yaUsada = propuesta !== null && Number(precioBase) === propuesta.precio;

  return (
    // Sin `data-guia`: la demo no llega al paso 4 (no empieza ninguna prenda); el paso «4 · Precio y cantidad» lo nombra.
    <div className="mt-4 space-y-3">
      {!propuesta && (
        <div className="flex flex-wrap items-center gap-3">
          <Boton type="button" peso="fantasma" onClick={proponer} cargando={estado.tipo === "pidiendo"} textoCargando="Calculando…" disabled={disabled || !categoriaId}>
            <span className="inline-flex items-center gap-2">
              <Sparkles aria-hidden className="h-4 w-4" />
              Proponer precio
            </span>
          </Boton>
          <p className="text-sm text-taupe">Mira el costo y las prendas parecidas. Nunca deja menos de 30 % de margen.</p>
        </div>
      )}

      {estado.tipo === "error" && (
        <Aviso tono="error" chico>
          {estado.texto}
        </Aviso>
      )}
      {estado.tipo === "listo" && "sinPropuesta" in estado.respuesta && (
        <Aviso tono="atencion" chico>
          {estado.respuesta.sinPropuesta.texto}
        </Aviso>
      )}

      {propuesta && (
        <div className="nota-cayla sin-i space-y-2.5">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <p className="text-sm text-taupe">Te propongo</p>
            <p className="font-display text-[1.75rem] leading-none tabular-nums">{soles(propuesta.precio)}</p>
            <p className="text-sm text-taupe tabular-nums">margen {propuesta.margen.toFixed(0)} %</p>
            {propuesta.costoEstimado && (
              <Chip tono="ambar" title={`Esta prenda no tiene costo: se usó el promedio de su categoría (${soles(propuesta.costo)}).`}>
                Costo estimado
              </Chip>
            )}
          </div>
          <p className="text-sm">{propuesta.razon}</p>
          {propuesta.subidoAlPiso && (
            <p className="text-sm text-taupe">Lo subí a {soles(propuesta.piso)}: es lo mínimo para no ganar menos de 30 % con este costo.</p>
          )}
          {propuesta.parecidas.length > 0 && (
            <p className="text-sm text-taupe">
              Parecidas: {propuesta.parecidas.map((p) => `${p.referencia} (${soles(p.precio)})`).join(" · ")}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Boton type="button" peso="fantasma" disabled={disabled || yaUsada} onClick={() => onUsar(propuesta.precio.toFixed(2))}>
              {yaUsada ? "Precio puesto" : "Usar este precio"}
            </Boton>
            <button type="button" className="btn-cayla btn-enlace" onClick={proponer} disabled={disabled}>
              Proponer otro
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
