## 2026-10-05 (¿Necesita CAYLA un algoritmo de inventario? Investigación y diseño del motor de demanda)
Qué hice: crucé tres fuentes. Primero, los datos vivos de producción, solo de lectura: 6 días de ventas y el 82 % de las unidades
vendidas como «venta sin registrar»; TRU va en 54 % de venta identificada y AQP en 0 %. Segundo, un mapa de la lógica de decisión que
ya existe: el motor del piso, Frescura, Análisis y Producción, más dos piezas huérfanas (`planDeReposicion` y la señal para el Taller).
Tercero, lo que hacen Zara, Shein, Target, H&M, Nextail y otros, con fuentes. Con eso escribí el diseño de un solo motor de demanda en
cuatro capas, con etapas que se abren por una condición de los datos y no por fecha:
`docs/investigacion/2026-10-05-algoritmo-de-inventario.md`.
Por qué así: el problema no es que falte un algoritmo. Hay varios con varas distintas y no hay datos para ninguno; todas las empresas
que lo hacen bien pusieron primero la verdad del stock y pronostican por categoría, no por prenda.
Felipe decidió: una sede habla desde el 90 % de venta identificada sostenido 14 días; no hay historia fuera del ERP, así que compras
espera una temporada limpia y diciembre se compra con una hoja de supuestos; deciden encargado de sede, Compras y líder, cada uno
desde el módulo donde vive la sugerencia. Sin código ni migración todavía.

## 2026-10-05 (Motor de demanda, etapa 0: «¿El sistema ya puede recomendar?» en CAYLA Global, ADR-0346)
Qué hice: agregué una función de lectura, `fn_motor_demanda_preparacion`, que cuenta por tienda y por día de Lima las unidades
vendidas y cuántas tienen su prenda, y trae el último cuadre del piso y si el almacén ya tuvo su conteo de arranque. La regla vive
en `lib/motor-demanda-reglas.ts`: 90 % sostenido 14 días cerrados; un día sin ventas no corta la racha y una venta regularizada
después cuenta en el día en que se cobró. CAYLA Global muestra una tarjeta por tienda con su veredicto, las tres condiciones y la
racha en 14 marcas. Las pruebas pasan: SQL 12/12 y vitest 19/19. Lo vi funcionando en el navegador local.
Por qué así: la base cuenta y la web decide, para que la regla quede en un solo lugar con su prueba; la racha se recalcula en cada
lectura porque la regularización cambia días pasados.
Felipe se lleva: pegar `20261005210000_motor_demanda_preparacion.sql` en producción (una sola parte, sin políticas). Hasta
entonces, esa sección de CAYLA Global dice que no se pudo leer. La sesión de Inventario ▸ Tareas (ADR-0345) conectará la misma
frase en su columna «Sugerencias».
