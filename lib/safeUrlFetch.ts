import dns from "node:dns/promises";
import net from "node:net";

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_BYTES = 2_000_000;
const DEFAULT_ALLOWED_CONTENT_TYPES = [
  "text/html",
  "text/plain",
  "application/xhtml+xml",
  "application/json",
];

export interface SafeFetchResult {
  body: Uint8Array;
  contentType: string;
  url: URL;
}

function ipToIpv4Number(ip: string): number {
  return ip
    .split(".")
    .map((part) => Number(part))
    .reduce((accumulator, part) => (accumulator << 8) + part, 0);
}

function isIpv4InRange(ip: string, base: string, prefixLength: number): boolean {
  const value = ipToIpv4Number(ip);
  const baseValue = ipToIpv4Number(base);
  const mask =
    prefixLength === 0 ? 0 : (0xffffffff << (32 - prefixLength)) >>> 0;

  return (value & mask) === (baseValue & mask);
}

export function isPrivateOrLocalIp(ip: string): boolean {
  const family = net.isIP(ip);

  if (family === 4) {
    return (
      isIpv4InRange(ip, "0.0.0.0", 8) ||
      isIpv4InRange(ip, "10.0.0.0", 8) ||
      isIpv4InRange(ip, "127.0.0.0", 8) ||
      isIpv4InRange(ip, "169.254.0.0", 16) ||
      isIpv4InRange(ip, "172.16.0.0", 12) ||
      isIpv4InRange(ip, "192.168.0.0", 16) ||
      isIpv4InRange(ip, "224.0.0.0", 4) ||
      ip === "255.255.255.255"
    );
  }

  if (family === 6) {
    const normalized = ip.toLowerCase();
    return (
      normalized === "::" ||
      normalized === "::1" ||
      normalized.startsWith("fe80:") ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("ff")
    );
  }

  return true;
}

async function assertNoPrivateDnsResolution(hostname: string): Promise<void> {
  const records = await dns.lookup(hostname, { all: true, verbatim: true });

  if (records.length === 0) {
    throw new Error("No se pudo resolver el dominio.");
  }

  for (const record of records) {
    if (isPrivateOrLocalIp(record.address)) {
      throw new Error("La URL apunta a una red local o privada no permitida.");
    }
  }
}

export async function assertSafePublicHttpUrl(rawUrl: string): Promise<URL> {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(rawUrl);
  } catch {
    throw new Error("URL no válida.");
  }

  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    throw new Error("Solo se aceptan URLs http o https.");
  }

  if (!parsedUrl.hostname) {
    throw new Error("URL no válida.");
  }

  const hostname = parsedUrl.hostname.trim().toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".localhost")) {
    throw new Error("No se permiten hosts locales.");
  }

  if (net.isIP(hostname)) {
    if (isPrivateOrLocalIp(hostname)) {
      throw new Error("La URL apunta a una IP local o privada no permitida.");
    }
    return parsedUrl;
  }

  await assertNoPrivateDnsResolution(hostname);
  return parsedUrl;
}

function ensureAllowedContentType(
  contentTypeHeader: string,
  allowedContentTypes: string[],
): void {
  const contentType = contentTypeHeader.toLowerCase();
  if (
    !allowedContentTypes.some((allowedType) =>
      contentType.includes(allowedType),
    )
  ) {
    throw new Error("El contenido remoto no es un tipo soportado.");
  }
}

async function readLimitedBytes(
  response: Response,
  maxBytes: number,
): Promise<Uint8Array> {
  const reader = response.body?.getReader();
  if (!reader) {
    return new Uint8Array(await response.arrayBuffer());
  }

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    totalBytes += value.byteLength;
    if (totalBytes > maxBytes) {
      await reader.cancel();
      throw new Error(
        "La respuesta es demasiado grande para procesarse automáticamente.",
      );
    }

    chunks.push(value);
  }

  const result = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return result;
}

export async function fetchContentFromPublicUrl(
  rawUrl: string,
  options: {
    timeoutMs?: number;
    maxBytes?: number;
    allowedContentTypes?: string[];
  } = {},
): Promise<SafeFetchResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const allowedContentTypes =
    options.allowedContentTypes ?? DEFAULT_ALLOWED_CONTENT_TYPES;
  const url = await assertSafePublicHttpUrl(rawUrl);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      headers: {
        "user-agent": "DossieresBAT Planning Extractor/1.0",
        accept: allowedContentTypes.join(","),
      },
      cache: "no-store",
      redirect: "manual",
      signal: controller.signal,
    });

    if (response.status >= 300 && response.status < 400) {
      throw new Error(
        "La URL redirige a otra ubicación y no se procesa automáticamente.",
      );
    }

    if (!response.ok) {
      throw new Error(`No se pudo descargar la URL (${response.status}).`);
    }

    const contentType = response.headers.get("content-type") ?? "";
    ensureAllowedContentType(contentType, allowedContentTypes);

    const contentLength = response.headers.get("content-length");
    if (contentLength && Number(contentLength) > maxBytes) {
      throw new Error(
        "La respuesta es demasiado grande para procesarse automáticamente.",
      );
    }

    return {
      body: await readLimitedBytes(response, maxBytes),
      contentType,
      url,
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("La descarga de la URL superó el tiempo máximo permitido.");
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchTextFromPublicUrl(
  rawUrl: string,
  options: {
    timeoutMs?: number;
    maxBytes?: number;
    allowedContentTypes?: string[];
  } = {},
): Promise<{ text: string; contentType: string; url: URL }> {
  const result = await fetchContentFromPublicUrl(rawUrl, options);
  return {
    text: new TextDecoder().decode(result.body),
    contentType: result.contentType,
    url: result.url,
  };
}
