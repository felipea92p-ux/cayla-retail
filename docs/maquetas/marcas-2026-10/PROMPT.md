# Prompt para rediseñar Catálogo ▸ Marcas (v2)

Pega todo lo que sigue en una sesión nueva de Claude Code, con la rama al día con `main`. Antes, abre `spike.html` (esta carpeta)
y revisa la tabla de decisiones del final.

---

```
/construir

Rediseña la pantalla Catálogo ▸ Marcas (`/productos/marcas`) para que las MARCAS sean lo primero que se ve, se recorran 89
(hoy) o 300 (mañana) sin cansarse, y el buscador se adelante a lo que la colaboradora quiere escribir. Antes de tocar código, lee
`CLAUDE.md` completo, `docs/maquetas/marcas-2026-10/spike.html` (la maqueta: ábrela y tócala) y su `README.md`. La maqueta manda
sobre este texto en lo visual; este texto manda en lo que NO se toca.

## Qué cambia (solo la cara; ninguna regla de negocio)

1. CABECERA. La de Marcas está SIN DECIDIR (CLAUDE.md, «Paleta y orden de pantalla»): antes de elegir, pregúntame si usa
   `<EncabezadoPagina>` como Catálogo ▸ Productos (la maqueta lo supone). «Nueva marca» va a la derecha, en `acciones`.
1b. AYUDA «!» JUNTO AL TÍTULO: la pantalla ya tiene `<Ayuda titulo="Marcas">` (`components/Ayuda.tsx`); se conserva. Con `<EncabezadoPagina>`
   va dentro del `titulo` (`titulo={<>Marcas <Ayuda …/></>}`; acepta nodos). El texto de `page.tsx` se conserva, con UNA frase
   adaptada porque desactivar y eliminar pasan a «Más»: «En «Más» desactivas la marca —no se puede si tiene productos activos— o la
   eliminas —solo si ningún producto la tiene, tampoco uno descontinuado—: …». Verifica que el globo no queda tapado por la tarjeta
   de abajo: un elemento con animación de entrada crea su propia capa, y si la cabecera no tiene `z-index` más alto, la tarjeta que
   viene después se pinta encima (en la maqueta pasó).
2. RESUMEN COLAPSADO POR DEFECTO. Los cuatro números («Todas», «Ya las usamos» = ≥ 1 producto activo, «Sin productos»,
   «Sin proveedor», este con punto y número en ámbar si > 0) son filtros: dentro de la misma tarjeta de la lista van como
   `pildora-cayla` con su conteo. Un botón «Resumen ▾» abre encima las cuatro `<TarjetaCifra>` (`onClick` + `activa`: filtran, sin
   flecha) con un deslizamiento corto, y mientras están abiertas las píldoras se esconden (no se repite la misma cifra dos veces).
   DECIDIDO por Felipe (2026-10-10): COLAPSADO (no quitado). Nace colapsado siempre; no recuerda si quedó abierto (si Felipe quiere
   recordarlo por aparato, como el modo oscuro, es otra decisión).
3. UNA SOLA TARJETA con buscador, píldoras, índice A–Z, lista y paginación. Un botón «Desactivadas · n» (`pildora-cayla`) cambia
   la lista a las desactivadas (hoy van al final de la página, donde con 89 marcas nadie las ve).
4. BUSCADOR CON PREDICCIÓN, SIN LISTA DESPLEGABLE (Felipe, 2026-10-10: si el buscador ya filtra las marcas, una lista repite lo que
   ya se ve). La predicción vive en dos sitios:
   - En el campo: una «sombra» gris con lo que falta de la marca más probable, solo si lo escrito es su comienzo; Tab o → la completan,
     Enter la completa y va a esa marca (queda sola, salta a su página y destella una vez), Esc borra la búsqueda.
   - En las tarjetas: se reordenan por lo probable mientras se escribe. Orden: empieza con lo escrito > una palabra suya empieza con
     eso > lo contiene > la trae un proveedor con ese nombre; a igual puntaje, la marca con más productos activos. Sin coincidencia,
     las parecidas a una letra de distancia con el aviso «Nada se llama «wayy». ¿Buscabas alguna de estas?» (no un vacío). Con
     búsqueda activa se esconden el índice A–Z y el «de X a Y», porque el orden ya no es alfabético.
   - LÓGICA PURA en `lib/marcas.ts` (`ordenarPorPrediccion`, `prediccionDe`) con su prueba: recorre TODAS las marcas y proveedores del
     seed y exige totalidad, orden estable (sin azar, sin red), que escribir una marca completa la ponga primera, que un error de una
     letra la encuentre y que la sombra no aparezca si lo escrito no es el comienzo de ninguna. El componente solo la llama.
   - ES UNA CAPACIDAD NUEVA DE UNA PIEZA YA DECIDIDA (`<Buscador>`, ADR-0358): impleméntala como prop opt-in de `<Buscador>`
     (`sombra`), nunca un buscador propio dentro de Marcas. Es una excepción a «busca mientras se escribe, sin esperar Enter»: aquí
     Enter completa la sombra. Dilo en el ADR; que se extienda a otras pantallas lo decide Felipe con `/unificar`.
5. TARJETA DE MARCA, con el número de productos COMPACTO. Monograma de 44 px cuyo color DICE EL ESTADO (verde = la usamos, hueso =
   nadie la ha usado, ámbar = sin proveedor; solo tokens; es estado, no color de prenda); nombre en serif de 20 px; una línea de
   estado en palabras («Ya la usamos», «Nadie la ha usado todavía», «Sin proveedor: no se puede usar en un producto»); a la
   derecha «9 productos» en UNA línea (cifra de 18 px en serif, la palabra en 12 px; el cero en taupe, no gris pálido); «La trae»
   con los proveedores como chips y sus productos. Acciones: «Editar» (o «Agregar proveedor» primario si no tiene proveedor) y «Más ▾».
6. LO PELIGROSO SALE DE CADA TARJETA a `<MenuAcciones>` con `peligro`. Si la marca tiene productos activos, «Desactivar» va
   deshabilitada con `motivo` («Tiene 2 productos activos: primero cámbialos de marca») en vez de dejar tocar y devolver el error
   del trigger `fn_marcas_desactivar_candado`; igual «Eliminar» (`sePuedeEliminarMarca`). El trigger y la RPC `eliminar_marca`
   siguen siendo el candado real. Motivo: con 89 marcas serían hasta 178 botones rojos y el rojo vale máximo 2 por pantalla (ADR-0169).
7. PAGINACIÓN EN MEMORIA: `paginar()` de `lib/paginacion.ts` y `<PaginacionLocal>` (si queda corta para el pie de la maqueta,
   mejórala en su lugar y que la usen las demás). **24 por página, fijo** (constante en `lib/marcas.ts`, sin selector): llena 2, 3 y
   4 columnas sin dejar una última fila coja. Pie «Mostrando 25–48 de 89 · de Cala a Gala». Cambiar de página sube a la lista
   (ADR-0185); buscar o filtrar vuelve a la 1; índice A–Z que lleva a la página de su primera marca y la destella.
   Tras crear o renombrar una marca, la lista te lleva a donde quedó.
8. VACÍOS con `<Vacio>` (sin marcas; sin resultados: nombra lo buscado, «¿Quisiste decir …?» y «Borrar la búsqueda»).

## Movimiento: normal (ADR-0136: sin rebote, sin bucle, nunca decorativo; se apaga con `prefers-reduced-motion`)

Entrada en cascada de las primeras 12 tarjetas (28 ms de desfase), cifras que cuentan una vez (al abrir el resumen), tarjeta que
se encoge al desactivarse, destello de la marca recién guardada o elegida, el resumen que se despliega. Nada en bucle. Los botones
y las hojas ya traen su movimiento (`.mov-boton`, `<Modal>`): no definas animaciones de entrada propias.

## Lo que NO se toca (si algo lo exige, para y pregúntame)

- Tablas, RPC, triggers, RLS, migraciones, permisos y módulos: ninguno.
- **`EditarMarcaModal.tsx` queda como está** (decisión de Felipe, 2026-10-10: «mantener el estilo original»). Ya es el sistema: `<Modal>`,
  guía de foco, cambios diferidos, responsable. La maqueta lo reproduce fiel, no lo rediseña.
- **La lista de «Suma otro proveedor…» flota por encima de la hoja** (la maqueta v2 la dibujó dentro y agrandaba la hoja: era un error de
  la maqueta). En la pantalla real ya es así (`ComboBuscable` + `useDestinoFlotante`, ADR-0211): no hay nada que construir; solo verifica en el
  navegador que la hoja no cambia de tamaño al abrirla, en Editar y en Nueva marca.
- **`NuevaMarcaForm` queda como está** (hoy en línea sobre la lista). La maqueta lo muestra como hoja solo para ensayar «¿No será una
  que ya existe?»; cambiar eso es otra decisión.
- Vocabulario: «colaboradora/integrante», «sede». Solo tokens (modo oscuro incluido; lo vigila `tema-colores.test.ts`).

## Cómo se hace (pasos verificables, un commit por paso)

1. Refactor sin cambio visual: sacar de `MarcasLista.tsx` la tarjeta a `components/marcas/TarjetaMarca.tsx` y la lógica nueva
   (estado de una marca, letra, página de una letra, texto «de X a Y», `sugerirMarcas`) a `lib/marcas.ts` con pruebas.
2. Cabecera (con la ayuda «!») + resumen colapsable con las píldoras.
3. Tarjeta de marca (número compacto) + `MenuAcciones` con `motivo`.
4. Paginación + índice A–Z + salto tras guardar.
5. Predicción del buscador (la parte pura primero, con su prueba; luego la prop `sombra` de `<Buscador>` y el reordenado de las tarjetas).
6. Vacíos, «Desactivadas» y movimiento.

## Cómo se verifica (antes de decir «listo»)

- `pnpm --filter web typecheck`, `lint` y las pruebas de `lib/marcas*.test.ts`, `sin-select-nativo`, `tema-colores`, `unificar`.
- En el navegador, con la sesión de prueba del seed, escritorio y 89 marcas: escribir `am` y completar con Tab; `wayy` y ver el
  aviso de parecidas; escribir el nombre de un proveedor; abrir «Editar» y «Nueva marca», abrir la lista de proveedores y comprobar que la hoja no cambia de tamaño; crear una marca de la «W» y comprobar que salta y destella; recorrer las 4 páginas con
  las flechas; desactivar una marca sin productos; intentar desactivar una con productos y leer el motivo; abrir y cerrar el resumen.
- `pnpm --filter web tema:auditar -- --cuenta <líder> --ruta /productos/marcas --escenarios` (claro y oscuro): 0 hallazgos nuevos.
- Captura antes/después al mismo ancho que la maqueta; si no se parecen, no está terminada.
- `/formidable` sobre la pantalla; `/chaos` (guarda); `/focus` y `/sugerir` solo informan (no hay campos nuevos más allá del buscador).
- Las tres de siempre: dos personas editando la misma marca a la vez, la base sin responder, y una colaboradora sin formación
  técnica que llega sin que nadie le explique.
- ADR corto en `docs/adr/` (resumen colapsado, 24 por página, predicción del buscador y su excepción de Enter), `docs/ARQUITECTURA.md`,
  y una entrada en `docs/bitacora/` y `docs/backlog/`.

Entrega: lo hecho, la objeción si la hay, y lo que no pedí y encontraste.
```

---

## Decisiones

| Decisión | Estado |
|---|---|
| 24 por página, fijo | **Decidido** (Felipe, 2026-10-10) |
| Movimiento normal | **Decidido** |
| Número de productos compacto | **Decidido** |
| Hoja «Editar» original | **Decidido**: no se toca |
| Buscador con predicción, sin lista desplegable | **Decidido**; que se extienda a otras pantallas, no |
| Cifras colapsadas | **Decidido** (Felipe, 2026-10-10) |
| Ayuda «!» junto al título | **Decidido**: sí, con el texto extenso |
| Cabecera de Marcas | **Pendiente**: recomiendo la de Productos |
| Índice A–Z | Recomiendo sí; se quita en una línea |
