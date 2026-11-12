"use client";

import { Modal } from "@/components/ui/Modal";
import { MiniaturaPrenda } from "@/components/ui/PrendaCelda";
import type { LineaEnvio } from "@/lib/recepcion-envio-reglas";

// «Lo que anotó Compras» de un modelo (Felipe 2026-11-12, al recibir ENV-001660): tocar la foto o el ícono de la prenda en el contador abre lo
// que la compradora escribió al comprar —la descripción, el costo, el precio de venta que propuso, de quién y de qué marca, cuántas dijo y en
// qué orden—, «para que sea más fácil ver la descripción que se puso en compras, el costo y el precio sugerido». Solo se lee: no guarda nada.

const soles = (n: number | null) => (n == null ? "—" : `S/\u00a0${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

export function LoQueAnotoCompras({
  nombre,
  foto,
  categoria,
  lineas,
  onCerrar,
}: {
  nombre: string;
  foto: string | null;
  categoria: { nombre: string; prefijo: string | null; familia: string | null } | null;
  /** Las líneas de la compra que cuenta este modelo (casi siempre una). */
  lineas: readonly LineaEnvio[];
  onCerrar: () => void;
}) {
  return (
    <Modal titulo={nombre} subtitulo="Lo que anotó Compras al comprarla." tamano="mediana" conCerrar onClose={onCerrar}>
      <div className="grid gap-5 sm:grid-cols-[9rem_minmax(0,1fr)]">
        <div className="mx-auto w-full max-w-[9rem]">
          {categoria ? <MiniaturaPrenda fotoUrl={foto} tamano="2xl" prefijo={categoria.prefijo} familia={categoria.familia} categoria={categoria.nombre} /> : null}
        </div>
        <div className="min-w-0 space-y-4">
          {lineas.map((l) => (
            <section key={l.id} className="nota-cayla sin-i space-y-3">
              <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-sm">
                <dt className="text-taupe">Descripción</dt>
                <dd className="text-tinta">{l.descripcion?.trim() || "Sin descripción"}</dd>
                <dt className="text-taupe">Proveedor</dt>
                <dd className="text-tinta">{l.proveedor?.nombre ?? "—"}</dd>
                <dt className="text-taupe">Marca</dt>
                <dd className="text-tinta">{l.marca?.nombre ?? "Sin marca"}</dd>
                <dt className="text-taupe">Categoría</dt>
                <dd className="text-tinta">{l.categoria.nombre}</dd>
                <dt className="text-taupe">Dijeron</dt>
                <dd className="tabular-nums text-tinta">{l.enviado.toLocaleString("es-PE")}</dd>
                {l.orden.numero && (
                  <>
                    <dt className="text-taupe">Orden</dt>
                    <dd className="text-tinta">{l.orden.numero}</dd>
                  </>
                )}
              </dl>
              {/* Las dos cifras, grandes y a la par: lo que costó cada una y el precio que propuso quien compró. */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="campo-etiqueta">Costo por prenda</p>
                  <p className="font-display text-2xl tabular-nums text-tinta">{soles(l.costoUnitario)}</p>
                </div>
                <div>
                  <p className="campo-etiqueta">Precio de venta sugerido</p>
                  <p className="font-display text-2xl tabular-nums text-tinta">{soles(l.precioVentaSugerido)}</p>
                </div>
              </div>
            </section>
          ))}
        </div>
      </div>
    </Modal>
  );
}
