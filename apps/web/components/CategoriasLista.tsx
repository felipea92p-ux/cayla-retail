"use client";

import { useState } from "react";
import { Boton, CampoSelect, CampoTexto } from "@/components/ui/campos";
import { FAMILIAS, type Familia } from "@cayla-retail/shared";

/**
 * Las 6 familias fijas del esquema, cada una con sus categorías (BLU, POL,
 * JEA…). Antes de esta pantalla, las 37 de hoy solo entraban por migración
 * (`0009`, `0030`, `0036`) — ninguna pantalla daba de alta una categoría.
 */

type Categoria = { id: string; nombre: string; prefijo: string };

const ETIQUETA_FAMILIA: Record<Familia, string> = {
  indumentaria: "Indumentaria",
  calzado: "Calzado",
  accesorios: "Accesorios",
  bisuteria: "Bisutería",
  belleza: "Belleza",
  papeleria: "Papelería",
};

const OPCIONES_FAMILIA = FAMILIAS.map((f) => ({ valor: f, texto: ETIQUETA_FAMILIA[f] }));

export function CategoriasLista({
  porFamiliaInicial,
  puedeEditar,
}: {
  porFamiliaInicial: Record<Familia, Categoria[]>;
  puedeEditar: boolean;
}) {
  const [porFamilia, setPorFamilia] = useState(porFamiliaInicial);
  const [agregando, setAgregando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<{ tono: "ok" | "error"; texto: string } | null>(null);

  const [nombre, setNombre] = useState("");
  const [prefijo, setPrefijo] = useState("");
  const [familia, setFamilia] = useState<Familia>("indumentaria");

  function abrir() {
    setAgregando(true);
    setAviso(null);
    setNombre("");
    setPrefijo("");
    setFamilia("indumentaria");
  }

  async function guardar() {
    setGuardando(true);
    setAviso(null);
    try {
      const res = await fetch("/api/inventario/categorias", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre, familia, prefijo }),
      });
      const datos = await res.json();
      if (!res.ok) {
        setAviso({ tono: "error", texto: datos.error ?? "No se pudo agregar la categoría." });
        return;
      }
      setPorFamilia((actual) => ({
        ...actual,
        [familia]: [...actual[familia], { id: datos.categoria.id, nombre: datos.categoria.nombre, prefijo: datos.categoria.prefijo }].sort(
          (a, b) => a.nombre.localeCompare(b.nombre)
        ),
      }));
      setAgregando(false);
    } catch {
      setAviso({ tono: "error", texto: "No se pudo hablar con el servidor. Reintenta en un momento." });
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="space-y-3">
      {FAMILIAS.map((f) => {
        const categorias = porFamilia[f] ?? [];
        return (
          <section key={f} className="card-cayla p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-tinta">{ETIQUETA_FAMILIA[f]}</p>
              <p className="text-[11px] text-tinta/65">
                {categorias.length} {categorias.length === 1 ? "categoría" : "categorías"}
              </p>
            </div>
            {categorias.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {categorias.map((c) => (
                  <span
                    key={c.id}
                    className="flex items-center gap-2 rounded-lg border border-tinta/10 bg-papel py-1.5 pl-2 pr-3 text-sm text-tinta"
                  >
                    <span className="rounded bg-sand px-1.5 py-0.5 font-mono text-[10.5px] font-semibold text-tinta/65">
                      {c.prefijo}
                    </span>
                    {c.nombre}
                  </span>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-xs italic text-tinta/65">Sin categorías todavía.</p>
            )}
          </section>
        );
      })}

      {puedeEditar && !agregando && (
        <Boton peso="fantasma" onClick={abrir} className="w-full">
          + Agregar categoría
        </Boton>
      )}

      {agregando && (
        <section className="card-cayla anim-entrada p-5">
          <p className="font-display text-lg text-tinta">Nueva categoría</p>
          <p className="mt-1 text-xs text-tinta/65">Queda disponible de inmediato en Recibir y Nuevo producto.</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_2fr_1fr]">
            <CampoSelect etiqueta="Familia" valor={familia} onValor={setFamilia} opciones={OPCIONES_FAMILIA} />
            <CampoTexto etiqueta="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Chalecos" />
            <CampoTexto
              etiqueta="Prefijo (3 letras)"
              mono
              value={prefijo}
              maxLength={3}
              onChange={(e) => setPrefijo(e.target.value.toUpperCase())}
              placeholder="CHA"
            />
          </div>
          {aviso && (
            <p className={`mt-3 text-xs ${aviso.tono === "error" ? "text-rojo-profundo" : "text-verde"}`}>{aviso.texto}</p>
          )}
          <div className="mt-5 flex justify-end gap-2">
            <Boton peso="fantasma" onClick={() => setAgregando(false)} disabled={guardando}>
              Cancelar
            </Boton>
            <Boton peso="primario" onClick={guardar} cargando={guardando} disabled={!nombre.trim() || prefijo.length !== 3}>
              Guardar categoría
            </Boton>
          </div>
        </section>
      )}
    </div>
  );
}
