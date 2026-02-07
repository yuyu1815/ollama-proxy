"""Ollamaレスポンス変換モジュール

LiteLLMレスポンスをOllama形式に変換する
"""

from datetime import UTC, datetime
from typing import Any


def get_timestamp() -> str:
    """Ollama形式のタイムスタンプを取得"""
    return datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


def ns_from_seconds(seconds: float) -> int:
    """秒をナノ秒に変換"""
    return int(seconds * 1e9)


def to_ollama_generate_response(
    content: str,
    model_name: str,
    duration_seconds: float,
    prompt_tokens: int = 0,
    completion_tokens: int = 0,
) -> dict[str, Any]:
    """生成レスポンスをOllama形式に変換

    Args:
        content: 生成されたテキスト
        model_name: Ollamaモデル名
        duration_seconds: 処理時間（秒）
        prompt_tokens: プロンプトトークン数
        completion_tokens: 生成トークン数

    Returns:
        Ollama形式のレスポンス
    """
    return {
        "model": model_name,
        "created_at": get_timestamp(),
        "response": content,
        "done": True,
        "done_reason": "stop",
        "context": [],
        "total_duration": ns_from_seconds(duration_seconds),
        "load_duration": 0,
        "prompt_eval_count": prompt_tokens,
        "prompt_eval_duration": 0,
        "eval_count": completion_tokens,
        "eval_duration": 0,
    }


def to_ollama_generate_stream_chunk(
    content: str,
    model_name: str,
    done: bool = False,
) -> dict[str, Any]:
    """ストリーミング生成レスポンスのチャンクをOllama形式に変換

    Args:
        content: チャンクのテキスト
        model_name: Ollamaモデル名
        done: 最終チャンクかどうか

    Returns:
        Ollama形式のチャンク
    """
    data: dict[str, Any] = {
        "model": model_name,
        "created_at": get_timestamp(),
        "response": content,
        "done": done,
    }

    if done:
        data["done_reason"] = "stop"
        data["context"] = []
        data["total_duration"] = 0
        data["load_duration"] = 0
        data["prompt_eval_count"] = 0
        data["prompt_eval_duration"] = 0
        data["eval_count"] = 0
        data["eval_duration"] = 0

    return data


def to_ollama_chat_response(
    content: str,
    model_name: str,
    duration_seconds: float,
    prompt_tokens: int = 0,
    completion_tokens: int = 0,
    tool_calls: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """チャットレスポンスをOllama形式に変換

    Args:
        content: 生成されたテキスト
        model_name: Ollamaモデル名
        duration_seconds: 処理時間（秒）
        prompt_tokens: プロンプトトークン数
        completion_tokens: 生成トークン数

    Returns:
        Ollama形式のレスポンス
    """
    return {
        "model": model_name,
        "created_at": get_timestamp(),
        "message": {
            "role": "assistant",
            "content": content,
            "images": None,
            "tool_calls": tool_calls or [],
        },
        "done": True,
        "done_reason": "stop",
        "total_duration": ns_from_seconds(duration_seconds),
        "load_duration": 0,
        "prompt_eval_count": prompt_tokens,
        "prompt_eval_duration": 0,
        "eval_count": completion_tokens,
        "eval_duration": 0,
    }


def to_ollama_chat_stream_chunk(
    content: str,
    model_name: str,
    done: bool = False,
    tool_calls: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """ストリーミングチャットレスポンスのチャンクをOllama形式に変換

    Args:
        content: チャンクのテキスト
        model_name: Ollamaモデル名
        done: 最終チャンクかどうか

    Returns:
        Ollama形式のチャンク
    """
    data: dict[str, Any] = {
        "model": model_name,
        "created_at": get_timestamp(),
        "message": {
            "role": "assistant",
            "content": content,
            "images": None,
            "tool_calls": tool_calls or [],
        },
        "done": done,
    }

    if done:
        data["done_reason"] = "stop"
        data["total_duration"] = 0
        data["load_duration"] = 0
        data["prompt_eval_count"] = 0
        data["prompt_eval_duration"] = 0
        data["eval_count"] = 0
        data["eval_duration"] = 0

    return data


def to_ollama_model_info(
    model_name: str,
    provider: str,
    litellm_model: str,
) -> dict[str, Any]:
    """モデル情報をOllama形式に変換

    Args:
        model_name: Ollamaモデル名
        provider: プロバイダー名
        litellm_model: LiteLLMモデル名

    Returns:
        Ollama形式のモデル情報
    """
    return {
        "modelfile": f"# Model: {model_name}\nFROM {provider}/{litellm_model}",
        "parameters": "",
        "template": "",
        "details": {
            "format": "api",
            "family": provider,
            "families": None,
            "parameter_size": "unknown",
            "quantization_level": "none",
        },
        "model_info": {
            "general.architecture": "api",
            "general.name": model_name,
        },
        "license": "",
    }


def to_ollama_model_list_item(
    model_name: str,
    provider: str,
    litellm_model: str,
) -> dict[str, Any]:
    """モデル一覧アイテムをOllama形式に変換

    Args:
        model_name: Ollamaモデル名
        provider: プロバイダー名
        litellm_model: LiteLLMモデル名

    Returns:
        Ollama形式のモデル情報
    """
    return {
        "name": model_name,
        "model": model_name,
        "modified_at": get_timestamp(),
        "size": 0,
        "digest": f"{provider}/{litellm_model}",
        "details": {
            "format": "api",
            "family": provider,
            "families": None,
            "parameter_size": "unknown",
            "quantization_level": "none",
        },
    }
