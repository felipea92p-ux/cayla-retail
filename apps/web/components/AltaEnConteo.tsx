"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { Modal, campoEtiqueta, campoTexto, campoSelect, botonCancelar, botonPrimario } from "@/components/ui/Modal";
import type { CategoriaElegible, ColorElegible, LineaContada } from "@/lib/conteo";

/**
 * Dar de alta una prenda EN MEDIO del conteo. Esto es lo que convierte un conteo en un
 * censo: sin esta hoja, la Encargada encuentra una prenda que el sistema no conoce y no
 * tiene dónde anotarla, que es exactamente por qué el catálogo real nunca entró.
 *
 * DOS DECISIONES QUE VALE ENTENDER:
 *
 * · Lo llama `conteo_crear_variante`, que valida `fn_puede_operar_sede` y NO `fn_es_lider`.
 *   La puerta vieja (`crear_producto_con_variantes`) rechaza a quien no es Líder, y si cada
 *   ficha la tiene que crear Felipe no hay censo posible. El control no desaparece: se mueve
 *   al cierre, que sí es solo de Líder (ADR-0027).
 *
 * · Si lo que se escaneó parece un código de máquina, la prenda lo ADOPTA como código de
 *   barras propio. Como casi todas las prendas de CAYLA ya vienen con código de fábrica,
 *   eso convierte el censo de "imprimir y pegar 900 etiquetas antes de escanear nada" a
 *   "escanear lo que ya está en la percha" (ADR-0025).
 */

/**
 * El último modelo declarado en este conteo, para no volver a tipearlo.
 *
 * `productoId` es lo que de verdad importa: sin él, `conteo_crear_variante` inserta un
 * producto NUEVO cada vez. Declarar la talla M y después la L de la misma blusa creaba
 * dos productos con la misma referencia y DOS códigos cortos distintos — y el código
 * corto es lo que va impreso en la etiqueta y lo que agrupa el catálogo por modelo.
 * Recordar el modelo no es solo ahorrar tecleo: es lo que impide partir una prenda en dos.
 */
export type ModeloRecordado = {
  productoId: string;
  referencia: string;
  familia: string;
  categoriaId: string;
  precio: string;
};

type Props = {
  conteoId: string;
  /** Lo que se escaneó o escribió y no encontró nada. */
  codigoEscaneado: string;
  categorias: CategoriaElegible[];
  colores: ColorElegible[];
  /** El último modelo creado en esta sesión de conteo, o null si es el primero. */
  modelo: ModeloRecordado | null;
  onModelo: (modelo: ModeloRecordado | null) => void;
  onCancelar: () => void;
  onCreada: (linea: LineaContada) => void;
};

/**
 * ¿Es un código de máquina o alguien escribiendo el nombre de una prenda?
 * Sin espacios y de 8 caracteres para arriba: un EAN-13 entra, "Blusa azul" no.
 * Si se equivoca, el peor caso es un campo pre-llenado que se borra a mano.
 */
function pareceCodigo(texto: string) {
  return texto.length >= 8 && !/\s/.test(texto);
}

export function AltaEnConteo({
  conteoId,
  codigoEscaneado,
  categorias,
  colores,
  modelo,
  onModelo,
  onCancelar,
  onCreada,
}: Props) {
  const esCodigo = pareceCodigo(codigoEscaneado);

  // Con un modelo recordado el formulario arranca en corto: talla, color y cuántas hay.
  // Son los tres campos que cambian entre una prenda y la siguiente del mismo modelo;
  // los otros cuatro son los mismos y volver a pedirlos, 500 veces, es el trabajo que
  // hace que nadie quiera usar el sistema durante el censo.
  const [usarModelo, setUsarModelo] = useState(modelo !== null);

  const [referencia, setReferencia] = useState(modelo?.referencia ?? (esCodigo ? "" : codigoEscaneado));
  const [familia, setFamilia] = useState(modelo?.familia ?? "indumentaria");
  const [categoriaId, setCategoriaId] = useState(modelo?.categoriaId ?? "");
  const [talla, setTalla] = useState("");
  const [colorCodigo, setColorCodigo] = useState("");
  const [precio, setPrecio] = useState(modelo?.precio ?? "");
  const [cantidad, setCantidad] = useState("1");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const familias = useMemo(
    () => Array.from(new Set(categorias.map((c) => c.familia))),
    [categorias]
  );
  const deFamilia = useMemo(
    () => categorias.filter((c) => c.familia === familia),
    [categorias, familia]
  );
  const tallasSugeridas = useMemo(
    () => categorias.find((c) => c.id === categoriaId)?.tallasSugeridas ?? [],
    [categorias, categoriaId]
  );

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setGuardando(true);
    setError(null);

    const supabase = createClient();
    const cuantas = Number(cantidad);
    const productoId = usarModelo ? modelo?.productoId : undefined;
    const { error: err } = await supabase.rpc("conteo_crear_variante", {
      p_conteo_id: conteoId,
      // Con `p_producto_id` la RPC cuelga la variante del producto que ya existe y
      // `p_referencia` queda de adorno; sin él, inserta un producto nuevo.
      p_producto_id: productoId,
      p_referencia: referencia.trim(),
      // Cadena vacía y no `undefined`: los dos son parámetros SIN default en la RPC
      // (van antes de los que sí tienen), así que supabase-js los tipa obligatorios.
      // La función los normaliza con `nullif(trim(…), '')`, que es justo la forma en
      // que un formulario manda "sin talla" y "sin color" — ver `0051`.
      p_talla: talla.trim(),
      p_color_codigo: colorCodigo,
      p_cantidad: cuantas,
      p_categoria_id: categoriaId || undefined,
      p_precio: precio ? Number(precio) : 0,
      p_codigo_barras: esCodigo ? codigoEscaneado : undefined,
    });

    setGuardando(false);
    if (err) {
      setError(traducirError(err, "crear la prenda"));
      return;
    }

    // Si acabamos de crear el producto, hay que averiguar cuál quedó: la RPC devuelve el
    // id de la LÍNEA del conteo, no el del producto. Se busca el más reciente con esa
    // referencia, que es el que acaba de nacer.
    //
    // Esta lectura SÍ ignora su error a propósito —la única del archivo—: si falla, lo
    // único que se pierde es el atajo, y la siguiente alta pide los siete campos como
    // antes. Tumbar una prenda ya contada por no poder guardar una comodidad sería el
    // intercambio al revés.
    if (productoId) {
      onModelo({ productoId, referencia: referencia.trim(), familia, categoriaId, precio });
    } else {
      const { data: creado } = await supabase
        .from("productos")
        .select("id")
        .eq("referencia", referencia.trim())
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (creado?.id) {
        onModelo({ productoId: creado.id, referencia: referencia.trim(), familia, categoriaId, precio });
      }
    }

    onCreada({
      // La RPC devuelve el id de la línea, no la prenda entera. Se arma la fila local
      // con lo que acabamos de tipear: alcanza para verla en la lista, y al cerrar el
      // conteo el servidor manda la versión buena.
      lineaId: `local-${Date.now()}`,
      varianteId: `nueva-${Date.now()}`,
      codigo: null,
      referencia: referencia.trim(),
      talla: talla.trim() || null,
      color: colores.find((c) => c.codigo === colorCodigo)?.nombre ?? null,
      contada: cuantas,
      // Una prenda que el sistema no conocía tenía, por definición, 0.
      sistema: 0,
      contadaEn: new Date().toISOString(),
    });
  }

  return (
    <Modal
      titulo="Esta prenda no está en el sistema"
      subtitulo={
        esCodigo
          ? `Se va a crear y va a adoptar el código ${codigoEscaneado}, así la pistola la encuentra desde ahora`
          : "Complétala y queda contada en el mismo acto"
      }
      onClose={onCancelar}
      ancho="max-w-md"
    >
      <form onSubmit={onSubmit} className="space-y-4">
        {usarModelo && modelo ? (
          <div className="card-cayla flex items-start justify-between gap-3 p-3">
            <div>
              <p className="label-cayla text-[11px] text-tinta/65">Misma prenda</p>
              <p className="mt-0.5 text-sm text-tinta">{modelo.referencia}</p>
              <p className="text-xs text-tinta/65">
                {categorias.find((c) => c.id === modelo.categoriaId)?.nombre ?? "sin categoría"}
                {modelo.precio ? ` · S/${modelo.precio}` : ""}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setUsarModelo(false)}
              className="label-cayla shrink-0 rounded-md border border-tinta/25 px-3 py-1.5 text-[11px] text-tinta transition-colors hover:border-rojo hover:text-rojo"
            >
              Otra prenda
            </button>
          </div>
        ) : (
          <div className="space-y-1.5">
            <label className={campoEtiqueta}>Qué prenda es</label>
            <input
              required
              autoFocus
              value={referencia}
              onChange={(e) => setReferencia(e.target.value)}
              placeholder="Blusa manga larga escote en V"
              className={campoTexto}
            />
          </div>
        )}

        <div className={`grid grid-cols-2 gap-3 ${usarModelo ? "hidden" : ""}`}>
          <div className="space-y-1.5">
            <label className={campoEtiqueta}>Familia</label>
            <select
              value={familia}
              onChange={(e) => {
                setFamilia(e.target.value);
                setCategoriaId("");
              }}
              className={campoSelect}
            >
              {familias.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className={campoEtiqueta}>Categoría</label>
            <select value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)} className={campoSelect}>
              <option value="">Elegir…</option>
              {deFamilia.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className={campoEtiqueta}>Talla</label>
            {tallasSugeridas.length > 0 ? (
              <select
                autoFocus={usarModelo}
                value={talla}
                onChange={(e) => setTalla(e.target.value)}
                className={campoSelect}
              >
                <option value="">Única</option>
                {tallasSugeridas.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            ) : (
              <input
                autoFocus={usarModelo}
                value={talla}
                onChange={(e) => setTalla(e.target.value)}
                placeholder="Única"
                className={campoTexto}
              />
            )}
          </div>
          <div className="space-y-1.5">
            <label className={campoEtiqueta}>Color</label>
            <select value={colorCodigo} onChange={(e) => setColorCodigo(e.target.value)} className={campoSelect}>
              <option value="">Sin color</option>
              {colores.map((c) => (
                <option key={c.codigo} value={c.codigo}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className={`space-y-1.5 ${usarModelo ? "hidden" : ""}`}>
            <label className={campoEtiqueta}>Precio de venta</label>
            <input
              type="text"
              inputMode="decimal"
              value={precio}
              onChange={(e) => setPrecio(e.target.value.replace(/[^0-9.]/g, ""))}
              placeholder="79.00"
              className={campoTexto}
            />
          </div>
          <div className="space-y-1.5">
            <label className={campoEtiqueta}>Cuántas hay</label>
            <input
              required
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={cantidad}
              onChange={(e) => setCantidad(e.target.value.replace(/[^0-9]/g, ""))}
              className={campoTexto}
            />
          </div>
        </div>

        <p className="text-xs text-tinta/55">
          El costo lo completa la Líder después. La prenda entra al inventario recién cuando se
          cierra el conteo.
        </p>

        {error && <p className="text-sm text-rojo">{error}</p>}

        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onCancelar} className={botonCancelar}>
            Cancelar
          </button>
          <button type="submit" disabled={guardando} className={botonPrimario}>
            {guardando ? "Creando…" : "Crear y contar"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
