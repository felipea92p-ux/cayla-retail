import { requirePersonaActual } from "@/lib/persona";
import { ErrorDeLectura, leerArchivo, leerGoogleSheets, MAX_BYTES } from "@/lib/importacion/leer-archivo";
import { leerDocumento } from "@/lib/importacion/leer-documento";

// POST /api/importacion/leer
//   multipart con `archivo`  → .xlsx / .csv (carril determinista, sin IA)
//                            → .pdf / .jpg / .png / .webp (carril del modelo)
//   JSON con { url }         → una hoja de Google Sheets
//
// CONTRATO
//   PROMETE: devolver las filas TAL COMO ESTABAN, sin convertir nada, y una
//            sugerencia de en qué fila está la cabecera. Los dos carriles
//            terminan en la MISMA tabla — de ahí en adelante nada sabe de
//            dónde vino.
//   ASUME:   sesión válida y rol de Líder (importar un catálogo es suyo).
//   NO HACE: no toca la base, no guarda el archivo.
//
// DOS CARRILES, UNA SALIDA. Excel y CSV se leen con código: gratis y exacto. PDF
// y foto no tienen parser, así que los transcribe el modelo: cuesta (~2.000
// tokens por página) y puede leer mal un manuscrito. La respuesta lo dice
// (`transcrito: true`, `uso`, `notas`) para que la pantalla avise que hay que
// mirar con más cuidado — no para esconder la diferencia.

const EXT_DOCUMENTO = new Set(["pdf", "jpg", "jpeg", "png", "webp", "gif"]);

export async function POST(request: Request) {
  const persona = await requirePersonaActual();
  if (persona.rol !== "lider") {
    return Response.json({ error: "Solo un Líder puede importar un catálogo." }, { status: 403 });
  }

  try {
    const tipo = request.headers.get("content-type") ?? "";

    if (tipo.includes("application/json")) {
      const { url } = (await request.json()) as { url?: string };
      if (!url) return Response.json({ error: "Falta el enlace de la hoja." }, { status: 400 });
      return Response.json(await leerGoogleSheets(url));
    }

    const form = await request.formData();
    const archivo = form.get("archivo");
    if (!(archivo instanceof File)) {
      return Response.json({ error: "No llegó ningún archivo." }, { status: 400 });
    }
    // Se comprueba antes de leerlo entero a memoria: un archivo de 500 MB no
    // debería llegar a `arrayBuffer()` para recién ahí ser rechazado.
    if (archivo.size > MAX_BYTES) {
      return Response.json(
        { error: `El archivo pesa ${(archivo.size / 1024 / 1024).toFixed(1)} MB y el máximo son ${MAX_BYTES / 1024 / 1024} MB.` },
        { status: 413 }
      );
    }

    const ext = archivo.name.toLowerCase().split(".").pop() ?? "";
    if (EXT_DOCUMENTO.has(ext)) {
      if (!process.env.ANTHROPIC_API_KEY) {
        return Response.json(
          { error: "Leer PDF o fotos necesita el modelo, y falta ANTHROPIC_API_KEY. Excel y CSV siguen funcionando." },
          { status: 503 }
        );
      }
      const { tabla, notas, uso } = await leerDocumento(await archivo.arrayBuffer(), archivo.name);
      return Response.json({ ...tabla, transcrito: true, notas, uso });
    }

    // La hoja que eligió la persona, cuando el libro tiene varias y la de más
    // filas no era la buena (SINATRA: 20 pestañas, y la grande era "Gastos").
    const hoja = form.get("hoja");
    return Response.json(
      await leerArchivo(await archivo.arrayBuffer(), archivo.name, typeof hoja === "string" && hoja ? hoja : undefined)
    );
  } catch (e) {
    // ErrorDeLectura ya trae un mensaje escrito para quien lo va a leer en
    // pantalla, con la salida incluida ("guárdalo como CSV y vuelve a subirlo").
    // Cualquier otra cosa es un fallo nuestro y no se disfraza de consejo.
    if (e instanceof ErrorDeLectura) return Response.json({ error: e.message }, { status: 422 });
    const crudo = e instanceof Error ? e.message : "error desconocido";
    if (crudo.includes("credit balance")) {
      return Response.json({ error: "La cuenta de Anthropic se quedó sin saldo. Excel y CSV siguen funcionando." }, { status: 402 });
    }
    return Response.json({ error: `No se pudo leer el archivo: ${crudo}` }, { status: 500 });
  }
}
