# ADR-0140 — Carga inicial de proveedores: una fila por empresa, marcas por la tabla puente y RUC caídos en blanco

- **Fecha:** 2026-09-20
- **Estado:** Decidido y **aplicada en producción el 2026-09-20** (pegada por quien administra; ver «Verificación»).
- **Decide:** quien administra el ERP, respondiendo 25 preguntas una por una en la sesión. Arquitectura: este documento.
- **Toca** ADR-0094 (ficha ampliada de proveedores), ADR-0134 (cuentas de pago) y `20260918231000` (marcas y proveedor en
  productos). **No cambia el esquema**: solo escribe datos en tablas que ya existen.
- **Datos personales:** el SQL, la revisión visual y los pendientes de esta carga viven **fuera de git** (llevan nombres,
  celulares y RUC de personas naturales; un RUC que empieza en `10` contiene el DNI). Este documento no nombra a nadie.

## Contexto — el problema

`retail.proveedores` tenía 2 filas y nada más se podía registrar desde el SQL Editor o proveedor por proveedor desde la
pantalla. El negocio ya tiene su historial de compras 2017-2026 en una hoja Excel consolidada (41 libros, extraída y
deduplicada con ayuda de IA): **1.558 proveedores**, solo **293 con RUC de dígito verificador válido** y 408 que compraron 2024
o después. Cargar esa hoja tal cual habría sido cargar basura con formato de dato.

Lo que la hoja trae mal, verificado contra ella y contra la base:

- Etiquetas que **no son proveedores** entre los de mayor gasto (talla «S/M», «Propia», «Importado», «Accesorios», un
  número suelto) y **la misma empresa repetida** bajo su marca, su razón social y su nombre de pila.
- Empresas con **dos RUC** (una persona natural y la EIRL que abrió después, o dos RUC de la misma tienda).
- RUC **de baja de oficio o no habidos** en SUNAT que igual figuran con compras recientes, y un RUC que en realidad
  pertenece a otra empresa.
- Cuentas bancarias **repetidas entre personas distintas**, una cuenta «0.0», teléfonos con sufijo `.0`, y direcciones
  metidas en el campo de contacto.

## Decisión

**DECIDÍ** cargar **74 proveedores** (62 con RUC, 12 sin RUC), **75 marcas** y **75 vínculos** `marca_proveedores`, con un
SQL de un solo lote, todo-o-nada, con candados propios (aborta con un mensaje que nombra el choque, y comprueba los conteos
antes de confirmar), aplicando estas reglas, en este orden:

1. **Universo.** RUC con dígito verificador SUNAT válido (módulo 11, recalculado; el flag de la hoja coincidía), activos
   (compraron 2024+), gasto histórico **de la empresa** ≥ S/2.000 sumando sus RUC hermanos, más los 10 sin RUC más
   grandes. Representan ~54 % de todo lo comprado desde 2016. Entra solo lo que quien administra confirmó: las parejas de identidad dudosa que no confirmó (3 con RUC pequeño y otras 3 antiguas) quedaron fuera a propósito.
2. **Una fila por empresa.** Con dos RUC entra el oficial: **RUC 20 gana; entre dos RUC 10, el de mayor gasto propio**. El
   otro RUC no se carga: queda anotado en el archivo privado de pendientes. 8 familias fusionadas; 19 filas «alias» sin RUC
   (la marca o el nombre de pila de otra fila) se pliegan a la empresa real, y 1 fila con el mismo RUC mal tipeado.
3. **RUC caído ⇒ ficha sin RUC.** Se verificó el estado de los 30 RUC 20 en directorios públicos (24 activos y habidos,
   4 en baja de oficio o no habidos, 2 con fuentes que se contradicen; los de baja se confirmaron con una segunda fuente
   distinta). Los caídos y los RUC con dígito inválido entran sin RUC; los contradictorios conservan el suyo y quedan marcados.
   **Los RUC 10 no se consultaron a terceros** (contienen el DNI; `docs/datos/06-DATOS-PERSONALES.md` trata esas consultas
   como transferencia a un tercero): quedan como pendiente de verificación manual.
4. **Razón social primero; las marcas cuelgan del proveedor.** `nombre` = razón social (la de SUNAT cuando difiere de la hoja
   y la verificación la confirma). Sufijos `SAC/EIRL/SRL/SCRL` **sin puntos** —como los 2 proveedores que ya existían—
   porque `fn_clave_texto` no quita puntos y «S.A.C» y «SAC» serían dos proveedores. Las marcas de la hoja se crean en
   `retail.marcas` (vocabulario cerrado) y se vinculan en `retail.marca_proveedores`; sin ese vínculo no se puede crear un
   solo producto de ese proveedor.
5. **Teléfono y contacto.** `telefono` = primer celular de 9 dígitos (el WhatsApp que la app abre); el resto de números y la
   persona de contacto van a `contacto` con ` · `. **No se toca `celular_billetera`**: adivinar un destino de dinero es
   peor que dejarlo vacío (ADR-0134).
6. **Rubro** = categoría de la hoja traducida al vocabulario del catálogo (Polos, Camisas y Blusas, Casacas, Chompas,
   Vestidos…), para que un reporte que cruce proveedor con producto hable el mismo idioma. Los comodines quedan vacíos.
7. **Sin datos de pago y sin dirección.** Banco/cuenta/CCI/Yape no se cargan (6 candidatos traían algo; ninguno traía titular).
   La dirección no tiene columna: queda en el archivo privado (62 de 74 la traían).

**DESCARTÉ** una fila por RUC (lo que recomendé al principio). Es lo más seguro contablemente, pero contradice cómo opera
el negocio —dos RUC son una sola empresa, decisión de quien conoce a los proveedores— y duplica fichas y compras. Se
acepta el costo conocido de abajo mientras no exista dónde guardar el RUC relacionado.

**DESCARTÉ** cargar las marcas «después, a mano»: son 75 vínculos antes de poder catalogar una prenda de esos proveedores.

**DESCARTÉ** cargar el RUC caído «para no perder el dato»: una ficha con un RUC de baja aparenta una vigencia que no tiene,
y una factura de un RUC en baja no da crédito fiscal. El dato caído queda en el archivo privado, no en la ficha.

**SE ROMPE SI** dos RUC de la misma empresa emiten comprobantes con la misma serie y número (`F001-100` es corriente en
todas las empresas) y se registran bajo el mismo proveedor: `compras` tiene `unique (proveedor_id, serie, numero)` y **no
guarda el RUC del emisor** (lo toma de `proveedores.ruc`), así que la segunda factura choca, o el comprobante muestra el
RUC oficial en vez del emitido. Hoy hay **0 compras**, así que no rompe nada todavía; sí antes de la primera factura de un
RUC relacionado.

**SE ROMPE SI**, en las fichas sin RUC, alguien crea desde la pantalla el mismo proveedor con otra grafía: su único candado
anti-duplicado es el nombre.

## Qué queda pendiente

- **Migración conjunta propuesta (NO implementada; requiere aprobación y ADR propio):** `proveedores.proveedor_principal_id`
  (autorreferencia: cada RUC sigue siendo una fila, la ficha del principal muestra sus «razones sociales relacionadas», el
  comprobante lleva su RUC real y la llave de facturas deja de chocar) **más** una columna `direccion` (62 de 74 la traían).
  Un solo cambio de esquema en vez de dos parches.
- **Proveedores debe mostrar y buscar por marca.** El vínculo marca↔proveedor solo se ve en `/productos/marcas`: la lista de
  Proveedores y el combo de Compras buscan por nombre, RUC y contacto (`ProveedoresPanel.tsx:108`, `CompraFormV2.tsx`). Con
  «razón social primero», **44 de las 71 fichas con marca no se encuentran escribiendo su marca** (quien busca por la marca con que
  conoce al proveedor no halla su razón social). Propuesta: `fn_proveedores()` devuelve las marcas y el buscador las incluye. No implementado.
- Verificar a mano en SUNAT los RUC 10 de mayor gasto y los RUC 20 marcados como dudosos (varios espejos discrepan; ninguna
  fuente consultada es SUNAT oficial) antes de pagar.
- **Higiene de git (no la hace esta carga):** existe un commit local sin publicar, `99059734` (2026-09-12, rama local
  `claude/sweet-gould-fe63b4`), con un volcado anterior de esta misma hoja (esquema V1, no aplicable al actual; abortaría).
  **No subir esa rama.** Borrarla con `gc --prune=now` destruiría también otro commit sin publicar y el reflog de los demás
  worktrees, así que no se toca sin decisión explícita.
- Que quien negocia con ellos pida el RUC vigente a los proveedores que entraron sin RUC.
- Efecto en pantalla: con 0 compras en el sistema, los 74 aparecerán en «Sin compras en 90 días» y «Sin datos de pago»
  hasta que entren facturas y se completen las cuentas. Es lo honesto, no un fallo.

## Verificación

- Hoja original leída con `openpyxl`; RUC recalculados; 30 RUC 20 consultados en directorios públicos con segunda fuente
  para los dudosos (la revisión leyó también el texto de las notas, no solo el estado: encontró avisos que el campo
  estructurado no mostraba).
- SQL releído por un script contra las fichas y contra los candados de la tabla; **revisión adversarial independiente**
  (SQL, fidelidad a la hoja en dos mitades, cumplimiento de decisiones; 4 revisores, 22 hallazgos, un refutador por cada
  hallazgo grave): 1 confirmado (avisos que faltaban, ya agregados), el resto refutado o de severidad baja. El revisor de SQL
  probó además el real, el ensayo y el re-pegado en un Postgres local desechable (borrado después): el re-pegado **aborta sin
  duplicar**.
- **Ensayo contra producción (2026-09-20), en una sola transacción que termina en una excepción a propósito:**
  `proveedores 2 → 76, marcas 1 → 76, vínculos 1 → 76`, y la base quedó en 2 / 1 / 1 (nada escrito).
- **Aplicada en producción (2026-09-20).** Al pegarla, el editor respondió `42P01 relation "_antes" does not exist` en el
  **paso 6** (la comprobación final): las escrituras de los pasos 3-5 ya estaban confirmadas y las tres tablas temporales
  `on commit drop` habían desaparecido, así que el editor **confirmó la transacción entre el paso 5 y el 6** (con el mismo
  script, el conector MCP no lo reproduce). Auditoría posterior desde afuera, solo lectura: 74 de 74 fichas idénticas a lo
  esperado campo por campo, 75 de 75 vínculos, totales 76 / 76 / 76, los 2 proveedores previos intactos, 0 con datos de pago,
  0 inactivos. **No volver a pegar** el SQL (abortaría en el paso 2 sin escribir nada).
- **Lección de diseño:** «todo-o-nada» con `begin … commit` y tablas temporales solo vale si el editor ejecuta el script como
  una transacción; no está garantizado. Las guardas previas (paso 2) sí protegieron; la comprobación posterior no pudo
  deshacer nada. La próxima carga debe ser **una sola sentencia `do $$`** (atómica por sí misma), sin depender de estado de
  sesión entre sentencias.
- **Falta:** verlo en `/proveedores` y `/productos/marcas` en el navegador (no hecho todavía).
