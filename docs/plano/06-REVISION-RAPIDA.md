# Revisión rápida — las 143 decisiones del plano maestro

> Una línea por decisión, en lenguaje de negocio. Léelo de un tirón (15-20 min) y marca en tu cabeza
> las que no coincidan con lo que recuerdas haber querido — luego dímelo y las corregimos.
> El detalle completo de cada una (el debate, el por qué, las alternativas descartadas) vive en
> `docs/plano/00-ACTA-24-DECISIONES.md` y `02` a `05-ACTA-SESION-*.md`, buscando el número PL-xx.

## Revisa esto primero — las 5 más importantes

- **PL-61** — Es el hueco de seguridad más grave de toda la auditoría (ventas/devoluciones editables desde el navegador), con fecha límite esta semana — si el criterio de aplicarlo así está mal, TRU arranca con datos reales sin ese candado.
- **PL-09** — El reparto de pájaros se corrigió en plena sesión (hubo una versión intermedia que se descartó) — es la decisión que más cambió de forma sobre la marcha, y define de quién es cada módulo durante años.
- **PL-125** — Felipe encendió Supabase Storage y asumió un costo mensual recurrente yendo explícitamente en contra de la recomendación de esperar — vale confirmar que el negocio ya lo necesita, antes de que el gasto se acumule.
- **PL-43** — Toca datos reales de las 25 personas del equipo en producción y 83 archivos de código a la vez — es la migración de mayor alcance de todo el plano, cara de revertir si algo sale mal.
- **PL-133** — Le da a la sesión de IA permiso para fusionar cambios a producción sin que Felipe los revise cuando no son transversales — es una decisión de gobierno que afecta la calidad de todo lo que se construya de aquí en adelante.

---

## Todo lo demás, por tema

### Equipo y gobierno del proyecto

- **PL-09** — Reparto final de pájaros (corregido en sesión): Benja lleva Halcón, Felipe mantiene Loro y diseña sin construir Águila, Dany lleva Colibrí, Diego lleva Pelícano, Fernanda es dueña transversal de las reglas de pantalla; Gallito y Garza quedan libres, Felipe los cubre mientras tanto.
- **PL-10** — Main queda protegido: todo cambio pasa por PR + revisión automática; solo lo transversal (esquema, permisos, menú) necesita que Felipe lo revise a mano.
- **PL-11** — El SQL a producción lo pegan Felipe y un segundo pegador nombrado, con la regla de aplicar y verificar después.
- **PL-131** — El primer módulo de la próxima persona que se sume será Gallito o Garza; Felipe los cubre mientras nadie los trabaje.
- **PL-132** — Quien se sume el día 1 tiene el mismo acceso que hoy el resto del equipo: escritura directa en la rama principal.
- **PL-133** — Un cambio no transversal con las pruebas automáticas en verde lo puede fusionar la propia sesión de IA, sin esperar a Felipe.
- **PL-134** — Cualquier sesión de IA puede corregir las instrucciones del proyecto (CLAUDE.md/AGENTS.md) por su cuenta, sin pedir permiso antes.
- **PL-135** — Queda un solo documento oficial de instrucciones (CLAUDE.md); el otro se reduce a un puntero de 3 líneas.
- **PL-136** — El tablero de sesiones activas se refuerza para que de verdad se lea al abrir cada sesión de trabajo.
- **PL-137** — Si dos sesiones chocan en los mismos archivos, se avisan en el PR o el tablero y solo siguen si de verdad no se pisan.
- **PL-138** — No hay límite fijo sobre los archivos más disputados; cada sesión avisa sola si nota a otra tocando lo mismo.
- **PL-139** — El tablero de sesiones se limpia solo: marca 'posiblemente cerrada' la fila cuya rama ya no exista.
- **PL-130** — El mentor de la próxima persona que se sume es Felipe o Dany, por tener más contexto acumulado.
- **PL-128** — El manual de bienvenida al equipo, hoy desactualizado, se reescribe ya, antes de que llegue alguien nuevo.
- **PL-129** — El camino principal para instalar el ambiente de trabajo pasa a ser sin Docker (más estable); Docker queda como alternativa.
- **PL-140** — Los documentos de historial del proyecto (backlog y bitácora), hoy enormes, se recortan: lo viejo se archiva y arrancan versiones cortas.
- **PL-141** — El examen de comprensión, hoy solo para Felipe, se extiende a todo el equipo al cerrar su propio módulo.
- **PL-142** — Se crea la sección 'conceptos pendientes de enseñar' que estaba prometida pero nunca se escribió.
- **PL-143** — El examen se toma al cerrar cada módulo, rápido e informal; si encuentra un hueco se corrige en la marcha, nunca frena el cierre.

### Permisos y roles en el sistema

- **PL-27** — Nace el rol Compras: da de alta proveedores, registra compras y pagos, pero no cierra caja ni ve otras sedes.
- **PL-48** — El nivel de permiso más alto se llama 'Admin' (no 'Dueño') y sigue siendo lista propia de retail, nunca heredada del sistema de RR.HH.
- **PL-83** — El rol Admin se construye ya en la base de datos, antes de sumar más pantallas que hoy solo distinguen líder de equipo/integrante.
- **PL-88** — Se mantienen los 4 niveles de permiso definidos, aunque el contador todavía no use el de solo lectura.
- **PL-89** — A los líderes de equipo con acceso a todas las sedes se les recorta a solo su sede, en la primera semana después del lanzamiento de TRU, con fecha fijada de antemano.
- **PL-90** — Cubrir temporalmente otra sede pasa a tener vencimiento automático, con lista visible de quién cubre dónde.
- **PL-92** — Una colaboradora dada de baja ya no puede seguir vendiendo — ya está resuelto en el sistema, solo falta corregir la documentación.
- **PL-96** — Subir o bajar a alguien de rol deja de ser una edición manual en la base y pasa a quedar registrado quién lo hizo y cuándo.
- **PL-107** — Subir o bajar a alguien a Líder de equipo se hace desde una pantalla (no desde SQL), visible solo para Felipe, con confirmación e historial.
- **PL-91** — Tope de descuento en una venta: Integrante hasta 5%, Líder de equipo hasta 15%, y 'liquidación' sin tope pero con motivo obligatorio.
- **PL-94/95** — Cada dueño de módulo pega el SQL de su propio módulo y también ve todo el negocio como Admin; toda aplicación de SQL queda registrada dos veces (tabla y PR).
- **PL-86** — Dany se suma como la segunda persona autorizada a pegar SQL en producción, junto a Felipe.
- **PL-87** — Antes de pegar SQL en producción es obligatorio: ensayarlo en una base de prueba, revisarlo con una consulta de solo lectura, y dejar registro de qué y cuándo.
- **PL-93** — La revisión de qué botón del menú esconde una tabla sin candado real se hace primero a mano, completa, y después se automatiza.

### Seguridad de los datos — huecos cerrados o por cerrar

- **PL-61** — El candado de ventas y devoluciones (el hueco más grave de toda la auditoría) se aplica en producción esta semana, antes de que TRU opere con datos reales.
- **PL-84** — El corazón de la venta todavía se puede escribir directo desde el navegador sin pasar por el sistema — se rescata el arreglo ya construido y se aplica esta semana.
- **PL-85** — Clientas, conteos de inventario y lotes tienen el mismo hueco que la venta, y se cierran en el mismo paquete.
- **PL-78** — La venta no puede sacar mercadería que esté en la sububicación 'Cuarentena'.
- **PL-79** — Una misma clienta no puede quedar duplicada entre tiendas — se cierra con un candado sobre su número de documento.
- **PL-81** — Todo movimiento de inventario debe indicar una sola razón de origen (venta, compra, producción o cambio), nunca dos a la vez ni ninguna.
- **PL-77** — No se construye candado contra sububicaciones duplicadas por tienda; Felipe acepta el riesgo confiando en que solo el alta oficial de sede las crea.

### Ventas y caja

- **PL-28** — El saldo o vale de una clienta se maneja aparte del comprobante fiscal — usable en cualquier compra futura, con o sin comprobante.
- **PL-29** — Anular una venta solo se permite el mismo día calendario y con la caja todavía abierta.
- **PL-37** — Cada tienda tiene un tope de efectivo en caja definido por Felipe, con aviso cuando el efectivo del día lo supera.
- **PL-40** — Se construye la caja 'offline': abrir y cerrar caja sin internet, sobre el mismo mecanismo que ya protege la venta.
- **PL-49** — Los 4 nombres actuales del módulo de venta quedan como están (técnico interno vs. 'Ventas'/'Punto de Venta' de cara al negocio).

### Compras y proveedores

- **PL-30** — Un pago en efectivo a proveedor de S/2,000 a más solo genera un aviso al registrarlo — nunca lo bloquea.
- **PL-31** — Una orden de compra que llega incompleta se cierra con un botón 'Cerrar con faltante', confirmado por el líder de equipo.
- **PL-32** — Reversar un pago a proveedor mal registrado lo hace solo el líder de equipo, con motivo obligatorio; el original nunca se borra.
- **PL-33** — El estado 'confirmada' de una orden de compra se empieza a usar de verdad: el proveedor confirma antes de que llegue la mercadería.
- **PL-34** — El RUC del proveedor se valida contra el padrón oficial y autocompleta, pero se puede guardar sin RUC si hace falta.
- **PL-123** — Felipe confirma en Vercel la variable que activa la validación de RUC de proveedores.
- **PL-124** — Si se agota la cuota del servicio que valida RUC, se acepta escribir el nombre del proveedor a mano — es diseño a propósito.
- **PL-38** — Quedan cerradas las categorías de gasto: rubros de compra más gastos del día a día, sin reabrir todo Contabilidad.

### Finanzas, contabilidad y bancos

- **PL-08** — Contabilidad completa (partida doble, libros, estados financieros) y el canal online quedan como pendientes con dueño, sin construirse todavía.
- **PL-35** — Interbank y BCP quedan confirmadas como las 2 cuentas reales, destino de todo cobro electrónico; falta definir cuál es Operativa y cuál Reserva.
- **PL-36** — Las herramientas del Taller (tijeras, abre ojal, etc.) se registran simplemente como gasto al comprarlas.
- **PL-39** — 'Eficiencia' del Taller se define como tela realmente usada frente a lo que Audaces decía que debía usarse.
- **PL-72** — El estado de resultados por sede se construye ya como resumen de lectura, sin ser todavía un libro contable auditable.
- **PL-73** — Se construye un cierre de mes simple: una tabla que bloquea registrar gastos o ventas en un período ya cerrado.
- **PL-74** — El método de costeo queda confirmado en costo promedio ponderado — ya corre en producción, solo el acta estaba desactualizada.

### Facturación electrónica (SUNAT, Lucode, Alegra)

- **PL-113** — El reintento automático de comprobantes atascados ante SUNAT corre solo cada 5-10 minutos; tras varias horas sin transmitir, avisa al líder de equipo.
- **PL-114** — Ese aviso de comprobante atascado aparece dentro del propio sistema (banner al entrar), igual que las campañas de descuento.
- **PL-115** — El alta de facturación electrónica ante SUNAT ya está funcionando; si Lucode falla, Alegra sigue de respaldo.
- **PL-116** — Las 2 boletas de prueba que ya quemaron su número ante SUNAT quedan como están, sin transmitirse; Felipe las limpia cuando corresponda.
- **PL-117** — La nota de débito de Lucode se prueba esta semana en el ambiente de pruebas, por las dudas, aunque hoy no se use.
- **PL-118** — Si Lucode no responde en 15 segundos durante una venta, el sistema avisa claro que la venta ya se guardó y se transmite después.
- **PL-119** — La resolución de autorización de facturación electrónica se completa en el sistema antes del primer comprobante real.
- **PL-126** — Si Alegra (el respaldo de facturación) se cae en pleno cobro, esa venta se emite directo desde retail, sin esperarlo.

### Qué pasa si algo externo falla

- **PL-120** — Si Dynamic o la base de datos caen por completo, se acepta vender en papel/manual hasta que vuelvan; cada líder de equipo debe conocer ese plan B (todavía no está escrito).
- **PL-121** — Si el sistema de RR.HH. no responde, los nombres en Caja/Compras se muestran como 'integrante' genérico en vez de caerse la pantalla completa.
- **PL-69** — El punto único de conexión con Dynamic siempre asume que existe un Dynamic del otro lado — no se diseña un modo 'sin RR.HH. externo' para una futura marca.

### Vocabulario que usa el sistema

- **PL-41** — 'Sede' gana sobre 'Ubicación' en toda pantalla que ve un integrante.
- **PL-42** — 'Integrante' gana sobre 'Colaborador' en toda pantalla.
- **PL-43** — El valor interno 'colaborador' se migra a 'integrante' en los datos reales de las 25 personas, y se corrigen los archivos de código que aún usan el nombre viejo.
- **PL-44** — 'Sede' incluye al Taller; 'tienda' se reserva solo para las 3 que venden al público.
- **PL-45** — Los códigos internos de Dynamic (como LIM/003) nunca se muestran a un integrante — aparecen como 'Tienda Lima' o 'Taller' completos.
- **PL-46** — La Oficina de Trujillo (OTRU) no forma parte del vocabulario de retail; solo se documenta en el contrato con Dynamic.
- **PL-47** — 'Encargada' se corrige a 'Líder de equipo' en todo el material, incluidas las guías de mostrador.
- **PL-50** — 'Comprobante'/'Nota de crédito' quedan exclusivos de Ventas; Compras pasa a 'Factura de proveedor'/'Nota de crédito de proveedor' y el Taller a 'Factura de insumos'.
- **PL-51** — 'Cambiar de sede' es el verbo fijo, tanto al cambiar de tienda como en el aviso de sesión.
- **PL-52** — La palabra 'unidad' de la versión anterior no vuelve a aparecer; todo usa 'sede'.
- **PL-53** — 'Fábrica' como sinónimo del Taller se elimina por completo, incluso con proveedores.

### Inventario, traslados y stock

- **PL-06** — El censo físico formal del inventario (que fija el saldo inicial oficial) va después del lanzamiento de TRU; mientras tanto, cualquier diferencia entra como ajuste, nunca reescribiendo una venta ya hecha.
- **PL-25** — El flete de un traslado entre sedes siempre lo paga la tienda que recibe.
- **PL-26** — El umbral de 'producto estancado' arranca en un solo número para todo el catálogo: 30 días sin moverse.
- **PL-71** — Se agrega la sede corporativa (CCO) como un tipo más de ubicación, con el mismo patrón usado para el Taller.
- **PL-75** — El costo de una prenda pasa a verse solo por el líder de equipo — hoy lo ve cualquier sesión iniciada.
- **PL-76** — De los 4 módulos sin tabla propia, solo el de inteligencia de compra/venta (Águila) se diseña ya, por ser el más ligado a la meta de Felipe a 3 años; los otros 3 siguen en pausa.

### Diseño de pantalla y experiencia de uso

- **PL-97** — Los 7-8 cajones/paneles que hoy reinventan su propia ventana emergente se migran todos al componente oficial de modal.
- **PL-98** — Se pone un tope máximo al uso del color rojo por pantalla, verificado automáticamente.
- **PL-99** — El contraste de los textos se verifica automáticamente contra los colores oficiales.
- **PL-100** — La cabecera común de pantalla pasa a ser obligatoria en todas partes — hoy solo la usan 4 de 52 pantallas.
- **PL-101** — El modo oscuro sigue sin construirse por ahora; queda como fase futura sin fecha, después del lanzamiento.
- **PL-102** — Ante una contradicción de estilos, manda el archivo que ya está en uso real (globals.css), no el que quedó a medias.
- **PL-103** — Se escribe un manual corto, con un ejemplo real, de los 4 moldes de pantalla: listado, formulario, modal, cajón.
- **PL-104** — La prueba de 'persona sin contexto técnico' se sigue haciendo después de fusionar el cambio, no antes — no frena la entrega.
- **PL-106** — Si una pantalla está vacía pero hay algo que se puede hacer ahí, siempre ofrece esa acción directamente.
- **PL-108** — Regla fija para abrir un detalle: con su propia dirección web cuando se comparte o recarga, como modal simple cuando solo vive dentro del flujo.
- **PL-111** — Todo mensaje de error sigue un mismo tono: neutro en género, dice qué hacer ahora, nunca menciona algo técnico.
- **PL-112** — El ícono de ayuda se separa del ícono de alerta — la alerta queda exclusiva para avisos reales.
- **PL-105** — Probar que la pantalla se ve bien en celular es obligatorio solo para Vender/Cambios/Devoluciones; Caja y Almacén son de escritorio.

### Auditoría de pantallas y calidad

- **PL-109** — La revisión pantalla por pantalla avanza según cuánto dinero o stock mueve cada una, empezando por Vender, Caja y Compras.
- **PL-110** — Los 3 análisis de pantalla en ramas sin fusionar (Caja, historial de ventas, uno más) se rescatan pero se revisan de nuevo a fondo contra el código de hoy.

### Integración con Dynamic (RR.HH.)

- **PL-54** — Toda llamada a Dynamic pasa por un único punto fijo en el código — nadie más se conecta por su cuenta.
- **PL-55** — Un chequeo automático evita que una migración nueva toque las tablas de Dynamic fuera de lo permitido.
- **PL-56/57** — De las 3 tablas que parecían huérfanas, 2 ya tienen hogar en el sistema actual; solo faltaba el tipo 'corporativo' para archivar esa carpeta vieja.
- **PL-58** — Las funciones que corren en producción sin copia en el repositorio se reconstruyen leyendo directo la base real.
- **PL-59** — Regla fija para leer datos de Dynamic: vista simple para sumas/montos, función con permiso especial cuando hay que filtrar por persona.
- **PL-60** — El documento de la integración con Dynamic se corrige solo en la parte de 'planilla por sede' (decía que no existía y ya está en producción).
- **PL-62** — Para que una decisión de arquitectura no quede olvidada en una rama, se hace un barrido cada dos semanas con dueño asignado.
- **PL-66** — El documento de una página que resume el contrato con Dynamic lo escribe y mantiene Felipe.
- **PL-67** — Se construye una prueba automática que avisa si Dynamic cambia su estructura sin avisar.
- **PL-68** — Las ~53 conexiones ya existentes hacia Dynamic quedan fuera del nuevo candado — se documentan aparte como el costo ya asumido; el candado solo frena conexiones nuevas.

### Almacenamiento de archivos

- **PL-125** — Felipe enciende ya el almacenamiento de archivos (fotos de producto, adjuntos de compra), asumiendo el costo mensual desde ahora, contra la recomendación de esperar.

### Frentes en investigación (sin construir aún)

- **PL-127** — Pago con tarjeta/POS y venta por canal online quedan solo en investigación bajo Dany, sin construirse todavía.
