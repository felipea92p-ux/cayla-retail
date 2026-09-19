"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { CampoMonto, CampoTexto } from "@/components/ui/campos";
import { botonCancelar } from "@/components/ui/Modal";
import { MuestraPatron } from "@/components/MuestraPatron";
import { ArbolCategoria } from "@/components/alta-producto/ArbolCategoria";
import { AvisoParecidos, type Parecido } from "@/components/alta-producto/AvisoParecidos";
import { ConfigurarCategoria } from "@/components/alta-producto/ConfigurarCategoria";
import { ProductoCreado, type ResumenCreado } from "@/components/alta-producto/ProductoCreado";
import { ProponerValor } from "@/components/alta-producto/ProponerValor";
import { AvisoInline, Bloque, ChipOpcion } from "@/components/alta-producto/piezas";
import { FAMILIAS_COLOR } from "@/lib/colores-familias";
import { compararTallas } from "@/lib/tallas";
import {
  codigoBasePrevisto,
  codigoVariantePrevisto,
  construirCeldas,
  desbloqueos,
  leerErrorAlta,
  margenPorcentaje,
  nivelMargen,
  ordenarColores,
  problemasAlta,
  tituloReferencia,
  type EstadoAlta,
} from "@/lib/alta-producto";
import type { ContextoAlta } from "@/lib/alta-producto-datos";
import type { EjesPorCategoria, ValorVocabulario } from "@/lib/catalogo-v2";

// "Nuevo producto" como ÁRBOL DE DECISIÓN (ADR-0108): una sola página donde
// cada bloque se abre al resolver el anterior — 1 Qué es (familia → categoría)
// · 2 Nombre · 3 Talla, tejido y patrón · 4 Colores · 5 Precio y variantes ·
// 6 Etiquetas — y un resumen fijo que dice, en frases, qué falta para guardar.
//
// Diseñado para que equivocarse sea difícil, no para avisar después:
//   * la categoría se elige con tarjetas (arrastra prefijo, tallas, tejidos);
//   * el nombre se comprueba contra el catálogo MIENTRAS se escribe;
//   * lo que la familia exige (Indumentaria: tejido y patrón) no se puede saltar;
//   * lo que viene marcado de antemano es la curva habitual de la categoría;
//   * el botón de guardar no se apaga en silencio: el resumen dice qué falta.
//
// El alta es UNA transacción (`crear_producto_con_variantes`): producto,
// variantes y etiquetas entran juntos o no entra nada. Las fotos quedan
// fuera a propósito — el archivo se sube al elegirlo y, si se cancela el
// formulario, quedaría huérfano; se agregan por color desde el producto.
//
// Al guardar NO se vuelve a la lista: aparece una pantalla de éxito (paso 4) con
// tres salidas — agregar fotos, crear otro parecido, ir a productos. «Otro
// parecido» conserva categoría, tallas, tejido, patrón, precio, costo y
// etiquetas y limpia nombre, descripción y colores: una colección son 10
// prendas casi iguales y empezar de cero cada vez era el trabajo que sobraba.
//
// El token de idempotencia nace con el formulario (useRef): si la red falla a
// mitad y se reintenta, la base devuelve el mismo producto y no crea un segundo.

type Resultado = { clave: string; items: Parecido[]; fallo: boolean };
const SIN_RESULTADO: Resultado = { clave: "", items: [], fallo: false };

export function NuevoProductoForm({ contexto }: { contexto: ContextoAlta }) {
  const router = useRouter();
  const token = useRef<string>(crypto.randomUUID());
  const peticion = useRef(0);

  // Copias locales: configurar una categoría o proponer un valor las modifica sin recargar la página.
  const [ejes, setEjes] = useState<EjesPorCategoria>(contexto.ejes);
  const [universo, setUniverso] = useState(contexto.universo);

  const [categoriaId, setCategoriaId] = useState("");
  const [referencia, setReferencia] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [resultado, setResultado] = useState<Resultado>(SIN_RESULTADO);
  const [reintento, setReintento] = useState(0);
  const [confirmoPara, setConfirmoPara] = useState("");
  const [tallasElegidas, setTallasElegidas] = useState<string[]>([]);
  const [tejidoId, setTejidoId] = useState("");
  const [patronId, setPatronId] = useState("");
  const [coloresElegidos, setColoresElegidos] = useState<string[]>([]);
  const [precioBase, setPrecioBase] = useState("");
  const [costoBase, setCostoBase] = useState("");
  const [costoTocado, setCostoTocado] = useState(false);
  const [excluidas, setExcluidas] = useState<Set<string>>(new Set());
  const [overridePrecio, setOverridePrecio] = useState<Record<string, string>>({});
  const [etiquetasElegidas, setEtiquetasElegidas] = useState<string[]>([]);
  const [cargando, setCargando] = useState(false);
  const [creado, setCreado] = useState<ResumenCreado | null>(null);
  /** Nombre del producto del que se copió al elegir «crear otro parecido»: se muestra hasta el próximo guardado. */
  const [copiadoDe, setCopiadoDe] = useState<string | null>(null);

  const categoria = contexto.categorias.find((c) => c.id === categoriaId) ?? null;
  const familia = categoria ? (contexto.familias.find((f) => f.codigo === categoria.familia) ?? null) : null;
  const exige = Boolean(familia?.exigeTejidoPatron);

  const tallasCategoria = useMemo(
    () => [...(ejes.tallas[categoriaId] ?? [])].sort((a, b) => compararTallas(a.texto, b.texto)),
    [ejes.tallas, categoriaId]
  );
  const tejidosCategoria = ejes.tejidos[categoriaId] ?? [];
  const patronesCategoria = ejes.patrones[categoriaId] ?? [];
  const habituales = ejes.habituales[categoriaId] ?? [];
  const tallaTexto = (id: string) => tallasCategoria.find((t) => t.id === id)?.texto ?? "";

  const nombreFinal = tituloReferencia(referencia);

  // ---------- ¿ya existe algo así? (aviso en vivo, con espera de 350 ms al tipear) ----------
  useEffect(() => {
    if (!categoriaId || !nombreFinal) return;
    const id = ++peticion.current;
    const espera = setTimeout(async () => {
      // 6 s de tope: una red colgada no debe dejar el formulario esperando para siempre (principio 9).
      const { data, error } = await createClient()
        .rpc("buscar_productos_parecidos", { p_referencia: nombreFinal })
        .abortSignal(AbortSignal.timeout(6000));
      if (id !== peticion.current) return; // llegó tarde: ya se escribió otra cosa
      if (error || !data) {
        setResultado({ clave: nombreFinal, items: [], fallo: true });
        return;
      }
      setResultado({
        clave: nombreFinal,
        fallo: false,
        items: data.map((p) => ({ id: p.id, referencia: p.referencia, categoria: p.categoria, nivel: p.nivel as Parecido["nivel"] })),
      });
    }, 350);
    return () => clearTimeout(espera);
  }, [nombreFinal, categoriaId, reintento]);

  // Un resultado solo vale para el nombre con el que se pidió: si se siguió escribiendo, no se muestra uno viejo.
  const vigente = resultado.clave === nombreFinal ? resultado : SIN_RESULTADO;
  const comprobandoNombre = Boolean(categoriaId) && nombreFinal !== "" && resultado.clave !== nombreFinal;
  const hayIdentico = vigente.items.some((p) => p.nivel === "identico");
  const hayUnaLetra = vigente.items.some((p) => p.nivel === "una_letra");
  const confirmo = confirmoPara === nombreFinal;

  // ---------- elegir / cambiar categoría ----------
  function elegirCategoria(id: string) {
    setCategoriaId(id);
    setTallasElegidas(ejes.habituales[id] ?? []); // la curva habitual viene marcada
    setTejidoId("");
    setPatronId("");
    setExcluidas(new Set());
    setOverridePrecio({});
    const sugerido = contexto.costoSugerido[id];
    if (sugerido && !costoTocado) setCostoBase(sugerido.costo.toFixed(2));
  }

  function cambiarCategoria() {
    setCopiadoDe(null);
    setCategoriaId("");
    setTallasElegidas([]);
    setTejidoId("");
    setPatronId("");
    setExcluidas(new Set());
    setOverridePrecio({});
  }

  function alternarTalla(id: string) {
    setTallasElegidas((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  const curvaCambiada =
    habituales.length > 0 &&
    (tallasElegidas.length !== habituales.length || tallasElegidas.some((t) => !habituales.includes(t)));

  function alternarColor(codigo: string) {
    setColoresElegidos((prev) => (prev.includes(codigo) ? prev.filter((x) => x !== codigo) : [...prev, codigo]));
  }

  // ---------- al configurar una categoría o proponer un valor sin salir del alta ----------
  function agregarValor(tipo: "tallas" | "tejidos" | "patrones", valor: ValorVocabulario) {
    setEjes((prev) => ({ ...prev, [tipo]: { ...prev[tipo], [categoriaId]: [...(prev[tipo][categoriaId] ?? []), valor] } }));
    setUniverso((prev) => (prev[tipo].some((v) => v.id === valor.id) ? prev : { ...prev, [tipo]: [...prev[tipo], valor] }));
    if (tipo === "tallas") setTallasElegidas((prev) => [...prev, valor.id]); // recién creada para este producto: queda elegida
    if (tipo === "tejidos") setTejidoId(valor.id);
    if (tipo === "patrones") setPatronId(valor.id);
  }

  function categoriaConfigurada(tipo: "tallas" | "tejidos" | "patrones", elegidos: ValorVocabulario[]) {
    setEjes((prev) => ({
      ...prev,
      [tipo]: { ...prev[tipo], [categoriaId]: elegidos },
      ...(tipo === "tallas" ? { habituales: { ...prev.habituales, [categoriaId]: elegidos.map((v) => v.id) } } : {}),
    }));
    if (tipo === "tallas") setTallasElegidas(elegidos.map((v) => v.id));
  }

  // ---------- matriz ----------
  const celdas = useMemo(() => construirCeldas(tallasElegidas, coloresElegidos), [tallasElegidas, coloresElegidos]);
  const celdasIncluidas = celdas.filter((c) => !excluidas.has(c.clave));

  function alternarCelda(clave: string) {
    setExcluidas((prev) => {
      const copia = new Set(prev);
      if (copia.has(clave)) copia.delete(clave);
      else copia.add(clave);
      return copia;
    });
  }

  // ---------- qué falta / qué está abierto ----------
  const estado: EstadoAlta = {
    categoriaId,
    referencia,
    comprobandoNombre,
    nombreBloqueado: hayIdentico,
    nombreSinConfirmar: hayUnaLetra && !confirmo,
    categoriaSinTallas: Boolean(categoriaId) && tallasCategoria.length === 0,
    tallasElegidas: tallasElegidas.length,
    exigeTejidoPatron: exige,
    hayTejidosEnCategoria: tejidosCategoria.length > 0,
    hayPatronesEnCategoria: patronesCategoria.length > 0,
    tejidoId,
    patronId,
    celdasIncluidas: celdasIncluidas.length,
    precioBase,
    costoBase,
  };
  const abierto = desbloqueos(estado);
  const problemas = problemasAlta(estado);
  const puedeGuardar = problemas.length === 0 && !cargando;

  const precioNum = Number(precioBase);
  const costoNum = Number(costoBase);
  const margen = costoBase.trim() === "" ? null : margenPorcentaje(precioNum, costoNum);
  const nivel = nivelMargen(margen);
  const sugerido = categoriaId ? contexto.costoSugerido[categoriaId] : undefined;

  const { frecuentes, grupos } = useMemo(
    () => ordenarColores(contexto.colores, contexto.usoColores[categoriaId] ?? {}, FAMILIAS_COLOR),
    [contexto.colores, contexto.usoColores, categoriaId]
  );
  const colorPorCodigo = (cod: string) => contexto.colores.find((c) => c.codigo === cod);

  // ---------- código previsto ----------
  const base = codigoBasePrevisto(categoria?.prefijo ?? null, categoria?.prefijo ? (contexto.correlativos[categoria.prefijo] ?? 0) : null);
  const codigosVariantes = celdasIncluidas.map((c) =>
    codigoVariantePrevisto(base, c.color, c.tallaId ? tallaTexto(c.tallaId) : null)
  );

  // ---------- guardar ----------
  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!puedeGuardar) {
      // No debería pasar (el botón está apagado), pero Enter en un campo puede llegar hasta acá.
      avisar.error(problemas[0]?.texto ?? "Falta completar el formulario.");
      return;
    }
    const costo = costoBase.trim() === "" ? 0 : costoNum;
    const variantes = celdasIncluidas.map((c) => {
      const o = overridePrecio[c.clave];
      const precio = o !== undefined && o !== "" ? Number(o) : precioNum;
      return { talla_id: c.tallaId, color_codigo: c.color, precio, costo };
    });
    if (variantes.some((v) => !Number.isFinite(v.precio) || v.precio < 0)) {
      avisar.error("Una de las celdas tiene un precio inválido.");
      return;
    }

    setCargando(true);
    const { data: productoId, error } = await createClient().rpc("crear_producto_con_variantes", {
      p_referencia: nombreFinal,
      p_categoria_id: categoriaId,
      p_variantes: variantes,
      p_descripcion: descripcion.trim() || undefined,
      p_token: token.current,
      p_tejido_id: tejidoId || undefined,
      p_patron_id: patronId || undefined,
      p_confirmo_distinto: confirmo,
      p_etiqueta_ids: etiquetasElegidas.length > 0 ? etiquetasElegidas : undefined,
    });
    setCargando(false);

    if (error || !productoId) {
      const lectura = leerErrorAlta(error);
      if (lectura.tipo !== "otro") {
        // Otra persona creó el mismo nombre mientras esta llenaba el formulario: se muestra en el bloque 2, no solo en un aviso.
        setReintento((n) => n + 1);
        avisar.error(lectura.mensaje, { enfocar: "nombre-producto" });
        return;
      }
      avisar.error(traducirError(error, "crear el producto"));
      return;
    }

    setCopiadoDe(null);
    setCreado({
      id: productoId,
      nombre: nombreFinal,
      categoria: `${familia?.nombre ?? ""} › ${categoria?.nombre ?? ""}`,
      variantes: variantes.length,
      // Solo los colores que quedaron en alguna variante: uno desmarcado en la matriz no necesita foto.
      colores: coloresElegidos
        .filter((cod) => celdasIncluidas.some((c) => c.color === cod))
        .map((cod) => colorPorCodigo(cod))
        .filter((c): c is NonNullable<typeof c> => Boolean(c)),
    });
  }

  // «Crear otro parecido»: conserva lo que casi seguro se repite y limpia lo que casi seguro cambia.
  function otroParecido() {
    if (!creado) return;
    setCopiadoDe(creado.nombre);
    setCreado(null);
    setReferencia("");
    setDescripcion("");
    setResultado(SIN_RESULTADO);
    setConfirmoPara("");
    setColoresElegidos([]);
    setExcluidas(new Set());
    setOverridePrecio({});
    setCostoTocado(true); // el costo ya es el de la prenda anterior: no volver a sugerir encima
    token.current = crypto.randomUUID(); // un producto nuevo es una operación nueva, no un reintento
    router.refresh(); // el correlativo del código previsto y los colores «más usados» ya cambiaron
    setTimeout(() => document.getElementById("nombre-producto")?.focus(), 50);
  }

  const etiquetaNivel = { negativo: "con este precio pierdes dinero", bajo: "es poco: un descuento se lo come", normal: "" } as const;

  if (creado) return <ProductoCreado creado={creado} onOtroParecido={otroParecido} />;

  return (
    <form onSubmit={onSubmit} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
      <div className="space-y-4">
        {copiadoDe && (
          <AvisoInline tono="neutro">
            Empiezas desde <strong>{copiadoDe}</strong>: mantuve la categoría, las tallas, el tejido, el patrón, el precio, el costo y las
            etiquetas. Cambia lo que sea distinto.
          </AvisoInline>
        )}

        {/* 1 · QUÉ ES */}
        <Bloque numero={1} titulo="Qué producto es" listo={Boolean(categoria)} ayuda="Elige la familia y la categoría, o búscala por nombre.">
          <ArbolCategoria
            familias={contexto.familias}
            categorias={contexto.categorias}
            categoriaId={categoriaId}
            onElegir={elegirCategoria}
            onCambiar={cambiarCategoria}
          />
        </Bloque>

        {/* 2 · NOMBRE */}
        <Bloque
          numero={2}
          titulo="Nombre"
          bloqueado={!abierto.nombre}
          bloqueadoTexto="Elige primero qué producto es."
          listo={abierto.atributos}
          ayuda="Escríbelo como quieras: se guarda siempre con el mismo formato."
        >
          <div className="space-y-3">
            <CampoTexto
              id="nombre-producto"
              etiqueta="Referencia"
              placeholder="Blusa Aurora"
              value={referencia}
              onChange={(e) => setReferencia(e.target.value)}
              autoComplete="off"
              pie={
                nombreFinal && nombreFinal !== referencia.trim() ? (
                  <span>
                    Se guardará como <strong className="text-tinta">{nombreFinal}</strong>
                  </span>
                ) : undefined
              }
            />
            <AvisoParecidos
              parecidos={vigente.items}
              confirmo={confirmo}
              onConfirmo={(v) => setConfirmoPara(v ? nombreFinal : "")}
              noSePudoComprobar={vigente.fallo}
            />
            <CampoTexto
              etiqueta="Descripción"
              pie="Opcional"
              placeholder="Tela, corte, detalle…"
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
            />
          </div>
        </Bloque>

        {/* 3 · TALLA, TEJIDO, PATRÓN */}
        <Bloque
          numero={3}
          titulo="Talla, tejido y patrón"
          bloqueado={!abierto.atributos}
          bloqueadoTexto={abierto.nombre ? "Escribe un nombre que no exista todavía." : "Elige primero qué producto es."}
          listo={abierto.colores}
          ayuda={exige ? `${familia?.nombre} exige tejido y patrón.` : undefined}
        >
          <div className="space-y-6">
            {/* tallas */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <p className="label-cayla text-[11px] text-tinta/70">Tallas</p>
                {curvaCambiada && (
                  <button
                    type="button"
                    onClick={() => setTallasElegidas(habituales)}
                    className="label-cayla text-[11px] text-tinta/60 underline underline-offset-4 hover:text-rojo"
                  >
                    Volver a la curva habitual
                  </button>
                )}
              </div>
              {tallasCategoria.length === 0 && categoria ? (
                <ConfigurarCategoria
                  tipo="tallas"
                  categoriaId={categoriaId}
                  categoriaNombre={categoria.nombre}
                  universo={universo.tallas}
                  ejesActuales={{ tallaIds: [], tejidoIds: tejidosCategoria.map((t) => t.id), patronIds: patronesCategoria.map((t) => t.id) }}
                  onGuardado={(el) => categoriaConfigurada("tallas", el)}
                />
              ) : (
                <>
                  <div className="flex flex-wrap gap-1.5">
                    {tallasCategoria.map((t) => (
                      <ChipOpcion key={t.id} elegido={tallasElegidas.includes(t.id)} onClick={() => alternarTalla(t.id)}>
                        {t.texto}
                      </ChipOpcion>
                    ))}
                  </div>
                  {habituales.length > 0 && !curvaCambiada && <p className="text-xs text-tinta/55">Vienen marcadas las tallas habituales de {categoria?.nombre}.</p>}
                  <ProponerValor
                    tipo="tallas"
                    categoriaId={categoriaId}
                    ejesActuales={{ tallaIds: tallasCategoria.map((t) => t.id), tejidoIds: tejidosCategoria.map((t) => t.id), patronIds: patronesCategoria.map((t) => t.id) }}
                    onCreado={(v) => agregarValor("tallas", v)}
                  />
                </>
              )}
            </div>

            {/* tejido */}
            {(exige || tejidosCategoria.length > 0) && (
              <div className="space-y-2">
                <p className="label-cayla text-[11px] text-tinta/70">Tejido {exige ? "" : "(opcional)"}</p>
                {tejidosCategoria.length === 0 && categoria ? (
                  <ConfigurarCategoria
                    tipo="tejidos"
                    categoriaId={categoriaId}
                    categoriaNombre={categoria.nombre}
                    universo={universo.tejidos}
                    ejesActuales={{ tallaIds: tallasCategoria.map((t) => t.id), tejidoIds: [], patronIds: patronesCategoria.map((t) => t.id) }}
                    motivoExtra={`${familia?.nombre} exige tejido.`}
                    onGuardado={(el) => categoriaConfigurada("tejidos", el)}
                  />
                ) : (
                  <>
                    <div className="flex flex-wrap gap-1.5">
                      {tejidosCategoria.map((t) => (
                        <ChipOpcion key={t.id} elegido={tejidoId === t.id} onClick={() => setTejidoId((prev) => (prev === t.id ? "" : t.id))}>
                          {t.texto}
                        </ChipOpcion>
                      ))}
                    </div>
                    <ProponerValor
                      tipo="tejidos"
                      categoriaId={categoriaId}
                      ejesActuales={{ tallaIds: tallasCategoria.map((t) => t.id), tejidoIds: tejidosCategoria.map((t) => t.id), patronIds: patronesCategoria.map((t) => t.id) }}
                      onCreado={(v) => agregarValor("tejidos", v)}
                    />
                  </>
                )}
              </div>
            )}

            {/* patrón */}
            {(exige || patronesCategoria.length > 0) && (
              <div className="space-y-2">
                <p className="label-cayla text-[11px] text-tinta/70">Patrón {exige ? "" : "(opcional)"}</p>
                {patronesCategoria.length === 0 && categoria ? (
                  <ConfigurarCategoria
                    tipo="patrones"
                    categoriaId={categoriaId}
                    categoriaNombre={categoria.nombre}
                    universo={universo.patrones}
                    ejesActuales={{ tallaIds: tallasCategoria.map((t) => t.id), tejidoIds: tejidosCategoria.map((t) => t.id), patronIds: [] }}
                    motivoExtra={`${familia?.nombre} exige patrón.`}
                    onGuardado={(el) => categoriaConfigurada("patrones", el)}
                  />
                ) : (
                  <>
                    <div className="flex flex-wrap gap-1.5">
                      {patronesCategoria.map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => setPatronId((prev) => (prev === t.id ? "" : t.id))}
                          aria-pressed={patronId === t.id}
                          className={`flex w-[112px] flex-col gap-1.5 rounded-md border p-1.5 text-left text-sm transition-colors ${
                            patronId === t.id ? "border-tinta bg-tinta/[0.07] text-tinta" : "border-tinta/15 text-tinta/75 hover:border-tinta/40"
                          }`}
                        >
                          <MuestraPatron nombre={t.texto} />
                          <span className="px-0.5">
                            {patronId === t.id && <span aria-hidden>✓ </span>}
                            {t.texto}
                          </span>
                        </button>
                      ))}
                    </div>
                    <ProponerValor
                      tipo="patrones"
                      categoriaId={categoriaId}
                      ejesActuales={{ tallaIds: tallasCategoria.map((t) => t.id), tejidoIds: tejidosCategoria.map((t) => t.id), patronIds: patronesCategoria.map((t) => t.id) }}
                      onCreado={(v) => agregarValor("patrones", v)}
                    />
                  </>
                )}
              </div>
            )}
          </div>
        </Bloque>

        {/* 4 · COLORES */}
        <Bloque
          numero={4}
          titulo="Colores"
          bloqueado={!abierto.colores}
          bloqueadoTexto="Resuelve primero la talla, el tejido y el patrón."
          listo={abierto.colores && coloresElegidos.length > 0}
          ayuda="Elige los colores en que se hace. Sin colores, se crea una sola variante sin color."
          derecha={
            <span className="text-xs text-tinta/60">
              {coloresElegidos.length} elegido{coloresElegidos.length === 1 ? "" : "s"}
            </span>
          }
        >
          <div className="space-y-4">
            {frecuentes.length > 0 && (
              <div className="space-y-1.5">
                <p className="label-cayla text-[11px] text-tinta/60">Los más usados en {categoria?.nombre}</p>
                <div className="flex flex-wrap gap-1.5">
                  {frecuentes.map((c) => (
                    <ColorChip key={c.codigo} nombre={c.nombre} hex={c.hex} elegido={coloresElegidos.includes(c.codigo)} onClick={() => alternarColor(c.codigo)} />
                  ))}
                </div>
              </div>
            )}
            {grupos.map((g) => (
              <div key={g.familia} className="space-y-1.5">
                <p className="label-cayla text-[11px] text-tinta/60">{g.texto}</p>
                <div className="flex flex-wrap gap-1.5">
                  {g.colores.map((c) => (
                    <ColorChip key={c.codigo} nombre={c.nombre} hex={c.hex} elegido={coloresElegidos.includes(c.codigo)} onClick={() => alternarColor(c.codigo)} />
                  ))}
                </div>
              </div>
            ))}
            <p className="text-xs text-tinta/55">
              ¿Falta un color?{" "}
              <Link href="/productos/atributos?tipo=colores" target="_blank" className="underline underline-offset-4 hover:text-rojo">
                Créalo en Catálogo → Atributos
              </Link>{" "}
              (se abre en otra pestaña, no pierdes lo que llenaste) y luego{" "}
              <button type="button" onClick={() => router.refresh()} className="underline underline-offset-4 hover:text-rojo">
                actualiza los colores
              </button>
              .
            </p>
          </div>
        </Bloque>

        {/* 5 · PRECIO Y VARIANTES */}
        <Bloque
          numero={5}
          titulo="Precio y variantes"
          bloqueado={!abierto.precio}
          bloqueadoTexto="Resuelve primero la talla, el tejido y el patrón."
          listo={abierto.precio && Number(precioBase) > 0}
        >
          <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <CampoMonto
                etiqueta="Precio de venta"
                pie="Se aplica a todas las variantes"
                inputMode="decimal"
                placeholder="0.00"
                value={precioBase}
                onChange={(e) => setPrecioBase(e.target.value)}
              />
              <CampoMonto
                etiqueta="Costo"
                pie={
                  sugerido && !costoTocado ? (
                    <span>
                      Sugerido: el último costo en {categoria?.nombre} ({sugerido.referencia})
                    </span>
                  ) : (
                    "Opcional"
                  )
                }
                inputMode="decimal"
                placeholder="0.00"
                value={costoBase}
                onChange={(e) => {
                  setCostoTocado(true);
                  setCostoBase(e.target.value);
                }}
              />
            </div>

            {margen !== null && nivel && (
              <AvisoInline tono={nivel === "negativo" ? "rojo" : nivel === "bajo" ? "ambar" : "neutro"} alerta={nivel === "negativo"}>
                Margen {margen.toFixed(0)} % sobre el precio de venta{etiquetaNivel[nivel] && ` — ${etiquetaNivel[nivel]}`}.
                <span className="block text-xs opacity-80">Sin descontar IGV: es una alerta, no el cálculo contable.</span>
              </AvisoInline>
            )}

            <div>
              <p className="label-cayla text-[11px] text-tinta/70">
                Variantes · {celdasIncluidas.length}
              </p>
              <p className="mt-1 text-xs text-tinta/55">
                Todas incluidas: desmarca las que este modelo no trae. Puedes cambiar el precio de una sin tocar las demás.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {celdas.map((c) => {
                  const incluida = !excluidas.has(c.clave);
                  const etiqueta =
                    [c.tallaId ? tallaTexto(c.tallaId) : null, c.color ? colorPorCodigo(c.color)?.nombre : null].filter(Boolean).join(" · ") || "Única";
                  return (
                    <div
                      key={c.clave}
                      className={`flex items-center gap-2 rounded-md border px-2.5 py-1.5 ${incluida ? "border-tinta/25" : "border-tinta/10 opacity-45"}`}
                    >
                      <label className="flex items-center gap-2">
                        <input type="checkbox" checked={incluida} onChange={() => alternarCelda(c.clave)} className="accent-tinta" />
                        <span className="text-sm text-tinta/80">{etiqueta}</span>
                      </label>
                      {incluida && (
                        <input
                          type="number"
                          min={0}
                          step="0.10"
                          inputMode="decimal"
                          aria-label={`Precio de ${etiqueta}`}
                          placeholder={precioBase || "0.00"}
                          value={overridePrecio[c.clave] ?? ""}
                          onChange={(e) => setOverridePrecio((prev) => ({ ...prev, [c.clave]: e.target.value }))}
                          className="w-20 border-b border-tinta/20 bg-transparent px-1 py-0.5 text-right text-sm tabular-nums outline-none focus:border-tinta"
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </Bloque>

        {/* 6 · ETIQUETAS */}
        <Bloque
          numero={6}
          titulo="Etiquetas (opcional)"
          bloqueado={!abierto.precio}
          bloqueadoTexto="Resuelve primero la talla, el tejido y el patrón."
          ayuda="Se aplican a todas las variantes. Las de campaña ya terminada no aparecen."
        >
          {contexto.etiquetas.length === 0 ? (
            <p className="text-sm text-tinta/60">Todavía no hay etiquetas aprobadas.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {contexto.etiquetas.map((et) => (
                <ChipOpcion
                  key={et.id}
                  elegido={etiquetasElegidas.includes(et.id)}
                  onClick={() => setEtiquetasElegidas((prev) => (prev.includes(et.id) ? prev.filter((x) => x !== et.id) : [...prev, et.id]))}
                >
                  {et.nombre}
                </ChipOpcion>
              ))}
            </div>
          )}
        </Bloque>
      </div>

      {/* RESUMEN: qué se va a crear, qué falta, y el botón que no se apaga en silencio */}
      <aside aria-label="Resumen" className="card-cayla space-y-4 p-5 lg:sticky lg:top-6">
        <p className="label-cayla text-[11px] text-tinta/70">Resumen</p>
        <dl className="space-y-2 text-sm">
          <Fila etiqueta="Producto" valor={nombreFinal || "—"} />
          <Fila etiqueta="Categoría" valor={categoria ? `${familia?.nombre ?? ""} › ${categoria.nombre}` : "—"} />
          <Fila etiqueta="Variantes" valor={categoria ? String(celdasIncluidas.length) : "—"} />
          <Fila etiqueta="Precio" valor={Number(precioBase) > 0 ? `S/ ${Number(precioBase).toFixed(2)}` : "—"} />
        </dl>

        {categoria && (
          <div className="border-t border-tinta/10 pt-3">
            <p className="label-cayla text-[11px] text-tinta/60">Código previsto</p>
            <p className="mt-1 font-mono text-sm tabular-nums text-tinta">{base}</p>
            {codigosVariantes.length > 0 && (
              <p className="mt-1 break-words font-mono text-xs tabular-nums text-tinta/60">
                {codigosVariantes.slice(0, 3).join(" · ")}
                {codigosVariantes.length > 3 && ` · +${codigosVariantes.length - 3} más`}
              </p>
            )}
            <p className="mt-1 text-[11px] text-tinta/50">Se asigna al guardar; puede cambiar si otra persona crea uno a la vez.</p>
          </div>
        )}

        {problemas.length > 0 && (
          <div className="border-t border-tinta/10 pt-3">
            <p className="label-cayla text-[11px] text-tinta/60">Falta</p>
            <ul className="mt-1.5 space-y-1 text-sm text-tinta/80">
              {problemas.map((p) => (
                <li key={p.texto} className="flex gap-2">
                  <span aria-hidden className="text-tinta/40">
                    ·
                  </span>
                  {p.texto}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <button type="button" onClick={() => router.push("/productos")} className={botonCancelar}>
            Cancelar
          </button>
          <button
            type="submit"
            disabled={!puedeGuardar}
            className="label-cayla rounded-md flex-1 bg-tinta px-3 py-2.5 text-[11px] text-crema transition-colors hover:bg-rojo disabled:opacity-40"
          >
            {cargando ? "Creando…" : "Crear producto"}
          </button>
        </div>
      </aside>
    </form>
  );
}

function Fila({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-tinta/60">{etiqueta}</dt>
      <dd className="text-right font-medium text-tinta">{valor}</dd>
    </div>
  );
}

function ColorChip({ nombre, hex, elegido, onClick }: { nombre: string; hex: string | null; elegido: boolean; onClick: () => void }) {
  return (
    <ChipOpcion elegido={elegido} onClick={onClick}>
      {hex && <span aria-hidden className="h-2.5 w-2.5 rounded-full border border-tinta/20" style={{ background: hex }} />}
      {nombre}
    </ChipOpcion>
  );
}
