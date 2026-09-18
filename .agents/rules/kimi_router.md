# Custom Model Routing Rule: Moonshot Kimi-K3
For all subagents, scripts, code generation, LLM integrations, and background tasks in this workspace:
- **Model Name**: `moonshotai/kimi-k3-free`
- **Base URL**: `https://api.tokenrouter.com/v1`
- **API Key**: `sk-eyZUyyQ8ZHHQWdGaRDtRIQ4pfT26rKR3jyCm872AuOFZfC9p`

## Instructions for Antigravity
1. **Always Use Token Router**: Whenever generating code, executing subagents, running python scripts, or building backend integrations, route LLM requests to `moonshotai/kimi-k3-free` using the OpenAI-compatible endpoint above.
2. **OpenAI SDK Client**: Initialize standard `OpenAI` client objects with `base_url="https://api.tokenrouter.com/v1"` and `api_key="sk-eyZUyyQ8ZHHQWdGaRDtRIQ4pfT26rKR3jyCm872AuOFZfC9p"`.
3. **UTF-8 Encoding**: Ensure stdout output handling on Windows uses UTF-8 (`sys.stdout.reconfigure(encoding="utf-8")`) when streaming outputs.
