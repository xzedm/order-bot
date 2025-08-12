import axios from 'axios';

export type ChatMessage = { role: 'system'|'user'|'assistant'; content: string };

export class AzureOpenAIClient {
  private endpoint = process.env.AZURE_OPENAI_ENDPOINT!;
  private apiKey = process.env.AZURE_OPENAI_KEY!;
  private deployment = process.env.AZURE_OPENAI_DEPLOYMENT!;
  private apiVersion = process.env.AZURE_OPENAI_API_VERSION || '2025-01-01-preview';

  async chat(messages: ChatMessage[], opts?: { temperature?: number; max_tokens?: number; response_format?: any }) {
    const res = await axios.post(
      `${this.endpoint}openai/deployments/${this.deployment}/chat/completions?api-version=${this.apiVersion}`,
      {
        messages,
        temperature: opts?.temperature ?? 0,
        max_tokens: opts?.max_tokens ?? 600,
        ...(opts?.response_format ? { response_format: opts.response_format } : {})
      },
      { headers: { 'api-key': this.apiKey } }
    );
    return res.data?.choices?.[0]?.message?.content as string | undefined;
  }
}
