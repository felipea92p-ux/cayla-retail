"use client";

// «Ver ficha» (rediseño 2026-11-13, decisiones 4 a 6): una hoja encima de la fusión con las fichas lado a lado y lo que importa para
// decidir cuál queda: la foto en grande con su galería, las ventas, el stock en cada sede, las tallas y colores, el precio, el costo
// (solo a quien ve el dinero de compras: la base no lo manda) y el alta. Solo se lee: su única salida es la ×.

import { useRef, useState } from "react";
import { SearchX } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Chip } from "@/components/ui/Chip";
import { BarraAvance } from "@/components/ui/BarraAvance";
import { CapsulaColor } from "@/components/ui/MuestraColor";
import { ImagenDePrenda } from "@/components/ui/ImagenDePrenda";
import { Vacio } from "@/components/ui/Vacio";
import { FotoAmpliada } from "@/components/existencias/FotoAmpliada";
import { FotoFicha } from "./piezas";
import { soles } from "@/lib/compras-reglas";
import { fechaDeAlta, textoVentas, type ProductoPlan } from "@/lib/fusionar-productos-reglas";
import { escalaDeStock, sedesAComparar, stockPorSede, tallasDeFicha, type DetalleFusion } from "@/lib/fusionar-productos-ficha";

const enteros = (n: number) => n.toLocaleString("es-PE");

function fechaCorta(iso: string | null): string {
  if (!iso) return "Sin ventas";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Sin ventas";
  return d.toLocaleDateString("es-PE", { day: "numeric", month: "short", year: "numeric", timeZone: "America/Lima" });
}

export function CompararFichas({
  productos,
  quedaId,
  detalle,
  errorDetalle,
  enfocar,
  onClose,
}: {
  /** En el orden de la hoja de fusión: la misma columna es la misma ficha. */
  productos: ProductoPlan[];
  quedaId: string | null;
  detalle: DetalleFusion | null;
  errorDetalle: boolean;
  /** La ficha cuyo «Ver ficha» se tocó: su columna se marca. */
  enfocar: string;
  onClose: () => void;
}) {
  const sedes = detalle ? sedesAComparar(detalle) : [];
  const stock = detalle ? productos.map((p) => stockPorSede(p.id, detalle, sedes)) : [];
  const escala = escalaDeStock(stock);
  return (
    <Modal /* unificar-fijo: al ancho de la hoja de fusión (1080 px), dirección B de Felipe 2026-11-13 */ variante="hoja" ancho="max-w-[67.5rem]" conCerrar titulo="Las fichas, una al lado de la otra" subtitulo="Lo que importa de cada una para decidir cuál queda." onClose={onClose}>
      <div className="fus-cuerpo" data-guia="fusionar.comparar">
        <ul className="fus-comparar" style={{ "--fus-n": productos.length } as React.CSSProperties} aria-label="Fichas">
          {productos.map((p, i) => (
            <li key={p.id} style={{ "--fus-i": i } as React.CSSProperties} aria-current={p.id === enfocar ? "true" : undefined}>
              <div>
                <div className="flex min-h-7 flex-wrap items-center gap-1.5">
                  <h3 className="text-[15px] font-semibold leading-tight text-tinta">{p.referencia}</h3> {/* unificar-fijo: el nombre de la ficha en su columna, no un título de sección */}
                  {p.id === quedaId && <Chip tono="verde">Queda</Chip>}
                </div>
                <p className="texto-detalle text-sm text-taupe">{[p.codigo, p.categoria.nombre].filter(Boolean).join(" · ")}</p>
              </div>
              <Galeria p={p} />

              <Bloque titulo="Ventas">
                <dl>
                  <dt className="text-taupe">Vendidas</dt>
                  <dd>{p.unidadesVendidas === 0 ? textoVentas(p) : enteros(p.unidadesVendidas)}</dd>
                  <dt className="text-taupe">Total vendido</dt>
                  <dd>{p.ventas > 0 ? soles(p.ventas) : "—"}</dd>
                  <dt className="text-taupe">Última venta</dt>
                  <dd>{fechaCorta(p.ultimaVenta)}</dd>
                </dl>
              </Bloque>

              <Bloque titulo="Stock por sede" dato={enteros(p.stock)}>
                {errorDetalle ? (
                  <Vacio tamano="chico" icono={<SearchX />} titulo="No se pudo leer el stock por sede">
                    No se pudo leer el stock por sede. El total de arriba sí es el de hoy.
                  </Vacio>
                ) : !detalle ? (
                  <p className="text-sm text-taupe">Leyendo…</p>
                ) : sedes.length === 0 ? (
                  <p className="text-sm text-taupe">Sin stock en ninguna sede.</p> // unificar-fijo: es el dato de la ficha (no tiene stock), no una lista vacía
                ) : (
                  <ul className="space-y-3">
                    {stock[i].map((s) => (
                      <li key={s.ubicacionId} className="space-y-1">
                        <div className="flex items-baseline justify-between gap-3 text-sm">
                          <span className="text-tinta">{s.sede}</span>
                          <span className="font-semibold tabular-nums text-tinta">{enteros(s.total)}</span>
                        </div>
                        <BarraAvance pct={(s.total / escala) * 100} tono="tinta" decorativa />
                        {s.detalle && <p className="text-sm text-taupe">{s.detalle}</p>}
                      </li>
                    ))}
                  </ul>
                )}
              </Bloque>

              <Bloque titulo="Tallas y colores">
                {!detalle ? (
                  <p className="text-sm text-taupe">{errorDetalle ? "No se pudieron leer." : "Leyendo…"}</p>
                ) : tallasDeFicha(p.id, detalle).colores.length === 0 ? (
                  <p className="text-sm text-taupe">Sin tallas a la venta.</p> // unificar-fijo: es el dato de la ficha (no tiene tallas), no una lista vacía
                ) : (
                  <ul className="space-y-1.5">
                    {tallasDeFicha(p.id, detalle).colores.map((c) => (
                      <li key={c.color} className="flex items-start gap-2 text-sm">
                        <CapsulaColor fondo={c.colorHex} compacta className="mt-1" />
                        <span className="min-w-0">
                          <span className="text-tinta">{c.color}</span>
                          <span className="text-taupe"> · {c.tallas.join(", ")}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Bloque>

              <Bloque titulo="Precio y alta">
                <dl>
                  <dt className="text-taupe">Precio</dt>
                  <dd>{p.precio === null ? "Sin precio" : p.precios.length > 1 ? `${soles(p.precio)} (varía)` : soles(p.precio)}</dd>
                  {p.costo !== null && (
                    <>
                      <dt className="text-taupe">Costo</dt>
                      <dd>{soles(p.costo)}</dd>
                    </>
                  )}
                  <dt className="text-taupe">Marca</dt>
                  <dd>{p.marca.nombre ?? "Sin marca"}</dd>
                  <dt className="text-taupe">Proveedor</dt>
                  <dd>{p.proveedor.nombre ?? "Sin proveedor"}</dd>
                  <dt className="text-taupe">Creado</dt>
                  <dd>{fechaDeAlta(p.creadoEn).replace(/^Creado el /, "")}</dd>
                </dl>
              </Bloque>
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  );
}

function Bloque({ titulo, dato, children }: { titulo: string; dato?: string; children: React.ReactNode }) {
  return (
    <section className="fus-bloque space-y-2">
      <h4 className="flex items-baseline justify-between gap-2">
        <span className="label-cayla">{titulo}</span>
        {dato && <span className="text-sm font-semibold tabular-nums text-tinta">{dato}</span>}
      </h4>
      {children}
    </section>
  );
}

/** La foto principal en grande y las demás chicas debajo; tocar una la pone grande (decisión 6). */
function Galeria({ p }: { p: ProductoPlan }) {
  const fotos = [...p.fotos].sort((a, b) => Number(b.esPrincipal) - Number(a.esPrincipal));
  const [vista, setVista] = useState(fotos[0]?.id ?? null);
  const grande = fotos.find((f) => f.id === vista) ?? fotos[0] ?? null;
  // Tocar la foto la abre sola y entera (Felipe 2026-11-13), con el visor de Existencias y la vista rápida.
  const [ampliada, setAmpliada] = useState(false);
  const boton = useRef<HTMLButtonElement>(null);
  if (!grande) return <FotoFicha url={null} categoria={p.categoria} />;
  return (
    <div className="space-y-2">
      <button
        ref={boton}
        type="button"
        onClick={() => setAmpliada(true)}
        className="fus-galeria-grande block cursor-zoom-in"
        aria-label={`Ver la foto de ${p.referencia} en grande`}
      >
        <ImagenDePrenda key={grande.id} src={grande.url} alt="" fill sizes="340px" className="object-cover" fallback={null} />
      </button>
      {ampliada && <FotoAmpliada fotoUrl={grande.url} referencia={p.referencia} color={null} onCerrar={() => setAmpliada(false)} alCerrarEnfocar={boton} />}
      {fotos.length > 1 && (
        <div
          className="flex gap-2 overflow-x-auto pb-1"
          role="group"
          aria-label={`Fotos de ${p.referencia}`}
          onKeyDown={(e) => {
            const paso = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
            if (!paso) return;
            e.preventDefault();
            const i = fotos.findIndex((f) => f.id === grande.id);
            setVista(fotos[(i + paso + fotos.length) % fotos.length].id);
          }}
        >
          {fotos.map((f, i) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={f.id === grande.id}
              aria-label={`Foto ${i + 1} de ${p.referencia}`}
              onClick={() => setVista(f.id)}
              className="fus-miniatura area-dedo"
            >
              <ImagenDePrenda src={f.url} alt="" fill sizes="48px" className="object-cover" fallback={null} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
