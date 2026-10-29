"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Aviso } from "@/components/ui/Aviso";
import { Chip } from "@/components/ui/Chip";
import { Volver } from "@/components/ui/Volver";
import { PasoCantidad } from "@/components/ui/PasoCantidad";
import { MiniaturaPrenda } from "@/components/ui/PrendaCelda";
import { avisar } from "@/components/ui/Avisos";
import { Boton, CampoMonto, CampoSelect, CampoTexto } from "@/components/ui/campos";
import { useSalidaSinGuardar } from "@/components/ui/useSalidaSinGuardar";
import { cargarCompraParaCorregir, corregirCompra } from "@/lib/corregir-compra-acciones";
import {
  borradorDe,
  cambiosDePrenda,
  cambiosParaLaBase,
  cuentaDeLaCorreccion,
  prendaCambio,
  NOMBRE_MAXIMO,
  prendaConProblema,
  problemasDePrenda,
  puedeCambiarDeTienda,
  textoDeCambios,
  textoDeLaPlata,
  textoMotivo,
  type Borrador,
  type CompraParaCorregir,
  type Opcion,
  type PrendaParaCorregir,
} from "@/lib/corregir-compra-reglas";
import { soles } from "@/lib/compras-reglas";
import { esFalloDeRed, traducirError } from "@/lib/error-escritura";
import { leerCantidad } from "@/lib/compra-rapida-reglas";

// «Corregir esta compra» (ADR-0561, maqueta docs/maquetas/mis-compras-corregir-2026-10/, Felipe 2026-10-28): una hoja con las prendas de la compra,
// SOLO para leer; al tocar una se abre su formulario, en la misma hoja, y recién ahí se cambian sus datos (nada aparece editable de todas a la vez).
// Lo que se cambia queda a la vista (ámbar, con su «antes») y el pie dice qué pasa con la plata. Guardar manda solo lo que cambió: la base lo valida
// todo o nada, recalcula el papel y lo pagado, y deja el rastro. Solo mientras Compras no la complete y la ronda siga abierta (la base lo decide).
//
// Con la cuenta de una persona firma ella (Mis compras no se muestra desde una terminal). El identificador nace al abrir la hoja: un doble clic o un
// reintento tras un corte no corrige dos veces.

type Rechazo = { titulo: string; texto: string; tono: "error" | "atencion" };

export function HojaCorregirCompra({ papelId, onClose, volverA }: { papelId: string; onClose: () => void; volverA?: RefObject<HTMLElement | null> }) {
  const router = useRouter();
  const [lote] = useState(() => crypto.randomUUID());
  // `undefined`: leyendo; `null`: no se pudo leer.
  const [compra, setCompra] = useState<CompraParaCorregir | null | undefined>(undefined);
  const [errorDeLectura, setErrorDeLectura] = useState<string | null>(null);
  const [borradores, setBorradores] = useState<Map<string, Borrador>>(new Map());
  const [abierta, setAbierta] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [rechazo, setRechazo] = useState<Rechazo | null>(null);
  const primero = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    let vigente = true;
    void cargarCompraParaCorregir(papelId).then(({ compra: c, error }) => {
      if (!vigente) return;
      if (error) setErrorDeLectura(traducirError(error, "leer la compra", { lectura: true }));
      setCompra(c);
      if (c) setBorradores(new Map(c.prendas.map((p) => [p.id, borradorDe(p)])));
    });
    return () => {
      vigente = false;
    };
  }, [papelId]);

  const cuenta = compra ? cuentaDeLaCorreccion(compra, borradores) : null;
  const hayProblema = compra ? compra.prendas.some((p) => prendaConProblema(p, borradores.get(p.id) ?? borradorDe(p))) : false;
  const conCambios = (cuenta?.datos ?? 0) > 0;
  const salida = useSalidaSinGuardar(conCambios, "Cambiaste datos de esta compra y todavía no se guardaron. Si cierras ahora, se pierden.");

  const prenda = compra && abierta ? (compra.prendas.find((p) => p.id === abierta) ?? null) : null;

  function cambiar(p: PrendaParaCorregir, campo: keyof Borrador, valor: string) {
    setRechazo(null);
    setBorradores((m) => new Map(m).set(p.id, { ...(m.get(p.id) ?? borradorDe(p)), [campo]: valor }));
  }

  async function guardar() {
    if (!compra || guardando || !conCambios || hayProblema) return;
    setRechazo(null);
    setGuardando(true);
    const { error } = await corregirCompra({ p_papel_id: compra.id, p_lote: lote, p_cambios: cambiosParaLaBase(compra.prendas, borradores) });
    setGuardando(false);
    if (error) {
      return setRechazo(
        esFalloDeRed(error)
          ? { titulo: "Se cortó la conexión", texto: "No sabemos si se guardó. Vuelve a tocar el botón: si ya se guardó, no se repite.", tono: "atencion" }
          : { titulo: "No se guardó", texto: traducirError(error, "corregir la compra"), tono: "error" },
      );
    }
    avisar.exito("Corregiste la compra", { detalle: cuenta ? textoDeLaPlata(cuenta.plata) : undefined });
    // La guardia del «atrás» se retira antes de refrescar: los dos a la vez pueden recargar la página entera (useSalidaSinGuardar).
    void salida.retirarYa().then(() => router.refresh());
    onClose();
  }

  return (
    <Modal
      titulo={prenda ? prenda.nombre : "Corregir esta compra"}
      subtitulo={prenda ? "Cambia solo lo que está mal. Lo demás se queda como lo anotaste." : compra ? `Compra a ${compra.proveedor}` : undefined}
      onClose={onClose}
      variante="hoja"
      tamano="mediana"
      alCerrarEnfocar={volverA}
      bloqueado={guardando}
      antesDeCerrar={salida.pedirAccion}
    >
      {(cerrar) => (
        <div className="space-y-4">
          {compra === undefined ? (
            // Mientras llega la lectura: tres filas quietas (sin movimiento en bucle, ADR-0136).
            <div aria-hidden className="space-y-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-16 rounded-[14px] bg-hueso" />
              ))}
            </div>
          ) : compra === null ? (
            <Aviso tono="error" titulo="No se pudo leer la compra">
              {errorDeLectura ?? "Cierra esta hoja y vuelve a abrirla en un momento; si sigue, avísale a tu líder."}
            </Aviso>
          ) : (
            <>
              {!compra.sePuede && (
                <Aviso tono="atencion" titulo="Ya no se puede corregir">
                  {textoMotivo(compra.motivo)}
                </Aviso>
              )}

              {prenda ? (
                <FormularioDePrenda
                  prenda={prenda}
                  categorias={compra.categorias}
                  marcas={compra.marcas}
                  tiendas={compra.tiendas}
                  borrador={borradores.get(prenda.id) ?? borradorDe(prenda)}
                  alCambiar={(campo, valor) => cambiar(prenda, campo, valor)}
                  alDescartar={() => setBorradores((m) => new Map(m).set(prenda.id, borradorDe(prenda)))}
                  alVolver={() => setAbierta(null)}
                  bloqueado={!compra.sePuede || guardando}
                />
              ) : (
                <ul className="flex flex-col gap-2" aria-label="Las prendas de la compra">
                  {compra.prendas.map((p, i) => {
                    const b = borradores.get(p.id) ?? borradorDe(p);
                    const cambio = prendaCambio(p, b);
                    const cantidad = leerCantidad(b.cantidad) ?? p.cantidad;
                    const nombre = !p.esCatalogo && b.nombre.trim() !== "" ? b.nombre.trim() : p.nombre;
                    const categoria = compra.categorias.find((c) => c.id === b.categoriaId)?.nombre ?? p.categoria;
                    const marca = compra.marcas.find((m) => m.id === b.marcaId)?.nombre ?? p.marca;
                    const tienda = compra.tiendas.find((t) => t.id === b.destinoId)?.nombre ?? p.destino;
                    return (
                      <li key={p.id}>
                        <button
                          ref={i === 0 ? primero : undefined}
                          type="button"
                          disabled={!compra.sePuede}
                          onClick={() => setAbierta(p.id)}
                          className={`grid w-full grid-cols-[36px_minmax(0,1fr)_auto_16px] items-center gap-2.5 rounded-[14px] border px-3 py-2.5 text-left transition-colors disabled:cursor-default ${
                            cambio ? "border-ambar bg-ambar/10" : "border-sand bg-papel"
                          } ${compra.sePuede ? "hover:bg-hueso" : ""}`}
                        >
                          <MiniaturaPrenda fotoUrl={null} categoria={categoria} />
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium text-tinta">{nombre}</span>
                            <span className="block truncate text-xs text-taupe">
                              {[categoria, marca, tienda].filter(Boolean).join(" · ")}
                            </span>
                            <span className="block text-xs tabular-nums text-taupe">
                              {cantidad === 1 ? "1 unidad" : `${cantidad} unidades`} · {soles(leerPrecioDe(b, p))} c/u
                            </span>
                          </span>
                          <span className="flex flex-col items-end gap-1">
                            <b className="whitespace-nowrap text-sm font-semibold tabular-nums text-tinta">{soles(cantidad * leerPrecioDe(b, p))}</b>
                            {cambio ? (
                              <Chip tono="ambar">Cambiaste</Chip>
                            ) : (
                              <Chip tono="neutro" versalitas={false}>
                                {p.esCatalogo ? "Del catálogo" : "Algo nuevo"}
                              </Chip>
                            )}
                          </span>
                          {compra.sePuede && <ChevronRight className="h-4 w-4 text-taupe" aria-hidden />}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}

              {rechazo && (
                <Aviso tono={rechazo.tono} titulo={rechazo.titulo}>
                  {rechazo.texto}
                </Aviso>
              )}

              <p className="text-sm text-taupe" aria-live="polite">
                {conCambios && cuenta
                  ? `${textoDeCambios(cuenta.datos)} · ${textoDeLaPlata(cuenta.plata)}`
                  : compra.sePuede
                    ? "Toca una prenda para corregirla."
                    : ""}
              </p>

              <div className="pie-hoja-fijo pie-acciones pt-1">
                <Boton type="button" peso="fantasma" onClick={() => salida.pedirAccion(cerrar)} disabled={guardando}>
                  Cancelar
                </Boton>
                {compra.sePuede && (
                  <Boton
                    type="button"
                    peso="primario"
                    textoCargando="Guardando…"
                    cargando={guardando}
                    disabled={!conCambios || hayProblema}
                    onClick={() => void guardar()}
                  >
                    Guardar los cambios
                  </Boton>
                )}
              </div>
            </>
          )}
          {salida.aviso}
        </div>
      )}
    </Modal>
  );
}

/** El costo que se ve en la tarjeta: lo que va escrito si se entiende; si no, lo guardado. */
function leerPrecioDe(b: Borrador, p: PrendaParaCorregir): number {
  const n = Number(b.costo.replace(",", "."));
  return b.costo.trim() !== "" && Number.isFinite(n) && n >= 0 ? n : p.costo;
}

function FormularioDePrenda({
  prenda,
  categorias,
  marcas,
  tiendas,
  borrador,
  alCambiar,
  alDescartar,
  alVolver,
  bloqueado,
}: {
  prenda: PrendaParaCorregir;
  categorias: readonly Opcion[];
  marcas: readonly Opcion[];
  tiendas: readonly Opcion[];
  borrador: Borrador;
  alCambiar: (campo: keyof Borrador, valor: string) => void;
  alDescartar: () => void;
  alVolver: () => void;
  bloqueado: boolean;
}) {
  const problemas = problemasDePrenda(prenda, borrador);
  const cantidad = leerCantidad(borrador.cantidad);
  const cambio = prendaCambio(prenda, borrador);
  const cambios = cambiosDePrenda(prenda, borrador);
  const antes = (texto: string, cambioEsteDato: boolean) => (cambioEsteDato ? `Antes: ${texto}` : undefined);
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Volver onClick={alVolver} a="las prendas de la compra" />
        <p className="min-w-0 text-sm text-taupe">
          {[prenda.categoria, prenda.marca, prenda.destino].filter(Boolean).join(" · ")}
        </p>
        <Chip tono="neutro" versalitas={false}>
          {prenda.esCatalogo ? "Del catálogo" : "Algo nuevo"}
        </Chip>
      </div>

      {!prenda.esCatalogo && (
        <div className="space-y-3">
          <CampoTexto
            etiqueta="Nombre"
            value={borrador.nombre}
            maxLength={NOMBRE_MAXIMO}
            autoComplete="off"
            disabled={bloqueado}
            onChange={(e) => alCambiar("nombre", e.target.value)}
            tono={problemas.nombre ? "error" : borrador.nombre.trim() !== prenda.nombre ? "aviso" : "neutro"}
            pie={problemas.nombre ?? (borrador.nombre.trim() !== prenda.nombre ? `Antes: ${prenda.nombre}` : undefined)}
          />
          <div className="grid grid-cols-2 gap-3">
            <CampoSelect
              etiqueta="Categoría"
              valor={borrador.categoriaId}
              onValor={(v) => alCambiar("categoriaId", v)}
              opciones={opcionesDe(categorias, prenda.categoriaId, prenda.categoria)}
              deshabilitado={bloqueado}
              tono={problemas.categoria ? "error" : borrador.categoriaId !== prenda.categoriaId ? "aviso" : "neutro"}
              pie={problemas.categoria ?? (borrador.categoriaId !== prenda.categoriaId ? `Antes: ${prenda.categoria}` : undefined)}
            />
            <CampoSelect
              etiqueta="Marca"
              valor={borrador.marcaId}
              onValor={(v) => alCambiar("marcaId", v)}
              opciones={opcionesDe(marcas, prenda.marcaId, prenda.marca)}
              deshabilitado={bloqueado}
              tono={problemas.marca ? "error" : borrador.marcaId !== prenda.marcaId ? "aviso" : "neutro"}
              pie={problemas.marca ?? (borrador.marcaId !== prenda.marcaId ? `Antes: ${prenda.marca}` : undefined)}
            />
          </div>
        </div>
      )}

      {puedeCambiarDeTienda(prenda) ? (
        <CampoSelect
          etiqueta="Tienda a la que va"
          valor={borrador.destinoId}
          onValor={(v) => alCambiar("destinoId", v)}
          opciones={opcionesDe(tiendas, prenda.destinoId ?? "", prenda.destino ?? "")}
          deshabilitado={bloqueado}
          tono={problemas.tienda ? "error" : cambios.destinoId !== undefined ? "aviso" : "neutro"}
          pie={problemas.tienda ?? (cambios.destinoId !== undefined ? `Antes: ${prenda.destino ?? "sin tienda"}` : undefined)}
        />
      ) : prenda.enviadas > 0 ? (
        <p className="nota-cayla">Ya salió algo de esta prenda en un envío: no se cambia de tienda.</p>
      ) : null}

      <div className="space-y-1.5">
        <span className="campo-etiqueta">¿Cuántas unidades?</span>
        <PasoCantidad
          menos={{
            onClick: () => alCambiar("cantidad", String(Math.max(Math.max(1, prenda.enviadas), (cantidad ?? 1) - 1))),
            deshabilitado: bloqueado || (cantidad ?? 0) <= Math.max(1, prenda.enviadas),
            etiqueta: "Una menos",
          }}
          mas={{ onClick: () => alCambiar("cantidad", String(Math.min(99999, (cantidad ?? 0) + 1))), deshabilitado: bloqueado, etiqueta: "Una más" }}
          campo={{
            value: borrador.cantidad,
            inputMode: "numeric",
            autoComplete: "off",
            disabled: bloqueado,
            "aria-label": "¿Cuántas unidades compraste?",
            onChange: (e) => alCambiar("cantidad", e.target.value),
          }}
          tono={problemas.cantidad ? "error" : undefined}
        />
        <p className={`min-h-4 text-xs ${problemas.cantidad ? "text-rojo-profundo" : cambios.cantidad !== undefined ? "text-ambar" : "text-taupe"}`}>
          {problemas.cantidad ??
            antes(`${prenda.cantidad} ${prenda.cantidad === 1 ? "unidad" : "unidades"}`, cantidad !== null && cantidad !== prenda.cantidad) ??
            (prenda.enviadas > 0 ? `Ya salieron ${prenda.enviadas} en un envío: no puede quedar en menos.` : "")}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <CampoMonto
          etiqueta="Costo c/u"
          inputMode="decimal"
          autoComplete="off"
          disabled={bloqueado}
          value={borrador.costo}
          onChange={(e) => alCambiar("costo", e.target.value)}
          tono={problemas.costo ? "error" : cambios.costo !== undefined ? "aviso" : "neutro"}
          pie={problemas.costo ?? antes(soles(prenda.costo), borrador.costo.trim() !== "" && Math.abs(Number(borrador.costo.replace(",", ".")) - prenda.costo) > 0.001)}
        />
        <CampoMonto
          etiqueta="Se vende a"
          inputMode="decimal"
          autoComplete="off"
          disabled={bloqueado}
          value={borrador.venta}
          onChange={(e) => alCambiar("venta", e.target.value)}
          tono={problemas.venta ? "error" : cambios.precioVenta !== undefined ? "aviso" : "neutro"}
          pie={problemas.venta ?? antes(prenda.precioVenta == null ? "sin precio" : soles(prenda.precioVenta), borrador.venta.trim() !== (prenda.precioVenta == null ? "" : prenda.precioVenta.toFixed(2)))}
        />
      </div>

      {prenda.esCatalogo && (
        <p className="nota-cayla">Su nombre, su categoría y su marca son del catálogo: se cambian en Catálogo ▸ Productos.</p>
      )}

      {cambio && !bloqueado && (
        <button type="button" onClick={alDescartar} className="btn-cayla btn-enlace">
          Dejar esta prenda como estaba
        </button>
      )}
    </div>
  );
}

/** Las opciones del combo: las activas y, si la que tiene la prenda ya no está entre ellas (se desactivó), también esa, para que se vea qué tenía. */
function opcionesDe(lista: readonly Opcion[], actualId: string, actualNombre: string): { valor: string; texto: string }[] {
  const opciones = lista.map((o) => ({ valor: o.id, texto: o.nombre }));
  if (actualId && !lista.some((o) => o.id === actualId)) opciones.unshift({ valor: actualId, texto: `${actualNombre} (inactiva)` });
  return opciones;
}
