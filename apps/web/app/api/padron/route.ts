import { createClient } from "@/lib/supabase/server";
import { soloDigitos, validarDocumento } from "@cayla-retail/shared";
import { advertenciasDe, consultarPadron, type DatosPadron, type RespuestaPadron } from "@/lib/padron";

// GET /api/padron?tipo=dni|ruc&numero=XXXXXXXX
//
// CONTRATO
//   PROMETE: para un documento válido, devolver siempre 200 con la mejor
//            identidad disponible y de DÓNDE salió, aunque no haya podido
//            consultar nada. "No pude averiguarlo" es una respuesta normal
//            del negocio, no un error del sistema.
//   ASUME:   sesión de Supabase válida en la cookie.
//   NO HACE: no guarda nada, no decide si se puede emitir el comprobante.
//
// POR QUÉ ESTA RUTA EXISTE Y EL NAVEGADOR NO LLAMA AL PADRÓN DIRECTO:
// el token del padrón se paga por consulta. Si viajara al navegador, cualquiera
// con la consola abierta lo copia y consume la cuota de CAYLA. Aquí el token
// nunca sale del servidor.

// Freno de mano contra un bucle desbocado (un `useEffect` mal escrito puede
// gastar la cuota del mes en un minuto). Es por instancia del servidor, así que
// no es un candado sino un tope razonable: 60 consultas por minuto por persona
// es muchísimo más de lo que se factura en una sede en una hora.
const TOPE_POR_MINUTO = 60;
const contador = new Map<string, { desde: number; usos: number }>();

function excedeTope(personaId: string): boolean {
  const ahora = Date.now();
  const actual = contador.get(personaId);
  if (!actual || ahora - actual.desde > 60_000) {
    contador.set(personaId, { desde: ahora, usos: 1 });
    return false;
  }
  actual.usos += 1;
  return actual.usos > TOPE_POR_MINUTO;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const tipo = searchParams.get("tipo");
  const numero = soloDigitos(searchParams.get("numero") ?? "");

  if (tipo !== "dni" && tipo !== "ruc") {
    return Response.json({ error: "tipo debe ser dni o ruc" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "No autorizado" }, { status: 401 });

  const { data: persona } = await supabase.from("personas").select("id").eq("auth_user_id", user.id).single();
  if (!persona?.id) return Response.json({ error: "Sin persona vinculada" }, { status: 403 });

  // Se revalida en el servidor aunque el formulario ya lo haya hecho: la
  // validación del navegador es una cortesía para quien tipea, nunca una
  // garantía. Además evita gastar una consulta pagada en un número imposible.
  const validacion = validarDocumento(tipo, numero);
  if (!validacion.valido) {
    return Response.json({ error: validacion.motivo }, { status: 400 });
  }

  if (excedeTope(persona.id)) {
    return Response.json({ error: "Demasiadas consultas seguidas. Espera un minuto." }, { status: 429 });
  }

  // 1) Memoria propia primero: si a este documento ya se le emitió un
  //    comprobante, el nombre está en casa — gratis, instantáneo y disponible
  //    aunque el padrón esté caído. RLS decide qué comprobantes ve cada quien.
  const { data: previo } = await supabase
    .from("comprobantes")
    .select("cliente_nombre")
    .eq("cliente_num_doc", numero)
    .not("cliente_nombre", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // 2) Padrón oficial. Refina o confirma lo anterior; para RUC además trae
  //    estado y condición, que cambian con el tiempo y no se pueden cachear
  //    en el historial.
  const consulta = await consultarPadron(tipo, numero);

  if (consulta.ok) {
    const datos: DatosPadron = consulta.datos;
    const respuesta: RespuestaPadron = {
      tipo,
      numero,
      nombre: datos.nombre,
      estado: datos.estado,
      condicion: datos.condicion,
      direccion: datos.direccion,
      fuente: "padron",
      advertencias: advertenciasDe(datos),
      motivo: null,
    };
    return Response.json(respuesta);
  }

  if (previo?.cliente_nombre) {
    const respuesta: RespuestaPadron = {
      tipo,
      numero,
      nombre: previo.cliente_nombre,
      estado: null,
      condicion: null,
      direccion: null,
      fuente: "historial",
      advertencias: [],
      motivo: null,
    };
    return Response.json(respuesta);
  }

  const respuesta: RespuestaPadron = {
    tipo,
    numero,
    nombre: null,
    estado: null,
    condicion: null,
    direccion: null,
    fuente: "ninguna",
    advertencias: [],
    motivo: consulta.detalle,
  };
  return Response.json(respuesta);
}
