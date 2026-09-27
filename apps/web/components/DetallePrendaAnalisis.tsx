"use client";

import Link from "next/link";
import { Modal } from "@/components/ui/Modal";
import { MiniaturaPrenda } from "@/components/ui/PrendaCelda";
import { BotonAccion, ChipGrupo, type PedidoAbierto } from "@/components/AnalisisAcciones";
import { accionesDelDetalle, urlBajar, type AccesoAnalisis, type GrupoQueHacer, type PrendaAnalisis, type RedVariante } from "@/lib/analisis-que-hacer";
import { formatoRotacion, formatoVelocidad, pluralizar } from "@/lib/resumen-formato";
import { ETIQUETA_TENDENCIA } from "@/lib/resumen-desempeno";

// El detalle de una prenda en Análisis (ADR-0245): por qué está en su grupo, sus tres cifras, cada talla (con «Bajar» si
// tiene algo guardado), TODO lo que se puede hacer con ella —cada botón lleva a su pantalla con la lista cargada—, dónde
// más hay y, plegadas, las rotaciones técnicas que salieron de la vista por prenda. En el celular es la hoja que sube
// (`<Modal>`, ADR-0136); una acción que abre otra hoja («Pedir a…») cierra esta primero: nunca una hoja sobre otra.

export function DetallePrendaAnalisis({
  prenda,
  grupo,
  red,
  acceso,
  dias,
  onPedir,
  onClose,
}: {
  prenda: PrendaAnalisis;
  grupo: GrupoQueHacer;
  red: Readonly<Record<string, RedVariante>>;
  acceso: AccesoAnalisis;
  dias: number;
  onPedir: (a: PedidoAbierto) => void;
  onClose: () => void;
}) {
  const acciones = accionesDelDetalle(prenda, grupo, red, acceso);
  const tiendas = new Map<string, { nombre: string; libre: number }>();
  for (const t of prenda.tallas)
    for (const s of red[t.x.fila.varianteId]?.tiendas ?? []) {
      const e = tiendas.get(s.id) ?? { nombre: s.nombre, libre: 0 };
      e.libre += s.libre;
      tiendas.set(s.id, e);
    }
  const lectura = prenda.tallas.find((t) => t.grupo === grupo)?.lectura ?? prenda.lectura;

  return (
    <Modal
      variante="papel"
      ancho="sm:max-w-lg"
      onClose={onClose}
      titulo={
        <span className="flex items-center gap-3">
          <MiniaturaPrenda fotoUrl={null} colorHex={prenda.colorHex} tamano="lg" />
          <span className="min-w-0">
            <span className="block font-display text-[1.5rem] leading-tight text-tinta">{prenda.referencia}</span>
            {prenda.color && <span className="block text-sm font-normal text-taupe">{prenda.color}</span>}
          </span>
        </span>
      }
    >
      {(cerrar) => (
        <div className="space-y-5">
          <div>
            <ChipGrupo grupo={grupo} />
            {lectura && <p className="mt-2 text-sm text-tinta/80">{lectura.detalle || lectura.texto}</p>}
          </div>

          <div className="grid grid-cols-3 gap-2">
            {[
              { v: String(prenda.vendidas), t: `vendidas en ${dias} d` },
              {
                v: prenda.colgado.pct === null ? "—" : `${Math.round(prenda.colgado.pct)}%`,
                t: "de lo colgado",
              },
              {
                v: prenda.sinVentaDias === null ? "—" : `${Math.round(prenda.sinVentaDias)} d`,
                t: "colgada sin venta",
              },
            ].map((c) => (
              <div key={c.t} className="rounded-xl bg-crema px-3 py-2">
                <p className="font-display text-[1.35rem] leading-tight tabular-nums text-tinta">{c.v}</p>
                <p className="text-[11px] leading-4 text-taupe">{c.t}</p>
              </div>
            ))}
          </div>

          <section>
            <h3 className="label-cayla mb-2 text-[10px] text-taupe">Por talla</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-sand text-[11px] text-taupe">
                  <th className="py-1 text-left font-normal">Talla</th>
                  <th className="py-1 text-center font-normal">Vendió</th>
                  <th className="py-1 text-center font-normal">Piso hoy</th>
                  <th className="py-1 text-center font-normal">Almacén</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {prenda.tallas.map((t) => {
                  const hoy = t.x.fila.stockActualPisoAlmacen;
                  const bajar = acceso.bajar && hoy && hoy.piso <= 1 ? urlBajar([t]) : null;
                  return (
                    <tr key={t.x.fila.varianteId} className="border-b border-sand/70 last:border-0">
                      <td className="py-1.5 font-semibold">{t.x.fila.talla ?? "Única"}</td>
                      <td className="py-1.5 text-center tabular-nums">{t.x.periodo.ventasNetas}</td>
                      <td className={`py-1.5 text-center tabular-nums ${hoy?.piso === 0 ? "font-semibold text-rojo-profundo" : ""}`}>{hoy ? hoy.piso : "—"}</td>
                      <td className="py-1.5 text-center tabular-nums">{hoy ? hoy.almacen : "—"}</td>
                      <td className="py-1.5 text-right">
                        {bajar && (
                          <Link href={bajar} className="text-xs font-semibold text-tinta underline underline-offset-2 hover:text-rojo">
                            Bajar
                          </Link>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>

          {acciones.length > 0 && (
            <section>
              <h3 className="label-cayla mb-2 text-[10px] text-taupe">Qué puedes hacer</h3>
              <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2">
                {acciones.map((a, i) => (
                  <div key={`${a.clave}-${i}`} className={i === 0 ? "min-[420px]:col-span-2" : ""}>
                    <BotonAccion
                      accion={a}
                      forma="detalle"
                      onPedir={(p) => {
                        cerrar();
                        onPedir(p);
                      }}
                    />
                  </div>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-taupe">Cada botón te lleva a su pantalla con esta prenda cargada; allí pones la cantidad y confirmas.</p>
            </section>
          )}

          <section>
            <h3 className="label-cayla mb-2 text-[10px] text-taupe">Dónde más hay</h3>
            {tiendas.size === 0 ? (
              <p className="text-sm text-taupe">Ninguna otra tienda tiene esta prenda libre.</p>
            ) : (
              <ul className="space-y-1.5">
                {[...tiendas.values()].map((s) => (
                  <li key={s.nombre} className="flex justify-between rounded-lg bg-crema px-3 py-1.5 text-sm">
                    <span>{s.nombre}</span>
                    <span className="tabular-nums text-tinta/80">{pluralizar(s.libre, "unidad", "unidades")}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Las rotaciones y el ritmo por talla salieron de la vista principal (jerga para quien vende): quedan plegadas aquí y
              en «Por talla», que las muestra a todos. */}
          <details className="group">
            <summary className="label-cayla cursor-pointer list-none text-[10px] text-taupe hover:text-tinta">Cifras técnicas por talla ▾</summary>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-taupe">
                    <th className="py-1 text-left font-normal">Talla</th>
                    <th className="py-1 text-center font-normal">Ritmo</th>
                    <th className="py-1 text-center font-normal">Rot. piso</th>
                    <th className="py-1 text-center font-normal">Rot. total</th>
                    <th className="py-1 text-center font-normal">Tendencia</th>
                  </tr>
                </thead>
                <tbody>
                  {prenda.tallas.map((t) => (
                    <tr key={t.x.fila.varianteId} className="border-t border-sand/70 tabular-nums">
                      <td className="py-1 font-semibold">{t.x.fila.talla ?? "Única"}</td>
                      <td className="py-1 text-center">{t.x.ritmo === null ? "N/D" : `${formatoVelocidad(t.x.ritmo)}/día`}</td>
                      <td className="py-1 text-center">{t.x.periodo.rotacionPisoUnidades.calculable ? formatoRotacion(t.x.periodo.rotacionPisoUnidades.veces) : "N/D"}</td>
                      <td className="py-1 text-center">{t.x.periodo.rotacionTotalUnidades.calculable ? formatoRotacion(t.x.periodo.rotacionTotalUnidades.veces) : "N/D"}</td>
                      <td className="py-1 text-center">{t.x.tendencia ? ETIQUETA_TENDENCIA[t.x.tendencia.direccion] : "N/D"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </div>
      )}
    </Modal>
  );
}
