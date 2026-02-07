import sys
import litellm
from litellm.utils import trim_messages

# Server configuration
BASE_URL = "http://localhost:11434"

def test_tool_calling(model_name="llama2"):
    print(f"モデル: {model_name} でツール呼び出しをテストします")
    
    tools = [
        {
            "type": "function",
            "function": {
                "name": "get_current_weather",
                "description": "Get the current weather",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "city": {
                            "type": "string",
                            "description": "The city to get the weather for"
                        }
                    },
                    "required": ["city"]
                }
            }
        }
    ]

    try:
        # LiteLLMを使ってプロキシサーバーにリクエストを送信
        # api_base を指定して、起動中のプロキシ(11435)に向ける
        response = litellm.completion(
            model=f"ollama/{model_name}",
            messages=[{"role": "user", "content": "What is the weather in Tokyo?"}],
            tools=tools,
            api_base=BASE_URL,
            stream=False,
            timeout=120.0
        )

        print("\nレスポンス:")
        print(response)

        choices = response.choices
        if not choices:
            print("\n[失敗] choices が空です。")
            return

        message = choices[0].message
        
        # tool_calls の存在確認
        if not hasattr(message, "tool_calls") or message.tool_calls is None:
             print("\n[情報] 'tool_calls' は空です（モデルはツールを使用しませんでした）。")
             return
             
        if len(message.tool_calls) == 0:
            print("\n[情報] 'tool_calls' は空リストです。")
            return

        print("\n[成功] ツール呼び出しが検出されました。")
        for tc in message.tool_calls:
            print(f"  - 関数名: {tc.function.name}")
            print(f"    引数: {tc.function.arguments}")

    except Exception as e:
        print(f"\n[エラー] リクエスト失敗: {e}")

if __name__ == "__main__":
    model = sys.argv[1] if len(sys.argv) > 1 else "llama2"
    test_tool_calling(model)
