# Mis compras rediseñada — prompt para continuar

**Aprobada por Felipe el 2026-10-24** («Me gusta»). Maqueta tocable: `docs/maquetas/mis-compras-rediseno-2026-10/index.html`
(ábrela en el navegador; publicada también en https://claude.ai/artifact/2B2r415nCq3G2NtNgM7coW, privada de Felipe).

> La otra maqueta de la carpeta vecina, `docs/maquetas/mis-compras-simple-2026-10/` (A · Un botón, B · Solo la plata, C · Cuaderno), quedó
> **descartada**: cambiaba el proceso. Felipe pidió «que siga siendo el mismo proceso pero con el diseño que me propusiste». Solo se toma
> de ella el estilo visual, que ya está en la maqueta aprobada.

## El prompt (copiar tal cual en una sesión nueva)

```
Construye en el ERP la pantalla «Mis compras» (Compras ▸ Mis compras, /compras/mi-plata y /compras/mi-plata/compra) tal como la maqueta
aprobada por Felipe el 2026-10-24: docs/maquetas/mis-compras-rediseno-2026-10/index.html. Lee primero
docs/maquetas/mis-compras-rediseno-2026-10/CONTINUAR.md. Es SOLO diseño: el mismo proceso, las mismas opciones, las mismas RPC y reglas
de hoy; sin migraciones ni cambios de negocio. Usa /construir con una actividad por pantalla, y verifica cada una en el navegador a
375 px contra la maqueta, en claro y oscuro.
```

## Qué es y qué no es

- **Es:** rehacer cómo se ve y en qué orden se pregunta lo que ya existe (ADR-0480, Compras simple). Cada opción de hoy sigue: abrir la
  ronda, «Me dieron plata» (con «ya tenía de antes»), «Compré ropa» en 3 pasos (proveedor con buscador y proveedor nuevo; prendas con su
  hoja —cantidad, costo, venta, una o varias tiendas con reparto— y «Algo nuevo» con «+» para marca nueva; papel y pago —tipo de papel,
  foto opcional, monto, quién paga, pagué solo una parte—), «Gasté en otra cosa», mandar a las tiendas con fardos, cerrar la ronda y las
  rondas anteriores.
- **No es:** cambiar reglas, RPC, permisos ni el orden del proceso. Si algo de la maqueta pide un dato que la base no da, se dice a Felipe
  antes de inventarlo (principio 9: nunca un número inventado).
- **La foto del papel, del voucher y del gasto es opcional** (ya lo es en la base desde `20261023180000`): en la pantalla debe decirlo
  («Opcional: ayuda a Compras a copiar el número») y con «Sin papel» no aparece.

## Pantalla por pantalla (maqueta → código de hoy)

| Maqueta | Qué cambia | Dónde vive hoy |
|---|---|---|
| Inicio · el camino | Una línea arriba con 4 tramos: «Abre tu ronda · Anota · Manda · Ciérrala». Hecho en verde con ✓, el de ahora en tinta. Lógica pura nueva en `lib/mi-plata-reglas.ts` con su prueba (sin ronda → 1; hay por mandar → 3; si no → 2; con compras y nada por mandar → 4). | `app/(app)/compras/mi-plata/page.tsx` |
| Inicio · billetera | La cifra grande y, debajo, la cuenta en 3 columnas: «Te dieron · Compraste · Gastaste». Si es negativa, la nota «Pusiste S/ X de tu bolsillo…». La plata por confirmar, en una nota. Reemplaza la barra apilada. | `components/mi-plata/Billetera.tsx` |
| Inicio · acciones | «Compré ropa» a todo el ancho y en tinta; «Me dieron plata» y «Gasté en otra cosa» como dos tarjetas con su ícono, nombre en serif y ejemplo. | `AccionDelDia.tsx`, `AnotarPlata.tsx`, `AnotarGasto.tsx` |
| Inicio · por mandar | Franja ámbar tocable: «Falta mandar N prendas · Lima 6 · Trujillo 4 · Mandar →». | `MandarATienda.tsx` |
| Inicio · en esta ronda | Cada fila con hora, detalle y su estado como `<Chip>` (en el código: «Compras la confirma» / «Compras la revisa» / «En los libros», que viene de /formidable 2026-10-23: dice quién hace lo que falta; la maqueta decía «Por confirmar / Por revisar / Confirmada»); al tocarla, una hoja dice qué hará Compras. | `ListaDelDia.tsx` |
| Inicio · cerrar y anteriores | «Cerrar mi ronda RC-…» al final; «Rondas anteriores» plegadas con «Ver N». | `TerminarDia.tsx`, `ListaDelDia.tsx` |
| Sin ronda | Una tarjeta «¿Sales a comprar?» con «Abrir mi ronda»; «Me dieron plata» sigue disponible. | `AbrirRonda.tsx` |
| Compra · barra de pasos | 3 tramos con nombre (El proveedor · Las prendas · Papel y pago), como el camino del inicio. | `RegistrarCompra.tsx` |
| Compra · 1 proveedor | Buscador, «＋ Es un proveedor nuevo» arriba (punteado), «Les compraste hace poco». | `RegistrarCompra.tsx` |
| Compra · 2 prendas | Grilla de tarjetas con foto (o `MosaicoPrenda`), «La vez pasada: 6 a S/ 20»; en la compra, borde tinta y globito con cuántas y a qué tiendas. «Algo nuevo» es una tarjeta punteada con «+» dentro de la grilla. La isla de abajo: prendas y total. | `RegistrarCompra.tsx`, `HojaPrenda.tsx` |
| Hoja de prenda | Cuántas con «La vez pasada» de un toque, costo y venta lado a lado, «Por cada una ganas» en verde, tiendas «una o varias» y «¿Cuántas a cada una?» con «Cuadra: 6 de 6». | `HojaPrenda.tsx` |
| Compra · 3 papel y pago | Arriba, lo que llevas. Preguntas numeradas que se marcan ✓: qué papel (4 fichas), cuánto dice (con «✓ Cuadra con lo que anotaste» o el aviso ámbar sin bloquear), quién paga (2 fichas); con «Pagué ahora», el medio y «Pagué solo una parte» escondido hasta tocarlo. | `RegistrarCompra.tsx` |
| Compra guardada | Sello ✓, qué se guardó y cuánto queda; «Mandarla a … ahora» como botón principal. | `RegistrarCompra.tsx` |
| Hojas de plata y gasto | Preguntas numeradas; el gasto con fichas de concepto con dibujo; foto opcional al final. | `AnotarPlata.tsx`, `AnotarGasto.tsx` |
| Cerrar la ronda | La cuenta como un cuaderno (te dieron, compraste, gastaste, te queda / pusiste de tu bolsillo); si falta mandar, la franja y el botón apagado; qué hacer con lo que queda en 2 fichas. | `TerminarDia.tsx` |

## Reglas del repo que no se negocian (CLAUDE.md)

- **Solo tokens** (`globals.css` y su oscuro en `estilos/tema.css`): la maqueta ya usa los mismos colores; en el código, clases de token,
  nunca un hex. Probar en claro y oscuro (`pnpm --filter web tema:auditar`).
- **Piezas únicas (ADR-0358)**: `<Boton>`, `<Chip>`, `<Modal>` (hoja del celular), `<BarraDeAbajo>` (la isla), `<PasoCantidad>`,
  `CampoMonto`, `<Vacio>`, `<TituloSeccion>`, `<EncabezadoPagina>`; las fichas de «elige una» con el patrón `card-cayla mov-boton … aria-pressed`
  (ver `components/fondos/FichasCuenta.tsx`). Si la maqueta dibuja algo que ya tiene pieza, gana la pieza.
- **Guía de foco** en cada hoja (`useGuiaCampos` + `CampoGuiado` + `PieGuia`): los números de las preguntas de la maqueta son su versión;
  no cambia qué se puede confirmar.
- **Guías interactivas**: mover los `data-guia` existentes a las piezas nuevas, poner al día `lib/guias/pantallas/compras.ts`, recorrer con
  `pnpm --filter web guias:recorrer` a 375 px y recién ahí `guias:huella compras.mi-plata` y `compras.mi-plata.compra`.
- **Movimiento** (ADR-0136): sin rebote ni bucle; lo apaga `prefers-reduced-motion`.
- Al terminar: `/formidable` (tablero en `docs/formidable/README.md`), bitácora en `docs/bitacora/`, PR con `/abrir-pr`.

## Cómo se da por terminado

Cada pantalla de la tabla, capturada a 375 px en el ERP local al lado de la misma pantalla de la maqueta: si no se parecen, no está
terminada. Y el recorrido completo funcionando de verdad contra la base local: abrir la ronda, anotar plata, una compra repartida en dos
tiendas con «Algo nuevo», guardarla, mandarla, un gasto y cerrar la ronda.

## Ajustes de Felipe a la maqueta (2026-10-26, después de la aprobación)

La maqueta `index.html` se ajustó mirándola; **manda sobre lo de arriba** donde difieran:

- **Algo nuevo · qué es y marca:** chips solo con lo habitual del proveedor (hasta 4) + «Otra…» que abre el combo de hoy (buscador desde 8
  opciones, grupos «Ya le compras / Otras»). Proveedor sin historial: nada de chips, un solo campo «Elige una categoría» / «Elige una
  marca» que abre la lista; «Otra…» no existe sin chips. Si el proveedor trae una sola marca, ya llega puesta.
- **Algo nuevo · tienda:** una o varias, con «¿Cuántas a cada una?» y «Cuadra: N de N», igual que la hoja de una prenda.
- **Compra · 2 prendas:** «Algo nuevo, o no la encuentras aquí» va FIJO abajo, sobre la barra negra (como el ERP de hoy, Felipe 2026-10-23),
  no como tarjeta al final de la grilla. Las prendas del proveedor son un atajo: 6 a la vista, «Ver todos los suyos (N)», chips de categoría.
- **Me dieron plata · banco (PIDE DECISIÓN ANTES DE CONSTRUIR):** con «Transferencia» pregunta «¿De qué banco salió?» (la cuenta de la empresa de donde salió la plata, ligada a Finanzas) con BCP (de
  fábrica) e Interbank (los dos bancos de `retail.cuentas_dinero`, verificado en producción el 2026-10-26). **Hoy la base no guarda eso al
  anotar:** `anotar_plata_compras(p_medio, p_monto, p_foto_ruta, p_token)` no recibe cuenta y es Compras quien la elige al confirmar
  (`confirmar_plata_compras.p_cuenta_origen_id`, sugerida BCP por `cuentaSugerida`). Construirlo exige una columna y un parámetro nuevos
  (migración, y que la hoja de confirmar traiga el banco ya elegido): es cambio de negocio y de RPC, así que va como actividad aparte con el
  OK de Felipe; hasta entonces la actividad 6 construye la hoja SIN esa pregunta.
- **Cabecera de «Compré ropa» (opción B, elegida el 2026-10-26 de `docs/maquetas/mis-compras-cabecera-2026-10/`):** mientras la compra está en marcha no se
  dibuja la cabecera del ERP (sede, fecha, título de 46 px y frase): una sola caja fija bajo la barra de arriba con la flecha, «Compré ropa» en 28 px,
  «CAYLA · paso 2 de 3» y el camino de 3 tramos. Sin pasos (no cargó, o falta abrir la ronda) vuelve la cabecera del ERP. −129 px en el celular.
- **«Algo nuevo» y «¿Está bien así?»:** «Algo nuevo» es la fila punteada con «+» en tinta; «¿Está bien así?» es una tarjeta por prenda (con sus tiendas en
  chips), la cuenta de la compra y la barra negra de abajo.

