# Prompt 定制助手 · AI 提示词自动化生成与 PPT 定制工具

> 上传图片或描述需求，AI 自动生成一条**结构清晰、可直接使用**的高质量 PPT 提示词；支持**流式输出**与**迭代优化**。

面向"想做 PPT 但不会写 Prompt"的办公/学习场景：把一句自然语言（或一张参考图）转成专业、细节充分的 PPT 提示词，并能在结果基础上不断修改，而不是每次从零重来。

---

## 一、项目背景

制作 PPT 时，用户往往能说清"想要什么效果"，却难以把它转化成一条结构化、细节充分、可直接产出高质量页面的提示词。结果是反复试错、来回调试，时间成本高、效果还不稳定；同时用户常手上有"想要这种风格/版式"的参考图，却不知道怎么把它写进提示词。

本项目提供"**一句话 / 一张图 → 一条高质量 PPT 提示词**"的生成工具，并支持迭代优化。

> **产品边界**：本工具输出的是**提示词文本**，不是直接生成 PPT 文件；定位为"提示词助手"，供用户拿去对接任意 PPT 生成工具或人工制作。

---

## 二、功能特性

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
| 前端 | 原生 HTML + CSS + JavaScript（无框架） |
| 通信 | SSE（`text/event-stream`）流式输出 |
| 存储 | localStorage（浏览器本地历史） |
| 大模型 | **DeepSeek API（视觉模型）**，文本 + 图片均可处理 |

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

---

## 六、目录结构

```
ppt提示词项目/
├── app.py                 # Flask 后端（/generate、/generate/stream、/health）
├── templates/
│   └── index.html         # 前端页面（输入 / 上传 / 流式结果 / 历史 / i18n）
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
