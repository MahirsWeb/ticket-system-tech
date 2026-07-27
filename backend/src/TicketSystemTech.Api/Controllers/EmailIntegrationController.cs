using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using TicketSystemTech.Api.Contracts;
using TicketSystemTech.Application.Common.Interfaces;
using TicketSystemTech.Application.Common.Options;
using TicketSystemTech.Domain.Enums;

namespace TicketSystemTech.Api.Controllers;

/// <summary>
/// Lets staff (Consultant/SupportAgent only — not Admin) connect their own Outlook mailbox and triage
/// inbound emails into tickets. Admin is intentionally excluded per product requirements.
/// </summary>
[ApiController]
[Route("api/email-integration")]
[Authorize(Roles = $"{nameof(UserRole.Consultant)},{nameof(UserRole.SupportAgent)}")]
public class EmailIntegrationController : ControllerBase
{
    private readonly IEmailIntegrationService _emailService;
    private readonly ICurrentUserService _currentUser;
    private readonly MicrosoftGraphOptions _graphOptions;

    public EmailIntegrationController(
        IEmailIntegrationService emailService, ICurrentUserService currentUser, IOptions<MicrosoftGraphOptions> graphOptions)
    {
        _emailService = emailService;
        _currentUser = currentUser;
        _graphOptions = graphOptions.Value;
    }

    [HttpGet("config")]
    public ActionResult<EmailIntegrationConfigDto> GetConfig() => Ok(new EmailIntegrationConfigDto(_graphOptions.ClientId));

    [HttpGet("status")]
    public async Task<ActionResult<EmailConnectionStatusDto>> GetStatus()
    {
        var status = await _emailService.GetStatusAsync(_currentUser.UserId!.Value);
        return Ok(new EmailConnectionStatusDto(status.Connected, status.ConnectedEmail));
    }

    [HttpPost("connect")]
    public async Task<ActionResult<EmailConnectionStatusDto>> Connect(ConnectEmailRequest request)
    {
        try
        {
            var status = await _emailService.ConnectAsync(_currentUser.UserId!.Value, request.Code, request.RedirectUri);
            return Ok(new EmailConnectionStatusDto(status.Connected, status.ConnectedEmail));
        }
        catch (Exception ex)
        {
            return BadRequest(new { message = "Could not connect your mailbox. Please try again.", detail = ex.Message });
        }
    }

    [HttpPost("disconnect")]
    public async Task<IActionResult> Disconnect()
    {
        await _emailService.DisconnectAsync(_currentUser.UserId!.Value);
        return Ok();
    }

    [HttpGet("messages")]
    public async Task<ActionResult<List<InboxMessageSummaryDto>>> ListMessages([FromQuery] int take = 25)
    {
        try
        {
            var messages = await _emailService.ListInboxAsync(_currentUser.UserId!.Value, take);
            return Ok(messages.Select(m => new InboxMessageSummaryDto(
                m.MessageId, m.Subject, m.FromEmail, m.FromName, m.BodyPreview, m.ReceivedAtUtc,
                m.HasAttachments, m.IsMarked, m.ConvertedTicketId)).ToList());
        }
        catch (InvalidOperationException)
        {
            return BadRequest(new { message = "No mailbox connected." });
        }
    }

    [HttpPost("messages/{messageId}/mark")]
    public async Task<IActionResult> SetMarked(string messageId, SetMarkedRequest request)
    {
        var marked = await _emailService.SetMarkedAsync(_currentUser.UserId!.Value, messageId, request.Marked);
        return Ok(new { marked });
    }

    [HttpGet("messages/{messageId}/prefill")]
    public async Task<ActionResult<EmailPrefillDto>> GetPrefill(string messageId)
    {
        try
        {
            var detail = await _emailService.GetMessageAsync(_currentUser.UserId!.Value, messageId);
            return Ok(new EmailPrefillDto(
                detail.MessageId, detail.FromEmail, detail.Subject, detail.BodyHtml,
                detail.ReceivedAtUtc, detail.Attachments.Count > 0));
        }
        catch (InvalidOperationException)
        {
            return BadRequest(new { message = "No mailbox connected." });
        }
    }

    /// <summary>Called after a ticket is created from a marked email: copies the email's attachments onto the ticket and marks it converted.</summary>
    [HttpPost("messages/{messageId}/complete-ticket")]
    public async Task<IActionResult> CompleteTicket(string messageId, [FromQuery] Guid ticketId)
    {
        var userId = _currentUser.UserId!.Value;
        await _emailService.ImportAttachmentsToTicketAsync(userId, messageId, ticketId);
        await _emailService.MarkConvertedAsync(userId, messageId, ticketId);
        return Ok();
    }
}
