"""設定管理モジュール

providers.json と config.json を管理し、ファイル変更を監視する
"""

import json
from dataclasses import dataclass, field
from pathlib import Path
from threading import Lock

from watchdog.events import FileSystemEventHandler
from watchdog.observers import Observer


@dataclass
class LiteLLMConfig:
    """LiteLLM用設定"""

    provider: str
    model_name: str
    api_key: str | None = None
    base_url: str | None = None
    reasoning_effort: str | None = None
    thinking_budget: int | None = None
    additional_params: dict = field(default_factory=dict)


@dataclass
class ServerConfig:
    """サーバー設定"""

    host: str = "127.0.0.1"
    port: int = 11434
    providers_file: str = "~/.ollama-proxy/providers.json"
    log_level: str = "info"
    dev_mode: bool = False


class ProvidersConfigHandler(FileSystemEventHandler):
    """providers.json変更ハンドラー"""

    def __init__(self, manager: "ConfigManager") -> None:
        self.manager = manager

    def on_modified(self, event) -> None:
        if event.src_path.endswith("providers.json"):
            self.manager.reload_providers()


class ConfigManager:
    """設定管理クラス

    providers.json を監視し、変更時に自動リロードする
    """

    def __init__(self, config_path: str | None = None) -> None:
        """初期化

        Args:
            config_path: config.json のパス（Noneの場合は ~/.ollama-proxy/config.json）
        """
        self.config_dir = Path.home() / ".ollama-proxy"

        if config_path is None:
            config_path = self.config_dir / "config.json"
        else:
            config_path = Path(config_path).expanduser()

        self.config_path = config_path
        self.providers_path = self.config_dir / "providers.json"

        self._providers: dict[str, LiteLLMConfig] = {}
        self._server_config: ServerConfig = ServerConfig()
        self._lock = Lock()
        self._observer: Observer | None = None

        # 初期読み込み
        self._load_server_config()
        self.reload_providers()

        # ファイル監視開始
        self._start_watching()

    def _load_server_config(self) -> None:
        """サーバー設定を読み込み"""
        if self.config_path.exists():
            try:
                with open(self.config_path, encoding="utf-8") as f:
                    data = json.load(f)
                self._server_config = ServerConfig(**data)
            except (json.JSONDecodeError, TypeError) as e:
                print(f"Warning: Failed to load config.json: {e}")
        else:
            # デフォルト設定を保存
            self._save_server_config()

    def _save_server_config(self) -> None:
        """サーバー設定を保存"""
        self.config_dir.mkdir(parents=True, exist_ok=True)
        data = {
            "host": self._server_config.host,
            "port": self._server_config.port,
            "providers_file": str(self._server_config.providers_file),
            "log_level": self._server_config.log_level,
        }
        with open(self.config_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)

    def reload_providers(self) -> None:
        """providers.json を再読み込み"""
        if not self.providers_path.exists():
            print(f"Warning: {self.providers_path} not found")
            return

        try:
            with open(self.providers_path, encoding="utf-8") as f:
                providers_data = json.load(f)
        except json.JSONDecodeError as e:
            print(f"Warning: Failed to parse providers.json: {e}")
            return

        new_providers: dict[str, LiteLLMConfig] = {}

        for provider_id, config in providers_data.items():
            provider_type = config.get("provider", provider_id)
            api_key = config.get("api_key")
            base_url = config.get("base_url")
            additional_params = config.get("additional_params", {})

            for model in config.get("models", []):
                ollama_name = model["name"]
                litellm_model_name = model["model_name"]
                reasoning_effort = model.get("reasoning_effort")
                thinking_budget = model.get("thinking_budget")

                new_providers[ollama_name] = LiteLLMConfig(
                    provider=provider_type,
                    model_name=litellm_model_name,
                    api_key=api_key,
                    base_url=base_url,
                    reasoning_effort=reasoning_effort,
                    thinking_budget=thinking_budget,
                    additional_params=additional_params,
                )

        with self._lock:
            self._providers = new_providers

        print(f"Reloaded providers: {len(new_providers)} models")

    def _start_watching(self) -> None:
        """ファイル監視を開始"""
        if self._observer is not None:
            return

        handler = ProvidersConfigHandler(self)
        self._observer = Observer()
        self._observer.schedule(handler, str(self.config_dir), recursive=False)
        self._observer.start()

    def stop_watching(self) -> None:
        """ファイル監視を停止"""
        if self._observer is not None:
            self._observer.stop()
            self._observer.join()
            self._observer = None

    def get_litellm_config(self, ollama_name: str) -> LiteLLMConfig | None:
        """Ollamaモデル名からLiteLLM設定を取得

        Args:
            ollama_name: Ollama形式のモデル名

        Returns:
            LiteLLM設定、見つからない場合はNone
        """
        with self._lock:
            return self._providers.get(ollama_name)

    def list_models(self) -> list[str]:
        """利用可能なモデル名一覧を取得

        Returns:
            モデル名のリスト
        """
        with self._lock:
            return list(self._providers.keys())

    def get_server_config(self) -> ServerConfig:
        """サーバー設定を取得

        Returns:
            サーバー設定
        """
        return self._server_config

    def __del__(self) -> None:
        """デストラクタ - 監視を停止"""
        self.stop_watching()
