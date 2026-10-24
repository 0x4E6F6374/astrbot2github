export default {
  async fetch(req: Request): Promise<Response> {
    const incomingUrl = new URL(req.url);

    // 根路径提示
    if (incomingUrl.pathname === "/") {
      return new Response(
        "此地址只用于为astrbot提供更快速的github访问服务",
        {
          status: 200,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        }
      );
    }

    // 统一的 CORS 头
    const corsHeaders = new Headers({
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, *",
    });

    // 1. 提取目标 URL（去掉开头的 "/"，并解码）
    const targetUrlString = decodeURIComponent(incomingUrl.pathname.slice(1));

    // 2. 校验
    if (
      !targetUrlString ||
      (!targetUrlString.startsWith("http://") &&
        !targetUrlString.startsWith("https://"))
    ) {
      return new Response(
        "Invalid or missing target URL in path. Usage: /<target_url>",
        {
          status: 400,
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            ...Object.fromEntries(corsHeaders),
          },
        }
      );
    }

    // 3. 预检请求直接返回，避免打到目标服务器
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    console.log(`Proxying request to: ${targetUrlString}`);

    try {
      // 4. 复制并过滤请求头
      //    Workers 不允许直接转发部分由平台管理的头（如 host、cf-* 等），
      //    转发它们可能导致请求失败或被边缘节点丢弃。
      const forwardHeaders = new Headers(req.headers);
      const blockedHeaders = [
        "host",
        "cf-connecting-ip",
        "cf-ipcountry",
        "cf-ray",
        "cf-visitor",
        "cf-worker",
        "x-forwarded-proto",
        "x-forwarded-for",
      ];
      for (const h of blockedHeaders) {
        forwardHeaders.delete(h);
      }

      // 5. 发起代理请求
      const response = await fetch(targetUrlString, {
        headers: forwardHeaders,
        method: req.method,
        body:
          req.method === "GET" || req.method === "HEAD"
            ? undefined
            : req.body,
        redirect: "manual", // 保留 3xx 交给客户端处理
      });

      // 6. 复制响应头并加上 CORS
      const responseHeaders = new Headers(response.headers);
      responseHeaders.set("Access-Control-Allow-Origin", "*");
      responseHeaders.set(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, DELETE, OPTIONS"
      );
      responseHeaders.set(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization, *"
      );

      // 7. 返回响应
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
      });
    } catch (error) {
      console.error(`Error fetching ${targetUrlString}:`, error);
      const msg = error instanceof Error ? error.message : String(error);
      return new Response(
        `Failed to proxy request to ${targetUrlString}: ${msg}`,
        {
          status: 502,
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            ...Object.fromEntries(corsHeaders),
          },
        }
      );
    }
  },
};
