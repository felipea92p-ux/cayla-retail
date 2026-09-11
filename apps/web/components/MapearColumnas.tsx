"use client";

import { useRef, useState } from "react";
import { Boton, Desplegable } from "@/components/ui/campos";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CAMPOS, planPorCabeceras, type Campo, type PlanDeMapeo, type FilaEstandar } from "@/lib/importacion/mapeo";

/**
 * Paso 2: qué es cada columna.
 *
 * LA IA PROPONE, LA PERSONA CONFIRMA. Cada columna se cambia con el desplegable
 * del sistema, y corregir una NO gasta otra llamada al modelo: el recálculo va
 * por el camino determinista del mismo endpoint. Eso importa porque es lo que
 * hace barato equivocarse — si corregir costara dinero, la gente dejaría pasar
 * un mapeo dudoso.
 *
 * EL COLOR DICE CUÁNTO FIARSE, con los tonos del sistema y no con rojo: rojo es
 * el acento sagrado y ya lo gasta el error. Ámbar = "al filo, míralo"; sin tono
 * = la IA está segura. Una columna dudosa que grita en rojo compite con un
 * error real, y entonces ninguno de los dos se lee.
 */

type Respuesta = {
  plan: PlanDeMapeo;
  variantes: FilaEstandar[];
  total: number;
  faltan: Campo[];
  aviso?: string;
  /** Lo que costó, ya en dólares y con el caché contado (lib/ia/cliente.ts). */
  uso?: { entrada: number; salida: number; cacheLeido: number; costo: number };
};

const ETIQUETA: Record<Campo, string> = {
  referencia: "Nombre de la prenda",
  codigoCliente: "Código del cliente",
  categoria: "Categoría",
  talla: "Talla",
  color: "Color",
  costo: "Costo",
  precio: "Precio",
  marca: "Marca",
  genero: "Género",
  temporada: "Temporada",
  descripcion: "Descripción",
  tejido: "Tejido",
  patron: "Patrón",
  ignorar: "No importar",
};

const OPCIONES_CAMPO = CAMPOS.map((c) => ({ valor: c, texto: ETIQUETA[c] }));

export function MapearColumnas({
  filas,
  filaCabecera,
  onListo,
}: {
  filas: string[][];
  filaCabecera: number;
  onListo?: (plan: PlanDeMapeo, total: number) => void;
}) {
  const [r, setR] = useState<Respuesta | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // El plan que la persona ve AHORA, incluidas las correcciones que todavía
  // están en vuelo. Dos cambios seguidos rápidos partían de `r.plan` viejo y el
  // segundo pisaba al primero; y si las respuestas llegaban desordenadas, la
  // pantalla mostraba el estado anterior. Cada pedido lleva un número y solo el
  // último que salió puede pintar. Revisión del 2026-09-11.
  const planActual = useRef<PlanDeMapeo | null>(null);
  const secuencia = useRef(0);

  async function pedir(plan?: PlanDeMapeo) {
    const mio = ++secuencia.current;
    setCargando(true);
    setError(null);
    try {
      const res = await fetch("/api/importacion/mapear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filas, filaCabecera, ...(plan ? { plan } : {}) }),
      });
      const datos = await res.json();
      if (mio !== secuencia.current) return; // ya salió otro pedido: este no manda
      if (!res.ok) {
        setError(datos.error ?? "No se pudo leer las columnas.");
        return;
      }
      planActual.current = datos.plan;
      setR(datos);
      onListo?.(datos.plan, datos.total);
    } catch {
      if (mio === secuencia.current) setError("No se pudo hablar con el servidor. Reintenta en un momento.");
    } finally {
      if (mio === secuencia.current) setCargando(false);
    }
  }

  /** Cambiar una columna recalcula por código, sin volver a llamar al modelo. */
  function cambiar(indice: number, campo: Campo) {
    const base = planActual.current ?? r?.plan;
    if (!base) return;
    const plan: PlanDeMapeo = {
      ...base,
      columnas: base.columnas.map((c) =>
        c.indice === indice ? { ...c, campo, confianza: "alta", porque: "Corregido a mano." } : c
      ),
    };
    planActual.current = plan;
    void pedir(plan);
  }

  const cabeceras = filas[filaCabecera] ?? [];

  /** Sin modelo: un plan por el nombre de cada columna, y la persona lo termina. */
  function aMano() {
    void pedir(planPorCabeceras(cabeceras));
  }

  return (
    <section className="anim-entrada card-cayla p-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label-cayla text-[11px] text-tinta/65">Paso 2</p>
          <h2 className="font-display mt-1 text-xl text-tinta">Qué es cada columna</h2>
          {r ? (
            <p key={r.total} className="anim-asentar mt-1 text-xs text-tinta/75">
              {r.plan.disposicion === "matriz_de_tallas"
                ? "Una columna por talla: cada fila se abre en varias prendas. "
                : "Cada fila es una prenda. "}
              Salen <span className="font-display text-base text-tinta">{r.total}</span> prendas.
            </p>
          ) : (
            <p className="mt-1 text-xs text-tinta/75">
              El sistema mira las cabeceras y las primeras filas, y propone. Después lo corriges tú.
            </p>
          )}
        </div>
        {!r && (
          <Boton type="button" peso="primario" cargando={cargando} onClick={() => void pedir()}>
            Leer las columnas
          </Boton>
        )}
      </div>

      {error && (
        <div className="anim-revelar mt-4 rounded-md border border-rojo/30 bg-rojo/10 px-4 py-3 text-xs text-rojo-profundo">
          <p>{error}</p>
          {/* Si el modelo no pudo, la salida es asignar a mano: el mismo plan
              con los desplegables, pero partiendo del nombre de cada columna. */}
          {!r && (
            <div className="mt-3">
              <Boton type="button" peso="fantasma" cargando={cargando} onClick={aMano}>
                Asignar las columnas a mano
              </Boton>
            </div>
          )}
        </div>
      )}

      {r && (
        <div className="anim-velo mt-5 space-y-5">
          {r.aviso && (
            <p className="rounded-md border border-ambar/30 bg-ambar/10 px-4 py-3 text-xs text-ambar-profundo">{r.aviso}</p>
          )}
          {r.plan.notas && <p className="text-xs italic text-tinta/65">{r.plan.notas}</p>}

          {r.faltan.length > 0 && (
            <p className="anim-revelar rounded-md border border-ambar/30 bg-ambar/10 px-4 py-3 text-xs text-ambar-profundo">
              Falta indicar {r.faltan.map((f) => ETIQUETA[f].toLowerCase()).join(", ")}. Sin eso la importación
              quedaría incompleta.
            </p>
          )}

          <div className="divide-y divide-tinta/5">
            {r.plan.columnas.map((c) => {
              // Una columna de talla NO va a un campo: sus cantidades abren la
              // fila en una variante por talla. Mostrarla con el desplegable en
              // "no importar" diría lo contrario de lo que hace.
              const talla = r.plan.columnasTalla.find((t) => t.indice === c.indice);
              const dudosa = c.confianza === "baja" && !talla;
              return (
                <div
                  key={c.indice}
                  className={`grid items-center gap-x-4 gap-y-1 py-2.5 transition-colors duration-150 sm:grid-cols-[11rem_13rem_1fr] ${
                    cargando ? "opacity-60" : ""
                  }`}
                >
                  <span className="truncate text-sm text-tinta" title={cabeceras[c.indice]}>
                    {cabeceras[c.indice]?.trim() || <span className="italic text-tinta/35">sin título</span>}
                  </span>

                  {talla ? (
                    <Badge variant="verde">Talla {talla.talla}</Badge>
                  ) : (
                    <Desplegable
                      valor={c.campo}
                      onValor={(v) => cambiar(c.indice, v)}
                      opciones={OPCIONES_CAMPO}
                      forma="pastilla"
                      trabajando={cargando}
                    />
                  )}

                  <span className={`text-xs ${dudosa ? "text-ambar-profundo" : "text-tinta/65"}`}>
                    {talla ? "Cada cantidad crea una prenda en esta talla." : c.porque}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="border-t border-sand pt-4">
            <p className="label-cayla mb-2 text-[11px] text-tinta/65">Así quedan las primeras</p>
            <div className="scroll-cayla overflow-x-auto">
              <Table className="text-left text-xs">
                <TableHeader>
                  <TableRow className="label-cayla text-[10px] text-tinta/65 hover:bg-transparent">
                    {["Prenda", "Talla", "Color", "Costo", "Precio"].map((h) => (
                      <TableHead key={h} className="pb-2 pr-4 font-semibold">
                        {h}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-tinta/5">
                  {r.variantes.slice(0, 8).map((v, i) => (
                    <TableRow key={i} className="transition-colors duration-150 hover:bg-tinta/[0.025]">
                      <TableCell className="py-2 pr-4 text-tinta">{v.referencia}</TableCell>
                      <TableCell className="py-2 pr-4 text-tinta">{v.talla || "—"}</TableCell>
                      <TableCell className="py-2 pr-4 text-tinta">{v.color || "—"}</TableCell>
                      <TableCell className="py-2 pr-4 tabular-nums text-tinta/65">{v.costo ? v.costo.toFixed(2) : "—"}</TableCell>
                      <TableCell className="py-2 pr-4 tabular-nums text-tinta">{v.precio ? v.precio.toFixed(2) : "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          {r.uso && (
            <p className="text-[11px] text-tinta/50">
              {r.uso.entrada + r.uso.cacheLeido} tokens de entrada · {r.uso.salida} de salida ≈ ${r.uso.costo.toFixed(4)}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
