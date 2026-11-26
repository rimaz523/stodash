using Microsoft.Extensions.Caching.Memory;

namespace Stodash.Api.Infrastructure;

public static class CacheExtensions
{
    /// <summary>
    /// Returns the cached value for <paramref name="key"/>, or loads and caches it for <paramref name="ttl"/>.
    /// If <paramref name="load"/> throws, nothing is cached, so failures are always retried.
    /// </summary>
    public static async Task<T> GetOrLoadAsync<T>(this IMemoryCache cache, string key, TimeSpan ttl, Func<Task<T>> load)
    {
        if (cache.TryGetValue(key, out T? hit) && hit is not null) return hit;
        var value = await load();
        cache.Set(key, value, ttl);
        return value;
    }
}
