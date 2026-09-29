"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { Camera, ScanBarcode, X } from "lucide-react";
import { ComboResponsable } from "@/components/ComboResponsable";
import { EscanerConteo, type LecturaConteo } from "@/components/EscanerConteo";
import { AltaAlVuelo } from "@/components/conteo/AltaAlVuelo";
import { ControlConteo, type EstadoGuardado, type FalloDeGuardado } from "@/components/conteo/control-conteo";
import { ListaConteo } from "@/components/conteo/ListaConteo";
import { ResumenConteo } from "@/components/conteo/ResumenConteo";
import { BarraFija } from "@/components/ui/BarraFija";
import { resolverCodigoV2 } from "@/lib/buscar-prenda-v2";
import { sonidoDeLectura } from "@/lib/conteo-conectado";
import {
  acotarALista,
  agruparConteo,
  coincidenciasPorCodigo,
  filtrarConteo,
  sumarLectura,
  type DetalleConteo,
  type PrendaConteo,
} from "@/lib/conteo-reglas";
import { traducirError } from "@/lib/error-escritura";
import type { CatalogoMarcas } from "@/lib/marcas-datos";
import { firmar } from "@/lib/responsable-reglas";
import { avisarLectura } from "@/lib/sonido-conteo";
import { createClient } from "@/lib/supabase/client";
import { useResponsable } from "@/lib/useResponsable";

/* ====================================================================
   ContarConteo · la pantalla donde se cuenta (Inventario ▸ Conteo ▸ Contar, rediseño 2026-09-29)

   Quien cuenta recorre la tienda con la lista en la mano: por cada variante ve lo que CAYLA dice que debe haber y
   anota lo que encuentra. Tres formas de anotar, todas al mismo total de la variante:
     · escanear con la pistola (Enter) o la cámara en ráfaga: cada lectura suma 1;
     · escribir el número directo en su fila (no hace falta escanear doce veces doce blusas iguales);
     · buscar por producto, color, talla o código en el mismo campo del escáner.
   Vacío no es cero: una variante sin número está «Pendiente». Borrar un número la des-cuenta.

   Cómo se sostiene con ~1.100 variantes (ver `control-conteo.ts`): el estado de las líneas vive en un almacén fuera de
   React con suscripción por variante; cada fila es un `memo` con el texto de su campo como estado propio. Esta pantalla
   solo se entera de dos cosas: que el AGRUPADO cambió (una línea apareció o desapareció, o se filtró) y sus propios
   avisos. Escribir en una fila o recibir la respuesta de la base no vuelve a dibujar las demás.

   Lo que sale de esta pantalla siempre pasa por aquí antes de irse: «Revisar conteo» suelta el guardado pendiente y
   ESPERA a que la base responda (si algo falló, no navega: la lectura no se pierde en silencio), y salir por cualquier
   otro camino también suelta lo que esperaba. Recargar el navegador lo recupera todo de la base.

   Un solo aviso a la vez en la barra de abajo, el más reciente: prenda fuera de alcance («Agregar igual» / «No agregar»),
   código que no existe («Dar de alta esta prenda»), guardado que falló («Reintentar»). Vive en la barra y no en un
   modal ni un aviso flotante: la lista de arriba no se mueve y la mano sigue donde estaba.
   ==================================================================== */

type Aviso =
  | { tipo: "fuera"; varianteId: string; cantidad: number }
  | { tipo: "no_encontrado"; codigo: string }
  | { tipo: "no_guardo"; varianteId: string; cantidad: number | null; confirmoFuera: boolean; mensaje: string }
  | { tipo: "texto"; texto: string };

type Lectura = { tipo: "sumada"; cantidad: number } | { tipo: "fuera" } | { tipo: "sin_responsable" };

/** Una línea del conteo cuya variante el catálogo (copiado al abrir la pantalla) todavía no conoce: se dibuja igual, sin ficha. */
const SIN_FICHA = new Map<string, PrendaConteo>();
function prendaSinFicha(varianteId: string): PrendaConteo {
  let p = SIN_FICHA.get(varianteId);
  if (!p) {
    p = { varianteId, productoId: `sin-ficha-${varianteId}`, categoriaId: null, referencia: "Prenda sin ficha", talla: null, color: null, colorHex: null, fotoUrl: null, sku: "", codigosBarras: [], activo: true };
    SIN_FICHA.set(varianteId, p);
  }
  return p;
}

const detalleDe = (p: { talla: string | null; color: string | null }) => [p.talla, p.color].filter(Boolean).join(" · ");
const nombreDe = (p: PrendaConteo) => [p.referencia, p.color, p.talla].filter(Boolean).join(" · ");

/** Los campos «Contaste» que se ven (los de perchas o filas escondidas por el buscador no cuentan para saltar con Enter). */
const CAMPOS_VISIBLES = "tbody:not([hidden]) > tr:not([hidden]) input[data-contaste]";

/** Los avisos de «solo texto» (falta el responsable, número inválido) se van solos: no piden una respuesta. */
const MS_AVISO_TEXTO = 8000;

export type PropsContarConteo = {
  detalle: DetalleConteo;
  catalogo: PrendaConteo[];
  /** `?variantes=`: acota la lista a esas tallas (el conteo abierto sigue siendo el que es). */
  soloVariantes: string[];
  /** Un identificador de ESTA generación de la página (lo pone el servidor). Ver «frescura» abajo. */
  generadoEn: string;
  categorias: { id: string; nombre: string }[];
  colores: { codigo: string; nombre: string }[];
  tallasPorCategoria: Record<string, { id: string; texto: string }[]>;
  marcas: CatalogoMarcas;
  puedeCrearMarcas: boolean;
};

export function ContarConteo({ detalle, catalogo, soloVariantes, generadoEn, categorias, colores, tallasPorCategoria, marcas, puedeCrearMarcas }: PropsContarConteo) {
  const router = useRouter();
  const conteo = detalle.conteo;
  const responsable = useResponsable();

  // `useResponsable()` devuelve un objeto NUEVO en cada render: los guardados (que salen segundos después) leen el más reciente de aquí.
  const responsableRef = useRef(responsable);
  useEffect(() => {
    responsableRef.current = responsable;
  });

  // El catálogo del conteo + lo que se dé de alta al vuelo en esta sesión (el servidor no se vuelve a leer).
  const [catalogoNuevo, setCatalogoNuevo] = useState<PrendaConteo[]>([]);
  const catalogoCompleto = useMemo(() => (catalogoNuevo.length === 0 ? catalogo : [...catalogo, ...catalogoNuevo]), [catalogo, catalogoNuevo]);
  const porId = useMemo(() => new Map(catalogoCompleto.map((p) => [p.varianteId, p])), [catalogoCompleto]);
  const catalogoRef = useRef(catalogoCompleto);
  const porIdRef = useRef(porId);
  useEffect(() => {
    catalogoRef.current = catalogoCompleto;
    porIdRef.current = porId;
  }, [catalogoCompleto, porId]);

  const [aviso, setAviso] = useState<Aviso | null>(null);

  // El almacén del conteo se crea UNA vez. Lo que cambia con cada dibujo (el responsable vigente, el catálogo) se le
  // reconecta abajo: los guardados salen segundos después y tienen que usar lo más reciente, no lo de cuando se creó.
  const alcanceCategoria = conteo.alcance === "categoria" ? conteo.alcanceCategoriaId : null;
  const [control] = useState(() => new ControlConteo({ lineas: detalle.lineas, categoriaDelConteo: alcanceCategoria }));
  useEffect(() => {
    control.conectar({
      categoriaDe: (id) => porId.get(id)?.categoriaId ?? null,
      guardar: async ({ varianteId, cantidad, confirmoFuera }) => {
        // Sin loader a pantalla completa (`x-espera: no`, ADR-0149): es un guardado por lectura y el «Guardado» del pie lo dice.
        const consulta = createClient()
          .rpc("conteo_contar", {
            p_conteo_id: conteo.id,
            p_variante_id: varianteId,
            p_cantidad_contada: cantidad,
            ...(confirmoFuera ? { p_confirmo_fuera_de_alcance: true } : {}),
          })
          .setHeader("x-espera", "no");
        const { data, error } = await firmar(consulta, responsable.firma());
        return { data, error };
      },
      alFallar: (f: FalloDeGuardado) => {
        // Un rechazo por el responsable (asistencia) vacía el combo y relee la lista, como en todas las pantallas.
        responsable.despues(f.error);
        if (!f.revertida) return;
        if (f.error.hint === "fuera_de_alcance") {
          setAviso({ tipo: "fuera", varianteId: f.varianteId, cantidad: f.cantidad ?? 1 });
          return;
        }
        setAviso({ tipo: "no_guardo", varianteId: f.varianteId, cantidad: f.cantidad, confirmoFuera: f.confirmoFuera, mensaje: traducirError(f.error, "guardar el conteo de esa prenda") });
      },
    });
  });

  // ---- Lo que sale de esta pantalla no se pierde ------------------------------------------------------------------
  useEffect(() => () => control.soltar(), [control]);
  useEffect(() => {
    // Cerrar la pestaña con algo por guardar: el navegador pregunta. (Un guardado tarda ~600 ms de espera + la respuesta.)
    const alSalir = (e: BeforeUnloadEvent) => {
      if (!control.hayPendientes()) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", alSalir);
    return () => window.removeEventListener("beforeunload", alSalir);
  }, [control]);

  // Frescura: el botón «atrás» del navegador puede devolver esta pantalla desde la memoria del enrutador con las líneas
  // de cuando se cargó por primera vez (antes de contar, o de recontar en Revisar). Cada carga real trae un
  // identificador nuevo; si este ya se mostró en esta pestaña, es una copia vieja y se relee. Solo compara igualdad con
  // lo que puso el servidor: no depende del reloj del aparato.
  const frescuraRevisada = useRef(false);
  useEffect(() => {
    if (frescuraRevisada.current) return;
    frescuraRevisada.current = true;
    try {
      const clave = `cayla:conteo:cargas:${conteo.id}`;
      const vistas: unknown = JSON.parse(window.sessionStorage.getItem(clave) ?? "[]");
      const lista = Array.isArray(vistas) ? vistas.filter((v): v is string => typeof v === "string") : [];
      if (lista.includes(generadoEn)) router.refresh();
      else window.sessionStorage.setItem(clave, JSON.stringify([...lista.slice(-19), generadoEn]));
    } catch {
      // Sin almacenamiento (ventana privada, bloqueado): se pierde solo esta comprobación; recargar sigue trayendo todo de la base.
    }
  }, [conteo.id, generadoEn, router]);

  // Los avisos de «solo texto» se van solos.
  useEffect(() => {
    if (aviso?.tipo !== "texto") return;
    const id = window.setTimeout(() => setAviso(null), MS_AVISO_TEXTO);
    return () => window.clearTimeout(id);
  }, [aviso]);

  // ---- La lista: qué filas hay, filtradas y agrupadas --------------------------------------------------------------
  const version = useSyncExternalStore(control.suscribirEstructura, control.versionEstructura, control.versionEstructura);
  const enConteo = useMemo(() => {
    void version; // el agrupado se rehace cuando una línea aparece o desaparece
    return control.lineas().map((l) => porId.get(l.varianteId) ?? prendaSinFicha(l.varianteId));
  }, [control, version, porId]);
  const acotadas = useMemo(() => acotarALista(enConteo, soloVariantes), [enConteo, soloVariantes]);

  const [texto, setTexto] = useState("");
  // Escribir en el buscador es urgente; volver a filtrar 1.100 filas puede esperar un cuadro.
  const textoDiferido = useDeferredValue(texto);
  // Buscar NO cambia la lista: las filas que no coinciden se esconden (ver `ListaConteo`). Por eso el agrupado no depende del texto.
  // Un código EXACTO no es una búsqueda sino una lectura (la pistola lo teclea en este mismo campo y Enter lo suma): la lista no se toca.
  const coincidencias = useMemo(() => {
    if (textoDiferido.trim() === "" || resolverCodigoV2(textoDiferido, catalogoCompleto)) return null;
    return new Set(filtrarConteo(acotadas, textoDiferido).map((p) => p.varianteId));
  }, [acotadas, textoDiferido, catalogoCompleto]);
  const filtrando = coincidencias !== null;
  const grupos = useMemo(() => agruparConteo(acotadas), [acotadas]);
  const nCoincidencias = coincidencias === null ? acotadas.length : coincidencias.size;

  // Un código que no está en la lista del conteo pero sí en el catálogo (una variante que nadie esperaba aquí).
  const sugeridas = useMemo(
    () => (filtrando && nCoincidencias === 0 && textoDiferido.trim().length >= 2 ? coincidenciasPorCodigo(textoDiferido, catalogoCompleto, 5) : []),
    [filtrando, nCoincidencias, textoDiferido, catalogoCompleto]
  );

  // Sin etiqueta a mano (o dañada) también se puede sumar una prenda que nadie esperaba aquí: se ofrece por nombre, color o talla.
  // Solo se muestra; Enter suma únicamente la que coincide por código (`sugeridas`), para no agregar una prenda por teclear su nombre.
  const sugeridasPorTexto = useMemo(
    () => (filtrando && nCoincidencias === 0 && sugeridas.length === 0 && textoDiferido.trim().length >= 2 ? filtrarConteo(catalogoCompleto, textoDiferido).slice(0, 5) : []),
    [filtrando, nCoincidencias, sugeridas, textoDiferido, catalogoCompleto]
  );

  // ---- Anotar -----------------------------------------------------------------------------------------------------
  const escanerRef = useRef<HTMLInputElement>(null);
  const tarjetaRef = useRef<HTMLElement>(null);
  const [ultimaId, setUltimaId] = useState<string | null>(null);

  useEffect(() => {
    // En el celular el teclado taparía la lista al cargar: solo se enfoca con puntero fino (pistola y teclado).
    if (window.matchMedia?.("(pointer: fine)").matches) escanerRef.current?.focus();
  }, []);

  /** Una cantidad escrita en la fila de una variante. `false` = no se aplicó (falta el responsable): la fila vuelve a su cifra. */
  const alConfirmar = useCallback(
    (varianteId: string, cantidad: number | null): boolean => {
      const r = responsableRef.current;
      if (!r.listo) {
        setAviso({ tipo: "texto", texto: r.motivo ?? "Elige quién cuenta antes de anotar." });
        return false;
      }
      control.contar(varianteId, cantidad);
      setAviso((a) => (a?.tipo === "texto" ? null : a));
      return true;
    },
    [control]
  );

  const alInvalido = useCallback((t: string) => setAviso({ tipo: "texto", texto: `«${t.trim()}» no es una cantidad. Escribe un número entero: 0 o más.` }), []);

  /** Enter en un campo «Contaste»: al siguiente de la pantalla; en el último, de vuelta al escáner. El guardado sale por su blur. */
  const alEnterCampo = useCallback((campo: HTMLInputElement) => {
    const campos = Array.from(tarjetaRef.current?.querySelectorAll<HTMLInputElement>(CAMPOS_VISIBLES) ?? []);
    const siguiente = campos[campos.indexOf(campo) + 1];
    if (!siguiente) {
      escanerRef.current?.focus();
      return;
    }
    siguiente.focus({ preventScroll: true });
    // Al centro: la barra fija de abajo no debe quedar sobre la fila que se va a llenar.
    siguiente.scrollIntoView({ block: "center" });
  }, []);

  /** Una lectura de pistola, de cámara o elegida a mano: +1 al total de esa variante, con su sonido. */
  const leerPrenda = useCallback(
    (p: PrendaConteo): Lectura => {
      const r = responsableRef.current;
      if (!r.listo) {
        avisarLectura("desconocida");
        setAviso({ tipo: "texto", texto: r.motivo ?? "Elige quién cuenta antes de escanear." });
        return { tipo: "sin_responsable" };
      }
      const antes = control.linea(p.varianteId)?.contada ?? null;
      const cantidad = sumarLectura(antes);
      if (control.contar(p.varianteId, cantidad) === "fuera_de_alcance") {
        avisarLectura("desconocida");
        setAviso({ tipo: "fuera", varianteId: p.varianteId, cantidad });
        return { tipo: "fuera" };
      }
      avisarLectura(sonidoDeLectura({ encontrada: true, yaContada: antes !== null }));
      setUltimaId(p.varianteId);
      // Una lectura buena no borra lo que pide una respuesta (una prenda por confirmar, un guardado que falló).
      setAviso((a) => (a?.tipo === "fuera" || a?.tipo === "no_guardo" ? a : null));
      return { tipo: "sumada", cantidad };
    },
    [control]
  );

  function alEnterEscaner() {
    const t = texto.trim();
    if (!t) return;
    const exacta = resolverCodigoV2(t, catalogoRef.current);
    if (exacta) {
      // Un código exacto es una lectura de la pistola: suma 1 y el campo queda VACÍO y listo para la siguiente (si no, la
      // lectura que sigue se pegaría al final de esta).
      leerPrenda(exacta);
      setTexto("");
      return;
    }
    // Búsqueda a mano con un solo resultado: se va directo a su campo para escribir el número.
    if (textoDiferido === texto && coincidencias !== null && coincidencias.size === 1) {
      tarjetaRef.current?.querySelector<HTMLInputElement>(CAMPOS_VISIBLES)?.focus();
      return;
    }
    if (sugeridas.length === 1) {
      leerPrenda(sugeridas[0]);
      setTexto("");
      return;
    }
    // Un código entero (sin espacios, de 6 o más) que no es de ninguna prenda: el tono grave avisa sin mirar la pantalla,
    // y el código se guarda en el aviso (para darlo de alta) y no en el campo, que queda listo para la siguiente lectura.
    if (/^\S{6,}$/.test(t) && coincidenciasPorCodigo(t, catalogoRef.current, 1).length === 0) {
      avisarLectura("desconocida");
      setAviso({ tipo: "no_encontrado", codigo: t });
      setTexto("");
    }
  }

  // ---- Los avisos y sus botones -----------------------------------------------------------------------------------
  const agregarIgual = useCallback(() => {
    if (aviso?.tipo !== "fuera") return;
    const r = responsableRef.current;
    if (!r.listo) {
      setAviso({ tipo: "texto", texto: r.motivo ?? "Elige quién cuenta antes de agregar." });
      return;
    }
    control.contar(aviso.varianteId, aviso.cantidad, { confirmoFuera: true });
    avisarLectura("nueva");
    setUltimaId(aviso.varianteId);
    setAviso(null);
  }, [aviso, control]);

  const reintentar = useCallback(() => {
    if (aviso?.tipo !== "no_guardo") return;
    const r = responsableRef.current;
    if (!r.listo) {
      setAviso({ tipo: "texto", texto: r.motivo ?? "Elige quién cuenta antes de reintentar." });
      return;
    }
    const { varianteId, cantidad, confirmoFuera } = aviso;
    setAviso(null);
    if (control.contar(varianteId, cantidad, { confirmoFuera }) === "fuera_de_alcance") setAviso({ tipo: "fuera", varianteId, cantidad: cantidad ?? 1 });
  }, [aviso, control]);

  const descartarAviso = useCallback(() => setAviso(null), []);

  // ---- Cámara y alta al vuelo ---------------------------------------------------------------------------------------
  const [camara, setCamara] = useState(false);
  const [alta, setAlta] = useState<string | null>(null);
  const [marcasLocal, setMarcasLocal] = useState(marcas);
  const [ultimaPareja, setUltimaPareja] = useState<{ marcaId: string; proveedorId: string } | null>(null);

  function abrirCamara() {
    const r = responsableRef.current;
    if (!r.listo) {
      setAviso({ tipo: "texto", texto: r.motivo ?? "Elige quién cuenta antes de escanear." });
      return;
    }
    setAviso(null);
    setCamara(true);
  }

  /** Cada lectura de la cámara: el mismo camino que la pistola, siempre sumando (la cámara es en ráfaga). */
  const alLeerCamara = useCallback(
    (codigo: string): LecturaConteo => {
      const p = resolverCodigoV2(codigo, catalogoRef.current);
      if (!p) {
        avisarLectura("desconocida");
        return { encontrada: false, codigo };
      }
      const lectura = leerPrenda(p);
      return {
        encontrada: true,
        referencia: p.referencia,
        detalle: detalleDe(p),
        sku: p.sku,
        cantidad: lectura.tipo === "sumada" ? lectura.cantidad : (control.linea(p.varianteId)?.contada ?? 0),
        atencion: lectura.tipo !== "sumada",
      };
    },
    [control, leerPrenda]
  );

  const alPasoCamara = useCallback(
    (paso: number) => {
      if (!ultimaId) return;
      const r = responsableRef.current;
      if (!r.listo) {
        setAviso({ tipo: "texto", texto: r.motivo ?? "Elige quién cuenta." });
        return;
      }
      const actual = control.linea(ultimaId)?.contada ?? 0;
      control.contar(ultimaId, Math.max(0, actual + paso));
    },
    [control, ultimaId]
  );

  function alCrearAlVuelo(prenda: PrendaConteo, pareja: { marcaId: string; proveedorId: string }) {
    setUltimaPareja(pareja);
    setCatalogoNuevo((previas) => [...previas, prenda]);
    setUltimaId(prenda.varianteId);
    // Una prenda recién creada de otra categoría, en un conteo «Solo …», también pregunta: no se cuenta en silencio.
    if (alcanceCategoria && prenda.categoriaId && prenda.categoriaId !== alcanceCategoria) {
      setAviso({ tipo: "fuera", varianteId: prenda.varianteId, cantidad: 1 });
      return;
    }
    control.contar(prenda.varianteId, 1);
    avisarLectura("nueva");
  }

  // ---- Revisar ----------------------------------------------------------------------------------------------------
  const [preparando, setPreparando] = useState(false);
  async function revisar() {
    // El campo que se está escribiendo se confirma al salir de él; en el celular un botón no le quita el foco, así que se le quita acá.
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    setPreparando(true);
    const todoGuardado = await control.terminar();
    if (!todoGuardado) {
      // Algo no se guardó: el aviso ya está en la barra. Quedarse es lo que evita perder esa lectura en silencio.
      setPreparando(false);
      return;
    }
    router.push(`/inventario/conteo/${conteo.id}/revisar`);
  }

  const hayVariantes = enConteo.length > 0;
  const vaciaPorAcotar = hayVariantes && acotadas.length === 0;
  const contenidoAviso = aviso ? (
    <ContenidoAviso
      aviso={aviso}
      porId={porId}
      alAgregarIgual={agregarIgual}
      alReintentar={reintentar}
      alDarDeAlta={() => {
        if (aviso.tipo !== "no_encontrado") return;
        setAlta(aviso.codigo);
        setAviso(null);
      }}
      alDescartar={descartarAviso}
    />
  ) : null;

  return (
    <>
      <section ref={tarjetaRef} aria-label="Contar" className="card-cayla @container overflow-hidden">
        {/* La barra de herramientas: escanear/buscar en UN campo, quién cuenta y cuántas van. */}
        <div className="space-y-2.5 border-b border-sand px-3 py-3 @[36rem]:px-5">
          <div className="caja-cayla relative flex h-12 items-center">
            <ScanBarcode aria-hidden className="pointer-events-none absolute left-3.5 h-5 w-5 text-taupe" />
            <input
              ref={escanerRef}
              type="text"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
                e.preventDefault();
                alEnterEscaner();
              }}
              aria-label="Escanear código"
              placeholder="Escanea o escribe producto, color, talla o código"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              enterKeyHint="search"
              className="h-full w-full min-w-0 bg-transparent pl-11 pr-3 text-base text-tinta outline-none placeholder:text-taupe placeholder:text-ellipsis sm:pr-32"
            />
            {/* En escritorio la cámara está al lado del campo; en el celular, en la barra de abajo (más a mano del pulgar). */}
            <button type="button" onClick={abrirCamara} className="btn-cayla btn-secundario btn-chico absolute right-2 hidden sm:inline-flex">
              <Camera aria-hidden className="h-4 w-4" />
              Cámara
            </button>
          </div>
          <ComboResponsable control={responsable} className="w-full sm:w-72" />
          <CifrasConteo control={control} />
          {filtrando && hayVariantes && !vaciaPorAcotar && nCoincidencias > 0 && (
            <p className="text-xs text-taupe">
              Mostrando {nCoincidencias} de {acotadas.length} {acotadas.length === 1 ? "variante" : "variantes"} ·{" "}
              <button type="button" onClick={() => setTexto("")} className="btn-cayla btn-enlace inline min-h-0 p-0 align-baseline text-xs">
                Limpiar
              </button>
            </p>
          )}
          {ultimaId && <UltimaLectura control={control} prenda={porId.get(ultimaId) ?? prendaSinFicha(ultimaId)} />}
        </div>

        {!hayVariantes ? (
          <p className="px-5 py-6 text-sm text-taupe">No hay variantes registradas en esta ubicación. Escanea una para agregarla al conteo.</p>
        ) : vaciaPorAcotar ? (
          <p className="px-5 py-6 text-sm text-taupe">Ninguna de las variantes pedidas está en este conteo. Escanea la prenda para agregarla.</p>
        ) : (
          <>
            {nCoincidencias === 0 && (
              <SinCoincidencias
                texto={textoDiferido.trim()}
                sugeridas={sugeridas.length > 0 ? sugeridas : sugeridasPorTexto}
                alSumar={(p) => {
                  leerPrenda(p);
                  setTexto("");
                }}
              />
            )}
            {/* Aunque no coincida nada la lista sigue montada (escondida): volver a dibujarla al borrar el buscador costaría medio segundo. */}
            <div hidden={nCoincidencias === 0}>
              <ListaConteo grupos={grupos} coincidencias={coincidencias} control={control} alConfirmar={alConfirmar} alInvalido={alInvalido} alEnter={alEnterCampo} />
            </div>
          </>
        )}
      </section>

      <PieContar control={control} aviso={contenidoAviso} preparando={preparando} alRevisar={() => void revisar()} alCamara={abrirCamara} />

      {alta && (
        <AltaAlVuelo
          codigoBarras={alta}
          catalogo={catalogoCompleto}
          categorias={categorias}
          colores={colores}
          tallasPorCategoria={tallasPorCategoria}
          marcas={marcasLocal}
          onListas={(l) => setMarcasLocal((previas) => ({ ...previas, ...l }))}
          puedeCrearMarcas={puedeCrearMarcas}
          parejaInicial={ultimaPareja}
          responsable={responsable}
          onCancelar={() => setAlta(null)}
          onCreada={alCrearAlVuelo}
        />
      )}

      {camara && (
        <CamaraConteo
          control={control}
          porId={porId}
          ultimaId={ultimaId}
          aviso={aviso && aviso.tipo !== "no_encontrado" ? contenidoAviso : null}
          alLeer={alLeerCamara}
          alPaso={alPasoCamara}
          alDarDeAlta={(codigo) => {
            setCamara(false);
            setAlta(codigo);
          }}
          alEscribir={() => {
            setCamara(false);
            escanerRef.current?.focus();
          }}
          alCerrar={() => setCamara(false)}
        />
      )}
    </>
  );
}

// ================================================================================================================
// Piezas que se suscriben solas al almacén: así la pantalla de arriba no se vuelve a dibujar por cada lectura.
// ================================================================================================================

function useResumen(control: ControlConteo) {
  return useSyncExternalStore(control.suscribirResumen, control.resumen, control.resumen);
}

function useEstadoGuardado(control: ControlConteo): EstadoGuardado {
  return useSyncExternalStore(control.suscribirGuardado, control.estadoGuardado, control.estadoGuardado);
}

function CifrasConteo({ control }: { control: ControlConteo }) {
  return <ResumenConteo resumen={useResumen(control)} variante="cifras" />;
}

/** Lo buscado no está en la lista del conteo. Si es una prenda que el catálogo sí conoce (por su etiqueta o por su nombre), se ofrece sumarla (una variante que nadie esperaba aquí). */
function SinCoincidencias({ texto, sugeridas, alSumar }: { texto: string; sugeridas: PrendaConteo[]; alSumar: (p: PrendaConteo) => void }) {
  return (
    <div className="space-y-3 px-5 py-6">
      <p className="text-sm text-taupe">Ninguna variante coincide con «{texto}».</p>
      {sugeridas.length > 0 && (
        <div className="space-y-2 rounded-xl border border-sand bg-papel px-3.5 py-3 text-sm text-tinta">
          <p>No estaba en la lista de este conteo. ¿Es alguna de estas?</p>
          <ul className="divide-y divide-sand/70">
            {sugeridas.map((p) => (
              <li key={p.varianteId} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0">
                  <span className="block truncate">{p.referencia}</span>
                  <span className="block truncate text-xs text-taupe">
                    {detalleDe(p) || "Sin talla ni color"} · <span className="font-mono text-[11px]">{p.sku || "sin código"}</span>
                  </span>
                </span>
                <button type="button" onClick={() => alSumar(p)} className="btn-cayla btn-secundario btn-chico shrink-0">
                  Sumar 1
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** La confirmación discreta de la última lectura: con la pistola se mira el rack, no la pantalla, y esta línea dice qué se sumó. */
function UltimaLectura({ control, prenda }: { control: ControlConteo; prenda: PrendaConteo }) {
  const id = prenda.varianteId;
  const suscribir = useCallback((avisar: () => void) => control.suscribirLinea(id, avisar), [control, id]);
  const leer = useCallback(() => control.linea(id), [control, id]);
  const linea = useSyncExternalStore(suscribir, leer, leer);
  return (
    // Alto reservado (ADR-0185): la línea no empuja la lista al aparecer.
    <p role="status" aria-live="polite" className="min-h-4 truncate text-xs leading-4 text-taupe">
      {linea && linea.contada !== null ? (
        <>
          Última lectura: <span className="text-tinta">{nombreDe(prenda)}</span> · <span className="tabular-nums text-tinta">{linea.contada}</span>
        </>
      ) : null}
    </p>
  );
}

/** El pie fijo: el avance («18 de 37 variantes verificadas»), el «Guardado» y «Revisar conteo». */
function PieContar({
  control,
  aviso,
  preparando,
  alRevisar,
  alCamara,
}: {
  control: ControlConteo;
  aviso: React.ReactNode;
  preparando: boolean;
  alRevisar: () => void;
  alCamara: () => void;
}) {
  const resumen = useResumen(control);
  const guardado = useEstadoGuardado(control);
  return (
    <BarraFija
      aviso={aviso ? <div className="anim-revelar">{aviso}</div> : null}
      resumen={
        <ResumenConteo
          resumen={resumen}
          variante="progreso"
          lateral={
            // Discreto: la ÚNICA confirmación por lectura. Sin modales ni avisos flotantes.
            <span role="status" aria-live="polite" className="inline-block min-w-[5.5rem] text-right">
              {guardado === "guardando" ? "Guardando…" : guardado === "guardado" ? "✓ Guardado" : null}
            </span>
          }
        />
      }
      acciones={
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <button type="button" onClick={alCamara} aria-label="Escanear con la cámara" className="btn-cayla btn-secundario h-11 w-11 shrink-0 p-0 sm:hidden">
            <Camera aria-hidden className="h-5 w-5" />
          </button>
          <button type="button" disabled={preparando} onClick={alRevisar} className="btn-cayla btn-primario h-11 flex-1 sm:flex-none">
            {preparando ? "Guardando lo último…" : "Revisar conteo"}
          </button>
        </div>
      }
    />
  );
}

/** La cámara en ráfaga. Es una pieza aparte para que el «18/37» y la prenda actual se actualicen sin volver a dibujar la pantalla. */
function CamaraConteo({
  control,
  porId,
  ultimaId,
  aviso,
  alLeer,
  alPaso,
  alDarDeAlta,
  alEscribir,
  alCerrar,
}: {
  control: ControlConteo;
  porId: ReadonlyMap<string, PrendaConteo>;
  ultimaId: string | null;
  aviso: React.ReactNode;
  alLeer: (codigo: string) => LecturaConteo;
  alPaso: (paso: number) => void;
  alDarDeAlta: (codigo: string) => void;
  alEscribir: () => void;
  alCerrar: () => void;
}) {
  const resumen = useResumen(control);
  const suscribir = useCallback((avisar: () => void) => (ultimaId ? control.suscribirLinea(ultimaId, avisar) : () => undefined), [control, ultimaId]);
  const leer = useCallback(() => (ultimaId ? control.linea(ultimaId) : undefined), [control, ultimaId]);
  const linea = useSyncExternalStore(suscribir, leer, leer);
  const prenda = ultimaId ? porId.get(ultimaId) : undefined;
  return (
    <EscanerConteo
      onCodigo={alLeer}
      actual={prenda && linea ? { encontrada: true, referencia: prenda.referencia, detalle: detalleDe(prenda), sku: prenda.sku, cantidad: linea.contada ?? 0 } : null}
      avance={{ contadas: resumen.verificadas, total: resumen.variantes }}
      onPaso={alPaso}
      onDarDeAlta={alDarDeAlta}
      onEscribir={alEscribir}
      aviso={aviso}
      onClose={alCerrar}
    />
  );
}

/** El aviso de la barra (y de la bandeja de la cámara): una línea que dice qué pasó y con botones para responder. */
function ContenidoAviso({
  aviso,
  porId,
  alAgregarIgual,
  alReintentar,
  alDarDeAlta,
  alDescartar,
}: {
  aviso: Aviso;
  porId: ReadonlyMap<string, PrendaConteo>;
  alAgregarIgual: () => void;
  alReintentar: () => void;
  alDarDeAlta: () => void;
  alDescartar: () => void;
}) {
  const boton = "btn-cayla btn-enlace min-h-11 px-2 text-xs";
  const nombre = (id: string) => {
    const p = porId.get(id);
    return p ? nombreDe(p) : "esa prenda";
  };
  const cerrar = (
    <button type="button" onClick={alDescartar} aria-label="Cerrar el aviso" className="btn-cayla btn-sutil grid h-11 w-11 place-items-center p-0">
      <X aria-hidden className="h-4 w-4" />
    </button>
  );
  const fila = "flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs";

  switch (aviso.tipo) {
    case "fuera":
      return (
        <div role="alert" className={`${fila} w-full text-tinta`}>
          <p className="min-w-0 flex-1 basis-56">
            Esta prenda no pertenece al conteo actual. <span className="text-taupe">{nombre(aviso.varianteId)}</span>
          </p>
          <span className="flex items-center">
            <button type="button" onClick={alAgregarIgual} className={boton}>
              Agregar igual
            </button>
            <button type="button" onClick={alDescartar} className={boton}>
              No agregar
            </button>
          </span>
        </div>
      );
    case "no_encontrado":
      return (
        <div role="alert" className={`${fila} w-full text-tinta`}>
          <p className="min-w-0 flex-1 basis-56">
            No se encontró «<b className="font-semibold">{aviso.codigo}</b>» en el catálogo.
          </p>
          <span className="flex items-center">
            <button type="button" onClick={alDarDeAlta} className={boton}>
              Dar de alta esta prenda
            </button>
            {cerrar}
          </span>
        </div>
      );
    case "no_guardo":
      return (
        <div role="alert" className={`${fila} w-full text-rojo-profundo`}>
          <p className="min-w-0 flex-1 basis-56">
            No se guardó {nombre(aviso.varianteId)}. <span className="text-tinta/75">{aviso.mensaje}</span>
          </p>
          <span className="flex items-center">
            <button type="button" onClick={alReintentar} className={boton}>
              Reintentar
            </button>
            {cerrar}
          </span>
        </div>
      );
    case "texto":
      return (
        <div role="status" className={`${fila} w-full text-tinta`}>
          <p className="min-w-0 flex-1 basis-56">{aviso.texto}</p>
          {cerrar}
        </div>
      );
  }
}
