# Prueba ciega — cómo se comprueba la ley 1 («sin manual»)

**Principio:** se observa lo que la persona **hace**, no lo que opina. «¿Te gusta?» no es evidencia: lo que la gente dice y lo que hace difieren
(es la lección de Jobs contra los focus groups, Isaacson). Se mide dónde duda, dónde se equivoca y qué pregunta.

Dos pasadas, en este orden. La primera es barata y repetible; la segunda es la verdad.

## Pasada 1 — agente ciego (Observado)

Se lanza con `Agent` (`general-purpose`) y un prompt que **solo** contiene lo que vería una colaboradora el primer día:

```
Eres una colaboradora de una tienda de ropa. Hoy es tu primer día con este sistema y nadie te lo explicó.
Abre <URL local o la captura>. NO leas archivos del repositorio, ni código, ni documentación, ni busques en la web: solo lo que ves en la pantalla.
Tu tarea: <una frase en lenguaje de tienda, p. ej. «Averigua qué prendas llevan mucho tiempo colgadas sin venderse y decide qué hacer con una»>.

Mientras lo haces, anota SIN que te lo pidan:
 1. A los 5 segundos de abrir: qué crees que es esta pantalla y qué crees que sigue.   (escríbelo antes de tocar nada)
 2. Cada paso que das (qué tocaste y por qué).
 3. Cada vez que dudaste, y sobre qué palabra o elemento.
 4. Cada palabra que no entendiste, y cómo la interpretaste.
 5. Cada cosa que tocaste y no hizo lo que esperabas.
 6. Si terminaste la tarea y cómo sabes que quedó bien.
No opines si te gusta ni sugieras diseños. Solo cuenta qué hiciste y qué entendiste.
```

**Reglas que hacen válida la prueba**
- La tarea se escribe con **palabras de tienda**, nunca con los nombres del código ni de la pantalla («frescura», «ficha de rotación»).
- El agente **no tiene** el repo: si lo lee, la prueba se anula y se repite. Dilo al lanzarlo y revisa su transcripción.
- Un agente, una tarea, una pantalla: no se le pide opinar de varias cosas a la vez.
- Para el modal o la pantalla con datos, usa el local con datos inventados (`/flujo-de-negocio` ya sabe armarlo); **nunca producción**.

**Qué se registra (la tabla del informe)**

| Medida | Cómo | Pasa si |
|---|---|---|
| Lectura de 5 s | ¿su frase del punto 1 coincide con la finalidad real? | coincide en lo esencial |
| Primer intento | ¿completó la tarea sin retroceder ni pedir ayuda? | sí |
| Pasos | cuántos toques hasta terminar | no más del mínimo + 1 |
| Dudas | ¿en qué palabra o elemento? | cada una es un hallazgo de ley 3, 4 o 9 |
| Palabras no entendidas | lista | cero |
| Errores evitables | tocó algo que no quería | cero |

## Pasada 2 — colaboradora real (Observado, la que decide)

El agente puede dar **falsa seguridad**: un modelo no es una persona en el piso con una clienta delante. Por eso la nota de «sin manual» de una
pantalla nunca llega a 10 sin esta pasada: queda **«ciega: pasa · real: sin probar»**.

- **3 a 5 personas** de distintas sedes (Nielsen y Landauer, 1993: con unas 5 aparece ~85 % de los problemas de uso; **Reportado**, cifra a tomar como orden de magnitud).
- Quien observa **no ayuda ni explica**, aunque la persona se trabe; solo anota. Si pregunta «¿qué es esto?», eso es el hallazgo.
- Misma tarea escrita en lenguaje de tienda; cronómetro simple; hoja con las seis medidas de arriba.
- Se prueba en **el equipo real** (Mac mini o computador de la tienda, con su mouse y su teclado), no en el de Felipe.
- Resultado en 10 minutos: no es un estudio, es mirar dónde se atora una persona.

## Aprendido en el piloto (Frescura del piso, 2026-10-05)
1. **Exige un formato y compruébalo.** El ciego con Haiku narró en tercera persona, mezcló conclusiones («el negocio es muy nuevo») con observaciones y no entregó
   pasos numerados ni conteos: evidencia débil, que el escéptico tuvo que desmontar (afirmó que una cifra era un botón; era un dato). Si el informe no trae
   las seis medidas de la tabla, la prueba **no cuenta** como Observado: se repite. Prefiere Sonnet u Opus; Haiku solo si el prompt exige pasos y conteos.
2. **Un filtro de seguridad de la API frenó al primer ciego** (Sonnet, error `reasoning_extraction`, falso positivo). Se relanza una vez; si repite, cambia el modelo y anótalo.
3. **El entorno decide qué se prueba.** La base local de semilla tenía 4 prendas, ninguna «Envejecida» y le faltaban migraciones, así que el ciego no pudo
   siquiera llegar a la decisión que la pantalla existe para tomar. **Antes de lanzar al ciego, verifica que la tarea es alcanzable con los datos** (siembra
   prendas de varios estados, o usa un entorno que las tenga); si no, la prueba mide el entorno y no la pantalla.
4. Un dato que parece botón (cifra con aspecto de control) es hallazgo de la ley 1; un dato que el ciego solo *interpretó* como botón sin serlo, no es defecto de código. Distínguelos.

## Lo que esta prueba NO hace
No decide gusto ni estética (eso es «oficio visual», que se mide), no valida reglas de negocio y no reemplaza el criterio de Felipe sobre qué hace CAYLA.
