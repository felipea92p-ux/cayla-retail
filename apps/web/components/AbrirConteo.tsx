"use client";

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Flag, Package, Search } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { firmar } from "@/lib/responsable-reglas";
import { useResponsable } from "@/lib/useResponsable";
import { claveResponsableConteo, recordarResponsableGuardar } from "@/lib/responsable-conteo";
import { nombresCortos } from "@/lib/nombre-integrante";
import { textoAlcance, textoLugar } from "@/lib/conteo-reglas";
import { TODA_LA_UBICACION, avisoDeArranque, categoriasPorVariantes, sufijoVariantes, variantesDelConteo, type AlcanceConteo, type ArranqueConteo } from "@/lib/conteo-inicio-reglas";
import { camposDeApertura, type AlcanceElegido } from "@/lib/conteo-inicio-guia";
import { filtrarCombo } from "@/lib/combo-reglas";
import { podarElegidas, prendasDelLugar, textoPrendas, type LugarDeConteo } from "@/lib/conteo-por-prenda";
import { usePrendasParaContar } from "@/lib/usePrendasParaContar";
import type { Sububicacion } from "@/lib/sububicaciones";
import { avisar } from "@/components/ui/Avisos";
import { CifraQueCuenta } from "@/components/ui/CifraQueCuenta";
import { IconoPercha } from "@/components/ui/IconoPercha";
import { SegmentoDeslizante } from "@/components/ui/SegmentoDeslizante";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { ComboResponsable } from "@/components/ComboResponsable";
import { ElegirPrendas } from "@/components/conteo/ElegirPrendas";
import { Aviso } from "@/components/ui/Aviso";

/* ====================================================================
   AbrirConteo · «Abrir un conteo» (Inventario ▸ Conteo). Maqueta: `docs/maquetas/conteo-abrir-2026-09/abrir-conteo.html`.

   Tres preguntas a la izquierda y, a la derecha, «Tu conteo»: cuántas variantes trae lo elegido, un resumen de tres líneas y el botón.
     1. «¿Dónde vas a contar?»  — Almacén de tienda o Piso de venta. Solo en una sede que los separa; el Taller no los separa y su
                                 conteo es de toda la ubicación: la pregunta ni aparece.
     2. «¿Qué vas a contar?»    — Todo, una categoría (con buscador, a la vista: un toque en vez de abrir una lista) o prendas exactas
                                 («Por prenda», 2026-10-01: el buscador de Existencias sobre lo que hay en el lugar elegido).
     3. «¿Quién cuenta?»        — el responsable (combo de asistencia, ADR-0161/0162): firma la apertura.

   La cifra de «Tu conteo» son VARIANTES (modelo · color · talla), nunca unidades: el conteo es a ciegas, y decir cuántas prendas
   espera el sistema le regalaría la meta a quien cuenta. Sale de `fn_conteo_alcance`, con la misma regla que la foto de `abrir_conteo`
   (lo prueba `scripts/pruebas/conteo_rediseno.mjs`). Es un dato de apoyo: sin él (la función no está todavía en la base) la tarjeta
   se dibuja igual, sin cifras.

   Guía de foco (ADR-0284): cada pregunta dice si está hecha, cuál sigue y qué falta, y el pie de «Tu conteo» lista lo que falta con
   un toque que lleva al campo. Toda la lógica está en `lib/conteo-inicio-guia.ts`, comprobada contra lo que `abrir_conteo` rechaza.

   Con el ancho de la TARJETA (`@container`), no el de la ventana: con el lateral abierto una ventana de 1024 px deja ~670 al
   contenido. Angosta, «Tu conteo» pasa a una barra pegada abajo con la cifra y el botón.

   Las categorías son píldoras con su buscador y no el combo del sistema (ADR-0209) a propósito: son pocas decenas, elegir una es
   LA decisión de esta tarjeta y verlas todas ahorra un paso. El filtro es el mismo del sistema (`filtrarCombo`: sin tildes ni
   mayúsculas, tolera un error de tipeo). Si se generaliza, es una decisión de ADR-0209, no de esta pantalla.

   Conteo de ARRANQUE (ADR-0328, actividad 15): si el tramo elegido todavía no tuvo su arranque, la tarjeta lo dice sola, sin que nadie
   tenga que marcar nada (corrige el stock, pero sus diferencias no son pérdida ni bajan la exactitud). El tramo lo pone la base: en el
   almacén es el lugar entero (contando «Todo» lo será; una categoría o unas prendas, no); en el piso, cada categoría (contando esa
   categoría, o «Todo», lo será; unas prendas, no). Un cuadre del piso los reinicia. No es una opción a propósito: quien decide si un
   cierre es de arranque es `cerrar_conteo` (solo si se contó entero el tramo), y un interruptor dejaría marcar «de arranque» lo que no
   lo es, o perderlo sin saber. Las dos frases («Todo» y la parte elegida) se apilan en la misma celda (ADR-0185): cambiar «Todo» por
   «Una categoría» no mueve lo de abajo.

   «Debe haber» se congela al abrir (la base toma la foto de lo que hay en el lugar): por eso elegir el lugar no es un detalle. Una
   sede con piso y almacén exige uno de los dos — la base también lo rechaza (`sububicacion_requerida`).

   Abrir lleva directo a contar (`router.push`): no se relee este inicio, que ya no es donde se trabaja. `?variantes=`
   («Contar esta prenda» desde Movimientos, ADR-0241) se arrastra a la ruta del conteo para que la lista salga acotada.
   «Por prenda» usa ese mismo camino: la base abre el conteo del lugar completo (`p_alcance = 'todo'`) y las prendas elegidas viajan
   como `?variantes=`. Es una vista, no un alcance guardado: el historial lo seguirá llamando «Todo». Convertirlo en alcance de la
   base (`conteos.alcance = 'prendas'`) es una decisión pendiente, ver `docs/backlog/2026-10-01-search-by-exact-garment-0f2248.md`.
   ==================================================================== */

type Categoria = { id: string; nombre: string };

export function AbrirConteo({
  ubicacionId,
  sububicaciones,
  categorias,
  ultimoPorLugar,
  alcance = null,
  arranque = null,
  trasladosPorAtender,
  variantes = [],
}: {
  ubicacionId: string;
  sububicaciones: Sububicacion[];
  categorias: Categoria[];
  /** Por sububicación (id): «Último conteo: 12 · 28/09» o «Nunca se contó». */
  ultimoPorLugar: Record<string, string>;
  /** Cuántas variantes trae un conteo de cada lugar y categoría; `null` = no se pudo leer (la tarjeta sale sin cifras). */
  alcance?: AlcanceConteo | null;
  /** Qué lugares todavía no tuvieron su conteo de arranque (ADR-0328); `null` = no se pudo leer: la tarjeta no lo menciona. */
  arranque?: ArranqueConteo | null;
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
  const [queCuento, setQueCuento] = useState<AlcanceElegido>("todo");
  const [categoriaId, setCategoriaId] = useState<string | "">("");
  // «Por prenda»: los ids elegidos, en el orden en que se eligieron. Las prendas se leen la primera vez que se toca la opción.
  const [prendasElegidas, setPrendasElegidas] = useState<string[]>([]);
  const [quitadasPorLugar, setQuitadasPorLugar] = useState(0);
  const cargaDePrendas = usePrendasParaContar(queCuento === "prendas");

  const lugar = separaPisoAlmacen ? (lugares.find((l) => l.id === lugarId) ?? null) : null;
  const categoria = queCuento === "categoria" && categoriaId ? (categorias.find((c) => c.id === categoriaId) ?? null) : null;

  // Lo que la persona ve como «faltante» sale de la guía, y la guía de lo que la base exige (`lib/conteo-inicio-guia.ts`).
  const guia = useGuiaCampos(
    camposDeApertura({
      separaPisoAlmacen,
      lugarId: lugar?.id ?? "",
      alcance: queCuento,
      categoriaId: categoria?.id ?? "",
      prendasElegidas: prendasElegidas.length,
      responsableListo: responsable.listo,
    }),
    { enModal: false }
  );
  const listo = guia.puedeConfirmar;

  // La clave del lugar en `alcance`: el piso o el almacén elegido, o «toda la ubicación» en una sede que no los separa.
  const lugarClave = separaPisoAlmacen ? (lugar?.id ?? null) : TODA_LA_UBICACION;
  const hayCifras = alcance !== null && lugarClave !== null;
  // Por prenda la cifra son las prendas elegidas (cada una es una variante); aún sin elegir ninguna, no hay cifra que dar.
  const cuantas =
    queCuento === "prendas"
      ? prendasElegidas.length > 0
        ? prendasElegidas.length
        : null
      : variantesDelConteo(alcance, lugarClave, queCuento === "categoria" ? (categoria?.id ?? null) : null);

  // Las prendas que se pueden elegir son las que tienen stock en el lugar de este conteo (la condición de la foto de `abrir_conteo`):
  // `ElegirPrendas` las filtra por `lugarDeBusqueda` y las indexa una vez por lista.
  const lugarDeBusqueda = tipoDeLugar(separaPisoAlmacen, lugar?.tipo);

  /** Elegir piso o almacén: lo que ya estaba elegido y no está registrado en el lugar nuevo se quita, y se dice. */
  function elegirLugar(id: string) {
    setLugarId(id);
    if (prendasElegidas.length === 0 || !cargaDePrendas.prendas) return;
    const nuevo = tipoDeLugar(true, lugares.find((l) => l.id === id)?.tipo);
    if (!nuevo) return;
    const alli = new Set(prendasDelLugar(cargaDePrendas.prendas, nuevo).map((p) => p.varianteId));
    const { quedan, quitadas } = podarElegidas(prendasElegidas, alli);
    if (quitadas.length === 0) return;
    setPrendasElegidas(quedan);
    setQuitadasPorLugar(quitadas.length);
  }

  // «Cuenta Micaela»: el nombre corto de quien el combo tiene elegido.
  const elegido = responsable.lista.elegibles.find((p) => p.personaId === responsable.elegidoId) ?? null;
  const nombreElegido = elegido ? (nombresCortos(responsable.lista.elegibles.map((p) => p.nombre)).get(elegido.nombre) ?? elegido.nombre) : null;

  // Al pedir «Una categoría» el cursor va al buscador, salvo en un celular (abriría el teclado sin que la persona lo pida).
  const buscador = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (queCuento === "categoria" && !window.matchMedia("(pointer: coarse)").matches) buscador.current?.focus({ preventScroll: true });
  }, [queCuento]);

  async function abrir() {
    if (!listo || abriendo) return;
    // Quien abre el conteo lo firma de principio a fin: se toma ANTES de `despues`, que reinicia el combo al guardar.
    const quienAbre = responsable.elegidoId;
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
    // Contar, Revisar y Cancelar reutilizan esta elección: el responsable se elige una sola vez, al abrir (2026-09-30).
    if (quienAbre && typeof data === "string") recordarResponsableGuardar(claveResponsableConteo(data), quienAbre);
    avisar.exito("Conteo abierto", { detalle: "Ya puedes escanear." });
    // Se queda «Abriendo…» hasta que la pantalla de contar reemplaza a esta: soltar el botón dejaría abrir dos veces.
    // «Por prenda» manda las suyas; si no, las que traiga `?variantes=` desde Movimientos («Contar esta prenda», ADR-0241).
    router.push(`/inventario/conteo/${data}${sufijoVariantes(queCuento === "prendas" ? prendasElegidas : variantes)}`);
  }

  const idTitulo = useId();
  const textoDonde = separaPisoAlmacen ? (lugar ? textoLugar({ sububicacionTipo: lugar.tipo, sububicacionNombre: lugar.nombre }) : null) : "Toda la ubicación";
  // «el Piso de venta» / «el Almacén de tienda» / «esta ubicación»; `null` si falta elegir dónde. Para frases de ayuda.
  const textoDondeConArticulo = separaPisoAlmacen ? (textoDonde ? `el ${textoDonde.charAt(0).toLowerCase()}${textoDonde.slice(1)}` : null) : "esta ubicación";
  // El conteo de arranque (ADR-0328): las dos frases posibles para ESTE lugar (contando todo / contando la parte elegida), para
  // apilarlas. En el piso la de la categoría depende de cuál se eligió.
  const avisoArranque = (que: AlcanceElegido) =>
    textoDondeConArticulo ? avisoDeArranque({ arranque, lugarClave, queCuento: que, lugarConArticulo: textoDondeConArticulo, categoria }) : null;
  const arranqueTodo = avisoArranque("todo");
  const arranqueParte = avisoArranque(queCuento === "todo" ? "categoria" : queCuento);
  const arranqueVisible = queCuento === "todo" ? arranqueTodo : arranqueParte;
  const textoQue =
    queCuento === "prendas"
      ? prendasElegidas.length > 0
        ? textoPrendas(prendasElegidas.length)
        : "Por prenda"
      : categoria
        ? textoAlcance({ alcance: "categoria", alcanceCategoriaNombre: categoria.nombre })
        : queCuento === "categoria"
          ? "Una categoría"
          : "Todo";
  const ayudaQue =
    queCuento === "prendas" ? (
      prendasElegidas.length > 0 ? (
        <>
          Contarás solo <b className="font-medium text-tinta">{textoPrendas(prendasElegidas.length)}</b>: la lista del conteo mostrará solo ellas.
        </>
      ) : (
        "Busca las prendas exactas que vas a contar: una, varias o todas las tallas de un modelo."
      )
    ) : queCuento === "todo" ? (
      textoDonde && separaPisoAlmacen ? (
        <>
          Todas las prendas del <b className="font-medium text-tinta">{textoDonde}</b>.
        </>
      ) : (
        "Todas las prendas registradas en esta ubicación."
      )
    ) : categoria ? (
      <>
        Solo las prendas de <b className="font-medium text-tinta">{categoria.nombre}</b>.
      </>
    ) : (
      "Elige una categoría para acotar el conteo."
    );

  return (
    <section className="card-cayla @container" aria-labelledby={idTitulo}>
      <div className="grid @[46rem]:grid-cols-[minmax(0,1fr)_19.5rem]">
        <div inert={abriendo} className={`min-w-0 space-y-7 p-5 transition-opacity duration-200 @[46rem]:p-8 ${abriendo ? "opacity-60" : ""}`}>
          <div className="space-y-1">
            <h2 id={idTitulo} className="font-display text-2xl text-tinta">
              Abrir un conteo
            </h2>
            <p className="text-sm text-taupe">
              {separaPisoAlmacen ? "Tres respuestas y empiezas a escanear." : "Aquí se cuenta toda la ubicación: no hay piso y almacén por separado."}
            </p>
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
            <CampoGuiado id="donde" guia={guia} titulo="¿Dónde vas a contar?">
              <TarjetasOpcion
                etiqueta="Dónde vas a contar"
                valor={lugarId}
                onValor={elegirLugar}
                deshabilitado={abriendo}
                opciones={lugares.map((l) => ({
                  valor: l.id,
                  titulo: textoLugar({ sububicacionTipo: l.tipo, sububicacionNombre: l.nombre }),
                  icono: l.tipo === "piso_venta" ? <IconoPercha className="h-6 w-6" /> : <Package className="h-6 w-6" strokeWidth={1.5} aria-hidden />,
                  linea: ultimoPorLugar[l.id] ?? "Nunca se contó",
                  cifra: alcance ? textoVariantesRegistradas(variantesDelConteo(alcance, l.id, null) ?? 0) : null,
                }))}
              />
            </CampoGuiado>
          )}

          <CampoGuiado id="que" guia={guia} titulo="¿Qué vas a contar?">
            <SegmentoDeslizante
              etiqueta="Qué vas a contar"
              valor={queCuento}
              onCambio={(v) => setQueCuento(v as AlcanceElegido)}
              opciones={[
                { clave: "todo", etiqueta: "Todo" },
                { clave: "categoria", etiqueta: "Una categoría" },
                { clave: "prendas", etiqueta: "Por prenda" },
              ]}
            />
            <p aria-live="polite" className="mt-2.5 min-h-5 text-[13px] text-taupe">
              {ayudaQue}
            </p>
            {/* Se despliega dentro de la misma pregunta (sin lista flotante, ADR-0185). Cerrada, `inert`: ni se enfoca ni se lee. */}
            <div
              inert={queCuento !== "categoria"}
              className={`grid transition-[grid-template-rows] duration-[340ms] ease-cayla ${queCuento === "categoria" ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
            >
              <div className="min-h-0 overflow-hidden">
                <ElegirCategoria
                  categorias={categorias}
                  valor={categoriaId}
                  onValor={setCategoriaId}
                  buscador={buscador}
                  cifraDe={hayCifras ? (id) => variantesDelConteo(alcance, lugarClave, id) ?? 0 : null}
                />
              </div>
            </div>
            {/* «Por prenda»: el mismo despliegue dentro de la pregunta, también `inert` mientras está cerrado. */}
            <div
              inert={queCuento !== "prendas"}
              className={`grid transition-[grid-template-rows] duration-[340ms] ease-cayla ${queCuento === "prendas" ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
            >
              <div className="min-h-0 overflow-hidden">
                <ElegirPrendas
                  estado={cargaDePrendas.estado}
                  reintentar={cargaDePrendas.reintentar}
                  activo={queCuento === "prendas"}
                  lugarTexto={textoDondeConArticulo}
                  lugar={lugarDeBusqueda}
                  prendas={cargaDePrendas.prendas}
                  elegidas={prendasElegidas}
                  onElegidas={(ids) => {
                    setPrendasElegidas(ids);
                    setQuitadasPorLugar(0);
                  }}
                  quitadasPorLugar={quitadasPorLugar}
                />
              </div>
            </div>
          </CampoGuiado>

          {/* Solo si hay algo que decir de lo elegido. Las dos frases ocupan la misma celda (la invisible reserva el alto); van por
              posición (0 = «Todo», 1 = la parte elegida), no por tipo: en el piso las dos pueden ser «de arranque». */}
          {arranqueVisible && (
            <div aria-live="polite" className="grid">
              {[arranqueTodo, arranqueParte].map((a, posicion) => {
                if (!a) return null;
                const visible = posicion === (queCuento === "todo" ? 0 : 1);
                return (
                  <div
                    key={posicion}
                    aria-hidden={visible ? undefined : true}
                    className={`col-start-1 row-start-1 flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-sm ${
                      a.tipo === "arranque" ? "border-sand bg-hueso text-tinta" : "border-ambar/35 bg-ambar/[0.07] text-tinta"
                    } ${visible ? "" : "invisible"}`}
                  >
                    <Flag aria-hidden strokeWidth={1.5} className={`mt-0.5 h-4 w-4 shrink-0 ${a.tipo === "arranque" ? "text-taupe" : "text-ambar-profundo"}`} />
                    <span className="min-w-0">
                      <b className="font-semibold">{a.titulo}.</b> {a.texto}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          <CampoGuiado id="quien" guia={guia} titulo="¿Quién cuenta?">
            <ComboResponsable control={responsable} deshabilitado={abriendo} compacto className="w-full @[36rem]:w-80" />
          </CampoGuiado>

          {error && (
            <Aviso tono="error">{error}</Aviso>
          )}
        </div>

        {/* «Tu conteo»: a la derecha en una tarjeta ancha; en una angosta, la barra pegada abajo con la cifra y el botón. */}
        <aside
          aria-label="Resumen del conteo"
          className="sticky bottom-0 z-10 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 rounded-b-[inherit] border-t border-sand bg-papel px-4 py-3 @[46rem]:static @[46rem]:flex @[46rem]:flex-col @[46rem]:items-stretch @[46rem]:gap-5 @[46rem]:rounded-b-none @[46rem]:rounded-r-[inherit] @[46rem]:border-l @[46rem]:border-t-0 @[46rem]:bg-hueso/50 @[46rem]:p-7"
        >
          <p className="eyebrow-cayla hidden !text-taupe @[46rem]:block">Tu conteo</p>

          {(alcance || queCuento === "prendas") && (
            <div aria-live="polite" className="flex min-w-0 items-baseline gap-2 @[46rem]:flex-col @[46rem]:gap-0.5">
              <span className={`font-display text-[26px] leading-none @[46rem]:text-[52px] ${cuantas === null ? "text-taupe/50" : "text-tinta"}`}>
                {cuantas === null ? "—" : <CifraQueCuenta valor={cuantas} />}
              </span>
              <span className="text-xs text-taupe @[46rem]:text-sm">
                {cuantas === null ? (
                  // Sin cifra todavía: en la tarjeta ancha se dice qué falta elegir; en la barra angosta, una línea (el «Falta:» de abajo ya lo dice).
                  <>
                    <span className="@[46rem]:hidden">variantes por contar</span>
                    <span className="hidden @[46rem]:inline">
                      {separaPisoAlmacen && !lugar
                        ? "Elige dónde para ver cuántas variantes"
                        : queCuento === "prendas"
                          ? "Elige las prendas para ver cuántas variantes"
                          : "Elige la categoría para ver cuántas variantes"}
                    </span>
                  </>
                ) : cuantas === 1 ? (
                  "variante por contar"
                ) : (
                  "variantes por contar"
                )}
              </span>
            </div>
          )}

          <dl className="hidden border-t border-sand text-sm @[46rem]:block">
            <Fila etiqueta="Dónde" valor={textoDonde} />
            <Fila etiqueta="Qué" valor={textoQue} />
            <Fila etiqueta="Cuenta" valor={nombreElegido} />
          </dl>
          <p className="hidden text-[12.5px] leading-relaxed text-taupe @[46rem]:block">
            Al empezar se congela lo que CAYLA dice que hay, para compararlo con lo que cuentes.
          </p>

          <div className="col-span-2 row-start-2 @[46rem]:col-auto @[46rem]:row-auto @[46rem]:mt-auto">
            <PieGuia guia={guia} listo="Todo listo para empezar." />
          </div>
          <button
            type="button"
            onClick={() => void abrir()}
            disabled={!listo || abriendo}
            title={guia.frase ?? undefined}
            className={`btn-cayla btn-primario col-start-2 row-start-1 h-11 @[46rem]:col-auto @[46rem]:row-auto @[46rem]:h-12 @[46rem]:w-full ${guia.claseConfirmar}`}
          >
            {abriendo ? "Abriendo…" : "Empezar conteo"}
          </button>
        </aside>
      </div>
    </section>
  );
}

/** El lugar de búsqueda de «Por prenda»: el piso o el almacén elegido, toda la ubicación en una sede que no los separa, o `null` si falta elegir. */
function tipoDeLugar(separaPisoAlmacen: boolean, tipo: string | null | undefined): LugarDeConteo | null {
  if (!separaPisoAlmacen) return "toda";
  return tipo === "piso_venta" || tipo === "almacen_tienda" ? tipo : null;
}

/** «175 variantes registradas» / «1 variante registrada». */
function textoVariantesRegistradas(n: number): string {
  return `${n.toLocaleString("es-PE")} ${n === 1 ? "variante registrada" : "variantes registradas"}`;
}

/** Una línea del resumen de «Tu conteo»: lo que falta elegir se lee apagado, sin culpar a nadie. */
function Fila({ etiqueta, valor }: { etiqueta: string; valor: string | null }) {
  return (
    <div className="flex justify-between gap-3 border-b border-sand py-2.5">
      <dt className="text-taupe">{etiqueta}</dt>
      <dd className={`text-right ${valor ? "font-medium text-tinta" : "text-taupe/70"}`}>{valor ?? "Sin elegir"}</dd>
    </div>
  );
}

/** Flechas de un `radiogroup`: el índice al que se pasa (con vuelta) o `null` si la tecla no es una flecha. */
function flechaDeRadio(tecla: string, i: number, total: number): number | null {
  const paso = tecla === "ArrowRight" || tecla === "ArrowDown" ? 1 : tecla === "ArrowLeft" || tecla === "ArrowUp" ? -1 : 0;
  return paso === 0 ? null : (i + paso + total) % total;
}

type OpcionTarjeta<T extends string> = { valor: T; titulo: string; linea: string; icono: ReactNode; cifra: string | null };

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
    const j = flechaDeRadio(e.key, i, opciones.length);
    if (j === null) return;
    e.preventDefault();
    onValor(opciones[j].valor);
    botones.current[j]?.focus();
  }

  return (
    <div role="radiogroup" aria-label={etiqueta} className="grid grid-cols-2 gap-2.5">
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
            className={`relative flex min-h-28 flex-col items-start rounded-lg border px-3.5 py-3.5 text-left transition-[border-color,background-color,box-shadow] duration-200 ease-cayla focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tinta/60 disabled:cursor-default @[30rem]:px-4 ${
              activa ? "border-tinta bg-sand/40 shadow-[inset_0_0_0_1px_var(--color-tinta)]" : "border-sand bg-papel hover:border-taupe/45"
            }`}
          >
            <span className={`mb-2 transition-colors duration-200 ${activa ? "text-tinta" : "text-taupe"}`}>{o.icono}</span>
            <span className="block text-[15px] font-medium text-tinta">{o.titulo}</span>
            <span className="block text-xs text-tinta-60">{o.linea}</span>
            {o.cifra && <span className="block text-xs text-taupe">{o.cifra}</span>}
            <span
              aria-hidden
              className={`absolute right-3 top-3 grid h-5 w-5 place-items-center rounded-full bg-tinta text-crema transition-[opacity,transform] duration-200 ease-cayla ${
                activa ? "scale-100 opacity-100" : "scale-[0.6] opacity-0"
              }`}
            >
              <svg viewBox="0 0 12 12" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2.5 6.4 5 8.8l4.5-5.2" />
              </svg>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Las categorías a la vista, con su buscador: elegir una es un toque. Con la cifra de cada una (variantes en el lugar elegido)
 * cuando se conoce, para saber de antemano de qué tamaño es el conteo. Una categoría con 0 sigue siendo elegible: no es un error.
 */
function ElegirCategoria({
  categorias,
  valor,
  onValor,
  buscador,
  cifraDe,
}: {
  categorias: Categoria[];
  valor: string;
  onValor: (id: string) => void;
  buscador: React.RefObject<HTMLInputElement | null>;
  cifraDe: ((categoriaId: string) => number) | null;
}) {
  const [consulta, setConsulta] = useState("");
  // Sin buscar: las que tienen prendas en este lugar, primero. Buscando manda lo que mejor coincide con lo escrito.
  // (Unas decenas de categorías por render: no vale la pena memorizarlo, y `cifraDe` cambia de identidad en cada render.)
  const visibles = filtrarCombo(categoriasPorVariantes(categorias, cifraDe), consulta, (c) => ({ texto: c.nombre }));
  const botones = useRef<(HTMLButtonElement | null)[]>([]);
  const elegida = visibles.findIndex((c) => c.id === valor);

  function alTeclado(e: React.KeyboardEvent<HTMLButtonElement>, i: number) {
    const j = flechaDeRadio(e.key, i, visibles.length);
    if (j === null) return;
    e.preventDefault();
    onValor(visibles[j].id);
    botones.current[j]?.focus();
  }

  return (
    <div className="space-y-3 pt-3">
      <label className="caja-cayla relative flex items-center gap-2 px-3 @[30rem]:max-w-sm">
        <Search className="h-4 w-4 shrink-0 text-taupe" aria-hidden />
        <span className="sr-only">Buscar categoría</span>
        <input
          ref={buscador}
          type="text"
          autoComplete="off"
          value={consulta}
          onChange={(e) => setConsulta(e.target.value)}
          onKeyDown={(e) => {
            // Un control que usa el Escape (aquí, borra su búsqueda) no lo deja pasar (ADR-0136).
            if (e.key === "Escape" && consulta) {
              e.stopPropagation();
              setConsulta("");
            }
          }}
          placeholder="Buscar categoría"
          className="h-10 w-full bg-transparent text-sm text-tinta outline-none placeholder:text-tinta/55"
        />
      </label>
      <div role="radiogroup" aria-label="Categoría" className="-mx-0.5 flex max-h-40 flex-wrap gap-2 overflow-y-auto p-0.5">
        {visibles.length === 0 && <p className="py-1.5 text-[13px] text-taupe">Ninguna categoría se llama así.</p>}
        {visibles.map((c, i) => {
          const activa = c.id === valor;
          return (
            <button
              key={c.id}
              ref={(el) => {
                botones.current[i] = el;
              }}
              type="button"
              role="radio"
              aria-checked={activa}
              tabIndex={(elegida === -1 ? i === 0 : activa) ? 0 : -1}
              onClick={() => onValor(c.id)}
              onKeyDown={(e) => alTeclado(e, i)}
              className={`inline-flex items-baseline gap-1.5 rounded-full border px-3.5 py-1.5 text-[13.5px] transition-colors duration-150 ease-cayla focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tinta/60 ${
                activa ? "border-tinta bg-tinta text-crema" : `border-sand bg-papel hover:border-taupe/45 ${cifraDe && cifraDe(c.id) === 0 ? "text-tinta/55" : "text-tinta"}`
              }`}
            >
              {c.nombre}
              {cifraDe && <small className={`text-xs ${activa ? "text-crema/70" : "text-taupe"}`}>{cifraDe(c.id).toLocaleString("es-PE")}</small>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
