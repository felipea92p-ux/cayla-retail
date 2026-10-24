# Cinco formas de armar el formulario de «Nueva oferta o promoción» (2026-10-23)

> Solo maquetas. No hay código del ERP, ni migración, ni cambio en producción. Todo dato es inventado salvo lo marcado como de producción.

## Qué pidió Felipe

> «El formulario de creación de una oferta o promoción es muy extenso, lo que podría ser tedioso para el usuario final. Necesito que sea **más compacto, simple y fácil de comprender para cualquier persona que no tenga conocimiento**. Dame 5 opciones de cómo se podrían armar estas pantallas para elegir la más acertada.»

Quien lo usa: una colaboradora o la encargada de una tienda de ropa (CAYLA, Perú), sin formación técnica, que registra la oferta de una campaña («Halloween», «Aniversario CAYLA»).
Debe entender **qué está creando sin que nadie se lo explique** y terminar en pocos toques.

## Dónde vive el formulario

Catálogo ▸ Insignias ▸ Campañas ▸ **«Configurar»** abre la hoja «Configuración «Halloween»». Esa hoja tiene dos partes:

1. **La campaña** (cuándo rige, qué prendas lleva) → ya está bien, no se rediseña.
2. **Ofertas y promociones**: lo ya registrado (lista) + **el formulario para registrar otra** ← esto es lo que se rediseña.

La maqueta actual (la que Felipe encuentra extensa) está en `../index.html`: ábrela, toca el paso 2 y mira el formulario. Funciones: `formRegla`, `beneficio`, `grupoPrendas`, `lado`, `revisar`, `modalCfg`; datos: `TIPOS`, `OPCIONES`, `DEF`, `LIM`, `REG`. Los tokens de color y las piezas visuales están en su `<style>`.

### Lo que mide el formulario de hoy (para que lo superes con números)

Con Black Friday y la promoción «Lleva N, paga M»:

- **12 grupos** apilados: Qué vas a registrar · De qué tipo · (campos del tipo, 2–3) · Cuáles prendas cuentan · Qué tiene que hacer el cliente · Prendas · Dónde · Cuándo rige · Cuántas unidades hay · Con las demás ofertas · Nombre.
- **2 460 px de alto** (más de 4 pantallas de laptop) y **42 controles** a la vista; **33 chips**.
- Un panel lateral con **3 cajas** y **7 verificaciones** («Antes de guardar»), la mayoría en verde: ruido.
- La mayoría de esos campos casi nunca se cambia: tiendas = las 3, fechas = las de la campaña, se suma con las demás, sin tope, sin Claurè, nombre automático.

## Lo que TODA opción debe cumplir (no negociable)

1. **Alcanzar los 15 tipos** (nada se pierde; solo cambia cómo se llega):

   | Familia | Tipo | Campos | Ejemplo en palabras de tienda |
   |---|---|---|---|
   | Oferta (sin condición) | Descuento en % | % (5–70, de 5 en 5) | «20 % menos» |
   | | Soles menos por prenda | soles (10–100) | «S/ 10 menos en cada prenda» |
   | | Precio único | precio (20–500) | «Todas a S/ 29.90» |
   | Promoción · cantidad | N por un precio | cuántas (2–6), precio, qué prendas cuentan | «2 polos por S/ 59.90» |
   | | La N.ª con descuento | cuál (2–6), % (10–100, 100 = gratis), qué prendas cuentan | «La 2.ª al 50 %» · «la 4.ª gratis» |
   | | Lleva N, paga M | lleva (2–6), paga (1–5), qué prendas cuentan | «3x2» · «2x1» |
   | | % desde N prendas | desde cuántas (2–6), % | «3 o más, 15 % menos» |
   | | Conjunto (look) | 2 o 3 categorías, precio | «blusa + falda por S/ 149.90» |
   | Promoción · monto | Soles menos desde un monto | monto (100–600), soles | «S/ 30 menos desde S/ 300» |
   | | % menos desde un monto | monto, % | «10 % desde S/ 300» |
   | | Regalo desde un monto | monto, qué regalo (basta gratis · bolsa · pañuelo) | «Arreglo de basta gratis desde S/ 200» |
   | Promoción · Club | % para miembros | % | «10 % menos para miembros» |
   | | Cupón de bienvenida | % (5–30) | «10 % en su 1.ª compra» |
   | | Compra privada | 12 · 24 · 48 horas antes | «Miembros compran 24 h antes» |
   | | Puntos extra | x2 · x3 | «Puntos dobles» |

   **«Oferta» o «promoción» no se pregunta: se deduce.** Sin condición para el cliente es una oferta; si el cliente tiene que hacer algo (llevar varias, gastar un monto, ser del Club) es una promoción. La persona puede ni usar esas palabras, pero el sistema las guarda y las muestra (chip **Oferta** / **Promoción**).
2. **Campos comunes con un valor de fábrica que casi siempre sirve** (se cambian solo si hace falta, y la pantalla dice cuál es el valor vigente en una línea):
   - Prendas: **todas las de la campaña**. Opcional: solo algunas categorías de ellas, dejar fuera categorías, incluir prendas de Claurè (apagado), solo lo que lleva 60/90/120+ días en el piso. Las promociones de compra (monto, regalo, cupón, puntos) no miran prendas: «toda la compra».
   - Dónde: **las 3 tiendas (TRU, AQP, LIM)**; la tienda web siempre cobra lo mismo que las tiendas y no se elige.
   - Cuándo: **las fechas de la campaña** (nunca antes de hoy, nunca fuera de ellas). Atajos: toda la campaña · fin de semana · 7 días · hasta fin de mes.
   - Con las demás ofertas: **se suma** (primero la prenda, luego el ticket, al final el cupón del Club); alternativa «no acumulable».
   - Unidades: **sin tope**; la tienda dirá cuántas quedan (solo informativo, no se pregunta).
   - Nombre: **se arma solo** («Casacas · −30 %»); editable.
3. **Quién guarda qué** (rol): el **líder** ve «Guardar como borrador» y «Activar»; quien solo ve Insignias ve «Guardar como borrador» y el aviso «un líder la activa». Editando una ya registrada: «Guardar cambios» (vale desde ahora, lo vendido no cambia, queda su historial).
4. **Una vista previa de lo que verá el cliente**, siempre a la vista pero sin ocupar la pantalla (una línea, una tarjeta chica, una etiqueta de precio…).
5. **Avisos solo cuando hay algo que decidir**, nunca una lista de verificaciones en verde. Los que existen hoy (`revisar` en `../index.html`):
   - el paquete o el precio único no es una rebaja (Indecopi);
   - la prenda subió de precio hace pocos días y rebajarla ahora engaña (Jean Palazzo, con botón «Sacarla de la oferta»);
   - queda por debajo del costo (no bloquea);
   - no alcanza ninguna prenda (la campaña no tiene prendas);
   - se cruza con otra oferta de la misma campaña (gana la mejor para el cliente);
   - las fechas se salen de las de la campaña (botón «Ajustar a la campaña»);
   - un regalo es una transferencia gratuita (pregunta al contador antes de activar);
   - una oferta de monto: el monto se cuenta sobre lo que el cliente paga.
   «Lo que cedes» (cuánto margen cede, estimado) debe quedar a un toque, no ocupar un panel fijo.
6. **Lenguaje de tienda, en español peruano neutro**: «tú», «cliente» (nunca «clienta»), «tienda» o «sede», «colaboradora». Cero jerga: no «regla», «alcance», «ámbito», «beneficio», «condición», «SKU», «tipo de condición», «acumulable» sin explicar. Cada palabra rara lleva su ejemplo al lado.
7. **Escritorio y celular (375 px)**. En celular la hoja es de pantalla completa con el pie fijo.
8. **Solo los tokens de la maqueta** (los de `../index.html`: crema, papel, tinta, rojo, rojo-p, sand, taupe, verde, ámbar, hueso, pizarra) en claro y oscuro. Nunca un hex nuevo en el formulario. Movimiento breve, una vez, sin rebote, apagado con `prefers-reduced-motion`.

## Vocabulario y reglas del ERP que no se rompen

- «Oferta», «Promoción», «Campaña», «Insignias»: palabras ya decididas. «Sede/tienda/boutique», «colaborador/a», «líder de equipo/encargado de sede». Nunca «sucursal», «empleado», «jefe».
- Una pieza, una función: los botones son `btn` (primario negro, secundario `sec`), las pestañas son el vidrio `.pest`, las insignias de estado son `.chip`. No inventes variantes de botón.
- Guía de foco: la persona siempre sabe qué está hecho, qué sigue y qué falta; lo que falta es tocable. Sin rojo (aquí nada es un error, es un camino).
- «El error es del diseño, no de la persona»: prueba mentalmente el flujo con alguien que nunca lo ha visto.

## Qué entrega cada opción

Un **archivo HTML autocontenido** (se abre con doble clic, sin servidor, sin librerías externas salvo las fuentes de Google que ya usa `../index.html`) en esta misma carpeta, con el nombre que se le indique. Debe mostrar **la hoja «Configuración «Aniversario CAYLA»» completa** (título, «La campaña» resumida en una línea, la lista corta «Ya registradas» con 2–3 filas y el formulario nuevo) dentro de un marco de 1180 × 780 como el de `../index.html`, con la barra de la maqueta (Escritorio / Celular · Claro / Oscuro · Ver como Líder / Con Insignias · Reiniciar).

Dentro de la opción, la persona debe poder recorrer **estos 4 casos de punta a punta** (son la prueba de que sirve a quien no sabe):

1. **«−20 % en todas las prendas de la campaña»** (el caso más común; debe poder hacerse en **2 o 3 toques** y guardarse).
2. **«3x2»** (lleva 3, paga 2).
3. **«S/ 30 menos desde S/ 300»**.
4. **«2 polos por S/ 59.90» solo en Polos**, en solo 2 tiendas y desde el fin de semana (fuerza a tocar los valores de fábrica).

La opción trae **un recuadro discreto «Cómo se mide»** (fuera del marco, bajo la maqueta) con: campos visibles a la vez, alto en pantallas (aproximado), toques para el caso 1, toques para el caso 4, y qué se esconde detrás de «más opciones». Así Felipe compara con números.

## Reglas de trabajo para los agentes

- **Escribe SOLO tu archivo** `docs/maquetas/ofertas-promociones-2026-10/formulario/<nombre>.html`. No edites `../index.html`, `../README.md`, ningún archivo de `apps/` ni de `supabase/`, y **no hagas commit ni push**.
- Copia de `../index.html` lo que necesites (tokens, `TIPOS`, `DEF`, `LIM`, `revisar`, `costoEst`, redondeo `.90` con `rebaja`), pero **no lo importes**: tu archivo es autocontenido.
- Verifica tu JavaScript con `node --check` (extrae el `<script>` a un archivo temporal en el scratchpad, no en `/tmp`) y, si usas el navegador integrado, **crea tu propia pestaña** (`tabs_create`), nunca uses ni cierres las de otros, **no uses `tabs_select`** (el panel es compartido con otros agentes y con Felipe), espera 2 s antes de capturar (el panel puede ir atrasado) y deja el viewport en `desktop` al terminar. El servidor local ya corre en `http://localhost:3031/` (sirve `docs/maquetas`): `http://localhost:3031/ofertas-promociones-2026-10/formulario/<nombre>.html`.
- Tu respuesta final (corta, en español) debe traer: el nombre del archivo, la idea en 2 líneas, **los números de «Cómo se mide»**, lo que se esconde y dónde, el caso que peor sale en tu opción (honestidad), y lo que viste que falló y arreglaste.
