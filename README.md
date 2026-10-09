# DeckCraft · 参考图驱动的演示设计工作流

> 上传一张参考图或描述需求 → **拆解成结构化、可编辑的设计规范** → 产出结果。

**两种产出，按需选择：**
- **① 生成提示词**（省成本）：输出结构化、可直接使用的高质量提示词（SSE 流式、可再优化）；可拿去豆包等工具一键出稿。
- **② 直接下载 `.pptx`**（端到端）：本地 **python-pptx** 依规范直接渲染成可打开的 PPT 文件。

**核心升级（v2）**：不再只是"写提示词"，而是把演示设计做成一条可交付的工作流——
**参考图 → 设计规范（配色/版式/字体，可编辑、可复用）→ 成品 PPT**。

**设计哲学**（延续同类项目）：**精确的事交给算法，理解的事交给 AI**——
主色用 OpenCV k-means 确定性提取；风格语义与内容大纲交大模型；规范可编辑、可沉淀复用（Skill 化）。

---

## 一、项目背景

制作 PPT 时，用户往往能说清"想要什么效果"，却难以把它转化成一条结构化、细节充分、可直接产出高质量页面的提示词。结果是反复试错、来回调试，时间成本高、效果还不稳定；同时用户常手上有"想要这种风格/版式"的参考图，却不知道怎么把它写进提示词。

本项目提供"**一句话 / 一张图 → 一条高质量 PPT 提示词**"的生成工具，并支持迭代优化。

> **两种产出**：① **生成提示词文本**（可拿去豆包等工具出稿，省成本）；② **直接生成 `.pptx` 文件**（本地 python-pptx 渲染）。按需选择。

---

## 二、功能特性

- **参考图 → 结构化设计规范**：上传参考图，用 **OpenCV k-means 提取主色**（确定性），再交视觉大模型理解**主题 / 版式 / 字体 / 强调色用法**，全部**可编辑**；
- **直接产出 `.pptx`**：按"规范 + 大模型生成的大纲（封面 + 逐页要点）"用 **python-pptx** 渲染成 16:9 幻灯片并**下载**；
- **设计 Skill 库**：把拆解得到的「设计规范」**命名保存**为可复用的 Skill，下次在新任务里**一键套用**（后端 `/skills`），沉淀设计资产；
- **需求输入 / 模板快捷**：文本框输入自然语言需求，模板 chips 一键填充；
- **参考图上传（可选）**：支持点击选择 / 拖拽上传，上传前**前端压缩**（最长边 1280、JPEG 85%），降低上传体积与 token 消耗；
- **流式生成**：通过 SSE 边生成边推送，结果**逐字显示**；
- **一键复制**：结果一键复制到剪贴板；
- **再优化一版**：输入修改意见后，自动携带**上一版提示词**作为上下文迭代，保留整体结构；
- **历史记录**：localStorage 保存最近 20 条，可点击回填、可清空；
- **中英文切换 / 移动端二维码**：易用性与移动端接入。

---

## 三、技术栈

| 层 | 技术 |
|---|---|
| 后端 | Python 3.10+、Flask、Requests、python-dotenv |
| 前端 | **React 18 + Vite + Tailwind CSS**（构建产物由 Flask 托管；`templates/index.html` 旧模板保留为回退） |
| 通信 | SSE（`text/event-stream`）流式输出 |
| 存储 | localStorage（浏览器本地历史） |
| 大模型 | **DeepSeek API（视觉模型）**，文本 + 图片均可处理 |
| 视觉/图像 | **OpenCV**（k-means 主色提取）、**Pillow** |
| 文档生成 | **python-pptx**（直接产出 `.pptx`） |

---

## 四、请求流程

```
用户（前端页面）
   │  输入需求 / 选模板 · 上传参考图（可选，前端压缩）
   ▼
点击「生成」 ──► POST /generate/stream（SSE）
   ▼
Flask 后端 · 校验（需求或图片非空 / 单 IP 限流 / API Key 检查）
   ▼
组装 messages（system：PPT 提示词专家；user：需求文本 + 可选图片；
              优化模式：附上一版提示词 + 修改意见）
   ▼
调用 DeepSeek 视觉模型（stream = True）
   ▼
逐块 delta ──► SSE 推送 ──► 前端逐字显示
   ▼
结果操作：复制 · 再优化一版（带上一版回环到「组装 messages」）
   ▼
历史记录（localStorage · 最近 20 条）
```

---

## 五、接口

| 接口 | 方法 | 入参 | 返回 |
|---|---|---|---|
| `/` | GET | — | 前端页面 HTML |
| `/health` | GET | — | `{ status, api_key_configured, model }` |
| `/generate` | POST | `{ user_input, image_base64, previous_prompt }` | `{ success, prompt }` |
| `/generate/stream` | POST | 同上 | SSE：`{delta}` … `{done}` / `{error}` |
| `/analyze` | POST | `{ image_base64 }` | `{ success, palette[], style{} }`（参考图 → 设计规范） |
| `/deck` | POST | `{ user_input, image_base64?, spec? }` | 直接返回 `.pptx` 文件下载 |

---

## 六、目录结构

```
ppt提示词项目/
├── app.py                 # Flask 后端（/generate、/generate/stream、/analyze、/deck、/health）
├── design.py              # 设计工作流核心（k-means 提色 / 风格拆解 / 大纲 / python-pptx 渲染）
├── frontend/              # React + Vite + Tailwind 前端（构建产物 frontend/dist 由 Flask 托管）
├── templates/
│   └── index.html         # 旧版前端页面（回退用）
├── static/                # 静态资源
├── requirements.txt
├── .env.example           # 配置模板（复制为 .env 后填入 Key）
├── .gitignore             # 已忽略 .env，密钥绝不入库
└── README.md
```

---

## 七、快速开始

```bash
# 1. 安装依赖
pip install -r requirements.txt

# 2. 配置密钥
copy .env.example .env      # Windows；然后填入 DEEPSEEK_API_KEY

# 3. 启动
python app.py               # 看到 Running on http://127.0.0.1:5000
```

浏览器打开 <http://127.0.0.1:5000> 即可使用。

---

## 七·五、前端开发（React + Vite + Tailwind）

前端源码在 `frontend/`，构建产物由 Flask 在 `/` 直接托管（无需另跑服务）。

```bash
cd frontend
npm install
npm run build      # 产出 frontend/dist，Flask 自动托管

# 或本地开发（热更新，API 已配置代理到 127.0.0.1:5000）
npm run dev        # http://127.0.0.1:5173
```

> 若 `frontend/dist` 不存在，Flask 会回退到旧版 `templates/index.html`。

## 八、配置项（.env）

| 变量 | 说明 | 默认 |
|---|---|---|
| `DEEPSEEK_API_KEY` | **必填**，DeepSeek API Key | — |
| `DEEPSEEK_API_URL` | 接口地址 | `https://api.deepseek.com/chat/completions` |
| `DEEPSEEK_MODEL` | 模型 ID（需**视觉模型**以支持图片理解） | `deepseek-v4-flash-vision-exp` |
| `MAX_TOKENS` | 单次生成最大 token | `4000` |
| `RATE_LIMIT_PER_MIN` | 单 IP 每分钟请求上限 | `10` |
| `HOST` | 监听地址（`0.0.0.0` 局域网可访问） | `127.0.0.1` |
| `PORT` | 端口 | `5000` |

---

## 九、安全与成本

- **API Key 仅从 `.env` 读取**，`.env` 已被 `.gitignore` 忽略，绝不写入代码 / 提交入库；
- 默认**仅监听 `127.0.0.1`**，不对外暴露；
- **单 IP 限流**（默认 10 次/分钟），防止额度被刷；
- 请求体上限 20MB；图片在前端压缩后再上传；
- `max_tokens` 限制单次消耗。

---

## 十、已知边界与后续

- **当前边界**：输出提示词而非 PPT 文件；无账号体系，历史仅存浏览器本地；
- **后续**：直接生成 / 导出 PPT 文件、账号与云端历史、多模型可选、团队协作与模板库。
