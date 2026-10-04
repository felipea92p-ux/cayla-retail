"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { Camera, Clock, Info, ScanBarcode, UserRound, X } from "lucide-react";
import { ComboResponsable } from "@/components/ComboResponsable";
import { EscanerConteo, type LecturaConteo } from "@/components/EscanerConteo";
import { AltaAlVuelo } from "@/components/conteo/AltaAlVuelo";
import { BotonAplicarTodos, ConfirmarAplicarTodos } from "@/components/conteo/AplicarTodosCompletos";
import { ControlConteo, type EstadoGuardado, type FalloDeGuardado } from "@/components/conteo/control-conteo";
import { ListaConteo } from "@/components/conteo/ListaConteo";
import { PasosConteo } from "@/components/conteo/PasosConteo";
import { ResumenConteo } from "@/components/conteo/ResumenConteo";
import { BarraFija } from "@/components/ui/BarraFija";
import { Chip } from "@/components/ui/Chip";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { Volver } from "@/components/ui/Volver";
import { resolverCodigoV2 } from "@/lib/buscar-prenda-v2";
import { guionDeLaPistola } from "@/lib/escaner-guion";
import { sonidoDeLectura } from "@/lib/conteo-conectado";
import {
  acotarALista,
  agruparConteo,
  coincidenciasPorCodigo,
  filtrarConteo,
  pendientesParaCompletar,
  sumarLectura,
  type DetalleConteo,
  type PrendaConteo,
} from "@/lib/conteo-reglas";
import { traducirError } from "@/lib/error-escritura";
import type { CatalogoMarcas } from "@/lib/marcas-datos";
import { firmar } from "@/lib/responsable-reglas";
import { avisarLectura } from "@/lib/sonido-lectura";
import { createClient } from "@/lib/supabase/client";
import { useResponsable, type ControlResponsable } from "@/lib/useResponsable";
import { claveResponsableConteo } from "@/lib/responsable-conteo";

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

/** Los campos «Contaste» que se ven (los de tarjetas o filas escondidas por el buscador no cuentan para saltar con Enter). */
const CAMPOS_VISIBLES = "article:not([hidden]) tbody > tr:not([hidden]) input[data-contaste]";

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
  /** La sede que se mira, para la línea de arriba de la cabecera. */
  sede: string;
  /** «Almacén de tienda · Todo»: lo que dice la cabecera bajo «Conteo N». */
  lugar: string;
  /** A dónde vuelve «← Conteo» (o «← Movimientos», si se llegó desde allá). */
  volver: { href: string; a: string };
  /** `?variantes=`: «Contando solo: … · Contar todo», ya armado por el servidor (va bajo los pasos). */
  notaAcotada?: React.ReactNode;
};

export function ContarConteo({ detalle, catalogo, soloVariantes, generadoEn, categorias, colores, tallasPorCategoria, marcas, puedeCrearMarcas, sede, lugar, volver, notaAcotada }: PropsContarConteo) {
  const router = useRouter();
  const conteo = detalle.conteo;
  // El responsable se eligió al abrir el conteo: aquí solo se reutiliza (`recordarEn`); el combo vuelve solo si esa persona ya no está de turno.
  const responsable = useResponsable(undefined, { recordarEn: claveResponsableConteo(conteo.id) });

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
  const tarjetaRef = useRef<HTMLDivElement>(null);
  const [ultimaId, setUltimaId] = useState<string | null>(null);

  useEffect(() => {
    const enfocarEscaner = () => {
      // En el celular el teclado taparía la lista al cargar: solo se enfoca con puntero fino (pistola y teclado).
      if (window.matchMedia?.("(pointer: fine)").matches) escanerRef.current?.focus();
    };
    if (soloVariantes.length === 0) {
      enfocarEscaner();
      return;
    }
    // «Volver a contar» (desde Revisar) y «Contar esta prenda» llegan acotados a lo que hay que contar: el cursor cae en la cifra
    // de la primera variante, con su número seleccionado, y no en el escáner. Se enfoca también en el celular: la persona pidió
    // escribir esa cifra. Va un instante después de montar: al llegar por un enlace, Next enfoca el contenedor de la página
    // justo después de montarla y le quitaría el foco a la cifra.
    const id = window.setTimeout(() => {
      const campo = tarjetaRef.current?.querySelector<HTMLInputElement>(CAMPOS_VISIBLES);
      if (!campo) return enfocarEscaner();
      campo.focus({ preventScroll: true });
      campo.scrollIntoView({ block: "center" });
    }, 0);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al abrir la pantalla: `soloVariantes` no cambia mientras está abierta.
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

  /**
   * «Completar todo» de una tarjeta (y «Aplicar todos completos» de la pantalla): «encontré todo tal como CAYLA esperaba». Cada variante
   * que SIGUE pendiente se cuenta con lo que debe haber, por el mismo camino que cualquier cantidad escrita (`alConfirmar`: mismo
   * responsable, mismo guardado agrupado y en serie, mismo estado y progreso). Las que ya tienen número no se tocan
   * (`pendientesParaCompletar`). Si falta el responsable, se avisa una sola vez y no se anota ninguna. Devuelve cuántas anotó.
   */
  const completarTodo = useCallback(
    (varianteIds: string[]): number => {
      let anotadas = 0;
      for (const id of pendientesParaCompletar(varianteIds, control.linea)) {
        const l = control.linea(id);
        if (!l || !alConfirmar(id, l.debeHaber)) break;
        anotadas++;
      }
      return anotadas;
    },
    [control, alConfirmar]
  );

  // «Aplicar todos completos»: las que SIGUEN pendientes entre las que se ven (la lista acotada y, si hay texto, lo que deja el buscador).
  // La pregunta de confirmación lleva la cuenta: `porAplicar` son las variantes que se anotarían.
  const [porAplicar, setPorAplicar] = useState<string[] | null>(null);
  const pedirAplicarTodos = useCallback(() => {
    const visibles = coincidencias === null ? acotadas : acotadas.filter((p) => coincidencias.has(p.varianteId));
    const ids = pendientesParaCompletar(
      visibles.map((p) => p.varianteId),
      control.linea
    );
    if (ids.length === 0) {
      setAviso({ tipo: "texto", texto: "No queda ninguna variante pendiente en esta lista." });
      return;
    }
    setPorAplicar(ids);
  }, [acotadas, coincidencias, control]);
  const aplicarTodos = useCallback(() => {
    const ids = porAplicar ?? [];
    const n = completarTodo(ids);
    // Después del bucle: cada anotación borra el aviso de texto anterior (`alConfirmar`), y este es el que debe quedar.
    if (n > 0) setAviso({ tipo: "texto", texto: `Se anotaron ${n.toLocaleString("es-PE")} ${n === 1 ? "variante" : "variantes"} con lo que CAYLA esperaba. Revisa y confirma al terminar.` });
  }, [porAplicar, completarTodo]);

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
      <EncabezadoPagina
        sede={sede}
        titulo={`Conteo ${conteo.numero}`}
        subtitulo={lugar}
        pie={
          <>
            <Volver forma="boton" href={volver.href} a={volver.a} />
            <Chip tono="pizarra">En curso</Chip>
          </>
        }
      >
        <CifrasCabecera control={control} />
      </EncabezadoPagina>
      <PasosConteo actual="contar" />
      {notaAcotada}

      <div ref={tarjetaRef} role="region" aria-label="Contar" className="space-y-3">
        {/* Escanear o buscar: UN campo de ancho completo. La cámara vive en la barra de abajo del celular. */}
        <div className="relative">
          <ScanBarcode aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-rojo-profundo" />
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
            className="h-[42px] w-full min-w-0 rounded-lg border border-taupe/25 bg-papel pl-11 pr-3 text-base text-tinta outline-none transition-colors placeholder:text-taupe placeholder:text-ellipsis focus:border-rojo-profundo/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-tinta/40 [@media(pointer:coarse)]:h-12"
          />
        </div>

        <BarraInfo control={control} responsable={responsable} creadoEn={conteo.creadoEn} />

        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-lg bg-hueso/40 px-3 py-2 text-[13px] text-taupe">
          <p className="flex min-w-0 items-center gap-2">
            <Info aria-hidden className="h-4 w-4 shrink-0" />
            {filtrando && hayVariantes && !vaciaPorAcotar && nCoincidencias > 0 ? (
              <span>
                Mostrando {nCoincidencias} de {acotadas.length} {acotadas.length === 1 ? "variante" : "variantes"} ·{" "}
                <button type="button" onClick={() => setTexto("")} className="btn-cayla btn-enlace inline min-h-0 p-0 align-baseline text-[13px]">
                  Limpiar
                </button>
              </span>
            ) : (
              <span>Los productos se muestran en tarjetas. Cada tarjeta crece según el número de tallas del producto.</span>
            )}
          </p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
            {ultimaId && <UltimaLectura control={control} prenda={porId.get(ultimaId) ?? prendaSinFicha(ultimaId)} />}
            {hayVariantes && !vaciaPorAcotar && <BotonAplicarTodos control={control} alPedir={pedirAplicarTodos} />}
          </div>
        </div>

        {!hayVariantes ? (
          <p className="card-cayla px-5 py-6 text-sm text-taupe">No hay variantes registradas en esta ubicación. Escanea una para agregarla al conteo.</p>
        ) : vaciaPorAcotar ? (
          <p className="card-cayla px-5 py-6 text-sm text-taupe">Ninguna de las variantes pedidas está en este conteo. Escanea la prenda para agregarla.</p>
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
              <ListaConteo
                grupos={grupos}
                coincidencias={coincidencias}
                control={control}
                alConfirmar={alConfirmar}
                alInvalido={alInvalido}
                alEnter={alEnterCampo}
                alCompletar={completarTodo}
              />
            </div>
          </>
        )}
      </div>

      <PieContar control={control} aviso={contenidoAviso} preparando={preparando} alRevisar={() => void revisar()} alCamara={abrirCamara} />

      {porAplicar && <ConfirmarAplicarTodos cuantas={porAplicar.length} alConfirmar={aplicarTodos} onClose={() => setPorAplicar(null)} />}

      {alta && (
        <AltaAlVuelo
          codigoBarras={guionDeLaPistola(alta)}
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

/** Las tres cifras de arriba a la derecha: verificadas, pendientes y con diferencia. Viven aquí (y no en el servidor) porque se mueven con cada lectura. */
function CifrasCabecera({ control }: { control: ControlConteo }) {
  const r = useResumen(control);
  const celdas = [
    { valor: r.verificadas, etiqueta: "Variantes verificadas", color: "text-taupe-profundo" },
    { valor: r.pendientes, etiqueta: "Pendientes", color: "text-tinta" },
    { valor: r.conDiferencia, etiqueta: "Con diferencia", color: r.conDiferencia > 0 ? "text-rojo-profundo" : "text-verde" },
  ];
  return (
    <section aria-label="Resumen del conteo" className="anim-sube flex w-full divide-x divide-sand rounded-2xl border border-sand bg-papel lg:w-auto">
      {celdas.map((c) => (
        <div key={c.etiqueta} className="min-w-0 flex-1 px-4 py-4 lg:w-[8.75rem] lg:flex-none">
          <p className={`font-display text-2xl leading-none tabular-nums ${c.color}`}>{c.valor}</p>
          <p className="mt-2 text-[13px] leading-tight text-tinta/70">{c.etiqueta}</p>
        </div>
      ))}
    </section>
  );
}

const FORMATO_INICIO = new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
/** «29/09/2026 · 13:36», en la hora de Lima (la de la tienda), sin importar la zona del aparato. */
function textoInicio(iso: string): string {
  const partes = FORMATO_INICIO.formatToParts(new Date(iso));
  const de = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? "";
  return `${de("day")}/${de("month")}/${de("year")} · ${de("hour")}:${de("minute")}`;
}

/** El anillo del progreso: pista en sand y avance en terracota (el mismo que el hilo de CAYLA), sin animación de más. */
function Anillo({ porcentaje }: { porcentaje: number }) {
  const r = 16;
  const c = 2 * Math.PI * r;
  return (
    <svg aria-hidden viewBox="0 0 40 40" className="h-10 w-10 shrink-0 -rotate-90">
      <circle cx="20" cy="20" r={r} fill="none" strokeWidth="3.5" className="stroke-sand" />
      <circle
        cx="20"
        cy="20"
        r={r}
        fill="none"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - porcentaje / 100)}
        className="stroke-rojo transition-[stroke-dashoffset] duration-300 ease-cayla"
      />
    </svg>
  );
}

/**
 * La barra de información bajo el buscador: quién cuenta, cómo va y desde cuándo. Solo tres bloques (los pendientes ya
 * están arriba a la derecha). El responsable se eligió al abrir el conteo: aquí solo se ve su nombre, sin «Cambiar». Solo si
 * no hay responsable vigente (otro navegador, o ya no está de turno) aparece el combo: el candado de asistencia no se pierde.
 */
function BarraInfo({ control, responsable, creadoEn }: { control: ControlConteo; responsable: ControlResponsable; creadoEn: string }) {
  const r = useResumen(control);
  const porcentaje = r.variantes > 0 ? Math.min(100, Math.round((r.verificadas / r.variantes) * 100)) : 0;
  const nombre = responsable.lista.elegibles.find((e) => e.personaId === responsable.elegidoId)?.nombre ?? null;
  // Solo se pregunta si NO hay responsable vigente (nadie lo eligió en este navegador o ya no está de turno): sin él la base no deja guardar.
  const mostrarCombo = !responsable.listo || !nombre;
  const bloque = "flex min-w-0 items-center gap-3 px-5 py-3";
  return (
    <div className="grid grid-cols-1 divide-y divide-sand rounded-xl border border-sand bg-papel sm:grid-cols-3 sm:divide-x sm:divide-y-0">
      <div className={bloque}>
        <UserRound aria-hidden strokeWidth={1.5} className="h-8 w-8 shrink-0 text-taupe" />
        <div className="min-w-0 flex-1">
          <p className="text-xs text-tinta/70">Responsable</p>
          {mostrarCombo ? (
            <ComboResponsable control={responsable} className="mt-1 w-full" />
          ) : (
            <p className="truncate text-base font-medium text-tinta">{nombre}</p>
          )}
        </div>
      </div>
      <div className={bloque}>
        <Anillo porcentaje={porcentaje} />
        <div className="min-w-0">
          <p className="text-xs text-tinta/70">Progreso</p>
          <p className="flex items-baseline gap-3 text-base font-medium tabular-nums text-tinta">
            <span>
              {r.verificadas} de {r.variantes} {r.variantes === 1 ? "variante" : "variantes"}
            </span>
            <span className="text-tinta/70">{porcentaje}%</span>
          </p>
        </div>
      </div>
      <div className={bloque}>
        <Clock aria-hidden strokeWidth={1.5} className="h-8 w-8 shrink-0 text-taupe" />
        <div className="min-w-0">
          <p className="text-xs text-tinta/70">Inicio del conteo</p>
          <p className="text-base font-medium tabular-nums text-tinta">{textoInicio(creadoEn)}</p>
        </div>
      </div>
    </div>
  );
}

/** Lo buscado no está en la lista del conteo. Si es una prenda que el catálogo sí conoce (por su etiqueta o por su nombre), se ofrece sumarla (una variante que nadie esperaba aquí). */
function SinCoincidencias({ texto, sugeridas, alSumar }: { texto: string; sugeridas: PrendaConteo[]; alSumar: (p: PrendaConteo) => void }) {
  return (
    <div className="card-cayla space-y-3 px-5 py-6">
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
          conPorcentaje
          className="max-w-xl"
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
