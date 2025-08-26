# LLM Integration Guide

This document provides comprehensive information about the LLM (Large Language Model) integration in the SMAIRS project, including setup, providers, capability profiles, and usage patterns.

## Overview

The SMAIRS project integrates multiple LLM providers to support various manuscript analysis and generation tasks. The system is designed with a provider-agnostic architecture that allows seamless switching between different LLM services.

## Supported Providers

### Anthropic Claude
- **Provider ID**: `anthropic:*`
- **Default Model**: `claude-3-5-sonnet-20241022`
- **Context Window**: 1,000,000 tokens
- **Capabilities**: streaming, json, cache_control
- **Cost per 1M tokens**: Input: $3, Output: $15

### OpenAI GPT
- **Provider ID**: `openai:*`
- **Default Model**: Configurable via environment
- **Context Window**: 128,000 tokens
- **Capabilities**: streaming, json
- **Cost per 1M tokens**: Input: $10, Output: $30

### Google Gemini
- **Provider ID**: `google:*`
- **Default Model**: Configurable via environment
- **Context Window**: 1,000,000 tokens
- **Capabilities**: streaming, json, grounding, safety
- **Cost per 1M tokens**: Input: $10, Output: $40

## Capability Profiles

The system defines three main capability profiles that abstract specific use cases:

### STRUCTURE_LONGCTX
- **Purpose**: Long-form manuscript structure analysis and generation
- **Default Provider**: Anthropic Claude
- **Fallback Provider**: OpenAI GPT
- **Use Cases**: Chapter analysis, synopsis generation, reveal tracking

### FAST_ITERATE
- **Purpose**: Quick feedback and iterative improvements
- **Default Provider**: OpenAI GPT
- **Fallback Provider**: Anthropic Claude
- **Use Cases**: Rapid scoring, quick evaluations, iterative writing feedback

### JUDGE_SCORER
- **Purpose**: Comparative analysis and ranking
- **Default Provider**: Google Gemini
- **Fallback Provider**: OpenAI GPT
- **Use Cases**: Candidate comparison, market analysis, quality assessment

## Environment Configuration

### Required API Keys
Set the following environment variables with your API keys:

```bash
# Anthropic
ANTHROPIC_API_KEY=your_anthropic_key_here

# OpenAI
OPENAI_API_KEY=your_openai_key_here

# Google (choose one or both)
GOOGLE_API_KEY=your_google_key_here
GEMINI_API_KEY=your_gemini_key_here
```

### Optional Configuration
```bash
# Model overrides
ANTHROPIC_MODEL=claude-3-5-sonnet-20241022
OPENAI_MODEL=gpt-4
GOOGLE_MODEL=gemini-2.0-flash-exp

# Cost configuration
ANTHROPIC_COST_INPUT_PER1M=3
ANTHROPIC_COST_OUTPUT_PER1M=15

# Context and performance
LLM_LONGCTX_ENABLE=1  # Enable long context mode
ANTHROPIC_MAX_TOKENS=4096
LLM_RETRIES=2

# Caching
ANTHROPIC_PROMPT_CACHE=1  # Enable prompt caching
ANTHROPIC_CACHE_DISCOUNT=0.5  # 50% discount for cached tokens

# Offline mode
LLM_OFFLINE=0  # Set to 1 for offline/mock mode

# Profile overrides
LLM_PROFILE__STRUCTURE=anthropic:claude-3-5-sonnet-20241022
LLM_PROFILE__FAST=openai:gpt-4o-mini
LLM_PROFILE__JUDGE=google:gemini-2.0-flash-exp
```

## Provider Factory

The `ProviderFactory` class manages provider registration and instantiation:

```typescript
import { ProviderFactory } from './provider-factory';

// Create a provider instance
const provider = ProviderFactory.create('anthropic:claude-3-5-sonnet-20241022');

// Get provider metadata
const metadata = ProviderFactory.getMetadata('anthropic:*');

// Check provider health
const health = ProviderFactory.health('anthropic:*');
```

## Usage Examples

### Basic Call
```typescript
import { resolveProvider } from './provider-factory';

const provider = resolveProvider('anthropic:claude-3-5-sonnet-20241022');

const result = await provider.call({
  system: 'You are a literary analyst.',
  prompt: 'Analyze the pacing of this manuscript...',
  temperature: 0.7,
  schema: myZodSchema  // Optional JSON schema
});

console.log(result.text);
console.log(result.usage); // { in: 150, out: 300 }
```

### Streaming Response
```typescript
const provider = resolveProvider('anthropic:*');

for await (const chunk of provider.streamText({
  prompt: 'Generate a synopsis...',
  profile: 'STRUCTURE_LONGCTX'
})) {
  process.stdout.write(chunk);
}
```

### Batch Processing
```typescript
const requests = [
  { prompt: 'Analyze chapter 1', profile: 'FAST_ITERATE' },
  { prompt: 'Analyze chapter 2', profile: 'FAST_ITERATE' }
];

const results = await provider.callBatch(requests);
```

## Error Handling

The system includes comprehensive error handling:

- **AnthropicAPIError**: General API errors
- **AnthropicAuthError**: Authentication failures
- **AnthropicRateLimitError**: Rate limit exceeded
- **AnthropicNetworkError**: Network connectivity issues

All providers include automatic retry logic with exponential backoff.

## Caching

The system implements intelligent caching to reduce costs and improve performance:

- **Global LLM Cache**: Caches responses based on model and request parameters
- **Prompt Caching**: Anthropic-specific caching for repeated prompts
- **Cache Configuration**: Configurable TTL and cache key generation

## Monitoring and Metrics

### LLM Monitor
Access real-time metrics through the global monitor:

```typescript
import { globalLLMMonitor } from './monitor';

// Get current metrics
const metrics = globalLLMMonitor.getMetrics();
console.log(metrics.totalCalls, metrics.totalTokens, metrics.totalCost);

// Get health score
const health = globalLLMMonitor.getHealthScore();

// Get alerts
const alerts = globalLLMMonitor.getAlerts();
```

### Browser API
When running in a browser environment, metrics are available via:

```javascript
window.__LLM_MONITOR__.getMetrics();
window.__LLM_MONITOR__.getDashboard();
window.__LLM_MONITOR__.getHealth();
window.__LLM_MONITOR__.getAlerts();
```

## Mock Provider

For testing and offline development, the system includes a deterministic mock provider:

```typescript
import { MockCaller } from './providers';

// Create mock provider
const mock = new MockCaller('FAST_ITERATE', 'mock:offline');

// Mock generates deterministic responses based on profile
const result = await mock.call({
  prompt: 'Test prompt',
  profile: 'STRUCTURE_LONGCTX'
});
```

## Best Practices

1. **Profile Selection**: Choose the appropriate capability profile for your use case
2. **Cost Monitoring**: Track token usage and costs through the monitoring API
3. **Error Handling**: Implement proper error handling with retry logic
4. **Caching**: Leverage caching for repeated requests
5. **Offline Testing**: Use mock provider for development and testing
6. **Environment Variables**: Securely manage API keys through environment variables

## Troubleshooting

### Common Issues

1. **Missing API Key**: Ensure all required API keys are set
2. **Rate Limits**: Implement backoff strategies for rate-limited requests
3. **Context Window**: Monitor token usage for long documents
4. **Network Issues**: The system includes automatic retry for network failures

### Debug Mode
Enable debug logging:

```bash
DEBUG=1
```

This will output detailed logs for LLM calls, including request/response details and performance metrics.

## Future Enhancements

- Dynamic provider switching based on cost/performance
- Advanced caching strategies
- Custom model fine-tuning support
- Multi-provider load balancing
- Enhanced monitoring and analytics
