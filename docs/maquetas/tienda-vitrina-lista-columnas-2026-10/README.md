# Vitrina ▸ Modelos ▸ «Lista»: ¿una columna o dos? — spike (2026-10-26)

Pregunta de Felipe: en la Lista de la Vitrina, ¿2 columnas de prendas para usar todo el espacio o una columna? Spike con datos inventados que
dibuja la página de 40 modelos de verdad en 6 anchos (1024 a 1920), con nombres normales y largos y con 3 y 5 tiendas, y mide el alto de la
lista, los nombres cortados («…»), el stock partido en dos renglones y el hueco entre el nombre y el primer dato.

Tres opciones: **A** una columna (hoy) · **B** columnas del navegador (CSS `columns`: las que caben, mínimo 30 rem cada una y 5 más por cada
tienda de más; orden alfabético de arriba abajo; el nombre puede pasar a 2 renglones) · **C** una columna con una columna por tienda.

Parámetros de la URL: `?op=A|B|C&an=1024|1280|1366|1440|1536|1920&no=n|l&ti=3|5&se=0|1&tema=light|dark`.

Resultado (alto de la lista de 40 modelos): A 2,787 px en todos los anchos; B 2,827 px a 1024 (una columna), 1,414 px de 1280 a 1536 (dos) y 993 px
a 1920 (tres); C 2,787 px. Con nombres largos y 5 tiendas, A parte el stock en 2 renglones en las 40 filas y C corta 14 nombres; B no corta ni
parte nada en ningún ancho.

## Decisión de Felipe (2026-10-26)

No se eligió B. La Lista **alterna entre C y A según el ancho**: pantalla grande y hasta 8 tiendas, **C** (una columna por tienda, con título);
pantalla angosta —o más de 8 tiendas, o si la tabla se ve muy compacta—, **A** (las filas de siempre, nombre grande y todas las tiendas en un
renglón). Lo decide `modoDeLista(ancho, tiendas)` en `lib/vitrina-reglas.ts` con el ancho de la tarjeta (`components/ui/useAnchoDe.ts`): con 3
tiendas pasa a C desde ~1036 px de tarjeta (una laptop de 1366 px); cada tienda de más pide 80 px más. En C las columnas tienen tope (modelo 22 rem,
categoría 10 rem) para que el stock no se aleje sin límite del nombre. **Medido en la app real a 1440 px (2 tiendas):** del final del nombre al primer stock hay ~465 px (443–483), y en medio van la categoría y los colores, que son datos y no espacio vacío; en las filas de siempre eran ~625 px (3 tiendas) de espacio vacío. Si se quiere más apretado, bajar el tope del modelo (22 rem) o el de la categoría (10 rem) en `PLANTILLA_COLUMNAS`.

