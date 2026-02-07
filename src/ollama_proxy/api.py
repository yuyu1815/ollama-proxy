"""Ollama-compatible API Server using LiteLLM

This server implements the Ollama REST API specification.
"""

import argparse
import json
from collections.abc import AsyncGenerator
from pathlib import Path
from typing import Any

import litellm
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles

import ollama_proxy.converter as converter
from ollama_proxy.config import ConfigManager

app = FastAPI(title="Ollama Proxy Server")

# Mount static files (favicon, etc.)
static_dir = Path(__file__).parent / "static"
if static_dir.exists():
    app.mount("/static", StaticFiles(directory=static_dir), name="static")
config = ConfigManager()


def debug_log(message: str) -> None:
    """開発モード時のログ出力"""
    if config.get_server_config().dev_mode:
        print(f"[DEBUG] {message}", flush=True)


def _build_options(body: dict[str, Any]) -> dict[str, Any]:
    """Ollama options to LiteLLM parameters"""
    options = body.get("options", {})
    params: dict[str, Any] = {}

    if "temperature" in options:
        params["temperature"] = options["temperature"]
    if "num_predict" in options:
        params["max_tokens"] = options["num_predict"]
    if "top_p" in options:
        params["top_p"] = options["top_p"]

    return params


def _apply_config_options(options: dict[str, Any], lite_config: Any) -> None:
    """Apply static configuration options to the request options"""
    if getattr(lite_config, "reasoning_effort", None):
        options["reasoning_effort"] = lite_config.reasoning_effort

    if getattr(lite_config, "thinking_budget", None):
        options["thinking"] = {
            "type": "enabled",
            "budget_tokens": lite_config.thinking_budget,
        }


@app.get("/api/tags")
async def list_models() -> JSONResponse:
    """List available models"""
    models = []
    for model_name in config.list_models():
        lite_config = config.get_litellm_config(model_name)
        if lite_config:
            models.append(
                converter.to_ollama_model_list_item(
                    model_name=model_name,
                    provider=lite_config.provider,
                    litellm_model=lite_config.model_name,
                )
            )

    return JSONResponse({"models": models})


@app.post("/api/generate", response_model=None)
async def generate(request: Request):
    """Generate a response for a given prompt"""
    import time

    body = await request.json()
    model_name = body.get("model", "")
    prompt = body.get("prompt", "")
    stream = body.get("stream", True)
    system = body.get("system", "")
    format_type = body.get("format", None)

    debug_log(
        f"Generate request: model={model_name}, stream={stream}, "
        f"prompt_len={len(prompt)}"
    )
    debug_log(f"Request Body:\n{json.dumps(body, indent=2, ensure_ascii=False)}")

    # Get LiteLLM config
    lite_config = config.get_litellm_config(model_name)
    if not lite_config:
        return JSONResponse(
            {"error": f"model '{model_name}' not found"},
            status_code=404,
        )

    # Build messages
    messages: list[dict[str, str]] = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})

    # Build options
    options = _build_options(body)
    if format_type == "json":
        options["response_format"] = {"type": "json_object"}

    # Apply static config options (Thinking, etc.)
    _apply_config_options(options, lite_config)

    start_time = time.time()

    # custom_openaiの場合はproviderを"openai"に変更
    litellm_provider = (
        "openai" if lite_config.provider == "custom_openai" else lite_config.provider
    )
    litellm_model = f"{litellm_provider}/{lite_config.model_name}"

    if stream:
        return StreamingResponse(
            _stream_generate(lite_config, messages, model_name, litellm_model, options),
            media_type="application/x-ndjson",
        )
    else:
        try:
            response = await litellm.acompletion(
                model=litellm_model,
                messages=messages,
                api_key=lite_config.api_key,
                api_base=lite_config.base_url,
                **options,
            )
        except Exception as e:
            return JSONResponse({"error": str(e)}, status_code=500)

        end_time = time.time()
        content = response.choices[0].message.content or ""
        usage = response.usage or {}

        result = converter.to_ollama_generate_response(
            content=content,
            model_name=model_name,
            duration_seconds=end_time - start_time,
            prompt_tokens=usage.get("prompt_tokens", 0),
            completion_tokens=usage.get("completion_tokens", 0),
        )
        return JSONResponse(result)


async def _stream_generate(
    lite_config: Any,
    messages: list[dict[str, str]],
    model_name: str,
    litellm_model: str,
    options: dict[str, Any],
) -> AsyncGenerator[str, None]:
    """Stream generate responses"""
    import time

    start_time = time.time()

    try:
        response_stream = await litellm.acompletion(
            model=litellm_model,
            messages=messages,
            stream=True,
            api_key=lite_config.api_key,
            api_base=lite_config.base_url,
            **options,
        )

        async for chunk in response_stream:
            delta = chunk.choices[0].delta
            content = delta.content if delta else ""
            if content:
                data = converter.to_ollama_generate_stream_chunk(
                    content=content,
                    model_name=model_name,
                    done=False,
                )
                chunk_str = json.dumps(data) + "\n"
                debug_log(f"Stream chunk: {chunk_str.strip()}")
                yield chunk_str

        # Final chunk
        end_time = time.time()
        final_data = converter.to_ollama_generate_response(
            content="",
            model_name=model_name,
            duration_seconds=end_time - start_time,
            prompt_tokens=0,
            completion_tokens=0,
        )
        yield json.dumps(final_data) + "\n"

    except Exception as e:
        # Error in stream - send error as final chunk
        error_data = converter.to_ollama_generate_response(
            content=f"Error processing request: {str(e)}",
            model_name=model_name,
            duration_seconds=0,
            prompt_tokens=0,
            completion_tokens=0,
        )
        yield json.dumps(error_data) + "\n"


@app.post("/api/chat", response_model=None)
async def chat(request: Request):
    """Generate a chat response"""
    import time

    body = await request.json()
    model_name = body.get("model", "")
    messages = body.get("messages", [])
    stream = body.get("stream", True)
    format_type = body.get("format", None)
    tools = body.get("tools", None)

    debug_log(
        f"Chat request: model={model_name}, stream={stream}, "
        f"messages_len={len(messages)}"
    )
    debug_log(f"Request Body:\n{json.dumps(body, indent=2, ensure_ascii=False)}")

    # Get LiteLLM config
    lite_config = config.get_litellm_config(model_name)
    if not lite_config:
        return JSONResponse(
            {"error": f"model '{model_name}' not found"},
            status_code=404,
        )

    # Build options
    options = _build_options(body)
    if format_type == "json":
        options["response_format"] = {"type": "json_object"}
    if tools:
        options["tools"] = tools

    # Apply static config options (Thinking, etc.)
    _apply_config_options(options, lite_config)

    # custom_openaiの場合はproviderを"openai"に変更
    litellm_provider = (
        "openai" if lite_config.provider == "custom_openai" else lite_config.provider
    )
    litellm_model = f"{litellm_provider}/{lite_config.model_name}"

    start_time = time.time()

    if stream:
        return StreamingResponse(
            _stream_chat(lite_config, messages, model_name, litellm_model, options),
            media_type="application/x-ndjson",
        )
    else:
        try:
            response = await litellm.acompletion(
                model=litellm_model,
                messages=messages,
                api_key=lite_config.api_key,
                api_base=lite_config.base_url,
                **options,
            )
        except Exception as e:
            return JSONResponse({"error": str(e)}, status_code=500)

        end_time = time.time()
        content = response.choices[0].message.content or ""
        tool_calls = response.choices[0].message.tool_calls
        usage = response.usage or {}

        result = converter.to_ollama_chat_response(
            content=content,
            model_name=model_name,
            duration_seconds=end_time - start_time,
            prompt_tokens=usage.get("prompt_tokens", 0),
            completion_tokens=usage.get("completion_tokens", 0),
            tool_calls=tool_calls,
        )
        return JSONResponse(result)


async def _stream_chat(
    lite_config: Any,
    messages: list[dict[str, Any]],
    model_name: str,
    litellm_model: str,
    options: dict[str, Any],
) -> AsyncGenerator[str, None]:
    """Stream chat responses"""
    import time

    start_time = time.time()

    try:
        response_stream = await litellm.acompletion(
            model=litellm_model,
            messages=messages,
            stream=True,
            api_key=lite_config.api_key,
            api_base=lite_config.base_url,
            **options,
        )

        async for chunk in response_stream:
            delta = chunk.choices[0].delta
            content = delta.content if delta else ""
            tool_calls = delta.tool_calls

            if content or tool_calls:
                data = converter.to_ollama_chat_stream_chunk(
                    content=content or "",
                    model_name=model_name,
                    done=False,
                    tool_calls=tool_calls,
                )
                chunk_str = json.dumps(data) + "\n"
                debug_log(f"Stream chunk: {chunk_str.strip()}")
                yield chunk_str

        # Final chunk
        end_time = time.time()
        final_data = converter.to_ollama_chat_response(
            content="",
            model_name=model_name,
            duration_seconds=end_time - start_time,
            prompt_tokens=0,
            completion_tokens=0,
        )
        yield json.dumps(final_data) + "\n"

    except Exception as e:
        # Error in stream - send as final chunk
        error_data = converter.to_ollama_chat_response(
            content=f"Error processing request: {str(e)}",
            model_name=model_name,
            duration_seconds=0,
            prompt_tokens=0,
            completion_tokens=0,
        )
        yield json.dumps(error_data) + "\n"


@app.get("/api/ps")
async def list_running_models() -> JSONResponse:
    """List running models"""
    return JSONResponse({"models": []})


@app.post("/api/show")
async def show_model_info(request: Request) -> JSONResponse:
    """Show model information"""
    body = await request.json()
    model_name = body.get("name", "")

    lite_config = config.get_litellm_config(model_name)
    if not lite_config:
        return JSONResponse(
            {"error": f"model '{model_name}' not found"},
            status_code=404,
        )

    result = converter.to_ollama_model_info(
        model_name=model_name,
        provider=lite_config.provider,
        litellm_model=lite_config.model_name,
    )
    return JSONResponse(result)


@app.post("/api/embed")
async def generate_embeddings(_request: Request) -> JSONResponse:
    """Generate embeddings - TODO: Not implemented"""
    return JSONResponse(
        {"error": "embeddings are not yet supported"},
        status_code=501,
    )


@app.post("/api/create")
async def create_model(_request: Request) -> JSONResponse:
    """Create a model - Not implemented"""
    return JSONResponse(
        {"error": "model creation is not supported in proxy mode"},
        status_code=501,
    )


@app.post("/api/copy")
async def copy_model(_request: Request) -> JSONResponse:
    """Copy a model - Not implemented"""
    return JSONResponse(
        {"error": "model copy is not supported in proxy mode"},
        status_code=501,
    )


@app.delete("/api/delete")
async def delete_model(_request: Request) -> JSONResponse:
    """Delete a model - Not implemented"""
    return JSONResponse(
        {"error": "model deletion is not supported in proxy mode"},
        status_code=501,
    )


@app.post("/api/pull")
async def pull_model(_request: Request) -> JSONResponse:
    """Pull a model - Not implemented"""
    return JSONResponse(
        {"error": "model pull is not supported in proxy mode"},
        status_code=501,
    )


@app.post("/api/push")
async def push_model(_request: Request) -> JSONResponse:
    """Push a model - Not implemented"""
    return JSONResponse(
        {"error": "model push is not supported in proxy mode"},
        status_code=501,
    )


@app.get("/api/version")
async def get_version() -> JSONResponse:
    """Get version information"""
    return JSONResponse({"version": "0.1.0"})


@app.get("/")
async def root() -> dict[str, str]:
    """Root endpoint - health check"""
    return {"status": "Ollama is running"}


def main() -> None:
    """Entry point for the server"""
    import uvicorn

    server_config = config.get_server_config()

    parser = argparse.ArgumentParser(description="Ollama Proxy Server")
    parser.add_argument(
        "--dev", action="store_true", help="Enable development mode (debug logging)"
    )
    parser.add_argument("--port", type=int, help="Port to run the server on")
    args = parser.parse_args()

    if args.dev:
        server_config.dev_mode = True
        print("Development mode enabled", flush=True)

    if args.port:
        server_config.port = args.port

    uvicorn.run(
        app,
        host=server_config.host,
        port=server_config.port,
    )


def dev_main() -> None:
    """Entry point for the dev server (forces --dev)"""
    import sys

    if "--dev" not in sys.argv:
        sys.argv.append("--dev")
    main()


if __name__ == "__main__":
    main()
