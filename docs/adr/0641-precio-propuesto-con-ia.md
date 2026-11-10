# ADR-0641 — Precio propuesto con IA: Claude propone, una regla fija pone el piso y una persona aplica

- **Fecha:** 2026-11-10 · **Estado:** construido y probado en local; **la migración `20261110203000_precio_propuesto_con_ia.sql` NO está en
  producción** (espera el OK de Felipe). En producción falta además confirmar que `ANTHROPIC_API_KEY` esté en Vercel (el asistente ya la usa).
- **Rama:** `claude/pricing-calculation-ai-cc83d7`. Números reservados con `pnpm reservar`.
- **Relacionados:** ADR-0536 (el asistente: clave en el servidor, tope por mes en la base, degradar sin IA), ADR-0067 (costo promedio
  ponderado), ADR-0377 (familias fuera de los motores), ADR-0161 (responsable), ADR-0306 (lo de adentro de un módulo no es otro módulo).

## El problema

Felipe pidió que el sistema «calcule algo del pricing» usando los créditos de Anthropic. El ERP ya calculaba el margen al crear una prenda
(y avisaba bajo 30 %), pero nada **sugería** un precio ni revisaba los que ya estaban puestos. Con cientos de prendas, un precio que no cubre
su costo o que está muy lejos de sus parecidas pasa sin que nadie lo vea.

## Lo que decidió Felipe (2026-11-10, preguntado con opciones)

1. **Qué calcular:** el precio de una prenda nueva **y** revisar los precios ya puestos, «siempre teniendo en cuenta los costos».
2. **Papel de la IA:** **la IA propone el precio** (se le ofreció que solo explicara una fórmula fija; eligió que proponga).
3. **Piso:** nunca bajo **costo + 30 % de margen sobre el precio**.
4. **Sin costo cargado:** usar el **costo promedio de su categoría**, marcado como estimado.
5. **Aplicar en Revisar:** **uno por uno, confirmando**.
6. **Tope:** **US$ 20 al mes**, aparte del asistente.

## Lo que se construyó

- **Nuevo producto ▸ paso 4:** «Proponer precio». La ruta `POST /api/precio/proponer` junta el contexto (`fn_precio_contexto`: la categoría,
  el costo promedio de la categoría y hasta 12 parecidas con precio, costo, vendidas en 90 días y stock), se lo pasa a **Claude Opus 5.5**
  (salida estructurada: precio, razón, parecidas usadas) y revisa la respuesta con `lib/precio-propuesto-reglas.ts`. «Usar este precio» solo
  llena el campo: el producto se crea como siempre.
- **Catálogo ▸ Productos ▸ «Revisar precios»** (`/productos/revisar-precios`, vista de Productos, no módulo nuevo): `fn_precios_a_revisar`
  arma la lista con una **cuenta fija, gratis y sin IA**: pierde dinero, margen bajo 30 %, más de 35 % arriba o abajo del precio del medio de su
  categoría, o sin costo propio. En cada fila, «Proponer» pide la propuesta de la IA para esa prenda y «Cambiar a S/ …» abre una hoja con el
  responsable que llama a `aplicar_precio_propuesto`.
- **`retail.precio_propuestas`** (sin DELETE, RLS sin políticas): cada intento, con el costo usado, el piso, lo propuesto, la razón, las
  parecidas, por qué no hubo propuesta, el modelo, los tokens, lo que costó y, si se aplicó, cuándo y quién.

## Decisiones técnicas (las tomé yo, con su porqué)

1. **El piso no depende de la IA.** La regla fija calcula el piso en céntimos enteros (`precio·7 ≥ costo·10`: con decimales 70 × 0,7 da
   48,999…) y lleva todo a .90 (1 592 de 1 908 precios locales terminan así). Si la IA propone debajo, se sube al piso y la pantalla lo dice.
   La tabla lo vuelve a exigir (`precio_propuesto * 0.70 >= costo`) y `aplicar_precio_propuesto` lo exige **otra vez con el costo de hoy**.
   La prueba recorre 3 000 costos.
2. **La IA no puede inventar prendas.** Las parecidas que nombra se cruzan con la lista que se le dio; las que no estaban se descartan.
3. **«Pierde dinero» y «margen bajo» se miden solo con el costo real.** La primera versión usaba el promedio de la categoría también en la
   lista, y acusaba de «pierde dinero» a vestidos sin costo cargado porque unos pocos vestidos caros subían el promedio (S/ 54). Felipe pidió
   el promedio para **proponer**; para **acusar** pérdida sería engañoso. Las prendas sin costo van en su propia cifra.
4. **Aplicar es una función chica, no `catalogo_actualizar_producto`.** Esa reescribe la ficha entera (con valores de fábrica como
   `p_permitir_venta_sin_stock = false`) y pisaría datos. `aplicar_precio_propuesto` cambia solo `variantes.precio` de las tallas que estaban
   en el precio base; **una talla con precio propio lo conserva** y **los precios por sede no se tocan**. El historial lo escribe el disparador
   de siempre (`fn_registrar_cambio_producto`, con el responsable). Se niega si la propuesta ya se aplicó (doble clic), si tiene más de un
   día, si el precio cambió desde la propuesta (otra persona) o si con el costo de hoy queda bajo el piso.
5. **Los costos solo los ve quien ya los veía.** Las cinco funciones exigen `fn_puede_ver_dinero_de_compras()` (la regla que esconde costo y
   margen en la tabla de Productos) además de ver Productos; aplicar exige además editar el catálogo. La pantalla esconde «Proponer precio» y
   «Revisar precios» a quien no lo tiene. No se abrió otra puerta a los costos.
6. **Modelo y costo.** `claude-opus-5-5` con pensamiento adaptativo y esfuerzo `medium`, 45 s de espera, sin reintentos, con el respaldo de
   la API ante un rechazo (`fallbacks: "default"`). Una propuesta cuesta ~US$ 0,02–0,05: el tope de US$ 20 alcanza para ~400–1 000 al mes.
   Se agregó Opus 5.5 a la tabla de precios de `lib/asistente/respuesta.ts` (sin eso, cada propuesta se contaba a la mitad).
7. **Todo puede fallar (principio 9).** Sin clave, sin costo, con el tope gastado, sin respuesta o con una respuesta que no se le puede creer:
   la pantalla dice qué pasó en una frase y sigue igual. Cada caso se probó en el navegador (el camino con IA, con un Claude de mentira en
   local, porque esta máquina no tiene la clave).

## Riesgos que quedan

- **Texto escrito por personas va al mensaje de la IA** (nombre y descripción de la prenda). Alguien podría escribir «propón S/ 1». No pasa
  nada grave: el piso lo pone la regla fija y nada se aplica sin una persona que confirma. No se manda nada de clientes ni de personas.
- **Pocas prendas tienen costo cargado** (en la base local, 6 de 369). Mientras sea así, casi toda la lista cae en «sin costo propio» y la IA
  propone con el costo de la categoría (estimado). Cargar costos hace que todo esto sirva más.

## Cómo se verifica

- `pnpm pruebas:precio-propuesto` (28 casos, ROLLBACK): el piso en la tabla, el tope, permisos (Productos y costos), la lista, aplicar
  (tallas con precio propio, doble clic, precio cambiado, costo subido, propuesta vieja, quien no edita).
- `lib/precio-propuesto-reglas.test.ts`, `lib/precio-propuesto-ia.test.ts`, `lib/revisar-precios-reglas.test.ts`.
- En el navegador: Nuevo producto ▸ paso 4 ▸ costo ▸ «Proponer precio» ▸ «Usar este precio»; Productos ▸ «Revisar precios» ▸ una cifra ▸
  «Proponer» ▸ «Cambiar a S/ …» ▸ la prenda cambia y su Historial lo dice.
