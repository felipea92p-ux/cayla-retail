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
   descarta lo que no calza sin error. «A la bolsa» y «separó» los anota el servidor, dentro de sus acciones, después de responder.
4. **Una visita** dura mientras la persona vuelve a tocar algo antes de 30 minutos: «entró» sale una vez por visita.
5. **La lectura** (actividad 4) es una función de solo lectura del ERP con el candado del módulo «trafico» (solo el líder): cuenta personas por
   el paso más lejano al que llegó cada una (el recorrido nunca crece hacia abajo), con el camino y el departamento de su primera entrada del
   período (los caminos suman exactamente el total).

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
- **Sin probar:** las cabeceras de ubicación reales de Vercel (solo existen publicadas) y la tienda con la base caída en vivo (cubierta por la
  prueba de `anotarPasos`).
