"use client";

import { useId, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { firmar } from "@/lib/responsable-reglas";
import { useResponsable } from "@/lib/useResponsable";
import { nombresCortos } from "@/lib/nombre-integrante";
import { textoAlcance, textoLugar } from "@/lib/conteo-reglas";
import { sufijoVariantes, textoFaltaElegir } from "@/lib/conteo-inicio-reglas";
import type { Sububicacion } from "@/lib/sububicaciones";
import { avisar } from "@/components/ui/Avisos";
import { ComboBuscable } from "@/components/ui/ComboBuscable";
import { ComboResponsable } from "@/components/ComboResponsable";

/* ====================================================================
   AbrirConteo · «Abrir un conteo» (Inventario ▸ Conteo, rediseño 2026-09-29)

   Tres preguntas, una debajo de la otra, y un botón que dice cuándo se puede:
     1. «¿Dónde vas a contar?»  — Almacén de tienda o Piso de venta. Solo en una sede que los separa; el Taller no los
                                 separa y su conteo es de toda la ubicación: la pregunta ni aparece.
     2. «¿Qué vas a contar?»    — Todo, o una categoría.
     3. «Contará»               — el responsable (combo de asistencia, ADR-0161/0162): firma la apertura.

   Van APILADAS y no en tres columnas: con el lateral abierto una ventana de 1024 px deja ~670 al contenido y cada
   columna quedaba en ~200. Las opciones de las preguntas 1 y 2 son tarjetas con `role="radio"` y se parten en dos
   columnas según el ancho de la TARJETA (`@container`), no el de la ventana.

   «Debe haber» se congela al abrir (la base toma la foto de lo que hay en el lugar): por eso elegir el lugar no es un
   detalle. Una sede con piso y almacén exige uno de los dos — la base también lo rechaza (`sububicacion_requerida`).

   Abrir lleva directo a contar (`router.push`): no se relee este inicio, que ya no es donde se trabaja. `?variantes=`
   («Contar esta prenda» desde Movimientos, ADR-0241) se arrastra a la ruta del conteo para que la lista salga acotada.
   ==================================================================== */

type Categoria = { id: string; nombre: string };
type Alcance = "todo" | "categoria";

export function AbrirConteo({
  ubicacionId,
  sububicaciones,
  categorias,
  ultimoPorLugar,
  trasladosPorAtender,
  variantes = [],
}: {
  ubicacionId: string;
  sububicaciones: Sububicacion[];
  categorias: Categoria[];
  /** Por sububicación (id): «Último conteo: 12 · 28/09» o «Nunca se contó». */
  ultimoPorLugar: Record<string, string>;
  /** Traslados hacia esta sede por atender (el mismo número del menú); `null` = no se sabe o no ve Traslados. */
  trasladosPorAtender: number | null;
  /** «Contar esta prenda»: las variantes de `?variantes=`, para arrastrarlas al conteo que se abre. */
  variantes?: string[];
}) {
  const router = useRouter();
  const responsable = useResponsable();
  const [abriendo, setAbriendo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Piso y almacén, en ese orden de lectura del recorrido (primero lo que se cuenta al entrar: el almacén). Una sede que
  // no los separa (el Taller: racks con la sububicación vacía) cuenta «toda la ubicación» y no ofrece elegir.
  const lugares = useMemo(
    () => ["almacen_tienda", "piso_venta"].flatMap((tipo) => sububicaciones.filter((s) => s.tipo === tipo)),
    [sububicaciones]
  );
  const separaPisoAlmacen = lugares.length > 0;
  const [lugarId, setLugarId] = useState<string | "">("");
  const [alcance, setAlcance] = useState<Alcance>("todo");
  const [categoriaId, setCategoriaId] = useState<string | "">("");

  const lugar = separaPisoAlmacen ? (lugares.find((l) => l.id === lugarId) ?? null) : null;
  const categoria = alcance === "categoria" && categoriaId ? (categorias.find((c) => c.id === categoriaId) ?? null) : null;
  const opcionesCategoria = useMemo(() => categorias.map((c) => ({ valor: c.id, texto: c.nombre })), [categorias]);

  const dondeHecho = !separaPisoAlmacen || lugar !== null;
  const queHecho = alcance === "todo" || categoria !== null;
  const faltan = [
    dondeHecho ? null : "dónde vas a contar",
    queHecho ? null : "la categoría",
    responsable.listo ? null : "quién cuenta",
  ].filter((x): x is string => x !== null);
  const listo = faltan.length === 0;

  // «Contará: Micaela»: el nombre corto de quien el combo tiene elegido (o «Contará» a secas mientras nadie).
  const elegido = responsable.lista.elegibles.find((p) => p.personaId === responsable.elegidoId) ?? null;
  const nombreElegido = elegido ? (nombresCortos(responsable.lista.elegibles.map((p) => p.nombre)).get(elegido.nombre) ?? elegido.nombre) : null;

  async function abrir() {
    if (!listo || abriendo) return;
    setAbriendo(true);
    setError(null);
    const { data, error: fallo } = await firmar(
      createClient().rpc("abrir_conteo", {
        p_ubicacion_id: ubicacionId,
        p_sububicacion_id: lugar?.id ?? undefined,
        p_alcance: categoria ? "categoria" : "todo",
        p_alcance_categoria_id: categoria?.id ?? undefined,
      }),
      responsable.firma()
    );
    responsable.despues(fallo);
    if (fallo || !data) {
      setAbriendo(false);
      setError(traducirError(fallo, "abrir el conteo"));
      // Otra persona abrió uno un instante antes: este inicio quedó viejo. Se relee para que muestre «Conteo N en curso», y
      // se avisa aparte porque el error en línea se va con el formulario y quien mira solo vería que la tarjeta cambió.
      if (fallo?.message && /ya hay un conteo abierto/i.test(fallo.message)) {
        avisar.aviso("Ya había un conteo abierto", { detalle: "Otra persona lo abrió hace un momento. Puedes seguir contándolo." });
        router.refresh();
      }
      return;
    }
    avisar.exito("Conteo abierto", { detalle: "Ya puedes escanear." });
    // Se queda «Abriendo…» hasta que la pantalla de contar reemplaza a esta: soltar el botón dejaría abrir dos veces.
    router.push(`/inventario/conteo/${data}${sufijoVariantes(variantes)}`);
  }

  const idTitulo = useId();
  const resumen = [lugar ? textoLugar({ sububicacionTipo: lugar.tipo, sububicacionNombre: lugar.nombre }) : separaPisoAlmacen ? null : "Toda la ubicación", categoria ? textoAlcance({ alcance: "categoria", alcanceCategoriaNombre: categoria.nombre }) : null]
    .filter((x): x is string => x !== null)
    .join(" · ");
  let numero = 0;

  return (
    <section className="card-cayla @container space-y-6 p-5 sm:p-6" aria-labelledby={idTitulo}>
      <div className="space-y-1">
        <h2 id={idTitulo} className="font-display text-xl text-tinta">
          Abrir un conteo
        </h2>
        {!separaPisoAlmacen && <p className="text-sm text-taupe">Aquí se cuenta toda la ubicación: no hay piso y almacén por separado.</p>}
      </div>

      {/* Antes de contar: lo que viene en camino y no se recibió no está en el stock de esta sede. Si ya está en el rack, sale
          «de más»; si no, se recibe después y descuadra lo contado. */}
      {!!trasladosPorAtender && trasladosPorAtender > 0 && (
        <div className="flex flex-col items-start gap-1.5 rounded-xl border border-ambar/35 bg-ambar/[0.07] px-3.5 py-3 text-sm @[36rem]:flex-row @[36rem]:items-center @[36rem]:gap-3">
          <span className="min-w-0 flex-1 text-tinta">
            <b className="font-semibold">Antes de contar:</b> hay {trasladosPorAtender === 1 ? "1 traslado" : `${trasladosPorAtender} traslados`} hacia esta sede por
            atender. Recíbelos primero, o esas prendas saldrán como diferencia.
          </span>
          <Link href="/inventario/traslados" className="btn-cayla btn-enlace text-sm">
            Ver traslados →
          </Link>
        </div>
      )}

      {separaPisoAlmacen && (
        <Pregunta numero={++numero} titulo="¿Dónde vas a contar?" hecho={lugar !== null}>
          <TarjetasOpcion
            etiqueta="Dónde vas a contar"
            valor={lugarId}
            onValor={setLugarId}
            deshabilitado={abriendo}
            opciones={lugares.map((l) => ({
              valor: l.id,
              titulo: textoLugar({ sububicacionTipo: l.tipo, sububicacionNombre: l.nombre }),
              linea: ultimoPorLugar[l.id] ?? "Nunca se contó",
            }))}
          />
        </Pregunta>
      )}

      <Pregunta numero={++numero} titulo="¿Qué vas a contar?" hecho={queHecho}>
        <TarjetasOpcion<Alcance>
          etiqueta="Qué vas a contar"
          valor={alcance}
          onValor={setAlcance}
          deshabilitado={abriendo}
          opciones={[
            { valor: "todo", titulo: "Todo", linea: "Todas las prendas registradas en esta ubicación." },
            { valor: "categoria", titulo: "Una categoría", linea: "Solo las prendas de una categoría." },
          ]}
        />
        {alcance === "categoria" && (
          // El buscador y la paginación de combos son de la regla global (ADR-0209): con 25 categorías se busca escribiendo.
          <ComboBuscable
            caja
            valor={categoriaId}
            onValor={setCategoriaId}
            opciones={opcionesCategoria}
            marcador="Elige una categoría"
            etiquetaAccesible="Categoría"
            className="mt-1 w-full @[30rem]:max-w-sm"
          />
        )}
      </Pregunta>

      <Pregunta numero={++numero} titulo={nombreElegido ? `Contará: ${nombreElegido}` : "Contará"} hecho={responsable.listo}>
        <ComboResponsable control={responsable} deshabilitado={abriendo} className="w-full @[36rem]:w-72" />
      </Pregunta>

      {error && (
        <p role="alert" className="rounded-xl bg-rojo/10 px-4 py-3 text-sm text-rojo-profundo">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-t border-sand pt-4">
        <p aria-live="polite" className="min-w-0 text-sm text-taupe">
          {listo ? (
            <>
              Se abrirá un conteo de <b className="font-semibold text-tinta">{resumen}</b>.
            </>
          ) : (
            textoFaltaElegir(faltan)
          )}
        </p>
        <button type="button" onClick={() => void abrir()} disabled={!listo || abriendo} className="btn-cayla btn-primario h-11 w-full @[30rem]:w-auto">
          {abriendo ? "Abriendo…" : "Empezar conteo"}
        </button>
      </div>
    </section>
  );
}

/** Una pregunta: su número en círculo (hecho = tinta; falta = borde sand), su título y lo que se responde. */
function Pregunta({ numero, titulo, hecho, children }: { numero: number; titulo: string; hecho: boolean; children: ReactNode }) {
  return (
    <div className="space-y-2.5">
      <p className="flex items-center gap-2">
        <span
          aria-hidden
          className={`grid h-5 w-5 place-items-center rounded-full border text-[11px] transition-colors ${hecho ? "border-tinta bg-tinta text-crema" : "border-sand text-taupe"}`}
        >
          {numero}
        </span>
        <span className="eyebrow-cayla !text-taupe">{titulo}</span>
        <span className="sr-only">{hecho ? "(listo)" : "(falta)"}</span>
      </p>
      {children}
    </div>
  );
}

type OpcionTarjeta<T extends string> = { valor: T; titulo: string; linea: string };

/**
 * Elegir UNA de pocas opciones grandes (un dedo las alcanza): `radiogroup` con flechas, como cualquier grupo de radios. Solo
 * la elegida (o la primera, si aún no hay ninguna) entra al orden de Tab; las flechas mueven la elección y el foco juntos.
 */
function TarjetasOpcion<T extends string>({
  etiqueta,
  valor,
  onValor,
  opciones,
  deshabilitado = false,
}: {
  etiqueta: string;
  valor: T | "";
  onValor: (v: T) => void;
  opciones: readonly OpcionTarjeta<T>[];
  deshabilitado?: boolean;
}) {
  const botones = useRef<(HTMLButtonElement | null)[]>([]);
  const elegida = opciones.findIndex((o) => o.valor === valor);

  function alTeclado(e: React.KeyboardEvent<HTMLButtonElement>, i: number) {
    const paso = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (paso === 0) return;
    e.preventDefault();
    const j = (i + paso + opciones.length) % opciones.length;
    onValor(opciones[j].valor);
    botones.current[j]?.focus();
  }

  return (
    <div role="radiogroup" aria-label={etiqueta} className="grid gap-2 @[30rem]:grid-cols-2">
      {opciones.map((o, i) => {
        const activa = o.valor === valor;
        return (
          <button
            key={o.valor}
            ref={(el) => {
              botones.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={activa}
            tabIndex={(elegida === -1 ? i === 0 : activa) ? 0 : -1}
            disabled={deshabilitado}
            onClick={() => onValor(o.valor)}
            onKeyDown={(e) => alTeclado(e, i)}
            className={`flex min-h-14 flex-col items-start justify-start rounded-lg border px-3.5 py-3 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tinta/60 disabled:cursor-default disabled:opacity-60 ${
              activa ? "border-tinta bg-sand/40 ring-1 ring-tinta" : "border-sand bg-papel hover:border-taupe/45"
            }`}
          >
            <span className="block text-[15px] text-tinta">{o.titulo}</span>
            <span className="block text-xs text-taupe">{o.linea}</span>
          </button>
        );
      })}
    </div>
  );
}
