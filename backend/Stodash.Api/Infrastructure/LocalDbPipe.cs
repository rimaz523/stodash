using System.Data.Common;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text.RegularExpressions;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore.Diagnostics;

namespace Stodash.Api.Infrastructure;

/// <summary>
/// Makes SQL Server LocalDB work from an ARM64 process (e.g. a Surface or other Windows-on-ARM PC).
///
/// LocalDB is x64-only. A <c>(localdb)\Instance</c> connection string makes SqlClient load LocalDB's x64 helper DLL,
/// which an ARM64 process can't do ("%1 is not a valid Win32 application"). LocalDB also listens on a named pipe,
/// which needs no DLL. The pipe name changes whenever the instance restarts, and LocalDB stops itself after a few idle
/// minutes, so this looks the pipe up with <c>sqllocaldb</c> (starting the instance if needed) and refreshes it after
/// a failed connection.
///
/// Only used when the process is ARM64 and the connection string points at <c>(localdb)\...</c>. On x64, and with
/// Azure SQL, the connection string is used unchanged.
/// </summary>
public sealed partial class LocalDbPipe(string instance, ILogger log)
{
    private readonly Lock _lock = new();
    private string? _pipe;

    /// <summary>The instance name if this connection string needs the pipe workaround, otherwise null.</summary>
    public static string? InstanceToResolve(string connectionString)
    {
        if (!OperatingSystem.IsWindows() || RuntimeInformation.ProcessArchitecture != Architecture.Arm64) return null;
        var dataSource = new SqlConnectionStringBuilder(connectionString).DataSource;
        const string prefix = @"(localdb)\";
        return dataSource.StartsWith(prefix, StringComparison.OrdinalIgnoreCase) ? dataSource[prefix.Length..] : null;
    }

    /// <summary>The current pipe address, starting the instance if it isn't running.</summary>
    public string Get(bool refresh = false)
    {
        lock (_lock)
        {
            if (!refresh && _pipe is not null) return _pipe;
            Run("start", instance); // a no-op when already running
            var info = Run("info", instance);
            _pipe = PipePattern().Match(info) is { Success: true } m
                ? m.Value
                : throw new InvalidOperationException($"Couldn't find the pipe for LocalDB instance '{instance}'. sqllocaldb said: {info.Trim()}");
            log.LogInformation("Using LocalDB instance '{Instance}' through {Pipe} (ARM64 workaround).", instance, _pipe);
            return _pipe;
        }
    }

    public void Invalidate()
    {
        lock (_lock) _pipe = null;
    }

    private static string Run(string verb, string name)
    {
        var psi = new ProcessStartInfo("sqllocaldb", [verb, name])
        {
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true,
        };
        using var p = Process.Start(psi) ?? throw new InvalidOperationException("Couldn't run sqllocaldb.");
        var output = p.StandardOutput.ReadToEnd() + p.StandardError.ReadToEnd();
        p.WaitForExit(30_000);
        return output;
    }

    [GeneratedRegex(@"np:\\\\\.\\pipe\\\S+")]
    private static partial Regex PipePattern();
}

/// <summary>Points each new connection at LocalDB's current pipe, and refreshes the pipe after a failure.</summary>
public sealed class LocalDbPipeInterceptor(LocalDbPipe pipe) : DbConnectionInterceptor
{
    public override InterceptionResult ConnectionOpening(DbConnection connection, ConnectionEventData data, InterceptionResult result)
    {
        Apply(connection);
        return result;
    }

    public override ValueTask<InterceptionResult> ConnectionOpeningAsync(
        DbConnection connection, ConnectionEventData data, InterceptionResult result, CancellationToken ct = default)
    {
        Apply(connection);
        return ValueTask.FromResult(result);
    }

    public override void ConnectionFailed(DbConnection connection, ConnectionErrorEventData data) => pipe.Invalidate();

    public override Task ConnectionFailedAsync(DbConnection connection, ConnectionErrorEventData data, CancellationToken ct = default)
    {
        pipe.Invalidate();
        return Task.CompletedTask;
    }

    private void Apply(DbConnection connection)
    {
        var builder = new SqlConnectionStringBuilder(connection.ConnectionString);
        var address = pipe.Get();
        if (builder.DataSource == address) return;
        builder.DataSource = address;
        connection.ConnectionString = builder.ConnectionString;
    }
}
