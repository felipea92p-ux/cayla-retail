"use client";

import { useEffect, useMemo, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { Aviso } from "@/components/ui/Aviso";
import { avisar } from "@/components/ui/Avisos";
import { Boton, BotonEnlace, CampoTexto } from "@/components/ui/campos";
import { AvisoCostoAtipico } from "@/components/AvisoCostoAtipico";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { ConMarca } from "@/components/ficha-producto/TiraFicha";
import { esFalloDeRed, esVersionCambiada, traducirError } from "@/lib/error-escritura";
import type { EstadoCampo } from "@/lib/guia-campos";
import type { ControlResponsable } from "@/lib/useResponsable";
import { buscarPrendasParaRecibir, recibirDespacho } from "@/lib/recepcion-envio-acciones";
import {
  AVISO_DE_CORTE_RECEPCION,
  argsRecibirDespacho,
  atipicosPorLinea,
  buenasPorVariante,
  camposDeRecepcion,
  confirmadasDe,
  conPrenda,
  conVariantesNuevas,
  detalleRecibido,
  extraVacio,
  idGuia,
  leerCostoAtipicoRecepcion,
  lineaDecidida,
  lineaDelBorrador,
  nombreDeVariante,
  primerProblema,
  proveedoresDelEnvio,
  sugiereRecargarRecepcion,
  textoBotonRecibir,
  tituloRecibido,
  totalesDeRecepcion,
  TOPES_RECEPCION,
  mensajeDeLaRecepcion,
  costoDeReposicion,
  opcionesSobrante,
  proveedorDelExtra,
  reposicionesDe,
  SIN_CONFIRMAR,
  type BorradorExtra,
  type BorradorLinea,
  type BorradorRecepcion,
  type CatalogoParaRecibir,
  type Confirmadas,
  type ContextoRecepcion,
  type CostoAtipicoRecepcion,
  type DetalleEnvio,
  type PrendaRecepcion,
  type ResultadoRecepcion,
} from "@/lib/recepcion-envio-reglas";
import { HojaPrenda, type DestinoHoja } from "./HojaPrenda";
import { BotonAgregarExtra, TarjetaExtra, TarjetaLinea } from "./TarjetasRecepcion";

// El formulario de la recepción de un envío abierto (ADR-0362, fase 4). Por cada línea: qué prenda es (nueva o una que ya existe), cuántas
// llegaron talla por talla y color por color, el costo (decisión 18), las dañadas (23 y 27) y, si hace falta, qué pasó con lo que faltó (14) o
// qué pasa con lo de más (15). Debajo, lo que no estaba en la guía (13). Al pie, la nota, quién recibe y «Recibir N prendas»
// (`recibir_despacho`). Las reglas viven en la base; aquí se espejan (`lib/recepcion-envio-reglas.ts`) para decirlas antes de pulsar, con la
// guía de foco (ADR-0284): cada cosa por decidir se enciende cuando es la que sigue y «Falta: …» sobre el botón lleva a cada una.
//
// El borrador es del componente de arriba (`RecibirEnvio`): así no se pierde si cambia la sede de la cabecera a mitad del conteo. Un doble
// clic no recibe dos veces (candado con una ref, y el token: la base devuelve la misma recepción si el pedido se repite igual, también tras un
// corte de señal). Un costo fuera de lo normal se confirma con el aviso de siempre (`AvisoCostoAtipico`) y se reintenta con `confirma_costo`.

type Objetivo = { tipo: "linea"; id: string } | { tipo: "extra"; clave: string };

export function FormularioRecepcion({
  detalle,
  version,
  catalogo,
  sede,
  responsable,
  borrador,
  setBorrador,
  token,
  onRecibido,
}: {
  detalle: DetalleEnvio;
  /** La versión del envío abierto: la base rechaza la recepción si otra persona lo cambió. */
  version: number;
  catalogo: CatalogoParaRecibir | null;
  sede: string;
  responsable: ControlResponsable;
  borrador: BorradorRecepcion;
  setBorrador: Dispatch<SetStateAction<BorradorRecepcion>>;
  token: string;
  onRecibido: (resultado: ResultadoRecepcion | null, buenas: { varianteId: string; cantidad: number }[]) => void;
}) {
  const [hoja, setHoja] = useState<{ destino: DestinoHoja; objetivo: Objetivo } | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<{ texto: string; recargar: boolean } | null>(null);
  const [atipicos, setAtipicos] = useState<CostoAtipicoRecepcion[] | null>(null);
  const enVuelo = useRef(false);
  // La clave de lo que no estaba en la guía sigue a la mayor que ya existe: el borrador sobrevive a un cambio de sede (este formulario se
  // vuelve a montar) y, contando solo cuántos hay, un extra nuevo podía repetir la clave de otro.
  const contadorExtras = useRef(Math.max(0, ...borrador.extras.map((e) => Number(e.clave.replace(/\D/g, "")) || 0)));
  const avisoError = useRef<HTMLDivElement>(null);

  const proveedores = useMemo(() => proveedoresDelEnvio(detalle), [detalle]);
  const ctx: ContextoRecepcion = useMemo(
    () => ({
      lineas: detalle.lineas,
      proveedores,
      categoriasActivas: catalogo ? new Set(catalogo.categorias.map((c) => c.id)) : null,
      marcasActivas: catalogo ? new Set(catalogo.marcas.map((m) => m.id)) : null,
      // Fase 5a: lo que cada proveedor del envío debe por reponer (para ofrecer «Es la reposición de lo que faltó»).
      deudas: detalle.deudas,
      nombres: catalogo,
    }),
    [detalle.lineas, detalle.deudas, proveedores, catalogo],
  );
  const campos = camposDeRecepcion(borrador, ctx, { listo: responsable.listo, motivo: responsable.motivo });
  // Cuántas cubre cada reposición elegida y si la base la aceptaría (la pregunta lo dice en su lugar; la guía, en «Falta»).
  const reposiciones = reposicionesDe(borrador, ctx);
  const guia = useGuiaCampos(campos, { enModal: false });
  const totales = totalesDeRecepcion(detalle, borrador);
  const colores = catalogo?.colores ?? [];

  // Lo que llegó listo no se marca con ✓ (regla 4 de la guía): el costo viene puesto en cada línea, y diez tildes no dicen nada. Si se deja
  // pendiente (se borra, se escribe mal), vuelve a llevar su marca.
  const [completosAlAbrir] = useState(() => new Set(campos.filter((c) => c.hecho).map((c) => c.id)));
  const estadoVisible = (id: string): EstadoCampo | null => {
    const estado = guia.estado(id);
    return estado === "hecho" && completosAlAbrir.has(id) ? null : estado;
  };
  const etiqueta = (id: string, texto: ReactNode) => <ConMarca estado={estadoVisible(id)}>{texto}</ConMarca>;

  useEffect(() => {
    if (error) avisoError.current?.focus();
  }, [error]);

  /** Todo cambio del borrador borra la pregunta del costo atípico: lo que se vio ya no es lo que se va a recibir. */
  function cambiar(fn: (b: BorradorRecepcion) => BorradorRecepcion) {
    setAtipicos(null);
    setBorrador(fn);
  }
  const cambiarLinea = (id: string, cambios: Partial<BorradorLinea>) =>
    cambiar((b) => {
      const l = detalle.lineas.find((x) => x.id === id);
      if (!l) return b;
      return { ...b, lineas: { ...b.lineas, [id]: { ...lineaDelBorrador(b, l), ...cambios } } };
    });
  const cambiarExtra = (clave: string, cambios: Partial<BorradorExtra>) => cambiar((b) => ({ ...b, extras: b.extras.map((e) => (e.clave === clave ? { ...e, ...cambios } : e)) }));

  function agregarExtra() {
    contadorExtras.current += 1;
    const clave = `x${contadorExtras.current}`;
    cambiar((b) => ({ ...b, extras: [...b.extras, extraVacio(clave, proveedores.length === 1 ? proveedores[0]!.id : "")] }));
    requestAnimationFrame(() => guia.ir(proveedores.length >= 2 ? idGuia.extra(clave, "proveedor") : idGuia.extra(clave, "categoria")));
  }

  function abrirHoja(objetivo: Objetivo, modo: "nueva" | "agregar") {
    if (objetivo.tipo === "linea") {
      const l = detalle.lineas.find((x) => x.id === objetivo.id);
      if (!l) return;
      const bl = lineaDelBorrador(borrador, l);
      setHoja({
        objetivo,
        destino: {
          modo,
          despachoId: detalle.id,
          despachoItemId: l.id,
          categoriaId: l.categoria.id,
          marcaId: l.marca.id,
          marcaNombre: l.marca.nombre,
          descripcionOrden: l.descripcion,
          precioSugerido: l.precioVentaSugerido,
          costoUnitario: l.costoUnitario,
          prenda: modo === "agregar" ? bl.prenda : null,
          proveedorId: null,
        },
      });
      return;
    }
    const e = borrador.extras.find((x) => x.clave === objetivo.clave);
    if (!e) return;
    setHoja({
      objetivo,
      destino: {
        modo,
        despachoId: detalle.id,
        despachoItemId: null,
        categoriaId: e.categoriaId,
        marcaId: e.marcaId,
        marcaNombre: catalogo?.marcas.find((m) => m.id === e.marcaId)?.nombre ?? "",
        descripcionOrden: null,
        precioSugerido: null,
        costoUnitario: null,
        prenda: modo === "agregar" ? e.prenda : null,
        proveedorId: proveedores.length >= 2 ? e.proveedorId || null : null,
      },
    });
  }

  /** La prenda que la hoja creó o amplió entra a su línea: nueva, se cuenta de cero; ampliada, lo contado se queda. */
  function ponerPrenda(objetivo: Objetivo, prenda: PrendaRecepcion, ampliada: boolean) {
    if (objetivo.tipo === "linea") {
      cambiar((b) => {
        const l = detalle.lineas.find((x) => x.id === objetivo.id);
        if (!l) return b;
        const bl = lineaDelBorrador(b, l);
        return { ...b, lineas: { ...b.lineas, [l.id]: ampliada ? conVariantesNuevas(bl, prenda) : { ...conPrenda(bl, prenda), noLlego: false } } };
      });
      requestAnimationFrame(() => guia.ir(idGuia.conteo(objetivo.id)));
    } else {
      cambiar((b) => ({ ...b, extras: b.extras.map((e) => (e.clave === objetivo.clave ? (ampliada ? conVariantesNuevas(e, prenda) : conPrenda(e, prenda)) : e)) }));
      requestAnimationFrame(() => guia.ir(idGuia.extra(objetivo.clave, "conteo")));
    }
  }

  /** «Esa prenda ya existe»: se busca entre las de la categoría y marca, y se pone en la línea. */
  async function usarExistente(objetivo: Objetivo, destino: DestinoHoja, productoId: string, nombre: string): Promise<boolean> {
    const { prendas, error: falla } = await buscarPrendasParaRecibir(destino.categoriaId, destino.marcaId, nombre);
    const hallada = falla ? undefined : prendas.find((p) => p.productoId === productoId);
    if (!hallada) return false;
    setHoja(null);
    ponerPrenda(objetivo, hallada, false);
    return true;
  }

  /** El nombre de una LÍNEA para el aviso de costo atípico agrupado: su prenda («Chompa Aurora») o, fuera de la guía, «lo que no estaba en la
   *  guía (Polos · CAYLA)». */
  function nombrarLinea(c: CostoAtipicoRecepcion): string | null {
    if (c.despachoItemId) {
      const l = detalle.lineas.find((x) => x.id === c.despachoItemId);
      return l ? (lineaDelBorrador(borrador, l).prenda?.nombre ?? [l.categoria.nombre, l.marca.nombre].join(" · ")) : null;
    }
    const e = c.extra != null ? borrador.extras[c.extra - 1] : borrador.extras.find((x) => x.prenda?.variantes.some((v) => v.id === c.varianteId));
    return e?.prenda ? `${e.prenda.nombre} (no estaba en la guía)` : null;
  }

  /** El nombre de una prenda para el aviso de costo atípico: «Chompa Aurora · Negro en M». */
  function nombrar(despachoItemId: string | null, varianteId: string | null): string | null {
    const prendas = [
      ...detalle.lineas.map((l) => lineaDelBorrador(borrador, l).prenda),
      ...borrador.extras.map((e) => e.prenda),
    ].filter((p): p is PrendaRecepcion => p !== null);
    for (const p of prendas) {
      const v = p.variantes.find((x) => x.id === varianteId);
      if (v) return `${p.nombre} · ${nombreDeVariante(v)}`;
    }
    const l = despachoItemId ? detalle.lineas.find((x) => x.id === despachoItemId) : null;
    return l ? (lineaDelBorrador(borrador, l).prenda?.nombre ?? [l.categoria.nombre, l.marca.nombre].join(" · ")) : null;
  }

  async function recibir(confirmadas: Confirmadas = SIN_CONFIRMAR) {
    // Dos clics en el MISMO instante: `guardando` es estado de React y se aplica después del clic. El candado es el de la casa: una ref.
    if (guardando || enVuelo.current) return;
    if (!guia.puedeConfirmar) {
      const ahora = guia.ahora ?? guia.faltan[0]?.id;
      if (ahora) guia.ir(ahora);
      return;
    }
    // La red de seguridad: lo mismo que la guía, dicho de una vez (la base vuelve a exigir todo).
    const problema = primerProblema(borrador, ctx);
    if (problema) {
      setError({ texto: problema, recargar: false });
      return;
    }
    enVuelo.current = true;
    try {
      setError(null);
      setGuardando(true);
      const { resultado, error: falla } = await recibirDespacho(argsRecibirDespacho(detalle, borrador, ctx, { version, token, confirmadas }), responsable.firma());
      responsable.despues(falla);
      if (falla) {
        setGuardando(false);
        const marcadas = leerCostoAtipicoRecepcion(falla, nombrar);
        if (marcadas) {
          setAtipicos(marcadas);
          return;
        }
        // Se cortó la señal: la recepción pudo llegar a la base y perderse solo la respuesta. Reintentar sin cambiar nada es seguro (el mismo
        // token con los mismos datos devuelve la misma recepción); decir «no se guardó nada» invitaba a corregir algo creyendo que no existía.
        if (esFalloDeRed(falla)) setError({ texto: AVISO_DE_CORTE_RECEPCION, recargar: false });
        // Los avisos de esta fase vienen en palabras de tienda (también la decisión 17: quien firma hizo una de las órdenes).
        else
          setError({
            texto: mensajeDeLaRecepcion(falla) ?? traducirError(falla, "recibir el envío"),
            recargar: esVersionCambiada(falla) || sugiereRecargarRecepcion(falla.message),
          });
        return;
      }
      setAtipicos(null);
      if (resultado) avisar.exito(tituloRecibido(resultado), { detalle: detalleRecibido(resultado), duracion: 9000 });
      else avisar.aviso("La recepción se guardó, pero no pudimos leer la respuesta", { detalle: "Recarga la pantalla para ver cómo se cerró.", duracion: 12000 });
      onRecibido(resultado, buenasPorVariante(detalle, borrador));
    } finally {
      enVuelo.current = false;
    }
  }

  function corregirCostos() {
    const primero = atipicos?.[0];
    setAtipicos(null);
    if (!primero) return;
    if (primero.despachoItemId) {
      guia.ir(idGuia.costo(primero.despachoItemId));
      return;
    }
    const extra = borrador.extras.find((e) => e.prenda?.variantes.some((v) => v.id === primero.varianteId));
    if (extra) guia.ir(idGuia.extra(extra.clave, "costo"));
  }

  const variosProveedores = proveedores.length >= 2;

  return (
    <>
      {/* Recibir mete stock y mueve el costo: Enter dentro de una caja no recibe; se recibe con el botón. */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void recibir();
        }}
        noValidate
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") e.preventDefault();
        }}
        className="space-y-5"
      >
        {!catalogo && (
          <Aviso tono="atencion" titulo="No se pudieron leer las tallas y los colores">
            Puedes recibir las prendas que ya existen («Ya la tengo»). Para crear una nueva, vuelve a cargar la pantalla en un momento.
          </Aviso>
        )}

        {detalle.lineas.map((l, i) => (
          <TarjetaLinea
            key={l.id}
            linea={l}
            indice={i}
            borrador={lineaDelBorrador(borrador, l)}
            conProveedor={variosProveedores}
            opcionesDeMas={opcionesSobrante(ctx, { proveedorId: l.proveedor?.id ?? null, categoriaId: l.categoria.id, marcaId: l.marca.id, categoria: l.categoria.nombre, marca: l.marca.nombre })}
            problemaDeMas={reposiciones.get(idGuia.sobrante(l.id))?.problema ?? null}
            onCambio={(cambios) => cambiarLinea(l.id, cambios)}
            guia={guia}
            etiqueta={etiqueta}
            colores={colores}
            onAbrirHoja={(modo) => abrirHoja({ tipo: "linea", id: l.id }, modo)}
          />
        ))}

        <section data-guia="recepcion.extras" className="space-y-4" aria-label="Lo que no estaba en la guía">
          {borrador.extras.map((e, i) => (
            <TarjetaExtra
              key={e.clave}
              extra={e}
              indice={i}
              proveedores={proveedores}
              categorias={catalogo?.categorias ?? []}
              marcas={catalogo?.marcas ?? []}
              vinculos={catalogo?.vinculos ?? []}
              opcionesDeMas={opcionesSobrante(ctx, {
                proveedorId: proveedorDelExtra(e, ctx),
                categoriaId: e.categoriaId,
                marcaId: e.marcaId,
                categoria: catalogo?.categorias.find((c) => c.id === e.categoriaId)?.nombre,
                marca: catalogo?.marcas.find((m) => m.id === e.marcaId)?.nombre,
              })}
              problemaDeMas={reposiciones.get(idGuia.extra(e.clave, "sobrante"))?.problema ?? null}
              costoReposicion={costoDeReposicion(ctx, { proveedorId: proveedorDelExtra(e, ctx), categoriaId: e.categoriaId, marcaId: e.marcaId })}
              onCambio={(cambios) => cambiarExtra(e.clave, cambios)}
              onQuitar={() => cambiar((b) => ({ ...b, extras: b.extras.filter((x) => x.clave !== e.clave) }))}
              guia={guia}
              etiqueta={etiqueta}
              colores={colores}
              onAbrirHoja={(modo) => abrirHoja({ tipo: "extra", clave: e.clave }, modo)}
            />
          ))}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <BotonAgregarExtra onAgregar={agregarExtra} deshabilitado={!catalogo} />
            <p className="text-xs text-taupe">¿Llegó algo que no está en ninguna línea? Agrégalo con su categoría y su marca.</p>
          </div>
        </section>

        <section data-guia="recepcion.pie" className="space-y-3 border-t border-sand pt-5" aria-label="Recibir">
          <CampoGuiado id="nota" guia={guia} className="max-w-2xl">
            <p className="mb-1.5 flex items-center gap-x-2 text-[13px] font-semibold text-tinta">
              {etiqueta("nota", "Nota")}
              <span className="text-[12px] font-normal text-taupe">opcional</span>
            </p>
            <CampoTexto id="recepcion-nota" caja etiqueta="Nota de la recepción" maxLength={TOPES_RECEPCION.nota} value={borrador.nota} onChange={(e) => cambiar((b) => ({ ...b, nota: e.target.value }))} />
          </CampoGuiado>
          <CampoGuiado id="responsable" guia={guia} titulo="Quién recibe" className="max-w-sm">
            <ComboResponsable control={responsable} deshabilitado={guardando} />
          </CampoGuiado>
          <PieGuia guia={guia} listo={`Todo listo para recibir en ${sede}.`} />
          {error && (
            <Aviso ref={avisoError} enfocable tono="error" titulo="No se pudo recibir el envío" accion={error.recargar ? <Boton type="button" onClick={() => window.location.reload()}>Recargar</Boton> : undefined}>
              {error.texto}
            </Aviso>
          )}
          {atipicos && (
            <AvisoCostoAtipico
              costos={atipicosPorLinea(atipicos, nombrarLinea)}
              pie="Revisa el costo por unidad de esas líneas. Si es el correcto, confírmalo: entra al costo de esas prendas en todas las sedes."
              textoCorregir="Corregir el costo"
              textoConfirmar="Sí, es correcto: recibir"
              textoCargando="Recibiendo…"
              cargando={guardando}
              listo={responsable.listo}
              motivoNoListo={responsable.motivo}
              onCorregir={corregirCostos}
              onConfirmar={() => void recibir(confirmadasDe(atipicos, borrador))}
            />
          )}
        </section>

        {/* El botón principal: fijo abajo en el celular (la recepción es larga), en su lugar en pantallas grandes. */}
        {!atipicos && (
          <div
            data-guia="recepcion.recibir"
            className="sticky bottom-0 z-20 -mx-4 flex flex-wrap items-center justify-end gap-2.5 border-t border-sand bg-crema px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] pt-3 sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0"
          >
            <span className="mr-auto text-[13px] tabular-nums text-taupe" aria-live="polite">
              {totales.contado.toLocaleString("es-PE")} de {totales.enviado.toLocaleString("es-PE")} contadas
            </span>
            {/* En el celular la vuelta es la flecha de arriba: la barra fija deja lugar al botón principal. */}
            <BotonEnlace href="/recibir" className="max-sm:hidden">
              Cancelar
            </BotonEnlace>
            <Boton type="submit" peso="primario" cargando={guardando} title={guia.frase ?? undefined} className={guia.claseConfirmar}>
              {guardando ? "Recibiendo…" : textoBotonRecibir(totales.contado, detalle.lineas.every((l) => lineaDecidida(lineaDelBorrador(borrador, l))))}
            </Boton>
          </div>
        )}
      </form>

      {/* La hoja va FUERA del <form>: un submit que sube desde un modal llegaría al onSubmit de la recepción (CLAUDE.md, ADR-0128). */}
      {hoja && (
        <HojaPrenda
          key={`${hoja.destino.modo}-${hoja.objetivo.tipo === "linea" ? hoja.objetivo.id : hoja.objetivo.clave}`}
          destino={hoja.destino}
          categoria={catalogo?.categorias.find((c) => c.id === hoja.destino.categoriaId) ?? null}
          colores={colores}
          responsable={responsable}
          onListo={(prenda) => {
            const { objetivo, destino } = hoja;
            setHoja(null);
            ponerPrenda(objetivo, prenda, destino.modo === "agregar");
          }}
          onUsarExistente={(productoId, nombre) => usarExistente(hoja.objetivo, hoja.destino, productoId, nombre)}
          onCerrar={() => setHoja(null)}
        />
      )}
    </>
  );
}
