"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Tag } from "lucide-react";
import { BotonQuitarFoto } from "@/components/alta-producto/FotosAlta";
import { ComboResponsable } from "@/components/ComboResponsable";
import { AgregarAlDescuento, type Agregado } from "@/components/campanas/AgregarAlDescuento";
import { useResponsableDeRebaja } from "@/components/rebajas/RebajasDeTienda";
import { Aviso } from "@/components/ui/Aviso";
import { avisar } from "@/components/ui/Avisos";
import { Chip } from "@/components/ui/Chip";
import { FotoDePrenda } from "@/components/ui/FotoDePrenda";
import { MenuAcciones } from "@/components/ui/MenuAcciones";
import { Vacio } from "@/components/ui/Vacio";
import { traducirError } from "@/lib/error-escritura";
import { urlEtiquetasDePrecio } from "@/lib/etiqueta-precio-reglas";
import { rpcRebaja } from "@/lib/rebaja-rapida";
import {
  comoDeshacerAgregar,
  detalleDePieza,
  piezasDeDescuento,
  textoPct,
  type DescuentoDeLista,
  type PiezaDeDescuento,
  type PrendaDeLugar,
  type VitrinaDeTalla,
} from "@/lib/rebaja-rapida-reglas";
import { firmar } from "@/lib/responsable-reglas";

type FilaPrenda = { variante_id: string; producto_id: string; referencia: string; color: string | null; color_hex: string | null; talla: string | null; precio: number | string };

const soles = (n: number) => `S/ ${n.toFixed(2)}`;
const plural = (n: number) => (n === 1 ? "prenda" : "prendas");

/**
 * El panel de un descuento (ADR-0677, actividad 2 de la maqueta `docs/maquetas/campanas-simple-2026-11/`): se abre a la derecha de la lista,
 * donde va una campaña abierta, con el % en grande, cuántas prendas tiene, quién lo hace y sus prendas en grilla (un modelo en un color, con
 * su foto o su categoría sobre su color). La × de cada una la quita sin preguntar (todas sus tallas) y el aviso trae «Deshacer»: perdonar
 * antes que preguntar (/formidable, ley 7). Arriba, el buscador agrega (`AgregarAlDescuento`). Un descuento de todas las tiendas solo lo toca un líder,
 * como en la base (`fn_exigir_rebaja_rapida`).
 */
export function PanelDeDescuento({
  descuento,
  ubicacionId,
  sede,
  esLider,
  vitrina,
  tallasPorColor,
  tallasPorClave,
  tallasPorModelo,
  costos,
  volver,
  onConteo,
  onCambiarPct,
  onDesactivado,
  onAbrir,
}: {
  descuento: DescuentoDeLista;
  ubicacionId: string;
  sede: string;
  esLider: boolean;
  /** La foto y la categoría de cada talla (`null` si la pantalla no las pudo leer: la prenda sin foto). */
  vitrina: ReadonlyMap<string, VitrinaDeTalla> | null;
  /** Cuántas tallas a la venta tiene cada modelo en su color (`claveModeloColor`). */
  tallasPorColor: ReadonlyMap<string, number>;
  /** Las tallas a la venta de cada modelo en su color y de cada modelo entero: lo que agrega «todo el modelo» o un color. */
  tallasPorClave: ReadonlyMap<string, string[]>;
  tallasPorModelo: ReadonlyMap<string, string[]>;
  /** Lo que costó cada talla, para el aviso «Bajo costo» (vacío si quien mira no ve el dinero). */
  costos: ReadonlyMap<string, number>;
  /** La flecha de vuelta a la lista (solo con una columna, donde el panel tapa la lista). */
  volver?: ReactNode;
  /** Cuántas prendas tiene ahora, cada vez que las vuelve a leer: la fila de la lista lo muestra. */
  onConteo: (n: number) => void;
  /** «Cambiar el %»: la pantalla abre la hoja. */
  onCambiarPct: () => void;
  /** Se apagó: la pantalla cierra el panel, vuelve a leer la lista y después da el aviso. */
  onDesactivado: (aviso: () => void) => void;
  /** «Deshacer» lo volvió a encender: la pantalla lo abre otra vez y después da el aviso. */
  onAbrir: (etiquetaId: string, aviso?: () => void) => void;
}) {
  const router = useRouter();
  const responsable = useResponsableDeRebaja(ubicacionId, sede);
  const { etiquetaId, pct, todas } = descuento;
  const [lectura, setLectura] = useState<{ estado: "cargando" } | { estado: "error"; mensaje: string } | { estado: "listo"; filas: PrendaDeLugar[] }>({ estado: "cargando" });
  const [version, setVersion] = useState(0);
  const [quitando, setQuitando] = useState<string | null>(null);
  const [recientes, setRecientes] = useState<string[]>([]);
  // Un descuento de todas las tiendas se cambia «en todas»: lo pide la base y solo puede un líder.
  const puedeTocar = !todas || esLider;

  useEffect(() => {
    let vigente = true;
    (async () => {
      const { data, error } = await rpcRebaja<FilaPrenda[]>("campanas_rebaja_prendas", { p_etiqueta_id: etiquetaId, p_ubicacion_id: ubicacionId });
      if (!vigente) return;
      setLectura(
        error
          ? { estado: "error", mensaje: traducirError(error, "leer sus prendas", { lectura: true }) }
          : {
              estado: "listo",
              filas: (data ?? []).map((f) => ({
                varianteId: f.variante_id,
                productoId: f.producto_id,
                referencia: f.referencia,
                color: f.color,
                colorHex: f.color_hex,
                talla: f.talla,
                precio: Number(f.precio) || 0,
              })),
            },
      );
    })();
    return () => {
      vigente = false;
    };
  }, [etiquetaId, ubicacionId, version]);

  const piezas = lectura.estado === "listo" ? piezasDeDescuento(lectura.filas, pct, { vitrina, tallasPorColor, costos, recientes }) : [];
  // Lo que acaba de leer de la base es la cifra de verdad: la fila de la lista la toma de aquí, sin rehacer toda la pantalla (un refresco
  // ocuparía la pantalla justo cuando sale el aviso con «Deshacer», y la pila lo retiraría por visto).
  const cuantas = lectura.estado === "listo" ? piezas.length : null;
  useEffect(() => {
    if (cuantas !== null) onConteo(cuantas);
  }, [cuantas, onConteo]);

  /** Quita o devuelve cada talla de la prenda, una por una (cada llamada es la misma de la hoja, con su candado). Para en el primer error. */
  async function cadaTalla(pieza: PiezaDeDescuento, accion: "quitar" | "devolver") {
    for (const varianteId of pieza.variantes) {
      const llamada =
        accion === "quitar"
          ? rpcRebaja("quitar_rebaja", { p_variante_id: varianteId, p_alcance: "prenda", p_ubicacion_id: ubicacionId, p_todas: todas })
          : rpcRebaja("poner_rebaja", {
              p_variante_id: varianteId,
              p_alcance: "prenda",
              p_pct: todas ? pct : null,
              p_etiqueta_id: todas ? null : etiquetaId,
              p_ubicacion_id: ubicacionId,
              p_todas: todas,
            });
      const { error } = await firmar(llamada, responsable.firma());
      responsable.despues(error);
      if (error) return error;
    }
    return null;
  }

  async function quitar(pieza: PiezaDeDescuento) {
    setQuitando(pieza.clave);
    const error = await cadaTalla(pieza, "quitar");
    setQuitando(null);
    setVersion((v) => v + 1);
    if (error) {
      avisar.error(traducirError(error, "quitar el %"));
      return;
    }
    avisar.exito(`${pieza.referencia} sin ${textoPct(pct)}`, {
      detalle: detalleDePieza(pieza),
      accion: { texto: "Deshacer", onClick: () => void devolver(pieza) },
    });
  }

  async function devolver(pieza: PiezaDeDescuento) {
    const error = await cadaTalla(pieza, "devolver");
    setRecientes((r) => [pieza.clave, ...r.filter((c) => c !== pieza.clave)]);
    setVersion((v) => v + 1);
    if (error) avisar.error(traducirError(error, "devolver el %"));
    else avisar.exito(`${pieza.referencia} otra vez con ${textoPct(pct)}`, { detalle: detalleDePieza(pieza) });
  }

  function alAgregar(a: Agregado) {
    setRecientes((r) => [...a.claves, ...r.filter((c) => !a.claves.includes(c))]);
    setVersion((v) => v + 1);
    if (a.variantes.length === 0) return;
    const antes = a.antes;
    avisar.exito(a.texto, {
      detalle: a.detalle,
      ...(antes ? { accion: { texto: "Deshacer", onClick: () => void deshacerAgregar(a.variantes, antes, a.texto) } } : {}),
    });
  }

  /** Cada talla vuelve a donde estaba: a su otro lugar (`poner_rebaja` en ese lugar la saca de aquí) o a ningún %. */
  async function deshacerAgregar(variantes: string[], antes: ReadonlyMap<string, string>, texto: string) {
    const { devolver, quitar } = comoDeshacerAgregar(variantes, antes, etiquetaId);
    let error = null;
    for (const d of devolver) {
      const r = await firmar(
        rpcRebaja("poner_rebaja", { p_variante_id: d.varianteId, p_alcance: "prenda", p_pct: null, p_etiqueta_id: d.a, p_ubicacion_id: ubicacionId, p_todas: todas }),
        responsable.firma(),
      );
      responsable.despues(r.error);
      if ((error = r.error)) break;
    }
    for (const v of error ? [] : quitar) {
      const r = await firmar(rpcRebaja("quitar_rebaja", { p_variante_id: v, p_alcance: "prenda", p_ubicacion_id: ubicacionId, p_todas: todas }), responsable.firma());
      responsable.despues(r.error);
      if ((error = r.error)) break;
    }
    setVersion((n) => n + 1);
    if (error) avisar.error(traducirError(error, "deshacer"));
    else avisar.exito(`Deshecho: ${texto}`);
  }

  /** «Desactivar −X %»: sus prendas vuelven a su precio y el descuento se apaga (Felipe 2026-11-17). «Deshacer» devuelve todas de una vez. */
  async function desactivar() {
    const { data, error } = await firmar(
      rpcRebaja<{ quitadas: string[] }>("desactivar_descuento", { p_etiqueta_id: etiquetaId, p_ubicacion_id: ubicacionId, p_todas: todas }),
      responsable.firma(),
    );
    responsable.despues(error);
    if (error) {
      avisar.error(traducirError(error, "desactivar el descuento"));
      return;
    }
    const quitadas = data?.quitadas ?? [];
    onDesactivado(() =>
      avisar.exito(`${textoPct(pct)} desactivado`, {
        detalle: quitadas.length > 0 ? "Sus prendas vuelven a su precio" : undefined,
        accion: { texto: "Deshacer", onClick: () => void reactivar(quitadas) },
      }),
    );
  }

  async function reactivar(quitadas: string[]) {
    // Con prendas, vuelven todas a este % (lo enciende); vacío, se vuelve a crear (también lo enciende).
    const llamada =
      quitadas.length > 0
        ? rpcRebaja<{ etiqueta_id: string }>("poner_rebaja_varias", { p_variantes: quitadas, p_pct: pct, p_etiqueta_id: null, p_ubicacion_id: ubicacionId, p_todas: todas })
        : rpcRebaja<{ etiqueta_id: string }>("crear_descuento", { p_pct: pct, p_ubicacion_id: ubicacionId, p_todas: todas });
    const { data, error } = await firmar(llamada, responsable.firma());
    responsable.despues(error);
    if (error) {
      avisar.error(traducirError(error, "volver a encender el descuento"));
      return;
    }
    onAbrir(data?.etiqueta_id ?? etiquetaId, () => avisar.exito(`${textoPct(pct)} otra vez encendido`));
  }

  const enElDescuento = new Set(piezas.map((p) => p.clave));

  return (
    <section className="lc-panel" aria-label={`Descuento ${textoPct(pct)}`}>
      <div className="lc-panel-cab">
        <div className="min-w-0">
          <p className="lc-panel-pre">
            {volver}
            <span>{`Descuento · ${todas ? "Todas las tiendas" : sede}`}</span>
          </p>
          {/* unificar-fijo: el % del descuento abierto es la portada del panel (como el titular del pase), no un título de sección */}
          <h2 className="lc-panel-tit">{textoPct(pct)}</h2>
        </div>
        <div className="lc-panel-acc">
          {lectura.estado === "listo" && (
            <span className="lc-panel-cnt">
              <b>{piezas.length}</b>
              {plural(piezas.length)}
            </span>
          )}
          {puedeTocar && <ComboResponsable control={responsable} deshabilitado={quitando !== null} enLinea />}
          {puedeTocar && (
            <MenuAcciones
              texto="Más"
              etiqueta={`Más acciones del ${textoPct(pct)}`}
              items={[
                { clave: "cambiar", etiqueta: "Cambiar el %", onSelect: onCambiarPct },
                { clave: "imprimir", etiqueta: "Imprimir etiquetas", onSelect: () => router.push(urlEtiquetasDePrecio({ campana: etiquetaId })) },
                { clave: "desactivar", etiqueta: `Desactivar ${textoPct(pct)}`, peligro: true, onSelect: () => void desactivar() },
              ]}
            />
          )}
        </div>
      </div>

      {puedeTocar && (
        <AgregarAlDescuento
          descuento={descuento}
          ubicacionId={ubicacionId}
          responsable={responsable}
          enElDescuento={enElDescuento}
          tallasPorClave={tallasPorClave}
          tallasPorModelo={tallasPorModelo}
          onAgregado={alAgregar}
        />
      )}

      {!puedeTocar && (
        <Aviso tono="info" chico titulo="Rige en todas las tiendas" className="mt-6">
          Sus prendas las cambia un líder.
        </Aviso>
      )}

      {lectura.estado === "cargando" ? (
        <p className="mt-8 text-sm text-tinta/70" role="status">
          Leyendo sus prendas…
        </p>
      ) : lectura.estado === "error" ? (
        <Aviso tono="error" titulo="No se pudieron leer sus prendas" className="mt-6">
          {lectura.mensaje}
        </Aviso>
      ) : piezas.length === 0 ? (
        <div className="mt-8">
          <Vacio icono={<Tag />} titulo={`Todavía no hay prendas con ${textoPct(pct)}`} tamano="chico">
            Escanéala o búscala por su nombre.
          </Vacio>
        </div>
      ) : (
        <div className="lc-grilla" data-resultados>
          {piezas.map((p, j) => (
            <article key={p.clave} className="sl-prenda lc-pieza" data-sale={quitando === p.clave ? "" : undefined} style={{ "--j": j } as CSSProperties}>
              <div className="sl-prenda-foto relative">
                <FotoDePrenda fotoUrl={p.fotoUrl} colorHex={p.colorHex} prefijo={p.categoria?.prefijo} familia={p.categoria?.familia} categoria={p.categoria?.nombre} />
                {puedeTocar && (
                  <BotonQuitarFoto
                    grande
                    className="right-2 top-2 area-dedo"
                    etiqueta={`Quitar ${[p.referencia, p.color].filter(Boolean).join(" ")} del ${textoPct(pct)}`}
                    disabled={quitando !== null || !responsable.listo}
                    onClick={() => void quitar(p)}
                  />
                )}
              </div>
              <span className="sl-prenda-nombre" title={p.referencia}>
                {p.referencia}
              </span>
              <span className="sl-prenda-dato">{detalleDePieza(p)}</span>
              <span className="lc-pieza-precio">
                <b>{soles(p.precioConPct)}</b>
                <s>{soles(p.precio)}</s>
              </span>
              {p.bajoCosto && (
                <Chip tono="ambar" title="Con este % se vende por debajo de lo que costó">
                  Bajo costo
                </Chip>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
