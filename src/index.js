/**
 * Google Fonts & Icons Proxy — Cloudflare Workers
 *
 * 代理目标：
 *   fonts.googleapis.com  — CSS / Icon font 样式表
 *   fonts.gstatic.com     — 实际字体文件 (woff2, ttf, …)
 *
 * 使用方式：将网页中所有
 *   https://fonts.googleapis.com  →  https://<your-worker-domain>
 *   https://fonts.gstatic.com     →  https://<your-worker-domain>
 */

// ─── 上游地址 ────────────────────────────────────────────────────────────────
const GOOGLEAPIS = 'https://fonts.googleapis.com';
const GSTATIC    = 'https://fonts.gstatic.com';

/**
 * 以下路径前缀由 fonts.googleapis.com 提供（CSS / 图标）；
 * 其余所有路径均转发到 fonts.gstatic.com（字体二进制文件）。
 */
const GOOGLEAPIS_PREFIXES = ['/css', '/icon', '/earlyaccess'];

// ─── 入口 ────────────────────────────────────────────────────────────────────
export default {
  async fetch(request, env) {
    // CORS 预检
    if (request.method === 'OPTIONS') {
      return corsPreflightResponse();
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    try {
      return await handleRequest(request, env);
    } catch (err) {
      return new Response(`Proxy Error: ${err.message}`, { status: 502 });
    }
  },
};

// ─── 核心代理逻辑 ─────────────────────────────────────────────────────────────
async function handleRequest(request, env) {
  const url  = new URL(request.url);
  const path = url.pathname;

  // 可选：通过环境变量 ALLOWED_ORIGINS 限制来源（逗号分隔，留空则不限制）
  const allowedOrigins = env.ALLOWED_ORIGINS
    ? env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
    : [];

  const origin = request.headers.get('Origin') || '';
  if (allowedOrigins.length > 0 && origin && !allowedOrigins.includes(origin)) {
    return new Response('Forbidden', { status: 403 });
  }

  // ── 兼容完整 URL 作为路径的写法 ──────────────────────────────────────────
  // 例：/https://fonts.googleapis.com/css2?family=...  或
  //     /https://fonts.gstatic.com/s/notosanssc/...
  const ALLOWED_UPSTREAM_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];
  let targetUrl;

  const fullUrlMatch = path.match(/^\/(https?:\/\/.+)/);
  if (fullUrlMatch) {
    let passedUrl;
    try {
      // 路径部分可能把查询参数编码进来了，先拼上当前请求的 search
      passedUrl = new URL(fullUrlMatch[1] + url.search);
    } catch {
      return new Response('Invalid upstream URL', { status: 400 });
    }
    if (!ALLOWED_UPSTREAM_HOSTS.includes(passedUrl.hostname)) {
      return new Response('Upstream host not allowed', { status: 403 });
    }
    targetUrl = passedUrl.toString();
  } else {
    // ── 普通路径写法 ───────────────────────────────────────────────────────────
    const isGoogleapis = GOOGLEAPIS_PREFIXES.some(p => path.startsWith(p));
    const upstreamBase = isGoogleapis ? GOOGLEAPIS : GSTATIC;
    targetUrl = `${upstreamBase}${path}${url.search}`;
  }

  // 构造上游请求
  const upstreamResp = await fetch(targetUrl, {
    method:  request.method,
    headers: buildUpstreamHeaders(request.headers, new URL(targetUrl).hostname),
    // 不跟随重定向，直接透传
    redirect: 'follow',
  });

  if (!upstreamResp.ok && upstreamResp.status !== 304) {
    return new Response(upstreamResp.statusText || 'Bad Gateway', {
      status: upstreamResp.status,
    });
  }

  const contentType = upstreamResp.headers.get('Content-Type') ?? '';

  // CSS 需要把内部 URL 指向改写为本代理地址
  if (contentType.includes('text/css')) {
    const proxyBase  = `${url.protocol}//${url.host}`;
    const originalCSS = await upstreamResp.text();
    const rewrittenCSS = rewriteCSS(originalCSS, proxyBase);

    return new Response(rewrittenCSS, {
      status:  upstreamResp.status,
      headers: buildResponseHeaders(upstreamResp.headers, 'text/css; charset=utf-8', 86400),
    });
  }

  // 字体二进制文件直接流式透传
  return new Response(upstreamResp.body, {
    status:  upstreamResp.status,
    headers: buildResponseHeaders(upstreamResp.headers, contentType, 31_536_000),
  });
}

// ─── 辅助函数 ─────────────────────────────────────────────────────────────────

/** 构造转发至上游的请求头 */
function buildUpstreamHeaders(original, targetHost) {
  const headers = new Headers();

  // 透传 UA，确保 Google 返回 woff2（现代格式）而非旧格式
  const forward = ['User-Agent', 'Accept', 'Accept-Encoding', 'Accept-Language'];
  for (const name of forward) {
    const val = original.get(name);
    if (val) headers.set(name, val);
  }

  headers.set('Host', targetHost);
  // 设置 Referer，避免 Google 拒绝裸请求
  headers.set('Referer', 'https://fonts.googleapis.com/');

  return headers;
}

/** 构造返回给客户端的响应头 */
function buildResponseHeaders(upstream, contentType, maxAge) {
  const headers = new Headers();

  headers.set('Content-Type', contentType || 'application/octet-stream');
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Timing-Allow-Origin', '*');
  headers.set(
    'Cache-Control',
    `public, max-age=${maxAge}, stale-while-revalidate=86400, stale-if-error=604800`,
  );

  // 保留上游校验头（ETag / Last-Modified），使浏览器条件请求正常工作
  for (const name of ['ETag', 'Last-Modified', 'Vary']) {
    const val = upstream.get(name);
    if (val) headers.set(name, val);
  }

  return headers;
}

/** 将 CSS 中所有 Google 域名替换为当前代理地址 */
function rewriteCSS(css, proxyBase) {
  return css
    .replace(/https:\/\/fonts\.googleapis\.com/g, proxyBase)
    .replace(/https:\/\/fonts\.gstatic\.com/g, proxyBase);
}

/** CORS 预检响应 */
function corsPreflightResponse() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin':  '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Max-Age':       '86400',
    },
  });
}
