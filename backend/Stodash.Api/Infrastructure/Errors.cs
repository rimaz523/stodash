using System.Data.Common;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.EntityFrameworkCore.Storage;

namespace Stodash.Api.Infrastructure;

/// <summary>The provider has no instrument with this symbol.</summary>
public sealed class SymbolNotFoundException(string symbol)
    : Exception($"No instrument found for '{symbol}'.")
{
    public string Symbol { get; } = symbol;
}

/// <summary>Something other than a ticker doesn't exist, e.g. a watchlist id. Maps to 404.</summary>
public sealed class NotFoundException(string message) : Exception(message);

/// <summary>The request clashes with existing data, e.g. a duplicate watchlist name. Maps to 409.</summary>
public sealed class ConflictException(string message) : Exception(message);

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
            NotFoundException => (StatusCodes.Status404NotFound, "Not found"),
            ConflictException => (StatusCodes.Status409Conflict, "Conflict"),
            ArgumentException => (StatusCodes.Status400BadRequest, "Invalid request"),
            DbException or RetryLimitExceededException => (StatusCodes.Status503ServiceUnavailable, "Database unavailable"),
            UpstreamException => (StatusCodes.Status502BadGateway, "Data provider unavailable"),
            _ => (StatusCodes.Status500InternalServerError, "Unexpected error"),
        };

        if (status == StatusCodes.Status503ServiceUnavailable)
            ctx.RequestServices.GetRequiredService<ProviderHealth>().Fail(ProviderHealth.Database, ex.GetBaseException().Message);
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
                Detail = status switch
                {
                    StatusCodes.Status500InternalServerError => null,
                    // Don't echo SQL error text; say what to check instead.
                    StatusCodes.Status503ServiceUnavailable =>
                        "Can't reach the Stodash database. Is SQL Server LocalDB installed and running? Try: sqllocaldb start MSSQLLocalDB",
                    _ => ex.Message,
                },
            },
        });
    }
}
