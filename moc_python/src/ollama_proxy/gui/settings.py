"""設定ページ"""

import streamlit as st

from ollama_proxy.storage import Storage

st.title("⚙️ プロバイダー設定")

storage = Storage()

# LiteLLMプロバイダー定義
# カテゴリ別に整理 (LiteLLM公式ドキュメントに基づき大幅に拡張)
LITELLM_PROVIDER_CATEGORIES = {
    "主要・一般": [
        "openai",
        "anthropic",
        "gemini",
        "deepseek",
        "mistral",
        "groq",
        "openrouter",
        "perplexity",
        "together_ai",
        "xai",
        "meta_llama",
        "chatgpt",
    ],
    "クラウド・インフラ": [
        "azure",
        "vertex_ai",
        "bedrock",
        "amazon_nova",
        "aws_sagemaker",
        "azure_ai",
        "databricks",
        "datarobot",
        "cloudflare",
        "github",
        "oci",
        "ovhcloud",
        "sap",
        "snowflake",
        "gmi",
        "heroku",
    ],
    "推論ホスト": [
        "baseten",
        "huggingface",
        "fireworks_ai",
        "deepinfra",
        "anyscale",
        "replicate",
        "voyage",
        "friendliai",
        "lambda_ai",
        "hyperbolic",
        "nscale",
        "novita",
        "predibase",
        "nvidia_nim",
        "watsonx",
        "aiml",
        "aleph_alpha",
        "ai21",
        "clarifai",
        "cerebras",
        "sambanova",
        "featherless_ai",
        "galadriel",
        "nebius",
        "bytez",
        "chutes",
        "morph",
        "gradient_ai",
        "compactifai",
        "apertis",
        "public_ai",
        "topaz",
        "synthetic",
        "xiaomi_mimo",
        "nano-gpt",
    ],
    "ローカル・サーバー": [
        "ollama",
        "vllm",
        "llamafile",
        "lm_studio",
        "xinference",
        "triton-inference-server",
        "docker_model_runner",
        "petals",
        "infinity",
    ],
    "エージェント・ゲートウェイ": [
        "langgraph",
        "pydantic_ai_agent",
        "manus",
        "v0",
        "vercel_ai_gateway",
        "helicone",
        "litellm_proxy",
        "llamagate",
        "unify",
        "github_copilot",
        "poe",
        "ragflow",
        "comet_api",
        "wandb_inference",
    ],
    "特定地域・ブランド": [
        "dashscope",
        "minimax",
        "moonshot",
        "nlp_cloud",
        "sarvam",
        "volcano",
        "zai",
        "lemonade",
        "baichuan",
        "sensetime",
        "yi",
        "codestral",
    ],
    "オーディオ・画像・検索": [
        "deepgram",
        "elevenlabs",
        "fal_ai",
        "runwayml",
        "stability",
        "recraft",
        "jina_ai",
        "milvus_vector_stores",
        "cohere",
    ],
    "その他・実験的": [
        "abliteration",
    ],
}
# フラットなリストも生成 (custom_openai はカタログからは削除したが、有効なプロバイダーとして保持)
LITELLM_PROVIDERS = [p for cats in LITELLM_PROVIDER_CATEGORIES.values() for p in cats] + ["custom_openai"]

# デフォルトで表示する主要プロバイダー (最低限に限定 + Anthropic/Custom)
DEFAULT_VISIBLE_PROVIDERS = [
    "openai",
    "anthropic",
    "gemini",
    "openrouter",
    "custom_openai",
]

# ストレージからUI設定を読み込み
ui_settings = storage.get_ui_settings()

if "visible_providers" not in st.session_state:
    st.session_state.visible_providers = ui_settings.get(
        "visible_providers", list(DEFAULT_VISIBLE_PROVIDERS)
    )

# custom_openai が万が一リストにない場合は強制追加
if "custom_openai" not in st.session_state.visible_providers:
    st.session_state.visible_providers.append("custom_openai")

if "selected_provider_type" not in st.session_state:
    st.session_state.selected_provider_type = st.session_state.visible_providers[0]


def _set_provider(p: str):
    """プロバイダーの選択状態のみを更新する"""
    st.session_state.selected_provider_type = p


def _toggle_provider(p: str):
    """プロバイダーを表示リストに追加/削除し、必要に応じて選択状態を更新する"""
    if p in st.session_state.visible_providers:
        if p == "custom_openai":
            st.warning("⚠️ **custom_openai** はシステム上の理由で削除できません。")
            return
        st.session_state.visible_providers.remove(p)
        st.toast(f"🗑️ **{p}** を設定対象から外しました。")
    else:
        st.session_state.visible_providers.append(p)
        st.session_state.selected_provider_type = p
        st.toast(f"➕ **{p}** を設定対象に追加しました。")

    # 永続化
    storage.save_ui_settings({"visible_providers": st.session_state.visible_providers})


def _render_provider_selection() -> str:
    """プロバイダー選択ボタンのレンダリング"""
    st.subheader("プロバイダー名を選択")

    # 検索機能
    search_query = st.text_input(
        "🔍 プロバイダーを検索",
        placeholder="例: deepseek, openai...",
        key="provider_search_box"
    )


    # 検索フィルタリング
    filtered_providers = [
        p for p in LITELLM_PROVIDERS if search_query.lower() in p.lower()
    ]

    if not filtered_providers:
        st.warning(f"'{search_query}' に一致するプロバイダーが見つかりません。")
        # 結果がなくても関数を抜けない（タブ内のレンダリングを完結させる）

    # フィルタリングされた結果を表示（検索中か否かで表示を分ける）
    if search_query:
        cols = st.columns(4)
        for i, p in enumerate(filtered_providers):
            col = cols[i % 4]
            is_visible = p in st.session_state.visible_providers
            col.button(
                p,
                key=f"search_btn_provider_{p}",
                use_container_width=True,
                type="primary" if is_visible else "secondary",
                on_click=_toggle_provider,
                args=(p,),
            )
    else:
        # カテゴリ別に表示
        for category, providers in LITELLM_PROVIDER_CATEGORIES.items():
            is_main = category == "主要・一般"
            with st.expander(f"**{category}**", expanded=not is_main):
                cols = st.columns(4)
                for i, p in enumerate(providers):
                    col = cols[i % 4]
                    is_visible = p in st.session_state.visible_providers
                    col.button(
                        p,
                        key=f"btn_provider_{p}",
                        use_container_width=True,
                        type="primary" if is_visible else "secondary",
                        on_click=_toggle_provider,
                        args=(p,),
                    )

    provider = st.session_state.selected_provider_type
    if provider not in LITELLM_PROVIDERS:
        provider = LITELLM_PROVIDERS[0]
        st.session_state.selected_provider_type = provider

    st.success(f"現在選択中: **{provider}**")
    return provider


def _get_unique_provider_name(base_name: str, existing_providers: dict) -> str:
    """重複しないプロバイダー名を生成"""
    name = base_name
    counter = 2
    while name in existing_providers:
        name = f"{base_name}_{counter}"
        counter += 1
    return name


def _validate_and_save_provider(
    storage: Storage,
    provider: str,
    name: str,
    api_key: str | None,
    base_url: str | None,
):
    """プロバイダーの保存ロジック"""
    # 名前が空の場合は自動生成
    if not name:
        existing_providers = storage.list_providers()
        name = _get_unique_provider_name(provider, existing_providers)
        st.info(f"プロファイル名が自動的に設定されました: {name}")

    config = {
        "name": name,
        "provider": provider,
        "api_key": api_key if api_key else None,
        "base_url": base_url if base_url else None,
        "model": None,
        "additional_params": {},
    }

    # 保存前の重複チェック
    existing_providers = storage.list_providers()
    save_name = name

    if name in existing_providers:
        existing_p_config = existing_providers[name]
        if existing_p_config.get("provider") == provider:
            st.error(f"プロバイダー '{name}' はタイプ '{provider}' で既に存在します。")
            return

        # 名前は同じだがタイプが違う -> キーを変更
        save_name = f"{name} ({provider})"
        if save_name in existing_providers:
            st.error(f"プロバイダー '{save_name}' は既に存在します。")
            return

        st.warning(
            f"プロファイル名 '{name}' は使用中です。代わりに '{save_name}' として保存されます。"
        )

    if save_name:
        config["name"] = save_name
        storage.save_provider(save_name, config)  # type: ignore
        st.success(f"プロバイダー '{save_name}' を正常に保存しました！")


def _render_add_provider_form(storage: Storage, provider: str):
    """プロバイダー追加フォームのレンダリング"""
    with st.form("add_provider_form"):
        api_key = st.text_input("APIキー", type="password")

        base_url = None
        if provider == "custom_openai":
            base_url = st.text_input(
                "ベースURL (オプション)", placeholder="https://api.example.com/v1"
            )

        with st.expander("高度な設定"):
            name = st.text_input("プロファイル名（ユニーク）", placeholder="my-gpt-4")

        submitted = st.form_submit_button("プロバイダーを保存")

        if submitted:
            _validate_and_save_provider(storage, provider, name, api_key, base_url)


def _mask_api_key(api_key: str | None) -> str:
    """APIキーをマスク表示 (例: sk-****1234)"""
    if not api_key:
        return "未設定"
    if len(api_key) <= 8:
        return "********"
    return f"{api_key[:3]}****{api_key[-4:]}"


def _handle_provider_deletion(storage: Storage, providers: dict, selected_rows: list):
    """プロバイダー削除の処理"""
    provider_names = list(providers.keys())
    count = len(selected_rows)

    st.warning(f"{count} 個のプロバイダーが削除対象として選択されました。")
    st.warning(
        "⚠️ 注意: プロバイダーを削除すると、関連するモデル設定も削除される可能性があります。"
    )

    if st.button(
        f"選択した {count} 個のプロバイダーを削除",
        type="primary",
        key="delete_selected_providers",
    ):
        items_to_delete = [provider_names[i] for i in selected_rows]
        for name in items_to_delete:
            storage.delete_provider(name)
        st.success(f"{count} 個のプロバイダーを削除しました。")
        st.rerun()


def _render_existing_providers(storage: Storage):
    """既存プロバイダーリストの表示と削除機能"""
    st.subheader("設定済みのプロバイダー")
    providers = storage.list_providers()

    if not providers:
        st.info("プロバイダーがまだ設定されていません。")
        return

    # データフレーム用のデータを作成
    data = []
    for name, config in providers.items():
        data.append(
            {
                "プロファイル名": name,
                "プロバイダー": config.get("provider"),
                "APIキー": _mask_api_key(config.get("api_key")),
                "ベースURL": config.get("base_url") or "デフォルト",
            }
        )

    # テーブル表示
    event = st.dataframe(
        data,
        use_container_width=True,
        on_select="rerun",
        selection_mode="multi-row",
        hide_index=True,
    )

    if event.selection and event.selection.rows:
        _handle_provider_deletion(storage, providers, event.selection.rows)


# --- モデル関連 ---

if "selected_model_provider" not in st.session_state:
    st.session_state.selected_model_provider = None


def _set_model_provider(p: str):
    st.session_state.selected_model_provider = p


def _render_model_provider_selection(storage: Storage) -> str | None:
    """モデル追加用のプロバイダー選択"""
    providers = storage.list_providers()
    provider_names = list(providers.keys())

    if not provider_names:
        st.warning(
            "プロバイダーが見つかりません。最初にプロバイダーを追加してください。"
        )
        return None

    # 初期選択の設定
    if st.session_state.selected_model_provider not in provider_names:
        st.session_state.selected_model_provider = provider_names[0]

    cols_m = st.columns(4)
    for i, p in enumerate(provider_names):
        col_m = cols_m[i % 4]
        is_selected_m = st.session_state.selected_model_provider == p

        # ラベルの決定
        provider_type = providers[p].get("provider")
        label = p
        if provider_type and p != provider_type:
            label = f"{p} ({provider_type})"

        col_m.button(
            label,
            key=f"btn_model_provider_{p}",
            use_container_width=True,
            type="primary" if is_selected_m else "secondary",
            on_click=_set_model_provider,
            args=(p,),
        )

    selected_provider_name = st.session_state.selected_model_provider
    st.caption(f"モデル用の選択されたプロバイダー: **{selected_provider_name}**")
    return selected_provider_name


def _get_unique_model_key(
    storage: Storage, model_name_input: str, selected_provider_name: str
) -> str | None:
    """ユニークなモデルキーを生成・検証"""
    existing_models = storage.list_models_flat()

    if model_name_input in existing_models:
        existing_config = existing_models[model_name_input]

        # 名前もプロバイダーも同じ -> 重複エラー
        if existing_config.get("provider_name") == selected_provider_name:
            st.error(
                f"モデル '{model_name_input}' はプロバイダー "
                f"'{selected_provider_name}' で既に存在します。"
            )
            return None

        # 名前は同じだがプロバイダーが違う -> キーを変更して登録許可
        suffix = f" ({selected_provider_name})"
        base_candidate = model_name_input
        if not model_name_input.endswith(suffix):
            base_candidate = f"{model_name_input}{suffix}"

        # ユニークな名前を探す
        save_key = base_candidate
        counter = 2
        while save_key in existing_models:
            if existing_models[save_key].get("provider_name") == selected_provider_name:
                st.error(f"モデル '{save_key}' は既に存在します。")
                return None
            save_key = f"{base_candidate}_{counter}"
            counter += 1

        st.warning(
            f"モデル名 '{model_name_input}' は使用中です。"
            f"代わりに '{save_key}' として保存されます。"
        )
        return save_key

    return model_name_input


def _save_model(
    storage: Storage,
    selected_provider_name: str,
    model_name_input: str,
    actual_model_name: str,
    reasoning_effort: str | None,
    thinking_budget: int | None,
):
    """モデル保存の実行"""
    save_key = _get_unique_model_key(storage, model_name_input, selected_provider_name)
    if save_key:
        model_config = {
            "name": save_key,
            "model_name": actual_model_name,
            "reasoning_effort": reasoning_effort,
            "thinking_budget": thinking_budget,
        }
        storage.save_model(selected_provider_name, model_config)  # type: ignore
        st.success(f"モデル '{save_key}' を正常に保存しました！")
        st.rerun()


def _render_add_model_form(storage: Storage, selected_provider_name: str | None):
    """モデル追加フォームのレンダリング"""
    # with st.form("add_model_form"):  <-- Form removed to allow callbacks
    model_name_input = st.text_input(
        "モデル名（ユニークID）", placeholder="my-gpt-4-model"
    )
    actual_model_name = st.text_input(
        "実際のモデル名（例: gpt-4, claude-3-opus）", placeholder="gpt-4"
    )

    with st.expander("高度な設定"):
        st.caption("思考(Thinking)設定")
        st.caption("※Thinking LevelとThinking Budgetは排他的です。片方を設定するともう片方はクリアされます。")

        # Session State keys for callbacks
        k_effort = f"effort_{selected_provider_name}"
        k_budget = f"budget_{selected_provider_name}"

        # Callbacks for mutual exclusivity
        def _on_effort_change():
            if st.session_state.get(k_effort) and st.session_state[k_effort] != "disable":
                st.session_state[k_budget] = None

        def _on_budget_change():
            if st.session_state.get(k_budget):
                st.session_state[k_effort] = "disable"

        # 1. Reasoning Effort (Thinking Level)
        # st.pills is available in recent streamlits
        reasoning_effort = st.pills(
            "Thinking Level (reasoning_effort)",
            options=["disable", "none", "low", "medium", "high"],
            default="disable",
            selection_mode="single",
            key=k_effort,
            on_change=_on_effort_change,
        )

        # 2. Thinking Budget
        thinking_budget = st.number_input(
            "Thinking Budget (tokens)",
            min_value=0,
            step=1024,
            value=None,
            placeholder="例: 1024 (0 or empty to disable)",
            key=k_budget,
            on_change=_on_budget_change,
        )
        # 0 means None/Disabled for budget
        if thinking_budget == 0:
            thinking_budget = None

    if st.button("モデルを保存"):
        if not selected_provider_name:
            st.error("プロバイダーを選択してください。")
        elif not model_name_input:
            st.error("モデル名を入力してください。")

        elif not actual_model_name:
            st.error("実際のモデル名を入力してください。")
        else:
            _save_model(
                storage,
                selected_provider_name,
                model_name_input,
                actual_model_name,
                reasoning_effort if reasoning_effort != "disable" else None,
                int(thinking_budget) if thinking_budget else None,
            )


def _handle_model_deletion(storage: Storage, models: dict, selected_rows: list):
    """モデル削除の処理"""
    model_ids = list(models.keys())
    count = len(selected_rows)

    st.warning(f"{count} 個のモデルが削除対象として選択されました。")

    if st.button(
        f"選択した {count} 個のモデルを削除",
        type="primary",
        key="delete_selected_models",
    ):
        items_to_delete = [model_ids[i] for i in selected_rows]
        for mid in items_to_delete:
            storage.delete_model(mid)
        st.success(f"{count} 個のモデルを削除しました。")
        st.rerun()


def _render_existing_models(storage: Storage):
    """既存モデルリストの表示と削除機能"""
    st.subheader("設定済みのモデル")
    models = storage.list_models_flat()

    if not models:
        st.info("モデルがまだ設定されていません。")
        return

    # データフレーム用のデータを作成
    data = []
    for model_id, config in models.items():
        data.append(
            {
                "ID": model_id,
                "プロバイダー": config.get("provider_name"),
                "実際のモデル": config.get("model_name", "不明"),
                "Thinking Level": config.get("reasoning_effort") or "-",
                "Thinking Token": config.get("thinking_budget") or "-",
            }
        )

    # テーブル表示
    event = st.dataframe(
        data,
        use_container_width=True,
        on_select="rerun",
        selection_mode="multi-row",
        hide_index=True,
    )

    if event.selection and event.selection.rows:
        _handle_model_deletion(storage, models, event.selection.rows)


# --- メイン処理 ---

tab_settings, tab_search = st.tabs(["⚙️ 設定と管理", "🔍 プロバイダーを探す"])

with tab_settings:
    # 1. プロバイダー設定
    st.header("プロバイダー設定")
    
    # ボタン式セレクター
    cols_sel = st.columns(4)
    for i, p in enumerate(st.session_state.visible_providers):
        col_sel = cols_sel[i % 4]
        is_selected = st.session_state.selected_provider_type == p
        col_sel.button(
            p,
            key=f"config_sel_{p}",
            use_container_width=True,
            type="primary" if is_selected else "secondary",
            on_click=_set_provider,
            args=(p,)
        )
    
    selected_p = st.session_state.selected_provider_type
    st.caption(f"ターゲット: **{selected_p}**")
    _render_add_provider_form(storage, selected_p)

    st.divider()

    # 2. 既存プロバイダー一覧
    _render_existing_providers(storage)

    st.divider()

    # 3. モデル設定
    st.header("モデル設定")
    selected_model_provider = _render_model_provider_selection(storage)
    _render_add_model_form(storage, selected_model_provider)

    st.divider()

    # 4. 既存モデル一覧
    _render_existing_models(storage)


with tab_search:
    st.header("プロバイダーを探す (カタログ)")
    st.info("使いたいプロバイダーのボタンを押すと、自動的に「⚙️ 設定と管理」タブの選択肢に追加されます。")
    _render_provider_selection()
