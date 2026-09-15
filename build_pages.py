# 把 backend/demo.html 生成一份托管到 GitHub Pages 的版本：
#   唯一区别 = API 基址从「同源相对路径」改成后端隧道的绝对地址。
# 用法：python build_pages.py <后端基址，如 https://xxx.ngrok-free.app>
import io, sys, os
base = sys.argv[1].rstrip("/")
src = r"D:\zhihu-full\zhihu-hackathon\backend\demo.html"
dst = r"D:\zhihu-full\zhihu-hackathon\docs\index.html"
s = io.open(src, encoding="utf-8").read()

old = '  const API = "";'
assert old in s, "没找到 const API = \"\" —— demo.html 改过了？"
new = ('  // 这一份托管在 GitHub Pages 上，页面和 API 不同源，必须写绝对地址。\n'
       '  // 生成来源：backend/demo.html（那边是同源相对路径）。改完 demo.html 要重新生成，\n'
       '  // 见 docs/README.md。\n'
       f'  const API = "{base}";')
s = s.replace(old, new)

# ngrok 免费版会给「浏览器发的 GET」插一页 You are about to visit 确认页
# （POST/XHR 不受影响，但 /api/stories、/api/knowledge 这种 GET 会中招）。
# ngrok-skip-browser-warning 是官方给的跳过头，包一层 fetch 统一带上。
wrapper = '''
  // GitHub Pages 版专用：页面在 github.io、API 在 ngrok，不同源。
  // ngrok 免费版会对浏览器发的 GET 插一页确认页（POST 不受影响），
  // 官方给的开关就是这个头。Api 之外的一律不碰。
  const _fetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    const url = typeof input === "string" ? input : ((input && input.url) || "");
    if (url.indexOf(API) === 0) {
      init = Object.assign({}, init);
      const h = Object.assign({}, init.headers || {});
      h["ngrok-skip-browser-warning"] = "1";
      init.headers = h;
    }
    return _fetch(input, init);
  };
'''
anchor = f'  const API = "{base}";'
s = s.replace(anchor, anchor + wrapper)
io.open(dst, "w", encoding="utf-8").write(s)
print("已生成", dst, os.path.getsize(dst), "字节  →  API =", base)
