# Maqueta · Recibir mercadería: los envíos (2026-11-17)

Felipe, mirando «Envíos por recibir» de Tienda TRU: «los últimos envíos deben estar arriba que los antiguos»; maquetas más útiles y
amigables para ver todos los envíos; arreglar «los terminados que salen en terminados y siguen abiertos».

Abrir `index.html` desde un servidor local (configuración `maqueta-referentes` de `.claude/launch.json`:
`http://localhost:<puerto>/recibir-envios-2026-11/`). Va sobre el marco ya elegido (`../vidrio-base-2026-10/`). **No guarda nada**; los
datos son inventados (ni marcas ni proveedores reales). Por URL: `?cara=A|B|C`, `?tema=oscuro`, `?cajon=ENV-000017`.

**Elegida y construida:** Felipe eligió la **«C · Índice»** de la ronda 3 el 2026-11-17. Quedó en `/recibir` como la tarjeta «Envíos · sede»
(ADR-0676, `apps/web/components/recepcion-envio/EnviosDeLaSede.tsx`). Diferencias con la maqueta: no existe el estado «Falta abrir» (el sistema
no sabe que un paquete llegó hasta que alguien lo abre), con más de un proveedor la fila dice «Proveedores varios», no hay panel lateral (cada
fila abre la hoja que ya existía) y las miniaturas de las prendas quedaron para un segundo PR.

## Las tres rondas

- **Ronda 1** (`ronda-1.html`): tres tablas. Felipe: «no sean tan planos… sin que haya tanto texto».
- **Ronda 2** (`ronda-2.html`): anillos, lentes con ícono y discos de marca. Felipe: «no me gusta nada».
- **Ronda 3** (`index.html`): «olvida todas las maquetas pasadas y haz 3 más desde 0 tomando como referencia los mejores sistemas del
  mundo y los que muestran de manera amigable todas sus cosas». Cada propuesta copia un patrón que la gente ya conoce.

## Lo que hoy está mal

1. Un envío a medias sale **tres veces**: un aviso arriba, una fila en «Envíos por recibir» y otra en «Terminados» con «Sigue abierto».
2. El más viejo va arriba: `ordenarFilasPorRecibir` (`apps/web/lib/recepcion-envio-busqueda.ts:43`) ordena por fecha de menor a mayor.
3. El estado es una fila de íconos sin palabras.
4. Los proveedores se cortan con «…» sin forma de ver la lista; «Guía» casi siempre dice «—».

## Ronda 3: de dónde sale cada una

| | A · Estantes | B · Seguimiento | C · Índice |
|---|---|---|---|
| Referencia | Netflix «Continuar viendo», Spotify, App Store «Hoy» | Amazon y Mercado Libre «Mis compras», la app Shop | Shopify Admin al recibir inventario, Linear, Stripe |
| Qué se toma | Lo último, grande y arriba. Debajo, estantes que se deslizan; la portada es la protagonista y la barra de avance va pegada a ella | Una tarjeta por envío, por día, del más nuevo al más viejo. Una frase dice cómo va, las fotos qué trae, cuatro pasos cuánto falta | Una tarjeta con pestañas y su cuenta, una línea por envío con miniatura, insignia y «recibido» en una barra. Ordena y filtra desde la cabecera (`TablaViva`) |
| Gana | La más visual: el envío se reconoce por lo que trae | Se entiende sola, como rastrear un pedido | La más rápida para revisar muchos |
| Paga | Con muchos abiertos hay que deslizar | Unas 4 tarjetas por pantalla | La menos llamativa |

Las referencias salen de lo que se conoce de esos productos; no se abrieron para compararlas pantalla por pantalla.

## Lo que comparten las tres

- **Se ve lo que trae el envío.** En la pantalla real, la foto de cada prenda (`FotoDePrenda`); sin foto, su silueta sobre su color (ADR-0333).
  Para eso, la lista de envíos tiene que traer algunas prendas de cada envío (hoy no las trae).
- **Lo más nuevo, arriba.** Lo que está por llegar se ordena por cuándo llega.
- **Cada envío sale una sola vez.** Lo que ya entró al stock de un envío a medias es el verde de su barra; «Terminados» trae solo lo cerrado.
- **Los avisos de arriba se van:** lo que lleva 3 días o más abierto (`DIAS_PARA_RESALTAR`) lo dice en ámbar, en el propio envío.
- **Lo que explica va a un toque:** marcas, proveedores y cifras, en el cajón del envío (`<Cajon>`).

## Qué cambia en el código al elegir

- `ordenarFilasPorRecibir`: fecha descendente (y quitar el rango que manda al fondo lo creado por mí, `creadoPorMi`).
- `RecibidoEnLaSede` / `RecibidoPorEnvio`: «Terminados» deja fuera los `enviosAbiertos` en vez de marcarlos «Sigue abierto».
- Los `Aviso` de `getEnviosAMedias` en `app/(app)/recibir/page.tsx` salen; su dato pasa al envío.
- La lectura de la lista suma las primeras prendas de cada envío (para la portada o las miniaturas). Es lectura: ninguna regla de stock cambia.
