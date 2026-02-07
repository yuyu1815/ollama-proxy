"""ダッシュボードページ"""

import altair as alt
import pandas as pd
import streamlit as st

from ollama_proxy.tracker import Tracker

st.title("📊 トークン使用量ダッシュボード")

tracker = Tracker()
logs = tracker.storage.get_usage_logs()

if not logs:
    st.warning("使用ログがありません。プロキシを使用するとここにデータが表示されます。")
else:
    # データをDataFrameに変換
    df = pd.DataFrame(logs)
    df["timestamp"] = pd.to_datetime(df["timestamp"])

    # 指標の計算
    total_requests = len(df)
    total_input = df["input_tokens"].sum()
    total_output = df["output_tokens"].sum()
    total_tokens = total_input + total_output

    # メトリクス表示
    col1, col2, col3, col4 = st.columns(4)
    col1.metric("総リクエスト数", total_requests)
    col2.metric("総入力トークン数", f"{total_input:,}")
    col3.metric("総出力トークン数", f"{total_output:,}")
    col4.metric("総トークン数", f"{total_tokens:,}")

    st.divider()

    # グラフセクション
    st.subheader("📈 時間別使用量")

    # 時間単位の集計 (デフォルト: 日次)
    time_grain = st.selectbox("時間単位", ["日", "時間"], index=0)

    if time_grain == "日":
        df["time_group"] = df["timestamp"].dt.date
    else:
        df["time_group"] = df["timestamp"].dt.floor("H")

    daily_stats = (
        df.groupby(["time_group", "provider"])[["input_tokens", "output_tokens"]]
        .sum()
        .reset_index()
    )

    # ロング形式に変換してAltairで積み上げグラフにしやすくする
    daily_stats_melted = daily_stats.melt(
        id_vars=["time_group", "provider"],
        value_vars=["input_tokens", "output_tokens"],
        var_name="token_type",
        value_name="count",
    )

    # Altairチャート
    chart = (
        alt.Chart(daily_stats_melted)
        .mark_bar()
        .encode(
            x=alt.X("time_group:O", title="時間"),
            y=alt.Y("count:Q", title="トークン数"),
            color=alt.Color("token_type:N", title="タイプ"),
            tooltip=["time_group", "provider", "token_type", "count"],
        )
        .interactive()
    )

    st.altair_chart(chart, use_container_width=True)

    col_a, col_b = st.columns(2)

    with col_a:
        st.subheader("プロバイダー別分布")
        provider_stats = (
            df.groupby("provider")[["input_tokens", "output_tokens"]]
            .sum()
            .reset_index()
        )
        provider_stats["total"] = (
            provider_stats["input_tokens"] + provider_stats["output_tokens"]
        )

        pie = (
            alt.Chart(provider_stats)
            .mark_arc()
            .encode(
                theta=alt.Theta("total", stack=True),
                color=alt.Color("provider"),
                tooltip=["provider", "total"],
            )
        )
        st.altair_chart(pie, use_container_width=True)

    with col_b:
        st.subheader("モデル別分布")
        model_stats = (
            df.groupby("model")[["input_tokens", "output_tokens"]].sum().reset_index()
        )
        model_stats["total"] = (
            model_stats["input_tokens"] + model_stats["output_tokens"]
        )

        bar_model = (
            alt.Chart(model_stats)
            .mark_bar()
            .encode(
                x=alt.X("total", title="総トークン数"),
                y=alt.Y("model", sort="-x"),
                tooltip=["model", "total"],
            )
        )
        st.altair_chart(bar_model, use_container_width=True)

    st.divider()
    st.subheader("📋 最近のログ")
    st.dataframe(
        df.sort_values("timestamp", ascending=False).head(100), use_container_width=True
    )
