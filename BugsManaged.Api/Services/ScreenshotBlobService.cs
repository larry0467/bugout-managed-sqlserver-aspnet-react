using Azure.Identity;
using Azure.Storage.Blobs;
using Azure.Storage.Sas;

namespace BugsManaged.Api.Services;

// Parallel to VideoBlobService but for image attachments (PNG/JPEG/WEBP).
// Separate container so retention / access policy can diverge from videos
// later (e.g. videos may be 30-day expiry, screenshots indefinite).
public interface IScreenshotBlobService
{
    Task<string> UploadAsync(Stream data, string extension, long ticketId, CancellationToken ct = default);
    Task<Uri> GenerateSasUriAsync(string blobUri, TimeSpan validFor, CancellationToken ct = default);
}

public class ScreenshotBlobService : IScreenshotBlobService
{
    private readonly BlobServiceClient _client;
    private readonly string _container;

    public ScreenshotBlobService(IConfiguration config)
    {
        var account = config["BugOutManaged:Video:StorageAccountName"]
            ?? throw new InvalidOperationException("BugOutManaged:Video:StorageAccountName is not configured");
        _container = config["BugOutManaged:Screenshots:ContainerName"] ?? "screenshots";

        _client = new BlobServiceClient(
            new Uri($"https://{account}.blob.core.windows.net"),
            new DefaultAzureCredential());
    }

    public async Task<string> UploadAsync(Stream data, string extension, long ticketId, CancellationToken ct = default)
    {
        var container = _client.GetBlobContainerClient(_container);
        await container.CreateIfNotExistsAsync(cancellationToken: ct);

        var blobName = $"ticket_{ticketId}_{Guid.NewGuid()}{extension}";
        var blob = container.GetBlobClient(blobName);
        await blob.UploadAsync(data, overwrite: true, cancellationToken: ct);
        return blob.Uri.ToString();
    }

    public async Task<Uri> GenerateSasUriAsync(string blobUri, TimeSpan validFor, CancellationToken ct = default)
    {
        var blobUriParsed = new Uri(blobUri);
        var blobName = blobUriParsed.AbsolutePath.TrimStart('/').Substring(_container.Length + 1);
        var container = _client.GetBlobContainerClient(_container);
        var blob = container.GetBlobClient(blobName);

        var startsOn = DateTimeOffset.UtcNow.AddMinutes(-5);
        var expiresOn = DateTimeOffset.UtcNow.Add(validFor);

        var delegationKey = await _client.GetUserDelegationKeyAsync(startsOn, expiresOn, ct);

        var sasBuilder = new BlobSasBuilder(BlobSasPermissions.Read, expiresOn)
        {
            BlobContainerName = _container,
            BlobName = blobName,
            Resource = "b",
            StartsOn = startsOn,
        };

        var account = blobUriParsed.Host.Split('.')[0];
        var sas = sasBuilder.ToSasQueryParameters(delegationKey, account);
        return new UriBuilder(blob.Uri) { Query = sas.ToString() }.Uri;
    }
}
