"""シンプルなLiteLLM呼び出しテスト

providers.json の設定に基づいて LiteLLM でチャットを実行する
"""

import litellm


def chat(model_name: str, message: str):
    """LiteLLM でチャットを実行

    Args:
        model_name: providers.json で定義したモデル名
        message: 送信するメッセージ
    """

    # API呼び出し
    response = litellm.completion(
        model=f"ollama/{model_name}", messages=[{"role": "user", "content": message}]
    )

    return response.choices[0].message.content


def chat_stream(model_name: str, message: str):
    """LiteLLM でチャットを実行（ストリーミング）

    Args:
        model_name: providers.json で定義したモデル名
        message: 送信するメッセージ
    """

    # API呼び出し（ストリーミング）
    response = litellm.completion(
        model=f"ollama/{model_name}",
        messages=[{"role": "user", "content": message}],
        stream=True,
    )

    for chunk in response:
        if chunk.choices[0].delta.content:
            yield chunk.choices[0].delta.content


if __name__ == "__main__":
    # 使用例（ストリーミング）
    for chunk in chat_stream("lamma23", "寿限無寿限無"):
        print(chunk, end="]", flush=True)
    print()
