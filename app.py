import json
import os
import time
from collections import defaultdict

import requests
from dotenv import load_dotenv
from flask import Flask, Response, jsonify, render_template, request

load_dotenv()

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 20 * 1024 * 1024

DEEPSEEK_API_KEY = os.environ.get("DEEPSEEK_API_KEY", "").strip()
DEEPSEEK_API_URL = os.environ.get(
    "DEEPSEEK_API_URL",
    "https://api.deepseek.com/chat/completions",
).strip()
# 视觉模型：文本+图片都能处理，无需按有无图片切换
DEEPSEEK_MODEL = os.environ.get("DEEPSEEK_MODEL", "deepseek-v4-flash-vision-exp").strip()
MAX_TOKENS = int(os.environ.get("MAX_TOKENS", "4000"))

# 简单限流：单 IP 每分钟次数上限，防止额度被刷
RATE_LIMIT_PER_MIN = int(os.environ.get("RATE_LIMIT_PER_MIN", "10"))
_hits: dict[str, list[float]] = defaultdict(list)


def rate_limited(ip: str) -> bool:
    now = time.time()
    arr = [t for t in _hits[ip] if now - t < 60]
    _hits[ip] = arr
    if len(arr) >= RATE_LIMIT_PER_MIN:
        return True
    arr.append(now)
    return False


SYSTEM_PROMPT = (
    "你是一位资深的 PPT 提示词专家，精通各类 PPT 场景下提示词的编写与优化，"
    "包括内容大纲、页面结构、版式设计、配色风格、演讲要点等。"
    "请根据用户的需求描述和参考图片，编写一条结构清晰、细节丰富、可直接用于生成高质量 PPT 的提示词。"
    "如果用户给出的是已有提示词，请优化增强它。"
    "直接输出最终提示词文本本身，不要输出任何解释或前后缀说明。"
)

REFINE_INSTRUCTION = (
    "上面是你上一版生成的提示词。用户对它提出了修改意见，"
    "请在保留整体结构与优点的同时，按意见优化，输出完整的新版提示词。"
    "直接输出新版提示词本身，不要输出解释。"
)


def build_messages(user_input: str, image_base64, previous_prompt: str | None):
    text = user_input or "请为我生成一条高质量的 PPT 提示词。"
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]

    if previous_prompt:
        # 迭代优化：上一版结果作为上下文，用户输入作为修改意见
        messages.append({"role": "assistant", "content": previous_prompt})
        user_text = REFINE_INSTRUCTION + "\n\n用户修改意见：" + text
    else:
        user_text = text

    if not image_base64:
        messages.append({"role": "user", "content": user_text})
        return messages

    url = image_base64
    if not url.startswith("data:image/"):
        url = "data:image/png;base64," + url
    messages.append({
        "role": "user",
        "content": [
            {"type": "text", "text": user_text},
            {"type": "image_url", "image_url": {"url": url}},
        ],
    })
    return messages


def _validate(req_data: dict):
    """公共校验，返回 (错误响应或None, user_input, image_base64, previous_prompt)。"""
    user_input = (req_data.get("user_input") or "").strip()
    image_base64 = req_data.get("image_base64") or None
    previous_prompt = (req_data.get("previous_prompt") or "").strip() or None

    if not user_input and not image_base64:
        return jsonify({"success": False, "error": "缺少用户输入或图片"}), 400, None, None, None
    if rate_limited(request.remote_addr or "unknown"):
        return jsonify({"success": False, "error": "请求太频繁，请稍后再试"}), 429, None, None, None
    if not DEEPSEEK_API_KEY:
        return jsonify(
            {"success": False, "error": "后端未配置 DEEPSEEK_API_KEY，请在 .env 文件中填写后重启服务"}
        ), 500, None, None, None
    return None, user_input, image_base64, previous_prompt


def _headers():
    return {
        "Authorization": f"Bearer {DEEPSEEK_API_KEY}",
        "Content-Type": "application/json",
    }


def _payload_for(user_input, image_base64, previous_prompt, stream=False):
    return {
        "model": DEEPSEEK_MODEL,
        "messages": build_messages(user_input, image_base64, previous_prompt),
        "max_tokens": MAX_TOKENS,
        "temperature": 0.7,
        "stream": stream,
    }


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/health")
def health():
    return jsonify({
        "status": "ok",
        "api_key_configured": bool(DEEPSEEK_API_KEY),
        "model": DEEPSEEK_MODEL,
    })


@app.route("/generate", methods=["POST"])
def generate():
    """非流式接口（保留兼容），前端默认走 /generate/stream。"""
    data = request.get_json(silent=True) or {}
    err, user_input, image_base64, previous_prompt = _validate(data)
    if err:
        return err

    try:
        resp = requests.post(
            DEEPSEEK_API_URL, json=_payload_for(user_input, image_base64, previous_prompt),
            headers=_headers(), timeout=180,
        )
    except requests.exceptions.RequestException as e:
        return jsonify({"success": False, "error": f"请求 DeepSeek API 失败：{e}"}), 502

    if resp.status_code != 200:
        return jsonify(
            {"success": False, "error": f"DeepSeek API 返回 {resp.status_code}: {resp.text[:500]}"}
        ), 502

    try:
        result = resp.json()
        msg = result["choices"][0]["message"]
        prompt = (msg.get("content") or msg.get("reasoning_content") or "").strip()
    except (KeyError, IndexError, ValueError):
        return jsonify({"success": False, "error": "DeepSeek API 返回格式异常"}), 502

    return jsonify({"success": True, "prompt": prompt})


@app.route("/generate/stream", methods=["POST"])
def generate_stream():
    """流式接口（SSE）：边生成边推送，前端逐字显示。"""
    data = request.get_json(silent=True) or {}
    err, user_input, image_base64, previous_prompt = _validate(data)
    if err:
        return err

    payload = _payload_for(user_input, image_base64, previous_prompt, stream=True)

    def sse(obj) -> str:
        return f"data: {json.dumps(obj, ensure_ascii=False)}\n\n"

    def gen():
        try:
            with requests.post(
                DEEPSEEK_API_URL, json=payload, headers=_headers(), timeout=180, stream=True
            ) as resp:
                if resp.status_code != 200:
                    yield sse({"error": f"DeepSeek API 返回 {resp.status_code}: {resp.text[:300]}"})
                    return
                for raw in resp.iter_lines(decode_unicode=True):
                    if not raw or not raw.startswith("data:"):
                        continue
                    chunk_str = raw[5:].strip()
                    if chunk_str == "[DONE]":
                        break
                    try:
                        chunk = json.loads(chunk_str)
                    except ValueError:
                        continue
                    choices = chunk.get("choices") or [{}]
                    delta = choices[0].get("delta") or {}
                    text = delta.get("content") or ""
                    if text:
                        yield sse({"delta": text})
                yield sse({"done": True})
        except requests.exceptions.RequestException as e:
            yield sse({"error": f"请求 DeepSeek API 失败：{e}"})

    return Response(gen(), mimetype="text/event-stream")


if __name__ == "__main__":
    # 默认只监听本机；要在局域网访问再在 .env 改 HOST=0.0.0.0（注意配合限流）
    host = os.environ.get("HOST", "127.0.0.1")
    port = int(os.environ.get("PORT", "5000"))
    app.run(host=host, port=port, debug=False)
