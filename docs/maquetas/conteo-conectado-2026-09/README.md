# Conteo conectado · spike (2026-09-26)

`spike.html` se abre directo en el navegador (datos inventados). Muestra Conteo en computadora (1.440 px) y en celular
(375 px) lado a lado. La barra oscura de arriba no existe en el ERP: sirve para cambiar de pantalla y de variante.

1. **Pantalla:** Abrir · Contando · Revisar · Cerrado.
2. **Cruce con una compañera** (en Contando): nada · confirmada al pasar (con Deshacer) · otra talla (aviso) · misma
   prenda (pregunta) · ya contada (pregunta).
3. **Celular** (en Contando): lista · cámara abierta en ráfaga.
4. **Diferencias** (en Revisar): A recontar opcional · B cerrar directo (lo que hace hoy) · C recuento obligatorio sobre
   S/ 150. Felipe pidió verlas antes de elegir.

`?p=abrir|contando|revisar|cerrado&c=nada|pasar|otra|misma|ya&cam=si&d=A|B|C&solo=pc|tel` fija un estado (así se sacaron
las capturas). Los enlaces no navegan: un aviso muestra a qué pantalla irían y con qué lista.

## Qué salió del análisis (código en `origin/main` `be0a1a9b`)

- **En el celular no hay cámara:** `ConteoPanel.tsx` solo acepta la pistola o que se escriba el código. Vender, Cambios y
  Existencias ya leen con la cámara.
- **Dos personas contando se pisan:** `conteo_contar` guarda el total de la prenda
  (`on conflict … do update set cantidad_contada`), y cada celular suma sobre lo que tenía al cargar la página. Gana la
  última escritura, y ninguna ve lo que contó la otra.
- **En el celular, el campo para escanear queda como a tres pantallas de la parte de arriba:** antes aparecen las tres
  tarjetas y la cabecera del conteo. La tarjeta «Conteo abierto · Seguir contando» repite lo que está justo debajo.
- **«Faltan por contar»** es una fila por talla (39 filas). En el rack se busca por modelo y color.
- **Al cerrar, lo que nadie contó queda como estaba:** en un conteo completo, la merma no baja nunca.
- **Sin sonido ni vibración al leer, y sin «siguiente paso» después de cerrar.**
- **Antes de abrir no avisa de los traslados ni de la mercadería por recibir,** que después salen como diferencia.
- **Sobran:** 4 de 6 conteos del historial son «Vacío», y el nombre de la terminal rompe la columna «Responsables».

## Decidido con Felipe (dos tandas de preguntas)

| Punto | Decisión |
|---|---|
| Varias personas | Cada una cuenta su **tanda**, a su nombre, y el total suma. El panel «Contando ahora» muestra quién cuenta qué y cuántas lleva, y se refresca cada 4 s. Nunca muestra la cifra del sistema. |
| Confirmar una prenda | Se confirma sola al pasar a otra (5 s para Deshacer) o con «Terminé esta prenda». |
| Misma prenda y talla que otra | Se pregunta: «otras unidades → se suman» / «la misma pila → mi lectura no cuenta». |
| Mismo modelo, otra talla | Solo un aviso de una línea. |
| Prenda ya confirmada por otra | Se pregunta: «encontré más → se suman» / «la recuento → reemplaza» / «no cuenta». |
| No encontradas al cerrar | Se deciden al revisar, una por una o todas: «no está → 0» o «dejar como está». |
| Accesos | Aviso de pendientes (al abrir), Imprimir etiquetas (mientras se cuenta y después), pasos después de cerrar (recontar, Existencias, Movimientos) y Bajar al piso (solo después de cerrar un conteo del piso). |
| Diferencias | **Sin decidir:** A, B o C en este spike. |

## Lo que decidí yo

- La actualización de «Contando ahora» se hace preguntando a la base cada 4 segundos, no con Realtime: es más simple, y
  si se cae la señal se pone al día sola (principio 9).
- Traslados y Apartados no se ofrecen durante el conteo: no ayudan a contar.
- Bajar al piso no se ofrece mientras se cuenta: movería prendas antes de contarlas.

## Qué necesita la base (cuando se construya)

Una tabla de tandas por persona y prenda, una función que **suma** (en vez de guardar el total) y una lectura para
«Contando ahora». Eso es una migración que se pega en producción con el OK de Felipe. La opción A de diferencias y
«no está → 0» no la necesitan: `conteo_contar` ya renueva la foto al recontar (ADR-0189), y un 0 contado es una
cantidad más. La opción C necesita guardar el monto en `configuracion_empresa`.
