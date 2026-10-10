## 🎨 La ficha del color donde se mira un color (2026-10-10, ADR-0316) — solo web, sin migración; rama `claude/product-recommendations-visibility-80ef1c`

Cierra los puntos (a) y (b) de `docs/backlog/2026-10-02-colores-replanteo-azules.md` (descripción y «combina con» en el mostrador y al dar de alta). El (c), las sugerencias de prendas con stock, sigue abajo con lo que la investigación cambió.

- [x] **Regla pura** `apps/web/lib/ficha-del-color.ts` (`fichaDelColor`, `unidadesPorColor`, `primeraFrase`) con su prueba: compañeros activos en el orden guardado, sin el propio, hasta `MAX_COMBINA_CON`; con el stock de la sede, los que cuelgan primero. `null` sin ficha: la pantalla no dibuja nada.
- [x] **Pieza única** `apps/web/components/ui/FichaDelColor.tsx` (`linea` y `bloque`): «Combínalo con» (la etiqueta vive en `ETIQUETA_COMBINA`, una sola constante), círculos de 20 px con `data-color-dato`, nombre al pasar, tocar o Enter en un hueco de alto fijo, «no hay aquí» apagado, y la frase tras «¿Por qué?». Solo tokens.
- [x] **Nuevo producto ▸ pie de la carta** (2 renglones de alto fijo; el color señalado se queda mientras el mouse siga en la carta) y, por la misma carta, **«Agregar colores»** de Editar producto. Verificado a 1280 y 375 px (`34b43312`).
- [x] **Vender ▸ «Todo de la prenda»**, bajo color · precio · stock, con las unidades de la sede primero. `colorCodigo` viaja en `VarianteCatalogo`; la lectura de fichas es tolerante (sin ella se vende igual). Verificado a 1280 y 377 px, con «¿Por qué?» y nombre al tocar (`011ada02`).
- [x] **Catálogo ▸ vista rápida**, bajo la foto, siguiendo al color de la foto; la caja reserva dos renglones (ADR-0185). Sin stock del catálogo entero a mano: aquí los compañeros no dicen cuántos cuelgan (`aa821e5b`).
- [x] **Maqueta** `docs/maquetas/combina-con-2026-10/index.html` con los 96 colores reales y el stock por color de TRU (solo lectura, 2026-10-10), claro y oscuro.
- [x] Escenarios de tema: `nuevo.tallas-color`, `vender.ver-opciones-porque`, `productos.vista-rapida-porque` (`tema/escenarios/registro.mjs`).
- [ ] **Sin correr todavía:** `pnpm --filter web tema:auditar -- --escenarios` con esos tres escenarios en claro y oscuro (el servidor local de esta sesión corre en el 3070, no en el 3010 que usa la auditoría).
- [ ] **Las 92 fichas siguen «a revisar por Felipe»** (las escribió el ADR-0316 a mano). Decidió que salgan tal cual en todos lados; cada corrección en Atributos ▸ Colores llega sola a las tres pantallas.
- [ ] **La expresión «Combínalo con»**: Felipe pidió buscar una mejor; se cambia en `ETIQUETA_COMBINA` cuando elija (la investigación de plataformas trae cómo lo dicen Zara, ASOS y Shopify).
- [ ] **/formidable** sobre el pie de la carta, la hoja de Vender y la vista rápida con la pieza nueva (la pieza no guarda nada: /chaos se declara de solo lectura).
- [ ] **Existencias ▸ panel de la talla ▸ Ficha** (el «primero Existencias» del orden del 2026-10-02): misma pieza, y ahí sí cruzada con el stock que el panel ya tiene en memoria.

### Sugerir PRENDAS que combinan («con este Polo Beige: Pantalón Azul marino, 2 en TRU») — investigado, no construido

Lo que la investigación midió en producción el 2026-10-10 (solo lectura; envejece en días):
- Las líneas «sin registrar» SÍ traen categoría, talla y color (`prendas_por_regularizar`, NOT NULL): 791 de 791 líneas sirven de ancla aunque solo 201 tengan la prenda. 187 ventas (42 %) llevan 2 o más líneas; 165 (37 %) dos categorías distintas.
- `combina_con` no predice compra conjunta (37,5 % de los pares del mismo ticket caen en una ficha, contra 38,9 % al azar). Lo que sí se repite es el MISMO color (1,6×). La canasta real es «prenda + bolso/bisutería» (Bolsos + Camisas y Blusas 17 tickets; Pantalones + Blusas 11, con lift 0,87). Polos + Blusas (13) son sustitutos.
- 87 de las 91 fichas empiezan con Blanco, Crudo o Negro, y 53 de los 95 colores activos no los lista nadie (Marrón, 5.º más vendido, tiene 0 listas): hay que leer las fichas en los DOS sentidos y usar el color como puerta, nunca como puntaje por posición.
- El piso cobrable real de TRU son 292 unidades en 234 tarjetas prenda×color (80 % con 1 unidad); AQP 107 en 72; LIM 0.

Diseño v1 propuesto (5 días, sin migración, todo en el navegador; `lib/combinar-reglas.ts` con prueba): puerta (hay para cobrar aquí · papel pareja · otra prenda · color aprobado por la ficha en directa, inversa o mismo-con-ficha) + orden (papel · rareza del color · motivo · unidades · referencia), hasta 3 tarjetas, una por papel y sin repetir color. Necesita UN dato que no existe: el **papel de cada categoría en un look** (superior, inferior, entero, abrigo, calzado, bolso, accesorio, bisutería, íntimo; 45 categorías activas, por prefijo, nunca por nombre) y la fila de **parejas** por papel.

- [ ] **Decisiones de Felipe antes de construir:** ¿«combina» es un look (papel complementario) o una canasta (lo que se lleva junto)? ¿Un bolso o un anillo en el ticket sugieren prendas, y a un polo le va primero el pantalón o el bolso? ¿Se mide la aceptación desde el día 1 (tabla + RPC, migración suya) o primero con una consulta de solo lectura?
- [ ] **Antes de medir por `ventas.token_cliente`:** «Dejar en espera» no renueva el token del carrito (`PuntoDeVenta.tsx`), y una RPC desde una terminal sin responsable falla con 42501 salvo que su clave esté en `acciones_sin_responsable`.
- [ ] **No se hace:** co-compra prenda-prenda (los modelos no se repiten: 57 pares, 1 repetido), embeddings tipo Polyvore (0 outfits etiquetados), un LLM en línea en el camino de cobrar, puntuar el color por su posición en la lista.
