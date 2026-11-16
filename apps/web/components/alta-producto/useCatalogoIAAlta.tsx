"use client";

import { useEffect, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { avisar } from "@/components/ui/Avisos";
import { pedirFotoDeCatalogo } from "@/lib/foto-catalogo-cliente";
import type { DatosDePrenda } from "@/lib/ficha-foto-ia";
import { avisoIANoRespondio } from "@/lib/foto-catalogo-reglas";
import { avisoDeIAQueNoPudo, fotosParaLaIAAlEncender } from "@/lib/fotos-y-colores-reglas";
import { HojaCatalogoIA, type PedidoCatalogo } from "@/components/ficha-producto/HojaCatalogoIA";
import { fotosParaLaHoja, useInterruptorIA } from "@/components/ficha-producto/useCatalogoIA";
import type { FotoPendiente } from "./FotosAlta";
import type { FotosEnCurso } from "./FotosYColores";

// «Catálogo con IA» en Nuevo producto (2026-11-13): lo mismo que en Editar producto (`useCatalogoIA`), pero sobre las fotos que el alta guarda en el
// NAVEGADOR hasta crear el producto (`FotosAlta`). La foto real entra a su fila apenas se elige; la de IA se le agrega cuando llega (`ia`) y pasa a
// ser la que se ve. Nada sube al almacén antes de crear: al crear, el formulario espera a que terminen las que se están preparando (`esperar`)
// y sube el par. Mismo molde (el primer color con foto de IA) y mismo «Usar mi foto». Si la IA falla, queda la real y se avisa.

export type CatalogoIAAlta = {
  disponible: boolean;
  encendido: boolean;
  cambiarEncendido: (v: boolean) => void;
  abrir: (archivos: File[], color: string | null) => void;
  /** ¿Se está preparando la foto de este color? */
  preparando: (color: string | null) => boolean;
  /** ¿Se está preparando ESTA foto (por su clave)? La de una foto que ya estaba en su color cuando se encendió la IA. */
  preparandoFoto: (clave: string) => boolean;
  /**
   * ¿La IA está encendida AHORA? Lo lee quien termina tarde (una foto que acaba de abrirse o de leerse): el `encendido` de su render puede ser
   * viejo, incluso de un «Fotos y colores» que ya se desmontó al cambiar de paso. Vive en la pantalla, que no se desmonta.
   */
  encendidoAhora: () => boolean;
  /** «Usar mi foto» / «Usar la de IA» de una foto pendiente con versión de IA. */
  alternar: (clave: string) => void;
  /**
   * Al crear el producto: espera a que terminen las que se están preparando y devuelve `lista` con cada foto de IA ya puesta. No se lee el
   * estado de la pantalla: la última en llegar todavía no se ha dibujado cuando la espera termina, y se subiría la real sola.
   */
  esperar: (lista: readonly FotoPendiente[]) => Promise<FotoPendiente[]>;
  /**
   * «Fotos y colores» (ADR-0663): la foto se prepara ANTES de saber su color (el color sale de la foto, mejor sin fondo). Usa el mismo
   * molde que las demás (la primera de IA lo es). Devuelve el PNG, o `null` si la IA no respondió (ya avisado): queda la foto real.
   */
  prepararFoto: (frente: File, opciones?: { callar?: boolean }) => Promise<Blob | null>;
  hoja: ReactNode;
};

export function useCatalogoIAAlta({
  disponible,
  fotos,
  setFotos,
  colores,
  nombreColor,
  moldeDeLaPrenda,
  prenda,
  fotosEnCurso,
  bloqueado = false,
}: {
  disponible: boolean;
  /** La pantalla está creando o guardando: no se pide ninguna IA (tampoco desde el «Volver a intentar» de un aviso que sigue a la vista). */
  bloqueado?: boolean;
  /** Las fotos de «Fotos y colores» que todavía esperan su color: al encender la IA también se preparan (`fotosParaLaIAAlEncender`). */
  fotosEnCurso?: FotosEnCurso;
  /** Lo ya elegido de la prenda (categoría, tipo, tejido, patrón): se manda a la IA para que no adivine qué es (`lib/ficha-foto-ia.ts`). */
  prenda?: DatosDePrenda | null;
  fotos: readonly FotoPendiente[];
  setFotos: Dispatch<SetStateAction<FotoPendiente[]>>;
  /** Los colores elegidos, en orden: el primero con foto de IA es el molde. */
  colores: readonly string[];
  nombreColor: (codigo: string | null) => string;
  /** Sumar un color a una prenda que YA existe (Recibir, Felipe 2026-11-14): su foto de catálogo es el molde, para que el color nuevo salga con
   *  la misma forma que los que ya tiene. `null` si no tiene ninguna (entonces el primero de esta hoja hace de molde, como al crear). */
  moldeDeLaPrenda?: () => Promise<Blob | null>;
}): CatalogoIAAlta {
  const [encendido, guardarEncendido] = useInterruptorIA();
  const encendidoRef = useRef(false);
  useEffect(() => {
    encendidoRef.current = disponible && encendido;
  }, [disponible, encendido]);
  const bloqueadoRef = useRef(bloqueado);
  useEffect(() => {
    bloqueadoRef.current = bloqueado;
  }, [bloqueado]);
  // Al cerrar la pantalla (o la hoja de Recibir) lo que llega tarde no escribe ni avisa: hablaría de una prenda que ya no está.
  const vigente = useRef(true);
  useEffect(() => {
    vigente.current = true;
    return () => {
      vigente.current = false;
    };
  }, []);
  const [hoja, setHoja] = useState<PedidoCatalogo | null>(null);
  const volverA = useRef<HTMLElement | null>(null);
  const [preparando, setPreparando] = useState<ReadonlySet<string>>(new Set());
  const enCurso = useRef(new Set<Promise<void>>());
  // Lo que la IA ya devolvió, por foto, apenas llega (sin esperar a que se dibuje): lo lee `esperar`.
  const listas = useRef(new Map<string, NonNullable<FotoPendiente["ia"]>>());
  const moldeEnCurso = useRef<Promise<Blob | null> | null>(null);
  const [colorMoldeEnCurso, setColorMoldeEnCurso] = useState<string | null | undefined>(undefined);
  // La IA responde ~25 s después: el molde se busca en las fotos de AHORA.
  const fotosRef = useRef(fotos);
  useEffect(() => {
    fotosRef.current = fotos;
  }, [fotos]);
  // La ficha se lee al MANDAR el pedido, no al tocar «Preparar foto»: un color que espera al molde (~25 s) va con el tejido de ese momento.
  const prendaRef = useRef(prenda);
  const fotosEnCursoRef = useRef(fotosEnCurso);
  useEffect(() => {
    prendaRef.current = prenda;
    fotosEnCursoRef.current = fotosEnCurso;
  });
  // Las fotos que ya estaban en su color cuando se encendió la IA y se están preparando ahora, por clave: la tarjeta lo dice y no se piden dos veces.
  const [preparandoFotos, setPreparandoFotos] = useState<ReadonlySet<string>>(new Set());
  const enVuelo = useRef(new Set<string>());
  // `listas` solo hace falta mientras la foto no tiene su `ia` en la pantalla: lo que ya la tiene, o se quitó, sale (un PNG pesa 1 a 2 MB y
  // la pantalla vive toda la tarde con «Crear otro parecido»). `esperar` no lo pierde: si ya salió de aquí, lo lee de las fotos de AHORA.
  useEffect(() => {
    for (const clave of [...listas.current.keys()]) if (!fotos.some((f) => f.clave === clave && !f.ia)) listas.current.delete(clave);
  }, [fotos]);

  const claveDe = (color: string | null) => color ?? "";
  /** El molde ya hecho: la de IA del primer color (en el orden elegido) que la tiene, y que se está usando. */
  function moldeHecho(lista: readonly FotoPendiente[]): FotoPendiente | null {
    for (const c of colores) {
      const f = lista.find((x) => x.colorCodigo === c && x.ia?.usar);
      if (f) return f;
    }
    // La foto «para todos los colores» no es molde (formidable, 2026-11-13).
    return lista.find((x) => x.colorCodigo !== null && x.ia?.usar) ?? null;
  }

  async function preparar(p: PedidoCatalogo) {
    const clave = crypto.randomUUID();
    const vistaReal = URL.createObjectURL(p.frente);
    // La foto real entra ya a su fila: si la IA falla, o si se crea el producto sin esperarla, el color no queda sin foto.
    setFotos((fs) => [...fs, { clave, archivo: p.frente, vista: vistaReal, colorCodigo: p.color }]);
    setPreparando((s) => new Set(s).add(claveDe(p.color)));

    const esMolde: { soltar: ((b: Blob | null) => void) | null } = { soltar: null };
    let molde: Blob | null = null;
    const hecho = moldeHecho(fotosRef.current);
    // La foto «para todos los colores» no usa molde ni lo es: puede mostrar la prenda en otra forma.
    if (p.color === null) molde = null;
    else if (hecho?.ia) molde = hecho.ia.png;
    else if (moldeEnCurso.current) molde = await moldeEnCurso.current;
    else {
      moldeEnCurso.current = new Promise<Blob | null>((resolver) => (esMolde.soltar = resolver));
      setColorMoldeEnCurso(p.color);
    }

    const r = await pedirFotoDeCatalogo({ frente: p.frente, espalda: p.espalda, detalle: p.detalle, molde }, prendaRef.current);
    if ("png" in r) {
      esMolde.soltar?.(r.png);
      const vistaIA = URL.createObjectURL(r.png);
      listas.current.set(clave, { png: r.png, vistaIA, vistaReal, usar: true });
      setFotos((fs) => fs.map((f) => (f.clave === clave ? { ...f, vista: vistaIA, ia: { png: r.png, vistaIA, vistaReal, usar: true } } : f)));
    } else {
      esMolde.soltar?.(null);
      avisar.aviso(avisoIANoRespondio(p.color === null ? `para ${nombreColor(null)}` : `de ${nombreColor(p.color)}`), { detalle: r.error });
    }
    if (esMolde.soltar) {
      moldeEnCurso.current = null;
      setColorMoldeEnCurso(undefined);
    }
    setPreparando((s) => {
      const n = new Set(s);
      n.delete(claveDe(p.color));
      return n;
    });
  }

  async function prepararFoto(frente: File, { callar = false }: { callar?: boolean } = {}): Promise<Blob | null> {
    const esMolde: { soltar: ((b: Blob | null) => void) | null } = { soltar: null };
    let molde: Blob | null = null;
    const deLaPrenda = moldeDeLaPrenda ? await moldeDeLaPrenda() : null;
    const listo = moldeHecho(fotosRef.current);
    if (deLaPrenda) molde = deLaPrenda;
    else if (listo?.ia) molde = listo.ia.png;
    else if (moldeEnCurso.current) molde = await moldeEnCurso.current;
    else moldeEnCurso.current = new Promise<Blob | null>((resolver) => (esMolde.soltar = resolver));
    const r = await pedirFotoDeCatalogo({ frente, espalda: null, detalle: null, molde }, prendaRef.current);
    const png = "png" in r ? r.png : null;
    if (esMolde.soltar) {
      esMolde.soltar(png);
      moldeEnCurso.current = null;
    }
    if (!png && !callar && vigente.current) avisar.aviso(avisoIANoRespondio("tal cual"), { detalle: "error" in r ? r.error : undefined });
    return png;
  }

  /**
   * Prepara la versión de IA de UNA foto que ya estaba en su color. Llega por su clave a su color (`setFotos`) y a `listas`, que `esperar` lee
   * al crear (si «Crear» llega antes de que se dibuje, igual sube el par). Cuenta en `enCurso`: «Crear producto» la espera. Si la IA se apagó
   * mientras tanto, la versión de IA queda guardada pero se sigue viendo la real, con «Usar la de IA» a mano. Devuelve si llegó.
   */
  function ponerIA(f: FotoPendiente): Promise<boolean> {
    // Con la pantalla cerrada nadie recibiría la foto: no se paga.
    if (!vigente.current) return Promise.resolve(false);
    enVuelo.current.add(f.clave);
    setPreparandoFotos((s) => new Set(s).add(f.clave));
    const promesa = prepararFoto(f.archivo, { callar: true })
      .then((png) => {
        if (!png || !vigente.current) return Boolean(png);
        const vistaIA = URL.createObjectURL(png);
        fotosEnCursoRef.current?.abrirVista(vistaIA);
        const usar = encendidoRef.current;
        const ia = { png, vistaIA, vistaReal: f.vista, usar };
        listas.current.set(f.clave, ia);
        setFotos((fs) => fs.map((x) => (x.clave === f.clave && !x.ia ? { ...x, vista: usar ? vistaIA : x.vista, ia } : x)));
        return true;
      })
      .finally(() => {
        enVuelo.current.delete(f.clave);
        setPreparandoFotos((s) => {
          const n = new Set(s);
          n.delete(f.clave);
          return n;
        });
      });
    const enLista: Promise<void> = promesa.then(() => undefined).finally(() => enCurso.current.delete(enLista));
    enCurso.current.add(enLista);
    return promesa;
  }

  /**
   * Prepara lo que falta con la IA encendida: la de frente de cada color (`fotosParaLaIAAlEncender`) y, en «Fotos y colores», las que esperan
   * su color (`encendioLaIA`). Las fallas de toda la tanda van en UN aviso; su «Volver a intentar» repite solo lo que sigue sin IA, y no toca
   * el interruptor: si la persona lo apagó entre medio, no hace nada.
   */
  function prepararLasQueFaltan() {
    if (bloqueadoRef.current || !vigente.current || !encendidoRef.current) return;
    const tanda = fotosParaLaIAAlEncender(fotosRef.current, new Set([...enVuelo.current, ...listas.current.keys()]));
    const enSuColor = Promise.all(tanda.map(ponerIA));
    const esperandoColor = fotosEnCursoRef.current?.encendioLaIA() ?? Promise.resolve(0);
    void Promise.all([enSuColor, esperandoColor]).then(([llegaron, sinColor]) => {
      const aviso = avisoDeIAQueNoPudo(
        tanda.filter((_, i) => !llegaron[i]).map((f) => nombreColor(f.colorCodigo)),
        sinColor,
      );
      if (!aviso || !vigente.current) return;
      avisar.aviso(aviso.titulo, { detalle: aviso.detalle, accion: { texto: "Volver a intentar", onClick: prepararLasQueFaltan }, duracion: 7000 });
    });
  }

  /** Encender la IA con fotos ya subidas las prepara (Felipe 2026-11-16: «tengo que eliminar y agregar de nuevo, cosa que quita tiempo»). */
  function cambiarEncendido(v: boolean) {
    // Mientras se crea, o con la pantalla cerrada, no se cambia (el interruptor ya se apaga; esto es la red de seguridad).
    if (bloqueadoRef.current || !vigente.current) return;
    guardarEncendido(v);
    encendidoRef.current = disponible && v;
    prepararLasQueFaltan();
  }



  const hecho = moldeHecho(fotos);
  const colorDelMolde = hecho ? hecho.colorCodigo : colorMoldeEnCurso;

  return {
    disponible,
    encendido: disponible && encendido,
    cambiarEncendido,
    abrir: (archivos, color) => {
      // El foco vuelve al botón que abrió la hoja (`HojaCatalogoIA` → `alCerrarEnfocar`).
      volverA.current = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
      void fotosParaLaHoja(archivos).then((fotos) => fotos && setHoja({ color, ...fotos }));
    },
    preparando: (color) => preparando.has(claveDe(color)),
    preparandoFoto: (clave) => preparandoFotos.has(clave),
    encendidoAhora: () => encendidoRef.current,
    alternar: (clave) =>
      setFotos((fs) =>
        fs.map((f) => (f.clave === clave && f.ia ? { ...f, vista: f.ia.usar ? f.ia.vistaReal : f.ia.vistaIA, ia: { ...f.ia, usar: !f.ia.usar } } : f)),
      ),
    esperar: async (lista) => {
      // Hasta que no quede ninguna: una que se pide MIENTRAS se espera (se encendió la IA en ese momento) también se espera.
      while (enCurso.current.size) await Promise.all([...enCurso.current]);
      // La que ya tenía su `ia` en la lista la conserva (pudo pasar por «Usar mi foto»); la que llegó mientras se esperaba, la toma de `listas`
      // o, si ya se dibujó (y salió de `listas`), de las fotos de AHORA: `lista` es la copia de cuando se apretó «Crear» (revisión 2026-11-16).
      return lista.map((f) => {
        if (f.ia) return f;
        const ia = listas.current.get(f.clave) ?? fotosRef.current.find((x) => x.clave === f.clave)?.ia;
        return ia ? { ...f, ia } : f;
      });
    },
    prepararFoto: (frente, opciones) => {
      const promesa = prepararFoto(frente, opciones);
      const enLista = promesa.then(() => undefined).finally(() => enCurso.current.delete(enLista));
      enCurso.current.add(enLista);
      return promesa;
    },
    hoja: hoja ? (
      <HojaCatalogoIA
        nombreColor={hoja.color === null ? "Todos los colores" : nombreColor(hoja.color)}
        inicial={hoja}
        molde={hoja.color !== null && colorDelMolde !== undefined && colorDelMolde !== hoja.color ? { url: hecho?.ia?.vistaIA ?? null, nombreColor: nombreColor(colorDelMolde) } : null}
        onPreparar={(p) => {
          setHoja(null);
          const promesa = preparar(p).finally(() => enCurso.current.delete(promesa));
          enCurso.current.add(promesa);
        }}
        onClose={() => setHoja(null)}
        volverA={volverA}
      />
    ) : null,
  };
}
