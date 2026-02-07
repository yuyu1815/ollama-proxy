"""データ永続化モジュール (JSONベース)"""

import json
from datetime import datetime
from pathlib import Path
from typing import Any, TypedDict


class ProviderConfig(TypedDict):
    """プロバイダー設定"""

    provider: str  # LiteLLM provider name
    api_key: str | None
    base_url: str | None
    model: str | None
    additional_params: dict[str, Any]
    models: list["ModelConfig"]


class UsageLog(TypedDict):
    """使用量ログ"""

    timestamp: str
    provider: str
    model: str
    input_tokens: int
    output_tokens: int


class ModelConfig(TypedDict):
    """モデル設定"""

    name: str  # ユニークID (旧キー名)
    model_name: str  # 実際のモデル名 (例: gpt-4)
    reasoning_effort: str | None
    thinking_budget: int | None


class Storage:
    """JSONファイルベースのストレージ管理"""

    def __init__(self, base_dir: Path | None = None) -> None:
        """初期化

        Args:
            base_dir: データ保存ディレクトリ (Noneの場合は ~/.ollama-proxy)
        """
        if base_dir is None:
            base_dir = Path.home() / ".ollama-proxy"

        self.base_dir = base_dir
        self.providers_file = self.base_dir / "providers.json"
        self.usage_file = self.base_dir / "usage_logs.json"
        self.ui_file = self.base_dir / "ui_settings.json"

        self._ensure_dir()

    def _ensure_dir(self) -> None:
        """ディレクトリと初期ファイルの作成"""
        self.base_dir.mkdir(parents=True, exist_ok=True)
        if not self.providers_file.exists():
            self._save_json(self.providers_file, {})

        if not self.usage_file.exists():
            self._save_json(self.usage_file, [])

        if not self.ui_file.exists():
            self._save_json(self.ui_file, {})

    def _load_json(self, path: Path) -> Any:
        """JSON読み込み"""
        try:
            with open(path, encoding="utf-8") as f:
                return json.load(f)
        except (json.JSONDecodeError, FileNotFoundError):
            return [] if path == self.usage_file else {}

    def _save_json(self, path: Path, data: Any) -> None:
        """JSON保存"""
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)

    def save_provider(self, name: str, config: ProviderConfig) -> None:
        """プロバイダー設定を保存"""
        providers = self._load_json(self.providers_file)
        # remove name from config to avoid redundancy
        if "name" in config:
            del config["name"]  # type: ignore
        providers[name] = config
        self._save_json(self.providers_file, providers)

    def get_provider(self, name: str) -> ProviderConfig | None:
        """プロバイダー設定を取得"""
        providers = self._load_json(self.providers_file)
        return providers.get(name)

    def list_providers(self) -> dict[str, ProviderConfig]:
        """全プロバイダー設定を取得"""
        return self._load_json(self.providers_file)  # type: ignore

    def delete_provider(self, name: str) -> None:
        """プロバイダー設定を削除"""
        providers = self._load_json(self.providers_file)
        if name in providers:
            del providers[name]
        self._save_json(self.providers_file, providers)

    def save_model(self, provider_name: str, config: ModelConfig) -> None:
        """モデル設定を保存 (プロバイダー内に追加/更新)"""
        providers = self._load_json(self.providers_file)
        if provider_name not in providers:
            raise ValueError(f"Provider '{provider_name}' not found")

        provider_config = providers[provider_name]
        models = provider_config.get("models", [])

        # 既存更新または新規追加
        # nameで一致するものを探す
        updated = False
        new_models = []
        for m in models:
            if m["name"] == config["name"]:
                new_models.append(config)
                updated = True
            else:
                new_models.append(m)

        if not updated:
            new_models.append(config)

        provider_config["models"] = new_models
        providers[provider_name] = provider_config
        self._save_json(self.providers_file, providers)

    def list_models_flat(self) -> dict[str, ModelConfig]:
        """全モデル設定を取得 (旧API互換のためフラットなDictで返す)

        Note:
             Returns dict where key is model name (ID), value has explicit 'provider_name' injected
        """
        providers = self._load_json(self.providers_file)
        result = {}

        for p_name, p_config in providers.items():
            models = p_config.get("models", [])
            for m in models:
                # 呼び出し元が期待する形式に整形
                # 旧: {"name": ..., "provider_name": ..., "model_name": ...}
                m_copy = m.copy()
                m_copy["provider_name"] = p_name
                result[m["name"]] = m_copy

        return result

    def delete_model(self, model_name: str) -> None:
        """モデル設定を削除 (全プロバイダーから検索して削除)"""
        providers = self._load_json(self.providers_file)
        changed = False

        for p_name, p_config in providers.items():
            models = p_config.get("models", [])
            original_len = len(models)
            # nameが一致しないものだけ残す
            new_models = [m for m in models if m["name"] != model_name]

            if len(new_models) != original_len:
                p_config["models"] = new_models
                changed = True

        if changed:
            self._save_json(self.providers_file, providers)

    def add_usage_log(
        self, provider: str, model: str, input_tokens: int, output_tokens: int
    ) -> None:
        """使用量ログを追加"""
        logs = self._load_json(self.usage_file)
        log_entry: UsageLog = {
            "timestamp": datetime.now().isoformat(),
            "provider": provider,
            "model": model,
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
        }
        logs.append(log_entry)
        self._save_json(self.usage_file, logs)

    def get_usage_logs(self) -> list[UsageLog]:
        """全使用量ログを取得"""
        return self._load_json(self.usage_file)  # type: ignore

    def get_ui_settings(self) -> dict[str, Any]:
        """UI設定を取得"""
        return self._load_json(self.ui_file)

    def save_ui_settings(self, settings: dict[str, Any]) -> None:
        """UI設定を保存"""
        self._save_json(self.ui_file, settings)
