using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using TicketSystemTech.Application.Common.Interfaces;

namespace TicketSystemTech.Infrastructure.Services;

/// <summary>Generates embeddings via Google AI Studio's text-embedding-004 model, when configured.</summary>
public class GoogleAiEmbeddingService : IEmbeddingService
{
    private readonly HttpClient _httpClient;
    private readonly IConfiguration _configuration;
    private readonly ILogger<GoogleAiEmbeddingService> _logger;

    public GoogleAiEmbeddingService(HttpClient httpClient, IConfiguration configuration, ILogger<GoogleAiEmbeddingService> logger)
    {
        _httpClient = httpClient;
        _configuration = configuration;
        _logger = logger;
    }

    public async Task<float[]?> EmbedAsync(string text, CancellationToken ct = default)
    {
        var apiKey = _configuration["GoogleAi:ApiKey"];
        if (string.IsNullOrWhiteSpace(apiKey) || string.IsNullOrWhiteSpace(text))
            return null;

        try
        {
            var url = $"https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key={apiKey}";
            var response = await _httpClient.PostAsJsonAsync(url, new
            {
                content = new { parts = new[] { new { text } } }
            }, ct);

            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("Google AI embedding request failed with status {Status}", response.StatusCode);
                return null;
            }

            using var doc = JsonDocument.Parse(await response.Content.ReadAsStreamAsync(ct));
            var values = doc.RootElement.GetProperty("embedding").GetProperty("values");
            var result = new float[values.GetArrayLength()];
            var i = 0;
            foreach (var v in values.EnumerateArray())
                result[i++] = v.GetSingle();
            return result;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to generate embedding via Google AI.");
            return null;
        }
    }
}
