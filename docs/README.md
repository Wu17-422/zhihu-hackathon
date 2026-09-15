# docs/ —— 托管到 GitHub Pages 的 Demo 副本

`index.html` 是 `backend/demo.html` 的**生成产物**，不要手改。唯一区别是 API 基址：

| | API 基址 | 用途 |
|---|---|---|
| `backend/demo.html` | `""`（同源相对路径） | 本机 `localhost:8000/demo`、以及部署到平台时用 |
| `docs/index.html` | 后端隧道的绝对地址 | GitHub Pages 托管，页面在 github.io、API 在隧道上，跨域 |

**改了 `backend/demo.html` 之后必须重新生成**，否则两边会不一致：

```bash
python build_pages.py https://<你的后端地址>
```

（`build_pages.py` 在仓库外面，改完把生成结果覆盖回 `docs/index.html`。）

## 为什么多包了一层 fetch

`docs/index.html` 里所有的请求都多带一个 `ngrok-skip-browser-warning: 1` 头。

原因是 ngrok 免费版会对**浏览器发出的 GET 请求**插一页「You are about to visit…」
确认页 —— `POST` 不受影响，但 `/api/stories`、`/api/knowledge` 这两个 GET 会中招，
评委点开会看到一页英文警告而不是内容。这个头是 ngrok 官方给的跳过开关。

如果后端不用 ngrok（比如换成 Render、或者用 cloudflared 的固定域名），
那段 fetch 包装就是多余的，重新生成时去掉即可。

## 页面和接口不同源的注意事项

后端 `main.py` 的 CORS 是 `allow_origins=["*"]`，所以 Pages 域名可以直接调隧道接口。
**换后端域名之后 CORS 不用改**，但要把 `ngrok-skip-browser-warning` 那段一起重新生成。
