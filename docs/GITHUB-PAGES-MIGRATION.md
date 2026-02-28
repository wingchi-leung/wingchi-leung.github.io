# 从 Netlify 迁移到 GitHub Pages

本项目已配置好 **静态导出**（`output: 'export'`）和 **GitHub Actions 工作流**，按下面步骤即可从 Netlify 切到 GitHub Pages。

---

## 一、前置条件

- 代码在 **Git** 仓库中，且仓库根目录即本项目根（含 `package.json`、`.github/workflows`）。
- 已有一个 **GitHub** 账号，并打算用该账号下的仓库部署。

---

## 二、迁移步骤

### 1. 把代码推到 GitHub

若尚未创建远程仓库：

1. 在 GitHub 新建仓库（如 `wingchi-website` 或 `username.github.io`）。
2. 在本项目根目录执行：

```bash
git remote add origin https://github.com/<你的用户名>/<仓库名>.git
git push -u origin main
```

若已有远程但仍是 Netlify 用的仓库，无需改远程，继续下一步即可。

---

### 2. 启用 GitHub Pages（使用 Actions）

1. 打开仓库 → **Settings** → **Pages**。
2. 在 **Build and deployment** 里：
   - **Source** 选择 **GitHub Actions**（不要选 Deploy from a branch）。
3. 保存后无需再选分支或目录，工作流会负责构建和部署。

---

### 3. 触发一次部署

- 推送一次到 `main` 分支（例如 `git push origin main`），或
- 在 **Actions** 里对 “Deploy to GitHub Pages” 工作流点 **Run workflow**。

首次运行完成后，在 **Settings → Pages** 会看到站点地址，例如：

- **用户/组织站**（仓库名为 `用户名.github.io`）：  
  `https://<用户名>.github.io`
- **项目站**（其他仓库名）：  
  `https://<用户名>.github.io/<仓库名>/`

---

### 4. 站点 URL 与 basePath（已自动处理）

工作流里已根据仓库名设置环境变量：

| 场景         | NEXT_PUBLIC_SITE_URL                    | NEXT_PUBLIC_BASE_PATH |
|--------------|-----------------------------------------|------------------------|
| 用户站       | `https://<owner>.github.io`             | 空                     |
| 项目站       | `https://<owner>.github.io/<repo>`      | `/<repo>`              |

因此：

- **sitemap.xml、robots.txt、llms.txt** 会在构建时由 `scripts/generate-static-seo.js` 用 `NEXT_PUBLIC_SITE_URL` 生成正确链接。
- **Next 的 basePath / assetPrefix** 会按项目站/用户站自动配置，无需在 Netlify 再设变量。

本地或其它环境构建时，若需指定 URL，可设置：

```bash
NEXT_PUBLIC_SITE_URL=https://你的域名 npm run build
```

---

## 三、与 Netlify 的差异

| 项目           | Netlify                    | GitHub Pages（本方案）        |
|----------------|----------------------------|-------------------------------|
| 构建           | Netlify 自动检测/配置      | 由 `.github/workflows/deploy-pages.yml` 执行 |
| 输出目录       | 默认 `out`（与当前一致）   | 同上，`out`                  |
| 环境变量       | 在 Netlify 后台配置        | 在工作流中根据仓库名自动设置 |
| 重定向/头部    | `netlify.toml` / `_redirects` | 静态站无服务端，需用前端或 404 处理 |
| CMS（Netlify CMS） | 常用 Git Gateway          | 需改用 **GitHub 后端**（见下） |

---

## 四、Netlify CMS 改为 GitHub 后端（可选）

若你使用 **Netlify CMS**（`/admin`）在 Netlify 上通过 **Git Gateway** 编辑内容，迁移到 GitHub Pages 后需改为 **GitHub 后端**，否则无法保存。

1. **改 `public/admin/config.yml`**  
   将 `backend` 从 `git-gateway` 改为 `github`，并写上当前 GitHub 仓库：

   ```yaml
   backend:
     name: github
     repo: <你的用户名>/<仓库名>   # 例如 wingchi-leung/wingchi-website
     branch: main
   ```

2. **配置 GitHub 身份验证**  
   GitHub 后端需要 OAuth：
   - 可用 **Netlify OAuth 代理**（仍用 Netlify 账号，仅做登录代理），或  
   - 使用 **GitHub OAuth App**：在 GitHub 创建 OAuth App，在 Netlify CMS 的 `config.yml` 里配置 `base_url` 等。  
   详见：[Netlify CMS - GitHub Backend](https://www.netlifycms.org/docs/github-backend/)。

3. **媒体上传**  
   若用 Netlify 的 Git Gateway 上传图片，改为 GitHub 后，图片会通过 API 提交到同一仓库（或你配置的路径），需保证 `media_folder` / `public_folder` 与当前站点路径一致（项目站需考虑 `basePath`）。

完成以上后，在 GitHub Pages 站点访问 `/admin` 即可用 GitHub 账号登录并编辑内容。

---

## 五、可选：自定义域名

若要用自己的域名（如 `blog.example.com`）：

1. **Settings → Pages** 里填 **Custom domain**，按提示在 DNS 添加 CNAME 或 A 记录。
2. 若启用 HTTPS，勾选 **Enforce HTTPS**。
3. 若使用 **项目站**（带 basePath），自定义域名通常解析到根即可，Next 的 `basePath` 仍由构建时环境变量决定；若用 **用户站**，域名解析到用户站根即可。

---

## 六、关闭 Netlify

确认 GitHub Pages 访问正常、链接和 CMS（若使用）都正常后：

1. 在 Netlify 对应站点 **Site settings** 中可关闭或删除站点。
2. 若域名曾绑在 Netlify，把 DNS 改到 GitHub Pages 或你的新主机。

---

## 七、工作流文件位置

- 构建与部署流程：`.github/workflows/deploy-pages.yml`  
- 构建时生成 sitemap/robots/llms：`scripts/generate-static-seo.js`  
- 站点 URL / basePath 逻辑：见工作流中的 `NEXT_PUBLIC_SITE_URL`、`NEXT_PUBLIC_BASE_PATH`。

按上述步骤即可完成从 Netlify 到 GitHub Pages 的迁移。
