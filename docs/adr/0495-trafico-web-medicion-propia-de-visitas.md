# ADR-0495 · Tienda web ▸ Tráfico: la tienda online mide sus visitas en una tabla propia

- **Fecha:** 2026-10-23 · **Estado:** aceptado (Felipe aprobó el diseño el 2026-10-23). Se construye actividad por actividad (`/construir`);
  la migración `20261023230000_trafico_web.sql` se pega en producción junto con Felipe.
- **Pedido:** un submódulo «Tráfico» en «Tienda web» para ver cuánta gente entra a la tienda online, qué prenda mira, por dónde llega, desde
  dónde, a qué hora y en qué paso se va. Maqueta elegida: C «La vitrina» (`docs/maquetas/trafico-cero-2026-10/`).
- **Relacionados:** ADR-0408 (la tienda online y su puerta angosta), ADR-0447 (la tienda mide su velocidad en el registro de Vercel),
  ADR-0161 (un módulo nuevo nace solo para el líder), ADR-0306 (un módulo es una entrada del menú), ADR-0430 (el grupo «Tienda web»).

## El problema

Hoy la tienda no cuenta visitas. Solo mide cuánto tarda (ADR-0447), una visita de cada dos, en un registro que Vercel guarda un día. Lo que
Felipe pide es otra cosa: un dato del negocio que se mira por períodos de 30 días y se cruza con los pedidos («separaron», «recogieron»),
que ya viven en la base.

## La decisión

1. **Una tabla propia, solo para agregar:** `retail.trafico_web`, una fila por PASO de una persona — 0 entró, 1 vio una prenda, 2 eligió
   talla, 3 la puso en la bolsa, 4 separó —. No se edita, no se borra ni se vacía (su propio candado, como `movimientos`). «Recogieron» no se
   escribe: se lee de `pedidos_web.entregado_en` por el pedido del paso 4.
2. **Sin datos personales.** La persona es un número al azar en una cookie de su aparato (`tienda-visitante`, del servidor, 90 días desde la
   última visita); nunca se une a su cuenta. El camino (Instagram, Directo, WhatsApp, TikTok, Google, QR en tienda, Otros) sale de la marca
   del enlace (`?utm_source=`) o de la página de origen. El lugar es el **departamento** (ISO 3166-2, «PE-LAL»), de las cabeceras de ubicación
   que Vercel le pone a cada petición; **la IP nunca se lee ni se guarda**. Con «no me rastrees» (`Sec-GPC: 1` / `navigator.globalPrivacyControl`)
   no se anota nada.
3. **La puerta de la tienda.** El navegador nunca habla con la base: manda los pasos a `POST /api/visita`, que valida (máximo 20 pasos y 4 KB) y
   llama a `retail.tienda_anotar_pasos`, una función más de la puerta angosta (solo el rol `tienda_web`). La base vuelve a revisar todo y
   descarta lo que no calza sin error. «Vio una prenda» y «eligió talla» se juntan en el navegador y salen en un solo envío al ocultarse la
   pestaña (`lib/visita-cola.ts`). «A la bolsa» y «separó» los anota el servidor, dentro de sus acciones, después de responder (`after`):
   «a la bolsa» con la talla (la base saca la prenda de ella) y «separó» con la **marca secreta del pedido** (`pedidos_web.token_cliente`,
   que vive en la cookie `httpOnly` de la bolsa), nunca con su código, que se ve en la dirección.
4. **Una visita** dura mientras la persona vuelve a tocar algo antes de 30 minutos: «entró» sale una vez por visita.
5. **La lectura** (actividad 4) es una función de solo lectura del ERP con el candado del módulo «trafico» (solo el líder): cuenta personas por
   el paso más lejano al que llegó cada una (el recorrido nunca crece hacia abajo), con el camino y el departamento de su primera entrada del
   período (los caminos suman exactamente el total).
6. **Cada prenda** (actividad 5) se cuenta igual: hasta dónde llegó cada persona CON ELLA (la miró, eligió su talla, la puso en la bolsa,
   la separó o la recogió); quien la separó sin abrir la ficha cuenta como que la miró. Separar y recoger salen de las líneas del pedido
   que esa persona separó (recoger: el pedido entregado y la prenda ni quitada ni liberada). La vitrina dibuja las 24 más miradas en un
   mosaico donde el área es lo que la miraron (squarified); las demás, en un hueco «y N prendas más». Dónde se atora una prenda se dice
   solo con 30 personas o más en el paso de antes: con menos, una prenda no tiene un paso «malo», tiene pocas personas.
7. **El período, los filtros y la vista** (actividad 6) viven en la dirección (`?periodo=30&camino=instagram&ciudad=trujillo&vista=tabla`):
   los últimos 7 días (de fábrica), los últimos 30 o **la campaña** (la etiqueta de estilo «campaña» que rige hoy, desde que empezó; si
   ninguna rige, la última que terminó en el año). Cada período se compara con los mismos días de antes. Tocar un camino o una ciudad
   filtra toda la pantalla; cada lista se cuenta **sin su propio filtro y con el otro** (con Instagram puesto se sigue viendo cuántos
   llegaron por cada camino, para cambiar de uno a otro). «A qué hora entran» es la hora de Lima de la primera entrada; la hora punta son
   las 3 horas seguidas con más gente y se dice solo con 10 personas o más. La vista de tabla lleva los mismos números y TODAS las prendas.
8. **Eliminar una prenda que la gente miró** (Felipe, 2026-10-27; `20261027211000`): se puede, con una confirmación que lo avisa, y sus
   visitas **no se borran**: se quedan en Tráfico sin la prenda (las llaves a `productos` y `variantes` son `on delete set null`), así las
   cifras de días pasados no cambian. Lo único que se le puede cambiar a una visita es eso: soltar la prenda o la talla cuando ya no existe
   (`fn_trafico_web_inmutable`). La historia de la prenda suma el renglón 27, «personas que la miraron en la tienda online», que no frena:
   una prenda que solo tiene visitas pide «Eliminar con su historia», y la ventana dice cuántas personas la miraron y qué pasa con sus
   visitas (`fn_producto_como_eliminar` devuelve `visitas`).

```
DECIDÍ:     una tabla propia de pasos anónimos (retail.trafico_web), escrita solo por retail.tienda_anotar_pasos desde el servidor de la
            tienda, y leída por una función del ERP con el candado del módulo «trafico».
DESCARTÉ:   un servicio de analítica de afuera, porque tiene costo mensual, los datos quedan fuera de CAYLA y no se cruzan con los
            pedidos (Felipe eligió la tabla propia, 2026-10-23).
DESCARTÉ:   contadores por día ya sumados, porque no dejan contar personas únicas en 30 días ni ver solo a la gente de un camino o una
            ciudad (la suma de los únicos de cada día no es el único del mes).
DESCARTÉ:   que el navegador escriba directo en la base (ADR-0447 ya lo había descartado: abriría la base del ERP a cualquiera); aquí la
            escritura anónima pasa por la ruta de la tienda y una función que valida, igual que lo demás de la tienda.
DESCARTÉ:   guardar la ciudad o la IP: el departamento es más estable (en Lima la ubicación por IP suele dar el distrito) y revela
            menos de la persona.
DESCARTÉ:   crear la cookie del visitante en `proxy.ts`, porque una respuesta con Set-Cookie no se guarda en la caché y la portada se
            sirve desde ahí; la crea la ruta, al primer «entró».
DESCARTÉ:   un índice B-tree por fecha, porque la tabla llega ordenada en el tiempo y solo se lee por rangos: un BRIN pesa unas páginas.
SE ROMPE SI: Vercel deja de mandar las cabeceras de ubicación: todo cae en «sin departamento», sin romper nada más.
SE ROMPE SI: un enlace de WhatsApp no lleva su marca: esa gente cuenta como «Directo» (WhatsApp no dice de dónde viene).
SE ROMPE SI: los QR impresos no llevan `?utm_source=qr`: «QR en tienda» sale en cero. La portada conserva las marcas al llevar al
            Inicio (`redireccionDelProxy`), porque el QR del cartel apunta a la portada.
SE ROMPE SI: la base no responde: el paso se pierde y queda una línea `trafico_anotar` en el registro; la página y «Separar» siguen igual.
DESCARTÉ:   (2026-10-27) que una prenda que miraron no se pudiera eliminar: Felipe eligió poder eliminarla con su aviso.
DESCARTÉ:   (2026-10-27) borrar sus visitas con ella: bajarían las cifras de Tráfico de días que ya pasaron, y sería borrar datos.
SE ROMPE SI: alguien vuelve a pegar 20261023230000 entera después de 20261027211000: su `fn_trafico_web_inmutable` no deja soltar la
            prenda y Catálogo no podrá eliminar una prenda que miraron («no se editan ni se borran»). Se vuelve a pegar 20261027211000.
```

## Cifras

- **Volumen:** unas 300 personas al día y unos 5 pasos cada una → ~1.500 filas al día, ~550 mil al año. Se cuenta al leer; si pasa de 5
  millones, se revisa (una tabla de resumen por día, sin borrar nada).
- **Peticiones:** una por visita para «entró» y una por página con pasos al salir; cada una es una invocación de función en Vercel (el plan
  Pro trae un millón al mes).

## Límites que Felipe conoce

- Una persona = un aparato: quien mira en el celular y en la computadora cuenta dos veces.
- La ubicación por IP de los celulares puede cargarse hacia Lima: a las 2 semanas se compara contra la tienda donde recogen los pedidos.
- Lo anotado se guarda para siempre (es anónimo y la regla del repo es no borrar); resumir y archivar después es decisión de Felipe.

## Qué se verificó (actividad 1)

- `pnpm pruebas:tienda-trafico` (19 escenarios, ROLLBACK): camino y departamento solo al entrar, prendas y tallas que existen, «separó» de un
  pedido recién creado y una sola vez, hora puesta por la base, máximo 20, basura descartada sin error, la tienda no lee ni escribe la tabla
  directo, no se edita/borra/vacía, la migración se pega dos veces. `pnpm pruebas:tienda-puerta` sigue en verde (36).
- `lib/visita.test.ts` y `lib/visita-servidor.test.ts` (camino, departamento, lo que acepta la ruta, robots, la visita de 30 min, y que con la
  base caída anotar no lanza). `tsc`, ESLint, Vitest (864), Knip normal y de producción.
- En la tienda local: abrir `/?utm_source=qr` deja una fila «entró» con camino `qr` (antes del arreglo de la portada quedaba «Directo»); pasar
  al catálogo no abre otra visita; `Sec-GPC: 1` o un robot no anotan nada ni dejan cookie; un cuerpo malo da 400 y uno de más de 4 KB, 413; con
  las cabeceras de Vercel queda `PE-LAL` y la cookie de 90 días.
- **Actividad 2:** en la tienda local, abrir la ficha de la Blusa Emma, elegir la talla M y agregarla a la bolsa deja «vio prenda»,
  «eligió talla» (con su hora real, aunque salen juntas al ocultarse la pestaña) y «a la bolsa» (talla M, Negro), del mismo visitante.
  `pnpm pruebas:tienda-trafico` sube a 21: «a la bolsa» con solo la talla, y «separó» por la marca, una vez, atado a su pedido.
- **Actividad 3:** `/privacidad` dice qué se anota al mirar la tienda (punto 2), para qué (punto 3) y cuánto dura la cookie (punto 6), con
  el texto que aprobó Felipe; la versión de los textos subió a `borrador-2026-10-23` (las cuentas que ya existían conservan la que aceptaron).
- **Actividad 4:** el módulo `trafico` (orden 63, solo para el líder: `pnpm pruebas:roles` «un módulo recién creado lo ve solo el líder»),
  la séptima hija de Tienda web y `resumen_trafico_web` (`pnpm pruebas:tienda-trafico-resumen`, 18: personas por su paso más lejano, solo
  quien entró en esos días, camino y ciudad de la primera entrada con los caminos sumando el total, Lima con Lima Metropolitana y el
  Callao, más de 200 pasos al día no cuenta, una integrante sin el módulo recibe 42501). En el ERP local, como líder, la pantalla muestra
  las 2 visitas de las pruebas, el recorrido y «Se atora al separar» con su «¿Por qué?»; en claro y en oscuro; a 1440 px. Dónde se atora
  se decide contraído hacia lo de costumbre (90 días, peso de 30 personas): con 4 personas el veredicto no salta (`lib/trafico-reglas.test.ts`).
- **Actividad 5:** `fn_trafico_web_prendas` y las prendas de `resumen_trafico_web` (`pnpm pruebas:tienda-trafico-resumen`, ahora 27:
  solo salen las prendas de la gente del período, su recorrido por persona —quien solo la separó también la miró—, el filtro de camino,
  tallas y colores elegidos, caminos que suman los que la miraron, «antes», y nadie llama directo a la lista). El mosaico y la lectura,
  en `lib/trafico-mosaico.test.ts` (13: áreas proporcionales, sin salirse ni pisarse, casi cuadradas, ceros y vacíos) y
  `lib/trafico-reglas.test.ts` (27). En el ERP local, como líder y con 360 visitas de prueba: la vitrina a 1440 y a 375 px, en claro y
  en oscuro (en oscuro toda baldosa lleva un filo claro, o una prenda negra se pierde contra la tarjeta); el cajón abre desde la baldosa
  con el mouse y con Enter, pasa de prenda con ↓, cierra con Escape y el foco vuelve a la baldosa de la última prenda vista (Radix lo
  dejaba en el `body`). La guía suma la vitrina, la más mirada y el cajón (que el piloto abre y cierra): `guias:recorrer` 9 pasos a
  1440 px en claro y a 375 px en oscuro. La lectura completa tarda ~80 ms con 1.240 pasos en local.
- **Actividad 6:** `resumen_trafico_web` lee a la gente del período UNA vez y de ahí saca el recorrido, los caminos, las ciudades y las
  horas (`pnpm pruebas:tienda-trafico-resumen`, ahora 32: los caminos suman el total, cada lista sin su propio filtro y con el otro, las 24
  horas por la primera entrada en Lima). Reglas puras en `lib/trafico-reglas.test.ts` (41: la campaña que rige o la última, el período, la
  dirección, el rango y el tramo en palabras, la hora punta y su mínimo). En el ERP local, como líder: los tres períodos («Halloween» rige
  hoy), el filtro por Instagram y por Instagram + Trujillo (42 personas; las listas siguen mostrando los demás), la vista de tabla con las
  21 prendas que abren el mismo cajón (el foco vuelve a su fila), «Aquí se atora» sin cortarse, a 1440, 1920 y 375 px sin desborde. En
  dos columnas la vitrina mide lo mismo que «De dónde vienen» y «A qué hora entran» (631 px a 1920). La guía: 14 pasos, `guias:recorrer`
  bien a 1440 y a 375 px. Si el panel del navegador está oculto, la página corre en segundo plano y React no muestra lo que llega por
  partes hasta que vuelve a la vista: no es de esta pantalla.
- **Actividad 7:** el movimiento de la maqueta (tarjetas con `anim-sube`; baldosas en cascada, etiqueta que se cuelga y una luz que cruza la
  vitrina una vez; el punto verde que respira solo con alguien mirando), con su excepción en ADR-0136 (act. 2026-10-23 (d)) y en
  `CLAUDE.md`, vigilado por `lib/trafico-movimiento.test.ts` (19). Modo oscuro: `tema:auditar` con la pantalla y los dos escenarios del
  cajón (vitrina y tabla), 0 hallazgos; en oscuro toda baldosa y toda muestra de color lleva un filo claro. Anchos: la guía recorre sus 14
  pasos a 375, 1024, 1280 y 1440 px; sin scroll horizontal hasta 1920. `/formidable rapido`: `docs/formidable/tienda-web-trafico.md`.
- **Actividad 8:** el QR del cartel del Club abre `https://tienda.cayla.pe/?utm_source=qr` (`ENLACE_DEL_CARTEL`) y la página vieja del
  cartel (`/club/<uuid>`) redirige ahí mismo (307, comprobado con `curl` sin seguirlo); lo escrito bajo el QR sigue siendo
  «tienda.cayla.pe». El enlace de «Compartir tu look» lleva `&utm_source=whatsapp` al final, sin reescribir el look (`enlaceParaCompartir`).
  En la tienda local, abrir `/tu-look?p=…&utm_source=whatsapp` anotó la entrada con el camino «whatsapp». **Lo que no cambia:** los carteles
  YA impresos con el QR nuevo de octubre (abren `tienda.cayla.pe` a secas) cuentan como «Directo» hasta reimprimirlos; los de `/club/<uuid>`
  sí cuentan como QR. Un look compartido por otra aplicación igual dice WhatsApp (la hoja del celular no cuenta a cuál fue). Las etiquetas
  de precio solo llevan la dirección escrita (sin QR): quien la escribe es «Directo». El cierre de los avisos del Club («en
  *tienda.cayla.pe*…») lo escribe el líder y no lleva marca: esos mensajes cuentan como «Directo».
- **En producción (2026-10-24):** `20261023230000` pegada por el MCP de Supabase con el OK de Felipe (versión registrada `20261024225147`);
  verificada por la huella de sus dos funciones, columnas, reglas, índices, disparadores, RLS y permisos, iguales a la base local.
  `20261023231000` también, con su OK (versión `20261024230230`): sus cuatro funciones con la misma huella que en local, el módulo
  `trafico` sin rol, sin sesión responde 42501 y como líder la forma completa en cero. El diccionario no se refrescó todavía: otra sesión
  pegaba sus migraciones en ese momento (ver backlog).
- **Act. 2026-10-27, eliminar una prenda que miraron:** `pnpm pruebas:tienda-trafico-eliminar-prenda` (15: se elimina con su historia, la
  ventana sabe cuántas personas la miraron, sus visitas se quedan iguales y sin la prenda, las cifras de ese día no cambian, nada más de una
  visita se edita ni se borra, se pega dos veces); `pruebas:eliminar-producto` clasifica `trafico_web` como «se suelta»;
  `pruebas:eliminar-producto-con-historia` 66/66. En el ERP local: una prenda de prueba con 2 personas que la miraron → Catálogo ▸
  Productos ▸ Eliminar muestra «¿Eliminar … con su historia?» con el aviso «2 personas la miraron en la tienda online», y al confirmar la
  prenda se fue y sus 5 visitas siguieron ahí, 3 sin prenda. El renglón 27 se ancla en el 19 (Frescura), no al final de la consulta, para
  que 20261015011000 y 20261023005000 se puedan volver a pegar (la prueba de compras lo hace).
- **Sin probar:** las cabeceras de ubicación reales de Vercel (solo existen publicadas), la tienda con la base caída en vivo (cubierta por la
  prueba de `anotarPasos`) y «separó» en el navegador (en local no hay una cuenta de cliente de prueba; crear una pide consultar un DNI
  real): su función está probada en Postgres y la acción usa el mismo camino que «a la bolsa».
