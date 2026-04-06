# Google Fonts Proxy

部署在 Cloudflare Workers 上的 Google Fonts / Icons 反向代理。

## 功能

| 功能 | 说明 |
|------|------|
| 字体 CSS | 代理 `fonts.googleapis.com/css2?…` |
| Material Icons | 代理 `fonts.googleapis.com/icon?family=…` |
| 字体文件 | 代理 `fonts.gstatic.com` 下的 woff2 / ttf 等 |
| CSS 地址改写 | 自动把 CSS 内的 Google 域名替换为代理地址 |
| CORS | 默认 `Access-Control-Allow-Origin: *` |
| 缓存 | CSS 缓存 1 天，字体文件缓存 1 年 |
| 来源限制 | 通过环境变量可选限制允许的来源 |

## 快速部署

### 1. 安装依赖

```bash
npm install
```

### 2. 登录 Cloudflare

```bash
npx wrangler login
```

### 3. 本地调试

```bash
npm run dev
```

### 4. 发布到 Cloudflare Workers

```bash
npm run deploy
```

发布成功后会输出 Worker URL，例如：

```
https://google-fonts-proxy.<your-subdomain>.workers.dev
```

---

## 在网页中使用

将原来引用 Google Fonts 的地址中的域名替换为你的 Worker 地址即可。

**原始写法**

```html
<link rel="stylesheet"
  href="https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;700&display=swap">

<link rel="stylesheet"
  href="https://fonts.googleapis.com/icon?family=Material+Icons">
```

**替换后**

```html
<link rel="stylesheet"
  href="https://google-fonts-proxy.<your-subdomain>.workers.dev/css2?family=Noto+Sans+SC:wght@400;700&display=swap">

<link rel="stylesheet"
  href="https://google-fonts-proxy.<your-subdomain>.workers.dev/icon?family=Material+Icons">
```

`@font-face` src 里的 `fonts.gstatic.com` URL 会被代理自动改写，**无需手动修改**。

### 写法二：完整 URL 作为路径（兼容模式）

将完整的 Google Fonts URL 直接拼在代理地址后面也同样支持：

```html
<link rel="stylesheet"
  href="https://google-fonts-proxy.<your-subdomain>.workers.dev/https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;700&display=swap">

<link rel="stylesheet"
  href="https://google-fonts-proxy.<your-subdomain>.workers.dev/https://fonts.googleapis.com/icon?family=Material+Icons">
```

这种写法适合通过脚本批量替换已有链接，只需在原 URL 前拼上代理地址前缀即可，无需拆分域名和路径。

---

## 绑定自定义域名（可选）

在 `wrangler.toml` 中解注释 `[[routes]]` 并填写你的域名：

```toml
[[routes]]
pattern   = "fonts.example.com/*"
zone_name = "example.com"
```

然后重新 `npm run deploy`，之后即可使用 `https://fonts.example.com/css2?…`。

---

## 限制来源（可选）

如果只希望自己的网站能使用这个代理，在 `wrangler.toml` 中配置：

```toml
[vars]
ALLOWED_ORIGINS = "https://example.com,https://www.example.com"
```

或通过 Cloudflare Dashboard → Worker → Settings → Variables 添加。

---

## 查看实时日志

```bash
npm run tail
```
