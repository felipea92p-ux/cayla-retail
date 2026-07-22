"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Ayuda } from "@/components/Ayuda";

// Partidas manuales del patrimonio, bien categorizadas según el plan de cuentas del
// manual (docs/MANUAL-CONTABLE-CAYLA.md). Lo automático (efectivo teórico + inventario
// a costo) lo calcula el sistema; aquí van muebles/equipos (tu IME), intangibles,
// cuentas bancarias, deudas.
const CATEGORIAS_ACTIVO = [
  { valor: "muebles", etiqueta: "Muebles y enseres (estantes, mostradores, remodelación)" },
  { valor: "equipos", etiqueta: "Equipos (impresoras, escáner, computadoras)" },
  { valor: "intangible", etiqueta: "Intangibles (software, licencias, marca)" },
  { valor: "banco", etiqueta: "Cuenta bancaria / inversión" },
  { valor: "otro_activo", etiqueta: "Otro activo" },
];
const CATEGORIAS_PASIVO = [
  { valor: "deuda_proveedor", etiqueta: "Deuda a proveedor" },
  { valor: "prestamo", etiqueta: "Préstamo bancario" },
  { valor: "impuesto", etiqueta: "Impuesto por pagar" },
  { valor: "otro_pasivo", etiqueta: "Otra deuda" },
];

export function PatrimonioEditor() {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [nombre, setNombre] = useState("");
  const [tipo, setTipo] = useState<"activo" | "pasivo">("activo");
  const [categoria, setCategoria] = useState("muebles");
  const [monto, setMonto] = useState(0);
  const [nota, setNota] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const categorias = tipo === "activo" ? CATEGORIAS_ACTIVO : CATEGORIAS_PASIVO;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error } = await createClient().from("patrimonio_items").insert({
      nombre,
      tipo,
      categoria,
      monto,
      nota: nota || null,
    });
    setLoading(false);
    if (error) { setError(error.message); return; }
    setAbierto(false);
    setNombre(""); setMonto(0); setNota("");
    router.refresh();
  }

  if (!abierto) {
    return (
      <button
        onClick={() => setAbierto(true)}
        className="label-cayla border border-tinta/25 px-4 py-2.5 text-[10px] text-tinta transition-colors hover:border-rojo hover:text-rojo"
      >
        + Agregar partida
      </button>
    );
  }

  return (
    <form onSubmit={onSubmit} className="border border-tinta/10 bg-papel p-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label className="label-cayla text-[10px] text-tinta/50">
            Tipo
            <Ayuda titulo="Activo o pasivo">
              Activo = algo que CAYLA TIENE y le da valor (un mueble, un equipo, plata en el banco).
              Tu IME es activo. Pasivo = algo que CAYLA DEBE (una deuda). Los activos suman a tu
              patrimonio, los pasivos restan.
            </Ayuda>
          </label>
          <select
            value={tipo}
            onChange={(e) => {
              const t = e.target.value as "activo" | "pasivo";
              setTipo(t);
              setCategoria(t === "activo" ? CATEGORIAS_ACTIVO[0].valor : CATEGORIAS_PASIVO[0].valor);
            }}
            className="w-full border border-tinta/20 bg-crema px-3 py-2 text-sm text-tinta outline-none focus:border-rojo"
          >
            <option value="activo">Activo (suma al patrimonio)</option>
            <option value="pasivo">Pasivo (deuda, resta)</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="label-cayla text-[10px] text-tinta/50">
            Categoría
            <Ayuda titulo="Categoría (IME)">
              Aquí clasificas tu IME. Muebles y enseres para estantes, mostradores y remodelación;
              Equipos para impresoras, escáner y computadoras; Intangibles para software o licencias.
              Así tu Balance queda ordenado como un plan contable de verdad.
            </Ayuda>
          </label>
          <select
            value={categoria}
            onChange={(e) => setCategoria(e.target.value)}
            className="w-full border border-tinta/20 bg-crema px-3 py-2 text-sm text-tinta outline-none focus:border-rojo"
          >
            {categorias.map((c) => (
              <option key={c.valor} value={c.valor}>{c.etiqueta}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="label-cayla text-[10px] text-tinta/50">Nombre / detalle</label>
          <input
            required
            autoFocus
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Ej. Mostrador vidrio TRU, Laptop caja…"
            className="w-full border-b border-tinta/20 bg-transparent px-1 py-2 text-sm text-tinta outline-none focus:border-rojo"
          />
        </div>
        <div className="space-y-1.5">
          <label className="label-cayla text-[10px] text-tinta/50">Monto (S/)</label>
          <input
            type="number"
            step="0.01"
            required
            value={monto}
            onChange={(e) => setMonto(Number(e.target.value))}
            className="w-full border-b border-tinta/20 bg-transparent px-1 py-2 text-sm text-tinta outline-none focus:border-rojo"
          />
        </div>
      </div>

      {error && <p className="mt-3 text-sm text-rojo">{error}</p>}

      <div className="mt-4 flex gap-2">
        <button type="button" onClick={() => setAbierto(false)} className="label-cayla flex-1 border border-tinta/25 px-3 py-2.5 text-[10px] text-tinta">
          Cancelar
        </button>
        <button type="submit" disabled={loading} className="label-cayla flex-1 bg-tinta px-3 py-2.5 text-[10px] text-crema transition-colors hover:bg-rojo disabled:opacity-50">
          {loading ? "Guardando…" : "Guardar"}
        </button>
      </div>
    </form>
  );
}
