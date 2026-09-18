import os
import sys

# Ensure UTF-8 output on Windows consoles
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

from openai import OpenAI

# Token Router configuration for Moonshot Kimi-K3
API_KEY = os.getenv("TOKENROUTER_API_KEY", "sk-eyZUyyQ8ZHHQWdGaRDtRIQ4pfT26rKR3jyCm872AuOFZfC9p")
BASE_URL = os.getenv("TOKENROUTER_BASE_URL", "https://api.tokenrouter.com/v1")
DEFAULT_MODEL = "moonshotai/kimi-k3-free"

def get_kimi_client() -> OpenAI:
    """Initialize and return an OpenAI client configured for Token Router."""
    return OpenAI(
        base_url=BASE_URL,
        api_key=API_KEY,
    )

def ask_kimi(prompt: str, system_prompt: str = "You are an intelligent assistant, please reply concisely.", model: str = DEFAULT_MODEL, stream: bool = True) -> str:
    """Send a prompt to moonshotai/kimi-k3-free and return the response."""
    client = get_kimi_client()
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": prompt},
    ]

    response_stream = client.chat.completions.create(
        model=model,
        messages=messages,
        stream=stream,
        stream_options={"include_usage": True} if stream else None,
        extra_body={}
    )

    content_parts = []
    if stream:
        for chunk in response_stream:
            if chunk.choices and len(chunk.choices) > 0:
                delta = chunk.choices[0].delta
                if delta and delta.content:
                    content_parts.append(delta.content)
                    print(delta.content, end="", flush=True)
        print() # newline after streaming completes
        return "".join(content_parts)
    else:
        content = response_stream.choices[0].message.content
        print(content)
        return content

if __name__ == "__main__":
    print("--- Asking Moonshot Kimi-K3 ---")
    ask_kimi("Hello, what kind of model are you?")
