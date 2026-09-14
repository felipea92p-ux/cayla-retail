"use client";

import { useState } from "react";
import { Boton, CampoSelect, CampoTexto } from "@/components/ui/campos";

/**
 * El vocabulario cerrado de colores — portado de `trix/catalogo-vocabulario`
 * (V1) tras ADR-0035: V2 ya tiene el candado real (`colores_clave_unica`) y
 * los 30 colores de CAYLA en la base, pero hasta ahora ninguna pantalla
 * dejaba agregar uno nuevo a mano.
 *
 * La policy de escritura (`colores_insert_lider` o equivalente en
 * `20260912235500_vocabulario_cerrado.sql`) ya exige Líder — `puedeEditar`
 * solo decide si se MUESTRA el botón; el candado real vive en la base.
 */

type Color = { codigo: string; nombre: string; familiaColor: string | null; hex: string | null };

const FAMILIAS_COLOR = [
  { valor: "neutro", texto: "Neutro" },
  { valor: "azul", texto: "Azul" },
  { valor: "rojo", texto: "Rojo" },
  { valor: "amarillo", texto: "Amarillo" },
  { valor: "verde", texto: "Verde" },
  { valor: "morado", texto: "Morado" },
  { valor: "tierra", texto: "Tierra" },
  { valor: "metalico", texto: "Metálico" },
  { valor: "estampado", texto: "Estampado" },
] as const;

export function ColoresLista({ coloresIniciales, puedeEditar }: { coloresIniciales: Color[]; puedeEditar: boolean }) {
  const [colores, setColores] = useState(coloresIniciales);
  const [agregando, setAgregando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<{ tono: "ok" | "error"; texto: string } | null>(null);

  const [nombre, setNombre] = useState("");
  const [codigo, setCodigo] = useState("");
  const [familiaColor, setFamiliaColor] = useState<(typeof FAMILIAS_COLOR)[number]["valor"]>("neutro");
  const [hex, setHex] = useState("#c9b79c");

  function abrir() {
    setAgregando(true);
    setAviso(null);
    setNombre("");
    setCodigo("");
    setFamiliaColor("neutro");
    setHex("#c9b79c");
  }

  async function guardar() {
    setGuardando(true);
    setAviso(null);
    try {
      const res = await fetch("/api/productos/colores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre, codigo, familiaColor, hex }),
      });
      const datos = await res.json();
      if (!res.ok) {
        setAviso({ tono: "error", texto: datos.error ?? "No se pudo agregar el color." });
        return;
      }
      setColores((actual) =>
        [
          ...actual,
          { codigo: datos.color.codigo, nombre: datos.color.nombre, familiaColor: datos.color.familia_color, hex: datos.color.hex },
        ].sort((a, b) => a.nombre.localeCompare(b.nombre))
      );
      setAgregando(false);
    } catch {
      setAviso({ tono: "error", texto: "No se pudo hablar con el servidor. Reintenta en un momento." });
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {colores.map((c) => (
          <div key={c.codigo} className="card-cayla flex flex-col gap-2.5 p-4">
            <div
              className="h-12 w-full rounded-lg border border-tinta/10"
              style={{ backgroundColor: c.hex ?? "#e8e0d0" }}
              aria-hidden
            />
            <p className="text-sm font-medium text-tinta">{c.nombre}</p>
            <div className="flex justify-between text-[11px] text-tinta/65">
              <span className="font-mono">{c.codigo}</span>
              <span>{c.familiaColor ?? "—"}</span>
            </div>
          </div>
        ))}
        {puedeEditar && (
          <button
            onClick={abrir}
            className="flex min-h-[8.5rem] flex-col items-center justify-center gap-2 rounded-xl border-[1.5px] border-dashed border-tinta/25 text-sm text-tinta/65 transition-colors hover:border-rojo hover:text-rojo"
          >
            <span className="text-xl leading-none">+</span>
            Agregar color
          </button>
        )}
      </div>

      {agregando && (
        <section className="card-cayla anim-entrada p-5">
          <p className="font-display text-lg text-tinta">Nuevo color del vocabulario</p>
          <p className="mt-1 text-xs text-tinta/65">
            Queda disponible de inmediato para cualquier prenda nueva o existente.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-[2fr_1fr_1fr]">
            <CampoTexto etiqueta="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Verde botella" />
            <CampoTexto
              etiqueta="Código (3 letras)"
              mono
              value={codigo}
              maxLength={3}
              onChange={(e) => setCodigo(e.target.value.toUpperCase())}
              placeholder="VEB"
            />
            <CampoSelect
              etiqueta="Familia"
              valor={familiaColor}
              onValor={setFamiliaColor}
              opciones={FAMILIAS_COLOR}
            />
          </div>
          <div className="mt-4 flex items-center gap-3">
            <label className="label-cayla text-[11px] text-tinta/65" htmlFor="color-hex">
              Color
            </label>
            <input
              id="color-hex"
              type="color"
              value={hex}
              onChange={(e) => setHex(e.target.value)}
              className="h-9 w-14 cursor-pointer rounded-md border border-tinta/20 bg-crema p-1"
            />
          </div>
          {aviso && (
            <p className={`mt-3 text-xs ${aviso.tono === "error" ? "text-rojo-profundo" : "text-verde"}`}>{aviso.texto}</p>
          )}
          <div className="mt-5 flex justify-end gap-2">
            <Boton peso="fantasma" onClick={() => setAgregando(false)} disabled={guardando}>
              Cancelar
            </Boton>
            <Boton peso="primario" onClick={guardar} cargando={guardando} disabled={!nombre.trim() || codigo.length !== 3}>
              Guardar color
            </Boton>
          </div>
        </section>
      )}
    </div>
  );
}
