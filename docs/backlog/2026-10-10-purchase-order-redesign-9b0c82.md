## Compras ▸ Órdenes de compra, fase 1 (2026-10-10) — rama `claude/purchase-order-redesign-9b0c82`

ADR-0362, fase 1 aprobada por Felipe el 2026-10-10 en 8 actividades. Diseño y decisiones 1–39 en el ADR; traspaso en
`docs/compras/ordenes-de-compra-2026-10/README.md`.

- [x] 1 · **El módulo y la lista** (`ffd60aae`): `ordenes_compra` en Roles y accesos (nace solo para el líder), tablas `ordenes_compra` /
  `orden_compra_items`, `fn_ordenes_compra`; la lista con `EncabezadoPagina` y su vacío.
- [x] 2 · **Crear** (`015b81be`, ajustes `41c6c374`, `6b5d50b6`): `crear_orden_compra` con el id de la pantalla (un doble clic no crea
  dos), número bloqueado y aviso si otra orden tomó el anunciado; guía de foco; firma de la persona o el combo en una terminal (decisión 39).
- [x] 3 · **Ver y filtrar** (`81840ae5`): ventana interceptada sobre la lista y página `/compras/ordenes/ver/<id>`; filtros por destino y
  estado, buscador, cifras, vacío con filtros que se quitan, paginación. Arreglos de paso: el calendario de `CampoFecha` flota (`ed6cad9c`),
  el descuento junto al subtotal (`33952e30`), títulos de columna legibles (`9f347d09`).
- [x] 4 · **Editar** (`bcea0618`, `4d6a710e`): versión que sube sola, `PT409` si otra persona guardó antes, archivo
  `orden_compra_versiones` (nunca se borra lo de antes), Actividad sin montos.
- [x] 5 · **Anular** (`3e46dd5a`): motivo obligatorio (300 letras), irreversible, no libera el número.
- [x] 6 · **PDF** (`d955d4b2`): papel A4 en tinta, `OC-000129.pdf`, una anulada lo dice arriba.
- [x] 7 · **`/formidable`** (`6f197aa8`): dos ciegas y un escéptico; el reintento que confirmaba lo que no se guardó, arreglado en la base
  (CR2b, E2b) y en la pantalla; «Llega a» sin ✓ de fábrica y con «Por repartir» explicado; al guardar, la lista muestra la orden marcada;
  la orden abierta sin datos repetidos. Leyes 6,7 → 7,3 (provisional), oficio 8.
- [ ] 8 · **Cierre:**
  - [x] **`main` traído el 2026-10-12** (123 commits, después de que Felipe confirmó el origen del repositorio en la app). 8 choques,
        todos de «los dos agregaron en el mismo lugar»: `globals.css`, `IconoModulo.tsx`, `menu.test.ts` (Inventario 8 y Compras 7),
        `modulos.test.ts` («Plan del piso» y «Órdenes de compra»), `ARQUITECTURA.md`, `SESIONES-ACTIVAS.md`, el tablero de `/chaos` y
        `CampoFecha.tsx`: `main` arregló el mismo día el calendario que se cortaba en una hoja; quedó su versión con la regla de aquí
        (abre hacia abajo solo si cabe entero: en «Nueva orden» a 1024×768 se abría cortado). `tsc` y eslint limpios; vitest 157 478 bien
        (una prueba de `main` se pasó de 5 s con la máquina cargada y pasa sola); las 25 migraciones nuevas de `main` aplicadas en el banco
        y `pruebas:ordenes-compra` 41/41; guardar, abrir y editar una orden probados en el navegador sobre el código unido.
  - [x] **Pegado en producción con el OK de Felipe (2026-10-10)**, en orden, con `apply_migration`: versiones `20261010224526`
        (módulo y tablas), `…224636` (crear), `…224710` (ver y resumen), `…224915` (editar) y `…224946` (anular). Antes se vio que el
        orden 145 del módulo ya lo usaba `liquidacion` y se movió al 148 (`8687a118`). Verificado después: tablas con RLS y sin
        políticas, el módulo sin rol, las 3 claves sin combo, los 2 disparadores, y las 16 funciones con la MISMA huella (md5 de
        `pg_get_functiondef`) que el banco donde pasaron las 40 pruebas.
  - [x] **Diccionario:** la foto de `main` (2026-10-11 17:30 UTC) ya trae las 3 tablas y las funciones de la fase 1 (la refrescó otra
        sesión después del pegado). `datos:generar:produccion` sin cambios, `datos:comparar` sin llamadas que producción no acepte,
        `datos:aviario` y `diccionario-datos` (50/50) bien. Producción tiene 6 grupos más nuevos que la foto (tablas que empiezan con «p»,
        funciones `edit*`, `quit*`, `rest*`): son de otras sesiones y no se refrescan en este PR.
  - [x] **Modo oscuro** (`tema:auditar` contra el banco, 7 vistas con los escenarios nuevos `ordenes.*`): 0 hallazgos solo en oscuro;
        las capturas, miradas. Heredados: la flecha «›» de cada fila (pieza común `cmp-flecha-fila`, 2,5:1 en los dos temas).
  - [ ] Abrir el PR (lo fusiona Felipe), con las casillas de la plantilla (celular, `/chaos`, Formidable).
- [x] **`/chaos`** sobre crear, editar y anular (2026-10-10, semilla 20261010, 22 ataques en el banco; informe local en el banco): 18
  resistieron (doble clic de mano, red cortada antes y después de guardar, dos pestañas, inyección, permisos sin el módulo…). Quedan 5:
  Felipe pidió arreglar los cinco; cada uno con su prueba primero (fallaba antes) y en su commit:
  - [x] G2 · Entrega fuera de rango al editar una orden sin fecha (`262509d1`): migración `20261010235800` (`is not distinct from`), **EN
        PRODUCCIÓN** (versión `20261010232451`, misma huella que el banco), prueba E7b; y la guía bloquea una fecha escrita que la base
        rechazaría. Repetido el ataque: «Falta: Entrega estimada» y 0 llamadas.
  - [x] G2 · Miles con punto (`74ad1291`, `38512d51`): «1.000» y «1.500» son ambiguos y la línea lo dice a la vista
        («¿«1.000» son 1000? Escribe la cantidad sin punto: 1000.»). Repetido: total S/ 0.00, «Falta: línea 1», 0 llamadas.
  - [x] G3 · Dos clics en el mismo instante (`60fb3268`): candado `enVuelo` (el de la casa) en Nueva/Editar y en «Anular orden»; prueba
        `ordenes-compra-doble-clic.test.ts`. Repetido en el navegador el 2026-10-12: dos clics en el mismo instante en «Guardar orden» →
        una llamada, una orden, ningún número gastado y la lista con la orden marcada; en «Anular orden» → una llamada, una anulación y una
        línea de Actividad.
  - [x] G4 · Foco al cerrar «Anular orden» (`f2d7b545`): el botón se recuerda y se pasa en `alCerrarEnfocar`; prueba
        `ordenes-compra-foco.test.ts`. Repetido en el navegador el 2026-10-12: con Escape y con «Cancelar», el foco vuelve a «Anular orden».
  - [x] G4 · Carácter nulo (`9a279252`): `textoParaBase` limpia nota, descripciones y motivo. Queda para todo el ERP: `traducirError` sin
        huella para 22P05 (otra tarea).
  - [ ] Anotado, de la base: dos pedidos con el mismo id a la vez gastan un número (`on conflict do nothing` toma el `nextval` antes); y la
        Actividad escribe la entrega como DD/MM, sin año.
- [ ] **Formidable:** repetir la ciega sobre la pantalla nueva y recalificar; 3–5 colaboradoras reales (la compradora en Gamarra).
- [ ] **Lista aparte, sin orden de Felipe** (`docs/formidable/compras-ordenes.md`): el total tachado de una anulada a 2,86:1; «Editar» último
  en el pie de la orden; «Precio u.»; «Generada» (¿«ya se le mandó»?); la ✕ de quitar una línea a 32 px en celular. Piezas del sistema:
  «Cancelar» junto a «Anular» (en el Perú «cancelar un pedido» es anularlo), «trae», lo sugerido bajo «Faltan», `Boton` 43,75 px contra
  `BotonEnlace` 40 en la misma fila (`campos.tsx:971`), el calendario de `CampoFecha` a 20 px, las cajas de 40 px en celular, y
  `scripts/rendimiento/ui.mjs` que no imprime nada cuando la ruta del repo tiene un espacio.
