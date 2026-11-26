using System.Collections.Concurrent;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using System.Threading.Channels;
using Microsoft.Extensions.Options;
using Stodash.Api.Infrastructure;
using Stodash.Api.Providers;

namespace Stodash.Api.Services;

/// <summary>
/// Live trade prices for watchlists. Keeps ONE WebSocket open to Finnhub (its free plan allows one connection and about
/// 50 symbols) and relays trades to any number of browser tabs connected to <c>/ws/quotes</c>, so the key never leaves
/// the server.
///
/// Browser → server: <c>{"subscribe": ["AAPL", "MSFT"]}</c> (replaces that tab's set).
/// Server → browser: <c>{"type":"status","state":"live","live":["AAPL"]}</c> and
/// <c>{"type":"trades","trades":[{"symbol":"AAPL","price":355.6,"volume":100,"time":1764123456789}]}</c>,
/// at most every 250 ms. Only US stock tickers stream; the browser polls everything else.
/// </summary>
public sealed partial class QuoteStream(
    IOptions<FinnhubOptions> options,
    ProviderHealth health,
    ILogger<QuoteStream> log) : BackgroundService
{
    public const int MaxSymbols = 50;
    private static readonly TimeSpan FlushEvery = TimeSpan.FromMilliseconds(250);
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    private readonly string? _key = options.Value.ApiKey;
    private readonly ConcurrentDictionary<Guid, Subscriber> _subscribers = new();
    private readonly ConcurrentDictionary<string, Trade> _pending = new();
    private readonly SemaphoreSlim _sendLock = new(1, 1);
    private readonly SemaphoreSlim _wake = new(0);
    private HashSet<string> _upstream = []; // symbols subscribed at Finnhub (our spelling)
    private ClientWebSocket? _socket;

    public bool IsConfigured => !string.IsNullOrWhiteSpace(_key);

    /// <summary>"off" (no key), "idle" (no one watching), "connecting", "live" or "error".</summary>
    public string State { get; private set; } = "idle";

    public string? LastError { get; private set; }

    private sealed record Trade(string Symbol, double Price, double? Volume, long Time);

    private sealed class Subscriber
    {
        public readonly Channel<string> Outbox = Channel.CreateBounded<string>(
            new BoundedChannelOptions(100) { FullMode = BoundedChannelFullMode.DropOldest });
        public volatile string[] Symbols = [];
    }

    /// <summary>US stock tickers Finnhub streams: AAPL, BRK-B. Not indexes, FX, futures, crypto or non-US listings.</summary>
    [GeneratedRegex(@"^[A-Z]{1,5}(-[A-Z])?$")]
    private static partial Regex Streamable();

    private static string ToFinnhub(string symbol) => symbol.Replace('-', '.');
    private static string FromFinnhub(string symbol) => symbol.Replace('.', '-');

    // ------------------------------------------------------- browser side

    /// <summary>Serves one browser connection until it closes.</summary>
    public async Task HandleClientAsync(WebSocket ws, CancellationToken ct)
    {
        var id = Guid.NewGuid();
        var sub = new Subscriber();
        _subscribers[id] = sub;
        var sending = PumpAsync(ws, sub, ct);
        try
        {
            Post(sub, StatusFor(sub));
            var buffer = new byte[8 * 1024];
            while (ws.State == WebSocketState.Open && !ct.IsCancellationRequested)
            {
                var text = await ReceiveTextAsync(ws, buffer, ct);
                if (text is null) break; // closed
                if (ParseSubscribe(text) is { } symbols)
                {
                    sub.Symbols = symbols;
                    await SyncUpstreamAsync();
                    Post(sub, StatusFor(sub));
                }
            }
        }
        catch (Exception ex) when (ex is WebSocketException or OperationCanceledException)
        {
            // The tab closed or navigated away.
        }
        finally
        {
            _subscribers.TryRemove(id, out _);
            sub.Outbox.Writer.TryComplete();
            await SyncUpstreamAsync();
            await sending;
            if (ws.State == WebSocketState.Open)
                await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, null, CancellationToken.None);
        }
    }

    private static string[]? ParseSubscribe(string text)
    {
        try
        {
            if (JsonNode.Parse(text)?["subscribe"] is not JsonArray list) return null;
            return list
                .Select(n => n is JsonValue v && v.TryGetValue<string>(out var s) ? s.Trim().ToUpperInvariant() : null)
                .OfType<string>()
                .Where(s => s.Length is > 0 and <= 20)
                .Distinct()
                .Take(200)
                .ToArray();
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private static async Task PumpAsync(WebSocket ws, Subscriber sub, CancellationToken ct)
    {
        try
        {
            await foreach (var message in sub.Outbox.Reader.ReadAllAsync(ct))
                await ws.SendAsync(Encoding.UTF8.GetBytes(message), WebSocketMessageType.Text, true, ct);
        }
        catch (Exception ex) when (ex is WebSocketException or OperationCanceledException)
        {
        }
    }

    private static void Post(Subscriber sub, object message) =>
        sub.Outbox.Writer.TryWrite(JsonSerializer.Serialize(message, Json));

    private object StatusFor(Subscriber sub) => new
    {
        type = "status",
        state = State,
        live = sub.Symbols.Where(_upstream.Contains).ToArray(),
        error = State == "error" ? LastError : null,
    };

    private void BroadcastStatus()
    {
        foreach (var sub in _subscribers.Values) Post(sub, StatusFor(sub));
    }

    // ------------------------------------------------------ Finnhub side

    /// <summary>The symbols Finnhub should stream: what tabs want, streamable only, capped at the plan limit.</summary>
    private HashSet<string> Wanted() => _subscribers.Values
        .SelectMany(s => s.Symbols)
        .Where(s => Streamable().IsMatch(s))
        .Distinct()
        .Take(MaxSymbols)
        .ToHashSet();

    private async Task SyncUpstreamAsync()
    {
        if (!IsConfigured) return;
        var wanted = Wanted();
        if (wanted.Count > 0 && _socket is null) _wake.Release(); // ask the connection loop to connect

        if (_socket is not { State: WebSocketState.Open } socket) return;
        await _sendLock.WaitAsync();
        try
        {
            foreach (var s in wanted.Except(_upstream)) await SendAsync(socket, new { type = "subscribe", symbol = ToFinnhub(s) });
            foreach (var s in _upstream.Except(wanted)) await SendAsync(socket, new { type = "unsubscribe", symbol = ToFinnhub(s) });
            _upstream = wanted;
        }
        catch (Exception ex) when (ex is WebSocketException or OperationCanceledException)
        {
            log.LogDebug("Couldn't update Finnhub subscriptions: {Message}", ex.Message);
        }
        finally
        {
            _sendLock.Release();
        }
    }

    private static Task SendAsync(ClientWebSocket socket, object message) =>
        socket.SendAsync(JsonSerializer.SerializeToUtf8Bytes(message), WebSocketMessageType.Text, true, CancellationToken.None);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!IsConfigured)
        {
            State = "off";
            return;
        }

        var delay = TimeSpan.FromSeconds(1);
        while (!stoppingToken.IsCancellationRequested)
        {
            // Connect only while someone is watching.
            while (Wanted().Count == 0)
            {
                SetState("idle");
                await _wake.WaitAsync(stoppingToken);
            }

            SetState("connecting");
            try
            {
                using var socket = new ClientWebSocket();
                await socket.ConnectAsync(new Uri($"wss://ws.finnhub.io?token={Uri.EscapeDataString(_key!)}"), stoppingToken);
                _socket = socket;
                _upstream = [];
                SetState("live");
                health.Ok(ProviderHealth.Finnhub);
                delay = TimeSpan.FromSeconds(1);
                await SyncUpstreamAsync();
                BroadcastStatus();

                using var flushing = CancellationTokenSource.CreateLinkedTokenSource(stoppingToken);
                var flush = FlushLoopAsync(flushing.Token);
                await ReceiveLoopAsync(socket, stoppingToken);
                await flushing.CancelAsync();
                await flush;
                throw new WebSocketException("Finnhub closed the connection.");
            }
            catch (Exception ex) when (!stoppingToken.IsCancellationRequested)
            {
                _socket = null;
                _upstream = [];
                LastError = ex.Message;
                SetState("error");
                health.Fail(ProviderHealth.Finnhub, "Live stream: " + ex.Message);
                log.LogWarning("Finnhub stream dropped ({Message}); reconnecting in {Delay}s.", ex.Message, delay.TotalSeconds);
                await Task.Delay(delay, stoppingToken);
                delay = TimeSpan.FromSeconds(Math.Min(30, delay.TotalSeconds * 2));
            }
        }
    }

    private void SetState(string state)
    {
        if (State == state) return;
        State = state;
        BroadcastStatus();
    }

    private async Task ReceiveLoopAsync(ClientWebSocket socket, CancellationToken ct)
    {
        var buffer = new byte[64 * 1024];
        while (socket.State == WebSocketState.Open)
        {
            var text = await ReceiveTextAsync(socket, buffer, ct);
            if (text is null) return;
            var root = JsonNode.Parse(text);
            switch (J.Str(root, "type"))
            {
                case "trade" when (root?["data"] is JsonArray trades):
                    foreach (var t in trades)
                    {
                        if (J.Str(t, "s") is not { } s || J.Num(t, "p") is not { } price || J.Long(t, "t") is not { } time) continue;
                        var symbol = FromFinnhub(s);
                        // Keep only the latest trade per symbol until the next flush.
                        _pending.AddOrUpdate(symbol, new Trade(symbol, price, J.Num(t, "v"), time),
                            (_, old) => time >= old.Time ? new Trade(symbol, price, J.Num(t, "v"), time) : old);
                    }
                    break;
                case "error":
                    log.LogWarning("Finnhub stream error: {Message}", J.Str(root, "msg"));
                    break;
            }
        }
    }

    private async Task FlushLoopAsync(CancellationToken ct)
    {
        using var timer = new PeriodicTimer(FlushEvery);
        try
        {
            while (await timer.WaitForNextTickAsync(ct))
            {
                if (_pending.IsEmpty) continue;
                var batch = new List<Trade>();
                foreach (var key in _pending.Keys)
                    if (_pending.TryRemove(key, out var trade)) batch.Add(trade);

                foreach (var sub in _subscribers.Values)
                {
                    var mine = batch.Where(t => sub.Symbols.Contains(t.Symbol)).ToArray();
                    if (mine.Length > 0) Post(sub, new { type = "trades", trades = mine });
                }
            }
        }
        catch (OperationCanceledException)
        {
        }
    }

    /// <summary>Reads one whole text message, or null when the socket closes.</summary>
    private static async Task<string?> ReceiveTextAsync(WebSocket ws, byte[] buffer, CancellationToken ct)
    {
        using var message = new MemoryStream();
        while (true)
        {
            var result = await ws.ReceiveAsync(buffer, ct);
            if (result.MessageType == WebSocketMessageType.Close) return null;
            message.Write(buffer, 0, result.Count);
            if (result.EndOfMessage) return Encoding.UTF8.GetString(message.GetBuffer(), 0, (int)message.Length);
        }
    }
}
