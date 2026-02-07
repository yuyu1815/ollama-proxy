# Tool Calling (ツール呼び出し)

Ollama 0.3は、Llama 3.1などの一般的なモデルでのツール呼び出し（Tool Calling）をサポートしています。これにより、モデルは与えられたツールについての情報を用いて、質問に答えるために必要な関数とその引数を決定し、JSON形式で出力することができます。

---

## 目次

1. [単一ツールの呼び出し (Calling a single tool)](#単一ツールの呼び出し-calling-a-single-tool)
2. [並列ツール呼び出し (Parallel tool calling)](#並列ツール呼び出し-parallel-tool-calling)
3. [マルチターンツール呼び出し (Agent loop)](#マルチターンツール呼び出し-agent-loop)
4. [ストリーミングでのツール呼び出し](#ストリーミングでのツール呼び出し)

---

## 単一ツールの呼び出し (Calling a single tool)

モデルにツール定義を渡すことで、モデルはツールの使用が必要かどうかを判断します。

### cURL

```bash
curl http://localhost:11434/api/chat -d '{
  "model": "llama3.1",
  "messages": [
    { "role": "user", "content": "ニューヨークの気温はどうですか？" }
  ],
  "stream": false,
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "get_current_weather",
        "description": "指定された都市の現在の天気を取得します",
        "parameters": {
          "type": "object",
          "properties": {
            "city": {
              "type": "string",
              "description": "都市名 (例: ニューヨーク)"
            }
          },
          "required": ["city"]
        }
      }
    }
  ]
}'
```

### レスポンス例

モデルは `tool_calls` を含むメッセージを返します。

```json
{
  "model": "llama3.1",
  "created_at": "...",
  "message": {
    "role": "assistant",
    "content": "",
    "tool_calls": [
      {
        "function": {
          "name": "get_current_weather",
          "arguments": {
            "city": "New York"
          }
        }
      }
    ]
  },
  "done": true,
  ...
}
```

このレスポンスを受け取った後、クライアント側で実際に `get_current_weather` 関数を実行し、その結果を `role: tool` のメッセージとしてチャット履歴に追加して、再度モデルに送信することで、最終的な回答を得ることができます。

---

## 並列ツール呼び出し (Parallel tool calling)

モデルは、一度のレスポンスで複数のツール呼び出しを行うことができます。例えば、「ニューヨークとロンドンの天気」を尋ねられた場合などです。

### cURL

```bash
curl http://localhost:11434/api/chat -d '{
  "model": "llama3.1",
  "messages": [
    { "role": "user", "content": "ニューヨークとロンドンの天気はどうですか？" }
  ],
  "tools": [ ... ] // ツール定義
}'
```

### レスポンス例

```json
{
  "message": {
    "role": "assistant",
    "tool_calls": [
      {
        "function": {
          "name": "get_current_weather",
          "arguments": { "city": "New York" }
        }
      },
      {
        "function": {
          "name": "get_current_weather",
          "arguments": { "city": "London" }
        }
      }
    ]
  }
}
```

---

## マルチターンツール呼び出し (Agent loop)

ツール呼び出しは、複数回（マルチターン）のやり取りの中で行われることが一般的です。

1. **User**: 質問を送信
2. **Model**: ツール呼び出しが必要と判断し、`tool_calls` を返す
3. **Client**: ツール（関数）を実行
4. **Client**: ツールの実行結果を `role: tool` としてメッセージ履歴に追加し、再度モデルに送信
5. **Model**: 実行結果に基づいた最終回答を生成（またはさらなるツール呼び出し）

### Python (Ollama Python Library) の例

```python
import ollama

# ツールの実装
def add(a: int, b: int) -> int:
  return a + b

def multiply(a: int, b: int) -> int:
  return a * b

# 質問
messages = [{'role': 'user', 'content': '(10 + 5) * 2 はいくつですか？'}]

# 利用可能な関数
available_functions = {
  'add': add,
  'multiply': multiply,
}

# チャットループ
response = ollama.chat(
  model='llama3.1',
  messages=messages,
  tools=[add, multiply], # 関数を直接渡せます
)

if response['message'].get('tool_calls'):
  # モデルがツール使用を要求した場合
  for tool in response['message']['tool_calls']:
    function_name = tool['function']['name']
    function_args = tool['function']['arguments']

    # 関数実行
    function_to_call = available_functions[function_name]
    function_response = function_to_call(**function_args)

    # 結果をメッセージに追加
    messages.append(response['message']) # tool_callsを含むアシスタントメッセージ
    messages.append({
      'role': 'tool',
      'content': str(function_response),
    })

  # 結果を含めて再度呼び出し
  final_response = ollama.chat(model='llama3.1', messages=messages)
  print(final_response['message']['content'])
else:
  print(response['message']['content'])
```

---

## ストリーミングでのツール呼び出し

ストリーミング (`stream: true`) を使用する場合、ツール呼び出しの情報もチャンクとして送られてきます。クライアント側でこれらのチャンクを集約して完全なJSONオブジェクトを再構築する必要があります。

Ollamaのライブラリを使用している場合は、ライブラリがこの処理を補助してくれる場合がありますが、生のAPIを扱う場合は注意が必要です。

---

_最新の情報や詳細な仕様については、[公式ドキュメント](https://docs.ollama.com/capabilities/tool-calling)を参照してください。_
