# Spike visual · Catálogo ▸ Marcas (2026-10-10, v2)

> **Estado: propuesta, sin decidir.** Nada de esto está en la app. Es la prueba que pidió Felipe para ver cómo se lleva
> «Marcas» a un diseño más vivo, con las marcas como protagonistas y 89 marcas paginadas. El prompt para construirla de verdad
> está en [`PROMPT.md`](PROMPT.md).

`spike.html`: un solo archivo, se abre con doble clic o con el servidor `maquetas` de `.claude/launch.json`
(`/marcas-2026-10/spike.html`). Arriba, una barra punteada con los controles de la maqueta (no es parte del ERP).

## Lo que Felipe decidió el 2026-10-10

| Decisión | Resultado |
|---|---|
| Marcas por página | **24**, fijo (la maqueta ya no trae selector) |
| Movimiento | **Normal** (la maqueta ya no trae el interruptor; `prefers-reduced-motion` del sistema sigue apagándolo) |
| Número de productos | **Compacto**: 18 px en serif, «9 productos» en una línea, ya no 34 px |
| Hoja «Editar» | **La original del sistema**, copiada de `EditarMarcaModal.tsx`; la maqueta v1 la había reinventado |
| Buscador | **Con predicción, sin lista desplegable** (ver abajo) |
| Cifras (KPI) | **Colapsadas** (decidido el 2026-10-10). La comparación con «quitar» queda abajo como registro; la maqueta ya no trae el control para compararlas |
| Ayuda «!» del título | **Sí**, la del sistema (`<Ayuda titulo="Marcas">`): círculo de 20 px que se enciende en rojo y un globo con el texto extenso |

## Cifras: colapsar o quitar (medido en la maqueta, 1360 px de ancho)

Registro de la comparación (la maqueta v2 traía un control con los tres modos; se quitó al decidir):

| Modo | Qué se ve | De la cabecera a la 1.ª marca | Tarjetas visibles en 900 px de alto |
|---|---|---|---|
| **Abierto** (la v1) | 4 tarjetas grandes de cifra | 421 px | ~2 filas |
| **Colapsado** | los mismos 4 números como píldoras-filtro dentro de la tarjeta de la lista, y un «Resumen ▾» que abre las tarjetas grandes | **342 px** | ~2,5 filas |
| **Quitado** | sin cifras ni píldoras; solo un aviso ámbar «3 marcas sin proveedor · Verlas» si hay alguna | 315 px | ~2,5 filas |

**Lectura de los números.** Quitar ahorra solo **27 px más** que colapsar, porque la única cifra que pide una acción («Sin proveedor»)
vuelve igual, como un aviso: un KPI disfrazado. Colapsar conserva los cuatro filtros y la alerta por esos 27 px.

| | Colapsado | Quitado |
|---|---|---|
| Ganas | Las marcas arriba; los 4 filtros (con su conteo) y la alerta siguen a un clic; el detalle (las frases y los números grandes) se abre cuando se quiere | La pantalla más simple: una pieza menos, sin botón «Resumen» que recordar |
| Pagas | Un control más (el «Resumen ▾»); si alguien recuerda abrirlo o no, es una preferencia más por aparato | Se pierde de un vistazo «cuántas ya usamos» y «cuántas no»; para saberlo hay que filtrar a mano, y el aviso de «sin proveedor» ocupa casi lo mismo que las píldoras |
| Se rompe si | Nadie abre nunca las tarjetas grandes: entonces sobran y se quitan (decisión con datos, no con opinión) | El catálogo crece y la gente necesita filtrar por estado a menudo: habría que volver a poner las píldoras |

**Decidido: colapsado.** Las dos piezas ya existen (`pildora-cayla` para filtrar, `<TarjetaCifra>` para el detalle); lo nuevo es
solo el plegado. En la maqueta no se recuerda si lo dejaste abierto; en la app real sería una preferencia del aparato (como el modo
oscuro), lo decide Felipe.

## Buscador con predicción (v3: sin lista aparte)

Felipe lo pidió así el 2026-10-10: si el buscador ya filtra las marcas, una lista desplegable repite lo que ya se ve. Se quitó. La
predicción vive en dos sitios que ya existen:

- **En el campo**, una **sombra gris** con lo que falta de la marca más probable (`am` → `am`**`aru`**). **Tab** o **→** la completan;
  **Enter** la completa y va a esa marca (queda sola, en su página, y destella una vez). **Esc** borra.
- **En las tarjetas**, que se **reordenan por lo probable** mientras escribes: primero las que empiezan con lo escrito, luego las que
  tienen una palabra que empieza así, luego las que lo contienen, luego las que trae un proveedor con ese nombre. A igual puntaje, la
  marca con más productos primero. Lo coincidente va resaltado.
- **Un error de una letra** no vacía la pantalla: `wayy` muestra Wayi con el aviso «Nada se llama «wayy». ¿Buscabas alguna de estas?».
- Mientras se busca no hay índice A–Z ni «de X a Y» (el orden ya no es alfabético).
- **Elegir un proveedor** ya no es una opción aparte: escribir su nombre deja las marcas que trae.
- **Nueva marca** usa la misma predicción para «¿No será una que ya existe?» y bloquea el nombre repetido.

## La lista del proveedor flota fuera de la hoja

En «Editar» y «Nueva marca», la lista de «Suma otro proveedor…» **ya no vive dentro de la hoja**: flota por encima, como el selector de
sede, así que la hoja **no crece, no se desplaza y no se desenfoca** (512 × 632 px antes y después de abrirla). Se cuelga debajo del
campo y, si abajo no cabe, arriba. ↑ ↓ eligen, Enter suma, y el primer Esc cierra la lista y el segundo, la hoja. La lista de
proveedores ya sumados se desplaza por dentro después de tres filas, para que la hoja no crezca sin límite.
La pantalla real ya lo hace así (`ComboBuscable` con `useDestinoFlotante`, ADR-0211): la maqueta v2 lo había dibujado mal.

## Qué probar

| Gesto | Qué debería pasar |
|---|---|
| «!» junto al título | Abre el globo con la explicación de la pantalla; se cierra con Esc, tocando afuera o con otro clic; se acomoda dentro de la pantalla |
| «Resumen ▾» (arriba a la derecha de la lista) | Despliega las 4 tarjetas de cifra con un deslizamiento corto y las cifras cuentan; las píldoras se esconden mientras están abiertas |
| Escribir `am`, `wa`, `sol`, `lumbre`, `wayy` | Sombra en el campo, tarjetas reordenadas, parecidos, proveedor |
| Pastillas «Ya las usamos» / «Sin proveedor» | Filtran; otro clic suelta el filtro |
| Letra del índice «Ir a», números de página o ← → | Salta y destella / cambia de página y sube a la lista |
| «Más ▾» en una marca con productos | «Desactivar» y «Eliminar» aparecen bloqueadas y **dicen por qué** |
| «Editar» | La hoja del sistema: ✓ por campo, «Quitar» queda tachado con «Deshacer», «se suma al guardar», «Con productos» sin «Quitar», nota «Eres admin», «Todo listo para guardar» |
| «Nueva marca», o «Suma otro proveedor…» en cualquiera de las dos hojas | Misma hoja, con «¿No será una que ya existe?»; la lista del proveedor flota fuera y la hoja no cambia de tamaño |
| Barra: Cuenta «Solo ve» | Sin «Nueva marca» ni botones en las tarjetas |

## Qué es simulación

- Los nombres de marca salen de las capturas de la pantalla real más otros inventados. **Los proveedores y las cifras de productos son
  inventados**: el repo es público y varios proveedores reales son personas naturales.
- Nada se guarda; al recargar vuelven los datos de ejemplo.
- La cabecera usa la de Productos (`EncabezadoPagina`) como **suposición**: la de Marcas está sin decidir (CLAUDE.md).
- **«Nueva marca» como hoja es una prueba**: hoy es un formulario en línea sobre la lista (`NuevaMarcaForm`). No se cambia sin OK.
- No cubre modo oscuro: en la pantalla real lo hereda de los tokens y se verifica con `pnpm --filter web tema:auditar`.
