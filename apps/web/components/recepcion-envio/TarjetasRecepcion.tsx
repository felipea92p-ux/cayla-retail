"use client";

import type { ReactNode } from "react";
import { X } from "lucide-react";
import { Boton, CampoSelect, CampoTexto } from "@/components/ui/campos";
import { ComboBuscable } from "@/components/ui/ComboBuscable";
import { Chip } from "@/components/ui/Chip";
import { Aviso } from "@/components/ui/Aviso";
import { CampoGuiado } from "@/components/guia-de-foco/CampoGuiado";
import type { GuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import type { ColorAlta } from "@/lib/alta-producto";
import { soles } from "@/lib/compras-reglas";
import { opcionesDeMarca } from "@/lib/marca-proveedor-reglas";
import { VALOR_REPOSICION } from "@/lib/nos-debe-reglas";
import {
  CAUSAS_FALTANTE,
  conPrenda,
  contadoDeLinea,
  costoComoTexto,
  diferenciaDe,
  idGuia,
  leerCosto,
  nombreExtraGuia,
  nombreLineaGuia,
  preguntaFaltante,
  preguntaSobrante,
  sumasDe,
  type BorradorExtra,
  type BorradorLinea,
  type CategoriaParaRecibir,
  type CausaFaltante,
  type CausaSobrante,
  type LineaEnvio,
} from "@/lib/recepcion-envio-reglas";
import { BloquePrenda, ElegirOpcion } from "./BloquePrenda";

// Las tarjetas de la recepción (ADR-0362, fase 4). Una por línea del envío: «Chompas · CAYLA · Chompa cuello alto — vienen 20 · OC-000129», el
// costo por unidad (quien recibe lo ve y lo corrige, decisión 18), la prenda y lo que llegó de ella; y debajo, solo si hace falta, qué pasó
// con lo que faltó (decisión 14) o qué pasa con lo que vino de más (decisión 15). Y una por «algo que no estaba en la guía» (decisión 13), que
// además dice su categoría, su marca, su costo y, si el envío trae dos o más proveedores, de cuál es. Todo vive en el borrador de la pantalla.
//
// Fase 5a: lo de más (o lo que no estaba en la guía) puede ser «la reposición de lo que faltó» en una recepción anterior. Esa opción sale
// SOLO si el proveedor debe algo de esa categoría y marca (`opcionesSobrante`, que la pantalla calcula y pasa en `opcionesDeMas`); si se
// elige y pasa de lo que debe, la pregunta lo dice (`problemaDeMas`) y la base lo rechazaría igual.

const TITULO = "mb-1.5 flex flex-wrap items-baseline gap-x-2 text-[13px] font-semibold text-tinta";

type Comunes = {
  guia: GuiaCampos;
  etiqueta: (id: string, texto: ReactNode) => ReactNode;
  colores: readonly ColorAlta[];
  onAbrirHoja: (modo: "nueva" | "agregar") => void;
};

/** El costo por unidad de una línea: viene con el del envío y se corrige ahí mismo. */
function CampoCosto({ id, guia, etiqueta, valor, onValor, original, obligatorio }: { id: string; guia: GuiaCampos; etiqueta: (id: string, texto: ReactNode) => ReactNode; valor: string; onValor: (v: string) => void; original: number | null; obligatorio: boolean }) {
  const { centimos, problema } = leerCosto(valor);
  const corregido = original !== null && centimos !== null && centimos !== Math.round(original * 100);
  const mostrarProblema = problema && (valor.trim() !== "" || original !== null);
  return (
    <CampoGuiado id={id} guia={guia} className="w-full @min-[40rem]:w-48">
      <div data-guia="recepcion.costo">
        <p className={TITULO}>{etiqueta(id, "Costo por unidad")}</p>
        <CampoTexto
          caja
          sinPie={!mostrarProblema && !corregido}
          tono={mostrarProblema ? "error" : corregido ? "aviso" : undefined}
          pie={mostrarProblema ? problema : corregido && original !== null ? `En la guía decía ${soles(original)}` : undefined}
          etiqueta="Costo por unidad, en soles"
          inputMode="decimal"
          placeholder={original !== null ? costoComoTexto(original) : "0.00"}
          value={valor}
          onChange={(e) => onValor(e.target.value)}
        />
        {!obligatorio && !mostrarProblema && !corregido && <p className="mt-1 text-xs text-taupe">El de la guía. Corrígelo si el papel dice otro.</p>}
      </div>
    </CampoGuiado>
  );
}

/** Una opción de «¿qué pasó?» / «¿qué pasa con lo de más?». La de la reposición trae `aviso` (lo que se debe, antes de elegir) y `guia` (su
 *  ancla para la guía interactiva). */
type OpcionDiferencia = { valor: string; texto: string; ayuda: string; aviso?: string; guia?: string };

/** «Faltan 2: ¿qué pasó?» o «Vinieron 2 de más: ¿qué pasa con ellas?», con sus opciones y la frase de la que se eligió. */
function PreguntaDiferencia({
  id,
  guia,
  etiqueta,
  pregunta,
  opciones,
  valor,
  onValor,
  problema = null,
}: {
  id: string;
  guia: GuiaCampos;
  etiqueta: (id: string, texto: ReactNode) => ReactNode;
  pregunta: string;
  opciones: readonly OpcionDiferencia[];
  valor: string | null;
  onValor: (v: string) => void;
  /** Lo que la base rechazaría de la opción elegida (una reposición que pasa de lo que el proveedor debe). */
  problema?: string | null;
}) {
  // Una opción que ya no se ofrece (la reposición, si se cambió la categoría o la marca) no se ve elegida.
  const elegida = opciones.find((o) => o.valor === valor) ?? null;
  const reposicion = opciones.find((o) => o.valor === VALOR_REPOSICION) ?? null;
  // La reposición lleva su ancla para la guía interactiva (ADR-0389).
  const conAncla = opciones.map((o) => (o.valor === VALOR_REPOSICION ? { ...o, guia: "recepcion.reposicion" } : o));
  return (
    <CampoGuiado id={id} guia={guia} retiene="fila" className="anim-revelar rounded-xl border border-sand bg-hueso/50 p-3">
      <div data-guia="recepcion.diferencia">
        <p className={TITULO}>{etiqueta(id, pregunta)}</p>
        <ElegirOpcion etiqueta={pregunta} opciones={conAncla} valor={elegida?.valor ?? null} onValor={onValor} />
        {problema ? (
          <Aviso tono="atencion" chico className="mt-2">
            {problema}
          </Aviso>
        ) : (
          <p className="mt-1.5 text-xs text-taupe">
            {elegida ? elegida.ayuda : (reposicion?.aviso ?? "Elige una: queda anotado para Compras.")}
          </p>
        )}
      </div>
    </CampoGuiado>
  );
}

export function TarjetaLinea({
  linea: l,
  indice,
  borrador: b,
  conProveedor,
  opcionesDeMas,
  problemaDeMas,
  onCambio,
  guia,
  etiqueta,
  colores,
  onAbrirHoja,
}: Comunes & {
  linea: LineaEnvio;
  indice: number;
  borrador: BorradorLinea;
  /** El envío trae dos o más proveedores: cada línea dice el suyo. */
  conProveedor: boolean;
  /** Qué puede pasar con lo de más: las de siempre y, si el proveedor debe esto, la reposición (fase 5a). */
  opcionesDeMas: readonly OpcionDiferencia[];
  /** Lo que la base rechazaría de la reposición elegida. */
  problemaDeMas: string | null;
  onCambio: (cambios: Partial<BorradorLinea>) => void;
}) {
  const s = sumasDe(b, b.prenda);
  const contado = contadoDeLinea(b);
  const dif = b.noLlego || b.prenda ? diferenciaDe(l.enviado, contado) : { tipo: null, cantidad: 0 };
  const prendaTexto = [l.categoria.nombre, l.marca.nombre].join(" · ");

  return (
    <article data-guia="recepcion.linea" aria-label={`${nombreLineaGuia(indice)}: ${prendaTexto}`} className="@container card-cayla space-y-4 p-4 sm:p-5">
      <header className="flex flex-col gap-3 @min-[40rem]:flex-row @min-[40rem]:items-start @min-[40rem]:justify-between">
        <div className="min-w-0">
          <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-taupe-profundo">{nombreLineaGuia(indice)}</p>
          <h2 className="font-display mt-0.5 text-xl leading-tight text-tinta">{prendaTexto}</h2>
          {l.descripcion && <p className="text-sm text-tinta/75">{l.descripcion}</p>}
          <p className="mt-1 text-[13px] tabular-nums text-taupe">
            Vienen <span className="font-semibold text-tinta">{l.enviado.toLocaleString("es-PE")}</span>
            {l.orden.numero ? ` · ${l.orden.numero}` : ""}
            {conProveedor && l.proveedor ? ` · ${l.proveedor.nombre}` : ""}
          </p>
        </div>
        {!b.noLlego && (
          <CampoCosto id={idGuia.costo(l.id)} guia={guia} etiqueta={etiqueta} valor={b.costo} onValor={(costo) => onCambio({ costo })} original={l.costoUnitario} obligatorio={false} />
        )}
      </header>

      <BloquePrenda
        ids={{ prenda: idGuia.prenda(l.id), conteo: idGuia.conteo(l.id), danadas: idGuia.danadas(l.id), arreglo: idGuia.arreglo(l.id) }}
        guia={guia}
        etiqueta={etiqueta}
        conteo={b}
        prenda={b.prenda}
        categoria={l.categoria}
        marca={l.marca}
        colores={colores}
        enviado={l.enviado}
        sinPrendaAbajo={
          b.noLlego ? (
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-tinta">
              <Chip tono="ambar">No llegó nada</Chip>
              <button type="button" onClick={() => onCambio({ noLlego: false, faltanteCausa: null })} className="btn-cayla btn-enlace text-[13px]">
                Sí llegó: elegir la prenda
              </button>
            </p>
          ) : undefined
        }
        extraAntes={
          <button type="button" onClick={() => onCambio({ ...conPrenda(b, null), noLlego: true })} className="btn-cayla btn-enlace text-[13px]">
            No llegó nada de esto
          </button>
        }
        onPrenda={(prenda) => onCambio(conPrenda(b, prenda))}
        onConteo={(cambios) => onCambio(cambios)}
        onAbrirHoja={onAbrirHoja}
      />

      {b.noLlego ? (
        <PreguntaDiferencia
          id={idGuia.faltante(l.id)}
          guia={guia}
          etiqueta={etiqueta}
          pregunta={`No llegó ninguna de las ${l.enviado.toLocaleString("es-PE")}: ¿qué pasó?`}
          opciones={CAUSAS_FALTANTE}
          valor={b.faltanteCausa}
          onValor={(v) => onCambio({ faltanteCausa: v as CausaFaltante })}
        />
      ) : dif.tipo === "faltante" ? (
        <PreguntaDiferencia
          id={idGuia.faltante(l.id)}
          guia={guia}
          etiqueta={etiqueta}
          pregunta={preguntaFaltante(dif.cantidad)}
          opciones={CAUSAS_FALTANTE}
          valor={b.faltanteCausa}
          onValor={(v) => onCambio({ faltanteCausa: v as CausaFaltante })}
        />
      ) : dif.tipo === "sobrante" ? (
        <PreguntaDiferencia
          id={idGuia.sobrante(l.id)}
          guia={guia}
          etiqueta={etiqueta}
          pregunta={preguntaSobrante(dif.cantidad)}
          opciones={opcionesDeMas}
          valor={b.sobranteCausa}
          problema={problemaDeMas}
          onValor={(v) => onCambio({ sobranteCausa: v as CausaSobrante })}
        />
      ) : b.prenda && s.contado > 0 ? (
        <p className="text-[13px] text-verde">Llegó justo lo que venía.</p>
      ) : null}
    </article>
  );
}

export function TarjetaExtra({
  extra: e,
  indice,
  proveedores,
  categorias,
  marcas,
  vinculos,
  opcionesDeMas,
  problemaDeMas,
  costoReposicion,
  onCambio,
  onQuitar,
  guia,
  etiqueta,
  colores,
  onAbrirHoja,
}: Comunes & {
  extra: BorradorExtra;
  indice: number;
  proveedores: readonly { id: string; nombre: string }[];
  categorias: readonly CategoriaParaRecibir[];
  marcas: readonly { id: string; nombre: string }[];
  vinculos: readonly { marcaId: string; proveedorId: string }[];
  /** Qué puede pasar con esto: las de siempre y, si el proveedor debe esa categoría y marca, la reposición (fase 5a). */
  opcionesDeMas: readonly OpcionDiferencia[];
  /** Lo que la base rechazaría de la reposición elegida. */
  problemaDeMas: string | null;
  /** El costo de la deuda que esto repone: si se marca como reposición sin costo escrito, se pone ese. */
  costoReposicion: number | null;
  onCambio: (cambios: Partial<BorradorExtra>) => void;
  onQuitar: () => void;
}) {
  const nombre = nombreExtraGuia(indice);
  // Cambiar de proveedor, categoría o marca cambia lo que se debe: una reposición elegida antes ya no es de esto, se vuelve a elegir.
  const sinReposicion: Partial<BorradorExtra> = e.sobranteCausa === VALOR_REPOSICION ? { sobranteCausa: null } : {};
  const categoria = categorias.find((c) => c.id === e.categoriaId) ?? null;
  const marca = marcas.find((m) => m.id === e.marcaId) ?? null;
  // Con dos o más proveedores, la prenda nueva se registra con el suyo: primero se dice de cuál es.
  const conProveedor = proveedores.length < 2 || proveedores.some((p) => p.id === e.proveedorId);
  const listo = Boolean(categoria && marca && conProveedor);
  return (
    <article data-guia="recepcion.extra" aria-label={`${nombre}: algo que no estaba en la guía`} className="@container card-cayla anim-revelar space-y-4 p-4 sm:p-5">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-taupe-profundo">{nombre}</p>
          <h2 className="font-display mt-0.5 text-xl leading-tight text-tinta">No estaba en la guía</h2>
          <p className="text-[13px] text-taupe">Dile a Compras qué es y qué pasa con ello: entra al stock como todo lo demás.</p>
        </div>
        <button type="button" onClick={onQuitar} className="btn-cayla btn-sutil h-8 w-8 shrink-0 p-0" aria-label={`Quitar ${nombre}`} title="Quitar esto de la recepción">
          <X aria-hidden className="h-4 w-4" />
        </button>
      </header>

      <div className="grid gap-x-4 gap-y-3 @min-[34rem]:grid-cols-2 @min-[52rem]:grid-cols-4">
        {proveedores.length >= 2 && (
          <CampoGuiado id={idGuia.extra(e.clave, "proveedor")} guia={guia}>
            <p className={TITULO}>{etiqueta(idGuia.extra(e.clave, "proveedor"), "De qué proveedor")}</p>
            <CampoSelect caja etiqueta="Proveedor" marcador="Elige el proveedor" valor={e.proveedorId} onValor={(proveedorId) => onCambio({ ...sinReposicion, proveedorId })} opciones={proveedores.map((p) => ({ valor: p.id, texto: p.nombre }))} />
          </CampoGuiado>
        )}
        <CampoGuiado id={idGuia.extra(e.clave, "categoria")} guia={guia}>
          <p className={TITULO}>{etiqueta(idGuia.extra(e.clave, "categoria"), "Categoría")}</p>
          <ComboBuscable
            caja
            etiquetaAccesible={`Categoría de ${nombre}`}
            marcador="Elige la categoría"
            valor={e.categoriaId}
            onValor={(categoriaId) => onCambio({ ...conPrenda(e, null), ...sinReposicion, categoriaId })}
            opciones={categorias.map((c) => ({ valor: c.id, texto: c.nombre }))}
          />
        </CampoGuiado>
        <CampoGuiado id={idGuia.extra(e.clave, "marca")} guia={guia}>
          <p className={TITULO}>{etiqueta(idGuia.extra(e.clave, "marca"), "Marca")}</p>
          <ComboBuscable
            caja
            etiquetaAccesible={`Marca de ${nombre}`}
            marcador="Elige la marca"
            valor={e.marcaId}
            onValor={(marcaId) => onCambio({ ...conPrenda(e, null), ...sinReposicion, marcaId })}
            // Primero las marcas que trae el proveedor de esto (el elegido, o el único del envío), con quién trae cada una.
            opciones={opcionesDeMarca(marcas, proveedores, vinculos, e.proveedorId || (proveedores.length === 1 ? proveedores[0]!.id : ""))}
          />
        </CampoGuiado>
        <CampoCosto id={idGuia.extra(e.clave, "costo")} guia={guia} etiqueta={etiqueta} valor={e.costo} onValor={(costo) => onCambio({ costo })} original={null} obligatorio />
      </div>

      <BloquePrenda
        ids={{ prenda: idGuia.extra(e.clave, "prenda"), conteo: idGuia.extra(e.clave, "conteo"), danadas: idGuia.extra(e.clave, "danadas"), arreglo: idGuia.extra(e.clave, "arreglo") }}
        guia={guia}
        etiqueta={etiqueta}
        conteo={e}
        prenda={e.prenda}
        categoria={categoria ? { id: categoria.id, nombre: categoria.nombre, prefijo: categoria.prefijo, familia: categoria.familia } : { id: "", nombre: "", prefijo: null, familia: null }}
        marca={marca ?? { id: "", nombre: "" }}
        colores={colores}
        enviado={null}
        listo={listo}
        motivoNoListo={
          proveedores.length >= 2
            ? "Elige primero el proveedor, la categoría y la marca: con ellos se busca o se crea la prenda."
            : "Elige primero la categoría y la marca: con ellas se busca o se crea la prenda."
        }
        onPrenda={(prenda) => onCambio(conPrenda(e, prenda))}
        onConteo={(cambios) => onCambio(cambios)}
        onAbrirHoja={onAbrirHoja}
      />

      <PreguntaDiferencia
        id={idGuia.extra(e.clave, "sobrante")}
        guia={guia}
        etiqueta={etiqueta}
        pregunta="¿Qué pasa con esto?"
        opciones={opcionesDeMas}
        valor={e.sobranteCausa}
        problema={problemaDeMas}
        // La reposición entra al costo de la línea que faltó: si todavía no se escribió el costo, se pone el de la deuda (y se ve arriba).
        onValor={(v) =>
          onCambio({
            sobranteCausa: v as CausaSobrante,
            ...(v === VALOR_REPOSICION && e.costo.trim() === "" && costoReposicion != null ? { costo: costoComoTexto(costoReposicion) } : {}),
          })
        }
      />
    </article>
  );
}

/** El botón «+ Algo que no estaba en la guía». */
export function BotonAgregarExtra({ onAgregar, deshabilitado }: { onAgregar: () => void; deshabilitado?: boolean }) {
  return (
    <Boton type="button" onClick={onAgregar} disabled={deshabilitado} data-guia="recepcion.agregar-extra">
      + Algo que no estaba en la guía
    </Boton>
  );
}
