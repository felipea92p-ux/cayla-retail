# ADR-0170 — Movimientos: filtro de proceso en dos pasos, lista de la guía y una sola sede

- **Fecha:** 2026-09-22
- **Estado:** aceptado (Felipe eligió las tres opciones en la demo `docs/maquetas/movimientos-rediseno-2026-09/`)
- **Relacionados:** ADR-0050 (categoría = lectura), ADR-0127 (Movimientos simplificado), ADR-0169 (paleta oficial)

## Contexto

`/inventario/movimientos` tenía tres fricciones a la vista (capturas de Felipe del 2026-09-22):

1. **Dos selectores de sede** que podían contradecirse: el global de la cabecera (`UbicacionSwitcher`,
   cookie) y uno local en el título (`SelectorUbicacion`, `?ubicacion=`).
2. **El proceso se filtraba con un select nativo de 19 opciones** escondido en «Más filtros».
3. **Tres grupos de píldoras** (Tipo, Sububicación, Período) que en una laptop se partían en varias
   líneas, y una tabla de seis columnas que en celular se desplazaba de lado.

## Decisión

- **Una sola sede: la de la cabecera.** La página usa `persona.ubicacionId` (que ya respeta la
  cookie del líder). `?ubicacion=` se ignora en esta pantalla. Existencias y Recibir conservan su
  selector local por ahora: la decisión fue solo sobre Movimientos.
- **Proceso en dos pasos (drill-down).** Al elegir un tipo aparecen debajo solo sus procesos
  (`PROCESOS_POR_CATEGORIA` en `lib/movimientos-reglas.ts`). «Cambio» está en Entradas y en Salidas
  porque las RPC lo escriben con los dos `tipo`. Un enlace con solo `?proc=` (el de Conteo) deduce
  su tipo (`categoriaDeProceso`). «Más filtros» desaparece: solo contenía ese select.
- **Filtros como la guía:** fila 1 búsqueda + período; fila 2 tipo (con su cifra) y la
  sububicación en un control segmentado chico a la derecha. En celular cada fila se desliza.
- **Lista de la guía + hora:** por día, punto · prenda (talla · color · hora · dónde) · proceso
  (origen → destino) · referencia · cantidad; en celular, dos líneas.
- **Vacío que explica:** con 7 o 30 días y nada que mostrar, se consulta una vez el resumen de 90
  días y se ofrece «Ver los últimos 90 días» con la cifra real (`MovimientosVacio.tsx`).

## Por qué sin cantidades en los procesos

Las píldoras de tipo muestran cuántos hay porque `fn_movimientos_resumen` ya agrupa por categoría
(e ignora el tipo). Contar por proceso exigiría cambiar esa RPC en producción; no se justificó
para una pantalla de lectura. Queda en BACKLOG por si el equipo lo pide.

## Costo

- Una consulta extra solo en dos casos: con un proceso elegido (el resumen sin proceso, para que
  las cifras de tipo no caigan a cero) y con la lista vacía en un período corto.
- Un líder que quería mirar otra sede *solo* en Movimientos ahora cambia la sede de todo el ERP.
