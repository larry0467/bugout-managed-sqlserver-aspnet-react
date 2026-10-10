using System.Security.Claims;
using BugsManaged.Api.Data;
using BugsManaged.Api.Entities;
using BugsManaged.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BugsManaged.Api.Controllers;

// The test checklist of a development order: when an order is ready to try
// (local demo, merged to dev, beta) the person testing it gets a list of
// things to check that come from what was actually built. The session that
// built it writes the list (service key); anyone in the org can record a
// Pass / Fail with a note, so a tester with a viewer login can work it too.
[ApiController]
[Route("api/development/orders/{orderId}/tests")]
[Authorize(AuthenticationSchemes = ServiceKeys.DevelopmentSchemes)]
public class DevelopmentTestsController : ControllerBase
{
    private readonly BugsManagedDbContext _db;
    private readonly ITicketActivityLogger _activity;
    private readonly DevelopmentOrderService _orders;

    public DevelopmentTestsController(BugsManagedDbContext db, ITicketActivityLogger activity, DevelopmentOrderService orders)
    {
        _db = db;
        _activity = activity;
        _orders = orders;
    }

    public record AddTestsRequest(List<DevelopmentController.TestItemRequest>? Items, bool Replace = false);
    public record UpdateTestRequest(string? Text, string? Expected, string? Environment, int? Position);
    public record ResultRequest(string? Result, string? Note, string? TestedIn);
    public record NewRoundRequest(string? Note);

    private bool CanWrite() => DevelopmentOrderService.CanWrite(User);

    // Recording a result is open to every person in the org (VIEWER testers
    // included); a service key still needs the write scope.
    private bool CanRecordResults() =>
        !User.IsInRole(ServiceKeys.Role) || User.HasClaim(ServiceKeys.ScopeClaim, ServiceKeys.ScopeDevelopmentWrite);

    private IActionResult Forbidden() =>
        StatusCode(403, new { message = User.IsInRole(ServiceKeys.Role)
            ? $"This service key lacks the {ServiceKeys.ScopeDevelopmentWrite} scope"
            : "Your role cannot change the test checklist" });

    private string CallerEmail() =>
        User.FindFirstValue(ClaimTypes.Email) ?? User.FindFirstValue("email") ?? "unknown";

    private string CallerName() =>
        User.FindFirstValue("fullName") ?? User.FindFirstValue(ClaimTypes.Name) ?? CallerEmail();

    [HttpGet]
    public async Task<IActionResult> List(long orderId)
    {
        var order = await _orders.FindOrderAsync(orderId);
        if (order == null) return NotFound(new { message = "Development order not found" });
        return Ok(await ItemsAsync(order.Id));
    }

    // Adds items at the end; Replace = true first removes the current list
    // (a session rewriting the checklist after more work).
    [HttpPost]
    public async Task<IActionResult> Add(long orderId, [FromBody] AddTestsRequest body)
    {
        if (!CanWrite()) return Forbidden();
        if (body?.Items == null || body.Items.Count == 0) return BadRequest(new { message = "items must hold at least one test" });
        var error = ValidateItems(body.Items);
        if (error != null) return BadRequest(new { message = error });

        var order = await _orders.FindOrderAsync(orderId);
        if (order == null) return NotFound(new { message = "Development order not found" });

        var actorEmail = CallerEmail();
        var actorName = CallerName();
        var existing = await _db.TicketTestItems.Where(i => i.TicketId == order.Id).ToListAsync();

        var start = 0;
        if (body.Replace)
        {
            _db.TicketTestItems.RemoveRange(existing);
            if (existing.Count > 0)
            {
                _activity.Log(order, "DEV_TESTS_REPLACED",
                    $"{actorName} replaced the test checklist ({existing.Count} item{(existing.Count == 1 ? "" : "s")} before: {ResultSummary(existing)})",
                    actorEmail, actorName, payload: new { removed = existing.Select(i => new { i.Text, i.Result, i.ResultNote }) });
            }
        }
        else
        {
            start = existing.Count == 0 ? 0 : existing.Max(i => i.SortOrder) + 1;
        }

        for (var i = 0; i < body.Items.Count; i++)
            _db.TicketTestItems.Add(NewItem(order, body.Items[i], start + i, actorEmail));

        _activity.Log(order, "DEV_TESTS_ADDED",
            $"{actorName} added {body.Items.Count} item{(body.Items.Count == 1 ? "" : "s")} to the test checklist",
            actorEmail, actorName, payload: new { items = body.Items.Select(i => i.Text) });

        await _db.SaveChangesAsync();
        return Ok(await ItemsAsync(order.Id));
    }

    [HttpPut("{itemId}")]
    public async Task<IActionResult> Update(long orderId, long itemId, [FromBody] UpdateTestRequest body)
    {
        if (!CanWrite()) return Forbidden();
        if (body == null) return BadRequest(new { message = "body is required" });

        var order = await _orders.FindOrderAsync(orderId);
        if (order == null) return NotFound(new { message = "Development order not found" });
        var item = await _db.TicketTestItems.FirstOrDefaultAsync(i => i.Id == itemId && i.TicketId == order.Id);
        if (item == null) return NotFound(new { message = "Test item not found" });

        if (body.Text != null)
        {
            var text = body.Text.Trim();
            if (text.Length == 0) return BadRequest(new { message = "text cannot be empty" });
            if (text.Length > 1000) return BadRequest(new { message = "text must be 1000 characters or fewer" });
            item.Text = text;
        }
        if (body.Expected != null)
        {
            if (body.Expected.Length > 1000) return BadRequest(new { message = "expected must be 1000 characters or fewer" });
            item.Expected = DevelopmentOrderService.Clean(body.Expected);
        }
        if (body.Environment != null)
        {
            var env = DevelopmentTests.NormalizeEnvironment(body.Environment);
            if (env == null) return BadRequest(new { message = $"environment must be one of {string.Join(", ", DevelopmentTests.Environments)}" });
            item.Environment = env;
        }
        if (body.Position.HasValue)
        {
            var all = await _db.TicketTestItems.Where(i => i.TicketId == order.Id).OrderBy(i => i.SortOrder).ThenBy(i => i.Id).ToListAsync();
            all.Remove(item);
            all.Insert(Math.Clamp(body.Position.Value - 1, 0, all.Count), item);
            for (var i = 0; i < all.Count; i++) all[i].SortOrder = i;
        }

        await _db.SaveChangesAsync();
        return Ok(await ItemsAsync(order.Id));
    }

    // Pass / Fail (or "" to clear) with an optional note.
    [HttpPut("{itemId}/result")]
    public async Task<IActionResult> Record(long orderId, long itemId, [FromBody] ResultRequest body)
    {
        if (!CanRecordResults()) return Forbidden();
        if (body == null) return BadRequest(new { message = "body is required" });

        string? result = null;
        if (!string.IsNullOrWhiteSpace(body.Result))
        {
            result = DevelopmentTests.NormalizeResult(body.Result);
            if (result == null) return BadRequest(new { message = $"result must be one of {string.Join(", ", DevelopmentTests.Results)} (or empty to clear)" });
        }
        if (body.Note != null && body.Note.Length > 2000) return BadRequest(new { message = "note must be 2000 characters or fewer" });

        string? testedIn = null;
        if (!string.IsNullOrWhiteSpace(body.TestedIn))
        {
            testedIn = DevelopmentTests.NormalizeEnvironment(body.TestedIn);
            if (testedIn == null || testedIn == DevelopmentTests.Any)
                return BadRequest(new { message = "testedIn must be LOCAL, DEV or BETA" });
        }

        var order = await _orders.FindOrderAsync(orderId);
        if (order == null) return NotFound(new { message = "Development order not found" });
        var item = await _db.TicketTestItems.FirstOrDefaultAsync(i => i.Id == itemId && i.TicketId == order.Id);
        if (item == null) return NotFound(new { message = "Test item not found" });

        var actorEmail = CallerEmail();
        var actorName = CallerName();

        if (result == null)
        {
            item.Result = null;
            item.ResultNote = null;
            item.TestedIn = null;
            item.TestedBy = null;
            item.TestedAt = null;
            _activity.Log(order, "DEV_TEST_CLEARED", $"{actorName} cleared the result of \"{Short(item.Text)}\"", actorEmail, actorName,
                payload: new { itemId = item.Id });
        }
        else
        {
            item.Result = result;
            item.ResultNote = DevelopmentOrderService.Clean(body.Note);
            item.TestedIn = testedIn
                ?? (item.Environment != DevelopmentTests.Any ? item.Environment : null)
                ?? DevelopmentTests.EnvironmentForStage(order.DevelopmentStage);
            item.TestedBy = actorName;
            item.TestedAt = DateTime.UtcNow;
            var where = item.TestedIn != null ? $" in {DevelopmentTests.EnvironmentLabels[item.TestedIn].ToLowerInvariant()}" : "";
            _activity.Log(order, result == DevelopmentTests.Pass ? "DEV_TEST_PASSED" : "DEV_TEST_FAILED",
                $"{actorName} {(result == DevelopmentTests.Pass ? "passed" : "FAILED")}{where}: \"{Short(item.Text)}\""
                    + (item.ResultNote != null ? $" — {Short(item.ResultNote)}" : ""),
                actorEmail, actorName, payload: new { itemId = item.Id, result, item.TestedIn, note = item.ResultNote });
        }

        order.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        return Ok(await ItemsAsync(order.Id));
    }

    [HttpDelete("{itemId}")]
    public async Task<IActionResult> Delete(long orderId, long itemId)
    {
        if (!CanWrite()) return Forbidden();
        var order = await _orders.FindOrderAsync(orderId);
        if (order == null) return NotFound(new { message = "Development order not found" });
        var item = await _db.TicketTestItems.FirstOrDefaultAsync(i => i.Id == itemId && i.TicketId == order.Id);
        if (item == null) return NoContent();

        _db.TicketTestItems.Remove(item);
        _activity.Log(order, "DEV_TEST_REMOVED", $"{CallerName()} removed \"{Short(item.Text)}\" from the test checklist",
            CallerEmail(), CallerName(), payload: new { item.Text, item.Result });
        await _db.SaveChangesAsync();
        return NoContent();
    }

    // A new test round: clears every result (local passed, now try it in
    // beta). The old results stay in the activity feed.
    [HttpPost("new-round")]
    public async Task<IActionResult> NewRound(long orderId, [FromBody] NewRoundRequest? body)
    {
        if (!CanWrite()) return Forbidden();
        var order = await _orders.FindOrderAsync(orderId);
        if (order == null) return NotFound(new { message = "Development order not found" });

        var items = await _db.TicketTestItems.Where(i => i.TicketId == order.Id).ToListAsync();
        var tested = items.Where(i => i.Result != null).ToList();
        if (tested.Count == 0) return Ok(await ItemsAsync(order.Id));

        var actorName = CallerName();
        _activity.Log(order, "DEV_TESTS_NEW_ROUND",
            $"{actorName} started a new test round (last round: {ResultSummary(items)})"
                + (string.IsNullOrWhiteSpace(body?.Note) ? "" : $" — {Short(body!.Note!.Trim())}"),
            CallerEmail(), actorName,
            payload: new { results = tested.Select(i => new { i.Text, i.Result, i.ResultNote, i.TestedIn, i.TestedBy, i.TestedAt }) });

        foreach (var i in tested)
        {
            i.Result = null;
            i.ResultNote = null;
            i.TestedIn = null;
            i.TestedBy = null;
            i.TestedAt = null;
        }
        await _db.SaveChangesAsync();
        return Ok(await ItemsAsync(order.Id));
    }

    // ===== shared with DevelopmentController (create with a checklist) =====

    public static string? ValidateItems(List<DevelopmentController.TestItemRequest>? items)
    {
        if (items == null) return null;
        if (items.Count > 100) return "at most 100 test items per order";
        foreach (var i in items)
        {
            if (i == null) return "test items cannot be null";
            if (string.IsNullOrWhiteSpace(i.Text)) return "each test item needs text";
            if (i.Text.Trim().Length > 1000) return "test text must be 1000 characters or fewer";
            if (i.Expected != null && i.Expected.Length > 1000) return "test expected must be 1000 characters or fewer";
            if (!string.IsNullOrWhiteSpace(i.Environment) && DevelopmentTests.NormalizeEnvironment(i.Environment) == null)
                return $"test environment must be one of {string.Join(", ", DevelopmentTests.Environments)}";
        }
        return null;
    }

    // "How to test" notes as checklist lines: one per bullet or numbered line.
    public static List<DevelopmentController.TestItemRequest> FromNotes(string? notes) =>
        (notes ?? string.Empty)
            .Split('\n')
            .Select(l => System.Text.RegularExpressions.Regex.Replace(l, @"^\s*(?:[-*•]|\d+[.)])\s+", "").Trim())
            .Where(l => l.Length > 0)
            .Select(l => new DevelopmentController.TestItemRequest(l.Length > 1000 ? l[..1000] : l))
            .Take(100)
            .ToList();

    public static TicketTestItem NewItem(Ticket order, DevelopmentController.TestItemRequest r, int sortOrder, string createdBy) => new()
    {
        OrganizationId = order.OrganizationId,
        TicketId = order.Id,
        Text = r.Text.Trim(),
        Expected = DevelopmentOrderService.Clean(r.Expected),
        Environment = DevelopmentTests.NormalizeEnvironment(r.Environment) ?? DevelopmentTests.Any,
        SortOrder = sortOrder,
        CreatedBy = createdBy,
        CreatedAt = DateTime.UtcNow,
    };

    private async Task<List<DevelopmentController.TestItemDto>> ItemsAsync(long ticketId) =>
        (await _db.TicketTestItems
            .Where(i => i.TicketId == ticketId)
            .OrderBy(i => i.SortOrder).ThenBy(i => i.Id)
            .ToListAsync())
        .Select(DevelopmentController.ToTestItemDto)
        .ToList();

    private static string ResultSummary(List<TicketTestItem> items)
    {
        var passed = items.Count(i => i.Result == DevelopmentTests.Pass);
        var failed = items.Count(i => i.Result == DevelopmentTests.Fail);
        return $"{passed} passed, {failed} failed, {items.Count - passed - failed} not tested";
    }

    private static string Short(string text) => text.Length <= 120 ? text : text[..117] + "...";
}
