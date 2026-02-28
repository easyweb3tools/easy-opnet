const BACKEND_BASE_URL = (
  process.env.BACKEND_BASE_URL ??
  process.env.NEXT_PUBLIC_BACKEND_URL ??
  ""
).replace(/\/$/, "");

function copyRequestHeaders(request: Request): Headers {
  const headers = new Headers();

  for (const [key, value] of request.headers.entries()) {
    const lower = key.toLowerCase();
    if (lower === "host" || lower === "connection" || lower === "content-length") {
      continue;
    }
    headers.set(key, value);
  }

  return headers;
}

export async function proxyApiRequest(
  request: Request,
  apiPath: string,
): Promise<Response | null> {
  if (!BACKEND_BASE_URL) return null;

  try {
    const incomingUrl = new URL(request.url);
    const targetUrl = new URL(
      `${BACKEND_BASE_URL}${apiPath.startsWith("/") ? apiPath : `/${apiPath}`}`,
    );
    targetUrl.search = incomingUrl.search;

    const method = request.method.toUpperCase();
    const headers = copyRequestHeaders(request);

    let body: string | undefined;
    if (method !== "GET" && method !== "HEAD") {
      body = await request.text();
    }

    const upstream = await fetch(targetUrl, {
      method,
      headers,
      body,
      cache: "no-store",
    });

    const responseHeaders = new Headers();
    const contentType = upstream.headers.get("content-type");
    if (contentType) {
      responseHeaders.set("content-type", contentType);
    }

    return new Response(await upstream.arrayBuffer(), {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch {
    return null;
  }
}
