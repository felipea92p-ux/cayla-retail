"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Tag } from "lucide-react";
import { ComboResponsable } from "@/components/ComboResponsable";
import { FilaDeLista } from "@/components/campanas/FilaDeLista";
import { PonerUnPct } from "@/components/rebajas/PonerUnPct";
import { Aviso } from "@/components/ui/Aviso";
import { avisar } from "@/components/ui/Avisos";
import { Boton } from "@/components/ui/campos";
import { Cajon } from "@/components/ui/Cajon";
import { Globito } from "@/components/ui/Globito";
import { Vacio } from "@/components/ui/Vacio";
import { traducirError } from "@/lib/error-escritura";
import { rpcRebaja } from "@/lib/rebaja-rapida";
import { descuentosDeLaTienda, nombreDeDescuento, nombreDeLugar, precioConPct, textoPct, type DescuentoDeLista, type LugarDeRebaja } from "@/lib/rebaja-rapida-reglas";
import { claveResponsableConteo } from "@/lib/responsable-conteo";
import { firmar } from "@/lib/responsable-reglas";
import { useResponsable } from "@/lib/useResponsable";

type FilaPrenda = { variante_id: string; referencia: string; codigo: string | null; color: string | null; talla: string | null; precio: number | string };

const soles = (n: number) => `S/ ${n.toFixed(2)}`;

/** Quién lo hace se elige una vez por tienda y queda para los siguientes: el escáner y la lista recuerdan el mismo. */
const useResponsableDeRebaja = (ubicacionId: string, sede: string) =>
  useResponsable({ ubicacionId, etiqueta: sede }, { recordarEn: claveResponsableConteo(`rebaja-${ubicacionId}`) });

/**
 * El escáner de «Poner un %» (ADR-0669), arriba de la lista de Campañas y ofertas. Va solo hasta que el buscador del panel de un descuento lo
 * reemplace (ADR-0677, actividad 3 de la maqueta `docs/maquetas/campanas-simple-2026-11/`).
 */
export function EscanerDeRebaja({ ubicacionId, sede }: { ubicacionId: string; sede: string }) {
  const router = useRouter();
  const responsable = useResponsableDeRebaja(ubicacionId, sede);
  return <PonerUnPct ubicacionId={ubicacionId} sede={sede} responsable={responsable} onCambio={() => router.refresh()} />;
}

/**
 * «Descuentos» (ADR-0677, Felipe 2026-11-17, cara A de la maqueta): lo primero de la lista de Campañas y ofertas. Cada cajón de «Poner un %» que
 * rige en la tienda es una fila «Descuento −10 %» con cuántas prendas tiene; el de todas las tiendas es otra fila y lo dice. Tocar una abre sus
 * prendas para quitarlas (el panel con su buscador llega en la actividad 2). Sin descuentos que rijan aquí, la sección no sale.
 */
export function DescuentosDeLaTienda({
  ubicacionId,
  sede,
  descuentos,
  nombres,
}: {
  ubicacionId: string;
  sede: string;
  descuentos: readonly DescuentoDeLista[];
  /** El nombre de la campaña de cada cajón (`etiquetas.nombre`): el título del cajón de sus prendas. */
  nombres: ReadonlyMap<string, string>;
}) {
  const router = useRouter();
  const responsable = useResponsableDeRebaja(ubicacionId, sede);
  const [abiertoId, setAbiertoId] = useState<string | null>(null);
  const filas = descuentosDeLaTienda(descuentos);
  const abierto = filas.find((d) => d.etiquetaId === abiertoId) ?? null;
  if (filas.length === 0) return null;

  return (
    <section className="lc-descuentos" aria-label="Descuentos" data-guia="rebaja.tienda">
      <h3 className="sl-pila-titulo">
        Descuentos
        <Globito n={filas.length} />
      </h3>
      {filas.map((d, i) => (
        <FilaDeLista
          key={d.etiquetaId}
          icono={<Tag />}
          sobre="Descuento"
          titulo={textoPct(d.pct)}
          bajada={d.todas ? "Todas las tiendas" : null}
          cifra={d.prendas}
          cifraTexto={d.prendas === 1 ? "prenda" : "prendas"}
          etiqueta={nombreDeDescuento(d)}
          abierta={d.etiquetaId === abiertoId}
          onAbrir={() => setAbiertoId(d.etiquetaId)}
          indice={i}
        />
      ))}
      {abierto && (
        <PrendasDeRebaja
          lugar={{
            etiquetaId: abierto.etiquetaId,
            nombre: nombres.get(abierto.etiquetaId) ?? textoPct(abierto.pct),
            pct: abierto.pct,
            esCajon: true,
            // El de todas las tiendas no se cambia desde una tienda: desde el escáner, con «En todas las tiendas» (solo un líder).
            movible: !abierto.todas,
            hasta: null,
            porCategoria: false,
            prendas: abierto.prendas,
          }}
          ubicacionId={ubicacionId}
          sede={sede}
          responsable={responsable}
          onCambio={() => router.refresh()}
          onCerrar={() => setAbiertoId(null)}
        />
      )}
    </section>
  );
}

/** Las prendas de un % de la tienda, con su precio de hoy y el que queda, y «Quitar» en cada una. */
function PrendasDeRebaja({
  lugar,
  ubicacionId,
  sede,
  responsable,
  onCambio,
  onCerrar,
}: {
  lugar: LugarDeRebaja;
  ubicacionId: string;
  sede: string;
  responsable: ReturnType<typeof useResponsable>;
  onCambio: () => void;
  onCerrar: () => void;
}) {
  const [prendas, setPrendas] = useState<{ estado: "cargando" } | { estado: "error"; mensaje: string } | { estado: "listo"; filas: FilaPrenda[] }>({ estado: "cargando" });
  const [quitando, setQuitando] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let vigente = true;
    (async () => {
      const { data, error } = await rpcRebaja<FilaPrenda[]>("campanas_rebaja_prendas", { p_etiqueta_id: lugar.etiquetaId, p_ubicacion_id: ubicacionId });
      if (!vigente) return;
      setPrendas(error ? { estado: "error", mensaje: traducirError(error, "leer sus prendas", { lectura: true }) } : { estado: "listo", filas: data ?? [] });
    })();
    return () => {
      vigente = false;
    };
  }, [lugar.etiquetaId, ubicacionId, version]);

  async function quitar(p: FilaPrenda) {
    setQuitando(p.variante_id);
    const { error } = await firmar(
      rpcRebaja("quitar_rebaja", { p_variante_id: p.variante_id, p_alcance: "prenda", p_ubicacion_id: ubicacionId, p_todas: false }),
      responsable.firma(),
    );
    setQuitando(null);
    responsable.despues(error);
    if (error) {
      avisar.error(traducirError(error, "quitar el %"));
      return;
    }
    avisar.exito(`${textoPct(lugar.pct)} quitado`, { detalle: [p.referencia, p.color, p.talla].filter(Boolean).join(" · ") });
    setVersion((v) => v + 1);
    onCambio();
  }

  return (
    <Cajon
      onCerrar={onCerrar}
      clave={lugar.etiquetaId}
      sobre={`Rebajas de ${sede}`}
      titulo={nombreDeLugar(lugar)}
      frase={lugar.hasta ? `Hasta el ${lugar.hasta.split("-").reverse().join("/")}` : "Sin fecha de fin: rige hasta que se quite."}
    >
      <div className="space-y-4">
        {!lugar.movible && (
          <Aviso tono="info" chico titulo="Rige en todas las tiendas">
            {lugar.esCajon ? "Sus prendas se quitan desde el escáner, con «En todas las tiendas»." : "Sus prendas se quitan desde la campaña."}
          </Aviso>
        )}
        {lugar.porCategoria && (
          <Aviso tono="info" chico titulo="También llega por sus categorías">
            Esas prendas se cambian desde la campaña; aquí van las marcadas una por una.
          </Aviso>
        )}
        {lugar.movible && !responsable.listo && <ComboResponsable control={responsable} deshabilitado={quitando !== null} />}
        {prendas.estado === "cargando" ? (
          <p className="text-sm text-tinta/70" role="status">
            Leyendo sus prendas…
          </p>
        ) : prendas.estado === "error" ? (
          <Aviso tono="error" titulo="No se pudieron leer sus prendas">
            {prendas.mensaje}
          </Aviso>
        ) : prendas.filas.length === 0 ? (
          <Vacio tamano="chico" icono={<Tag />} titulo="Sin prendas marcadas">
            Escanea una prenda para ponerle este %.
          </Vacio>
        ) : (
          <ul className="divide-y divide-tinta/10">
            {prendas.filas.map((p) => {
              const precio = Number(p.precio);
              return (
                <li key={p.variante_id} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] text-tinta">{p.referencia}</p>
                    <p className="text-sm text-tinta/70">{[p.color, p.talla, p.codigo].filter(Boolean).join(" · ")}</p>
                  </div>
                  <p className="shrink-0 text-right text-sm tabular-nums">
                    <span className="block text-tinta/60 line-through">{soles(precio)}</span>
                    <span className="block font-semibold">{soles(precioConPct(precio, lugar.pct))}</span>
                  </p>
                  {lugar.movible && (
                    <Boton
                      peso="peligro"
                      className="btn-chico shrink-0"
                      cargando={quitando === p.variante_id}
                      textoCargando="Quitando…"
                      disabled={quitando !== null || !responsable.listo}
                      title={responsable.motivo ?? undefined}
                      onClick={() => void quitar(p)}
                    >
                      Quitar
                    </Boton>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Cajon>
  );
}
