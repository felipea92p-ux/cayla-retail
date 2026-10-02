"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { ParecidasBajoNombreProps } from "@/components/alta-producto/ParecidasDelAlta";
import type { ParecidasFicha } from "@/components/alta-producto/FichaPrevia";
import { useParecidos } from "./use-parecidos";
import { useCandidatasAlta } from "./useCandidatasAlta";
import type { LectorCandidatas } from "./parecidas-alta-tipos";
import { rotuloDeTiempo } from "./parecidas-alta-reglas";
import type { AlcanceHoja } from "./parecidas-alta-vista";
import {
  PARECIDAS_INICIAL,
  PAUSA_ALERTA_MS,
  armarParecidasDelAlta,
  buscarParecidas,
  marcaEfectiva,
  nombreReservado,
  ordenarParaAlta,
  reducirParecidas,
  textoVigente,
  TEXTO_ALTA,
} from "./parecidas-alta-estado";

// «Prendas parecidas» en «Nuevo producto» — el hook que conecta la base, la lectura y las reglas con el formulario (Fase 1, sin tocar producción).
//
// EL PROBLEMA. «Nuevo producto» ya tenía `useParecidos` (la comprobación de nombres de la base, que frena «Crear»). Ahora además tiene que leer lo que
// ya existe de la marca, ordenarlo con las reglas, dibujar una alerta en el resumen y una hoja «Ver y comparar», y recordar qué respondió la persona.
// Si todo eso se mete en el formulario, lo más caliente del repo crece por todos lados; aquí vive junto, y el formulario lo usa con los mismos
// nombres que ya conocía.
//
// CONTRATO
//   PROMETE: devolver un SUPERCONJUNTO de `useParecidos` (`items`, `fallo`, `comprobando`, `hayIdentico`, `hayUnaLetra`, `confirmo`, `confirmar`,
//            `reintentar`, `reiniciar`): el formulario sigue armando su candado con los mismos nombres. El candado lo da la BASE (ver
//            `parecidas-alta-estado.ts`); lo demás (`ficha`, `bajoNombre`, `pieRevisa`, `resumenAvance`, `motivoBloqueo`, `abrirHoja`) solo dibuja.
//            Que la alerta espera 0,6 s tras teclear (vaciar el campo es inmediato) y que el candado NO espera: usa el nombre de ahora. Que no lee nada
//            sin categoría ni sin red. Que `reiniciar()` («Crear otro parecido») borra lo respondido, cierra la hoja y vuelve a leer lo que ya existe:
//            la memoria de la lectura dura 3 min y no trae la prenda recién creada, que es la parecida más probable de la siguiente.
//   ASUME:   que `nombre` ya viene en el formato único (tipo título: el que comprueba la base), que `categoriaNombre` es el de la categoría HOJA
//            («Jeans»), y que el formulario usa `useSalidaSinGuardar` (los enlaces «Es el mismo diseño» salen de la pantalla).
//   NO HACE: no decide nada por su cuenta (todo sale de `parecidas-alta-estado.ts`, probado sin navegador), no escribe en la base y no lleva precio
//            ni costo. El reloj se toma al montar y al teclear/abrir/reintentar, nunca en un intervalo.

export type EntradaParecidasAlta = {
  /** El nombre en formato único (`tituloReferencia`): lo que comprueba la base. */
  nombre: string;
  descripcion: string;
  /** El texto legible del tejido y del patrón elegidos, o `null`. */
  tejido: string | null;
  patron: string | null;
  /** `""` = todavía no eligió categoría. */
  categoriaId: string;
  /** El nombre de la categoría hoja («Jeans»); `null` = sin categoría. */
  categoriaNombre: string | null;
  /** `""` = sin marca. «Importado» cuenta como sin marca (D5). */
  marcaId: string;
  marcaNombre: string;
  enLinea: boolean;
  /** La lectura de lo que ya existe, inyectable (pruebas y páginas de prueba). Sin ella, lee de la base. */
  leer?: LectorCandidatas;
};

export function useParecidasAlta(p: EntradaParecidasAlta) {
  const activo = Boolean(p.categoriaId);
  const lee = activo && p.enLinea;

  // La base: el candado. Exactamente lo de siempre (350 ms de espera, 6 s de plazo, sin mostrar el resultado de un nombre viejo).
  // Un nombre es único POR MARCA (ADR-0294): la base solo frena al homónimo de la misma marca, y la pantalla igual.
  const base = useParecidos({ nombre: p.nombre, activo, marcaId: p.marcaId });

  // Un nombre que el sistema se reservó («Prenda sin Registrar»): la base no lo ve como «ya existe» pero el índice único sí lo rechaza. No espera a la pausa.
  const reservado = useMemo(() => nombreReservado(p.nombre), [p.nombre]);

  // Marca (D5: «Importado» y sin marca son lo mismo) y lectura de lo que ya existe. Los ids que marcó la base viajan aparte: pueden ser de OTRA marca.
  const marca = useMemo(() => marcaEfectiva(p.marcaId, p.marcaNombre), [p.marcaId, p.marcaNombre]);
  const idsDeLaBase = useMemo(() => base.items.map((x) => x.id), [base.items]);
  const cand = useCandidatasAlta({ marcaId: marca.id, categoriaId: p.categoriaId || null, idsExtra: idsDeLaBase, activo: lee, leer: p.leer });

  // La pausa de 0,6 s: solo lo que DIBUJA la alerta (nombre y descripción). Vaciar un campo no espera. El reloj se toma aquí, dentro del temporizador,
  // y en los manejadores: nunca al renderizar.
  const [estable, setEstable] = useState(() => ({ nombre: p.nombre, descripcion: p.descripcion, ahora: Date.now() }));
  useEffect(() => {
    const espera = p.nombre.trim() === "" && p.descripcion.trim() === "" ? 0 : PAUSA_ALERTA_MS;
    const t = setTimeout(() => {
      setEstable((prev) => (prev.nombre === p.nombre && prev.descripcion === p.descripcion ? prev : { nombre: p.nombre, descripcion: p.descripcion, ahora: Date.now() }));
    }, espera);
    return () => clearTimeout(t);
  }, [p.nombre, p.descripcion]);
  const nombreVigente = textoVigente(p.nombre, estable.nombre);
  const descripcionVigente = textoVigente(p.descripcion, estable.descripcion);
  const atrasada = nombreVigente !== p.nombre;

  // Lo que la persona respondió y la hoja. Las respuestas son por id: no se olvidan al cambiar nombre, marca ni categoría.
  const [estado, despachar] = useReducer(reducirParecidas, PARECIDAS_INICIAL);

  const entradaOrden = {
    candidatas: cand.candidatas,
    marcaId: marca.id,
    marca: marca.nombre,
    categoriaId: p.categoriaId || null,
    categoria: p.categoriaNombre,
    nombre: nombreVigente,
    descripcion: descripcionVigente,
    tejido: p.tejido,
    patron: p.patron,
    ahora: estable.ahora,
  };
  // Lo pesado se memoriza: un re-render cualquiera del formulario no vuelve a ordenar. La lista «de toda la marca» solo se arma con la hoja en ese alcance.
  const resultado = useMemo(
    () => (lee ? ordenarParaAlta(entradaOrden) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `entradaOrden` se arma con estos mismos valores, uno por uno
    [lee, cand.candidatas, marca.id, marca.nombre, p.categoriaId, p.categoriaNombre, nombreVigente, descripcionVigente, p.tejido, p.patron, estable.ahora],
  );
  const hojaDeMarca = estado.hoja?.alcance === "marca";
  const resultadoMarca = useMemo(
    () => (lee && marca.id && hojaDeMarca ? ordenarParaAlta(entradaOrden, { todaLaMarca: true }) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ídem
    [lee, hojaDeMarca, cand.candidatas, marca.id, marca.nombre, nombreVigente, descripcionVigente, p.tejido, p.patron, estable.ahora],
  );

  const rotuloTiempo = useCallback((iso: string) => rotuloDeTiempo(iso, estable.ahora) ?? "", [estable.ahora]);

  const salida = useMemo(
    () =>
      armarParecidasDelAlta({
        activo,
        enLinea: p.enLinea,
        base,
        cargando: cand.cargando,
        falloLectura: cand.fallo,
        resultado,
        marca: marca.nombre,
        categoria: p.categoriaNombre,
        nombreVigente,
        atrasada,
        revisadas: estado.revisadas,
        rotuloTiempo,
      }),
    // `base` se arma cada render (objeto nuevo); se depende de sus piezas, que son las que cambian.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activo, p.enLinea, base.items, base.fallo, base.comprobando, base.hayIdentico, base.hayUnaLetra, base.confirmo, cand.cargando, cand.fallo, resultado, marca.nombre, p.categoriaNombre, nombreVigente, atrasada, estado.revisadas, rotuloTiempo],
  );

  // Abrir la hoja: el botón que la abrió recibe el foco al cerrarla (si ya no está en pantalla, la hoja busca sola un lugar real).
  const disparador = useRef<HTMLElement | null>(null);
  const abrirHoja = useCallback((id?: string, alcance: AlcanceHoja = "lista") => {
    disparador.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setEstable((prev) => ({ ...prev, ahora: Date.now() }));
    despachar({ tipo: "abrir", id, alcance });
  }, [despachar]);

  const { reintentar: reintentarLectura } = cand;
  const { reintentar: reintentarBase, reiniciar: reiniciarBase } = base;
  const reintentar = useCallback(() => {
    setEstable((prev) => ({ ...prev, ahora: Date.now() }));
    // Se olvida lo que la base había dicho de este nombre: tras un rechazo («otra sede lo creó») lo de antes ya no vale, y mientras se vuelve a comprobar
    // `comprobando` es true (si no, «Crear» quedaba libre esa fracción de segundo con un resultado viejo).
    reiniciarBase();
    reintentarBase();
    reintentarLectura();
  }, [reintentarBase, reiniciarBase, reintentarLectura]);
  const reiniciar = useCallback(() => {
    reiniciarBase();
    despachar({ tipo: "reiniciar" });
    setEstable({ nombre: "", descripcion: "", ahora: Date.now() });
    reintentarLectura();
  }, [despachar, reiniciarBase, reintentarLectura]);

  const resultadoHoja = estado.hoja?.alcance === "marca" ? resultadoMarca : resultado;

  // Sin red, sin categoría o sin marca (en «toda la marca») no hay nada que comparar: la hoja se CIERRA, no solo se oculta. Si solo se ocultara,
  // `estado.hoja` seguiría abierto y la hoja reaparecería sola al volver la conexión, tapando el formulario sin que nadie la pidiera.
  const hojaAbierta = Boolean(estado.hoja);
  const hayQueComparar = Boolean(resultadoHoja);
  useEffect(() => {
    if (hojaAbierta && !hayQueComparar) despachar({ tipo: "cerrar" });
  }, [hojaAbierta, hayQueComparar]);

  const hoja: ParecidasFicha["hoja"] =
    estado.hoja && resultadoHoja
      ? {
          resultado: resultadoHoja,
          marca: marca.nombre,
          categoria: p.categoriaNombre,
          alcance: estado.hoja.alcance,
          revisadas: estado.revisadas,
          fallo: cand.fallo,
          rotuloTiempo,
          buscar: buscarParecidas,
          idEnfocado: estado.hoja.id,
          alCerrarEnfocar: disparador,
          onCerrar: () => despachar({ tipo: "cerrar" }),
          onRevisada: (id) => despachar({ tipo: "revisada", id, resultado }),
          onDeshacer: (id) => despachar({ tipo: "deshacer", id }),
          onNinguna: (ids) => despachar({ tipo: "ninguna", ids }),
          onVerMarca: marca.id ? () => despachar({ tipo: "abrir", alcance: "marca" }) : undefined,
        }
      : null;

  const ficha: ParecidasFicha = {
    alerta: salida.alerta,
    // Con un aviso bajo «Nombre» (el rojo del idéntico o el ámbar de «casi igual») la región del resumen no repite lo que ese aviso ya dijo al lector de pantalla.
    avisoEnLinea: salida.avisoNombre !== null || salida.avisoUnaLetra !== null,
    onVer: (id) => abrirHoja(id),
    onVerMarca: () => abrirHoja(undefined, "marca"),
    onReintentar: reintentar,
    hoja,
  };

  const bajoNombre: ParecidasBajoNombreProps = {
    noSePudoComprobar: salida.noSePudoComprobar,
    aviso: salida.avisoNombre,
    avisoUnaLetra: salida.avisoUnaLetra,
    nombreReservado: reservado ? TEXTO_ALTA.nombreReservado(reservado) : null,
    onComparar: (id) => abrirHoja(id),
    respaldo: salida.respaldo,
    confirmo: base.confirmo,
    onConfirmo: base.confirmar,
  };

  return {
    // ---- lo mismo que `useParecidos`: el formulario arma su candado con estos nombres ----
    items: base.items,
    fallo: base.fallo,
    comprobando: base.comprobando,
    hayIdentico: salida.nombreBloqueado || reservado !== null,
    hayUnaLetra: salida.hayUnaLetra,
    /** Lo que viaja como `p_confirmo_distinto`: todas las «una letra» respondidas (o, en el respaldo, la casilla). */
    confirmo: salida.confirmo,
    confirmar: base.confirmar,
    reintentar,
    reiniciar,
    // ---- lo nuevo: solo dibuja ----
    ficha,
    bajoNombre,
    pieRevisa: salida.pieRevisa,
    resumenAvance: salida.resumenAvance,
    motivoBloqueo: reservado ? TEXTO_ALTA.nombreReservado(reservado) : salida.motivoBloqueo,
    abrirHoja,
  };
}
