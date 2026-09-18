# Decisiones de datos — 12 de septiembre de 2026

> Este archivo es el **acta**: las 52 decisiones que Felipe tomó en la sesión donde se
> diseñó la documentación de base de datos de CAYLA. Todo lo que dice `docs/datos/`
> se apoya aquí. Si una decisión cambia, **se corrige aquí primero** y después se
> propaga al resto — nunca al revés.
>
> Formato: **D-nn · Pregunta → Decisión.** Las que quedaron abiertas están marcadas
> con ⏳ y son las únicas que se pueden renegociar sin discutir el resto.

---

## A. Qué es este documento y para quién

**D-01 · ¿Cuál es el trabajo principal?** → **Onboarding en un día**, apoyado en dos
más: que nadie rompa el núcleo, y que exista un único mapa de verdad. Los tres a la
vez, con el onboarding mandando cuando se contradigan.

**D-02 · ¿Para quién se escribe?** → Para **las 5-6 personas que codean** y para
**Claude / Codex / agentes de IA**. No se escribe para el contador ni para tienda
(ellos reciben reportes, no documentación de base de datos).

**D-03 · ¿Dónde vive?** → **En el repo** (`docs/datos/`), con **punteros en la
memoria de Claude**. Viaja con el código, entra por PR, y el `git log` dice quién
cambió qué. La memoria guarda solo señales de dónde mirar, nunca contenido.

**D-04 · ¿Cómo se mantiene vivo con 6 personas?** → **Mitad generada, mitad escrita.**
Un script saca de la base lo mecánico (tablas, columnas, tipos, llaves, índices,
permisos) y siempre está al día. Lo que explica el porqué se escribe a mano y casi
no cambia.

**D-05 · ¿Qué sistemas cubre?** → **Los dos completos**: `cayla-retail` y
`cayla-dynamic`. Comparten base de datos en producción; documentar uno solo es
documentar media verdad.

**D-06 · ¿Cuánto detalle por tabla?** → **Campo por campo, las 44** (y las de
Dynamic). Por eso el diccionario se genera: a mano, ese nivel de detalle se pudre.

**D-07 · ¿Qué hacemos con lo viejo?** → **Marcarlo como muerto**, con el motivo por
el que sigue vivo. Nadie construye encima de algo abandonado por accidente.

**D-08 · ¿Habla de lo que existe o de lo que falta?** → **De lo que existe, más una
lista separada y claramente marcada de lo que falta.** Nunca mezcladas en la misma
página.

---

## B. Gobierno: quién manda sobre qué

**D-09 · ¿Quién manda sobre cada parte?** → **Un dueño por área**, con **apodo de
pájaro**. Un pájaro por cada uno de los 14 módulos. Los nombres de las personas los
asigna Felipe; los pájaros ya están repartidos en `07-GOBIERNO.md`.

**D-10 · ¿Qué pasa antes de cambiar el esquema?** → **Se escribe el porqué en una
nota** (el mecanismo de ADR que ya existe y funciona): qué cambié, por qué, qué se
rompía sin eso.

**D-11 · ¿Quién puede pegar SQL en producción?** → **Solo Felipe, y queda anotado.**
Una sola mano toca la base real, y cada vez que lo hace se registra qué pegó y
cuándo.

**D-12 · ¿Los roles se unifican entre los dos sistemas?** → **Sí, cuatro niveles, un
solo vocabulario en todo CAYLA**:

| Nivel | Qué es | Nota |
|---|---|---|
| **Admin** | Ve y puede todo, en todas las sedes | Felipe y quien designe |
| **Líder de equipo** | Manda en su sede | Equivalente a lo que en tienda se llama "encargada/o" — se usa **Líder de equipo** porque hay hombres y mujeres en la empresa |
| **Integrante** | Opera en su sede, con límites | |
| **Solo lectura** | Ve, no toca nada | Para el contador externo |

**D-13 · ¿Qué puede un Líder de equipo que un Integrante no?** → Cerrar la caja del
día · Ver costos y márgenes · Ajustar stock sin venta · Registrar gastos y
depósitos · Ver las métricas esenciales de su sede.

**D-14 · ¿Dónde manda un Líder de equipo?** → **En su sede, y puede cubrir otra
temporalmente** (permiso con fecha de vencimiento — hoy no existe, hay que
construirlo).

**D-15 · ¿El Taller es una sede?** → **Sí, una sede con poderes especiales**: puede
mandar mercadería a cualquier sede sin pedir permiso. La excepción queda escrita y
acotada, no se descubre leyendo código.

---

## C. La brecha entre tu máquina y las tiendas

**D-16 · ¿Qué base describe el documento?** → **Las dos, lado a lado.** Cada tabla
lleva marca: existe en las dos, o solo en local. Decidido por Felipe con el criterio
"es vital avanzar más rápido y evitar errores".

**D-17 · ¿Qué es `supabase/unificacion/` (38 archivos, el riel real de producción)?**
→ **Deuda a extinguir, con fecha.** Se documenta honestamente, se explica por qué
nació, y queda escrito el plan para volver a un solo camino.

**D-18 · ¿Hace falta un entorno intermedio?** → **Sí.** Una copia idéntica a la de
las tiendas donde probar antes de que un cambio lo vea una clienta.

**D-19 · ¿Cada cuánto se compara local contra producción?** → **Automático, y avisa
solo cuando difieren.** Silencioso mientras todo coincide.

**D-20 · La sede corporativa** → se llama **`CCO`**. Local la llama `CORP`: eso es un
error de local que se corrige, no una variante aceptable.

---

## D. Qué es verdad y qué no

**D-21 · ¿Se puede reconstruir el pasado?** → **Sí, y el documento lo explica.**
`movimientos` es la historia y no se toca.

**D-22 · El historial hoy se puede borrar (no hay candado físico).** → **Se pone el
candado de verdad.** La base rechaza borrar o editar un movimiento pasado.

🔴 **Verificado en producción el 2026-09-12, y es peor de lo que se creía.** El rol
`authenticated` tiene sobre `retail.movimientos` los permisos `UPDATE`, `DELETE` **y
`TRUNCATE`**. Ninguna tabla del schema tiene `FORCE ROW LEVEL SECURITY` y `movimientos`
no tiene ni un disparador. Lo que hoy protege la historia es que no existe una política
de fila para `UPDATE`/`DELETE` — pero **la seguridad por fila no se aplica a
`TRUNCATE`**: ese permiso vacía la tabla entera saltándose las políticas. Lo único que
lo frena en la práctica es que la API web no expone ese verbo, lo cual es una
propiedad de la API, no una garantía de la base. Esto sube D-22 de «conviene» a
«urgente»: el candado y la retirada del permiso de `TRUNCATE` van juntos.
**Cómo se corrige un error entonces:** se escribe lo contrario — un movimiento de
corrección con su motivo. El stock queda bien y el historial muestra el error *y*
la corrección. Para el caso extremo, Felipe sigue pudiendo hacerlo desde el editor
SQL de producción (D-11), que deja rastro.

**D-23 · ¿Se cierra el mes?** → **Sí, con llave.** Un mes dado por bueno no acepta
escrituras sin abrirlo a propósito y dejando rastro.

**D-24 · ¿Documentamos las promesas incumplidas?** → **Sí, las 20, con nombre y
apellido**: dónde se promete y qué pasa de verdad. Cada una se convierte en tarea o
en corrección del texto.

**D-25 · ¿Pruebas sobre el núcleo de stock?** → **Sí, antes del censo.** Hoy no hay
ni una, y los 4 errores de esa familia se encontraron a mano.

---

## E. Permisos y datos sensibles

**D-26 · ¿Un Integrante puede operar el almacén de su propia sede?** → **Sí.**

✅ **Ya está cumplida en producción** — verificado contra la base el 2026-09-12:
`bajar_a_piso` y `devolver_a_almacen` validan `puede_operar_sede`, así que un
Integrante ya opera el almacén de su sede en las tiendas. La pregunta se hizo sobre un
diagnóstico que resultó equivocado. Lo único que local tiene de más es la rama
`tienda_asociada_id`, que producción no necesita porque nunca creó las sedes `-ALM`.
**No hay nada que corregir aquí.**

**D-27 · Costos, márgenes y cuentas bancarias de proveedores, hoy visibles para
cualquiera con cuenta.** → **Se dejan visibles: transparencia.** Decisión consciente
de Felipe. Nota única que queda escrita: la cuenta bancaria del proveedor es dato de
un tercero, no de CAYLA.
⚠️ Esto **contradice** el comentario de `0003_rls.sql` que dice "el integrante no ve
costo/margen". Ese comentario se corrige, porque describe algo que nunca fue cierto.

✅ **Corrección 2026-09-17 (angosta, no una reversión completa).** Al construir
métricas de proveedor (ADR-0094), Felipe pidió que lo financiero (facturas, montos,
vencidas, recepción) pase a ser solo de líder — se le mostró esta decisión antes de
tocar nada, no se asumió. Lo que sigue como D-27 lo dejó: el directorio en sí
(nombre/RUC/contacto/rubro/plazo/forma de pago, banco/cuenta_bancaria si algún día
existieran esas columnas) sigue visible para cualquiera con cuenta. Lo que cambia es
solo el bloque que sale de `compras` — eso es "lo financiero" del título de esta
decisión, y ahora `fn_proveedores()` lo devuelve `NULL` si quien pregunta no es líder
(`20260917240000_proveedores_lista_indicadores_y_candado_sede.sql`). De paso se
confirmó que `/compras/proveedores` (la pantalla) ya era solo-líder desde el
2026-09-16 por `app/(app)/compras/layout.tsx` — este documento nunca se actualizó para
decirlo, y por eso seguía leyéndose como si todo el módulo fuera abierto.

**D-28 · ¿Datos personales?** → **Sí: se marca qué campo identifica a una persona,
cuánto tiempo se guarda y quién lo ve.** Capítulo propio (`06-DATOS-PERSONALES.md`),
con la Ley 29733 peruana como marco.

**D-29 · ¿Respaldos?** → **Hay que averiguarlo y escribirlo con el número real**: qué
respaldo tiene hoy la base de producción, cada cuánto, cuánto se guarda y si alguien
probó alguna vez restaurarlo.

---

## F. Cómo funciona el negocio (lo que solo Felipe podía responder)

**D-30 · Estado de resultados por sede** → **Cada sede tiene el suyo, y se
consolidan.** Es un requisito central, no un lujo.

**D-31 · ¿Cómo se mide el Taller?** → **Costo absorbido + referencia de maquila.**
El Taller NO le vende a las tiendas: el costo real de producción se pega a la prenda
y viaja con ella. El Taller se mide por **eficiencia** (lo que gastó contra lo que
absorbió en las prendas que produjo) y contra **una cotización real de maquila
externa**. Nada inventado, todo automático, la consolidación es una suma.
Descartado explícitamente: el precio de transferencia interno (lo fija Felipe, así
que el resultado también lo fijaría Felipe).

**D-32 · Gastos que no son de ninguna sede** (sueldo de Felipe, contador, servidores,
software) → **van a la sede corporativa `CCO`**.

**D-33 · Los sueldos, que viven en el sistema de personal** → **este sistema los lee
de allá.** Sin eso, el resultado por sede es fantasía. Amarra los dos sistemas: esa
frontera se documenta en `14-DYNAMIC.md`.

**D-34 · Boleta y venta, hoy sueltas** → **se unen.** Cada venta queda pegada a su
comprobante. Es además el requisito para que las devoluciones funcionen.

**D-35 · El libro contable, que hoy nadie llena solo** → **que se llene solo, por
etapas.** Empezando por venta y gasto, que son las que más pesan. Cada regla se
decide con el contador, no se inventa.

**D-36 · Libros electrónicos de SUNAT (PLE)** → **los arma el contador**; el sistema
le entrega un reporte limpio. CAYLA no carga con una obligación legal cuyo formato
cambia.

**D-37 · Vigilancia de comprobantes trabados camino a SUNAT** → **alarma automática
diaria.**

---

## G. Inventario: cómo se mueve la mercadería de verdad

**D-38 · Piso de venta y almacén** → ya existen como dos bolsillos de la **misma
sede** (`stock` = exhibido, `stock_almacen` = guardado). Se confirma ese modelo: **un
almacén por sede alcanza.**

**D-39 · Las alertas de stock** → **cuentan las dos cosas, pero avisan cuántas están
guardadas**: "quedan 2 en piso y 8 en almacén — baja mercadería".

**D-40 · Vender algo que está en el almacén** → **se puede, y el sistema registra
solo el paso por el piso.** La caja no se frena nunca por un trámite.

**D-41 · Devolver del piso al almacén** → **pasa de verdad, falta la pantalla.** La
operación ya existe en la base (`devolver_a_almacen`) y no tiene interfaz.

**D-42 · Dónde entra la mercadería nueva** → **al almacén, y de ahí se baja al piso.**

**D-43 · Devoluciones de clientas** → hoy no existen (se disfrazan de ajuste). **Se
marcan como hueco Y se deja diseñado** cómo debe modelarse: ligada a su boleta, con
nota de crédito, y decidiendo a qué sede reingresa.

**D-44 · Descuentos en la venta** → hoy no se registran. **Hueco + diseño
propuesto**: precio de lista, precio cobrado, motivo.

**D-45 · Costo de la prenda** (hoy uno solo por variante, el nuevo pisa al viejo) →
⏳ **Abierta.** Felipe: "es un tema contable, existen métodos, no sé si es necesario
ese nivel de detalle ahora". Se documenta el problema con los métodos nombrados
(promedio ponderado, PEPS) para que el contador decida. **No se toca el núcleo hoy.**

---

## H. Qué falta construir, en orden

**D-46 · Prioridades declaradas por Felipe** → 1) **Cuentas por pagar e IGV**
(CAYLA va al 72% del umbral de 300 UIT), 2) **Materia prima del Taller**,
3) **Clientas y fidelización**. La tienda online queda para después.

✅ **La parte de "cuentas por pagar" ya está resuelta en código** — actualización
2026-09-17: ADR-0035 (`docs/adr/0035-la-factura-de-compra-es-el-eje-de-recepcion-y-pago.md`)
y sus migraciones `20260912231956_compras_desde_factura.sql` /
`20260912234815_compras_snapshot_y_paginado.sql` crearon `compras`/`compra_items`/
`compra_pagos` y la vista `compras_resumen`, que calculan `saldo`, `estado_pago`,
`vencida`, `recibido_cantidad` y `estado_recepcion` por factura — ya se puede
responder "¿cuánto le debo a este proveedor y desde cuándo?" mirando el sistema, con
pantallas construidas y probadas (`/compras`, `/compras/por-pagar`). Verificado
contra producción el 2026-09-17: las tablas y `registrar_compra` ya están vigentes
allá (`docs/datos/10-ROADMAP-DATOS.md:189-198`), aunque todavía sin ninguna factura
real cargada — brecha de uso, no de código. **Lo que sigue abierto de D-46 es el
IGV:** no existe cálculo de crédito fiscal acumulado ni alerta de umbral de 300 UIT
— `compras.igv` guarda el IGV por factura y nadie lo suma
(`docs/datos/modulos/11-finanzas-operativas.md:92`; no hay `credito_fiscal` ni
`igv_acumulado` en `apps/web/`). Materia prima del Taller y Clientas (prioridades 2
y 3 de D-46) no se revisaron en esta pasada.

**D-47 · Inventario de insumos del Taller** → **completo**: la tela entra, se
descuenta al cortar, y avisa cuando falta. Es la condición para que D-31 sea medición
y no estimación.

**D-48 · Clientas** → **clienta de verdad + programa de fidelización desde el
principio.** La mecánica del programa (qué se gana, cómo se canjea) se diseña antes
de escribir código.

**D-49 · La caja sin internet** → **no se congela nunca.** Es el "filo" que la
investigación de mercado identifica como lo único que un competidor no puede copiar
en un trimestre.

**D-50 · El día que otra marca use el sistema** → **cada marca, su propia base.** Se
mantiene la decisión de julio de 2026: nada de `tenant_id`.

---

## I. Forma del documento

**D-51 · Dibujos** → **uno por módulo (14), y más si ayudan.** Felipe: "los gráficos
ayudan mucho". Se escriben en texto (Mermaid) para que se actualicen con el
documento y no haya que redibujar imágenes.

**D-52 · Los números que Felipe mira primero** → **Vendido por sede (hoy y mes)** ·
**Qué se está quedando** · **Efectivo y caja**. El documento se organiza para que
esos tres sean los más confiables de todos (`11-KPIS.md`).

---

## Decisiones que quedaron abiertas

| # | Tema | Qué falta |
|---|---|---|
| D-45 | Método de costeo del inventario | Decidir con el contador: promedio ponderado, PEPS, o costo por lote |
| D-09 | Nombres de personas por pájaro | Felipe asigna quién es cada pájaro en `07-GOBIERNO.md` |
| D-29 | Respaldos | Averiguar el número real y escribirlo |
| D-48 | Mecánica de fidelización | Qué se gana y cómo se canjea |

---

*Acta de la sesión del 2026-09-12. 52 preguntas, 52 decisiones. Si alguna envejece,
se corrige aquí y se propaga — este archivo manda sobre el resto de `docs/datos/`.*
