# Maqueta · Campañas de la tienda web (2026-10-20)

> **Estado: en revisión con Felipe.** Solo maqueta: no hay migración, ni código del ERP ni de la tienda, ni cambio en producción.
> Todos los datos (campañas, cifras, fechas, precios) son **de ejemplo**; las fotos son las de la portada pública.

`index.html`: un solo archivo. Hace falta un servidor local (abierta como archivo suelto, la vista previa del panel no deja tocarla):

```bash
python3 -m http.server 3031 --bind 127.0.0.1 --directory docs/maquetas
```

y abrir `http://localhost:3031/campanas-tienda-2026-10/`. La barra negra de arriba cambia de pantalla, de campaña, de tienda
(computador o celular) y de tema; no es parte del diseño.

## Qué pidió Felipe

Diseños y animaciones **por campaña** en la tienda web (apps/tienda), **configurables desde el retail** (ERP).

## Dónde está hoy una campaña (lo que ya existe)

Una campaña es una fila de `retail.etiquetas` con `estilo = 'campana'` (nombre, `descuento_pct`, `vigente_desde/hasta`, prendas por
`variante_etiquetas` o por categoría). `retail.tienda_portada()` devuelve `{nombre, pct, hasta}` de la que termina primero, y la tienda
la muestra como una frase en la franja de arriba y una cuenta regresiva en el héroe. No tiene diseño propio.

## Las 4 pantallas

| # | Pantalla | Quién | Qué decide |
|---|---|---|---|
| 1 | **Tienda web ▸ Campañas** (lista) | Líder | Qué campañas hay, cuáles ya tienen diseño, línea de tiempo de 3 meses, aviso de cruces |
| 2 | **Diseñar la campaña** (editor con vista previa viva) | Líder | 5 pasos: Ambiente · Colores · Movimiento · Textos e imagen · Dónde se ve. A la derecha, la tienda real reaccionando: portada, catálogo y bolsa, en computador y celular, claro y oscuro, «En vivo» o «Último día», y «Movimiento reducido» |
| 3 | **Programar** (hoja) | Líder | Resumen de lo que va a pasar y confirmación. Sin tener que acordarse el día de la campaña |
| 4 | **La tienda** (lo que ve el cliente) | Cliente | Se cambia la fecha: antes · en vivo · último día · terminó. Portada, catálogo y bolsa |

## Lo que propone la maqueta (a confirmar)

1. **El diseño cuelga de la campaña existente; no la reemplaza.** Fechas, % y prendas se siguen armando en Catálogo ▸ Etiquetas (una sola
   fuente de verdad, principio 4). Aquí solo se elige cómo se ve. Así la tienda nunca dice un precio distinto al de la caja.
2. **Un catálogo cerrado de ambientes** (Sobrio, Aniversario, Fiestas Patrias, Día de la Madre, Black Week, Navidad), cada uno con 3
   paletas y un efecto de fábrica. El líder **elige y ajusta, nunca escribe CSS**. Un ambiente nuevo lo agrega el equipo.
3. **El efecto de ambiente se elige con íconos, sin palabras** (Felipe 2026-10-20): una cuadrícula de 10 (ninguno, destellos, confeti, pétalos,
   copos, corazones, estrellas, hojas, burbujas, patitas para el Día del Gato) con su nombre al pasar el mouse y bajo la cuadrícula. En íconos caben muchos más.
   **Cinco cosas se ajustan:** paleta (y un acento propio), movimiento (franja, entrada de la portada, efecto, cuánto dura, cuenta
   regresiva), textos cortos con tope, imagen (las prendas de la campaña o una foto propia) y dónde se ve (franja, portada, banda del
   catálogo, sello en cada prenda, línea en la bolsa).
4. **Candado de lectura.** Se mide el contraste real (WCAG) del titular, del acento y del sello. Si un color no se lee, el paso 2 dice
   «Falta» y **Programar queda apagado**. El sello `−25 %` elige solo un color que se lea sobre la foto.
5. **Principio 9 (todo puede fallar):** si el diseño no llega o es inválido, la tienda se ve como siempre. Empieza y termina con las
   fechas de la campaña; no hay interruptor que alguien deba acordarse de apagar.
6. **«Reducir movimiento»** del aparato del cliente apaga todo (efectos, telón, marquesina): queda la tienda quieta.
7. **Vista previa privada** (botón en el pie): un enlace que solo ve quien lo tiene, para ver la tienda de verdad antes de programar.
8. **Guía de foco (ADR-0284):** cada paso dice Listo / Sigue aquí / Falta / Opcional; el pie dice «Falta: …» tocable.
9. **Sugerencias coherentes (ADR-0290):** el ejemplo de cada caja de texto sigue el ambiente elegido (Black Week sugiere «Una semana,
   una sola vez al año»; Navidad, «Regala algo que se queda»).

## Lo que Felipe tiene que decidir

- **Movimiento: ¿una vez o continuo?** La regla de la tienda web hasta hoy es «ricas, una vez, sin bucle» (ADR-0430). La maqueta deja
  **«Una vez al llegar» como valor de fábrica** y ofrece «Suave y continuo» como opción por campaña. ¿Se ofrece o se quita?
- **¿Foto propia?** Subir una foto por campaña añade peso (se comprimiría a ≤ 300 KB) y revisión. Alternativa: solo las prendas de la campaña.
- **¿Quién configura?** Módulo nuevo `campanas_web` (nace solo para el líder, delegable, como manda ADR-0161). ¿Se delega a marketing?
- **Dos campañas a la vez:** hoy gana la que termina primero. La maqueta lo avisa; ¿basta o hace falta elegir a mano cuál manda?

## Lo que implicaría construirlo (no se hizo)

- **Base:** tabla `retail.campana_disenos` (1 fila por etiqueta de campaña: `plantilla` con CHECK al catálogo, `paleta` y `movimiento` como
  `jsonb` validado, textos con tope, ruta de la foto, `donde`, estado borrador/programado). RLS encendido **sin políticas**; solo se
  toca con `fn_campana_diseno` y `guardar_campana_diseno`, que piden el módulo y firman con `fn_actor_persona_id(true)`. La función
  `tienda_portada()` devuelve además el diseño (sin tocar el descuento).
- **Web (ERP):** módulo `campanas_web` en `lib/modulos.ts` y `lib/menu.ts` (Tienda web ▸ Campañas), `exigirModulo`, la guía de foco y la
  guía interactiva de la pantalla, y la regla de pestañas/cabecera ya decididas (ADR-0358).
- **Tienda:** un solo `apps/tienda/app/estilos/campana.css` con las clases de los 6 ambientes y un lector Zod del diseño que, si falla,
  devuelve «sin diseño» (el mismo patrón de `interpretarPortada`). El efecto de ambiente es CSS, sin librerías.
- **Orden sugerido:** (1) esquema + función + lector Zod; (2) lista y editor en el ERP; (3) los 6 ambientes en la tienda; (4) vista
  previa privada; (5) prueba de los candados (contraste, fallo → tienda normal, reducir movimiento).

## Qué es real y qué es de ejemplo

- **Real:** el modelo de campaña (etiqueta), el orden «gana la que termina primero», las fotos y nombres de las prendas, la identidad
  «A · Muro» de la tienda y los tokens del ERP.
- **De ejemplo:** las 5 campañas y sus cifras, los precios y descuentos, las fechas, los 6 ambientes y sus paletas.
- **Fuera de la maqueta:** el lateral del ERP (la pantalla se dibuja sola), la subida de la foto propia y el celular del ERP (el líder usa
  escritorio; el celular solo se ve en la tienda).
