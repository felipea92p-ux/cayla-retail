# Maqueta · Recibir mercadería a partir del boceto (2026-11-02)

Felipe pasó un boceto de Contar y pidió: tomarlo de referencia, mantener el contador, los filtros y el orden por categorías, quitar la barra de abajo y
tomar lo mejor del boceto (por ejemplo, «Re stock» y «Producto nuevo» arriba, para ubicarse mejor) **en una maqueta, para evaluar si se pasa a local**.

Abrir `index.html` (`http://localhost:8791/recibir-boceto-2026-11/`). Sin build. **No guarda nada** ni toca la base: los datos son inventados y las fotos, dibujos de ejemplo.
En la chapa de arriba: **Qué mirar** (estas notas, dentro de la pantalla), **Envío grande** (74 modelos y más de 120 mil prendas) y **Reiniciar**. El botón de la luna y el de plegar el menú funcionan.
Para abrir directo: `?menu=plegado`, `?tema=oscuro`, `?envio=grande`.

## De dónde sale cada cosa

- `app.css` y `fuentes/`: el CSS compilado **real** del ERP (rama `claude/mockup-receiving-merchandise-3f444e`, 2026-11-02). El marco de `index.html` es el DOM real de esa pantalla, abierto y plegado.
- `maqueta.css`: solo lo nuevo (`bm-*`), con las recetas de vidrio y los tokens del sistema.
- `maqueta.js`: la pantalla. El Dial, el Trayecto y el odómetro repiten la lógica de `recepcion-dial-reglas.ts`, `trayecto-envio-reglas.ts` y `Odometro.tsx`.
- `datos.js`: el envío inventado (el mismo Vestido Lima del boceto). `iconos.js`: los íconos de lucide y los de categoría del ERP.

## Qué se decidió

| Del boceto | En la maqueta | Por qué |
|---|---|---|
| Re stock / Producto nuevo arriba, como una elección | Siempre marca el tipo de lo que se está contando; al tocar uno, la lista deja solo esos, con su filtro puesto que se quita | Un envío puede traer los dos, y el sistema ya sabe cuál es cada modelo por lo que anotó Compras: no hay nada que la persona tenga que declarar |
| Tres columnas alineadas | Igual, cada una con su scroll; la mesa llena la ventana. Bajo 1.040 px de contenido, el resumen pasa a una tira arriba | Se va la barra de abajo |
| Resumen del fardo | Totales, estados, quién cuenta, fotos y «Pasar a cerrar», siempre a la vista. Los estados filtran la lista | Lo que hacía la barra de abajo, más la recomendación de filtrar por estado |
| Stepper de 5 pasos | El Trayecto, con el nombre de sus cinco paradas | Es el camino real del envío; los pasos del boceto no existen en el flujo |
| Contador − 360 + | El Dial de siempre, con sus atajos y las cifras al lado | Felipe pidió mantenerlo |
| «¿Qué deseas hacer?» y tallas en la misma pantalla | Igual. Una nueva primero pide crearse | Hoy las tallas se abren en una hoja |
| «Guardar y completar después» | No está: «Todo se guarda solo» | Ya se guarda solo |
| «Esp. 360 · Cont. 360» | «360 de 360» | Sin abreviaturas |
| «Variaciones pendientes» | La fila «Tallas para después» del resumen | Era lo mismo, y «variaciones» en la tienda se dice «tallas y colores» |

Además, a probar: **Enter en el número del contador guarda y pasa al siguiente modelo**, con su número listo para escribir. En el ERP de hoy Enter solo deja el número.

## Lo que pidió Felipe mirándola (2026-11-02)

- **Las categorías, de otro color que los modelos:** una banda de color y una raya que junta sus modelos. Tres para comparar, con «Categorías» en la chapa o `?cat=pizarra|arena|tinta`. Arranca en pizarra, el único tono que no se parece a los demás de la pantalla.
- **Las barras cambian de color al llenarse:** de rojo a ámbar y a verde, de a poco; las de cada categoría, las de las tarjetas, la del resumen (ahora con su «Avance 70%») y el Trayecto, que toma el color del envío entero. Una categoría contada que no cuadra se queda en ámbar. El aro del contador no cambia: sigue en tinta hasta cuadrar.
- **Los botones del contador:** sumar en su bandeja, «Llegaron las N» en verde (resalta por tocar y se apaga ya hecho) y «No llegó nada» aparte, más callado. Ninguno cambia de lugar al tocarlo. El + y el − del aro subieron a 48 px.
- **Tallas que se quitan y se agregan:** la tabla arranca con las de siempre de la categoría y cada talla se quita con su ×; «Agregar talla» ofrece las demás, de la más a la menos común, y la nueva cae en su lugar (XS antes de S). Una talla o un color con cantidades se quita sin preguntar y el aviso ofrece «Deshacer».
- **«Anterior» y «Listo, siguiente»:** dos botones iguales, cada uno con su flecha y sin el nombre de la prenda, que en una larga no cabía (el nombre queda al pasar el mouse). Con el último modelo, el de la derecha pasa a «Pasar a cerrar».
- **Un color nuevo:** `--bm-avance-medio` (`#c08a1e`, solo en claro). El ámbar del sistema es un marrón oscuro hecho para texto: en una barra no se distingue del verde. Si esto pasa a local, va como token en `globals.css` y `tema.css`.

## Ya se pasó a local (2026-11-02)

Felipe la aprobó y está en el ERP (`/recibir/envio/[id]`, ADR-0604). Esta maqueta queda como referencia de lo que eligió; manda el ERP. Lo de abajo es cómo se planeó.

## Si se pasa a local

Sin migración ni RPC nuevas: «Re stock» y «Nuevo» salen de si el modelo trae `productoId`; los estados, de `recepcion-modelos-reglas.ts`; las tallas de siempre, de `categoria_tallas.habitual`, que ya existe y ya usa Nuevo producto (`lib/catalogo-v2.ts`).

1. **Lo más grande:** llevar `HojaTallas` a la placa, con las tallas y colores reales de cada prenda. Una talla que la categoría no ofrece hay que ofrecerla primero (la base la rechaza si no; `ElegirTallas` ya lo resuelve): falta definir quién puede hacerlo desde aquí.
2. La mesa de alto fijo y tres columnas, y sacar `BarraDeAbajo` de Contar (Cerrar conserva la suya).
3. El buscador, los filtros por tipo y por estado, y Enter que pasa al siguiente.
4. La guía de foco y la guía interactiva se reescriben: aquí no están el «Falta: …» de hoy ni los `data-guia`. «Por contar» del resumen haría de «Falta».

5. **Hay que decidir «Anterior»:** la pieza que Felipe eligió para todo el ERP (`accion.anterior`, 2026-10-17, y «volver solo es una flecha», 2026-10-07) es la flecha redonda sola, sin «← Anterior» escrito, y `lib/unificar.test.ts` lo vigila. O esta pantalla queda como excepción con su `unificar-fijo`, o la regla cambia en todo el ERP.

## Lo que la maqueta no cubre

- **Un envío sin aviso:** no hay lo que anotó Compras, así que no se sabe si es re stock o nuevo hasta identificar la prenda. Falta decidir qué dicen las dos tarjetas ahí.
- **Cerrar y Cerrado:** no cambian aquí.
- Reabrir un envío, otra sede, y lo que ya entró al stock.
- Las hojas de crear prenda, observaciones y agregar categoría: se avisan, no se abren.
