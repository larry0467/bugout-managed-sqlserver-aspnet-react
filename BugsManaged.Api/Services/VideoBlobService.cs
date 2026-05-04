using Azure.Identity;
using Azure.Storage.Blobs;
using Azure.Storage.Sas;

namespace BugsManaged.Api.Services;

public interface IVideoBlobService
{
    Task<string> UploadAsync(Stream data, string extension, long ticketId, CancellationToken ct = default);
    Task<Uri> GenerateSasUriAsync(string blobUri, TimeSpan validFor, CancellationToken ct = default);
}

public class VideoBlobService : IVideoBlobService
{
    private readonly BlobServiceClient _client;
    private readonly string _container;

    public VideoBlobService(IConfiguration config)
    {
        var account = config["BugOutManaged:Video:StorageAccountName"]
            ?? throw new InvalidOperationException("BugOutManaged:Video:StorageAccountName is not configured");
        _container = config["BugOutManaged:Video:ContainerName"] ?? "videos";

        // DefaultAzureCredential picks up the UAMI via AZURE_CLIENT_ID in prod,
        // and falls back to az CLI / VS credentials in local dev.
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

        // Return the bare blob URI (no SAS) — SAS is generated on demand at read time.
        return blob.Uri.ToString();
    }

    public async Task<Uri> GenerateSasUriAsync(string blobUri, TimeSpan validFor, CancellationToken ct = default)
    {
        var blobUriParsed = new Uri(blobUri);
        var blobName = blobUriParsed.AbsolutePath.TrimStart('/').Substring(_container.Length + 1);
        var container = _client.GetBlobContainerClient(_container);
        var blob = container.GetBlobClient(blobName);

        // User-delegation SAS — signed with a short-lived key derived from the
        // UAMI, so no storage account key is needed anywhere in the app.
        var startsOn = DateTimeOffset.UtcNow.AddMinutes(-5); // clock-skew buffer
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
