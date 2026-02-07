"""トークン使用量追跡モジュール"""

from collections import defaultdict
from typing import TypedDict

from ollama_proxy.storage import Storage


class AggregatedStats(TypedDict):
    """集計統計情報"""

    total_input_tokens: int
    total_output_tokens: int
    count: int


class Tracker:
    """トークン使用量の追跡管理"""

    def __init__(self, storage: Storage | None = None) -> None:
        """初期化

        Args:
            storage: ストレージインスタンス (Noneの場合は新規作成)
        """
        self.storage = storage or Storage()

    def track_usage(
        self, provider: str, model: str, input_tokens: int, output_tokens: int
    ) -> None:
        """使用量を記録

        Args:
            provider: プロバイダー名
            model: モデル名
            input_tokens: 入力トークン数
            output_tokens: 出力トークン数
        """
        self.storage.add_usage_log(provider, model, input_tokens, output_tokens)

    def get_stats_by_provider(self) -> dict[str, AggregatedStats]:
        """プロバイダーごとの統計を取得"""
        logs = self.storage.get_usage_logs()
        stats: dict[str, AggregatedStats] = defaultdict(
            lambda: {"total_input_tokens": 0, "total_output_tokens": 0, "count": 0}
        )

        for log in logs:
            provider = log["provider"]
            stats[provider]["total_input_tokens"] += log["input_tokens"]
            stats[provider]["total_output_tokens"] += log["output_tokens"]
            stats[provider]["count"] += 1

        return dict(stats)

    def get_stats_by_model(self) -> dict[str, AggregatedStats]:
        """モデルごとの統計を取得"""
        logs = self.storage.get_usage_logs()
        stats: dict[str, AggregatedStats] = defaultdict(
            lambda: {"total_input_tokens": 0, "total_output_tokens": 0, "count": 0}
        )

        for log in logs:
            model = log["model"]
            stats[model]["total_input_tokens"] += log["input_tokens"]
            stats[model]["total_output_tokens"] += log["output_tokens"]
            stats[model]["count"] += 1

        return dict(stats)

    def get_daily_stats(self) -> dict[str, AggregatedStats]:
        """日次統計を取得 (YYYY-MM-DD)"""
        logs = self.storage.get_usage_logs()
        stats: dict[str, AggregatedStats] = defaultdict(
            lambda: {"total_input_tokens": 0, "total_output_tokens": 0, "count": 0}
        )

        for log in logs:
            # ISO format: YYYY-MM-DDTHH:MM:SS.mmmmmm
            date_str = log["timestamp"].split("T")[0]
            stats[date_str]["total_input_tokens"] += log["input_tokens"]
            stats[date_str]["total_output_tokens"] += log["output_tokens"]
            stats[date_str]["count"] += 1

        return dict(stats)
