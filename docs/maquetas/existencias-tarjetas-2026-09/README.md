# Existencias en tarjetas · maqueta (2026-09-29)

Pedido de Felipe: la pantalla **Existencias** de Inventario dibujada igual que su imagen de referencia (tarjeta por prenda, con
piso y almacén por talla), como si fuera el ERP de verdad —columna de módulos, barra superior, ventanas— y con un botón
**«Ver detalle»** junto a «Ordenar por:» que muestra la tabla que Existencias ya tiene.

`spike.html` se abre directo en el navegador (doble clic; no necesita servidor). Los datos son inventados y viven solo en la
pestaña: recargar los restablece. Nada llama a la base ni a ninguna función de retail.

## Qué se puede probar

| Zona | Qué hace |
|---|---|
| **Columna de módulos** | Los grupos abren y cierran; el botón del panel la oculta. Las pantallas que no son Existencias avisan a dónde irían. |
| **Barra superior** | `Ctrl K` / `⌘ K` busca prendas y pantallas · «Actividad» lista lo último y **lo que hagas aquí** · el selector cambia de sede (TRU, AQP, LIM: cada una con sus cifras). |
| **Cifras** | Suman las 48 prendas de la sede (352 · 226 · 12 en TRU, como la imagen). Tocar una las vuelve filtro. |
| **Filtros** | Buscador (sin tildes ni mayúsculas) y cinco combos; los de más de 8 opciones traen su buscador. «Ordenar por» con seis criterios. |
| **Tarjetas** | Los puntos de color llevan a la prenda de ese color · **Reponer**, **Ajustar** y **Ver detalle** abren su ventana. |
| **«Ver detalle»** (arriba) | Cambia entre las tarjetas y la tabla de siempre: casilla · prenda · disponibilidad por talla · piso · almacén · qué hacer. Con casillas, «Reponer las tallas sin stock» en lote, paginado y «Exportar CSV». Vuelve con «Ver tarjetas». |
| **Reponer piso** | Cantidad por talla con − / +, tope = lo que hay en el almacén, sugerida de antemano, Responsable. Al confirmar: loader a pantalla completa → aviso → la tarjeta y las cifras cambian. |
| **Ajustar inventario** | Dónde (almacén / piso) → Motivo → cantidades. «Conteo físico» pide lo contado; los demás motivos, suma o resta; conserva el resultado al cambiar de modo; frena las tallas que quedarían en negativo. |
| **Cajón de la prenda** | Sale por la derecha sin velo, con la talla elegida, «Operar / Gestión / En la red / Consultar». |
| **Escape** | Cierra siempre lo de más arriba, una capa a la vez (lista → ventana → cajón). |

Estado fijo por URL (para capturas): `?vista=tabla&sede=AQP&abrir=<id>&talla=M&modal=reponer|ajustar&q=luna&estado=alerta&limpio=1`
(`limpio=1` quita la etiqueta «Maqueta · datos inventados»). Los `id` son `<producto>--<color>`, p. ej. `palazzo-billie--marfil`.

## Dónde se aparta de la imagen (y por qué)

1. **Palazzo Billie, talla L en el piso: 1** (la imagen dice 0). Con 0, las tallas suman 3 y arriba dice «Piso 4». En la maqueta
   cada cifra grande es la suma de sus tallas, no un número escrito aparte.
2. **Chompa Raya:** su pastilla es ámbar. La imagen la pinta verde con el texto «Hay stock para reponer», que en Adelle Wide Leg
   es ámbar: mismo texto, mismo tono.
3. **«en N productos» bajo las cifras** se calcula (48 y 46). La imagen dice 126 y 48, y con 48 productos en la lista 126 no cabe.
4. **La foto del usuario** es un círculo con sus iniciales.
5. **Los rótulos «Piso / Almacén» dentro de cada talla** son de 8,5 px; la imagen los dibuja aún más chicos (≈ 7,5 px).
6. Las fotos son recortes de la imagen (las otras dos prendas de cada familia usan la misma foto). Las otras 42 prendas no traen foto.

## Decisiones que quedan para Felipe antes de construirlo en el ERP

1. **¿Qué regla pinta la pastilla?** La imagen marca «Stock balanceado» a Palazzo Billie, que tiene la XS sin nada en el piso y
   2 en el almacén; a Adelle Wide Leg, con las mismas cifras en esa talla, «Hay stock para reponer». La regla física ya aprobada
   (`politica-operativa-inventario.ts`: piso ≤ 4 es siempre «Reponer») pintaría de «reponer» casi todas. En la maqueta el estado
   inicial de las seis tarjetas es el de la imagen; en cuanto se toca su stock manda una regla simple (piso ≥ 9 = sobrestock;
   alguna talla sin piso y con almacén = reponer; si no, balanceado). Es de la maqueta, no del ERP.
2. **Dos «Ver detalle» que hacen cosas distintas:** el de arriba cambia a la tabla y el de cada tarjeta abre el cajón de esa prenda.
   Se hizo como se pidió; si confunde, el de arriba podría llamarse «Ver tabla».
3. **La vista «Por talla»** (ADR-0231: Cobertura piso y Ritmo reciente) no está en la maqueta: solo la tabla «Por prenda». O va
   dentro de «Ver detalle», o pasa a Análisis (es la decisión 2 del spike `existencias-intuitiva-2026-09`, todavía abierta).
4. **Cuánto sugerir al reponer:** la maqueta sube cada talla hasta 2 en el piso. La política de cantidad no existe en el ERP.
5. **Los cinco botones de la cabecera** (Bajar al piso, Nuevo traslado, Recibir mercadería, Contar, Apartados) y el menú lateral
   son pantallas propias del ERP: aquí avisan a dónde irían.

## Qué tocaría al construirlo

Solo web, sin migración: `apps/web/components/InventarioPanel.tsx` (hoy 1.495 líneas: la cabecera, los filtros y las dos vistas),
`ExistenciasPorPrenda.tsx` (se vuelve la tarjeta), `CajonPrendaExistencias.tsx` y `ReponerPisoModal.tsx` / `AjustarInventarioModal.tsx`
(que ya existen y aquí solo se redibujan por prenda). Las cifras de arriba tendrían que salir de la misma consulta que la lista
(hoy la maqueta las suma de la lista). Las pruebas de `lib/existencias-permisos.test.ts` vigilan qué botón ve cada rol.
