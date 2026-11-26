using Microsoft.AspNetCore.Diagnostics;

namespace Stodash.Api.Infrastructure;

/// <summary>The provider has no instrument with this symbol.</summary>
public sealed class SymbolNotFoundException(string symbol)
    : Exception($"No instrument found for '{symbol}'.")
{
    public string Symbol { get; } = symbol;
}

/// <summary>A data provider failed, timed out, rate-limited us or returned something unreadable.</summary>
public sealed class UpstreamException(string message, Exception? inner = null) : Exception(message, inner);

/// <summary>Turns known exceptions into RFC 7807 problem responses.</summary>
public sealed class ApiExceptionHandler(IProblemDetailsService problemDetails, ILogger<ApiExceptionHandler> log)
    : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(HttpContext ctx, Exception ex, CancellationToken ct)
    {
        var (status, title) = ex switch
        {
            SymbolNotFoundException => (StatusCodes.Status404NotFound, "Symbol not found"),
            ArgumentException => (StatusCodes.Status400BadRequest, "Invalid request"),
            UpstreamException => (StatusCodes.Status502BadGateway, "Data provider unavailable"),
            _ => (StatusCodes.Status500InternalServerError, "Unexpected error"),
        };

        if (status >= 500 && ex is not UpstreamException)
            log.LogError(ex, "Unhandled error for {Path}", ctx.Request.Path);
        else
            log.LogWarning("{Title} for {Path}: {Message}", title, ctx.Request.Path, ex.Message);

        ctx.Response.StatusCode = status;
        return await problemDetails.TryWriteAsync(new ProblemDetailsContext
        {
            HttpContext = ctx,
            Exception = ex,
            ProblemDetails =
            {
                Status = status,
                Title = title,
                Detail = status == StatusCodes.Status500InternalServerError ? null : ex.Message,
            },
        });
    }
}
