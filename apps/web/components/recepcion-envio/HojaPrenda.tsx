"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Aviso } from "@/components/ui/Aviso";
import { avisar } from "@/components/ui/Avisos";
import { Boton, CampoMonto, CampoSelect, CampoTexto } from "@/components/ui/campos";
import { ElegirColores } from "@/components/alta-producto/ElegirColores";
import { ChipOpcion } from "@/components/alta-producto/piezas";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { claveCelda, leerErrorAlta, type ColorAlta } from "@/lib/alta-producto";
import { agruparPorFamilia } from "@/lib/colores-familias";
import { esFalloDeRed, traducirError } from "@/lib/error-escritura";
import { sugerirDescripcion, sugerirNombre } from "@/lib/sugerencias-alta-producto";
import type { ControlResponsable } from "@/lib/useResponsable";
import { prepararPrendaAlRecibir } from "@/lib/recepcion-envio-acciones";
import {
  AVISO_DE_CORTE_PRENDA,
  argsPrepararPrenda,
  borradorDePrenda,
  camposDePrenda,
  combinacionesDeLaHoja,
  costoComoTexto,
  mensajeDeLaRecepcion,
  textoDeLoQueSeCrea,
  TOPES_PRENDA,
  type BorradorPrenda,
  type CategoriaParaRecibir,
  type ContextoPrenda,
  type PrendaRecepcion,
} from "@/lib/recepcion-envio-reglas";

// La hoja de la prenda al recibir (ADR-0362, fase 4; decisiones 21 y 49): quien recibe CREA la prenda que llegó, ahí mismo, con las tallas y
// los colores que vinieron y el precio de venta que sugirió quien compró ya puesto («Es nueva»); o le suma a una que ya existe las tallas o
// colores que le faltan («+ talla o color»). Escribe con `preparar_prenda_al_recibir`, que llama al alta de siempre
// (`crear_producto_con_variantes`): sus candados mandan (nombre único en la marca, talla de la categoría, color activo, precio mayor que 0,
// tejido y patrón si la familia los pide) y sus mensajes llegan tal cual. La categoría y la marca son las de la línea: no se eligen aquí.
//
// Lo que se pide es lo mínimo de Nuevo producto: nombre, tallas, colores, precio, descripción y, en Indumentaria, tejido y patrón. Las fotos,
// las etiquetas y lo demás se completan después en Productos. Los ejemplos de la caja siguen a la categoría (ADR-0290). La guía de foco
// enciende lo que sigue (ADR-0284). Un token por hoja: un doble clic o un reintento no crea dos prendas.

export type DestinoHoja = {
  modo: "nueva" | "agregar";
  despachoId: string;
  /** La línea del envío; `null` = algo que no estaba en la guía (entonces van la categoría y la marca elegidas). */
  despachoItemId: string | null;
  categoriaId: string;
  /** Vacío = sin marca (ADR-0393, 2026-10-14): la prenda nace sin marca y se completa en Editar producto. */
  marcaId: string | null;
  marcaNombre: string;
  /** Lo que dice la orden de esta prenda («Chompa cuello alto»): se ofrece como nombre. */
  descripcionOrden: string | null;
  precioSugerido: number | null;
  costoUnitario: number | null;
  /** En «agregar»: la prenda que ya existe. */
  prenda: PrendaRecepcion | null;
  /** Algo fuera de la guía en un envío de dos o más proveedores: de cuál es (`null` en una línea o con un solo proveedor). */
  proveedorId: string | null;
};

export function HojaPrenda({
  destino,
  categoria,
  colores: coloresIniciales,
  responsable,
  onListo,
  onUsarExistente,
  onCerrar,
}: {
  destino: DestinoHoja;
  /** La categoría con sus tallas, tejidos y patrones; `null` si no se pudo leer el catálogo. */
  categoria: CategoriaParaRecibir | null;
  colores: ColorAlta[];
  responsable: ControlResponsable;
  onListo: (prenda: PrendaRecepcion) => void;
  /** «Ya existe esa prenda»: la pantalla la busca y la pone en la línea. */
  onUsarExistente: (productoId: string, nombre: string) => Promise<boolean>;
  onCerrar: () => void;
}) {
  const nueva = destino.modo === "nueva";
  const [coloresCreados, setColoresCreados] = useState<ColorAlta[]>([]);
  const colores = useMemo(() => [...coloresIniciales, ...coloresCreados.filter((c) => !coloresIniciales.some((x) => x.codigo === c.codigo))], [coloresIniciales, coloresCreados]);
  const grupos = useMemo(() => agruparPorFamilia(colores, (c) => c.familiaColor), [colores]);

  const ctx: ContextoPrenda = useMemo(
    () => ({
      modo: destino.modo,
      tallas: categoria?.tallas ?? [],
      exigeTejidoPatron: categoria?.exigeTejidoPatron ?? false,
      tejidos: categoria?.tejidos ?? [],
      patrones: categoria?.patrones ?? [],
      existentes: destino.prenda ? new Set(destino.prenda.variantes.map((v) => claveCelda(v.tallaId, v.colorCodigo))) : undefined,
    }),
    [destino.modo, destino.prenda, categoria],
  );
  const [borrador, setBorrador] = useState<BorradorPrenda>(() => borradorDePrenda(ctx, { precioSugerido: destino.precioSugerido, prenda: destino.prenda }));
  const cambiar = (cambios: Partial<BorradorPrenda>) => setBorrador((b) => ({ ...b, ...cambios }));
  // Lo que vino puesto (las tallas de siempre, el precio sugerido) se revisa: hasta que se toca es «sugerido» (ADR-0284 act. h).
  const [tocados, setTocados] = useState<{ tallas?: boolean; precio?: boolean }>({});

  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** El nombre ya existe (o se escribe casi igual) en la marca: se ofrece usar esa prenda, o crear la nueva igual (si es casi igual). */
  const [parecida, setParecida] = useState<{ tipo: "nombre_duplicado" | "nombre_casi_igual"; productoId: string | null; mensaje: string } | null>(null);
  const [token] = useState(() => crypto.randomUUID());
  const enVuelo = useRef(false);
  const avisoError = useRef<HTMLDivElement>(null);

  const campos = [
    ...camposDePrenda(borrador, ctx, tocados),
    ...(responsable.listo ? [] : [{ id: "prenda-responsable", nombre: "Quién la crea", requerido: true, hecho: false, pendiente: responsable.motivo ?? "Elige quién recibe." }]),
  ];
  const guia = useGuiaCampos(campos);
  const nuevas = combinacionesDeLaHoja(borrador, ctx).length;
  const queSeCrea = textoDeLoQueSeCrea(borrador, ctx, (codigo) => colores.find((c) => c.codigo === codigo)?.nombre ?? codigo);

  useEffect(() => {
    if (error) avisoError.current?.focus();
  }, [error]);

  async function crear(confirmoDistinto: boolean) {
    if (guardando || enVuelo.current) return;
    if (!guia.puedeConfirmar) {
      const ahora = guia.ahora ?? guia.faltan[0]?.id;
      if (ahora) guia.ir(ahora);
      return;
    }
    enVuelo.current = true;
    try {
      setGuardando(true);
      setError(null);
      setParecida(null);
      const args = argsPrepararPrenda(borrador, ctx, {
        despachoId: destino.despachoId,
        despachoItemId: destino.despachoItemId,
        categoriaId: destino.categoriaId,
        marcaId: destino.marcaId,
        productoId: destino.prenda?.productoId ?? null,
        confirmoDistinto,
        token,
        proveedorId: destino.proveedorId,
      });
      const { prenda, error: falla } = await prepararPrendaAlRecibir(args, responsable.firma(), destino.prenda);
      // Como el alta al vuelo de un conteo: crear la prenda es un paso de la recepción, así que el éxito no vacía el combo (se recibe
      // enseguida con la misma persona); un rechazo por el responsable sí.
      if (falla) responsable.despues(falla);
      setGuardando(false);
      if (falla) {
        const alta = leerErrorAlta(falla);
        if (alta.tipo === "nombre_duplicado" || alta.tipo === "nombre_casi_igual") {
          setParecida({ tipo: alta.tipo, productoId: alta.existenteId, mensaje: alta.mensaje });
          return;
        }
        setError(esFalloDeRed(falla) ? AVISO_DE_CORTE_PRENDA : (mensajeDeLaRecepcion(falla) ?? traducirError(falla, nueva ? "crear la prenda" : "sumar las tallas o colores")));
        return;
      }
      if (!prenda || prenda.variantes.length === 0) {
        setError("La base respondió, pero no pudimos leer la prenda. Cierra esta hoja y búscala en «Ya la tengo».");
        return;
      }
      avisar.exito(nueva ? `${prenda.nombre} creada` : `${prenda.nombre}: tallas o colores sumados`, {
        // Creada por quien no edita el catálogo, nace pendiente (ADR-0371): se recibe igual y un líder la revisa después.
        detalle: prenda.estadoAlta === "pendiente" ? "Ya puedes contarla. Un líder la revisa después en Productos." : "Ya puedes contarla.",
      });
      onListo(prenda);
    } finally {
      enVuelo.current = false;
    }
  }

  async function usarExistente() {
    if (!parecida?.productoId) return;
    const nombre = parecida.mensaje.match(/«([^»]+)»|"([^"]+)"/)?.slice(1).find(Boolean) ?? borrador.nombre;
    const ok = await onUsarExistente(parecida.productoId, nombre);
    if (!ok) setError(`No la encontramos entre las prendas de ${categoria?.nombre ?? "esta categoría"} · ${destino.marcaNombre}. Ciérrala y búscala en «Ya la tengo».`);
  }

  const sugerenciaNombre = sugerirNombre({ familia: categoria?.familia, prefijo: categoria?.prefijo });
  const sugerenciaDescripcion = sugerirDescripcion({ familia: categoria?.familia, prefijo: categoria?.prefijo });
  const nombreDeLaOrden = destino.descripcionOrden?.trim() ?? "";
  const titulo = nueva ? "Crear la prenda que llegó" : `Sumar tallas o colores a ${destino.prenda?.nombre ?? "la prenda"}`;
  const subtitulo = nueva
    ? `${categoria?.nombre ?? "Categoría"} · ${destino.marcaNombre}. Se crea en el catálogo${destino.costoUnitario != null ? ` con el costo de esta línea (S/ ${costoComoTexto(destino.costoUnitario)})` : ""} y queda lista para contar.`
    : "Elige las tallas y los colores que llegaron: se crean las combinaciones que la prenda todavía no tiene.";

  return (
    <Modal titulo={titulo} subtitulo={subtitulo} ancho="max-w-xl" bloqueado={guardando} onClose={onCerrar}>
      {(cerrar) => (
        <form
          data-guia="recepcion.hoja-prenda"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void crear(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") e.preventDefault();
          }}
          className="space-y-4"
        >
          {!categoria && (
            <Aviso tono="atencion" titulo="No se pudieron leer las tallas y los colores">
              Cierra esta hoja y vuelve a intentarlo en un momento. Mientras tanto, puedes buscar la prenda en «Ya la tengo».
            </Aviso>
          )}

          {nueva && (
            <CampoGuiado id="prenda-nombre" guia={guia}>
              <CampoTexto
                etiqueta={guia.etiqueta("prenda-nombre", "Nombre de la prenda")}
                value={borrador.nombre}
                onChange={(e) => cambiar({ nombre: e.target.value })}
                placeholder={sugerenciaNombre.texto}
                maxLength={TOPES_PRENDA.nombre}
                autoFocus
              />
              {nombreDeLaOrden && borrador.nombre.trim() === "" && (
                <p className="-mt-1 text-xs text-taupe">
                  En la orden dice «{nombreDeLaOrden}».{" "}
                  <button type="button" onClick={() => cambiar({ nombre: nombreDeLaOrden.slice(0, TOPES_PRENDA.nombre) })} className="btn-cayla btn-enlace text-xs">
                    Usar ese nombre
                  </button>
                </p>
              )}
            </CampoGuiado>
          )}

          {categoria && categoria.tallas.length > 0 ? (
            <CampoGuiado id="prenda-tallas" guia={guia} retiene="fila" titulo="Tallas" ayuda={nueva ? "las que llegaron" : "las que tiene y las que llegaron"}>
              <div className="flex flex-wrap gap-1.5">
                {categoria.tallas.map((t) => (
                  <ChipOpcion
                    key={t.id}
                    elegido={borrador.tallaIds.includes(t.id)}
                    onClick={() => {
                      setTocados((x) => ({ ...x, tallas: true }));
                      cambiar({ tallaIds: borrador.tallaIds.includes(t.id) ? borrador.tallaIds.filter((x) => x !== t.id) : [...borrador.tallaIds, t.id] });
                    }}
                    className="tabular-nums"
                  >
                    {t.valor}
                  </ChipOpcion>
                ))}
              </div>
            </CampoGuiado>
          ) : (
            categoria && <p className="text-xs text-taupe">{categoria.nombre} no tiene tallas: la prenda va en talla única.</p>
          )}

          <CampoGuiado id="prenda-colores" guia={guia} retiene="fila" titulo="Colores" ayuda={borrador.colorCodigos.length > 0 ? `${borrador.colorCodigos.length} elegido${borrador.colorCodigos.length === 1 ? "" : "s"}` : "si no tiene color, déjalo vacío"}>
            <ElegirColores
              colores={colores}
              grupos={grupos}
              elegidos={borrador.colorCodigos}
              onAlternar={(codigo) => cambiar({ colorCodigos: borrador.colorCodigos.includes(codigo) ? borrador.colorCodigos.filter((c) => c !== codigo) : [...borrador.colorCodigos, codigo] })}
              onCreado={(color) => {
                setColoresCreados((cs) => (cs.some((c) => c.codigo === color.codigo) ? cs : [...cs, color]));
                setBorrador((b) => (b.colorCodigos.includes(color.codigo) ? b : { ...b, colorCodigos: [...b.colorCodigos, color.codigo] }));
              }}
              cartaAbierta={false}
            />
          </CampoGuiado>

          {nueva && (
            <CampoGuiado id="prenda-precio" guia={guia}>
              <CampoMonto
                etiqueta={guia.etiqueta("prenda-precio", "Precio de venta")}
                pie={destino.precioSugerido != null && destino.precioSugerido > 0 ? "Lo sugirió quien hizo la compra. Corrígelo si hace falta." : "El precio al que se va a vender en la tienda."}
                inputMode="decimal"
                placeholder="0.00"
                value={borrador.precio}
                onChange={(e) => {
                  setTocados((x) => ({ ...x, precio: true }));
                  cambiar({ precio: e.target.value });
                }}
              />
            </CampoGuiado>
          )}

          {nueva && ctx.exigeTejidoPatron && (
            <div className="grid gap-3 sm:grid-cols-2">
              <CampoGuiado id="prenda-tejido" guia={guia} titulo="Tejido">
                <CampoSelect
                  caja
                  etiqueta="Tejido"
                  marcador={ctx.tejidos.length === 0 ? "Sin tejidos habilitados" : "Elige el tejido"}
                  valor={borrador.tejidoId}
                  onValor={(tejidoId) => cambiar({ tejidoId })}
                  opciones={ctx.tejidos.map((t) => ({ valor: t.id, texto: t.texto }))}
                  deshabilitado={ctx.tejidos.length === 0}
                />
              </CampoGuiado>
              <CampoGuiado id="prenda-patron" guia={guia} titulo="Patrón">
                <CampoSelect
                  caja
                  etiqueta="Patrón"
                  marcador={ctx.patrones.length === 0 ? "Sin patrones habilitados" : "Elige el patrón"}
                  valor={borrador.patronId}
                  onValor={(patronId) => cambiar({ patronId })}
                  opciones={ctx.patrones.map((p) => ({ valor: p.id, texto: p.texto }))}
                  deshabilitado={ctx.patrones.length === 0}
                />
              </CampoGuiado>
            </div>
          )}

          {nueva && (
            <CampoGuiado id="prenda-descripcion" guia={guia}>
              <CampoTexto
                etiqueta={guia.etiqueta("prenda-descripcion", "Descripción (opcional)")}
                value={borrador.descripcion}
                onChange={(e) => cambiar({ descripcion: e.target.value })}
                placeholder={sugerenciaDescripcion.texto}
                maxLength={TOPES_PRENDA.descripcion}
              />
            </CampoGuiado>
          )}

          {!nueva && (
            <CampoGuiado id="prenda-nuevas" guia={guia}>
              <p className="text-[13px] text-tinta">{queSeCrea ?? "Elige una talla o un color que la prenda todavía no tenga."}</p>
            </CampoGuiado>
          )}
          {nueva && queSeCrea && <p className="nota-cayla">{queSeCrea} Fotos, etiquetas y lo demás se completan después en Productos.</p>}

          {!responsable.listo && (
            <CampoGuiado id="prenda-responsable" guia={guia} titulo="Quién recibe">
              <ComboResponsable control={responsable} deshabilitado={guardando} />
            </CampoGuiado>
          )}

          {parecida && (
            <Aviso
              tono="atencion"
              titulo={parecida.tipo === "nombre_duplicado" ? "Esa prenda ya existe en esta marca" : "Hay una prenda que se escribe casi igual"}
              accion={
                <span className="flex flex-wrap gap-2">
                  {parecida.productoId && (
                    <Boton type="button" onClick={() => void usarExistente()}>
                      Usar esa prenda
                    </Boton>
                  )}
                  {parecida.tipo === "nombre_casi_igual" && (
                    <Boton type="button" peso="discreto" onClick={() => void crear(true)}>
                      Es otra: crearla igual
                    </Boton>
                  )}
                </span>
              }
            >
              {parecida.mensaje}
            </Aviso>
          )}
          {error && (
            <Aviso ref={avisoError} enfocable tono="error" titulo={nueva ? "No se pudo crear la prenda" : "No se pudieron sumar las tallas o colores"}>
              {error}
            </Aviso>
          )}

          <PieGuia guia={guia} listo={nueva ? "Todo listo para crear la prenda." : "Todo listo para sumarlas."} />
          <div className="flex flex-col-reverse gap-2.5 pt-1 sm:flex-row sm:justify-end">
            <Boton type="button" onClick={cerrar} disabled={guardando}>
              Cancelar
            </Boton>
            <Boton type="submit" peso="primario" cargando={guardando} title={guia.frase ?? undefined} className={guia.claseConfirmar}>
              {guardando ? (nueva ? "Creando…" : "Sumando…") : nueva ? "Crear y contar" : nuevas > 0 ? `Sumar ${nuevas} y contar` : "Sumar y contar"}
            </Boton>
          </div>
        </form>
      )}
    </Modal>
  );
}
