# Maqueta · Recibir mercadería, ordenada (2026-11-11)

Felipe: en Contar hay muchos campos y textos repartidos, las colaboradoras no saben dónde mirar ni qué leer, y casi nadie lee el «Resumen del envío»
de la derecha: se guían por las barras de «Categorías del envío». Y con el menú lateral plegado sobra mucho espacio a la derecha «que se lo queda un
simple contador». Pidió **tres maquetas muy elaboradas con un orden distinto**, más entendibles por la distribución de botones y secciones o por los
colores, saltándose reglas si hace falta, siempre con lo más importante a la vista.

Abrir `index.html` desde un servidor local (`http://localhost:3031/recibir-ordenada-2026-11/`, configuración `maqueta-referentes` de
`.claude/launch.json`; con doble clic funciona todo menos «Hoy»). Sin build. **No guarda nada** ni toca la base: los datos son inventados.

**La chapa** (la píldora abajo a la izquierda, se abre al tocarla): las vistas **Contar · Revisa y cierra · Cerrado · Sin aviso**; la **dirección de
Contar** (A · B · C); **Propuesta / Hoy** (Hoy es la captura quieta del DOM real de producción con el mismo envío); **Menú: plegado / abierto**
(arranca plegado, que es cuando sobra espacio); **Qué cambió** (las tres direcciones y, punto por punto, hoy contra la maqueta con el porqué); **Reiniciar**.
Los botones reales de la cabecera **modo oscuro** y **animaciones** funcionan. Por URL: `?dir=A|B|C`, `?vista=cerrar|cerrado|sin-aviso`, `?cara=hoy`,
`?menu=abierto`, `?tema=oscuro`, `?movimiento=quieto`.

## Las tres direcciones de Contar

| | A · Mesa de tres | B · Tablero | C · Mostrador |
|---|---|---|---|
| **Orden** | La lista a la izquierda, la prenda al centro y, a la derecha, **el reparto de tallas** (o «lo que sigue» y el cierre) | **Todos los modelos a la vista** como tarjetas, agrupados por categoría; se cuenta en cada tarjeta | **Una prenda a la vez, grande**: la tira de modelos arriba, el Dial de 264 px, baldosas grandes, y el talón a la derecha |
| **Lo más importante** | Las cuatro fichas de arriba (por contar · con diferencia · faltan tallas · listas) filtran; el paso que toca lleva «Sigue aquí» y su columna | La franja de color de cada tarjeta (taupe · ámbar · verde) y el anillo del cierre a la derecha | El número enorme, «Llegaron las N» como baldosa verde, y el talón que lleva la cuenta |
| **Cómo se cuenta** | Dial 192 + atajos; Anterior / Listo, siguiente | «− 0 +» en la tarjeta, «Llegaron las 6», +5; Enter salta a la tarjeta siguiente; la tarjeta se abre para repartir tallas | Dial 264 + baldosas; Enter pasa al siguiente modelo; la tira y el talón saltan a cualquiera |
| **Qué se salta** | Color por categoría (Tops pizarra, Pantalones ocre) | El resumen vuelve como columna, pero vivo y a la derecha; se cuenta sin «elegir» antes | Botones más grandes que la norma; el talón es una pieza nueva |
| **Para quién** | Quien cuenta mirando la lista y reparte tallas en el momento | Envíos de pocos modelos: se ve de un vistazo qué falta y no hay «anterior / siguiente» | Quien cuenta rápido, con una mano o con el teclado: una pregunta, una respuesta |
| **Celular** | La lista como hoja desde la Isla | Una tarjeta por fila; el cierre arriba | El escenario a lo ancho; el talón debajo |

Las tres comparten la cabecera real (título y Trayecto), el Dial real, las reglas (el paso 2 contestado por tipo, «Más» para lo raro, el aviso de
Admin en una «i», quién cuenta a la vista), y «Revisa y cierra» y «Cerrado», que son iguales para las tres.

## De dónde sale cada cosa

- **El marco es el real**: `marco-antes.html` (menú abierto) y `marco-antes-plegado.html` (plegado) son el DOM del lateral y la cabecera del ERP
  corriendo en local (`main` del 2026-11-11, cuenta de Felipe, Tienda Lima); `app.css` + `fuentes/` son el CSS compilado y las fuentes reales.
  `armar.mjs` los junta en `marcos.js` e `index.html`.
- **Las piezas son las reales**: el Dial, el Trayecto, las categorías con sus modelos, los chips, las barras de avance, los botones, el buscador, la
  tabla de tallas y el sello de lacre se dibujan con sus clases del ERP (`rc-*`, `btn-cayla`, `chip-cayla`, `barra-avance`…). Lo nuevo lleva
  `rm-*` en `maqueta.css`, solo con tokens y las recetas de vidrio Serena (ADR-0596). Las lentes de los pasos son las de la «Ruta viva» de Órdenes.
- **Los datos**: `datos.js`, el envío ENV-000002 que se sembró en la base local aislada (`cayla-retail-prod`) para mirar la pantalla real: 4 modelos,
  27 prendas, dos nuevos y dos de re stock. `hoy-*.html` son las capturas de ese mismo envío en producción local, en cada estado (Contar, Revisa y
  cierra, Cerrado, Sin aviso vacío).
- **El movimiento** es el de ADR-0136, «ricas, una vez, sin bucle» (Felipe 2026-11-11): la maqueta parchea el DOM como React (`morph`) para que cada
  animación de entrada corra una sola vez y lo que cambia transicione (el arco del Dial, el odómetro, las barras, el anillo, el ✓ que se dibuja, el
  pulso del paso que sigue, la tarjeta o la fila que respira en verde al terminarse, el sello que cae al cerrar). `data-movimiento="quieto"`
  (ADR-0625) y `prefers-reduced-motion` lo apagan todo.

## Lo que Felipe decidió antes (2026-11-11, 10 preguntas)

| Pregunta | Decisión |
|---|---|
| El resumen mientras se cuenta | Solo una línea arriba; el completo en Revisa y cierra y en Cerrado (en B vuelve como el cierre vivo, a propósito) |
| Las tarjetas Re stock / Producto nuevo (de su boceto) | Achicarlas a un filtro + marca «Nuevo» por modelo |
| «¿Qué deseas hacer?» | Viene contestado según el tipo: re stock → tallas ahora; nuevo → después |
| Quién cuenta | Botón en la cabecera |
| Base | Marco real del ERP |
| Alcance además de las tres vistas | Envío sin aviso y celular 375 px |
| Movimiento | Ricas, una vez, sin bucle |
| Lo que se usa poco en una prenda | Menú «Más» |
| Revisa y cierra | Pendientes primero, y poder alternar con cómo está hoy (el botón «Hoy») |

## Qué cambia frente a hoy, y por qué (también dentro de la maqueta, en «Qué cambió»)

1. **El resumen deja de estar mientras se cuenta** (A y C): una línea o el talón; el completo en Revisa y cierra y en Cerrado. *Lo que se mira mientras
   se cuenta es la prenda; el balance importa al cerrar.* En B vuelve, pero vivo y con su anillo, porque ahí nada más ocupa la derecha.
2. **El espacio libre con el menú plegado se usa**: A, una tercera columna con el reparto o lo que sigue; B, tres o cuatro tarjetas por fila; C, el
   escenario grande y el talón. *«Mucho espacio libre a la derecha», Felipe.*
3. **Las tarjetas «Re stock» y «Producto nuevo» se achican** a un filtro y una marca por modelo.
4. **El aviso de Admin se guarda en una «i»**; **«Quién cuenta» sube** a la cabecera (A, B) o al talón (C).
5. **La prenda se cuenta en tres pasos** con «Sigue aquí», ✓ y lo que no toca apagado (ADR-0284). En B caben en una tarjeta.
6. **El paso 2 viene contestado por tipo** (regla de negocio nueva, aprobada).
7. **Una línea de ayuda por paso** y una barra «Repartiste 7 de 10 · faltan 3».
8. **Lo que se usa poco va en «Más»** (o «⋯» en la tarjeta).
9. **Cada categoría tiene su color** (regla que se salta a propósito): se reconoce sin leer.
10. **Revisa y cierra pide solo lo que falta**; **Cerrado dice qué pasa con cada cosa** (etiquetas, bajar al piso, poner tallas, lo que ve Compras).

## Lo que hay que decidir antes de pasarla a local

1. **Cuál de las tres** (o qué de cada una): A es la que menos cambia del ERP de hoy; B cambia el modelo (no hay «modelo actual»); C es la más cercana a Vender.
2. **El paso 2 contestado por tipo** es regla de negocio: una línea en `recepcion-modelos-reglas.ts`.
3. **Los filtros por estado** reemplazan a las filas tocables del resumen.
4. **El color por categoría**: si va, es un token por familia o por categoría (hoy no existe) y `tema-tokens.test.ts` lo mide.
5. La guía de foco (`guia-de-foco-pantallas.ts`) y la guía interactiva (`lib/guias/pantallas/inventario.ts`) se reescriben con la elegida.

## Si se pasa a local

Sin migración ni RPC nuevas: todo sale de lo que ya devuelve `fn_envio_conteos` y se guarda con `guardar_conteo_envio`. Es un cambio de
`components/recepcion-conteo/` (ContarEnvio, PlacaDelModelo, TallasDeLaPlaca, ResumenDelEnvio, CategoriasAcordeon, TiposDelEnvio, CerrarEnvio,
EnvioCerrado) y de `app/estilos/vidrio/recibir-mesa.css`. Los `rm-*` de `maqueta.css` son el CSS que iría ahí.

## Lo que la maqueta no cubre

La puerta `/recibir` (lista de envíos), las hojas que se abren desde «Más» y desde «+» (agregar modelo, dañado, observación, crear la prenda, elegir
color o talla de la carta: avisan, no se abren), reabrir, y lo que ya entró al stock dentro de una categoría.
