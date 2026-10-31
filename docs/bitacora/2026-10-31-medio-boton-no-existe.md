# 2026-10-31 — Medio botón no existe

**QUÉ HICE.** Escribir «0,5» en «¿Ya tienes?» de un botón se aceptaba sin una palabra: la base guardaba `0.500` y la
pantalla mostraba **«1 unid.»**. Dos mentiras a la vez — un stock que no puede existir y una pantalla que decía que
había uno entero. Ahora la hoja lo dice antes de guardar («Las unidades se cuentan de uno en uno»), la base lo
rechaza venga por donde venga, y si de algún modo hubiera media unidad guardada, la pantalla **la muestra** en vez
de redondearla.

**POR QUÉ ASÍ.** Lo que se **cuenta** de uno en uno (unidades, conos, pares, docenas) no admite partes; lo que se
**mide** (metros, kilos) sí: medio metro de tela es medio metro. Esa diferencia ya estaba en la tabla de unidades
—las que no admiten decimales al pedirlas— así que la regla la deriva de ahí en vez de abrir una segunda lista que
mañana diga otra cosa.

El candado va en la base **con un disparador, no con un `check`**: la cantidad que se puede escribir depende de la
unidad, que vive en otra tabla, y un `check` no puede mirar otra tabla. Además hay muchas puertas que escriben
cantidades de insumo (ingreso, corrección, consumo, devolución, producción…): ponerlo en cada una lo deja a merced
de que la próxima se olvide. El disparador las cierra todas de una vez, que es el principio 2 — un estado imposible
se impide en el diseño, no se parchea después.

**QUÉ SE ROMPERÍA SIN ESTO.** Stock fraccionario en cosas que se cuentan enteras, y una pantalla que no coincide con
la base. Medio botón no se puede coser ni contar en el cajón: al cuadrar, el sistema dice una cosa y el cajón otra,
y nadie sabe de dónde salió el medio.

---

## Las tres capas, y por qué hacen falta las tres

| Capa | Qué hace | Por qué no basta sin las otras |
|---|---|---|
| La hoja (`problemaDeCantidad`) | lo dice **antes** de guardar, con el nombre de lo que se cuenta | sin ella, el aviso sería un error feo de la base al pulsar Guardar |
| La base (disparador) | lo rechaza venga por donde venga | sin ella, cualquier otra pantalla o RPC vuelve a abrir el agujero |
| La pantalla (`cantidadTexto`) | **muestra** la fracción si la hubiera, en vez de redondear | sin ella, un dato viejo de 0.5 se sigue leyendo «1 unid.» |

La tercera es el mismo criterio que ya habías puesto para los metros el 2026-10-30: ver un saldo de 0,70 m como
«1 m» es mostrar menos de lo que hay. Aquí es peor, porque además es algo que no existe.

## Cómo se verificó

Primero las pruebas, y fallaron. Después el arreglo:

- **La web:** 9 pruebas (`lib/medio-boton-no-existe.test.ts`), incluida una que exige que las dos listas —qué unidad
  admite decimales y cuál admite partes— **no puedan separarse**.
- **La base:** 12 pruebas (`pnpm pruebas:medio-boton-no-existe`), con las cuatro unidades que se cuentan enteras, en
  lotes y en movimientos, más la tela en metros y un lote viejo que se sigue pudiendo corregir.
- **Las de base que ya existían y tocan insumos, con el candado puesto:** `materiales` 143/143,
  `insumos_corregir_ingreso` 46/46, `insumos_devolucion` 10/10, `produccion_corte_con_su_tela` 20/20,
  `candado_dinero_produccion` 21/21 y `produccion_complementos` 17/17. **Ningún flujo real genera fracciones en
  unidades discretas** — que era lo que de verdad había que comprobar antes de poner un candado así.
- **En la hoja «Nuevo avío»**, con login real en el Taller: con «0,5» (y con «0.5») el botón de guardar se apaga y la
  hoja dice «se cuentan de uno en uno»; con «12» entra sin una palabra.

**165 214 pruebas** de la web en verde, `typecheck`, `knip`, `knip:produccion`, `lint` y `migraciones:versiones`.

## Dos cosas que costaron, y quedan escritas

**1 · El disparador no funcionaba, y el ensayo lo destapó.** La primera versión sacaba la cantidad con
`case tg_table_name when 'insumo_lotes' then new.cantidad_ingresada else new.cantidad end`. PL/pgSQL evalúa **las
dos ramas**, así que en la tabla que no tiene `cantidad` reventaba con «record "new" has no field "cantidad"» — y se
llevaba por delante el ingreso de una tela. Va con `if/else`, que evalúa solo la rama que toca.

**2 · El mensaje decía «Los unidades».** Salió así en la pantalla, no en una prueba. El artículo ahora vive en la
tabla de unidades, al lado del nombre, y hay una prueba que lo exige: «Las unidades», «Los conos», «Los pares»,
«Las docenas».

## En producción desde el 2026-10-31

Felipe la pegó el mismo día y la comprobación dio lo esperado: `unidad_entera: true · metro_entera: false ·
candados: 2`. Los dos disparadores están puestos, y la base distingue lo que se cuenta de lo que se mide.

## Lo que NO hace

- **No toca lo que ya está guardado.** Un disparador solo mira lo que se escribe de ahora en adelante, así que esto
  entra sin revisar ni corregir una sola fila. Si hubiera un lote viejo con media unidad, se queda — y ahora se
  **ve** como «0.5 unid.» en vez de «1 unid.».
- **No impide corregir ni anular ese lote viejo:** un `update` que no toca la cantidad no dispara nada (probado).
