import "server-only";

export const EXPECTED_PIPELINE_VERSION = "opencv-v0.2";
// Serviços gratuitos podem precisar de alguns segundos para sair do modo de
// espera. A primeira requisição acorda o serviço; estas tentativas evitam que
// um cartão seja marcado como falho enquanto ele ainda está inicializando.
const HEALTH_CHECK_MAX_WAIT_MS = 75_000;
const HEALTH_CHECK_REQUEST_TIMEOUT_MS = 15_000;
const HEALTH_CHECK_RETRY_DELAYS_MS = [1_500, 3_000, 5_000, 8_000, 10_000];

export type CorrectionHealth = {
  status: "ok";
  service: string;
  pipeline_version: string;
  opencv_version: string;
};

export class CorrectionServiceError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly httpStatus: number,
  ) {
    super(message);
    this.name = "CorrectionServiceError";
  }
}

export function getCorrectionServiceConfig() {
  const rawUrl =
    process.env.CORRECTION_API_URL ??
    process.env.NEXT_PUBLIC_CORRECTION_API_URL ??
    "http://127.0.0.1:8000";
  let url: string;
  try {
    url = new URL(rawUrl).toString().replace(/\/$/, "");
  } catch {
    throw new CorrectionServiceError(
      "CORRECTION_SERVICE_CONFIGURATION_ERROR",
      "O endereço do serviço de correção é inválido.",
      503,
    );
  }
  const apiKey = process.env.CORRECTION_API_KEY;
  if (!apiKey) {
    throw new CorrectionServiceError(
      "API_NOT_CONFIGURED",
      "O serviço de correção ainda não foi configurado.",
      503,
    );
  }
  return { url, apiKey };
}

function isTimeout(error: unknown) {
  return (
    error instanceof DOMException && error.name === "TimeoutError"
  ) || (error instanceof Error && /timeout/i.test(error.message));
}

function wait(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

async function fetchCorrectionHealth(url: string) {
  return fetch(`${url}/health`, {
    cache: "no-store",
    signal: AbortSignal.timeout(HEALTH_CHECK_REQUEST_TIMEOUT_MS),
  });
}

export async function verifyCorrectionService(url: string): Promise<CorrectionHealth> {
  const deadline = Date.now() + HEALTH_CHECK_MAX_WAIT_MS;
  let retry = 0;
  let lastError: unknown = null;

  while (Date.now() < deadline) {
    try {
      const response = await fetchCorrectionHealth(url);
      if (response.ok) {
        const health = (await response.json()) as Partial<CorrectionHealth>;
        if (health.pipeline_version !== EXPECTED_PIPELINE_VERSION) {
          throw new CorrectionServiceError(
            "CORRECTION_VERSION_MISMATCH",
            "O serviço de correção precisa ser atualizado antes de processar este cartão.",
            503,
          );
        }
        return health as CorrectionHealth;
      }
      lastError = new Error(`Health check respondeu ${response.status}`);
    } catch (error) {
      if (error instanceof CorrectionServiceError) throw error;
      lastError = error;
    }

    const delay = HEALTH_CHECK_RETRY_DELAYS_MS[Math.min(retry, HEALTH_CHECK_RETRY_DELAYS_MS.length - 1)];
    retry += 1;
    if (Date.now() + delay >= deadline) break;
    await wait(delay);
  }

  if (isTimeout(lastError)) {
    throw new CorrectionServiceError(
      "CORRECTION_SERVICE_TIMEOUT",
      "O serviço de correção demorou para iniciar. Aguarde alguns segundos e tente novamente.",
      504,
    );
  }
  throw new CorrectionServiceError(
    "CORRECTION_SERVICE_UNAVAILABLE",
    "O cartão foi enviado, mas o serviço de correção está indisponível.",
    503,
  );
}

export async function callCorrectionService({
  url,
  apiKey,
  body,
}: {
  url: string;
  apiKey: string;
  body: Record<string, unknown>;
}) {
  let response: Response;
  try {
    response = await fetch(`${url}/v1/process-sheet`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(180_000),
    });
  } catch (error) {
    if (isTimeout(error)) {
      throw new CorrectionServiceError(
        "CORRECTION_SERVICE_TIMEOUT",
        "O processamento demorou mais que o esperado. Tente novamente.",
        504,
      );
    }
    throw new CorrectionServiceError(
      "CORRECTION_SERVICE_UNAVAILABLE",
      "O cartão foi enviado, mas o serviço de correção está indisponível.",
      503,
    );
  }
  const result = await response.json().catch(() => null);
  if (response.status === 401 || response.status === 403) {
    throw new CorrectionServiceError(
      "CORRECTION_SERVICE_AUTH_FAILED",
      "A autenticação interna do serviço de correção falhou.",
      502,
    );
  }
  if (!response.ok) {
    const serviceDetail = result?.detail;
    const serviceCode =
      typeof serviceDetail?.code === "string" ? serviceDetail.code : "CORRECTION_SERVICE_REJECTED";
    throw new CorrectionServiceError(
      serviceCode,
      result?.detail?.message || "O serviço de correção recusou a imagem.",
      502,
    );
  }
  return result;
}
