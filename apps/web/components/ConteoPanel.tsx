"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { avisoDeRed } from "@/lib/sin-red";
import { AltaEnConteo, type ModeloRecordado } from "@/components/AltaEnConteo";
import type {
  CatalogoParaConteo,
  CategoriaElegible,
  ColorElegible,
  ConteoAbierto,
  LineaContada,
  VarianteParaConteo,
} from "@/lib/conteo";

/**
 * La pantalla de contar. Está escrita alrededor de un gesto que se repite 500 veces:
 * levantar una prenda, escanearla, teclear cuántas hay, soltarla.
 *
 * TRES REGLAS QUE NO SON OBVIAS Y QUE HAY QUE RESPETAR SI SE TOCA ESTE ARCHIVO:
 *
 * 1. PROHIBIDO `router.refresh()` POR ESCANEO. El resto de los modales del repo lo
 *    llaman al terminar (`BajarATiendaModal.tsx:51`, `MovimientoModal.tsx:99`) y está
 *    bien ahí: son acciones sueltas. Acá serían 500 recargas completas de página contra
 *    São Paulo (~322 ms cada una, ADR-0013) y el censo se vuelve inusable. El estado se
 *    actualiza local y optimista; el servidor ya tiene la verdad.
 *
 * 2. CONTEO A CIEGAS. La cantidad que el sistema cree que hay NO se muestra hasta que
 *    la persona guarda la suya. Si la ve antes, la copia — es involuntario y es humano,
 *    y arruina el conteo. Es la misma disciplina que el cierre de caja a ciegas que
 *    Felipe ya conoce.
 *
 * 3. CADA DISPARO ES UNA PRENDA. La RPC se llama en modo 'sumar', así que escanear dos
 *    veces la misma blusa cuenta dos. Con modo absoluto el segundo escaneo pisaría al
 *    primero y el conteo siempre daría 1.
 */

type Props = {
  persona: { sedeId: string; sedeCodigo: string; esLider: boolean };
  conteo: ConteoAbierto | null;
  catalogo: CatalogoParaConteo;
  categorias: CategoriaElegible[];
  colores: ColorElegible[];
  /**
   * Cuándo armó el servidor esta pantalla. Sin red, el service worker sirve la ÚLTIMA
   * versión que se cargó con internet — con su catálogo y con este timestamp — así que esto
   * es la edad REAL de la foto contra la que se está contando, no la hora actual. Es el dato
   * que convierte "datos viejos en silencio" en "datos viejos, y de cuándo". Ver ADR-0032.
   */
  generadoEn: string;
};

/** Cola de reintento. NO es local-first (eso es ADR-0018): es la red floja de la tienda. */
const LLAVE_PENDIENTES = "cayla:conteo:pendientes:v1";
type Pendiente = { varianteId: string; cantidad: number; referencia: string };

const clave = (t: string) =>
  t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();

export function ConteoPanel({ persona, conteo, catalogo, categorias, colores, generadoEn }: Props) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  // Sobrevive a cada alta porque vive acá: `AltaEnConteo` se monta y se desmonta con
  // cada prenda nueva, así que guardarlo adentro sería perderlo justo entre una y otra.
  const [modelo, setModelo] = useState<ModeloRecordado | null>(null);

  const [lineas, setLineas] = useState<LineaContada[]>(conteo?.lineas ?? []);
  const [termino, setTermino] = useState("");
  const [candidatas, setCandidatas] = useState<VarianteParaConteo[] | null>(null);
  const [elegida, setElegida] = useState<VarianteParaConteo | null>(null);
  const [cantidad, setCantidad] = useState("1");
  const [desconocido, setDesconocido] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [abriendo, setAbriendo] = useState(false);
  const [pendientes, setPendientes] = useState<Pendiente[]>([]);
  // Arranca en `true` a propósito: en el servidor no hay `navigator`, y empezar en `false`
  // pintaría "sin internet" durante el primer render de CADA carga, incluidas las buenas.
  // El efecto de montaje corrige enseguida si de verdad no hay red.
  const [enLinea, setEnLinea] = useState(true);
  // Lo pone el service worker cuando sirve esta pantalla desde la caché (ADR-0032). Es la
  // única señal que no miente: con el servidor caído y el wifi vivo, `navigator.onLine`
  // sigue diciendo `true` — comprobado apagando el servidor en la prueba.
  const [desdeCache, setDesdeCache] = useState(false);
  // Evita que el reintento automático se dispare encima de sí mismo: la cola cambia cuando
  // termina, y sin este candado ese cambio volvería a disparar el efecto.
  const reintentando = useRef(false);
  // Corregir una cantidad ya contada. Ver el comentario del botón, abajo.
  const [corrigiendoId, setCorrigiendoId] = useState<string | null>(null);
  const [correccion, setCorreccion] = useState("");

  const buscador = useRef<HTMLInputElement>(null);
  const campoCantidad = useRef<HTMLInputElement>(null);

  const porVariante = useMemo(() => {
    const m = new Map<string, VarianteParaConteo>();
    for (const v of catalogo.variantes) m.set(v.varianteId, v);
    return m;
  }, [catalogo.variantes]);

  // ---------- cola de reintento ----------
  const guardarPendientes = useCallback((cola: Pendiente[]) => {
    setPendientes(cola);
    try {
      localStorage.setItem(LLAVE_PENDIENTES, JSON.stringify(cola));
    } catch {
      // Modo privado o almacenamiento lleno: se pierde la cola, no el conteo ya guardado.
    }
  }, []);

  useEffect(() => {
    try {
      const crudo = localStorage.getItem(LLAVE_PENDIENTES);
      // La regla `set-state-in-effect` queda apagada SOLO en esta línea, y el motivo no es
      // que moleste: `localStorage` no existe en el servidor. Leerlo durante el render
      // devolvería `[]` en Node y la cola real en el navegador — dos árboles distintos para
      // el mismo render, que es exactamente lo que rompe la hidratación. Un efecto de
      // montaje ES el patrón correcto para traer un valor que solo existe en el cliente.
      // Lo que la regla persigue de verdad es derivar estado de props, y ese caso está
      // doce líneas más abajo, arreglado de la forma que corresponde.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (crudo) setPendientes(JSON.parse(crudo) as Pendiente[]);
    } catch {
      setPendientes([]);
    }
  }, []);

  // Cuando el servidor vuelve a mandar el conteo (solo pasa al abrirlo, al crear una
  // prenda o al reintentar la cola — nunca por escaneo), su versión manda sobre la
  // optimista. Sin esto, una prenda creada al vuelo quedaría dos veces en la lista: la
  // fila local con id inventado y la real que llega del servidor.
  //
  // Se ajusta DURANTE EL RENDER y no en un efecto, que es el reemplazo que documenta React
  // para "sincronizar estado con una prop". No es solo para callar al linter: un efecto
  // corre después de pintar, así que la lista vieja alcanzaba a verse un instante antes de
  // corregirse. En una pantalla donde se cuenta inventario, ese parpadeo es una fila que
  // alguien puede leer como buena. React vuelve a renderizar de inmediato con el valor
  // nuevo, sin llegar a pintar el viejo ni a bajar a los hijos.
  //
  // El montaje no necesita nada: `lineas` ya nace de `conteo?.lineas` en su `useState`.
  const [conteoPrevio, setConteoPrevio] = useState(conteo);
  if (conteo !== conteoPrevio) {
    setConteoPrevio(conteo);
    setLineas(conteo?.lineas ?? []);
  }

  const enfocarBuscador = useCallback(() => {
    // `requestAnimationFrame` y no un foco directo: el input de cantidad todavía puede
    // tener el foco cuando React re-renderiza, y el navegador lo devuelve solo.
    requestAnimationFrame(() => buscador.current?.focus());
  }, []);

  // ---------- registrar una línea contada ----------
  const contar = useCallback(
    async (variante: VarianteParaConteo, cuantas: number) => {
      if (!conteo) return;
      setGuardando(true);
      setError(null);

      const { error: err } = await supabase.rpc("conteo_contar", {
        p_conteo_id: conteo.id,
        p_variante_id: variante.varianteId,
        p_cantidad: cuantas,
        p_modo: "sumar",
      });

      setGuardando(false);

      if (err) {
        // No se pierde el trabajo: va a la cola y la persona sigue contando.
        guardarPendientes([
          ...pendientes,
          { varianteId: variante.varianteId, cantidad: cuantas, referencia: variante.referencia },
        ]);
        setError(traducirError(err, "guardar lo contado"));
        return;
      }

      setLineas((previas) => {
        const yaEsta = previas.find((l) => l.varianteId === variante.varianteId);
        if (yaEsta) {
          // `sistema` NO se recalcula: es lo que el sistema decía cuando se contó la
          // primera vez, y así es como la RPC lo guarda (ADR-0027).
          return previas.map((l) =>
            l.varianteId === variante.varianteId ? { ...l, contada: l.contada + cuantas } : l
          );
        }
        const nueva: LineaContada = {
          lineaId: `local-${variante.varianteId}`,
          varianteId: variante.varianteId,
          codigo: variante.codigo,
          referencia: variante.referencia,
          talla: variante.talla,
          color: variante.color,
          contada: cuantas,
          sistema: variante.enSistema,
          contadaEn: new Date().toISOString(),
        };
        return [nueva, ...previas];
      });

      setElegida(null);
      setCandidatas(null);
      setTermino("");
      setCantidad("1");
      enfocarBuscador();
    },
    [conteo, supabase, pendientes, guardarPendientes, enfocarBuscador]
  );

  /**
   * Fijar la cantidad de una prenda ya contada, en vez de sumarle.
   *
   * Es el único lugar que usa `p_modo: 'fijar'`. Contar SUMA a propósito —cada disparo
   * de la pistola es una prenda que levantaste de la pila—, pero eso deja sin arreglo
   * el 40 tecleado donde iban 4. La RPC ya sabía fijar desde el principio (ADR-0027);
   * lo que faltaba era exponerlo.
   *
   * `cantidad_sistema` NO se toca: sigue siendo lo que el sistema decía en el primer
   * escaneo. Corregir el dedo gordo de alguien no reescribe el instante que la línea
   * afirma.
   */
  async function corregir(linea: LineaContada, nueva: number) {
    if (!conteo) return;
    setGuardando(true);
    setError(null);

    const { error: err } = await supabase.rpc("conteo_contar", {
      p_conteo_id: conteo.id,
      p_variante_id: linea.varianteId,
      p_cantidad: nueva,
      p_modo: "fijar",
    });

    setGuardando(false);
    if (err) {
      setError(traducirError(err, "corregir la cantidad"));
      return;
    }

    setLineas((previas) =>
      previas.map((l) => (l.varianteId === linea.varianteId ? { ...l, contada: nueva } : l))
    );
    setCorrigiendoId(null);
    enfocarBuscador();
  }

  const reintentar = useCallback(async () => {
    if (!conteo || pendientes.length === 0 || reintentando.current) return;
    reintentando.current = true;
    setGuardando(true);
    const quedan: Pendiente[] = [];
    for (const p of pendientes) {
      const { error: err } = await supabase.rpc("conteo_contar", {
        p_conteo_id: conteo.id,
        p_variante_id: p.varianteId,
        p_cantidad: p.cantidad,
        p_modo: "sumar",
      });
      if (err) quedan.push(p);
    }
    setGuardando(false);
    reintentando.current = false;
    guardarPendientes(quedan);
    if (quedan.length === 0) {
      setError(null);
      router.refresh(); // Una sola vez, al final: acá sí conviene releer del servidor.
    }
  }, [conteo, pendientes, supabase, guardarPendientes, router]);

  // ---------- la red que va y viene ----------
  // El censo dura días con la red de la tienda: la conexión se cae y vuelve sola muchas
  // veces. Antes la cola solo se vaciaba si alguien se acordaba de apretar «Reintentar»;
  // una persona escaneando 500 prendas no está mirando ese botón.
  useEffect(() => {
    const alCambiar = () => setEnLinea(navigator.onLine);
    alCambiar();
    window.addEventListener("online", alCambiar);
    window.addEventListener("offline", alCambiar);
    return () => {
      window.removeEventListener("online", alCambiar);
      window.removeEventListener("offline", alCambiar);
    };
  }, []);

  // La marca que dejó el worker. Se lee una vez, al montar: describe CÓMO llegó este
  // documento, y eso ya no cambia mientras la pestaña siga viva. `caches` no existe en
  // contextos no seguros ni en navegadores viejos, así que el `catch` deja el aviso apagado
  // en vez de romper la pantalla del censo.
  useEffect(() => {
    let vigente = true;
    void (async () => {
      try {
        const marca = await caches.match("/__cayla/servido-desde-cache");
        if (vigente && marca) setDesdeCache(true);
      } catch {
        /* sin Cache API: se cae al comportamiento de antes, que es `navigator.onLine` solo. */
      }
    })();
    return () => {
      vigente = false;
    };
  }, []);

  // `navigator.onLine` dice "hay una interfaz de red", no "el servidor contesta" — un wifi
  // de tienda conectado a un router sin salida da `true`. Por eso el reintento no confía en
  // el evento: intenta, y si vuelve a fallar la cola se queda como estaba y se reintentará
  // en el próximo `online`. El costo de un intento de más es una petición; el de uno de
  // menos es una prenda contada que nunca sube.
  useEffect(() => {
    if (!enLinea || pendientes.length === 0) return;
    // `set-state-in-effect` apagada acá, y por el mismo criterio que doce líneas más arriba:
    // lo que la regla persigue es DERIVAR estado de props durante el render. Esto es lo
    // contrario — sincronizar con un sistema externo (el servidor) cuando una condición del
    // mundo cambia, que es para lo que existe `useEffect`. El `setGuardando(true)` que
    // dispara la alarma es el prólogo de una llamada de red, no un valor calculado.
    // La alternativa —reintentar solo desde el evento `online`— se ve más limpia y pierde el
    // caso que más importa: abrir la pantalla con una cola que quedó de ayer en este equipo.
    // Ahí no hay transición que escuchar, porque la red nunca se fue: llegó antes que nadie.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reintentar();
  }, [enLinea, pendientes.length, reintentar]);

  // El texto que la Encargada lee sobre la red. La lógica vive en `lib/sin-red.ts` para
  // poder fijarla por prueba: es lo único de todo el service worker que ella llega a ver.
  const aviso = avisoDeRed({ enLinea, desdeCache, pendientes: pendientes.length, generadoEn });
  const sinConexion = !enLinea || desdeCache;

  // El aviso se arma una vez y se usa en las DOS ramas del render. La primera versión vivía
  // solo en la del conteo abierto, y la prueba con el servidor apagado lo destapó: la pantalla
  // volvía a abrir —que era el objetivo— pero callada. Y la rama SIN conteo abierto es donde
  // más falta hace, porque el único botón que ofrece necesita servidor.
  const nodoAviso = aviso ? (
    <div
      className={`card-cayla flex flex-wrap items-center justify-between gap-3 p-4 ${
        aviso.tono === "sin-red" ? "border-rojo/40" : "border-ambar/50"
      }`}
    >
      <div className="min-w-0">
        <p className="label-cayla text-[11px] text-tinta">{aviso.titulo}</p>
        <p className="mt-1 text-sm text-tinta/80">{aviso.detalle}</p>
      </div>
      {/* El botón queda, aunque el reintento ahora sea automático: `navigator.onLine` puede
          decir que hay red cuando el router no tiene salida, y en ese caso la única señal de
          que volvió es que alguien lo pruebe. Sin conexión no se ofrece — apretarlo solo
          produciría una espera y un fallo. */}
      {!sinConexion && pendientes.length > 0 && (
        <button
          onClick={() => void reintentar()}
          disabled={guardando}
          className="label-cayla shrink-0 rounded-md border border-ambar px-4 py-2 text-[11px] text-ambar disabled:opacity-60"
        >
          Reintentar ahora
        </button>
      )}
    </div>
  ) : null;

  // ---------- buscar / escanear ----------
  function resolver(e: React.FormEvent) {
    e.preventDefault();
    const texto = termino.trim();
    if (!texto) return;
    setError(null);
    setDesconocido(null);

    // 1. ¿Es un código? La pistola teclea y manda Enter, así que este es el camino normal.
    const varianteId = catalogo.porCodigo[texto] ?? catalogo.porCodigo[texto.toUpperCase()];
    if (varianteId) {
      const v = porVariante.get(varianteId);
      if (v) return elegir(v);
    }

    // 2. Si no, texto: nombre, talla, color, sku o código a medias.
    const k = clave(texto);
    const halladas = catalogo.variantes.filter((v) =>
      clave(`${v.referencia} ${v.talla ?? ""} ${v.color ?? ""} ${v.sku} ${v.codigo ?? ""}`).includes(k)
    );

    if (halladas.length === 1) return elegir(halladas[0]);
    if (halladas.length > 1) return setCandidatas(halladas.slice(0, 20));

    // 3. Nada. Acá es donde el conteo se convierte en censo.
    setCandidatas(null);
    setElegida(null);
    setDesconocido(texto);
  }

  function elegir(v: VarianteParaConteo) {
    setElegida(v);
    setCandidatas(null);
    setDesconocido(null);
    setCantidad("1");
    requestAnimationFrame(() => {
      campoCantidad.current?.focus();
      campoCantidad.current?.select();
    });
  }

  async function abrirConteo() {
    setAbriendo(true);
    setError(null);
    const { error: err } = await supabase.rpc("abrir_conteo", {
      p_sede_id: persona.sedeId,
      p_alcance: "todo",
      p_ubicacion: "piso",
      p_nombre: `Conteo ${persona.sedeCodigo} ${new Date().toLocaleDateString("es-PE")}`,
    });
    setAbriendo(false);
    if (err) return setError(traducirError(err, "abrir el conteo"));
    router.refresh();
  }

  // ---------- sin conteo abierto ----------
  if (!conteo) {
    return (
      <div className="space-y-4">
        {nodoAviso}
        <div className="card-cayla space-y-4 p-6">
        <div>
          <h2 className="font-display text-xl text-tinta">No hay un conteo abierto en {persona.sedeCodigo}</h2>
          <p className="mt-2 max-w-prose text-sm text-tinta/70">
            Al abrirlo, cada prenda que cuentes queda anotada pero <strong>no toca el inventario</strong>.
            El stock recién se corrige cuando la Líder cierra el conteo y aprueba lo contado.
          </p>
        </div>
        {error && <p className="text-sm text-rojo">{error}</p>}
        <button
          onClick={abrirConteo}
          disabled={abriendo || sinConexion}
          className="label-cayla rounded-md bg-rojo px-5 py-3 text-[11px] text-crema transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {abriendo ? "Abriendo…" : "Abrir conteo del piso"}
        </button>
        {/* ABRIR un conteo sí necesita servidor: crea la fila contra la que se cuenta después.
            Ofrecer el botón sin conexión sería prometer algo que va a fallar. Contar, en
            cambio, sigue funcionando — pero solo sobre un conteo que ya estaba abierto. */}
        {sinConexion && (
          <p className="text-sm text-tinta/70">
            Abrir un conteo necesita conexión — es lo único de esta pantalla que no se puede
            hacer sin ella. Si ya había uno abierto, se puede seguir contando: recarga cuando
            vuelva la señal.
          </p>
        )}
        </div>
      </div>
    );
  }

  const unidades = lineas.reduce((s, l) => s + l.contada, 0);
  const faltan = Math.max(0, conteo.faltanPorContar - lineas.filter((l) => !conteo.lineas.some((o) => o.varianteId === l.varianteId)).length);

  return (
    <div className="space-y-4">
      {/* ---------- progreso: dos números verdaderos, no una fracción inventada ---------- */}
      <div className="card-cayla flex flex-wrap items-baseline gap-x-6 gap-y-1 p-4">
        <span className="font-display text-2xl text-tinta">{unidades}</span>
        <span className="text-sm text-tinta/70">
          prendas contadas · {lineas.length} {lineas.length === 1 ? "modelo" : "modelos"}
        </span>
        {faltan > 0 && (
          <span className="text-sm text-ambar">faltan {faltan} que el sistema cree que están acá</span>
        )}
        {persona.esLider && (
          <Link
            href="/inventario/conteo/cerrar"
            className="label-cayla ml-auto rounded-md border border-tinta/25 px-4 py-2 text-[11px] text-tinta transition-colors hover:border-rojo hover:text-rojo"
          >
            Revisar y cerrar
          </Link>
        )}
      </div>

      {nodoAviso}

      {/* ---------- el buscador: la pistola teclea acá y manda Enter ---------- */}
      <form onSubmit={resolver} className="card-cayla p-4">
        <label htmlFor="escaneo" className="label-cayla text-[11px] text-tinta/70">
          Escanea o escribe
        </label>
        <input
          id="escaneo"
          ref={buscador}
          autoFocus
          autoComplete="off"
          value={termino}
          onChange={(e) => setTermino(e.target.value)}
          placeholder="Apunta la pistola, o escribe el nombre de la prenda"
          className="mt-1.5 w-full border-b border-tinta/20 bg-transparent pb-2 font-mono text-base text-tinta outline-none focus:border-rojo"
        />
      </form>

      {error && <p className="text-sm text-rojo">{error}</p>}

      {/* ---------- lo escaneado no existe: crear al vuelo ---------- */}
      {desconocido && (
        <AltaEnConteo
          conteoId={conteo.id}
          codigoEscaneado={desconocido}
          categorias={categorias}
          colores={colores}
          modelo={modelo}
          onModelo={setModelo}
          onCancelar={() => {
            setDesconocido(null);
            setTermino("");
            enfocarBuscador();
          }}
          onCreada={(linea) => {
            setLineas((previas) => [linea, ...previas]);
            setDesconocido(null);
            setTermino("");
            enfocarBuscador();
            // LA ÚNICA EXCEPCIÓN a la regla de no refrescar (ver cabecera), y hace
            // falta: el mapa de códigos viene del servidor, así que la prenda recién
            // creada todavía no es escaneable en esta sesión. Sin esto, volver a
            // escanear el mismo código reabre el formulario de alta y la Encargada
            // lo llena de nuevo — y el mismo modelo aparece en dos pilas todo el
            // tiempo durante un censo.
            //
            // El costo es aceptable porque esto ocurre una vez por prenda NUEVA, no
            // por escaneo: crear ya implica llenar un formulario, así que los ~322 ms
            // del viaje no se notan. Escanear, que es el gesto de las 500 veces, sigue
            // sin tocar el servidor para leer.
            router.refresh();
          }}
        />
      )}

      {/* ---------- varias coincidencias ---------- */}
      {candidatas && (
        <div className="card-cayla divide-y divide-tinta/10 p-2">
          <p className="px-2 pb-2 text-xs text-tinta/65">{candidatas.length} prendas coinciden — elige una</p>
          {candidatas.map((v) => (
            <button
              key={v.varianteId}
              onClick={() => elegir(v)}
              className="flex w-full items-baseline justify-between gap-3 px-2 py-2.5 text-left hover:text-rojo"
            >
              <span className="text-sm text-tinta">{v.referencia}</span>
              <span className="shrink-0 text-xs text-tinta/65">
                {[v.talla, v.color].filter(Boolean).join(" · ")}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* ---------- la prenda elegida: cuántas hay ---------- */}
      {elegida && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const n = Number(cantidad);
            if (!Number.isFinite(n) || n < 0) return;
            void contar(elegida, n);
          }}
          className="card-cayla space-y-4 border-rojo/40 p-5"
        >
          <div>
            <p className="font-display text-xl text-tinta">{elegida.referencia}</p>
            <p className="mt-0.5 text-sm text-tinta/70">
              {[elegida.talla, elegida.color].filter(Boolean).join(" · ") || "Sin talla ni color"}
            </p>
            <p className="mt-1 font-mono text-xs text-tinta/50">{elegida.codigo ?? elegida.sku}</p>
          </div>

          <div>
            <label htmlFor="cuantas" className="label-cayla text-[11px] text-tinta/70">
              ¿Cuántas hay?
            </label>
            <input
              id="cuantas"
              ref={campoCantidad}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={cantidad}
              onChange={(e) => setCantidad(e.target.value.replace(/[^0-9]/g, ""))}
              className="font-display mt-1 w-32 border-b-2 border-tinta/25 bg-transparent pb-1 text-4xl text-tinta outline-none focus:border-rojo"
            />
            <p className="mt-2 text-xs text-tinta/55">
              No te digo cuántas creo que hay hasta que guardes — si lo vieras antes, lo copiarías sin querer.
            </p>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setElegida(null);
                setTermino("");
                enfocarBuscador();
              }}
              className="label-cayla rounded-md border border-tinta/25 px-4 py-3 text-[11px] text-tinta"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={guardando}
              className="label-cayla flex-1 rounded-md bg-rojo px-5 py-3 text-[11px] text-crema transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {guardando ? "Guardando…" : "Guardar y seguir"}
            </button>
          </div>
        </form>
      )}

      {/* ---------- lo ya contado ---------- */}
      {lineas.length > 0 && (
        <div className="card-cayla divide-y divide-tinta/10 p-2">
          <p className="label-cayla px-2 pb-2 text-[11px] text-tinta/65">Ya contadas</p>
          {lineas.map((l) => {
            const dif = l.contada - l.sistema;
            const corrigiendo = corrigiendoId === l.varianteId;
            return (
              <div key={l.varianteId} className="flex items-baseline justify-between gap-3 px-2 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm text-tinta">{l.referencia}</p>
                  <p className="text-xs text-tinta/60">
                    {[l.talla, l.color].filter(Boolean).join(" · ")}
                  </p>
                </div>

                {corrigiendo ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const n = Number(correccion);
                      if (!Number.isFinite(n) || n < 0) return;
                      void corregir(l, n);
                    }}
                    className="flex shrink-0 items-center gap-1.5"
                  >
                    <input
                      autoFocus
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={correccion}
                      onChange={(e) => setCorreccion(e.target.value.replace(/[^0-9]/g, ""))}
                      className="w-14 border-b-2 border-rojo bg-transparent pb-0.5 text-right font-display text-lg text-tinta outline-none"
                    />
                    <button
                      type="submit"
                      disabled={guardando}
                      className="label-cayla rounded bg-rojo px-2.5 py-1.5 text-[10px] text-crema disabled:opacity-60"
                    >
                      Fijar
                    </button>
                    <button
                      type="button"
                      onClick={() => setCorrigiendoId(null)}
                      className="label-cayla px-1 text-[10px] text-tinta/60"
                    >
                      No
                    </button>
                  </form>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setCorrigiendoId(l.varianteId);
                      setCorreccion(String(l.contada));
                    }}
                    className="shrink-0 text-right"
                    // Sin esto, un 40 tecleado donde iban 4 no tiene arreglo desde la
                    // pantalla: contar solo SUMA. En un censo de cientos de prendas el
                    // error de tecleo es seguro, y mandar a la Encargada a buscar a la
                    // Líder por su propio dedo gordo es la clase de fricción que hace
                    // que el sistema se abandone (principio 10).
                    title="Tocar para corregir la cantidad"
                  >
                    <p className="font-display text-lg text-tinta underline decoration-tinta/20 decoration-dotted underline-offset-4">
                      {l.contada}
                    </p>
                    {dif !== 0 && (
                      <p className={`text-xs ${dif > 0 ? "text-verde" : "text-rojo"}`}>
                        antes {l.sistema} · {dif > 0 ? "+" : ""}
                        {dif}
                      </p>
                    )}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      <p className="px-1 text-xs text-tinta/55">
        Lo contado no toca el inventario todavía.{" "}
        {persona.esLider ? (
          <>
            Cuando termines,{" "}
            <Link href="/inventario/conteo/cerrar" className="text-rojo hover:underline">
              revísalo y ciérralo
            </Link>{" "}
            para que el stock se corrija.
          </>
        ) : (
          "La Líder lo revisa y lo cierra."
        )}
      </p>
    </div>
  );
}
