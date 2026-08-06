const BACKEND_URL = process.env.BACKEND_INTERNAL_URL ?? "http://backend:8000";

type RouteContext = {
  params: Promise<{ path: string[] }>;
};

async function proxy(request: Request, context: RouteContext) {
  const params = await context.params;
  const sourceUrl = new URL(request.url);
  const targetPath = params.path.join("/");
  const targetUrl = `${BACKEND_URL}/${targetPath}${sourceUrl.search}`;
  const body = request.method === "GET" || request.method === "HEAD"
    ? undefined
    : await request.text();

  const response = await fetch(targetUrl, {
    method: request.method,
    headers: {
      "Content-Type": request.headers.get("Content-Type") ?? "application/json",
    },
    body,
  });

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: {
      "Content-Type": response.headers.get("Content-Type") ?? "application/json",
    },
  });
}

export async function GET(request: Request, context: RouteContext) {
  return proxy(request, context);
}

export async function POST(request: Request, context: RouteContext) {
  return proxy(request, context);
}

export async function PUT(request: Request, context: RouteContext) {
  return proxy(request, context);
}

export async function DELETE(request: Request, context: RouteContext) {
  return proxy(request, context);
}
