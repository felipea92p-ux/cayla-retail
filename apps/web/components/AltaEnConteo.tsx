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

type Props = {
  conteoId: string;
  /** Lo que se escaneó o escribió y no encontró nada. */
  codigoEscaneado: string;
  categorias: CategoriaElegible[];
  colores: ColorElegible[];
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
  onCancelar,
  onCreada,
}: Props) {
  const esCodigo = pareceCodigo(codigoEscaneado);

  const [referencia, setReferencia] = useState(esCodigo ? "" : codigoEscaneado);
  const [familia, setFamilia] = useState("indumentaria");
  const [categoriaId, setCategoriaId] = useState("");
  const [talla, setTalla] = useState("");
  const [colorCodigo, setColorCodigo] = useState("");
  const [precio, setPrecio] = useState("");
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
    const { error: err } = await supabase.rpc("conteo_crear_variante", {
      p_conteo_id: conteoId,
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

        <div className="grid grid-cols-2 gap-3">
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
              <select value={talla} onChange={(e) => setTalla(e.target.value)} className={campoSelect}>
                <option value="">Única</option>
                {tallasSugeridas.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            ) : (
              <input value={talla} onChange={(e) => setTalla(e.target.value)} placeholder="Única" className={campoTexto} />
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
          <div className="space-y-1.5">
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
