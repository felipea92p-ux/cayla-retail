"use client";

import { useEffect, useState, type RefObject } from "react";
import { useRouter } from "next/navigation";
import { Tag } from "lucide-react";
import { ComboResponsable } from "@/components/ComboResponsable";
import { PonerUnPct } from "@/components/rebajas/PonerUnPct";
import { Aviso } from "@/components/ui/Aviso";
import { avisar } from "@/components/ui/Avisos";
import { Boton } from "@/components/ui/campos";
import { Cajon } from "@/components/ui/Cajon";
import { Modal } from "@/components/ui/Modal";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { Vacio } from "@/components/ui/Vacio";
import { traducirError } from "@/lib/error-escritura";
import { rpcRebaja } from "@/lib/rebaja-rapida";
import { nombreDeLugar, precioConPct, textoPct, type LugarDeRebaja } from "@/lib/rebaja-rapida-reglas";
import { claveResponsableConteo } from "@/lib/responsable-conteo";
import { firmar } from "@/lib/responsable-reglas";
import { useResponsable } from "@/lib/useResponsable";

type FilaLugar = { etiqueta_id: string; nombre: string; pct: number | string; es_cajon: boolean; movible: boolean; hasta: string | null; por_categoria: boolean; prendas: number };
type FilaPrenda = { variante_id: string; referencia: string; codigo: string | null; color: string | null; talla: string | null; precio: number | string };

const soles = (n: number) => `S/ ${n.toFixed(2)}`;
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/**
 * «Poner un %» y «Rebajas de tu tienda» (ADR-0669, Felipe 2026-11-16), arriba de las campañas: el escáner para ponerle un % a una prenda y,
 * debajo, cada % que hay en la tienda (los cajones y las campañas con su descuento de siempre) con cuántas prendas tiene. Tocar uno muestra
 * sus prendas y deja quitarlas. Quién lo hace se elige una vez por tienda y queda para los siguientes (`recordarEn`).
 *
 * Con `hoja` (Felipe 2026-11-17: «no quites esto, tenlo como información en un ícono»): en el celular las tarjetas no van bajo el escáner
 * sino en una hoja que abre el ícono de la cabecera de Campañas; desde 640 px siguen a la vista. El escáner queda siempre a la vista.
 */
export function RebajasDeTienda({
  ubicacionId,
  sede,
  hoja,
}: {
  ubicacionId: string;
  sede: string;
  /** La hoja del celular: la abre y la cierra la pantalla (su ícono vive en la cabecera); al cerrar, el foco vuelve a `alCerrarEnfocar`. */
  hoja?: { abierta: boolean; onCerrar: () => void; alCerrarEnfocar?: RefObject<HTMLElement | null> };
}) {
  const router = useRouter();
  const responsable = useResponsable({ ubicacionId, etiqueta: sede }, { recordarEn: claveResponsableConteo(`rebaja-${ubicacionId}`) });
  const [lugares, setLugares] = useState<LugarDeRebaja[] | null>(null);
  const [version, setVersion] = useState(0);
  const [abierto, setAbierto] = useState<LugarDeRebaja | null>(null);

  useEffect(() => {
    let vigente = true;
    (async () => {
      const { data, error } = await rpcRebaja<FilaLugar[]>("campanas_rebajas_de_tienda", { p_ubicacion_id: ubicacionId });
      if (!vigente) return;
      // Si no responde (o la base aún no la tiene), no se dibuja la lista: el escáner sigue funcionando.
      setLugares(
        error
          ? []
          : (data ?? []).map((f) => ({
              etiquetaId: f.etiqueta_id,
              nombre: f.nombre,
              pct: Number(f.pct),
              esCajon: f.es_cajon,
              movible: f.movible,
              hasta: f.hasta,
              porCategoria: f.por_categoria === true,
              prendas: Number(f.prendas) || 0,
            })),
      );
    })();
    return () => {
      vigente = false;
    };
  }, [ubicacionId, version]);

  const alCambiar = () => {
    setVersion((v) => v + 1);
    router.refresh();
  };

  // Las tarjetas de cada %: las mismas a la vista (desde 640 px) y en la hoja del celular. Desde la hoja, tocar una la cierra y abre sus prendas.
  const tarjetas = (lista: LugarDeRebaja[], clase: string, antes?: () => void) => (
    <div className={clase}>
      {lista.map((l) => (
        <TarjetaCifra
          key={l.etiquetaId}
          etiqueta={l.esCajon ? "Sin fecha de fin" : l.nombre}
          valor={textoPct(l.pct)}
          compacta
          activa={abierto?.etiquetaId === l.etiquetaId}
          onClick={() => {
            antes?.();
            setAbierto(l);
          }}
          pie={plural(l.prendas, "prenda", "prendas")}
        />
      ))}
    </div>
  );

  return (
    <section className="space-y-4" aria-label={`Rebajas de ${sede}`}>
      <PonerUnPct ubicacionId={ubicacionId} sede={sede} responsable={responsable} onCambio={alCambiar} />
      {lugares && lugares.length > 0 && (
        <div className={`space-y-3 ${hoja ? "max-sm:hidden" : ""}`} data-guia="rebaja.tienda">
          <TituloSeccion cuenta={lugares.length}>{`Rebajas de ${sede}`}</TituloSeccion>
          {tarjetas(lugares, "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6")}
        </div>
      )}
      {hoja?.abierta && (
        <Modal titulo={`Rebajas de ${sede}`} subtitulo="Toca una para ver sus prendas." onClose={hoja.onCerrar} conCerrar alCerrarEnfocar={hoja.alCerrarEnfocar}>
          {lugares === null ? (
            <p className="text-sm text-tinta/70" role="status">
              Buscando las rebajas…
            </p>
          ) : lugares.length > 0 ? (
            tarjetas(lugares, "grid grid-cols-2 gap-3", hoja.onCerrar)
          ) : (
            <Vacio icono={<Tag />} titulo="Sin rebajas aquí" tamano="chico">
              Esta tienda no tiene ningún % que rija hoy.
            </Vacio>
          )}
        </Modal>
      )}
      {abierto && (
        <PrendasDeRebaja
          lugar={abierto}
          ubicacionId={ubicacionId}
          sede={sede}
          responsable={responsable}
          onCambio={alCambiar}
          onCerrar={() => setAbierto(null)}
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
          <Aviso tono="info" chico titulo="Rige en más tiendas">
            Sus prendas se quitan desde la campaña.
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
