namespace Stodash.Api.Infrastructure;

/// <summary>
/// Who is making the request. User data (watchlists) is always stored against this id, so adding sign-in later
/// only means swapping the implementation for one that reads the signed-in user.
/// </summary>
public interface ICurrentUser
{
    string Id { get; }
}

/// <summary>Until sign-in exists, everything belongs to one local user.</summary>
public sealed class LocalUser : ICurrentUser
{
    public string Id => "local";
}
